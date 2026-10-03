// Лодка Семёна «Удалая»: рейсы по требованию между мостками у маяка и баркасом «Альбатрос» (shared/barkas.ts).
// Общее для сервера и клиента: стоянки, места, оба пути и где лодка в каждый тик рейса. Сервер по этому двигает
// пассажиров, клиент рисует лодку по тем же часам — желейки сидят ровно на банках (как у «Ласточки», shared/boat.ts).
//
// Рейс по требованию: лодка ждёт у Семёна. Первый сел — отход через 10 с (все места заняты — через 3 с). У баркаса
// высадка, 12 с ждёт обратных пассажиров и в любом случае идёт назад. С баркаса лодку зовут колоколом у калитки:
// пустая лодка выходит через 3 с. Обратно лодка подходит к мосткам носом на север и разворачивается на месте
// (у стенки корма отходит от неё) — в тупиковом канале у маяка по-другому не развернуться.
import { TICK_RATE, WATER_Y } from './constants.ts';
import type { Vec3 } from './maps/types.ts';

/** В море на баркас — с 3-го уровня рыбалки (fishLevel из shared/fishprogress.ts) */
export const FERRY_LEVEL = 3;
/** Три банки по двое */
export const FERRY_SEATS = 6;
/** Первый сел — отход через 10 с; места кончились — через 3 с; позвали колоколом — через 3 с; у баркаса ждёт 12 с */
export const FERRY_BOARD_TICKS = 10 * TICK_RATE;
export const FERRY_FULL_TICKS = 3 * TICK_RATE;
export const FERRY_CALL_TICKS = 3 * TICK_RATE;
export const FERRY_WAIT_TICKS = 12 * TICK_RATE;

/** Что с лодкой (ph в FerryStatus): у Семёна стоит; у Семёна, идёт отсчёт; к баркасу; у баркаса; к Семёну */
export const FE_HOME = 0;
export const FE_BOARD = 1;
export const FE_OUT = 2;
export const FE_AWAY = 3;
export const FE_BACK = 4;

export interface FerryPose {
  x: number;
  z: number;
  yaw: number;
}

/** Стоянка у Семёна: вдоль восточного края площадки маяка, нос на юг (правый борт — к настилу) */
export const FERRY_HOME: FerryPose = { x: -12.85, z: 39.6, yaw: Math.PI };
/** Стоянка у баркаса: у транца, нос на юг (правый борт — к калитке) */
export const FERRY_AWAY: FerryPose = { x: -44.5, z: 68, yaw: Math.PI };
/** Пол лодки — над водой на 0,3 м (как у катера); сидят на банках выше на BOAT_SIT_LIFT */
export const FERRY_FLOOR_Y = WATER_Y + 0.3;
/** Корпус 5 × 2,2 м: половины длины и ширины (для проверок зазоров) */
export const FERRY_HALF_L = 2.5;
export const FERRY_HALF_B = 1.1;
/**
 * Места: в осях лодки (x — к правому борту, z — к корме), лицом к носу. Банки — от носа к корме, по двое; у правого
 * борта (к причалу) — первые.
 */
export const FERRY_SEAT_AT: ReadonlyArray<readonly [number, number]> = [
  [0.45, -1.25], [-0.45, -1.25], [0.45, -0.15], [-0.45, -0.15], [0.45, 0.9], [-0.45, 0.9],
];
/** Моторист Гоша — на корме у румпеля, с левого борта (правый — к причалу, там садятся) */
export const FERRY_GOSHA: readonly [number, number] = [-0.5, 2.15];

/** Куда высаживают у Семёна (на площадку маяка у стоянки, лицом к острову) и куда отправляет Саня */
export const FERRY_HOME_LANDING = { x: -15.6, z: 39.6, yaw: 0 } as const;
export const FERRY_HOME_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [-15.1, 38.9], [-15.1, 39.9], [-15.1, 40.9], [-16.1, 38.9], [-16.1, 39.9], [-16.1, 40.9],
];

