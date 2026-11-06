// «Город вверх»: отсечки на флагах против своего лучшего подъёма. Хранятся в localStorage по курсу: отсечки лучшего
// законченного подъёма (с ними и сравниваем) и лучшее время до каждого флага (пока законченного подъёма нет).
// Только для подсказки игроку — рекорды и награды считает сервер.

interface Stored {
  /** Отсечки лучшего законченного подъёма, тики от старта (индекс — номер флага) и его итог */
  best: number[];
  total: number;
  /** Лучшее время до каждого флага за все попытки */
  flags: number[];
}

const KEY = (course: string): string => `tw-skill-splits:${course}`;

export class SplitBook {
  private readonly course: string;
  private data: Stored;
  /** Отсечки текущего подъёма */
  private cur: number[] = [];

  constructor(course: string) {
    this.course = course;
    let d: Stored = { best: [], total: 0, flags: [] };
    try {
      const raw = localStorage.getItem(KEY(course));
      if (raw) {
        const v = JSON.parse(raw) as Partial<Stored>;
        d = { best: Array.isArray(v.best) ? v.best : [], total: Number(v.total) || 0, flags: Array.isArray(v.flags) ? v.flags : [] };
      }
    } catch { /* нет хранилища — живём без памяти */ }
    this.data = d;
  }

  /** Новый подъём (N, «Ещё забег») */
  reset(): void {
    this.cur = [];
  }

  /**
   * Взят флаг i за split тиков от старта. Возвращает, с чем сравнили (тики того же флага в лучшем подъёме, иначе
   * лучшее до этого флага), или null — сравнить не с чем (первый раз).
   */
  flag(i: number, split: number): number | null {
    this.cur[i] = split;
    const ref = this.data.total > 0 && this.data.best[i] > 0 ? this.data.best[i] : this.data.flags[i] > 0 ? this.data.flags[i] : null;
    if (!(this.data.flags[i] > 0) || split < this.data.flags[i]) this.data.flags[i] = split;
    this.save();
    return ref;
  }

  /** Колокол: этот подъём стал лучшим — его отсечки теперь эталон. */
  finish(ticks: number, newBest: boolean): void {
    if (newBest || this.data.total <= 0 || ticks < this.data.total) {
      this.data.best = this.cur.slice();
      this.data.total = ticks;
      this.save();
    }
    this.cur = [];
  }

  private save(): void {
    try {
      localStorage.setItem(KEY(this.course), JSON.stringify(this.data));
    } catch { /* переполнено или запрещено — не страшно */ }
  }
}

/** «−4,2» / «+1,0» (секунды, десятые; минус — настоящий). */
export function splitDelta(ticks: number): string {
  const sec = Math.abs(ticks) / 60;
  return `${ticks < 0 ? '−' : '+'}${sec.toFixed(1).replace('.', ',')}`;
}
