// The complete client-only animal roster and route authority. No profile/server state: every client derives the
// same animal positions from the server tick (client/lobby/crittersim.ts); reactions are local.
import { WATER_Y } from '../constants.ts';

export const CRITTERS_ENABLED = true;
export type CritterKind = 'cat' | 'gull' | 'crab' | 'dog';
export type CritterAction = 'walk' | 'sit' | 'sleep' | 'groom' | 'sniff' | 'peck' | 'perch' | 'burrow' | 'fly';
export interface CritterStop {
  x: number; y: number; z: number;
  rest: string;
  /** Resting orientation; useful when lying along a bench instead of across it. */
  yaw?: number;
  action: CritterAction;
  hold: number;
  /** Incoming leg; elevated cat stops use a short hop, gulls fly in an arc over the water. */
  travel?: 'walk' | 'hop' | 'fly';
  /** Flights only: how far (x, z metres) the arc swings out from the straight line at its middle. */
  loop?: readonly [number, number];
  /** Flights only: peak height above the straight line (default 2.6 m). */
  lift?: number;
}
export interface CritterDef { id: number; kind: CritterKind; coat: number; speed: number; phase: number; stops: readonly CritterStop[]; }
/** Quiet exclusion margin around the existing memorial. Nothing is added there. */
export const CRITTER_QUIET_ZONE = { x: -23.6, z: 19.2, r: 7 };

/**
 * Small natural sandbar against the stone quay at the foot of the lighthouse jetty (east side): the sea floor rises
 * to a few centimetres above the water, the first jetty pile stands in it, a tongue runs in under the planks.
 * One height function drives the visible sand, the crabs' feet and the solid underfoot, so they always agree.
 * It stays outside CRITTER_QUIET_ZONE.
 */
export const CRITTER_COVE = {
  wallZ: 22,
  /** Overlapping mounds (smooth union): the main bank on the wall, the tongue by the pile, a neck joining them. */
  mounds: [
    { x: -15.1, z: 22, rx: 2.3, rz: 2.95, seed: 0.4 },
    { x: -16.95, z: 24.35, rx: 1.15, rz: 1.3, seed: 2.1 },
    { x: -16.45, z: 23.5, rx: 0.9, rz: 0.85, seed: 4.2 },
  ],
  top: -0.93,
  /** Sand above this is dry enough for crabs. */
  dry: WATER_Y + 0.1,
};
const ripple = (x: number, z: number): number => 0.006 * Math.sin(x * 5.3 + z * 3.1) + 0.004 * Math.sin(x * 11.7 - z * 8.3 + 1.3);
function radial(dx: number, dz: number, seed: number): number {
  const a = Math.atan2(dz, dx);
  return Math.hypot(dx, dz) * (1 + 0.075 * Math.sin(3 * a + seed) + 0.04 * Math.sin(5 * a + seed * 2.3));
}
/** Nearly flat top (walkable), then a short beach slope down under the water. */
const profile = (r: number): number => {
  const s = Math.min(1, Math.max(0, (r - 0.55) / 0.45));
  return CRITTER_COVE.top - 0.04 * Math.min(r, 1) ** 2 - 0.5 * s * s * (3 - 2 * s) - (r > 1 ? (r - 1) * 1.2 : 0);
};
/** Sand surface height at (x, z); far below the water outside the sandbar. */
export function coveHeight(x: number, z: number): number {
  const k = 40;
  let sum = 0;
  for (const m of CRITTER_COVE.mounds) sum += Math.exp(k * profile(radial((x - m.x) / m.rx, (Math.max(z, CRITTER_COVE.wallZ - 0.1) - m.z) / m.rz, m.seed)));
  const h = Math.log(sum) / k;                                  // smooth union of the mounds
  return h > WATER_Y - 0.5 ? h + ripple(x, z) * Math.min(1, (h - WATER_Y + 0.5) / 0.4) : h;
}
/** Dry sand where a crab can stand (clear of the memorial's quiet zone). */
export function coveDry(x: number, z: number): boolean {
  return coveHeight(x, z) > CRITTER_COVE.dry && Math.hypot(x - CRITTER_QUIET_ZONE.x, z - CRITTER_QUIET_ZONE.z) > CRITTER_QUIET_ZONE.r + 0.25;
}
/** Solid boxes under the dry sand (a player may jump down onto the sandbar and back up): strips of the plateau. */
export function coveBoxes(): Array<{ x0: number; x1: number; z0: number; z1: number; top: number }> {
  const out: Array<{ x0: number; x1: number; z0: number; z1: number; top: number }> = [];
  const step = 0.05, floor = CRITTER_COVE.top - 0.09;   // only the flat plateau is solid; the beach slope is not
  for (let z0 = CRITTER_COVE.wallZ; z0 < CRITTER_COVE.wallZ + 3.4; z0 += 0.3) {
    const z1 = z0 + 0.3;
    let run: { x0: number; x1: number; top: number } | null = null;
    const flush = (): void => { if (run && run.x1 - run.x0 > 0.3) out.push({ ...run, z0, z1 }); run = null; };
    for (let x = -19.5; x <= -12; x += step) {
      let low = Infinity;
      for (const z of [z0 + 0.02, (z0 + z1) / 2, z1 - 0.02]) low = Math.min(low, coveHeight(x, z), coveHeight(x + step, z));
      const solid = low > floor && Math.hypot(x - CRITTER_QUIET_ZONE.x, (z0 + z1) / 2 - CRITTER_QUIET_ZONE.z) > CRITTER_QUIET_ZONE.r + 0.2 && x > -16.95;
      if (solid) {
        if (!run) run = { x0: x, x1: x + step, top: low };
        else { run.x1 = x + step; run.top = Math.min(run.top, low); }
        if (run && run.x1 - run.x0 > 1.05) flush();       // short pieces: each follows the local sand height
      } else flush();
    }
    flush();
  }
  return out.map((b) => ({ ...b, top: Math.floor((b.top - 0.012) * 100) / 100 }));
}

