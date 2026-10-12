// Exact Last Light support from v2 GLB. All coordinates in the packed data are island-local.
// A two-metre spatial index limits each query to the triangles touching that cell.
import type { MapTerrain, TerrainRayHit } from './types.ts';
import { ISLE_SURFACE_POINTS, ISLE_SURFACE_INDICES, ISLE_SURFACE_KINDS } from './isleterrain-data.ts';
import { ISLE_CENTER, ISLE_Y } from './isle.ts';

function unpack(s: string): ArrayBuffer {
  const bytes = atob(s), out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i);
  return out.buffer;
}
const points = new Float32Array(unpack(ISLE_SURFACE_POINTS));
const indices = new Uint32Array(unpack(ISLE_SURFACE_INDICES));
const kinds = new Uint8Array(unpack(ISLE_SURFACE_KINDS));
const C = 2;
const grid = new Map<number, number[]>();
const cellKey = (x: number, z: number): number => (x + 128) + (z + 128) * 512;
for (let i = 0; i < indices.length; i += 3) {
  const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
  const x0 = Math.floor(Math.min(points[a], points[b], points[c]) / C), x1 = Math.floor(Math.max(points[a], points[b], points[c]) / C);
  const z0 = Math.floor(Math.min(points[a + 2], points[b + 2], points[c + 2]) / C), z1 = Math.floor(Math.max(points[a + 2], points[b + 2], points[c + 2]) / C);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const key = cellKey(x, z); if (!grid.has(key)) grid.set(key, []); grid.get(key)!.push(i);
  }
}

/** Highest actual upward surface at local (u,v). The sea and absent triangles have no support. */
function query(u: number, v: number, mode: 0 | 1 | 2 | 3, ceiling = Infinity, feet = -Infinity, head = Infinity): number {
  if (u < -170 || u > 260 || v < -125 || v > 100) return mode === 2 ? Infinity : mode === 3 ? 1 : -Infinity;
  let best = mode === 2 ? Infinity : -Infinity;
  let walkable = 1;
  for (const i of grid.get(cellKey(Math.floor(u / C), Math.floor(v / C))) ?? []) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ax = points[a], az = points[a + 2], bx = points[b], bz = points[b + 2], cx = points[c], cz = points[c + 2];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    const aa = ((bz - cz) * (u - cx) + (cx - bx) * (v - cz)) / d;
    const bb = ((cz - az) * (u - cx) + (ax - cx) * (v - cz)) / d, cc = 1 - aa - bb;
    if (aa < -1e-6 || bb < -1e-6 || cc < -1e-6) continue;
    const h = aa * points[a + 1] + bb * points[b + 1] + cc * points[c + 1];
    if (h <= 0.12) continue;
    const kind = kinds[i / 3], depth = kind === 2 ? 0.205 : 0.08;
    if (mode === 3 && h > best) {
      best = h;
      const abx = bx - ax, aby = points[b + 1] - points[a + 1], abz = bz - az;
      const acx = cx - ax, acy = points[c + 1] - points[a + 1], acz = cz - az;
      const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
      walkable = kind !== 0 || ny / Math.hypot(nx, ny, nz) >= 0.62 ? 1 : 0;
    }
    if (mode === 0 && h <= ceiling && h > best) best = h;
    if (mode === 1 && h > feet + 1e-7 && (kind === 0 || head > h - depth + 1e-7) && h > best) best = h;
    if (mode === 2 && kind !== 0 && h - depth >= head - 1e-7 && h - depth < best) best = h - depth;
  }
  return mode === 3 ? walkable : best;
}

export function isleSurfaceHeight(u: number, v: number, ceiling = Infinity): number { return query(u, v, 0, ceiling); }

const raySeen = new Uint32Array(kinds.length);
let rayStamp = 0;

