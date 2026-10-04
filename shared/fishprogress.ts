// Shared pure progression API. The server owns catch/quest commits and cast-time snapshots.
// fisheco: рюкзак с уловом (продаётся Семёну или Сане), лучший рюкзак и блесна, эль; снимок бонусов заброса — с местом
// (пристань/баркас), напитком и блесной; опыт ×0,4 (+20 %), баркас ×1,25, утешение за сорвавшуюся эпическую+.
// 04.10: легендарная удочка за 15-е задание (зона и поклёвка +40 %, редкие и выше ×1,2), платиновая блесна, водка
// рыбацкая (vodkaUntil), уровень — ровно +2,5 % за уровень от базы (редкие и выше, теперь и божественная).
import { FISH } from './fishing.ts';
import type { FishZone } from './fishplaces.ts';
import {
  BARKAS_XP, CONSOLATION_SHARE, CONSOLATION_TICKS, RAIN_XP, SEA_DRAIN, SEA_FIGHT, T_EPIC, T_LEGEND, T_MYTH, XP_SCALE, isCollected, ruleOf, tierRank,
} from './fishrules.ts';
import { ALE, BAGS, BAG_MAX, BEER, LORD, LURES, RAIN_DRUM_PRICE as DRUM_PRICE, VODKA, bagCapacity, lureOf, type ShopDrink } from './fishshop.ts';
import { GRADE_PLAIN, gradeXp, type ReelGrade } from './fishreel.ts';

/** Удочка за задания: 0 — обычная, 1 — продвинутая, 2 — профессиональная, 3 — мастерская, 4 — легендарная */
export type FishRod = 0 | 1 | 2 | 3 | 4;
/** Купленный рюкзак (1–3) или блесна (1–4): 0 — нет, иначе номер в shared/fishshop.ts */
export type FishGear = 0 | 1 | 2 | 3 | 4;
/** Удочки за задания: после скольких выполненных заданий открывается и бонус (зона и поклёвка +bonus, редкие и выше ×(1 + bonus/2)) */
export const RODS: ReadonlyArray<{ rod: FishRod; name: string; quests: number; bonus: number }> = [
  { rod: 0, name: 'Обычная', quests: 0, bonus: 0 },
  { rod: 1, name: 'Продвинутая', quests: 1, bonus: 0.1 },
  { rod: 2, name: 'Профессиональная', quests: 5, bonus: 0.2 },
  { rod: 3, name: 'Мастерская', quests: 10, bonus: 0.3 },
  { rod: 4, name: 'Легендарная', quests: 15, bonus: 0.4 },
];
/** Лучшая удочка */
export const ROD_MAX = RODS[RODS.length - 1].rod;
/** +2,5 % к шансу за уровень рыбалки от базового (редкие и выше, и божественная) */
export const LEVEL_ODDS = 0.025;

/** Рыба в рюкзаке: цена и множители зафиксированы при поимке */
export interface BagFish {
  /** Номер улова в профиле: продать или отпустить именно эту рыбу */
  n: number;
  /** Вид (ключ альбома) */
  f: string;
  /** Граммы */
  g: number;
  /** Цена, жетонов */
  p: number;
  /** Множители при поимке, биты BAG_* */
  m: number;
}

export const BAG_BARKAS = 1;
export const BAG_RAIN = 2;
export const BAG_BEER = 4;
export const BAG_ALE = 8;
/** Пиво подводного владыки (из сундука) */
export const BAG_LORD = 16;
/** Все биты множителей рыбы в рюкзаке (водка цену не меняет — своего бита у неё нет) */
export const BAG_BITS = BAG_BARKAS | BAG_RAIN | BAG_BEER | BAG_ALE | BAG_LORD;

export interface FishProgress {
  xp: number;
  questsDone: number;
  questCaught: number;
  rod: FishRod;
  beerUntil: number;
  aleUntil: number;
  /** Пиво подводного владыки (из сундука) действует до; нет — не пили (в старых сохранениях его и не было) */
  lordUntil?: number;
  /** Водка рыбацкая действует до; нет — не пили (в старых сохранениях её и не было) */
  vodkaUntil?: number;
  bagTier: FishGear;
  lure: FishGear;
  bag: BagFish[];
  bagSeq: number;
}

