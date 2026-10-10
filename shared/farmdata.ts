// Ферма: все числа режима в одном месте. Источник — tools/farm-sim/RESULTS.md, «Итоговые числа v11» (K = 0,1, сжатие
// культур дольше 20 минут, дневной потолок 700 🪙 → ×0,25), где он молчит — docs/farm/design-v11.md (номер раздела —
// в комментарии у таблицы). Числа не придумывать: правка баланса — сначала документ, потом здесь.
// Исключение из старшинства RESULTS.md: Грабли 2 и Лопатка 2 открываются на ур. 4, а не 3 — сдвиг ранних гейтов
// принят владельцем (docs/farm/decisions.md, ответы по обзору 10.10) и описан в design-v11 §2 (решение 7) и §6.
// Ресурс «Семена» из RESULTS.md здесь называется «Зёрна» (design-v11 §2, решение 16).

// ------------------------------------------------------------ общее

/** Участков на ферме = мест в комнате (решение 3: одна комната, без копий; 21-й остаётся на площади) */
export const FARM_PLOTS = 20;
/** Грядок на участке (2 ряда по 4) */
export const FARM_BEDS = 8;
/** Множитель монет документа v10 → жетоны (design-v11 §9.1). Только для справки: все цены ниже уже в жетонах. */
export const FARM_K = 0.1;
/** Дневной потолок продаж Грибу и Фургону, 🪙 за МСК-сутки, и множитель после него (design-v11 §9.3) */
export const DAILY_CAP = 700;
export const AFTER_CAP = 0.25;
/** Вещь из награды уже есть — вместо неё жетоны (§2, решение 9; §9.5) */
export const DUP_ITEM_COINS = 10;
/** Обучение Семечкина (§1.4): +25 XP за шаги 1–5, шаг 6 — +50 XP и +20 🪙, всего 175 XP */
export const TUTORIAL_STEPS = 6;
export const TUTORIAL_XP: readonly number[] = [25, 25, 25, 25, 25, 50];
export const TUTORIAL_COINS = 20;
/** Спящий участок: столько ждёт хозяина после выхода, потом засыпает (§15, level.md §7) */
export const PLOT_WAIT_MS = 5 * 60_000;
/** Переезд на другой участок — не чаще раза в минуту, клик по участку — не дальше 12 м (level.md §7) */
export const PLOT_MOVE_MS = 60_000;
export const PLOT_CLICK_RANGE = 12;
/** Грядка: ЛКМ — до 6 м, E — до 2 м перед собой (level.md §4) */
export const BED_CLICK_RANGE = 6;
export const BED_USE_RANGE = 2;
/** Частота действий фермы: не больше 10 в секунду (§18.5) */
export const ACTIONS_PER_SEC = 10;

// ------------------------------------------------------------ уровень фермы (§3.1, §3.2)

export const FARM_MAX_LEVEL = 13;
/** Опыта до следующего уровня: индекс 0 — с ур. 1 на 2 … индекс 11 — с 12 на 13 */
export const FARM_XP_TO_NEXT: readonly number[] = [200, 500, 1000, 1800, 3000, 5000, 8000, 12000, 17000, 23000, 30000, 40000];
/** Сколько опыта всего нужно на уровень n (индекс n − 1): 0, 200, 700 … 141 500 */
export const FARM_XP_TOTAL: readonly number[] = FARM_XP_TO_NEXT.reduce<number[]>((acc, n) => [...acc, acc[acc.length - 1] + n], [0]);
/** После ур. 13 каждые 20 000 XP — «Звезда фермы» (§1.6), без наград */
export const FARM_STAR_XP = 20_000;
/** Имена этапов (§3.2) */
export const FARM_LEVEL_NAMES: readonly string[] = [
  'Новичок', 'Первые всходы', 'Уверенный рост', 'Умелые руки', 'Фермер', 'Опытный садовник', 'Мастер урожая',
  'Хранитель участка', 'Старший фермер', 'Хозяин фермы', 'Мастер почвы', 'Хранитель роста', 'Легенда фермы',
];
/** Вещи за уровень (§3.2, каталог §12.2); индекс — уровень − 1. Титулы (ti:) — в FARM_DECOR. */
export const FARM_LEVEL_REWARDS: readonly (readonly string[])[] = [
  ['h:farmcap', 'u:workshirt', 'l:jeans', 'l:boots'],
  ['h:straw'],
  ['u:sprout'],
  ['a:greengloves'],
  ['u:plaid'],
  ['h:sunhat'],
  ['l:overalls'],
  ['s:chick'],
  ['u:windbreaker'],
  ['s:piglet'],
  ['h:goldstraw'],
  ['u:leafcape'],
  ['u:stargardener', 'h:leafcrown', 'f:fireflies', 'ti:legend'],
];

// ------------------------------------------------------------ общий опыт игрока (§3.3)

/** Общий XP за сбор: 🟢 +1, 🟡 +2, 🟠 +5 (двойной урожай не удваивает); потолок в МСК-сутки */
export const GENERAL_XP: Readonly<Record<CropGroup, number>> = { fast: 1, mid: 2, long: 5 };
export const GENERAL_XP_DAY_CAP = 300;

// ------------------------------------------------------------ культуры (RESULTS.md «Итоговые числа v11», design §4)

/** 🟢 до 5 мин, 🟡 до 30 мин, 🟠 от 45 мин */
export type CropGroup = 'fast' | 'mid' | 'long';
export type ResourceId = 'root' | 'fiber' | 'grain' | 'spores' | 'crystal-dust' | 'wood' | 'gold-leaf' | 'scale' | 'star-dust';

