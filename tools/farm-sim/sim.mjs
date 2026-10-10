#!/usr/bin/env node
// Симуляция экономики idle-фермы по docs/farm/design-v10.md (Монте-Карло, событийная модель с точностью до минуты).
//
// Запуск (из корня репозитория, Node 24):
//   node tools/farm-sim/sim.mjs                      — пресеты base + tweaked по 500 прогонов на архетип + таблица K (~2 мин)
//   node tools/farm-sim/sim.mjs --runs 1000 --preset base --arch casual,active --no-k
//   node tools/farm-sim/sim.mjs --set crops.wheat.lvl=1 --set 'goals.bed2.res={"fiber":5,"root":4}' --set K=0.2
//   node tools/farm-sim/sim.mjs --inline --runs 1 --arch casual --set trace=2 --no-k   — журнал решений первых 2 суток
// Пишет tools/farm-sim/results.json, таблицы печатает в stdout (markdown). Выводы — tools/farm-sim/RESULTS.md.
//
// Все числа — из дизайн-документа v10 (CONFIG ниже). Временные решения по противоречиям — переключатели в CONFIG:
// provisionalGates (гейты лейки 2/3, сумки 3, компоста сдвинуты на уровень появления ресурса), waterOncePerCycle,
// wellFill. Монеты фермы = жетоны 🪙 игры; K — глобальный множитель всех монетных чисел документа (округление до целых).
// Допущения, которых нет в документе, помечены «допущение» рядом с параметром.

import { writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';

const HERE = dirname(fileURLToPath(import.meta.url));

// =====================================================================================================================
// CONFIG
// =====================================================================================================================

/** Ресурсы и XP за конвертацию 1 шт. у Дядюшки Гриба */
const RES = ['root', 'fiber', 'seeds', 'spores', 'crystal', 'wood', 'gold', 'scale', 'star'];
const RES_RU = {
  root: 'Корешок', fiber: 'Волокно', seeds: 'Семена', spores: 'Споры', crystal: 'Крист. пыль',
  wood: 'Древесина', gold: 'Зол. лист', scale: 'Чешуйка', star: 'Зв. пыль', coins: 'монеты', level: 'уровень',
};

// [id, имя, ур., XP, вторичный, шанс, семя, продажа, мин]
const CROPS_DOC = [
  ['radish', 'Редис', 1, 5, 'root', 0.30, 5, 21, 2],
  ['lettuce', 'Салат', 2, 6, 'fiber', 0.35, 6, 27, 3],
  ['wheat', 'Пшеница', 2, 25, 'fiber', 0.40, 20, 111, 15],
  ['onion', 'Лук', 4, 8, 'root', 0.30, 8, 31, 3],
  ['pumpkin', 'Тыква', 4, 35, 'seeds', 0.35, 30, 160, 20],
  ['carrot', 'Морковь', 5, 10, 'root', 0.35, 10, 41, 4],
  ['sunflower', 'Подсолнух', 5, 30, 'seeds', 0.35, 25, 168, 25],
  ['strawberry', 'Клубника', 6, 40, 'fiber', 0.35, 40, 196, 30],
  ['mushroom', 'Гриб-гигант', 6, 90, 'spores', 0.40, 70, 356, 45],
  ['dill', 'Укроп', 7, 12, 'seeds', 0.30, 12, 51, 5],
  ['chili', 'Перец чили', 8, 55, 'seeds', 0.35, 55, 250, 30],
  ['crystal', 'Кристальный цветок', 8, 120, 'crystal', 0.40, 100, 491, 60],
  ['micro', 'Микро-зелень', 9, 15, 'seeds', 0.35, 15, 57, 5],
  ['lotus', 'Лунный лотос', 9, 150, 'crystal', 0.40, 130, 625, 90],
  ['tree', 'Древо жизни', 10, 180, 'wood', 0.40, 160, 785, 120],
  ['apple', 'Золотое яблоко', 10, 400, 'gold', 0.40, 350, 1782, 360],
  ['dragon', 'Драконий плод', 11, 500, 'scale', 0.35, 450, 2273, 480],
  ['star', 'Звёздный цветок', 12, 650, 'star', 0.35, 600, 2944, 600],
  ['mythic', 'Мифический гриб', 13, 800, 'spores', 0.40, 700, 2950, 540],
];

/**
 * Цели прогрессии. lvl — гейт из документа; lvlProv — временный гейт «когда ресурс впервые доступен»
 * (используется при provisionalGates=true). requires — предыдущая ступень.
 */
const GOALS_DOC = [
  { id: 'bed2', kind: 'bed', lvl: 2, coins: 0, res: { fiber: 8, root: 6 } },
  { id: 'bed3', kind: 'bed', lvl: 4, coins: 0, res: { root: 8, seeds: 4 }, requires: 'bed2' },
  { id: 'bed4', kind: 'bed', lvl: 6, coins: 0, res: { spores: 4, fiber: 6 }, requires: 'bed3' },
  { id: 'bed5', kind: 'bed', lvl: 8, coins: 0, res: { crystal: 4, seeds: 4 }, requires: 'bed4' },
  { id: 'bed6', kind: 'bed', lvl: 10, coins: 0, res: { wood: 4, gold: 2 }, requires: 'bed5' },
  { id: 'bed7', kind: 'bed', lvl: 11, coins: 0, res: { scale: 3, spores: 3 }, requires: 'bed6' },
  { id: 'bed8', kind: 'bed', lvl: 12, coins: 0, res: { star: 3, spores: 3 }, requires: 'bed7' },
  { id: 'rake2', kind: 'tool', tool: 'rake', lvl: 3, coins: 500, res: { fiber: 15, seeds: 8, root: 3 } },
  { id: 'rake3', kind: 'tool', tool: 'rake', lvl: 8, coins: 2500, res: { fiber: 40, seeds: 20, crystal: 8 }, requires: 'rake2' },
  { id: 'can2', kind: 'tool', tool: 'can', lvl: 5, lvlProv: 8, coins: 600, res: { crystal: 12, seeds: 5, root: 4 } },
  { id: 'can3', kind: 'tool', tool: 'can', lvl: 9, lvlProv: 10, coins: 3000, res: { crystal: 35, wood: 15, seeds: 10 }, requires: 'can2' },
  { id: 'shovel2', kind: 'tool', tool: 'shovel', lvl: 3, coins: 500, res: { root: 12, fiber: 6, seeds: 5 } },
  { id: 'shovel3', kind: 'tool', tool: 'shovel', lvl: 7, coins: 2500, res: { root: 30, seeds: 15, spores: 10 }, requires: 'shovel2' },
  { id: 'bag2', kind: 'tool', tool: 'bag', lvl: 2, coins: 500, res: { fiber: 20, root: 10 } },
  { id: 'bag3', kind: 'tool', tool: 'bag', lvl: 6, lvlProv: 10, coins: 1500, res: { fiber: 40, wood: 20, crystal: 8 }, requires: 'bag2' },
  { id: 'bag4', kind: 'tool', tool: 'bag', lvl: 10, coins: 4000, res: { crystal: 25, spores: 15, gold: 8 }, requires: 'bag3' },
  { id: 'compost', kind: 'bonus', lvl: 11, lvlProv: 12, coins: 10000, res: { crystal: 40, spores: 25, star: 15 } },
  { id: 'pig', kind: 'bonus', lvl: 10, coins: 5000, res: { gold: 20, wood: 15, crystal: 10 } },
  { id: 'bees', kind: 'bonus', lvl: 10, coins: 7000, res: { fiber: 30, spores: 20, crystal: 15 } },
];

/** Порядок покупок после грядок (грядки — всегда первыми и резервируют ресурсы под себя) */
const BUY_PRIORITY = ['shovel2', 'shovel3', 'bees', 'compost', 'bag2', 'pig', 'rake2', 'can2', 'bag3', 'rake3', 'can3', 'bag4'];

export const CONFIG = {
  runs: 500,
  horizonDays: 90,
  seed: 20261010,
  /** Глобальный множитель всех монетных чисел документа (цены семян/продажи, инструменты, заказы, помощь, трюфель) */
  K: 1,
  /** Стартовые монеты — в документе не заданы (допущение), масштабируются K */
  startCoins: 100, // допущение

  crops: CROPS_DOC.map(([id, name, lvl, xp, sec, chance, seed, sell, min]) => ({ id, name, lvl, xp, sec, chance, seed, sell, min })),
  goals: GOALS_DOC,
  levelTotal: [0, 0, 200, 700, 1700, 3500, 6500, 11500, 19500, 31500, 48500, 71500, 101500, 141500], // XP, чтобы быть ур. L
  maxLevel: 13,
  convXp: { root: 2, fiber: 3, seeds: 3, spores: 8, crystal: 12, wood: 8, gold: 15, scale: 20, star: 25 },

  // --- временные решения по противоречиям (переключатели) ---
  /** Гейты улучшений сдвинуты на уровень, где ресурс впервые доступен: лейка 2→8, лейка 3→10, сумка 3→10, компост→12 */
  provisionalGates: true,
  /** Свой полив: не больше одного на грядку за цикл роста; 1 заряд; −20% оставшегося времени */
  waterOncePerCycle: true,
  waterCut: 0.20,
  /** Мини-игра у колодца: средняя доля заполнения (заряды = макс × доля, дробная часть копится) */
  wellFill: 0.85,
  wellFillSd: 0.05,
  canCharges: [10, 20, 50],
  bagCap: [20, 50, 100, 200],
  shovelDD: [0, 0.15, 0.25],

  // --- системы ---
  van: true,
  vanPriceMin: 1.3,
  vanPriceMax: 1.5,
  /** XP сделки Фургона в документе не задан: допущение — 25 % XP сбора за каждую сданную штуку */
  vanXpPerUnitFrac: 0.25,
  /** Сколько часов игрок держит урожай в сумке в ожидании Фургона, потом продаёт НПС */
  vanHoldHours: 4,
  orders: true,
  boss: true,
  bossHp: 16000,
  bossKillProb: 0.7, // допущение: локация убивает босса в 70 % вечеров
  helpsGiven: true,
  helpCoins: 3,
  /** Помощи соседей по моим грядкам — только пока я онлайн (участок в хабе); на грядку лимита в документе нет */
  helpsReceivedPerOnlineHour: 3, // допущение
  helpCut: 0.20,
  compostMult: 0.85,
  beesBonus: 0.10,
  /** true: +10 п.п. к шансу; false: шанс ×1.1 */
  beesAdditive: true,
  pigEveryMin: 180,
  pigCap: 3,
  pigPrice: 300,

  // --- политика игрока (жадная) ---
  policy: {
    /** Срочность ресурса для ближайшей грядки (≥1 — почти всегда приоритет над XP) */
    urgencyBed: 2.0,
    /** Для инструментов/бонусов ближайшего уровня */
    urgencyTool: 0.5,
    /** Для всех прочих будущих целей */
    urgencyFuture: 0.25,
    /** На макс. уровне XP бесполезен, монет с избытком — ресурсы под оставшиеся улучшения в приоритете */
    urgencyEnd: 2.0,
    /** Вес 1 монеты в XP-эквиваленте (делится на K, чтобы политика не зависела от масштаба цен) */
    lambdaLow: 0.1,
    /** Если покупка упирается только в монеты */
    lambdaHigh: 0.5,
  },
};

/** Архетипы игроков: расписание сессий на сутки (минуты от 00:00), фильтр культур, темп помощи соседям */
const ARCHETYPES = {
  casual: {
    label: 'Казуал',
    note: '3–4 сессии по ~5 мин (утро, обед, вечер, иногда поздно)',
    horizonDays: 200,
    maxCropMin: Infinity,
    helpRatePerMin: 0.3,
    schedule(rng) {
      const s = [];
      const add = (from, spread, durMin, durMax) => {
        const st = from + rng() * spread;
        s.push([st, st + durMin + rng() * (durMax - durMin)]);
      };
      add(7 * 60 + 30, 60, 4, 6);
      add(12 * 60 + 30, 90, 4, 6);
      add(18 * 60 + 30, 90, 4, 6);
      if (rng() < 0.5) add(22 * 60, 60, 4, 6);
      return s;
    },
  },
  active: {
    label: 'Активный',
    note: 'заходит каждые 30–60 мин на 3–5 мин в 09:00–21:00',
    maxCropMin: Infinity,
    helpRatePerMin: 0.4,
    schedule(rng) {
      const s = [];
      let t = 9 * 60 + rng() * 30;
      while (t < 21 * 60) {
        const d = 3 + rng() * 2;
        s.push([t, t + d]);
        t += 30 + rng() * 30;
      }
      return s;
    },
  },
  fast: {
    label: 'Только быстрые',
    note: 'только культуры ≤5 мин, 2 ч подряд в день (19–21 ±1 ч), с Фургоном',
    horizonDays: 120,
    maxCropMin: 5,
    helpRatePerMin: 0.5,
    schedule(rng) {
      const st = 19 * 60 + rng() * 60;
      return [[st, st + 120]];
    },
  },
  fastNoVan: {
    label: 'Только быстрые, без Фургона',
    note: 'как «Только быстрые», но Фургоном не пользуется',
    horizonDays: 120,
    maxCropMin: 5,
    helpRatePerMin: 0.5,
    noVan: true,
    schedule(rng) {
      const st = 19 * 60 + rng() * 60;
      return [[st, st + 120]];
    },
  },
  nonstop: {
    label: 'Нон-стоп (контроль)',
    note: 'онлайн 12 ч подряд (10:00–22:00), все культуры — верхняя граница скорости',
    maxCropMin: Infinity,
    helpRatePerMin: 0.3,
    runsCap: 200,
    schedule() {
      return [[600, 1320]];
    },
  },
};

// ------------------------------------------------------------- пресеты

const clone = (o) => JSON.parse(JSON.stringify(o));

/** Рекомендованные правки (обоснование — в RESULTS.md). Применяются поверх base. */
function tweaked(cfg) {
  const crop = (id) => cfg.crops.find((c) => c.id === id);
  const goal = (id) => cfg.goals.find((g) => g.id === id);
  // 1. Ранний затык казуала: на 1 грядке Волокно для грядки 2 копится ~3 суток после ур. 2.
  //    Пшеница (15 мин, Волокно 40 %) открывается с ур. 1 — есть что посадить на офлайн; грядка 2: 8 Вол.+6 Кор. → 5+4.
  crop('wheat').lvl = 1;
  goal('bed2').res = { fiber: 5, root: 4 };
  // 2. Доминирование: Микро-зелень (ур. 9–13) лидирует сразу по 🪙/ч, XP/ч и с востребованными Семенами.
  //    XP 15 → 12 (144 XP/ч < Лук 160); монетный ориентир ~500 🪙/ч (×K) не трогаем. Редис на ур. 1–3 — без правки
  //    (2–3 культуры, несколько часов игры; на офлайн-окно выгоднее Пшеница).
  crop('micro').xp = 12;
  // 3. Хвост после ур. 13 (необязательно): свин 20 Зол. листьев → 10, компост 15 Зв. пыли → 8.
  goal('pig').res = { gold: 10, wood: 15, crystal: 10 };
  goal('compost').res = { crystal: 40, spores: 25, star: 8 };
  // 4. Масштаб монет (жетоны 🪙): рекомендованное K.
  cfg.K = RECOMMENDED_K;
  return cfg;
}

/** Рекомендованный множитель цен (см. таблицу K в RESULTS.md) */
const RECOMMENDED_K = 0.1;

const PRESETS = {
  base: (cfg) => cfg,
  tweaked,
};

/** Значения K для таблицы «K → 🪙/мин игры и 🪙/день» */
const K_TABLE = [1, 0.5, 0.3, 0.2, 0.1, 0.05];

// =====================================================================================================================
// УТИЛИТЫ
// =====================================================================================================================

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(rng, lambda) {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gauss(rng)));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

