import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { YardBatch, YARD, yardDeck, yardMover, yardPulse, yardSweeper, type YardMaterial } from '../client/skilltest/shipyard.ts';
import { makeSkillMap } from '../shared/skillmap.ts';
const materials = { wood: new THREE.MeshStandardMaterial(), steel: new THREE.MeshStandardMaterial(), edge: new THREE.MeshStandardMaterial(), brass: new THREE.MeshStandardMaterial(), rubber: new THREE.MeshStandardMaterial(), paint: new THREE.MeshStandardMaterial(), concrete: new THREE.MeshStandardMaterial(), brick: new THREE.MeshStandardMaterial(), door: new THREE.MeshStandardMaterial() } satisfies Record<YardMaterial, THREE.Material>;

test('shipyard timber landing surfaces match every authoritative deck top and footprint', () => {
  for (const p of makeSkillMap().pads) {
    const group = new THREE.Group(), batch = new YardBatch(); yardDeck(batch, p.x, p.y, p.z, p.w, p.d, YARD.teal); const meshes = batch.flush(group, materials);
    assert.ok(meshes.length <= 7, 'details merge by material');
    const wood = meshes.find(m => m.material === materials.wood)!; wood.geometry.computeBoundingBox(); const box = wood.geometry.boundingBox!;
    assert.ok(Math.abs(box.max.y - p.y) < 1e-4, 'board top equals physical landing plane');
    assert.ok(box.min.x >= p.x - p.w / 2 - 1e-4 && box.max.x <= p.x + p.w / 2 + 1e-4);
    assert.ok(box.min.z >= p.z - p.d / 2 - 1e-4 && box.max.z <= p.z + p.d / 2 + 1e-4);
    assert.ok(new THREE.Box3().setFromObject(group).min.y < p.y - 2, 'real underslung girder depth');
  }
});
test('ferry, lift and sinking cassette keep an open player-size approach above the collider', () => {
  for (const m of makeSkillMap().movers) {
    const w = m.x1 - m.x0, d = m.z1 - m.z0, v = yardMover(w, d, YARD.teal, m.kind, 48, materials);
    const ray = new THREE.Raycaster(new THREE.Vector3(-w / 2 - .6, 1.1, 0), new THREE.Vector3(1, 0, 0), 0, w + 1.2);
    v.root.updateMatrixWorld(true); assert.equal(ray.intersectObject(v.root, true).length, 0, 'no decorative wall through centre approach');
    assert.equal(v.cables.length, 1, 'four ropes share one draw call'); for (const cable of v.cables) { const pos = cable.geometry.getAttribute('position'); for (let i = 0; i < pos.count; i++) assert.ok(Math.abs(pos.getZ(i)) >= d / 2 + .9, 'cables outside player reach at landing edge'); }
  }
});
test('industrial pulse lanes and rotor bars have bounded geometry and explicit dynamic parts', () => {
  const pulse = yardPulse(1.5, materials), rotor = yardSweeper(3.5, materials);
  assert.equal(pulse.jets.visible, false); assert.equal(pulse.jets.children.length, 3); assert.equal(pulse.lights.length, 1); assert.ok(pulse.rotor.children.length > 0);
  rotor.rotor.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(rotor.rotor);
  assert.ok(Math.abs(box.min.x + 3.5) < .01 && Math.abs(box.max.x - 3.5) < .01); assert.ok(box.min.y >= .2 && box.max.y <= .82, 'visible sweep matches server knock band');
});
test('cassette diagonal feet meet a continuous lower chord instead of hanging freely', () => {
  const group = new THREE.Group(), batch = new YardBatch(); yardDeck(batch, 0, 0, 0, 6, 6, YARD.teal); batch.flush(group, materials); group.updateMatrixWorld(true);
  for (const side of [-1, 1]) for (const x of [-2, -1, 0, 1, 2]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, -3, side * 6 * .32), new THREE.Vector3(0, 1, 0), 0, 2);
    const first = ray.intersectObject(group, true)[0]; assert.ok(first); assert.ok(first.point.y < -2, 'lower beam spans under every diagonal bay');
  }
});