export interface FishCastMods {
  level: number;
  rod: FishRod;
  zoneScale: number;
  biteSpeed: number;
  /** Шанс редких и выше (и божественной): уровень (1 + 0,025·ур) × удочка × напиток */
  rareMultiplier: number;
  /** Доход от рыбы: напиток (×1,1 пиво, ×1,15 эль, ×1,2 пиво подводного владыки) */
  incomeScale: number;
  /** Где заброс: пристань или баркас (×1,25 к доходу и опыту, свой пул, злее рыба) */
  zone: FishZone;
  /** Напиток: 0 — нет, 1 — пиво, 2 — эль, 3 — пиво подводного владыки, 4 — водка рыбацкая */
  drink: FishDrink;
  /** Блесна на леске */
  lure: FishGear;
  /** Ещё шанс эпических и выше: блесна */
  epicMultiplier: number;
  /** Рывки мягче на долю: блесна */
  calm: number;
  /** Море: рывки ×sea, сопротивление ×seaDrain */
  sea: number;
  seaDrain: number;
  /** Водка: шанс эпических, легендарных и мифических ×top (нет — 1) */
  topMultiplier?: number;
  /** Водка: зона на шкале ×zoneMul (нет — 1) */
  zoneMul?: number;
  /** Водка: скорость рывков рыбы ×jerkMul (нет — 1) */
  jerkMul?: number;
}

export const BEER_PRICE = BEER.price;
export const BEER_MS = BEER.ms;
export const ALE_PRICE = ALE.price;
export const ALE_MS = ALE.ms;
export const LORD_MS = LORD.ms;
export const VODKA_PRICE = VODKA.price;
export const VODKA_MS = VODKA.ms;
/** Напиток: 0 — нет, 1 — пиво, 2 — эль, 3 — пиво подводного владыки, 4 — водка рыбацкая */
export type FishDrink = 0 | 1 | 2 | 3 | 4;
export const RAIN_DRUM_PRICE = DRUM_PRICE;

export function emptyFishProgress(): FishProgress {
  return { xp: 0, questsDone: 0, questCaught: 0, rod: 0, beerUntil: 0, aleUntil: 0, bagTier: 0, lure: 0, bag: [], bagSeq: 0 };
}

/** Cumulative thresholds from Stardew Valley Fishing, https://stardewvalleywiki.com/Fishing#Experience_Points. */
export const FISH_XP_LEVELS: readonly number[] = [0, 100, 380, 770, 1300, 2150, 3300, 4800, 6900, 10_000, 15_000];

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(value))) : 0;
}

function gear(value: unknown, max: number): FishGear {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0 && value <= max ? value as FishGear : 0;
}

/** Рыба из сохранения: известный вид коллекции, целые числа в разумных пределах; иначе — null (эта рыба отбрасывается). */
function bagFish(raw: unknown): BagFish | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const sp = typeof r.f === 'string' ? FISH.findIndex((f) => f.id === r.f) : -1;
  if (sp < 0 || !isCollected(sp)) return null;
  const ok = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;
  if (!ok(r.n, Number.MAX_SAFE_INTEGER) || !ok(r.g, 10_000_000) || r.g === 0 || !ok(r.p, 1_000_000) || !ok(r.m, BAG_BITS)) return null;
  return { n: r.n, f: r.f as string, g: r.g, p: r.p, m: r.m };
}

