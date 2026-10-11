// Exact Last Light support from v2 GLB. All coordinates in the packed data are island-local.
// A two-metre spatial index limits each query to the triangles touching that cell.
import type { MapTerrain } from './types.ts';
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

/** The sentinel is the first island collision box: existing feature toggles disable both boxes and support. */
export function isleTerrain(enabledBy: number): MapTerrain {
  return {
    enabledBy,
    height: (x, z, ceiling = Infinity) => { const h = isleSurfaceHeight(x - ISLE_CENTER.x, z - ISLE_CENTER.z, ceiling - ISLE_Y); return h === -Infinity ? h : ISLE_Y + h; },
    blocks: (x, y, z, height) => query(x - ISLE_CENTER.x, z - ISLE_CENTER.z, 1, Infinity, y - ISLE_Y, y + height - ISLE_Y) !== -Infinity,
    ceiling: (x, z, head) => query(x - ISLE_CENTER.x, z - ISLE_CENTER.z, 2, Infinity, -Infinity, head - ISLE_Y) + ISLE_Y,
    walkable: (x, z) => query(x - ISLE_CENTER.x, z - ISLE_CENTER.z, 3) === 1,
  };
}
