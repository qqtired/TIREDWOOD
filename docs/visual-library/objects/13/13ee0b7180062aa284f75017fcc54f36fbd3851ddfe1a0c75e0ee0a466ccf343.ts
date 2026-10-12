// Навигационная сетка для ботов: клетки 0.5 м, высота поверхности в каждой,
// рёбра «пройти / запрыгнуть / спрыгнуть» и полёты с батутов (просчитаны физикой).
import { PLAYER_HALF, PLAYER_HEIGHT, STEP_HEIGHT } from '../../shared/constants.ts';
import type { GameMap } from '../../shared/maps/types.ts';
import { BTN_FORWARD, makeEvents, makeInput, makeState, stepPlayer } from '../../shared/sim.ts';
import type { CollisionWorld } from '../../shared/world.ts';

export const CELL = 0.5;
const JUMP_UP = 1.3;
const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
] as const;

export interface NavLink {
  to: number;
  cost: number;
  yaw: number;
}

class MinHeap {
  private keys: Float64Array;
  private vals: Int32Array;
  size = 0;

  constructor(capacity: number) {
    this.keys = new Float64Array(capacity);
    this.vals = new Int32Array(capacity);
  }

  clear(): void {
    this.size = 0;
  }

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

  pop(): number {
    const top = this.vals[0];
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
}

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly x0: number;
  readonly z0: number;
  readonly height: Float32Array;
  readonly walk: Uint8Array;
  readonly danger: Uint8Array;
  readonly tramp: Uint8Array;
  readonly links = new Map<number, NavLink[]>();
  /** Список проходимых клеток (для случайных целей) */
  readonly walkable: number[] = [];

  private g: Float64Array;
  private from: Int32Array;
  private stamp: Uint32Array;
  private closed: Uint32Array;
  private gen = 1;
  private heap: MinHeap;