/** Путь к баркасу: от мостков на юг, вдоль южного края маяка под удочками, к корме баркаса с севера */
const OUT_POINTS: ReadonlyArray<readonly [number, number]> = [
  [FERRY_HOME.x, FERRY_HOME.z], [-12.3, 42.4], [-11.3, 45.6], [-12.2, 48.5], [-15.4, 49.8], [-20.5, 49.9], [-27, 50.4], [-34, 52.8],
  [-40, 57.2], [-43.6, 61.2], [-44.35, 64.8], [FERRY_AWAY.x, FERRY_AWAY.z],
];
/** Путь назад: от кормы на юг, петлёй на восток, по открытой воде к каналу у маяка и вверх по нему — к мосткам */
const BACK_POINTS: ReadonlyArray<readonly [number, number]> = [
  [FERRY_AWAY.x, FERRY_AWAY.z], [-44.45, 72.6], [-43.9, 75.6], [-41.6, 77.6], [-38.2, 77], [-35.2, 73.4], [-29.5, 65.8], [-23.5, 60.4],
  [-17, 58.2], [-11.7, 54.6], [-10.3, 50], [-10.9, 46.2], [-12.2, 42.6], [FERRY_HOME.x, FERRY_HOME.z],
];

/** Ход: ровно 3,6 м/с, разгон и торможение по 2,5 с; у стоянок нос плавно сводится к курсу стоянки на последних 4 м */
export const FERRY_SPEED = 3.6;
const EASE_S = 2.5;
const DOCK_BLEND_M = 4;
/** Разворот у мостков: 4 с, нос уходит от стенки (через восток), корма отходит от неё — лодка не задевает настил */
const PIVOT_S = 4;
/** Зазор до стенки на развороте, м */
const PIVOT_GAP = 0.05;

const SAMPLES_PER_SEG = 32;

/** Путь: центростремительный сплайн Катмулла — Рома через точки, разбитый на ломаную с длинами (как у «Ласточки»). */
class Path {
  readonly px: number[] = [];
  readonly pz: number[] = [];
  readonly ps: number[] = [];
  readonly len: number;
  /** Сколько секунд идёт лодка по пути: разгон, ровный ход, торможение */
  readonly secs: number;
  /** Курс у стоянок в начале и в конце пути */
  readonly yaw0: number;
  readonly yaw1: number;

  constructor(points: ReadonlyArray<readonly [number, number]>, yaw0: number, yaw1: number) {
    this.yaw0 = yaw0;
    this.yaw1 = yaw1;
    const n = points.length;
    const pt = (i: number): readonly [number, number] => {
      if (i < 0) return [2 * points[0][0] - points[1][0], 2 * points[0][1] - points[1][1]];
      if (i >= n) return [2 * points[n - 1][0] - points[n - 2][0], 2 * points[n - 1][1] - points[n - 2][1]];
      return points[i];
    };
    for (let i = 0; i < n - 1; i++) {
      const p0 = pt(i - 1);
      const p1 = pt(i);
      const p2 = pt(i + 1);
      const p3 = pt(i + 2);
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
        const last = this.px.length - 1;
        this.ps.push(last < 0 ? 0 : this.ps[last] + Math.hypot(xy[0] - this.px[last], xy[1] - this.pz[last]));
        this.px.push(xy[0]);
        this.pz.push(xy[1]);
      }
    }
    this.len = this.ps[this.ps.length - 1];
    this.secs = this.len / FERRY_SPEED + EASE_S;
  }

  /** Сколько метров пройдено через t с: разгон, ровный ход, торможение (скорость без рывков) */
  dist(t: number): number {
    const T = this.secs;
    const v = FERRY_SPEED;
    if (t <= 0) return 0;
    if (t >= T) return this.len;
    if (t < EASE_S) return (v * t * t) / (2 * EASE_S);
    if (t > T - EASE_S) return this.len - (v * (T - t) ** 2) / (2 * EASE_S);
    return (v * EASE_S) / 2 + v * (t - EASE_S);
  }

  point(s: number, out: { x: number; z: number }): void {
    const c = Math.min(this.len, Math.max(0, s));
    const ps = this.ps;
    let lo = 0;
    let hi = ps.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ps[mid] <= c) lo = mid;
      else hi = mid;
    }
    const seg = ps[hi] - ps[lo];
    const k = seg > 0 ? (c - ps[lo]) / seg : 0;
    out.x = this.px[lo] + (this.px[hi] - this.px[lo]) * k;
    out.z = this.pz[lo] + (this.pz[hi] - this.pz[lo]) * k;
  }

  /** Лодка через t с: на пути, нос — по ходу (по точкам ±0,75 м), у стоянок плавно сведён к их курсу */
  pose(t: number, out: FerryPose): FerryPose {
    const s = this.dist(t);
    this.point(s, out);
    this.point(s - 0.75, _a);
    this.point(s + 0.75, _b);
    const heading = Math.atan2(-(_b.x - _a.x), -(_b.z - _a.z));
    const k0 = Math.min(1, s / DOCK_BLEND_M);
    const k1 = Math.min(1, (this.len - s) / DOCK_BLEND_M);
    let yaw = heading;
    if (k1 < 1) yaw = this.yaw1 + wrap(heading - this.yaw1) * smooth(k1);
    else if (k0 < 1) yaw = this.yaw0 + wrap(heading - this.yaw0) * smooth(k0);
    out.yaw = yaw;
    return out;
  }
}

