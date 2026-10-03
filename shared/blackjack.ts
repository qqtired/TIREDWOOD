// Открытые правила и DTO. Колода и закрытая карта дилера остаются на сервере.
export const BJ_TABLE = 2;
/** Фишки в панели ставок: клик добавляет номинал, сумма набирается из любых (на столе — ещё 1 и 5 для остатков). */
export const BJ_CHIPS: readonly number[] = [10, 20, 50, 100];
/** Лимит стола: ставка — любое целое от 1 до этого числа (0 — играть бесплатно); баланс проверяет сервер при резерве. */
export const BJ_MAX_BET = 500;
export const BJ_COUNT_TICKS = 300;
export const BJ_TURN_TICKS = 1200;
export const BJ_DEALER_TICKS = 60;
export const BJ_RESULT_TICKS = 360;
/** Сколько жетонов реально можно поставить: не больше баланса и не больше лимита стола. */
export const maxBet = (balance: number): number => Math.max(0, Math.min(BJ_MAX_BET, Math.floor(Number.isFinite(balance) ? balance : 0)));
/** Допустимая ставка по правилам стола (без баланса): целое число 0…лимит; 0 — бесплатно. Принимает что угодно: клиенту веры нет. */
export const isBet = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= BJ_MAX_BET;
/** Полный возврат за блэкджек: ставка и ещё 3:2; дробный жетон отбрасывается (ставка 5 → 5 + 7), дробей в кошельке нет. */
export const naturalPayout = (bet: number): number => bet + Math.floor((bet * 3) / 2);
export const SUIT_SIGNS = ['♠', '♣', '♦', '♥'] as const;
export const RANK_NAMES = ['Т', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'В', 'Д', 'К'] as const;
export const suitOf = (c: number): number => Math.floor(c / 13);
export const rankOf = (c: number): number => c % 13;
export const cardName = (c: number): string => c < 0 ? 'Закрытая карта' : RANK_NAMES[rankOf(c)] + SUIT_SIGNS[suitOf(c)];
export const isRed = (c: number): boolean => suitOf(c) >= 2;
export function handValue(cards: readonly number[]): { total: number; soft: boolean } {
  let total = 0, aces = 0;
  for (const card of cards) {
    const rank = rankOf(card);
    if (rank === 0) { total += 11; aces++; } else total += Math.min(rank + 1, 10);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}
/** `skip` — «дальше»: после итога — следующая раздача, после ставок — раздать сейчас; срабатывает, когда нажали все участвующие. */
export type BlackjackAct = 'bet' | 'cancel' | 'hit' | 'stand' | 'double' | 'split' | 'skip';
export type BlackjackPhase = 'betting' | 'countdown' | 'play' | 'dealer' | 'result';
export interface BlackjackHandView {
  cards: number[];
  bet: number;
  total: number;
  soft: boolean;
  status: 'playing' | 'stood' | 'bust' | 'blackjack';
  result: null | 'win' | 'loss' | 'push' | 'blackjack';
  /** Полный возврат, включая ставку: 0, ставка, 2× или блэкджек (`naturalPayout`, 3:2 с округлением вниз). */
  payout: number;
}
export interface BlackjackSeatView {
  k: 0 | 1;
  id: number;
  pid?: number;
  participating?: boolean;
  nick: string;
  away: boolean;
  bet: number;
  hands: BlackjackHandView[];
  actions: BlackjackAct[];
  /** Нажал «дальше» (`skip`) и ждёт остальных участвующих. */
  skip?: boolean;
}
export interface BlackjackView {
  table: typeof BJ_TABLE;
  phase: BlackjackPhase;
  /** Версия меняется только при действии или переходе, не при отсчёте таймера. */
  rev: number;
  left: number;
  turn: number;
  hand: number;
  dealer: number[];
  dealerTotal: number | null;
  seats: BlackjackSeatView[];
}
