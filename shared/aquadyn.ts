// Аквапарк в движении (что где стоит — shared/aqua.ts). Где паром, лифт, тонущая подушка, перекладина вертушки
// и мешки — функция времени t (тики сервера с дробью). Время — метка входа игрока (Input.viewTick, его часы отрисовки):
// клиент предсказывает свой шаг с этой меткой, сервер повторяет шаг с той же меткой (только зажатой в окно — aquaClock),
// поэтому что у игрока на экране, то и засчитано. Считаем только на +, −, ×, /, остатке от деления, sqrt и sinCos —
// бит в бит в любом браузере и в Node.
//
// Шаг игрока на набережной: pre → stepHeld → post. pre ставит подвижные боксы мира на время t и везёт того, кто стоит
// на площадке (ровно на её сдвиг от метки прошлого входа до этой); post даёт отскок батутам разной силы и толчки
// (вертушка, мешки — не твёрдые: задел — полетел в воду) и снова убирает подвижные боксы далеко за карту. Поэтому
// мяч, камера и тени их не видят, а у каждого игрока — своё время.
import { AQUA_BAGS, AQUA_BAG_H, AQUA_BAG_R, AQUA_BOTTOM, AQUA_MOVERS, AQUA_NEAR_X, AQUA_PIECES, AQUA_SWEEPER, AQUA_WARN, type AquaBag, type AquaMover } from './aqua.ts';
import { PLAYER_HALF, PLAYER_HEIGHT } from './constants.ts';
import { TAU, sinCos } from './math.ts';
import { pushPlayer, type PlayerState, type StepEvents } from './sim.ts';
import type { CollisionWorld } from './world.ts';

/** Окно метки времени, тиков: сервер берёт метку не старее своего тика минус столько и не новее своего тика */
export const AQUA_LAG = 150;
/** Очередь входов игрока на полосе — до 2 с (на площади — как везде): после лаг-спайка до сервера доходят все шаги */
export const AQUA_QUEUE = 120;
/** На полосе сервер ждёт входы столько тиков, не додумывая шаги; дольше — как везде (стоит на месте) */
export const AQUA_WAIT = 90;
/** Толчок вертушки и мешка: скорость вбок и вверх, м/с; рывок после толчка — не раньше чем через столько тиков */
export const KNOCK_SPEED = 13;
export const KNOCK_UP = 5.5;
const KNOCK_DASH_CD = 45;
/** Чем толкнуло */
export const KNOCK_SWEEP = 1;
export const KNOCK_BAG = 2;
/** Стоящего на площадке узнаём по высоте ног с таким допуском */
const RIDE_EPS = 0.02;
/** Площадка поднялась выше ног (лифт догнал, подушка всплыла) не больше чем на столько — встаёт на неё */
const GRAB = 0.25;
/** Как в sim.ts: касание граней — не пересечение */
const EPS = 1e-7;
/** Убранный бокс — точка далеко за картой (как CollisionWorld.setEnabled) */
const AWAY = 1e6;

/** Подвижная площадка в момент t: прямоугольник, низ (под водой) и верх */
export interface MoverBox {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0: number;
  top: number;
}

export function makeMoverBox(): MoverBox {
  return { x0: 0, x1: 0, z0: 0, z1: 0, y0: 0, top: 0 };
}

/** Мешок в момент t: угол от вертикали (+ — к югу), куда качается (знак — направление по z), середина мешка */
export interface BagPose {
  a: number;
  w: number;
  z: number;
  y: number;
}

export function makeBagPose(): BagPose {
  return { a: 0, w: 0, z: 0, y: 0 };
}

const sc = { s: 0, c: 0 };

function smooth(k: number): number {
  return k * k * (3 - 2 * k);
}

/** Сколько тиков от начала своего цикла в момент t. */
function cycle(t: number, phase: number, period: number): number {
  const c = (t - phase) % period;
  return c < 0 ? c + period : c;
}

export function moverPeriod(m: AquaMover): number {
  return m.rest + m.go + m.stay + m.back;
}

/** Доля хода площадки в момент t: 0 — в покое, 1 — в крайнем положении; едет плавно (без рывков на старте и в конце). */
export function moverU(m: AquaMover, t: number): number {
  let c = cycle(t, m.phase, moverPeriod(m));
  if (c < m.rest) return 0;
  c -= m.rest;
  if (c < m.go) return smooth(c / m.go);
  c -= m.go;
  if (c < m.stay) return 1;
  c -= m.stay;
  return 1 - smooth(c / m.back);
}

/** Где площадка в момент t. Низ — столб до дна: на самом дне и под водой, ниже любого положения верха. */
export function moverBox(m: AquaMover, t: number, out: MoverBox): MoverBox {
  const u = moverU(m, t);
  out.x0 = m.x0 + m.dx * u;
  out.x1 = m.x1 + m.dx * u;
  out.z0 = m.z0 + m.dz * u;
  out.z1 = m.z1 + m.dz * u;
  out.top = m.top + m.dy * u;
  out.y0 = AQUA_BOTTOM - 1 + (m.dy < 0 ? m.dy : 0);
  return out;
}

