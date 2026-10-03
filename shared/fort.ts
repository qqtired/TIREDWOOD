// Режим «Крепость» (выпуск 6): кооператив против желейных зомби. Общее для сервера и клиента: типы зомби, волны,
// лавка, сроки фаз, жетоны и типы сообщений. Карта — fortmap.ts, прицел по зомби — fortaim.ts, хвост снимка — fortnet.ts.
// Всё, что даёт жетоны и очки, решает сервер; клиент по этим же таблицам рисует и подсказывает.
import { TICK_RATE } from './constants.ts';
import type { Outfit } from './outfit.ts';

export const FORT_MAX_HUMANS = 6;
/** Волн до победы */
export const FORT_WAVES = 8;
/** Живых зомби одновременно — не больше */
export const FORT_MAX_ALIVE = 60;

// --- фазы
/** Сбор: первый вошёл в пустую крепость — отсчёт до первой волны */
export const FT_GATHER = 0;
export const FT_WAVE = 1;
/** Передышка между волнами: лавка, колокол */
export const FT_BREAK = 2;
/** Итоги: победа или поражение, потом новая игра со сбора */
export const FT_END = 3;

export const GATHER_TICKS = 25 * TICK_RATE;
export const BREAK_TICKS = 20 * TICK_RATE;
export const END_TICKS = 12 * TICK_RATE;
/** Колокол: все готовы — волна через столько */
export const READY_TICKS = 3 * TICK_RATE;

/** Снимки крепости — каждые 2 тика (30 в секунду); задержка интерполяции — как у набережной */
export const FORT_SNAP_EVERY = 2;
export const FORT_MIN_DELAY = 2.6;

export const GATE_HP = 1600;
export const CRYSTAL_HP = 2500;
/** Combat bell: shared cooldown from activation, structure mitigation only. */
export const RALLY_TICKS = 8 * TICK_RATE;
export const RALLY_COOLDOWN = 30 * TICK_RATE;
export const RALLY_MITIGATION = 0.5;

export const FORT_HP = 100;
/** Сбили — снова на террасе через 5 с */
export const FORT_RESPAWN_TICKS = 5 * TICK_RATE;
/** Отхил: 6 с без урона — по 1 HP раз в 12 тиков (5 HP/с) */
export const FORT_REGEN_DELAY = 6 * TICK_RATE;
export const FORT_REGEN_EVERY = 12;

// --- зомби

export const Z_WALKER = 0;
export const Z_RUNNER = 1;
export const Z_BRUTE = 2;
export const Z_CLIMBER = 3;
export const Z_BLOATER = 4;
export const Z_FLYER = 5;
export const Z_BOSS = 6;
export const Z_KINDS = 7;

export interface ZombieKind {
  name: string;
  hp: number;
  /** м/с */
  speed: number;
  /** Урон воротам и кристаллу в секунду */
  gateDps: number;
  crystalDps: number;
  /** Урон игроку за удар */
  hit: number;
  /** Очки матча за сбитого */
  pts: number;
  /** Радиус по земле (расталкивание, стены) */
  r: number;
  /** Хитбокс — эллипсоид: полуоси и высота центра над ногами */
  hrx: number;
  hry: number;
  hcy: number;
  /** Выше этого над ногами — в голову */
  headY: number;
  color: number;
}

