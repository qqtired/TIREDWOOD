// «Крепость 50» (флаг сервера FORT50=1, выбор владельца 31.10: Ф50-1, С-1, С-2а, К-1, К-4): 50 волн вместо 100,
// ломаемые участки стены с проломом и ремонтом, камни со стены, лагерь Барона с катапультой. Здесь — общие числа,
// расписание и формат сообщений: их читают сервер (server/fort/*), клиент (client/fort/*) и тесты. Без флага ничего
// отсюда не работает. План и решения — docs/fort50/tech.md, слова владельца — docs/fort50/brief.md, числа — страница
// lab/fort-rework/ (waves.ts, walls.ts, texts.ts).
import { TICK_RATE } from './constants.ts';
import {
  Z_ARMORED, Z_BLOATER, Z_BOSS, Z_BRUTE, Z_CLIMBER, Z_FLYER, Z_GOLEM, Z_HUT, Z_LESHY, Z_MEDIC, Z_PELICAN, Z_PUMPKIN, Z_RAM, Z_RUNNER, Z_SAPPER, Z_SHIELD,
  Z_SPITTER, Z_WALKER, Z_WEAVER,
} from './fortkinds.ts';
import { Z_CANOPY, Z_CRABCRANE, Z_FOREMAN, Z_JAMPUMP, Z_MILLER, Z_ROPECRAB, Z_SPRING } from './fortsiege.ts';

// ------------------------------------------------------------ Ф50-1: 50 волн

export const F50_LAST_WAVE = 50;

/**
 * Сила волны w — номер «прежней» волны той же силы: 2 + 1,9·(w − 1) (1 → 2, 25 → 48, 50 → 95). Ею считают всё, что
 * растёт с волной: HP и урон врагов, ступени, боссов, Кракена, время выхода, экипажи, доход и цены ремонта ворот и
 * кристалла. Расписание (кто, когда, что впервые) — по самому номеру w.
 */
export function f50Force(w: number): number {
  return Math.min(100, Math.round(2 + 1.9 * (Math.max(1, w) - 1)));
}

/**
 * Одна волна Ф50 по силе — 1,9 прежних: золото за сбитых и бонус волны ×1,9, чтобы к волне силы F у команды было
 * столько же золота на прокачку, сколько к прежней волне F (иначе вдвое меньше: волн вдвое меньше).
 */
export const F50_GOLD_MUL = 1.9;

/** Первые пять волн на 25 % плотнее: скучного разгона нет («1-я волна сразу с шустриками») */
export function f50EarlyBoost(w: number): number {
  return w <= 5 ? 1.25 : 1;
}

/** Глава 1…5 (по 10 волн) */
export function f50Chapter(w: number): number {
  return Math.min(5, Math.max(1, Math.ceil(w / 10)));
}

/** Первая встреча вида в Ф50-1 (вместо ZK[kind].first) */
export const F50_FIRST: Readonly<Record<number, number>> = {
  [Z_WALKER]: 1, [Z_RUNNER]: 1, [Z_CLIMBER]: 2, [Z_BRUTE]: 3, [Z_FLYER]: 4, [Z_SHIELD]: 6, [Z_BLOATER]: 7, [Z_ROPECRAB]: 8,
  [Z_SPITTER]: 9, [Z_SPRING]: 9, [Z_SAPPER]: 11, [Z_MEDIC]: 13, [Z_JAMPUMP]: 14, [Z_ARMORED]: 16, [Z_CANOPY]: 17, [Z_FOREMAN]: 18,
};

export function f50First(kind: number): number {
  return F50_FIRST[kind] ?? 999;
}

/** Босс волны. Каждый — один раз. temp — временная замена, пока владелец не принял новую модель (fort-bosses). */
export interface F50Boss {
  /** Наземный босс (−1 — нет) и его круг (подпись II, III …) */
  kind: number;
  tier: number;
  /** Кракен на этой волне и его круг (0 — «Кракен», 3 — «Кракен IV») */
  kraken?: number;
  /** Последняя волна забега */
  final?: boolean;
  /** Кого временно заменяет (новый босс ещё не принят) */
  temp?: string;
}

