// Однорукие бандиты на набережной: символы, ленты барабанов, ставки, таблицы выплат.
// «Лесенка»: чем дороже автомат, тем чаще выигрыш и джекпот и тем больше комбинаций — по одной новой на каждый
// следующий, — но в среднем казино всё равно в плюсе. Числа проверены полным перебором 64³ исходов
// (test/slots.test.ts):
//   Копеечка   выигрыш 20,5 %, джекпот 1 из 1214, возврат 89,5 % (с банком 94,5 %)
//   Пятак      выигрыш 32,2 %, джекпот 1 из 1040, возврат 89,9 % (с банком 94,9 %)
//   Червонец   выигрыш 35,9 %, джекпот 1 из  892, возврат 90,7 % (с банком 95,7 %)
//   Четвертак  выигрыш 40,3 %, джекпот 1 из  764, возврат 91,0 % (с банком 96,2 %)
//   Полтинник  выигрыш 53,1 %, джекпот 1 из  669, возврат 88,6 % (с банком 96,6 %)
// «С банком» — если играть только на этом автомате: 5 % ставок копятся в банке и возвращаются джекпотом,
// на Полтиннике ещё и затравка банка до 1000 после каждого джекпота.

export const SYMBOLS = ['cherry', 'lemon', 'bell', 'anchor', 'star', 'seven'] as const;
export const SYMBOL_EMOJI = ['🍒', '🍋', '🔔', '⚓', '⭐', '7️⃣'] as const;
export const CHERRY = 0;
export const SEVEN = 5;

/** Положений на ленте барабана */
export const REEL_SIZE = 64;
/**
 * Ленты: REELS[автомат][барабан][символ] — сколько положений у символа (сумма 64). На дорогих лишняя семёрка
 * (вместо якоря) на третьем, потом на втором барабане — джекпот чуть чаще.
 */
export const REELS: ReadonlyArray<ReadonlyArray<readonly number[]>> = [
  [[16, 14, 14, 8, 6, 6], [16, 14, 14, 8, 6, 6], [16, 14, 14, 8, 6, 6]],
  [[15, 13, 12, 11, 7, 6], [15, 13, 12, 11, 7, 6], [15, 13, 12, 10, 7, 7]],
  [[13, 15, 12, 11, 7, 6], [13, 15, 12, 10, 7, 7], [13, 15, 12, 10, 7, 7]],
  [[13, 15, 12, 10, 7, 7], [13, 15, 12, 10, 7, 7], [13, 15, 12, 10, 7, 7]],
  [[13, 15, 12, 10, 7, 7], [13, 15, 12, 10, 7, 7], [13, 15, 12, 9, 7, 8]],
];

/** Ставки пяти автоматов, слева направо. */
export const STAKES: readonly number[] = [1, 5, 10, 25, 50];
export const MACHINE_NAMES: readonly string[] = ['Копеечка', 'Пятак', 'Червонец', 'Четвертак', 'Полтинник'];

/** Три семёрки — джекпот: ставка ×100 и доля банка */
export const JACKPOT_MULT = 100;
/** Выигрыш от ×20 ставки объявляется в общем чате */
export const BIG_WIN_MULT = 20;

/**
 * Строка таблицы выплат. triple — три одинаковых; pair — ровно два таких символа где угодно; left — символ на первом
 * барабане (остальные любые); mix — на всех трёх символы из набора, но не три одинаковых.
 */
export interface PayLine {
  kind: 'triple' | 'pair' | 'left' | 'mix';
  syms: readonly number[];
  /** Выплата в жетонах (джекпот — ставка ×100, долю банка добавляет сервер) */
  win: number;
}

const tri = (s: number, win: number): PayLine => ({ kind: 'triple', syms: [s], win });
const pair = (s: number, win: number): PayLine => ({ kind: 'pair', syms: [s], win });
const left = (s: number, win: number): PayLine => ({ kind: 'left', syms: [s], win });
const mix = (syms: number[], win: number): PayLine => ({ kind: 'mix', syms, win });
const SEA = [3, 4, 5];
const FRUIT = [0, 1, 2];