/** Тонущая подушка: 0…1 — сколько осталось мигать до ухода под воду (1 — вот-вот), 0 — не мигает (для экрана). */
export function sinkWarn(m: AquaMover, t: number): number {
  if (m.kind !== 'sink') return 0;
  const c = cycle(t, m.phase, moverPeriod(m));
  return c >= m.rest - AQUA_WARN && c < m.rest ? (c - (m.rest - AQUA_WARN)) / AQUA_WARN : 0;
}

/** Угол перекладины вертушки в момент t, рад: 0 — вдоль +x, растёт от +x к +z. */
export function sweepAngle(t: number): number {
  const p = AQUA_SWEEPER.period;
  return (cycle(t, 0, p) / p) * TAU;
}

/** Мешок в момент t. */
export function bagPose(b: AquaBag, t: number, out: BagPose): BagPose {
  sinCos((cycle(t, b.phase, b.period) / b.period) * TAU, sc);
  out.a = b.amp * sc.s;
  // скорость мешка по z — того же знака, что косинус фазы
  out.w = sc.c;
  sinCos(out.a, sc);
  out.z = b.z + b.len * sc.s;
  out.y = b.py - b.len * sc.c;
  return out;
}

/** Метка времени ровно такой, какой её получит сервер (в протоколе — целые тики и 1/256): по ней клиент и предсказывает. */
export function quantTick(v: number): number {
  const vt = v > 0 ? v : 0;
  const whole = Math.floor(vt);
  return whole + Math.min(255, Math.floor((vt - whole) * 256)) / 256;
}

/**
 * Время препятствий для входа на сервере: метка входа vt, не раньше метки прошлого входа prev (назад время не идёт)
 * и в окне [tick − AQUA_LAG, tick] — подсунуть удобное время можно только в его пределах.
 */
export function aquaClock(vt: number, prev: number, tick: number): number {
  const t = vt > prev ? vt : prev;
  const lo = tick - AQUA_LAG;
  return t < lo ? lo : t > tick ? tick : t;
}

/** Ноги желейки (квадрат 0,84 м) хоть краем над прямоугольником. */
function footOver(s: PlayerState, x0: number, x1: number, z0: number, z1: number): boolean {
  return s.x - PLAYER_HALF < x1 - EPS && s.x + PLAYER_HALF > x0 + EPS && s.z - PLAYER_HALF < z1 - EPS && s.z + PLAYER_HALF > z0 + EPS;
}

/** Толкнуло в сторону (kx, kz) и вверх: с земли сбивает, прыжок и рывок — не сразу. */
function knock(s: PlayerState, kx: number, kz: number): void {
  const l = Math.sqrt(kx * kx + kz * kz) || 1;
  s.vx = (kx / l) * KNOCK_SPEED;
  s.vz = (kz / l) * KNOCK_SPEED;
  if (s.vy < KNOCK_UP) s.vy = KNOCK_UP;
  s.grounded = 0;
  s.coyote = 0;
  s.jumpBuf = 0;
  s.dashT = 0;
  if (s.dashCd < KNOCK_DASH_CD) s.dashCd = KNOCK_DASH_CD;
}

const TRAMPS = AQUA_PIECES.filter((p) => p.kind === 'tramp');

/** Препятствия аквапарка в шаге игрока (одни на мир: сервер и предсказание клиента зовут pre и post вокруг шага). */
export class AquaDyn {
  /** Чем толкнуло в последнем шаге (KNOCK_*), 0 — ничем */
  knock = 0;
  private readonly w: CollisionWorld;
  private readonly idx: readonly number[];
  private readonly was: MoverBox[] = AQUA_MOVERS.map(makeMoverBox);
  private readonly now: MoverBox[] = AQUA_MOVERS.map(makeMoverBox);
  private readonly bag: BagPose = makeBagPose();
  private active = false;

  /** idx — номера боксов подвижных площадок в мире (LobbyMap.aquaMovers, в порядке AQUA_MOVERS) */
  constructor(w: CollisionWorld, idx: readonly number[]) {
    this.w = w;
    this.idx = idx;
    this.park();
  }

