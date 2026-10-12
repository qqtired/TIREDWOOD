// The little sandbar at the foot of the lighthouse jetty: sand mesh (from the same height function that drives the
// crabs' feet and the solid underfoot), wet sand and foam at the waterline, pebbles, shells, starfish, weed on the
// pile, old stakes, a half-buried lifebuoy; plus two tiny instanced pools: bubbles and sand puffs. All static
// geometry is one vertex-coloured mesh (one draw call).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_Y } from '../../shared/constants.ts';
import { CRITTERS, CRITTER_COVE, coveHeight } from '../../shared/maps/critters.ts';
import { clamp01, ease, ellipsoid, hash01, mix, place, tube, type ColorFn, type Paint, type V3 } from './critter-kit.ts';

const X0 = -19.2, X1 = -12.1, Z0 = 21.95, Z1 = 27.4, STEP = 0.09;
const PILE = { x: -17.3, z: 24 };
const FAR = 70;

const col = new THREE.Color();
function colored(g: THREE.BufferGeometry, paint: Paint): THREE.BufferGeometry {
  g.deleteAttribute('uv'); g.deleteAttribute('along');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.index) g.setIndex(Array.from({ length: g.getAttribute('position').count }, (_, i) => i));   // merging needs every part indexed
  const p = g.getAttribute('position'), c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    col.setHex(typeof paint === 'number' ? paint : (paint as ColorFn)(p.getX(i), p.getY(i), p.getZ(i)));
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

const SAND_DRY = new THREE.Color(0xeed6a2), SAND_WET = new THREE.Color(0xb59868), SAND_UNDER = new THREE.Color(0xa3b087), FOAM = new THREE.Color(0xffffff);
const smooth = (e0: number, e1: number, x: number): number => ease((x - e0) / (e1 - e0));

/** The sand surface: a regular grid sampled from coveHeight, with analytic colours (wet band, shade under the planks). */
function sandMesh(foam: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nx = Math.round((X1 - X0) / STEP), nz = Math.round((Z1 - Z0) / STEP), cols = nx + 1;
  const h = new Float32Array(cols * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) h[j * cols + i] = Math.max(coveHeight(X0 + i * STEP, Z0 + j * STEP), WATER_Y - 0.7);
  const pos: number[] = [], nor: number[] = [], color: number[] = [], index: number[] = [], id = new Int32Array(cols * (nz + 1)).fill(-1);
  const c = new THREE.Color();
  const vertex = (i: number, j: number): number => {
    const k = j * cols + i;
    if (id[k] >= 0) return id[k];
    const x = X0 + i * STEP, z = Z0 + j * STEP, y = h[k];
    const hx = (h[j * cols + Math.min(nx, i + 1)] - h[j * cols + Math.max(0, i - 1)]) / ((Math.min(nx, i + 1) - Math.max(0, i - 1)) * STEP);
    const hz = (h[Math.min(nz, j + 1) * cols + i] - h[Math.max(0, j - 1) * cols + i]) / ((Math.min(nz, j + 1) - Math.max(0, j - 1)) * STEP);
    const l = Math.hypot(hx, 1, hz);
    pos.push(x, y, z); nor.push(-hx / l, 1 / l, -hz / l);
    const dh = y - WATER_Y;
    c.copy(SAND_DRY).lerp(SAND_WET, smooth(0.2, 0.01, dh) * 0.95).lerp(SAND_UNDER, smooth(0.0, -0.18, dh));
    const speckle = (hash01(Math.round(x * 53) * 977 + Math.round(z * 53)) - 0.5) * 0.08 + Math.sin(x * 9.1 + z * 6.3) * 0.015;
    c.multiplyScalar(1 + speckle);
    c.lerp(FOAM, smooth(0.09, 0.02, Math.abs(dh - 0.02)) * 0.25);
    c.multiplyScalar(0.62 + 0.38 * smooth(-17.7, -16.7, x));                       // dim under the planks
    c.multiplyScalar(0.8 + 0.2 * smooth(22, 22.45, z));                              // contact shade at the quay wall
    c.multiplyScalar(0.78 + 0.22 * smooth(0.18, 0.62, Math.hypot(x - PILE.x, z - PILE.z)));   // ... and round the pile
    color.push(c.r, c.g, c.b);
    return (id[k] = pos.length / 3 - 1);
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * cols + i;
    if (Math.max(h[k], h[k + 1], h[k + cols], h[k + cols + 1]) < WATER_Y - 0.3) continue;
    const a = vertex(i, j), b = vertex(i + 1, j), d = vertex(i, j + 1), e = vertex(i + 1, j + 1);
    index.push(a, d, b, b, d, e);
  }
  foam.push(foamRibbon(h, nx, nz, cols));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  g.setIndex(index);
  return g;
}

