// Рыбалка 2.0 (выпуск 6): 32 морских вида в пяти категориях, дождевые виды (×1,5), сундук, цены от целевого дохода,
// коллекция и доски рекордов. Названия, вес и вид рыб — в общей таблице FISH (shared/fishing.ts), здесь — правила:
// кто как часто клюёт, сколько стоит, как ведёт себя на шкале вываживания (shared/fishreel.ts). Решает сервер
// (server/lobby/fishing2.ts); клиент по этим же таблицам рисует шкалу, карточку улова, журнал и доску.
import { FISH, fmtWeight } from './fishing.ts';
import type { ReelStyle, ReelPattern } from './fishreel.ts';
import type { FishCastMods } from './fishprogress.ts';

// ------------------------------------------------------------ экономика

/**
 * Цель без сундуков и бафов: +50 % от измеренных до патча 13,465547 жетона/мин.
 * Обычные рыбы отдельно получают +75 % к старой целой цене; остальные откалиброваны под эту общую цель.
 */
export const FISH_TARGET_PER_MIN = 20.2;
/**
 * Сколько очков ценности (поле val) в минуту набирает обычный игрок в ясную погоду. Меряет тест по модели игрока
 * на настоящей шкале вываживания; поменялись таблицы ниже — тест скажет новое число.
 */
export const FISH_POINTS_PER_MIN = 17;
/** Исходный курс выпуска 6: заморожен, чтобы +75 % считались от старой целой цены, а не от новой цели. */
export const COIN_PER_POINT = 13.5 / 13.7;
/** Калибровка только остальных рыб. Это не второй глобальный множитель для обычных. */
export const FISH_OTHER_PRICE_SCALE = 1.076;

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
export const TIER_TITLES = ['Обычные', 'Редкие', 'Эпические', 'Легендарные', 'Мифическая', 'Находки', 'Сундук'] as const;
/** Цвет категории: рамки, подписи, шкала */
export const TIER_CSS = ['#8f9aa3', '#2f86d8', '#9a4ee0', '#eb9a12', '#e8364f', '#8a7766', '#d9a521'] as const;
/** Новый вид в коллекции — бонус, жетонов (один раз) */
export const NEW_BONUS2 = [5, 10, 20, 40, 100, 0, 0] as const;
/** С этой категории улов объявляется в общем чате */
export const ANNOUNCE_TIER = T_EPIC;

/** Дождевые виды платят ×3/2 */
export const RAIN_NUM = 3;
export const RAIN_DEN = 2;

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

// ------------------------------------------------------------ виды

export interface FishRule {
  /** Номер в FISH */
  sp: number;
  id: string;
  tier: number;
  /** Как часто клюёт: доля среди рыб (в ясную погоду сумма по недождевым — 1000; дождевые добавляются в дождь) */
  bite: number;
  /** Только в дождь (и платит ×1,5) */
  rain: boolean;
  /** Ценность, очки: за самую лёгкую и за самую тяжёлую (жетоны — через COIN_PER_POINT) */
  val: readonly [number, number];
  /** Empirical reel ticks per successful typical catch (includes failed attempts); 1200-seed calibration. */
  difficulty: number;
  /** Frozen released difficulty: motion rebalance must not inflate XP before the one-third reduction. */
  xpDifficulty: number;
  /** Манера на шкале */
  style: ReelStyle;
  /** Манера словами — для журнала */
  note: string;
}

type Raw = Omit<FishRule, 'sp' | 'id' | 'difficulty' | 'xpDifficulty'>;

const st = (
  spd: number, sharp: number, turn: number, dart: number, dartSpd: number, dartUp: number, hover: number, hoverP: number, lo: number, hi: number, roam: number,
  zone: number, drain: number,
): ReelStyle => ({ spd, sharp, turn, dart, dartSpd, dartUp, hover, hoverP, lo, hi, roam, zone, drain });

