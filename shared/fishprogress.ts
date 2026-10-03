// Shared pure progression API. The server owns catch/quest commits and cast-time snapshots.
// fisheco: рюкзак с уловом (продаётся Семёну или Сане), лучший рюкзак и блесна, эль; снимок бонусов заброса — с местом
// (пристань/баркас), напитком и блесной; опыт ×0,4 (+20 %), баркас ×1,25, утешение за сорвавшуюся эпическую+.
import { FISH } from './fishing.ts';
import type { FishZone } from './fishplaces.ts';
import {
  BARKAS_XP, CONSOLATION_SHARE, CONSOLATION_TICKS, SEA_DRAIN, SEA_FIGHT, T_EPIC, T_LEGEND, T_MYTH, XP_SCALE, isCollected, ruleOf,
} from './fishrules.ts';
import { ALE, BAG_MAX, BEER, RAIN_DRUM_PRICE as DRUM_PRICE, bagCapacity, lureOf } from './fishshop.ts';

export type FishRod = 0 | 1 | 2 | 3;
/** Купленный рюкзак или блесна: 0 — нет, 1–3 — номер в shared/fishshop.ts */
export type FishGear = 0 | 1 | 2 | 3;

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

export interface FishProgress {
  xp: number;
  questsDone: number;
  questCaught: number;
  rod: FishRod;
  beerUntil: number;
  aleUntil: number;
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
  /** Шанс редких и выше: уровень × удочка × напиток */
  rareMultiplier: number;
  /** Доход от рыбы: напиток (×1,1 пиво, ×1,15 эль) */
  incomeScale: number;
  /** Где заброс: пристань или баркас (×1,25 к доходу и опыту, свой пул, злее рыба) */
  zone: FishZone;
  /** Напиток: 0 — нет, 1 — пиво, 2 — эль */
  drink: 0 | 1 | 2;
  /** Блесна на леске */
  lure: FishGear;
  /** Ещё шанс эпических и выше: блесна */
  epicMultiplier: number;
  /** Рывки мягче на долю: блесна */
  calm: number;
  /** Море: рывки ×sea, сопротивление ×seaDrain */
  sea: number;
  seaDrain: number;
}

export const BEER_PRICE = BEER.price;
export const BEER_MS = BEER.ms;
export const ALE_PRICE = ALE.price;
export const ALE_MS = ALE.ms;
export const RAIN_DRUM_PRICE = DRUM_PRICE;

export function emptyFishProgress(): FishProgress {
  return { xp: 0, questsDone: 0, questCaught: 0, rod: 0, beerUntil: 0, aleUntil: 0, bagTier: 0, lure: 0, bag: [], bagSeq: 0 };
}

/** Cumulative thresholds from Stardew Valley Fishing, https://stardewvalleywiki.com/Fishing#Experience_Points. */
export const FISH_XP_LEVELS: readonly number[] = [0, 100, 380, 770, 1300, 2150, 3300, 4800, 6900, 10_000, 15_000];

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(value))) : 0;
}

function gear(value: unknown): FishGear {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0 && value <= 3 ? value as FishGear : 0;
}

/** Рыба из сохранения: известный вид коллекции, целые числа в разумных пределах; иначе — null (эта рыба отбрасывается). */
function bagFish(raw: unknown): BagFish | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const sp = typeof r.f === 'string' ? FISH.findIndex((f) => f.id === r.f) : -1;
  if (sp < 0 || !isCollected(sp)) return null;
  const ok = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;
  if (!ok(r.n, Number.MAX_SAFE_INTEGER) || !ok(r.g, 10_000_000) || r.g === 0 || !ok(r.p, 1_000_000) || !ok(r.m, 15)) return null;
  return { n: r.n, f: r.f as string, g: r.g, p: r.p, m: r.m };
}