function gauss(rng) {
  const u = Math.max(1e-12, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

const randint = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

/** Округление цен под масштаб K: цены предметов — целые ≥1, крупные стоимости — «красивые» */
function scaleCoin(v, K, kind) {
  if (v === 0) return 0;
  const x = v * K;
  if (kind === 'item') return Math.max(1, Math.round(x));
  if (x >= 1000) return Math.round(x / 50) * 50;
  if (x >= 100) return Math.round(x / 10) * 10;
  return Math.max(1, Math.round(x));
}

function groupOf(c) {
  if (c.min <= 5) return 'fast';
  if (c.min <= 30) return 'normal';
  if (c.min <= 120) return 'long';
  return 'vlong';
}

const vanLimit = (c) => Math.max(1, Math.min(30, Math.ceil(30 / (c.min / 60))));

/** Подготовка конфига: масштаб K, эффективные гейты */
function prepare(cfgIn) {
  const cfg = clone(cfgIn);
  const K = cfg.K;
  cfg.coin = {
    start: scaleCoin(cfg.startCoins, K, 'cost'),
    help: scaleCoin(cfg.helpCoins, K, 'item'),
    pig: scaleCoin(cfg.pigPrice, K, 'item'),
  };
  for (const c of cfg.crops) {
    c.seedK = scaleCoin(c.seed, K, 'item');
    c.sellK = scaleCoin(c.sell, K, 'item');
    c.group = groupOf(c);
    c.vanLimit = vanLimit(c);
  }
  for (const g of cfg.goals) {
    g.coinsK = scaleCoin(g.coins, K, 'cost');
    g.effLvl = cfg.provisionalGates && g.lvlProv ? g.lvlProv : g.lvl;
  }
  cfg.orderCoin = (v) => scaleCoin(v, K, 'cost');
  return cfg;
}

// =====================================================================================================================
// ЗАКАЗЫ
// =====================================================================================================================

const PLANT_ORDERS = {
  fast: { min: 20, max: 30, coins: 120, xp: 30 },
  normal: { min: 6, max: 10, coins: 180, xp: 70 },
  long: { min: 2, max: 4, coins: 280, xp: 120 },
  vlong: { min: 1, max: 1, coins: 400, xp: 200 },
};
const HELP_ORDERS = [
  { need: 2, coins: 60, xp: 20, rep: 0 },
  { need: 4, coins: 120, xp: 45, rep: 0 },
  { need: 6, coins: 200, xp: 80, rep: 1 },
];
const MISC_ORDERS = [
  { kind: 'van', need: 1, coins: 100, xp: 25, rep: 0 },
  { kind: 'van', need: 2, coins: 200, xp: 60, rep: 0 },
  { kind: 'van', need: 3, coins: 350, xp: 100, rep: 1 },
  { kind: 'crystal', need: 3, coins: 300, xp: 120, rep: 0, lvl: 8 },
  { kind: 'night', need: 1, coins: 400, xp: 180, rep: 0, lvl: 10 },
  { kind: 'toolup', need: 1, coins: 250, xp: 80, rep: 0 },
  { kind: 'collector', need: 10, coins: 200, xp: 60, rep: 0 },
  { kind: 'waterer', need: 5, coins: 150, xp: 40, rep: 0, daily: true },
  { kind: 'rich', need: 500, coins: 180, xp: 40, rep: 0, daily: true, scaled: true },
  { kind: 'patient', need: 2, coins: 250, xp: 100, rep: 0, lvl: 6 },
  { kind: 'host', need: 1, coins: 350, xp: 120, rep: 0 },
  { kind: 'streak', need: 3, coins: 250, xp: 80, rep: 1 },
];

// =====================================================================================================================
// СИМУЛЯЦИЯ ОДНОГО ИГРОКА
// =====================================================================================================================

const REP_LV = [0, 50, 150, 350, 700, 1200, 2000, 3000];
const REP_BONUS = [0, 0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.15];
const REP_VAN_SLOTS = [0, 1, 1, 2, 2, 3, 3, 3];
const TOOLS_FULL = { rake: 3, can: 3, shovel: 3, bag: 4 };

function phaseOf(level) {
  return level <= 4 ? 0 : level <= 8 ? 1 : level <= 12 ? 2 : 3;
}

function simulate(cfg, arch, rng) {
  const crops = cfg.crops;
  const goals = cfg.goals;
  const goalById = Object.fromEntries(goals.map((g) => [g.id, g]));
  const bedGoals = goals.filter((g) => g.kind === 'bed');
  const pol = cfg.policy;
  const K = cfg.K;
  const vanOn = cfg.van && !arch.noVan;
  const horizon = cfg.horizonDays * 1440;

  // ---- расписание сессий
  const sessions = [];
  for (let d = 0; d < cfg.horizonDays; d++) {
    for (const [s, e] of arch.schedule(rng, d)) sessions.push({ start: d * 1440 + s, end: d * 1440 + e });
  }
  sessions.sort((a, b) => a.start - b.start);
  for (let i = 1; i < sessions.length; i++) {
    if (sessions[i].start < sessions[i - 1].end) sessions[i].start = sessions[i - 1].end + 0.5;
    if (sessions[i].end < sessions[i].start) sessions[i].end = sessions[i].start + 1;
  }
  const ends = sessions.map((s) => s.end);
  const nS = sessions.length;
  /** Когда игрок впервые сможет собрать то, что созреет в момент r */
  function nextOnline(r) {
    let lo = 0;
    let hi = nS;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ends[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    if (lo >= nS) return Infinity;
    return sessions[lo].start <= r ? r : sessions[lo].start;
  }

  // ---- мировой босс (19:00, живёт 6 ч)
  const boss = [];
  for (let d = 0; d < cfg.horizonDays + 1; d++) {
    const start = d * 1440 + 19 * 60;
    const killed = cfg.boss && rng() < cfg.bossKillProb;
    boss.push({ start, end: killed ? start + 90 + rng() * 90 : start + 360, killed, contrib: 0, done: false });
  }

  // ---- состояние
  const S = {
    t: 0,
    level: 1,
    xp: 0,
    coins: cfg.coin.start,
    beds: [{ crop: -1, ripe: 0, watered: false }],
    inv: Object.fromEntries(RES.map((r) => [r, 0])),
    bag: new Map(),
    owned: new Set(),
    tool: { rake: 1, can: 1, shovel: 1, bag: 1 },
    charges: cfg.canCharges[0],
    rep: 0,
    pig: null,
    buff: { xp: -1, sell: -1, grow: -1 },
    vanWin: -1,
    vanOffers: [],
    orders: [null, null, null],
    replLeft: 0,
    lastDay: -1,
    streak: 0,
    daily: { water: 0, sales: 0 },
    activeBefore: 0,
    sess: null,
  };

  // ---- запись
  const rec = {
    levelT: Array(14).fill(null),
    levelA: Array(14).fill(null),
    bedT: Array(9).fill(null),
    bedA: Array(9).fill(null),
    goalT: {},
    goalA: {},
    goalBlock: {},
    goalLagH: {},
    completeT: null,
    completeA: null,
    completePlusT: null,
    completePlusA: null,
    coin: { npc: 0, van: 0, orders: 0, pig: 0, help: 0 },
    seeds: 0,
    spentGoals: 0,
    xpSrc: { harvest: 0, orders: 0, van: 0, conv: 0 },
    harvests: Object.fromEntries(crops.map((c) => [c.id, 0])),
    secGot: Object.fromEntries(RES.map((r) => [r, 0])),
    refills: [0, 0, 0],
    activeByCan: [0, 0, 0],
    phase: [0, 1, 2, 3].map(() => ({ net: 0, activeMin: 0, realMin: 0, xp: 0 })),
    ordersDone: 0,
    vanDeals: 0,
    helpsGiven: 0,
    helpsGot: 0,
    bossBuffs: 0,
    maxGap: { h: 0, endedBy: '' },
    daily: [],
    activeMinTotal: 0,
    endT: 0,
  };
  let lastMilestone = 0;
  let phaseStartT = 0;
  let phaseStartA = 0;
  const trace = cfg.trace ? (...a) => S.t < cfg.trace * 1440 && console.log(`d${Math.floor(S.t / 1440)} ${String(Math.floor((S.t % 1440) / 60)).padStart(2, '0')}:${String(Math.floor(S.t % 60)).padStart(2, '0')} L${S.level} xp${Math.round(S.xp)} 🪙${Math.round(S.coins)}`, ...a) : () => {};
  let done = false;

  const activeNow = () => S.activeBefore + (S.sess ? S.t - S.sess.start : 0);
  const xpMult = () => (S.t < S.buff.xp ? 1.1 : 1);
  const repLevel = () => {
    let l = 0;
    while (l + 1 < REP_LV.length && S.rep >= REP_LV[l + 1]) l++;
    return l;
  };
  const sellMult = () => (1 + REP_BONUS[repLevel()]) * (S.t < S.buff.sell ? 1.1 : 1);
  const growMult = () => (S.owned.has('compost') ? cfg.compostMult : 1) * (S.t < S.buff.grow ? 0.9 : 1);
  const lvlOk = (g) => S.level >= g.effLvl;
  const reqOk = (g) => !g.requires || S.owned.has(g.requires);
  const chanceOf = (c) =>
    Math.min(1, c.chance + (S.owned.has('bees') ? (cfg.beesAdditive ? cfg.beesBonus : c.chance * cfg.beesBonus) : 0));

  function milestone(label) {
    if (rec.levelT[cfg.maxLevel] != null && rec.bedT[8] != null) return;
    const gap = (S.t - lastMilestone) / 60;
    if (gap > rec.maxGap.h) rec.maxGap = { h: gap, endedBy: label, level: S.level, beds: S.beds.length };
    lastMilestone = S.t;
  }

  function addCoins(v, src) {
    S.coins += v;
    rec.coin[src] += v;
    rec.phase[phaseOf(S.level)].net += v;
  }

  function addXp(v, src) {
    S.xp += v;
    rec.xpSrc[src] += v;
    rec.phase[phaseOf(S.level)].xp += v;
    while (S.level < cfg.maxLevel && S.xp >= cfg.levelTotal[S.level + 1]) {
      const ph = phaseOf(S.level);
      S.level++;
      if (phaseOf(S.level) !== ph) {
        rec.phase[ph].realMin += S.t - phaseStartT;
        phaseStartT = S.t;
        rec.phase[ph].activeMin += activeNow() - phaseStartA;
        phaseStartA = activeNow();
      }
      trace('LEVEL UP →', S.level);
      rec.levelT[S.level] = S.t / 60;
      rec.levelA[S.level] = activeNow() / 60;
      milestone(`ур. ${S.level}`);
      checkComplete();
    }
  }

  function checkComplete() {
    if (rec.completeT == null) {
      const toolsOk = Object.entries(TOOLS_FULL).every(([k, v]) => S.tool[k] >= v);
      if (S.level >= cfg.maxLevel && S.beds.length >= 8 && toolsOk) {
        rec.completeT = S.t / 60;
        rec.completeA = activeNow() / 60;
      }
    }
    if (rec.completeT != null && rec.completePlusT == null && ['pig', 'bees', 'compost'].every((id) => S.owned.has(id))) {
      rec.completePlusT = S.t / 60;
      rec.completePlusA = activeNow() / 60;
      done = true;
    }
  }

  // ---- лейка
  function useCharge() {
    if (S.charges < 1) {
      const cap = cfg.canCharges[S.tool.can - 1];
      const fill = Math.max(0.3, Math.min(1, cfg.wellFill + cfg.wellFillSd * gauss(rng)));
      S.charges = Math.min(cap, S.charges + cap * fill);
      rec.refills[S.tool.can - 1]++;
    }
    S.charges -= 1;
  }

  function tryWater(bed) {
    if (bed.crop < 0 || (cfg.waterOncePerCycle && bed.watered)) return;
    const rem = bed.ripe - S.t;
    if (rem <= 0) return;
    const nr = S.t + rem * (1 - cfg.waterCut);
    if (nextOnline(nr) < nextOnline(bed.ripe) - 1e-9) {
      useCharge();
      bed.ripe = nr;
      bed.watered = true;
      S.daily.water++;
      orderEvent('water', 1);
    }
  }

  // ---- сумка и продажи
  const bagTotal = () => {
    let n = 0;
    for (const e of S.bag.values()) n += e.n;
    return n;
  };

  function sellNpc(ci, n) {
    const e = S.bag.get(ci);
    const v = n * crops[ci].sellK * sellMult();
    addCoins(v, 'npc');
    S.daily.sales += v;
    orderEvent('sale', v);
    e.n -= n;
    if (e.n <= 0) S.bag.delete(ci);
  }

  function sellBag(force) {
    for (const [ci, e] of [...S.bag]) {
      const keep = vanOn && !force && S.t - e.since < cfg.vanHoldHours * 60 ? crops[ci].vanLimit : 0;
      if (e.n > keep) sellNpc(ci, e.n - keep);
    }
    const cap = cfg.bagCap[S.tool.bag - 1];
    let total = bagTotal();
    if (total > cap) {
      const order = [...S.bag.keys()].sort((a, b) => crops[a].sellK - crops[b].sellK);
      for (const ci of order) {
        if (total <= cap) break;
        const e = S.bag.get(ci);
        const n = Math.min(e.n, total - cap);
        sellNpc(ci, n);
        total -= n;
      }
    }
  }

  function vanSlots() {
    const base = S.level <= 4 ? 1 : S.level <= 9 ? 2 : S.level <= 14 ? 3 : S.level <= 19 ? 4 : 5;
    return base + REP_VAN_SLOTS[repLevel()];
  }

  function vanUpdate() {
    if (!vanOn) return;
    const w = Math.floor(S.t / 120);
    if (S.t - w * 120 >= 60) return;
    if (w !== S.vanWin) {
      S.vanWin = w;
      const unlocked = [];
      crops.forEach((c, i) => c.lvl <= S.level && unlocked.push(i));
      S.vanOffers = [];
      for (let k = vanSlots(); k > 0; k--) {
        const ci = unlocked[Math.floor(rng() * unlocked.length)];
        const L = crops[ci].vanLimit;
        S.vanOffers.push({
          ci,
          rem: randint(rng, Math.ceil(L / 2), L),
          mult: cfg.vanPriceMin + rng() * (cfg.vanPriceMax - cfg.vanPriceMin),
          dealt: false,
        });
      }
    }
    for (const o of S.vanOffers) {
      if (o.rem <= 0) continue;
      const e = S.bag.get(o.ci);
      if (!e || e.n <= 0) continue;
      const d = Math.min(e.n, o.rem);
      const c = crops[o.ci];
      const v = d * c.sellK * o.mult * sellMult();
      addCoins(v, 'van');
      S.daily.sales += v;
      orderEvent('sale', v);
      addXp(d * c.xp * cfg.vanXpPerUnitFrac, 'van');
      e.n -= d;
      o.rem -= d;
      if (e.n <= 0) S.bag.delete(o.ci);
      if (!o.dealt) {
        o.dealt = true;
        rec.vanDeals++;
        orderEvent('van', 1);
      }
    }
  }

  // ---- цели и покупки
  function sumRes(list) {
    const r = {};
    for (const g of list) for (const [k, v] of Object.entries(g.res)) r[k] = (r[k] || 0) + v;
    return r;
  }
  // кэш производных от (уровень, купленное): пересчёт только при изменении
  let cache = null;
  function C() {
    const key = S.level * 100 + S.owned.size;
    if (cache && cache.key === key) return cache;
    const lv1 = S.level + 1;
    let m = 0;
    for (const c of crops) if (c.lvl <= S.level && c.min <= arch.maxCropMin) m = Math.max(m, c.seedK);
    cache = {
      key,
      bedReserve: sumRes(bedGoals.filter((g) => !S.owned.has(g.id) && g.effLvl <= lv1)),
      seedReserve: S.beds.length * m,
      tier1: sumRes(goals.filter((g) => g.kind === 'bed' && !S.owned.has(g.id) && g.effLvl <= lv1)),
      tier2: sumRes(goals.filter((g) => !S.owned.has(g.id) && g.effLvl <= lv1)),
      tier3: sumRes(goals.filter((g) => !S.owned.has(g.id))),
      eligible: goals.filter((g) => !S.owned.has(g.id) && lvlOk(g) && reqOk(g)),
    };
    return cache;
  }
  const bedReserve = () => C().bedReserve;
  const seedReserve = () => C().seedReserve;
  function resOk(res, reserve) {
    for (const [k, v] of Object.entries(res)) if (S.inv[k] - (reserve[k] || 0) < v) return false;
    return true;
  }
  function missing(g, reserve, sr) {
    const m = [];
    for (const [k, v] of Object.entries(g.res)) if (S.inv[k] - (g.kind === 'bed' ? 0 : reserve[k] || 0) < v) m.push(k);
    if (g.coinsK > 0 && S.coins - sr < g.coinsK) m.push('coins');
    return m;
  }

  const blk = {};
  function blockersStart() {
    for (const id in blk) {
      const b = blk[id];
      const dt = S.t - b.prevT;
      for (const m of b.prev) b.miss[m] = (b.miss[m] || 0) + dt;
      b.prevT = S.t;
    }
  }
  function blockersEnd() {
    const reserve = bedReserve();
    const sr = seedReserve();
    for (const g of C().eligible) {
      if (!blk[g.id]) blk[g.id] = { prevT: S.t, prev: [], miss: {}, since: S.t };
      blk[g.id].prev = missing(g, reserve, sr);
    }
  }

  function buy(g) {
    S.coins -= g.coinsK;
    rec.spentGoals += g.coinsK;
    for (const [k, v] of Object.entries(g.res)) S.inv[k] -= v;
    S.owned.add(g.id);
    trace('BUY', g.id);
    rec.goalT[g.id] = S.t / 60;
    rec.goalA[g.id] = activeNow() / 60;
    const b = blk[g.id];
    if (b) {
      const top = Object.entries(b.miss).sort((x, y) => y[1] - x[1])[0];
      rec.goalBlock[g.id] = top && top[1] > 30 ? top[0] : 'none';
      rec.goalLagH[g.id] = (S.t - b.since) / 60;
      delete blk[g.id];
    } else {
      rec.goalBlock[g.id] = 'none';
      rec.goalLagH[g.id] = 0;
    }
    if (g.kind === 'bed') {
      S.beds.push({ crop: -1, ripe: 0, watered: false });
      rec.bedT[S.beds.length] = S.t / 60;
      rec.bedA[S.beds.length] = activeNow() / 60;
      milestone(`грядка ${S.beds.length}`);
      orderEvent('host', 1);
    } else if (g.kind === 'tool') {
      S.tool[g.tool]++;
      orderEvent('toolup', 1);
    } else if (g.id === 'pig') {
      S.pig = { stored: 0, last: S.t };
    }
    checkComplete();
  }

  function coinBlocked() {
    const reserve = bedReserve();
    const sr = seedReserve();
    for (const id of BUY_PRIORITY) {
      const g = goalById[id];
      if (S.owned.has(id) || !lvlOk(g) || !reqOk(g)) continue;
      if (resOk(g.res, reserve) && S.coins - sr < g.coinsK) return true;
    }
    return false;
  }

  function purchases() {
    for (const g of bedGoals) {
      if (!S.owned.has(g.id) && lvlOk(g) && reqOk(g) && resOk(g.res, {})) buy(g);
    }
    const reserve = bedReserve();
    for (const id of BUY_PRIORITY) {
      const g = goalById[id];
      if (S.owned.has(id) || !lvlOk(g) || !reqOk(g)) continue;
      if (S.coins - seedReserve() >= g.coinsK && resOk(g.res, reserve)) buy(g);
    }
  }

  function convertSurplus() {
    const need = C().tier3;
    for (const r of RES) {
      const s = S.inv[r] - (need[r] || 0);
      if (s > 0) {
        addXp(s * cfg.convXp[r], 'conv');
        S.inv[r] -= s;
      }
    }
  }

  // ---- заказы
  function unlockedGroups() {
    const g = new Set();
    for (const c of crops) if (c.lvl <= S.level) g.add(c.group);
    return [...g];
  }
  function genOrder(slot) {
    if (slot === 0) {
      const gs = unlockedGroups();
      const group = gs[Math.floor(rng() * gs.length)];
      const t = PLANT_ORDERS[group];
      return { kind: 'plant', group, need: randint(rng, t.min, t.max), prog: 0, coins: t.coins, xp: t.xp, rep: 0 };
    }
    if (slot === 1) {
      const t = HELP_ORDERS[Math.floor(rng() * HELP_ORDERS.length)];
      return { kind: 'help', need: t.need, prog: 0, coins: t.coins, xp: t.xp, rep: t.rep };
    }
    const pool = MISC_ORDERS.filter((o) => !o.lvl || S.level >= o.lvl);
    const t = pool[Math.floor(rng() * pool.length)];
    return { ...t, need: t.scaled ? t.need * K : t.need, prog: 0, lastDay: S.lastDay };
  }
  function feasible(o) {
    if (o.kind === 'plant') return o.group === 'fast' || arch.maxCropMin > 5;
    if (o.kind === 'help') return cfg.helpsGiven;
    if (o.kind === 'van') return vanOn;
    if (o.kind === 'crystal' || o.kind === 'night' || o.kind === 'patient') return arch.maxCropMin > 5;
    if (o.kind === 'host') return bedGoals.some((g) => !S.owned.has(g.id) && lvlOk(g) && reqOk(g));
    if (o.kind === 'toolup') return goals.some((g) => g.kind === 'tool' && !S.owned.has(g.id) && lvlOk(g) && reqOk(g));
    return true;
  }
  function refreshOrders() {
    if (!cfg.orders) return;
    S.replLeft = 2;
    for (let i = 0; i < 3; i++) {
      if (!S.orders[i]) S.orders[i] = genOrder(i);
      else if (S.orders[i].daily) S.orders[i].prog = 0;
      while (!feasible(S.orders[i]) && S.replLeft > 0) {
        S.replLeft--;
        S.orders[i] = genOrder(i);
      }
    }
  }
  function orderEvent(kind, v, crop) {
    if (!cfg.orders) return;
    for (let i = 0; i < 3; i++) {
      const o = S.orders[i];
      if (!o) continue;
      let hit = false;
      if (kind === 'harvest') {
        if (o.kind === 'plant' && o.group === crop.group) hit = true;
        else if (o.kind === 'crystal' && crop.id === 'crystal') hit = true;
        else if (o.kind === 'night' && crop.min >= 360) hit = true;
        else if (o.kind === 'patient' && crop.min >= 45) hit = true;
      } else if (kind === 'sec') hit = o.kind === 'collector';
      else if (kind === 'water') hit = o.kind === 'waterer';
      else if (kind === 'sale') hit = o.kind === 'rich';
      else if (kind === 'help') hit = o.kind === 'help';
      else if (kind === 'van') hit = o.kind === 'van';
      else if (kind === 'host') hit = o.kind === 'host';
      else if (kind === 'toolup') hit = o.kind === 'toolup';
      else if (kind === 'login' && o.kind === 'streak') {
        o.prog = S.lastDay === o.lastDay + 1 ? o.prog + 1 : 1;
        o.lastDay = S.lastDay;
        v = 0;
        hit = true;
      }
      if (!hit) continue;
      o.prog += v;
      if (o.prog >= o.need) {
        addCoins(cfg.orderCoin(o.coins), 'orders');
        addXp(o.xp, 'orders');
        S.rep += o.rep;
        rec.ordersDone++;
        S.orders[i] = null;
      }
    }
  }
  function orderBonus(c, wXP, lam) {
    if (!cfg.orders) return 0;
    let b = 0;
    for (const o of S.orders) {
      if (!o) continue;
      let hit = false;
      if (o.kind === 'plant' && o.group === c.group) hit = true;
      else if (o.kind === 'crystal' && c.id === 'crystal') hit = true;
      else if (o.kind === 'night' && c.min >= 360) hit = true;
      else if (o.kind === 'patient' && c.min >= 45) hit = true;
      if (hit) b += (wXP * o.xp + lam * cfg.orderCoin(o.coins)) / Math.max(1, o.need - o.prog);
    }
    return b;
  }

  // ---- босс
  function bossContrib(xp) {
    if (!cfg.boss) return;
    const d = Math.floor((S.t - 19 * 60) / 1440);
    const b = boss[d];
    if (b && S.t >= b.start && S.t < b.end) b.contrib += xp;
  }
  function bossResolve() {
    if (!cfg.boss) return;
    for (let d = Math.max(0, Math.floor(S.t / 1440) - 2); d < boss.length; d++) {
      const b = boss[d];
      if (b.start > S.t) break;
      if (b.done || S.t < b.end) continue;
      b.done = true;
      const need = cfg.bossHp * 0.01;
      if (b.killed && b.contrib >= need) {
        const which = ['xp', 'sell', 'grow'][Math.floor(rng() * 3)];
        S.buff[which] = b.end + 1440;
        S.rep += 2 * Math.floor(Math.min(b.contrib, cfg.bossHp * 0.25) / need);
        rec.bossBuffs++;
      }
    }
  }

  // ---- свин
  function pigCollect() {
    const p = S.pig;
    if (!p) return;
    while (p.stored < cfg.pigCap && p.last + cfg.pigEveryMin <= S.t) {
      p.stored++;
      p.last += cfg.pigEveryMin;
    }
    if (p.stored >= cfg.pigCap) p.last = S.t;
    if (p.stored > 0) {
      addCoins(p.stored * cfg.coin.pig, 'pig');
      p.stored = 0;
    }
  }

  // ---- сбор и посадка
  function harvest(bed) {
    const c = crops[bed.crop];
    const units = 1 + (rng() < cfg.shovelDD[S.tool.shovel - 1] ? 1 : 0);
    const xg = c.xp * xpMult();
    addXp(xg, 'harvest');
    bossContrib(xg);
    if (rng() < chanceOf(c)) {
      S.inv[c.sec]++;
      rec.secGot[c.sec]++;
      orderEvent('sec', 1);
    }
    const e = S.bag.get(bed.crop);
    if (e) e.n += units;
    else S.bag.set(bed.crop, { n: units, since: S.t });
    rec.harvests[c.id]++;
    orderEvent('harvest', 1, c);
    bed.crop = -1;
    bed.watered = false;
  }

  function plantAll(cb) {
    const empties = S.beds.filter((b) => b.crop < 0);
    if (!empties.length) return;
    const L = S.level;
    const wXP = L >= cfg.maxLevel ? 0 : 1;
    const lam = (L >= cfg.maxLevel && !cb ? 1 : cb ? pol.lambdaHigh : pol.lambdaLow) / K;
    const gm = growMult();
    const xm = xpMult();
    const sm = sellMult();
    const dd = cfg.shovelDD[S.tool.shovel - 1];
    const vanOpenUntil = vanOn && S.t - Math.floor(S.t / 120) * 120 < 60 ? Math.floor(S.t / 120) * 120 + 60 : -1;
    const cand = [];
    crops.forEach((c, ci) => {
      if (c.lvl > L || c.min > arch.maxCropMin) return;
      const g = c.min * gm;
      const h = nextOnline(S.t + g * (1 - cfg.waterCut));
      const occ = h - S.t;
      if (!Number.isFinite(occ) || h > horizon) return;
      let base = wXP * c.xp * xm + lam * (c.sellK * sm * (1 + dd) - c.seedK) + orderBonus(c, wXP, lam);
      if (vanOpenUntil > 0 && h < vanOpenUntil) {
        for (const o of S.vanOffers) if (o.ci === ci && o.rem > 0) base += lam * (o.mult - 1) * c.sellK * sm * Math.min(o.rem, 1 + dd);
      }
      cand.push({ ci, c, occ, base, ch: chanceOf(c) });
    });
    // потребности по ярусам срочности
    const { tier1, tier2, tier3 } = C();
    const pending = Object.fromEntries(RES.map((r) => [r, 0]));
    for (const b of S.beds) if (b.crop >= 0) pending[crops[b.crop].sec] += chanceOf(crops[b.crop]);

    for (const bed of empties) {
      const avail = cand.filter((x) => S.coins >= x.c.seedK);
      if (!avail.length) break;
      let vstar = 0;
      const T = {};
      for (const x of avail) {
        vstar = Math.max(vstar, x.base / x.occ);
        const tr = x.occ / x.ch;
        if (T[x.c.sec] === undefined || tr < T[x.c.sec]) T[x.c.sec] = tr;
      }
      let best = null;
      let bestScore = -Infinity;
      for (const x of avail) {
        const r = x.c.sec;
        const have = S.inv[r] + pending[r];
        const U = (tier1[r] || 0) > have ? pol.urgencyBed : (tier2[r] || 0) > have ? (L >= cfg.maxLevel ? pol.urgencyEnd : pol.urgencyTool) : (tier3[r] || 0) > have ? pol.urgencyFuture : 0;
        const score = x.base / x.occ + (U * vstar * T[r] * x.ch) / x.occ;
        if (score > bestScore) {
          bestScore = score;
          best = x;
        }
      }
      S.coins -= best.c.seedK;
      rec.seeds += best.c.seedK;
      rec.phase[phaseOf(S.level)].net -= best.c.seedK;
      bed.crop = best.ci;
      bed.ripe = S.t + best.c.min * gm;
      bed.watered = false;
      tryWater(bed);
      trace('plant', best.c.id, 'ripe in', (bed.ripe - S.t).toFixed(1), 'occ', best.occ.toFixed(1), 'inv', JSON.stringify(Object.fromEntries(Object.entries(S.inv).filter(([, v]) => v))));
      pending[best.c.sec] += best.ch;
    }
  }

  function act() {
    blockersStart();
    bossResolve();
    pigCollect();
    for (const b of S.beds) if (b.crop >= 0 && b.ripe <= S.t + 1e-9) harvest(b);
    vanUpdate();
    sellBag(coinBlocked());
    purchases();
    convertSurplus();
    for (const b of S.beds) tryWater(b);
    plantAll(coinBlocked());
    blockersEnd();
  }

  function dayStart(day) {
    S.lastDay = day;
    S.daily = { water: 0, sales: 0 };
    S.rep += 1;
    refreshOrders();
    orderEvent('login', 0);
  }

  // ---- основной цикл
  let snapDay = 0;
  for (let si = 0; si < nS && !done; si++) {
    const sess = sessions[si];
    if (sess.start >= horizon) break;
    while (snapDay * 1440 <= sess.start && snapDay <= cfg.horizonDays) {
      rec.daily.push({ day: snapDay, level: S.level, beds: S.beds.length, xp: Math.round(S.xp), net: Math.round(rec.phase.reduce((a, p) => a + p.net, 0)), activeMin: Math.round(S.activeBefore) });
      snapDay++;
    }
    S.sess = sess;
    S.t = sess.start;
    trace('--- session', (sess.end - sess.start).toFixed(1), 'min');
    const day = Math.floor(S.t / 1440);
    if (day !== S.lastDay) dayStart(day);
    // помощи соседей по моим грядкам — пуассоновский поток, пока я онлайн
    const helpTimes = [];
    {
      const rate = cfg.helpsReceivedPerOnlineHour / 60;
      let x = sess.start;
      while (rate > 0) {
        x += -Math.log(Math.max(1e-12, rng())) / rate;
        if (x > sess.end) break;
        helpTimes.push(x);
      }
    }
    let hi = 0;
    for (let guard = 0; guard < 100000 && !done; guard++) {
      act();
      let next = Infinity;
      for (const b of S.beds) if (b.crop >= 0 && b.ripe > S.t && b.ripe < next) next = b.ripe;
      if (hi < helpTimes.length && helpTimes[hi] < next) next = helpTimes[hi];
      if (vanOn) {
        const vb = (Math.floor(S.t / 120) + 1) * 120;
        if (vb < next) next = vb;
      }
      if (next > sess.end) break;
      S.t = next;
      while (hi < helpTimes.length && helpTimes[hi] <= S.t) {
        const growing = S.beds.filter((b) => b.crop >= 0 && b.ripe > S.t);
        if (growing.length) {
          const b = growing[Math.floor(rng() * growing.length)];
          b.ripe = S.t + (b.ripe - S.t) * (1 - cfg.helpCut);
          rec.helpsGot++;
        }
        hi++;
      }
    }
    const dur = sess.end - sess.start;
    S.t = sess.end;
    if (cfg.helpsGiven && !done) {
      const cap = (5 + S.level - 1) * Math.ceil(dur / 10);
      const n = Math.min(cap, poisson(rng, arch.helpRatePerMin * dur));
      for (let k = 0; k < n; k++) {
        useCharge();
        addCoins(cfg.coin.help, 'help');
        S.rep += 1;
        rec.helpsGiven++;
        orderEvent('help', 1);
      }
    }
    S.activeBefore += dur;
    rec.activeByCan[S.tool.can - 1] += dur;
    S.sess = null;
  }
  rec.phase[phaseOf(S.level)].realMin += S.t - phaseStartT;
  rec.phase[phaseOf(S.level)].activeMin += S.activeBefore - phaseStartA;
  rec.activeMinTotal = S.activeBefore;
  rec.endT = S.t / 60;
  rec.finalLevel = S.level;
  rec.finalBeds = S.beds.length;
  rec.finalTools = { ...S.tool };
  rec.owned = [...S.owned];
  rec.rep = S.rep;
  return rec;
}

// =====================================================================================================================
// АГРЕГАЦИЯ
// =====================================================================================================================

function pct(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i];
}

/** Статистика по метрике с цензурой: значения null = «не достигнуто за горизонт» */
function stat(values) {
  const n = values.length;
  const got = values.filter((v) => v != null).sort((a, b) => a - b);
  const reached = got.length / n;
  const mean = got.length ? got.reduce((a, b) => a + b, 0) / got.length : null;
  // p50/p90 по всем прогонам: недостигнутые считаются бесконечными
  const all = values.map((v) => (v == null ? Infinity : v)).sort((a, b) => a - b);
  const p50 = pct(all, 0.5);
  const p90 = pct(all, 0.9);
  return { reached, mean, p50: Number.isFinite(p50) ? p50 : null, p90: Number.isFinite(p90) ? p90 : null };
}

function mode(arr) {
  const m = {};
  for (const a of arr) if (a != null) m[a] = (m[a] || 0) + 1;
  const top = Object.entries(m).sort((x, y) => y[1] - x[1]);
  return top.length ? { value: top[0][0], share: top[0][1] / arr.length } : null;
}

function aggregate(cfg, recs) {
  const n = recs.length;
  const out = { runs: n, levels: {}, beds: {}, goals: {}, complete: null, completePlus: null };
  for (let L = 2; L <= 13; L++) {
    out.levels[L] = { real: stat(recs.map((r) => r.levelT[L])), active: stat(recs.map((r) => r.levelA[L])) };
  }
  for (let b = 2; b <= 8; b++) {
    const g = cfg.goals.find((x) => x.id === `bed${b}`);
    out.beds[b] = {
      gate: g.effLvl,
      real: stat(recs.map((r) => r.bedT[b])),
      active: stat(recs.map((r) => r.bedA[b])),
      lagAfterGate: stat(recs.map((r) => (r.goalLagH[`bed${b}`] ?? null))),
      blocker: mode(recs.map((r) => (r.goalBlock[`bed${b}`] ? r.goalBlock[`bed${b}`] : null))),
    };
  }
  for (const g of cfg.goals.filter((x) => x.kind !== 'bed')) {
    out.goals[g.id] = {
      gate: g.effLvl,
      real: stat(recs.map((r) => r.goalT[g.id] ?? null)),
      lagAfterGate: stat(recs.map((r) => r.goalLagH[g.id] ?? null)),
      blocker: mode(recs.map((r) => r.goalBlock[g.id] ?? null)),
    };
  }
  out.complete = { real: stat(recs.map((r) => r.completeT)), active: stat(recs.map((r) => r.completeA)) };
  out.completePlus = { real: stat(recs.map((r) => r.completePlusT)), active: stat(recs.map((r) => r.completePlusA)) };

  const mean = (f) => recs.reduce((a, r) => a + f(r), 0) / n;
  const p90 = (f) => pct(recs.map(f).sort((a, b) => a - b), 0.9);
  // доход: чистый = все поступления − семена (траты на инструменты не вычитаются)
  const net = (r) => Object.values(r.coin).reduce((a, b) => a + b, 0) - r.seeds;
  out.income = {
    netPerActiveMin: mean((r) => net(r) / Math.max(1, r.activeMinTotal)),
    netPerActiveMinP90: p90((r) => net(r) / Math.max(1, r.activeMinTotal)),
    netPerRealHour: mean((r) => net(r) / Math.max(1, r.endT)),
    netPerDay: mean((r) => (net(r) / Math.max(1, r.endT)) * 24),
    activeMinPerDay: mean((r) => (r.activeMinTotal / Math.max(1, r.endT)) * 24),
    spentGoals: mean((r) => r.spentGoals),
    netTotal: mean(net),
    bySource: Object.fromEntries(Object.keys(recs[0].coin).map((k) => [k, mean((r) => r.coin[k])])),
    seeds: mean((r) => r.seeds),
    phases: [0, 1, 2, 3].map((p) => {
      const act = mean((r) => r.phase[p].activeMin);
      const real = mean((r) => r.phase[p].realMin);
      const netp = mean((r) => r.phase[p].net);
      return {
        label: ['ур. 1–4', 'ур. 5–8', 'ур. 9–12', 'ур. 13'][p],
        activeMin: act,
        realH: real / 60,
        netPerActiveMin: act > 1 ? netp / act : null,
        netPerDay: real > 60 ? (netp / real) * 1440 : null,
        xpPerActiveMin: act > 1 ? mean((r) => r.phase[p].xp) / act : null,
      };
    }),
  };
  const xpTot = mean((r) => Object.values(r.xpSrc).reduce((a, b) => a + b, 0));
  out.xpSources = Object.fromEntries(Object.keys(recs[0].xpSrc).map((k) => [k, mean((r) => r.xpSrc[k]) / xpTot]));
  const hTot = mean((r) => Object.values(r.harvests).reduce((a, b) => a + b, 0));
  out.harvestShare = Object.fromEntries(cfg.crops.map((c) => [c.id, mean((r) => r.harvests[c.id]) / hTot]));
  out.harvestsTotal = hTot;
  out.refillsPerActiveHour = [0, 1, 2].map((i) => {
    const a = mean((r) => r.activeByCan[i]);
    return a > 30 ? (mean((r) => r.refills[i]) / a) * 60 : null;
  });
  out.ordersPerDay = mean((r) => (r.ordersDone / Math.max(1, r.endT)) * 24);
  out.vanDealsPerDay = mean((r) => (r.vanDeals / Math.max(1, r.endT)) * 24);
  out.helpsGivenPerDay = mean((r) => (r.helpsGiven / Math.max(1, r.endT)) * 24);
  out.helpsGotPerDay = mean((r) => (r.helpsGot / Math.max(1, r.endT)) * 24);
  out.bossBuffs = mean((r) => r.bossBuffs);
  out.maxGap = { meanH: mean((r) => r.maxGap.h), p90H: p90((r) => r.maxGap.h), endedBy: mode(recs.map((r) => r.maxGap.endedBy)) };
  out.final = {
    level: stat(recs.map((r) => r.finalLevel)),
    beds: stat(recs.map((r) => r.finalBeds)),
    levelMean: mean((r) => r.finalLevel),
    bedsMean: mean((r) => r.finalBeds),
    endDays: mean((r) => r.endT / 24),
  };
  // средняя кривая по дням (для графиков)
  const days = Math.max(...recs.map((r) => r.daily.length));
  out.dailyCurve = [];
  for (let d = 0; d < days; d++) {
    const rows = recs.map((r) => r.daily[Math.min(d, r.daily.length - 1)]).filter(Boolean);
    const m = (k) => rows.reduce((a, x) => a + x[k], 0) / rows.length;
    out.dailyCurve.push({ day: d, level: +m('level').toFixed(2), beds: +m('beds').toFixed(2), xp: Math.round(m('xp')), net: Math.round(m('net')), activeMin: Math.round(m('activeMin')) });
  }
  return out;
}

// =====================================================================================================================
// СТАТИЧЕСКИЙ АНАЛИЗ КУЛЬТУР
// =====================================================================================================================

function cropTable(cfg) {
  const demand = {};
  for (const g of cfg.goals) for (const [k, v] of Object.entries(g.res)) demand[k] = (demand[k] || 0) + v;
  const rows = cfg.crops.map((c) => {
    const coinsH = ((c.sellK - c.seedK) * 60) / c.min;
    const xpH = (c.xp * 60) / c.min;
    const secH = (c.chance * 60) / c.min;
    return {
      id: c.id, name: c.name, lvl: c.lvl, min: c.min, xp: c.xp, profit: c.sellK - c.seedK,
      coinsH: Math.round(coinsH), xpH: Math.round(xpH), sec: c.sec, chance: c.chance,
      secPerH: +secH.toFixed(2), demand: demand[c.sec] || 0,
      harvestsForDemand: Math.ceil((demand[c.sec] || 0) / c.chance),
    };
  });
  // доминирование: на каждом уровне — лидер по монетам/ч, XP/ч и по ресурсу/ч среди востребованных
  const dominance = [];
  for (let L = 1; L <= 13; L++) {
    const av = rows.filter((r) => r.lvl <= L);
    const top = (k) => av.reduce((a, b) => (b[k] > a[k] ? b : a));
    const tc = top('coinsH');
    const tx = top('xpH');
    dominance.push({ level: L, topCoins: tc.id, topXp: tx.id, same: tc.id === tx.id, resourceUseful: tc.id === tx.id ? tc.demand > 0 : null });
  }
  return { rows, dominance };
}

// =====================================================================================================================
// ВЫВОД
// =====================================================================================================================

const f1 = (v) => (v == null ? '—' : v >= 100 ? Math.round(v).toString() : v.toFixed(1));
function cell(s) {
  if (!s) return '—';
  if (s.reached === 0) return 'не дост.';
  const tail = s.reached < 0.999 ? ` (${Math.round(s.reached * 100)}%)` : '';
  return `${f1(s.mean)} / ${s.p90 == null ? '>гор.' : f1(s.p90)}${tail}`;
}

function printArch(name, a) {
  const L = [];
  L.push(`\n### ${ARCHETYPES[name].label} — ${ARCHETYPES[name].note}`);
  L.push(`Активной игры в день: ${f1(a.income.activeMinPerDay)} мин; горизонт ${f1(a.final.endDays)} дн.; итог: ур. ${f1(a.final.levelMean)}, грядок ${f1(a.final.bedsMean)}`);
  L.push('\n| Уровень | реальные ч (ср / p90) | активные ч (ср / p90) |');
  L.push('|---|---|---|');
  for (let l = 2; l <= 13; l++) L.push(`| ${l} | ${cell(a.levels[l].real)} | ${cell(a.levels[l].active)} |`);
  L.push('\n| Грядка | гейт | реальные ч | активные ч | ждёт после гейта, ч | чего не хватало |');
  L.push('|---|---|---|---|---|---|');
  for (let b = 2; b <= 8; b++) {
    const x = a.beds[b];
    const bl = x.blocker ? `${RES_RU[x.blocker.value] ?? x.blocker.value} (${Math.round(x.blocker.share * 100)}%)` : '—';
    L.push(`| ${b} | ${x.gate} | ${cell(x.real)} | ${cell(x.active)} | ${cell(x.lagAfterGate)} | ${bl} |`);
  }
  L.push('\n| Улучшение | гейт | реальные ч | ждёт после гейта, ч | чего не хватало |');
  L.push('|---|---|---|---|---|');
  for (const [id, x] of Object.entries(a.goals)) {
    const bl = x.blocker ? `${RES_RU[x.blocker.value] ?? x.blocker.value} (${Math.round(x.blocker.share * 100)}%)` : '—';
    L.push(`| ${id} | ${x.gate} | ${cell(x.real)} | ${cell(x.lagAfterGate)} | ${bl} |`);
  }
  L.push(`\nПолное прохождение (8 грядок + все инструменты + ур. 13): реальные ч ${cell(a.complete.real)}, активные ч ${cell(a.complete.active)}`);
  L.push(`+ свин, пчёлы, компост: реальные ч ${cell(a.completePlus.real)}, активные ч ${cell(a.completePlus.active)}`);
  const inc = a.income;
  L.push(`\nДоход (чистый: продажи+Фургон+заказы+свин+помощь − семена): ${f1(inc.netPerActiveMin)} 🪙/мин активной игры (p90 ${f1(inc.netPerActiveMinP90)}), ${f1(inc.netPerRealHour)} 🪙/ч реального времени, ${f1(inc.netPerDay)} 🪙/день; всего ${f1(inc.netTotal)}, из них на улучшения ${f1(inc.spentGoals)}`);
  L.push('По фазам: ' + inc.phases.map((p) => `${p.label}: ${f1(p.netPerActiveMin)} 🪙/мин, ${f1(p.netPerDay)} 🪙/день, ${f1(p.xpPerActiveMin)} XP/мин`).join('; '));
  const src = Object.entries(inc.bySource).map(([k, v]) => `${k} ${f1(v)}`).join(', ');
  L.push(`Источники монет: ${src}; семена −${f1(inc.seeds)}`);
  L.push(`XP: ` + Object.entries(a.xpSources).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', '));
  const top = Object.entries(a.harvestShare).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ');
  L.push(`Сборы (топ): ${top}; всего ${f1(a.harvestsTotal)}`);
  L.push(`Заказов/день ${f1(a.ordersPerDay)}, сделок Фургона/день ${f1(a.vanDealsPerDay)}, помощей дал/получил в день ${f1(a.helpsGivenPerDay)}/${f1(a.helpsGotPerDay)}, баффов босса ${f1(a.bossBuffs)}`);
  L.push(`Мини-игр «Набери лейку» в час игры по уровням лейки: ${a.refillsPerActiveHour.map(f1).join(' / ')}`);
  L.push(`Самый долгий застой (между ур./грядками): ср ${f1(a.maxGap.meanH)} ч, p90 ${f1(a.maxGap.p90H)} ч, закончился на «${a.maxGap.endedBy?.value}»`);
  return L.join('\n');
}


// =====================================================================================================================
// MAIN (прогоны раскладываются по worker_threads)
// =====================================================================================================================

let INLINE = false;

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { runs: CONFIG.runs, preset: 'all', arch: Object.keys(ARCHETYPES), kTable: true, kRuns: 200, override: {} };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--runs') o.runs = +a[++i];
    else if (a[i] === '--preset') o.preset = a[++i];
    else if (a[i] === '--arch') o.arch = a[++i].split(',');
    else if (a[i] === '--no-k') o.kTable = false;
    else if (a[i] === '--inline') INLINE = true;
    else if (a[i] === '--k-runs') o.kRuns = +a[++i];
    else if (a[i] === '--days') o.override.horizonDays = +a[++i];
    else if (a[i] === '--set') {
      // --set path=value, например --set policy.urgencyBed=1.5 или --set van=false
      const kv = a[++i];
      const eq = kv.indexOf('=');
      o.override[kv.slice(0, eq)] = JSON.parse(kv.slice(eq + 1));
    } else if (a[i] === '--help') {
      console.log('node tools/farm-sim/sim.mjs [--runs N] [--preset base|tweaked|all] [--arch casual,active,fast,fastNoVan,nonstop] [--no-k] [--k-runs N] [--days N] [--set key=json]');
      process.exit(0);
    }
  }
  return o;
}