export interface CropDef {
  /** id — имя модели crop_<id>.glb и ключ в сумке */
  id: string;
  name: string;
  /** Продукт в сумке, у Гриба и в Фургоне */
  product: string;
  level: number;
  /** Время роста, минуты */
  min: number;
  xp: number;
  res: ResourceId;
  /** Шанс вторичного ресурса за сбор (пчёлы — +BEES_BONUS) */
  chance: number;
  /** Посадка и продажа, 🪙 */
  seed: number;
  sale: number;
  /** Сколько штук максимум в одном ящике Фургона */
  van: number;
  /** Иконка продукта: client/assets/farm/icons/<icon>.png */
  icon: string;
}

export const CROPS: readonly CropDef[] = [
  { id: 'radish', name: 'Редис', product: 'Редис', level: 1, min: 2, xp: 5, res: 'root', chance: 0.30, seed: 1, sale: 2, van: 30, icon: 'radish' },
  { id: 'wheat', name: 'Пшеница', product: 'Колос', level: 1, min: 15, xp: 25, res: 'fiber', chance: 0.40, seed: 2, sale: 11, van: 30, icon: 'wheat' },
  { id: 'lettuce', name: 'Салат', product: 'Лист салата', level: 2, min: 3, xp: 6, res: 'fiber', chance: 0.35, seed: 1, sale: 3, van: 30, icon: 'lettuce' },
  { id: 'onion', name: 'Лук', product: 'Луковица', level: 4, min: 3, xp: 8, res: 'root', chance: 0.30, seed: 1, sale: 3, van: 30, icon: 'onion' },
  { id: 'pumpkin', name: 'Тыква', product: 'Тыква', level: 4, min: 20, xp: 35, res: 'grain', chance: 0.35, seed: 3, sale: 16, van: 30, icon: 'pumpkin' },
  { id: 'carrot', name: 'Морковь', product: 'Морковь', level: 5, min: 4, xp: 10, res: 'root', chance: 0.35, seed: 1, sale: 4, van: 30, icon: 'carrot' },
  { id: 'sunflower', name: 'Подсолнух', product: 'Семечки', level: 5, min: 25, xp: 30, res: 'grain', chance: 0.35, seed: 2, sale: 16, van: 30, icon: 'sunflower-seeds' },
  { id: 'strawberry', name: 'Клубника', product: 'Ягода', level: 6, min: 30, xp: 40, res: 'fiber', chance: 0.35, seed: 3, sale: 17, van: 30, icon: 'strawberry' },
  { id: 'giant-mushroom', name: 'Гриб-гигант', product: 'Шляпка гриба', level: 6, min: 45, xp: 90, res: 'spores', chance: 0.40, seed: 3, sale: 18, van: 30, icon: 'giant-mushroom' },
  { id: 'dill', name: 'Укроп', product: 'Пучок укропа', level: 7, min: 5, xp: 12, res: 'grain', chance: 0.30, seed: 1, sale: 5, van: 30, icon: 'dill' },
  { id: 'chili', name: 'Перец чили', product: 'Стручок', level: 8, min: 30, xp: 55, res: 'grain', chance: 0.35, seed: 4, sale: 17, van: 30, icon: 'chili' },
  { id: 'crystal', name: 'Кристальный цветок', product: 'Кристалл', level: 8, min: 60, xp: 120, res: 'crystal-dust', chance: 0.40, seed: 4, sale: 18, van: 30, icon: 'crystal' },
  { id: 'microgreens', name: 'Микро-зелень', product: 'Ростки', level: 9, min: 5, xp: 12, res: 'grain', chance: 0.35, seed: 2, sale: 6, van: 30, icon: 'microgreens' },
  { id: 'lotus', name: 'Лунный лотос', product: 'Лепесток', level: 9, min: 90, xp: 150, res: 'crystal-dust', chance: 0.40, seed: 4, sale: 19, van: 20, icon: 'lotus' },
  { id: 'life-tree', name: 'Древо жизни', product: 'Плод жизни', level: 10, min: 120, xp: 180, res: 'wood', chance: 0.40, seed: 4, sale: 20, van: 15, icon: 'life-fruit' },
  { id: 'golden-apple', name: 'Золотое яблоко', product: 'Золотое яблоко', level: 10, min: 360, xp: 400, res: 'gold-leaf', chance: 0.40, seed: 4, sale: 22, van: 5, icon: 'golden-apple' },
  { id: 'dragon-fruit', name: 'Драконий плод', product: 'Драконий плод', level: 11, min: 480, xp: 500, res: 'scale', chance: 0.35, seed: 4, sale: 22, van: 4, icon: 'dragon-fruit' },
  { id: 'star-flower', name: 'Звёздный цветок', product: 'Звезда', level: 12, min: 600, xp: 650, res: 'star-dust', chance: 0.35, seed: 5, sale: 23, van: 3, icon: 'star' },
  { id: 'mythic-mushroom', name: 'Мифический гриб', product: 'Мифическая шляпка', level: 13, min: 540, xp: 800, res: 'spores', chance: 0.40, seed: 6, sale: 24, van: 4, icon: 'myth-mushroom' },
];

const CROP_BY_ID = new Map(CROPS.map((c) => [c.id, c]));
export function cropById(id: unknown): CropDef | undefined {
  return typeof id === 'string' ? CROP_BY_ID.get(id) : undefined;
}

/** Группа по времени роста: 🟢 до 5 мин, 🟡 до 30 мин, 🟠 от 45 мин (§4) */
export function cropGroup(c: CropDef): CropGroup {
  return c.min <= 5 ? 'fast' : c.min <= 30 ? 'mid' : 'long';
}

// ------------------------------------------------------------ вторичные ресурсы (§5)

export interface ResourceDef {
  id: ResourceId;
  name: string;
  rare: boolean;
  /** XP за 1 шт. при конвертации у Дядюшки Гриба */
  xp: number;
  /** client/assets/farm/icons/<icon>.png */
  icon: string;
}

