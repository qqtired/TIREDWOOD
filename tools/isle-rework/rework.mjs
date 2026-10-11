// Last Light v2: run with Node 24. No Blender, browser, renderer, original scripts or .blend are mutated.
// node tools/isle-rework/rework.mjs /absolute/path/to/fishing-island/v2-2026-10-11
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { readGlb, writeGlb, primitive, addMesh, scene, triangles, heights } from './glb.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SOURCE = process.argv[2];
if (!SOURCE || !path.isAbsolute(SOURCE)) throw new Error('Pass an absolute preserved v2 source directory');
const V1 = path.join(SOURCE, 'v1-glb'), OUT = path.join(ROOT, 'client/assets/isle');
fs.mkdirSync(V1, { recursive: true });
for (const f of fs.readdirSync(OUT).filter((x) => x.endsWith('.glb'))) {
  const target = path.join(V1, f); if (!fs.existsSync(target)) fs.copyFileSync(path.join(OUT, f), target);
}

const groundRoot = await scene(path.join(V1, 'island-terrain.glb'));
const groundAt = heights(triangles(groundRoot, (o) => o.name === 'terrain'));
const color = (g, hex) => {
  const c = new THREE.Color(hex), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[3 * i] = c.r; a[3 * i + 1] = c.g; a[3 * i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
};
const box = (x0, y0, z0, x1, y1, z1, c) => color(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), c);
const merge = (list) => mergeGeometries(list.map((g) => g.index ? g.toNonIndexed() : g), false);
const mat = (glb, name) => glb.json.materials.findIndex((m) => m.name === name);
function filteredGeometry(mesh, keep) {
  const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const p = src.getAttribute('position'), indices = [];
  for (let i = 0; i < p.count; i += 3) if (keep([0, 1, 2].map((k) => [p.getX(i + k), p.getY(i + k), p.getZ(i + k)]))) indices.push(i, i + 1, i + 2);
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color', 'uv']) {
    const a = src.getAttribute(name); if (!a) continue;
    out.setAttribute(name, new THREE.Float32BufferAttribute(indices.flatMap((i) => Array.from({ length: a.itemSize }, (_, k) => a.getComponent(i, k))), a.itemSize));
  }
  return out;
}

// Carve only the stair corridor below its actual treads; preserve hills and the lighthouse silhouette.
const footH = groundAt(56, -22) + 0.03, topH = 16;
const terrainGlb = readGlb(path.join(V1, 'island-terrain.glb'));
const terrain = groundRoot.getObjectByName('terrain');
const p = terrain.geometry.getAttribute('position');
const du = 12, dv = -28, run2 = du * du + dv * dv;
for (let i = 0; i < p.count; i++) {
  const x = p.getX(i), z = p.getZ(i), t = Math.max(0, Math.min(1, ((x - 56) * du + (z + 22) * dv) / run2));
  if (x >= 54.5 && x <= 59.7 && z >= -20.5 && z <= -12.2) p.setY(i, 2.25);
  const d = Math.hypot(x - 56 - du * t, z + 22 - dv * t);
  if (d >= 3 || t <= 0.02 || t >= 0.98) continue;
  const ceiling = footH + (topH - footH) * t - 0.2;
  const blend = d < 1.9 ? 1 : (3 - d) / 1.1;
  p.setY(i, p.getY(i) - Math.max(0, p.getY(i) - ceiling) * blend);
}
terrain.geometry.computeVertexNormals();
const tn = terrainGlb.json.nodes.find((n) => n.name === 'terrain');
terrainGlb.json.meshes[tn.mesh].primitives = [primitive(terrainGlb, terrain.geometry, mat(terrainGlb, 'fi_ground'))];
writeGlb(path.join(OUT, 'island-terrain.glb'), terrainGlb);

