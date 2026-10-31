// Экран «Топ проигравших»: автоматы и рулетка за неделю (с понедельника 00:00 МСК) и за всё время.
// Топ пересчитывается по событиям и при смене недели. Итог вращения попадает на экран, только когда
// барабаны докрутились, — иначе экран над автоматами выдал бы выигрыш раньше барабанов.
import type { Stats } from '../../shared/economy.ts';
import { LOSERS_ALL_ROWS, LOSERS_ROWS, type LoserRow } from '../../shared/messages.ts';
import { dgWeekStart } from '../dungeon/records.ts';
import type { Profile } from '../store.ts';

/** Ставка минус выигрыш — в счёт текущей недели; выигрыш может увести счёт ниже нуля. */
export function addLoss(stats: Stats, delta: number, now: number): void {
  const week = dgWeekStart(now);
  if (stats.lsWeek !== week) {
    stats.lsWeek = week;
    stats.lsLost = 0;
  }
  stats.lsLost += delta;
}

/** Сколько проиграл в автоматах с начала подсчёта (в плюсе — меньше нуля). */
export function slotLost(p: Profile): number {
  return p.stats.slotBet - p.stats.slotPaid;
}

/** Проигрыш в завершённых розыгрышах рулетки: улов в залоге ещё не проигран. */
export function rouletteLost(p: Profile): number {
  return (p.stats.rlStaked - (p.rouletteEscrow?.amount ?? 0)) - p.stats.rlWon;
}

/**
 * Топ: только кто в минусе; больше проиграл — выше, поровну — чей профиль старше (меньше id), так порядок не скачет.
 * hidden — чего на экране ещё нет: профиль → проигрыш вращений, которые докручиваются.
 */
export function topLosers(profiles: readonly Profile[], hidden?: ReadonlyMap<number, number>, now: number = Date.now()): LoserRow[] {
  const week = dgWeekStart(now);
  const rows: LoserRow[] = [];
  for (const p of profiles) {
    const n = (p.stats.lsWeek === week ? p.stats.lsLost : 0) - (hidden?.get(p.id) ?? 0);
    if (n > 0) rows.push({ pid: p.id, nick: p.nick, n });
  }
  rows.sort((a, b) => b.n - a.n || a.pid - b.pid);
  return rows.slice(0, LOSERS_ROWS);
}

/** За всё время: автоматы и завершённые розыгрыши рулетки, до трёх строк. */
export function topLosersAll(profiles: readonly Profile[], hidden?: ReadonlyMap<number, number>): LoserRow[] {
  const rows: LoserRow[] = [];
  for (const p of profiles) {
    const n = slotLost(p) + rouletteLost(p) - (hidden?.get(p.id) ?? 0);
    if (n > 0) rows.push({ pid: p.id, nick: p.nick, n });
  }
  rows.sort((a, b) => b.n - a.n || a.pid - b.pid);
  return rows.slice(0, LOSERS_ALL_ROWS);
}

/** Вращение, итог которого ещё нельзя показывать: чьё, на сколько изменился проигрыш, с какого тика можно */
interface Pending {
  pid: number;
  lost: number;
  at: number;
  /** Неделя ставки: прошлое вращение не меняет счёт новой недели. */
  week: number;
}

export class LosersBoard {
  private readonly profiles: () => readonly Profile[];
  private readonly now: () => number;
  private rows: LoserRow[] = [];
  private allRows: LoserRow[] = [];
  private week = 0;
  private shown = '';
  /** По порядку тиков: у всех вращений одна и та же задержка */
  private readonly pending: Pending[] = [];

  /** profiles — все профили (их немного, пересчёт — только по событиям) */
  constructor(profiles: () => readonly Profile[], now: () => number = Date.now) {
    this.profiles = profiles;
    this.now = now;
    this.refresh();
  }

  /** Что сейчас на экране */
  get top(): LoserRow[] {
    return this.rows;
  }

  get allTop(): LoserRow[] {
    return this.allRows;
  }

  /** Вращение: проигрыш профиля вырос на lost (ставка минус выигрыш; бывает и меньше нуля), показать — с тика at. */
  spun(pid: number, lost: number, at: number): void {
    this.pending.push({ pid, lost, at, week: dgWeekStart(this.now()) });
  }

  /** Раз в тик: докрутились барабаны или сменилась неделя — пересчёт обоих списков. */
  step(tick: number): { top: LoserRow[]; all: LoserRow[] } | null {
    if (dgWeekStart(this.now()) === this.week && (this.pending.length === 0 || this.pending[0].at > tick)) return null;
    while (this.pending.length > 0 && this.pending[0].at <= tick) this.pending.shift();
    return this.refresh();
  }

  /** Пересчитать оба списка; если ни один не поменялся — null. */
  refresh(): { top: LoserRow[]; all: LoserRow[] } | null {
    const now = this.now();
    this.week = dgWeekStart(now);
    const hidden = new Map<number, number>();
    const weekHidden = new Map<number, number>();
    for (const q of this.pending) {
      hidden.set(q.pid, (hidden.get(q.pid) ?? 0) + q.lost);
      if (q.week === this.week) weekHidden.set(q.pid, (weekHidden.get(q.pid) ?? 0) + q.lost);
    }
    const profiles = this.profiles();
    const top = topLosers(profiles, weekHidden, now);
    const all = topLosersAll(profiles, hidden);
    const key = JSON.stringify({ top, all });
    if (key === this.shown) return null;
    this.shown = key;
    this.rows = top;
    this.allRows = all;
    return { top, all };
  }
}