export const RESOURCES: readonly ResourceDef[] = [
  { id: 'root', name: 'Корешок', rare: false, xp: 2, icon: 'rootlet' },
  { id: 'fiber', name: 'Волокно', rare: false, xp: 3, icon: 'fiber' },
  { id: 'grain', name: 'Зёрна', rare: false, xp: 3, icon: 'seeds' },
  { id: 'spores', name: 'Споры', rare: true, xp: 8, icon: 'spores' },
  { id: 'crystal-dust', name: 'Кристаллическая пыль', rare: true, xp: 12, icon: 'crystal-dust' },
  { id: 'wood', name: 'Древесина', rare: true, xp: 8, icon: 'wood' },
  { id: 'gold-leaf', name: 'Золотой лист', rare: true, xp: 15, icon: 'golden-leaf' },
  { id: 'scale', name: 'Чешуйка', rare: true, xp: 20, icon: 'scale' },
  { id: 'star-dust', name: 'Звёздная пыль', rare: true, xp: 25, icon: 'star-dust' },
];

const RES_BY_ID = new Map(RESOURCES.map((r) => [r.id, r]));
export function resourceById(id: unknown): ResourceDef | undefined {
  return typeof id === 'string' ? RES_BY_ID.get(id as ResourceId) : undefined;
}

// ------------------------------------------------------------ инструменты и постройки (§6, §6.1, §7)

/** Лейка 1–3: зарядов (§7) */
export const CAN_CHARGES: readonly number[] = [10, 20, 50];
/** Сумка 1–4: мест под основной урожай и трюфели (§2, решение 14) */
export const BAG_PLACES: readonly number[] = [20, 50, 100, 200];
/** Грабли 1–3: одно действие на столько грядок (§2, решение 13) */
export const RAKE_BEDS: readonly number[] = [1, 4, 9];
/** Лопатка 1–3: шанс двойного основного урожая (§6) */
export const SHOVEL_DOUBLE: readonly number[] = [0, 0.15, 0.25];
/** Пчёлы: +10 п.п. к шансу вторичного ресурса (§6) */
export const BEES_BONUS = 0.10;
/** Компост: время роста ×0,85 для посадок после постройки (§6) */
export const COMPOST_GROW = 0.85;
/** Полив и помощь: −20 % оставшегося времени (§2, решение 11) */
export const WATER_CUT = 0.2;
/** Трюфельный свин: 1 трюфель за 3 ч, хранит до 3, трюфель — 30 🪙 и 1 место в сумке (§6, §9.5) */
export const PIG_EVERY_MS = 3 * 3600_000;
export const PIG_STORE = 3;
export const TRUFFLE_PRICE = 30;
export const TRUFFLE = 'truffle';
/** Колодец: 4 набора воды, новый — каждые 15 мин, копится офлайн до 4; попытка мини-игры — не чаще раза в 3 с (§7, §7.2) */
export const WELL_SETS = 4;
export const WELL_REFILL_MS = 15 * 60_000;
export const WELL_TRY_MS = 3000;

export type UpgradeKind = 'bed' | 'rake' | 'shovel' | 'can' | 'bag' | 'pig' | 'bees' | 'compost';

export interface UpgradeDef {
  id: string;
  kind: UpgradeKind;
  /** Ступень, к которой ведёт (Грядка 3 — 3, Лейка 2 — 2); постройки — 1 */
  step: number;
  name: string;
  /** Что даёт — строка для карточки */
  gives: string;
  level: number;
  coins: number;
  res: Readonly<Partial<Record<ResourceId, number>>>;
}

/** Все улучшения вместе — 3 760 🪙 (§6, RESULTS.md); проверяет test/farm.test.ts */
export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'bed2', kind: 'bed', step: 2, name: 'Грядка 2', gives: 'вторая грядка', level: 2, coins: 0, res: { fiber: 5, root: 4 } },
  { id: 'bed3', kind: 'bed', step: 3, name: 'Грядка 3', gives: 'третья грядка', level: 4, coins: 0, res: { root: 8, grain: 4 } },
  { id: 'bed4', kind: 'bed', step: 4, name: 'Грядка 4', gives: 'четвёртая грядка', level: 6, coins: 0, res: { spores: 4, fiber: 6 } },
  { id: 'bed5', kind: 'bed', step: 5, name: 'Грядка 5', gives: 'пятая грядка', level: 8, coins: 0, res: { 'crystal-dust': 4, grain: 4 } },
  { id: 'bed6', kind: 'bed', step: 6, name: 'Грядка 6', gives: 'шестая грядка', level: 10, coins: 0, res: { wood: 4, 'gold-leaf': 2 } },
  { id: 'bed7', kind: 'bed', step: 7, name: 'Грядка 7', gives: 'седьмая грядка', level: 11, coins: 0, res: { scale: 3, spores: 3 } },
  { id: 'bed8', kind: 'bed', step: 8, name: 'Грядка 8', gives: 'восьмая грядка', level: 12, coins: 0, res: { 'star-dust': 3, spores: 3 } },
  { id: 'rake2', kind: 'rake', step: 2, name: 'Грабли 2', gives: 'до 4 грядок разом, «собрать и посадить то же»', level: 4, coins: 50, res: { fiber: 15, grain: 8, root: 3 } },
  { id: 'rake3', kind: 'rake', step: 3, name: 'Грабли 3', gives: 'до 9 грядок — всё поле', level: 8, coins: 250, res: { fiber: 40, grain: 20, 'crystal-dust': 8 } },
  { id: 'shovel2', kind: 'shovel', step: 2, name: 'Лопатка 2', gives: 'двойной урожай 15 %', level: 4, coins: 50, res: { root: 12, fiber: 6, grain: 5 } },
  { id: 'shovel3', kind: 'shovel', step: 3, name: 'Лопатка 3', gives: 'двойной урожай 25 %', level: 7, coins: 250, res: { root: 30, grain: 15, spores: 10 } },
  { id: 'can2', kind: 'can', step: 2, name: 'Лейка 2', gives: '20 зарядов', level: 8, coins: 60, res: { 'crystal-dust': 12, grain: 5, root: 4 } },
  { id: 'can3', kind: 'can', step: 3, name: 'Лейка 3', gives: '50 зарядов', level: 10, coins: 300, res: { 'crystal-dust': 35, wood: 15, grain: 10 } },
  { id: 'bag2', kind: 'bag', step: 2, name: 'Сумка 2', gives: '50 мест', level: 2, coins: 50, res: { fiber: 20, root: 10 } },
  { id: 'bag3', kind: 'bag', step: 3, name: 'Сумка 3', gives: '100 мест', level: 10, coins: 150, res: { fiber: 40, wood: 20, 'crystal-dust': 8 } },
  { id: 'bag4', kind: 'bag', step: 4, name: 'Сумка 4', gives: '200 мест', level: 10, coins: 400, res: { 'crystal-dust': 25, spores: 15, 'gold-leaf': 8 } },
  { id: 'pig', kind: 'pig', step: 1, name: 'Трюфельный свин', gives: '1 трюфель за 3 ч, до 3 в загоне', level: 10, coins: 500, res: { 'gold-leaf': 10, wood: 15, 'crystal-dust': 10 } },
  { id: 'bees', kind: 'bees', step: 1, name: 'Пчёлы-опылители', gives: '+10 п.п. к шансу ресурса', level: 10, coins: 700, res: { fiber: 30, spores: 20, 'crystal-dust': 15 } },
  { id: 'compost', kind: 'compost', step: 1, name: 'Компостная куча', gives: 'рост ×0,85 для новых посадок', level: 12, coins: 1000, res: { 'crystal-dust': 40, spores: 25, 'star-dust': 8 } },
];