/**
 * Одна точка подключения новых боссов: когда владелец примет Пеликана-Бомбардира и Избушку, здесь меняется kind
 * (и снимается temp), остальное расписание не трогаем.
 */
export const F50_BOSSES: Readonly<Record<number, F50Boss>> = {
  5: { kind: Z_BOSS, tier: 0 },
  10: { kind: Z_RAM, tier: 0 },
  15: { kind: Z_GOLEM, tier: 0 },
  20: { kind: Z_PUMPKIN, tier: 0 },
  25: { kind: -1, tier: 0, kraken: 0 },
  28: { kind: Z_CRABCRANE, tier: 0 },
  30: { kind: Z_WEAVER, tier: 0 },
  // Пеликан-Бомбардир и Избушка приняты владельцем 01.11 («релизь их тоже»), модели — client/fort/bosses/
  35: { kind: Z_PELICAN, tier: 0 },
  40: { kind: Z_LESHY, tier: 0 },
  45: { kind: Z_MILLER, tier: 0 },
  50: { kind: Z_HUT, tier: 0, final: true },
};

export function f50Boss(w: number): F50Boss | null {
  return F50_BOSSES[w] ?? null;
}

/** Номер босса по порядку (1 — Барон на 5-й … 11 — финал): HP растёт каждые три босса, как в прежней формуле */
export function f50BossNumber(w: number): number {
  if (!F50_BOSSES[w]) return 0;
  return Object.keys(F50_BOSSES).map(Number).filter((x) => x <= w).length;
}

export const SIEGE_T = 1;
export const SIEGE_B = 2;

/** Строка плана: название, тема (вид ×3 в выборе, −1 — случайная), ручная смесь, осада, лодки, событие */
export interface F50Wave {
  title: string;
  theme?: number;
  /** Ручная смесь [вид, доля бюджета] (волны 1–15), шаркуны добирают остаток */
  mix?: ReadonlyArray<readonly [number, number]>;
  /** Осадные машины: SIEGE_T — башня, SIEGE_B — батарея (обе — разом) */
  siege?: readonly number[];
  /** Лодок десанта (у 7-й — одна с якорем) */
  boats?: number;
  anchor?: boolean;
  /** Случайное событие (метеоры, туман, лихорадка, припасы — не как прошлое) */
  event?: boolean;
  /** Роли осады сверх знакомства: все доступные по одной (33-я — «канатники») */
  roles?: readonly number[];
}