// Манеры: скорость %/с, резкость 1–10, передумывает раз/мин, рывков/мин, их скорость %/с, вверх %, зависает мс, как часто %,
// где держится lo…hi %, переплывает %, зона %, сопротивление (падение прогресса вне зоны) %/с
const RAW: Record<string, Raw> = {
  // --- обычные: широкая зона, слабое сопротивление, рывки редки
  hamsa: { tier: T_COMMON, bite: 70, rain: false, val: [2, 3], style: st(24, 7, 30, 3, 50, 50, 250, 30, 35, 90, 18, 36, 10), note: 'мелкая суета у поверхности' },
  goby: { tier: T_COMMON, bite: 75, rain: false, val: [2, 4], style: st(16, 6, 6, 3, 45, 70, 900, 70, 0, 35, 14, 38, 10), note: 'сидит у дна, короткие подскоки' },
  scad: { tier: T_COMMON, bite: 70, rain: false, val: [2, 5], style: st(24, 5, 12, 3, 50, 50, 300, 25, 20, 85, 30, 36, 10), note: 'ровные быстрые проходы' },
  redmullet: { tier: T_COMMON, bite: 60, rain: false, val: [2, 5], style: st(18, 5, 15, 2, 45, 50, 600, 55, 0, 40, 16, 37, 10), note: 'роется у самого дна' },
  wrasse: { tier: T_COMMON, bite: 60, rain: false, val: [2, 4], style: st(20, 6, 20, 3, 48, 50, 500, 45, 25, 70, 18, 37, 10), note: 'снуёт у камней' },
  karas: { tier: T_COMMON, bite: 55, rain: false, val: [2, 4], style: st(19, 4, 10, 2, 48, 50, 500, 40, 15, 75, 22, 37, 10), note: 'плавные широкие ходы' },
  blenny: { tier: T_COMMON, bite: 45, rain: false, val: [2, 3], style: st(16, 8, 8, 4, 50, 60, 1000, 75, 5, 50, 12, 38, 10), note: 'сидит на камне, вдруг прыгает' },
  sardine: { tier: T_COMMON, bite: 55, rain: false, val: [2, 3], style: st(24, 6, 35, 3, 50, 50, 200, 20, 45, 95, 20, 36, 10), note: 'зигзаги стайки у поверхности' },
  whiting: { tier: T_COMMON, bite: 55, rain: false, val: [2, 5], style: st(22, 4, 8, 2, 48, 40, 400, 30, 15, 70, 28, 37, 10), note: 'ровно ходит в толще' },
  picarel: { tier: T_COMMON, bite: 180, rain: true, val: [2, 3], style: st(23, 6, 22, 3, 50, 50, 300, 30, 30, 80, 22, 36, 10), note: 'вертлявая, держится стайкой' },
  // --- редкие: зона меньше, сопротивление и рывки заметнее, у каждой свой норов
  mullet: { tier: T_RARE, bite: 48, rain: false, val: [4, 12], style: st(28, 6, 10, 8, 95, 85, 300, 25, 30, 90, 32, 31, 20), note: 'прыгает свечками вверх' },
  mackerel: { tier: T_RARE, bite: 48, rain: false, val: [4, 10], style: st(30, 5, 14, 7, 90, 50, 150, 10, 15, 90, 40, 30, 20), note: 'носится без остановки' },
  garfish: { tier: T_RARE, bite: 42, rain: false, val: [4, 10], style: st(29, 8, 16, 8, 100, 80, 200, 20, 50, 100, 28, 30, 20), note: 'у самой поверхности, свечки' },
  scorpion: { tier: T_RARE, bite: 42, rain: false, val: [5, 12], style: st(26, 9, 4, 10, 105, 50, 1100, 80, 0, 45, 16, 30, 20), note: 'засада: стоит — и бросок' },
  flounder: { tier: T_RARE, bite: 42, rain: false, val: [5, 13], style: st(24, 3, 6, 8, 90, 70, 1200, 75, 0, 30, 20, 31, 20), note: 'лежит на дне, взлетает и планирует' },
  gurnard: { tier: T_RARE, bite: 38, rain: false, val: [5, 12], style: st(27, 6, 18, 8, 90, 50, 500, 50, 0, 40, 14, 30, 20), note: 'шагает по дну перебежками' },
  eel: { tier: T_RARE, bite: 140, rain: true, val: [5, 13], style: st(28, 8, 45, 7, 90, 40, 150, 15, 0, 55, 18, 30, 20), note: 'извивается, то туда, то сюда' },
  meagre: { tier: T_RARE, bite: 130, rain: true, val: [5, 13], style: st(27, 4, 8, 7, 95, 30, 400, 30, 10, 60, 34, 31, 20), note: 'тяжёлые мощные проводки' },
  shad: { tier: T_RARE, bite: 150, rain: true, val: [4, 10], style: st(30, 6, 20, 7, 95, 60, 200, 15, 35, 95, 30, 30, 20), note: 'серебряная молния у поверхности' },
  // --- эпические: быстрые, резкие, частые рывки
  bluefish: { tier: T_EPIC, bite: 28, rain: false, val: [10, 26], style: st(33, 8, 18, 9, 120, 55, 200, 15, 10, 95, 40, 28, 22), note: 'агрессивный, резкие броски' },
  dogfish: { tier: T_EPIC, bite: 26, rain: false, val: [11, 28], style: st(32, 6, 14, 8, 115, 40, 250, 15, 5, 80, 45, 28, 22), note: 'акулья хватка, длинные проводки' },
  ray: { tier: T_EPIC, bite: 24, rain: false, val: [11, 28], style: st(32, 3, 6, 8, 118, 60, 900, 55, 0, 50, 40, 28, 22), note: 'планирует дугами, липнет ко дну' },
  turbot: { tier: T_EPIC, bite: 22, rain: false, val: [13, 32], style: st(37, 4, 6, 10, 143, 75, 1300, 75, 0, 35, 30, 28, 22), note: 'лежит пластом — и взмывает' },
  seabass: { tier: T_EPIC, bite: 110, rain: true, val: [11, 28], style: st(33, 7, 14, 9, 113, 50, 200, 15, 10, 90, 45, 27, 22), note: 'мощные рывки в прибое' },
  leerfish: { tier: T_EPIC, bite: 100, rain: true, val: [13, 32], style: st(33, 7, 12, 10, 118, 55, 150, 10, 10, 95, 50, 27, 22), note: 'сильный хищник прибоя' },
  // --- легендарные: испытание
  sturgeon: { tier: T_LEGEND, bite: 10, rain: false, val: [36, 105], style: st(28, 4, 6, 12, 115, 15, 700, 40, 0, 40, 30, 25, 28), note: 'тянет на дно мощными рывками' },
  tuna: { tier: T_LEGEND, bite: 8, rain: false, val: [40, 110], style: st(27, 6, 10, 12, 106, 50, 100, 5, 0, 100, 60, 24, 28), note: 'неутомимый: носится по всей шкале' },
  swordfish: { tier: T_LEGEND, bite: 8, rain: false, val: [40, 110], style: st(26, 9, 12, 14, 105, 85, 250, 20, 20, 100, 50, 24, 28), note: 'свечки и прыжки вверх' },
  angler: { tier: T_LEGEND, bite: 8, rain: false, val: [32, 95], style: st(34, 10, 4, 14, 169, 50, 1400, 85, 0, 45, 20, 24, 28), note: 'замирает надолго — и взрывной бросок' },
  bluemarlin: { tier: T_LEGEND, bite: 20, rain: true, val: [45, 125], style: st(27, 7, 12, 13, 115, 70, 250, 10, 20, 100, 50, 24, 28), note: 'длинные быстрые проходы и свечки' },
  // --- мифическая: событие
  whiteshark: { tier: T_MYTH, bite: 6, rain: false, val: [200, 400], style: st(27, 9, 16, 15, 111, 50, 200, 15, 0, 100, 60, 22, 34), note: 'всё сразу: скорость, рывки, сила' },
  greenlandshark: { tier: T_MYTH, bite: 3, rain: true, val: [220, 480], style: st(26, 7, 14, 18, 115, 25, 900, 35, 0, 90, 70, 21, 36), note: 'глубокие тяжёлые проводки, мощное сопротивление' },
  // --- не рыбы: лежат мёртвым грузом
  boot: { tier: T_JUNK, bite: 0, rain: false, val: [0, 0], style: st(8, 2, 2, 0, 0, 0, 1500, 90, 0, 20, 10, 40, 7), note: 'не сопротивляется' },
  bottle: { tier: T_JUNK, bite: 0, rain: false, val: [0, 0], style: st(10, 2, 3, 0, 0, 0, 1500, 90, 0, 25, 12, 40, 7), note: 'не сопротивляется' },
  chest: { tier: T_CHEST, bite: 0, rain: false, val: [0, 0], style: st(8, 2, 2, 0, 0, 0, 1500, 90, 0, 15, 10, 40, 7), note: 'тяжёлый и не бьётся' },
};