export const ZK: readonly ZombieKind[] = [
  { name: 'Шаркун', hp: 60, speed: 2.4, gateDps: 10, crystalDps: 12, hit: 10, pts: 10, r: 0.4, hrx: 0.5, hry: 0.8, hcy: 0.78, headY: 1.1, color: 0x8db37a },
  { name: 'Шустрик', hp: 30, speed: 5.4, gateDps: 5, crystalDps: 6, hit: 8, pts: 10, r: 0.32, hrx: 0.42, hry: 0.62, hcy: 0.6, headY: 0.84, color: 0xd5e04f },
  { name: 'Бугай', hp: 520, speed: 1.6, gateDps: 60, crystalDps: 50, hit: 25, pts: 50, r: 0.75, hrx: 0.95, hry: 1.25, hcy: 1.2, headY: 1.75, color: 0x8f5fc6 },
  { name: 'Липучка', hp: 50, speed: 3.2, gateDps: 6, crystalDps: 8, hit: 10, pts: 20, r: 0.38, hrx: 0.48, hry: 0.78, hcy: 0.76, headY: 1.08, color: 0x3db7ae },
  { name: 'Пузырь', hp: 40, speed: 1.9, gateDps: 0, crystalDps: 0, hit: 0, pts: 20, r: 0.55, hrx: 0.72, hry: 0.82, hcy: 0.8, headY: 1.18, color: 0xff8a6a },
  { name: 'Крылатка', hp: 70, speed: 5.2, gateDps: 0, crystalDps: 0, hit: 18, pts: 25, r: 0.45, hrx: 0.68, hry: 0.72, hcy: 0.65, headY: 1.0, color: 0xcf70d9 },
  { name: 'Барон Варенья', hp: 2600, speed: 2.5, gateDps: 0, crystalDps: 0, hit: 28, pts: 180, r: 2.1, hrx: 2.3, hry: 2.8, hcy: 2.7, headY: 4.2, color: 0x653d98 },
];

/** Удар по воротам и кристаллу — раз в столько тиков (урон = dps × доля секунды) */
export const Z_GATE_EVERY = 30;
/** Удар по игроку — раз в столько тиков */
export const Z_HIT_EVERY = 48;
/** Перед воротами зомби встаёт на таком расстоянии от створок (бьёт с выпадом) — сверху его видно */
export const Z_GATE_GAP = 0.6;
/** Игрока на земле ближе этого (по ту же сторону стены) зомби идёт бить */
export const Z_AGGRO = 6;
/** Липучка лезет со скоростью, м/с; на ходу стены стоит столько тиков, потом спрыгивает во двор */
export const CLIMB_SPEED = 1.7;
export const CLIMB_TOP_TICKS = 70;
export const CLIMB_DROP_TICKS = 30;
/** Застрял (не приблизился к цели) столько тиков — обратно в начало дороги */
export const Z_STUCK_TICKS = 15 * TICK_RATE;

/** Пузырь лопается: радиус и урон */
export const POP_R = 3.5;
export const POP_GATE = 220;
export const POP_CRYSTAL = 220;
export const POP_PLAYER = 30;
export const POP_ZOMBIE = 100;

/** Состояния зомби (в снимке) */
export const ZS_WALK = 0;
/** Бьёт ворота, кристалл или игрока */
export const ZS_ATTACK = 1;
/** Лезет по стене */
export const ZS_CLIMB = 2;
/** На ходу стены */
export const ZS_TOP = 3;
/** Спрыгивает во двор */
export const ZS_DROP = 4;
export const ZS_FLY_WARN = 5;
export const ZS_FLY_DIVE = 6;
export const ZS_FLY_RECOVER = 7;
export const ZS_BOSS_GATE = 8;
export const ZS_BOSS_BOMB = 9;
export const ZS_BOSS_PULSE = 10;
export const ZS_BOSS_OPEN = 11;
export const ZS_BOSS_APPROACH = 12;

export const FLY_WARN_TICKS = 72;
export const FLY_DIVE_TICKS = 36;
export const FLY_RECOVER_TICKS = 120;
export const FLY_CRYSTAL_DMG = 45;
export const FLY_R = 1.8;
export const BOSS_WARN_TICKS = 108;
export const BOSS_OPEN_TICKS = 180;
export const BOSS_ARMOR = 0.22;
export const BOSS_GATE_DMG = 180;
export const BOSS_CRYSTAL_DMG = 85;
export const BOSS_BOMB_R = 4;
export const BOSS_PULSE_R = 10;

export interface WaveRole {
  name: string;
  hint: string;
  /** Дороги: запад, север, восток. Чередуются между отдельными выпусками. */
  roads: readonly number[];
  pulses: number;
}

