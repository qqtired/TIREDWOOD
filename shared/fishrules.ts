// Рыбалка 2.0: 51 морской вид в пяти категориях — 32 у пристани (8 из них только в дождь) и 19 на баркасе в открытом
// море (4 — только в дождь); сундук и хлам; цены, шансы и манера на шкале вываживания (shared/fishreel.ts).
// Названия, вес и вид рыб — в общей таблице FISH (shared/fishing.ts), здесь — правила. Решает сервер
// (server/lobby/fishing2.ts); клиент по этим же таблицам рисует шкалу, карточку улова, журнал, «Шансы сейчас».
//
// Сложность (fisheco, 03.10): чем ценнее рыба, тем она злее — зона меньше, рывки резче, успех ниже (BAND, CAL); у каждого
// вида свой характер: пара паттернов и где держится. Легенды и мифик делают «последний рывок» на 70 % прогресса.
// Баркас — своё море: рывки и резкость ×1,15, сопротивление ×1,2; блесна гасит рывки.
import { FISH, fmtWeight } from './fishing.ts';
import type { FishZone } from './fishplaces.ts';
import type { ReelStyle, ReelPattern } from './fishreel.ts';
import type { FishCastMods } from './fishprogress.ts';

// ------------------------------------------------------------ экономика

/** Справочно: доход обычного игрока 0-го уровня у пристани в ясную погоду, жетонов/мин (меряет тест на модели игрока). */
export const FISH_TARGET_PER_MIN = 19.3;
/** Сколько очков ценности (поле val) в минуту набирает тот же игрок — меряет тест. */
export const FISH_POINTS_PER_MIN = 15.7;
/** Исходный курс выпуска 6: заморожен, чтобы +75 % считались от старой целой цены, а не от новой цели. */
export const COIN_PER_POINT = 13.5 / 13.7;
/** Калибровка только остальных рыб. Это не второй глобальный множитель для обычных. */
export const FISH_OTHER_PRICE_SCALE = 1.076;
/** Баркас: доход и опыт за каждую рыбу ×1,25 (база видов баркаса — как у пристани в минуту) */
export const BARKAS_INCOME = 1.25;
export const BARKAS_XP = 1.25;
/** Море злее: рывки и резкость ×1,15, сопротивление ×1,2 — поверх манеры вида */
export const SEA_FIGHT = 1.15;
export const SEA_DRAIN = 1.2;
/** Опыт за рыбу: прежняя формула ×0,4 (было ×0,3333 — +20 %) */
export const XP_SCALE = 0.4;
/** Сорвалась эпическая и выше после стольких тиков борьбы (3 с) — утешение: четверть опыта за поимку */
export const CONSOLATION_TICKS = 180;
export const CONSOLATION_SHARE = 0.25;

// ------------------------------------------------------------ категории

export const T_COMMON = 0;
export const T_RARE = 1;
export const T_EPIC = 2;
export const T_LEGEND = 3;
export const T_MYTH = 4;
export const T_JUNK = 5;
export const T_CHEST = 6;
export const TIER_NAMES = ['обычная', 'редкая', 'эпическая', 'легендарная', 'мифическая', 'находка', 'сундук'] as const;
/** Во множественном числе — для журнала */
export const TIER_TITLES = ['Обычные', 'Редкие', 'Эпические', 'Легендарные', 'Мифические', 'Находки', 'Сундук'] as const;
/** Коротко — для полосы «Шансы сейчас» */
export const TIER_SHORT = ['обычн.', 'редк.', 'эпик', 'лег.', 'миф.', 'хлам', 'сундук'] as const;
/** Цвет категории: рамки, подписи, шкала */
export const TIER_CSS = ['#8f9aa3', '#2f86d8', '#9a4ee0', '#eb9a12', '#e8364f', '#8a7766', '#d9a521'] as const;
/** Новый вид в коллекции — бонус, жетонов (один раз) */
export const NEW_BONUS2 = [5, 10, 20, 40, 100, 0, 0] as const;
/** С этой категории улов объявляется в общем чате */
export const ANNOUNCE_TIER = T_EPIC;

/** Дождевые виды платят ×3/2 */
export const RAIN_NUM = 3;
export const RAIN_DEN = 2;
/** В дождь легендарные и мифические виды события клюют в 1,5 раза чаще базового */
export const RAIN_TOP_MUL = 1.5;

/** Сундук вместо улова: на столько поклёвок из 10 000 (3 %) */
export const CHEST_PER_10K = 300;
/** Хлам (сапог, бутылка): на столько поклёвок из 10 000 */
export const JUNK_PER_10K = 450;
/** Сколько в сундуке: полосы «от, до, вес» — крупное реже, 200 — джекпот */
export const CHEST_BANDS: ReadonlyArray<readonly [number, number, number]> = [
  [25, 50, 650],
  [51, 100, 250],
  [101, 150, 70],
  [151, 199, 25],
  [200, 200, 5],
];
/** С этой суммы сундук объявляется в общем чате */
export const CHEST_ANNOUNCE = 151;

// ------------------------------------------------------------ полосы сложности

