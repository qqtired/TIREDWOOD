// Катер «Ласточка»: поездка по бухте (выпуск 5). Общее для сервера и клиента: где он стоит у причала, места
// в кокпите, путь поездки и где катер в каждый её тик. Сервер по этому пути двигает пассажиров, клиент рисует катер —
// поэтому желейки сидят ровно на своих местах.
// Путь — петля по часовой стрелке: от причала на восток, вдоль городской набережной, потом на юг, в открытой бухте
// на запад, за маяком на север и обратно к причалу с запада. Весь — в пределах ±128 м (снимки) и в воде.
import { TICK_RATE, WATER_Y } from './constants.ts';

/** Первый заплатил — катер его: остальные садятся бесплатно */
export const BOAT_PRICE = 10;
export const BOAT_SEATS = 4;
/** Посадка — 30 с с оплаты; все места заняты — отплытие через 3 с */
export const BOAT_BOARD_TICKS = 30 * TICK_RATE;
export const BOAT_FULL_TICKS = 3 * TICK_RATE;
/** Поездка — минута: 6 с разгон, потом ровный ход, последние 6 с — швартовка */
export const BOAT_RIDE_TICKS = 60 * TICK_RATE;
const EASE_S = 6;

/** Что с катером: стоит у причала, идёт посадка, в поездке */
export const BP_DOCK = 0;
export const BP_BOARD = 1;
export const BP_RIDE = 2;

/** Катер у причала: середина, куда смотрит нос (yaw −π/2 — на восток), левый борт — к стенке */
export const LAUNCH = { x: 8, z: 23.42, yaw: -Math.PI / 2 };
/** Пол кокпита — над водой на 0,3 м; пассажир стоит на нём, сидя — на подушке выше на BOAT_SIT_LIFT */
export const BOAT_FLOOR_Y = WATER_Y + 0.3;
export const BOAT_SIT_LIFT = 0.45;
/**
 * Места: в осях катера (x — к правому борту, z — к корме), лицом к носу. Первое — за рулём (у правого пульта):
 * заплативший — капитан; второе — рядом, у левого пульта; два — на диванчике у кормы.
 */
export const BOAT_SEAT_AT: ReadonlyArray<readonly [number, number]> = [[0.48, 0.95], [-0.48, 0.95], [-0.48, 2.42], [0.48, 2.42]];

/**
 * Точки пути (x, z): от причала и обратно к нему. От стенки катер отходит и подходит к ней под небольшим углом:
 * на повороте корма заносится в сторону причала — так её занос его не задевает.
 */
const PATH: ReadonlyArray<readonly [number, number]> = [
  [LAUNCH.x, LAUNCH.z], [12.5, 24.1], [17.5, 26.2], [22, 30.2], [24.6, 37], [25.5, 55], [25, 72], [22, 90], [8, 106], [-14, 108],
  [-30, 96], [-30, 80], [-18, 68], [-6, 56], [-4, 44], [-3.5, 35.5], [-2.2, 30], [0, 26.8], [3.5, 24.7], [LAUNCH.x, LAUNCH.z],
];

export interface BoatPose {
  x: number;
  z: number;
  yaw: number;
}

// Путь — центростремительный сплайн Катмулла — Рома через точки, заранее разбитый на ломаную с длинами
const SAMPLES_PER_SEG = 48;
/** У причала (первые и последние 4 м) нос плавно сводится к курсу стоянки — без рывка при отплытии и швартовке */
const DOCK_BLEND_M = 4;
const PX: number[] = [];
const PZ: number[] = [];
const PS: number[] = [];

