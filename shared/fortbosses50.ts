// Боссы «Крепости 50» со стенда lab/fort-rework/bosses.html (владелец 01.11: «релизь их тоже»): Пеликан-Бомбардир —
// 35-я волна, Избушка — финал 50-й. Числа, общие для сервера (server/fort/boss-pelican.ts, boss-hut.ts), клиента (метки,
// клипы моделей client/fort/bosses/) и тестов. Виды — fortkinds.ts (Z_PELICAN, Z_HUT). Длины состояний равны длинам
// клипов стенда: клиент берёт секунду клипа из отсчёта снимка (wind), удар — в ту же секунду, что на стенде.
// Урон людям, воротам, кристаллу и стенам — × урон волны (horde.dmgOf), как у остальных боссов.
import { TICK_RATE } from './constants.ts';

const S = (s: number): number => Math.round(s * TICK_RATE);

// ------------------------------------------------------------ состояния (номера после осады, fortsiege.ts)

/** Избушка: встаёт с земли, пинок по участку стены, печные бомбы, топот, смена фазы, «наседка» на стене */
export const ZS_HUT_APPEAR = 58;
export const ZS_HUT_KICK = 59;
export const ZS_HUT_BOMBS = 60;
export const ZS_HUT_STOMP = 61;
export const ZS_HUT_PHASE = 62;
export const ZS_HUT_NEST = 63;
/** Пеликан: кружит, бомбёжка хода стены, пике за игроком, подбит, садится на бастион, клюёт башню, ветер крыльями, сбит, пешком, щёлкает клювом */
export const ZS_PL_FLY = 64;
export const ZS_PL_BOMB = 65;
export const ZS_PL_DIVE = 66;
export const ZS_PL_PHASE = 67;
export const ZS_PL_PERCH = 68;
export const ZS_PL_PECK = 69;
export const ZS_PL_GUST = 70;
export const ZS_PL_CRASH = 71;
export const ZS_PL_GROUND = 72;
export const ZS_PL_SNAP = 73;
/** Бочка (бомба Пеликана, печная бомба и яйцо Избушки) — только в метках, бросках и вспышках */
export const ZS_F50_BARREL = 74;

// ------------------------------------------------------------ Избушка

/** Фазы по здоровью: 2-я — ниже 2/3, 3-я (ярость) — ниже 1/3 */
export const HUT_PHASE2 = 2 / 3;
export const HUT_PHASE3 = 1 / 3;
/** Стоит перед стеной: корень на столько метров от наружной грани (пинок достаёт до грани) */
export const HUT_REACH = 4;
/** Клипы, тиков: появление, пинок (удар на 1,8 с), бомбы, топот (удар на 2,3 с), смена фазы, наседка */
export const HUT_APPEAR_TICKS = S(3.4);
export const HUT_KICK_TICKS = S(3.0);
export const HUT_KICK_HIT = S(1.8);
export const HUT_BOMBS_TICKS = S(3.2);
export const HUT_STOMP_TICKS = S(3.4);
export const HUT_STOMP_HIT = S(2.3);
export const HUT_PHASE_TICKS = S(2.6);
export const HUT_NEST_TICKS = S(9.0);
/** Наседка: села на стену (удар), несёт яйца, сидит с открытой дверью (бить можно), спрыгивает */
export const HUT_NEST_LAND = S(2.6);
export const HUT_NEST_EGGS: readonly number[] = [S(3.7), S(5.1), S(6.5)];
export const HUT_NEST_OPEN0 = S(2.6);
export const HUT_NEST_OPEN1 = S(7.8);
/** Печные бомбы: вылет из трубы (тики клипа) в 1-й фазе и со 2-й, полёт */
export const HUT_BOMBS1: readonly number[] = [S(1.8), S(2.15), S(2.5)];
export const HUT_BOMBS2: readonly number[] = [S(1.8), S(1.95), S(2.1), S(2.25), S(2.4)];
export const HUT_BOMB_FLIGHT = S(0.7);
export const HUT_BOMB_GAP = 2.5;
/** Пинок: метка на ходу стены над участком, урон людям, участку стены */
export const HUT_KICK_R = 3;
export const HUT_KICK_DMG = 35;
export const HUT_KICK_WALL = 900;
/** Бомбы: радиус, урон людям, участку под бомбой, кристаллу (людей нет) */
export const HUT_BOMB_R = 2;
export const HUT_BOMB_DMG = 24;
export const HUT_BOMB_WALL = 200;
export const HUT_BOMB_CRYSTAL = 60;
/** Топот: круг вокруг неё (по земле и по стене), урон (кто в прыжке — цел), воротам и стене; толчок со стены во двор, м */
export const HUT_STOMP_R = 9;
export const HUT_STOMP_DMG = 30;
export const HUT_STOMP_GATE = 180;
export const HUT_STOMP_WALL = 300;
export const HUT_STOMP_PUSH = 2;
/** Наседка: прыжок вперёд и вверх (как на стенде), метка посадки, урон людям и участку; яйца — радиус, урон, кристаллу */
export const NEST_DZ = 6.2;
export const NEST_R = 4;
export const NEST_DMG = 40;
export const NEST_WALL = 1350;
export const EGG_R = 2.5;
export const EGG_DMG = 28;
export const EGG_CRYSTAL = 110;
export const EGG_FLIGHT = S(1.0);