/**
 * Foam along the waterline: marching squares at the water level, every segment becomes a short soft-edged strip
 * (alpha vertex colours: clear on the sand side, white at the line, fading out over the water).
 */
function foamRibbon(h: Float32Array, nx: number, nz: number, cols: number): THREE.BufferGeometry {
  const L = WATER_Y + 0.006, y = WATER_Y + 0.007, pos: number[] = [], rgba: number[] = [], index: number[] = [];
  const at = (i: number, j: number): number => h[j * cols + i] - L;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    const pts: Array<[number, number]> = [], x0 = X0 + i * STEP, z0 = Z0 + j * STEP;
    const edge = (v0: number, v1: number, ax: number, az: number, bx: number, bz: number): void => { if ((v0 > 0) !== (v1 > 0)) { const t = v0 / (v0 - v1); pts.push([ax + (bx - ax) * t, az + (bz - az) * t]); } };
    edge(a, b, x0, z0, x0 + STEP, z0); edge(b, c, x0 + STEP, z0, x0 + STEP, z0 + STEP); edge(d, c, x0, z0 + STEP, x0 + STEP, z0 + STEP); edge(a, d, x0, z0, x0, z0 + STEP);
    if (pts.length < 2) continue;
    // downhill (toward the sea) from the cell's corner heights
    const gx = ((b - a) + (c - d)) / 2, gz = ((d - a) + (c - b)) / 2, gl = Math.hypot(gx, gz) || 1;
    const dx = -gx / gl, dz = -gz / gl;
    for (let s = 0; s + 1 < pts.length; s += 2) {
      const [px, pz] = pts[s], [qx, qz] = pts[s + 1], tl = Math.hypot(qx - px, qz - pz) || 1, tx = (qx - px) / tl, tz = (qz - pz) / tl;
      const base = pos.length / 3, ext = 0.055;
      const row = (off: number, alpha: number): void => {
        for (const [bx, bz, e] of [[px, pz, -ext], [qx, qz, ext]] as const) { pos.push(bx + dx * off + tx * e, y, bz + dz * off + tz * e); rgba.push(1, 1, 1, alpha); }
      };
      row(-0.02, 0); row(0.012, 0.9); row(0.085, 0);
      index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4, base + 3, base + 5, base + 4);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(rgba, 4));
  g.setIndex(index);
  return g;
}

// ------------------------------------------------------------------ props

interface Spot { x: number; z: number }
const stops: Spot[] = CRITTERS.filter((d) => d.kind === 'crab').flatMap((d) => d.stops.map((s) => ({ x: s.x, z: s.z })));
function clearOfCrabs(x: number, z: number, r: number): boolean { return stops.every((s) => Math.hypot(s.x - x, s.z - z) > r); }
function clearOfRoutes(x: number, z: number, r: number): boolean {
  for (const d of CRITTERS) {
    if (d.kind !== 'crab') continue;
    for (let i = 0; i < d.stops.length; i++) {
      const a = d.stops[i], b = d.stops[(i + 1) % d.stops.length], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
      if (Math.hypot(a.x + dx * t - x, a.z + dz * t - z) < r) return false;
    }
  }
  return true;
}
const onSand = (x: number, z: number, margin = 0): boolean => coveHeight(x, z) > CRITTER_COVE.dry + margin;

