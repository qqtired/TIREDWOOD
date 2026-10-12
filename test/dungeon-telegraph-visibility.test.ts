import assert from 'node:assert/strict';
import test from 'node:test';
import type { ShaderMaterial } from 'three';
import { D_TCIRCLE, FloorDecals } from '../client/dungeon/fx.ts';
import { LV } from '../shared/dungeon/data.ts';
import { collide, T_PIT, T_SOLID } from '../shared/dungeon/map.ts';
import { addMark } from '../shared/dungeon/mobs.ts';
import { createRun, step } from '../shared/dungeon/sim.ts';

test('threat overlay bypasses building depth while retaining the exact ground footprint', () => {
  const normal = new FloorDecals(1, false, 1);
  const threat = new FloorDecals(1, false, 4, false);
  threat.begin(0);
  threat.add(28, 0.04, 40, 1.8, 1.8, 0, D_TCIRCLE, 0.5, 0, 0.78, 0.45, 1, 0.85);
  threat.end();
  assert.equal((normal.mesh.material as ShaderMaterial).depthTest, true);
  assert.equal((threat.mesh.material as ShaderMaterial).depthTest, false);
  assert.equal((threat.mesh.material as ShaderMaterial).depthWrite, false);
  const position = threat.mesh.geometry.getAttribute('aPos'), size = threat.mesh.geometry.getAttribute('aSize');
  assert.deepEqual([position.getX(0), position.getZ(0)], [28, 40]);
  assert.ok(Math.abs(position.getY(0) - 0.04) < 1e-6);
  assert.ok(Math.abs(size.getX(0) - 3.6) < 1e-6);
  assert.ok(Math.abs(size.getY(0) - 3.6) < 1e-6);
  normal.dispose(); threat.dispose();
});

test('spring and forge remain walkable and an enemy spit hits at its shown footprint', () => {
  for (const point of [...LV.buildings.spring, ...LV.proposals.forge]) {
    for (const distance of [0, 3]) {
      const sim = createRun(41);
      sim.t = 1; sim.weapons = []; sim.props = []; sim.items = []; sim.gems = [];
      sim.hero.x = point.x + distance; sim.hero.z = point.z;
      const collision = collide(point.x, point.z, 0.45, T_SOLID | T_PIT);
      assert.deepEqual([collision.x, collision.z, collision.hit], [point.x, point.z, 0]);
      addMark(sim, 'circle', 'spit', point.x, point.z, 1.8, 0, 0, 2, 12, 0, 0, null);
      const hp = sim.hero.hp;
      step(sim); step(sim);
      assert.equal(sim.hero.hp, hp, 'no hit before the deadline');
      step(sim);
      assert.equal(sim.hero.hp, distance === 0 ? hp - 12 : hp, 'same footprint inside and outside a building');
    }
  }
});
