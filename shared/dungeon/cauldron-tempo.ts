import { D } from './data.ts';

/** One clock for simulation deadlines and the corresponding GLB poses. */
export function cauldronActionSpeed(phase: number): number {
  return D.cauldron.actionSpeed * (phase === 1 ? .9 : phase === 2 ? 1.1 : 1);
}

/** Phase two attacks accelerate, but its walking speed stays unchanged. */
export function cauldronMoveMul(phase: number): number {
  return phase === 1 ? .9 : 1;
}

export function cauldronClipSpeed(anim: string, phase: number): number {
  return anim === 'walk' ? D.cauldron.actionSpeed * cauldronMoveMul(phase) : cauldronActionSpeed(phase);
}