export const WAVE_ROLES: readonly WaveRole[] = [
  { name: 'Первые шаги', hint: 'Северная дорога · держите ворота и учитесь целиться в голову', roads: [1], pulses: 1 },
  { name: 'Западный натиск', hint: 'Два захода с запада · шустрики идут вслед за шаркунами', roads: [0], pulses: 2 },
  { name: 'По стенам', hint: 'Запад и восток · липучки обходят ворота по боковым стенам', roads: [0, 2], pulses: 2 },
  { name: 'Крылья над стеной', hint: 'Первый налёт · крылатка замирает перед пикированием: стреляйте или уходите с метки', roads: [1, 0, 2], pulses: 3 },
  { name: 'Взрывоопасная колонна', hint: 'Север · пузыри опасны у ворот, лопайте их вдали от крепости', roads: [1], pulses: 3 },
  { name: 'Клещи', hint: 'Запад → восток → запад · прикрывайте стены и небо', roads: [0, 2, 0], pulses: 3 },
  { name: 'Со всех сторон', hint: 'Три дороги, липучки и налёт · разделите позиции, помогайте соседям', roads: [0, 1, 2], pulses: 3 },
  { name: 'Барон Варенья', hint: 'Уходите с красных меток · после атаки ядро открыто на 3 секунды', roads: [1, 0, 2], pulses: 3 },
];

export function waveRole(wave: number): WaveRole {
  return WAVE_ROLES[Math.max(0, Math.min(FORT_WAVES - 1, wave - 1))];
}

/** Состав волны на одного: шаркуны, шустрики, бугаи, липучки, пузыри */
export const WAVES: readonly (readonly number[])[] = [
  [14, 0, 0, 0, 0, 0, 0],
  [16, 8, 0, 0, 0, 0, 0],
  [18, 8, 1, 5, 0, 0, 0],
  [16, 10, 1, 5, 0, 4, 0],
  [20, 10, 2, 5, 4, 5, 0],
  [22, 12, 2, 7, 5, 6, 0],
  [24, 14, 3, 8, 6, 7, 0],
  [28, 16, 4, 10, 7, 9, 1],
];

/** Every extra defender adds work and 2.5% coordination pressure per head.
 * Most work comes from bodies/directions, not HP: ordinary HP is capped at 1.4×.
 * Round quotas up: small specialist packs must not disappear through rounding. */
export function defenderCount(humans: number): number {
  return Math.max(1, Math.min(FORT_MAX_HUMANS, Math.floor(humans) || 1));
}

export function waveCounts(wave: number, humans: number): number[] {
  const base = WAVES[Math.max(0, Math.min(WAVES.length - 1, wave - 1))];
  const n = defenderCount(humans);
  const k = n * (1 + .025 * (n - 1)) / (1 + .08 * (n - 1));
  return base.map((count, kind) => kind === Z_BOSS ? count : Math.ceil(count * k));
}

/** Boss scales close to total team DPS; normal enemies retain quick marker kills. */
export function zombieHp(kind: number, humans: number): number {
  return Math.round(ZK[kind].hp * (1 + (kind === Z_BOSS ? 1.1 : .08) * (defenderCount(humans) - 1)));
}

/** За сколько тиков волна выпускает всех своих зомби */
export function waveSpawnTicks(wave: number): number {
  return (14 + 2 * wave) * TICK_RATE;
}

// --- очки матча и лавка

export const START_PTS = 50;
/** Каждому, кто был в крепости с начала волны, — за отбитую волну */
export const WAVE_PTS = 40;
/** Опоздавший получает START_PTS и столько за каждую уже отбитую волну */
export const LATE_PTS = 30;

export const FIX_PRICE = 40;
export const FIX_HP = 400;
export const NEWGATE_PRICE = 120;
export const CRYSTAL_PRICE = 60;
export const CRYSTAL_FIX = 250;
export const TURRET_PRICE = 150;
/** Краскомёт: дальность, темп (тиков между выстрелами), урон */
export const TURRET_RANGE = 24;
export const TURRET_EVERY = 12;
export const TURRET_DMG = 9;
export const MAGAZINE_PRICE = 90;
export const FORT_MAGAZINE = 42;
export const ANTIAIR_PRICE = 100;
export const ANTIAIR_RANGE = 36;
export const ANTIAIR_DMG = 18;
export const ANTIAIR_GROUND_DMG = 6;
export const JAM_PRICE = 30;
/** Лужа варенья на дороге: сколько живёт, радиус, во сколько раз медленнее зомби в ней */
export const JAM_TICKS = 45 * TICK_RATE;
export const JAM_R = 3;
export const JAM_SLOW = 0.4;

// --- жетоны (шкала выпуска 6: около 8–12 🪙 за минуту боя; полная игра — 7–8 минут, победа — 90–100)

