import {
  BOSS_BOMB_R, BOSS_PULSE_R, BOSS_WARN_TICKS, FLY_DIVE_TICKS, FLY_R, FLY_WARN_TICKS, ZS_BOSS_BOMB, ZS_BOSS_GATE, ZS_BOSS_PULSE,
  ZS_CHARGE, ZS_CHARGE_WARN, ZS_FLY_DIVE, ZS_FLY_WARN, ZS_PLANT, ZS_QUAKE, ZS_SPIT, ZS_STOMP, ZS_THROW,
} from '../../shared/fort.ts';
import { BARREL_R, FUSE_TICKS, QUAKE_R, RAM_LANE, ROCK_R, SPIT_R, SPIT_WARN_TICKS, STOMP_R } from '../../shared/fortkinds.ts';

const RED = 0xff6043;

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