/**
 * Полоса категории: зона игрока % и резкость 1–10 растут с ценностью и одинаковы у всей категории (их видно на шкале).
 * Скорость, рывок, размах, цикл и сопротивление — отправная точка калибровки (tools/fish/calibrate.ts), у видов свои
 * цифры (CAL ниже). Уровень, удочка и блесна поднимают успех (docs/superpowers/plans/2026-10-03-fisheco.md).
 */
export const BAND: ReadonlyArray<{ zone: number; spd: number; dart: number; amp: number; per: number; drain: number; sharp: number }> = [
  { zone: 37, spd: 20, dart: 70, amp: 32, per: 170, drain: 12, sharp: 5 },
  { zone: 30.5, spd: 27, dart: 100, amp: 42, per: 150, drain: 16, sharp: 6 },
  { zone: 27.5, spd: 33, dart: 130, amp: 52, per: 135, drain: 16, sharp: 7 },
  { zone: 25, spd: 38, dart: 160, amp: 62, per: 125, drain: 14, sharp: 8 },
  { zone: 22.5, spd: 43, dart: 190, amp: 70, per: 115, drain: 12, sharp: 9 },
];
/** «Последний рывок» легенд и мификов: скорость ×1,3 на один цикл */
export const LAST_STAND = 130;

// ------------------------------------------------------------ виды

export interface FishRule {
  /** Номер в FISH */
  sp: number;
  id: string;
  tier: number;
  /** Где ловится: у пристани или на баркасе в открытом море */
  zone: FishZone;
  /** Как часто клюёт: вес в пуле своего места (дождевые добавляются в дождь) */
  bite: number;
  /** Только в дождь (и платит ×1,5) */
  rain: boolean;
  /** Ценность, очки: за самую лёгкую и за самую тяжёлую (жетоны — через COIN_PER_POINT) */
  val: readonly [number, number];
  /** Замороженная сложность выпуска 6 — из неё опыт у видов пристани (fishCatchXp) */
  xpDifficulty: number;
  /** База опыта (до «идеально», легенд ×5 и ×0,4) — у видов баркаса задана прямо */
  xpBase?: number;
  /** Манера на шкале */
  style: ReelStyle;
  /** Манера словами — для журнала */
  note: string;
}

interface Raw {
  tier: number;
  bite: number;
  rain: boolean;
  val: readonly [number, number];
  zone?: FishZone;
  xpBase?: number;
  /** Главный и второй паттерн (скорость, рывок, размах, цикл и сопротивление — в таблице CAL) */
  pat: readonly [ReelPattern, ReelPattern];
  /** Где держится, % шкалы снизу; доля рывков вверх, % */
  lo?: number;
  hi?: number;
  up?: number;
  note: string;
}

