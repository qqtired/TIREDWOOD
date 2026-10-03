// «Fight Club» — бой на кулаках в подвале кафе «Чайка»: режимы, числа ударов, ринг и гаснущий свет, раунды,
// жетоны, вход на набережной и типы сообщений. Общее для сервера и клиента.
// Дизайн — docs/superpowers/specs/2026-10-02-fight-club-design.md; шаг бойца — shared/fightsim.ts.
import { TICK_RATE } from './constants.ts';
import type { Outfit } from './outfit.ts';

export type FcMode = 'duel' | 'team' | 'ffa';
export const FC_MODES: readonly FcMode[] = ['duel', 'team', 'ffa'];
export const FC_MODE_NAME: Readonly<Record<FcMode, string>> = { duel: '1 на 1', team: '2 на 2', ffa: 'каждый за себя' };
/** Бойцов в бою: остальные из круга спускаются зрителями */
export const FC_FIGHTERS: Readonly<Record<FcMode, number>> = { duel: 2, team: 4, ffa: 8 };
/** Боты добирают бойцов до стольких */
export const FC_FILL: Readonly<Record<FcMode, number>> = { duel: 2, team: 4, ffa: 4 };
/** Людей в подвале (бойцы и зрители) */
export const FC_CAPACITY = 16;

// ---------------------------------------------------------------- вход на набережной

/** Приямок в южной стене кафе «Чайка» (стена z = 4): середина по x, ширина проёма, глубина внутрь кафе */
export const FC_DOOR = { x: 28.1, z: 4, w: 1.5, depth: 2.6 } as const;
/** Круг мелом перед дверью: кто в нём — в следующий бой */
export const FC_CIRCLE = { x: 28.1, z: 5.75, r: 1.45 } as const;
/** Где появляется вернувшийся из подвала: рядом с кругом (не в нём), лицом к двери */
export const FC_SPAWN = { x: 25.3, y: 0, z: 5.7, yaw: -Math.PI / 2 } as const;
/** Отсчёт у круга; круг полон для режима — короче */
export const FC_COUNT_TICKS = 15 * TICK_RATE;
export const FC_COUNT_FULL_TICKS = 5 * TICK_RATE;
/** Кто в круге — проверяем раз в столько тиков */
export const FC_CHECK_EVERY = 6;

// ---------------------------------------------------------------- подвал и ринг

/** Комната: x, z в −FC_ROOM…FC_ROOM, потолок FC_CEIL */
export const FC_ROOM = 12;
export const FC_CEIL = 4.2;

/** Радиус ринга (до края толпы): у дуэли теснее, у свалки — шире с каждым бойцом */
export function ringRadius(mode: FcMode, fighters: number): number {
  if (mode === 'duel') return 5;
  if (mode === 'team') return 6;
  return Math.min(7.6, 4.4 + 0.4 * fighters);
}

export interface Spot {
  x: number;
  z: number;
  yaw: number;
}

/** Курс, глядя из (x, z) в центр ринга (yaw = 0 смотрит в −Z) */
function yawToCenter(x: number, z: number): number {
  return Math.atan2(x, z);
}

/**
 * Углы перед раундом: в дуэли — друг напротив друга, команды — по двое с двух сторон (team: 0, 1, 0, 1…),
 * в свалке — по кругу. i — номер бойца, n — сколько их.
 */