const _a = { x: 0, z: 0 };
const _b = { x: 0, z: 0 };

function wrap(a: number): number {
  return a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI;
}

function smooth(k: number): number {
  return k * k * (3 - 2 * k);
}

const OUT = new Path(OUT_POINTS, FERRY_HOME.yaw, FERRY_AWAY.yaw);
/** Назад подходит носом на север (yaw 0) — потом разворот на месте */
const BACK = new Path(BACK_POINTS, FERRY_AWAY.yaw, 0);

/** Сколько идёт рейс туда и обратно (с разворотом у мостков), тиков */
export const FERRY_OUT_TICKS = Math.ceil(OUT.secs * TICK_RATE);
export const FERRY_BACK_TICKS = Math.ceil((BACK.secs + PIVOT_S) * TICK_RATE);
/** Длины путей, м (для проверок) */
export const FERRY_OUT_LEN = OUT.len;
export const FERRY_BACK_LEN = BACK.len;

/** Разворот у мостков через t с после подхода: нос через восток с севера на юг, корма отходит от стенки и возвращается */
function pivotPose(t: number, out: FerryPose): FerryPose {
  const k = smooth(Math.min(1, Math.max(0, t / PIVOT_S)));
  const a = -Math.PI * k;
  // западный край корпуса при повороте a: половина ширины · |cos| + половина длины · |sin| — держим его у стенки
  const reach = FERRY_HALF_B * Math.abs(Math.cos(a)) + FERRY_HALF_L * Math.abs(Math.sin(a));
  out.x = FERRY_HOME.x + (reach - FERRY_HALF_B) + PIVOT_GAP * Math.sin(Math.PI * k);
  out.z = FERRY_HOME.z;
  out.yaw = a;
  return out;
}

/**
 * Где лодка в тик tick, если сейчас фаза ph с тиком at (FerryStatus): в рейсе — на пути по часам, иначе у стоянки.
 * В конце обратного рейса — разворот на месте; yaw тогда от 0 до −π (−π и π — один и тот же курс стоянки).
 */
export function ferryPose(ph: number, at: number, tick: number, out: FerryPose = { x: 0, z: 0, yaw: 0 }): FerryPose {
  if (ph === FE_OUT) return OUT.pose((tick - at) / TICK_RATE, out);
  if (ph === FE_BACK) {
    const t = (tick - at) / TICK_RATE;
    return t < BACK.secs ? BACK.pose(t, out) : pivotPose(t - BACK.secs, out);
  }
  const d = ph === FE_AWAY ? FERRY_AWAY : FERRY_HOME;
  out.x = d.x;
  out.z = d.z;
  out.yaw = d.yaw;
  return out;
}

