// Свои лодки на воде (флаг ISLE): стоянка «У Семёна» за домом рыбака (пирс на 10 бертов, GLB boat-pier.glb), причал острова,
// шаг лодки (общий для сервера и предсказания клиента), берега и причалы, места в лодке, правила стоянки и сообщения.
// Таблица лодок и профиль — shared/fishboat.ts; сервер — server/lobby/ownboats.ts; клиент — client/boat/. Дизайн —
// docs/superpowers/plans/2026-10-10-fishing-island.md §3. Оси как везде: X — восток, Z — юг, yaw 0 — нос на север (−Z),
// ход — (−sin yaw, −cos yaw), A — влево (yaw растёт).
import { TICK_RATE, WATER_Y } from './constants.ts';
import { BARKAS } from './barkas.ts';
import { BOATS, type BoatKind } from './fishboat.ts';
import { ISLE_CENTER, fishZoneAtSea } from './fishisle.ts';
import type { FishZone } from './fishplaces.ts';
import { TIER_BASE } from './fishrules.ts';
import { ISLE_BERTHS, ISLE_SPAWN as ISLE_LANDING } from './maps/isle.ts';
import { BTN_BACK, BTN_FORWARD, BTN_LEFT, BTN_RIGHT, type Input } from './sim.ts';

const DT = 1 / TICK_RATE;

// ------------------------------------------------------------ правила

/** Лодок в мире не больше; у игрока — одна */
export const OB_WORLD_MAX = 16;
/** У стоянки стоят не больше 8 лодок: 2 берта всегда свободны (на причале острова — 4 из 6) */
export const OB_KEEP_FREE = 2;
/** Хозяин ушёл из игры: лодка у причала исчезает через 30 мин, в море — через 10 с */
export const OB_GONE_DOCK_TICKS = 30 * 60 * TICK_RATE;
export const OB_GONE_SEA_TICKS = 10 * TICK_RATE;
/** Вызов: лодка подходит из-за ворот за 4 с; швартовка в 25 м от стоянки — сама заходит в берт за 5 с */
export const OB_SUMMON_TICKS = 4 * TICK_RATE;
export const OB_MOOR_TICKS = 5 * TICK_RATE;
export const OB_MOOR_R = 25;
/** Якорь нельзя бросить ближе 12 м к причалам, мосткам и баркасу */
export const OB_ANCHOR_CLEAR = 12;
/** Пассажиром — с 3-го уровня рыбалки (как «Удалая») */
export const OB_PASSENGER_LEVEL = 3;
/** Где лодки шлём часто (30 раз в секунду): ближе этого к лодке; дальше — 2 раза в секунду */
export const OB_NEAR = 600;
/** Позиции лодок на ходу: каждые 2 тика ближним, каждые 30 — дальним */
export const OB_SEND_EVERY = 2;
export const OB_SEND_FAR = 30;
/** Игроков дальше этого друг от друга в снимке набережной не шлём (остров ↔ площадь) */
export const OB_SNAP_RANGE = 900;

// ------------------------------------------------------------ стоянка и причал острова

/** Стоянка «У Семёна»: начало координат пирса — верх сходней у южного края площадки дома рыбака (y = 0), пирс уходит на юг */
export const PARK = { x: -13.7, y: 0, z: 64 } as const;
/** Настил пирса ниже площадки (GLB: deck_y), сходни 3,2 м; ширина мостика 2,4 м, пальцы 5 × 0,6 м */
export const PARK_DECK_Y = -0.62;
export const PARK_RAMP = 3.2;
export const PARK_END = 22.4;
export const PARK_HALF = 1.2;
export const PARK_FINGER = 5;
/** Середина стоянки (для «в 25 м от стоянки») и ворота в море */
export const PARK_CENTER = { x: PARK.x, z: PARK.z + 13 } as const;
export const PARK_GATE = { x: PARK.x, z: PARK.z + 27 } as const;

/** Берт: точка у кромки мостика (по центру места), куда смотрит нос лодки в нём; номер таблички — с 1 */
export interface Berth {
  x: number;
  z: number;
  yaw: number;
  /** Табличка с номером на настиле (здесь E) и высота настила */
  px: number;
  pz: number;
  py: number;
}

