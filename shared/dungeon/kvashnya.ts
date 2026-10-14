import { D, mobDef } from './data.ts';
import { fx, hurtHero, KB_DECAY, KB_V } from './core.ts';
import { addMark, pushHero } from './mobs.ts';
import { heroInMark } from './attack-footprint.ts';
import { blocked, collide, T_SOLID, T_PIT, T_WATER, terrainAt } from './map.ts';
import { DT, ticks, wrapD, wrapP } from './util.ts';
import type { DgSim, DgMob, DgMark } from './types.ts';

import { KVASHNYA_TIMING, cancelKvashnya } from './kvashnya-state.ts';
export { KVASHNYA_TIMING } from './kvashnya-state.ts';
const MOUTH = .95, TONGUE_RANGE = 6, TONGUE_WIDTH = .9, JUMP_RANGE = 5.5;

/** Conservative swept checks avoid both walls and narrow obstacles between the endpoints. */
export function kvashnyaClearPath(x: number, z: number, tx: number, tz: number, radius: number, mask = T_SOLID): boolean {
  const dx = wrapD(tx - x), dz = wrapD(tz - z), steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dz * dz) / .2));
  for (let i = 0; i <= steps; i++) {
    if (collide(wrapP(x + dx * i / steps), wrapP(z + dz * i / steps), radius, mask).hit) return false;
  }
  return true;
}
/** The shared mark resolver is the only place applying damage/pull: one impact per action. */
export function hitKvashnyaMark(sim: DgSim, mk: DgMark): void {
  const m = sim.mobs.find(m => m.id === mk.src);
  const kind = mk.what === 'kvashnya_tongue' ? 'tongue' : 'jump';
  if (!m || m.die || m.k !== 'kvashnya' || m.attackKind !== kind || m.attackStep !== 0) return;
  m.attackStep = 1;
  fx(sim, { k: 'atk', id: m.id, what: mk.what });
  if (!heroInMark(sim.hero, mk)) return;
  if (kind === 'tongue' && !kvashnyaClearPath(mk.x, mk.z, sim.hero.x, sim.hero.z, .1)) return;
  if (!hurtHero(sim, mk.dmg, 'kvashnya')) return;
  m.touch = ticks(D.hero.contactHitCooldown);
  if (kind === 'tongue') {
    const x = wrapD(m.x - sim.hero.x), z = wrapD(m.z - sim.hero.z), d = Math.sqrt(x * x + z * z) || 1;
    pushHero(sim, x / d, z / d, 1.5);
  }
}

export function stepKvashnya(sim: DgSim, m: DgMob): void {
  advanceKvashnya(sim, m);
  const age = m.attackAt === undefined ? -1 : sim.t - m.attackAt;
  const timing = KVASHNYA_TIMING.jump;
  const airborne = m.attackKind === 'jump' && age >= timing.windup + timing.takeoff && age < timing.windup + timing.attack;
  // Special impact owns this tick; contact must not consume its damage immunity first.
  const impact = sim.marks.some(mk => mk.src === m.id && mk.t1 === sim.t);
  const h = sim.hero, x = wrapD(h.x - m.x), z = wrapD(h.z - m.z);
  if (!airborne && !impact && m.st !== 'flee' && m.touch === 0 && h.ride < 0 && x * x + z * z < (m.r + .45) ** 2 && hurtHero(sim, m.dmg, m.k)) m.touch = ticks(D.hero.contactHitCooldown);
}