// Frozen released cost-to-success. Used only for XP; see the durable pre-pattern baseline.
const XP_DIFFICULTY: Record<string, number> = {
  hamsa: 348.6, goby: 326.5, scad: 343.7, redmullet: 330.3, wrasse: 335.7, karas: 329.6, blenny: 329.1, sardine: 350.6, whiting: 328.9, picarel: 349.5,
  mullet: 476.2, mackerel: 472.4, garfish: 535.4, scorpion: 493.9, flounder: 441.8, gurnard: 484.4, eel: 505, meagre: 461.7, shad: 539.5,
  bluefish: 623.8, dogfish: 661.7, ray: 618.6, turbot: 677.8, seabass: 664.8, leerfish: 644.2,
  sturgeon: 902.5, tuna: 835.4, swordfish: 895.1, angler: 961, whiteshark: 1393.5,
  bluemarlin: 879.9, greenlandshark: 1704.6,
};


/** Actual 1200-seed cost-to-success; reproduced by the balance test. */
const DIFFICULTY: Record<string, number> = {
  hamsa: 516.8,
  goby: 488.6,
  scad: 520.7,
  redmullet: 503.2,
  wrasse: 500.3,
  karas: 494.6,
  blenny: 498,
  sardine: 529.3,
  whiting: 523.9,
  picarel: 522.7,
  mullet: 665.8,
  mackerel: 659.4,
  garfish: 751.6,
  scorpion: 676.6,
  flounder: 606.2,
  gurnard: 672.1,
  eel: 709.8,
  meagre: 693.6,
  shad: 752.6,
  bluefish: 815.6,
  dogfish: 836,
  ray: 806.6,
  turbot: 876.7,
  seabass: 832.5,
  leerfish: 855.8,
  sturgeon: 1125.9,
  tuna: 1070.3,
  swordfish: 1184.1,
  angler: 1323.6,
  bluemarlin: 1149.9,
  whiteshark: 1795.4,
  greenlandshark: 2198,
};

