// Наряды желеек: палитра, каталог вещей и проверка наряда. Общий код для сервера и клиента.
import { hash32 } from './math.ts';

/** Цвета тела и второго цвета узора. Все бесплатные. */
export const PALETTE: readonly number[] = [
  0xff4d6d, 0xd6336c, 0x9b1b30, 0xff8a1c, 0xffd23f, 0x9bd13b, 0x5fd8a8, 0x1fb5b0,
  0x5ab8ff, 0x4a63ff, 0x7a3f9e, 0xb39ddb, 0xff9ec7, 0xd9913c, 0x7a4a2e, 0xf2eadc,
];

export const PALETTE_NAMES: readonly string[] = [
  'клубничный', 'малиновый', 'вишнёвый', 'апельсиновый', 'лимонный', 'лаймовый', 'мятный', 'бирюзовый',
  'голубой', 'черничный', 'сливовый', 'лавандовый', 'розовый', 'карамельный', 'шоколадный', 'молочный',
];

/**
 * p — узор, e — глаза, h — шапка, a — аксессуар, s — питомец на плече. Награды рыбалки (shared/fishstyle.ts), видны
 * на мостках: r — удочка, b — поплавок, w — окно вываживания (его видит только сам рыбак); n — значок у ника.
 */
export type Slot = 'p' | 'e' | 'h' | 'a' | 's' | 'r' | 'b' | 'w' | 'n';
/** Слоты, которых нет в старых нарядах: в наряде только когда надето не «пустое» (старые наряды и боты — без них) */
export const EXTRA_SLOTS = ['s', 'r', 'b', 'w', 'n'] as const;
/**
 * jackpot — только с автомата; system — выдаёт игра (выпуск 2); trophy — награда за достижение, не продаётся
 * (рыбалка: лестница наград по видам в журнале, shared/fishstyle.ts); promo — скрытый подарок
 */
export type Tier = 'free' | 'common' | 'rare' | 'epic' | 'premium' | 'jackpot' | 'system' | 'trophy' | 'promo';

export interface Item {
  id: string;
  slot: Slot;
  key: string;
  name: string;
  tier: Tier;
}

/** c, c2 — индексы палитры 0–15; s, r, b, w, n — только не «пустые» (читать через slotKey) */
export interface Outfit {
  c: number;
  c2: number;
  p: string;
  e: string;
  h: string;
  a: string;
  s?: string;
  r?: string;
  b?: string;
  w?: string;
  n?: string;
}

export const SLOT_NAMES: Record<Slot, string> = {
  p: 'Узор', e: 'Глаза', h: 'Шапка', a: 'Аксессуар', s: 'Питомец', r: 'Удочка', b: 'Поплавок', w: 'Окно вываживания', n: 'Значок у ника',
};

export const TIER_NAMES: Record<Tier, string> = {
  free: 'бесплатно', common: 'обычная', rare: 'редкая', epic: 'эпическая', premium: 'премиальная', jackpot: 'джекпот', system: 'особая', trophy: 'трофей', promo: 'подарочная',
};

