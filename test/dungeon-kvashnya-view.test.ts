import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { getKvashnyaPose } from '../client/dungeon/kvashnya-pose.ts';
import { MobRenderer } from '../client/dungeon/mobs.ts';
import type { DungeonAssets, MobModel } from '../client/dungeon/assets.ts';
import { KVASHNYA_TIMING as T } from '../shared/dungeon/kvashnya-state.ts';
import { SimRun } from '../client/dungeon/simview.ts';
import { makeMob } from '../shared/dungeon/core.ts';
import { addMark } from '../shared/dungeon/mobs.ts';
import { MOBS } from '../client/dungeon/data.ts';

test('Kvashnya clips match shared impact ticks and never restart at landing', () => {
  assert.equal(getKvashnyaPose('jump',T.jump.windup+T.jump.takeoff).time,3/24);
  for (const skill of ['tongue', 'jump'] as const) {
    const timing = T[skill];
    const names = skill === 'tongue' ? ['tongue_windup', 'tongue_attack', 'tongue_recover'] : ['windup', 'attack', 'recover'];
    assert.equal(getKvashnyaPose(skill, 0).key, names[0]);
    assert.deepEqual(getKvashnyaPose(skill, timing.windup), { key: names[1], time: 0 });
    const impact = getKvashnyaPose(skill, timing.windup + timing.impact);
    assert.equal(impact.key, names[1]);
    assert.ok(Math.abs(impact.time - (skill === 'tongue' ? 4 / 24 : 14 / 24)) < 1e-9);
    assert.deepEqual(getKvashnyaPose(skill, timing.windup + timing.attack), { key: names[2], time: 0 });
    const late = getKvashnyaPose(skill, 999);
    assert.equal(late.key, names[2]);
    assert.equal(late.time, skill === 'tongue' ? 1 : 26 / 24);
  }
});

test('Kvashnya cancellation uses recovery directly and a held attack clock gives the same pose', () => {
  assert.deepEqual(getKvashnyaPose('recover', 0), { key: 'recover', time: 0 });
  assert.equal(getKvashnyaPose('recover', 30).time, 26 / 24);
  assert.deepEqual(getKvashnyaPose('tongue', 140 - 120), getKvashnyaPose('tongue', 141 - 121));
  assert.deepEqual(getKvashnyaPose('jump', -1), { key: 'windup', time: 0 });
});

test('real view exposes Kvashnya as elite with its original attack clock and physical warning sizes', () => {
  const run = new SimRun(173), sim = run.sim;
  const mob = makeMob(sim, 'kvashnya', 120, 120, 1, 1, 0); sim.mobs.push(mob);
  mob.elite = 1; mob.attackKind = 'tongue'; mob.attackAt = 10; mob.st = 'attack';
  sim.t = 10 + T.tongue.windup + T.tongue.impact; sim.freezeT = sim.t + 30;
  addMark(sim,'lane','kvashnya_tongue',120,120.95,0,0,1,32,18,0,0,mob,6,.9);
  addMark(sim,'circle','kvashnya_jump',120,125.5,1.65,0,0,56,22,0,0,mob);
  const view = run.view(), enemy = view.enemies.find(e=>e.id===mob.id)!;
  assert.equal(enemy.elite,true); assert.equal(enemy.skill,'tongue'); assert.equal(enemy.animAt,10); assert.equal(enemy.animFrozen,true);
  assert.equal(view.bosses.length,0); assert.equal(MOBS.kvashnya.name,'Квашня');
  const lane=view.teles.find(t=>t.shape==='strip')!, circle=view.teles.find(t=>t.shape==='circle')!;
  assert.equal(lane.tone,'red'); assert.equal(lane.w,1.8); assert.equal(lane.r,6.9);
  assert.ok(Math.abs(circle.r-2.1)<1e-9);
});

test('actual Kvashnya GLB bakes all ten clips, keeps its own scale and lifts only the health anchor', async () => {
  const bytes = readFileSync(new URL('../client/assets/dungeon/kvashnya.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  assert.equal(gltf.animations.length, 10);
  assert.ok(gltf.scene.getObjectByName('tongue'));
  assert.ok(gltf.scene.getObjectByName('tongue_tip'));
  for (const clip of gltf.animations) assert.equal(clip.tracks.length, 33, clip.name);
  const models: MobModel[] = ['rat','bat','slug','shroom','beetle','spitter','larva','cooper','shaman','hookclaw','wickmole','railhopper','chainwarden'];
  const mobs = { kvashnya: gltf } as DungeonAssets['mobs'];
  for (const name of models) {
    const scene = new THREE.Group(), root = new THREE.Group(); root.name = name;
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial())); scene.add(root);
    mobs[name] = { scene, animations: [] } as unknown as GLTF;
  }
  const renderer = new MobRenderer({ mobs } as DungeonAssets);
  try {
    for (const key of ['idle','walk','windup','attack','recover','hit','death','tongue_windup','tongue_attack','tongue_recover'] as const) assert.ok(renderer.has('kvashnya', key), key);
    assert.equal(renderer.duration('kvashnya','death'), 2);
    assert.ok(renderer.bodyLift('kvashnya','attack',6/24) > .7);
    assert.ok(Math.abs(renderer.bodyLift('kvashnya','attack',14/24)) < .15);
    assert.ok(renderer.height('kvashnya') < 1.8, 'elite must not receive boss or generic elite scaling');
    const mesh = renderer.root.getObjectByName('dg-mob-kvashnya') as THREE.InstancedMesh;
    assert.equal(mesh.frustumCulled, false, 'extended tongue must not be culled by the resting geometry bounds');
    renderer.begin(); assert.equal(renderer.push('kvashnya',0,0,0,0,'tongue_attack',4/24,0),true); renderer.end();
    assert.equal(mesh.count, 1);
    const transform = new THREE.Matrix4(); mesh.getMatrixAt(0,transform);
    assert.deepEqual(new THREE.Vector3().setFromMatrixScale(transform).toArray(),[1,1,1]);
  } finally { renderer.dispose(); }
});
