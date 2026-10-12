import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { eliteHpFraction, MobRenderer } from '../client/dungeon/mobs.ts';
import type { DungeonAssets, MobModel } from '../client/dungeon/assets.ts';

test('elite health bars show the actual remaining fraction and omit ordinary or dead enemies', () => {
  assert.equal(eliteHpFraction({ elite: true, hp: 75, hpMax: 300 }), 0.25);
  assert.equal(eliteHpFraction({ elite: true, hp: 300, hpMax: 300 }), 1);
  assert.equal(eliteHpFraction({ elite: true, hp: 400, hpMax: 300 }), 1);
  assert.equal(eliteHpFraction({ elite: false, hp: 75, hpMax: 300 }), null);
  assert.equal(eliteHpFraction({ elite: true, hp: 0, hpMax: 300 }), null);
  assert.equal(eliteHpFraction({ elite: true, hp: -1, hpMax: 300 }), null);
  assert.equal(eliteHpFraction({ elite: true, hp: 75, hpMax: 0 }), null);
});

test('health bar anchor follows the loaded model top including the renderer scale', () => {
  const names: MobModel[] = ['rat','bat','slug','shroom','beetle','spitter','larva','cooper','shaman','hookclaw','wickmole','railhopper','chainwarden'];
  const mobs = {} as DungeonAssets['mobs'];
  for (const name of names) {
    const scene = new THREE.Group(), root = new THREE.Group();
    root.name = name;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial());
    mesh.position.y = 2;
    root.add(mesh); scene.add(root);
    mobs[name] = { scene, animations: [] } as unknown as DungeonAssets['mobs'][MobModel];
  }
  const renderer = new MobRenderer({ mobs } as DungeonAssets);
  assert.equal(renderer.height('barrel'), 3);
  assert.ok(Math.abs(renderer.height('shaman') - 3.15) < 1e-9);
  assert.equal(renderer.height('chainwarden'), 3);
  renderer.dispose();
});
