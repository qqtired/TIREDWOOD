// PLAZA3 v2: cut the entrance's light boulders out of its existing tunnel, preserving v1.
// The ring dimensions match tools/survivors/blender/plaza_entrance.py (ST / tunnel_ring).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../../../', import.meta.url);
const read = (url) => {
  const b = readFileSync(url);
  const len = b.readUInt32LE(12);
  return { j: JSON.parse(b.subarray(20, 20 + len).toString()), bin: b.subarray(28 + len) };
};
const save = (url, j, bin) => {
  const json = Buffer.from(JSON.stringify(j));
  const jl = (json.length + 3) & ~3, bl = (bin.length + 3) & ~3;
  const b = Buffer.alloc(28 + jl + bl);
  b.writeUInt32LE(0x46546c67, 0); b.writeUInt32LE(2, 4); b.writeUInt32LE(b.length, 8);
  b.writeUInt32LE(jl, 12); b.writeUInt32LE(0x4e4f534a, 16);
  b.fill(32, 20, 20 + jl); json.copy(b, 20);
  b.writeUInt32LE(bl, 20 + jl); b.writeUInt32LE(0x004e4942, 24 + jl); bin.copy(b, 28 + jl);
  writeFileSync(url, b);
};
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v) => v.map((n) => n / Math.hypot(...v));
const mid = (a, b) => a.map((v, i) => (v + b[i]) / 2);
const margin = 0.03; // tuck light rock behind the existing dark lining (3 cm, no coplanar seams)
const ring = ([z, w, zs]) => {
  w += margin; zs += margin;
  const r = [[-w, -margin, z], [-w, zs, z]];
  for (let i = 1; i < 9; i++) {
    const a = Math.PI - Math.PI * i / 9;
    r.push([w * Math.cos(a), zs + w * 0.92 * Math.sin(a), z]);
  }
  return [...r, [w, zs, z], [w, -margin, z]];
};
const rings = [[2.23, 1.3, 1.65], [1.3, 1.27, 1.55], [0.4, 1.2, 1.32], [-0.4, 1.12, 1.02], [-1.13, 1.05, 0.72]].map(ring);
const plane = (a, b, c, center) => {
  let n = unit(cross(sub(b, a), sub(c, a)));
  if (dot(n, sub(center, a)) > 0) n = n.map((x) => -x);
  return { n, d: -dot(n, a) };
};
const volumes = rings.slice(1).map((back, k) => {
  const front = rings[k], center = mid(front[0], back[back.length - 2]);
  const planes = [plane(front[0], front[1], front[2], center), plane(back[2], back[1], back[0], center)];
  for (let i = 0; i < front.length; i++) planes.push(plane(front[i], front[(i + 1) % front.length], back[i], center));
  return planes;
});
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const split = (poly, p) => {
  const inside = [], outside = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = dot(p.n, a.slice(0, 3)) + p.d, db = dot(p.n, b.slice(0, 3)) + p.d;
    (da <= 1e-8 ? inside : outside).push(a);
    if ((da <= 1e-8) !== (db <= 1e-8)) {
      const v = mix(a, b, da / (da - db)); inside.push(v); outside.push(v);
    }
  }
  return [inside, outside];
};
const outsideVolume = (poly, planes) => {
  if (planes.some((p) => poly.every((v) => dot(p.n, v.slice(0, 3)) + p.d > 1e-8))) return [poly];
  let rest = poly; const out = [];
  for (const p of planes) {
    const [inside, outside] = split(rest, p);
    if (outside.length >= 3) out.push(outside);
    rest = inside;
    if (rest.length < 3) break;
  }
  return out;
};

const { j, bin } = read(new URL('client/assets/dungeon/plaza/plaza_entrance.glb', root));
let chunks = [bin], offset = bin.length;
const values = (id) => {
  const a = j.accessors[id], v = j.bufferViews[a.bufferView];
  const width = a.type === 'VEC3' ? 3 : 1;
  const C = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array }[a.componentType];
  const start = v.byteOffset + (a.byteOffset ?? 0);
  const bytes = bin.subarray(start, start + a.count * width * C.BYTES_PER_ELEMENT);
  return new C(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};
