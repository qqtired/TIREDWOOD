// «Выше облаков»: шаг игрока на Небесной каланче — та же физика желейки (stepPlayer), а вокруг неё — подвижное.
// Время всего подвижного — метка входа игрока (Input.viewTick, его часы отрисовки): клиент предсказывает шаг с этой
// меткой, сервер повторяет его с той же (зажатой в окно — aquaClock), поэтому что у игрока на экране, то и засчитано.
//
// before: подвижные боксы — на время t (люльки, тележка, корзины, облака, ступени); кто стоял на площадке — едет с
// ней ровно на её сдвиг; на карусели — поворачивается вместе с диском; ветер сдувает, восходящий поток поднимает;
// на сборе забега кнопки не действуют. after: грибы подбрасывают со своей силой, ловушки сбивают (не твёрдые: задел —
// полетел). Только +, −, ×, /, sqrt, остаток от деления и sinCos — бит в бит в любом браузере и в Node.
import { DT, PLAYER_HALF, PLAYER_HEIGHT } from './constants.ts';
import { TAU, sinCos } from './math.ts';
import type { SkillMap, SkillMover, SkillSack } from './skillmap.ts';
import { cloudSolid, crumbleState, lineU, orbitOffset, ramState, spinAngle, swingPose, windState, type RamPhase, type SwingPose } from './skilltraps.ts';
import { makeInput, pushPlayer, stepPlayer, type Input, type PlayerState, type StepEvents } from './sim.ts';
import type { CollisionWorld } from './world.ts';

/** Чем сбило в последнем шаге (для звука и картинки) */
export const SKILL_KNOCK_SACK = 1;
export const SKILL_KNOCK_RAM = 2;
export const SKILL_KNOCK_BAR = 3;
export const SKILL_KNOCK_BUMPER = 4;
/** Сбитый кувыркается столько тиков и в это время ловушки его не трогают (счётчик — s.fireCd: стрелять здесь нельзя) */
export const SKILL_KNOCK_TICKS = 45;
/** Рывок после толчка — уже через столько тиков: успел — спасся */
const KNOCK_DASH_CD = 18;
const KNOCK_SPEED = 12.5;
const KNOCK_UP = 6;
/** Ветер: на земле сносит медленнее, в прыжке — сильно, м/с */
export const SKILL_WIND_GROUND = 2.5;
export const SKILL_WIND_AIR = 6;
/** В восходящем потоке вбок — не быстрее, м/с */
const UPDRAFT_DRIFT = 3;
/** Стоящего на площадке узнаём по высоте ног с таким допуском */
const RIDE_EPS = 0.02;
/**
 * Площадка везёт седока между соседними входами, если между их метками не больше столько тиков: рывок кадра в полсекунды
 * не роняет с люльки, а после долгой паузы вкладки площадка не телепортирует седока.
 */
const RIDE_GAP = 30;
/** Площадка поднялась выше ног не больше чем на столько — встаёт на неё */
const GRAB = 0.3;
const EPS = 1e-7;
const AWAY = 1e6;

export interface P3 {
  x: number;
  y: number;
  z: number;
}

const off = { x: 0, y: 0 };
const sc = { s: 0, c: 0 };
const pose: SwingPose = { a: 0, w: 1 };

/** Середина верха подвижной площадки в момент t. */
export function moverAt(m: SkillMover, t: number, out: P3): P3 {
  if (m.kind === 'orbit') {
    orbitOffset(m.r, m.period, m.phase, t, off);
    out.x = m.x + off.x;
    out.y = m.y + off.y;
    out.z = m.z;
  } else {
    const u = lineU(m.sched, t);
    out.x = m.x + m.dx * u;
    out.y = m.y + m.dy * u;
    out.z = m.z + m.dz * u;
  }
  return out;
}

export interface SackPose extends P3 {
  /** Угол от вертикали и куда летит (+1/−1 вдоль оси качания) */
  a: number;
  w: number;
}

export function makeSackPose(): SackPose {
  return { x: 0, y: 0, z: 0, a: 0, w: 1 };
}

/** Середина мешка в момент t. */
export function sackAt(k: SkillSack, t: number, out: SackPose): SackPose {
  swingPose(k.amp, k.period, k.phase, t, pose);
  sinCos(pose.a, sc);
  const along = k.len * sc.s;
  out.x = k.axis === 'x' ? k.px + along : k.px;
  out.z = k.axis === 'z' ? k.pz + along : k.pz;
  out.y = k.py - k.len * sc.c;
  out.a = pose.a;
  out.w = pose.w;
  return out;
}

/** Угол диска карусели и перекладины в момент t (растёт от +x к +z). */
export function discAngle(map: SkillMap, t: number): number {
  return spinAngle(map.disc.period, t);
}

export function barAngle(map: SkillMap, t: number): number {
  return map.bar.dir * spinAngle(map.bar.period, t);
}