const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));
export function upgradeById(id: unknown): UpgradeDef | undefined {
  return typeof id === 'string' ? UPGRADE_BY_ID.get(id) : undefined;
}

// ------------------------------------------------------------ помощь соседям и репутация (§8)

/** Очки помощи: 5 + (ур. − 1), полный сброс раз в 10 мин; помощь — заряд лейки + очко (§8.1) */
export const HELP_BASE = 5;
export const HELP_RESET_MS = 10 * 60_000;
/** На грядку за цикл — не больше 3 помощей, каждый сосед — 1 раз; до созревания ≥ 20 с; помощник — ур. ≥ 2 */
export const HELPS_PER_BED = 3;
export const HELP_MIN_LEFT_MS = 20_000;
export const HELP_MIN_LEVEL = 2;
/** Помощнику: +1 репутация (≤ 30 в сутки) и 1 🪙 (за одного соседа — не больше 5 раз в час) */
export const HELP_REP = 1;
export const HELP_REP_DAY_CAP = 30;
export const HELP_COIN = 1;
export const HELP_COINS_PER_NEIGHBOR_HOUR = 5;

export interface RepLevel {
  level: number;
  name: string;
  need: number;
  /** Бонус к продаже у Гриба и в Фургоне */
  bonus: number;
  /** +1 слот Фургона */
  vanSlot: boolean;
  /** Косметика ступени (вещь каталога или убранство) */
  reward: string | null;
}

export const REP_LEVELS: readonly RepLevel[] = [
  { level: 1, name: 'Новосёл', need: 0, bonus: 0, vanSlot: false, reward: null },
  { level: 2, name: 'Садовник', need: 50, bonus: 0.02, vanSlot: true, reward: null },
  { level: 3, name: 'Опылитель', need: 150, bonus: 0.04, vanSlot: false, reward: 'l:sneakers' },
  { level: 4, name: 'Своя желейка', need: 350, bonus: 0.06, vanSlot: true, reward: null },
  { level: 5, name: 'Мастер грядок', need: 700, bonus: 0.08, vanSlot: false, reward: 'tl:goldcan' },
  { level: 6, name: 'Хранитель Древа', need: 1200, bonus: 0.10, vanSlot: true, reward: 'ti:treekeeper' },
  { level: 7, name: 'Любимец округи', need: 2000, bonus: 0.12, vanSlot: false, reward: 'tl:goldshovel' },
  { level: 8, name: 'Дух урожая', need: 3000, bonus: 0.15, vanSlot: false, reward: 'pl:harvest' },
];

/** Источники репутации (§8.2): помощь — HELP_REP; 1 % вклада в Древо — 2; «Последняя капля» — 5; первый вход за сутки — 1 */
export const REP_PER_BOSS_PERCENT = 2;
export const REP_LAST_DROP = 5;
export const REP_FIRST_ENTRY = 1;

// ------------------------------------------------------------ Фургон (§10.2)

/** Открыт в чётные часы по Москве, закрыт в нечётные: 1 ч / 1 ч */
export const VAN_CYCLE_MS = 2 * 3600_000;
/** Слоты по уровню фермы: ур. 3–4 → 1, 5–9 → 2, 10–13 → 3 (+1 за репутацию 2, 4, 6), не больше 6 */
export const VAN_SLOTS_BY_LEVEL: readonly { level: number; slots: number }[] = [{ level: 3, slots: 1 }, { level: 5, slots: 2 }, { level: 10, slots: 3 }];
export const VAN_MAX_SLOTS = 6;
/** Что берёт по уровню: с этого уровня добавляются эти культуры (из открытых игроку) */
export const VAN_ASSORTMENT: readonly { level: number; crops: readonly string[] }[] = [
  { level: 3, crops: ['radish', 'wheat', 'lettuce', 'onion', 'pumpkin'] },
  { level: 5, crops: ['carrot', 'sunflower', 'strawberry', 'giant-mushroom', 'dill'] },
  { level: 8, crops: ['chili', 'crystal', 'microgreens', 'lotus'] },
  { level: 10, crops: ['life-tree', 'golden-apple', 'dragon-fruit', 'star-flower', 'mythic-mushroom'] },
];
/** Слот 1 «Ходовой» — рост ≤ 30 мин; слот 3 «Дорогой» — 🟠 с ур. 6; у 4 последних открытых вес ×2 */
export const VAN_FAST_MAX_MIN = 30;
export const VAN_EXPENSIVE_LEVEL = 6;
export const VAN_RECENT = 4;
/** Количество: Q = max(1, min(30, ⌈30 / рост в часах⌉)), N = max(1, ⌊Q · u⌉), u ∈ [0,25; 0,6];
 *  для культур до 60 мин N ≤ грядки × ⌊55 / рост в мин⌋; всегда N ≤ ⌊0,8 × вместимость сумки⌋ */