const SLIP_Z = [5.7, 9.3, 12.9, 16.5, 20.1];
/**
 * Берты стоянки (slip_01…slip_10 из boat-pier.glb): 1–5 — с запада (нос на восток, к мостику), 6–10 — с востока.
 * Лодка носом к пирсу: центр = точка − вперёд × (L/2 + 0,6).
 */
export const PARK_BERTHS: readonly Berth[] = [-1, 1].flatMap((side) => SLIP_Z.map((z) => ({
  x: PARK.x + side * 1.3, z: PARK.z + z, yaw: (side * Math.PI) / 2, px: PARK.x + side * 0.84, pz: PARK.z + z, py: PARK_DECK_Y,
})));
/** Берты причала острова (пакет острова, shared/maps/isle.ts): корма у понтона, нос на юг; центр = точка + вперёд × L/2 */
export const ISLE_DOCK: readonly Berth[] = ISLE_BERTHS.map((b) => ({ ...b, px: b.x, pz: b.z - 1, py: b.y + 0.4 }));
/** Все берты подряд: 0–9 — стоянка, 10–15 — остров */
export const BERTHS: readonly Berth[] = [...PARK_BERTHS, ...ISLE_DOCK];
export const PARK_COUNT = PARK_BERTHS.length;
export const ISLE_DOCK_CENTER = ISLE_DOCK.length
  ? { x: ISLE_DOCK.reduce((s, b) => s + b.x, 0) / ISLE_DOCK.length, z: ISLE_DOCK[0].z + 4 }
  : { x: ISLE_CENTER.x, z: ISLE_CENTER.z };

/**
 * Твёрдое пирса стоянки для желеек: сходни ступеньками (с площадки y 0 вниз к настилу), мостик и пальцы между бертами.
 * Ступени ниже шага (0,52 м) — вверх по сходням заходят сами.
 */
export function parkDeckBoxes(): Array<{ min: [number, number, number]; max: [number, number, number] }> {
  const x0 = PARK.x - PARK_HALF;
  const x1 = PARK.x + PARK_HALF;
  const out: Array<{ min: [number, number, number]; max: [number, number, number] }> = [];
  const steps = [[0, 1.1, -0.15], [1.1, 2.2, -0.35], [2.2, PARK_RAMP, -0.5]] as const;
  for (const [a, c, top] of steps) out.push({ min: [x0, -1, PARK.z + a], max: [x1, top, PARK.z + c] });
  out.push({ min: [x0, -1, PARK.z + PARK_RAMP], max: [x1, PARK_DECK_Y, PARK.z + PARK_END] });
  for (const side of [-1, 1]) {
    for (const z of [3.9, 7.5, 11.1, 14.7, 18.3, 21.9]) {
      const a = PARK.x + side * PARK_HALF;
      const c = PARK.x + side * (PARK_HALF + PARK_FINGER);
      out.push({ min: [Math.min(a, c), -1, PARK.z + z - 0.3], max: [Math.max(a, c), PARK_DECK_Y, PARK.z + z + 0.3] });
    }
  }
  return out;
}

/** Берт стоянки (true) или острова */
export function isParkBerth(b: number): boolean {
  return b >= 0 && b < PARK_COUNT;
}

/** Номер берта на табличке: стоянка 1–10, остров 1–6 */
export function berthLabel(b: number): number {
  return isParkBerth(b) ? b + 1 : b - PARK_COUNT + 1;
}

export interface BoatPose {
  x: number;
  z: number;
  yaw: number;
}

/** Где стоит лодка этого типа в берте b: на стоянке — носом к пирсу, на острове — кормой к понтону */
export function berthPose(b: number, kind: BoatKind, out: BoatPose = { x: 0, z: 0, yaw: 0 }): BoatPose {
  const t = BERTHS[b];
  const fx = -Math.sin(t.yaw);
  const fz = -Math.cos(t.yaw);
  const d = isParkBerth(b) ? -(kind.length / 2 + 0.6) : kind.length / 2 + 0.4;
  out.x = t.x + fx * d;
  out.z = t.z + fz * d;
  out.yaw = t.yaw;
  return out;
}

