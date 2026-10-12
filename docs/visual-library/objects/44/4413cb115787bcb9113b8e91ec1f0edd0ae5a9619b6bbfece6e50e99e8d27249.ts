// История бойцов для компенсации лага в «Fight Club»: где стоял, куда смотрел, держал ли блок и был ли неуязвим.
// Удар сервер проверяет по тому, что бьющий видел у себя на экране (его viewTick), — как выстрел в пейнтболе.
import { HISTORY_TICKS } from '../../shared/constants.ts';
import type { Fighter } from '../../shared/fightsim.ts';

const MAX_IDS = 32;
// x, y, z, yaw, флаги (1 — был в бою, 2 — блок, 4 — неуязвим)
const STRIDE = 5;

export interface PastFighter {
  x: number;
  y: number;
  z: number;
  yaw: number;
  block: boolean;
  inv: boolean;
}

export function makePast(): PastFighter {
  return { x: 0, y: 0, z: 0, yaw: 0, block: false, inv: false };
}

export class FightHistory {
  private readonly ticks = new Int32Array(HISTORY_TICKS).fill(-1);
  private readonly data = new Float64Array(HISTORY_TICKS * MAX_IDS * STRIDE);

  record(tick: number, list: Iterable<{ id: number; f: Fighter; live: boolean }>): void {
    const slot = tick % HISTORY_TICKS;
    this.ticks[slot] = tick;
    const base = slot * MAX_IDS * STRIDE;
    for (let i = 0; i < MAX_IDS; i++) this.data[base + i * STRIDE + 4] = 0;
    for (const p of list) {
      if (p.id < 0 || p.id >= MAX_IDS) continue;
      const o = base + p.id * STRIDE;
      const f = p.f;
      this.data[o] = f.s.x;
      this.data[o + 1] = f.s.y;
      this.data[o + 2] = f.s.z;
      this.data[o + 3] = f.yaw;
      this.data[o + 4] = p.live ? 1 | (f.block ? 2 : 0) | (f.inv > 0 ? 4 : 0) : 0;
    }
  }

  /** Боец id в тик t (дробный: позиция — между соседними тиками, флаги — ближайшего). false — тогда его не было. */
  sample(id: number, t: number, out: PastFighter): boolean {
    if (id < 0 || id >= MAX_IDS) return false;
    const t0 = Math.floor(t);
    const f = t - t0;
    const a = this.slotOf(t0);
    if (a < 0) return false;
    const oa = a * MAX_IDS * STRIDE + id * STRIDE;
    const fa = this.data[oa + 4];
    if (!(fa & 1)) return false;
    const b = f > 0 ? this.slotOf(t0 + 1) : -1;
    const ob = b * MAX_IDS * STRIDE + id * STRIDE;
    const useB = b >= 0 && (this.data[ob + 4] & 1) !== 0;
    const k = useB ? f : 0;
    const src = useB ? ob : oa;
    out.x = this.data[oa] + (this.data[src] - this.data[oa]) * k;
    out.y = this.data[oa + 1] + (this.data[src + 1] - this.data[oa + 1]) * k;
    out.z = this.data[oa + 2] + (this.data[src + 2] - this.data[oa + 2]) * k;
    const near = useB && f >= 0.5 ? ob : oa;
    out.yaw = this.data[near + 3];
    const fl = this.data[near + 4];
    out.block = (fl & 2) !== 0;
    out.inv = (fl & 4) !== 0;
    return true;
  }

  private slotOf(tick: number): number {
    if (tick < 0) return -1;
    const slot = tick % HISTORY_TICKS;
    return this.ticks[slot] === tick ? slot : -1;
  }
}