// The mole's two rows of rotated slabs left seams and holes at its bend. Build one capped ribbon.
const pierGlb = readGlb(path.join(V1, 'pier-breakwater.glb'));
const pierRoot = await scene(path.join(V1, 'pier-breakwater.glb'));
const pn = pierGlb.json.nodes.find((n) => n.name === 'pier');
const pierMeshes = [];
pierRoot.traverse((o) => { if (o.isMesh && /^pier/.test(o.name) && !/breakwater/.test(o.name)) pierMeshes.push(o); });
for (const mesh of pierMeshes) {
  const gp = mesh.geometry.getAttribute('position');
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), y = gp.getY(i), z = gp.getZ(i);
    if (x >= 70.5 && x <= 96.1 && z > -9.4 && z < -6.65 && y > -1 && y < 1.2) gp.setY(i, y - 0.05);
  }
  mesh.geometry.computeVertexNormals();
}
pierGlb.json.meshes[pn.mesh].primitives = pierMeshes.map((o) => primitive(pierGlb, o.geometry, mat(pierGlb, o.material.name)));
const stone = [];
pierRoot.traverse((o) => { if (o.isMesh && o.material.name === 'fi_stone' && /breakwater/.test(o.name + o.parent?.name)) stone.push(o); });
const bn = pierGlb.json.nodes.find((n) => n.name === 'breakwater');
const stonePrim = pierGlb.json.meshes[bn.mesh].primitives.findIndex((q) => q.material === mat(pierGlb, 'fi_stone'));
// Preserve the original rubble mound below the paving and all metal/paint/light fittings.
pierGlb.json.meshes[bn.mesh].primitives[stonePrim] = primitive(pierGlb, filteredGeometry(stone[0], (t) => t.every((q) => q[1] <= 2.15 + 1e-4)), mat(pierGlb, 'fi_stone'));
const axis = [[51.05, 35.69], [55, 35], [112, 25], [120, 12]];
const rims = axis.map(([x, z], i) => {
  const a = axis[Math.max(0, i - 1)], b = axis[Math.min(axis.length - 1, i + 1)];
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l;
  return [[x - nx * 1.8, z - nz * 1.8], [x + nx * 1.8, z + nz * 1.8]];
});
const deck = [], curb = [];
const quad = (a, b, c, d, h) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([a, b, c, a, c, d].flatMap(([x, z]) => [x, h, z]), 3)); g.computeVertexNormals(); return color(g, 0x96918a); };
// Explicit CCW winding in X/Z as seen from below glTF Y-up: normals point up.
for (let i = 0; i < axis.length - 1; i++) {
  const [a, b] = rims[i], [d, c] = rims[i + 1];
  deck.push(quad(a, b, c, d, 2.28));
  // Side walls are lower than the top and share fi_stone; no overlapping top faces.
  for (const [s, e] of [[a, d], [c, b]]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([s[0], 2.15, s[1], s[0], 2.28, s[1], e[0], 2.28, e[1], s[0], 2.15, s[1], e[0], 2.28, e[1], e[0], 2.15, e[1]], 3));
    g.computeVertexNormals(); deck.push(color(g, 0x827d74));
  }
  const dx = axis[i + 1][0] - axis[i][0], dz = axis[i + 1][1] - axis[i][1], l = Math.hypot(dx, dz);
  const n = Math.ceil(l / 1.8);
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n;
    const x = axis[i][0] + dx * (t0 + t1) / 2 - dz / l * 2.025;
    const z = axis[i][1] + dz * (t0 + t1) / 2 + dx / l * 2.025;
    curb.push(color(new THREE.BoxGeometry(l / n + 0.005, 0.32, 0.45).rotateY(-Math.atan2(dz, dx)).translate(x, 2.44, z), 0x8a857b));
  }
}
addMesh(pierGlb, 'walk_mole', merge(deck), mat(pierGlb, 'fi_stone'));
addMesh(pierGlb, 'mole_curb_v2', merge(curb), mat(pierGlb, 'fi_stone'));
// Visible eight-step entrance from the beach, same triangles used by the collider.
const beachH = groundAt(46.7, 35.1), steps = [];
for (let i = 0; i < 8; i++) steps.push(box(46.7 + i * 0.6, beachH - 0.3, 33.9, 46.7 + (i + 1) * 0.6, beachH + (2.28 - beachH) * (i + 1) / 8, 36.3, i % 2 ? 0x8a857b : 0x96918a));
addMesh(pierGlb, 'walk_mole_steps', merge(steps), mat(pierGlb, 'fi_stone'));
// Dark support below old boards fills their gaps without overlapping existing top faces.
addMesh(pierGlb, 'walk_jetty_underlay', box(61, 1.30, -9.45, 69.6, 1.38, -6.55, 0x5a4a3d), mat(pierGlb, 'fi_wood'));
addMesh(pierGlb, 'walk_pontoon_underlay', box(70.6, 0.30, -9.25, 96, 0.38, -6.75, 0x5a4a3d), mat(pierGlb, 'fi_wood'));
// An actual connected sloping gangway replaces the old broad staircase collision.
// Existing thin gangway stays the visible top; collision generator selects its upward fi_wood faces.
writeGlb(path.join(OUT, 'pier-breakwater.glb'), pierGlb);

