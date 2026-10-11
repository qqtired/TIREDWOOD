// PACK1: исправление двух сохранённых GLB без пересборки соседних моделей и изменения v1.
// node paint-cloud.mjs <input-paintball.glb> <input-skytower.glb> <output-folder>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const EPS = 1e-7;
export const area2D = (poly) => Math.abs(poly.reduce((s, p, i) => {
  const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1];
}, 0)) / 2;
const signedArea = (poly) => poly.reduce((s, p, i) => {
  const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1];
}, 0);
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const distance = (p, a, b, sign) => sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));

function split(poly, a, b, sign) {
  const inside = [], outside = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const dp = distance(p, a, b, sign), dq = distance(q, a, b, sign);
    (dp >= -EPS ? inside : outside).push(p);
    if ((dp >= -EPS) !== (dq >= -EPS)) {
      const v = mix(p, q, dp / (dp - dq)); inside.push(v); outside.push(v);
    }
  }
  return [inside, outside];
}

/** Выпуклые фрагменты poly вне clip; дополнительные атрибуты вершины интерполируются вместе с координатами. */
export function subtract2D(poly, clip) {
  const sign = signedArea(clip) >= 0 ? 1 : -1;
  let rest = poly; const out = [];
  for (let i = 0; i < clip.length; i++) {
    const [inside, outside] = split(rest, clip[i], clip[(i + 1) % clip.length], sign);
    if (outside.length >= 3 && area2D(outside) > 1e-10) out.push(outside);
    rest = inside;
    if (rest.length < 3 || area2D(rest) < 1e-10) break;
  }
  return out;
}

export function intersectionArea2D(a, b) {
  const sign = signedArea(b) >= 0 ? 1 : -1;
  let poly = a;
  for (let i = 0; i < b.length && poly.length >= 3; i++) [poly] = split(poly, b[i], b[(i + 1) % b.length], sign);
  return poly.length >= 3 ? area2D(poly) : 0;
}

function bounds(poly) {
  return [Math.min(...poly.map((v) => v[0])), Math.min(...poly.map((v) => v[1])), Math.max(...poly.map((v) => v[0])), Math.max(...poly.map((v) => v[1]))];
}
function meets(a, b) { return a[0] < b[2] - EPS && b[0] < a[2] - EPS && a[1] < b[3] - EPS && b[1] < a[3] - EPS; }

export function readGlb(file) {
  const b = readFileSync(file), len = b.readUInt32LE(12);
  return { j: JSON.parse(b.subarray(20, 20 + len).toString()), bin: b.subarray(28 + len) };
}
const COMPONENT = { 5126: [4, 'readFloatLE'], 5125: [4, 'readUInt32LE'], 5123: [2, 'readUInt16LE'], 5121: [1, 'readUInt8'] };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function values(glb, id) {
  const a = glb.j.accessors[id], view = glb.j.bufferViews[a.bufferView], [bytes, method] = COMPONENT[a.componentType];
  const width = WIDTH[a.type], stride = view.byteStride ?? width * bytes, start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const divisor = a.normalized ? (a.componentType === 5123 ? 65535 : 255) : 1;
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: width }, (_, k) => glb.bin[method](start + i * stride + k * bytes) / divisor));
}
export function primitiveTriangles(glb, p) {
  const attrs = Object.fromEntries(Object.entries(p.attributes).map(([key, id]) => [key, values(glb, id)]));
  const ids = p.indices === undefined ? Array.from({ length: attrs.POSITION.length }, (_, i) => i) : values(glb, p.indices).flat();
  const out = [];
  for (let i = 0; i < ids.length; i += 3) out.push(ids.slice(i, i + 3).map((id) => Object.fromEntries(Object.entries(attrs).map(([key, vals]) => [key, vals[id]]))));
  return out;
}

// Измеренные плоскости splat() в входном GLB. Только краска p3_gloss, не весь материал павильона.
const PAINT_PLANES = [
  { key: 'yard', axis: 1, input: [0.015], output: 0.03 },
  { key: 'niche', axis: 1, input: [0.03], output: 0.05 },
  { key: 'facade', axis: 2, input: [-8.03, -8.035], output: -8.04 },
  { key: 'side-r', axis: 0, input: [10.03], output: 10.03 },
  { key: 'side-l', axis: 0, input: [-10.03], output: -10.03 },
  { key: 'barricade-l', axis: 2, input: [-2.955], output: -2.97 },
  { key: 'barricade-r', axis: 2, input: [-3.955], output: -3.97 },
];
export function paintPlane(tri) {
  return PAINT_PLANES.find((plane) => plane.input.some((at) => tri.every((v) => Math.abs(v.POSITION[plane.axis] - at) < 1e-5)));
}