/** Таблицы выплат, по убыванию выплаты (так они и написаны на автоматах). Каждый следующий — на строку длиннее. */
export const PAYTABLES: ReadonlyArray<readonly PayLine[]> = [
  [tri(5, 100), tri(4, 50), tri(3, 20), tri(2, 15), tri(1, 10), tri(0, 6), pair(5, 4), pair(0, 2)],
  [tri(5, 500), tri(4, 250), tri(3, 100), tri(2, 75), tri(1, 50), tri(0, 30), pair(5, 20), pair(0, 10), left(0, 1)],
  [tri(5, 1000), tri(4, 500), tri(3, 200), tri(2, 150), tri(1, 100), tri(0, 60), pair(5, 40), pair(0, 20), left(5, 4), left(0, 2)],
  [tri(5, 2500), tri(4, 1250), tri(3, 500), tri(2, 375), tri(1, 200), tri(0, 150), pair(5, 100), pair(0, 40), mix(SEA, 30), left(5, 10), left(0, 5)],
  [tri(5, 5000), tri(4, 2000), tri(3, 800), tri(2, 600), tri(1, 400), tri(0, 250), pair(5, 200), mix(SEA, 75), pair(0, 50), mix(FRUIT, 20), left(5, 20), left(0, 10)],
];

/** Банк джекпота: доля каждой ставки и минимум */
export const POOL_SHARE = 0.05;
export const POOL_MIN = 1000;

// Время: барабаны останавливаются по очереди, итог — через 2,4 с, снова крутить — через 2,6 с
export const REEL_STOP_MS: readonly number[] = [1200, 1700, 2200];
export const SPIN_MS = 2400;
export const SPIN_TICKS = 144;
export const SPIN_READY_TICKS = 156;
/** Минуту не крутишь — автомат освобождается (чтобы не занимали и не уходили); за 10 с — предупреждение */
export const SLOT_AFK_TICKS = 60 * 60;
export const SLOT_AFK_WARN_TICKS = 50 * 60;

/** Символ на барабане reel автомата m по случайному числу 0..63 (накопленные положения ленты). */
export function symbolFromRoll(m: number, reel: number, r: number): number {
  const w = REELS[m][reel];
  let acc = 0;
  for (let i = 0; i < w.length; i++) {
    acc += w[i];
    if (r < acc) return i;
  }
  return w.length - 1;
}

/** Подходит ли строка таблицы к выпавшему. */
export function lineMatches(l: PayLine, reels: readonly number[]): boolean {
  const s = l.syms[0];
  const same = reels[0] === reels[1] && reels[1] === reels[2];
  switch (l.kind) {
    case 'triple':
      return same && reels[0] === s;
    case 'pair':
      return reels.filter((x) => x === s).length === 2;
    case 'left':
      return reels[0] === s;
    case 'mix':
      return !same && reels.every((x) => l.syms.includes(x));
  }
}

/** Итог вращения автомата m: платит лучшая подходящая строка (line — её номер в таблице, −1 — пусто). */
export function evaluate(m: number, reels: readonly number[]): { win: number; line: number; jackpot: boolean } {
  const table = PAYTABLES[m];
  let line = -1;
  for (let i = 0; i < table.length; i++) {
    if (lineMatches(table[i], reels) && (line < 0 || table[i].win > table[line].win)) line = i;
  }
  const jackpot = reels[0] === SEVEN && reels[1] === SEVEN && reels[2] === SEVEN;
  return { win: line < 0 ? 0 : table[line].win, line, jackpot };
}

/** Банк после ставки: плюс 5 % от неё. Храним с точностью до сотых — иначе 0,05 копятся с хвостом и табло недосчитывает. */
export function poolAfterStake(pool: number, stake: number): number {
  return Math.round((pool + stake * POOL_SHARE) * 100) / 100;
}

/** Выплата джекпота: ставка ×100 и доля банка (весь банк — на ставке 50). */
export function jackpotPayout(stake: number, pool: number): { win: number; share: number; poolAfter: number } {
  const share = Math.floor((pool * stake) / 50);
  return { win: stake * JACKPOT_MULT + share, share, poolAfter: Math.max(POOL_MIN, pool - share) };
}
