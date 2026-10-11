// Пруд — часть существующей рыбалки, геометрия из общей планировки фермы.
import { FARM_LAYOUT } from './farmlayout.ts';
import type { FishSpot } from './fishplaces.ts';

export const FARM_POND = FARM_LAYOUT.pond;
export const POND_SPOTS: readonly FishSpot[] = FARM_POND.spots.map((p) => ({ ...p, zone: 'pond' }));
export const POND_NPC = FARM_POND.npc;
export const POND_USE = FARM_POND.use;
export const POND_IDS = ['pond-crucian', 'pond-roach', 'pond-perch', 'pond-carp'] as const;
export const POND_CAPACITY = 6;

export function pondContains(x: number, z: number): boolean {
  const p = FARM_POND;
  return ((x - p.center.x) / p.radius.x) ** 2 + ((z - p.center.z) / p.radius.z) ** 2 <= 1;
}

export function pondCastAt(seat: number, rand: () => number): { x: number; z: number } {
  const at = POND_SPOTS[seat];
  if (!at) throw new RangeError('unknown pond seat');
  return { x: Math.round((at.x + (rand() - .5) * .6) * 100) / 100, z: Math.round((FARM_POND.center.z + (rand() - .5)) * 100) / 100 };
}

export function farmPondEnabled(value: string | undefined, farm: boolean, fish2: boolean): boolean {
  return value === '1' && farm && fish2;
}