/** Short camera segment only: walk its 2m cells and intersect their triangles, with no per-ray allocations. */
function surfaceRaycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, hit: TerrainRayHit): boolean {
  if (!(maxT > 0) || !Number.isFinite(maxT) || (dx === 0 && dy === 0 && dz === 0)) return false;
  const ex = ox + dx * maxT, ez = oz + dz * maxT;
  if (Math.max(ox, ex) < -170 || Math.min(ox, ex) > 260 || Math.max(oz, ez) < -125 || Math.min(oz, ez) > 100) return false;
  rayStamp = (rayStamp + 1) >>> 0;
  if (rayStamp === 0) { raySeen.fill(0); rayStamp = 1; }
  let best = maxT, found = false;
  let x = Math.floor(ox / C), z = Math.floor(oz / C);
  const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const deltaX = dx === 0 ? Infinity : C / Math.abs(dx), deltaZ = dz === 0 ? Infinity : C / Math.abs(dz);
  let nextX = dx === 0 ? Infinity : ((dx > 0 ? x + 1 : x) * C - ox) / dx;
  let nextZ = dz === 0 ? Infinity : ((dz > 0 ? z + 1 : z) * C - oz) / dz;
  let entered = 0;
  while (entered <= best) {
    const candidates = grid.get(cellKey(x, z));
    if (candidates) for (const i of candidates) {
      const id = i / 3;
      if (raySeen[id] === rayStamp) continue;
      raySeen[id] = rayStamp;
      const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
      const abx = points[b] - points[a], aby = points[b + 1] - points[a + 1], abz = points[b + 2] - points[a + 2];
      const acx = points[c] - points[a], acy = points[c + 1] - points[a + 1], acz = points[c + 2] - points[a + 2];
      const px = dy * acz - dz * acy, py = dz * acx - dx * acz, pz = dx * acy - dy * acx;
      const det = abx * px + aby * py + abz * pz;
      if (Math.abs(det) < 1e-10) continue;
      const inv = 1 / det, tx = ox - points[a], ty = oy - points[a + 1], tz = oz - points[a + 2];
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < -1e-7 || u > 1 + 1e-7) continue;
      const qx = ty * abz - tz * aby, qy = tz * abx - tx * abz, qz = tx * aby - ty * abx;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < -1e-7 || u + v > 1 + 1e-7) continue;
      const t = (acx * qx + acy * qy + acz * qz) * inv;
      if (t <= 1e-6 || t >= best || oy + dy * t <= 0.12) continue;
      best = t; found = true; hit.t = t;
      const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
      const len = Math.hypot(nx, ny, nz); hit.nx = nx / len; hit.ny = ny / len; hit.nz = nz / len;
    }
    const next = Math.min(nextX, nextZ);
    if (next > best) break;
    // On a grid corner visit the X-neighbour first, then the diagonal at the same t.
    // Boundary triangles are indexed in both touching cells by their inclusive bounds.
    if (nextX <= nextZ) { entered = nextX; x += sx; nextX += deltaX; }
    else { entered = nextZ; z += sz; nextZ += deltaZ; }
  }
  return found;
}

/** The sentinel is the first island collision box: existing feature toggles disable both boxes and support. */
export function isleTerrain(enabledBy: number): MapTerrain {
  return {
    enabledBy,
    height: (x, z, ceiling = Infinity) => { const h = isleSurfaceHeight(x - ISLE_CENTER.x, z - ISLE_CENTER.z, ceiling - ISLE_Y); return h === -Infinity ? h : ISLE_Y + h; },
    blocks: (x, y, z, height) => query(x - ISLE_CENTER.x, z - ISLE_CENTER.z, 1, Infinity, y - ISLE_Y, y + height - ISLE_Y) !== -Infinity,
    ceiling: (x, z, head) => query(x - ISLE_CENTER.x, z - ISLE_CENTER.z, 2, Infinity, -Infinity, head - ISLE_Y) + ISLE_Y,
    walkable: (x, z) => query(x - ISLE_CENTER.x, z - ISLE_CENTER.z, 3) === 1,
    raycast: (ox, oy, oz, dx, dy, dz, maxT, hit) => surfaceRaycast(ox - ISLE_CENTER.x, oy - ISLE_Y, oz - ISLE_CENTER.z, dx, dy, dz, maxT, hit),
  };
}
