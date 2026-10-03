// Fixed 60Hz marine adaptation of kart's heading/steering model; no kart globals changed.
import { DT } from './constants.ts';
import { sinCos } from './math.ts';
import { BR_LAPS, BR_NITRO_TICKS, BR_RADIUS, type BoatEvents, type BoatState } from './boatrace.ts';
import type { BoatCourse } from './boatracemap.ts';
import { BTN_BACK, BTN_FIRE, BTN_FORWARD, BTN_LEFT, BTN_RELOAD, BTN_RIGHT, BTN_USE, type Input } from './sim.ts';
import { locateAny, makeLoc } from './track.ts';
const sc = { s: 0, c: 0 };
const loc = makeLoc();
export function boatWave(x: number, z: number, tick: number): { y: number; pitch: number; roll: number } {
  sinCos(x * 0.025 + tick * 0.016, sc); const a = sc.s, da = sc.c;
  sinCos(z * 0.04 - tick * 0.011, sc);
  return { y: a * 0.18 + sc.s * 0.1, pitch: da * 0.035, roll: sc.c * 0.045 };
}
export function placeBoat(s: BoatState, course: BoatCourse, slot: number): void {
  const g = course.gates[0], row = Math.floor(slot / 2), side = slot % 2 ? 1 : -1;
  s.x = g.x - g.hx * (7 + row * 4.5) - g.hz * side * 2.8;
  s.z = g.z - g.hz * (7 + row * 4.5) + g.hx * side * 2.8;
  s.hx = g.hx; s.hz = g.hz; s.seg = locateAny(course.track, s.x, s.z, loc).seg;
}
export function recoverBoat(s: BoatState, course: BoatCourse): void {
  const g = course.gates[s.cp];
  // Last passed gate, safely beyond its plane: recovering cannot mint a gate crossing.
  s.x = g.x + g.hx * 3; s.z = g.z + g.hz * 3; s.hx = g.hx; s.hz = g.hz;
  s.vx = s.vz = s.steer = 0; s.seg = g.seg; s.ghost = 120; s.off = 0; s.boost = 0; s.respawns++;
  // Before first start crossing, recover behind start so the first lap can still begin.
  if (s.lap === 0) { s.x = g.x - g.hx * 5; s.z = g.z - g.hz * 5; }
}
export function boatGateCrossing(s: BoatState, course: BoatCourse, oldX: number, oldZ: number, ev: BoatEvents): void {
  if (s.done) return;
  const next = s.lap === 0 ? 0 : (s.cp + 1) % course.gates.length, g = course.gates[next];
  const a = (oldX - g.x) * g.hx + (oldZ - g.z) * g.hz, b = (s.x - g.x) * g.hx + (s.z - g.z) * g.hz;
  if (a >= 0 || b < 0 || b - a > 2 || s.vx * g.hx + s.vz * g.hz <= 0) return;
  const u = -a / (b - a), x = oldX + (s.x - oldX) * u, z = oldZ + (s.z - oldZ) * u;
  const lat = (x - g.x) * -g.hz + (z - g.z) * g.hx;
  if (Math.abs(lat) > g.half - BR_RADIUS) return;
  s.cp = next; ev.checkpoint = true;
  if (next === 0) { if (s.lap === BR_LAPS) { s.done = 1; ev.finish = true; } else { s.lap++; ev.lap = true; } }
  if (course.pickups.includes(next) && !s.nitro) s.nitro = 1;
}
export function stepBoat(s: BoatState, inp: Input, course: BoatCourse, ev: BoatEvents, drive: boolean): void {
  ev.checkpoint = ev.lap = ev.finish = ev.boost = ev.respawn = false; ev.hit = 0;
  const pressed = inp.buttons & ~s.prevButtons; s.prevButtons = inp.buttons;
  if (s.ghost > 0) s.ghost--;
  if (!drive || s.done) { s.vx *= 0.93; s.vz *= 0.93; return; }
  s.rt++;
  if ((pressed & BTN_RELOAD) && s.ghost === 0) { recoverBoat(s, course); ev.respawn = true; return; }
  if ((pressed & (BTN_FIRE | BTN_USE)) && s.nitro) { s.nitro = 0; s.boost = BR_NITRO_TICKS; ev.boost = true; }
  if (s.boost > 0) s.boost--;
  const oldX = s.x, oldZ = s.z;
  const target = ((inp.buttons & BTN_LEFT) ? 1 : 0) - ((inp.buttons & BTN_RIGHT) ? 1 : 0);
  s.steer += Math.max(-0.075, Math.min(0.075, target - s.steer));
  let forward = s.vx * s.hx + s.vz * s.hz;
  let lateral = s.vx * -s.hz + s.vz * s.hx;
  const speed = Math.abs(forward), turn = s.steer * 1.42 * (0.28 + 0.72 * Math.min(1, speed / 5)) * (1 - 0.26 * Math.min(1, speed / 23)) * (forward < -0.5 ? -1 : 1) * DT;
  sinCos(turn, sc); const hx = s.hx * sc.c + s.hz * sc.s, hz = -s.hx * sc.s + s.hz * sc.c;
  const norm = Math.sqrt(hx * hx + hz * hz); s.hx = hx / norm; s.hz = hz / norm;
  // Water keeps lateral momentum while the rudder rotates the bow.
  forward = s.vx * s.hx + s.vz * s.hz; lateral = (s.vx * -s.hz + s.vz * s.hx) * 0.945;
  const throttle = !!(inp.buttons & BTN_FORWARD), brake = !!(inp.buttons & BTN_BACK), top = s.boost ? 30 : 23;
  if (throttle || s.boost) forward += (s.boost ? 20 : 12) * (1 - 0.42 * Math.min(1, Math.max(0, forward) / top)) * DT;
  if (brake) forward -= (forward > 0 ? 23 : 7) * DT;
  // Quadratic hull resistance plus coasting drag; stable at max speed, reverse is bounded.
  const drag = (0.7 + 0.012 * forward * forward + (!throttle && !s.boost ? 1.8 : 0)) * DT;
  forward = Math.sign(forward) * Math.max(0, Math.abs(forward) - drag);
  forward = Math.max(-5, Math.min(top, forward));
  s.vx = s.hx * forward - s.hz * lateral; s.vz = s.hz * forward + s.hx * lateral;
  s.x += s.vx * DT; s.z += s.vz * DT;
  for (const buoy of course.buoys) {
    const dx = s.x - buoy.x, dz = s.z - buoy.z, d = Math.sqrt(dx * dx + dz * dz), r = BR_RADIUS + 0.55;
    if (d >= r) continue;
    const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
    s.x = buoy.x + nx * r; s.z = buoy.z + nz * r;
    const v = s.vx * nx + s.vz * nz; if (v < 0) { s.vx -= v * 1.3 * nx; s.vz -= v * 1.3 * nz; ev.hit = Math.max(ev.hit, -v); }
  }
  const at = locateAny(course.track, s.x, s.z, loc); s.seg = at.seg;
  const dx = s.x - (course.track.px[at.seg] + course.track.tx[at.seg] * course.track.len[at.seg] * at.t), dz = s.z - (course.track.pz[at.seg] + course.track.tz[at.seg] * course.track.len[at.seg] * at.t);
  const distance = Math.sqrt(dx * dx + dz * dz);
  if (distance > 14) { s.off++; s.vx *= 0.985; s.vz *= 0.985; } else s.off = 0;
  if (s.off > 180 || distance > 40 || !Number.isFinite(s.x + s.z)) { recoverBoat(s, course); ev.respawn = true; return; }
  // No progress outside the marked navigable corridor.
  if (distance <= 14) boatGateCrossing(s, course, oldX, oldZ, ev);
}
/** Symmetric soft hull contact. Ghost recovery protects both boats from repeated spawn collisions. */
export function collideBoats(a: BoatState, b: BoatState): boolean {
  if (a.ghost || b.ghost || a.done || b.done) return false;
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.sqrt(dx * dx + dz * dz), r = BR_RADIUS * 2;
  if (d >= r) return false;
  const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0, push = (r - d) / 2;
  a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
  const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  if (closing > 0) { const impulse = Math.min(8, closing * 0.6); a.vx -= nx * impulse; a.vz -= nz * impulse; b.vx += nx * impulse; b.vz += nz * impulse; }
  return true;
}
