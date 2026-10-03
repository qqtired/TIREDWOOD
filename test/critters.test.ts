import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CRITTERS, CRITTER_COVE, CRITTER_QUIET_ZONE, coveDry, coveHeight, type CritterDef } from '../shared/maps/critters.ts';
import { critterPeriod, sampleCritter } from '../client/lobby/crittersim.ts';
import { CritterBrain, brainWorld, type Mind, type Mover } from '../client/lobby/critterbrain.ts';
import { buildLobby } from '../shared/maps/lobby.ts';
import { CollisionWorld } from '../shared/world.ts';
import { TICK_RATE, WATER_Y } from '../shared/constants.ts';
import { makeState, makeEvents, stepPlayer, BTN_FORWARD, BTN_JUMP, BTN_ADS } from '../shared/sim.ts';

const world = new CollisionWorld(buildLobby());
const defOf = (id: number): CritterDef => CRITTERS.find((d) => d.id === id)!;
const farFromMemorial = (x: number, z: number): boolean => Math.hypot(x - CRITTER_QUIET_ZONE.x, z - CRITTER_QUIET_ZONE.z) > CRITTER_QUIET_ZONE.r;

test('fifteen animals in the exact roster; sampling does not depend on who asks or when', () => {
  assert.equal(CRITTERS.length, 15); assert.equal(new Set(CRITTERS.map((d) => d.id)).size, 15);
  assert.deepEqual(['cat', 'gull', 'crab', 'dog'].map((k) => CRITTERS.filter((d) => d.kind === k).length), [4, 6, 4, 1]);
  for (const def of CRITTERS) for (const tick of [0, 1, 400, 12345, 1e8]) {
    const a = sampleCritter(def, tick); sampleCritter(def, tick + 1000); assert.deepEqual(sampleCritter(def, tick), a);
  }
});

test('routes stay out of water, walls, the memorial and the courses; crabs only on dry sand; no sudden jumps in the schedule', () => {
  for (const def of CRITTERS) {
    let previous = sampleCritter(def, 0);
    for (let time = 0; time < critterPeriod(def); time += 0.12) {
      const p = sampleCritter(def, (time - def.phase + critterPeriod(def)) * TICK_RATE);
      assert.ok(farFromMemorial(p.x, p.z), `${def.id} memorial`);
      if (p.action !== 'fly') assert.ok(p.x > -29.4 && p.z < 46.5, 'not on the aqua park or the race course');
      if (def.kind === 'crab') {
        assert.ok(coveDry(p.x, p.z), `crab ${def.id} on dry sand at ${p.x},${p.z}`);
        assert.ok(Math.abs(p.y - coveHeight(p.x, p.z)) < 0.05 && p.y > WATER_Y, 'crab stands on the sand surface');
        continue;
      }
      if (p.action === 'fly') continue;
      assert.ok(world.groundBelow(p.x, p.y + 0.01, p.z) > WATER_Y, `${def.id} water at ${p.x},${p.z}`);
      assert.ok(!world.overlaps(p.x - 0.13, p.y + 0.015, p.z - 0.13, p.x + 0.13, p.y + 0.45, p.z + 0.13), `${def.id} inside geometry at ${p.x},${p.y},${p.z}`);
      if (def.kind === 'cat' && !p.moving) assert.ok(def.stops.some((s) => s.rest === p.rest && s.x === p.x && s.z === p.z), 'cats rest at named stops only');
    }
    for (let tick = 1; tick < critterPeriod(def) * TICK_RATE; tick++) {
      const p = sampleCritter(def, tick);
      assert.ok(Math.hypot(p.x - previous.x, p.y - previous.y, p.z - previous.z) < 0.2, `${def.id} no teleport`);
      assert.ok(Math.abs(Math.atan2(Math.sin(p.yaw - previous.yaw), Math.cos(p.yaw - previous.yaw))) < 0.2, `${def.id} no heading snap`);
      assert.ok(p.distance + 1e-7 >= previous.distance, 'gait distance never runs backwards');
      previous = p;
    }
  }
});

