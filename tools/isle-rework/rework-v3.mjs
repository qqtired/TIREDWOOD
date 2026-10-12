// Last Light review 3: repair visible joins and the actual supporting construction.
// Node 24: node tools/isle-rework/rework-v3.mjs /absolute/path/to/fishing-island/v3-2026-10-12
// The input GLBs are preserved once in v2-glb. Original Blender sources and v1/v2 stay untouched.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { readGlb, writeGlb, primitive, addMesh, scene, triangles, heights } from './glb.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..'), OUT = path.join(ROOT, 'client/assets/isle');
const SOURCE = process.argv[2];
if (!SOURCE || !path.isAbsolute(SOURCE)) throw new Error('Pass an absolute new v3 source directory');
const INPUT = path.join(SOURCE, 'v2-glb');
fs.mkdirSync(INPUT, { recursive: true });
for (const file of fs.readdirSync(OUT).filter((f) => f.endsWith('.glb'))) {
  if (!fs.existsSync(path.join(INPUT, file))) fs.copyFileSync(path.join(OUT, file), path.join(INPUT, file));
}
const terrain = await scene(path.join(INPUT, 'island-terrain.glb'));
const ground = heights(triangles(terrain, (o) => o.name === 'terrain'));
const mat = (glb, name) => glb.json.materials.findIndex((m) => m.name === name);
function tint(g, hex) {
  const c = new THREE.Color(hex), data = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < data.length; i += 3) { data[i] = c.r; data[i + 1] = c.g; data[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(data, 3)); return g;
}
const merge = (parts) => mergeGeometries(parts.map((g) => {
  const out = g.index ? g.toNonIndexed() : g.clone(); out.deleteAttribute('uv'); return out;
}), false);
const box = (x0, y0, z0, x1, y1, z1, color) => tint(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), color);
function geometry(vertices, faces, color) {
  const p = faces.flatMap((f) => f.flatMap((i) => vertices[i]));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals(); return tint(g, color);
}
// Cross sections share the exact mitred bend vertices. End caps and the bottom are real outward-facing faces.
function ribbon(axis, profile, color) {
  const vertices = [], faces = [], count = profile.length;
  axis.forEach(([x, z], i) => {
    const direction = (a, b) => new THREE.Vector2(b[0] - a[0], b[1] - a[1]).normalize();
    const before = direction(axis[Math.max(0, i - 1)], axis[i === 0 ? 1 : i]);
    const after = direction(axis[i === axis.length - 1 ? i - 1 : i], axis[Math.min(axis.length - 1, i + 1)]);
    const na = new THREE.Vector2(-before.y, before.x), nb = new THREE.Vector2(-after.y, after.x);
    const n = na.clone().add(nb).normalize().divideScalar(na.clone().add(nb).normalize().dot(na));
    for (const [off, y] of profile) vertices.push([x + n.x * off, y, z + n.y * off]);
  });
  for (let i = 0; i < axis.length - 1; i++) for (let j = 0; j < count; j++) {
    const a = i * count + j, b = i * count + (j + 1) % count, c = b + count, d = a + count;
    faces.push([a, b, c], [a, c, d]);
  }
  const caps = THREE.ShapeUtils.triangulateShape(profile.map(([x, y]) => new THREE.Vector2(x, y)), []);
  for (const end of [0, axis.length - 1]) {
    const prev = axis[end ? end - 1 : 1], at = axis[end];
    const outward = new THREE.Vector3(at[0] - prev[0], 0, at[1] - prev[1]);
    for (const cap of caps) {
      const ids = cap.map((n) => end * count + n);
      const a = new THREE.Vector3(...vertices[ids[0]]), b = new THREE.Vector3(...vertices[ids[1]]), c = new THREE.Vector3(...vertices[ids[2]]);
      if (b.sub(a).cross(c.sub(a)).dot(outward) < 0) [ids[1], ids[2]] = [ids[2], ids[1]];
      faces.push(ids);
    }
  }
  return geometry(vertices, faces, color);
}
// Vertices are welded only for finding connected original pieces; their exported normals/colors remain untouched.
function components(source) {
  const g = source.index ? source.toNonIndexed() : source, p = g.getAttribute('position');
  const parent = Array.from({ length: p.count / 3 }, (_, i) => i), seen = new Map();
  const find = (n) => { while (parent[n] !== n) { parent[n] = parent[parent[n]]; n = parent[n]; } return n; };
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)].map((n) => Math.round(n * 10000)).join(','), t = Math.floor(i / 3);
    if (seen.has(key)) parent[find(t)] = find(seen.get(key)); else seen.set(key, t);
  }
  const result = new Map();
  for (let i = 0; i < p.count; i++) {
    const id = find(Math.floor(i / 3));
    const part = result.get(id) ?? { ids: [], bounds: new THREE.Box3() };
    part.ids.push(i); part.bounds.expandByPoint(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))); result.set(id, part);
  }
  return [...result.values()].map((part) => ({ ...part, geometry: subset(g, part.ids) }));
}
function subset(g, ids) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color', 'uv']) {
    const a = g.getAttribute(name); if (!a) continue;
    out.setAttribute(name, new THREE.Float32BufferAttribute(ids.flatMap((i) => Array.from({ length: a.itemSize }, (_, k) => a.getComponent(i, k))), a.itemSize));
  }
  return out;
}
function replace(glb, name, g, material) {
  const node = glb.json.nodes.find((n) => n.name === name);
  glb.json.meshes[node.mesh].primitives = [primitive(glb, g, mat(glb, material))];
}
function removeNodes(glb, names) {
  const removed = new Set(glb.json.nodes.flatMap((n, i) => names.includes(n.name) ? [i] : []));
  for (const n of glb.json.nodes) if (n.children) n.children = n.children.filter((i) => !removed.has(i));
  for (const s of glb.json.scenes) s.nodes = s.nodes.filter((i) => !removed.has(i));
  // Unreachable nodes are not exported scene objects; leave indices stable for all preserved references.
  for (const i of removed) glb.json.nodes[i] = { name: 'removed_' + glb.json.nodes[i].name };
}