/** План Ф50-1 со страницы lab/fort-rework/waves.ts (PLAN), индекс — w − 1 */
export const F50_PLAN: readonly F50Wave[] = [
  { title: 'Первые гости', mix: [[Z_RUNNER, 0.4]] },
  { title: 'Липучки', mix: [[Z_RUNNER, 0.25], [Z_CLIMBER, 0.3]] },
  { title: 'Бугай', mix: [[Z_RUNNER, 0.15], [Z_CLIMBER, 0.15], [Z_BRUTE, 0.3]] },
  { title: 'Крылатки', mix: [[Z_RUNNER, 0.15], [Z_CLIMBER, 0.15], [Z_BRUTE, 0.1], [Z_FLYER, 0.25]] },
  { title: 'Барон Варенья', mix: [[Z_RUNNER, 0.25], [Z_CLIMBER, 0.15], [Z_FLYER, 0.2]] },
  { title: 'Стена щитов', mix: [[Z_RUNNER, 0.1], [Z_CLIMBER, 0.1], [Z_BRUTE, 0.15], [Z_SHIELD, 0.3]], siege: [SIEGE_T] },
  { title: 'Пузыри', mix: [[Z_RUNNER, 0.1], [Z_CLIMBER, 0.1], [Z_BRUTE, 0.1], [Z_FLYER, 0.1], [Z_BLOATER, 0.3]], boats: 1, anchor: true },
  { title: 'Канатник', mix: [[Z_RUNNER, 0.15], [Z_CLIMBER, 0.1], [Z_BRUTE, 0.15], [Z_FLYER, 0.1], [Z_BLOATER, 0.15]] },
  { title: 'Плевальщики', mix: [[Z_RUNNER, 0.1], [Z_CLIMBER, 0.1], [Z_BRUTE, 0.1], [Z_BLOATER, 0.1], [Z_SPITTER, 0.3]] },
  { title: 'Таран', mix: [[Z_RUNNER, 0.35], [Z_CLIMBER, 0.15], [Z_FLYER, 0.1]] },
  { title: 'Подрывники', mix: [[Z_RUNNER, 0.1], [Z_CLIMBER, 0.1], [Z_BRUTE, 0.1], [Z_SHIELD, 0.1], [Z_SAPPER, 0.3]], boats: 1 },
  { title: 'Полевая батарея', mix: [[Z_RUNNER, 0.15], [Z_CLIMBER, 0.1], [Z_BRUTE, 0.15], [Z_FLYER, 0.1], [Z_BLOATER, 0.1], [Z_SPITTER, 0.1]], siege: [SIEGE_B], event: true },
  { title: 'Лекари', mix: [[Z_RUNNER, 0.1], [Z_BRUTE, 0.15], [Z_SHIELD, 0.15], [Z_MEDIC, 0.3]] },
  { title: 'Смоливщик', mix: [[Z_RUNNER, 0.15], [Z_CLIMBER, 0.1], [Z_BRUTE, 0.1], [Z_FLYER, 0.1], [Z_SPITTER, 0.1], [Z_SAPPER, 0.1]], boats: 1 },
  { title: 'Валун', mix: [[Z_RUNNER, 0.15], [Z_BRUTE, 0.25], [Z_SHIELD, 0.25]] },
  { title: 'Чугунная', theme: Z_ARMORED },
  { title: 'Зонтики', event: true },
  { title: 'Старшина осады', boats: 1 },
  { title: 'Экзамен главы', siege: [SIEGE_T, SIEGE_B] },
  { title: 'Король-Тыква' },
  { title: 'Море — второй фронт', boats: 2 },
  { title: 'Натиск', event: true },
  { title: 'Тяжёлая', theme: Z_BRUTE, siege: [SIEGE_T] },
  { title: 'Через стены', theme: Z_CLIMBER, boats: 2 },
  { title: 'Кракен' },
  { title: 'Шустрая', theme: Z_RUNNER },
  { title: 'Подрыв', theme: Z_SAPPER, event: true },
  { title: 'Краб-Кран', boats: 1 },
  { title: 'Обстрел', theme: Z_SPITTER, siege: [SIEGE_B] },
  { title: 'Ткачиха', theme: Z_MEDIC },
  { title: 'Налёт', theme: Z_FLYER },
  { title: 'Стена щитов', theme: Z_SHIELD, event: true },
  { title: 'Канатники', roles: [Z_ROPECRAB] },
  { title: 'Налёт и пузыри', theme: Z_BLOATER, boats: 3 },
  { title: 'Пеликан-Бомбардир', theme: Z_FLYER },
  { title: 'Чугунная', theme: Z_ARMORED, event: true },
  { title: 'Тяжёлая', theme: Z_BRUTE, siege: [SIEGE_T, SIEGE_B] },
  { title: 'Через стены', theme: Z_CLIMBER, boats: 3 },
  { title: 'Натиск', event: true },
  { title: 'Леший', theme: Z_SHIELD },
  { title: 'Всё вперемешку', siege: [SIEGE_T], boats: 2 },
  { title: 'Элита', event: true },
  { title: 'Подрыв', theme: Z_SAPPER, siege: [SIEGE_B] },
  { title: 'Налёт', theme: Z_FLYER, boats: 3 },
  { title: 'Мельничиха', theme: Z_SPITTER },
  { title: 'Парад' },
  { title: 'Тяжёлая', theme: Z_BRUTE, event: true },
  { title: 'Через стены', theme: Z_CLIMBER, siege: [SIEGE_T, SIEGE_B] },
  { title: 'Канун', boats: 4 },
  { title: 'Финал' },
];