export function normalizeFishProgress(raw: unknown): FishProgress {
  if (!raw || typeof raw !== 'object') return emptyFishProgress();
  const r = raw as Record<string, unknown>;
  const questsDone = count(r.questsDone);
  const selected = Number.isInteger(r.rod) && typeof r.rod === 'number' && r.rod >= 0 && r.rod <= ROD_MAX ? r.rod as FishRod : 0;
  const bag: BagFish[] = [];
  const seen = new Set<number>();
  if (Array.isArray(r.bag)) for (const item of r.bag) {
    const f = bagFish(item);
    if (f && !seen.has(f.n) && bag.length < BAG_MAX) { seen.add(f.n); bag.push(f); }
  }
  const top = bag.reduce((m, f) => Math.max(m, f.n + 1), 0);
  return {
    xp: count(r.xp), questsDone, questCaught: count(r.questCaught),
    rod: Math.min(selected, unlockedRod(questsDone)) as FishRod,
    beerUntil: count(r.beerUntil),
    aleUntil: count(r.aleUntil),
    ...(count(r.lordUntil) > 0 ? { lordUntil: count(r.lordUntil) } : {}),
    ...(count(r.vodkaUntil) > 0 ? { vodkaUntil: count(r.vodkaUntil) } : {}),
    bagTier: gear(r.bagTier, BAGS.length),
    lure: gear(r.lure, LURES.length),
    bag,
    bagSeq: Math.max(count(r.bagSeq), top),
  };
}

export function fishLevel(xp: number): number {
  const n = count(xp);
  let level = 0;
  while (level < 10 && n >= FISH_XP_LEVELS[level + 1]) level++;
  return level;
}

export function fishLevelView(xp: number): { level: number; xp: number; from: number; next: number | null } {
  const n = count(xp);
  const level = fishLevel(n);
  return { level, xp: n, from: FISH_XP_LEVELS[level], next: level < 10 ? FISH_XP_LEVELS[level + 1] : null };
}

export function questNeed(questsDone: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, (count(questsDone) + 1) * 5);
}

/** Лучшая заработанная удочка: за 1-е, 5-е, 10-е и 15-е задание */
export function unlockedRod(questsDone: number): FishRod {
  const n = count(questsDone);
  let best: FishRod = 0;
  for (const r of RODS) if (n >= r.quests) best = r.rod;
  return best;
}

/** Бонус удочки: зона и скорость поклёвки +bonus (0,1 … 0,4) */
export function rodBonus(rod: FishRod): number {
  return RODS[rod]?.bonus ?? 0;
}

/** Шанс редких и выше от удочки: ×(1 + 0,05·удочка) — 1,05 … 1,2 */
export function rodOdds(rod: number): number {
  return 1 + 0.05 * (RODS[rod]?.rod ?? 0);
}

/** Шанс от уровня рыбалки: +2,5 % за уровень от базового (на 10-м ×1,25) */
export function levelOdds(level: number): number {
  return 1 + LEVEL_ODDS * Math.min(10, Math.max(0, Math.trunc(level) || 0));
}

/** Мест в рюкзаке сейчас */
export function bagSlots(p: Readonly<FishProgress>): number {
  return bagCapacity(p.bagTier);
}

/** Цена всего улова в рюкзаке */
export function bagValue(bag: readonly BagFish[]): number {
  return bag.reduce((s, f) => s + f.p, 0);
}

/**
 * Какой напиток действует сейчас: 4 — водка, 3 — пиво подводного владыки, 2 — эль, 1 — пиво, 0 — никакого. Действует
 * один — последний выпитый (покупка гасит прежний); водка и пиво не складываются: позже выпитое (дальше конец) — главнее.
 */
export function activeDrink(p: Readonly<FishProgress>, now: number): FishDrink {
  if (!Number.isFinite(now)) return 0;
  const old: FishDrink = (p.lordUntil ?? 0) > now ? 3 : p.aleUntil > now ? 2 : p.beerUntil > now ? 1 : 0;
  const vodka = p.vodkaUntil ?? 0;
  return vodka > now && vodka >= drinkUntil(p, old) ? 4 : old;
}

/** Напиток по номеру (0 — никакого) */
export function drinkOf(drink: number): ShopDrink | null {
  return drink === 4 ? VODKA : drink === 3 ? LORD : drink === 2 ? ALE : drink === 1 ? BEER : null;
}