/** Точка в осях лодки (x — к правому борту, z — к корме) в мире, если лодка стоит в pose */
export function ferryLocal(pose: FerryPose, lx: number, lz: number, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
  const c = Math.cos(pose.yaw);
  const s = Math.sin(pose.yaw);
  out.x = pose.x + lx * c + lz * s;
  out.z = pose.z - lx * s + lz * c;
  return out;
}

/** Место пассажира seat в мире: x, z (смотрит — по носу, pose.yaw) */
export function ferrySeat(pose: FerryPose, seat: number, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
  const [lx, lz] = FERRY_SEAT_AT[seat];
  return ferryLocal(pose, lx, lz, out);
}

/** Через сколько тиков лодка будет у стоянки (0 — уже там): у баркаса (away) или у Семёна */
export function ferryEta(ph: number, at: number, tick: number, away: boolean): number {
  if (away) {
    if (ph === FE_AWAY) return 0;
    if (ph === FE_OUT) return Math.max(0, at + FERRY_OUT_TICKS - tick);
    const toHome = ph === FE_BACK ? Math.max(0, at + FERRY_BACK_TICKS - tick) : 0;
    const wait = ph === FE_BOARD ? Math.max(0, at - tick) : ph === FE_HOME ? FERRY_CALL_TICKS : FERRY_CALL_TICKS;
    return toHome + wait + FERRY_OUT_TICKS;
  }
  if (ph === FE_HOME || ph === FE_BOARD) return 0;
  if (ph === FE_BACK) return Math.max(0, at + FERRY_BACK_TICKS - tick);
  const wait = ph === FE_AWAY ? Math.max(0, at - tick) : Math.max(0, at + FERRY_OUT_TICKS - tick) + FERRY_WAIT_TICKS;
  return wait + FERRY_BACK_TICKS;
}

/**
 * Твёрдое лодки у стоянки (в осях лодки: x0, x1, z0, z1, низ и верх над полом): пол, банка-палуба на носу, борта,
 * транец, будка мотора, Гоша. На ходу боксы убраны; стоит — включены только у той стоянки, где она.
 */
const LOCAL_BOXES: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [-1.0, 1.0, -1.7, 2.35, -0.75, 0],
  [-0.9, 0.9, -2.45, -1.7, -0.75, 0.4],
  [-1.1, -0.95, -1.9, 2.5, 0, 0.45],
  [0.95, 1.1, -1.9, 2.5, 0, 0.45],
  [-0.95, 0.95, 2.35, 2.5, 0, 0.45],
  [-0.32, 0.32, 1.45, 2.05, 0, 0.55],
  [FERRY_GOSHA[0] - 0.24, FERRY_GOSHA[0] + 0.24, FERRY_GOSHA[1] - 0.17, FERRY_GOSHA[1] + 0.2, 0, 1.25],
];

/** Боксы лодки у стоянки dock (мировые min/max) */
export function ferryBoxes(dock: FerryPose): Array<{ min: Vec3; max: Vec3 }> {
  const a = { x: 0, z: 0 };
  const b = { x: 0, z: 0 };
  return LOCAL_BOXES.map(([x0, x1, z0, z1, y0, y1]) => {
    ferryLocal(dock, x0, z0, a);
    ferryLocal(dock, x1, z1, b);
    return {
      min: [Math.min(a.x, b.x), FERRY_FLOOR_Y + y0, Math.min(a.z, b.z)] as Vec3,
      max: [Math.max(a.x, b.x), FERRY_FLOOR_Y + y1, Math.max(a.z, b.z)] as Vec3,
    };
  });
}

/**
 * Внутри лодки у стоянки (кто стоял там без места — при отходе его ставят на причал или палубу). Ниже настила: на
 * мостках и палубе (y = 0) у самого борта лодки — не в лодке.
 */
export function inFerry(dock: FerryPose, x: number, z: number, y: number): boolean {
  const dx = x - dock.x;
  const dz = z - dock.z;
  const c = Math.cos(dock.yaw);
  const s = Math.sin(dock.yaw);
  // обратно в оси лодки
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) < FERRY_HALF_B + 0.2 && Math.abs(lz) < FERRY_HALF_L + 0.2 && y < FERRY_FLOOR_Y + 0.7;
}