export const VAN_Q_MAX = 30;
export const VAN_U: readonly [number, number] = [0.25, 0.6];
export const VAN_GROW_WINDOW_MIN = 55;
export const VAN_BAG_SHARE = 0.8;
/** Цена: M = ⌊N × продажа × m × (1 + репутация) × бафф⌉, m ∈ {1,3; 1,4; 1,5} поровну */
export const VAN_MULTS: readonly number[] = [1.3, 1.4, 1.5];
/** XP сделки: 15 % XP сбора × N, не меньше 5 */
export const VAN_XP_SHARE = 0.15;
export const VAN_XP_MIN = 5;
/** «Гурман» в слоте 3 на ур. 10+: шанс 10 %, 1–2 трюфеля ×1,5, потолком не режется */
export const VAN_GOURMET_LEVEL = 10;
export const VAN_GOURMET_CHANCE = 0.10;
export const VAN_GOURMET_N: readonly [number, number] = [1, 2];
export const VAN_GOURMET_MULT = 1.5;

/** Q из формулы v10; совпадает со столбцом «Фургон, шт» таблицы культур (проверяет тест) */
export function vanQ(c: CropDef): number {
  return Math.max(1, Math.min(VAN_Q_MAX, Math.ceil(30 / (c.min / 60))));
}

// ------------------------------------------------------------ доска заказов (§10.3)

export type OrderKind = 'grow' | 'help' | 'van' | 'special';

export interface OrderTemplate {
  id: string;
  kind: OrderKind;
  name: string;
  /** Условие — строка для карточки; N подставляется из need */
  goal: string;
  /** Сколько нужно: [min, max] (для «Вырасти» — N = ⌊min + (max − min) × t⌉, t = (грядок − 1) / 7) */
  need: readonly [number, number];
  coins: number;
  xp: number;
  rep: number;
}

/** Заказы: 3 в сутки (обновление в 00:00 МСК), 2 бесплатные замены */
export const ORDERS_PER_DAY = 3;
export const ORDER_REROLLS = 2;

export const ORDER_TEMPLATES: readonly OrderTemplate[] = [
  { id: 'grow-fast', kind: 'grow', name: 'Быстрые', goal: 'собрать N растений 🟢 (до 5 мин)', need: [20, 30], coins: 12, xp: 30, rep: 0 },
  { id: 'grow-mid', kind: 'grow', name: 'Обычные', goal: 'собрать N растений 🟡 (15–30 мин)', need: [6, 10], coins: 18, xp: 70, rep: 0 },
  { id: 'grow-long', kind: 'grow', name: 'Долгие', goal: 'собрать N растений 🟠 (45–120 мин)', need: [2, 4], coins: 28, xp: 120, rep: 0 },
  { id: 'grow-night', kind: 'grow', name: 'Очень долгие', goal: 'собрать 1 растение 🟠 (6–12 ч)', need: [1, 1], coins: 40, xp: 200, rep: 0 },
  { id: 'help-easy', kind: 'help', name: 'Лёгкий', goal: 'N помощи', need: [2, 2], coins: 6, xp: 20, rep: 0 },
  { id: 'help-mid', kind: 'help', name: 'Средний', goal: 'N помощи', need: [4, 4], coins: 12, xp: 45, rep: 0 },
  { id: 'help-hard', kind: 'help', name: 'Сложный', goal: 'N помощей 3 разным соседям', need: [6, 6], coins: 20, xp: 80, rep: 1 },
  { id: 'van-easy', kind: 'van', name: 'Лёгкий', goal: 'N сделка Фургона', need: [1, 1], coins: 10, xp: 25, rep: 0 },
  { id: 'van-mid', kind: 'van', name: 'Средний', goal: 'N сделки Фургона', need: [2, 2], coins: 20, xp: 60, rep: 0 },
  { id: 'van-hard', kind: 'van', name: 'Сложный', goal: 'N сделки Фургона', need: [3, 3], coins: 35, xp: 100, rep: 1 },
  { id: 'crystal-garden', kind: 'special', name: 'Кристальный сад', goal: 'собрать 3 Кристалла', need: [3, 3], coins: 30, xp: 120, rep: 0 },
  { id: 'night-gardener', kind: 'special', name: 'Ночной садовник', goal: 'собрать растение с ростом от 6 ч', need: [1, 1], coins: 40, xp: 180, rep: 0 },
  { id: 'tool-master', kind: 'special', name: 'Мастер инструмента', goal: 'улучшить любой инструмент', need: [1, 1], coins: 25, xp: 80, rep: 0 },
  { id: 'collector', kind: 'special', name: 'Коллекционер', goal: 'получить 10 вторичных ресурсов', need: [10, 10], coins: 20, xp: 60, rep: 0 },
  { id: 'neighbor-friend', kind: 'special', name: 'Друг локации', goal: 'помочь 3 разным соседям', need: [3, 3], coins: 25, xp: 80, rep: 1 },
  { id: 'tree-sprout', kind: 'special', name: 'Росток для Древа', goal: 'вклад ≥ 1 % в Древо', need: [1, 1], coins: 40, xp: 180, rep: 2 },
  { id: 'waterer', kind: 'special', name: 'Поливальщик', goal: 'полить 5 своих грядок за день', need: [5, 5], coins: 15, xp: 40, rep: 0 },
  { id: 'rich', kind: 'special', name: 'Богач', goal: 'продать урожая на 50 🪙 за сутки', need: [50, 50], coins: 18, xp: 40, rep: 0 },
  { id: 'patient', kind: 'special', name: 'Терпеливый', goal: 'собрать 2 растения с ростом от 45 мин', need: [2, 2], coins: 25, xp: 100, rep: 0 },
  { id: 'host', kind: 'special', name: 'Хозяин', goal: 'открыть новую грядку', need: [1, 1], coins: 35, xp: 120, rep: 0 },
  { id: 'all-mine', kind: 'special', name: 'Все свои', goal: 'зайти на ферму 3 дня подряд', need: [3, 3], coins: 25, xp: 80, rep: 1 },
  { id: 'tree-fest', kind: 'special', name: 'Праздник Древа', goal: 'Древо расцвело, твой вклад ≥ 1 %', need: [1, 1], coins: 60, xp: 250, rep: 3 },
];