/** Собрать конфиг: пресет → override (ключи с точкой — вложенные) → архетипный горизонт */
function buildConfig(presetName, override, archName) {
  const cfg = PRESETS[presetName](clone(CONFIG));
  for (const [k, v] of Object.entries(override || {})) {
    const path = k.split('.');
    // массивы (crops, goals) адресуются по id: --set crops.wheat.lvl=1, --set goals.pig.res='{"gold":10}'
    const step = (o, k) => (Array.isArray(o) ? o.find((x) => x.id === k) : o[k]);
    let o = cfg;
    for (let i = 0; i < path.length - 1; i++) o = step(o, path[i]);
    o[path[path.length - 1]] = v;
  }
  if (archName && ARCHETYPES[archName].horizonDays && !(override && override.horizonDays)) cfg.horizonDays = ARCHETYPES[archName].horizonDays;
  return prepare(cfg);
}

function runJob(job) {
  const cfg = buildConfig(job.preset, job.override, job.arch);
  const arch = ARCHETYPES[job.arch];
  const recs = [];
  for (let i = job.from; i < job.to; i++) recs.push(simulate(cfg, arch, mulberry32(cfg.seed + i * 7919 + job.ai * 1000003)));
  return recs;
}

/** Пул воркеров: jobs → массив результатов в том же порядке */
async function runPool(jobs) {
  const n = Math.max(1, Math.min(jobs.length, (os.availableParallelism?.() ?? os.cpus().length) - 1));
  const results = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, () => new Promise((resolve, reject) => {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { worker: true } });
      const feed = () => {
        if (next >= jobs.length) {
          w.terminate();
          resolve();
          return;
        }
        const id = next++;
        w.postMessage({ id, job: jobs[id] });
      };
      w.on('message', ({ id, recs }) => {
        results[id] = recs;
        feed();
      });
      w.on('error', reject);
      feed();
    })),
  );
  return results;
}