/** Main/secondary pattern. Cadence/excursion is in MOTION below; event fish have distinct pairs. */
const PATTERNS: Record<string, readonly [ReelPattern, ReelPattern]> = {
  hamsa: ['Nervous', 'Dash'],
  goby: ['HoverDash', 'SlowMigration'],
  scad: ['Dash', 'Wave'],
  redmullet: ['SlowMigration', 'Sawtooth'],
  wrasse: ['FakeDash', 'Nervous'],
  karas: ['Wave', 'SlowMigration'],
  blenny: ['Ambush', 'HoverDash'],
  sardine: ['Sawtooth', 'Nervous'],
  whiting: ['SlowMigration', 'Wave'],
  picarel: ['Nervous', 'DoubleDash'],
  mullet: ['Dash', 'DoubleDash'],
  mackerel: ['DoubleDash', 'SlowMigration'],
  garfish: ['EdgeSnapback', 'Dash'],
  scorpion: ['Ambush', 'FakeDash'],
  flounder: ['HoverDash', 'Wave'],
  gurnard: ['Sawtooth', 'HoverDash'],
  eel: ['Wave', 'FakeDash'],
  meagre: ['SlowMigration', 'EdgeSnapback'],
  shad: ['FakeDash', 'Dash'],
  bluefish: ['DoubleDash', 'FakeDash'],
  dogfish: ['Dash', 'EdgeSnapback'],
  ray: ['Wave', 'HoverDash'],
  turbot: ['Ambush', 'EdgeSnapback'],
  seabass: ['FakeDash', 'DoubleDash'],
  leerfish: ['EdgeSnapback', 'DoubleDash'],
  sturgeon: ['SlowMigration', 'Ambush'],
  tuna: ['Dash', 'Sawtooth'],
  swordfish: ['DoubleDash', 'EdgeSnapback'],
  angler: ['Ambush', 'Nervous'],
  bluemarlin: ['EdgeSnapback', 'Wave'],
  whiteshark: ['FakeDash', 'Ambush'],
  greenlandshark: ['SlowMigration', 'DoubleDash'],
};