/** Слот A «Вырасти»: веса групп 🟢 / 🟡 / 🟠 45–120 мин / 🟠 6–12 ч по уровню; конкретная культура — с вероятностью 50 % */
export const ORDER_GROW_WEIGHTS: readonly { level: number; w: readonly [number, number, number, number] }[] = [
  { level: 1, w: [0.6, 0.4, 0, 0] },
  { level: 2, w: [0.5, 0.5, 0, 0] },
  { level: 6, w: [0.3, 0.4, 0.3, 0] },
  { level: 10, w: [0.2, 0.3, 0.3, 0.2] },
];
export const ORDER_EXACT_CROP = 0.5;

// ------------------------------------------------------------ Древо разлома (§11)

/** Здоровье («Цветение») = 2 000 × N, N — фермеры с действием за 72 ч до 19:00, от 3 до 20; фиксируется на старте */
export const BOSS_HP_PER_FARMER = 2000;
export const BOSS_N_MIN = 3;
export const BOSS_N_MAX = 20;
export const BOSS_ACTIVE_WINDOW_MS = 72 * 3600_000;
/** 19:00–01:00 МСК; анонс в 18:55 */
export const BOSS_START_HOUR = 19;
export const BOSS_END_HOUR = 1;
export const BOSS_ANNOUNCE_MIN_BEFORE = 5;
/** Фазы по цветению: Ворчун 0–25 %, Чих 25–50 %, Щекотно 50–75 %, Пляс 75–100 % */
export const BOSS_PHASES: readonly number[] = [0.25, 0.5, 0.75];
/** Шишки-ворчуньи в фазах 2–3: 2 в минуту, +10 очков, не больше 30 на игрока за событие; чих раз в 40 с */
export const BOSS_CONES_PER_MIN = 2;
export const BOSS_CONE_POINTS = 10;
export const BOSS_CONES_PER_PLAYER = 30;
export const BOSS_SNEEZE_MS = 40_000;
/** Награда при вкладе ≥ 1 %: один из трёх баффов на 24 ч */
export const BOSS_MIN_SHARE = 0.01;
export type FarmBuffKind = 'xp' | 'price' | 'grow';
export const BUFF_MS = 24 * 3600_000;
/** Баффы Древа: +10 % опыта, +10 % к цене продажи, −10 % времени роста */
export const BUFFS: Readonly<Record<FarmBuffKind, { name: string; mult: number; icon: string }>> = {
  xp: { name: '+10 % опыта', mult: 1.1, icon: 'buff-xp' },
  price: { name: '+10 % к цене продажи', mult: 1.1, icon: 'buff-price' },
  grow: { name: '−10 % времени роста', mult: 0.9, icon: 'buff-grow' },
};

// ------------------------------------------------------------ достижения (§13)

/** Что считает достижение: счётчик в farm.counters (ключи — FARM_COUNTERS) или особое условие */
export interface AchievementDef {
  id: string;
  category: string;
  name: string;
  /** Минимальный уровень фермы: прогресс копится, награда — при достижении уровня */
  level: number;
  goal: string;
  /** Ключ счётчика и порог */
  counter: string;
  need: number;
  /** Награды: вещи каталога, убранство (FARM_DECOR) и жетоны */
  items: readonly string[];
  coins: number;
  /** Скрыто до получения: «???» с категорией */
  hidden: boolean;
}

/**
 * Ключи farm.counters. Двойной урожай — один сбор. Некоторые счётчики выводятся (уникальные культуры — по h:<культура>,
 * типы ресурсов — по res:<ресурс>), их считает shared/farm.ts.
 */