export function f50Wave(w: number): F50Wave {
  return F50_PLAN[Math.min(F50_LAST_WAVE, Math.max(1, Math.floor(w))) - 1];
}

/** Жетоны за волну: 7 + ⌊w/5⌋, босс (и летающий) +10, Кракен +25, финал +40 */
export function f50WaveTokens(w: number): number {
  const b = f50Boss(w);
  return 7 + Math.floor(w / 5) + (b?.final ? 40 : b?.kraken !== undefined ? 25 : b ? 10 : 0);
}

/** Передышка после волны w, с: перед Кракеном и финалом 30, после босса и Кракена 20, иначе 15 */
export function f50BreakSeconds(w: number): number {
  const next = f50Boss(w + 1);
  if (next && (next.kraken !== undefined || next.final)) return 30;
  return f50Boss(w) ? 20 : 15;
}

// ------------------------------------------------------------ С-1: участки стены

/**
 * Участок стены. Сквозной (passage) — в пролом (hp = 0) мобы идут ко кристаллу, хода по стене нет. Бастионы и
 * морской центр насквозь не пробить (за ними бастион или терраса): у них «обвал» — рушатся бруствер и зубцы,
 * башня молчит, мобы не проходят.
 */
export interface WallSection {
  id: string;
  name: string;
  /** passage — дыра до земли; collapse — обвал бруствера и зубцов */
  kind: 'passage' | 'collapse';
  /** Дыра (или обвал) по земле: x0…x1, z0…z1; по высоте — от земли (passage) или от хода по стене (collapse) до верха зубцов */
  hole: readonly [number, number, number, number];
  /** Наружу: нормаль грани, где ломают (камни падают, тяжёлые бьют), и её координата */
  nx: number;
  nz: number;
  face: number;
  /** Участок вдоль стены: какие точки ему принадлежат (места башен, удары) — x0…x1, z0…z1 */
  span: readonly [number, number, number, number];
  /** Множитель прочности: бастион ×1,5, морская стена ×0,85 */
  mul: number;
  /** Место башни на участке (TOWER_SPOTS), −1 — нет */
  tower: number;
  /** Штабель камней (К-1) на ходу по стене */
  stack: readonly [number, number, number];
  /** Сторона для катапульты и Тарана: −1 — запад, 1 — восток, 0 — середина */
  side: number;
}

