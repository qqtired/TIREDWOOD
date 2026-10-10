// «Подземелье»: карта-тор 240 м. Препятствия — круги и капсулы из level-data, провалы/мелководье/варенье — hazards.
// Неподвижное разложено один раз по корзинам 4 × 4 м (60 × 60, индексы по модулю): точка смотрит только свою корзину,
// потому что каждое препятствие положено во все корзины своей рамки с запасом на радиус самого толстого тела.
import { LV, type Shape } from './data.ts';
import { L, wrapD } from './util.ts';

export const CELL = 4;
export const CELLS = L / CELL; // 60
/** Запас рамки препятствия: самый большой радиус тела, которое с ним сталкивается (элита 1,2) */
const MARGIN = 1.3;

// Формы: 0 — круг, 1 — капсула (центр + половина отрезка)
const F_CIRCLE = 0;
const F_CAPSULE = 1;
/** Вид формы для столкновений: 1 — твёрдое, 2 — провал (озеро), 4 — мелководье, 8 — варенье */
export const T_SOLID = 1;
export const T_PIT = 2;
export const T_WATER = 4;
export const T_JAM = 8;

interface Packed {
  n: number;
  form: Uint8Array;
  kind: Uint8Array;
  cx: Float64Array;
  cz: Float64Array;
  hx: Float64Array;
  hz: Float64Array;
  hh: Float64Array; // |h|²
  r: Float64Array;
  /** корзины: начало списка в items для корзины c — start[c] … start[c+1] */
  start: Int32Array;
  items: Int32Array;
}

function kindOf(s: Shape, hazard: boolean): number {
  if (!hazard) return T_SOLID;
  if (s.kind === 'pit') return T_PIT;
  if (s.kind === 'water') return T_WATER;
  if (s.kind === 'jam') return T_JAM;
  return 0;
}

function cellIdx(v: number): number {
  const c = Math.floor(v / CELL) % CELLS;
  return c < 0 ? c + CELLS : c;
}

function pack(list: { s: Shape; kind: number }[]): Packed {
  const n = list.length;
  const p: Packed = {
    n,
    form: new Uint8Array(n),
    kind: new Uint8Array(n),
    cx: new Float64Array(n),
    cz: new Float64Array(n),
    hx: new Float64Array(n),
    hz: new Float64Array(n),
    hh: new Float64Array(n),
    r: new Float64Array(n),
    start: new Int32Array(CELLS * CELLS + 1),
    items: new Int32Array(0),
  };
  const buckets: number[][] = [];
  for (let c = 0; c < CELLS * CELLS; c++) buckets.push([]);
  for (let i = 0; i < n; i++) {
    const { s, kind } = list[i];
    p.kind[i] = kind;
    p.r[i] = s.r;
    let ex: number, ez: number;
    if (s.t === 'c') {
      p.form[i] = F_CIRCLE;
      p.cx[i] = s.x;
      p.cz[i] = s.z;
      ex = ez = s.r;
    } else {
      p.form[i] = F_CAPSULE;
      const hx = (s.x1 - s.x0) / 2;
      const hz = (s.z1 - s.z0) / 2;
      p.cx[i] = s.x0 + hx;
      p.cz[i] = s.z0 + hz;
      p.hx[i] = hx;
      p.hz[i] = hz;
      p.hh[i] = hx * hx + hz * hz;
      ex = Math.abs(hx) + s.r;
      ez = Math.abs(hz) + s.r;
    }
    ex += MARGIN;
    ez += MARGIN;
    const x0 = Math.floor((p.cx[i] - ex) / CELL);
    const x1 = Math.floor((p.cx[i] + ex) / CELL);
    const z0 = Math.floor((p.cz[i] - ez) / CELL);
    const z1 = Math.floor((p.cz[i] + ez) / CELL);
    for (let gz = z0; gz <= z1; gz++) {
      const rz = ((gz % CELLS) + CELLS) % CELLS;
      for (let gx = x0; gx <= x1; gx++) {
        const rx = ((gx % CELLS) + CELLS) % CELLS;
        const b = buckets[rz * CELLS + rx];
        if (b[b.length - 1] !== i) b.push(i);
      }
    }
  }
  let total = 0;
  for (const b of buckets) total += b.length;
  p.items = new Int32Array(total);
  let k = 0;
  for (let c = 0; c < CELLS * CELLS; c++) {
    p.start[c] = k;
    for (const i of buckets[c]) p.items[k++] = i;
  }
  p.start[CELLS * CELLS] = k;
  return p;
}

let SOLIDS: Packed | null = null;
let HAZ: Packed | null = null;

/**
 * Лестница наверх у Светового колодца: клиент рисует модель well_stairs в центре колодца (лестница уходит на запад,
 * −X, от края мозаики Ø 10 м: 10 ступеней 5,5 м, площадка 2,6 м, парапеты ±2,1 м, тумбы с фонарями и скалы по бокам —
 * tools/survivors/blender/kit_cellars.py). Капсула «stairs» из level-data стоит западнее модели — заменяем её следом модели.
 */
