import { spawnBosses, stepBoss } from '../shared/dungeon/boss.ts';
import { ticks, wrapD, wrapP } from '../shared/dungeon/util.ts';
import { heroInMark } from '../shared/dungeon/attack-footprint.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { SimRun } from '../client/dungeon/simview.ts';
import { addMark, addContactMark } from '../shared/dungeon/mobs.ts';
import { makeMob } from '../shared/dungeon/core.ts';
import { syncPhysicalMarks } from '../shared/dungeon/expansion.ts';
import { step } from '../shared/dungeon/sim.ts';

test('enemy circles, ring holes and square-ended lanes show the full hero-center hit area', () => {
  const run = new SimRun(41), s = run.sim;
  addMark(s, 'circle', 'bspit', 239.9, 120, 2, 0, 0, 30, 12, 0, 0, null);
  addMark(s, 'ring', 'cauldron_boil', 120, 120, 6, 0, 0, 30, 12, 0, 0, null);
  s.marks[1].inner = 3;
  addMark(s, 'lane', 'cauldron_flow', .2, 120, 0, 1, 0, 30, 12, 0, 0, null, 14, 1.2);
  const v = run.view().teles;
  assert.equal(v[0].r, 2.45);
  assert.equal(v[1].r, 6.45); assert.equal(v[1].inner, 2.55);
  assert.ok(Math.abs(v[2].x - 239.75) < 1e-6);
  assert.equal(v[2].r, 14.9); assert.equal(v[2].w, 2.1);
});

test('every Povidl cave-in mark has a falling rock and an impact even on a miss', () => {
  const run = new SimRun(43), s = run.sim;
  s.t = 1; s.weapons = []; s.props = [];
  for (let i = 0; i < 6; i++) addMark(s, 'circle', 'cavein', 150 + i, 120, 2, 0, 0, 1, 12, 0, 0, null);
  const v = run.view();
  assert.equal(v.projectiles.filter(p => p.kind === 'rock').length, 6);
  step(s); step(s);
  assert.equal(s.fx.filter(f => f.k === 'boom' && f.what === 'cavein').length, 6);
});

test('cauldron contact warning stays at its announced position after body displacement', () => {
  const run = new SimRun(47), s = run.sim;
  const m = makeMob(s, 'cauldronmaster', 239, 120, 1, 1, 0); m.ax = 1; m.az = 0;
  addContactMark(s, m, 'cauldron_ladle', 1, 3, 1, 30, 20);
  const before = { x: s.marks[0].x, z: s.marks[0].z };
  m.x = 4; m.z = 125; syncPhysicalMarks(s);
  assert.deepEqual({ x: s.marks[0].x, z: s.marks[0].z }, before);
});

test('tail warning includes the existing close-range disk behind the sector', () => {
  const run = new SimRun(49), s = run.sim;
  addMark(s, 'sector', 'tail', 120, 120, 6, 0, 1, 30, 12, 0, 0, null, 0, 180);
  const t = run.view().teles[0];
  assert.equal(t.r, 6.45); assert.equal(t.centerRadius, 1); assert.equal(t.w, Math.PI);
});


test('Povidl emerges at the last announced circle even if the hero changes direction', () => {
  const run = new SimRun(51), s = run.sim;
  spawnBosses(s, 10); const b = s.bosses[0], m = s.mobs.find(m => m.id === b.id)!;
  b.phase = 2; b.act = 'burrow2'; b.step = 1; b.actT = 0;
  m.hp = m.hpMax * .5; m.x = 239; m.z = 120; m.st = 'under'; m.under = 1;
  s.hero.x = 8; s.hero.z = 120; s.t = ticks(3);
  stepBoss(s, m);
  const last = s.marks.at(-1)!; const target = { x: last.x, z: last.z };
  s.hero.x = 239; s.hero.z = 100; s.t += ticks(2.4);
  stepBoss(s, m);
  assert.ok(Math.abs(wrapD(m.x - target.x)) < 1e-6);
  assert.ok(Math.abs(wrapD(m.z - target.z)) < 1e-6);
});

test('rendered footprints and actual hit tests agree across the tor seam', () => {
  for (const kind of ['circle', 'ring', 'lane', 'sector'] as const) {
    const run = new SimRun(53), s = run.sim;
    addMark(s, kind, 'test', 239.8, 120, 4, 0, 1, 30, 12, 0, 0, null, 8, kind === 'sector' ? 180 : 2);
    if (kind === 'ring') s.marks[0].inner = 2;
    const t = run.view().teles[0], mk = s.marks[0];
    for (let x = -5.13; x < 5; x += .37) for (let z = -5.17; z < 10; z += .41) {
      const p = { x: wrapP(mk.x + x), z: wrapP(mk.z + z) };
      const dx = wrapD(p.x - t.x), dz = wrapD(p.z - t.z), d = Math.hypot(dx, dz);
      const shown = t.shape === 'strip' ? Math.abs(dx) < t.w / 2 && dz > 0 && dz < t.r
        : t.shape === 'sector' ? d < t.r && (dz >= 0 || d < (t.centerRadius ?? 0))
        : d < t.r && (!t.inner || d > t.inner);
      assert.equal(heroInMark(p, mk), shown, `${kind}: ${x}, ${z}`);
    }
  }
});