// Порядок внутри категории — порядок журнала. Новое — только в конец своего места (ключи альбома не меняются).
const RAW: Record<string, Raw> = {
  // --- пристань: обычные — широкая зона, мягкие, по ним учатся
  hamsa: { tier: T_COMMON, bite: 70, rain: false, val: [2, 3], pat: ['Nervous', 'Dash'], lo: 35, hi: 95, note: 'мелкая суета у поверхности' },
  goby: { tier: T_COMMON, bite: 75, rain: false, val: [2, 4], pat: ['HoverDash', 'SlowMigration'], lo: 0, hi: 40, up: 70, note: 'сидит у дна, короткие подскоки' },
  scad: { tier: T_COMMON, bite: 70, rain: false, val: [2, 5], pat: ['Dash', 'Wave'], note: 'ровные быстрые проходы' },
  redmullet: { tier: T_COMMON, bite: 60, rain: false, val: [2, 5], pat: ['SlowMigration', 'Sawtooth'], lo: 0, hi: 45, note: 'роется у самого дна' },
  wrasse: { tier: T_COMMON, bite: 60, rain: false, val: [2, 4], pat: ['FakeDash', 'Nervous'], lo: 20, hi: 75, note: 'снуёт у камней' },
  karas: { tier: T_COMMON, bite: 55, rain: false, val: [2, 4], pat: ['Wave', 'SlowMigration'], note: 'плавные широкие ходы' },
  blenny: { tier: T_COMMON, bite: 45, rain: false, val: [2, 3], pat: ['Ambush', 'HoverDash'], lo: 0, hi: 55, up: 65, note: 'сидит на камне, вдруг прыгает' },
  sardine: { tier: T_COMMON, bite: 55, rain: false, val: [2, 3], pat: ['Sawtooth', 'Nervous'], lo: 40, hi: 100, note: 'зигзаги стайки у поверхности' },
  whiting: { tier: T_COMMON, bite: 55, rain: false, val: [2, 5], pat: ['SlowMigration', 'Wave'], lo: 15, hi: 75, note: 'ровно ходит в толще' },
  picarel: { tier: T_COMMON, bite: 180, rain: true, val: [2, 3], pat: ['Nervous', 'DoubleDash'], lo: 30, hi: 85, note: 'вертлявая, держится стайкой' },
  // --- редкие: зона меньше, у каждой свой норов
  mullet: { tier: T_RARE, bite: 48, rain: false, val: [4, 12], pat: ['Breach', 'DoubleDash'], up: 80, note: 'прыгает свечками вверх' },
  mackerel: { tier: T_RARE, bite: 48, rain: false, val: [4, 10], pat: ['DoubleDash', 'SlowMigration'], note: 'носится без остановки' },
  garfish: { tier: T_RARE, bite: 42, rain: false, val: [4, 10], pat: ['Breach', 'EdgeSnapback'], lo: 45, hi: 100, up: 80, note: 'у самой поверхности, свечки' },
  scorpion: { tier: T_RARE, bite: 42, rain: false, val: [5, 12], pat: ['Ambush', 'FakeDash'], lo: 0, hi: 50, note: 'засада: стоит — и бросок' },
  flounder: { tier: T_RARE, bite: 42, rain: false, val: [5, 13], pat: ['HoverDash', 'Wave'], lo: 0, hi: 35, up: 70, note: 'лежит на дне, взлетает и планирует' },
  gurnard: { tier: T_RARE, bite: 38, rain: false, val: [5, 12], pat: ['Sawtooth', 'HoverDash'], lo: 0, hi: 45, note: 'шагает по дну перебежками' },
  eel: { tier: T_RARE, bite: 140, rain: true, val: [5, 13], pat: ['Wave', 'FakeDash'], lo: 0, hi: 60, note: 'извивается, то туда, то сюда' },
  meagre: { tier: T_RARE, bite: 130, rain: true, val: [5, 13], pat: ['SlowMigration', 'EdgeSnapback'], note: 'тяжёлые мощные проводки' },
  shad: { tier: T_RARE, bite: 150, rain: true, val: [4, 10], pat: ['FakeDash', 'Dash'], lo: 35, hi: 100, note: 'серебряная молния у поверхности' },
  // --- эпические: быстрые, резкие, частые рывки
  bluefish: { tier: T_EPIC, bite: 28, rain: false, val: [10, 26], pat: ['DoubleDash', 'FakeDash'], note: 'агрессивный, резкие броски' },
  dogfish: { tier: T_EPIC, bite: 26, rain: false, val: [11, 28], pat: ['Dash', 'EdgeSnapback'], note: 'акулья хватка, длинные проводки' },
  ray: { tier: T_EPIC, bite: 24, rain: false, val: [11, 28], pat: ['Wave', 'HoverDash'], lo: 0, hi: 55, note: 'планирует дугами, липнет ко дну' },
  turbot: { tier: T_EPIC, bite: 22, rain: false, val: [13, 32], pat: ['Ambush', 'EdgeSnapback'], lo: 0, hi: 40, up: 75, note: 'лежит пластом — и взмывает' },
  seabass: { tier: T_EPIC, bite: 110, rain: true, val: [11, 28], pat: ['FakeDash', 'DoubleDash'], note: 'мощные рывки в прибое' },
  leerfish: { tier: T_EPIC, bite: 100, rain: true, val: [13, 32], pat: ['EdgeSnapback', 'DoubleDash'], note: 'сильный хищник прибоя' },
  // --- легендарные: испытание, «последний рывок»
  sturgeon: { tier: T_LEGEND, bite: 10, rain: false, val: [36, 105], pat: ['Sound', 'Ambush'], lo: 0, hi: 50, up: 25, note: 'уходит на дно и тянет мощными рывками' },
  tuna: { tier: T_LEGEND, bite: 8, rain: false, val: [40, 110], pat: ['Dash', 'Sawtooth'], note: 'неутомимый: носится по всей шкале' },
  swordfish: { tier: T_LEGEND, bite: 8, rain: false, val: [40, 110], pat: ['Breach', 'Dash'], up: 80, note: 'свечки и прыжки вверх' },
  angler: { tier: T_LEGEND, bite: 8, rain: false, val: [32, 95], pat: ['Ambush', 'Nervous'], lo: 0, hi: 50, note: 'замирает надолго — и взрывной бросок' },
  bluemarlin: { tier: T_LEGEND, bite: 20, rain: true, val: [45, 125], pat: ['EdgeSnapback', 'Wave'], up: 70, note: 'длинные быстрые проходы и свечки' },
  // --- мифические: событие на весь пирс
  whiteshark: { tier: T_MYTH, bite: 6, rain: false, val: [200, 400], pat: ['FakeDash', 'Ambush'], note: 'всё сразу: скорость, рывки, сила' },
  greenlandshark: { tier: T_MYTH, bite: 3, rain: true, val: [220, 480], pat: ['SlowMigration', 'Sound'], lo: 0, hi: 70, up: 30, note: 'глубокие тяжёлые проводки, мощное сопротивление' },

  // --- баркас, открытое море: свой пул; доход и опыт ×1,25, рыба злее (SEA_FIGHT, SEA_DRAIN)
  sprat: { tier: T_COMMON, zone: 'barkas', bite: 165, rain: false, val: [2.6, 4], xpBase: 17, pat: ['Zigzag', 'Nervous'], lo: 40, hi: 100, note: 'стайка мечется зигзагами' },
  flyingfish: { tier: T_COMMON, zone: 'barkas', bite: 130, rain: false, val: [2.6, 5.3], xpBase: 17, pat: ['Breach', 'Nervous'], lo: 45, hi: 100, up: 85, note: 'выпрыгивает из воды и планирует' },
  haddock: { tier: T_COMMON, zone: 'barkas', bite: 145, rain: false, val: [2.6, 6.5], xpBase: 17, pat: ['Nervous', 'Wave'], lo: 0, hi: 50, note: 'кивает и дёргается у дна' },
  hake: { tier: T_COMMON, zone: 'barkas', bite: 137, rain: false, val: [2.6, 6.5], xpBase: 17, pat: ['SlowMigration', 'Dash'], lo: 10, hi: 70, note: 'уходит в глубину и хватает пастью' },
  redfish: { tier: T_RARE, zone: 'barkas', bite: 72, rain: false, val: [5.2, 13.7], xpBase: 28, pat: ['HoverDash', 'Sawtooth'], lo: 0, hi: 60, note: 'упирается колючками, рвётся рывками' },
  bonito: { tier: T_RARE, zone: 'barkas', bite: 72, rain: false, val: [5.2, 13.7], xpBase: 28, pat: ['Dash', 'Zigzag'], note: 'быстрые броски, как у маленького тунца' },
  cod: { tier: T_RARE, zone: 'barkas', bite: 69, rain: false, val: [5.2, 14.9], xpBase: 28, pat: ['Sound', 'DoubleDash'], lo: 0, hi: 55, up: 35, note: 'тяжело тянет вниз' },
  barracuda: { tier: T_RARE, zone: 'barkas', bite: 62, rain: false, val: [5.2, 14.9], xpBase: 28, pat: ['Ambush', 'Dash'], note: 'стоит в засаде — и молнией' },
  wolffish: { tier: T_EPIC, zone: 'barkas', bite: 38, rain: false, val: [11.4, 28.4], xpBase: 33, pat: ['Ambush', 'Sawtooth'], lo: 0, hi: 50, note: 'кусается: стоит у дна и резко бьёт' },
  mahi: { tier: T_EPIC, zone: 'barkas', bite: 36, rain: false, val: [11.4, 29.4], xpBase: 33, pat: ['Breach', 'FakeDash'], up: 75, note: 'акробат: свечки и обманные броски' },
  amberjack: { tier: T_EPIC, zone: 'barkas', bite: 32, rain: false, val: [12.3, 31.4], xpBase: 33, pat: ['DoubleDash', 'Sound'], up: 30, note: 'рвёт вниз, к самому дну' },
  sunfish: { tier: T_LEGEND, zone: 'barkas', bite: 11, rain: false, val: [30.6, 89.1], xpBase: 38, pat: ['SlowMigration', 'Circle'], note: 'огромная и медленная, но неудержимая' },
  halibut: { tier: T_LEGEND, zone: 'barkas', bite: 14, rain: false, val: [32.2, 91.8], xpBase: 38, pat: ['HoverDash', 'Sound'], lo: 0, hi: 45, up: 30, note: 'лежит пластом и тянет вниз всем весом' },
  mako: { tier: T_LEGEND, zone: 'barkas', bite: 11, rain: false, val: [34, 97.6], xpBase: 38, pat: ['Dash', 'Breach'], up: 70, note: 'самая быстрая акула: броски и прыжки' },
  oarfish: { tier: T_MYTH, zone: 'barkas', bite: 6, rain: false, val: [187, 373], xpBase: 42, pat: ['Circle', 'Sound'], note: 'змеится по всей шкале — и уходит в глубину' },
  hairtail: { tier: T_RARE, zone: 'barkas', bite: 330, rain: true, val: [5.2, 13.7], xpBase: 28, pat: ['Wave', 'Zigzag'], lo: 20, hi: 90, note: 'вьётся серебряной лентой' },
  wahoo: { tier: T_EPIC, zone: 'barkas', bite: 150, rain: true, val: [12.3, 31.4], xpBase: 33, pat: ['Zigzag', 'DoubleDash'], note: 'самый быстрый: длинные рывки зигзагом' },
  blueshark: { tier: T_EPIC, zone: 'barkas', bite: 120, rain: true, val: [11.4, 29.4], xpBase: 33, pat: ['Circle', 'FakeDash'], note: 'кружит и обманывает' },
  hammerhead: { tier: T_LEGEND, zone: 'barkas', bite: 30, rain: true, val: [38.3, 106.1], xpBase: 38, pat: ['Circle', 'EdgeSnapback'], note: 'широкие круги и рывки к краю' },

  // --- не рыбы: лежат мёртвым грузом
  boot: { tier: T_JUNK, bite: 0, rain: false, val: [0, 0], pat: ['SlowMigration', 'SlowMigration'], note: 'не сопротивляется' },
  bottle: { tier: T_JUNK, bite: 0, rain: false, val: [0, 0], pat: ['SlowMigration', 'SlowMigration'], note: 'не сопротивляется' },
  chest: { tier: T_CHEST, bite: 0, rain: false, val: [0, 0], pat: ['SlowMigration', 'SlowMigration'], note: 'тяжёлый и не бьётся' },
};