/** Measured [speed, burst speed, period ticks, excursion %, resistance]. Zone and REEL_GAIN stay released values. */
const MOTION: Record<string, readonly [number, number, number, number, number]> = {
  hamsa: [66.894,160.804,105,43.575,6],
  goby: [13.449,43.646,82,28.613,21.375],
  scad: [25.808,62.039,183,36.465,16.5],
  redmullet: [69.647,200.904,99,59.898,3.5],
  wrasse: [33.377,92.428,160,32.239,10],
  karas: [36.324,105.882,175,39.452,4.25],
  blenny: [29.54,106.514,131,49.717,5.25],
  sardine: [37.111,89.209,187,34.071,54.5],
  whiting: [77.343,194.71,86,67.499,1],
  picarel: [92.624,232.334,103,59.606,1],
  mullet: [48.751,190.851,147,56.966,6],
  mackerel: [35.294,122.171,185,50.474,17.25],
  garfish: [46.578,185.323,144,53.817,2],
  scorpion: [21.846,101.795,210,46.002,8.5],
  flounder: [29.648,128.284,101,48.191,3],
  gurnard: [63.696,244.986,133,61.854,6.375],
  eel: [29.666,110.025,162,48.448,9.25],
  meagre: [72.191,293.085,100,76.5,1],
  shad: [17.173,62.748,189,36.127,10],
  bluefish: [25.089,105.27,195,50.472,11.5],
  dogfish: [20.763,86.099,250,47.847,18.75],
  ray: [55.19,234.825,145,69.704,1],
  turbot: [27.627,123.201,82,51.257,1],
  seabass: [8.432,33.314,437,28.065,36],
  leerfish: [31.056,128.135,180,69.947,10],
  sturgeon: [10.71,50.753,83,41.689,41.5],
  tuna: [23.732,107.503,158,64.65,10],
  swordfish: [26.839,125.064,180,68.633,10],
  angler: [28.037,160.802,215,58.435,22.5],
  bluemarlin: [34.379,168.956,144,79.048,5.25],
  whiteshark: [8.548,40.548,250,42.116,18],
  greenlandshark: [73.338,374.287,71,85,1],
};

/** Preserve released acceleration and green-zone dimensions before applying the measured pattern profile. */
function balancedStyle(r: Raw): ReelStyle {
  const s = r.style;
  if (r.tier === T_RARE) return { ...s, spd: s.spd * .85, dartSpd: s.dartSpd * .85, sharp: s.sharp * .85 };
  if (r.tier >= T_EPIC && r.tier <= T_MYTH) return { ...s, spd: s.spd * .8, dartSpd: s.dartSpd * .8, sharp: s.sharp * .8 };
  return s;
}