  constructor(map: GameMap, world: CollisionWorld) {
    const { minX, maxX, minZ, maxZ } = map.bounds;
    this.x0 = minX;
    this.z0 = minZ;
    this.cols = Math.round((maxX - minX) / CELL);
    this.rows = Math.round((maxZ - minZ) / CELL);
    const n = this.cols * this.rows;
    this.height = new Float32Array(n);
    this.walk = new Uint8Array(n);
    this.danger = new Uint8Array(n);
    this.tramp = new Uint8Array(n);
    this.g = new Float64Array(n);
    this.from = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heap = new MinHeap(4096);

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        const cx = this.x0 + (c + 0.5) * CELL;
        const cz = this.z0 + (r + 0.5) * CELL;
        let top = -Infinity;
        let isTramp = false;
        for (let b = 0; b < world.n; b++) {
          if (world.shootThrough[b]) continue;
          if (cx < world.minX[b] || cx > world.maxX[b] || cz < world.minZ[b] || cz > world.maxZ[b]) continue;
          // Узкие столбики (фонари) — не опора
          if (world.maxX[b] - world.minX[b] < 0.6 || world.maxZ[b] - world.minZ[b] < 0.6) continue;
          if (world.maxY[b] > top) {
            top = world.maxY[b];
            isTramp = world.tramp[b] === 1;
          }
        }
        this.height[i] = top;
        if (top === -Infinity) continue;
        const blocked = world.overlaps(cx - PLAYER_HALF, top + 0.02, cz - PLAYER_HALF, cx + PLAYER_HALF, top + PLAYER_HEIGHT, cz + PLAYER_HALF);
        if (blocked) continue;
        this.walk[i] = 1;
        this.tramp[i] = isTramp ? 1 : 0;
        if (Math.abs(cx) > maxX - 1.6) this.danger[i] = 1;
      }
    }
    for (let i = 0; i < n; i++) if (this.walk[i] && !this.tramp[i] && this.height[i] < 7) this.walkable.push(i);
    this.buildTrampolineLinks(map, world);
  }

  cellAt(x: number, z: number): number {
    const c = Math.floor((x - this.x0) / CELL);
    const r = Math.floor((z - this.z0) / CELL);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  cx(i: number): number {
    return this.x0 + ((i % this.cols) + 0.5) * CELL;
  }

  cz(i: number): number {
    return this.z0 + (Math.floor(i / this.cols) + 0.5) * CELL;
  }

  /** Ближайшая проходимая клетка к точке на высоте y (поиск по спирали). */
  nearestWalkable(x: number, y: number, z: number, radius = 6): number {
    const c0 = Math.floor((x - this.x0) / CELL);
    const r0 = Math.floor((z - this.z0) / CELL);
    let best = -1;
    let bestD = Infinity;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const c = c0 + dc;
        const r = r0 + dr;
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
        const i = r * this.cols + c;
        if (!this.walk[i]) continue;
        const dh = Math.abs(this.height[i] - y);
        const d = dc * dc + dr * dr + dh * dh * 16;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    return best;
  }

  /** Можно ли из клетки a шагнуть в соседнюю b; возвращает стоимость или -1. */
  private edgeCost(a: number, b: number, base: number, diagonal: boolean, dc: number, dr: number): number {
    if (!this.walk[b]) return -1;
    const ha = this.height[a];
    const hb = this.height[b];
    const dh = hb - ha;
    let cost = base;
    if (dh > STEP_HEIGHT) {
      if (diagonal || dh > JUMP_UP) return -1;
      cost += 1.5 + dh;
    } else if (dh < -STEP_HEIGHT) {
      if (diagonal) return -1;
      cost += 0.4 - dh * 0.2;
    }
    if (diagonal) {
      // не срезаем углы
      const s1 = a + dc;
      const s2 = a + dr * this.cols;
      if (!this.walk[s1] || !this.walk[s2]) return -1;
      if (Math.abs(this.height[s1] - ha) > STEP_HEIGHT || Math.abs(this.height[s2] - ha) > STEP_HEIGHT) return -1;
    }
    if (this.danger[b]) cost += 2.5;
    if (this.tramp[b]) cost += 6;
    return cost;
  }

  /** A*. Путь (индексы клеток от старта к цели) пишется в out. */
  findPath(start: number, goal: number, out: number[], maxIter = 9000): boolean {
    out.length = 0;
    if (start < 0 || goal < 0 || !this.walk[goal]) return false;
    const gen = ++this.gen;
    const heap = this.heap;
    heap.clear();
    const gx = this.cx(goal);
    const gz = this.cz(goal);
    this.g[start] = 0;
    this.from[start] = -1;
    this.stamp[start] = gen;
    heap.push(this.h(start, gx, gz), start);
    let bestNode = start;
    let bestH = Infinity;
    let iter = 0;
    while (heap.size > 0 && iter++ < maxIter) {
      const cur = heap.pop();
      if (this.closed[cur] === gen) continue;
      this.closed[cur] = gen;
      if (cur === goal) {
        bestNode = goal;
        break;
      }
      const hcur = this.h(cur, gx, gz);
      if (hcur < bestH) {
        bestH = hcur;
        bestNode = cur;
      }
      const gcur = this.g[cur];
      const col = cur % this.cols;
      const row = (cur - col) / this.cols;
      // Полёт с батута
      if (this.tramp[cur]) {
        const links = this.links.get(cur);
        if (links) {
          for (const l of links) this.relax(cur, l.to, gcur + l.cost, gen, gx, gz);
        }
        // с батута можно и просто сойти — но только в не-батут
      }
      for (const [dc, dr, len] of DIRS) {
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
        const nb = r * this.cols + c;
        if (this.closed[nb] === gen) continue;
        const cost = this.edgeCost(cur, nb, len * CELL, dc !== 0 && dr !== 0, dc, dr);
        if (cost < 0) continue;
        this.relax(cur, nb, gcur + cost, gen, gx, gz);
      }
    }
    // Восстанавливаем путь (до цели или до ближайшей к ней клетки)
    let n = bestNode;
    while (n !== -1) {
      out.push(n);
      n = this.from[n];
      if (out.length > 4000) break;
    }
    out.reverse();
    return bestNode === goal;
  }

  private relax(cur: number, nb: number, g: number, gen: number, gx: number, gz: number): void {
    if (this.stamp[nb] === gen && g >= this.g[nb]) return;
    this.stamp[nb] = gen;
    this.g[nb] = g;
    this.from[nb] = cur;
    this.heap.push(g + this.h(nb, gx, gz), nb);
  }

  private h(i: number, gx: number, gz: number): number {
    const dx = this.cx(i) - gx;
    const dz = this.cz(i) - gz;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /** Прямая от a до b проходима пешком на одной высоте (для сглаживания пути). */
  straightWalkable(a: number, b: number): boolean {
    const ax = this.cx(a);
    const az = this.cz(a);
    const bx = this.cx(b);
    const bz = this.cz(b);
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(len / (CELL * 0.5));
    let prevH = this.height[a];
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      // проверяем ширину тела: центр и две боковые точки
      for (const off of [0, -0.3, 0.3]) {
        const nx = len > 0 ? -(bz - az) / len : 0;
        const nz = len > 0 ? (bx - ax) / len : 0;
        const i = this.cellAt(x + nx * off, z + nz * off);
        if (i < 0 || !this.walk[i] || this.tramp[i]) return false;
        if (Math.abs(this.height[i] - prevH) > STEP_HEIGHT) return false;
        if (off === 0) {
          if (this.danger[i] && !this.danger[a]) return false;
        }
      }
      const ci = this.cellAt(x, z);
      prevH = this.height[ci];
    }
    return true;
  }

  /** Просчитываем полёты с каждого батута в 16 направлениях настоящей физикой. */
  private buildTrampolineLinks(map: GameMap, world: CollisionWorld): void {
    const s = makeState();
    const inp = makeInput();
    const ev = makeEvents();
    for (const t of map.trampolines) {
      const from = this.cellAt(t.x, t.z);
      if (from < 0) continue;
      const list: NavLink[] = [];
      const seen = new Set<number>();
      for (let k = 0; k < 16; k++) {
        const yaw = (k / 16) * Math.PI * 2;
        for (const hold of [1, 0.45]) {
          Object.assign(s, makeState());
          s.x = t.x;
          s.z = t.z;
          s.y = t.top + 0.05;
          inp.yaw = yaw;
          inp.pitch = 0;
          let bounced = false;
          let landed = -1;
          for (let tick = 0; tick < 240; tick++) {
            // «hold» < 1: жмём вперёд только часть полёта — короткие приземления
            const airTicks = bounced ? tick : 0;
            inp.buttons = !bounced || airTicks < 60 * hold ? BTN_FORWARD : 0;
            stepPlayer(s, inp, world, false, 0, ev);
            if (ev.bounced) {
              if (bounced) break; // снова на батуте
              bounced = true;
              continue;
            }
            if (bounced && s.grounded) {
              landed = this.cellAt(s.x, s.z);
              break;
            }
            if (s.y < -1) break;
          }
          if (landed < 0 || !this.walk[landed] || this.tramp[landed] || seen.has(landed)) continue;
          if (Math.abs(this.height[landed] - s.y) > 0.3) continue;
          seen.add(landed);
          const dist = Math.hypot(this.cx(landed) - t.x, this.cz(landed) - t.z);
          list.push({ to: landed, cost: 3 + dist, yaw });
        }
      }
      // Все клетки батута ведут туда же
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const i = r * this.cols + c;
          if (!this.tramp[i]) continue;
          if (Math.hypot(this.cx(i) - t.x, this.cz(i) - t.z) <= t.r + 0.5) this.links.set(i, list);
        }
      }
      if (!this.links.has(from)) this.links.set(from, list);
    }
  }
}
