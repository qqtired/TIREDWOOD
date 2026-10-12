// История позиций игроков для компенсации лага: сервер «откатывает» цели
// к моменту, который стрелявший видел у себя на экране.
import { HISTORY_TICKS } from '../../shared/constants.ts';

const MAX_IDS = 256;
const STRIDE = 4; // x, y, z, alive

export class History {
  private readonly ticks = new Int32Array(HISTORY_TICKS).fill(-1);
  private readonly data = new Float64Array(HISTORY_TICKS * MAX_IDS * STRIDE);

  record(tick: number, players: Iterable<{ id: number; alive: boolean; state: { x: number; y: number; z: number } }>): void {
    const slot = tick % HISTORY_TICKS;
    this.ticks[slot] = tick;
    const base = slot * MAX_IDS * STRIDE;
    // стираем слот: никого нет
    for (let i = 0; i < MAX_IDS; i++) this.data[base + i * STRIDE + 3] = -1;
    for (const p of players) {
      const o = base + p.id * STRIDE;
      this.data[o] = p.state.x;
      this.data[o + 1] = p.state.y;
      this.data[o + 2] = p.state.z;
      this.data[o + 3] = p.alive ? 1 : 0;
    }
  }

  /**
   * Позиция игрока id в дробный тик t. Возвращает false, если его тогда не было
   * или он был мёртв (значит, на экране стрелявшего его не было).
   */
  sample(id: number, t: number, out: { x: number; y: number; z: number }): boolean {
    const t0 = Math.floor(t);
    const f = t - t0;
    const a = this.slotOf(t0);
    if (a < 0) return false;
    const oa = a * MAX_IDS * STRIDE + id * STRIDE;
    if (this.data[oa + 3] !== 1) return false;
    const b = f > 0 ? this.slotOf(t0 + 1) : -1;
    if (b < 0 || this.data[b * MAX_IDS * STRIDE + id * STRIDE + 3] !== 1) {
      out.x = this.data[oa];
      out.y = this.data[oa + 1];
      out.z = this.data[oa + 2];
      return true;
    }
    const ob = b * MAX_IDS * STRIDE + id * STRIDE;
    out.x = this.data[oa] + (this.data[ob] - this.data[oa]) * f;
    out.y = this.data[oa + 1] + (this.data[ob + 1] - this.data[oa + 1]) * f;
    out.z = this.data[oa + 2] + (this.data[ob + 2] - this.data[oa + 2]) * f;
    return true;
  }

  private slotOf(tick: number): number {
    if (tick < 0) return -1;
    const slot = tick % HISTORY_TICKS;
    return this.ticks[slot] === tick ? slot : -1;
  }
}
