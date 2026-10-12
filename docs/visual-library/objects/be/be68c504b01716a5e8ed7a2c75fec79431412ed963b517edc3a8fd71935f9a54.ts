// Чужие игроки: буфер снимков и интерполяция на «часах отрисовки».
import { lerpAngle } from '../shared/math.ts';
import type { EntitySnap } from '../shared/protocol.ts';

const N = 48;
const MAX_EXTRAPOLATE = 7;

export interface RemoteSample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  flags: number;
  /** Насколько экстраполировали (тиков); 0 — честная интерполяция */
  extra: number;
}

export class RemoteTrack {
  readonly id: number;
  private readonly tick = new Float64Array(N);
  private readonly x = new Float64Array(N);
  private readonly y = new Float64Array(N);
  private readonly z = new Float64Array(N);
  private readonly yaw = new Float64Array(N);
  private readonly pitch = new Float64Array(N);
  private readonly flags = new Uint8Array(N);
  private head = -1;
  private count = 0;
  hp = 0;
  armor = 0;
  lastFlags = 0;
  lastTick = 0;
  /** Где был в последнем снимке */
  lastX = 0;
  lastZ = 0;

  constructor(id: number) {
    this.id = id;
  }

  push(tick: number, e: EntitySnap): void {
    if (this.count > 0 && tick <= this.tick[this.head]) return;
    this.head = (this.head + 1) % N;
    this.tick[this.head] = tick;
    this.x[this.head] = e.x;
    this.y[this.head] = e.y;
    this.z[this.head] = e.z;
    this.yaw[this.head] = e.yaw;
    this.pitch[this.head] = e.pitch;
    this.flags[this.head] = e.flags;
    if (this.count < N) this.count++;
    this.hp = e.hp;
    this.armor = e.armor;
    this.lastFlags = e.flags;
    this.lastTick = tick;
    this.lastX = e.x;
    this.lastZ = e.z;
  }

  /** Забыть историю целиком (телепорт через полкарты): следующий снимок встанет сразу, без «проезда». */
  clear(): void {
    this.count = 0;
    this.head = -1;
  }

  /** Сбросить историю (телепорт при спавне), чтобы не «проезжать» через карту. */
  cut(): void {
    if (this.count > 0) this.count = 1;
  }

  sample(t: number, out: RemoteSample): boolean {
    if (this.count === 0) return false;
    // ищем пару снимков a <= t < b, идём от свежих к старым
    let bIdx = -1;
    let aIdx = this.head;
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head - i + N) % N;
      if (this.tick[idx] <= t) {
        aIdx = idx;
        break;
      }
      bIdx = idx;
      aIdx = -1;
    }
    if (aIdx === -1) {
      // t старше всей истории — берём самый старый
      const idx = bIdx;
      this.write(out, idx, idx, 0, 0);
      return true;
    }
    if (bIdx === -1) {
      // t новее последнего снимка — немного экстраполируем по скорости
      const prev = (aIdx - 1 + N) % N;
      const over = Math.min(t - this.tick[aIdx], MAX_EXTRAPOLATE);
      if (this.count > 1 && this.tick[aIdx] - this.tick[prev] <= 3 && over > 0 && (this.flags[aIdx] & 1) && (this.flags[prev] & 1)) {
        const span = this.tick[aIdx] - this.tick[prev];
        const f = over / span;
        out.x = this.x[aIdx] + (this.x[aIdx] - this.x[prev]) * f;
        out.y = this.y[aIdx] + (this.y[aIdx] - this.y[prev]) * f * 0.5;
        out.z = this.z[aIdx] + (this.z[aIdx] - this.z[prev]) * f;
        out.yaw = this.yaw[aIdx];
        out.pitch = this.pitch[aIdx];
        out.flags = this.flags[aIdx];
        out.extra = over;
        return true;
      }
      this.write(out, aIdx, aIdx, 0, over > 0 ? over : 0);
      return true;
    }
    const ta = this.tick[aIdx];
    const tb = this.tick[bIdx];
    const f = tb > ta ? (t - ta) / (tb - ta) : 0;
    // между «мёртв» и «жив» не интерполируем — это телепорт
    if ((this.flags[aIdx] & 1) !== (this.flags[bIdx] & 1)) {
      this.write(out, f < 0.5 ? aIdx : bIdx, f < 0.5 ? aIdx : bIdx, 0, 0);
      return true;
    }
    this.write(out, aIdx, bIdx, f, 0);
    return true;
  }

  private write(out: RemoteSample, a: number, b: number, f: number, extra: number): void {
    out.x = this.x[a] + (this.x[b] - this.x[a]) * f;
    out.y = this.y[a] + (this.y[b] - this.y[a]) * f;
    out.z = this.z[a] + (this.z[b] - this.z[a]) * f;
    out.yaw = lerpAngle(this.yaw[a], this.yaw[b], f);
    out.pitch = this.pitch[a] + (this.pitch[b] - this.pitch[a]) * f;
    out.flags = f < 0.5 ? this.flags[a] : this.flags[b];
    out.extra = extra;
  }
}
