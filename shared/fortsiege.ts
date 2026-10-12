// Одобренная осада: серверные сроки и цели совпадают с отрисовкой. Включается FORTRESS_SIEGE=1.
import { TICK_RATE } from './constants.ts';

export const Z_ROPECRAB = 20;
export const Z_JAMPUMP = 21;
export const Z_CANOPY = 22;
export const Z_FOREMAN = 23;
export const Z_CRABCRANE = 24;
export const Z_MILLER = 25;
export const Z_SIEGE_TOWER = 26;
export const Z_BATTERY = 27;
export const Z_SPRING = 28;

export const ZS_SIEGE_APPROACH = 49;
export const ZS_SIEGE_DEPLOY = 50;
export const ZS_SIEGE_WINDUP = 51;
export const ZS_SIEGE_ACTION = 52;
export const ZS_SIEGE_OPEN = 53;
export const ZS_SIEGE_SPENT = 54;
export const ZS_BOARD = 55;
/** Только вид летящего снаряда/вспышки, не состояние моба. */
export const ZS_SIEGE_GLOB = 56;
export const ZS_SIEGE_SHELL = 57;
export const SIEGE_TIMED = [ZS_SIEGE_DEPLOY, ZS_SIEGE_WINDUP, ZS_SIEGE_ACTION, ZS_SIEGE_OPEN, ZS_BOARD] as const;

export const SIEGE_NONE = 0;
export const SIEGE_TOWER = 1;
export const SIEGE_BATTERY = 2;
/** Не дополнительный пул: устройства и их пассажиры занимают обычные 60 мест. */
export const SIEGE_SLOT_RESERVE = 6;
export const SIEGE_DEADLINE_GAP = 2.5 * TICK_RATE;
export const SIEGE_DEPLOY_TICKS = 4 * TICK_RATE;
export const SIEGE_ACTIVE_TICKS = 8 * TICK_RATE;
export const SIEGE_OPEN_TICKS = 3 * TICK_RATE;
export const BATTERY_DEPLOY_TICKS = 6 * TICK_RATE;
export const BATTERY_WARN_TICKS = 2.4 * TICK_RATE;
export const BATTERY_FLIGHT_TICKS = 1.2 * TICK_RATE;
export const BATTERY_GATE_DAMAGE = 360;
export const BATTERY_CRYSTAL_DAMAGE = 200;
export const BOARD_TICKS = 1.2 * TICK_RATE;
export const BOARD_EVERY = 1.2 * TICK_RATE;
export const BOAT_ANCHOR_FLAG = 128;
export const SPRING_DEPLOY_TICKS = 2.4 * TICK_RATE;
export const PUMP_WARN_TICKS = 1.8 * TICK_RATE;
export const PUMP_POOL_TICKS = 6 * TICK_RATE;
export const PUMP_POOL_RADIUS = 2;
export const PUMP_POOL_SLOW = 0.8;
export const CANOPY_REDUCTION = 0.65;
export const CANOPY_OPEN_TICKS = 4 * TICK_RATE;
/** R2 phase lengths; actual start/end are sent in siegephase, including interrupted/restarted phases. */
export const SIEGE_BOSS_DEPLOY_TICKS = 2.4 * TICK_RATE;
export const SIEGE_BOSS_WINDUP_TICKS = 1.8 * TICK_RATE;
export const CRAB_ACTION_TICKS = TICK_RATE;
export const CRAB_IMPACT_REMAINING = .5 * TICK_RATE;
export const MILLER_GUST_TICKS = 3 * TICK_RATE;
export const PUMP_ACTION_TICKS = TICK_RATE;
export const PUMP_FLIGHT_TICKS = .5 * TICK_RATE;
export const REPAIR_WORK_TICKS = 4 * TICK_RATE;
export const REPAIR_COOLDOWN_TICKS = 8 * TICK_RATE;

export const SIEGE_METEOR_COUNT = 6;
export const SIEGE_METEOR_FLIGHT = 6 * TICK_RATE;
export const SIEGE_METEOR_GAP = 7.5 * TICK_RATE;
export const SIEGE_METEOR_RADIUS = 11;
export const SIEGE_METEOR_BODY = 2.2;
export const SIEGE_METEOR_PLAYER = 75;
export const SIEGE_METEOR_GATE = 650;
export const SIEGE_METEOR_CRYSTAL = 420;

