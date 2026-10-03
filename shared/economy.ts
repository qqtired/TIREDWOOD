// Жетоны: сколько дают и сколько стоит. Одна валюта на все игры, за настоящие деньги не продаётся.
import type { Tier } from './outfit.ts';

export const START_TOKENS = 100;
export const DAILY_BONUS = 50;

// Пейнтбол (выпуск 6: все награды в режимах — примерно ×1,5)
export const PB_ROUND = 15;
export const PB_KILL = 3;
export const PB_KILL_CAP = 45;
export const PB_WIN = 20;
export const PB_MVP = 15;
/** Минимум минута в фазе боя, иначе раунд не засчитывается */
export const PB_MIN_PLAY_TICKS = 3600;
/** 90 с без движения в пейнтболе — отправляем на набережную */
export const PB_AFK_TICKS = 5400;

// Цены только будущих покупок: владение и выданные награды не меняются.
// Премиальные вещи — долгосрочная цель за игровые жетоны, без преимуществ в игре.
export const TIER_PRICE: Partial<Record<Tier, number>> = { common: 300, rare: 1200, epic: 3600, premium: 12000 };

/** Календарный день по Москве (UTC+3, без перехода на летнее время): 'ГГГГ-ММ-ДД'. */
export function mskDay(ms: number): string {
  return new Date(ms + 3 * 3600_000).toISOString().slice(0, 10);
}

/** Цена вещи или null, если её не купить (бесплатная, с джекпота, системная). */
export function itemPrice(tier: Tier): number | null {
  return TIER_PRICE[tier] ?? null;
}

// Дурак
export const DK_FINISH = 15;
export const DK_NOT_FOOL = 15;
/** За первое место — столько за каждого соперника за столом (боты считаются): вдвоём 8, вшестером 40 */
export const DK_FIRST = 8;
/** Колпак дурака (и погоны) — на 10 минут */
export const FOOL_MS = 600_000;

// Картинг: за финиш и за первые три места (место — среди всех картов, с ботами)
export const RC_FINISH = 15;
export const RC_PLACE = [40, 25, 15] as const;

/** Статистика профиля (показывается в профиле и на доске почёта) */
export interface Stats {
  pbRounds: number;
  pbWins: number;
  pbKills: number;
  pbMvp: number;
  spins: number;
  slotWon: number;
  bestWin: number;
  jackpots: number;
  dkGames: number;
  dkFools: number;
  dkFirst: number;
  rcRaces: number;
  rcWins: number;
  rcPodiums: number;
  /** Лучший круг, мс (0 — не было) */
  rcBestLap: number;
  /** Лучший круг трассы «Литейная», мс; отдельно от исходной портовой трассы. */
  rcBestLapFoundry: number;
  /** Рыбалка: вытащено (с хламом) и продано за жетоны */
  fsCaught: number;
  fsSold: number;
  /**
   * Рыбалка 2.0 (доска у мостков): коллекционных рыб и их вес, граммы; «сегодня» — за день fsDay (номер дня по Москве,
   * shared/fishrules.ts mskDayNum); сундуков
   */
  fsFish: number;
  fsGrams: number;
  fsDay: number;
  fsDayFish: number;
  fsDayGrams: number;
  fsChests: number;
  /** Новые счётчики: забросы, поклёвки, сорвавшиеся настоящие рыбы; исторические значения до патча неизвестны. */
  fsCasts: number;
  fsBites: number;
  fsLost: number;
  /** Самая тяжёлая настоящая рыба, граммы (при миграции восстанавливается из альбома). */
  fsMaxGrams: number;
  /** Жетоны рыбалки с введения счётчика: продажа рыб/сундуков, новые виды и награды квестов. */
  fsEarned: number;
  /** Аквапарк: сколько раз прошёл полосу и лучшее время, мс (0 — не проходил) */
  aqRuns: number;
  aqBest: number;
  /**
   * Автоматы для «Топа проигравших»: сколько поставил и сколько выиграл (с джекпотами) — только со 2 октября.
   * Раньше ставки не записывались, поэтому slotWon (выигрыши за всё время) с ними не сравнить.
   */
  slotBet: number;
  slotPaid: number;
  /** «Крепость»: игр (дождался итогов), побед, лучшая волна (сколько отбито за игру), сбитых зомби */
  ftGames: number;
  ftWins: number;
  ftBest: number;
  ftKills: number;
  /** «Fight Club»: боёв (дрался и дождался итогов), побед, нокаутов */
  fcFights: number;
  fcWins: number;
  fcKos: number;
  stStorms: number;
  stLights: number;
  prRaids: number;
  prWins: number;
  prKos: number;
  brRaces: number;
  brWins: number;
  /** Лучший круг катера, тики, 0 — не было (старая «Лазурная бухта»: несравним с новой трассой). */
  brBestLap: number;
  /** Лучший круг «Портовой регаты» (трасса harbor-v1), тики, 0 — не было. */
  brBestLapHarbor: number;
  hiGames: number;
  hiWins: number;
  hiFound: number;
  hiSurvived: number;
  /**
   * «Выше облаков» (Небесная каланча): подъёмов до колокола, лучшее время (мс, 0 — не было), лучшая медаль
   * (1 бронза, 2 серебро, 3 золото), значок «без падений» (0/1), день по Москве последнего подъёма (за первый — жетоны)
   */
  skRuns: number;
  skBest: number;
  skMedal: number;
  skClean: number;
  skDay: number;
}

