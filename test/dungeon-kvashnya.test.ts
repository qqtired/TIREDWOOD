import assert from 'node:assert/strict';
import test from 'node:test';
import { createRun, step, dgHash } from '../shared/dungeon/sim.ts';
import { makeMob, hurtMob, KB_V } from '../shared/dungeon/core.ts';
import { startWave, stepDirector } from '../shared/dungeon/director.ts';
import { canSpawn, summonFromBudget } from '../shared/dungeon/mobs.ts';
import { mobIndex, LV } from '../shared/dungeon/data.ts';
import { blocked, T_SOLID, T_PIT } from '../shared/dungeon/map.ts';
import { hitKvashnyaMark, kvashnyaClearPath } from '../shared/dungeon/kvashnya.ts';
import { attackFootprint } from '../shared/dungeon/attack-footprint.ts';
import { wrapD } from '../shared/dungeon/util.ts';

function fixture(jump = false) {
  const sim = createRun(71); sim.t = 1; sim.weapons = []; sim.props = []; sim.noFx = true;
  sim.wave.stage = 'intro'; sim.wave.t1 = 1e8; sim.hero.invT = 0;
  let x = 0, z = 0;
  outer: for (let a = 10; a < 230; a += 5) for (let b = 10; b < 230; b += 5) {
    if (kvashnyaClearPath(a, b, a + 9, b, 2, T_SOLID | T_PIT)) { x = a; z = b; break outer; }
  }
  assert.ok(x);
  sim.hero.x = x + 4; sim.hero.z = z;
  const mob = makeMob(sim, 'kvashnya', x, z, 1, 1, 0);
  mob.attackNext = jump ? 'jump' : 'tongue';
  return { sim, mob };
}
function until(sim: ReturnType<typeof createRun>, t: number) { while (sim.t < t) step(sim); }

test('Kvashnya replaces an elite from wave 8; cap queues a second and death gives an ordinary elite chest', () => {
  for (const n of [1, 7, 8, 11, 14, 17, 20, 23]) {
    const s = createRun(7); startWave(s, n);
    const ev = s.wave.ev.filter(e => e.mob === 'kvashnya');
    assert.equal(ev.length, [8,11,14,17,23].includes(n) ? 1 : 0, String(n));
  }
  const s = createRun(7); s.t = 1; startWave(s, 8);
  const event = s.wave.ev.find(e => e.mob === 'kvashnya')!;
  s.t += event.at; stepDirector(s);
  const first = s.mobs.find(m => m.k === 'kvashnya')!;
  assert.ok(first); assert.equal(first.elite, 1); assert.equal(s.bosses.length, 0);
  assert.equal(canSpawn(s, 'kvashnya'), false);
  assert.equal(summonFromBudget(s, 'kvashnya', first.x, first.z), null);
  startWave(s, 11); s.t += s.wave.ev.find(e => e.mob === 'kvashnya')!.at; stepDirector(s);
  assert.equal(s.mobs.filter(m => !m.die && m.k === 'kvashnya').length, 1);
  assert.equal(s.wave.pend[mobIndex('kvashnya')], 1);
  const chests = s.items.filter(i => i.k === 'chest').length;
  hurtMob(s, first, first.hpMax + 1, 'test', first.x, first.z, 0, 0, 0);
  assert.equal(s.stats.bosses, 0); assert.equal(s.items.filter(i => i.k === 'chest').length, chests + 1);
  assert.equal(s.gems.at(-1)!.v, 40);
  assert.equal(canSpawn(s, 'kvashnya'), true);
});

