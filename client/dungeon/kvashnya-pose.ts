import { KVASHNYA_TIMING } from '../../shared/dungeon/kvashnya-state.ts';

export type KvashnyaSkill = 'tongue' | 'jump' | 'recover';
export type KvashnyaClip = 'windup' | 'attack' | 'recover' | 'tongue_windup' | 'tongue_attack' | 'tongue_recover';

/** GLB runs at 24 fps, simulation at 30 Hz: preserve the exact contact frame, including rounded jump ticks. */
export function getKvashnyaPose(skill: KvashnyaSkill, elapsedTicks: number): { key: KvashnyaClip; time: number } {
  const elapsed = Math.max(0, elapsedTicks);
  if (skill === 'recover') return { key: 'recover', time: Math.min(1, elapsed / 30) * (26 / 24) };
  const timing = KVASHNYA_TIMING[skill];
  const tongue = skill === 'tongue';
  if (elapsed < timing.windup) return { key: tongue ? 'tongue_windup' : 'windup', time: elapsed / timing.windup * (tongue ? 21 / 24 : 30 / 24) };
  const age = elapsed - timing.windup;
  if (age < timing.attack) {
    const impact = tongue ? 4 / 24 : 14 / 24, duration = tongue ? 12 / 24 : 15 / 24;
    let time = age <= timing.impact ? age / timing.impact * impact : impact + (age - timing.impact) / (timing.attack - timing.impact) * (duration - impact);
    if (!tongue && age <= timing.impact) {
      const takeoff = KVASHNYA_TIMING.jump.takeoff, liftFrame = 3 / 24;
      time = age <= takeoff ? age / takeoff * liftFrame : liftFrame + (age - takeoff) / (timing.impact - takeoff) * (impact - liftFrame);
    }
    return { key: tongue ? 'tongue_attack' : 'attack', time };
  }
  return { key: tongue ? 'tongue_recover' : 'recover', time: Math.min(1, (age - timing.attack) / timing.recover) * (tongue ? 1 : 26 / 24) };
}
