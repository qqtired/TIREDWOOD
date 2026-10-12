// Навигация зомби «Крепости»: сетка 0,5 м по всей карте, клетки «можно стоять» (земля без препятствий с запасом
// на радиус шаркуна) и поля расстояний (Дейкстра по 8 соседям) — до кристалла и до каждой точки липучек. Считаются
// один раз при запуске. Ворота в полях — проход: пока створки целы, зомби встают перед ними (это решает horde.ts).
// Здесь же препятствия у земли — прямоугольники, из которых зомби выталкиваются (скользят вдоль стен).
import { CLIMBS, PEDESTAL, type FortMap } from '../../shared/fortmap.ts';

export const NAV_CELL = 0.5;
/** Запас на радиус: центр зомби в свободной клетке не ближе этого к препятствию */
const NAV_R = 0.45;
/** Препятствие у земли — бокс, который начинается ниже этой высоты (и выше земли) */
const LOW = 1.2;
/** Недостижимо */
export const NAV_FAR = 1e9;

const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

class MinHeap {
  private keys = new Float64Array(4096);
  private vals = new Int32Array(4096);
  size = 0;

  push(key: number, val: number): void {
    if (this.size >= this.keys.length) {
      const k = new Float64Array(this.keys.length * 2);
      const v = new Int32Array(this.vals.length * 2);
      k.set(this.keys);
      v.set(this.vals);
      this.keys = k;
      this.vals = v;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.keys[i] = this.keys[p];
      this.vals[i] = this.vals[p];
      i = p;
    }
    this.keys[i] = key;
    this.vals[i] = val;
  }

  /** Достаёт наименьший: значение, ключ — в topKey */
  pop(): number {
    const top = this.vals[0];
    this.topKey = this.keys[0];
    const lastK = this.keys[--this.size];
    const lastV = this.vals[this.size];
    let i = 0;
    for (;;) {
      let c = i * 2 + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++;
      if (this.keys[c] >= lastK) break;
      this.keys[i] = this.keys[c];
      this.vals[i] = this.vals[c];
      i = c;
    }
    this.keys[i] = lastK;
    this.vals[i] = lastV;
    return top;
  }

  topKey = 0;
}

export class FortNav {
  readonly x0: number;
  readonly z0: number;
  readonly cols: number;
  readonly rows: number;
  /** 1 — центр зомби может тут стоять */
  readonly free: Uint8Array;
  /** Расстояние по клеткам до кристалла (до свободных клеток вокруг постамента), м */
  readonly toCrystal: Float32Array;
  /** До каждой точки липучек (CLIMBS) */
  readonly toClimb: Float32Array[];
  /** Препятствия у земли: x0, z0, x1, z1 подряд */
  readonly rects: Float64Array;
  readonly rectCount: number;
  /** Номер прямоугольника створок ворот (пали — его нет) */
  readonly gateRect: number;

  constructor(map: FortMap) {
    const { minX, maxX, minZ, maxZ } = map.bounds;
    this.x0 = minX;
    this.z0 = minZ;
    this.cols = Math.ceil((maxX - minX) / NAV_CELL);
    this.rows = Math.ceil((maxZ - minZ) / NAV_CELL);
    const rects: number[] = [];
    let gateRect = -1;
    map.boxes.forEach((b, i) => {
      if (b.max[1] <= 0.05 || b.min[1] >= LOW) return;
      if (i === map.gateBox) gateRect = rects.length / 4;
      rects.push(b.min[0], b.min[2], b.max[0], b.max[2]);
    });
    this.rects = Float64Array.from(rects);
    this.rectCount = rects.length / 4;
    this.gateRect = gateRect;

    const n = this.cols * this.rows;
    this.free = new Uint8Array(n);
    for (let r = 0; r < this.rows; r++) {
      const cz = this.z0 + (r + 0.5) * NAV_CELL;
      for (let c = 0; c < this.cols; c++) {
        const cx = this.x0 + (c + 0.5) * NAV_CELL;
        let ok = 1;
        for (let k = 0; k < this.rectCount; k++) {
          if (k === gateRect) continue;
          const o = k * 4;
          if (cx > this.rects[o] - NAV_R && cx < this.rects[o + 2] + NAV_R && cz > this.rects[o + 1] - NAV_R && cz < this.rects[o + 3] + NAV_R) {
            ok = 0;
            break;
          }
        }
        this.free[r * this.cols + c] = ok;
      }
    }

    const D = PEDESTAL;
    this.toCrystal = this.field((x, z) => rectDist(x, z, D.x0, D.z0, D.x1, D.z1) < 1.3);
    this.toClimb = CLIMBS.map((c) => {
      const px = c.x + c.nx * 0.9;
      const pz = c.z + c.nz * 0.9;
      return this.field((x, z) => Math.hypot(x - px, z - pz) < 0.8);
    });
  }

