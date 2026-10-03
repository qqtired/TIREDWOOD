// Враги «Крепости»: типы, их числа и признаки — общее для сервера (орда, директор волн, награды) и клиента (модели,
// значки карточки волны, подсказки). Обычные враги — желейные зомби; боссы, лодки и кракен — тоже записи этой
// таблицы: снимок, прицел, откат выстрелов и награда для них работают одинаково. HP — база 1-й волны: на волне её
// умножает директор (нормировка под нагрузку arsenal, shared/fortwaves.ts).

export const Z_WALKER = 0;
export const Z_RUNNER = 1;
export const Z_BRUTE = 2;
export const Z_CLIMBER = 3;
export const Z_BLOATER = 4;
export const Z_FLYER = 5;
/** Барон Варенья — босс 7, 28, 49 … */
export const Z_BOSS = 6;
export const Z_SHIELD = 7;
export const Z_SPITTER = 8;
export const Z_SAPPER = 9;
export const Z_MEDIC = 10;
export const Z_ARMORED = 11;
/** Таран — босс 14, 35, 56 … */
export const Z_RAM = 12;
/** Валун — босс 21, 42, 63 … */
export const Z_GOLEM = 13;
export const Z_BOAT = 14;
export const Z_TENTACLE = 15;
export const Z_KRAKEN = 16;
/** Король-Тыква — босс 28, 70, 112 … (новые боссы — shared/fortbosses.ts, server/fort/boss-*.ts) */
export const Z_PUMPKIN = 17;
/** Ткачиха (паучиха) — босс 35, 77, 119 … */
export const Z_WEAVER = 18;
/** Леший — босс 42, 84, 126 … */
export const Z_LESHY = 19;
export const Z_KINDS = 20;

/** Признаки типа — для правил и автобашен arsenal: летит, на воде, босс, в броне, часть супер-босса */
export const KF_AIR = 1;
export const KF_SEA = 2;
export const KF_BOSS = 4;
export const KF_ARMORED = 8;
export const KF_SUPER = 16;

export interface ZombieKind {
  name: string;
  /** HP на 1-й волне (на волне — × множитель директора) */
  hp: number;
  /** м/с */
  speed: number;
  /** Урон воротам и кристаллу в секунду (× урон волны) */
  gateDps: number;
  crystalDps: number;
  /** Урон игроку за удар (× урон волны) */
  hit: number;
  /** База награды золотом (считает arsenal; до слияния — fortBounty ниже) */
  pts: number;
  /** Цена в очках бюджета волны (шаркун = 1); 0 — директор сам не выбирает (боссы, лодки, кракен) */
  cost: number;
  /** С какой волны директор берёт этот тип */
  first: number;
  flags: number;
  /** Радиус по земле (расталкивание, стены) */
  r: number;
  /** Хитбокс — эллипсоид: полуоси и высота центра над ногами */
  hrx: number;
  hry: number;
  hcy: number;
  /** Выше этого над ногами — в голову */
  headY: number;
  color: number;
  /** Значок на карточке волны и подсказка при первой встрече */
  icon: string;
  hint: string;
}

const NEVER = 9999;