/** Куда ставим сошедшего на берег у берта b: на настил у таблички (у острова — точка высадки) */
export function berthLanding(b: number): { x: number; y: number; z: number; yaw: number } {
  if (!isParkBerth(b)) return { ...ISLE_LANDING };
  const t = BERTHS[b];
  // на мостике, лицом к площадке дома
  return { x: PARK.x + (t.px - PARK.x) * 0.4, y: PARK_DECK_Y, z: t.pz, yaw: 0 };
}

/** Где ближайший причал к точке: стоянка или остров (сюда Гоша отвозит пассажиров, если хозяин ушёл) */
export function nearestLanding(x: number, z: number): { x: number; y: number; z: number; yaw: number } {
  const dPark = Math.hypot(x - PARK_CENTER.x, z - PARK_CENTER.z);
  const dIsle = Math.hypot(x - ISLE_DOCK_CENTER.x, z - ISLE_DOCK_CENTER.z);
  return dIsle < dPark ? { ...ISLE_LANDING } : { x: PARK.x, y: PARK_DECK_Y, z: PARK.z + PARK_RAMP + 1.5, yaw: 0 };
}

/** Рядом со стоянкой (true) или с причалом острова — в OB_MOOR_R; иначе null */
export function nearDock(x: number, z: number, r = OB_MOOR_R): 'park' | 'isle' | null {
  if (Math.hypot(x - PARK_CENTER.x, z - PARK_CENTER.z) < r + 12) return 'park';
  if (Math.hypot(x - ISLE_DOCK_CENTER.x, z - ISLE_DOCK_CENTER.z) < r + 12) return 'isle';
  return null;
}

/** Берты причала: стоянка или остров */
export function dockBerths(dock: 'park' | 'isle'): number[] {
  const out: number[] = [];
  for (let b = 0; b < BERTHS.length; b++) if (isParkBerth(b) === (dock === 'park')) out.push(b);
  return out;
}

// ------------------------------------------------------------ места в лодке

/** Место в лодке в мире: x, y (верх подушки), z — по позе лодки на воде */
export function seatWorld(pose: BoatPose, kind: BoatKind, seat: number, out = { x: 0, y: 0, z: 0 }): { x: number; y: number; z: number } {
  const [lx, ly, lz] = kind.seats[seat] ?? kind.seats[0];
  const c = Math.cos(pose.yaw);
  const s = Math.sin(pose.yaw);
  out.x = pose.x + lx * c + lz * s;
  out.y = WATER_Y + ly;
  out.z = pose.z - lx * s + lz * c;
  return out;
}

/** Куда забрасывает сидящий на якоре: штурвальный — вправо-вперёд, задние — каждый в свой борт */
export function seatCastYaw(yaw: number, seat: number): number {
  return seat === 1 ? yaw + Math.PI / 2 : seat === 2 ? yaw - Math.PI / 2 : yaw - Math.PI / 4;
}

/** Действие ACT_OWNBOAT: аргумент — номер лодки × 4 + место */
export function obArg(boat: number, seat: number): number {
  return boat * 4 + seat;
}

// ------------------------------------------------------------ шаг лодки

/** Что с лодкой: у берта (стоит), в море, бросает якорь (гасит ход), на якоре, поднимает якорь, швартуется, подходит по вызову */
export const OB_DOCK = 0;
export const OB_SEA = 1;
export const OB_DROP = 2;
export const OB_ANCHORED = 3;
export const OB_RAISE = 4;
export const OB_MOOR = 5;
export const OB_SUMMON = 6;

export interface ObState {
  ph: number;
  /** Тип лодки — номер в BOATS */
  kind: number;
  x: number;
  z: number;
  yaw: number;
  /** Скорость вдоль носа (назад — минус), руль −1…1 (+ — влево) */
  v: number;
  steer: number;
  /** Якорь: 0 — поднят, 1 — на дне */
  k: number;
  /** Швартовка и вызов: тиков с начала, откуда и куда (берт b) */
  t: number;
  fx: number;
  fz: number;
  fyaw: number;
  b: number;
}

/** Порядок полей — для точной передачи состояния своей лодки штурману (сверка предсказания) */
export const OB_KEYS = ['ph', 'kind', 'x', 'z', 'yaw', 'v', 'steer', 'k', 't', 'fx', 'fz', 'fyaw', 'b'] as const satisfies ReadonlyArray<keyof ObState>;

