// Geometry acceptance, independent of the walking smoke: inspect the actual exported GLB faces.
// Node 24: node tools/isle-rework/verify-v3.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import * as THREE from 'three';
import { scene, heights, triangles } from './glb.mjs';

const assets = process.argv[2] ?? path.resolve(import.meta.dirname, '../../client/assets/isle');
const [pier, lighthouse, props, terrain] = await Promise.all(['pier-breakwater', 'lighthouse', 'props', 'island-terrain'].map((f) => scene(path.join(assets, f + '.glb'))));
const key = (a) => a.map((n) => Math.round(n * 10000)).join(',');
function closed(mesh) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry, p = g.getAttribute('position'), edges = new Map();
  for (let i = 0; i < p.count; i += 3) {
    const v = [0, 1, 2].map((k) => key([p.getX(i + k), p.getY(i + k), p.getZ(i + k)]));
    for (let j = 0; j < 3; j++) {
      const a = v[j], b = v[(j + 1) % 3], edge = a < b ? a + '|' + b : b + '|' + a;
      const seen = edges.get(edge) ?? [0, 0]; seen[0]++; seen[1] += a < b ? 1 : -1; edges.set(edge, seen);
    }
  }
  const bad = [...edges.values()].filter(([count, winding]) => count !== 2 || winding !== 0);
  assert.equal(bad.length, 0, `${mesh.name}: ${bad.length} open, non-manifold or reversed edges`);
}
test('mole has a closed outward-facing body, including its underwater floor and both ends', () => {
  const mole = pier.getObjectByName('walk_mole'); closed(mole);
  const ray = new THREE.Raycaster(new THREE.Vector3(85, -4, 29.75), new THREE.Vector3(0, 1, 0));
  const bottom = ray.intersectObject(mole, false)[0];
  assert.ok(bottom && bottom.point.y < -2, 'no visible underside from the boat/water');
  for (const side of [-1, 1]) {
    const n = new THREE.Vector3(10, 0, 57).normalize().multiplyScalar(side);
    ray.set(new THREE.Vector3(85, 0.6, 29.75).addScaledVector(n, 10), n.clone().negate());
    assert.ok(ray.intersectObject(mole, false)[0], `open mole side ${side}`);
  }
});
test('the sea-side curb stands on the mole across its whole length and bend', () => {
  const curb = pier.getObjectByName('mole_curb_v3') ?? pier.getObjectByName('mole_curb_v2');
  const ground = heights(triangles(pier.getObjectByName('walk_mole'), () => true));
  const p = curb.geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - 2.6) < 0.001) {
    const h = ground(p.getX(i), p.getZ(i));
    assert.ok(Math.abs(h - 2.28) < 0.001, `curb over empty space at ${p.getX(i)}, ${p.getZ(i)}: ${h}`);
  }
});
test('landing and jetty join without the old 40 cm exposed gap', () => {
  const h = heights(triangles(pier, (o) => o.material.name === 'fi_wood'));
  for (const z of [-9.05, -8, -6.95]) {
    let previous = h(60.9, z);
    for (let x = 60.95; x <= 63.11; x += 0.05) {
      const current = h(x, z);
      assert.ok(Number.isFinite(current) && Math.abs(current - previous) < 0.11, `open/abrupt landing join ${x},${z}: ${previous} -> ${current}`);
      previous = current;
    }
  }
  const transition = pier.getObjectByName('walk_landing_transition');
  assert.ok(transition, 'missing physical landing connection'); closed(transition);
});
test('lighthouse stairs have a closed physical supporting frame', () => {
  const structure = lighthouse.getObjectByName('lighthouse_structure_v3');
  assert.ok(structure, 'treads still float without stringers or posts'); closed(structure);
  const ground = heights(triangles(terrain, (o) => o.name === 'terrain'));
  const posts = structure.userData.collision_boxes.filter(([x0, y0, z0, x1, y1, z1]) =>
    Math.abs(x1 - x0 - 0.18) < 0.001 && Math.abs(z1 - z0 - 0.18) < 0.001 && y1 - y0 > 0.3);
  assert.ok(posts.length >= 8, 'missing ground supports');
  for (const [x0, y0, z0, x1, y1, z1] of posts) {
    const h = ground((x0 + x1) / 2, (z0 + z1) / 2);
    assert.ok(h >= y0 && h < y1, `floating/fully buried support at ${x0},${z0}`);
  }
});
test('island sign posts meet the landing or terrain and the current warning is absent', () => {
  assert.ok(!props.getObjectByName('sign_post_02'), 'warning board and posts are still present');
  assert.ok(!props.getObjectByName('label_sign_post_02_0'), 'warning text is still present');
  const sign = props.getObjectByName('sign_island_01');
  const h = heights(triangles(pier, (o) => o.material.name === 'fi_wood'));
  const ground = heights(triangles(terrain, (o) => o.name === 'terrain'));
  for (const side of [-1, 1]) {
    const foot = new THREE.Vector3(side * 1.3, -0.3, -0.1).applyMatrix4(sign.matrixWorld);
    const top = Math.max(h(foot.x, foot.z), ground(foot.x, foot.z));
    const support = sign.userData.collision_boxes.find(([x0, , z0, x1, , z1]) => foot.x >= x0 && foot.x <= x1 && foot.z >= z0 && foot.z <= z1);
    assert.ok(support && top >= support[1] && top < support[1] + 0.4, `sign foot has no support at ${foot.toArray()}: ${top}`);
    if (top < foot.y) assert.ok(props.getObjectByName('island_sign_supports_v3'), 'extended visible post is missing');
  }
});
