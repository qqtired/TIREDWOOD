// Лавка Деда Семёна и Сани (fisheco): рюкзаки, блёсны, напитки и бубен дождя — цены, уровни рыбалки, эффекты.
// 04.10: платиновая блесна (4-я) и водка рыбацкая — напиток «на риск»: зона −50 %, рывки +20 %, эпик/лег/миф ×2 и опыт за них ×2.
// Решает сервер (server/lobby/fishnpc.ts), клиент по этой же таблице рисует лавку и подсказки. Уровни — рыболовные
// (fishLevel из shared/fishprogress.ts, 0–10), как в заданиях Семёна.

/** Без рюкзака в руках помещается столько рыб */
export const BAG_BASE = 5;
/** Больше этого рюкзак не вмещает ни при каком рюкзаке (и при нормализации сохранения) */
export const BAG_MAX = 20;
/** С этого уровня рыбалки пускают на лодку Семёна до баркаса (барьер ставит barkas) */
export const BARKAS_LEVEL = 3;

export interface ShopBag {
  tier: 1 | 2 | 3;
  id: string;
  name: string;
  price: number;
  /** С какого уровня рыбалки продаётся */
  level: number;
  /** Сколько всего мест (не прибавка к базовым) */
  slots: number;
}

/** Бонусы рюкзаков не складываются: действует лучший купленный. */
export const BAGS: readonly ShopBag[] = [
  { tier: 1, id: 'bag1', name: 'Рюкзак новичка', price: 250, level: 0, slots: 10 },
  { tier: 2, id: 'bag2', name: 'Рюкзак рыболова', price: 500, level: 3, slots: 15 },
  { tier: 3, id: 'bag3', name: 'Рюкзак профессионала', price: 1000, level: 5, slots: 20 },
];

export interface ShopLure {
  tier: 1 | 2 | 3 | 4;
  id: string;
  name: string;
  price: number;
  level: number;
  /** Рывки рыбы мягче: скорость рывка и резкость ×(1 − calm) */
  calm: number;
  /** Шанс эпических, легендарных и мифических рыб × epic от базового */
  epic: number;
}

/** Блёсны покупаются навсегда; на леске — лучшая купленная. */
export const LURES: readonly ShopLure[] = [
  { tier: 1, id: 'lure1', name: 'Бронзовая блесна', price: 250, level: 1, calm: 0.03, epic: 1.03 },
  { tier: 2, id: 'lure2', name: 'Серебряная блесна', price: 1000, level: 4, calm: 0.05, epic: 1.05 },
  { tier: 3, id: 'lure3', name: 'Золотая блесна', price: 3000, level: 6, calm: 0.1, epic: 1.1 },
  { tier: 4, id: 'lure4', name: 'Платиновая блесна', price: 5000, level: 8, calm: 0.15, epic: 1.15 },
];
/** Самая сильная блесна: потолки calm и epic в reelStyleFor и броске (shared/fishrules.ts) */
export const LURE_MAX = LURES[LURES.length - 1];

export interface ShopDrink {
  id: 'beer' | 'ale' | 'lord' | 'vodka';
  name: string;
  price: number;
  /** Сколько действует, мс */
  ms: number;
  /** Доход от рыбы × income */
  income: number;
  /** Шанс редких и выше × rare от базового */
  rare: number;
  /** Шанс эпических, легендарных и мифических × top (водка) */
  top?: number;
  /** Опыт рыбалки за эпическую, легендарную и мифическую × topXp (водка) */
  topXp?: number;
  /** Зона на шкале × zone (водка: 0,5 — вдвое меньше) */
  zone?: number;
  /** Скорость рывков рыбы × jerk (водка: 1,2) */
  jerk?: number;
}

/** Действует один напиток: эль сильнее и заменяет пиво; пиво поверх эля не продаётся. */
export const BEER: ShopDrink = { id: 'beer', name: 'Рыбацкое пиво', price: 15, ms: 600_000, income: 1.1, rare: 1.2 };
export const ALE: ShopDrink = { id: 'ale', name: 'Рыбацкий эль', price: 30, ms: 600_000, income: 1.15, rare: 1.3 };
/**
 * Пиво подводного владыки: не продаётся — лежит в каждом пятом сундуке и выпивается сразу. Сильнее эля, действует
 * столько же; заменяет пиво и эль (их остаток пропадает), поверх него ни пиво, ни эль не наливают.
 */
export const LORD: ShopDrink = { id: 'lord', name: 'Пиво подводного владыки', price: 0, ms: ALE.ms, income: 1.2, rare: 1.4 };
/** Шанс найти его в сундуке */
export const LORD_CHEST_CHANCE = 0.2;
/**
 * Водка рыбацкая: продаётся у Семёна и Сани за 100 🪙, действует 10 минут. Рыбу держать труднее (зона вдвое меньше,
 * рывки на 20 % быстрее), зато эпические, легендарные и мифические клюют вдвое чаще и дают вдвое больше опыта. Доход
 * не меняет. С пивом, элем и пивом владыки не складывается: действует последнее выпитое (остаток прежнего пропадает).
 */
export const VODKA: ShopDrink = { id: 'vodka', name: 'Водка рыбацкая', price: 100, ms: 600_000, income: 1, rare: 1, top: 2, topXp: 2, zone: 0.5, jerk: 1.2 };

/** Бубен дождя: сразу вызывает рыболовное событие для всех */
export const RAIN_DRUM_PRICE = 1000;

/** Мест в рюкзаке по купленному рюкзаку (0 — без рюкзака) */
export function bagCapacity(tier: number): number {
  return BAGS.find((b) => b.tier === tier)?.slots ?? BAG_BASE;
}

/** Блесна по номеру (0 — без блесны) */
export function lureOf(tier: number): ShopLure | null {
  return LURES.find((l) => l.tier === tier) ?? null;
}

/** Что можно купить и почему нельзя: для лавки (клиент) и проверки покупки (сервер). */
export type GearState = 'ok' | 'owned' | 'better' | 'level' | 'tokens';

export function gearState(kind: 'bag' | 'lure', tier: number, have: number, level: number, tokens: number): GearState {
  const item = (kind === 'bag' ? BAGS : LURES).find((g) => g.tier === tier);
  if (!item) return 'level';
  if (have === tier) return 'owned';
  if (have > tier) return 'better';
  if (level < item.level) return 'level';
  if (tokens < item.price) return 'tokens';
  return 'ok';
}
