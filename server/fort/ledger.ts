// Учёт забега в «Крепости» по профилю: всё, что игрок нажил в этой игре (очки лавки, сбитые, волны, покупки,
// жетоны — накопленные и уже выплаченные), живёт в одном объекте p.run. Вышел — объект кладём в книгу по номеру
// профиля и выплачиваем жетоны за отбитые волны; вернулся в ту же игру — получает свой объект обратно, а не новые
// стартовые очки (P1: повторный вход больше не выдаёт бюджет заново). Новая игра — книга пустеет.
// Поля arsenal (золото, прокачка, стволы, гранаты, вклад в башни) добавляются в FortRun — вход заново вернёт их целиком.
import { FT_TOK_MVP, FT_TOK_RECORD, FT_TOK_WIN, killTokens } from '../../shared/fortwaves.ts';
import type { FtReward } from '../../shared/fort.ts';

export interface FortRun {
  /** Очки лавки (старая лавка; у arsenal — золото) */
  pts: number;
  kills: number;
  deaths: number;
  /** Очки за сбитых (для «лучшего защитника») */
  killPts: number;
  /** Отбитых волн с участием */
  waves: number;
  /** Большой магазин куплен */
  magazine: boolean;
  /** Жетоны за отбитые волны (накоплено за забег) */
  tokWaves: number;
  /** Уже выплачено: жетоны за волны, жетоны за сбитых, сбитые (для статистики профиля) */
  paidWaves: number;
  paidKillTok: number;
  paidKills: number;
  /** Сколько раз платили по этому забегу (первая выплата считает игру в статистике) */
  payouts: number;
}

export function makeRun(pts: number): FortRun {
  return { pts, kills: 0, deaths: 0, killPts: 0, waves: 0, magazine: false, tokWaves: 0, paidWaves: 0, paidKillTok: 0, paidKills: 0, payouts: 0 };
}

/** Книга забега: ушедшие из идущей игры, по номеру профиля */
export class FortLedger {
  private readonly runs = new Map<number, FortRun>();

  get size(): number {
    return this.runs.size;
  }

  stash(pid: number, run: FortRun): void {
    if (pid > 0) this.runs.set(pid, run);
  }

  /** Забрать свой забег (вернулся в ту же игру); null — впервые в этой игре */
  take(pid: number): FortRun | null {
    const run = this.runs.get(pid);
    if (!run) return null;
    this.runs.delete(pid);
    return run;
  }

  clear(): void {
    this.runs.clear();
  }
}

export interface SettleFinal {
  mvp: boolean;
  record: boolean;
  win: boolean;
}

/**
 * Выплата по забегу: только то, что ещё не платили (волны, сбитые), плюс бонусы итогов (final — игра закончилась при
 * нём). Отмечает выплаченное в run. null — платить нечего.
 */
export function settle(run: FortRun, final: SettleFinal | null): FtReward | null {
  const waves = Math.max(0, run.tokWaves - run.paidWaves);
  const killTok = killTokens(run.kills);
  const kills = Math.max(0, killTok - run.paidKillTok);
  const win = final?.win ? FT_TOK_WIN : 0;
  const mvp = final?.mvp ? FT_TOK_MVP : 0;
  const record = final?.record && run.waves > 0 ? FT_TOK_RECORD : 0;
  const total = waves + kills + win + mvp + record;
  if (total <= 0) return null;
  run.paidWaves = run.tokWaves;
  run.paidKillTok = killTok;
  return { total, n: run.waves, waves, kills, win, mvp, record };
}