export const ZK: readonly ZombieKind[] = [
  { name: 'Шаркун', hp: 60, speed: 2.4, gateDps: 10, crystalDps: 12, hit: 10, pts: 10, cost: 1, first: 1, flags: 0, r: 0.4, hrx: 0.5, hry: 0.8, hcy: 0.78, headY: 1.1, color: 0x8db37a, icon: '🧟', hint: 'идёт к воротам · в голову — вдвое больнее' },
  { name: 'Шустрик', hp: 30, speed: 5.4, gateDps: 5, crystalDps: 6, hit: 8, pts: 10, cost: 1, first: 2, flags: 0, r: 0.32, hrx: 0.42, hry: 0.62, hcy: 0.6, headY: 0.84, color: 0xd5e04f, icon: '🏃', hint: 'быстрый и хлипкий · встречайте на подходе' },
  { name: 'Бугай', hp: 520, speed: 1.6, gateDps: 60, crystalDps: 50, hit: 25, pts: 50, cost: 8, first: 4, flags: 0, r: 0.75, hrx: 0.95, hry: 1.25, hcy: 1.2, headY: 1.75, color: 0x8f5fc6, icon: '💪', hint: 'ломает ворота за троих · бейте издалека' },
  { name: 'Липучка', hp: 50, speed: 3.2, gateDps: 6, crystalDps: 8, hit: 10, pts: 20, cost: 2, first: 3, flags: 0, r: 0.38, hrx: 0.48, hry: 0.78, hcy: 0.76, headY: 1.08, color: 0x3db7ae, icon: '🧗', hint: 'лезет по стене в обход ворот' },
  { name: 'Пузырь', hp: 40, speed: 1.9, gateDps: 0, crystalDps: 0, hit: 0, pts: 20, cost: 3, first: 8, flags: 0, r: 0.55, hrx: 0.72, hry: 0.82, hcy: 0.8, headY: 1.18, color: 0xff8a6a, icon: '🎈', hint: 'лопается и бьёт всех рядом · лопайте вдали от ворот' },
  { name: 'Крылатка', hp: 70, speed: 5.2, gateDps: 0, crystalDps: 0, hit: 18, pts: 25, cost: 3, first: 5, flags: KF_AIR, r: 0.45, hrx: 0.68, hry: 0.72, hcy: 0.65, headY: 1.0, color: 0xcf70d9, icon: '🦇', hint: 'замирает перед пикированием · сбей или уйди с метки' },
  { name: 'Барон Варенья', hp: 2200, speed: 2.5, gateDps: 0, crystalDps: 0, hit: 28, pts: 500, cost: 0, first: NEVER, flags: KF_BOSS, r: 2.1, hrx: 2.3, hry: 2.8, hcy: 2.7, headY: 4.2, color: 0x653d98, icon: '👑', hint: 'бьёт по воротам и меткам · после удара ядро открыто' },
  { name: 'Щитоносец', hp: 120, speed: 2.0, gateDps: 15, crystalDps: 14, hit: 12, pts: 24, cost: 4, first: 6, flags: 0, r: 0.48, hrx: 0.58, hry: 0.85, hcy: 0.82, headY: 1.16, color: 0x9fb86a, icon: '🛡', hint: 'щит держит удары в тело спереди · бей в голову сверху' },
  { name: 'Плевальщик', hp: 80, speed: 2.2, gateDps: 6, crystalDps: 8, hit: 15, pts: 16, cost: 4, first: 9, flags: 0, r: 0.45, hrx: 0.56, hry: 0.82, hcy: 0.8, headY: 1.12, color: 0x7fc24f, icon: '💦', hint: 'плюёт вареньем по стене издалека · уйди с метки' },
  { name: 'Подрывник', hp: 45, speed: 4.6, gateDps: 0, crystalDps: 0, hit: 30, pts: 9, cost: 4, first: 11, flags: 0, r: 0.36, hrx: 0.45, hry: 0.7, hcy: 0.68, headY: 0.95, color: 0xe7a33e, icon: '💣', hint: 'несёт бочку к воротам · сбей в толпе — бочка рванёт у своих' },
  { name: 'Лекарь', hp: 110, speed: 2.0, gateDps: 5, crystalDps: 6, hit: 8, pts: 22, cost: 5, first: 13, flags: 0, r: 0.42, hrx: 0.52, hry: 0.8, hcy: 0.78, headY: 1.1, color: 0xeee6d2, icon: '⛑', hint: 'лечит соседей зелёной волной · убирайте первым' },
  { name: 'Чугунок', hp: 260, speed: 1.8, gateDps: 25, crystalDps: 25, hit: 18, pts: 52, cost: 6, first: 16, flags: KF_ARMORED, r: 0.55, hrx: 0.66, hry: 0.95, hcy: 0.92, headY: 1.32, color: 0x7d8a90, icon: '🍳', hint: 'кастрюля гасит слабые попадания · голова, тяжёлый ствол, граната' },
  { name: 'Таран', hp: 2200, speed: 2.6, gateDps: 0, crystalDps: 0, hit: 30, pts: 500, cost: 0, first: NEVER, flags: KF_BOSS, r: 2.0, hrx: 2.4, hry: 2.2, hcy: 2.1, headY: 3.3, color: 0x9a6239, icon: '🐗', hint: 'разгоняется по красной дорожке · уйди с неё' },
  { name: 'Валун', hp: 2200, speed: 1.9, gateDps: 0, crystalDps: 0, hit: 30, pts: 500, cost: 0, first: NEVER, flags: KF_BOSS, r: 2.3, hrx: 2.5, hry: 3.1, hcy: 3.0, headY: 4.6, color: 0x8f9188, icon: '🪨', hint: 'бросает камни в стену · следи за тенью' },
  { name: 'Лодка', hp: 300, speed: 4.0, gateDps: 0, crystalDps: 0, hit: 0, pts: 150, cost: 0, first: NEVER, flags: KF_SEA, r: 1.6, hrx: 1.55, hry: 0.75, hcy: 0.35, headY: 99, color: 0x8a5a34, icon: '⛵', hint: 'десант с моря · потопи до берега' },
  { name: 'Щупальце', hp: 1200, speed: 0, gateDps: 0, crystalDps: 0, hit: 30, pts: 0, cost: 0, first: NEVER, flags: KF_SEA | KF_SUPER, r: 1.0, hrx: 1.15, hry: 3.6, hcy: 3.4, headY: 99, color: 0x9a55a8, icon: '🐙', hint: 'бьёт по морской стене · руби щупальца' },
  { name: 'Кракен', hp: 3000, speed: 0, gateDps: 0, crystalDps: 0, hit: 30, pts: 1500, cost: 0, first: NEVER, flags: KF_SEA | KF_SUPER | KF_BOSS, r: 4, hrx: 3.6, hry: 2.6, hcy: 1.6, headY: 2.4, color: 0x7d3f8c, icon: '🐙', hint: 'голова всплывает в бухте · бей в глаз' },
  { name: 'Король-Тыква', hp: 2200, speed: 2.0, gateDps: 0, crystalDps: 0, hit: 26, pts: 500, cost: 0, first: NEVER, flags: KF_BOSS, r: 2.1, hrx: 2.3, hry: 2.05, hcy: 2.05, headY: 3.1, color: 0xe8822e, icon: '🎃', hint: 'сеет тыквят и катится вдоль стены · прыгай, когда круг под тобой' },
  { name: 'Ткачиха', hp: 2200, speed: 2.4, gateDps: 0, crystalDps: 0, hit: 30, pts: 500, cost: 0, first: NEVER, flags: KF_BOSS, r: 2.0, hrx: 2.2, hry: 1.8, hcy: 1.9, headY: 2.4, color: 0x7a3f86, icon: '🕷', hint: 'висит на стене, плетёт паутину · рви паутину выстрелами' },
  { name: 'Леший', hp: 2200, speed: 1.8, gateDps: 0, crystalDps: 0, hit: 30, pts: 500, cost: 0, first: NEVER, flags: KF_BOSS, r: 1.8, hrx: 1.9, hry: 3.0, hcy: 3.0, headY: 4.5, color: 0x6f5a3c, icon: '🌳', hint: 'корни из-под земли, лечит армию · сбей колдовство залпом' },
];