export const FARM_COUNTERS = {
  harvests: 'harvests',
  /** + id культуры: сколько собрано этой культуры */
  harvestOf: 'h:',
  /** + id ресурса: сколько получено этого ресурса */
  resOf: 'res:',
  uniqueCrops: 'uniqueCrops',
  resTypes: 'resTypes',
  /** Сборы культур с ростом от 45 мин и от 6 ч */
  longHarvests: 'longHarvests',
  nightHarvests: 'nightHarvests',
  harvestDays: 'harvestDays',
  soldNpc: 'soldNpc',
  vanDeals: 'vanDeals',
  helps: 'helps',
  helpTargetsDay: 'helpTargetsDay',
  repLevel: 'repLevel',
  bossShares: 'bossShares',
  bossDrops: 'bossDrops',
  truffles: 'truffles',
  bees: 'bees',
  compost: 'compost',
  morning: 'morning',
  converts: 'converts',
} as const;

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first-bed', category: 'Первые шаги', name: 'Первая грядка', level: 1, goal: '1 сбор', counter: 'harvests', need: 1, items: ['em:showoff'], coins: 0, hidden: false },
  { id: 'hands-in-soil', category: 'Первые шаги', name: 'Руки в земле', level: 2, goal: '25 сборов', counter: 'harvests', need: 25, items: ['n:sprout'], coins: 25, hidden: false },
  { id: 'steady', category: 'Первые шаги', name: 'Уверенный урожай', level: 3, goal: '100 сборов', counter: 'harvests', need: 100, items: ['l:patched'], coins: 0, hidden: false },
  { id: 'seniority', category: 'Первые шаги', name: 'Фермерский стаж', level: 5, goal: '250 сборов', counter: 'harvests', need: 250, items: ['ti:seasoned'], coins: 0, hidden: false },
  { id: 'legend', category: 'Первые шаги', name: 'Легенда грядок', level: 10, goal: '1 000 сборов', counter: 'harvests', need: 1000, items: ['ti:thousand', 'fr:wicker'], coins: 0, hidden: false },
  { id: 'variety', category: 'Коллекционер', name: 'Первое разнообразие', level: 4, goal: 'урожай с 5 разных культур', counter: 'uniqueCrops', need: 5, items: ['h:explorer'], coins: 0, hidden: false },
  { id: 'palette', category: 'Коллекционер', name: 'Палитра сезона', level: 8, goal: '5 типов вторичных ресурсов', counter: 'resTypes', need: 5, items: ['fr:herbarium'], coins: 0, hidden: false },
  { id: 'full-collection', category: 'Коллекционер', name: 'Полная коллекция', level: 12, goal: 'все 9 типов ресурсов', counter: 'resTypes', need: 9, items: ['s:beetle'], coins: 0, hidden: false },
  { id: 'botanist', category: 'Коллекционер', name: 'Ботаник', level: 13, goal: 'урожай со всех 19 культур', counter: 'uniqueCrops', need: 19, items: ['a:canpack'], coins: 0, hidden: false },
  { id: 'patience', category: 'Мастер времени', name: 'Терпение — урожай', level: 10, goal: 'собрать культуру с ростом от 6 ч', counter: 'nightHarvests', need: 1, items: ['h:nightcap'], coins: 0, hidden: false },
  { id: 'schedule', category: 'Мастер времени', name: 'Всё по расписанию', level: 5, goal: 'собирать урожай в 7 разных дней', counter: 'harvestDays', need: 7, items: ['a:alarm'], coins: 0, hidden: false },
  { id: 'long-haul', category: 'Мастер времени', name: 'Долгая дистанция', level: 7, goal: '100 сборов культур с ростом от 45 мин', counter: 'longHarvests', need: 100, items: ['h:oldgardener'], coins: 0, hidden: false },
  { id: 'full-basket', category: 'Урожай', name: 'Полная корзина', level: 4, goal: 'продать Грибу 200 шт. урожая', counter: 'soldNpc', need: 200, items: ['a:apron'], coins: 0, hidden: false },
  { id: 'wholesaler', category: 'Урожай', name: 'Оптовик', level: 7, goal: 'продать 1 000 шт. основного урожая', counter: 'soldNpc', need: 1000, items: ['em:rubhands'], coins: 0, hidden: false },
  { id: 'deal', category: 'Урожай', name: 'Сделка века', level: 8, goal: '50 сделок Фургона', counter: 'vanDeals', need: 50, items: ['pl:cart'], coins: 0, hidden: false },
  { id: 'welcome', category: 'Соседи', name: 'Добро пожаловать по соседству', level: 2, goal: 'первая помощь соседу', counter: 'helps', need: 1, items: ['n:neighbor'], coins: 0, hidden: false },
  { id: 'together', category: 'Соседи', name: 'Вместе растём', level: 4, goal: 'помочь 5 разным соседям за день', counter: 'helpTargetsDay', need: 5, items: ['em:sprinkle'], coins: 0, hidden: false },
  { id: 'support', category: 'Соседи', name: 'Соседская поддержка', level: 5, goal: '100 помощей', counter: 'helps', need: 100, items: ['a:basket'], coins: 0, hidden: false },
  { id: 'soul', category: 'Соседи', name: 'Душа района', level: 8, goal: '1 000 помощей', counter: 'helps', need: 1000, items: ['s:firefly'], coins: 0, hidden: false },
  { id: 'good-name', category: 'Репутация', name: 'Хорошее имя', level: 4, goal: 'репутация 4', counter: 'repLevel', need: 4, items: ['n:reliable'], coins: 0, hidden: false },
  { id: 'everyone', category: 'Репутация', name: 'Все тебя знают', level: 8, goal: 'репутация 8', counter: 'repLevel', need: 8, items: ['u:sweater'], coins: 0, hidden: false },
  { id: 'first-share', category: 'Древо', name: 'Первый вклад', level: 3, goal: 'вклад ≥ 1 % в одно событие', counter: 'bossShares', need: 1, items: ['n:treeguard'], coins: 0, hidden: false },
  { id: 'teamwork', category: 'Древо', name: 'Командная работа', level: 7, goal: '10 цветений с вкладом ≥ 1 %', counter: 'bossShares', need: 10, items: ['u:treevest'], coins: 0, hidden: false },
  { id: 'last-drop', category: 'Древо', name: 'Последняя капля', level: 8, goal: '5 раз завершить цветение', counter: 'bossDrops', need: 5, items: ['f:treesparks'], coins: 0, hidden: false },
  { id: 'pig', category: 'Особые', name: 'Свинья не врёт', level: 10, goal: 'собрать 25 трюфелей', counter: 'truffles', need: 25, items: ['h:pigears'], coins: 0, hidden: false },
  { id: 'bee-friend', category: 'Особые', name: 'Пчелиный друг', level: 10, goal: 'поставить пчёл', counter: 'bees', need: 1, items: ['a:bee'], coins: 0, hidden: false },
  { id: 'compost-master', category: 'Особые', name: 'Компост-мастер', level: 12, goal: 'поставить компост', counter: 'compost', need: 1, items: ['s:mushroom'], coins: 0, hidden: false },
  { id: 'morning', category: 'Скрытое', name: 'Утренний сад', level: 3, goal: 'собрать урожай 05:00–07:00 МСК', counter: 'morning', need: 1, items: ['em:stretch'], coins: 0, hidden: true },
  { id: 'not-money', category: 'Скрытое', name: 'Не только ради денег', level: 3, goal: 'первая конвертация ресурса в XP', counter: 'converts', need: 1, items: ['n:knowledge'], coins: 0, hidden: true },
];

