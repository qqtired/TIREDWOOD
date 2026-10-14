import assert from 'node:assert/strict';
import test from 'node:test';
import { SimRun } from '../client/dungeon/simview.ts';
import { startWave, stepDirector } from '../shared/dungeon/director.ts';
import { dropGem, stepPickups } from '../shared/dungeon/pickups.ts';
import { addXp, maybeOpenChoice, openChest, pick } from '../shared/dungeon/progress.ts';
import { createRun } from '../shared/dungeon/sim.ts';

test('small gems keep exactly 54% XP across pickups and level boundaries', () => {
  const sim = createRun(7);
  for (let i = 1; i <= 100; i++) {
    dropGem(sim, sim.hero.x, sim.hero.z, 1);
    stepPickups(sim);
    if (i === 1) assert.equal(sim.hero.xp, 0.54);
    if (i === 10) assert.equal(sim.hero.xp, 5.4);
    if (i === 37) assert.deepEqual([sim.hero.level, sim.hero.xp], [1, 19.98]);
    if (i === 38) assert.deepEqual([sim.hero.level, sim.hero.xp], [2, 0.52]);
  }
  // 100 old XP → 54 XP: the unchanged 20 + 30 thresholds leave 4.
  assert.deepEqual([sim.hero.level, sim.hero.xp, sim.hero.xpNext, sim.pendLv], [3, 4, 40, 2]);
  maybeOpenChoice(sim);
  assert.equal(sim.choice?.why, 'level');
  pick(sim, 0);
  assert.equal(sim.choice?.why, 'level');
  pick(sim, 0);
  assert.equal(sim.choice, null);
});

test('large and merged XP awards receive the reduction only once', () => {
  const separate = createRun(7), merged = createRun(7);
  dropGem(separate, separate.hero.x, separate.hero.z, 5);
  dropGem(separate, separate.hero.x, separate.hero.z, 25);
  dropGem(merged, merged.hero.x, merged.hero.z, 30);
  stepPickups(separate);
  stepPickups(merged);
  assert.equal(separate.hero.xp, 16.2);
  assert.equal(merged.hero.xp, 16.2);
});

test('the 46% reduction stacks with every Horseshoe XP level without losing fractions', () => {
  for (const [lv, remaining] of [[1, 6.16], [2, 8.32], [3, 10.48], [4, 12.64], [5, 14.8]] as const) {
    const sim = createRun(7);
    sim.passives.push({ id: 'magnet', lv });
    for (let i = 0; i < 100; i++) addXp(sim, 1);
    assert.deepEqual([sim.hero.level, sim.hero.xp, sim.pendLv], [3, remaining, 2], `Подкова ${lv}`);
  }
});

test('an exact boosted level boundary opens the level choice on that award', () => {
  const sim = createRun(7);
  sim.passives.push({ id: 'magnet', lv: 5 });
  sim.hero.xp = 19.352;
  addXp(sim, 1);
  assert.deepEqual([sim.hero.level, sim.hero.xp, sim.hero.xpNext, sim.pendLv], [2, 0, 30, 1]);
});

test('chest XP is reduced while free upgrades and healing retain their values', () => {
  const normal = createRun(7);
  openChest(normal, 'plain');
  assert.equal(normal.chest?.rows.length, 1);
  assert.ok(normal.chest?.rows.every((row) => row.k === 'w' || row.k === 'p'));
  assert.equal(normal.hero.xp, 0);

  const curse = createRun(7);
  curse.hero.hp = 40;
  openChest(curse, 'curse');
  assert.equal(curse.weapons[0].lv, 3);
  assert.deepEqual([curse.hero.level, curse.hero.xp, curse.hero.hp], [2, 7, 80]);

  const full = createRun(7);
  full.weapons[0].lv = 7;
  full.passives.push({ id: 'magnet', lv: 5 });
  full.hero.hp = 40;
  openChest(full, 'big');
  assert.equal(full.chest?.rows[0].k, 'gold');
  assert.deepEqual([full.hero.level, full.hero.xp, full.hero.hp], [2, 12.4, 80]);
});

test('chest HUD displays the credited XP including the Horseshoe bonus', () => {
  for (const [lv, expected] of [[0, '+27 опыта и +30 HP'], [5, '+32,4 опыта и +30 HP']] as const) {
    const run = new SimRun(7);
    run.sim.weapons[0].lv = 7;
    if (lv) run.sim.passives.push({ id: 'magnet', lv });
    openChest(run.sim, 'plain');
    // No free upgrade remains, and viewing the chest must not add any more XP.
    const xp = run.sim.hero.xp;
    assert.equal(run.view().chest?.fallback, expected);
    assert.equal(run.sim.hero.xp, xp);
  }
});

test('wave clear displays reduced XP and collects the raw bonus only once', () => {
  for (const [lv, expected] of [[0, 2.7], [1, 2.808], [5, 3.24]] as const) {
    const sim = createRun(7);
    if (lv) sim.passives.push({ id: 'magnet', lv });
    startWave(sim, 1);
    sim.t = 90;
    sim.wave.pend.fill(0);
    for (const event of sim.wave.ev) event.done = 1;
    stepDirector(sim);
    const sweep = sim.fx.find((event) => event.k === 'sweep');
    assert.equal(sweep?.xp, expected);
    stepPickups(sim);
    assert.equal(sim.hero.xp, expected);
  }
});