export function makeObState(kind = 0): ObState {
  return { ph: OB_DOCK, kind, x: 0, z: 0, yaw: 0, v: 0, steer: 0, k: 0, t: 0, fx: 0, fz: 0, fyaw: 0, b: -1 };
}

export function copyObState(to: ObState, from: Readonly<ObState>): ObState {
  for (const k of OB_KEYS) to[k] = from[k];
  return to;
}

export function sameObState(a: Readonly<ObState>, b: Readonly<ObState>): boolean {
  for (const k of OB_KEYS) if (Math.abs(a[k] - b[k]) > 1e-6) return false;
  return true;
}

/** Из сообщения: только числа по OB_KEYS; кривое — null */
export function readObState(raw: unknown, out: ObState = makeObState()): ObState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  for (const k of OB_KEYS) {
    const v = r[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    out[k] = v;
  }
  return BOATS[out.kind] ? out : null;
}

/** Без газа вода тормозит: постоянная часть и квадратичная; тормоз S на переднем ходу; руль набирается плавно */
const COAST = 0.9;
const QUAD = 0.006;
const BRAKE = 6;
const STEER_RATE = 0.08;
/** На месте лодка медленно разворачивается (рад/с) */
const TURN_STILL = 0.3;
/** Якорь: ход гасится за 2 с */
const DROP_STOP_S = 2;

/** Поставить лодку в берт (стоит у причала) */
export function dockAt(s: ObState, b: number): void {
  const kind = BOATS[s.kind];
  const p = berthPose(b, kind);
  s.ph = OB_DOCK;
  s.x = p.x;
  s.z = p.z;
  s.yaw = p.yaw;
  s.v = 0;
  s.steer = 0;
  s.k = 0;
  s.t = 0;
  s.b = b;
}

/** Начать заход в берт b из текущей позы (швартовка) или из-за ворот (вызов) */
export function startMove(s: ObState, b: number, summon: boolean): void {
  const kind = BOATS[s.kind];
  const p = berthPose(b, kind);
  if (summon) {
    // подходит носом вперёд издалека по своей линии: на стоянке — из-за кромки пирса, у острова — с юга
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    s.fx = p.x - fx * 26;
    s.fz = p.z - fz * 26;
    s.fyaw = p.yaw;
  } else {
    s.fx = s.x;
    s.fz = s.z;
    s.fyaw = s.yaw;
  }
  s.ph = summon ? OB_SUMMON : OB_MOOR;
  s.t = 0;
  s.b = b;
  s.v = 0;
  s.steer = 0;
  s.k = 0;
}

/** Плавный заход в берт: позиция и курс по расписанию (одинаково у всех) */
function stepMove(s: ObState): void {
  const total = s.ph === OB_SUMMON ? OB_SUMMON_TICKS : OB_MOOR_TICKS;
  s.t++;
  const kind = BOATS[s.kind];
  const p = berthPose(s.b, kind, _pose);
  const k = Math.min(1, s.t / total);
  const e = k * k * (3 - 2 * k);
  // курс сводится к берту быстрее, чем позиция: последние метры лодка идёт уже ровно
  const ky = Math.min(1, k * 1.6);
  const ey = ky * ky * (3 - 2 * ky);
  const nx = s.fx + (p.x - s.fx) * e;
  const nz = s.fz + (p.z - s.fz) * e;
  s.v = Math.hypot(nx - s.x, nz - s.z) * TICK_RATE;
  s.x = nx;
  s.z = nz;
  let d = p.yaw - s.fyaw;
  d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
  s.yaw = s.fyaw + d * ey;
  if (s.t >= total) dockAt(s, s.b);
}

const _pose: BoatPose = { x: 0, z: 0, yaw: 0 };

/**
 * Шаг лодки за тик по входу штурвального (у пассажиров и без штурмана — пустой вход). anchor — в этом входе нажали Z
 * (бросить или поднять якорь: сервер и предсказание решают одинаково по номеру входа). Возвращает true, если лодка
 * отошла от берта (газ у причала) — сервер освобождает берт.
 */