function buildPath(): void {
  const n = PATH.length;
  const pt = (i: number): readonly [number, number] => {
    if (i < 0) return [2 * PATH[0][0] - PATH[1][0], 2 * PATH[0][1] - PATH[1][1]];
    if (i >= n) return [2 * PATH[n - 1][0] - PATH[n - 2][0], 2 * PATH[n - 1][1] - PATH[n - 2][1]];
    return PATH[i];
  };
  for (let i = 0; i < n - 1; i++) {
    const p0 = pt(i - 1);
    const p1 = pt(i);
    const p2 = pt(i + 1);
    const p3 = pt(i + 2);
    // узлы по корню расстояний (центростремительный вариант: без петель и острых выбросов)
    const t1 = Math.sqrt(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]));
    const t2 = t1 + Math.sqrt(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]));
    const t3 = t2 + Math.sqrt(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]));
    for (let k = i === 0 ? 0 : 1; k <= SAMPLES_PER_SEG; k++) {
      const t = t1 + ((t2 - t1) * k) / SAMPLES_PER_SEG;
      const xy = [0, 1].map((c) => {
        const a1 = ((t1 - t) / t1) * p0[c] + (t / t1) * p1[c];
        const a2 = ((t2 - t) / (t2 - t1)) * p1[c] + ((t - t1) / (t2 - t1)) * p2[c];
        const a3 = ((t3 - t) / (t3 - t2)) * p2[c] + ((t - t2) / (t3 - t2)) * p3[c];
        const b1 = ((t2 - t) / t2) * a1 + (t / t2) * a2;
        const b2 = ((t3 - t) / (t3 - t1)) * a2 + ((t - t1) / (t3 - t1)) * a3;
        return ((t2 - t) / (t2 - t1)) * b1 + ((t - t1) / (t2 - t1)) * b2;
      });
      const last = PX.length - 1;
      PS.push(last < 0 ? 0 : PS[last] + Math.hypot(xy[0] - PX[last], xy[1] - PZ[last]));
      PX.push(xy[0]);
      PZ.push(xy[1]);
    }
  }
}
buildPath();

/** Длина пути, м */
export const BOAT_PATH_LEN = PS[PS.length - 1];
/** Скорость ровного хода, м/с */
export const BOAT_SPEED = BOAT_PATH_LEN / (BOAT_RIDE_TICKS / TICK_RATE - EASE_S);

/** Сколько метров пути пройдено через t секунд поездки: разгон, ровный ход, швартовка (скорость без рывков). */
export function rideDistance(t: number): number {
  const T = BOAT_RIDE_TICKS / TICK_RATE;
  const v = BOAT_SPEED;
  if (t <= 0) return 0;
  if (t >= T) return BOAT_PATH_LEN;
  if (t < EASE_S) return (v * t * t) / (2 * EASE_S);
  if (t > T - EASE_S) return BOAT_PATH_LEN - (v * (T - t) ** 2) / (2 * EASE_S);
  return (v * EASE_S) / 2 + v * (t - EASE_S);
}

/** Точка пути на расстоянии s (м от причала). */
function pointAt(s: number, out: { x: number; z: number }): void {
  const c = Math.min(BOAT_PATH_LEN, Math.max(0, s));
  let lo = 0;
  let hi = PS.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (PS[mid] <= c) lo = mid;
    else hi = mid;
  }
  const seg = PS[hi] - PS[lo];
  const k = seg > 0 ? (c - PS[lo]) / seg : 0;
  out.x = PX[lo] + (PX[hi] - PX[lo]) * k;
  out.z = PZ[lo] + (PZ[hi] - PZ[lo]) * k;
}

const _a = { x: 0, z: 0 };
const _b = { x: 0, z: 0 };

/**
 * Где катер через tick тиков после отплытия (до него и после поездки — у причала). Нос смотрит по ходу: направление
 * берётся по точкам на полтора метра впереди и позади — курс меняется плавно; у причала — ровно как на стоянке.
 */
export function ridePose(tick: number, out: BoatPose = { x: 0, z: 0, yaw: 0 }): BoatPose {
  const s = rideDistance(tick / TICK_RATE);
  pointAt(s, out);
  pointAt(s - 0.75, _a);
  pointAt(s + 0.75, _b);
  let d = Math.atan2(-(_b.x - _a.x), -(_b.z - _a.z)) - LAUNCH.yaw;
  d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
  const k = Math.min(1, s / DOCK_BLEND_M, (BOAT_PATH_LEN - s) / DOCK_BLEND_M);
  out.yaw = LAUNCH.yaw + d * k * k * (3 - 2 * k);
  return out;
}

/** Место пассажира seat в мире, если катер стоит в pose: x, z и куда смотрит (по носу). */
export function seatAt(pose: BoatPose, seat: number, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
  const [lx, lz] = BOAT_SEAT_AT[seat];
  const c = Math.cos(pose.yaw);
  const s = Math.sin(pose.yaw);
  out.x = pose.x + lx * c + lz * s;
  out.z = pose.z - lx * s + lz * c;
  return out;
}