const pier = readGlb(path.join(INPUT, 'pier-breakwater.glb')), pierScene = await scene(path.join(INPUT, 'pier-breakwater.glb'));
const breakwater = pier.json.nodes.find((n) => n.name === 'breakwater');
const stoneParts = components(pierScene.getObjectByName('breakwater_1').geometry);
const rocks = stoneParts.filter((p) => p.bounds.max.x - p.bounds.min.x < 5 && p.bounds.max.z - p.bounds.min.z < 5);
const stoneIndex = pier.json.meshes[breakwater.mesh].primitives.findIndex((p) => p.material === mat(pier, 'fi_stone'));
pier.json.meshes[breakwater.mesh].primitives[stoneIndex] = primitive(pier, merge(rocks.map((p) => p.geometry)), mat(pier, 'fi_stone'));
const axis = [[51.05, 35.69], [55, 35], [112, 25], [120, 12]];
const body = ribbon(axis, [[-5.2, -2.6], [-3.6, -0.2], [-2.45, 1.3], [-1.8, 2.28], [2.25, 2.28], [2.8, 1.3], [3.8, -0.2], [5.2, -2.6]], 0x8a857b);
replace(pier, 'walk_mole', body, 'fi_stone');
replace(pier, 'mole_curb_v2', ribbon(axis, [[1.8, 2.28], [1.8, 2.6], [2.25, 2.6], [2.25, 2.28]], 0x8a857b), 'fi_stone');
pier.json.nodes.find((n) => n.name === 'mole_curb_v2').name = 'mole_curb_v3';
const steps = [], beach = ground(46.7, 35.1);
for (let i = 0; i < 8; i++) steps.push(box(46.7 + i * 0.6, -2.6, 33.9, 46.7 + (i + 1) * 0.6, beach + (2.28 - beach) * (i + 1) / 8, 36.3, i % 2 ? 0x8a857b : 0x96918a));
replace(pier, 'walk_mole_steps', merge(steps), 'fi_stone');

const pierNode = pier.json.nodes.find((n) => n.name === 'pier');
const woodIndex = pier.json.meshes[pierNode.mesh].primitives.findIndex((p) => p.material === mat(pier, 'fi_wood'));
const woodParts = components(pierScene.getObjectByName('pier_1').geometry);
const removedBoards = woodParts.filter(({ bounds: b }) => b.min.x >= 61 && b.max.x <= 63.11 && b.min.y > 1.3 && b.max.y < 1.5 && b.max.z - b.min.z > 2.9);
const keepWood = woodParts.filter((p) => !removedBoards.includes(p));
pier.json.meshes[pierNode.mesh].primitives[woodIndex] = primitive(pier, merge(keepWood.map((p) => p.geometry)), mat(pier, 'fi_wood'));
const landing = 1.798075795173645;
addMesh(pier, 'walk_landing_underlay', box(54.5, landing - 0.22, -11.2, 61, landing - 0.09, -5.8, 0x5a4a3d), mat(pier, 'fi_wood'));
const ramp = geometry([
  [60.97, landing - 0.001, -9.5], [63.11, 1.405, -9.5], [63.11, 1.405, -6.5], [60.97, landing - 0.001, -6.5],
  [60.97, landing - 0.181, -9.5], [63.11, 1.225, -9.5], [63.11, 1.225, -6.5], [60.97, landing - 0.181, -6.5],
], [[0, 3, 2], [0, 2, 1], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]], 0x796958);
addMesh(pier, 'walk_landing_transition', ramp, mat(pier, 'fi_wood'));
writeGlb(path.join(OUT, 'pier-breakwater.glb'), pier);

