// Рулетка рыбака (флаг сервера ROULETTE): ставка — весь улов из рюкзака (его зафиксированная цена) на красное, чёрное
// или зелёное. Европейская рулетка: 37 лунок — 18 красных, 18 чёрных и зеро. Красное и чёрное платят ×2, зеро — 35:1
// (×36). Число выбирает сервер (crypto.randomInt), раунд общий: приём ставок, вращение, выплата жетонами.

import { BARKAS, BARKAS_DECK_Y, barkasHalf } from './barkas.ts';

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
 * Потолок одной выплаты, жетонов — выбрал владелец. Полный рюкзак (20 мест, модель) стоит у пристани 170–280, на
 * баркасе 225–360, на баркасе в дождь 480–570, с элем +15 %: зеро на любой такой улов платит честные ×36 (до 694),
 * упирается в потолок только улов с легендами и мификом. Красное и чёрное — только улов дороже 12 500.
 */
export const ROULETTE_MAX_PAYOUT = 25_000;
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

/** Строка табло рулетки: итог одной ставки в закончившемся розыгрыше (табло на баркасе и тост «кто выиграл») */
export interface RouletteLogRow {
  /** Номер раунда: у ставок одного розыгрыша он один */
  round: number;
  pid: number;
  nick: string;
  /** На что поставил и сколько (цена улова, жетонов) */
  c: RouletteColor;
  stake: number;
  /** Выплачено жетонами; 0 — проиграл */
  payout: number;
  /** Выпавшее число раунда */
  n: number;
}

/** Сколько последних ставок помнит табло (сервер хранит их в памяти) */
export const ROULETTE_LOG_SIZE = 10;

/** Новый розыгрыш — в начало журнала (самые свежие сверху), старше ROULETTE_LOG_SIZE отбрасываем */
export function pushRouletteLog(log: readonly RouletteLogRow[], rows: readonly RouletteLogRow[]): RouletteLogRow[] {
  return [...rows, ...log].slice(0, ROULETTE_LOG_SIZE);
}

/**
 * Стоит ли игрок на баркасе: внутри корпуса по обводу (shared/barkas.ts — едет вместе с баркасом, где бы он ни стоял), на
 * палубе или рядом над ней, не в воде. Табло и тосты рулетки идут только таким игрокам.
 */
export function onBarkas(x: number, y: number, z: number): boolean {
  return x >= BARKAS.bow && x <= BARKAS.stern && Math.abs(z - BARKAS.z) <= barkasHalf(x) && y > BARKAS_DECK_Y - 1.5 && y < BARKAS_DECK_Y + 4;
}

const fmt = new Intl.NumberFormat('ru-RU');
const num = (n: number): string => fmt.format(n);

/**
 * Тост о розыгрыше для тех, кто на баркасе: как сыграли остальные. Свои ставки в тост не входят — свой итог игрок видит
 * отдельно («Ты выиграл…»). Один розыгрыш — один тост: ставка одна — «Ник: 120 на красное — выиграл 240!» или «— проиграл»,
 * ставок несколько — одной строкой, не больше трёх имён. Нечего сказать (играл только ты сам) — null.
 */
export function rouletteDrawText(rows: readonly RouletteLogRow[], myPid: number): string | null {
  const rest = rows.filter((r) => r.pid !== myPid);
  if (rest.length === 0) return null;
  if (rest.length === 1) {
    const r = rest[0];
    return `🎡 ${r.nick}: ${num(r.stake)} на ${ROULETTE_COLOR_NAMES[r.c]} — ${r.payout > 0 ? `выиграл ${num(r.payout)}!` : 'проиграл'}`;
  }
  const head = rest.slice(0, 3).map((r) => `${r.nick} ${r.payout > 0 ? `+${num(r.payout)}` : `−${num(r.stake)}`}`).join(' · ');
  const n = rest[0].n;
  return `🎡 Выпало ${n} — ${ROULETTE_COLOR_NAMES[rouletteColor(n)]}: ${head}${rest.length > 3 ? ` · ещё ${rest.length - 3}` : ''}`;
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
