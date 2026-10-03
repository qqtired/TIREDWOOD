// Local reactions of the harbour animals, on top of the shared schedule (crittersim.ts). Every client computes the
// same schedule from the server tick; this layer only adds what *this* player and the other players do to them:
// gulls flush off in an arc and land on schedule, cats step away from a runner, the dog runs up to the nearest
// player and wags, crabs freeze, bolt and bury themselves, everybody looks at whoever is close. Pure logic (no THREE),
// so it is tested against the real collision world.
import { TICK_RATE } from '../../shared/constants.ts';
import { CRITTER_QUIET_ZONE, coveDry, coveHeight, type CritterDef } from '../../shared/maps/critters.ts';
import type { CollisionWorld } from '../../shared/world.ts';
import { CRY_LENGTH, gullCryIndex, newPose, sampleCritter, type CritterPose } from './crittersim.ts';

export interface Mover { id: number; x: number; y: number; z: number; speed: number }
export interface Scare { x: number; z: number; r: number }
/** What the brain needs to know about the walkable world (the real collision world in the game and in tests). */
export interface BrainWorld {
  /** Height of the floor under (x, z) near yRef, or null when there is none (water, void). */
  floor(x: number, z: number, yRef: number): number | null;
  /** Is a body of radius r and height h standing at (x, y, z) free of solid boxes? */
  free(x: number, y: number, z: number, r: number, h: number): boolean;
}
/** The lobby's collision world as the brain sees it. */
export function brainWorld(c: CollisionWorld): BrainWorld {
  return {
    floor: (x, z, yRef) => { const f = c.groundBelow(x, yRef + 0.5, z); return Number.isFinite(f) ? f : null; },
    free: (x, y, z, r, h) => !c.overlaps(x - r, y + 0.05, z - r, x + r, y + h, z + r),
  };
}
export type BrainEvent =
  | { kind: 'cry'; x: number; y: number; z: number }
  | { kind: 'purr'; x: number; y: number; z: number; hiss: boolean }
  | { kind: 'woof'; x: number; y: number; z: number };

type Mode = 'sched' | 'hold' | 'dodge' | 'run' | 'greet' | 'return' | 'flush' | 'alarm' | 'dash' | 'dig' | 'pop';
/** A flushed gull flies one banked circle (radius R, starting away from the scare, curling toward `cx, cz`) and lands where the schedule has it. */
interface Flush { t0: number; T: number; p0: [number, number, number]; end: [number, number, number]; endYaw: number; ax: number; az: number; cx: number; cz: number; R: number; H: number }
export interface Mind {
  def: CritterDef; index: number;
  pose: CritterPose; sched: CritterPose;
  mode: Mode; since: number; until: number; cooldown: number;
  /** The visible body while it is off schedule. */
  gx: number; gy: number; gz: number; gyaw: number; gspeed: number; grest: number; dist: number; bias: number; blocked: number;
  settle: number; mergeYaw: number;
  look: number; lookYaw: number; alert: number; alarm: number;
  tx: number; tz: number;
  flush: Flush | null; cryIndex: number; cryAt: number; flushes: number;
  petUntil: number; petHiss: boolean; petCool: number;
  spot: { x: number; z: number } | null;
  heldAction: CritterPose['action'];
}

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const clamp01 = (v: number): number => clamp(v, 0, 1);
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (v: number): number => { const x = clamp01(v); return x * x * (3 - 2 * x); };
const follow = (cur: number, target: number, dt: number, rate: number): number => cur + (target - cur) * (1 - Math.exp(-dt * rate));
const turnTo = (cur: number, target: number, dt: number, rate: number): number => cur + clamp(wrap(target - cur), -rate * dt, rate * dt);
/** Heading (0 faces -Z, like the players) of a direction. */
const bearing = (dx: number, dz: number): number => Math.atan2(-dx, -dz);