// Complete the existing flight with two timber stringers, paired posts grounded in the real terrain,
// and transverse joists. The hillside and the usable space beneath the high middle flight remain open.
const lighthouse = readGlb(path.join(INPUT, 'lighthouse.glb')), frames = [], collision = [], posts = [];
const a = new THREE.Vector3(56, 0, -22), b = new THREE.Vector3(68, 0, -50), forward = b.clone().sub(a).normalize();
const side = new THREE.Vector3(-forward.z, 0, forward.x);
const foot = heights(triangles(await scene(path.join(INPUT, 'lighthouse.glb')), (o) => o.name === 'walk_lighthouse_stairs'))(55.8, -21.55);
function beam(start, end, width, depth, color) {
  const d = end.clone().sub(start), n = new THREE.Vector3(-d.z, 0, d.x).normalize().multiplyScalar(width / 2);
  const vertices = [start, end].flatMap((c) => [-1, 1].flatMap((s) => [-1, 1].map((h) => c.clone().addScaledVector(n, s).add(new THREE.Vector3(0, h * depth / 2, 0)).toArray())));
  return geometry(vertices, [[0, 2, 3], [0, 3, 1], [4, 5, 7], [4, 7, 6], [0, 1, 5], [0, 5, 4], [2, 6, 7], [2, 7, 3], [0, 4, 6], [0, 6, 2], [1, 3, 7], [1, 7, 5]], color);
}
function solidBeam(start, end, width, depth, color) {
  const g = beam(start, end, width, depth, color); frames.push(g);
  const n = Math.ceil(start.distanceTo(end) / 0.25);
  for (let i = 0; i < n; i++) {
    const part = beam(start.clone().lerp(end, i / n), start.clone().lerp(end, (i + 1) / n), width, depth, color);
    part.computeBoundingBox(); collision.push([...part.boundingBox.min.toArray(), ...part.boundingBox.max.toArray()]);
  }
}
for (const s of [-1, 1]) {
  const start = a.clone().addScaledVector(side, s * 1.12).setY(foot - 0.17);
  const end = b.clone().addScaledVector(side, s * 1.12).setY(16 - 0.17);
  solidBeam(start, end, 0.18, 0.34, 0x6e5b4a);
}
for (let i = 1; i <= 8; i++) {
  const t = i / 8, center = a.clone().lerp(b, t), h = foot + (16 - foot) * t;
  solidBeam(center.clone().addScaledVector(side, -1.18).setY(h - 0.26), center.clone().addScaledVector(side, 1.18).setY(h - 0.26), 0.2, 0.18, 0x5a4a3d);
  for (const s of [-1, 1]) {
    const c = center.clone().addScaledVector(side, s * 1.12);
    const base = Math.min(...[-0.11, 0, 0.11].flatMap((dx) => [-0.11, 0, 0.11].map((dz) => ground(c.x + dx, c.z + dz)))) - 0.12;
    if (h - 0.18 <= base) continue;
    const bounds = [c.x - 0.09, base, c.z - 0.09, c.x + 0.09, h - 0.18, c.z + 0.09];
    frames.push(box(...bounds, 0x6e5b4a)); collision.push(bounds); posts.push(bounds);
  }
}
const structure = addMesh(lighthouse, 'lighthouse_structure_v3', merge(frames), mat(lighthouse, 'fi_wood'));
lighthouse.json.nodes[structure].extras = { collision_boxes: collision };
writeGlb(path.join(OUT, 'lighthouse.glb'), lighthouse);