/** Хлам и сундук: прежняя манера без паттернов — тянутся мёртвым грузом */
const DEAD: Record<string, ReelStyle> = {
  boot: { spd: 8, sharp: 2, turn: 2, dart: 0, dartSpd: 0, dartUp: 0, hover: 1500, hoverP: 90, lo: 0, hi: 20, roam: 10, zone: 40, drain: 7 },
  bottle: { spd: 10, sharp: 2, turn: 3, dart: 0, dartSpd: 0, dartUp: 0, hover: 1500, hoverP: 90, lo: 0, hi: 25, roam: 12, zone: 40, drain: 7 },
  chest: { spd: 8, sharp: 2, turn: 2, dart: 0, dartSpd: 0, dartUp: 0, hover: 1500, hoverP: 90, lo: 0, hi: 15, roam: 10, zone: 40, drain: 7 },
};

// Frozen released cost-to-success of release 6: XP base of pier species (see fishCatchXp).
const XP_DIFFICULTY: Record<string, number> = {
  hamsa: 348.6, goby: 326.5, scad: 343.7, redmullet: 330.3, wrasse: 335.7, karas: 329.6, blenny: 329.1, sardine: 350.6, whiting: 328.9, picarel: 349.5,
  mullet: 476.2, mackerel: 472.4, garfish: 535.4, scorpion: 493.9, flounder: 441.8, gurnard: 484.4, eel: 505, meagre: 461.7, shad: 539.5,
  bluefish: 623.8, dogfish: 661.7, ray: 618.6, turbot: 677.8, seabass: 664.8, leerfish: 644.2,
  sturgeon: 902.5, tuna: 835.4, swordfish: 895.1, angler: 961, whiteshark: 1393.5,
  bluemarlin: 879.9, greenlandshark: 1704.6,
};