export function stepOwnBoat(s: ObState, inp: Readonly<Input>, anchor = false): boolean {
  const kind = BOATS[s.kind];
  if (!kind) return false;
  if (s.ph === OB_MOOR || s.ph === OB_SUMMON) {
    stepMove(s);
    return false;
  }
  const b = inp.buttons;
  const fwd = (b & BTN_FORWARD) !== 0 && (b & BTN_BACK) === 0;
  const back = (b & BTN_BACK) !== 0 && (b & BTN_FORWARD) === 0;
  let left = false;
  if (s.ph === OB_DOCK) {
    // у берта стоит; газ или задний ход — отходит (из берта на стоянке — задним ходом, нос к пирсу)
    if (!fwd && !back) return false;
    s.ph = OB_SEA;
    s.b = -1;
    left = true;
  }
  if (anchor) {
    if (s.ph === OB_SEA) s.ph = OB_DROP;
    else if (s.ph === OB_ANCHORED || s.ph === OB_DROP) s.ph = OB_RAISE;
  }
  if (s.ph === OB_DROP) {
    // гасит ход за 2 с, потом якорь идёт на дно
    const dec = (kind.speed / DROP_STOP_S) * DT;
    s.v = s.v > 0 ? Math.max(0, s.v - dec) : Math.min(0, s.v + dec);
    s.steer -= s.steer * STEER_RATE;
    if (s.v === 0) {
      s.k = Math.min(1, s.k + DT / kind.anchor);
      if (s.k >= 1) s.ph = OB_ANCHORED;
    }
  } else if (s.ph === OB_RAISE) {
    s.k = Math.max(0, s.k - DT / kind.anchor);
    if (s.k <= 0) s.ph = OB_SEA;
  } else if (s.ph === OB_SEA) {
    const accel = kind.speed / kind.accel;
    if (fwd) {
      if (s.v < 0) s.v = Math.min(0, s.v + BRAKE * DT);
      else s.v = Math.min(kind.speed, s.v + accel * DT);
    } else if (back) {
      if (s.v > 0) s.v = Math.max(0, s.v - BRAKE * DT);
      else s.v = Math.max(-kind.reverse, s.v - accel * 0.6 * DT);
    } else {
      const drag = (COAST + QUAD * s.v * s.v) * DT;
      s.v = s.v > 0 ? Math.max(0, s.v - drag) : Math.min(0, s.v + drag);
    }
    const want = ((b & BTN_LEFT) !== 0 ? 1 : 0) - ((b & BTN_RIGHT) !== 0 ? 1 : 0);
    s.steer += (want - s.steer) * STEER_RATE;
  }
  if (s.ph === OB_SEA || s.ph === OB_DROP) {
    const sp = Math.abs(s.v);
    const rate = TURN_STILL + (kind.turn - TURN_STILL) * Math.min(1, sp / kind.speed);
    // задним ходом руль работает наоборот, как у настоящей лодки
    s.yaw += s.steer * rate * (s.v < -0.05 ? -1 : 1) * DT;
    if (s.yaw > Math.PI) s.yaw -= 2 * Math.PI;
    else if (s.yaw < -Math.PI) s.yaw += 2 * Math.PI;
    s.x += -Math.sin(s.yaw) * s.v * DT;
    s.z += -Math.cos(s.yaw) * s.v * DT;
    collide(s, kind);
  }
  return left;
}

// ------------------------------------------------------------ берега и причалы

/** Твёрдое для лодок: прямоугольники x0…x1 × z0…z1 и круги (берег, причалы, пирс стоянки, баркас, остров) */
const BOXES: ReadonlyArray<readonly [number, number, number, number]> = [
  // площадь и город (набережная до z 22; аквапарк и самолёт — к западу от неё)
  [-30.5, -2000, 2000, 21.8],
  [-95, 6.5, -33.5, 39],
  [-42, -15, -34, -7],
  // мостки к маяку, площадка маяка, дальние мостки, площадка дома Семёна
  [-21, 21.8, -17, 37], [-24.5, 37, -13.5, 46.5], [-20.5, 46.5, -17.5, 54], [-25.5, 54, -12.5, 64],
  // причал «Ласточки» и понтон крысиных бегов
  [3, 21.8, 13, 25], [-10.8, 21.8, -4, 26.8],
  // стоянка: мостик и пальцы между бертами (у каждого борта — 6 пальцев по 0,6 м)
  [PARK.x - PARK_HALF, PARK.z, PARK.x + PARK_HALF, PARK.z + PARK_END],
  ...[-1, 1].flatMap((side) => [3.9, 7.5, 11.1, 14.7, 18.3, 21.9].map((z) => {
    const a = PARK.x + side * PARK_HALF;
    const c = PARK.x + side * (PARK_HALF + PARK_FINGER);
    return [Math.min(a, c), PARK.z + z - 0.3, Math.max(a, c), PARK.z + z + 0.3] as const;
  })),
  // баркас «Альбатрос»
  [BARKAS.bow - 0.8, BARKAS.z - BARKAS.half - 0.5, BARKAS.stern + 0.8, BARKAS.z + BARKAS.half + 0.5],
];