// Widen treads to 2.4m, close risers and start at the measured ground, retaining the tower/lens/lamp.
const lighthouseGlb = readGlb(path.join(V1, 'lighthouse.glb'));
const st = lighthouseGlb.json.nodes.find((n) => n.name === 'lighthouse_stairs');
const a = new THREE.Vector3(56, 0, -22), b = new THREE.Vector3(68, 0, -50);
const run = a.distanceTo(b), yaw = -Math.atan2(b.z - a.z, b.x - a.x), n = Math.ceil((topH - footH) / 0.2);
const treads = [], rails = [];
for (let i = 0; i < n; i++) {
  const t = (i + 0.5) / n, h = footH + (topH - footH) * (i + 1) / n;
  treads.push(color(new THREE.BoxGeometry(run / n + 0.005, 0.205, 2.4).rotateY(yaw).translate(a.x + (b.x - a.x) * t, h - 0.1025, a.z + (b.z - a.z) * t), i % 3 ? 0x796958 : 0x857565));
}
const f = b.clone().sub(a).normalize(), side = new THREE.Vector3(-f.z, 0, f.x);
for (const t of [0, 1]) {
  const c = a.clone().lerp(b, t).addScaledVector(f, t ? 0.6 : -0.6), h = t ? topH : footH;
  treads.push(color(new THREE.BoxGeometry(1.25, 0.12, 2.4).rotateY(yaw).translate(c.x, h - 0.06, c.z), 0x6e5b4a));
}
for (const sign of [-1, 1]) {
  for (let i = 0; i <= 13; i++) {
    const t = i / 13, c = a.clone().lerp(b, t).addScaledVector(side, sign * 1.28), h = footH + (topH - footH) * t;
    rails.push(box(c.x - 0.055, h - 0.18, c.z - 0.055, c.x + 0.055, h + 1.02, c.z + 0.055, 0x6e5b4a));
  }
  const start = a.clone().addScaledVector(side, sign * 1.28).setY(footH + 1.02);
  const end = b.clone().addScaledVector(side, sign * 1.28).setY(topH + 1.02);
  const len = start.distanceTo(end), c = start.clone().add(end).multiplyScalar(0.5);
  const g = color(new THREE.BoxGeometry(0.09, len, 0.09), 0x857565);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize())).translate(c.x, c.y, c.z); rails.push(g);
}
lighthouseGlb.json.meshes[st.mesh].primitives = [primitive(lighthouseGlb, merge(treads), mat(lighthouseGlb, 'fi_wood'))];
st.name = 'walk_lighthouse_stairs';
addMesh(lighthouseGlb, 'lighthouse_rails_v2', merge(rails), mat(lighthouseGlb, 'fi_wood'));
writeGlb(path.join(OUT, 'lighthouse.glb'), lighthouseGlb);

// Compact exact triangle surface: unique float32 positions + indices, no quantized floating AABB grid.
const models = await Promise.all(['island-terrain', 'pier-breakwater', 'lighthouse'].map((f) => scene(path.join(OUT, f + '.glb'))));
const surface = [], kinds = [];
models.forEach((root, i) => root.traverse((o) => {
  if (!o.isMesh || !(i === 0 ? o.name === 'terrain' || o.name === 'rocks' : /^walk_/.test(o.name) || (i === 1 && /^pier/.test(o.name + o.parent?.name) && o.material.name === 'fi_wood'))) return;
  const t = triangles(o, () => true), kind = i === 0 || /^walk_mole/.test(o.name) ? 0 : i === 2 ? 2 : 1;
  surface.push(...t); kinds.push(...t.map(() => kind));
}));
const points = [], ids = [], seen = new Map();
for (const tri of surface) for (let k = 0; k < 9; k += 3) {
  const v = tri.slice(k, k + 3).map(Math.fround), key = v.join(',');
  if (!seen.has(key)) { seen.set(key, points.length / 3); points.push(...v); }
  ids.push(seen.get(key));
}
const pb = Buffer.from(new Float32Array(points).buffer), ib = Buffer.from(new Uint32Array(ids).buffer);
fs.writeFileSync(path.join(ROOT, 'shared/maps/isleterrain-data.ts'), `// Generated by tools/isle-rework/rework.mjs from actual v2 GLB upward-facing triangles. Do not hand edit.\nexport const ISLE_SURFACE_POINTS = '${pb.toString('base64')}';\nexport const ISLE_SURFACE_INDICES = '${ib.toString('base64')}';\nexport const ISLE_SURFACE_KINDS = '${Buffer.from(kinds).toString('base64')}';\n`);
const summary = { source: SOURCE, stairFoot: footH, moleBeach: beachH, uniquePoints: points.length / 3, triangles: ids.length / 3, byteLength: pb.length + ib.length, preservedAnchors: pierGlb.json.nodes.filter((x) => /^(spawn|berth_|fish_|mole_light)/.test(x.name)).map((x) => ({ name: x.name, at: x.translation, extras: x.extras })) };
fs.writeFileSync(path.join(SOURCE, 'rework-summary.json'), JSON.stringify(summary, null, 2));
fs.mkdirSync(path.join(SOURCE, 'v2-glb'), { recursive: true });
for (const f of ['island-terrain', 'pier-breakwater', 'lighthouse']) fs.copyFileSync(path.join(OUT, f + '.glb'), path.join(SOURCE, 'v2-glb', f + '.glb'));
console.log(JSON.stringify({ ...summary, preservedAnchors: summary.preservedAnchors.length }));
