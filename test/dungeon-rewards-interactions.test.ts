import assert from 'node:assert/strict';
import test from 'node:test';
import { hurtHero } from '../shared/dungeon/core.ts';
import { D, passiveDef } from '../shared/dungeon/data.ts';
import { applyCard, openChest } from '../shared/dungeon/progress.ts';
import { stepProps } from '../shared/dungeon/props.ts';
import { createRun, type DgProp } from '../shared/dungeon/sim.ts';

const kinds = ['plain', 'isle', 'small', 'big', 'curse'] as const;
for (const kind of kinds) {
  test(`${kind} chest only upgrades owned equipment, including with empty slots`, () => {
    for (let seed = 1; seed <= 12; seed++) {
      const sim = createRun(seed);
      sim.passives = [{ id: 'might', lv: 1 }];
      const owned = new Set<string>([...sim.weapons, ...sim.passives].map(x => x.id));
      openChest(sim, kind);
      for (const item of [...sim.weapons, ...sim.passives]) assert.ok(owned.has(item.id), `new item ${item.id}`);
      const rows = sim.chest!.rows;
      assert.ok(rows.every(row => (row.k === 'w' || row.k === 'p') && owned.has(row.id)));
      if (kind === 'small') assert.ok(rows.length >= 1 && rows.length <= 3);
      else assert.equal(rows.length, kind === 'plain' || kind === 'isle' ? 1 : kind === 'curse' ? 2 : 3);
    }
  });
  test(`${kind} chest preserves evolution and exhausted-build fallback`, () => {
    const sim = createRun(50);
    const recipe = D.evolutions.find(e => e.from === sim.weapons[0].id)!;
    sim.weapons[0].lv = 7;
    applyCard(sim, { k: 'p', id: recipe.with, lv: 1 });
    openChest(sim, kind);
    assert.equal(sim.chest!.rows[0].k, 'evo');
    assert.equal(sim.weapons[0].evo, 1);
    sim.passives[0].lv = passiveDef(recipe.with).max;
    sim.hero.hp = 10;
    sim.hero.xp = 0;
    openChest(sim, kind);
    assert.deepEqual(sim.chest!.rows, [{ k: 'gold', id: '', lv: 0 }]);
    assert.ok(sim.hero.hp >= 40);
    assert.ok(sim.hero.xp > 0 || sim.pendLv > 0);
    assert.equal(sim.weapons.length, 1);
    assert.equal(sim.passives.length, 1);
  });
}

function interaction(kind: DgProp['k']) {
  const sim = createRun(7);
  const p = sim.props.find(p => p.k === kind)!;
  sim.props = [p];
  p.st = 0;
  sim.hero.x = p.x;
  sim.hero.z = p.z;
  sim.hero.xp = sim.hero.xpNext * .6;
  sim.wave.stage = 'wave';
  sim.t = 1;
  return { sim, p };
}

for (const kind of ['forge', 'altar', 'chest'] as const) {
  test(`${kind}: damage keeps original completion time; leaving still cancels`, () => {
    const { sim, p } = interaction(kind);
    stepProps(sim);
    const deadline = sim.hero.useT1;
    sim.t++;
    assert.equal(hurtHero(sim, 5, 'rat'), true);
    stepProps(sim);
    assert.equal(sim.hero.useId, p.id);
    assert.equal(sim.hero.useT1, deadline);
    sim.t = deadline;
    stepProps(sim);
    if (kind === 'forge') assert.equal(sim.choice?.why, 'forge');
    else assert.notEqual(p.st, 0);
    const other = interaction(kind);
    stepProps(other.sim);
    other.sim.hero.x += 10;
    other.sim.t++;
    stepProps(other.sim);
    assert.equal(other.sim.hero.useId, -1);
    assert.equal(other.p.st, 0);
  });
}

test('lamps retain activation through damage, reset outside, and grant one permanent stacking regen each', () => {
  const { sim, p } = interaction('lamp');
  stepProps(sim);
  const progress = p.vx;
  sim.t++;
  hurtHero(sim, 5, 'rat');
  stepProps(sim);
  assert.ok(p.vx > progress);
  sim.hero.x += 10;
  stepProps(sim);
  assert.equal(p.vx, 0);
  sim.hero.x = p.x;
  for (let i = 0; i < 50; i++) { sim.t++; stepProps(sim); }
  assert.equal(sim.stats.lamps, 1);
  for (let i = 0; i < 50; i++) { sim.t++; stepProps(sim); }
  assert.equal(sim.stats.lamps, 1);
  const second = { ...p, id: p.id + 10000, x: p.x + 20, st: 0, vx: 0 };
  sim.props.push(second);
  sim.hero.x = second.x;
  for (let i = 0; i < 50; i++) { sim.t++; stepProps(sim); }
  assert.equal(sim.stats.lamps, 2);
  sim.hero.x += 20;
  sim.hero.hp = 10;
  sim.t = 300;
  stepProps(sim);
  assert.ok(Math.abs(sim.hero.hp - 10.6) < 1e-9, `global HP ${sim.hero.hp}`);
  sim.hero.x = second.x;
  sim.t = 330;
  stepProps(sim);
  assert.ok(Math.abs(sim.hero.hp - 12.2) < 1e-9, 'local 1 HP/s stacks with global .6 HP/s');
  sim.hero.hp = sim.hero.hpMax - .1;
  sim.t = 360;
  stepProps(sim);
  assert.equal(sim.hero.hp, sim.hero.hpMax);
  sim.hero.dead = 360;
  sim.hero.hp = 0;
  sim.t = 390;
  stepProps(sim);
  assert.equal(sim.hero.hp, 0);
  const fresh = createRun(7);
  fresh.props = [];
  fresh.hero.hp = 10;
  fresh.t = 30;
  stepProps(fresh);
  assert.equal(fresh.hero.hp, 10);
  assert.equal(fresh.stats.lamps, 0);
});