/** Число попаданий одной очередью выстрела (дробины не считаются отдельными выстрелами). */
export function meteorHits(humans: number): number { return 8 * Math.max(1, Math.min(6, Math.floor(humans))); }
/** Priority bodies share the wave budget, but gain personal durability in a larger team. */
export function siegeBodyMul(kind: number, humans: number): number {
  return (kind >= Z_ROPECRAB && kind <= Z_FOREMAN || kind >= Z_SIEGE_TOWER && kind <= Z_SPRING)
    ? 1 + .5 * (Math.max(1, Math.min(6, humans)) - 1) : 1;
}
export function siegeBodyTier(wave: number): number { return wave >= 70 ? 2 : wave >= 30 ? 1 : 0; }
/** Every fifth wave; the 25th/50th/... remain Kraken encounters. All eight land bosses appear by45. */
export function siegeBossNumber(wave: number): number {
  return wave > 0 && wave % 5 === 0 && wave % 25 !== 0 ? Math.floor(wave / 5) - Math.floor(wave / 25) : 0;
}
export function urgentSlots(humans: number): number { return humans >= 4 ? 4 : humans >= 2 ? 3 : 2; }
export function siegePassengerLimit(humans: number): number { return humans >= 4 ? 6 : humans >= 2 ? 4 : 3; }
export function newBossKind(wave: number): number {
  const n = siegeBossNumber(wave);
  return n > 0 && n % 8 === 7 ? Z_CRABCRANE : n > 0 && n % 8 === 0 ? Z_MILLER : -1;
}

export interface SiegePhaseClock {
  id: number;
  kind: number;
  state: number;
  /** Server ticks. end=0 is an untimed phase. */
  start: number;
  end: number;
}

/** Nominal duration only for the short snapshot-before-event fallback; siegephase is authoritative. */
export function siegePhaseTicks(kind: number, state: number): number {
  if (state === ZS_BOARD) return BOARD_TICKS;
  if (state === ZS_SIEGE_DEPLOY) return kind === Z_BATTERY ? BATTERY_DEPLOY_TICKS
    : kind === Z_CRABCRANE || kind === Z_MILLER ? SIEGE_BOSS_DEPLOY_TICKS
      : kind === Z_SPRING ? SPRING_DEPLOY_TICKS : SIEGE_DEPLOY_TICKS;
  if (state === ZS_SIEGE_WINDUP) return kind === Z_BATTERY || kind === Z_FOREMAN ? BATTERY_WARN_TICKS
    : kind === Z_JAMPUMP ? PUMP_WARN_TICKS : SIEGE_BOSS_WINDUP_TICKS;
  if (state === ZS_SIEGE_ACTION) return kind === Z_MILLER ? MILLER_GUST_TICKS
    : kind === Z_CRABCRANE ? CRAB_ACTION_TICKS : kind === Z_JAMPUMP ? PUMP_ACTION_TICKS
      : kind === Z_CANOPY ? 0 : kind === Z_SIEGE_TOWER || kind === Z_ROPECRAB || kind === Z_SPRING ? SIEGE_ACTIVE_TICKS : BATTERY_FLIGHT_TICKS;
  if (state === ZS_SIEGE_OPEN) return kind === Z_CANOPY ? CANOPY_OPEN_TICKS : SIEGE_OPEN_TICKS;
  return 0;
}

export type SiegeEvent =
  /** ID, kind (available before the first binary snapshot), state, authoritative start/end server ticks. */
  | ['siegephase', number, number, number, number, number]
  /** Номер моба, часть (0 механизм/мост, 1 канат, 2 навес, 3 опора/муфта), осталось, всего, состояние. */
  | ['siege', number, number, number, number, number]
  /** Снять предупреждение прерванной атаки. */
  | ['warnend', number]
  /** ID, фаза, откуда, куда, начало/конец, осталось попаданий, исходная прочность (для позднего входа). */
  | ['meteor', number, number, number, number, number, number, number, number, number, number, number, number]
  /** Игрок, действие, тик завершения, тик конца общей паузы, статус (0 работа, 1 готово, 2 отмена, 3 занято). */
  | ['repair', number, number, number, number, number]
  /** Лужа моба: ID, центр, радиус, тик исчезновения (0 — убрать), тип источника (смола/мука). */
  | ['siegepool', number, number, number, number, number, number, number?];
