// Мир столкновений: массивы границ боксов + лучи (для выстрелов, камеры, ботов).
import type { GameMap } from './maps/types.ts';

export interface RayHit {
  t: number;
  box: number;
  /** Нормаль грани, в которую попали (одна ось = ±1) */
  nx: number;
  ny: number;
  nz: number;
}

export function makeRayHit(): RayHit {
  return { t: 0, box: -1, nx: 0, ny: 0, nz: 0 };
}

export class CollisionWorld {
  readonly n: number;
  readonly minX: Float64Array;
  readonly minY: Float64Array;
  readonly minZ: Float64Array;
  readonly maxX: Float64Array;
  readonly maxY: Float64Array;
  readonly maxZ: Float64Array;
  /** 1 — батут */
  readonly tramp: Uint8Array;
  /** 1 — невидимая коллизия (краска на ней не рисуется) */
  readonly invisible: Uint8Array;
  /** 1 — пули пролетают насквозь (стены в море) */
  readonly shootThrough: Uint8Array;
  /** Индекс бокса, остановившего последний sweep (-1 — ничего) */
  lastHit = -1;
  /** Убранные боксы (катер ушёл в поездку): их настоящие границы */
  private readonly away = new Map<number, [number, number, number, number, number, number]>();

  constructor(map: GameMap) {
    const boxes = map.boxes;
    const n = boxes.length;
    this.n = n;
    this.minX = new Float64Array(n);
    this.minY = new Float64Array(n);
    this.minZ = new Float64Array(n);
    this.maxX = new Float64Array(n);
    this.maxY = new Float64Array(n);
    this.maxZ = new Float64Array(n);
    this.tramp = new Uint8Array(n);
    this.invisible = new Uint8Array(n);
    this.shootThrough = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const b = boxes[i];
      this.minX[i] = b.min[0];
      this.minY[i] = b.min[1];
      this.minZ[i] = b.min[2];
      this.maxX[i] = b.max[0];
      this.maxY[i] = b.max[1];
      this.maxZ[i] = b.max[2];
      this.tramp[i] = b.tramp ? 1 : 0;
      this.invisible[i] = b.mat === 'invisible' ? 1 : 0;
      // Большие невидимые стены в море не должны ловить пули
      const big = b.max[1] - b.min[1] > 20;
      this.shootThrough[i] = b.mat === 'invisible' && big ? 1 : 0;
    }
  }

  /**
   * Убрать бокс из мира или вернуть на место (катер «Ласточка» уходит от причала). Убранный бокс сжимается в точку
   * далеко за картой — горячие циклы физики и лучей о нём не знают и не тратят лишних проверок.
   */
  setEnabled(i: number, on: boolean): void {
    const saved = this.away.get(i);
    if (on) {
      if (!saved) return;
      this.away.delete(i);
      [this.minX[i], this.minY[i], this.minZ[i], this.maxX[i], this.maxY[i], this.maxZ[i]] = saved;
      return;
    }
    if (saved) return;
    this.away.set(i, [this.minX[i], this.minY[i], this.minZ[i], this.maxX[i], this.maxY[i], this.maxZ[i]]);
    this.minX[i] = this.maxX[i] = this.minZ[i] = this.maxZ[i] = 1e6;
    this.minY[i] = this.maxY[i] = -1e6;
  }

  /** Пересекает ли AABB хоть один бокс (с допуском). */
  overlaps(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
    const e = 1e-6;
    for (let i = 0; i < this.n; i++) {
      if (x0 < this.maxX[i] - e && x1 > this.minX[i] + e && y0 < this.maxY[i] - e && y1 > this.minY[i] + e && z0 < this.maxZ[i] - e && z1 > this.minZ[i] + e) {
        return true;
      }
    }
    return false;
  }

  /** Самая высокая опора под точкой не выше y (для теней и ботов). -Infinity — вода. */
  groundBelow(x: number, y: number, z: number): number {
    let best = -Infinity;
    for (let i = 0; i < this.n; i++) {
      if (this.shootThrough[i]) continue;
      if (x < this.minX[i] || x > this.maxX[i] || z < this.minZ[i] || z > this.maxZ[i]) continue;
      const top = this.maxY[i];
      if (top <= y + 1e-3 && top > best) best = top;
    }
    return best;
  }

  /**
   * Луч по боксам. dir не обязан быть нормирован (t — в его длинах).
   * forShots: пропускать «прострельные» боксы; skipInvisible: пропускать все невидимые (камера
   * не должна дёргаться о столбы фонарей и кнехты).
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, hit: RayHit, forShots: boolean, skipInvisible = false): boolean {
    const ix = dx !== 0 ? 1 / dx : Infinity;
    const iy = dy !== 0 ? 1 / dy : Infinity;
    const iz = dz !== 0 ? 1 / dz : Infinity;
    let best = maxT;
    let found = -1;
    let axis = 0;
    for (let i = 0; i < this.n; i++) {
      if (forShots && this.shootThrough[i]) continue;
      if (skipInvisible && this.invisible[i]) continue;
      let tmin: number;
      let tmax: number;
      let a = 0;
      // X
      if (dx !== 0) {
        const t1 = (this.minX[i] - ox) * ix;
        const t2 = (this.maxX[i] - ox) * ix;
        tmin = t1 < t2 ? t1 : t2;
        tmax = t1 < t2 ? t2 : t1;
      } else {
        if (ox <= this.minX[i] || ox >= this.maxX[i]) continue;
        tmin = -Infinity;
        tmax = Infinity;
      }
      // Y
      if (dy !== 0) {
        const t1 = (this.minY[i] - oy) * iy;
        const t2 = (this.maxY[i] - oy) * iy;
        const near = t1 < t2 ? t1 : t2;
        const far = t1 < t2 ? t2 : t1;
        if (near > tmin) {
          tmin = near;
          a = 1;
        }
        if (far < tmax) tmax = far;
      } else if (oy <= this.minY[i] || oy >= this.maxY[i]) continue;
      if (tmin > tmax) continue;
      // Z
      if (dz !== 0) {
        const t1 = (this.minZ[i] - oz) * iz;
        const t2 = (this.maxZ[i] - oz) * iz;
        const near = t1 < t2 ? t1 : t2;
        const far = t1 < t2 ? t2 : t1;
        if (near > tmin) {
          tmin = near;
          a = 2;
        }
        if (far < tmax) tmax = far;
      } else if (oz <= this.minZ[i] || oz >= this.maxZ[i]) continue;
      if (tmin > tmax || tmax < 0) continue;
      // Начало луча внутри бокса — такой бокс игнорируем (иначе застрявший игрок не сможет стрелять)
      if (tmin < 0) continue;
      if (tmin < best) {
        best = tmin;
        found = i;
        axis = a;
      }
    }
    if (found < 0) return false;
    hit.t = best;
    hit.box = found;
    hit.nx = 0;
    hit.ny = 0;
    hit.nz = 0;
    if (axis === 0) hit.nx = dx > 0 ? -1 : 1;
    else if (axis === 1) hit.ny = dy > 0 ? -1 : 1;
    else hit.nz = dz > 0 ? -1 : 1;
    return true;
  }
}

/**
 * Луч против эллипсоида (центр c, полуоси rx, ry, rx). Возвращает t или -1.
 * Если начало луча внутри — 0.
 */
export function rayEllipsoid(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, rx: number, ry: number): number {
  const px = (ox - cx) / rx;
  const py = (oy - cy) / ry;
  const pz = (oz - cz) / rx;
  const qx = dx / rx;
  const qy = dy / ry;
  const qz = dz / rx;
  const a = qx * qx + qy * qy + qz * qz;
  const b = 2 * (px * qx + py * qy + pz * qz);
  const c = px * px + py * py + pz * pz - 1;
  if (c <= 0) return 0;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 ? t : -1;
}
