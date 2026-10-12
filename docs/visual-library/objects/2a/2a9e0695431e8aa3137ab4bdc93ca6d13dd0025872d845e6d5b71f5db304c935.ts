// Новые боссы «Крепости» — Король-Тыква, Ткачиха, Леший (помощник fort-bosses): числа, общие для сервера (атаки,
// server/fort/boss-*.ts) и клиента (метки, подсказки, позы моделей). Виды — fortkinds.ts (Z_PUMPKIN, Z_WEAVER,
// Z_LESHY), состояния — fort.ts (ZS_PK_*, ZS_WV_*, ZS_LS_*). Урон людям, воротам и кристаллу — × урон волны и
// ступень (horde.dmgOf), как у Барона, Тарана и Валуна; ритм (метка на BOSS_WARN_TICKS, окно ZS_BOSS_OPEN, ярость на
// BOSS_RAGE) — тоже их.
import { TICK_RATE } from './constants.ts';
import {
  ZS_LS_HEAL, ZS_LS_ROOTS, ZS_LS_UNDER, ZS_PK_ROLL, ZS_PK_ROLL_WARN, ZS_PK_SPIT, ZS_PK_SUMMON, ZS_WV_BITE, ZS_WV_BROOD,
  ZS_WV_SWEEP, ZS_WV_WEB,
} from './fort.ts';

// ------------------------------------------------------------ Король-Тыква

/** Посты у северной стены: x = ±PK_POST_X, z = PK_POST_Z — между «горлом» ворот и бастионами, перекат идёт между ними */
export const PK_POST_X = 12;
export const PK_POST_Z = -22;
/** Ворота пали — стоит во дворе здесь (по оси ворот), перекат оттуда — в постамент кристалла */
export const PK_IN_Z = -6.5;
/** Тыквята (пузыри): метка вокруг Короля; стая — packSize(n), в ярости ещё PK_RAGE_ADDS, во дворе на одного меньше */
export const PK_SUMMON_R = 5;
export const PK_RAGE_ADDS = 2;
/** Перекат: м/с, радиус бегущего круга (метка), кого задело — ближе этого по ходу, урон; во дворе — урон кристаллу */
export const PK_ROLL_SPEED = 9;
export const PK_ROLL_R = 2.6;
export const PK_ROLL_HIT = 1.4;
export const PK_ROLL_DMG = 30;
export const PK_ROLL_CRYSTAL = 120;
/** Ход по северной стене: кого трясёт перекат — стоящих на ходу стены, башнях и бастионах между этими z */
export const PK_WALL_Z0 = -19.4;
export const PK_WALL_Z1 = -12.4;
/** Семечки: радиус, урон, полёт (тиков, из предупреждения); людей нет — в ворота, ворот нет — в кристалл */
export const PK_SPIT_R = 3;
export const PK_SPIT_DMG = 24;
export const PK_SPIT_FLIGHT = 36;
export const PK_SPIT_GATE = 120;
export const PK_SPIT_CRYSTAL = 70;

// ------------------------------------------------------------ Ткачиха

/** Висит на наружной грани северной стены: |x| от WV_X_IN до WV_X_OUT (между воротной башней и бастионом), корень */
export const WV_X_IN = 8.5;
export const WV_X_OUT = 12.5;
/** Корень на стене: z (тело — между ним и гранью стены −16), высота; у подножия перед подъёмом — z */
export const WV_HANG_Z = -17.1;
export const WV_HANG_Y = 0.7;
export const WV_FOOT_Z = -18.4;
/** Ползёт по стене (м/с); лезет на стену и перелезает во двор (тиков) */
export const WV_CRAWL_SPEED = 2.6;
export const WV_CLIMB_TICKS = 100;
export const WV_OVER_TICKS = 150;
/** Ярость — во дворе: перелезает здесь (z за стеной) и стоит у постамента */
export const WV_DROP_Z = -10.5;
export const WV_IN_Z = -2.2;
/** Хлёст лапами: круг на ходу стены перед ней (во дворе — вокруг неё), урон; прыжок не спасает */
export const WV_SWEEP_R = 4.5;
export const WV_SWEEP_DMG = 30;
/**
 * Паутина: радиус, урон при попадании, сколько держится, жжёт стоящих в ней раз в WV_WEB_EVERY тиков на WV_WEB_DOT,
 * рвётся за WV_WEB_HP попаданий в её круг, одновременно не больше WV_WEB_MAX; башня в паутине стреляет реже (arsenal)
 */
