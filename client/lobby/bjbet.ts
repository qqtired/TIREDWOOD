// Ставка блэкджека без DOM и three: раскладка суммы на фишки стола и набор ставки в панели (клик по фишке, поле суммы).
// Здесь только арифметика; правила (лимит стола, баланс, целые числа) — в shared/blackjack.ts, окончательно решает сервер.
import { BJ_MAX_BET, maxBet } from '../../shared/blackjack.ts';

/** Номиналы фишек на столе, от крупных к мелким (1 и 5 — для остатков суммы; в панели кликают по BJ_CHIPS) */
export const BJ_DENOMS = [100, 50, 20, 10, 5, 1] as const;
/** Выше стопки не бывает: 500 = пять фишек по 100, самый длинный набор до лимита — 12 фишек */
const MAX_STACK = 12;

/** Сумма → номиналы фишек снизу вверх: крупные внизу. Бесплатная ставка (0) — без фишек: серую фишку рисует стол. */
export function chipsFor(amount: number): number[] {
  let rest = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  const out: number[] = [];
  for (const d of BJ_DENOMS) {
    while (rest >= d && out.length < MAX_STACK) {
      out.push(d);
      rest -= d;
    }
  }
  return out;
}

/** Фишку можно добавить, если сумма после неё не выше доступного (баланс, лимит стола). */
export function canAdd(draft: number, chip: number, balance: number): boolean {
  return Number.isInteger(chip) && chip > 0 && draft + chip <= maxBet(balance);
}

/** Клик по фишке: прибавить номинал (если помещается), иначе сумма прежняя. */
export function addChip(draft: number, chip: number, balance: number): number {
  return canAdd(draft, chip, balance) ? draft + chip : draft;
}

/** Число из поля: только цифры, не больше доступного; пусто и мусор — 0. */
export function parseAmount(text: string, balance: number): number {
  const digits = text.replace(/\D/g, '').slice(0, 6);
  return Math.min(digits ? Number(digits) : 0, maxBet(balance));
}

/** Подпись под полем: что можно поставить — «до 100 (у тебя)», «до 500 (лимит стола)». */
export function limitHint(balance: number): string {
  const cap = maxBet(balance);
  if (cap <= 0) return 'жетонов нет — играй бесплатно';
  return cap < BJ_MAX_BET ? `до ${cap} — столько у тебя` : `до ${BJ_MAX_BET} — лимит стола`;
}
