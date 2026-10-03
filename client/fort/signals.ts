import {
  BOSS_BOMB_R, BOSS_PULSE_R, BOSS_WARN_TICKS, FLY_DIVE_TICKS, FLY_R, FLY_WARN_TICKS, ZS_BOSS_BOMB, ZS_BOSS_GATE, ZS_BOSS_PULSE,
  ZS_CHARGE, ZS_CHARGE_WARN, ZS_FLY_DIVE, ZS_FLY_WARN, ZS_KRAKEN_SPIT, ZS_PLANT, ZS_QUAKE, ZS_SPIT, ZS_STOMP, ZS_TENT_REST,
  ZS_TENT_SLAM, ZS_THROW,
} from '../../shared/fort.ts';
import { BARREL_R, FUSE_TICKS, QUAKE_R, RAM_LANE, ROCK_R, SPIT_R, SPIT_WARN_TICKS, STOMP_R } from '../../shared/fortkinds.ts';
import { KRAKEN_SPIT_R, KRAKEN_SPIT_TICKS, TENT_REST_TICKS, TENT_SLAM_R, TENT_WARN_TICKS } from '../../shared/fortkraken.ts';
import {
  LS_EMERGE_R, LS_HEAL_R, LS_ROOT_R, PK_ROLL_R, PK_SPIT_R, PK_SUMMON_R, WV_BITE_R, WV_BROOD_R, WV_SWEEP_R, WV_WEB_R,
} from '../../shared/fortbosses.ts';
import {
  ZS_LS_HEAL, ZS_LS_ROOTS, ZS_LS_UNDER, ZS_PK_ROLL, ZS_PK_ROLL_WARN, ZS_PK_SPIT, ZS_PK_SUMMON, ZS_WV_BITE, ZS_WV_BROOD,
  ZS_WV_SWEEP, ZS_WV_WEB,
} from '../../shared/fort.ts';

const RED = 0xff6043;
/** Голубое — окно для урона (булава щупальца лежит после удара) */
const OPEN = 0x5fe3f0;

/**
 * Метка атаки по состоянию: сколько тиков от начала до удара, радиус по умолчанию, цвет (красное — будет больно) и цвет
 * заливки (у камня Валуна — растущая тень).
 */
const SIGNALS: Readonly<Record<number, { total: number; radius: number; color: number; fill?: number }>> = {
  [ZS_BOSS_GATE]: { total: BOSS_WARN_TICKS, radius: 6, color: RED },
  [ZS_BOSS_BOMB]: { total: BOSS_WARN_TICKS, radius: BOSS_BOMB_R, color: RED },
  [ZS_BOSS_PULSE]: { total: BOSS_WARN_TICKS, radius: BOSS_PULSE_R, color: RED },
  [ZS_SPIT]: { total: SPIT_WARN_TICKS, radius: SPIT_R, color: 0xff4f6a },
  [ZS_PLANT]: { total: FUSE_TICKS, radius: BARREL_R, color: 0xff8a2a },
  [ZS_CHARGE_WARN]: { total: BOSS_WARN_TICKS, radius: RAM_LANE, color: RED },
  [ZS_CHARGE]: { total: 1, radius: RAM_LANE, color: RED },
  [ZS_STOMP]: { total: BOSS_WARN_TICKS, radius: STOMP_R, color: RED },
  [ZS_THROW]: { total: BOSS_WARN_TICKS, radius: ROCK_R, color: RED, fill: 0x20140c },
  [ZS_QUAKE]: { total: BOSS_WARN_TICKS, radius: QUAKE_R, color: RED },
  [ZS_TENT_SLAM]: { total: TENT_WARN_TICKS, radius: TENT_SLAM_R, color: RED },
  [ZS_KRAKEN_SPIT]: { total: KRAKEN_SPIT_TICKS, radius: KRAKEN_SPIT_R, color: 0xff4f9a, fill: 0x8a2f9e },
  [ZS_TENT_REST]: { total: TENT_REST_TICKS, radius: TENT_SLAM_R, color: OPEN },
  // новые боссы (fort-bosses): красное — больно, оранжевое — подкрепление, сиреневое — паутина, зелёное — лечит армию
  [ZS_PK_SUMMON]: { total: BOSS_WARN_TICKS, radius: PK_SUMMON_R, color: 0xff8a2a },
  [ZS_PK_ROLL_WARN]: { total: BOSS_WARN_TICKS, radius: PK_ROLL_R, color: RED },
  [ZS_PK_ROLL]: { total: 1, radius: PK_ROLL_R, color: RED },
  [ZS_PK_SPIT]: { total: BOSS_WARN_TICKS, radius: PK_SPIT_R, color: RED },
  [ZS_WV_SWEEP]: { total: BOSS_WARN_TICKS, radius: WV_SWEEP_R, color: RED },
  [ZS_WV_WEB]: { total: BOSS_WARN_TICKS, radius: WV_WEB_R, color: 0xd6b8ff },
  [ZS_WV_BROOD]: { total: BOSS_WARN_TICKS, radius: WV_BROOD_R, color: 0xff8a2a },
  [ZS_WV_BITE]: { total: BOSS_WARN_TICKS, radius: WV_BITE_R, color: RED },
  [ZS_LS_ROOTS]: { total: BOSS_WARN_TICKS, radius: LS_ROOT_R, color: RED, fill: 0x6b4a2a },
  [ZS_LS_HEAL]: { total: BOSS_WARN_TICKS, radius: LS_HEAL_R, color: 0x5fdc6a },
  [ZS_LS_UNDER]: { total: BOSS_WARN_TICKS, radius: LS_EMERGE_R, color: RED, fill: 0x6b4a2a },
};

/**
 * Сигнал атаки берётся из снимка: одинаково виден при любом качестве графики. radius — из снимка (0 — по
 * состоянию); progress 0…1 — заполнение к моменту удара.
 */
export function attackSignal(state: number, wind: number, radius = 0): { radius: number; progress: number; color: number; fill: number } | null {
  const fly = state === ZS_FLY_WARN || state === ZS_FLY_DIVE;
  if (fly) {
    const total = FLY_WARN_TICKS + FLY_DIVE_TICKS;
    const left = wind + (state === ZS_FLY_WARN ? FLY_DIVE_TICKS : 0);
    return { radius: radius > 0 ? radius : FLY_R, progress: Math.max(0, Math.min(1, 1 - left / total)), color: 0xe48cf3, fill: 0xe48cf3 };
  }
  const s = SIGNALS[state];
  if (!s) return null;
  return { radius: radius > 0 ? radius : s.radius, progress: Math.max(0, Math.min(1, 1 - wind / s.total)), color: s.color, fill: s.fill ?? s.color };
}