export const WV_WEB_R = 3;
export const WV_WEB_HIT = 14;
export const WV_WEB_TICKS = 12 * TICK_RATE;
export const WV_WEB_EVERY = 30;
export const WV_WEB_DOT = 4;
export const WV_WEB_HP = 4;
export const WV_WEB_MAX = 3;
export const WV_WEB_TOWER_SLOW = 0.5;
/** Кладка: метка у подножия стены под ней (во дворе — вокруг неё); паучат-липучек — packSize(n) */
export const WV_BROOD_R = 2.5;
/** Укус кристалла (во дворе): радиус метки, урон кристаллу и людям рядом */
export const WV_BITE_R = 2.6;
export const WV_BITE_CRYSTAL = 110;
export const WV_BITE_DMG = 30;

// ------------------------------------------------------------ Леший

/** Стоит далеко в поле: z и места по x (после пряток вылезает на другом) */
export const LS_HOME_Z = -33;
export const LS_SPOTS: readonly number[] = [-9, 0, 9];
/** Ворота пали — во дворе: z и места для пряток */
export const LS_IN_Z = -5;
export const LS_IN_SPOTS: readonly number[] = [-6, 0, 6];
/** Корни: радиус, урон людям (кто на той же высоте, что метка), воротам, кристаллу; прыжок не спасает */
export const LS_ROOT_R = 3.2;
export const LS_ROOT_DMG = 30;
export const LS_ROOT_GATE = 150;
export const LS_ROOT_CRYSTAL = 70;
/**
 * Целебная роща: радиус, лечит своих на долю HP (себя — на LS_HEAL_SELF); сбить колдовство — набрать по Лешему столько
 * доли его HP урона за время каста (после брони), тогда он открыт
 */
export const LS_HEAL_R = 16;
export const LS_HEAL_FRAC = 0.25;
export const LS_HEAL_SELF = 0.04;
export const LS_BREAK = 0.012;
/** Прятки: уходит под землю (тиков), ползёт под землёй — полное предупреждение, вылезает (тиков); глубина; круг вылезания */
export const LS_SINK_TICKS = 54;
export const LS_RISE_TICKS = 30;
export const LS_UNDER_Y = -12;
export const LS_EMERGE_R = 4.5;
export const LS_EMERGE_DMG = 26;
/** Лесовиков-щитоносцев в роще: LS_GROVE_BASE + n/2, в ярости ещё LS_RAGE_ADDS; встают перед ним на столько метров */
export const LS_GROVE_BASE = 2;
export const LS_RAGE_ADDS = 2;
export const LS_GROVE_AHEAD = 3.2;

// ------------------------------------------------------------ метки в снимке

/**
 * Ткачиха висит на стене: признак врага в снимке — тот же бит, что ZF_CARRY (fortnet.ts; бочки у босса не бывает).
 * Числом, а не импортом: fortnet.ts сам берёт отсюда NEW_BOSS_TIMED.
 */
export const ZF_WV_WALL = 128;

/** Состояния новых боссов, у которых в снимке есть отсчёт и цель (fortnet.ts, isTimedState) */
export const NEW_BOSS_TIMED: readonly number[] = [
  ZS_PK_SUMMON, ZS_PK_ROLL_WARN, ZS_PK_ROLL, ZS_PK_SPIT, ZS_WV_SWEEP, ZS_WV_WEB, ZS_WV_BROOD, ZS_WV_BITE, ZS_LS_ROOTS, ZS_LS_HEAL,
  ZS_LS_UNDER,
];

/** Радиус метки по состоянию нового босса (0 — нет метки) — для снимка */
export function newBossRadius(state: number): number {
  switch (state) {
    case ZS_PK_SUMMON: return PK_SUMMON_R;
    case ZS_PK_ROLL_WARN:
    case ZS_PK_ROLL: return PK_ROLL_R;
    case ZS_PK_SPIT: return PK_SPIT_R;
    case ZS_WV_SWEEP: return WV_SWEEP_R;
    case ZS_WV_WEB: return WV_WEB_R;
    case ZS_WV_BROOD: return WV_BROOD_R;
    case ZS_WV_BITE: return WV_BITE_R;
    case ZS_LS_ROOTS: return LS_ROOT_R;
    case ZS_LS_HEAL: return LS_HEAL_R;
    case ZS_LS_UNDER: return LS_EMERGE_R;
    default: return 0;
  }
}
