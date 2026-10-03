// Музыкальный автомат набережной (shared/jukebox.ts): очередь песен и та, что играет. Время — серверные мс: песня
// идёт от start до start + длина, следующая — через JUKE_GAP_MS после неё. Продвижение по часам, а не по тикам:
// пока цикл сервера спит (на набережной никого), очередь доигрывается «задним числом» — вошедший услышит верное место.
// Жетоны списывает комната (room.ts) между check и add: отказ — без списания.
import { JUKE_GAP_MS, JUKE_LEAD_MS, JUKE_QUEUE_MAX, JUKE_SONGS, songMs, type JukeEntry, type JukeNow, type JukeView } from '../../shared/jukebox.ts';

/** Почему нельзя: нет такой песни, своя уже ждёт, очередь полна, эта уже играет или ждёт */
export type JukeRefusal = 'song' | 'mine' | 'full' | 'same';

export class Jukebox {
  cur: JukeNow | null = null;
  readonly queue: JukeEntry[] = [];

  /** Можно ли поставить песню (ничего не меняет, кроме доигрывания по часам): null — можно */
  check(pid: number, song: unknown, now: number): JukeRefusal | null {
    this.step(now);
    if (typeof song !== 'number' || !Number.isInteger(song) || !JUKE_SONGS[song]) return 'song';
    if (this.queue.some((e) => e.pid === pid)) return 'mine';
    if (this.queue.length >= JUKE_QUEUE_MAX) return 'full';
    if (this.cur?.song === song || this.queue.some((e) => e.song === song)) return 'same';
    return null;
  }

  /** Поставить в очередь (после check и оплаты). Автомат молчал — песня начнётся через JUKE_LEAD_MS. */
  add(pid: number, nick: string, song: number, now: number): void {
    this.queue.push({ song, pid, nick });
    this.step(now);
  }

  /** Доиграть по часам: песня кончилась — следующая из очереди после паузы; очереди нет — тишина. true — что-то сменилось */
  step(now: number): boolean {
    let changed = false;
    for (;;) {
      if (this.cur) {
        const end = this.cur.start + songMs(this.cur.song);
        if (now < end) break;
        const next = this.queue.shift();
        this.cur = next ? { ...next, start: end + JUKE_GAP_MS } : null;
        changed = true;
      } else if (this.queue.length) {
        this.cur = { ...this.queue.shift()!, start: now + JUKE_LEAD_MS };
        changed = true;
      } else break;
    }
    return changed;
  }

  /** Через сколько мс начнётся песня с этим местом в очереди (0 — следующая) */
  etaMs(index: number, now: number): number {
    let t = this.cur ? this.cur.start + songMs(this.cur.song) + JUKE_GAP_MS : now + JUKE_LEAD_MS;
    for (let i = 0; i < index && i < this.queue.length; i++) t += songMs(this.queue[i].song) + JUKE_GAP_MS;
    return Math.max(0, t - now);
  }

  view(now: number): JukeView {
    return { now, cur: this.cur ? { ...this.cur } : null, queue: this.queue.map((e) => ({ ...e })) };
  }
}