test('tongue hit occurs exactly once at frame 32 with physical warning and collidable pull', () => {
  const {sim, mob} = fixture(); step(sim);
  const mark = sim.marks[0];
  assert.equal(mark.t1, mob.attackAt! + 32); assert.equal(mark.len, 6); assert.equal(mark.w, .9);
  assert.equal(attackFootprint(mark).width, 1.8);
  until(sim, mark.t1); assert.equal(sim.hero.hp, 100); step(sim);
  assert.equal(sim.hero.hp, 82); assert.ok(Math.abs(sim.hero.kx + 1.5 * KB_V) < 1e-9);
  const hp = sim.hero.hp; sim.hero.invT = 0; hitKvashnyaMark(sim, mark); assert.equal(sim.hero.hp, hp);
  const x = sim.hero.x; until(sim, sim.t + 12); assert.ok(sim.hero.x < x); assert.equal(blocked(sim.hero.x, sim.hero.z, .45), false);
});

test('tongue direction stays fixed and dodge/invulnerability prevent both damage and pull', () => {
  for (const defense of ['sidestep', 'dash', 'invulnerable'] as const) {
    const {sim, mob} = fixture(); step(sim); const mark = sim.marks[0], heading = [mob.dx, mob.dz];
    if (defense === 'sidestep') sim.hero.z += 2;
    until(sim, mark.t1);
    if (defense === 'dash') sim.hero.dashT = 3;
    if (defense === 'invulnerable') sim.hero.invT = sim.t + 3;
    step(sim); assert.equal(sim.hero.hp, 100); assert.equal(sim.hero.kx, 0); assert.equal(sim.hero.kz, 0);
    assert.deepEqual([mob.dx, mob.dz], heading);
  }
});

test('tongue cannot damage through an actual map obstacle', () => {
  const {sim, mob} = fixture(); step(sim); const mark = sim.marks[0];
  const obstacle = LV.obstacles.find(o => o.t === 'c' && o.r > .2 && o.r < 1.8);
  assert.ok(obstacle && obstacle.t === 'c');
  mark.x = obstacle.x - obstacle.r - .2; mark.z = obstacle.z; mark.dx = 1; mark.dz = 0;
  sim.hero.x = obstacle.x + obstacle.r + .2; sim.hero.z = obstacle.z;
  assert.equal(kvashnyaClearPath(mark.x, mark.z, sim.hero.x, sim.hero.z, .1), false);
  hitKvashnyaMark(sim, mark); assert.equal(sim.hero.hp, 100); assert.equal(sim.hero.kx, 0); assert.equal(mob.attackStep, 1);
});

test('jump fixes its target, lands on impact, takes damage in flight and never repeats impact', () => {
  const {sim, mob} = fixture(true); step(sim); const mark = sim.marks[0], target = [mark.x, mark.z];
  assert.equal(mark.r, 1.65); assert.equal(attackFootprint(mark).r, 2.1);
  sim.hero.x += 1;
  until(sim, mob.attackAt! + 45);
  hurtMob(sim, mob, 100, 'test', mob.x, mob.z, 0, 10, 0); assert.equal(mob.hp, 1050);
  until(sim, mark.t1); assert.equal(sim.hero.hp, 100); step(sim);
  assert.equal(sim.hero.hp, 78); assert.ok(Math.abs(wrapD(mob.x - target[0])) < 1e-9); assert.equal(mob.z, target[1]);
  assert.equal(blocked(mob.x, mob.z, mob.r), false);
  sim.hero.invT = 0; hitKvashnyaMark(sim, mark); assert.equal(sim.hero.hp, 78);
});

test('freeze holds attack pose/deadline; Q cancels preparation and death cancels the pending hit', () => {
  const {sim, mob} = fixture(true); step(sim); const originalAt = mob.attackAt!, mark = sim.marks[0], originalHit = mark.t1;
  sim.freezeT = sim.t + 10; until(sim, sim.freezeT);
  assert.equal(mob.attackAt, originalAt + 10); assert.equal(mark.t1, originalHit + 10);
  hurtMob(sim, mob, 1, 'q', sim.hero.x, sim.hero.z, 2, 30, 0);
  assert.equal(mob.attackKind, 'recover'); assert.ok(mark.t1 < sim.t);
  until(sim, originalHit + 11); assert.equal(sim.hero.hp, 100);
  const other = fixture(); step(other.sim); const hit = other.sim.marks[0].t1;
  hurtMob(other.sim, other.mob, 2000, 'test', 0, 0, 0, 0, 0);
  until(other.sim, hit + 1); assert.equal(other.sim.hero.hp, 100);
});