function pebble(g: THREE.BufferGeometry[], x: number, z: number, r: number, seed: number): void {
  const palette = [0x8e9498, 0xb7aa92, 0x9aa7ad, 0xd8d0c0, 0x7b7a74, 0xc4b79c];
  const y = coveHeight(x, z), s = hash01(seed * 3 + 1), t = hash01(seed * 5 + 2);
  const e = ellipsoid(r, r * (0.45 + 0.2 * t), r * (0.75 + 0.3 * s), [0, 0, 0], [8, 5]);
  g.push(colored(place(e, [x, y + r * 0.12, z], [0, hash01(seed) * 6.28, 0]), palette[Math.floor(hash01(seed * 7) * palette.length)]));
}
function shell(g: THREE.BufferGeometry[], x: number, z: number, seed: number): void {
  const y = coveHeight(x, z), kind = seed % 3, base = kind === 0 ? 0xf6e7d7 : kind === 1 ? 0xf3b9ae : 0xffffff, rim = kind === 1 ? 0xe58c82 : 0xd9c3a8;
  const a = hash01(seed * 11) * 6.28, tilt = (hash01(seed * 13) - 0.5) * 0.5;
  // a scalloped fan: a flattened half-ellipsoid with ribs, lying slightly tilted in the sand
  const fan = ellipsoid(0.034, 0.012, 0.03, [0, 0, 0], [10, 5]);
  g.push(colored(place(fan, [x, y + 0.004, z], [tilt, a, tilt * 0.6]), (px, py, pz) => (Math.sin(Math.atan2(pz - z, px - x) * 7 + a * 3) > 0.35 ? rim : base)));
}
function starfish(g: THREE.BufferGeometry[], x: number, z: number, hex: number, seed: number): void {
  const y = coveHeight(x, z) + 0.012, a0 = hash01(seed) * 6.28;
  for (let k = 0; k < 5; k++) {
    const a = a0 + (k / 5) * Math.PI * 2;
    g.push(colored(tube([[x, y, z], [x + Math.cos(a) * 0.045, y - 0.001, z + Math.sin(a) * 0.045], [x + Math.cos(a) * 0.1, y - 0.004, z + Math.sin(a) * 0.1]], [0.015, 0.011, 0.004], { radial: 5, samples: 3 }), hex));
  }
  g.push(colored(ellipsoid(0.022, 0.012, 0.022, [x, y, z], [8, 5]), hex));
}
function weed(g: THREE.BufferGeometry[], x: number, z: number, seed: number, n = 6, len = 0.26): void {
  const y = coveHeight(x, z), palette = [0x3f6b3a, 0x587a33, 0x7a6a2f, 0x2f5a40];
  for (let k = 0; k < n; k++) {
    const a = hash01(seed * 17 + k) * 6.28, l = len * (0.6 + 0.6 * hash01(seed * 19 + k)), curl = (hash01(seed * 23 + k) - 0.5) * 0.9;
    const pts: V3[] = [[0, 0, 0], [Math.cos(a) * l * 0.4, 0.05 + 0.04 * hash01(k), Math.sin(a) * l * 0.4], [Math.cos(a + curl) * l * 0.8, 0.045, Math.sin(a + curl) * l * 0.8], [Math.cos(a + curl * 1.8) * l, 0.018, Math.sin(a + curl * 1.8) * l]];
    g.push(colored(tube(pts.map((q) => [x + q[0], y + q[1], z + q[2]] as V3), [0.012, 0.01, 0.007, 0.003], { radial: 4, samples: 6 }), palette[Math.floor(hash01(seed * 29 + k) * palette.length)]));
  }
}
function stake(g: THREE.BufferGeometry[], x: number, z: number, h: number, lean: V3, seed: number): void {
  const y = coveHeight(x, z) - 0.06;
  const wood = (px: number, py: number): number => (hash01(Math.round(py * 40) * 31 + seed) > 0.65 ? 0x6b5a48 : px > 0 ? 0x8a7a66 : 0x7c6c58);
  g.push(colored(tube([[x, y, z], [x + lean[0] * h, y + h, z + lean[2] * h]], [0.05, 0.043], { radial: 7, samples: 4 }), wood));
  g.push(colored(ellipsoid(0.05, 0.016, 0.05, [x + lean[0] * h, y + h, z + lean[2] * h], [8, 4]), 0x9b8a72));
}
function lifebuoy(g: THREE.BufferGeometry[], x: number, z: number): void {
  const R = 0.27, r = 0.07, ring = new THREE.TorusGeometry(R, r, 8, 24);
  const placed = place(ring, [x, coveHeight(x, z) + 0.03, z], [0.42, 0.7, 0]);
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.42, 0.7, 0, 'YXZ')), inv = m.clone().invert(), v = new THREE.Vector3();
  g.push(colored(placed, (px, py, pz) => { v.set(px - x, py - coveHeight(x, z) - 0.03, pz - z).applyMatrix4(inv); return Math.floor(((Math.atan2(v.y, v.x) + Math.PI) / (Math.PI * 2)) * 8) % 2 ? 0xf5f1e6 : 0xd9402f; }));
}
function rock(g: THREE.BufferGeometry[], x: number, z: number, s: number, seed: number): void {
  const y = coveHeight(x, z);
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const n = 1 + 0.18 * Math.sin(p.getX(i) * 5.1 + seed) * Math.cos(p.getZ(i) * 4.3 + seed * 2);
    p.setXYZ(i, p.getX(i) * n * s, p.getY(i) * n * s * 0.5, p.getZ(i) * n * s * 0.8);
  }
  geo.computeVertexNormals(); geo.deleteAttribute('uv');
  g.push(colored(place(geo, [x, y + s * 0.12, z], [0, seed, 0]), (_px, py) => (py > y + s * 0.3 ? 0x9aa09a : 0x7a7871)));
}
function driftwood(g: THREE.BufferGeometry[], x: number, z: number, a: number): void {
  const y = coveHeight(x, z) + 0.03, dx = Math.cos(a), dz = Math.sin(a);
  g.push(colored(tube([[x - dx * 0.3, y, z - dz * 0.3], [x - dx * 0.05 - dz * 0.03, y + 0.045, z - dz * 0.05 + dx * 0.03], [x + dx * 0.32, y + 0.012, z + dz * 0.32]], [0.026, 0.03, 0.017], { radial: 6, samples: 6 }), 0xb9a98e));
}

