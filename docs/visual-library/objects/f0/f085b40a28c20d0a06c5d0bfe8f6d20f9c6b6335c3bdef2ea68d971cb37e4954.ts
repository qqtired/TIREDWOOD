import { GRAVITY, JUMP_VELOCITY, STEP_HEIGHT } from './constants.ts';

export interface StartCircle { x: number; y?: number; z: number; r: number }
export interface CirclePosition { x: number; y?: number; z: number }

/** Feet may follow a normal jump above the entrance, but not a roof or the water below it. */
const JUMP_CEILING = JUMP_VELOCITY ** 2 / (2 * GRAVITY) + 0.1;
export function inStartCircle(position: CirclePosition, circle: StartCircle): boolean {
  const height = (position.y ?? 0) - (circle.y ?? 0);
  return height >= -STEP_HEIGHT && height <= JUMP_CEILING &&
    (position.x - circle.x) ** 2 + (position.z - circle.z) ** 2 <= circle.r ** 2;
}

/** Small authoritative entrance circles; existing E interactions keep their original radius. */
export const START_DWELL_TICKS = 180;
export type StartZoneKind = 'paintball' | 'fort';
export interface GatherStatus { phase: 'idle' | 'count'; left: number; n: number; max: number; names: string[] }
export const START_ZONES: readonly { kind: StartZoneKind; x: number; y: number; z: number; r: number }[] = [
  { kind: 'paintball', x: 0, y: 0, z: -15.2, r: 1.35 },
  { kind: 'fort', x: 11, y: 0, z: -15.3, r: 1.2 },
];