export function cornerSpot(mode: FcMode, i: number, n: number, R: number): Spot {
  if (mode === 'ffa') {
    const a = (i / Math.max(1, n)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.sin(a) * R * 0.62;
    const z = Math.cos(a) * R * 0.62;
    return { x, z, yaw: yawToCenter(x, z) };
  }
  const side = i % 2 === 0 ? -1 : 1;
  const x = side * R * 0.55;
  const z = mode === 'team' ? (Math.floor(i / 2) === 0 ? -1.1 : 1.1) : 0;
  return { x, z, yaw: yawToCenter(x, z) };
}

/** Мест в первом ряду толпы для настоящих зрителей */
export const FC_CROWD_SLOTS = 16;

/** Место зрителя в первом ряду толпы: сразу за краем ринга, лицом к центру */
export function crowdSpot(slot: number, R: number): Spot {
  const a = ((slot % FC_CROWD_SLOTS) + 0.5) * ((Math.PI * 2) / FC_CROWD_SLOTS) + 0.19;
  const r = R + 0.75;
  const x = Math.sin(a) * r;
  const z = Math.cos(a) * r;
  return { x, z, yaw: yawToCenter(x, z) };
}

/** Влетел в толпу быстрее — толпа отпихивает обратно с подбросом */
export const FC_SHOVE_SPEED = 4;
export const FC_SHOVE_UP = 3;

// ---------------------------------------------------------------- свет: лампы гаснут по одной

/** Радиус света после ступени k (доля от ринга); после последней — FC_ZONE_MIN */
export const FC_ZONE_K: readonly number[] = [1, 0.74, 0.5, 0.3];
export const FC_ZONE_MIN = 1.4;
export const FC_ZONE_STAGES = 4;
/** С какой секунды раунда гаснет свет: в дуэли — «внезапная смерть», в свалке — сразу после разминки */
export const FC_ZONE_START_DUEL = 35 * TICK_RATE;
export const FC_ZONE_START_FFA = 20 * TICK_RATE;
/** Лампы у края мигают, потом свет сужается, потом держится */
export const FC_ZONE_WARN = 2 * TICK_RATE;
export const FC_ZONE_SHRINK = 3 * TICK_RATE;
export const FC_ZONE_HOLD_DUEL = 10 * TICK_RATE;
export const FC_ZONE_HOLD_FFA = 12 * TICK_RATE;
/** Урон в темноте, HP в секунду — по номеру ступени (1…4) */
export const FC_DARK_DPS: readonly number[] = [0, 4, 6, 9, 12];

export interface Zone {
  /** Радиус света сейчас */
  r: number;
  /** Сколько ступеней уже начали сужаться (0 — светло везде): по ней урон в темноте */
  stage: number;
  /** Лампы у края мигают — сейчас начнут гаснуть */
  warn: boolean;
  /** Сужение этой ступени: с какого радиуса и до какого */
  from: number;
  to: number;
}

export function makeZone(r = 0): Zone {
  return { r, stage: 0, warn: false, from: r, to: r };
}

/** Радиус света после k ступеней на ринге радиуса R. */
export function zoneLevel(R: number, k: number): number {
  if (k <= 0) return R;
  if (k >= FC_ZONE_STAGES) return Math.min(R, FC_ZONE_MIN);
  return Math.max(FC_ZONE_MIN, R * FC_ZONE_K[k]);
}

/** Свет через t тиков после начала раунда. */
export function zoneAt(R: number, ffa: boolean, t: number, out: Zone): Zone {
  const start = ffa ? FC_ZONE_START_FFA : FC_ZONE_START_DUEL;
  const hold = ffa ? FC_ZONE_HOLD_FFA : FC_ZONE_HOLD_DUEL;
  const period = FC_ZONE_WARN + FC_ZONE_SHRINK + hold;
  out.warn = false;
  if (t < start) {
    out.r = out.from = out.to = R;
    out.stage = 0;
    return out;
  }
  const k = Math.floor((t - start) / period) + 1;
  if (k > FC_ZONE_STAGES) {
    out.r = out.from = out.to = zoneLevel(R, FC_ZONE_STAGES);
    out.stage = FC_ZONE_STAGES;
    return out;
  }
  const u = t - start - (k - 1) * period;
  const from = zoneLevel(R, k - 1);
  const to = zoneLevel(R, k);
  out.from = from;
  out.to = to;
  if (u < FC_ZONE_WARN) {
    out.r = from;
    out.stage = k - 1;
    out.warn = true;
  } else if (u < FC_ZONE_WARN + FC_ZONE_SHRINK) {
    const f = (u - FC_ZONE_WARN) / FC_ZONE_SHRINK;
    out.r = from + (to - from) * f * f * (3 - 2 * f);
    out.stage = k;
  } else {
    out.r = to;
    out.stage = k;
  }
  return out;
}

// ---------------------------------------------------------------- удары

/** Действия бойца (act) */
export const FA_NONE = 0;
export const FA_JAB = 1;
export const FA_JAB2 = 2;
export const FA_HOOK = 3;
export const FA_HEAVY = 4;
export const FA_GRAB = 5;
/** Держит пойманного */
export const FA_HOLD = 6;
/** Только что бросил: короткий отход */
export const FA_THROW = 7;

export interface Move {
  /** Замах, удар, отход — тиков */
  w: number;
  a: number;
  r: number;
  dmg: number;
  /** Отброс по горизонтали и вверх, м/с */
  kb: number;
  up: number;
  /** Оглушение жертвы, тиков */
  stun: number;
  /** Выносливость (в десятых: полная — 1000) */
  cost: number;
  /** Досягаемость (центр — центр), м, и косинус половины сектора */
  reach: number;
  arc: number;
  /** Шаг вперёд в начале удара, м/с */
  lunge: number;
}

const deg = (d: number): number => Math.cos((d * Math.PI) / 180);
const NO_MOVE: Move = { w: 0, a: 0, r: 0, dmg: 0, kb: 0, up: 0, stun: 0, cost: 0, reach: 0, arc: 1, lunge: 0 };

/** По номеру действия */
export const MOVES: readonly Move[] = [
  NO_MOVE,
  { w: 6, a: 3, r: 9, dmg: 6, kb: 3.5, up: 1.5, stun: 12, cost: 70, reach: 1.55, arc: deg(55), lunge: 3.5 },
  { w: 6, a: 3, r: 9, dmg: 6, kb: 3.5, up: 1.5, stun: 12, cost: 70, reach: 1.55, arc: deg(55), lunge: 3.5 },
  { w: 8, a: 3, r: 14, dmg: 11, kb: 7, up: 3.5, stun: 22, cost: 100, reach: 1.6, arc: deg(55), lunge: 5 },
  { w: 22, a: 4, r: 24, dmg: 20, kb: 10, up: 5, stun: 34, cost: 220, reach: 1.75, arc: deg(45), lunge: 8 },
  { w: 5, a: 4, r: 20, dmg: 0, kb: 0, up: 0, stun: 0, cost: 140, reach: 1.3, arc: deg(40), lunge: 3 },
  NO_MOVE,
  { w: 0, a: 0, r: 16, dmg: 0, kb: 0, up: 0, stun: 0, cost: 0, reach: 0, arc: 1, lunge: 0 },
];

/** Попадание в высоту: до стольких метров между ногами */
export const FC_REACH_Y = 1.2;
/** Блок держит удары спереди в ±75° */
export const FC_BLOCK_ARC = deg(75);
/** Лёгкий в блок: урон, доля отброса, выносливость защитника, стойка (тиков без ударов) */
export const FC_BLOCK_DMG = 1;
export const FC_BLOCK_KB = 0.4;
export const FC_BLOCK_ST = 100;
export const FC_BLOCK_STUN = 8;
/** Тяжёлый в блок — пробит */
export const FC_BREAK_DMG = 6;
export const FC_BREAK_STUN = 30;
export const FC_BREAK_KB = 4;
export const FC_BREAK_ST = 200;
/** Тяжёлый можно отменить блоком (финт), пока до удара больше стольких тиков */
export const FC_FEINT_BEFORE = 4;
/** Уклон: выносливость и неуязвимость сверх длины рывка */
export const FC_DODGE_COST = 180;
export const FC_DODGE_INV_EXTRA = 4;
/** Захват: держит до FC_HOLD_MAX тиков, бросить можно не раньше FC_HOLD_MIN, вырваться — FC_MASH нажатий */
export const FC_HOLD_MAX = 90;
export const FC_HOLD_MIN = 8;
export const FC_MASH = 7;
/** Пойманный — перед тем, кто держит, на такой высоте над его ногами */
export const FC_HOLD_DIST = 0.9;
export const FC_HOLD_UP = 0.45;
export const FC_THROW = { dmg: 10, kb: 11, up: 6, stun: 36 } as const;
/** Вырвался: обоих расталкивает, державший шатается */
export const FC_ESCAPE_KB = 4;
export const FC_ESCAPE_STUN = 12;
/** Выносливость: полная, прибавка за тик (в блоке — меньше), пауза после траты */
export const FC_ST_MAX = 1000;
export const FC_ST_REGEN = 5;
export const FC_ST_REGEN_BLOCK = 2;
export const FC_ST_DELAY = 30;
export const FC_HP = 100;
/** Желейки расталкиваются, если ближе (м) */
export const FC_BODY = 0.8;

// ---------------------------------------------------------------- раунды

export const FP_INTRO = 1;
export const FP_FIGHT = 2;
export const FP_PAUSE = 3;
export const FP_END = 4;
/** Вступление (в углах, метки смены бобины), первое — дольше: все спускаются по лестнице */
export const FC_INTRO_TICKS = 3 * TICK_RATE;
export const FC_FIRST_INTRO_TICKS = 5 * TICK_RATE;
export const FC_PAUSE_TICKS = 4 * TICK_RATE;
export const FC_END_TICKS = 9 * TICK_RATE;
/** Нокаутированный лежит столько, потом встаёт в толпу */
export const FC_KO_LIE_TICKS = 2 * TICK_RATE;
/** Дуэль и 2 на 2 — до стольких побед в раундах; раундов не больше (ничьи) */
export const FC_WINS = 2;
export const FC_MAX_ROUNDS = 5;
/** Свалка не дольше (свет сужается до конца задолго до этого) */
export const FC_FFA_MAX_TICKS = 150 * TICK_RATE;

// ---------------------------------------------------------------- жетоны
// Ориентир — около 8–12 жетонов за минуту боя (бой 1 на 1 — минуты две): за победу заметно больше, чем за участие.

export const FC_FIGHT = 10;
export const FC_WIN_DUEL = 16;
export const FC_WIN_TEAM = 12;
export const FC_FFA_PLACE: readonly number[] = [10, 6, 3];
/** 2-е и 3-е место в свалке — только если бойцов столько и больше */
export const FC_FFA_PLACE_MIN = 4;
export const FC_KO = 2;
export const FC_KO_CAP = 6;

export interface FcReward {
  total: number;
  fight: number;
  win: number;
  kos: number;
  /** Место (свалка) или 1/2 (дуэль, команды) */
  place: number;
}

/** Жетоны бойцу-человеку, который дождался итогов. dmg — сколько урона нанёс: ни одного попадания — жетонов нет
 *  (иначе в «каждый за себя» платили бы за то, что простоял, пока боты выбивают друг друга). */
export function fightReward(r: { mode: FcMode; won: boolean; place: number; fighters: number; kos: number; dmg?: number }): FcReward {
  if (r.dmg !== undefined && r.dmg <= 0) return { total: 0, fight: 0, win: 0, kos: 0, place: r.place };
  let win = 0;
  if (r.mode === 'duel') win = r.won ? FC_WIN_DUEL : 0;
  else if (r.mode === 'team') win = r.won ? FC_WIN_TEAM : 0;
  else if (r.place === 1) win = FC_FFA_PLACE[0];
  else if (r.place >= 2 && r.place <= 3 && r.fighters >= FC_FFA_PLACE_MIN) win = FC_FFA_PLACE[r.place - 1];
  const kos = Math.min(FC_KO_CAP, FC_KO * Math.max(0, r.kos));
  return { total: FC_FIGHT + win + kos, fight: FC_FIGHT, win, kos, place: r.place };
}

// ---------------------------------------------------------------- сообщения

/** Круг у двери на набережной: для картона и подсказки */
export interface FcStatus {
  /** idle — пусто, count — отсчёт, fight — внизу идёт бой */
  phase: 'idle' | 'count' | 'fight';
  mode: FcMode;
  /** Секунд до спуска (count) */
  left: number;
  /** Кто в круге по очереди (count) или кто дерётся (fight) */
  names: string[];
  /** Хозяин круга: он меняет режим */
  host: string;
  /** Бой: раунд и счёт по победам (свалка — живых) */
  round: number;
  score: number[];
}

export interface FcRosterRow {
  id: number;
  level?: number;
  nick: string;
  o: Outfit;
  bot: boolean;
  /** Команда: 0 / 1 (в свалке — −1) */
  team: number;
  /** Дерётся (иначе — в толпе) */
  fighter: boolean;
  /** Место в толпе (зритель или выбывший) */
  slot: number;
  kos: number;
  wins: number;
}

export interface FcResultRow {
  id: number;
  nick: string;
  bot: boolean;
  team: number;
  /** Место (1 — победа); 0 — зритель */
  place: number;
  kos: number;
  dmg: number;
  won: boolean;
  tokens: number;
}

/** Попадания: обычное, в блок, пробил блок */
export const HIT_HIT = 1;
export const HIT_BLOCK = 2;
export const HIT_BREAK = 3;

/**
 * События боя (в fcEv): удар [кто, кого, чем, итог, урон, x, y, z], уклонился [кто], захват, бросок, вырвался
 * [кто, у кого], нокаут [кого, кто — 0: темнота], толпа отпихнула [кого], эмоция зрителя [кто, какая].
 */
export type FcEvent =
  | ['hit', number, number, number, number, number, number, number, number]
  | ['dodge', number]
  | ['whiff', number]
  | ['grab', number, number]
  | ['throw', number, number]
  | ['escape', number, number]
  | ['ko', number, number]
  | ['shove', number]
  | ['emote', number, number];

/** Кадр-вспышка — примерно раз в столько боёв */
export const FC_FLASH_EVERY = 5;