/** Ноги желейки (квадрат 0,84 м) хоть краем над прямоугольником. */
function footOver(s: PlayerState, x0: number, x1: number, z0: number, z1: number): boolean {
  return s.x - PLAYER_HALF < x1 - EPS && s.x + PLAYER_HALF > x0 + EPS && s.z - PLAYER_HALF < z1 - EPS && s.z + PLAYER_HALF > z0 + EPS;
}

/** Желейка задевает колокол — подъём окончен. */
export function inBell(map: SkillMap, s: PlayerState): boolean {
  const b = map.bell;
  return s.x + PLAYER_HALF > b.x0 && s.x - PLAYER_HALF < b.x1 && s.z + PLAYER_HALF > b.z0 && s.z - PLAYER_HALF < b.z1 && s.y + PLAYER_HEIGHT > b.y0 && s.y < b.y1;
}

/** Стоит на площадке с флагом номер i (сервер засчитывает только ноги на ней). */
export function onCheckpoint(map: SkillMap, s: PlayerState, i: number): boolean {
  const c = map.checkpoints[i];
  return s.grounded === 1 && Math.abs(s.y - c.y) < 0.05 && footOver(s, c.x0, c.x1, c.z0, c.z1);
}

function knock(s: PlayerState, kx: number, kz: number, speed: number): void {
  const l = Math.sqrt(kx * kx + kz * kz) || 1;
  s.vx = (kx / l) * speed;
  s.vz = (kz / l) * speed;
  if (s.vy < KNOCK_UP) s.vy = KNOCK_UP;
  s.grounded = 0;
  s.coyote = 0;
  s.jumpBuf = 0;
  s.dashT = 0;
  s.fireCd = SKILL_KNOCK_TICKS;
  if (s.dashCd < KNOCK_DASH_CD) s.dashCd = KNOCK_DASH_CD;
}

/** Подвижное Небесной каланчи вокруг шага игрока (один на мир: сервер и предсказание клиента зовут его по очереди). */
export class SkillDynamics {
  /** Чем сбило в последнем шаге (SKILL_KNOCK_*), 0 — ничем */
  knock = 0;
  /** Сбор забега: входы с меткой раньше этой — без кнопок (смотреть можно, бежать — нет) */
  lockUntil = 0;
  private readonly map: SkillMap;
  private readonly w: CollisionWorld;
  private readonly was: P3[];
  private readonly now: P3[];
  private readonly bounce = new Map<number, number>();
  private readonly locked: Input = makeInput();
  private readonly sack = makeSackPose();
  private readonly ram: { e: number; phase: RamPhase; k: number } = { e: 0, phase: 'rest', k: 0 };

  constructor(map: SkillMap, world: CollisionWorld) {
    this.map = map;
    this.w = world;
    this.was = map.movers.map(() => ({ x: 0, y: 0, z: 0 }));
    this.now = map.movers.map(() => ({ x: 0, y: 0, z: 0 }));
    for (const p of map.pads) if (p.bounce !== undefined) this.bounce.set(p.box, p.bounce);
    for (const m of map.movers) if (m.bounce !== undefined) this.bounce.set(m.box, m.bounce);
    this.place(0);
  }

  private setBox(i: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const w = this.w;
    w.minX[i] = x0;
    w.minY[i] = y0;
    w.minZ[i] = z0;
    w.maxX[i] = x1;
    w.maxY[i] = y1;
    w.maxZ[i] = z1;
  }

  private park(i: number): void {
    this.setBox(i, AWAY, -AWAY, AWAY, AWAY, -AWAY, AWAY);
  }

  /** Всё подвижное — на время t: площадки на место, растаявшие облака и осыпавшиеся ступени — прочь. */
  place(t: number): void {
    const map = this.map;
    for (let i = 0; i < map.movers.length; i++) {
      const m = map.movers[i];
      const p = moverAt(m, t, this.now[i]);
      this.setBox(m.box, p.x - m.w / 2, p.y - m.h, p.z - m.d / 2, p.x + m.w / 2, p.y, p.z + m.d / 2);
    }
    for (const c of map.clouds) {
      if (cloudSolid(c.phase, t)) this.setBox(c.box, c.rect.x0, c.rect.y - 0.7, c.rect.z0, c.rect.x1, c.rect.y, c.rect.z1);
      else this.park(c.box);
    }
    for (const st of map.steps) {
      if (crumbleState(st.s, t) >= 0) this.setBox(st.box, st.rect.x0, st.rect.y - 0.45, st.rect.z0, st.rect.x1, st.rect.y, st.rect.z1);
      else this.park(st.box);
    }
  }