const stop = (x: number, z: number, action: CritterAction, hold: number, rest: string, y = 0, travel?: CritterStop['travel']): CritterStop => ({ x, y, z, action, hold, rest, travel });
const sand = (x: number, z: number, action: CritterAction, hold: number): CritterStop => stop(x, z, action, hold, 'cove', coveHeight(x, z));
const fly = (s: CritterStop, loop: readonly [number, number], lift = 2.6): CritterStop => ({ ...s, travel: 'fly', loop, lift });
export const CRITTERS: readonly CritterDef[] = [
  { id: 0, kind: 'cat', coat: 0, speed: 0.53, phase: 0, stops: [
    { ...stop(-0.55, 19.42, 'sleep', 27, 'sea-bench', 0.30, 'hop'), yaw: -Math.PI / 2 }, stop(-1.5, 20.4, 'groom', 13, 'bench-front', 0, 'hop'),
    stop(2.8, 20.1, 'sit', 11, 'shore-warm-stone'), stop(2.3, 18.5, 'groom', 9, 'bench-side'), stop(-1.5, 18.6, 'sit', 6, 'bench-step'),
  ] },
  { id: 1, kind: 'cat', coat: 1, speed: 0.58, phase: 29, stops: [
    stop(-10.25, -18.5, 'sit', 18, 'warehouse-alley'), stop(-10.25, -20.5, 'sniff', 7, 'crate-foot'),
    stop(-10.2, -21.9, 'groom', 22, 'warehouse-crate', 1, 'hop'), stop(-10.25, -20.5, 'sit', 8, 'crate-foot', 0, 'hop'),
  ] },
  { id: 2, kind: 'cat', coat: 2, speed: 0.5, phase: 53, stops: [
    stop(-17, 40, 'sit', 24, 'fisher-wait'), stop(-16.3, 40.9, 'groom', 12, 'lighthouse-east'),
    stop(-16.3, 44, 'sleep', 26, 'lighthouse-warm-floor'), stop(-16.3, 40.9, 'sit', 7, 'lighthouse-east'),
  ] },
  { id: 3, kind: 'cat', coat: 3, speed: 0.55, phase: 17, stops: [
    stop(22.6, 5.5, 'sleep', 23, 'cafe-shade'), stop(22.4, 8.5, 'groom', 17, 'cafe-wall'),
    stop(21.3, 12.8, 'sit', 17, 'terrace-edge'), stop(22.4, 8.5, 'sit', 6, 'cafe-wall'),
  ] },
  // Gulls: walk and peck on the pier, perch on a bollard, and fly in a wide arc out over the water between places.
  { id: 4, kind: 'gull', coat: 0, speed: 0.62, phase: 7, stops: [
    stop(-5, 20.5, 'peck', 8, 'south-pier', 0, 'fly'), stop(-6, 20.3, 'peck', 12, 'south-pier'), fly(stop(-4, 21.2, 'perch', 14, 'south-bollard', 0.54), [0.6, 3.6], 2.2),
  ].map((s, i) => (i === 0 ? fly(s, [-0.8, 3.2], 2.2) : s)) },
  { id: 5, kind: 'gull', coat: 0, speed: 0.62, phase: 18, stops: [
    stop(5, 20.4, 'peck', 13, 'east-pier', 0, 'fly'), stop(6, 20.2, 'peck', 11, 'east-pier'), fly(stop(12, 21.2, 'perch', 20, 'east-bollard', 0.54), [0, 5.2], 3),
  ].map((s, i) => (i === 0 ? fly(s, [0, 5.6], 3) : s)) },
  { id: 6, kind: 'gull', coat: 0, speed: 0.62, phase: 29, stops: [
    stop(-19.5, 26.1, 'peck', 12, 'fishing-pier', 0, 'fly'), stop(-18.6, 27.1, 'peck', 16, 'fishing-pier'), fly(stop(-19.5, 29.7, 'perch', 10, 'fishing-pier'), [3.4, 0.4], 2.4),
  ].map((s, i) => (i === 0 ? fly(s, [3.4, -0.4], 2.4) : s)) },
  { id: 7, kind: 'gull', coat: 0, speed: 0.62, phase: 40, stops: [
    stop(-19.5, 30.7, 'peck', 9, 'fishing-pier', 0, 'fly'), stop(-18.7, 31.3, 'peck', 14, 'fishing-pier'), fly(stop(-20.1, 33.2, 'perch', 14, 'fishing-pier'), [-3.4, 0.2], 2.4),
  ].map((s, i) => (i === 0 ? fly(s, [-3.6, -0.2], 2.4) : s)) },
  { id: 8, kind: 'gull', coat: 0, speed: 0.62, phase: 51, stops: [
    stop(-22.6, 39.3, 'peck', 15, 'lighthouse-apron', 0, 'fly'), stop(-22.1, 40, 'peck', 10, 'lighthouse-apron'), fly(stop(-14.7, 45.3, 'perch', 12, 'lighthouse-bollard', 0.54), [-3.5, 5.5], 2.8),
  ].map((s, i) => (i === 0 ? fly(s, [-3.5, 5.5], 2.8) : s)) },
  { id: 9, kind: 'gull', coat: 0, speed: 0.62, phase: 62, stops: [
    stop(16.5, 20.3, 'peck', 13, 'cafe-pier', 0, 'fly'), stop(17.7, 20.1, 'peck', 9, 'cafe-pier'), fly(stop(19.5, 20.4, 'perch', 17, 'cafe-pier'), [0.4, 4.4], 2.6),
  ].map((s, i) => (i === 0 ? fly(s, [0.4, 4.6], 2.6) : s)) },
  // Crabs live on the cove's dry sand and under the jetty planks; stops sit well inside coveDry() (tests walk every leg).
  { id: 10, kind: 'crab', coat: 0, speed: 0.5, phase: 0, stops: [sand(-17.2, 24.5, 'burrow', 8), sand(-16.5, 23.6, 'sit', 5), sand(-15.7, 22.8, 'sit', 4)] },
  { id: 11, kind: 'crab', coat: 1, speed: 0.5, phase: 6, stops: [sand(-14.3, 22.6, 'burrow', 9), sand(-15, 23.4, 'sit', 5), sand(-14.2, 23.3, 'sit', 4)] },
  { id: 12, kind: 'crab', coat: 0, speed: 0.5, phase: 11, stops: [sand(-15.5, 22.3, 'sit', 6), sand(-14.7, 22.9, 'burrow', 8), sand(-15.9, 23.2, 'sit', 5)] },
  { id: 13, kind: 'crab', coat: 1, speed: 0.5, phase: 17, stops: [sand(-17.1, 24, 'sit', 7), sand(-16.9, 24.8, 'burrow', 9), sand(-16.4, 23.6, 'sit', 4)] },
  { id: 14, kind: 'dog', coat: 0, speed: 1.25, phase: 36, stops: [
    stop(21.3, 6.5, 'sleep', 21, 'cafe-dog-bed'), stop(16.3, 8, 'sniff', 9, 'cafe-walk'), stop(11, 8, 'sit', 6, 'plaza-east'),
    stop(11, 18.4, 'sniff', 8, 'shore-corner'), stop(3.4, 18.4, 'sniff', 11, 'shore-walk'), stop(11, 18.4, 'sit', 4, 'shore-corner'),
    stop(11, 8, 'sniff', 5, 'plaza-east'), stop(16.3, 8, 'sit', 6, 'cafe-walk'),
  ] },
];