export function stairsShapes(wx: number, wz: number): Shape[] {
  const c = (dx: number, dz: number, r: number): Shape => ({ t: 'c', x: wx + dx, z: wz + dz, r, kind: 'stairs' });
  const s = (x0: number, z0: number, x1: number, z1: number, r: number): Shape =>
    ({ t: 's', x0: wx + x0, z0: wz + z0, x1: wx + x1, z1: wz + z1, r, kind: 'stairs' });
  return [
    // марши с парапетами: три полосы по ширине 4,6 м, от −5,75 до −15,15 м
    s(-6.6, -1.45, -14.3, -1.45, 0.85),
    s(-6.6, 0, -14.3, 0, 0.85),
    s(-6.6, 1.45, -14.3, 1.45, 0.85),
    // тумбы с фонарями у подножия
    c(-5.35, -2.1, 0.45),
    c(-5.35, 2.1, 0.45),
    // скалы, в которые уходит лестница
    s(-14.3, -2.6, -14.3, 2.6, 1.3),
    c(-12, -3.4, 1.5),
    c(-12, 3.4, 1.5),
    c(-9.1, -2.9, 1.1),
    c(-9.1, 2.9, 1.1),
  ];
}

function solids(): Packed {
  if (!SOLIDS) {
    const well = LV.landmarks?.find((l) => l.id === 'well') ?? LV.map.heroSpawn;
    const list = LV.obstacles.filter((s) => s.kind !== 'stairs').concat(stairsShapes(well.x, well.z));
    SOLIDS = pack(list.map((s) => ({ s, kind: T_SOLID })));
  }
  return SOLIDS;
}
function hazards(): Packed {
  if (!HAZ) HAZ = pack(LV.hazards.map((s) => ({ s, kind: kindOf(s, true) })).filter((e) => e.kind !== 0));
  return HAZ;
}

// результат расстояния до формы (без аллокаций)
let dX = 0;
let dZ = 0;
/** Расстояние от точки до оси формы i (по тору); вектор от оси к точке — в dX/dZ */
function axisDist(p: Packed, i: number, x: number, z: number): number {
  let rx = wrapD(x - p.cx[i]);
  let rz = wrapD(z - p.cz[i]);
  if (p.form[i] === F_CAPSULE) {
    let t = (rx * p.hx[i] + rz * p.hz[i]) / p.hh[i];
    t = t < -1 ? -1 : t > 1 ? 1 : t;
    rx -= p.hx[i] * t;
    rz -= p.hz[i] * t;
  }
  dX = rx;
  dZ = rz;
  return Math.sqrt(rx * rx + rz * rz);
}

/** Результат столкновения: новая точка и что задели */
export const hitOut = { x: 0, z: 0, hit: 0 };

/**
 * Вытолкнуть тело (x, z, r) из твёрдого (и провалов, если mask включает T_PIT). Пишет в hitOut, hit — маска задетого.
 * Координаты результата не сворачивает (это делает вызывающий).
 */
export function collide(x: number, z: number, r: number, mask: number): typeof hitOut {
  let hit = 0;
  if (mask & T_SOLID) {
    const p = solids();
    const c = cellIdx(z) * CELLS + cellIdx(x);
    for (let k = p.start[c], e = p.start[c + 1]; k < e; k++) {
      const i = p.items[k];
      const d = axisDist(p, i, x, z);
      const need = p.r[i] + r;
      if (d < need) {
        if (d > 1e-6) {
          const s = (need - d) / d;
          x += dX * s;
          z += dZ * s;
        } else x += need;
        hit |= T_SOLID;
      }
    }
  }
  if (mask & T_PIT) {
    const p = hazards();
    const c = cellIdx(z) * CELLS + cellIdx(x);
    for (let k = p.start[c], e = p.start[c + 1]; k < e; k++) {
      const i = p.items[k];
      if (p.kind[i] !== T_PIT) continue;
      const d = axisDist(p, i, x, z);
      const need = p.r[i] + r;
      if (d < need) {
        if (d > 1e-6) {
          const s = (need - d) / d;
          x += dX * s;
          z += dZ * s;
        } else x += need;
        hit |= T_PIT;
      }
    }
  }
  hitOut.x = x;
  hitOut.z = z;
  hitOut.hit = hit;
  return hitOut;
}

/** Что под точкой: маска T_PIT | T_WATER | T_JAM (центр внутри формы) */
export function terrainAt(x: number, z: number): number {
  const p = hazards();
  const c = cellIdx(z) * CELLS + cellIdx(x);
  let m = 0;
  for (let k = p.start[c], e = p.start[c + 1]; k < e; k++) {
    const i = p.items[k];
    if (axisDist(p, i, x, z) < p.r[i]) m |= p.kind[i];
  }
  return m;
}

/** Занято ли место телом радиуса r: твёрдое или провал */
export function blocked(x: number, z: number, r: number): boolean {
  const s = solids();
  const c = cellIdx(z) * CELLS + cellIdx(x);
  for (let k = s.start[c], e = s.start[c + 1]; k < e; k++) {
    const i = s.items[k];
    if (axisDist(s, i, x, z) < s.r[i] + r) return true;
  }
  const h = hazards();
  for (let k = h.start[c], e = h.start[c + 1]; k < e; k++) {
    const i = h.items[k];
    if (h.kind[i] === T_PIT && axisDist(h, i, x, z) < h.r[i] + r) return true;
  }
  return false;
}

/** Внутри провала (центр) */
export function inPit(x: number, z: number): boolean {
  return (terrainAt(x, z) & T_PIT) !== 0;
}

/** Номер корзины 4 м для точки (для сетки врагов) */
export function cellOf(x: number, z: number): number {
  return cellIdx(z) * CELLS + cellIdx(x);
}
export { cellIdx };