function advanceKvashnya(sim: DgSim, m: DgMob): void {
  m.vx = m.vz = 0;
  if (sim.freezeT > sim.t) {
    if (m.attackAt !== undefined) m.attackAt++;
    for (const mk of sim.marks) if (mk.src === m.id) { mk.t0++; mk.t1++; }
    return;
  }
  if (m.stunT > sim.t) cancelKvashnya(sim, m);
  const activeJump = m.attackKind === 'jump' && m.attackAt !== undefined && sim.t - m.attackAt >= KVASHNYA_TIMING.jump.windup && sim.t - m.attackAt < KVASHNYA_TIMING.jump.windup + KVASHNYA_TIMING.jump.attack;
  if (m.stunT > sim.t && !activeJump) {
    if (m.attackAt !== undefined) m.attackAt++;
    for (const mk of sim.marks) if (mk.src === m.id) { mk.t0++; mk.t1++; }
    m.kx = m.kz = 0;
    return;
  }
  if (m.cd > 0) m.cd--;
  if (m.attackAt !== undefined) {
    m.kx = m.kz = 0; // Braced attacks cannot drift away from their fixed warning.
    const age = sim.t - m.attackAt;
    if (m.attackKind === 'recover') {
      if (age >= KVASHNYA_TIMING.tongue.recover) { m.attackAt = undefined; m.attackKind = undefined; m.st = 'walk'; }
      return;
    }
    const kind = m.attackKind === 'jump' ? 'jump' : 'tongue', timing = KVASHNYA_TIMING[kind];
    m.st = age < timing.windup ? 'wind' : age < timing.windup + timing.attack ? 'attack' : 'rest';
    if (kind === 'jump' && age >= timing.windup) {
      // Reach the fixed target on the authored impact frame, then remain grounded through recovery.
      const takeoff = KVASHNYA_TIMING.jump.takeoff;
      const f = Math.max(0, Math.min(1, (age - timing.windup - takeoff) / (timing.impact - takeoff)));
      const x = wrapP(m.attackX0! + wrapD(m.attackX1! - m.attackX0!) * f);
      const z = wrapP(m.attackZ0! + wrapD(m.attackZ1! - m.attackZ0!) * f);
      m.vx = wrapD(x - m.x) / DT; m.vz = wrapD(z - m.z) / DT; m.x = x; m.z = z;
    }
    if (age >= timing.windup + timing.attack + timing.recover) { m.attackAt = undefined; m.attackKind = undefined; m.st = 'walk'; }
    return;
  }
  const h = sim.hero, x = wrapD(h.x - m.x), z = wrapD(h.z - m.z), distance = Math.sqrt(x * x + z * z), d = distance || 1;
  const ox = x / d, oz = z / d;
  const tongueReady = distance > MOUTH && distance <= MOUTH + TONGUE_RANGE && kvashnyaClearPath(m.x + ox * MOUTH, m.z + oz * MOUTH, h.x, h.z, .1);
  const jumpReady = distance >= 2 && distance <= 9;
  let kind: 'tongue' | 'jump' | undefined = m.attackNext === 'jump' && jumpReady ? 'jump' : tongueReady ? 'tongue' : jumpReady ? 'jump' : undefined;
  const tx = wrapP(m.x + ox * Math.min(distance, JUMP_RANGE)), tz = wrapP(m.z + oz * Math.min(distance, JUMP_RANGE));
  if (kind === 'jump' && (blocked(tx, tz, m.r) || !kvashnyaClearPath(m.x, m.z, tx, tz, m.r, T_SOLID | T_PIT))) kind = tongueReady ? 'tongue' : undefined;
  const warnings = sim.marks.filter(mk => mk.t1 >= sim.t && !mk.own && mk.src >= 0).length;
  if (m.cd === 0 && kind && warnings < D.expansion.newTelegraphs) {
    const timing = KVASHNYA_TIMING[kind];
    m.attackAt = sim.t; m.attackKind = kind; m.attackNext = kind === 'tongue' ? 'jump' : 'tongue'; m.attackStep = 0;
    m.attackX0 = m.x; m.attackZ0 = m.z; m.attackX1 = tx; m.attackZ1 = tz;
    m.ax = m.dx = ox; m.az = m.dz = oz; m.kx = m.kz = 0; m.st = 'wind'; m.stT = sim.t; m.cd = KVASHNYA_TIMING.cycle;
    const scale = m.dmg / mobDef('kvashnya').dmg;
    if (kind === 'tongue') addMark(sim, 'lane', 'kvashnya_tongue', m.x + ox * MOUTH, m.z + oz * MOUTH, 0, ox, oz, timing.windup + timing.impact, 18 * scale, 0, 0, m, TONGUE_RANGE, TONGUE_WIDTH);
    else addMark(sim, 'circle', 'kvashnya_jump', tx, tz, 1.65, 0, 0, timing.windup + timing.impact, 22 * scale, 0, 0, m);
    fx(sim, { k: 'atk', id: m.id, what: kind });
    return;
  }
  m.st = 'walk';
  // Same one-second side kick as the ordinary mob walk path; never shifts a braced attack.
  if (sim.t - m.chkT >= 30) {
    if (distance > 3 && distance > m.chkD - .3) {
      const side = m.id & 1 ? 1 : -1;
      m.kx += -oz * side * 3 * KB_V * .5;
      m.kz += ox * side * 3 * KB_V * .5;
    }
    m.chkT = sim.t; m.chkD = distance;
  }
  // Cooldown is a real pause after recovery, not another attack chain. Walking and ordinary knockback remain collidable.
  let slow = terrainAt(m.x, m.z) & T_WATER ? 1 - (D.terrain?.water?.slowAll ?? .25) : 1;
  const lamp = D.interactables.find(p => p.id === 'lamppost');
  if (lamp) for (const p of sim.props) if (p.k === 'lamp' && p.st === 1) {
    const lx = wrapD(p.x - m.x), lz = wrapD(p.z - m.z);
    if (lx * lx + lz * lz < Number(lamp.lightRadius) ** 2) slow = Math.min(slow, 1 - Number(lamp.eliteSlow));
  }
  const speed = distance > m.r + .45 ? m.spd * slow * (distance > 30 ? 2 : 1) : 0;
  const c = collide(m.x + (ox * speed + m.kx) * DT, m.z + (oz * speed + m.kz) * DT, m.r, T_SOLID | T_PIT);
  m.vx = wrapD(c.x - m.x) / DT; m.vz = wrapD(c.z - m.z) / DT; m.x = wrapP(c.x); m.z = wrapP(c.z);
  m.kx *= KB_DECAY; m.kz *= KB_DECAY;
  if (distance > 1e-6) { m.dx = ox; m.dz = oz; }
}