/** Остров «Последний свет»: суша кругами (середина, мыс маяка, мол), без бухты с причалом на востоке */
const CIRCLES: ReadonlyArray<readonly [number, number, number]> = [
  [ISLE_CENTER.x - 5, ISLE_CENTER.z + 5, 64],
  [ISLE_CENTER.x + 75, ISLE_CENTER.z - 62, 30],
  [ISLE_CENTER.x + 40, ISLE_CENTER.z + 40, 30],
  [ISLE_CENTER.x + 70, ISLE_CENTER.z + 32, 6], [ISLE_CENTER.x + 90, ISLE_CENTER.z + 29, 6], [ISLE_CENTER.x + 110, ISLE_CENTER.z + 25, 6],
  [ISLE_CENTER.x + 118, ISLE_CENTER.z + 15, 5],
];

/** Дальний берег («веер» гор от −57° до +64° от юга) — дальше 480 м от площади; весь мир — круг 2,9 км */
const FAN_R = 480;
const FAN_FROM = (-57 * Math.PI) / 180;
const FAN_TO = (64 * Math.PI) / 180;
const WORLD_R = 2900;

/** Насколько близко к твёрдому центр круга (отрицательное — внутри) и куда выталкивать */
function pushOut(s: ObState, cx: number, cz: number, r: number): void {
  for (const [x0, z0, x1, z1] of BOXES) {
    if (cx < x0 - r || cx > x1 + r || cz < z0 - r || cz > z1 + r) continue;
    const qx = cx < x0 ? x0 : cx > x1 ? x1 : cx;
    const qz = cz < z0 ? z0 : cz > z1 ? z1 : cz;
    let dx = cx - qx;
    let dz = cz - qz;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d >= r) continue;
    const ox = s.x;
    const oz = s.z;
    if (d < 1e-6) {
      // центр внутри: выталкиваем к ближайшей грани
      const l = cx - x0, rr = x1 - cx, t = cz - z0, bb = z1 - cz;
      const m = Math.min(l, rr, t, bb);
      dx = m === l ? -1 : m === rr ? 1 : 0;
      dz = dx !== 0 ? 0 : m === t ? -1 : 1;
      hit(s, dx, dz, r + m);
    } else hit(s, dx / d, dz / d, r - d);
    cx += s.x - ox;
    cz += s.z - oz;
  }
  for (const [x, z, R] of CIRCLES) {
    const dx = cx - x;
    const dz = cz - z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d >= R + r || d < 1e-6) continue;
    const ox = s.x;
    const oz = s.z;
    hit(s, dx / d, dz / d, R + r - d);
    cx += s.x - ox;
    cz += s.z - oz;
  }
}

/** Толкнуло в сторону (nx, nz) на depth: лодку выставляем наружу, ход в стену гасим */
function hit(s: ObState, nx: number, nz: number, depth: number): void {
  s.x += nx * depth;
  s.z += nz * depth;
  const fx = -Math.sin(s.yaw);
  const fz = -Math.cos(s.yaw);
  const into = (fx * nx + fz * nz) * s.v;
  if (into < 0) s.v *= 0.35;
}

