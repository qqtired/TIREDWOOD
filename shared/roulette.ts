// Рулетка рыбака (флаг сервера ROULETTE): ставка — весь улов из рюкзака (его зафиксированная цена) на красное, чёрное
// или зелёное. Европейская рулетка: 37 лунок — 18 красных, 18 чёрных и зеро. Красное и чёрное платят ×2, зеро — 35:1
// (×36). Число выбирает сервер (crypto.randomInt), раунд общий: приём ставок, вращение, выплата жетонами.

export type RouletteColor = 'red' | 'black' | 'green';
export const ROULETTE_COLORS: readonly RouletteColor[] = ['red', 'black', 'green'];
export const ROULETTE_COLOR_NAMES: Readonly<Record<RouletteColor, string>> = { red: 'красное', black: 'чёрное', green: 'зеро' };

/** Порядок лунок на колесе (по часовой стрелке от зеро), как на европейском колесе */
export const ROULETTE_WHEEL: readonly number[] = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

/** Сколько раз возвращается ставка при выигрыше (вместе со ставкой) */
export const ROULETTE_PAYOUT: Readonly<Record<RouletteColor, number>> = { red: 2, black: 2, green: 36 };
/**
 * Потолок одной выплаты, жетонов. Временная цифра — окончательную согласует владелец (меняется одной строкой).
 * 10 000 — это ~8–9 ч рыбалки на пирсе или 10 бубнов: красное и чёрное упираются в потолок только при улове дороже
 * 5 000, зеро — при улове дороже 277 (полный рюкзак обычно 150–300, с тунцом или легендой — тысячи).
 */
export const ROULETTE_MAX_PAYOUT = 10_000;
/** Приём ставок после первой, мс; вращение колеса, мс */
export const ROULETTE_OPEN_MS = 10_000;
export const ROULETTE_SPIN_MS = 7_000;
/** С такого выигрыша (и любое зеро) — строка в общий чат */
export const ROULETTE_ANNOUNCE = 500;

export function rouletteColor(n: number): RouletteColor {
  return n === 0 ? 'green' : RED.has(n) ? 'red' : 'black';
}

/** Шанс цвета: 18/37, 18/37, 1/37 */
export function rouletteChance(c: RouletteColor): number {
  return c === 'green' ? 1 / 37 : 18 / 37;
}

/** Сколько принесёт ставка stake на цвет c, если цвет выпадет (с потолком ROULETTE_MAX_PAYOUT) */
export function rouletteWin(stake: number, c: RouletteColor): number {
  return Math.min(ROULETTE_MAX_PAYOUT, stake * ROULETTE_PAYOUT[c]);
}

/** Выплата за ставку stake на цвет c, если выпало n: 0 — проиграл */
export function roulettePayout(stake: number, c: RouletteColor, n: number): number {
  if (!Number.isSafeInteger(stake) || stake <= 0 || rouletteColor(n) !== c) return 0;
  return rouletteWin(stake, c);
}

export function isRouletteColor(v: unknown): v is RouletteColor {
  return v === 'red' || v === 'black' || v === 'green';
}

export interface RouletteBetView {
  pid: number;
  nick: string;
  c: RouletteColor;
  /** Цена поставленного улова, жетонов */
  stake: number;
  /** Сколько рыб */
  fish: number;
}

/** Стол для всех на набережной: фаза, сколько мс до её конца (в момент отправки), ставки, номер раунда, выпавшее число */
export interface RouletteView {
  phase: 'idle' | 'open' | 'spin';
  left: number;
  round: number;
  bets: RouletteBetView[];
  /** Выпавшее число — во время вращения и после (до следующего приёма) */
  n?: number;
}