export const FT_WAVE_TOKENS = 5;
export const FT_KILLS_PER_TOKEN = 5;
export const FT_KILL_CAP = 30;
export const FT_WIN = 20;
export const FT_MVP = 10;

export interface FtReward {
  total: number;
  /** Отбитых волн с участием и жетонов за них */
  n: number;
  waves: number;
  kills: number;
  win: number;
  mvp: number;
}

/**
 * Жетоны по итогам игры тому, кто дождался итогов: waves — сколько волн отбил (был в крепости с начала волны до её
 * конца), kills — сколько зомби сбил сам. Ни одной волны — ничего.
 */
export function fortReward(r: { waves: number; kills: number; win: boolean; mvp: boolean }): FtReward | null {
  if (r.waves < 1) return null;
  const waves = FT_WAVE_TOKENS * Math.min(FORT_WAVES, r.waves);
  const kills = Math.min(FT_KILL_CAP, Math.floor(r.kills / FT_KILLS_PER_TOKEN));
  const win = r.win ? FT_WIN : 0;
  const mvp = r.mvp ? FT_MVP : 0;
  return { total: waves + kills + win + mvp, n: Math.min(FORT_WAVES, r.waves), waves, kills, win, mvp };
}

// --- сообщения (shared/messages.ts берёт отсюда типы)

/** Что в крепости — для подсказки у арки на набережной. left — секунд до конца фазы */
export interface FortStatus {
  phase: number;
  wave: number;
  humans: number;
  names: string[];
  left: number;
}

/** Защитник: id — номер в снимке, pts — очки матча, k — сбил, d — сбили его, ready — ударил в колокол */
export interface FortPlayerRow {
  id: number;
  level?: number;
  pid: number;
  name: string;
  o: Outfit;
  pts: number;
  k: number;
  d: number;
  ready: boolean;
  ping: number;
  /** Улучшение на текущую игру; не меняет маркер в других режимах. */
  mag?: boolean;
}

/** Строка итогов: волн отбил с участием, жетонов получил */
export interface FortResultRow {
  id: number;
  name: string;
  k: number;
  d: number;
  pts: number;
  waves: number;
  tokens: number;
}

/** Что купили у стойки (событие 'buy') */
export const BUY_FIX = 0;
export const BUY_GATE = 1;
export const BUY_CRYSTAL = 2;
export const BUY_TURRET = 3;
export const BUY_JAM = 4;
export const BUY_MAGAZINE = 5;
export const BUY_ANTIAIR = 6;

/** События тика крепости (компактные массивы) */
export type FortEvent =
  // выстрел: кто, откуда, куда, чем кончился (0 — стена, 1 — зомби, 2 — в никуда), нормаль стены
  | ['shot', number, number, number, number, number, number, number, number, number, number, number]
  // попадание по зомби: кто, какой зомби, урон, в голову (1/0), где
  | ['zhit', number, number, number, number, number, number, number]
  // зомби сбит: какой, кто (0 — взрыв или само), где, тип
  | ['zdie', number, number, number, number, number, number]
  // пузырь лопнул: где
  | ['pop', number, number, number]
  // зомби ударил игрока: какой зомби, кого, урон
  | ['phit', number, number, number]
  // игрока сбили: кого, какой зомби (0 — взрыв)
  | ['pdown', number, number]
  // игрок появился: кто, где, куда смотрит
  | ['spawn', number, number, number, number, number]
  // ворота: 0 — пали, 1 — починили, 2 — новые; кто чинил (0 — никто)
  | ['gate', number, number]
  // лавка: кто, что (BUY_*), номер места (краскомёт, жёлоб)
  | ['buy', number, number, number]
  // краскомёт: какой, в какого зомби, куда попал
  | ['tshot', number, number, number, number, number]
  // липучка забралась на стену: какой зомби
  | ['climb', number]
  // атака по зафиксированной области: зомби, вид атаки, центр, радиус, тик удара
  | ['warn', number, number, number, number, number, number, number]
  // отыгранный удар по области: вид атаки, центр, радиус
  | ['blast', number, number, number, number, number]
  // босс меняет фазу: номер, фаза 1…3
  | ['bossphase', number, number]
  // колокол: кто ударил
  | ['bell', number];