function collide(s: ObState, kind: BoatKind): void {
  const r = kind.beam / 2;
  const half = kind.length / 2 - r;
  const fx = -Math.sin(s.yaw);
  const fz = -Math.cos(s.yaw);
  // корпус — два круга: у носа и у кормы
  pushOut(s, s.x + fx * half, s.z + fz * half, r);
  pushOut(s, s.x - fx * half, s.z - fz * half, r);
  // дальний берег и край мира
  const d = Math.sqrt(s.x * s.x + s.z * s.z);
  if (d > FAN_R) {
    const a = Math.atan2(s.x, s.z);
    if (a > FAN_FROM && a < FAN_TO) hit(s, -s.x / d, -s.z / d, d - FAN_R);
  }
  const d2 = Math.sqrt(s.x * s.x + s.z * s.z);
  if (d2 > WORLD_R) hit(s, -s.x / d2, -s.z / d2, d2 - WORLD_R);
}

/** Можно ли бросить якорь здесь: не ближе 12 м к причалам, мосткам и баркасу и не у стоянки */
export function canAnchorAt(x: number, z: number): boolean {
  if (nearDock(x, z, 0)) return false;
  for (const [x0, z0, x1, z1] of BOXES.slice(3)) {
    const qx = x < x0 ? x0 : x > x1 ? x1 : x;
    const qz = z < z0 ? z0 : z > z1 ? z1 : z;
    if (Math.hypot(x - qx, z - qz) < OB_ANCHOR_CLEAR) return false;
  }
  return true;
}

// ------------------------------------------------------------ сообщения

/** Лодка для всех (JSON, при смене): номер в мире, тип, чья (номер игрока в снимке, 0 — хозяин ушёл), ник, берт, места */
export interface ObView {
  /** Номер лодки в мире (0…15) */
  i: number;
  /** Тип — номер в BOATS */
  k: number;
  /** Хозяин: профиль и номер в снимке (0 — вышел из игры) */
  pid: number;
  slot: number;
  nick: string;
  /** Кто на местах (номер в снимке, 0 — свободно) */
  s: [number, number, number];
  /** С какого тика стоит без хозяина на борту (0 — хозяин на борту) */
  idle: number;
}

/** Позиции лодок: [номер, фаза, x, z, курс, скорость, руль, якорь, t, fx, fz, fyaw, b] на лодку подряд */
export const OB_POS_N = 13;

export function obPosPush(out: number[], i: number, s: Readonly<ObState>): void {
  out.push(i, s.ph, round(s.x, 1000), round(s.z, 1000), round(s.yaw, 10000), round(s.v, 100), round(s.steer, 100), round(s.k, 1000), s.t,
    round(s.fx, 100), round(s.fz, 100), round(s.fyaw, 10000), s.b);
}

function round(v: number, k: number): number {
  return Math.round(v * k) / k;
}

/** Время в пути: тики → «2:05» */
export function obClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Сообщения лодок сервер → клиент: ob — состав (всем при смене и вошедшему; нет сообщения — флага ISLE нет), obPos — где
 * лодки не у берта (ближним — 30 раз в секунду, дальним — 2), obMe — точное состояние своей лодки штурману (сверка
 * предсказания), obHorn — гудок лодки i.
 */
export type ObServerMsg =
  | { t: 'ob'; k: number; boats: ObView[]; pos: number[] }
  | { t: 'obPos'; k: number; p: number[] }
  | { t: 'obMe'; i: number; ack: number; s: ObState }
  | { t: 'obHorn'; i: number };

/**
 * Клиент → сервер: summon — вызвать свою лодку boat в берт b; e — E в лодке (пришвартоваться у стоянки или причала,
 * у берта — выйти); anchor — Z (бросить или поднять якорь с входа at); horn — гудок (пробел); sell — «Продать улов»
 * из меню своей лодки (у стоянки или причала острова).
 */
export type ObClientMsg =
  | { t: 'ob'; a: 'summon'; b: number; boat: string }
  | { t: 'ob'; a: 'e' }
  | { t: 'ob'; a: 'anchor'; at: number }
  | { t: 'ob'; a: 'horn' }
  | { t: 'ob'; a: 'sell' };

/** Пул с якоря в точке (x, z): fishZoneAtSea (shared/fishisle.ts); зоны, которой правила рыбы ещё не знают, — баркас */
export function anchorZone(x: number, z: number): FishZone {
  const zone: string = fishZoneAtSea(x, z);
  return zone in TIER_BASE ? zone as FishZone : 'barkas';
}