test('the sandbar: visible sand and solid underfoot agree, nothing floats over it, the plateau is walkable', () => {
  const dryPoints: Array<[number, number]> = [];
  for (let x = -19; x < -12; x += 0.1) for (let z = 22.15; z < 27.3; z += 0.1) {
    const h = coveHeight(x, z), solid = world.groundBelow(x, -0.5, z);
    assert.ok(solid === -Infinity || solid <= h + 0.003, `solid ${solid} above the visible sand ${h} at ${x},${z}`);
    if (h > CRITTER_COVE.dry && farFromMemorial(x, z)) dryPoints.push([x, z]);
    if (h > CRITTER_COVE.dry && x > -16.9) assert.ok(world.groundBelow(x, h + 0.4, z) <= h + 0.003, `nothing solid stands above the sand at ${x},${z}`);
  }
  assert.ok(dryPoints.length > 150 && dryPoints.length * 0.01 < 14, `a compact bank (${(dryPoints.length * 0.01).toFixed(1)} m2 dry)`);
  assert.ok(Math.abs(world.groundBelow(-14.6, -0.5, 23.2) - coveHeight(-14.6, 23.2)) < 0.08, 'solid plateau under the main bank');
  for (const [x, z] of dryPoints) assert.ok(farFromMemorial(x, z) && x > -19 && x < -12 && z < 27.3, 'sand stays clear of the memorial and inside its 7 x 5 m patch');
});

test('a player can step off the jetty onto the sand beside the pile and jump back up onto the planks', () => {
  const p = makeState(), events = makeEvents();
  let seq = 0;
  /** Walk toward (tx, tz); optionally jump once at the start. Stops when grounded within 0.2 m. */
  const go = (tx: number, tz: number, jump: boolean, ticks = 260): void => {
    let jumped = !jump;
    for (let i = 0; i < ticks; i++) {
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      let buttons = d > 0.1 ? BTN_FORWARD | BTN_ADS : 0;
      if (!jumped && p.grounded) { buttons |= BTN_JUMP; jumped = true; }
      stepPlayer(p, { seq: ++seq, buttons, yaw: Math.atan2(-dx, -dz), pitch: 0, viewTick: 0 }, world, false, 23, events);
      assert.ok(p.y > WATER_Y, `no fall into the sea at ${p.x},${p.y},${p.z}`);
      if (jumped && i > 12 && p.grounded && d < 0.2) return;
    }
    assert.fail(`failed to reach ${tx},${tz}, ended at ${p.x}/${p.y}/${p.z}`);
  };
  // the jetty's east edge: walk off onto the sand beside the first pile, then jump back onto the planks
  Object.assign(p, { x: -17.5, y: 0, z: 24.9, grounded: 1 });
  go(-16.4, 24.9, false);
  assert.ok(Math.abs(p.y - coveHeight(p.x, p.z)) < 0.12, `standing on the sand (${p.y} vs ${coveHeight(p.x, p.z)})`);
  go(-17.6, 24.9, true);
  assert.ok(Math.abs(p.y) < 0.001, 'back on the planks');
});

// ------------------------------------------------------------------ local reactions

const brainWorldReal = brainWorld(world);
const everyDt = 1 / 30;
interface Run { brain: CritterBrain; now: number; tick: number }
function start(tick0: number, camera = { x: 0, z: 20 }): Run & { camera: { x: number; z: number } } { return { brain: new CritterBrain(CRITTERS, brainWorldReal), now: 0, tick: tick0, camera }; }
function advance(run: Run & { camera: { x: number; z: number } }, seconds: number, movers: (t: number) => Mover[], each?: (t: number) => void): void {
  const end = run.now + seconds;
  while (run.now < end - 1e-9) {
    run.now += everyDt; run.tick += everyDt * TICK_RATE;
    run.brain.update(run.tick, run.now, everyDt, run.camera, movers(run.now));
    each?.(run.now);
  }
}
const mover = (x: number, z: number, speed = 0, y = 0, id = 1): Mover => ({ id, x, y, z, speed });
/** First tick (from `from`) at which the animal is doing `action` on the ground, held for at least `hold` more seconds. */
function findTick(def: CritterDef, action: string, hold = 4, from = 1, ground = true): number {
  for (let t = from; t < critterPeriod(def) * TICK_RATE; t += 6) { const p = sampleCritter(def, t); if (p.action === action && p.remaining > hold && p.age > 1.5 && (!ground || Math.abs(p.y) < 0.05)) return t; }
  throw new Error(`no ${action} for ${def.id}`);
}
const mind = (run: { brain: CritterBrain }, id: number): Mind => run.brain.minds.find((m) => m.def.id === id)!;

