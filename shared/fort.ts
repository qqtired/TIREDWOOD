// Режим «Крепость»: кооператив против желейных зомби, волны до 300. Общее для сервера и клиента: фазы, правила зомби,
// лавка, сроки, жетоны и типы сообщений. Типы врагов — fortkinds.ts, волны (боссы, десант, события, нагрузка, жетоны)
// — fortwaves.ts, карта — fortmap.ts, прицел по зомби — fortaim.ts, хвост снимка — fortnet.ts.
// Всё, что даёт жетоны и очки, решает сервер; клиент по этим же таблицам рисует и подсказывает.
import { TICK_RATE } from './constants.ts';
import { FORT_LAST_WAVE } from './fortwaves.ts';
import type { Outfit } from './outfit.ts';

export {
  Z_WALKER, Z_RUNNER, Z_BRUTE, Z_CLIMBER, Z_BLOATER, Z_FLYER, Z_BOSS, Z_SHIELD, Z_SPITTER, Z_SAPPER, Z_MEDIC, Z_ARMORED,
  Z_RAM, Z_GOLEM, Z_BOAT, Z_TENTACLE, Z_KRAKEN, Z_KINDS, KF_AIR, KF_SEA, KF_BOSS, KF_ARMORED, KF_SUPER, ZK, kindOf, kindFlags,
  isBossKind, isWalkerKind, fortBounty, type ZombieKind,
} from './fortkinds.ts';

export const FORT_MAX_HUMANS = 6;
/** Волн до победы — 300 (рекорды и так говорят, кто как далеко дошёл) */
export const FORT_WAVES = FORT_LAST_WAVE;
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
/** Передышка: 15 с, после босса 20, перед супер-боссом 30 (breakSecondsAfter в fortwaves.ts) */
export const BREAK_TICKS = 15 * TICK_RATE;
export const END_TICKS = 15 * TICK_RATE;
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

// --- зомби (типы и их числа — fortkinds.ts)

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
/** Плевальщик целится (метка на стене) */
export const ZS_SPIT = 13;
/** Подрывник поставил бочку: горит фитиль (метка) */
export const ZS_PLANT = 14;
/** Абордажник прыгает из лодки на берег */
export const ZS_HOP = 15;
/** Лодка: плывёт, у берега (высадка), пустая уходит */
export const ZS_BOAT = 16;
export const ZS_BOAT_LAND = 17;
export const ZS_BOAT_LEAVE = 18;
/** Таран: метка-дорожка рывка, сам рывок, топот (круг вокруг себя) */
export const ZS_CHARGE_WARN = 19;
export const ZS_CHARGE = 20;
export const ZS_STOMP = 21;
/** Валун: поднял камень (метка, куда упадёт), землетрясение по стене */
export const ZS_THROW = 22;
export const ZS_QUAKE = 23;
/** Щупальце: покачивается, замах (метка), лежит после удара (открыто) */
export const ZS_TENT_IDLE = 24;
export const ZS_TENT_SLAM = 25;
export const ZS_TENT_REST = 26;
/** Голова кракена: под водой, плевок (метки), открыта */
export const ZS_KRAKEN_DIVE = 27;
export const ZS_KRAKEN_SPIT = 28;
/** Метеор (событие) — только в метках и вспышках */
export const ZS_METEOR = 29;
/** Бочка подрывника взорвалась (вспышка) */
export const ZS_BARREL = 30;
/** Таран воет — сейчас выбегут шустрики */
export const ZS_HOWL = 31;

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

/** Защитников для сложности: 1…6 */
export function defenderCount(humans: number): number {
  return Math.max(1, Math.min(FORT_MAX_HUMANS, Math.floor(humans) || 1));
}

/**
 * Карточка волны — что идёт (значки и число), откуда, есть ли десант, босс и событие. Сервер шлёт её в начале волны и
 * в передышке («дальше»), клиент рисует фишки (client/fort/wavecard.ts).
 */
export interface FortWaveCard {
  w: number;
  /** Короткое название волны */
  title: string;
  /** Пары [тип, сколько] — без лодок и боссов */
  chips: number[];
  /** Лодок и абордажников в каждой */
  boats: number;
  crew: number;
  /** Тип босса или супер-босса (−1 — нет), его круг */
  boss: number;
  tier: number;
  /** Событие волны (EV_*) */
  event: number;
  /** Дороги, откуда идут импульсы: 0 — запад, 1 — север, 2 — восток */
  roads: number[];
  /** Новые типы в этой волне (первая встреча) */
  fresh: number[];
  /** Элиты и чемпионов среди них */
  elite: number;
  champ: number;
  /** Вызвали раньше: +10 % золота */
  early?: boolean;
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

// --- жетоны (≈10–11 🪙 за минуту боя): за каждую отбитую волну с участием, за сбитых, бонусы итогов — fortwaves.ts.
// Платятся при выходе или в итогах, каждая волна — один раз (учёт забега по профилю — server/fort/ledger.ts).

export interface FtReward {
  total: number;
  /** Отбитых волн с участием за забег */
  n: number;
  /** Жетонов за волны, сбитых, победу (300-я), лучшего защитника, новый рекорд крепости — в этой выплате */
  waves: number;
  kills: number;
  win: number;
  mvp: number;
  record?: number;
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
  /** Не первая выплата за этот забег (вышел раньше и вернулся) — игру в статистике уже посчитали */
  again?: boolean;
  /** Сбитых с прошлой выплаты — в статистику профиля */
  kNew?: number;
  /** Свой лучший результат (волн) до этого забега */
  best?: number;
}

/** Забег в таблице рекордов крепости: сколько волн отбили, кто был в итогах, когда (мс), сколько защитников */
export interface FortRunRec {
  wave: number;
  names: string[];
  at: number;
  n: number;
}

/** Рекордов крепости храним столько */
export const FORT_TOP = 5;

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
  // попадание по зомби: кто, какой зомби, урон, куда (0 — тело, 1 — голова, 2 — в щит, 3 — в броню), где
  | ['zhit', number, number, number, number, number, number, number]
  // зомби сбит: какой, кто (0 — взрыв или само), где, тип, ступень (0 — обычный, 1 — элита, 2 — чемпион)
  | ['zdie', number, number, number, number, number, number, number]
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
  // босс меняет фазу: номер, фаза (2 — ярость)
  | ['bossphase', number, number]
  // лекарь лечит: какой, где, радиус
  | ['heal', number, number, number, number, number]
  // щит щитоносца разбит: какой, где
  | ['shield', number, number, number, number]
  // лодка: 0 — потоплена (кем), 1 — высадка; номер, где
  | ['boat', number, number, number, number, number]
  // бросок (камень Валуна, плевок): откуда, куда, тиков полёта, вид (ZS_*)
  | ['throw', number, number, number, number, number, number, number, number]
  // событие волны: какое (EV_*), 1 — началось, 0 — кончилось
  | ['event', number, number]
  // ящик припасов: 0 — летит, 1 — сел, 2 — подобран (кем), где
  | ['supply', number, number, number, number, number]
  // вызов волны раньше: +10 % золота
  | ['early', number]
  // колокол: кто ударил
  | ['bell', number];