export const WALL_SECTIONS: readonly WallSection[] = [
  { id: 'nw', name: 'Север, запад', kind: 'passage', hole: [-14, -10, -16, -13], nx: 0, nz: -1, face: -16, span: [-15, -6, -16, -13], mul: 1, tower: -1, stack: [-12, 3.4, -15], side: -1 },
  { id: 'ne', name: 'Север, восток', kind: 'passage', hole: [10, 14, -16, -13], nx: 0, nz: -1, face: -16, span: [6, 15, -16, -13], mul: 1, tower: -1, stack: [12, 3.4, -15], side: 1 },
  { id: 'bw', name: 'Бастион СЗ', kind: 'collapse', hole: [-21, -15, -19, -13], nx: 0, nz: -1, face: -19, span: [-21, -15, -19, -13], mul: 1.5, tower: 2, stack: [-16.4, 3.4, -18.1], side: -1 },
  { id: 'be', name: 'Бастион СВ', kind: 'collapse', hole: [15, 21, -19, -13], nx: 0, nz: -1, face: -19, span: [15, 21, -19, -13], mul: 1.5, tower: 3, stack: [16.4, 3.4, -18.1], side: 1 },
  { id: 'w1', name: 'Запад, север', kind: 'passage', hole: [-18, -15, -5.4, -2.4], nx: -1, nz: 0, face: -18, span: [-18, -15, -13, -1], mul: 1, tower: 4, stack: [-17, 3.4, -3.9], side: -1 },
  { id: 'w2', name: 'Запад, юг', kind: 'passage', hole: [-18, -15, 5, 9], nx: -1, nz: 0, face: -18, span: [-18, -15, -1, 11], mul: 1, tower: -1, stack: [-17, 3.4, 7], side: -1 },
  { id: 'e1', name: 'Восток, север', kind: 'passage', hole: [15, 18, -5.4, -2.4], nx: 1, nz: 0, face: 18, span: [15, 18, -13, -1], mul: 1, tower: 5, stack: [17, 3.4, -3.9], side: 1 },
  { id: 'e2', name: 'Восток, юг', kind: 'passage', hole: [15, 18, 5, 9], nx: 1, nz: 0, face: 18, span: [15, 18, -1, 11], mul: 1, tower: -1, stack: [17, 3.4, 7], side: 1 },
  { id: 'sw', name: 'Море, запад', kind: 'passage', hole: [-14.5, -10.5, 11, 14], nx: 0, nz: 1, face: 14, span: [-18, -6, 11, 14], mul: 0.85, tower: 6, stack: [-12.5, 3.4, 13], side: -1 },
  { id: 'sc', name: 'Море, центр', kind: 'collapse', hole: [-2, 2, 11, 14], nx: 0, nz: 1, face: 14, span: [-6, 6, 11, 14], mul: 0.85, tower: -1, stack: [0, 3.4, 13], side: 0 },
  { id: 'se', name: 'Море, восток', kind: 'passage', hole: [10.5, 14.5, 11, 14], nx: 0, nz: 1, face: 14, span: [6, 18, 11, 14], mul: 0.85, tower: 7, stack: [12.5, 3.4, 13], side: 1 },
];
export const WALL_COUNT = WALL_SECTIONS.length;
/** Северные цели осадных атак: вместе с бастионами или только сквозные участки. */
export const WALL_NORTH = WALL_SECTIONS.flatMap((s, sec) => s.nz === -1 ? [sec] : []);
export const WALL_NORTH_PASSAGES = WALL_NORTH.filter((sec) => WALL_SECTIONS[sec].kind === 'passage');

/** Прочность участка на волне w: 3000 · множитель · (1 + 0,03·(w − 1)) — 3000 на 1-й, ≈5200 на 25-й, ≈7400 на 50-й */
export const WALL_BASE_HP = 3000;
export function wallMaxHp(sec: number, w: number): number {
  return Math.round(WALL_BASE_HP * (WALL_SECTIONS[sec]?.mul ?? 1) * (1 + 0.03 * (Math.max(1, w) - 1)));
}

export const WS_OK = 0;
export const WS_CRACK = 1;
export const WS_RUIN = 2;
export const WS_BREACH = 3;

/** Стадия по доле прочности: целая ≥ 70 %, трещины ≥ 40 %, обвал > 0, пролом 0 */
export function wallStage(hp: number, max: number): number {
  if (hp <= 0) return WS_BREACH;
  const f = hp / Math.max(1, max);
  return f >= 0.7 ? WS_OK : f >= 0.4 ? WS_CRACK : WS_RUIN;
}

/** Середина дыры по земле */
export function holeCenter(sec: number): { x: number; z: number } {
  const h = WALL_SECTIONS[sec].hole;
  return { x: (h[0] + h[1]) / 2, z: (h[2] + h[3]) / 2 };
}

/** Точка снаружи у середины дыры (тяжёлые бьют отсюда, сюда падают камни и снаряды), r — отступ от грани */
export function wallOuterPoint(sec: number, r: number): { x: number; z: number } {
  const s = WALL_SECTIONS[sec];
  const c = holeCenter(sec);
  return s.nx !== 0 ? { x: s.face + s.nx * r, z: c.z } : { x: c.x, z: s.face + s.nz * r };
}

/** Чей это участок: точка (x, z) в пределах span; −1 — ничей (ворота, надвратная башня) */
export function sectionAt(x: number, z: number): number {
  for (let i = 0; i < WALL_SECTIONS.length; i++) {
    const s = WALL_SECTIONS[i].span;
    if (x >= s[0] && x <= s[1] && z >= s[2] && z <= s[3]) return i;
  }
  return -1;
}

