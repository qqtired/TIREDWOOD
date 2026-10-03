// Absolute shared-time routes. Position, speed, heading and travelled distance are all analytic functions of
// the server tick, so every client sees the same animal in the same place and the gait follows distance, not
// the joining time or the frame rate. Local, per-client reactions live in critterbrain.ts.
import { TICK_RATE } from '../../shared/constants.ts';
import { CRITTERS, type CritterAction, type CritterDef, type CritterStop } from '../../shared/maps/critters.ts';

/** Local reaction shown on top of the scheduled action (critterbrain.ts): purr (petted), hiss, greet (runs to a friend, wags), alert (watches), scare. */
export type CritterMood = 'none' | 'purr' | 'hiss' | 'greet' | 'alert' | 'scare';
export type CritterPoseAction = CritterAction;
export interface CritterPose {
  x: number; y: number; z: number;
  /** Heading (0 faces -Z, like the players). */
  yaw: number;
  /** Climb angle while flying. */
  pitch: number;
  action: CritterPoseAction;
  mood: CritterMood;
  rest: string | null;
  moving: boolean;
  airborne: boolean;
  /** 0..1 progress inside the current hold or leg. */
  phase: number;
  /** Travelled distance: drives the gait. */
  distance: number;
  speed: number;
  /** 0..1: how far the animal has settled into its rest posture (sit, sleep, groom, burrow). */
  restWeight: number;
  /** Seconds since the current hold or leg began / seconds until it ends. */
  age: number;
  remaining: number;
  /** Yaw rate, rad/s (banking, leaning into turns). */
  turn: number;
  /** Gaze relative to the body (rad) and how strongly the animal follows it, 0..1. */
  lookYaw: number; lookPitch: number; look: number;
  /** 0..1 liveliness: tail wag, wing beat power, claw waving. */
  excite: number;
  /** 0..1 fright: ears flat, claws up. */
  alarm: number;
  /** 0..1 beak open (gull cry). */
  cry: number;
}
export interface CritterPlayer { x: number; y: number; z: number; speed: number }

interface Route { total: number; length: number; legs: readonly number[]; lengths: readonly number[] }
const periods = new Map<number, Route>();
const DEFAULT_LIFT = 2.6;
/** Flight time of a scheduled flight: long enough for a real take-off, glide and landing. */
export function flightTime(chord: number, loop: number): number { return Math.min(8, Math.max(3.4, 2.4 + (chord + 1.6 * loop) / 2.6)); }
function legTime(def: CritterDef, a: CritterStop, b: CritterStop, length: number): number {
  if (b.travel === 'fly') return flightTime(length, Math.hypot(b.loop?.[0] ?? 0, b.loop?.[1] ?? 0));
  return Math.max(1, length / def.speed);
}
for (const def of CRITTERS) {
  const lengths = def.stops.map((a, i) => { const b = def.stops[(i + 1) % def.stops.length]; return Math.hypot(b.x - a.x, b.z - a.z); });
  const legs = lengths.map((length, i) => legTime(def, def.stops[i], def.stops[(i + 1) % def.stops.length], length));
  periods.set(def.id, { total: def.stops.reduce((sum, s, i) => sum + s.hold + legs[i], 0), length: lengths.reduce((a, b) => a + b, 0), lengths, legs });
}
export const smooth = (v: number): number => { const x = Math.max(0, Math.min(1, v)); return x * x * (3 - 2 * x); };
const angle = (a: number, b: number, t: number): number => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * smooth(t);
export function critterPeriod(def: CritterDef): number { return periods.get(def.id)!.total; }
export function newPose(): CritterPose {
  return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, action: 'sit', mood: 'none', rest: null, moving: false, airborne: false, phase: 0, distance: 0, speed: 0, restWeight: 0, age: 0, remaining: 0, turn: 0, lookYaw: 0, lookPitch: 0, look: 0, excite: 0, alarm: 0, cry: 0 };
}

