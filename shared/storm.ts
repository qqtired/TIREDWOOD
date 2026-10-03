import { TICK_RATE } from './constants.ts';
export const STORM_WARN = 60 * TICK_RATE;
export const STORM_MAX = 180 * TICK_RATE;
export const STORM_RANK = 10 * TICK_RATE;
export const STORM_CALM = 12 * TICK_RATE;
export const STORM_RAINBOW = 30 * TICK_RATE;
export const STORM_PERIOD = 6 * TICK_RATE;
export const STORM_FOAM = TICK_RATE;
export const STORM_PUSH = 6;
export const STORM_LOCK = 36;
export const STORM_GOAL = { x: -19, y: 0, z: 40.8, r: 1.8 };
export type StormPhase = 'idle' | 'warn' | 'storm' | 'calm';
export interface StormWinner { pid: number; nick: string; place: number; tokens: number }
export interface StormView {
  id: string; phase: StormPhase; start: number; end: number; rankEnd: number; rainbowEnd: number; waveStart: number;
  winners: StormWinner[];
}
export const emptyStorm = (): StormView => ({ id: '', phase: 'idle', start: 0, end: 0, rankEnd: 0, rainbowEnd: 0, waveStart: 0, winners: [] });
export const stormReward = (place: number): number => place === 1 ? 30 : place === 2 ? 20 : place === 3 ? 15 : 5;
export function onStormPier(x: number, y: number, z: number): boolean {
  return x >= -24 && x <= -14 && z >= 22.2 && z < 38 && y > -1.55 && y < 1.0;
}
/** Wave clock relative to authoritative storm start. No hit occurs before the first full period. */
export function stormWave(tick: number, view: Pick<StormView, 'phase' | 'waveStart'>): { index: number; impact: boolean; foam: boolean; direction: number } {
  const elapsed = Math.floor(tick - view.waveStart);
  const index = Math.floor(elapsed / STORM_PERIOD);
  const offset = elapsed - index * STORM_PERIOD;
  return { index, impact: view.phase === 'storm' && index >= 1 && offset < STORM_LOCK,
    foam: view.phase === 'storm' && elapsed >= 0 && offset >= STORM_PERIOD - STORM_FOAM, direction: index % 2 ? 1 : -1 };
}
