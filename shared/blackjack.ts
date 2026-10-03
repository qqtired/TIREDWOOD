// Открытые правила и DTO. Колода и закрытая карта дилера остаются на сервере.
export const BJ_TABLE = 2;
export const BJ_BETS: readonly number[] = [0, 10, 20, 50];
export const BJ_COUNT_TICKS = 300;
export const BJ_TURN_TICKS = 1200;
export const BJ_DEALER_TICKS = 60;
export const BJ_RESULT_TICKS = 480;
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
export type BlackjackAct = 'bet' | 'cancel' | 'hit' | 'stand' | 'double' | 'split';
export type BlackjackPhase = 'betting' | 'countdown' | 'play' | 'dealer' | 'result';
export interface BlackjackHandView {
  cards: number[];
  bet: number;
  total: number;
  soft: boolean;
  status: 'playing' | 'stood' | 'bust' | 'blackjack';
  result: null | 'win' | 'loss' | 'push' | 'blackjack';
  /** Полный возврат, включая ставку: 0, ставка, 2× или 2.5×. */
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