/**
 * Подобрано tools/fish/calibrate.ts (03.10): скорость %/с, рывок %/с, размах %, сопротивление %/с, цикл (тики). Паттерн
 * сильно меняет сложность, поэтому у каждого вида свои цифры: «обычный» игрок модели (test/fishbot.ts) 0-го уровня без
 * бонусов вытаскивает обычных ~99 %, редких ~93, эпических ~80, легенд ~55, мифических ~36 % за ~6/9/12/15/18 с боя.
 * Трудные паттерны спокойнее (медленнее, меньше размах, длиннее цикл), но злее сопротивлением. Баркас сверху злее (SEA_*).
 * Махи-махи море ломало сильнее соседей (успех 18 % против 65 %) — она подобрана уже в море, к успеху соседей (SEA=0.65).
 */
const CAL: Record<string, readonly [number, number, number, number, number]> = {
  hamsa: [24, 84, 36.8, 28.12, 170],
  goby: [12.95, 45.33, 25.57, 17.34, 180],
  scad: [12.95, 45.33, 25.57, 17.69, 180],
  redmullet: [24, 84, 36.8, 20.12, 170],
  wrasse: [7, 24.5, 16.32, 15.78, 238],
  karas: [21.5, 75.25, 34.4, 30.2, 170],
  blenny: [11.2, 39.2, 22.85, 25.51, 197],
  sardine: [19, 66.5, 32, 33.51, 170],
  whiting: [21.5, 75.25, 34.4, 43.07, 170],
  picarel: [24, 84, 36.8, 30.55, 170],
  sprat: [9.1, 31.85, 19.58, 26.03, 218],
  flyingfish: [9.1, 31.85, 19.58, 37.16, 218],
  haddock: [16.5, 57.75, 29.6, 20.99, 170],
  hake: [12.95, 45.33, 25.57, 43.07, 180],
  mullet: [9, 33.3, 21.42, 36.29, 210],
  mackerel: [18, 66.6, 35.7, 35.42, 150],
  garfish: [9, 33.3, 21.42, 36.11, 210],
  scorpion: [11.7, 43.29, 25.7, 25.51, 192],
  flounder: [14.4, 53.28, 29.99, 27.25, 174],
  gurnard: [30, 111, 48.3, 26.03, 150],
  eel: [21, 77.7, 38.85, 28.64, 150],
  meagre: [24, 88.8, 42, 45.15, 150],
  shad: [11.7, 43.29, 25.7, 21.16, 192],
  redfish: [14.4, 53.28, 29.99, 20.12, 174],
  bonito: [14.4, 53.28, 29.99, 26.38, 174],
  cod: [30, 111, 48.3, 20.99, 150],
  barracuda: [14.4, 53.28, 29.99, 23.6, 174],
  hairtail: [21, 77.7, 38.85, 31.59, 150],
  bluefish: [14.3, 55.77, 31.82, 29.33, 173],
  dogfish: [14.3, 55.77, 31.82, 31.59, 173],
  ray: [22, 85.8, 44.2, 20.99, 135],
  turbot: [14.3, 55.77, 31.82, 29.68, 173],
  seabass: [11, 42.9, 26.52, 30.03, 189],
  leerfish: [14.3, 55.77, 31.82, 40.11, 173],
  wolffish: [14.3, 55.77, 31.82, 32.64, 173],
  mahi: [8.8, 34.32, 22.98, 20.99, 200],
  amberjack: [14.3, 55.77, 31.82, 45.67, 173],
  wahoo: [11, 42.9, 26.52, 29.86, 189],
  blueshark: [25.5, 99.45, 48.1, 33.16, 135],
  sturgeon: [42, 176.4, 71.3, 75.05, 125],
  tuna: [13, 54.6, 31.62, 35.24, 175],
  swordfish: [7.8, 32.76, 23.19, 39.76, 195],
  angler: [16.9, 70.98, 37.94, 31.07, 160],
  bluemarlin: [16.9, 70.98, 37.94, 40.63, 160],
  sunfish: [34, 142.8, 62, 36.98, 125],
  halibut: [13, 54.6, 31.62, 36.63, 175],
  mako: [13, 54.6, 31.62, 28.64, 175],
  hammerhead: [30, 126, 57.35, 36.46, 125],
  whiteshark: [9, 39.6, 26.18, 30.38, 179],
  greenlandshark: [30, 132, 59.5, 30.72, 115],
  oarfish: [34.5, 151.8, 64.75, 52.97, 115],
};

