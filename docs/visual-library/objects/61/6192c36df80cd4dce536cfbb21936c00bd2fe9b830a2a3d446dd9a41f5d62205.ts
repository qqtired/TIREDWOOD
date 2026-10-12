// Ограничение частоты: не больше limit событий за скользящее окно windowMs по ключу.

export class RateLimiter {
  private readonly now: () => number;
  private readonly hits = new Map<string, number[]>();

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** Можно ли (и если да — засчитать). */
  hit(key: string, limit: number, windowMs: number): boolean {
    const list = this.fresh(key, windowMs);
    if (list.length >= limit) return false;
    list.push(this.now());
    this.hits.set(key, list);
    return true;
  }

  /** Проверка без засчитывания. */
  peek(key: string, limit: number, windowMs: number): boolean {
    return this.fresh(key, windowMs).length < limit;
  }

  /** Убирает пустые ключи (раз в минуту, чтобы карта не росла). */
  sweep(maxWindowMs: number): void {
    const edge = this.now() - maxWindowMs;
    for (const [k, list] of this.hits) if (!list.length || list[list.length - 1] <= edge) this.hits.delete(k);
  }

  private fresh(key: string, windowMs: number): number[] {
    const list = this.hits.get(key);
    if (!list) return [];
    const edge = this.now() - windowMs;
    let i = 0;
    while (i < list.length && list[i] <= edge) i++;
    if (i) list.splice(0, i);
    return list;
  }
}