/** Правило по номеру в FISH; null — вида нет в рыбалке 2.0 (золотая рыбка — только старая находка в альбоме) */
export const RULE: ReadonlyArray<FishRule | null> = FISH.map((f, sp) => {
  const r = RAW[f.id];
  if (!r) return null;
  const style = balancedStyle(r);
  // Preserve each species' character while separating bands in both ordinary and expert real-reel simulations.
  if (f.id === 'scorpion') style.dart = 9;
  if (f.id === 'eel') {
    style.spd = r.style.spd * .8;
    style.dartSpd = r.style.dartSpd * .8;
    style.sharp = r.style.sharp * .8;
  }
  if (f.id === 'dogfish') style.dart = 10;
  if (f.id === 'turbot') style.dart = 8;
  const pattern = PATTERNS[f.id];
  if (pattern) {
    [style.mainPattern, style.secondaryPattern] = pattern;
    [style.spd, style.dartSpd, style.patternPeriod, style.patternAmplitude, style.drain] = MOTION[f.id];
  }
  return { sp, id: f.id, ...r, style, difficulty: DIFFICULTY[f.id] ?? 0, xpDifficulty: XP_DIFFICULTY[f.id] ?? 0 };
});

function spOf(id: string): number {
  const i = FISH.findIndex((f) => f.id === id);
  if (i < 0 || !RULE[i]) throw new Error(`fishrules: нет вида ${id}`);
  return i;
}

/** 32 вида коллекции — по порядку журнала: по категориям, внутри — как в таблице */
export const COLLECTION: readonly number[] = RULE.filter((r): r is FishRule => r !== null && r.tier <= T_MYTH)
  .sort((a, b) => a.tier - b.tier || Object.keys(RAW).indexOf(a.id) - Object.keys(RAW).indexOf(b.id))
  .map((r) => r.sp);
export const COLLECTION_SIZE = 32;
/** Хлам и сундук */
export const SP_BOOT = spOf('boot');
export const SP_BOTTLE = spOf('bottle');
export const SP_CHEST = spOf('chest');
/** Старые находки: в альбоме остаются, в рыбалке 2.0 не клюют (золотая рыбка — не морская) */
export const LEGACY_IDS: readonly string[] = FISH.filter((_, sp) => !RULE[sp]).map((f) => f.id);

export function ruleOf(sp: number): FishRule | null {
  return RULE[sp] ?? null;
}

function factor(value: number | undefined, max: number): number {
  return value !== undefined && Number.isFinite(value) ? Math.min(max, Math.max(1, value)) : 1;
}

/** Only the zone changes with levels/rods. Never mutates the species rule or the cast snapshot. */
export function reelStyleFor(sp: number, mods?: Readonly<FishCastMods>): ReelStyle {
  const r = ruleOf(sp);
  if (!r) throw new RangeError(`fishrules: unknown reel species ${sp}`);
  return { ...r.style, zone: r.style.zone * factor(mods?.zoneScale, 1.625) };
}

/** Вид — из коллекции (одна из 32 рыб) */
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