/** Манера вида на шкале: паттерны и место вида, цифры из CAL, зона и резкость — по категории. */
function styleOf(id: string, r: Raw): ReelStyle {
  if (r.tier > T_MYTH) return { ...DEAD[id] };
  const b = BAND[r.tier];
  const [spd, dartSpd, amp, drain, per] = CAL[id] ?? [b.spd, b.dart, b.amp, b.drain, b.per];
  return {
    mainPattern: r.pat[0],
    secondaryPattern: r.pat[1],
    patternPeriod: per,
    patternAmplitude: amp,
    ...(r.tier >= T_LEGEND ? { lastStand: LAST_STAND } : {}),
    spd,
    sharp: b.sharp,
    turn: 10,
    dart: 8,
    dartSpd,
    dartUp: r.up ?? 50,
    hover: 300,
    hoverP: 30,
    lo: r.lo ?? 0,
    hi: r.hi ?? 100,
    roam: 30,
    zone: b.zone,
    drain,
  };
}

/** Правило по номеру в FISH; null — вида нет в рыбалке 2.0 (золотая рыбка — только старая находка в альбоме) */
export const RULE: ReadonlyArray<FishRule | null> = FISH.map((f, sp) => {
  const r = RAW[f.id];
  if (!r) return null;
  return {
    sp, id: f.id, tier: r.tier, zone: r.zone ?? 'pier', bite: r.bite, rain: r.rain, val: r.val, note: r.note,
    style: styleOf(f.id, r), xpDifficulty: XP_DIFFICULTY[f.id] ?? 0, ...(r.xpBase ? { xpBase: r.xpBase } : {}),
  };
});

function spOf(id: string): number {
  const i = FISH.findIndex((f) => f.id === id);
  if (i < 0 || !RULE[i]) throw new Error(`fishrules: нет вида ${id}`);
  return i;
}

const ORDER = Object.keys(RAW);
/** Все виды коллекции — по порядку журнала: по категориям, внутри — пристань, потом баркас, как в таблице */
export const COLLECTION: readonly number[] = RULE.filter((r): r is FishRule => r !== null && r.tier <= T_MYTH)
  .sort((a, b) => a.tier - b.tier || ORDER.indexOf(a.id) - ORDER.indexOf(b.id))
  .map((r) => r.sp);
/** Сколько видов в коллекции (51): число не зашито — растёт с таблицей */
export const COLLECTION_SIZE = COLLECTION.length;
/** Хлам и сундук */
export const SP_BOOT = spOf('boot');
export const SP_BOTTLE = spOf('bottle');
export const SP_CHEST = spOf('chest');
/** Старые находки: в альбоме остаются, в рыбалке 2.0 не клюют (золотая рыбка — не морская) */
export const LEGACY_IDS: readonly string[] = FISH.filter((_, sp) => !RULE[sp]).map((f) => f.id);

export function ruleOf(sp: number): FishRule | null {
  return RULE[sp] ?? null;
}

/** Виды коллекции места: пристань или баркас */
export function zoneSpecies(zone: FishZone): number[] {
  return COLLECTION.filter((sp) => RULE[sp]!.zone === zone);
}

function factor(value: number | undefined, max: number): number {
  return value !== undefined && Number.isFinite(value) ? Math.min(max, Math.max(1, value)) : 1;
}

/**
 * Манера на шкале с бонусами заброса: зона — от уровня и удочки; рывки и резкость — мягче от блесны (calm), злее в море
 * (sea); сопротивление — злее в море (seaDrain). Таблицу вида и снимок заброса не меняет.
 */
export function reelStyleFor(sp: number, mods?: Readonly<FishCastMods>): ReelStyle {
  const r = ruleOf(sp);
  if (!r) throw new RangeError(`fishrules: unknown reel species ${sp}`);
  const calm = mods?.calm !== undefined && Number.isFinite(mods.calm) ? Math.min(0.1, Math.max(0, mods.calm)) : 0;
  const sea = r.tier <= T_MYTH ? factor(mods?.sea, SEA_FIGHT) : 1;
  const seaDrain = r.tier <= T_MYTH ? factor(mods?.seaDrain, SEA_DRAIN) : 1;
  const jerk = (1 - calm) * sea;
  return {
    ...r.style,
    zone: r.style.zone * factor(mods?.zoneScale, 1.625),
    dartSpd: r.style.dartSpd * jerk,
    sharp: r.style.sharp * jerk,
    drain: r.style.drain * seaDrain,
  };
}

/** Вид — из коллекции (одна из 51 рыбы) */
export function isCollected(sp: number): boolean {
  const r = RULE[sp];
  return !!r && r.tier <= T_MYTH;
}

// ------------------------------------------------------------ улов

export interface Hooked {
  sp: number;
  g: number;
  /** Сундук: сколько жетонов в нём (0 — не сундук) */
  coins: number;
}