export const GULL_FLUSH_R = 3.2, GULL_FLUSH_RUN_R = 4.8, CAT_DODGE_R = 2.1, DOG_NOTICE_R = 13, CRAB_ALARM_R = 2.3;
const FAR = 60;

export class CritterBrain {
  readonly minds: Mind[] = [];
  readonly events: BrainEvent[] = [];
  private readonly world: BrainWorld | null;
  private dogIndex = -1;
  private now = 0;

  constructor(defs: readonly CritterDef[], world: BrainWorld | null = null) {
    this.world = world;
    defs.forEach((def, index) => {
      if (def.kind === 'dog') this.dogIndex = index;
      this.minds.push({
        def, index, pose: newPose(), sched: newPose(), mode: 'sched', since: 0, until: 0, cooldown: 0,
        gx: 0, gy: 0, gz: 0, gyaw: 0, gspeed: 0, grest: 0, dist: 0, bias: 0, blocked: 0, settle: 1, mergeYaw: 0,
        look: 0, lookYaw: 0, alert: 0, alarm: 0, tx: 0, tz: 0, flush: null, cryIndex: -1, cryAt: -1e9, flushes: 0,
        petUntil: 0, petHiss: false, petCool: 0, spot: null, heldAction: 'sit',
      });
    });
  }

  // ------------------------------------------------------------------ player actions

  /** Can the player pet this animal right now (E)? */
  pettable(index: number): boolean {
    const m = this.minds[index];
    return !!m && (m.def.kind === 'cat' || m.def.kind === 'dog') && !m.pose.airborne && m.petCool <= this.now && (m.mode === 'sched' || m.mode === 'hold' || m.mode === 'greet') && m.settle > 0.6;
  }
  /** Is this animal being petted right now (hearts)? */
  petted(index: number): boolean { const m = this.minds[index]; return !!m && m.mode === 'hold' && this.now < m.petUntil; }
  /** Start petting: the animal stays put and purrs (a cat, now and then a hiss) or wags (the dog). */
  pet(index: number, now: number, tick: number): boolean {
    const m = this.minds[index];
    if (!m || !this.pettable(index)) return false;
    const cat = m.def.kind === 'cat', hiss = cat && (m.def.id * 13 + Math.floor(tick / TICK_RATE)) % 9 === 0;
    if (m.mode === 'sched') this.toGhost(m);
    const a = m.sched.action;
    m.heldAction = cat && (a === 'sit' || a === 'groom' || a === 'sleep' || a === 'sniff') ? a : 'sit';
    m.mode = 'hold'; m.since = now; m.petHiss = hiss; m.petUntil = now + (hiss ? 2.4 : 3.2); m.until = m.petUntil; m.petCool = now + 5.5;
    this.events.push(cat ? { kind: 'purr', x: m.gx, y: m.gy + 0.3, z: m.gz, hiss } : { kind: 'woof', x: m.gx, y: m.gy + 0.4, z: m.gz });
    return true;
  }

  // ------------------------------------------------------------------ the frame

  update(tick: number, now: number, dt: number, camera: { x: number; z: number }, movers: readonly Mover[], scares: readonly Scare[] = []): void {
    this.events.length = 0; this.now = now; dt = clamp(dt, 0, 0.1);
    const dog = this.dogIndex >= 0 ? this.minds[this.dogIndex] : null;
    for (const m of this.minds) {
      sampleCritter(m.def, tick, m.sched);
      const ox = m.mode === 'sched' ? m.sched.x : m.gx, oz = m.mode === 'sched' ? m.sched.z : m.gz;
      const far = Math.hypot(camera.x - ox, camera.z - oz) > FAR;
      if (far && m.mode !== 'sched') { m.mode = 'sched'; m.settle = 1; m.bias = 0; m.flush = null; }   // out of sight: simply rejoin the schedule
      if (!far) {
        switch (m.def.kind) {
          case 'gull': this.gull(m, tick, now, movers, scares, dog); break;
          case 'cat': case 'dog': this.walker(m, now, dt, movers); break;
          case 'crab': this.crab(m, now, dt, movers); break;
        }
      }
      this.output(m, now, dt, movers, far);
    }
  }