test('gull flushes in an arc from a runner, then lands exactly where the schedule has it', () => {
  const def = defOf(5), tick = findTick(def, 'peck', 8), s0 = sampleCritter(def, tick);
  const run = start(tick, { x: s0.x, z: s0.z + 6 }), m = mind(run, 5);
  let maxLift = 0, flew = false, minDist = Infinity, last = m.pose.y;
  advance(run, 0.5, () => [mover(s0.x - 6, s0.z, 0)]);
  assert.equal(m.mode, 'sched', 'a far calm player does nothing');
  advance(run, 14, (t) => [mover(s0.x - 2.5 + (t < 1 ? 0 : 99), s0.z, t < 1 ? 5 : 0)], () => {
    const sched = m.sched;
    if (m.mode === 'flush') {
      flew = true; maxLift = Math.max(maxLift, m.pose.y - sched.y);
      assert.equal(m.pose.action, 'fly'); assert.ok(Number.isFinite(m.pose.x + m.pose.y + m.pose.z + m.pose.yaw + m.pose.pitch));
      assert.ok(Math.hypot(m.pose.y - last) < 0.5, 'no teleporting up'); last = m.pose.y;
    } else if (flew) minDist = Math.min(minDist, Math.hypot(m.pose.x - sched.x, m.pose.y - sched.y, m.pose.z - sched.z));
  });
  assert.ok(flew && maxLift > 1.1, `it took off (lift ${maxLift})`);
  assert.equal(m.mode, 'sched');
  assert.ok(minDist < 0.02, `landed exactly on the schedule (${minDist})`);
  assert.deepEqual([m.pose.x, m.pose.y, m.pose.z], [m.sched.x, m.sched.y, m.sched.z]);
  // the schedule itself was never touched
  assert.deepEqual(sampleCritter(def, run.tick), m.sched);
});

test('cat steps away from a runner onto safe ground and strolls back; sleepers and elevated cats stay put', () => {
  const def = defOf(3), tick = findTick(def, 'sit', 6), s0 = sampleCritter(def, tick);
  const run = start(tick, { x: s0.x, z: s0.z + 5 }), m = mind(run, 3);
  let away = 0, dodged = false;
  advance(run, 8, (t) => [mover(s0.x - 3.2 + Math.min(t, 1.5) * 1.6, s0.z, 5)], () => {
    if (m.mode === 'dodge' || m.mode === 'hold') {
      dodged = true; away = Math.max(away, Math.hypot(m.pose.x - m.sched.x, m.pose.z - m.sched.z));
      assert.ok(farFromMemorial(m.pose.x, m.pose.z), 'never into the memorial zone');
      assert.ok(brainWorldReal.floor(m.pose.x, m.pose.z, m.pose.y) !== null && brainWorldReal.free(m.pose.x, m.pose.y, m.pose.z, 0.15, 0.4), `safe ground at ${m.pose.x},${m.pose.z}`);
    }
  });
  assert.ok(dodged && away > 1.0, `the cat stepped away (${away.toFixed(2)} m)`);
  advance(run, 30, () => [mover(s0.x + 40, s0.z, 0)]);
  assert.equal(m.mode, 'sched', 'back on schedule once the player has gone');
  assert.ok(Math.hypot(m.pose.x - m.sched.x, m.pose.z - m.sched.z) < 0.05);
  // asleep on the bench: no dodging
  const bench = defOf(0), sleepTick = findTick(bench, 'sleep', 6, 1, false), sp = sampleCritter(bench, sleepTick);
  const run2 = start(sleepTick, { x: sp.x, z: sp.z + 4 }), bm = mind(run2, 0);
  advance(run2, 4, () => [mover(sp.x + 1.2, sp.z, 5, sp.y)]);
  assert.equal(bm.mode, 'sched', 'a sleeping, elevated cat is left alone');
});

