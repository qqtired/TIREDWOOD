// White-cliff shore collision for ordinary boats. Segments and outward normals
// are cut from the SAME GLB triangles at y=0.2; no separate hand-drawn coastline.
import { RG_BANKS } from './regattabankdata.ts';

const CELL = 16;
const cells = new Map<string, number[]>();
for (let i = 0; i < RG_BANKS.length; i++) {
  const [ax, az, bx, bz] = RG_BANKS[i];
  for (let x = Math.floor(Math.min(ax, bx) / CELL); x <= Math.floor(Math.max(ax, bx) / CELL); x++) {
    for (let z = Math.floor(Math.min(az, bz) / CELL); z <= Math.floor(Math.max(az, bz) / CELL); z++) {
      const key = `${x},${z}`, list = cells.get(key);
      if (list) list.push(i); else cells.set(key, [i]);
    }
  }
}

export interface RgBankContact { nx: number; nz: number; depth: number }

/** Water-side circle against the nearby visible shoreline. */
export function regattaBankContact(x: number, z: number, radius: number): RgBankContact | null {
  let distance = radius * radius, best = -1, qx = 0, qz = 0;
  for (let gx = Math.floor((x - radius) / CELL); gx <= Math.floor((x + radius) / CELL); gx++) {
    for (let gz = Math.floor((z - radius) / CELL); gz <= Math.floor((z + radius) / CELL); gz++) {
      for (const i of cells.get(`${gx},${gz}`) ?? []) {
        const [ax, az, bx, bz] = RG_BANKS[i], dx = bx - ax, dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
        const px = ax + dx * t, pz = az + dz * t, d = (x - px) * (x - px) + (z - pz) * (z - pz);
        if (d < distance) { distance = d; best = i; qx = px; qz = pz; }
      }
    }
  }
  if (best < 0) return null;
  const [, , , , nx, nz] = RG_BANKS[best];
  const depth = radius - ((x - qx) * nx + (z - qz) * nz);
  return depth > .001 ? { nx, nz, depth } : null;
}

/** Swept centre: if an anomalous step or a turn crosses a wall, keep the last safe pose. */
function crossedBank(ax: number, az: number, bx: number, bz: number): boolean {
  const dx = bx - ax, dz = bz - az;
  if (dx * dx + dz * dz < 1e-12) return false;
  for (let gx = Math.floor(Math.min(ax, bx) / CELL); gx <= Math.floor(Math.max(ax, bx) / CELL); gx++) {
    for (let gz = Math.floor(Math.min(az, bz) / CELL); gz <= Math.floor(Math.max(az, bz) / CELL); gz++) {
      for (const i of cells.get(`${gx},${gz}`) ?? []) {
        const [px, pz, qx, qz, nx, nz] = RG_BANKS[i];
        if (dx * nx + dz * nz >= 0) continue;
        const ex = qx - px, ez = qz - pz, cross = dx * ez - dz * ex;
        if (Math.abs(cross) < 1e-10) continue;
        const u = ((px - ax) * dz - (pz - az) * dx) / cross;
        const t = ((px - ax) * ez - (pz - az) * ex) / cross;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
      }
    }
  }
  return false;
}

interface BoatPose { x: number; z: number; yaw: number }
/** The existing two-circle own-boat hull; returns true on a contact or safe rollback. */
export function resolveRegattaBanks(s: BoatPose & { v: number }, before: BoatPose, kind: { length: number; beam: number }): boolean {
  const r = kind.beam / 2, half = kind.length / 2 - r;
  const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), ox = -Math.sin(before.yaw), oz = -Math.cos(before.yaw);
  const restore = () => { s.x = before.x; s.z = before.z; s.yaw = before.yaw; s.v = 0; };
  for (const side of [-1, 1]) {
    if (crossedBank(before.x + ox * half * side, before.z + oz * half * side, s.x + fx * half * side, s.z + fz * half * side)) {
      restore(); return true;
    }
  }
  let touched = false;
  for (let pass = 0; pass < 3; pass++) {
    let pushed = false;
    for (const side of [-1, 1]) {
      const hit = regattaBankContact(s.x + fx * half * side, s.z + fz * half * side, r);
      if (!hit) continue;
      s.x += hit.nx * hit.depth; s.z += hit.nz * hit.depth;
      if ((fx * hit.nx + fz * hit.nz) * s.v < 0) s.v *= .35;
      touched = pushed = true;
    }
    if (!pushed) return touched;
  }
  // A tight concavity can constrain both hull ends. Do not oscillate or push
  // through the bank; reverse input can then move away from the preserved pose.
  if ([-1, 1].some(side => regattaBankContact(s.x + fx * half * side, s.z + fz * half * side, r))) restore();
  return touched;
}