/** Сидит на стене — доля подъёма 0…1 по тику клипа наседки (как поза стенда: прыжок 1,8–2,6 с, обратно 7,8–8,7 с) */
export function nestOnWall(tick: number): number {
  const T = tick / TICK_RATE;
  return smooth(1.8, 2.6, T) * (1 - smooth(7.8, 8.7, T));
}

// ------------------------------------------------------------ Пеликан-Бомбардир

/** Фазы: 2-я (подбит, ниже, садится на бастион) — ниже 60 %, 3-я (сбит, пешком, ярость) — ниже 25 % */
export const PL_PHASE2 = 0.6;
export const PL_PHASE3 = 0.25;
/** Высота полёта по фазам, м; круг над северной стеной: центр, радиус; скорость в воздухе, м/с */
export const PL_FLY_Y = 13;
export const PL_FLY_Y2 = 9.5;
export const PL_CIRCLE_X = 0;
export const PL_CIRCLE_Z = -22;
export const PL_CIRCLE_R = 12;
export const PL_AIR_SPEED = 8;
/** Клипы, тиков */
export const PL_BOMB_TICKS = S(3.4);
export const PL_DIVE_TICKS = S(3.8);
export const PL_DIVE_GRAB = S(2.4);
export const PL_PHASE_TICKS = S(2.4);
export const PL_PERCH_TICKS = S(4.0);
export const PL_PERCH_TOUCH = S(1.3);
export const PL_PECK_TICKS = S(2.2);
export const PL_PECK_HIT = S(1.2);
export const PL_GUST_TICKS = S(3.2);
export const PL_GUST_HIT = S(1.8);
export const PL_CRASH_TICKS = S(3.2);
export const PL_CRASH_TOUCH = S(1.15);
export const PL_SNAP_TICKS = S(2.4);
export const PL_SNAP_HIT = S(1.2);
/** Бомбёжка: летит вдоль хода стены на этой высоте; бочки (тики клипа), полёт бочки, шаг между метками, радиус, урон */
export const PL_BOMB_Y = 10;
export const PL_BOMBS: readonly number[] = [S(1.8), S(2.05), S(2.3), S(2.55)];
export const PL_BOMB_FLIGHT = S(0.6);
export const PL_BOMB_R = 1.6;
export const PL_BOMB_DMG = 24;
export const PL_BOMB_WALL = 300;
/** Пике: висит над целью (выше и снаружи), круг на человеке, захват в зоб — ближе этого; урон при захвате */
export const PL_HOVER_Y = 12.5;
export const PL_GRAB_R = 1.8;
export const PL_GRAB_DMG = 20;
/** В зобе: выплюнет на стену, когда по нему наберут столько доли HP, иначе — в конце окна */
export const PL_SPIT_FRAC = 0.02;
/** Окно после пике: висит низко у стены */
export const PL_OPEN_Y = 7.2;
/** Насест: зубцы бастионов (x — запад −, восток +), клюёт башню бастиона (место TOWER_SPOTS 2 и 3) */
export const PL_PERCH_X = 17.2;
export const PL_PERCH_Y = 4.6;
export const PL_PERCH_Z = -18.7;
export const PL_PECK_R = 1.6;
export const PL_PECK_DMG = 30;
export const PL_PECK_WALL = 600;
/** Ветер: полоса вдоль хода стены от насеста (длина, ширина), урон, толчок вдоль стены, м */
export const PL_GUST_LEN = 10;
export const PL_GUST_W = 2.6;
export const PL_GUST_DMG = 12;
export const PL_GUST_PUSH = 2;
/** Сбит: падает перед северной стеной (z), ходит пешком; щелчок по стене и воротам — метка, урон */
export const PL_GROUND_Z = -20.5;
export const PL_POST_X = 9;
export const PL_SNAP_R = 2.5;
export const PL_SNAP_DMG = 30;
export const PL_SNAP_WALL = 300;
export const PL_SNAP_CRYSTAL = 85;
/** Во дворе (ворота пали) стоит здесь и щёлкает по кристаллу */
export const PL_IN_Z = -1.2;