  // ------------------------------------------------------------------ pose assembly

  private output(m: Mind, now: number, dt: number, movers: readonly Mover[], far: boolean): void {
    const p = m.pose, s = m.sched, kind = m.def.kind;
    if (m.mode === 'sched') {
      Object.assign(p, s);
      p.distance = s.distance + m.bias;
      if (m.settle < 1) {
        m.settle = Math.min(1, m.settle + dt / 0.9);
        const k = ease(m.settle);
        p.restWeight = s.restWeight * k; p.yaw = m.mergeYaw + wrap(s.yaw - m.mergeYaw) * k;
      }
      p.mood = 'none'; p.excite = 0; p.alarm = 0; p.cry = 0; p.look = 0; p.lookYaw = 0; p.lookPitch = 0;
      if (kind === 'crab') p.alarm = m.alarm;
    } else if (m.mode !== 'flush') {
      const moving = m.gspeed > 0.04, buried = m.mode === 'dig' || m.mode === 'pop';
      const held = m.mode === 'hold' || m.mode === 'greet' || m.mode === 'alarm';
      Object.assign(p, {
        x: m.gx, y: m.gy, z: m.gz, yaw: m.gyaw, pitch: 0, action: buried ? 'burrow' : held ? (m.mode === 'alarm' ? 'sit' : m.heldAction) : 'walk', mood: 'none', rest: null,
        moving, airborne: false, phase: 0, distance: m.dist, speed: m.gspeed, restWeight: m.mode === 'alarm' ? 0 : m.grest, age: now - m.since, remaining: Math.max(0, m.until - now), turn: 0,
        lookYaw: 0, lookPitch: 0, look: 0, excite: 0, alarm: 0, cry: 0,
      });
      if (moving && !buried && p.action !== 'walk' && m.mode !== 'hold' && m.mode !== 'greet') p.action = 'walk';
      if (m.mode === 'hold') {
        if (now < m.petUntil) { p.mood = kind === 'dog' ? 'greet' : m.petHiss ? 'hiss' : 'purr'; p.excite = kind === 'dog' ? 1 : 0; }
        else p.mood = 'alert';
      } else if (m.mode === 'greet') { p.mood = 'greet'; p.excite = 1; }
      else if (m.mode === 'run') p.excite = 0.7;
      else if (m.mode === 'dodge') p.mood = 'scare';
      if (kind === 'crab') p.alarm = m.mode === 'alarm' || m.mode === 'dash' ? 1 : m.alarm;
    }
    if (kind === 'crab') p.y = coveHeight(p.x, p.z);                    // always exactly on the sand surface
    if (kind === 'gull') {
      const cu = (now - m.cryAt) / CRY_LENGTH;
      p.cry = cu >= 0 && cu < 1 ? cryEnvelope(cu) : 0;
    }
    if (m.mode !== 'flush' && kind !== 'crab' && !far) this.attention(m, dt, movers);
  }