// ------------------------------------------------------------ умения (общие для сервера и меток на клиенте)

/** Плевальщик: плюёт по людям в 10–30 м (на стене и во дворе), замах с меткой, перезарядка, радиус и урон */
export const SPIT_MIN = 10;
export const SPIT_RANGE = 30;
export const SPIT_WARN_TICKS = 72;
export const SPIT_FLIGHT_TICKS = 24;
export const SPIT_COOLDOWN = 200;
export const SPIT_R = 1.6;
export const SPIT_DMG = 15;
/** Подрывник: фитиль у ворот (кристалла), радиус, урон воротам, кристаллу, людям и своим (×HP-множитель волны) */
export const FUSE_TICKS = 180;
export const BARREL_R = 3.5;
export const BARREL_GATE = 300;
export const BARREL_CRYSTAL = 200;
export const BARREL_PLAYER = 30;
export const BARREL_ZOMBIE = 120;
/** Сбили подрывника до взрыва — бочка рвётся на месте: по строениям только эта доля */
export const BARREL_SHOT_MUL = 0.3;
/** Лекарь: раз в столько тиков лечит соседей в радиусе на долю их HP (боссов — на пятую часть доли) */
export const HEAL_EVERY = 180;
export const HEAL_R = 6;
export const HEAL_FRAC = 0.15;
/** Лекарь не подходит к воротам ближе */
export const MEDIC_HOLD = 9;
/** Чемпион ускоряет соседей в радиусе */
export const CHAMP_AURA_R = 5;
export const CHAMP_HASTE = 1.15;