/** Участок, на котором стоит место башни, или −1 */
export function sectionOfTower(spot: number): number {
  return WALL_SECTIONS.findIndex((s) => s.tower === spot);
}

/** Урон по участкам (база до множителя волны, как у ворот). Мелочь стен не бьёт — только ворота. */
export const WALL_DPS_BRUTE = 30;
export const WALL_DPS_ARMORED = 12;
export const WALL_DMG = {
  ram: 600,
  rock: 450,
  quake: 200,
  baron: 250,
  pumpkin: 300,
  leshy: 350,
  crab: 500,
  battery: 700,
  meteor: 650,
  tentacle: 300,
  /** будущие боссы: Пеликан-Бомбардир (бочонок), Избушка (пинок) */
  pelican: 300,
  izba: 900,
  catapult: 500,
} as const;

/** Ремонт: E у пролома (или у повреждённого участка). Один — 5 с, вдвоём — 3 с, втроём и больше — 2,5 с. */
export const WALL_FIX_SECONDS: readonly number[] = [5, 3, 2.5];
export function wallFixTicks(workers: number, timeMul = 1): number {
  return Math.round(WALL_FIX_SECONDS[Math.min(WALL_FIX_SECONDS.length, Math.max(1, workers)) - 1] * TICK_RATE * timeMul);
}
/** Цена ремонта, золото забега (платит начавший, в конце): 60 + 5·w — 110 на 10-й, 210 на 30-й */
export function wallFixPrice(w: number, priceMul = 1): number {
  return Math.round((60 + 5 * Math.max(1, w)) * priceMul);
}
/** Итог ремонта: пролом → заплатка 40 %, повреждённый участок → +35 % (до 100 %). Чинить можно ниже 95 %. */
export const WALL_PATCH = 0.4;
export const WALL_FIX_ADD = 0.35;
export const WALL_FIX_BELOW = 0.95;
/** Откуда чинят: по земле от середины дыры, м (двор, луг или ход по стене рядом); по высоте — до верха зубцов */
export const WALL_FIX_REACH = 3.5;
export const WALL_FIX_MOVE = 0.5;

// ------------------------------------------------------------ К-1: камни со стены

export const STONES_PER_STACK = 3;
/** E у штабеля: досягаемость, м; пауза между камнями одного штабеля */
export const STONE_REACH = 1.8;
export const STONE_GAP_TICKS = Math.round(0.8 * TICK_RATE);
/** Полёт камня до земли, тиков; полоса под стеной: от грани наружу, вдоль стены в обе стороны, м */
export const STONE_FALL_TICKS = Math.round(0.55 * TICK_RATE);
export const STONE_OUT = 2;
export const STONE_HALF = 2;
/** Урон — «три шаркуна» этой волны; боссам — без брони. Тяжёлому — сорванный удар по участку, с */
export const STONE_WALKERS = 3;
export const STONE_STUN_TICKS = Math.round(1.5 * TICK_RATE);

// ------------------------------------------------------------ К-4: лагерь Барона и катапульта