  /** Looking at whoever is near, plus the alert mood that goes with it. */
  private attention(m: Mind, dt: number, movers: readonly Mover[]): void {
    const p = m.pose, kind = m.def.kind;
    const range = kind === 'dog' ? 8 : kind === 'cat' ? 3.6 : 6;
    let best: Mover | null = null, bd = range;
    for (const o of movers) {
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d < bd && Math.abs(o.y - p.y) < 2.4) { bd = d; best = o; }
    }
    const asleep = p.action === 'sleep' && p.restWeight > 0.5;
    const pecking = kind === 'gull' && p.action === 'peck' && (p.age + m.def.id * 0.9) % 5.4 < 1.6;
    let target = best && !asleep && !pecking ? 1 : 0;
    if (best) {
      const rel = wrap(bearing(best.x - p.x, best.z - p.z) - p.yaw);
      if (Math.abs(rel) > 2.5) target *= 0.2;
      m.lookYaw = follow(m.lookYaw, clamp(rel, -1.3, 1.3), dt, 7);
    } else m.lookYaw = follow(m.lookYaw, 0, dt, 3);
    m.look = follow(m.look, target, dt, 4);
    p.look = m.look; p.lookYaw = m.lookYaw; p.lookPitch = best && best.y > p.y + 0.8 ? 0.25 : 0;
    const wantAlert = !!best && !asleep && kind !== 'gull' && (kind === 'dog' || bd < 2.2 || best.speed > 1);
    m.alert = follow(m.alert, wantAlert ? 1 : 0, dt, 3);
    if (p.mood === 'none' && m.alert > 0.5) p.mood = 'alert';
  }

  // ------------------------------------------------------------------ cats and the dog

  /** The visible body takes over from the schedule at the schedule's current place. */
  private toGhost(m: Mind): void {
    const s = m.sched;
    m.gx = s.x; m.gy = s.y; m.gz = s.z; m.gyaw = s.yaw; m.gspeed = s.speed; m.grest = s.restWeight; m.dist = s.distance + m.bias; m.blocked = 0;
  }
  private toSchedule(m: Mind, cooldown: number): void { m.mode = 'sched'; m.bias = m.dist - m.sched.distance; m.settle = 0; m.mergeYaw = m.gyaw; m.cooldown = this.now + cooldown; }

  /** Floor height if a body of radius r can stand at (x, z) on level y, else null. Never inside the memorial's quiet zone. */
  private standable(x: number, y: number, z: number, r: number): number | null {
    if (Math.hypot(x - CRITTER_QUIET_ZONE.x, z - CRITTER_QUIET_ZONE.z) < CRITTER_QUIET_ZONE.r + 0.3) return null;
    if (!this.world) return y;
    const f = this.world.floor(x, z, y);
    if (f === null || Math.abs(f - y) > 0.2) return null;
    return this.world.free(x, f, z, r, 0.45) ? f : null;
  }
  /** The straight line a→b stays on standable ground (checked every 0.35 m). */
  private pathClear(ax: number, az: number, bx: number, bz: number, y: number, r: number): boolean {
    const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / 0.35));
    for (let i = 1; i <= n; i++) { const u = i / n; if (this.standable(ax + (bx - ax) * u, y, az + (bz - az) * u, r) === null) return false; }
    return true;
  }
  /** Move the visible body toward (tx, tz); `force` ignores the ground checks (the last metre up onto a bench). Returns the distance left, or -1 when blocked. */
  private step(m: Mind, tx: number, tz: number, speed: number, dt: number, r: number, force = false): number {
    const dx = tx - m.gx, dz = tz - m.gz, d = Math.hypot(dx, dz);
    if (d < 1e-4) { m.gspeed = 0; return 0; }
    const v = Math.min(speed, d / Math.max(dt, 1e-3)), nx = m.gx + (dx / d) * v * dt, nz = m.gz + (dz / d) * v * dt;
    const f = force ? m.gy : this.standable(nx, m.gy, nz, r);
    if (f === null) { m.gspeed = follow(m.gspeed, 0, dt, 10); m.blocked += dt; return -1; }
    m.gx = nx; m.gz = nz; m.gy = f; m.blocked = 0;
    m.gspeed = follow(m.gspeed, v, dt, 10); m.dist += m.gspeed * dt;
    m.gyaw = turnTo(m.gyaw, bearing(dx, dz), dt, 9);
    return d - v * dt;
  }

  private walker(m: Mind, now: number, dt: number, movers: readonly Mover[]): void {
    const s = m.sched, kind = m.def.kind, r = kind === 'dog' ? 0.28 : 0.2;
    const here = m.mode === 'sched' ? s : { x: m.gx, y: m.gy, z: m.gz };
    let near: Mover | null = null, nd = Infinity;
    for (const o of movers) { const d = Math.hypot(o.x - here.x, o.z - here.z); if (d < nd && Math.abs(o.y - here.y) < 1.3) { nd = d; near = o; } }
    switch (m.mode) {
      case 'sched': {
        m.grest = s.restWeight;
        if (now < m.cooldown || s.airborne || !near) break;
        if (kind === 'cat') {
          const sleeping = s.action === 'sleep' && s.restWeight > 0.3, onGround = Math.abs(s.y) < 0.12;
          if (nd < CAT_DODGE_R * (near.speed > 4 ? 1.4 : 1) && near.speed > 1.5 && onGround && !sleeping) {
            const away = bearing(s.x - near.x, s.z - near.z);                       // heading directly away from the runner
            for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
              const h = away + turn, len = 1.5 + (m.def.id % 3) * 0.3, ex = s.x - Math.sin(h) * len, ez = s.z - Math.cos(h) * len;
              if (this.pathClear(s.x, s.z, ex, ez, s.y, r)) { this.toGhost(m); m.mode = 'dodge'; m.since = now; m.until = now + 9; m.tx = ex; m.tz = ez; break; }
            }
            if (m.mode === 'sched') m.cooldown = now + 2;
          }
        } else if (nd < DOG_NOTICE_R) {
          const ax = s.x - near.x, az = s.z - near.z, l = Math.hypot(ax, az) || 1, tx = near.x + (ax / l) * 1.5, tz = near.z + (az / l) * 1.5;
          if (this.pathClear(s.x, s.z, tx, tz, s.y, r)) {
            this.toGhost(m); m.mode = 'run'; m.since = now; m.until = now + 14; m.tx = tx; m.tz = tz;
            this.events.push({ kind: 'woof', x: s.x, y: s.y + 0.4, z: s.z });
          } else m.cooldown = now + 3;
        }
        break;
      }
      case 'dodge':
        m.grest = follow(m.grest, 0, dt, 6);
        if (this.step(m, m.tx, m.tz, 2.5, dt, r) < 0.08 || now > m.until) { m.mode = 'hold'; m.since = now; m.heldAction = 'sit'; m.petUntil = 0; m.petHiss = false; m.until = now + 1.2; }
        break;
      case 'hold': {
        m.gspeed = follow(m.gspeed, 0, dt, 10);
        m.grest = follow(m.grest, 1, dt, 3);
        // a dodged cat watches the runner and stays until the player has gone (or the pet is over)
        const stay = m.petUntil > 0 ? now < m.petUntil : near !== null && nd < 3.2 && now < m.since + 6;
        if (!stay && now >= m.until) { m.mode = 'return'; m.since = now; }
        break;
      }
      case 'run': {
        if (!near || nd > DOG_NOTICE_R + 3 || now > m.until) { m.mode = 'return'; m.since = now; break; }
        const ax = m.gx - near.x, az = m.gz - near.z, l = Math.hypot(ax, az) || 1;
        m.tx = near.x + (ax / l) * 1.45; m.tz = near.z + (az / l) * 1.45;
        m.grest = follow(m.grest, 0, dt, 4);
        if (this.step(m, m.tx, m.tz, 2.8, dt, r) < 0 && m.blocked > 0.5) { m.mode = 'return'; m.since = now; break; }
        if (Math.hypot(near.x - m.gx, near.z - m.gz) < 1.9) { m.mode = 'greet'; m.since = now; m.until = now + 10; m.heldAction = 'sit'; }
        break;
      }
      case 'greet': {
        if (!near || nd > 6 || now > m.until) { m.mode = 'return'; m.since = now; break; }
        m.grest = follow(m.grest, 0, dt, 4);
        m.heldAction = 'sit';
        if (nd > 2.4) { if (this.step(m, near.x, near.z, 1.6, dt, r) < 0 && m.blocked > 0.5) { m.mode = 'return'; m.since = now; } }
        else { m.gspeed = follow(m.gspeed, 0, dt, 10); m.gyaw = turnTo(m.gyaw, bearing(near.x - m.gx, near.z - m.gz), dt, 5); }
        break;
      }
      case 'return': {
        // walk back to wherever the schedule has got to; the last metre up onto a bench or crate is a hop
        const rise = Math.abs(s.y - m.gy) > 0.15, close = Math.hypot(s.x - m.gx, s.z - m.gz);
        const left = this.step(m, s.x, s.z, Math.max(1.4, s.speed + 0.8), dt, r, rise && close < 1.4);
        m.grest = follow(m.grest, 0, dt, 5);
        if (rise && close < 1.4) m.gy += (s.y - m.gy) * ease(1.1 - close);
        if ((left >= 0 && left < 0.1 + s.speed * dt * 2 && Math.abs(s.y - m.gy) < 0.2) || m.blocked > 1 || now > m.since + 25) {
          m.gx = s.x; m.gz = s.z; m.gy = s.y; this.toSchedule(m, kind === 'dog' ? 14 : 6);
        }
        break;
      }
      default: break;
    }
  }

  // ------------------------------------------------------------------ crabs

  private crab(m: Mind, now: number, dt: number, movers: readonly Mover[]): void {
    const s = m.sched, here = m.mode === 'sched' ? s : { x: m.gx, y: m.gy, z: m.gz };
    let nd = Infinity, who: Mover | null = null;
    for (const o of movers) { const d = Math.hypot(o.x - here.x, o.z - here.z, (o.y - here.y) * 0.8); if (d < nd) { nd = d; who = o; } }
    const lineDry = (x0: number, z0: number, x1: number, z1: number): boolean => {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.1));
      for (let i = 1; i <= n; i++) if (!coveDry(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n)) return false;
      return true;
    };
    m.alarm = follow(m.alarm, m.mode === 'sched' && nd < CRAB_ALARM_R + 0.6 ? 0.5 : 0, dt, 8);
    switch (m.mode) {
      case 'sched':
        if (now < m.cooldown || (s.action === 'burrow' && s.restWeight > 0.5) || nd > CRAB_ALARM_R) break;
        this.toGhost(m); m.gy = coveHeight(m.gx, m.gz); m.mode = 'alarm'; m.since = now; m.until = now + 0.45;
        break;
      case 'alarm': {
        m.gspeed = follow(m.gspeed, 0, dt, 12);
        if (now < m.until) break;
        if (nd > CRAB_ALARM_R + 0.8) { m.mode = 'return'; m.since = now; break; }
        // bolt for the nearest burrow of its own that is farther from the player, else dig in right here
        let spot: { x: number; z: number } | null = null, bd = Infinity;
        for (const st of m.def.stops) {
          if (st.action !== 'burrow') continue;
          const d = Math.hypot(st.x - m.gx, st.z - m.gz), away = who ? Math.hypot(st.x - who.x, st.z - who.z) > Math.hypot(m.gx - who.x, m.gz - who.z) : true;
          if (d < bd && d < 3.2 && away && lineDry(m.gx, m.gz, st.x, st.z)) { bd = d; spot = st; }
        }
        m.spot = spot; m.mode = spot ? 'dash' : 'dig'; m.since = now; m.until = now + (spot ? 4 : 4.5);
        break;
      }
      case 'dash':
        if (!m.spot || this.crabStep(m, m.spot.x, m.spot.z, 1.15, dt) < 0.06 || now > m.until) { m.mode = 'dig'; m.since = now; m.until = now + 4.5; m.gspeed = 0; }
        break;
      case 'dig':
        m.gspeed = follow(m.gspeed, 0, dt, 12);
        m.grest = follow(m.grest, 1, dt, 1.6);
        if (now >= m.until && nd > CRAB_ALARM_R + 0.4) { m.mode = 'pop'; m.since = now; }
        break;
      case 'pop':
        m.grest = follow(m.grest, 0, dt, 2.2);
        if (m.grest < 0.08) { m.grest = 0; m.mode = 'return'; m.since = now; }
        break;
      case 'return': {
        const left = this.crabStep(m, s.x, s.z, Math.max(0.55, s.speed + 0.35), dt);
        m.grest = follow(m.grest, s.restWeight, dt, 3);
        if (nd < CRAB_ALARM_R - 0.7 && now > m.since + 0.6) { m.mode = 'alarm'; m.since = now; m.until = now + 0.3; break; }
        if ((left >= 0 && left < 0.1 + s.speed * dt * 2) || m.blocked > 1.2 || now > m.since + 20) { m.gx = s.x; m.gz = s.z; m.gy = s.y; this.toSchedule(m, 5); }
        break;
      }
      default: break;
    }
  }
  /** One scuttle step over dry sand only (slides along x or z when the straight way is wet). Distance left, or -1 when stuck. */
  private crabStep(m: Mind, tx: number, tz: number, speed: number, dt: number): number {
    const dx = tx - m.gx, dz = tz - m.gz, d = Math.hypot(dx, dz);
    if (d < 1e-4) { m.gspeed = 0; return 0; }
    const v = Math.min(speed, d / Math.max(dt, 1e-3)), sx = (dx / d) * v * dt, sz = (dz / d) * v * dt;
    let nx = m.gx + sx, nz = m.gz + sz;
    if (!coveDry(nx, nz)) { nx = m.gx + sx; nz = m.gz; if (!coveDry(nx, nz)) { nx = m.gx; nz = m.gz + sz; if (!coveDry(nx, nz)) { m.gspeed = follow(m.gspeed, 0, dt, 12); m.blocked += dt; return -1; } } }
    m.blocked = 0; m.gx = nx; m.gz = nz; m.gy = coveHeight(nx, nz);
    m.gspeed = follow(m.gspeed, v, dt, 12); m.dist += m.gspeed * dt;
    m.gyaw = turnTo(m.gyaw, bearing(dx, dz), dt, 12);
    return d - v * dt;
  }

  // ------------------------------------------------------------------ gulls

  private gull(m: Mind, tick: number, now: number, movers: readonly Mover[], scares: readonly Scare[], dog: Mind | null): void {
    const s = m.sched;
    if (m.mode === 'flush') { this.flushPose(m, now); return; }
    // flush from a close player, a running dog, a landed fish
    if (now >= m.cooldown && s.action !== 'fly' && !s.airborne) {
      let sx = 0, sz = 0, hit = false;
      for (const o of movers) {
        if (Math.hypot(o.x - s.x, o.z - s.z) < (o.speed > 2.5 ? GULL_FLUSH_RUN_R : GULL_FLUSH_R) && Math.abs(o.y - s.y) < 2.4) { sx = o.x; sz = o.z; hit = true; break; }
      }
      if (!hit && dog && (dog.mode === 'run' || (dog.mode === 'sched' && dog.sched.moving)) && Math.hypot(dog.sched.x - s.x, dog.sched.z - s.z) < 2.2) { sx = dog.sched.x; sz = dog.sched.z; hit = true; }
      if (!hit) for (const c of scares) if (Math.hypot(c.x - s.x, c.z - s.z) < c.r) { sx = c.x; sz = c.z; hit = true; break; }
      if (hit) { this.startFlush(m, tick, now, sx, sz); this.flushPose(m, now); return; }
    }
    // the scheduled cry: every client agrees when this gull calls
    const { index, age } = gullCryIndex(m.def, tick);
    if (m.cryIndex < 0) m.cryIndex = index;
    else if (index !== m.cryIndex && age >= 0) { m.cryIndex = index; if (age < 0.4) this.events.push({ kind: 'cry', x: s.x, y: s.y + 0.25, z: s.z }); }
    if (age >= 0 && age < CRY_LENGTH) m.cryAt = now - age;
  }

  private startFlush(m: Mind, tick: number, now: number, sx: number, sz: number): void {
    const s = m.sched, def = m.def, id = def.id;
    let T = 4.6 + (id % 3) * 0.5, end = sampleCritter(def, tick + Math.round(T * TICK_RATE));
    for (let i = 0; i < 10 && (end.action === 'fly' || end.airborne); i++) { T += 0.5; end = sampleCritter(def, tick + Math.round(T * TICK_RATE)); }
    const first = def.stops.find((st) => st.loop) ?? def.stops[0];
    let fx = first.loop?.[0] ?? 0, fz = first.loop?.[1] ?? 3;
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    let ax = s.x - sx, az = s.z - sz; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
    let dx = 0.55 * ax + 0.9 * fx, dz = 0.55 * az + 0.9 * fz; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    // the circle curls to whichever side is seaward (toward the gull's usual flight loop), so the lap stays over open water
    const side = Math.sign(-dz * fx + dx * fz) || 1;
    m.flush = { t0: now, T, p0: [s.x, s.y, s.z], end: [end.x, end.y, end.z], endYaw: end.yaw, ax: dx, az: dz, cx: -dz * side, cz: dx * side, R: 1.9 + (id % 3) * 0.35, H: 1.5 + (id % 4) * 0.25 };
    m.mode = 'flush'; m.since = now; m.until = now + T; m.flushes++;
    if ((id * 7 + m.flushes * 3) % 5 < 3) { m.cryAt = now + 0.25; this.events.push({ kind: 'cry', x: s.x, y: s.y + 0.4, z: s.z }); }   // many squawk as they go
  }

  private flushPose(m: Mind, now: number): void {
    const f = m.flush!, p = m.pose, u = clamp01((now - f.t0) / f.T);
    const at = (uu: number, out: [number, number, number]): void => {
      const e = ease(uu), phi = uu * Math.PI * 2, v = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(uu, 0.72))), 1.15);
      out[0] = f.p0[0] + (f.end[0] - f.p0[0]) * e + f.R * (f.cx * (1 - Math.cos(phi)) + f.ax * Math.sin(phi));
      out[2] = f.p0[2] + (f.end[2] - f.p0[2]) * e + f.R * (f.cz * (1 - Math.cos(phi)) + f.az * Math.sin(phi));
      out[1] = f.p0[1] + (f.end[1] - f.p0[1]) * e + f.H * v;
    };
    const a: [number, number, number] = [0, 0, 0], b: [number, number, number] = [0, 0, 0], c: [number, number, number] = [0, 0, 0];
    at(u, a); at(Math.max(0, u - 0.004), b); at(Math.min(1, u + 0.004), c);
    const span = (Math.min(1, u + 0.004) - Math.max(0, u - 0.004)) * f.T, vx = (c[0] - b[0]) / span, vz = (c[2] - b[2]) / span, vy = (c[1] - b[1]) / span, h = Math.hypot(vx, vz);
    const heading = h > 0.15 ? bearing(vx, vz) : f.endYaw, fin = ease((u - 0.82) / 0.18);
    Object.assign(p, {
      x: a[0], y: a[1], z: a[2], yaw: heading + wrap(f.endYaw - heading) * fin, pitch: Math.atan2(vy, Math.max(h, 0.4)), action: u < 1 ? 'fly' : m.sched.action, mood: 'none', rest: null,
      moving: true, airborne: true, phase: u, distance: m.sched.distance, speed: h, restWeight: 0, age: now - f.t0, remaining: Math.max(0, f.T - (now - f.t0)), turn: 0,
      lookYaw: 0, lookPitch: 0, look: 0, excite: 0.8, alarm: 0, cry: 0,
    });
    if (u >= 1) { m.mode = 'sched'; m.settle = 1; m.bias = 0; m.cooldown = now + 9; m.flush = null; }
  }
}

/** Two short syllables, like the sound: open-close-open-close. */
export function cryEnvelope(u: number): number {
  const syl = (a: number, b: number): number => (u > a && u < b ? Math.pow(Math.sin(Math.PI * (u - a) / (b - a)), 0.7) : 0);
  return Math.max(syl(0, 0.43), syl(0.46, 0.92));
}