/** Сколько в сундуке: полоса по весу, внутри — поровну. */
export function rollChest(rand: () => number): number {
  const total = CHEST_BANDS.reduce((s, b) => s + b[2], 0);
  let r = rand() * total;
  for (const [lo, hi, w] of CHEST_BANDS) {
    r -= w;
    if (r < 0) return lo + Math.min(hi - lo, Math.floor(rand() * (hi - lo + 1)));
  }
  return CHEST_BANDS[0][0];
}

/** Вес улова: ближе к лёгкому (крупные редки); от килограмма — с точностью до 10 г. */
export function rollWeight(sp: number, rand: () => number): number {
  const f = FISH[sp];
  const u = rand();
  const raw = f.g[0] + (f.g[1] - f.g[0]) * u * u;
  const g = raw >= 1000 ? Math.round(raw / 10) * 10 : Math.round(raw);
  return Math.min(f.g[1], Math.max(f.g[0], g));
}

interface Pool {
  sps: number[];
  /** Базовые веса (в дождь легенды и мифик события ×1,5) */
  w: number[];
  total: number;
  commonTotal: number;
}

function makePool(zone: FishZone, rain: boolean): Pool {
  const sps: number[] = [];
  const w: number[] = [];
  for (const sp of COLLECTION) {
    const r = RULE[sp]!;
    if (r.zone !== zone || (r.rain && !rain)) continue;
    sps.push(sp);
    w.push(r.bite * (r.rain && r.tier >= T_LEGEND ? RAIN_TOP_MUL : 1));
  }
  const total = w.reduce((a, b) => a + b, 0);
  const commonTotal = sps.reduce((n, sp, i) => n + (RULE[sp]!.tier === T_COMMON ? w[i] : 0), 0);
  return { sps, w, total, commonTotal };
}

const POOLS: Record<FishZone, readonly [Pool, Pool]> = {
  pier: [makePool('pier', false), makePool('pier', true)],
  barkas: [makePool('barkas', false), makePool('barkas', true)],
};

function poolOf(rain: boolean, mods?: Readonly<FishCastMods>): Pool {
  return POOLS[mods?.zone === 'barkas' ? 'barkas' : 'pier'][rain ? 1 : 0];
}

/** Множитель шанса редких и выше: уровень × удочка × напиток (снимок заброса) */
function rareMul(mods?: Readonly<FishCastMods>): number {
  return mods?.rareMultiplier !== undefined && Number.isFinite(mods.rareMultiplier) ? Math.min(4, Math.max(1, mods.rareMultiplier)) : 1;
}

/** Ещё множитель эпических и выше: блесна */
function epicMul(mods?: Readonly<FishCastMods>): number {
  return mods?.epicMultiplier !== undefined && Number.isFinite(mods.epicMultiplier) ? Math.min(1.1, Math.max(1, mods.epicMultiplier)) : 1;
}

/**
 * Веса пула с бонусами: редкие и выше ×(уровень, удочка, напиток), эпические и выше ещё ×блесна; обычным — остаток до
 * прежней суммы. Остатка не хватило — обычных нет, редкие и выше делят всё в прежних пропорциях (явный потолок).
 */
function weighted(p: Pool, mods?: Readonly<FishCastMods>): number[] {
  const R = rareMul(mods), E = epicMul(mods);
  const out = p.w.map((w, i) => {
    const t = RULE[p.sps[i]]!.tier;
    return t >= T_RARE ? w * R * (t >= T_EPIC ? E : 1) : w;
  });
  const rare = out.reduce((n, w, i) => n + (RULE[p.sps[i]]!.tier >= T_RARE ? w : 0), 0);
  const common = p.commonTotal > 0 ? Math.max(0, (p.total - rare) / p.commonTotal) : 0;
  const scale = rare > p.total ? p.total / rare : 1;
  return out.map((w, i) => (RULE[p.sps[i]]!.tier >= T_RARE ? w * scale : w * common));
}

/** Кто клюёт: сундук (3 %), хлам, иначе рыба своего места по частоте — в дождь вместе с дождевыми. */
export function rollCatch2(rain: boolean, rand: () => number, mods?: Readonly<FishCastMods>): Hooked {
  const r = rand() * 10_000;
  if (r < CHEST_PER_10K) return { sp: SP_CHEST, g: rollWeight(SP_CHEST, rand), coins: rollChest(rand) };
  if (r < CHEST_PER_10K + JUNK_PER_10K) {
    const sp = rand() < 0.7 ? SP_BOOT : SP_BOTTLE;
    return { sp, g: rollWeight(sp, rand), coins: 0 };
  }
  const pool = poolOf(rain, mods);
  const w = weighted(pool, mods);
  let x = rand() * pool.total;
  let sp = pool.sps[pool.sps.length - 1];
  for (let i = 0; i < pool.sps.length; i++) {
    x -= w[i];
    if (x < 0) {
      sp = pool.sps[i];
      break;
    }
  }
  return { sp, g: rollWeight(sp, rand), coins: 0 };
}

/** Насколько на деле выросли шансы редких у пристани (потолок — когда обычных не осталось). Для проверок. */
export function effectiveRareMultiplier(rain: boolean, mods?: Readonly<FishCastMods>): number {
  const p = poolOf(rain, mods);
  const rare = p.total - p.commonTotal;
  return rare > 0 ? Math.min(rareMul(mods), p.total / rare) : 1;
}

