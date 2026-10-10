// Ферма: помощь соседям (design-v11 §8.1, §18.5). Очки помощи — 5 + (ур. − 1), полный сброс через 10 мин после
// первой траты; помощь — заряд лейки + очко, −20 % оставшегося времени чужой грядки. Лимиты: не себе, ур. ≥ 2,
// каждый сосед — раз на грядку за цикл, не больше 3 помощей на грядку, до созревания ≥ 20 с. Награда помощнику:
// +1 репутации (≤ 30 в сутки) и 1 🪙 (с одного соседа — не больше 5 раз в час). Сервер — server/farm/help.ts.
import { mskDay } from './economy.ts';
import { farmLevel, rollDay, type FarmBed, type FarmFail, type FarmProgress } from './farm.ts';
import {
  HELP_BASE, HELP_COIN, HELP_COINS_PER_NEIGHBOR_HOUR, HELP_MIN_LEFT_MS, HELP_REP, HELP_REP_DAY_CAP, HELPS_PER_BED,
} from './farmdata.ts';

const HOUR = 3600_000;
/** Ключ счётчика «кому помог сегодня»: hd:<pid> = номер МСК-дня (для «Друга локации» и «Вместе растём») */
export const HELP_DAY_KEY = 'hd:';

export function helpMax(level: number): number {
  return HELP_BASE + Math.max(0, level - 1);
}

/** Очки для показа: сброс прошёл — полный запас (ничего не меняет) */
export function helpView(f: FarmProgress, now: number): { points: number; max: number; resetAt: number } {
  const max = helpMax(farmLevel(f.xp));
  return f.help.resetAt <= now ? { points: max, max, resetAt: 0 } : { points: Math.min(max, f.help.points), max, resetAt: f.help.resetAt };
}

/** Лениво: время сброса прошло — запас полный, таймер стоит */
export function helpTick(f: FarmProgress, now: number): void {
  if (f.help.resetAt <= now) {
    f.help.points = helpMax(farmLevel(f.xp));
    f.help.resetAt = 0;
  }
}

/** Можно ли помочь этой грядке (pid — помощник); null — можно */
export function helpBlock(b: FarmBed, pid: number, now: number): FarmFail | null {
  if (!b.crop) return 'empty';
  if (b.ripeAt - now < HELP_MIN_LEFT_MS) return 'unripe';
  if (b.helpers.includes(pid)) return 'watered';
  if (b.helpers.length >= HELPS_PER_BED) return 'max';
  return null;
}

/** Награда за одну помощь соседу owner: репутация до дневного потолка и жетон до лимита в час */
export function helpReward(f: FarmProgress, owner: number, now: number): { rep: number; coins: number } {
  rollDay(f, now);
  let rep = 0;
  if (f.repHelpToday < HELP_REP_DAY_CAP) {
    rep = Math.min(HELP_REP, HELP_REP_DAY_CAP - f.repHelpToday);
    f.repHelpToday += rep;
    f.rep += rep;
  }
  const key = String(owner);
  const list = (f.help.coinsBy[key] ?? []).filter((t) => now - t < HOUR);
  let coins = 0;
  if (list.length < HELP_COINS_PER_NEIGHBOR_HOUR) {
    list.push(now);
    coins = HELP_COIN;
  }
  if (list.length) f.help.coinsBy[key] = list;
  else delete f.help.coinsBy[key];
  // старые записи о других соседях — прочь, чтобы профиль не рос
  for (const [k, ts] of Object.entries(f.help.coinsBy)) if (!ts.some((t) => now - t < HOUR)) delete f.help.coinsBy[k];
  return { rep, coins };
}

export function dayNum(now: number): number {
  return Math.floor(Date.parse(mskDay(now) + 'T00:00:00Z') / 86_400_000);
}

/** Отметить, что сегодня помог owner; вернёт, скольким разным соседям помог за сегодня */
export function markHelpTarget(f: FarmProgress, owner: number, now: number): number {
  const today = dayNum(now);
  f.counters[HELP_DAY_KEY + owner] = today;
  return helpTargetsToday(f, now);
}

export function helpTargetsToday(f: FarmProgress, now: number): number {
  const today = dayNum(now);
  let n = 0;
  for (const [k, v] of Object.entries(f.counters)) {
    if (!k.startsWith(HELP_DAY_KEY)) continue;
    if (v === today) n++;
    else if (v < today - 1) delete f.counters[k];
  }
  return n;
}