const CATALOG: Array<[Slot, string, string, Tier]> = [
  ['p', 'none', 'Без узора', 'free'],
  ['p', 'stripes', 'Тельняшка', 'common'],
  ['p', 'dots', 'Горошек', 'common'],
  ['p', 'spots', 'Пятна', 'common'],
  ['p', 'sunset', 'Закат', 'rare'],
  ['p', 'camo', 'Камуфляж', 'rare'],
  ['p', 'sugar', 'Сахарная обсыпка', 'epic'],
  ['p', 'gold', 'Золото', 'jackpot'],

  ['e', 'normal', 'Обычные', 'free'],
  ['e', 'sleepy', 'Сонные', 'free'],
  ['e', 'angry', 'Сердитые', 'free'],
  ['e', 'happy', 'Довольные', 'free'],
  ['e', 'glasses', 'Очки', 'common'],
  ['e', 'shades', 'Тёмные очки', 'rare'],
  ['e', 'patch', 'Пиратская повязка', 'rare'],
  ['e', 'monocle', 'Монокль', 'epic'],
  ['e', 'angler', 'Очки рыболова', 'trophy'],

  ['h', 'none', 'Без шапки', 'free'],
  ['h', 'cap', 'Кепка', 'free'],
  ['h', 'panama', 'Панама', 'common'],
  ['h', 'ushanka', 'Ушанка', 'common'],
  ['h', 'fisher', 'Рыбацкая шляпа', 'common'],
  ['h', 'bandana', 'Бандана', 'common'],
  ['h', 'helmet', 'Каска', 'rare'],
  ['h', 'sailor', 'Бескозырка', 'rare'],
  ['h', 'tophat', 'Цилиндр', 'epic'],
  ['h', 'crown', 'Корона', 'jackpot'],
  ['h', 'fool', 'Колпак дурака', 'system'],
  ['h', 'angler', 'Панама с блёснами', 'trophy'],

  ['a', 'none', 'Без аксессуара', 'free'],
  ['a', 'scarf', 'Шарф', 'free'],
  ['a', 'mustache', 'Усы', 'common'],
  ['a', 'bowtie', 'Бабочка', 'common'],
  ['a', 'headphones', 'Наушники', 'rare'],
  ['a', 'lifebuoy', 'Спасательный круг', 'rare'],
  ['a', 'chain', 'Золотая цепь', 'epic'],
  ['a', 'epaulets', 'Погоны', 'system'],
  ['a', 'angler', 'Жилет рыболова', 'trophy'],

  // Только в конец: сохраняем идентификаторы и порядок старого каталога.
  ['h', 'astronaut', 'Шлем орбитальщика', 'premium'],
  ['h', 'storm', 'Грозовой колпак', 'premium'],
  ['a', 'jetpack', 'Реактивный ранец', 'premium'],
  ['e', 'prism', 'Призматический визор', 'premium'],
  ['h', 'devil', 'Чертячьи рожки', 'promo'],
  ['a', 'deviltail', 'Чертячий хвост', 'promo'],

  // Рыбалка, выпуск 7: «пустые» вещи новых слотов и награды лестницы коллекции (shared/fishstyle.ts) — только в конец.
  ['s', 'none', 'Без питомца', 'free'],
  ['r', 'basic', 'Обычная', 'free'],
  ['b', 'classic', 'Классический', 'free'],
  ['w', 'wood', 'Деревянное', 'free'],
  ['n', 'none', 'Без значка', 'free'],
  ['w', 'chart', 'Морская карта', 'trophy'],
  ['r', 'hazel', 'Орешник', 'trophy'],
  ['a', 'kukan', 'Кукан с уловом', 'trophy'],
  ['b', 'quill', 'Гусиное перо', 'trophy'],
  ['b', 'duck', 'Уточка', 'trophy'],
  ['r', 'carved', 'Резная', 'trophy'],
  ['h', 'sou', 'Зюйдвестка', 'trophy'],
  ['a', 'oilskin', 'Штормовка', 'trophy'],
  ['s', 'gull', 'Чайка', 'trophy'],
  ['a', 'net', 'Сачок', 'trophy'],
  ['w', 'night', 'Ночной клёв', 'trophy'],
  ['b', 'firefly', 'Светлячок', 'trophy'],
  ['h', 'captain', 'Фуражка капитана', 'trophy'],
  ['a', 'tunic', 'Китель капитана', 'trophy'],
  ['s', 'parrot', 'Попугай-ара', 'trophy'],
  ['r', 'gold', 'Золотая', 'trophy'],
  ['b', 'goldfish', 'Золотая рыбка', 'trophy'],
  ['w', 'gold', 'Золото', 'trophy'],
  ['n', 'anchor', 'Золотой якорь', 'trophy'],

  // Остров «Последний свет» (флаг ISLE): награды лестницы видов острова (ISLE_LADDER в shared/fishstyle.ts) — только в конец.
  ['b', 'bellbuoy', 'Колокольный буй', 'trophy'],
  ['r', 'lighthouse', 'Маячная', 'trophy'],
  ['w', 'fog', 'Туман', 'trophy'],
  ['s', 'puffin', 'Тупик', 'trophy'],
  ['h', 'keeper', 'Шапка смотрителя', 'trophy'],
  ['a', 'keeper', 'Свитер смотрителя', 'trophy'],
  ['n', 'lighthouse', 'Маяк', 'trophy'],
];

export const ITEMS: readonly Item[] = CATALOG.map(([slot, key, name, tier]) => ({ id: `${slot}:${key}`, slot, key, name, tier }));

const BY_ID = new Map(ITEMS.map((it) => [it.id, it]));