// ------------------------------------------------------------ снимок и метки

/** Состояния, у которых в снимке есть отсчёт и цель (fortnet.ts, через NEW_BOSS_TIMED) */
export const F50_BOSS_TIMED: readonly number[] = [
  ZS_HUT_APPEAR, ZS_HUT_KICK, ZS_HUT_BOMBS, ZS_HUT_STOMP, ZS_HUT_PHASE, ZS_HUT_NEST,
  ZS_PL_BOMB, ZS_PL_DIVE, ZS_PL_PHASE, ZS_PL_PERCH, ZS_PL_PECK, ZS_PL_GUST, ZS_PL_CRASH, ZS_PL_SNAP,
];

/** Полная длина состояния, тиков (клиент: секунда клипа = (длина − отсчёт) / TICK_RATE); 0 — не отсчётное */
export function f50BossTicks(state: number): number {
  switch (state) {
    case ZS_HUT_APPEAR: return HUT_APPEAR_TICKS;
    case ZS_HUT_KICK: return HUT_KICK_TICKS;
    case ZS_HUT_BOMBS: return HUT_BOMBS_TICKS;
    case ZS_HUT_STOMP: return HUT_STOMP_TICKS;
    case ZS_HUT_PHASE: return HUT_PHASE_TICKS;
    case ZS_HUT_NEST: return HUT_NEST_TICKS;
    case ZS_PL_BOMB: return PL_BOMB_TICKS;
    case ZS_PL_DIVE: return PL_DIVE_TICKS;
    case ZS_PL_PHASE: return PL_PHASE_TICKS;
    case ZS_PL_PERCH: return PL_PERCH_TICKS;
    case ZS_PL_PECK: return PL_PECK_TICKS;
    case ZS_PL_GUST: return PL_GUST_TICKS;
    case ZS_PL_CRASH: return PL_CRASH_TICKS;
    case ZS_PL_SNAP: return PL_SNAP_TICKS;
    default: return 0;
  }
}

/** Метка в снимке: радиус и сколько тиков от конца состояния она уже не нужна (удар прошёл) — для signals.ts */
export function f50BossMark(state: number): { r: number; hitLeft: number } | null {
  switch (state) {
    case ZS_HUT_KICK: return { r: HUT_KICK_R, hitLeft: HUT_KICK_TICKS - HUT_KICK_HIT };
    case ZS_HUT_STOMP: return { r: HUT_STOMP_R, hitLeft: HUT_STOMP_TICKS - HUT_STOMP_HIT };
    case ZS_HUT_NEST: return { r: NEST_R, hitLeft: HUT_NEST_TICKS - HUT_NEST_LAND };
    case ZS_PL_DIVE: return { r: PL_GRAB_R, hitLeft: PL_DIVE_TICKS - PL_DIVE_GRAB };
    case ZS_PL_PECK: return { r: PL_PECK_R, hitLeft: PL_PECK_TICKS - PL_PECK_HIT };
    case ZS_PL_SNAP: return { r: PL_SNAP_R, hitLeft: PL_SNAP_TICKS - PL_SNAP_HIT };
    default: return null;
  }
}

/** Радиус метки по состоянию для снимка (0 — нет) */
export function f50BossRadius(state: number): number {
  return f50BossMark(state)?.r ?? 0;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