export function normalizeFishProgress(raw: unknown): FishProgress {
  if (!raw || typeof raw !== 'object') return emptyFishProgress();
  const r = raw as Record<string, unknown>;
  const questsDone = count(r.questsDone);
  const selected = Number.isInteger(r.rod) && typeof r.rod === 'number' && r.rod >= 0 && r.rod <= 3 ? r.rod as FishRod : 0;
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
    bagTier: gear(r.bagTier),
    lure: gear(r.lure),
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

export function unlockedRod(questsDone: number): FishRod {
  const n = count(questsDone);
  return n >= 10 ? 3 : n >= 5 ? 2 : n >= 1 ? 1 : 0;
}

export function rodBonus(rod: FishRod): number {
  return rod === 3 ? .3 : rod === 2 ? .2 : rod === 1 ? .1 : 0;
}

/** Мест в рюкзаке сейчас */
export function bagSlots(p: Readonly<FishProgress>): number {
  return bagCapacity(p.bagTier);
}

/** Цена всего улова в рюкзаке */
export function bagValue(bag: readonly BagFish[]): number {
  return bag.reduce((s, f) => s + f.p, 0);
}

/** Какой напиток действует сейчас: 2 — эль, 1 — пиво, 0 — никакого */
export function activeDrink(p: Readonly<FishProgress>, now: number): 0 | 1 | 2 {
  if (!Number.isFinite(now)) return 0;
  return p.aleUntil > now ? 2 : p.beerUntil > now ? 1 : 0;
}

export function fishCastMods(progress: FishProgress, now: number, zone: FishZone = 'pier'): FishCastMods {
  const p = normalizeFishProgress(progress);
  const level = fishLevel(p.xp);
  const bonus = rodBonus(p.rod);
  const drink = activeDrink(p, now);
  const lure = lureOf(p.lure);
  const barkas = zone === 'barkas';
  return {
    level, rod: p.rod,
    zoneScale: (1 + .025 * level) * (1 + bonus),
    biteSpeed: 1 + bonus,
    rareMultiplier: 1.025 ** level * (1 + .05 * p.rod) * (drink === 2 ? ALE.rare : drink === 1 ? BEER.rare : 1),
    incomeScale: drink === 2 ? ALE.income : drink === 1 ? BEER.income : 1,
    zone: barkas ? 'barkas' : 'pier',
    drink,
    lure: p.lure,
    epicMultiplier: lure?.epic ?? 1,
    calm: lure?.calm ?? 0,
    sea: barkas ? SEA_FIGHT : 1,
    seaDrain: barkas ? SEA_DRAIN : 1,
  };
}

/**
 * Stardew: trunc(3 + difficulty/3), perfect ×2.4, legendary ×5 (truncated after each factor). Виды пристани — от
 * замороженной сложности выпуска 6, виды баркаса — от заданной базы. Итог ×0,4 (+20 % к прежней трети), на баркасе ещё
 * ×1,25, одно округление. Хлам и сундук опыта не дают.
 */
export function fishCatchXp(sp: number, perfect = false, mods?: Readonly<Pick<FishCastMods, 'zone'>>): number {
  const r = ruleOf(sp);
  if (!r || r.tier > T_MYTH) return 0;
  // Convert measured reel effort to Stardew's 5…110 scale: a five-second perfect reel is difficulty30.
  const difficulty = Math.min(110, Math.max(5, Math.round(30 + 100 * (1 - 300 / r.xpDifficulty))));
  let xp = r.xpBase ?? Math.trunc(3 + difficulty / 3);
  if (perfect) xp = Math.trunc(xp * 2.4);
  if (r.tier >= T_LEGEND) xp *= 5;
  const place = mods?.zone === 'barkas' ? BARKAS_XP : 1;
  return Math.max(1, Math.round(xp * XP_SCALE * place));
}

/** Утешение: эпическая и выше сорвалась после 3 с борьбы — четверть опыта за поимку (не меньше 1). Иначе 0. */
export function fishLostXp(sp: number, ticks: number, mods?: Readonly<Pick<FishCastMods, 'zone'>>): number {
  const r = ruleOf(sp);
  if (!r || r.tier < T_EPIC || r.tier > T_MYTH || !(ticks >= CONSOLATION_TICKS)) return 0;
  return Math.max(1, Math.round(fishCatchXp(sp, false, mods) * CONSOLATION_SHARE));
}
