import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobRenderer } from '../client/dungeon/mobs.ts';
import type { DungeonAssets, MobModel } from '../client/dungeon/assets.ts';
import { D, MOB_KINDS, mobIndex } from '../shared/dungeon/data.ts';
import { createRun } from '../shared/dungeon/sim.ts';
import { startWave, stepDirector } from '../shared/dungeon/director.ts';
import { hurtMob } from '../shared/dungeon/core.ts';
import { cleanupMobs, aliveCount } from '../shared/dungeon/mobs.ts';

test('actual renderer buffers accept the global live cap for every mob model before corpses', () => {
  // Geometry is a CPU-only fixture, not a product model or visual acceptance.
  const models = ['rat','bat','slug','shroom','beetle','spitter','larva','cooper','shaman','hookclaw','wickmole','railhopper','chainwarden','kvashnya'];
  const mobs = {} as DungeonAssets['mobs'];
  for (const name of models) {
    const scene = new THREE.Group(), root = new THREE.Group(); root.name = name;
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial())); scene.add(root);
    mobs[name as MobModel] = { scene, animations: [] } as unknown as DungeonAssets['mobs'][MobModel];
  }
  const renderer = new MobRenderer({ mobs } as DungeonAssets);
  for (const kind of MOB_KINDS) {
    if (kind === 'povidl' || kind === 'cauldronmaster') continue;
    renderer.begin(); assert.ok(renderer.capacity(kind) >= D.mobRules.maxAlive, kind);
    for (let i = 0; i < D.mobRules.maxAlive; i++) assert.equal(renderer.push(kind, i, 0, 0, 0, 'walk', 0, 0), true, kind);
    const live = renderer.drawn; assert.equal(live, 300);
    for (let i = 0; i < 100; i++) renderer.push(kind, i, 0, 0, 0, 'death', 0, 0);
    assert.ok(renderer.drawn >= live); renderer.end();
  }
  renderer.dispose();
});

test('real director flow and events retain per-kind caps across carryover and released queue slots', () => {
  const s = createRun(83); s.noFx = true; s.hero.invT = 1e9;
  const maxima: Record<string,number> = {};
  for (const n of [16,17,18,19,22,25,28,204]) {
    startWave(s,n);
    for (let frame = 0; frame < 1800; frame++) {
      stepDirector(s);
      assert.ok(aliveCount(s) <= 300);
      for (const [kind,cap] of Object.entries(D.expansion.liveCaps)) {
        const live = s.mobs.filter(m=>!m.die&&m.k===kind).length;
        maxima[kind] = Math.max(maxima[kind]??0,live); assert.ok(live <= cap!, `${n}:${kind}:${live}`);
      }
      // Actual kills free capped kinds; the queued remainder must still be able to appear.
      if (frame % 11 === 0) {
        for (const m of s.mobs.filter(m=>!m.die).slice(0,4)) hurtMob(s,m,m.hpMax*2,'test',m.x,m.z,0,0,0);
        for (const kind of ['hookclaw','wickmole','railhopper','chainwarden'] as const) {
          const m = s.mobs.find(m=>!m.die&&m.k===kind); if(m)hurtMob(s,m,m.hpMax*2,'test',m.x,m.z,0,0,0);
        }
      }
      s.t++; cleanupMobs(s);
    }
    s.choice = null; s.chest = null;
  }
  for (const kind of ['hookclaw','wickmole','railhopper','chainwarden']) assert.ok(maxima[kind]>0,kind);
  assert.ok(s.wave.pend[mobIndex('hookclaw')]>=0);
});