test('the dog runs up to the nearest player, wags and watches, then trots back to its route', () => {
  const def = defOf(14), tick = findTick(def, 'sit', 4, 1), s0 = sampleCritter(def, tick);
  const run = start(tick, { x: s0.x, z: s0.z + 6 }), m = mind(run, 14);
  const px = s0.x - 8, pz = s0.z;
  let greeted = false, ran = false;
  advance(run, 10, () => [mover(px, pz, 0)], () => {
    if (m.mode === 'run') ran = true;
    if (m.mode === 'greet') { greeted = true; assert.equal(m.pose.mood, 'greet'); assert.equal(m.pose.excite, 1); }
    if (m.mode !== 'sched') { assert.ok(farFromMemorial(m.pose.x, m.pose.z)); assert.ok(brainWorldReal.floor(m.pose.x, m.pose.z, m.pose.y) !== null, `dog on solid ground at ${m.pose.x},${m.pose.z}`); }
  });
  assert.ok(ran && greeted, 'ran up and greeted');
  assert.ok(Math.hypot(m.pose.x - px, m.pose.z - pz) < 2.2, 'stands by the player');
  assert.ok(m.pose.look > 0.5, 'looks at the player');
  advance(run, 40, () => [mover(px - 60, pz, 0)]);
  assert.equal(m.mode, 'sched', 'back on its route');
  assert.ok(Math.hypot(m.pose.x - m.sched.x, m.pose.z - m.sched.z) < 0.05);
});

test('crabs freeze, bolt for a burrow over dry sand, dig in, and come out when the coast is clear', () => {
  const def = defOf(10), tick = findTick(def, 'sit', 2, 1, false), s0 = sampleCritter(def, tick);
  const run = start(tick, { x: s0.x, z: s0.z }), m = mind(run, 10);
  const seen = new Set<string>(); let buried = false;
  advance(run, 12, (t) => [mover(s0.x - 1.2, s0.z - 1.0 + (t > 0.2 ? 0 : 3), 1, s0.y + 0.2)], () => {
    seen.add(m.mode);
    assert.ok(Math.abs(m.pose.y - coveHeight(m.pose.x, m.pose.z)) < 1e-6, 'exactly on the sand');
    if (m.mode !== 'sched') assert.ok(coveDry(m.pose.x, m.pose.z), `crab on dry sand at ${m.pose.x},${m.pose.z}`);
    if (m.mode === 'dig' && m.pose.restWeight > 0.9) buried = true;
  });
  assert.ok(seen.has('alarm') && buried, `reacted (${[...seen]})`);
  advance(run, 30, () => [mover(s0.x - 50, s0.z, 0)]);
  assert.equal(m.mode, 'sched', 'out and back on schedule');
  assert.ok(Math.hypot(m.pose.x - m.sched.x, m.pose.z - m.sched.z) < 0.05);
});

test('petting: the animal stays put and purrs, cannot be petted twice at once; far animals ignore everything', () => {
  const def = defOf(3), tick = findTick(def, 'groom', 6), s0 = sampleCritter(def, tick), run = start(tick, { x: s0.x, z: s0.z + 3 }), m = mind(run, 3);
  advance(run, 1.5, () => [mover(s0.x, s0.z + 0.5, 0)]);
  const index = run.brain.minds.indexOf(m);
  assert.equal(run.brain.pettable(index), true);
  assert.equal(run.brain.pet(index, run.now, run.tick), true);
  assert.equal(run.brain.pettable(index), false, 'cooldown');
  const at = { x: m.pose.x, z: m.pose.z };
  let purring = 0;
  advance(run, 3, () => [mover(s0.x, s0.z + 0.5, 0)], () => { if (m.pose.mood === 'purr' || m.pose.mood === 'hiss') purring++; assert.ok(Math.hypot(m.pose.x - at.x, m.pose.z - at.z) < 0.35, 'stays put while petted'); });
  assert.ok(purring > 30);
  advance(run, 20, () => [mover(s0.x + 30, s0.z, 0)]);
  assert.equal(m.mode, 'sched');
  const far = start(tick, { x: 400, z: 400 });
  advance(far, 3, () => [mover(s0.x - 1, s0.z, 6)]);
  assert.ok(far.brain.minds.every((x) => x.mode === 'sched'), 'nothing reacts out of sight');
});

test('scheduled gull cries: each gull calls on its own deterministic clock, with a beak envelope', () => {
  const run = start(0, { x: -5, z: 22 });
  let events = 0, cried = 0;
  advance(run, 70, () => [], () => { for (const e of run.brain.events) if (e.kind === 'cry') events++; if (mind(run, 4).pose.cry > 0.2) cried++; });
  assert.ok(events >= 3, `gulls called (${events})`);
  assert.ok(cried > 5, 'the beak opened');
});