  /** Номер клетки точки (−1 — за картой) */
  cell(x: number, z: number): number {
    const c = Math.floor((x - this.x0) / NAV_CELL);
    const r = Math.floor((z - this.z0) / NAV_CELL);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  isFree(x: number, z: number): boolean {
    const i = this.cell(x, z);
    return i >= 0 && this.free[i] === 1;
  }

  /** Поле расстояний от свободных клеток, где source(x, z) — правда (считаем в float64: ключи кучи — тоже) */
  private field(source: (x: number, z: number) => boolean): Float32Array {
    const n = this.cols * this.rows;
    const d = new Float64Array(n).fill(NAV_FAR);
    const heap = new MinHeap();
    for (let i = 0; i < n; i++) {
      if (!this.free[i]) continue;
      const x = this.x0 + ((i % this.cols) + 0.5) * NAV_CELL;
      const z = this.z0 + (Math.floor(i / this.cols) + 0.5) * NAV_CELL;
      if (!source(x, z)) continue;
      d[i] = 0;
      heap.push(0, i);
    }
    const cols = this.cols;
    while (heap.size > 0) {
      const i = heap.pop();
      const di = heap.topKey;
      if (di > d[i]) continue;
      const c = i % cols;
      const r = (i - c) / cols;
      for (const [dc, dr, w] of DIRS) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= this.rows) continue;
        const j = nr * cols + nc;
        if (!this.free[j]) continue;
        // по диагонали — только если оба угловых соседа свободны (не срезать углы стен)
        if (dc !== 0 && dr !== 0 && (!this.free[r * cols + nc] || !this.free[nr * cols + c])) continue;
        const nd = di + w * NAV_CELL;
        if (nd < d[j]) {
          d[j] = nd;
          heap.push(nd, j);
        }
      }
    }
    return Float32Array.from(d);
  }

  /** Расстояние по полю из точки; в занятой клетке — по лучшей соседней (через неё) */
  dist(f: Float32Array, x: number, z: number): number {
    const i = this.cell(x, z);
    if (i < 0) return NAV_FAR;
    if (f[i] < NAV_FAR) return f[i];
    const j = this.bestNear(f, i);
    return j < 0 ? NAV_FAR : f[j] + NAV_CELL * 1.5;
  }

  /** Лучшая (ближе к цели) клетка в квадрате 5 × 5 вокруг i; −1 — нет */
  private bestNear(f: Float32Array, i: number): number {
    const cols = this.cols;
    const c = i % cols;
    const r = (i - c) / cols;
    let best = -1;
    let bd = NAV_FAR;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= this.rows) continue;
        const j = nr * cols + nc;
        const v = f[j] + Math.hypot(dc, dr) * NAV_CELL;
        if (f[j] < NAV_FAR && v < bd) {
          bd = v;
          best = j;
        }
      }
    }
    return best;
  }

  /**
   * Куда идти по полю из (x, z): единичный вектор в out; (0, 0) — пришли или некуда. Направление — «уклон» поля
   * по соседям (плавнее, чем к одной лучшей клетке); в занятой клетке — к лучшей свободной рядом.
   */
  flow(f: Float32Array, x: number, z: number, out: { x: number; z: number }): void {
    out.x = 0;
    out.z = 0;
    const i = this.cell(x, z);
    if (i < 0) return;
    const cols = this.cols;
    const d0 = f[i];
    if (d0 >= NAV_FAR) {
      const j = this.bestNear(f, i);
      if (j < 0) return;
      const tx = this.x0 + ((j % cols) + 0.5) * NAV_CELL;
      const tz = this.z0 + (Math.floor(j / cols) + 0.5) * NAV_CELL;
      const l = Math.hypot(tx - x, tz - z);
      if (l > 1e-6) {
        out.x = (tx - x) / l;
        out.z = (tz - z) / l;
      }
      return;
    }
    if (d0 === 0) return;
    const c = i % cols;
    const r = (i - c) / cols;
    let gx = 0;
    let gz = 0;
    let best = -1;
    let bestDrop = 0;
    for (let k = 0; k < 8; k++) {
      const [dc, dr, w] = DIRS[k];
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= this.rows) continue;
      const dn = f[nr * cols + nc];
      if (dn >= d0) continue;
      const drop = (d0 - dn) / (w * NAV_CELL);
      gx += (dc / w) * drop;
      gz += (dr / w) * drop;
      if (drop > bestDrop) {
        bestDrop = drop;
        best = k;
      }
    }
    let l = Math.hypot(gx, gz);
    if (l < 1e-6) {
      if (best < 0) return;
      gx = DIRS[best][0];
      gz = DIRS[best][1];
      l = Math.hypot(gx, gz);
    }
    out.x = gx / l;
    out.z = gz / l;
  }

  /** Вытолкнуть круг из препятствий (дважды — для углов). gateUp — створки стоят. */
  collide(p: { x: number; z: number }, r: number, gateUp: boolean): void {
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < this.rectCount; k++) {
        if (k === this.gateRect && !gateUp) continue;
        const o = k * 4;
        const x0 = this.rects[o];
        const z0 = this.rects[o + 1];
        const x1 = this.rects[o + 2];
        const z1 = this.rects[o + 3];
        if (p.x < x0 - r || p.x > x1 + r || p.z < z0 - r || p.z > z1 + r) continue;
        const cx = p.x < x0 ? x0 : p.x > x1 ? x1 : p.x;
        const cz = p.z < z0 ? z0 : p.z > z1 ? z1 : p.z;
        const dx = p.x - cx;
        const dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-12) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * r;
          p.z = cz + (dz / d) * r;
          continue;
        }
        // центр внутри прямоугольника — наружу по кратчайшей оси
        const l = p.x - x0;
        const rr = x1 - p.x;
        const t = p.z - z0;
        const b = z1 - p.z;
        const m = Math.min(l, rr, t, b);
        if (m === l) p.x = x0 - r;
        else if (m === rr) p.x = x1 + r;
        else if (m === t) p.z = z0 - r;
        else p.z = z1 + r;
      }
    }
  }
}

/** Расстояние от точки до прямоугольника по земле (0 — внутри) */
export function rectDist(x: number, z: number, x0: number, z0: number, x1: number, z1: number): number {
  const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
  const dz = z < z0 ? z0 - z : z > z1 ? z - z1 : 0;
  return Math.hypot(dx, dz);
}