// ------------------------------------------------------------ боссы (числа общие для сервера и меток на клиенте)

/**
 * Ярость — при этой доле HP и ниже: быстрее, короче паузы и своё усиление (Барон зовёт крылаток, Таран делает два
 * рывка подряд, Валун бросает два камня). Каждая метка при этом держится полное время предупреждения.
 */
export const BOSS_RAGE = 0.5;
/** Пауза между атаками, тиков: обычно и в ярости */
export const BOSS_PAUSE = 60;
export const BOSS_PAUSE_RAGE = 24;
/** Ходит быстрее: за круг (II, III …) +10 %, в ярости ещё ×1,25 */
export const BOSS_TIER_SPEED = 0.1;
export const BOSS_RAGE_SPEED = 1.25;
/** Таран: где стоит (z), полуширина дорожки рывка, скорость рывка (м/с), урон воротам, кристаллу и людям на дорожке */
export const RAM_HOME_Z = -34;
export const RAM_LANE = 1.8;
export const RAM_SPEED = 15;
export const RAM_GATE_DMG = 260;
export const RAM_CRYSTAL_DMG = 140;
export const RAM_HIT = 35;
/** Топот Тарана: радиус и урон (кто в прыжке — цел) */
export const STOMP_R = 7;
export const STOMP_DMG = 26;
/** Вой Тарана: столько тиков, потом стая шустриков */
export const HOWL_TICKS = 60;
/** Валун: где стоит (z); камень летит столько тиков (из полного предупреждения), радиус, урон людям, воротам, кристаллу */
export const GOLEM_HOME_Z = -30;
export const ROCK_FLIGHT_TICKS = 66;
export const ROCK_R = 3;
export const ROCK_DMG = 30;
export const ROCK_GATE_DMG = 150;
export const ROCK_CRYSTAL_DMG = 90;
/** Землетрясение Валуна по стене перед ним: радиус и урон (кто в прыжке — цел) */
export const QUAKE_R = 9;
export const QUAKE_DMG = 24;

// ------------------------------------------------------------ десант с моря

/** Лодка выходит в море так далеко (z), причаливает в воде у берега (z), экипаж прыгает на берег (z) */
export const BOAT_FROM_Z = 124;
export const BOAT_LAND_Z = 27.5;
export const SHORE_Z = 22.4;
/** Где причаливает: x по борту (lane −1 — запад, 1 — восток), напротив точки лазанья на южной стене */
export const BOAT_LANE_X = 12.5;
/** У берега: один абордажник прыгает раз в столько тиков, прыжок на берег — столько тиков */
export const HOP_EVERY = 24;
export const HOP_TICKS = 40;
/** Пустая лодка отходит столько тиков и пропадает (без награды) */
export const BOAT_LEAVE_TICKS = 360;

export function kindOf(kind: number): ZombieKind {
  return ZK[kind] ?? ZK[0];
}

export function kindFlags(kind: number): number {
  return kindOf(kind).flags;
}

export function isBossKind(kind: number): boolean {
  return (kindOf(kind).flags & KF_BOSS) !== 0;
}

/** Ходит по земле (поле расстояний, расталкивание): не летает, не плавает, не босс */
export function isWalkerKind(kind: number): boolean {
  return (kindOf(kind).flags & (KF_AIR | KF_SEA | KF_BOSS)) === 0;
}

/**
 * Награда за сбитого — ВРЕМЕННАЯ копия правила arsenal до слияния (экономика целиком у них): база типа,
 * рост ×(1+0,05(w−1)), элита ×2, чемпион ×5, босс 500, супер-босс 1500, лодка 150 команде, экипаж — по ½.
 */
export function fortBounty(kind: number, tier: number, wave: number, crew: boolean): number {
  const growth = 1 + 0.05 * (Math.max(1, wave) - 1);
  const k = kindOf(kind);
  const base = kind === Z_TENTACLE ? 0 : k.pts;
  const tierMul = tier === 2 ? 5 : tier === 1 ? 2 : 1;
  return Math.round(base * growth * tierMul * (crew ? 0.5 : 1));
}
