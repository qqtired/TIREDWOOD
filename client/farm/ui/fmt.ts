// Форматы и «ленивые» значения фермы без DOM и без import.meta.glob: их грузят и окна, и тесты (test/farm-ui.test.ts).
import { mskDay } from '../../../shared/economy.ts';
import { pigTick, wellNextAt, wellTick, type FarmProgress } from '../../../shared/farm.ts';
import { PIG_EVERY_MS, PIG_STORE } from '../../../shared/farmdata.ts';

export function fmtMin(min: number): string {
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

/** Остаток времени: до часа — «6:40», дальше — «5 ч 12 мин» */
export function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)} ч ${Math.floor((s % 3600) / 60)} мин`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Число с запятой и одним знаком: 2,2 */
export function dec(n: number): string {
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

export function big(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}

// ------------------------------------------------------------ время по Москве (UTC+3, без летнего)

const MSK = 3 * 3600_000;
export const mskHour = (now: number): number => new Date(now + MSK).getUTCHours();
/** Сколько мс до 00:00 МСК: обновление заказов, сброс потолка продаж */
export function msToMskMidnight(now: number): number {
  return 86_400_000 - ((now + MSK) % 86_400_000);
}
export const msToNextHour = (now: number): number => 3_600_000 - (now % 3_600_000);
export const clockHour = (h: number): string => `${String(((h % 24) + 24) % 24).padStart(2, '0')}:00`;

/** Сколько жетонов выплачено Грибом и Фургоном за сегодняшние МСК-сутки */
export function soldToday(f: FarmProgress, now: number): number {
  return f.sold.day === mskDay(now) ? f.sold.coins : 0;
}

// ------------------------------------------------------------ колодец и свин: значения на сейчас

/** Наборы воды и когда будет следующий (0 — колодец полон); сам профиль не трогаем */
export function wellView(f: FarmProgress, now: number): { sets: number; nextAt: number } {
  const c = { well: { ...f.well } } as FarmProgress;
  wellTick(c, now);
  return { sets: c.well.sets, nextAt: wellNextAt(c) };
}

/** Свин: сколько трюфелей в загоне сейчас и когда будет следующий (0 — загон полон) */
export function pigView(f: FarmProgress, now: number): { stored: number; nextAt: number } | null {
  if (!f.built.pig) return null;
  const c = { built: { ...f.built, pig: { ...f.built.pig } } } as FarmProgress;
  pigTick(c, now);
  const p = c.built.pig!;
  return { stored: p.stored, nextAt: p.stored >= PIG_STORE ? 0 : p.since + PIG_EVERY_MS };
}

/** 1 грядка, 2 грядки, 5 грядок */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
