// Компенсация задержки выстрела: последние HIDE_HISTORY_TICKS тиков поз прячущихся. Сервер «откатывает» их к моменту,
// который искатель видел у себя на экране (не дальше HIDE_MAX_REWIND), — как в пейнтболе (server/paintball/lagcomp.ts).
import { HIDE_CAPACITY, HIDE_HISTORY_TICKS } from '../../shared/hide.ts';
import type { HideBody } from '../../shared/hidephysics.ts';
import type { HideKind } from '../../shared/hideprops.ts';

interface Frame { tick: number; n: number; id: Int32Array; x: Float64Array; y: Float64Array; z: Float64Array; yaw: Int8Array; kind: HideKind[] }

export class HideHistory {
  private readonly frames: Frame[] = [];
  constructor() {
    for (let i = 0; i < HIDE_HISTORY_TICKS; i++) {
      this.frames.push({ tick: -1, n: 0, id: new Int32Array(HIDE_CAPACITY), x: new Float64Array(HIDE_CAPACITY), y: new Float64Array(HIDE_CAPACITY), z: new Float64Array(HIDE_CAPACITY), yaw: new Int8Array(HIDE_CAPACITY), kind: new Array<HideKind>(HIDE_CAPACITY).fill('crate') });
    }
  }

  record(tick: number, bodies: Iterable<HideBody>): void {
    const f = this.frames[tick % HIDE_HISTORY_TICKS];
    f.tick = tick; f.n = 0;
    for (const b of bodies) {
      if (f.n >= HIDE_CAPACITY) break;
      const i = f.n++;
      f.id[i] = b.id; f.x[i] = b.x; f.y[i] = b.y; f.z[i] = b.z; f.yaw[i] = b.yaw; f.kind[i] = b.kind;
    }
  }

  clear(): void { for (const f of this.frames) f.tick = -1; }

  /** Поза тела id в дробный тик t (между двумя записями — по прямой). false — тогда его не было. */
  sample(id: number, t: number, out: HideBody): boolean {
    const t0 = Math.floor(t), fr = t - t0;
    const a = this.frame(t0);
    const ia = a ? this.index(a, id) : -1;
    if (!a || ia < 0) return false;
    out.id = id; out.kind = a.kind[ia]; out.yaw = a.yaw[ia]; out.x = a.x[ia]; out.y = a.y[ia]; out.z = a.z[ia];
    const b = fr > 0 ? this.frame(t0 + 1) : null;
    const ib = b ? this.index(b, id) : -1;
    if (b && ib >= 0 && b.kind[ib] === out.kind && b.yaw[ib] === out.yaw) {
      out.x += (b.x[ib] - out.x) * fr; out.y += (b.y[ib] - out.y) * fr; out.z += (b.z[ib] - out.z) * fr;
    }
    return true;
  }

  private frame(t: number): Frame | null {
    if (t < 0) return null;
    const f = this.frames[t % HIDE_HISTORY_TICKS];
    return f.tick === t ? f : null;
  }

  private index(f: Frame, id: number): number {
    for (let i = 0; i < f.n; i++) if (f.id[i] === id) return i;
    return -1;
  }
}