function props(): THREE.BufferGeometry[] {
  const g: THREE.BufferGeometry[] = [];
  // pebbles and shells scattered over the dry sand and the beach edge
  for (let i = 0, placed = 0; i < 420 && placed < 46; i++) {
    const x = mix(-17.9, -12.5, hash01(i * 2)), z = mix(22.1, 26, hash01(i * 2 + 1));
    if (!onSand(x, z, -0.04) || !clearOfCrabs(x, z, 0.28)) continue;
    pebble(g, x, z, 0.014 + hash01(i * 3 + 7) * hash01(i * 5 + 1) * 0.05, i); placed++;
  }
  for (let i = 0, placed = 0; i < 200 && placed < 9; i++) {
    const x = mix(-17.2, -12.7, hash01(i * 4 + 900)), z = mix(22.2, 25.4, hash01(i * 4 + 901));
    if (!onSand(x, z, 0.02) || !clearOfCrabs(x, z, 0.35)) continue;
    shell(g, x, z, i); placed++;
  }
  // bigger things: first free spot of a few candidates each
  const spot = (cands: readonly Spot[], r: number, margin = 0.05): Spot | null => cands.find((c) => onSand(c.x, c.z, margin) && clearOfCrabs(c.x, c.z, r) && clearOfRoutes(c.x, c.z, r * 0.8) && Math.hypot(c.x - PILE.x, c.z - PILE.z) > 0.5) ?? null;
  const rk = spot([{ x: -16.3, z: 22.5 }, { x: -13.4, z: 22.55 }, { x: -15.6, z: 22.4 }], 0.5), lb = spot([{ x: -13.7, z: 23.0 }, { x: -13.3, z: 23.6 }, { x: -14.2, z: 22.6 }], 0.55);
  const s1 = spot([{ x: -12.95, z: 23.1 }, { x: -13.2, z: 24.0 }, { x: -13.8, z: 24.2 }], 0.45), s2 = spot([{ x: -13.45, z: 24.3 }, { x: -13.6, z: 24.6 }, { x: -14.2, z: 24.0 }], 0.45);
  const sf1 = spot([{ x: -14.6, z: 23.9 }, { x: -15.2, z: 24.3 }, { x: -14.0, z: 23.7 }], 0.4), sf2 = spot([{ x: -16.1, z: 24.55 }, { x: -16.6, z: 24.7 }, { x: -15.6, z: 24.4 }], 0.4);
  const dw = spot([{ x: -14.9, z: 24.5 }, { x: -15.5, z: 24.7 }, { x: -13.8, z: 22.9 }], 0.5);
  if (rk) rock(g, rk.x, rk.z, 0.17, 1.3);
  if (lb) lifebuoy(g, lb.x, lb.z);
  if (s1) stake(g, s1.x, s1.z, 0.62, [0.05, 1, -0.04], 3);
  if (s2) stake(g, s2.x, s2.z, 0.4, [-0.09, 1, 0.05], 8);
  if (sf1) starfish(g, sf1.x, sf1.z, 0xf0883c, 4);
  if (sf2) starfish(g, sf2.x, sf2.z, 0xe9788f, 9);
  if (dw) driftwood(g, dw.x, dw.z, 0.5);
  // washed-up weed at the pile foot and along the wall
  weed(g, PILE.x + 0.34, PILE.z - 0.1, 1, 6); weed(g, PILE.x + 0.2, PILE.z + 0.3, 2, 5, 0.22); weed(g, PILE.x - 0.25, PILE.z + 0.22, 3, 5, 0.22);
  for (const [x, z, n] of [[-14.4, 22.18, 5], [-16.05, 22.2, 4], [-12.9, 22.4, 5]] as const) if (onSand(x, z, 0.02)) weed(g, x, z, Math.round(x * 3), n, 0.24);
  // a light collar of grit round the pile foot
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.4; pebble(g, PILE.x + Math.cos(a) * 0.3, PILE.z + Math.sin(a) * 0.3, 0.016, 100 + k); }
  return g;
}