function removePaintOverlap(tris) {
  const groups = new Map(), ordinary = [];
  for (const tri of tris) {
    const plane = paintPlane(tri);
    if (!plane) { ordinary.push(tri); continue; }
    let group = groups.get(plane.key); if (!group) groups.set(plane.key, group = { plane, tris: [] });
    group.tris.push(tri);
  }
  const result = [...ordinary]; let cuts = 0, before = 0, after = 0;
  for (const { plane, tris: paint } of groups.values()) {
    const axes = [0, 1, 2].filter((axis) => axis !== plane.axis), keys = Object.keys(paint[0][0]);
    const widths = keys.map((key) => paint[0][0][key].length);
    // Первые2 числа — координаты плоскости, остальные — исходные POSITION/NORMAL/COLOR/UV для интерполяции.
    const polys = paint.map((tri) => tri.map((v) => [v.POSITION[axes[0]], v.POSITION[axes[1]], ...keys.flatMap((key) => v[key]) ]));
    const boxes = polys.map(bounds); before += paint.length;
    for (let i = 0; i < polys.length; i++) {
      let pieces = [polys[i]];
      // Более поздняя краска закрывает предыдущую: скрытые куски удаляются, остаётся одна поверхность.
      for (let k = i + 1; k < polys.length && pieces.length; k++) {
        if (!meets(boxes[i], boxes[k]) || intersectionArea2D(polys[i], polys[k]) < 1e-9) continue;
        pieces = pieces.flatMap((poly) => subtract2D(poly, polys[k])); cuts++;
      }
      for (const poly of pieces) for (let k = 1; k < poly.length - 1; k++) {
        const flat = [poly[0], poly[k], poly[k + 1]];
        if (area2D(flat) < 1e-9) continue;
        result.push(flat.map((row) => {
          const v = {}; let at = 2;
          keys.forEach((key, index) => { v[key] = row.slice(at, at + widths[index]); at += widths[index]; });
          v.POSITION[plane.axis] = plane.output;
          return v;
        })); after++;
      }
    }
  }
  return { tris: result, stats: { before, after, cuts, planes: [...groups.keys()] } };
}

export function isCloudBeam(tri) {
  return tri.every((v) => { const [x, y, z] = v.POSITION; return x >= -1.62001 && x <= 1.62001 && y >= 4.27999 && y <= 4.48001 && z >= -9.93001 && z <= -9.66999; });
}

function replacePrimitive(glb, p, tris, chunks) {
  const j = glb.j;
  function append(vals, width, type, target) {
    const data = type === 5125 ? Buffer.from(new Uint32Array(vals).buffer) : Buffer.from(new Float32Array(vals).buffer);
    const view = j.bufferViews.push({ buffer: 0, byteOffset: chunks.reduce((n, b) => n + b.length, 0), byteLength: data.length, target }) - 1;
    chunks.push(data);
    const a = { bufferView: view, componentType: type, count: vals.length / width, type: Object.keys(WIDTH).find((k) => WIDTH[k] === width) };
    if (width === 3 && target === 34962) {
      a.min = [0, 1, 2].map((k) => vals.filter((_, i) => i % 3 === k).reduce((n, v) => Math.min(n, v), Infinity));
      a.max = [0, 1, 2].map((k) => vals.filter((_, i) => i % 3 === k).reduce((n, v) => Math.max(n, v), -Infinity));
    }
    return j.accessors.push(a) - 1;
  }
  const verts = tris.flat(), attrs = {};
  for (const key of Object.keys(p.attributes)) attrs[key] = append(verts.flatMap((v) => v[key]), verts[0][key].length, 5126, 34962);
  p.attributes = attrs;
  p.indices = append(Array.from({ length: verts.length }, (_, i) => i), 1, 5125, 34963);
}

function saveGlb(file, j, chunks) {
  const bin = Buffer.concat(chunks); j.buffers[0].byteLength = bin.length;
  const json = Buffer.from(JSON.stringify(j)), jl = (json.length + 3) & ~3, bl = (bin.length + 3) & ~3;
  const b = Buffer.alloc(28 + jl + bl); b.writeUInt32LE(0x46546c67); b.writeUInt32LE(2, 4); b.writeUInt32LE(b.length, 8);
  b.writeUInt32LE(jl, 12); b.writeUInt32LE(0x4e4f534a, 16); b.fill(32, 20, 20 + jl); json.copy(b, 20);
  b.writeUInt32LE(bl, 20 + jl); b.writeUInt32LE(0x004e4942, 24 + jl); bin.copy(b, 28 + jl); writeFileSync(file, b);
}

export function fixPaintCloud(paintInput, skyInput, output) {
  mkdirSync(output, { recursive: true }); const stats = {};
  for (const [file, source] of [['pav_paintball.glb', paintInput], ['pav_skytower.glb', skyInput]]) {
    const glb = readGlb(source), chunks = [glb.bin];
    const node = glb.j.nodes.find((n) => n.name === (file.includes('paintball') ? 'static_paintball' : 'static_skytower'));
    const family = file.includes('paintball') ? 'p3_gloss' : 'p3_matte';
    const p = glb.j.meshes[node.mesh].primitives.find((p) => glb.j.materials[p.material].name === family);
    const tris = primitiveTriangles(glb, p);
    if (file.includes('paintball')) {
      const fixed = removePaintOverlap(tris);
      if (fixed.stats.before < 1000) throw new Error('Неподходящий исходник пейнтбола: нет ожидаемых плоскостей краски');
      stats.paintball = fixed.stats; replacePrimitive(glb, p, fixed.tris, chunks);
    } else {
      const kept = tris.filter((tri) => !isCloudBeam(tri)), removed = tris.length - kept.length;
      if (removed !== 12) throw new Error(`Неподходящий исходник каланчи: ожидаются12 треугольников поперечины, найдено${removed}`);
      stats.skytower = { before: tris.length, after: kept.length, removed };
      // Все прежние атрибуты/якоря остаются; единственное изменение — индексный список без12 треугольников балки.
      const ids = values(glb, p.indices).flat().filter((_, i) => !isCloudBeam(tris[Math.floor(i / 3)]));
      const data = Buffer.from(new Uint32Array(ids).buffer), offset = glb.bin.length;
      const view = glb.j.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length, target: 34963 }) - 1;
      p.indices = glb.j.accessors.push({ bufferView: view, componentType: 5125, count: ids.length, type: 'SCALAR' }) - 1; chunks.push(data);
    }
    saveGlb(join(output, file), glb.j, chunks);
  }
  return stats;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 5) throw new Error('Нужны пути двух исходных GLB и папка результата');
  console.log(JSON.stringify(fixPaintCloud(process.argv[2], process.argv[3], process.argv[4]), null, 2));
}
