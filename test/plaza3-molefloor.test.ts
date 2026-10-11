import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MOLE_FLOOR, MOLE_TOP, isMoleSlab, moleFloorGeometry, removeMoleSlabs } from '../client/lobby/plaza3/molefloor.ts';
import { worldGeometry } from '../client/lobby/plaza3/models.ts';

test('замена снимает только верхние плитки настоящего GLB: борта, ступень и сходни остаются', async () => {
  const bytes = fs.readFileSync(new URL('../client/assets/plaza3/pav_mole.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  const model = gltf.scene.getObjectByName('static_mole');
  assert.ok(model);
  const meshes: THREE.Mesh[] = [];
  model.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  let totalRemoved = 0;
  for (const mesh of meshes) {
    const matrix = new THREE.Matrix4().makeTranslation(-43, 0, 45).multiply(mesh.matrixWorld);
    const geo = worldGeometry(mesh.geometry, matrix);
    const oldCount = geo.index!.count;
    const positions = geo.getAttribute('position').array.slice();
    geo.computeBoundingBox();
    const bounds = geo.boundingBox!.clone();
    const { kept, removed } = removeMoleSlabs(geo);
    totalRemoved += removed;
    assert.equal(kept.index!.count, oldCount - removed * 3);
    assert.deepEqual(kept.getAttribute('position').array, positions, 'вершины сохранились; меняется только список граней');
    kept.computeBoundingBox();
    assert.deepEqual(kept.boundingBox, bounds, 'габариты бортов, ступени, огня и сходней сохранены');
    const p = kept.getAttribute('position');
    for (let i = 0; i < kept.index!.count; i += 3) {
      const points = [0, 1, 2].map((k): [number, number, number] => {
        const v = kept.index!.getX(i + k);
        return [p.getX(v), p.getY(v), p.getZ(v)];
      });
      assert.equal(isMoleSlab(points), false, 'исходная плитка не остаётся под новым настилом');
    }
  }
  assert.ok(totalRemoved >= 150 && totalRemoved <= 250, `верхние плитки: ${totalRemoved}`);
});

test('цельный настил занимает только внутренние поля мола на прежней высоте', () => {
  const geo = moleFloorGeometry();
  const pos = geo.getAttribute('position');
  assert.equal((geo.index?.count ?? pos.count) / 3, MOLE_FLOOR.length * 2);
  for (let i = 0; i < pos.count; i++) {
    assert.ok(Math.abs(pos.getY(i) - MOLE_TOP) < 1e-6);
    assert.ok(MOLE_FLOOR.some(([x0, z0, x1, z1]) => pos.getX(i) >= x0 - 1e-5 && pos.getX(i) <= x1 + 1e-5 && pos.getZ(i) >= z0 - 1e-5 && pos.getZ(i) <= z1 + 1e-5));
  }
  assert.equal(isMoleSlab([[-62.1, -.5, 45], [-61.8, -.5, 45], [-61.8, -.5, 45.2]]), false, 'камень кромки, пересекающий поле, не снимается');
  assert.equal(isMoleSlab([[-60, -.6, 45], [-59, -.6, 45], [-59, -.6, 46]]), false, 'основание мола не снимается');
});
