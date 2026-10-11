import { inStartCircle, START_ZONES, type CirclePosition } from '../../../shared/startzones.ts';

const FORT_CIRCLE = START_ZONES.find(z => z.kind === 'fort')!;

/** Своя и чужие желейки, только реальный круг (включая высоту); камера на ворота не влияет. */
export function fortEntryOccupied(me: CirclePosition | null, others: Iterable<CirclePosition>, enabled: boolean): boolean {
  if (!enabled) return false;
  if (me && inStartCircle(me, FORT_CIRCLE)) return true;
  for (const player of others) if (inStartCircle(player, FORT_CIRCLE)) return true;
  return false;
}

/** То же плавное следование, что у рольставни картинга; 0 — закрыто, 1 — открыто. */
export function stepFortEntryDoor(value: number, occupied: boolean, dt: number): number {
  return value + ((occupied ? 1 : 0) - value) * (1 - Math.exp(-Math.max(0, dt) * 2.5));
}