  /** Перед шагом входа inp (prev — метка прошлого входа, NaN — неизвестна). Возвращает вход для шага. */
  before(s: PlayerState, inp: Input, prev: number): Input {
    this.knock = 0;
    const map = this.map;
    const w = this.w;
    const t = inp.viewTick;
    // везём только от недавнего известного входа: после паузы вкладки площадка не телепортирует седока
    const old = Number.isFinite(prev) && t >= prev && t - prev <= RIDE_GAP ? prev : t;
    this.place(old);
    let ride = -1;
    let onDisc = false;
    if (s.grounded === 1) {
      for (let i = 0; i < map.movers.length; i++) {
        const b = map.movers[i].box;
        if (Math.abs(s.y - w.maxY[b]) < RIDE_EPS && footOver(s, w.minX[b], w.maxX[b], w.minZ[b], w.maxZ[b])) {
          ride = i;
          if (s.x >= w.minX[b] && s.x <= w.maxX[b] && s.z >= w.minZ[b] && s.z <= w.maxZ[b]) break;
        }
      }
      if (ride < 0) {
        for (const b of map.disc.boxes) {
          if (Math.abs(s.y - w.maxY[b]) < RIDE_EPS && footOver(s, w.minX[b], w.maxX[b], w.minZ[b], w.maxZ[b])) {
            onDisc = true;
            break;
          }
        }
      }
    }
    for (let i = 0; i < map.movers.length; i++) {
      const n = this.now[i];
      const o = this.was[i];
      o.x = n.x;
      o.y = n.y;
      o.z = n.z;
    }
    this.place(t);
    if (ride >= 0) {
      const a = this.was[ride];
      const b = this.now[ride];
      pushPlayer(s, w, b.x - a.x, b.y - a.y, b.z - a.z);
    } else if (onDisc && t !== old) {
      sinCos((TAU * (t - old)) / map.disc.period, sc);
      const rx = s.x - map.disc.cx;
      const rz = s.z - map.disc.cz;
      pushPlayer(s, w, map.disc.cx + rx * sc.c - rz * sc.s - s.x, 0, map.disc.cz + rx * sc.s + rz * sc.c - s.z);
    }
    // площадка поднялась под ноги (люлька догнала, корзина тронулась) — встаёт на неё
    for (let i = 0; i < map.movers.length; i++) {
      const b = map.movers[i].box;
      const top = w.maxY[b];
      if (s.y < top && s.y > top - GRAB && footOver(s, w.minX[b], w.maxX[b], w.minZ[b], w.maxZ[b])) s.y = top;
    }
    this.weather(s, t);
    if (t < this.lockUntil) {
      const l = this.locked;
      l.seq = inp.seq;
      l.buttons = 0;
      l.yaw = inp.yaw;
      l.pitch = inp.pitch;
      l.viewTick = inp.viewTick;
      return l;
    }
    return inp;
  }

  /** Ветер (кроме как за парусом) и восходящий поток. */
  private weather(s: PlayerState, t: number): void {
    const map = this.map;
    for (const z of map.winds) {
      if (s.x < z.x0 || s.x > z.x1 || s.z < z.z0 || s.z > z.z1 || s.y < z.y0 || s.y > z.y1) continue;
      if (windState(z.phase, t) < 1) continue;
      let calm = false;
      for (const h of map.shelters) {
        if (s.x >= h.x0 && s.x <= h.x1 && s.z >= h.z0 && s.z <= h.z1 && s.y >= h.y0 && s.y <= h.y1) {
          calm = true;
          break;
        }
      }
      if (calm) continue;
      const v = (s.grounded === 1 ? SKILL_WIND_GROUND : SKILL_WIND_AIR) * DT;
      pushPlayer(s, this.w, z.dx * v, 0, z.dz * v);
    }
    for (const u of map.updrafts) {
      const dx = s.x - u.x;
      const dz = s.z - u.z;
      if (dx * dx + dz * dz >= u.r * u.r || s.y < u.y0 || s.y >= u.y1 + 1.5) continue;
      const lift = s.y <= u.y1 ? u.vmax : (u.vmax * (u.y1 + 1.5 - s.y)) / 1.5;
      if (s.vy < lift) s.vy = lift;
      // в полную силу потока не разбежишься: несёт вверх, а вбок — не быстрее UPDRAFT_DRIFT
      if (s.y <= u.y1) {
        const hs = Math.sqrt(s.vx * s.vx + s.vz * s.vz);
        if (hs > UPDRAFT_DRIFT) {
          s.vx *= UPDRAFT_DRIFT / hs;
          s.vz *= UPDRAFT_DRIFT / hs;
        }
      }
    }
  }

