import assert from 'node:assert/strict';
import test from 'node:test';
import { SimRun } from '../client/dungeon/simview.ts';
import { startWave, stepDirector } from '../shared/dungeon/director.ts';
import { dropGem, stepPickups } from '../shared/dungeon/pickups.ts';
import { addXp, maybeOpenChoice, openChest, pick } from '../shared/dungeon/progress.ts';
import { createRun } from '../shared/dungeon/sim.ts';

test('small gems keep exactly 60% XP across pickups and level boundaries', () => {
  const sim = createRun(7);
  for (let i = 1; i <= 100; i++) {
    dropGem(sim, sim.hero.x, sim.hero.z, 1);
    stepPickups(sim);
    if (i === 1) assert.equal(sim.hero.xp, 0.6);
    if (i === 10) assert.equal(sim.hero.xp, 6);
    if (i === 33) assert.deepEqual([sim.hero.level, sim.hero.xp], [1, 19.8]);
    if (i === 34) assert.deepEqual([sim.hero.level, sim.hero.xp], [2, 0.4]);
  }
  // 100 old XP → 60 XP: the unchanged 20 + 30 thresholds leave 10.
  assert.deepEqual([sim.hero.level, sim.hero.xp, sim.hero.xpNext, sim.pendLv], [3, 10, 40, 2]);
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
  assert.equal(separate.hero.xp, 18);
  assert.equal(merged.hero.xp, 18);
});

test('the 40% reduction stacks with every Horseshoe XP level without losing fractions', () => {
  for (const [lv, remaining] of [[1, 12.4], [2, 14.8], [3, 17.2], [4, 19.6], [5, 22]] as const) {
    const sim = createRun(7);
    sim.passives.push({ id: 'magnet', lv });
    for (let i = 0; i < 100; i++) addXp(sim, 1);
    assert.deepEqual([sim.hero.level, sim.hero.xp, sim.pendLv], [3, remaining, 2], `Подкова ${lv}`);
  }
});

test('an exact boosted level boundary opens the level choice on that award', () => {
  const sim = createRun(7);
  sim.passives.push({ id: 'magnet', lv: 5 });
  for (let i = 0; i < 125; i++) addXp(sim, 1);
  // 125 × 1.2 × 0.6 = 90, exactly the 20 + 30 + 40 level thresholds.
  assert.deepEqual([sim.hero.level, sim.hero.xp, sim.hero.xpNext, sim.pendLv], [4, 0, 50, 3]);
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
  assert.equal(curse.weapons[0].lv, 4);
  assert.deepEqual([curse.hero.level, curse.hero.xp, curse.hero.hp], [2, 10, 80]);

  const full = createRun(7);
  full.weapons[0].lv = 7;
  full.passives.push({ id: 'magnet', lv: 5 });
  full.hero.hp = 40;
  openChest(full, 'big');
  assert.equal(full.chest?.rows[0].k, 'gold');
  assert.deepEqual([full.hero.level, full.hero.xp, full.hero.hp], [2, 16, 80]);
});

test('chest HUD displays the credited XP including the Horseshoe bonus', () => {
  for (const [lv, expected] of [[0, '+30 опыта и +30 HP'], [5, '+36 опыта и +30 HP']] as const) {
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
  for (const [lv, expected] of [[0, 3], [1, 3.12], [5, 3.6]] as const) {
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