/** До какого времени действует напиток по номеру */
export function drinkUntil(p: Readonly<FishProgress>, drink: number): number {
  return drink === 4 ? p.vodkaUntil ?? 0 : drink === 3 ? p.lordUntil ?? 0 : drink === 2 ? p.aleUntil : drink === 1 ? p.beerUntil : 0;
}

export function fishCastMods(progress: FishProgress, now: number, zone: FishZone = 'pier'): FishCastMods {
  const p = normalizeFishProgress(progress);
  const level = fishLevel(p.xp);
  const bonus = rodBonus(p.rod);
  const drink = activeDrink(p, now);
  const d = drinkOf(drink);
  const lure = lureOf(p.lure);
  const barkas = zone === 'barkas';
  return {
    level, rod: p.rod,
    zoneScale: (1 + .025 * level) * (1 + bonus),
    biteSpeed: 1 + bonus,
    rareMultiplier: levelOdds(level) * rodOdds(p.rod) * (d?.rare ?? 1),
    incomeScale: d?.income ?? 1,
    zone: barkas ? 'barkas' : 'pier',
    drink,
    lure: p.lure,
    epicMultiplier: lure?.epic ?? 1,
    calm: lure?.calm ?? 0,
    sea: barkas ? SEA_FIGHT : 1,
    seaDrain: barkas ? SEA_DRAIN : 1,
    ...(d?.top ? { topMultiplier: d.top } : {}),
    ...(d?.zone ? { zoneMul: d.zone } : {}),
    ...(d?.jerk ? { jerkMul: d.jerk } : {}),
  };
}

/**
 * Stardew: trunc(3 + difficulty/3), legendary ×5. Виды пристани — от замороженной сложности выпуска 6, виды баркаса —
 * от заданной базы. Итог ×0,4 (+20 % к прежней трети), на баркасе ещё ×1,25, в дождь ещё ×1,15 (rain), с водкой
 * эпические, легендарные и мифические ещё ×2, и × оценка вываживания (grade, shared/fishreel.ts REEL_GRADES: «Идеально»
 * ×2,5 … «Ну ты и червь» ×0,5; 04.10 — вместо прежнего «идеально» ×2,4), одно округление. Хлам и сундук опыта не дают.
 */
export function fishCatchXp(sp: number, grade: ReelGrade = GRADE_PLAIN, mods?: Readonly<Pick<FishCastMods, 'zone'> & Partial<Pick<FishCastMods, 'drink'>>>, rain = false): number {
  const r = ruleOf(sp);
  if (!r || !isCollected(sp)) return 0;
  // Convert measured reel effort to Stardew's 5…110 scale: a five-second perfect reel is difficulty30.
  const difficulty = Math.min(110, Math.max(5, Math.round(30 + 100 * (1 - 300 / r.xpDifficulty))));
  let xp = r.xpBase ?? Math.trunc(3 + difficulty / 3);
  if (tierRank(r.tier) >= T_LEGEND) xp *= 5;
  const place = mods?.zone === 'barkas' ? BARKAS_XP : 1;
  const rank = tierRank(r.tier);
  const vodka = mods?.drink === 4 && rank >= T_EPIC && rank <= T_MYTH ? VODKA.topXp ?? 1 : 1;
  return Math.max(1, Math.round(xp * XP_SCALE * place * (rain ? RAIN_XP : 1) * vodka * gradeXp(grade)));
}

/** Утешение: эпическая и выше сорвалась после 3 с борьбы — четверть опыта за поимку (не меньше 1). Иначе 0. */
export function fishLostXp(sp: number, ticks: number, mods?: Readonly<Pick<FishCastMods, 'zone'> & Partial<Pick<FishCastMods, 'drink'>>>, rain = false): number {
  const r = ruleOf(sp);
  if (!r || !isCollected(sp) || tierRank(r.tier) < T_EPIC || !(ticks >= CONSOLATION_TICKS)) return 0;
  return Math.max(1, Math.round(fishCatchXp(sp, GRADE_PLAIN, mods, rain) * CONSOLATION_SHARE));
}
