// Экран «Топ проигравших» в павильоне автоматов: кто больше всех спустил в автоматах — поставил минус выиграл
// (stats.slotBet − stats.slotPaid). Ставки записываются только со 2 октября: прошлые проигрыши не восстановить.
// Топ пересчитывается при вращении и смене ника, а не каждый тик. Итог вращения попадает на экран, только когда
// барабаны докрутились, — иначе экран над автоматами выдал бы выигрыш раньше барабанов.
import { LOSERS_ROWS, type LoserRow } from '../../shared/messages.ts';
import type { Profile } from '../store.ts';

/** Сколько проиграл в автоматах с начала подсчёта (в плюсе — меньше нуля). */
export function slotLost(p: Profile): number {
  return p.stats.slotBet - p.stats.slotPaid;
}

/**
 * Топ: только кто в минусе; больше проиграл — выше, поровну — чей профиль старше (меньше id), так порядок не скачет.
 * hidden — чего на экране ещё нет: профиль → проигрыш вращений, которые докручиваются.
 */
export function topLosers(profiles: readonly Profile[], hidden?: ReadonlyMap<number, number>): LoserRow[] {
  const rows: LoserRow[] = [];
  for (const p of profiles) {
    const n = slotLost(p) - (hidden?.get(p.id) ?? 0);
    if (n > 0) rows.push({ pid: p.id, nick: p.nick, n });
  }
  rows.sort((a, b) => b.n - a.n || a.pid - b.pid);
  return rows.slice(0, LOSERS_ROWS);
}

/** Вращение, итог которого ещё нельзя показывать: чьё, на сколько изменился проигрыш, с какого тика можно */
interface Pending {
  pid: number;
  lost: number;
  at: number;
}

export class LosersBoard {
  private readonly profiles: () => readonly Profile[];
  private rows: LoserRow[] = [];
  private shown = '';
  /** По порядку тиков: у всех вращений одна и та же задержка */
  private readonly pending: Pending[] = [];

  /** profiles — все профили (их немного, пересчёт — только по событиям) */
  constructor(profiles: () => readonly Profile[]) {
    this.profiles = profiles;
    this.refresh();
  }

  /** Что сейчас на экране */
  get top(): LoserRow[] {
    return this.rows;
  }

  /** Вращение: проигрыш профиля вырос на lost (ставка минус выигрыш; бывает и меньше нуля), показать — с тика at. */
  spun(pid: number, lost: number, at: number): void {
    this.pending.push({ pid, lost, at });
  }

  /** Раз в тик (дёшево, пока ничего не крутится): докрутились — пересчёт. Новый топ, если он поменялся, иначе null. */
  step(tick: number): LoserRow[] | null {
    if (this.pending.length === 0 || this.pending[0].at > tick) return null;
    while (this.pending.length > 0 && this.pending[0].at <= tick) this.pending.shift();
    return this.refresh();
  }

  /** Пересчитать (сменили ник, докрутились барабаны). Новый топ, если он поменялся, иначе null. */
  refresh(): LoserRow[] | null {
    const hidden = new Map<number, number>();
    for (const q of this.pending) hidden.set(q.pid, (hidden.get(q.pid) ?? 0) + q.lost);
    const rows = topLosers(this.profiles(), hidden);
    const key = JSON.stringify(rows);
    if (key === this.shown) return null;
    this.shown = key;
    this.rows = rows;
    return rows;
  }
}
