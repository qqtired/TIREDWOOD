// «Подземелье»: журнал ввода для сервера. Каждое событие (DgEvent с номером шага) копится здесь; раз в ~0,5 с уходит
// кусок `dg_log` (не больше 20 событий подряд с индекса `from`, шаг `upto`, сумма `h = dgHash` на этом шаге).
// Неподтверждённое хранится до `dg_ack` (n — сколько событий сервер принял); `need` — прислать заново с этого индекса.
import type { DgClientMsg, DgEvent } from '../../shared/dungeon/api.ts';

/** Не больше событий в куске и раз в столько секунд */
export const LOG_CHUNK = 20;
export const LOG_EVERY = 0.5;

export class Journal {
  /** все события забега с индекса base (подтверждённые до base выброшены) */
  private events: DgEvent[] = [];
  private base = 0;
  /** с какого индекса ещё не отправляли */
  private sent = 0;
  private timer = 0;

  reset(): void {
    this.events = [];
    this.base = 0;
    this.sent = 0;
    this.timer = 0;
  }

  push(ev: DgEvent): void {
    this.events.push(ev);
  }

  /** всего событий за забег */
  get total(): number {
    return this.base + this.events.length;
  }

  /** неподтверждённых */
  get pending(): number {
    return this.events.length;
  }

  /**
   * Каждый кадр: если пора (или force) — вернуть куски к отправке. upto/h — шаг, до которого дошла симуляция, и её
   * сумма на нём. Пустой кусок с новым upto тоже шлём: сервер двигает свою копию по времени.
   */
  poll(dt: number, upto: number, h: number, force = false): DgClientMsg[] {
    this.timer += dt;
    if (!force && this.timer < LOG_EVERY) return [];
    this.timer = 0;
    const out: DgClientMsg[] = [];
    const end = this.total;
    let from = Math.max(this.sent, this.base);
    do {
      const n = Math.min(LOG_CHUNK, end - from);
      const ev = this.events.slice(from - this.base, from - this.base + n);
      out.push({ t: 'dg_log', from, ev, upto, h });
      from += n;
    } while (from < end && out.length < 8);
    this.sent = from;
    return out;
  }

  /** сервер принял до n; need — дослать с этого индекса */
  ack(n: number, need?: number): void {
    if (n > this.base) {
      const drop = Math.min(this.events.length, n - this.base);
      this.events.splice(0, drop);
      this.base += drop;
    }
    if (need !== undefined && need >= this.base) this.sent = Math.min(this.sent, need);
    if (this.sent < this.base) this.sent = this.base;
  }
}