/** Прогнать набор (пресет, override) по архетипам; вернуть агрегаты */
async function runSet(presetName, archNames, runs, override = {}) {
  const jobs = [];
  const chunk = 25;
  archNames.forEach((arch, ai) => {
    const nRuns = Math.min(runs, ARCHETYPES[arch].runsCap ?? Infinity);
    for (let f = 0; f < nRuns; f += chunk) jobs.push({ preset: presetName, override, arch, ai, from: f, to: Math.min(nRuns, f + chunk) });
  });
  const parts = INLINE ? jobs.map(runJob) : await runPool(jobs);
  const res = {};
  for (const arch of archNames) {
    const recs = [];
    jobs.forEach((j, i) => j.arch === arch && recs.push(...parts[i]));
    res[arch] = aggregate(buildConfig(presetName, override, arch), recs);
  }
  return { cfg: buildConfig(presetName, override), res };
}

async function main() {
  const args = parseArgs();
  const t0 = Date.now();
  const presets = args.preset === 'all' ? Object.keys(PRESETS) : [args.preset];
  const out = { generated: new Date().toISOString(), runs: args.runs, recommendedK: RECOMMENDED_K, override: args.override, presets: {} };
  const md = [];
  for (const p of presets) {
    const { cfg, res } = await runSet(p, args.arch, args.runs, args.override);
    const ct = cropTable(cfg);
    out.presets[p] = { K: cfg.K, crops: ct, archetypes: res };
    md.push(`\n## Пресет ${p} (K = ${cfg.K}, прогонов ${args.runs})`);
    md.push('\n| Культура | ур. | мин | XP | прибыль | 🪙/ч | XP/ч | ресурс | шанс | ресурс/ч | спрос, шт | сборов на спрос |');
    md.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of ct.rows) md.push(`| ${r.name} | ${r.lvl} | ${r.min} | ${r.xp} | ${r.profit} | ${r.coinsH} | ${r.xpH} | ${RES_RU[r.sec]} | ${r.chance} | ${r.secPerH} | ${r.demand} | ${r.harvestsForDemand} |`);
    const dom = ct.dominance.filter((d) => d.same).map((d) => `ур. ${d.level}: ${d.topCoins}${d.resourceUseful ? ' (ресурс востребован)' : ''}`);
    md.push(`\nЛидер сразу по 🪙/ч и XP/ч: ${dom.length ? dom.join('; ') : 'нет'}`);
    for (const name of args.arch) md.push(printArch(name, res[name]));
  }
  if (args.kTable) {
    const archK = args.arch.filter((n) => n !== 'fastNoVan');
    md.push(`\n## Таблица K (пресет base, до ${args.kRuns} прогонов на точку; цены округлены до целых)`);
    md.push('\nЯчейка: 🪙/мин игры · 🪙/день в среднем за путь до полного прохождения (или горизонта) | на ур. 13 | день ур. 13');
    md.push('\n| K | ' + archK.map((n) => ARCHETYPES[n].label).join(' | ') + ' |');
    md.push('|---|' + archK.map(() => '---').join('|') + '|');
    out.kTable = [];
    for (const K of K_TABLE) {
      const { res } = await runSet('base', archK, args.kRuns, { ...args.override, K });
      const row = { K, arch: {} };
      const cells = archK.map((n) => {
        const a = res[n];
        const end = a.income.phases[3];
        const early = a.income.phases[0];
        row.arch[n] = {
          perActiveMin: a.income.netPerActiveMin,
          perDay: a.income.netPerDay,
          earlyPerActiveMin: early.netPerActiveMin,
          earlyPerDay: early.netPerDay,
          endPerActiveMin: end.netPerActiveMin,
          endPerDay: end.netPerDay,
          level13Days: a.levels[13].real.mean != null ? a.levels[13].real.mean / 24 : null,
          level13Reached: a.levels[13].real.reached,
          completeDays: a.complete.real.mean != null ? a.complete.real.mean / 24 : null,
        };
        const r = row.arch[n];
        const l13 = r.level13Reached > 0 ? f1(r.level13Days) : 'не дост.';
        return `${f1(r.perActiveMin)} · ${f1(r.perDay)} | ${f1(r.endPerActiveMin)} · ${f1(r.endPerDay)} | ${l13}`;
      });
      out.kTable.push(row);
      md.push(`| ${K} | ${cells.join(' ‖ ')} |`);
    }
  }
  writeFileSync(join(HERE, 'results.json'), JSON.stringify(out, null, 1));
  console.log(md.join('\n'));
  console.error(`\nготово за ${((Date.now() - t0) / 1000).toFixed(1)} с → tools/farm-sim/results.json`);
}

if (isMainThread) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  parentPort.on('message', ({ id, job }) => parentPort.postMessage({ id, recs: runJob(job) }));
}
