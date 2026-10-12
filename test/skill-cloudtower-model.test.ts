import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { CORE_RADIUS, sourcePart, towerCore } from '../client/skilltest/model-source.ts';

test('game uses the accepted Blender source and excludes every planning route component from the architecture', async ctx => {
  const bytes = readFileSync(new URL('../client/assets/skilltest/tower-course-v3.glb', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '21b87e786e2f16804f57371785a00a1df215fe5e9c4726682373204e0769ed98');
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new Promise<GLTF>((resolve, reject) => new GLTFLoader().parse(data, '', resolve, reject));
  const core = towerCore(gltf.scene), bounds = new THREE.Box3().setFromObject(core);
  let vertices = 0;
  core.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const p = o.geometry.getAttribute('position'); vertices += p.count;
    for (let i = 0; i < p.count; i++) assert.ok(Math.hypot(p.getX(i), p.getZ(i)) <= CORE_RADIUS + .001);
  });
  assert.ok(vertices > 25_000, 'retains real architectural detail');
  assert.ok(bounds.min.y <= .01 && bounds.max.y > 194 && bounds.max.y < 195);
  assert.ok(core.children.length <= 3, 'architecture remains batched by material');
  for (const name of ['s02_basket0', 's12_balloon0', 's12_balloon1', 's3_pendulum0']) {
    const part = sourcePart(gltf.scene, name);
    assert.ok(!new THREE.Box3().setFromObject(part).isEmpty(), `${name} contains actual exported geometry`);
  }
  ctx.diagnostic(`accepted core: ${vertices / 3} triangles, ${core.children.length} materials, ${bounds.max.y.toFixed(1)} m; route outside r=${CORE_RADIUS} removed`);
});