// ------------------------------------------------------------------ the cove

const POOL = 18;
export class Cove {
  readonly group = new THREE.Group();
  private readonly bubbles: THREE.InstancedMesh;
  private readonly sandBits: THREE.InstancedMesh;
  private readonly bubble: Array<{ x: number; y: number; z: number; age: number; life: number; wob: number; size: number }> = [];
  private readonly bit: Array<{ x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number }> = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly foamMaterial: THREE.MeshBasicMaterial;
  private cursorB = 0; private cursorS = 0; private clock = 0;

  constructor(parent: THREE.Object3D) {
    this.group.name = 'critter-cove';
    const foam: THREE.BufferGeometry[] = [];
    const merged = mergeGeometries([sandMesh(foam), ...props()], false);
    if (!merged) throw new Error('cove: empty');
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 }));
    mesh.name = 'critter-cove-sand'; mesh.receiveShadow = true; mesh.castShadow = false;
    this.foamMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: true });
    const ribbon = new THREE.Mesh(foam[0], this.foamMaterial);
    ribbon.name = 'critter-cove-foam'; ribbon.renderOrder = 1; ribbon.frustumCulled = false;
    this.group.add(mesh, ribbon);
    this.bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.62, depthWrite: false }), POOL);
    this.sandBits = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xe3cc98, roughness: 1 }), POOL);
    for (const im of [this.bubbles, this.sandBits]) {
      im.frustumCulled = false; im.count = POOL; this.group.add(im);
      for (let i = 0; i < POOL; i++) im.setMatrixAt(i, this.m.makeScale(0, 0, 0));
    }
    for (let i = 0; i < POOL; i++) {
      this.bubble.push({ x: 0, y: 0, z: 0, age: 9, life: 1, wob: 0, size: 0.01 });
      this.bit.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 9, life: 1 });
    }
    parent.add(this.group);
  }

  /** A tiny bubble rising from a crab's mouth. */
  emitBubble(x: number, y: number, z: number): void {
    const b = this.bubble[this.cursorB++ % POOL];
    b.x = x; b.y = y; b.z = z; b.age = 0; b.life = 0.9 + Math.random() * 0.5; b.wob = Math.random() * 6.28; b.size = 0.008 + Math.random() * 0.008;
  }
  /** A pinch of sand flicked out while a crab digs in. */
  emitSand(x: number, y: number, z: number): void {
    const b = this.bit[this.cursorS++ % POOL], a = Math.random() * 6.28, sp = 0.25 + Math.random() * 0.35;
    b.x = x; b.y = y + 0.04; b.z = z; b.vx = Math.cos(a) * sp; b.vz = Math.sin(a) * sp; b.vy = 0.6 + Math.random() * 0.5; b.age = 0; b.life = 0.7;
  }

  update(dt: number, camera: { x: number; z: number }): void {
    const far = Math.hypot(camera.x - -15.5, camera.z - 24) > FAR;
    this.group.visible = !far;
    if (far) return;
    dt = Math.min(dt, 0.1);
    this.clock += dt; this.foamMaterial.opacity = 0.78 + 0.22 * Math.sin(this.clock * 1.3);
    let live = false;
    for (let i = 0; i < POOL; i++) {
      const b = this.bubble[i];
      if (b.age < b.life) {
        b.age += dt; const u = clamp01(b.age / b.life); live = true;
        this.v.set(b.x + Math.sin(b.wob + b.age * 6) * 0.01, b.y + 0.18 * u, b.z + Math.cos(b.wob + b.age * 5) * 0.01);
        const s = b.size * (0.6 + 0.6 * Math.sin(Math.PI * Math.min(1, u * 1.3))) * (u > 0.85 ? 1 + (u - 0.85) * 6 : 1);
        this.bubbles.setMatrixAt(i, this.m.compose(this.v, this.q.identity(), this.s.setScalar(u > 0.96 ? 0 : s)));
      } else if (b.age < 9) { b.age = 9; this.bubbles.setMatrixAt(i, this.m.makeScale(0, 0, 0)); }
      const p = this.bit[i];
      if (p.age < p.life) {
        p.age += dt; live = true;
        p.vy -= 3.2 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const k = p.age / p.life;
        this.bitMatrix(i, p.x, p.y, p.z, 0.012 * (1 - 0.5 * k));
      } else if (p.age < 9) { p.age = 9; this.sandBits.setMatrixAt(i, this.m.makeScale(0, 0, 0)); }
    }
    if (live) { this.bubbles.instanceMatrix.needsUpdate = true; this.sandBits.instanceMatrix.needsUpdate = true; }
  }
  private bitMatrix(i: number, x: number, y: number, z: number, s: number): void { this.sandBits.setMatrixAt(i, this.m.compose(this.v.set(x, y, z), this.q.identity(), this.s.setScalar(s))); }
}