/** Сбор считается «долгим» от 45 мин и «ночным» от 6 ч роста; «утренний» — 05:00–07:00 МСК */
export const LONG_HARVEST_MIN = 45;
export const NIGHT_HARVEST_MIN = 360;
export const MORNING_HOURS: readonly [number, number] = [5, 7];

// ------------------------------------------------------------ косметика (§12)

/**
 * Вещи фермы в каталоге одежды (shared/outfit.ts, tier 'trophy'): слоты h, u, l, a, s, f, n. Порядок и ключи — здесь,
 * outfit.ts берёт их отсюда; добавлять — только в конец.
 */
export const FARM_WEAR: readonly (readonly [slot: 'h' | 'u' | 'l' | 'a' | 's' | 'f' | 'n', key: string, name: string])[] = [
  ['h', 'farmcap', 'Кепка фермера'],
  ['h', 'straw', 'Соломенная шляпа'],
  ['h', 'sunhat', 'Шляпа-подсолнух'],
  ['h', 'goldstraw', 'Золотая солома'],
  ['h', 'leafcrown', 'Венец из листьев'],
  ['h', 'explorer', 'Панама «Исследователь»'],
  ['h', 'nightcap', 'Колпак «Ночной дозор»'],
  ['h', 'oldgardener', 'Шляпа «Старый садовник»'],
  ['h', 'pigears', 'Шапка со свиными ушами'],
  ['u', 'workshirt', 'Рабочая футболка'],
  ['u', 'sprout', 'Футболка «Росток»'],
  ['u', 'plaid', 'Куртка «Клетчатая»'],
  ['u', 'windbreaker', 'Ветровка садовника'],
  ['u', 'leafcape', 'Накидка «Листопад»'],
  ['u', 'stargardener', 'Куртка «Звёздный садовник»'],
  ['u', 'sweater', 'Свитер «Дух урожая»'],
  ['u', 'treevest', 'Жилет «Страж Древа»'],
  ['l', 'jeans', 'Джинсы'],
  ['l', 'boots', 'Резиновые сапоги'],
  ['l', 'overalls', 'Комбинезон «Рабочий»'],
  ['l', 'patched', 'Штаны с заплатками'],
  ['l', 'sneakers', 'Кеды «Росток»'],
  ['a', 'greengloves', 'Перчатки «Зелёные пальцы»'],
  ['a', 'apron', 'Фартук «Торгаш»'],
  ['a', 'alarm', 'Будильник «Тик-так»'],
  ['a', 'basket', 'Корзинка гостинцев'],
  ['a', 'bee', 'Пчёлка на плече'],
  ['a', 'canpack', 'Рюкзак-лейка'],
  ['s', 'chick', 'Цыплёнок «Пик»'],
  ['s', 'piglet', 'Поросёнок «Желудь»'],
  ['s', 'beetle', 'Жук «Клёпа»'],
  ['s', 'firefly', 'Светлячок в банке «Огонёк»'],
  ['s', 'mushroom', 'Мини-гриб «Опёнок»'],
  ['f', 'treesparks', 'Искры Древа'],
  ['f', 'fireflies', 'След из светлячков'],
  ['n', 'sprout', 'Значок «Росток»'],
  ['n', 'neighbor', 'Значок «Добрый сосед»'],
  ['n', 'reliable', 'Значок «Надёжный фермер»'],
  ['n', 'treeguard', 'Значок «Защитник Древа»'],
  ['n', 'knowledge', 'Значок «Знание — сила»'],
];

/** id вещей фермы в каталоге одежды ('h:farmcap' …) */
export const FARM_ITEM_IDS: ReadonlySet<string> = new Set(FARM_WEAR.map(([slot, key]) => `${slot}:${key}`));

export type FarmDecorKind = 'em' | 'ti' | 'fr' | 'tl' | 'pl';

/** Убранство — не одежда: эмоции 7–9, титулы, рамки карточки, скины инструментов, вещи участка (§12.2, «Хозяйство → Убранство»). Хранится в farm.decor */
export const FARM_DECOR: readonly { id: string; kind: FarmDecorKind; name: string }[] = [
  { id: 'em:showoff', kind: 'em', name: 'Показать урожай' },
  { id: 'em:rubhands', kind: 'em', name: 'Потирает руки' },
  { id: 'em:stretch', kind: 'em', name: 'Потягивается' },
  { id: 'em:sprinkle', kind: 'em', name: 'Полить друга' },
  { id: 'ti:seasoned', kind: 'ti', name: 'Опытный фермер' },
  { id: 'ti:thousand', kind: 'ti', name: 'Тысяча урожаев' },
  { id: 'ti:treekeeper', kind: 'ti', name: 'Хранитель Древа' },
  { id: 'ti:legend', kind: 'ti', name: 'Легенда фермы' },
  { id: 'fr:herbarium', kind: 'fr', name: 'Гербарий' },
  { id: 'fr:wicker', kind: 'fr', name: 'Плетёная корзина' },
  { id: 'tl:goldcan', kind: 'tl', name: 'Золотая лейка' },
  { id: 'tl:goldshovel', kind: 'tl', name: 'Золотая лопатка' },
  { id: 'pl:cart', kind: 'pl', name: 'Тележка «Сделка века»' },
  { id: 'pl:harvest', kind: 'pl', name: 'Ограда «Дух урожая»' },
];

const DECOR_IDS = new Set(FARM_DECOR.map((d) => d.id));
export function isFarmDecor(id: string): boolean {
  return DECOR_IDS.has(id);
}

// ------------------------------------------------------------ уведомления (§14.4)

/** Тосты о созревании на ферме склеиваются за 3 с; вне фермы — не чаще раза в 15 мин */
export const RIPE_TOAST_MERGE_MS = 3000;
export const AWAY_TOAST_MS = 15 * 60_000;