/** Доля поклёвок вида среди рыб своего места (для журнала и проверок); вид другого места — 0 */
export function biteShare(sp: number, rain: boolean, mods?: Readonly<FishCastMods>): number {
  const p = poolOf(rain, mods);
  const i = p.sps.indexOf(sp);
  if (i < 0) return 0;
  return weighted(p, mods)[i] / p.total;
}

/** «Шансы сейчас»: доли поклёвок по категориям 0…4 среди всех поклёвок, плюс хлам [5] и сундук [6]; сумма 1. */
export function tierOdds(rain: boolean, mods?: Readonly<FishCastMods>): number[] {
  const p = poolOf(rain, mods);
  const w = weighted(p, mods);
  const fish = 1 - (CHEST_PER_10K + JUNK_PER_10K) / 10_000;
  const out = [0, 0, 0, 0, 0, JUNK_PER_10K / 10_000, CHEST_PER_10K / 10_000];
  p.sps.forEach((sp, i) => { out[RULE[sp]!.tier] += fish * w[i] / p.total; });
  return out;
}

/** Цена без напитка и места: обычные — старая целая цена +75 %, остальные откалиброваны; дождевые ×1,5. */
export function basePrice(sp: number, g: number): number {
  const r = RULE[sp];
  if (!r || r.tier > T_MYTH) return 0;
  const f = FISH[sp];
  const k = f.g[1] > f.g[0] ? Math.min(1, Math.max(0, (g - f.g[0]) / (f.g[1] - f.g[0]))) : 0;
  const v = (r.val[0] + (r.val[1] - r.val[0]) * k) * COIN_PER_POINT;
  const event = r.rain ? RAIN_NUM / RAIN_DEN : 1;
  return r.tier === T_COMMON
    ? Math.round(Math.round(Math.max(1, Math.round(v)) * 1.75) * event)
    : Math.max(1, Math.round(v * FISH_OTHER_PRICE_SCALE * event));
}

/** Цена улова (в рюкзак — фиксируется при поимке): база × напиток (×1,1 пиво, ×1,15 эль) × баркас 1,25, одно округление. */
export function fishPrice2(sp: number, g: number, coins = 0, mods?: Readonly<FishCastMods>): number {
  const r = RULE[sp];
  if (!r) return 0;
  if (r.tier === T_CHEST) return coins;
  if (r.tier === T_JUNK) return 0;
  const place = mods?.zone === 'barkas' ? BARKAS_INCOME : 1;
  return Math.round(basePrice(sp, g) * factor(mods?.incomeScale, 1.15) * place);
}

/** Цена вида: за самую лёгкую и самую тяжёлую (для журнала) — у видов баркаса сразу с ×1,25 */
export function priceRange(sp: number): [number, number] {
  const f = FISH[sp];
  const mods = RULE[sp]?.zone === 'barkas' ? ({ zone: 'barkas' } as FishCastMods) : undefined;
  return [fishPrice2(sp, f.g[0], 0, mods), fishPrice2(sp, f.g[1], 0, mods)];
}

// ------------------------------------------------------------ коллекция и награда

/** Сколько видов коллекции уже есть в альбоме */
export function collectionCount(album: Record<string, readonly [number, number]>): number {
  let n = 0;
  for (const sp of COLLECTION) if (album[FISH[sp].id]) n++;
  return n;
}

/** Рыбацкий комплект за полную коллекцию: вещи в обычных слотах гардероба (shared/outfit.ts), не продаются */
export const REWARD_ITEMS: readonly string[] = ['h:angler', 'e:angler', 'a:angler'];

// ------------------------------------------------------------ доски рекордов

/** Строк в каждом списке доски */
export const FISH_TOP_ROWS = 10;

export interface FishTopRow {
  pid: number;
  nick: string;
  /** Штук или граммов */
  v: number;
}

/** Доска у мостков: «Сегодня» (по Москве) и «За всё время» — по числу рыб и по весу улова (граммы) */
export interface FishTop {
  day: string;
  dn: FishTopRow[];
  dg: FishTopRow[];
  an: FishTopRow[];
  ag: FishTopRow[];
}

export function emptyTop(day = ''): FishTop {
  return { day, dn: [], dg: [], an: [], ag: [] };
}

/** Номер календарного дня по Москве (UTC+3) — для счётчиков «сегодня» в профиле */
export function mskDayNum(ms: number): number {
  return Math.floor((ms + 3 * 3600_000) / 86_400_000);
}

/** Вес улова для доски: «850 г», «12,4 кг», «1 234 кг». */
export function fmtKg(g: number): string {
  if (g < 1000) return `${Math.round(g)} г`;
  const kg = g / 1000;
  if (kg < 100) return `${(Math.round(kg * 10) / 10).toFixed(1).replace('.', ',')} кг`;
  return `${Math.round(kg).toLocaleString('ru-RU').replace(/\s/g, ' ')} кг`;
}

/** Вес улова на карточке и в журнале: до 100 кг — как везде («1,24 кг»), дальше — целыми килограммами */
export function fmtCatch(g: number): string {
  return g >= 100_000 ? fmtKg(g) : fmtWeight(g);
}

export { fmtWeight };
