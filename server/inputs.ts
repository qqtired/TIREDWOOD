// Очередь ввода человека: входы приходят пачками по сети, сервер тратит их по одному в тик
// (два, если очередь выросла), с «бюджетом», чтобы ускоренный клиент не бегал быстрее.
import type { Input } from '../shared/sim.ts';

const MAX_QUEUE = 24;

export class InputQueue {
  readonly items: Input[] = [];
  /** Последний принятый номер входа */
  lastSeq = -1;
  /** Последний применённый номер (уходит клиенту в снимке) */
  ack = 0;
  budget = 8;
  /** Сколько тиков подряд входов не было */
  starve = 0;

  /** max — сколько входов держать в очереди (на полосе аквапарка — больше: там шаги после лаг-спайка не теряем) */
  push(inputs: readonly Input[], count: number, max = MAX_QUEUE): void {
    for (let i = 0; i < count; i++) {
      const inp = inputs[i];
      if (inp.seq <= this.lastSeq) continue;
      this.lastSeq = inp.seq;
      this.items.push({ seq: inp.seq, buttons: inp.buttons, yaw: inp.yaw, pitch: inp.pitch, viewTick: inp.viewTick });
    }
    if (this.items.length > max) this.items.splice(0, this.items.length - max);
  }

  /**
   * Сколько входов применить в этом тике (вызывать раз в тик). catchUp — с какой длины очереди тратить по два
   * (догонять); гонка держит запас побольше и догоняет позже, чтобы карт не прыгал на двойной шаг.
   */
  due(catchUp = 3): number {
    this.budget = Math.min(this.budget + 1, 10);
    const q = this.items.length;
    let n = q > catchUp ? 2 : q > 0 ? 1 : 0;
    if (n > Math.floor(this.budget)) n = Math.floor(this.budget);
    return n;
  }

  shift(): Input {
    const inp = this.items.shift()!;
    this.budget -= 1;
    this.starve = 0;
    this.ack = inp.seq;
    return inp;
  }

  reset(): void {
    this.items.length = 0;
    this.lastSeq = -1;
    this.ack = 0;
    this.budget = 8;
    this.starve = 0;
  }

  get length(): number {
    return this.items.length;
  }
}