/** Кто клюёт: сундук (3 %), хлам, иначе рыба по частоте — в дождь вместе с дождевыми. */
export function rollCatch2(rain: boolean, rand: () => number, mods?: Readonly<FishCastMods>): Hooked {
  const r = rand() * 10_000;
  if (r < CHEST_PER_10K) return { sp: SP_CHEST, g: rollWeight(SP_CHEST, rand), coins: rollChest(rand) };
  if (r < CHEST_PER_10K + JUNK_PER_10K) {
    const sp = rand() < 0.7 ? SP_BOOT : SP_BOTTLE;
    return { sp, g: rollWeight(sp, rand), coins: 0 };
  }
  const pool = rain ? POOL_RAIN : POOL;
  const rare = effectiveRareMultiplier(rain, mods);
  const common = Math.max(0, (pool.total - pool.rareTotal * rare) / (pool.total - pool.rareTotal));
  let x = rand() * pool.total;
  let sp = pool.sps[pool.sps.length - 1];
  for (let i = 0; i < pool.sps.length; i++) {
    x -= pool.w[i] * (RULE[pool.sps[i]]!.tier >= T_RARE ? rare : common);
    if (x < 0) {
      sp = pool.sps[i];
      break;
    }
  }
  return { sp, g: rollWeight(sp, rand), coins: 0 };
}

interface Pool {
  sps: number[];
  w: number[];
  total: number;
  rareTotal: number;
}

function pool(rain: boolean): Pool {
  const sps: number[] = [];
  const w: number[] = [];
  for (const sp of COLLECTION) {
    const r = RULE[sp]!;
    if (r.rain && !rain) continue;
    sps.push(sp);
    w.push(r.bite);
  }
  return { sps, w, total: w.reduce((a, b) => a + b, 0), rareTotal: sps.reduce((n, sp, i) => n + (RULE[sp]!.tier >= T_RARE ? w[i] : 0), 0) };
}

const POOL = pool(false);
const POOL_RAIN = pool(true);

/** Rare base probabilities grow exactly until their total reaches 100% of fish.
 * Beyond that all common residual is exhausted; relative rare proportions remain unchanged.
 * Chest/junk are separate fixed draws. This is a probability cap, not weight renormalization. */
export function effectiveRareMultiplier(rain: boolean, mods?: Readonly<FishCastMods>): number {
  const p = rain ? POOL_RAIN : POOL;
  return factor(mods?.rareMultiplier, p.total / p.rareTotal);
}

/** Доля поклёвок вида среди рыб (для журнала и проверок): в ясную погоду или в дождь */
export function biteShare(sp: number, rain: boolean, mods?: Readonly<FishCastMods>): number {
  const p = rain ? POOL_RAIN : POOL;
  const i = p.sps.indexOf(sp);
  const rare = effectiveRareMultiplier(rain, mods);
  const common = Math.max(0, (p.total - p.rareTotal * rare) / (p.total - p.rareTotal));
  return i < 0 ? 0 : p.w[i] * (RULE[sp]!.tier >= T_RARE ? rare : common) / p.total;
}

/** Sale rounds old common integer ×1.75; other fish calibrated separately. Beer rounds final fish sale ×1.1. */
export function fishPrice2(sp: number, g: number, coins = 0, mods?: Readonly<FishCastMods>): number {
  const r = RULE[sp];
  if (!r) return 0;
  if (r.tier === T_CHEST) return coins;
  if (r.tier === T_JUNK) return 0;
  const f = FISH[sp];
  const k = f.g[1] > f.g[0] ? Math.min(1, Math.max(0, (g - f.g[0]) / (f.g[1] - f.g[0]))) : 0;
  const v = (r.val[0] + (r.val[1] - r.val[0]) * k) * COIN_PER_POINT;
  const event = r.rain ? RAIN_NUM / RAIN_DEN : 1;
  const base = r.tier === T_COMMON
    ? Math.round(Math.round(Math.max(1, Math.round(v)) * 1.75) * event)
    : Math.max(1, Math.round(v * FISH_OTHER_PRICE_SCALE * event));
  return Math.round(base * factor(mods?.incomeScale, 1.1));
}

/** Цена вида: за самую лёгкую и самую тяжёлую (для журнала) */
export function priceRange(sp: number): [number, number] {
  const f = FISH[sp];
  return [fishPrice2(sp, f.g[0]), fishPrice2(sp, f.g[1])];
}

// ------------------------------------------------------------ коллекция и награда

/** Сколько из 32 видов уже есть в альбоме */
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
