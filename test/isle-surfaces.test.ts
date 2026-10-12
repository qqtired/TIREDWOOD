import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { dressIsleSurfaces } from '../client/lobby/isle/surfaces.ts';

async function load(file: string): Promise<THREE.Group> {
  const b = fs.readFileSync(new URL(`../client/assets/isle/${file}.glb`, import.meta.url));
  return (await new Promise<GLTF>((resolve, reject) => new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', resolve, reject))).scene;
}

test('каждая каменная / земляная грань имеет единую UV-проекцию с ограниченным растяжением', async () => {
  let faces = 0;
  for (const file of ['island-terrain', 'pier-breakwater']) {
    const root = await load(file); root.position.set(-950, -1.25, 180); dressIsleSurfaces(root); root.updateMatrixWorld(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material) || !/^isle_(ground|stone)_/.test(m.material.name)) return;
      const p = m.geometry.getAttribute('position'), uv = m.geometry.getAttribute('uv');
      const tile = m.material.name.endsWith('lawn') ? 4 : m.material.name.endsWith('sand') ? 6 : 2.4;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      for (let i = 0; i < p.count; i += 3) {
        a.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); b.fromBufferAttribute(p, i + 1).applyMatrix4(m.matrixWorld); c.fromBufferAttribute(p, i + 2).applyMatrix4(m.matrixWorld);
        const area = b.sub(a).cross(c.sub(a)).length();
        if (area < 1e-7) continue;
        const projected = Math.abs((uv.getX(i + 1) - uv.getX(i)) * (uv.getY(i + 2) - uv.getY(i)) - (uv.getY(i + 1) - uv.getY(i)) * (uv.getX(i + 2) - uv.getX(i))) * tile * tile;
        assert.ok(projected / area >= 1 / Math.sqrt(3) - 0.025 && projected / area <= 1.025,
          `${m.name} face${i / 3}: UV / physical area=${projected / area}`);
        faces++;
      }
    });
  }
  assert.ok(faces > 20000, `проверены реальные грани, включая скалы и крутые склоны: ${faces}`);
});

test('фактура ступеней / поручней использует один материал и сохраняет форму / shading normals', async () => {
  const root = await load('lighthouse');
  const names = ['walk_lighthouse_stairs', 'lighthouse_rails_v2'];
  const before = names.map((name) => {
    const mesh = root.getObjectByName(name) as THREE.Mesh;
    return { name, p: [...mesh.geometry.getAttribute('position').array], n: [...mesh.geometry.getAttribute('normal').array] };
  });
  dressIsleSurfaces(root);
  const mats = new Set<THREE.Material>();
  for (const b of before) {
    const mesh = root.getObjectByName(`${b.name}_surface_wood`) as THREE.Mesh;
    assert.ok(mesh, b.name); const mat = mesh.material as THREE.MeshStandardMaterial; mats.add(mat);
    assert.equal(mat.name, 'isle_wood_stairs'); assert.ok(mat.map); assert.equal(mat.map.wrapS, THREE.RepeatWrapping);
    assert.deepEqual([...mesh.geometry.getAttribute('position').array], b.p); assert.deepEqual([...mesh.geometry.getAttribute('normal').array], b.n);
    assert.equal(mesh.geometry.getAttribute('uv').count, mesh.geometry.getAttribute('position').count);
  }
  assert.equal(mats.size, 1, 'ступени и поручни склеиваются в один bucket');
});

test('понтон / сходни используют тот же wood bucket, дерево домов / предметов остаётся прежним', async () => {
  const pier = await load('pier-breakwater'), lighthouse = await load('lighthouse');
  const names = ['pier_1', 'walk_jetty_underlay', 'walk_pontoon_underlay'];
  const before = names.map((name) => {
    const mesh = pier.getObjectByName(name) as THREE.Mesh, g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    return { name, p: [...g.getAttribute('position').array], n: [...g.getAttribute('normal').array], tris: g.getAttribute('position').count / 3 };
  });
  dressIsleSurfaces(pier); dressIsleSurfaces(lighthouse);
  const stairs = lighthouse.getObjectByName('walk_lighthouse_stairs_surface_wood') as THREE.Mesh;
  let tris = 0;
  for (const b of before) {
    const mesh = pier.getObjectByName(`${b.name}_surface_wood`) as THREE.Mesh;
    assert.ok(mesh, b.name); assert.equal(mesh.material, stairs.material, 'у настилов и лестницы один материал / bitmap');
    assert.deepEqual([...mesh.geometry.getAttribute('position').array], b.p); assert.deepEqual([...mesh.geometry.getAttribute('normal').array], b.n);
    assert.equal(mesh.geometry.getAttribute('position').count / 3, b.tris); tris += b.tris;
    const uv = mesh.geometry.getAttribute('uv'); assert.equal(uv.count, mesh.geometry.getAttribute('position').count);
    assert.ok([...uv.array].every(Number.isFinite));
  }
  assert.equal(tris, 1418, 'реальные деревянные меши настилов / сходней в GLB');
  for (const file of ['props', 'keeper-house', 'houses', 'cannery', 'schooner-wreck']) {
    const root = await load(file), untouched: Array<{ m: THREE.Mesh; parent: THREE.Object3D | null; g: THREE.BufferGeometry; material: THREE.Material }> = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !Array.isArray(m.material) && m.material.name === 'fi_wood') untouched.push({ m, parent: m.parent, g: m.geometry, material: m.material });
    });
    dressIsleSurfaces(root);
    for (const b of untouched) {
      assert.equal(b.m.parent, b.parent); assert.equal(b.m.geometry, b.g); assert.equal(b.m.material, b.material);
      assert.equal((b.m.material as THREE.MeshStandardMaterial).map, null, `${file}/${b.m.name}: незапрошенное дерево не текстурировалось`);
    }
  }
});
