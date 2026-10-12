import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MOLE_FLOOR, MOLE_TOP, isMoleSlab, moleJointY, moleFloorGeometry, recessMoleSupport, removeMoleSlabs } from '../client/lobby/plaza3/molefloor.ts';
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

test('цельный настил сохраняет нижний мол и соединяет его рампой с площадкой без второго слоя landing', () => {
  const geo = moleFloorGeometry();
  const pos = geo.getAttribute('position');
  assert.equal((geo.index?.count ?? pos.count) / 3, MOLE_FLOOR.length * 2);
  for (let i = 0; i < pos.count; i++) {
    assert.ok(Math.abs(pos.getY(i) - moleJointY(pos.getX(i))) < 1e-6);
    assert.ok(MOLE_FLOOR.some(([x0, z0, x1, z1]) => pos.getX(i) >= x0 - 1e-5 && pos.getX(i) <= x1 + 1e-5 && pos.getZ(i) >= z0 - 1e-5 && pos.getZ(i) <= z1 + 1e-5));
  }
  assert.equal(isMoleSlab([[-62.1, -.5, 45], [-61.8, -.5, 45], [-61.8, -.5, 45.2]]), false, 'камень кромки, пересекающий поле, не снимается');
  assert.equal(isMoleSlab([[-60, -.6, 45], [-59, -.6, 45], [-59, -.6, 46]]), false, 'основание мола не снимается');
  assert.equal(moleJointY(-28), MOLE_TOP);
  assert.equal(moleJointY(-27), -0.25);
  assert.equal(moleJointY(-26), 0);
  assert.ok(!MOLE_FLOOR.some(([x0]) => x0 >= -26), 'верх landing рисует только площадка');
});

test('настоящая большая опорная грань GLB не закрывает текстурный настил и рампу', async () => {
  const bytes = fs.readFileSync(new URL('../client/assets/plaza3/pav_mole.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  const scene = new THREE.Scene();
  const material = new THREE.MeshBasicMaterial();
  const staticModel = gltf.scene.getObjectByName('static_mole')!;
  let changedVertices = 0;
  staticModel.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = worldGeometry(mesh.geometry, new THREE.Matrix4().makeTranslation(-43, 0, 45).multiply(mesh.matrixWorld));
    const p = geo.getAttribute('position');
    const before = p.array.slice();
    const colors = geo.getAttribute('color').array.slice();
    const indices = geo.index!.array.slice();
    geo.computeBoundingBox();
    const bounds = geo.boundingBox!.clone();
    recessMoleSupport(geo);
    for (let i = 0; i < p.count; i++) {
      assert.equal(p.getX(i), before[i * 3]);
      assert.equal(p.getZ(i), before[i * 3 + 2]);
      if (p.getY(i) === before[i * 3 + 1]) continue;
      changedVertices++;
      assert.equal(p.getX(i), -24);
      assert.ok(p.getZ(i) === 43.5 || p.getZ(i) === 46.5);
      assert.ok(Math.abs(p.getY(i) + .515) < 1e-6);
    }
    assert.deepEqual(geo.getAttribute('color').array, colors);
    assert.deepEqual(geo.index!.array, indices);
    geo.computeBoundingBox();
    assert.deepEqual(geo.boundingBox, bounds, 'полные габариты настоящего GLB не изменились');
    const { kept } = removeMoleSlabs(geo);
    scene.add(new THREE.Mesh(kept, material));
  });
  assert.equal(changedVertices, 2, 'опускаются только два восточных угла большой опорной пары');
  const floor = new THREE.Mesh(moleFloorGeometry(), material);
  floor.name = 'textured-floor'; scene.add(floor); scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const x of [-61, -55, -43, -32, -29, -27.5, -27, -26.5]) {
    ray.set(new THREE.Vector3(x, 3, 45), new THREE.Vector3(0, -1, 0));
    const top = ray.intersectObjects(scene.children, false)[0];
    assert.ok(top, `нет поверхности в x${x}`);
    assert.equal(top.object.name, 'textured-floor', `в x${x} опорная грань y${top.point.y} закрывает настоящий текстурный пол`);
    assert.ok(Math.abs(top.point.y - moleJointY(x)) < 1e-6);
  }
});
