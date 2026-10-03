import { DT } from './constants.ts';
import { onStormPier, stormWave, STORM_PUSH, type StormView } from './storm.ts';
import { pushPlayer, type Input, type PlayerState } from './sim.ts';
import type { CollisionWorld } from './world.ts';
/** Compose BEFORE AquaDyn.pre/stepHeld and AFTER AquaDyn.post, using the same aquaClock tick.
 * Pass the returned copy into stepHeld; never mutate the stored input (prediction replay). */
export function stormInput(s: PlayerState, input: Input, tick: number, view: StormView, eligible = true): Input {
  if (!eligible || !onStormPier(s.x, s.y, s.z) || !stormWave(tick, view).impact) return input;
  s.dashT = 0; s.jumpBuf = 0; s.vx = 0; s.vz = 0;
  return { ...input, buttons: 0 };
}
export function stormPush(s: PlayerState, world: CollisionWorld, tick: number, view: StormView, eligible = true): boolean {
  const wave = stormWave(tick, view);
  if (!eligible || !wave.impact || !onStormPier(s.x, s.y, s.z)) return false;
  pushPlayer(s, world, wave.direction * STORM_PUSH * DT, 0, 0);
  return true;
}
