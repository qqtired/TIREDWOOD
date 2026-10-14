import test from 'node:test';
import assert from 'node:assert/strict';
import { SimRun } from '../client/dungeon/simview.ts';
import { makeMob } from '../shared/dungeon/core.ts';
import { spawnBosses } from '../shared/dungeon/boss.ts';
import { spawnMob, addMark } from '../shared/dungeon/mobs.ts';
import { areaMul } from '../shared/dungeon/core.ts';
import { wstats } from '../shared/dungeon/weapons.ts';

test('new attack projection carries one full-cycle server clock', () => {
  const r = new SimRun(67), s = r.sim;
  s.props = []; s.weapons = [];
  const m = spawnMob(s, 'hookclaw', s.hero.x + 2, s.hero.z, 0);
  m.cd = 0; m.spd = 0;
  r.step();
  const start = r.view().enemies.find(e => e.id === m.id)!;
  assert.equal(start.anim, 'attack'); assert.equal(start.animAt, m.attackAt);
  for (let i = 0; i < 28; i++) r.step();
  const hit = r.view().enemies.find(e => e.id === m.id)!;
  assert.equal(hit.anim, 'attack'); assert.equal(hit.animAt, start.animAt);
});

test('evolved projectiles and distinct own marks retain their visual identity', () => {
  const r = new SimRun(69), s = r.sim;
  s.weapons = [{ id: 'embers', lv: 7, evo: 1, cd: 0, t2: 0 }, { id: 'pickaxe', lv: 7, evo: 1, cd: 0, t2: 0 }, { id: 'charges', lv: 7, evo: 1, cd: 0, t2: 0 }];
  s.props = []; s.hero.invT = 1e9;
  const m = makeMob(s, 'rat', s.hero.x + 10, s.hero.z, 100, 1, 0); m.spd = 0;
  r.step();
  const v = r.view();
  for (const kind of ['ember', 'pick', 'charge']) assert.ok(v.projectiles.some(p => p.kind === kind && p.evo));
  addMark(s, 'circle', 'spark_pulse', s.hero.x, s.hero.z, 1.5, 0, 0, 15, 12, 0, 0, null); s.marks.at(-1)!.own = 1;
  addMark(s, 'circle', 'ember_splash', s.hero.x, s.hero.z, 1.4, 0, 0, 15, 8, 0, 0, null); s.marks.at(-1)!.own = 1;
  r.step();
  assert.ok(r.view().projectiles.some(p => p.kind === 'spark_pulse'));
  assert.equal(r.view().projectiles.filter(p => p.kind === 'rock').length, 0);
});

test('boss phase and ring safe center reach the actual client view', () => {
  const r = new SimRun(71), s = r.sim;
  s.weapons = []; s.props = []; s.hero.invT = 1e9;
  spawnBosses(s, 20);
  const b = s.bosses[0], m = s.mobs.find(m => m.id === b.id)!;
  m.x = s.hero.x + 5; m.z = s.hero.z;
  b.phase = 3; b.act = 'pause'; b.actT = -100; b.rot = 0; m.hp = m.hpMax * .3;
  r.step();
  const v = r.view(), view = v.bosses.find(v => v.id === m.id)!;
  assert.equal(view.family, 'cauldronmaster'); assert.equal(view.phase, 3); assert.equal(view.anim, 'boil');
  assert.equal(v.teles.find(t => t.inner)?.inner, 3.55, 'safe center accounts for the hero radius');
});

test('beacon visual dimensions match its passive-scaled hit area', () => {
  const r = new SimRun(73), s = r.sim;
  s.weapons = [{ id: 'beam', lv: 7, evo: 1, cd: 0, t2: 0 }]; s.passives = [{ id: 'area', lv: 5 }];
  const v = r.view();
  const stats = wstats(s.weapons[0]);
  assert.equal(v.rays.length, 2); assert.equal(v.rays[0].len, stats.length! * areaMul(s)); assert.equal(v.rays[0].w, stats.width! * areaMul(s));
});