  /**
   * Перед шагом входа с меткой t (tPrev — метка прошлого входа): подвижные боксы — на время t; кто стоял на площадке,
   * едет вместе с ней; площадка поднялась под ноги — встаёт на неё. Кто стоит серединой на неподвижном (причал, палуба),
   * того площадка рядом не везёт и не подхватывает, даже если он задел её краем. Вдали от полосы — ничего.
   */
  pre(s: PlayerState, t: number, tPrev: number): void {
    this.knock = 0;
    if (s.x >= AQUA_NEAR_X) return;
    const w = this.w;
    const n = AQUA_MOVERS.length;
    // подвижные боксы ещё убраны — под серединой только неподвижное
    const fixed = s.grounded === 1 && Math.abs(w.groundBelow(s.x, s.y + RIDE_EPS, s.z) - s.y) < RIDE_EPS;
    for (let i = 0; i < n; i++) {
      moverBox(AQUA_MOVERS[i], tPrev, this.was[i]);
      const b = moverBox(AQUA_MOVERS[i], t, this.now[i]);
      const k = this.idx[i];
      w.minX[k] = b.x0;
      w.maxX[k] = b.x1;
      w.minY[k] = b.y0;
      w.maxY[k] = b.top;
      w.minZ[k] = b.z0;
      w.maxZ[k] = b.z1;
    }
    this.active = true;
    if (fixed) return;
    if (s.grounded === 1) {
      // везёт та площадка, над которой середина (на встрече паромов — тот, на котором стоишь больше); середина над
      // водой — та, на которой стоит краем
      let ride = -1;
      for (let i = 0; i < n; i++) {
        const a = this.was[i];
        if (Math.abs(s.y - a.top) >= RIDE_EPS || !footOver(s, a.x0, a.x1, a.z0, a.z1)) continue;
        if (ride < 0) ride = i;
        if (s.x >= a.x0 && s.x <= a.x1 && s.z >= a.z0 && s.z <= a.z1) {
          ride = i;
          break;
        }
      }
      if (ride >= 0) {
        const a = this.was[ride];
        const b = this.now[ride];
        pushPlayer(s, w, b.x0 - a.x0, b.top - a.top, b.z0 - a.z0);
      }
    }
    for (let i = 0; i < n; i++) {
      const b = this.now[i];
      if (s.y < b.top && s.y > b.top - GRAB && footOver(s, b.x0, b.x1, b.z0, b.z1)) s.y = b.top;
    }
  }

  /** После шага с меткой t: отскок батутов своей силы, толчки вертушки и мешков; подвижные боксы — снова прочь. */
  post(s: PlayerState, ev: StepEvents, t: number): void {
    if (s.x < AQUA_NEAR_X) {
      if (ev.bounced) {
        for (const p of TRAMPS) {
          if (Math.abs(s.y - p.top) < 1e-3 && footOver(s, p.x0, p.x1, p.z0, p.z1)) {
            s.vy = p.bounce ?? s.vy;
            break;
          }
        }
      }
      this.hazards(s, t);
    }
    if (this.active) this.park();
  }

  /** Подвижные боксы — далеко за карту (вне шага игрока их в мире нет). */
  park(): void {
    const w = this.w;
    for (const k of this.idx) {
      w.minX[k] = w.maxX[k] = w.minZ[k] = w.maxZ[k] = AWAY;
      w.minY[k] = w.maxY[k] = -AWAY;
    }
    this.active = false;
  }

  private hazards(s: PlayerState, t: number): void {
    // вертушка: перекладина — отрезок через ось, труба радиуса r на высоте y0…y1 над площадкой
    const sw = AQUA_SWEEPER;
    const rx = s.x - sw.x;
    const rz = s.z - sw.z;
    const reach = sw.len + 2 * PLAYER_HALF;
    if (rx * rx + rz * rz < reach * reach && s.y < sw.top + sw.y1 && s.y + PLAYER_HEIGHT > sw.top + sw.y0) {
      sinCos(sweepAngle(t), sc);
      const along = rx * sc.c + rz * sc.s;
      const across = rz * sc.c - rx * sc.s;
      // полуширина квадрата желейки поперёк перекладины
      const half = PLAYER_HALF * (Math.abs(sc.c) + Math.abs(sc.s));
      if (Math.abs(across) < half + sw.r && Math.abs(along) < sw.len + half) {
        // туда, куда идёт перекладина в этом месте, и чуть от оси
        const sg = along >= 0 ? 1 : -1;
        const rl = Math.sqrt(rx * rx + rz * rz) || 1;
        knock(s, -sc.s * sg + (0.45 * rx) / rl, sc.c * sg + (0.45 * rz) / rl);
        this.knock = KNOCK_SWEEP;
        return;
      }
    }
    // мешки: вертикальный цилиндр (наклоном пренебрегаем), толкает туда, куда качается
    const reachB = PLAYER_HALF + AQUA_BAG_R;
    for (const b of AQUA_BAGS) {
      if (Math.abs(s.x - b.x) >= reachB) continue;
      const p = bagPose(b, t, this.bag);
      if (Math.abs(s.z - p.z) >= reachB || s.y >= p.y + AQUA_BAG_H / 2 || s.y + PLAYER_HEIGHT <= p.y - AQUA_BAG_H / 2) continue;
      knock(s, 0, p.w > 0 ? 1 : p.w < 0 ? -1 : s.z >= p.z ? 1 : -1);
      this.knock = KNOCK_BAG;
      return;
    }
  }
}
