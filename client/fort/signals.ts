import { BOSS_BOMB_R, BOSS_PULSE_R, BOSS_WARN_TICKS, FLY_DIVE_TICKS, FLY_R, FLY_WARN_TICKS, ZS_BOSS_BOMB, ZS_BOSS_GATE, ZS_BOSS_PULSE, ZS_FLY_DIVE, ZS_FLY_WARN } from '../../shared/fort.ts';

/** Сигнал атаки берётся из снимка: одинаково виден при любом качестве графики. */
export function attackSignal(state: number, wind: number): { radius: number; progress: number; color: number } | null {
  const fly = state === ZS_FLY_WARN || state === ZS_FLY_DIVE;
  const boss = state === ZS_BOSS_GATE || state === ZS_BOSS_BOMB || state === ZS_BOSS_PULSE;
  if (!fly && !boss) return null;
  const total = fly ? FLY_WARN_TICKS + FLY_DIVE_TICKS : BOSS_WARN_TICKS;
  const left = wind + (state === ZS_FLY_WARN ? FLY_DIVE_TICKS : 0);
  return {
    radius: fly ? FLY_R : state === ZS_BOSS_PULSE ? BOSS_PULSE_R : state === ZS_BOSS_GATE ? 6 : BOSS_BOMB_R,
    progress: Math.max(0, Math.min(1, 1 - left / total)),
    color: fly ? 0xe48cf3 : 0xff6043,
  };
}
