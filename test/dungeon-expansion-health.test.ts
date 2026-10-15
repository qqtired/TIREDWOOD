import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnBosses } from '../shared/dungeon/boss.ts';
import { mobDef } from '../shared/dungeon/data.ts';
import { hurtMob } from '../shared/dungeon/core.ts';
import { startWave } from '../shared/dungeon/director.ts';
import { spawnMob } from '../shared/dungeon/mobs.ts';
import { createRun } from '../shared/dungeon/sim.ts';

test('new enemies keep their tuned health, damage, movement and rewards', () => {
  for (const [kind, oldHp, hp, dmg, speed, xp] of [
    ['hookclaw', 130, 156, 9, 3.6, 3],
    ['wickmole', 66, 165, 8, 2.5, 4],
    ['railhopper', 44, 110, 7, 2.8, 3],
    ['chainwarden', 720, 1800, 18, 2.15, 40],
  ] as const) {
    const sim = createRun(7);
    sim.t = 1;
    const mob = spawnMob(sim, kind, sim.hero.x + 1, sim.hero.z, 0);
    assert.deepEqual([mob.hp, mob.hpMax, mob.dmg, mob.spd], [hp, hp, dmg, speed], kind);
    hurtMob(sim, mob, oldHp, 'test', mob.x, mob.z, 0, 0, 0);
    assert.equal(mob.die, 0, kind);
    assert.equal(mob.hp, hp - oldHp, kind);
    hurtMob(sim, mob, hp - oldHp, 'test', mob.x, mob.z, 0, 0, 0);
    assert.ok(mob.die, kind);
    assert.equal(sim.gems[0].v, xp, `${kind}: the raw XP reward is unchanged`);
  }
});

test('old enemies retain HP while the first bosses use their reduced health', () => {
  const sim = createRun(7);
  for (const [kind, hp] of [
    ['rat', 10], ['bat', 8], ['slime', 38], ['slimelet', 10], ['shroom', 85],
    ['beetle', 60], ['spitter', 34], ['larva', 24], ['barrel', 600], ['shaman', 650],
  ] as const) {
    const mob = spawnMob(sim, kind, sim.hero.x + 1, sim.hero.z, 0);
    assert.deepEqual([mob.hp, mob.hpMax], [hp, hp], kind);
  }
  for (const [wave, kind, hp] of [[10, 'povidl', 22500], [20, 'cauldronmaster', 51200]] as const) {
    const bossRun = createRun(7);
    spawnBosses(bossRun, wave);
    const boss = bossRun.mobs.find((mob) => mob.k === kind)!;
    assert.deepEqual([boss.hp, boss.hpMax], [hp, hp], kind);
  }
});

test('tougher new enemies keep the previous wave roster and common HP multiplier', () => {
  assert.equal(mobDef('hookclaw').waveBudgetHp, 52, 'extra crab health does not change roster budgeting');
  const sim = createRun(7);
  // Сравниваем состав при прежнем RNG перед волной: число стартовых сундуков меняет расход случайных чисел.
  sim.rng = 1493268471;
  startWave(sim, 21);
  assert.equal(sim.wave.total, 501);
  assert.equal(sim.wave.hpMul, 9.261348590119281);
  assert.deepEqual(sim.wave.pend, [280, 0, 0, 0, 33, 0, 41, 0, 0, 0, 0, 45, 0, 53, 0, 0, 0, 0, 0]);
});

test('later Povidl variants keep their health and cauldron keeps its growth formula', () => {
  for (const [wave, health] of [[30, [58045, 58045]], [40, [228368]], [50, [561542]], [60, [958365]]] as const) {
    const sim = createRun(7);
    spawnBosses(sim, wave);
    assert.deepEqual(sim.bosses.map(b => sim.mobs.find(m => m.id === b.id)!.hpMax), health, 'wave ' + wave);
  }
});
