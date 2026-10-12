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

test('cauldron moves twice as fast and reacts after half of each phase pause', () => {
  for (const [phase, pause] of [[1, 24], [2, 17], [3, 17]] as const) {
    const { sim, boss, mob } = fixture(phase);
    boss.actT = sim.t;
    stepCauldron(sim, mob);
    assert.equal(Math.hypot(mob.vx, mob.vz), 4.6);
    sim.t = boss.actT + pause - 1;
    stepCauldron(sim, mob);
    assert.equal(boss.act, 'pause');
    sim.t++;
    stepCauldron(sim, mob);
    assert.equal(boss.act, 'pour');
    assert.equal(mob.hpMax, 64000);
  }
});

test('all cauldron attacks use half-time impact and recovery deadlines', () => {
  for (const [phase, distance, rotation, attack, impact, recovery] of [
    [1, 2.6, 0, 'ladle', 20, 53],
    [2, 2.6, 0, 'ladle2', 20, 80],
    [1, 10, 1, 'pour', 19, 47],
    [3, 5, 0, 'boil', 23, 53],
  ] as const) {
    const { sim, boss, mob } = fixture(phase, distance, rotation);
    stepCauldron(sim, mob);
    const started = boss.actT;
    assert.equal(boss.act, attack);
    assert.equal(sim.marks[0].t1 - started, impact, attack);
    if (attack === 'ladle2') {
      sim.t = started + 28;
      stepCauldron(sim, mob);
      assert.equal(sim.marks[1].t1 - started, 43, 'second cup follows the doubled clip speed');
    }
    sim.t = started + recovery - 1;
    stepCauldron(sim, mob);
    assert.equal(boss.act, attack);
    sim.t++;
    stepCauldron(sim, mob);
    assert.equal(boss.act, 'pause');
  }
});

test('cauldron floor volleys double their distinct targets and keep damage and footprint size', () => {
  for (const [phase, count, what] of [[1, 6, 'cauldron_pour'], [2, 4, 'cauldron_flow'], [3, 6, 'cauldron_flow']] as const) {
    const { sim, boss, mob } = fixture(phase, 10, 1);
    stepCauldron(sim, mob);
    const marks = sim.marks.filter((m) => m.what === what);
    assert.equal(marks.length, count);
    assert.equal(new Set(marks.map((m) => phase === 1 ? `${m.x}:${m.z}` : `${m.dx}:${m.dz}`)).size, count);
    for (const mark of marks) {
      assert.equal(mark.t1 - boss.actT, 19);
      assert.equal(mark.dmg, phase === 1 ? 18 : 22);
      assert.equal(phase === 1 ? mark.r : mark.w, phase === 1 ? 1.8 : 1.2);
    }
    if (phase === 1) {
      sim.t = marks[0].t1;
      step(sim);
      assert.equal(sim.puddles.length, 6);
    }
  }
});

test('cauldron phase transition and summon clock share the doubled action speed', () => {
  const transition = fixture(1);
  transition.mob.hp = transition.mob.hpMax * 0.5;
  stepCauldron(transition.sim, transition.mob);
  const started = transition.boss.actT;
  assert.equal(transition.boss.act, 'roar');
  transition.sim.t = started + 22;
  stepCauldron(transition.sim, transition.mob);
  assert.equal(transition.boss.act, 'roar');
  transition.sim.t++;
  stepCauldron(transition.sim, transition.mob);
  assert.equal(transition.boss.act, 'pause');

  const { sim, boss, mob } = fixture(2);
  assert.equal(boss.sumT - sim.t, 300);
  sim.t = boss.sumT;
  stepCauldron(sim, mob);
  assert.equal(sim.mobs.filter((m) => m.k === 'hookclaw').length, 4);
  assert.equal(boss.summonLeft, 8);
  assert.equal(boss.sumT - sim.t, 300);
});
