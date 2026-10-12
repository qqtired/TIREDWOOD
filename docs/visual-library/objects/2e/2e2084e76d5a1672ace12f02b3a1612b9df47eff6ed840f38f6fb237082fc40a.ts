import type { GameMap } from '../../shared/maps/types.ts';
import { PIRATE_BENCHES, PIRATE_CANNONS, PIRATE_ZONE } from '../../shared/pirates.ts';

/**
 * Сетка проходимости рабочей полосы пиратов (южная часть площади у кромки набережной): клетка 0,5 м. Закрыто всё, что
 * стоит на пути (боксы карты ниже 1,6 м и выше 0,3 м, скамейки, пушки). Идут не по клеткам, а «натянутой нитью»: до самой
 * дальней видимой точки пути, поэтому ходят ровно, без «лесенки». Поля расстояний до целей лежат в небольшом кэше.
 */
export class PirateNav {
  readonly cell = 0.5;
  readonly x0 = PIRATE_ZONE.x0;
  readonly z0 = PIRATE_ZONE.z0;
  readonly cols = Math.round((PIRATE_ZONE.x1 - PIRATE_ZONE.x0) / 0.5);
  readonly rows = Math.round((PIRATE_ZONE.z1 - PIRATE_ZONE.z0) / 0.5);
  readonly free = new Uint8Array(this.cols * this.rows);
  private readonly cache = new Map<number, Int16Array>();
  private readonly queue: Int32Array;

  constructor(map: GameMap) {
    this.queue = new Int32Array(this.free.length);
    const pad = 0.45;
    for (let j = 0; j < this.rows; j++) for (let i = 0; i < this.cols; i++) {
      const x = this.x0 + (i + 0.5) * this.cell, z = this.z0 + (j + 0.5) * this.cell;
      let blocked = map.boxes.some(b => b.min[1] < 1.6 && b.max[1] > 0.3 && x + pad > b.min[0] && x - pad < b.max[0] && z + pad > b.min[2] && z - pad < b.max[2]);
      // скамейка 1,8 × 0,5 м и пушка 0,9 × 1,3 м: пираты обходят
      if (!blocked) blocked = PIRATE_BENCHES.some(b => Math.abs(x - b.x) < 0.9 + pad && Math.abs(z - b.z) < 0.25 + pad);
      if (!blocked) blocked = PIRATE_CANNONS.some(c => Math.abs(x - c.x) < 0.45 + pad && Math.abs(z - c.z) < 0.65 + pad);
      this.free[j * this.cols + i] = blocked ? 0 : 1;
    }
  }

  private index(x: number, z: number): number {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    return i < 0 || j < 0 || i >= this.cols || j >= this.rows ? -1 : j * this.cols + i;
  }
  private cx(k: number): number { return this.x0 + (k % this.cols + 0.5) * this.cell; }
  private cz(k: number): number { return this.z0 + (Math.floor(k / this.cols) + 0.5) * this.cell; }

  isFree(x: number, z: number): boolean { const k = this.index(x, z); return k >= 0 && !!this.free[k]; }

  /** Ближайшая свободная клетка к точке (центр клетки) */
  nearest(x: number, z: number): { x: number; z: number } {
    let best = -1, d = Infinity;
    for (let k = 0; k < this.free.length; k++) if (this.free[k]) {
      const dd = (this.cx(k) - x) ** 2 + (this.cz(k) - z) ** 2;
      if (dd < d) { d = dd; best = k; }
    }
    return best < 0 ? { x, z } : { x: this.cx(best), z: this.cz(best) };
  }

  /** Отрезок прямой между точками свободен (шаг проверки 0,25 м) */
  clear(x0: number, z0: number, x1: number, z1: number): boolean {
    const dx = x1 - x0, dz = z1 - z0, d = Math.hypot(dx, dz), n = Math.ceil(d / 0.25);
    for (let i = 1; i <= n; i++) if (!this.isFree(x0 + dx * i / n, z0 + dz * i / n)) return false;
    return true;
  }

  /** Поле шагов до цели: расстояние в клетках (восемь соседей, без среза углов); 32767 — не дойти */
  private field(tx: number, tz: number): Int16Array {
    let key = this.index(tx, tz);
    if (key < 0 || !this.free[key]) { const n = this.nearest(tx, tz); key = this.index(n.x, n.z); }
    let dist = this.cache.get(key);
    if (dist) return dist;
    dist = new Int16Array(this.free.length).fill(32767);
    dist[key] = 0;
    const q = this.queue;
    q[0] = key;
    let read = 0, write = 1;
    const cols = this.cols;
    while (read < write) {
      const k = q[read++], ci = k % cols, cj = (k - ci) / cols;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= cols || nj >= this.rows) continue;
        const to = nj * cols + ni;
        if (!this.free[to] || dist[to] !== 32767) continue;
        // по диагонали — только если оба соседних клетки свободны
        if (di && dj && (!this.free[cj * cols + ni] || !this.free[nj * cols + ci])) continue;
        dist[to] = dist[k] + 1;
        q[write++] = to;
      }
    }
    if (this.cache.size >= 40) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, dist);
    return dist;
  }

  /** Куда идти из (x, z) к цели: самая дальняя точка пути, видимая по прямой (или сама цель) */
  next(x: number, z: number, tx: number, tz: number, out: { x: number; z: number }): void {
    if (this.clear(x, z, tx, tz)) { out.x = tx; out.z = tz; return; }
    const dist = this.field(tx, tz);
    let k = this.index(x, z);
    if (k < 0 || !this.free[k]) { const n = this.nearest(x, z); k = this.index(n.x, n.z); }
    let best = k, cur = k;
    const cols = this.cols;
    for (let step = 0; step < 40 && dist[cur] > 0; step++) {
      const ci = cur % cols, cj = (cur - ci) / cols;
      let nb = cur;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= cols || nj >= this.rows) continue;
        const to = nj * cols + ni;
        if (dist[to] < dist[nb]) nb = to;
      }
      if (nb === cur) break;
      cur = nb;
      if (this.clear(x, z, this.cx(cur), this.cz(cur))) best = cur;
    }
    if (dist[k] === 0 || best === k && dist[cur] > 0 && dist[k] === 32767) { out.x = tx; out.z = tz; return; }
    out.x = this.cx(best); out.z = this.cz(best);
  }
}