/** Лагерь ставят на этих волнах (с 20-й, по одному на главу), сторона по очереди; держится до конца главы */
export const CAMP_WAVES: readonly number[] = [20, 31, 41];
export const CAMP_SPOTS: ReadonlyArray<readonly [number, number]> = [[-34, -8], [34, -8]];
export function campSide(placed: number): number {
  return CAMP_WAVES.indexOf(placed) % 2 === 0 ? -1 : 1;
}
/** Последняя волна лагеря, поставленного на волне placed: конец главы (30, 40, 50) */
export function campUntil(placed: number): number {
  return Math.min(F50_LAST_WAVE, Math.ceil((placed + 1) / 10) * 10);
}
/** Стадия сборки: 1 — рама, 2 — рычаг, 3 — готова и стреляет (с третьей волны после постановки) */
export function campStage(placed: number, w: number): number {
  return Math.min(3, Math.max(0, w - placed + 1));
}
/** Стражи лагеря: 4 одному, до 6 втроём и больше */
export const CAMP_GUARDS: readonly number[] = [Z_SHIELD, Z_BRUTE, Z_WALKER, Z_WALKER, Z_SPITTER, Z_RUNNER];
export function campGuards(defenders: number): number {
  return 4 + Math.min(2, Math.max(0, defenders - 1));
}
/** Стражи держатся у лагеря: кольцо, дальность «увидел», поводок, м */
export const CAMP_HOME_R = 5;
export const CAMP_AGGRO = 12;
export const CAMP_LEASH = 18;
/** Поджечь: E у лагеря (не дальше CAMP_BURN_R от центра), держать 3 с */
export const CAMP_BURN_R = 3;
export const CAMP_BURN_TICKS = 3 * TICK_RATE;
/** Сундук: каждому защитнику 2 × ящик припасов этой силы */
export const CAMP_CHEST_SUPPLIES = 2;
/** Катапульта: выстрел раз в 15 с (первый — через 8 с после начала волны), замах 2,5 с, полёт 2,2 с */
export const CATA_EVERY = 15 * TICK_RATE;
export const CATA_FIRST = 8 * TICK_RATE;
export const CATA_WINDUP = Math.round(2.5 * TICK_RATE);
export const CATA_FLIGHT = Math.round(2.2 * TICK_RATE);
export const CATA_PLAYER_DMG = 40;
export const CATA_PLAYER_R = 3;

// ------------------------------------------------------------ сообщения

/** {t:'use', id}: действия Ф50 (E нажата / отпущена). sec — номер участка в WALL_SECTIONS. */
export const USE_WALL_FIX = 5000;
export const USE_WALL_STOP = 5100;
export const USE_STONE = 5200;
export const USE_CAMP_BURN = 5300;
export const USE_CAMP_STOP = 5301;

/** Ремонт участка: [участок, прогресс 0…1000, тик конца при нынешнем числе работников, цена, кто платит, ...кто чинит] */
export type F50Fix = [number, number, number, number, number, ...number[]];

export interface F50Camp {
  /** −1 — запад, 1 — восток; центр лагеря */
  side: number;
  x: number;
  z: number;
  /** На какой волне поставлен, до какой стоит, стадия сборки (0…3) */
  placed: number;
  until: number;
  stage: number;
  /** Сожжён (кем) */
  burnt: boolean;
  by?: number;
  /** Поджигают: кто, тик, когда загорится */
  burn?: [number, number];
  /** Живых стражей */
  guards: number;
}

/** Состояние Ф50 — {t:'f50'}: при входе и при каждом изменении (не чаще 10 раз в секунду) */
export interface F50State {
  /** Прочность и максимум участков (целые) — порядок WALL_SECTIONS */
  hp: number[];
  max: number[];
  /** Камней в штабелях */
  stones: number[];
  /** Идущие ремонты */
  fix: F50Fix[];
  camp: F50Camp | null;
}

/**
 * События Ф50 (в {t:'fev'} вместе с остальными):
 *  ['whit', участок, x, y, z]            — удар по участку (не чаще раза в 0,35 с на участок): пыль, камешки, «бум»
 *  ['wstage', участок, стадия, кто]      — новая стадия WS_*; после ремонта — WS_* по доле, кто — чинивший (0 — урон)
 *  ['stone', участок, кто, x, z, сбил]   — камень сброшен: где упал, сколько сбил
 *  ['camp', что, a, b]                   — 0 поставлен (a — сторона), 1 новая стадия (a), 2 сожжён (a — кто, b — золото каждому),
 *                                          3 убран (конец главы), 4 поджигают (a — кто, b — тик), 5 поджог сорван (a — кто)
 *  ['cata', участок, тик выстрела, тик падения, x, y, z] — катапульта целится и бросает
 *  ['catahit', участок, x, y, z]         — камень катапульты упал
 */
export type Fort50Event =
  | ['whit', number, number, number, number]
  | ['wstage', number, number, number]
  | ['stone', number, number, number, number, number]
  | ['camp', number, number, number]
  | ['cata', number, number, number, number, number, number]
  | ['catahit', number, number, number, number];