const P = { x: 0, y: 0, z: 0 };
/** Position along a leg, u in 0..1 of the leg's time. Flights curve out over `loop` and climb in an asymmetric hump. */
function legPoint(a: CritterStop, b: CritterStop, u: number, r: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  // eased progress: accelerate over the first r, brake over the last r (a straight constant-speed middle)
  const progress = u < r ? u * u / (2 * r * (1 - r)) : u > 1 - r ? 1 - (1 - u) ** 2 / (2 * r * (1 - r)) : (u - r / 2) / (1 - r);
  const fly = b.travel === 'fly', hop = b.travel === 'hop';
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  out.x = a.x + dx * progress; out.y = a.y + dy * progress; out.z = a.z + dz * progress;
  if (fly) {
    const k = Math.sin(Math.PI * u), v = Math.sin(Math.PI * Math.pow(u, 0.72));
    out.x += (b.loop?.[0] ?? 0) * k; out.z += (b.loop?.[1] ?? 0) * k;
    out.y += (b.lift ?? DEFAULT_LIFT) * Math.pow(Math.max(0, v), 1.15);
  } else if (hop) out.y += 0.65 * Math.sin(Math.PI * progress);
  return out;
}

export function sampleCritter(def: CritterDef, tick: number, out: CritterPose = newPose()): CritterPose {
  const cycle = periods.get(def.id)!;
  const absolute = Math.max(0, Number.isFinite(tick) ? tick : 0) / TICK_RATE + def.phase;
  let t = absolute % cycle.total, distance = Math.floor(absolute / cycle.total) * cycle.length;
  const n = def.stops.length;
  for (let i = 0; i < n; i++) {
    const a = def.stops[i], b = def.stops[(i + 1) % n], prev = def.stops[(i + n - 1) % n], duration = cycle.legs[i];
    const outgoing = Math.atan2(-(b.x - a.x), -(b.z - a.z)), incoming = Math.atan2(-(a.x - prev.x), -(a.z - prev.z));
    if (t < a.hold) {
      const resting = a.yaw ?? incoming;
      const yaw = t < 0.65 ? angle(incoming, resting, t / 0.65) : angle(resting, outgoing, (t - a.hold + 0.85) / 0.85);
      Object.assign(out, { x: a.x, y: a.y, z: a.z, yaw, pitch: 0, action: a.action, mood: 'none', rest: a.rest, moving: false, airborne: false, phase: t / a.hold, distance, speed: 0, restWeight: Math.min(smooth(t / 0.7), smooth((a.hold - t) / 0.85)), age: t, remaining: a.hold - t, turn: 0, lookYaw: 0, lookPitch: 0, look: 0, excite: 0, alarm: 0, cry: 0 });
      return out;
    }
    t -= a.hold;
    if (t < duration) {
      const u = t / duration, r = Math.min(0.18, 0.5 / duration), fly = b.travel === 'fly', hop = b.travel === 'hop';
      const e = 0.004, u0 = Math.max(0, u - e), u1 = Math.min(1, u + e);
      const here = legPoint(a, b, u, r, P), x = here.x, y = here.y, z = here.z;
      const p0x = legPoint(a, b, u0, r, P).x, p0y = P.y, p0z = P.z;
      const p1x = legPoint(a, b, u1, r, P).x, p1y = P.y, p1z = P.z;
      const span = (u1 - u0) * duration, vx = (p1x - p0x) / span, vz = (p1z - p0z) / span, vy = (p1y - p0y) / span;
      const horizontal = Math.hypot(vx, vz);
      const progress = u < r ? u * u / (2 * r * (1 - r)) : u > 1 - r ? 1 - (1 - u) ** 2 / (2 * r * (1 - r)) : (u - r / 2) / (1 - r);
      Object.assign(out, {
        x, y, z,
        yaw: fly && horizontal > 0.05 ? Math.atan2(-vx, -vz) : outgoing,
        pitch: fly ? Math.atan2(vy, Math.max(horizontal, 0.4)) : 0,
        action: fly ? 'fly' : 'walk', mood: 'none', rest: null, moving: true, airborne: fly || hop, phase: progress,
        distance: distance + cycle.lengths[i] * progress, speed: horizontal, restWeight: 0, age: t, remaining: duration - t,
        turn: 0, lookYaw: 0, lookPitch: 0, look: 0, excite: 0, alarm: 0, cry: 0,
      });
      return out;
    }
    t -= duration; distance += cycle.lengths[i];
  }
  return sampleCritter(def, 0, out);
}

/** Gull cries: every gull has its own deterministic schedule, so friends see and hear the same gull call. */
export const CRY_LENGTH = 0.62;
export function gullCryIndex(def: CritterDef, tick: number): { index: number; age: number } {
  const t = Math.max(0, tick) / TICK_RATE + def.phase * 1.9, period = 15 + (def.id % 6) * 2.7, index = Math.floor(t / period);
  return { index, age: t - index * period - (period * (0.35 + 0.4 * ((def.id * 0.618) % 1))) };
}