test('attack starts respect six seconds and replay hashes include landing, attack kind and cooldown', () => {
  const {sim, mob} = fixture(); sim.hero.invT = 1e9; step(sim); const first = mob.attackAt!;
  const b = structuredClone(sim);
  for (let i = 0; i < 180; i++) { step(sim); step(b); assert.equal(dgHash(sim), dgHash(b)); }
  assert.ok(mob.attackAt === undefined || mob.attackAt >= first + 180);
  for (const key of ['attackX1', 'cd'] as const) { const c = structuredClone(sim); c.mobs[0][key] = (c.mobs[0][key] ?? 0) + 1; assert.notEqual(dgHash(sim), dgHash(c)); }
  const c = structuredClone(sim); c.mobs[0].attackKind = 'recover'; assert.notEqual(dgHash(sim), dgHash(c));
});

test('a stun after tongue windup holds its warning and pose until the same delayed impact', () => {
  const {sim, mob} = fixture(); step(sim);
  const at = mob.attackAt!, mark = sim.marks[0], impact = mark.t1;
  until(sim, at + 29);
  hurtMob(sim, mob, 1, 'test', sim.hero.x, sim.hero.z, 5, 10, 0);
  until(sim, at + 39);
  assert.equal(mob.attackAt, at + 10); assert.equal(mark.t1, impact + 10);
  assert.equal(sim.hero.hp, 100);
  until(sim, impact + 10); assert.equal(sim.hero.hp, 100);
  step(sim); assert.equal(sim.hero.hp, 82);
});

test('ground contact, lantern slow and rage movement remain ordinary elite behavior', () => {
  const {sim, mob} = fixture(); mob.cd = 100;
  sim.hero.x = mob.x + 1; step(sim); assert.equal(sim.hero.hp, 84);
  sim.hero.invT = 0; step(sim); assert.equal(sim.hero.hp, 84, 'contact cooldown prevents a second hit');
  const slow = fixture(); slow.mob.cd = 100;
  slow.sim.props.push({id:999,k:'lamp',x:slow.mob.x,z:slow.mob.z,st:1} as typeof slow.sim.props[number]);
  step(slow.sim); assert.ok(Math.abs(slow.mob.vx - 1.98) < 1e-8);
});

test('a real column blocks tongue startup but the ordinary side kick restores walking progress', () => {
  const {sim, mob} = fixture(); sim.hero.invT = 1e9;
  const column = LV.obstacles.find(o => o.t === 'c' && o.r > .3 && o.r < 1.5 &&
    !blocked(o.x - o.r - 1.1, o.z, mob.r) && !blocked(o.x + o.r + 1.1, o.z, .45) &&
    !blocked(o.x, o.z + o.r + 2, mob.r) && !blocked(o.x, o.z - o.r - 2, mob.r));
  assert.ok(column && column.t === 'c');
  mob.x = column.x - column.r - 1.1; mob.z = column.z;
  sim.hero.x = column.x + column.r + 1.1; sim.hero.z = column.z;
  const initialDistance = sim.hero.x - mob.x, initialZ = mob.z;
  step(sim);
  assert.equal(mob.attackAt, undefined, 'do not waste a six-second cycle casting into the column');
  let sideways = false, progressed = false;
  for (let i = 0; i < 240; i++) {
    step(sim);
    if (Math.abs(wrapD(mob.z - initialZ)) > .3) sideways = true;
    if (Math.hypot(wrapD(sim.hero.x - mob.x), wrapD(sim.hero.z - mob.z)) < initialDistance - .5) progressed = true;
  }
  assert.ok(sideways, 'existing unstick impulse moves off the blocked line');
  assert.ok(progressed, 'the toad resumes approach around the actual obstacle');
});