/** «Пустая» вещь слота — её надевают вместо недоступной. */
const EMPTY: Record<Slot, string> = { p: 'none', e: 'normal', h: 'none', a: 'none', s: 'none', r: 'basic', b: 'classic', w: 'wood', n: 'none' };

export const DEFAULT_OUTFIT: Outfit = { c: 9, c2: 15, p: 'none', e: 'normal', h: 'cap', a: 'none' };

/** Что выдаёт джекпот — по порядку, первую вещь, которой ещё нет. */
export const JACKPOT_ITEMS: readonly string[] = ['h:crown', 'p:gold'];

/** Номер узора для шейдера желе. */
export const PATTERN_INDEX: Record<string, number> = {
  none: 0, stripes: 1, dots: 2, spots: 3, sunset: 4, camo: 5, sugar: 6, gold: 7,
};

export function itemById(id: string): Item | undefined {
  return BY_ID.get(id);
}

export function itemOf(slot: Slot, key: string): Item | undefined {
  return BY_ID.get(`${slot}:${key}`);
}

/** Что надето в слоте (у новых слотов поля может не быть — тогда «пустая» вещь). */
export function slotKey(o: Outfit, slot: Slot): string {
  return o[slot] ?? EMPTY[slot];
}

/** Можно ли надеть: бесплатное — всегда, системное — никогда (его выдаёт игра), остальное — если куплено. */
export function isOwned(owned: readonly string[], item: Item): boolean {
  if (item.tier === 'free') return true;
  if (item.tier === 'system') return false;
  return owned.includes(item.id);
}

/** Скрытые подарки появляются в гардеробе только после получения. */
export function isItemVisible(item: Item, owned: readonly string[]): boolean {
  return item.tier !== 'promo' || isOwned(owned, item);
}

function colorIndex(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < PALETTE.length ? v : fallback;
}

/** Наряд из чего угодно: неверные и чужие вещи заменяются «пустыми», цвета — цветами по умолчанию. */
export function sanitizeOutfit(raw: unknown, owned: readonly string[]): Outfit {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = (slot: Slot): string => {
    const key = r[slot];
    if (typeof key !== 'string') return EMPTY[slot];
    const it = itemOf(slot, key);
    return it && isOwned(owned, it) ? key : EMPTY[slot];
  };
  const out: Outfit = {
    c: colorIndex(r.c, DEFAULT_OUTFIT.c),
    c2: colorIndex(r.c2, DEFAULT_OUTFIT.c2),
    p: pick('p'),
    e: pick('e'),
    h: pick('h'),
    a: pick('a'),
  };
  for (const slot of EXTRA_SLOTS) {
    const key = pick(slot);
    if (key !== EMPTY[slot]) out[slot] = key;
  }
  return out;
}

const FREE: Record<Slot, string[]> = { p: [], e: [], h: [], a: [], s: [], r: [], b: [], w: [], n: [] };
for (const it of ITEMS) if (it.tier === 'free') FREE[it.slot].push(it.key);

/** Случайный бесплатный наряд, зависящий только от зерна (боты). */
export function randomOutfit(seed: number): Outfit {
  const r = (k: number, n: number): number => hash32(seed, k) % n;
  return {
    c: r(1, PALETTE.length),
    c2: r(2, PALETTE.length),
    p: FREE.p[r(3, FREE.p.length)],
    e: FREE.e[r(4, FREE.e.length)],
    h: FREE.h[r(5, FREE.h.length)],
    a: FREE.a[r(6, FREE.a.length)],
  };
}

/** Что видят все: колпак дурака и погоны поверх своего наряда, пока не истёк срок (мс). */
export function shownOutfit(o: Outfit, foolUntil: number, epUntil: number, now: number): Outfit {
  const fool = foolUntil > now;
  const ep = epUntil > now;
  if (!fool && !ep) return o;
  return { ...o, h: fool ? 'fool' : o.h, a: ep ? 'epaulets' : o.a };
}

export function withItem(o: Outfit, item: Item): Outfit {
  return { ...o, [item.slot]: item.key };
}

export function sameOutfit(a: Outfit, b: Outfit): boolean {
  return a.c === b.c && a.c2 === b.c2 && a.p === b.p && a.e === b.e && a.h === b.h && a.a === b.a
    && EXTRA_SLOTS.every((s) => slotKey(a, s) === slotKey(b, s));
}