  /** После шага: грибы и тележка подбрасывают, ловушки сбивают. */
  after(s: PlayerState, inp: Input, ev: StepEvents): void {
    const w = this.w;
    if (s.grounded === 1) {
      for (const [b, v] of this.bounce) {
        if (Math.abs(s.y - w.maxY[b]) < 1e-3 && footOver(s, w.minX[b], w.maxX[b], w.minZ[b], w.maxZ[b])) {
          s.vy = v;
          s.grounded = 0;
          s.coyote = 0;
          ev.bounced = true;
          break;
        }
      }
    }
    if (s.fireCd > 0) return;
    this.hazards(s, inp.viewTick);
  }

  private hazards(s: PlayerState, t: number): void {
    const map = this.map;
    const H = PLAYER_HALF;
    // мешки: шар радиуса r против коробки желейки; толкает туда, куда летит
    for (const k of map.sacks) {
      const p = sackAt(k, t, this.sack);
      const cx = p.x < s.x - H ? s.x - H : p.x > s.x + H ? s.x + H : p.x;
      const cy = p.y < s.y ? s.y : p.y > s.y + PLAYER_HEIGHT ? s.y + PLAYER_HEIGHT : p.y;
      const cz = p.z < s.z - H ? s.z - H : p.z > s.z + H ? s.z + H : p.z;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dz = p.z - cz;
      if (dx * dx + dy * dy + dz * dz >= k.r * k.r) continue;
      knock(s, k.axis === 'x' ? p.w : 0, k.axis === 'z' ? p.w : 0, KNOCK_SPEED);
      this.knock = SKILL_KNOCK_SACK;
      return;
    }
    // тараны: бьют на ударе и пока выдвинуты
    for (const r of map.rams) {
      const st = ramState(r.phase, t, this.ram);
      if (st.phase !== 'strike' && st.phase !== 'hold') continue;
      const reach = (st.e > 0 ? st.e : 0) * r.stroke;
      const x0 = r.dx !== 0 ? Math.min(r.fx, r.fx + r.dx * reach) : r.fx - r.w / 2;
      const x1 = r.dx !== 0 ? Math.max(r.fx, r.fx + r.dx * reach) : r.fx + r.w / 2;
      const z0 = r.dz !== 0 ? Math.min(r.fz, r.fz + r.dz * reach) : r.fz - r.w / 2;
      const z1 = r.dz !== 0 ? Math.max(r.fz, r.fz + r.dz * reach) : r.fz + r.w / 2;
      if (s.x + H <= x0 || s.x - H >= x1 || s.z + H <= z0 || s.z - H >= z1 || s.y >= r.y1 || s.y + PLAYER_HEIGHT <= r.y0) continue;
      knock(s, r.dx, r.dz, KNOCK_SPEED);
      this.knock = SKILL_KNOCK_RAM;
      return;
    }
    // карусель: перекладина через ось (крутится навстречу диску) и столбики на диске
    const d = map.disc;
    const rx = s.x - d.cx;
    const rz = s.z - d.cz;
    const r2 = rx * rx + rz * rz;
    const bar = map.bar;
    const reach = bar.len + 2 * H;
    if (r2 < reach * reach && s.y < bar.y1 && s.y + PLAYER_HEIGHT > bar.y0) {
      sinCos(barAngle(map, t), sc);
      const along = rx * sc.c + rz * sc.s;
      const across = rz * sc.c - rx * sc.s;
      const half = H * (Math.abs(sc.c) + Math.abs(sc.s));
      if (Math.abs(across) < half + bar.r && Math.abs(along) < bar.len + half) {
        const sg = (along >= 0 ? 1 : -1) * bar.dir;
        const rl = Math.sqrt(r2) || 1;
        knock(s, -sc.s * sg + (0.45 * rx) / rl, sc.c * sg + (0.45 * rz) / rl, KNOCK_SPEED);
        this.knock = SKILL_KNOCK_BAR;
        return;
      }
    }
    const far = d.r + 1.5;
    if (r2 < far * far && r2 > 16) {
      const phi = discAngle(map, t);
      for (const b of map.bumpers) {
        if (s.y >= b.y1 || s.y + PLAYER_HEIGHT <= b.y0) continue;
        sinCos(b.a0 + phi, sc);
        const bx = d.cx + b.r0 * sc.c;
        const bz = d.cz + b.r0 * sc.s;
        const cx = bx < s.x - H ? s.x - H : bx > s.x + H ? s.x + H : bx;
        const cz = bz < s.z - H ? s.z - H : bz > s.z + H ? s.z + H : bz;
        if ((bx - cx) * (bx - cx) + (bz - cz) * (bz - cz) >= b.rad * b.rad) continue;
        knock(s, s.x - bx, s.z - bz, KNOCK_SPEED * 0.85);
        this.knock = SKILL_KNOCK_BUMPER;
        return;
      }
    }
  }

  step(s: PlayerState, inp: Input, prev: number, ev: StepEvents): void {
    const i = this.before(s, inp, prev);
    stepPlayer(s, i, this.w, false, 0, ev);
    this.after(s, i, ev);
  }
}
