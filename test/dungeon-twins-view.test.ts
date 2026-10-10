// «Подземелье», клиент: на 30-й волне (Близнецы) вид забега отдаёт обоих боссов, а не только первого.
import assert from 'node:assert/strict';
import test from 'node:test';
import { startWave } from '../shared/dungeon/director.ts';
import { SimRun } from '../client/dungeon/simview.ts';

test('Близнецы: в виде два босса с разными id, масштаб 0,75, имя «Близнецы»', () => {
  const run = new SimRun(12345);
  startWave(run.sim, 30);
  run.sim.hero.hp = run.sim.hero.hpMax = 1e9;
  for (let i = 0; i < 30; i++) run.step();
  const v = run.view();
  assert.equal(run.sim.bosses.length, 2);
  assert.equal(v.bosses.length, 2);
  assert.notEqual(v.bosses[0].id, v.bosses[1].id);
  assert.deepEqual(v.bosses.map((b) => b.id).sort(), run.sim.bosses.map((b) => b.id).sort());
  for (const b of v.bosses) {
    assert.equal(b.scale, 0.75);
    assert.equal(b.name, 'Близнецы');
    assert.ok(b.hp > 0 && b.hp <= b.hpMax);
  }
});

test('один босс на 10-й волне: в виде один, масштаб 1', () => {
  const run = new SimRun(777);
  startWave(run.sim, 10);
  run.sim.hero.hp = run.sim.hero.hpMax = 1e9;
  for (let i = 0; i < 30; i++) run.step();
  const v = run.view();
  assert.equal(v.bosses.length, 1);
  assert.equal(v.bosses[0].scale, 1);
});
