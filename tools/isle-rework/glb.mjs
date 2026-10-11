// Small GLB utilities for the reproducible v2 repair. They preserve all untouched v1 nodes and extras.
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function readGlb(file) {
  const b = fs.readFileSync(file), n = b.readUInt32LE(12), end = 20 + n;
  return { json: JSON.parse(b.subarray(20, end)), bin: Buffer.from(b.subarray(end + 8, end + 8 + b.readUInt32LE(end))) };
}
export function writeGlb(file, glb) {
  glb.json.buffers[0].byteLength = glb.bin.length;
  const raw = Buffer.from(JSON.stringify(glb.json));
  const json = Buffer.alloc((raw.length + 3) & ~3, 32); raw.copy(json);
  const bin = Buffer.alloc((glb.bin.length + 3) & ~3); glb.bin.copy(bin);
  const h = Buffer.alloc(20); h.writeUInt32LE(0x46546c67); h.writeUInt32LE(2, 4);
  h.writeUInt32LE(28 + json.length + bin.length, 8); h.writeUInt32LE(json.length, 12); h.writeUInt32LE(0x4e4f534a, 16);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length); bh.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(file, Buffer.concat([h, json, bh, bin]));
}
export function accessor(glb, data, size, position = false) {
  const arr = new Float32Array(data), offset = (glb.bin.length + 3) & ~3;
  glb.bin = Buffer.concat([glb.bin, Buffer.alloc(offset - glb.bin.length), Buffer.from(arr.buffer)]);
  const view = glb.json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: arr.byteLength, target: 34962 }) - 1;
  const a = { bufferView: view, componentType: 5126, count: arr.length / size, type: ['SCALAR', 'VEC2', 'VEC3', 'VEC4'][size - 1] };
  if (position) {
    a.min = Array.from({ length: size }, (_, k) => { let v = Infinity; for (let i = k; i < arr.length; i += size) v = Math.min(v, arr[i]); return v; });
    a.max = Array.from({ length: size }, (_, k) => { let v = -Infinity; for (let i = k; i < arr.length; i += size) v = Math.max(v, arr[i]); return v; });
  }
  return glb.json.accessors.push(a) - 1;
}
export function primitive(glb, geometry, material) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const attributes = {};
  for (const [name, id] of [['position', 'POSITION'], ['normal', 'NORMAL'], ['color', 'COLOR_0'], ['uv', 'TEXCOORD_0']]) {
    const a = g.getAttribute(name); if (a) attributes[id] = accessor(glb, a.array, a.itemSize, name === 'position');
  }
  return { attributes, material, mode: 4 };
}
export function addMesh(glb, name, geometry, material) {
  const mesh = glb.json.meshes.push({ name, primitives: [primitive(glb, geometry, material)] }) - 1;
  const node = glb.json.nodes.push({ name, mesh }) - 1;
  const root = glb.json.nodes[glb.json.scenes[glb.json.scene ?? 0].nodes[0]];
  root.children ??= []; root.children.push(node);
  return node;
}
export async function scene(file) {
  const b = fs.readFileSync(file);
  const g = await new Promise((resolve, reject) => new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', resolve, reject));
  g.scene.updateMatrixWorld(true); return g.scene;
}
export function triangles(root, pick) {
  const out = [], v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  root.traverse((o) => {
    if (!o.isMesh || !pick(o)) return;
    const p = o.geometry.getAttribute('position'), idx = o.geometry.index;
    for (let i = 0; i < (idx?.count ?? p.count); i += 3) {
      for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(p, idx ? idx.getX(i + k) : i + k).applyMatrix4(o.matrixWorld);
      // Only upward-facing surfaces. Vertical walls and the underside are never walking support.
      const ny = (v[1].z - v[0].z) * (v[2].x - v[0].x) - (v[1].x - v[0].x) * (v[2].z - v[0].z);
      if (ny <= 1e-6) continue;
      out.push(v.flatMap((q) => [q.x, q.y, q.z]));
    }
  });
  return out;
}
export function heights(tris) {
  const grid = new Map(), C = 2;
  for (const t of tris) {
    const x0 = Math.floor(Math.min(t[0], t[3], t[6]) / C), x1 = Math.floor(Math.max(t[0], t[3], t[6]) / C);
    const z0 = Math.floor(Math.min(t[2], t[5], t[8]) / C), z1 = Math.floor(Math.max(t[2], t[5], t[8]) / C);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const key = `${x},${z}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(t); }
  }
  return (x, z) => {
    let best = -Infinity;
    for (const [ax, ay, az, bx, by, bz, cx, cy, cz] of grid.get(`${Math.floor(x / C)},${Math.floor(z / C)}`) ?? []) {
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      const a = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
      const b = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, c = 1 - a - b;
      if (a >= -1e-5 && b >= -1e-5 && c >= -1e-5) best = Math.max(best, a * ay + b * by + c * cy);
    }
    return best;
  };
}
