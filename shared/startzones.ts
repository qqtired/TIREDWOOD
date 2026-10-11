import { GRAVITY, JUMP_VELOCITY, STEP_HEIGHT } from './constants.ts';
import { pick } from './layout.ts';
import { P3 } from './plaza3/layout.ts';

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
/**
 * Круги стоят у входов: пейнтбол — у ворот Склада №3 (точка pb_gate), крепость — на 0,9 м перед аркой (FORT_ARCH.z + 0,9).
 * plaza3: (8; −28,2) и (26; −28,1) — layout.json (lobby.pbGate, modes.fortArch); модуль не тянет shared/maps/lobby.ts.
 */
export const START_ZONES: readonly { kind: StartZoneKind; x: number; y: number; z: number; r: number }[] = pick<Array<{ kind: StartZoneKind; x: number; y: number; z: number; r: number }>>(
  [
    { kind: 'paintball', x: 0, y: 0, z: -15.2, r: 1.35 },
    { kind: 'fort', x: 11, y: 0, z: -15.3, r: 1.2 },
  ],
  () => [
    { kind: 'paintball', x: P3.lobby.pbGate.x, y: 0, z: P3.lobby.pbGate.z, r: 1.35 },
    { kind: 'fort', x: P3.modes.fortArch.x, y: 0, z: P3.modes.fortArch.z + 0.9, r: 1.2 },
  ],
);
