import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnBosses } from '../shared/dungeon/boss.ts';
import { stepCauldron } from '../shared/dungeon/cauldron.ts';
import { createRun, step } from '../shared/dungeon/sim.ts';

function fixture(phase: number, distance = 10, rotation = 0) {
  const sim = createRun(79);
  sim.t = 1;
  sim.weapons = [];
  sim.props = [];
  sim.hero.invT = 1e9;
  spawnBosses(sim, 20);
  const boss = sim.bosses[0], mob = sim.mobs.find((m) => m.id === boss.id)!;
  mob.x = sim.hero.x + distance;
  mob.z = sim.hero.z;
  mob.hp = mob.hpMax * (phase === 3 ? 0.3 : phase === 2 ? 0.5 : 1);
  boss.phase = phase;
  boss.act = 'pause';
  boss.actT = -100;
  boss.rot = rotation;
  return { sim, boss, mob };
}

test('cauldron slows phase one slightly and shortens only phase two attack pauses', () => {
  for (const [phase, pause] of [[1, 27], [2, 15], [3, 17]] as const) {
    const { sim, boss, mob } = fixture(phase);
    boss.actT = sim.t;
    stepCauldron(sim, mob);
    assert.ok(Math.abs(Math.hypot(mob.vx, mob.vz) - (phase === 1 ? 4.14 : 4.6)) < 1e-9);
    sim.t = boss.actT + pause - 1;
    stepCauldron(sim, mob);
    assert.equal(boss.act, 'pause');
    sim.t++;
    stepCauldron(sim, mob);
    assert.equal(boss.act, 'pour');
    assert.equal(mob.hpMax, 64000);
  }
});

test('cauldron attacks preserve impact and recovery boundaries at each phase tempo', () => {
  for (const [phase, distance, rotation, attack, impact, recovery] of [
    [1, 2.6, 0, 'ladle', 22, 58],
    [2, 2.6, 0, 'ladle2', 18, 72],
    [1, 10, 1, 'pour', 21, 52],
    [3, 5, 0, 'boil', 23, 53],
  ] as const) {
    const { sim, boss, mob } = fixture(phase, distance, rotation);
    stepCauldron(sim, mob);
    const started = boss.actT;
    assert.equal(boss.act, attack);
    assert.equal(sim.marks[0].t1 - started, impact, attack);
    if (attack === 'ladle2') {
      sim.t = started + 25;
      stepCauldron(sim, mob);
      assert.equal(sim.marks[1].t1 - started, 39, 'second cup lands at its absolute clip deadline');
    }
    const lastImpact = attack === 'ladle2' ? 39 : impact;
    sim.t = started + lastImpact - 1;
    stepCauldron(sim, mob);
    assert.equal(mob.st, 'wind', 'vulnerable recovery cannot start before the final hit');
    sim.t++;
    stepCauldron(sim, mob);
    assert.equal(mob.st, 'rest', 'vulnerable recovery begins on the final hit');
    sim.t = started + recovery - 1;
    stepCauldron(sim, mob);
    assert.equal(boss.act, attack);
    sim.t++;
    stepCauldron(sim, mob);
    assert.equal(boss.act, 'pause');
  }
});

test('cauldron volleys add a central phase two threat and keep damage and footprint size', () => {
  for (const [phase, count, what] of [[1, 6, 'cauldron_pour'], [2, 5, 'cauldron_flow'], [3, 6, 'cauldron_flow']] as const) {
    const { sim, boss, mob } = fixture(phase, 10, 1);
    stepCauldron(sim, mob);
    const marks = sim.marks.filter((m) => m.what === what);
    assert.equal(marks.length, count);
    assert.equal(new Set(marks.map((m) => phase === 1 ? `${m.x}:${m.z}` : `${m.dx}:${m.dz}`)).size, count);
    for (const mark of marks) {
      assert.equal(mark.t1 - boss.actT, phase === 1 ? 21 : phase === 2 ? 17 : 19);
      assert.equal(mark.dmg, phase === 1 ? 18 : 22);
      assert.equal(phase === 1 ? mark.r : mark.w, phase === 1 ? 1.8 : 1.2);
    }
    if (phase === 2) {
      const angles = marks.map((m) => Math.atan2(m.dx * mob.az - m.dz * mob.ax, m.dx * mob.ax + m.dz * mob.az)).sort((a,b) => a-b);
      for (const [i, angle] of [-.75, -.25, 0, .25, .75].entries()) assert.ok(Math.abs(angles[i] - angle) < 1e-5);
      assert.ok(marks.some((m) => Math.abs(m.dx - mob.ax) < 1e-6 && Math.abs(m.dz - mob.az) < 1e-6), 'hero direction is warned and threatened');
    }
    if (phase === 1) {
      sim.t = marks[0].t1;
      step(sim);
      assert.equal(sim.puddles.length, 6);
    }
  }
});

test('cauldron phase transition and summon cadence follow their phase tempo', () => {
  const transition = fixture(1);
  transition.mob.hp = transition.mob.hpMax * 0.5;
  stepCauldron(transition.sim, transition.mob);
  const started = transition.boss.actT;
  assert.equal(transition.boss.act, 'roar');
  transition.sim.t = started + 19;
  stepCauldron(transition.sim, transition.mob);
  assert.equal(transition.boss.act, 'roar');
  transition.sim.t++;
  stepCauldron(transition.sim, transition.mob);
  assert.equal(transition.boss.act, 'pause');

  const { sim, boss, mob } = fixture(2);
  assert.equal(boss.sumT - sim.t, 333);
  sim.t = boss.sumT;
  stepCauldron(sim, mob);
  assert.equal(sim.mobs.filter((m) => m.k === 'hookclaw').length, 4);
  assert.equal(boss.summonLeft, 8);
  assert.equal(boss.sumT - sim.t, 273);
});

test('cauldron appearance and interrupted boil retain their complete transition windows', () => {
  const { sim, boss, mob } = fixture(1);
  boss.act = 'appear'; boss.actT = sim.t;
  sim.t += 24; stepCauldron(sim, mob); assert.equal(boss.act, 'appear');
  sim.t++; stepCauldron(sim, mob); assert.equal(boss.act, 'pause');
  boss.phase = 3; mob.hp = mob.hpMax * .3;
  boss.act = 'boil'; mob.attackStep = -1;
  stepCauldron(sim, mob); assert.equal(boss.act, 'recover');
  const started = boss.actT;
  sim.t = started + 29; stepCauldron(sim, mob); assert.equal(boss.act, 'recover');
  sim.t++; stepCauldron(sim, mob); assert.equal(boss.act, 'pause');
});
