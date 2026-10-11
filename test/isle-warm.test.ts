import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { isleDist } from '../shared/maps/isle.ts';
import { IslandWarmup } from '../client/lobby/isle/warm.ts';

test('остров: со spawn компилируется actual GLB силуэт; full/Игнат прогреваются один раз при850м без показа скрытого', async () => {
  const load = async (file: string) => {
    const b = readFileSync(new URL(`../client/assets/isle/${file}.glb`, import.meta.url));
    return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
  };
  const terrain = await load('island-terrain'), lighthouse = await load('lighthouse'), ignat = await load('ignat');
  const far = terrain.scene.getObjectByName('island_silhouette')!;
  assert.ok(far && far.userData.hidden_with_full_island, 'готовый дальний LOD существует в actual GLB');
  const full = new THREE.Group(); full.add(terrain.scene, lighthouse.scene, ignat.scene);
  far.removeFromParent(); full.visible = far.visible = false;
  const lights = new THREE.Group(); lights.name = 'island-far-lights';
  const scene = new THREE.Scene(); scene.add(full, far, lights);
  const camera = new THREE.PerspectiveCamera();
  const compiles: number[][] = [];
  let finishFull!: () => void;
  const gl = { compileAsync: (objects: THREE.Object3D, usedCamera: THREE.Camera, target: THREE.Scene) => {
    assert.equal(usedCamera, camera); assert.equal(target, scene, 'свет и environment берутся из настоящего target scene');
    const nodes: number[] = []; objects.traverse(o => nodes.push(o.id)); compiles.push(nodes);
    if (compiles.length === 1) return Promise.resolve();
    return new Promise<void>(resolve => { finishFull = resolve; });
  } } as unknown as THREE.WebGLRenderer;
  const warm = new IslandWarmup(gl, camera, scene, full, [far, lights]);
  await warm.far();
  assert.ok(compiles[0].includes(far.id) && compiles[0].includes(lights.id));
  assert.ok(!compiles[0].includes(full.id) && !compiles[0].includes(ignat.scene.id));
  assert.equal(warm.approach(isleDist(8, -5.6)), null, 'full программы не заводятся с actual spawn');
  assert.equal(warm.approach(851), null);
  const pending = warm.approach(850)!;
  assert.equal(warm.fullReady, false, 'full LOD ещё запрещён до завершения compile');
  assert.equal(warm.approach(800), pending); assert.equal(warm.approach(900), pending);
  assert.equal(compiles.length, 2, 'движение вперёд/назад не заводит новый прогрев');
  assert.ok(compiles[1].includes(full.id) && compiles[1].includes(ignat.scene.id));
  assert.ok(!compiles[1].includes(far.id), 'полная фаза не пересобирает дальний LOD');
  assert.equal(full.visible, false); assert.equal(far.visible, false, 'прогрев не включает скрытые объекты даже на время await');
  finishFull(); await pending;
  assert.equal(warm.fullReady, true);
  assert.equal(warm.approach(520), pending); assert.equal(compiles.length, 2);
});

test('остров: прежний compile fallback завершает полную фазу и не повторяется каждый кадр', async () => {
  let calls = 0;
  const gl = { compileAsync: () => { calls++; return Promise.reject(new Error('parallel compile unavailable')); } } as unknown as THREE.WebGLRenderer;
  const warm = new IslandWarmup(gl, new THREE.Camera(), new THREE.Scene(), new THREE.Group(), []);
  await warm.far();
  const pending = warm.approach(300)!; await pending;
  assert.equal(warm.fullReady, true); assert.equal(warm.approach(200), pending); assert.equal(calls, 2);
});