const append = (vals, normal = false) => {
  const data = Buffer.from(new Float32Array(vals).buffer);
  const view = j.bufferViews.length;
  j.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length, target: 34962 });
  chunks.push(data); offset += data.length;
  const accessor = { bufferView: view, componentType: 5126, count: vals.length / 3, type: 'VEC3' };
  if (!normal) {
    accessor.min = [0, 1, 2].map((k) => Math.min(...vals.filter((_, i) => i % 3 === k)));
    accessor.max = [0, 1, 2].map((k) => Math.max(...vals.filter((_, i) => i % 3 === k)));
  }
  return j.accessors.push(accessor) - 1;
};
const cave = j.meshes[j.nodes.find((n) => n.name === 'plaza_cave_entrance').mesh];
for (const p of cave.primitives) {
  const name = j.materials[p.material].name;
  if (!['plaza_stone', 'plaza_stone_warm'].includes(name)) continue;
  const pos = values(p.attributes.POSITION), nor = values(p.attributes.NORMAL), idx = values(p.indices);
  const positions = [], normals = [];
  for (let i = 0; i < idx.length; i += 3) {
    const tri = [0, 1, 2].map((k) => [...pos.slice(idx[i + k] * 3, idx[i + k] * 3 + 3), ...nor.slice(idx[i + k] * 3, idx[i + k] * 3 + 3)]);
    let pieces = [tri];
    // A triangle may cross the tunnel even when each vertex is outside it.
    const min = [0, 1, 2].map((axis) => Math.min(...tri.map((v) => v[axis])));
    const max = [0, 1, 2].map((axis) => Math.max(...tri.map((v) => v[axis])));
    if (min[2] <= 2.23 && max[2] >= -1.13 && min[0] < 1.5 && max[0] > -1.5 && min[1] < 3.0 && max[1] > -margin) {
      for (const volume of volumes) pieces = pieces.flatMap((poly) => outsideVolume(poly, volume));
    }
    for (const poly of pieces) for (let k = 1; k < poly.length - 1; k++) {
      const t = [poly[0], poly[k], poly[k + 1]];
      if (Math.hypot(...cross(sub(t[1].slice(0, 3), t[0].slice(0, 3)), sub(t[2].slice(0, 3), t[0].slice(0, 3)))) < 1e-9) continue;
      for (const v of t) { positions.push(...v.slice(0, 3)); normals.push(...unit(v.slice(3))); }
    }
  }
  p.attributes = { POSITION: append(positions), NORMAL: append(normals, true) };
  delete p.indices;
  console.log(name, idx.length / 3, '→', positions.length / 9, 'triangles');
}
j.buffers[0].byteLength = offset;
const entranceOut = new URL('client/assets/plaza3/plaza_entrance_v2.glb', root);
save(entranceOut, j, Buffer.concat(chunks));

// The records board belongs beside the entrance. Only anchors/collider helpers move; visible cliff stays v1.
const cliff = read(new URL('client/assets/plaza3/pav_dungeon_cliff.glb', root));
const yaw = 0.803, u = -4.0, v = 5.4;
const x = -20.25 + u * Math.cos(yaw) + v * Math.sin(yaw);
const z = -34.8 - u * Math.sin(yaw) + v * Math.cos(yaw);
const anchor = cliff.j.nodes.find((n) => n.name === 'anchor_records_board');
const before = [...anchor.translation];
anchor.translation[0] = -18 - x; anchor.translation[2] = -41 - z;
const dx = anchor.translation[0] - before[0], dz = anchor.translation[2] - before[2];
for (const n of cliff.j.nodes.filter((n) => /^col_board_[012]$/.test(n.name))) {
  n.translation[0] += dx; n.translation[2] += dz;
}
save(new URL('client/assets/plaza3/pav_dungeon_cliff_v2.glb', root), cliff.j, cliff.bin);
console.log('records board world:', { x, z, yaw }, 'source:', fileURLToPath(import.meta.url));