const props = readGlb(path.join(INPUT, 'props.glb'));
removeNodes(props, ['sign_post_02', 'label_sign_post_02_0']);
const sign = props.json.nodes.find((n) => n.name === 'sign_island_01');
// Keep the sign beside the walkway, not across the return route from the jetty.
const offset = [60.2 - sign.translation[0], 0, -11.4 - sign.translation[2]];
sign.translation = sign.translation.map((v, i) => v + offset[i]);
const label = props.json.nodes.find((n) => n.name === 'label_sign_island_01_0');
label.translation = (label.translation ?? [0, 0, 0]).map((v, i) => v + offset[i]);
// The board is above the player's head; only its two real posts obstruct the landing.
const signMatrix = new THREE.Matrix4().compose(new THREE.Vector3(...sign.translation), new THREE.Quaternion(...sign.rotation), new THREE.Vector3(1, 1, 1));
const signFeet = [];
sign.extras.collision_boxes = [-1, 1].map((s) => {
  const g = box(s * 1.3 - 0.08, -0.3, -0.18, s * 1.3 + 0.08, 2.7, -0.02, 0x6e5b4a).applyMatrix4(signMatrix);
  g.computeBoundingBox();
  const lo = g.boundingBox.min, hi = g.boundingBox.max;
  const support = Math.min(...[lo.x, hi.x].flatMap(x => [lo.z, hi.z].map(z => Math.max(ground(x, z),
    x >= 54.5 && x <= 61 && z >= -11.2 && z <= -5.8 ? landing : -Infinity))));
  if (support < lo.y) signFeet.push(box(lo.x, support - 0.08, lo.z, hi.x, lo.y + 0.02, hi.z, 0x6e5b4a));
  lo.y = Math.min(lo.y, support - 0.08);
  return [...lo.toArray(), ...hi.toArray()];
});
if (signFeet.length) addMesh(props, 'island_sign_supports_v3', merge(signFeet), mat(props, 'fi_wood'));
writeGlb(path.join(OUT, 'props.glb'), props);

// Regenerate support from the final exported geometry, including the curb and the new wooden connection.
const surface = [], kinds = [];
for (const [i, file] of ['island-terrain', 'pier-breakwater', 'lighthouse'].entries()) {
  const root = await scene(path.join(OUT, file + '.glb'));
  root.traverse((o) => {
    if (!o.isMesh || !(i === 0 ? o.name === 'terrain' || o.name === 'rocks' : /^walk_/.test(o.name) || o.name === 'mole_curb_v3' || (i === 1 && o.parent?.name === 'pier' && o.material.name === 'fi_wood'))) return;
    const t = triangles(o, () => true), kind = i === 0 || /^walk_mole|^mole_curb/.test(o.name) ? 0 : i === 2 ? 2 : o.name === 'walk_landing_transition' ? 3 : 1;
    surface.push(...t); kinds.push(...t.map(() => kind));
  });
}
const points = [], ids = [], seen = new Map();
for (const triangle of surface) for (let i = 0; i < 9; i += 3) {
  const v = triangle.slice(i, i + 3).map(Math.fround), key = v.join(',');
  if (!seen.has(key)) { seen.set(key, points.length / 3); points.push(...v); } ids.push(seen.get(key));
}
const pb = Buffer.from(new Float32Array(points).buffer), ib = Buffer.from(new Uint32Array(ids).buffer);
fs.writeFileSync(path.join(ROOT, 'shared/maps/isleterrain-data.ts'), `// Generated by tools/isle-rework/rework-v3.mjs from final GLB upward-facing triangles. Do not hand edit.\nexport const ISLE_SURFACE_POINTS = '${pb.toString('base64')}';\nexport const ISLE_SURFACE_INDICES = '${ib.toString('base64')}';\nexport const ISLE_SURFACE_KINDS = '${Buffer.from(kinds).toString('base64')}';\n`);
const summary = { source: SOURCE, preservedRocks: rocks.length, removedJettyBoards: removedBoards.length, stairFoot: foot, stairPosts: posts, structureBoxes: collision.length, signPosition: sign.translation, uniquePoints: points.length / 3, triangles: ids.length / 3 };
fs.writeFileSync(path.join(SOURCE, 'rework-summary.json'), JSON.stringify(summary, null, 2));
fs.mkdirSync(path.join(SOURCE, 'v3-glb'), { recursive: true });
for (const file of ['pier-breakwater', 'lighthouse', 'props']) fs.copyFileSync(path.join(OUT, file + '.glb'), path.join(SOURCE, 'v3-glb', file + '.glb'));
console.log(JSON.stringify({ ...summary, stairPosts: posts.length }));