export function emptyStats(): Stats {
  return {
    pbRounds: 0, pbWins: 0, pbKills: 0, pbMvp: 0, spins: 0, slotWon: 0, bestWin: 0, jackpots: 0, dkGames: 0, dkFools: 0, dkFirst: 0,
    rcRaces: 0, rcWins: 0, rcPodiums: 0, rcBestLap: 0, rcBestLapFoundry: 0, fsCaught: 0, fsSold: 0, aqRuns: 0, aqBest: 0, slotBet: 0, slotPaid: 0,
    fsFish: 0, fsGrams: 0, fsDay: 0, fsDayFish: 0, fsDayGrams: 0, fsChests: 0,
    fsCasts: 0, fsBites: 0, fsLost: 0, fsMaxGrams: 0, fsEarned: 0,
    ftGames: 0, ftWins: 0, ftBest: 0, ftKills: 0, fcFights: 0, fcWins: 0, fcKos: 0,
    stStorms: 0, stLights: 0, prRaids: 0, prWins: 0, prKos: 0, brRaces: 0, brWins: 0, brBestLap: 0, brBestLapHarbor: 0, hiGames: 0, hiWins: 0, hiFound: 0, hiSurvived: 0,
    skRuns: 0, skBest: 0, skMedal: 0, skClean: 0, skDay: 0,
  };
}

export interface DkReward {
  total: number;
  finish: number;
  notFool: number;
  first: number;
}

/**
 * Жетоны за партию в дурака тому, кто доиграл её за столом. players — сколько было за столом вместе с ботами:
 * чем больше соперников, тем труднее выйти первым — и тем больше за это.
 */
export function durakReward(r: { fool: boolean; first: boolean; players: number }): DkReward {
  const notFool = r.fool ? 0 : DK_NOT_FOOL;
  const first = r.first && !r.fool ? DK_FIRST * Math.max(1, r.players - 1) : 0;
  return { total: DK_FINISH + notFool + first, finish: DK_FINISH, notFool, first };
}

export interface PbReward {
  total: number;
  round: number;
  kills: number;
  win: number;
  mvp: number;
}

export function paintballReward(r: { playTicks: number; kills: number; won: boolean; mvp: boolean }): PbReward | null {
  if (r.playTicks < PB_MIN_PLAY_TICKS) return null;
  const kills = Math.min(PB_KILL_CAP, PB_KILL * r.kills);
  const win = r.won ? PB_WIN : 0;
  const mvp = r.mvp ? PB_MVP : 0;
  return { total: PB_ROUND + kills + win + mvp, round: PB_ROUND, kills, win, mvp };
}

export interface RcReward {
  total: number;
  finish: number;
  place: number;
  /** Место с 1 */
  pos: number;
}

/** Жетоны тому, кто доехал до финиша. */
export function raceReward(pos: number): RcReward {
  const place = RC_PLACE[pos - 1] ?? 0;
  return { total: RC_FINISH + place, finish: RC_FINISH, place, pos };
}
