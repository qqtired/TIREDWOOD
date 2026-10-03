import type { GameMap } from '../../shared/maps/types.ts';
/** Fixed 0.75m passability grid. East/central plaza only: routes cannot enter the memorial/pier/café. */
export class PirateNav {
  readonly cell = .75; readonly x0 = -6; readonly z0 = -4; readonly cols = 40; readonly rows = 34;
  readonly free = new Uint8Array(this.cols * this.rows);
  private readonly cache = new Map<number, Int16Array>();
  constructor(map: GameMap) {
    for (let j = 0; j < this.rows; j++) for (let i = 0; i < this.cols; i++) {
      const x = this.x0 + (i + .5) * this.cell, z = this.z0 + (j + .5) * this.cell;
      const blocked = map.boxes.some(b => b.min[1] < 1.6 && b.max[1] > .3 && x + .5 > b.min[0] && x - .5 < b.max[0] && z + .5 > b.min[2] && z - .5 < b.max[2]);
      this.free[j * this.cols + i] = blocked ? 0 : 1;
    }
  }
  private index(x: number, z: number): number {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    return i < 0 || j < 0 || i >= this.cols || j >= this.rows ? -1 : j * this.cols + i;
  }
  isFree(x: number, z: number): boolean { const k = this.index(x, z); return k >= 0 && !!this.free[k]; }
  nearest(x: number, z: number): { x: number; z: number } {
    let best = -1, d = Infinity;
    for (let k = 0; k < this.free.length; k++) if (this.free[k]) {
      const px = this.x0 + (k % this.cols + .5) * this.cell, pz = this.z0 + (Math.floor(k / this.cols) + .5) * this.cell;
      const dd = (px - x) ** 2 + (pz - z) ** 2;
      if (dd < d) { d = dd; best = k; }
    }
    return { x: this.x0 + (best % this.cols + .5) * this.cell, z: this.z0 + (Math.floor(best / this.cols) + .5) * this.cell };
  }
  private field(x: number, z: number): Int16Array {
    const nearest = this.isFree(x, z) ? { x, z } : this.nearest(x, z), key = this.index(nearest.x, nearest.z);
    let dist = this.cache.get(key); if (dist) return dist;
    dist = new Int16Array(this.free.length).fill(32767); dist[key] = 0;
    const queue = new Int16Array(this.free.length); queue[0] = key; let read = 0, write = 1;
    while (read < write) { const k = queue[read++];
      for (const to of [k - 1, k + 1, k - this.cols, k + this.cols]) {
        if (to < 0 || to >= dist.length || Math.abs(to % this.cols - k % this.cols) > 1 || !this.free[to] || dist[to] !== 32767) continue;
        dist[to] = dist[k] + 1; queue[write++] = to;
      }
    }
    if (this.cache.size >= 4) this.cache.delete(this.cache.keys().next().value!); this.cache.set(key, dist); return dist;
  }
  next(x: number, z: number, tx: number, tz: number): { x: number; z: number } {
    const dist = this.field(tx, tz), k = this.index(x, z); if (k < 0) return this.nearest(x, z);
    let best = k;
    for (const to of [k - 1, k + 1, k - this.cols, k + this.cols]) if (to >= 0 && to < dist.length && Math.abs(to % this.cols - k % this.cols) <= 1 && dist[to] < dist[best]) best = to;
    if (dist[k] === 0) return this.isFree(tx, tz) ? { x: tx, z: tz } : this.nearest(tx, tz);
    return { x: this.x0 + (best % this.cols + .5) * this.cell, z: this.z0 + (Math.floor(best / this.cols) + .5) * this.cell };
  }
}
