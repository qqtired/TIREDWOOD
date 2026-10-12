// Kit for the harbour animals: round, toy-like bodies built in code, one skinned mesh and one shared
// vertex-coloured material per animal (one draw call each). The skeleton is procedural: every limb,
// tail, ear, beak or claw is a bone that the animal classes rotate by hand (see critter-quadruped.ts and
// critter-coastal.ts). Everything here is rig-space: metres, y up, the animal faces -Z, +X is its right.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type V3 = readonly [number, number, number];
export type Hex = number;
export type ColorFn = (x: number, y: number, z: number) => Hex;
export type Paint = Hex | ColorFn;
/** [bone a, bone b, weight of b] — every vertex follows at most two bones. */
export type Skin = readonly [number, number, number];
export type SkinFn = (x: number, y: number, z: number) => Skin;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
export const ease = (v: number): number => { const x = clamp01(v); return x * x * (3 - 2 * x); };
/** Hash of an integer to [0,1): deterministic, shared by every client. */
export function hash01(n: number): number {
  let h = Math.imul(Math.floor(n) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
/**
 * One pseudo-random event of length `dur` every `period` seconds: returns its progress 0..1 while it runs, else -1.
 * Same arguments give the same events on every client.
 */
export function pulse(t: number, period: number, seed: number, dur: number): number {
  const k = Math.floor(t / period), start = hash01(k * 7 + seed) * (period - dur), u = t - k * period - start;
  return u >= 0 && u < dur ? u / dur : -1;
}

export const critterMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0 });

// ------------------------------------------------------------------ geometry

/** Make triangle winding face outward (all kit solids are closed). */
function outward(index: number[], pos: number[]): void {
  let volume = 0;
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3;
    volume += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) + pos[a + 1] * (pos[b + 2] * pos[c] - pos[b] * pos[c + 2]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  if (volume < 0) for (let i = 0; i < index.length; i += 3) { const t = index[i + 1]; index[i + 1] = index[i + 2]; index[i + 2] = t; }
}

function finish(pos: number[], nor: number[] | null, index: number[]): THREE.BufferGeometry {
  outward(index, pos);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (nor) g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(index);
  if (!nor) g.computeVertexNormals();
  return g;
}

/** UV-sphere without seam duplicates, scaled to an ellipsoid (analytic normals). */
export function ellipsoid(rx: number, ry: number, rz: number, at: V3 = [0, 0, 0], seg: readonly [number, number] = [12, 8]): THREE.BufferGeometry {
  const [w, h] = seg, pos: number[] = [], nor: number[] = [], index: number[] = [];
  const push = (x: number, y: number, z: number): void => {
    pos.push(at[0] + x * rx, at[1] + y * ry, at[2] + z * rz);
    const nx = x / rx, ny = y / ry, nz = z / rz, l = Math.hypot(nx, ny, nz) || 1;
    nor.push(nx / l, ny / l, nz / l);
  };
  push(0, 1, 0);
  for (let j = 1; j < h; j++) {
    const phi = (j / h) * Math.PI, s = Math.sin(phi), c = Math.cos(phi);
    for (let i = 0; i < w; i++) { const th = (i / w) * Math.PI * 2; push(Math.cos(th) * s, c, Math.sin(th) * s); }
  }
  push(0, -1, 0);
  const south = pos.length / 3 - 1;
  for (let i = 0; i < w; i++) index.push(0, 1 + i, 1 + (i + 1) % w);
  for (let j = 0; j < h - 2; j++) for (let i = 0; i < w; i++) {
    const a = 1 + j * w + i, b = 1 + j * w + (i + 1) % w, c = a + w, d = b + w;
    index.push(a, c, b, b, c, d);
  }
  const last = 1 + (h - 2) * w;
  for (let i = 0; i < w; i++) index.push(south, last + (i + 1) % w, last + i);
  return finish(pos, nor, index);
}

export interface TubeOptions { radial?: number; samples?: number; capStart?: boolean; capEnd?: boolean }
/**
 * Smooth tapered tube through `points` (Catmull-Rom), round end caps. `radii` is one value or one per point.
 * `t` (0 start … 1 end) of every vertex is returned in the geometry attribute `along` (used for skin weights).
 */
export function tube(points: readonly V3[], radii: number | readonly number[], o: TubeOptions = {}): THREE.BufferGeometry {
  const radial = o.radial ?? 8, vs = points.map((p) => new THREE.Vector3(...p));
  const curve: THREE.Curve<THREE.Vector3> = vs.length > 2 ? new THREE.CatmullRomCurve3(vs, false, 'centripetal') : new THREE.LineCurve3(vs[0], vs[1]);
  const samples = o.samples ?? Math.max(2, (vs.length - 1) * 3), rings = samples + 1;
  const rad = (t: number): number => {
    if (typeof radii === 'number') return radii;
    const f = t * (radii.length - 1), i = Math.min(radii.length - 2, Math.floor(f));
    return mix(radii[i], radii[i + 1], f - i);
  };
  const pos: number[] = [], nor: number[] = [], along: number[] = [], index: number[] = [];
  const rows: number[][] = [];
  const frame = new THREE.Vector3(), tangent = new THREE.Vector3(), prevT = new THREE.Vector3(), nrm = new THREE.Vector3(), bin = new THREE.Vector3(), q = new THREE.Quaternion();
  const ring = (c: THREE.Vector3, r: number, N: THREE.Vector3, B: THREE.Vector3, T: THREE.Vector3, slope: number, t: number, cap = 0): number[] => {
    const row: number[] = [];
    for (let j = 0; j < radial; j++) {
      const th = (j / radial) * Math.PI * 2, cx = Math.cos(th), sy = Math.sin(th);
      pos.push(c.x + r * (cx * N.x + sy * B.x), c.y + r * (cx * N.y + sy * B.y), c.z + r * (cx * N.z + sy * B.z));
      const rx = cx * N.x + sy * B.x, ry = cx * N.y + sy * B.y, rz = cx * N.z + sy * B.z;
      // cap rings: normal tilts along the axis, body rings: along the taper slope
      const k = cap !== 0 ? cap : -slope, nx = rx + k * T.x, ny = ry + k * T.y, nz = rz + k * T.z, l = Math.hypot(nx, ny, nz) || 1;
      nor.push(nx / l, ny / l, nz / l); along.push(t);
      row.push(pos.length / 3 - 1);
    }
    return row;
  };
  const centres: THREE.Vector3[] = [], tangents: THREE.Vector3[] = [], Ns: THREE.Vector3[] = [], Bs: THREE.Vector3[] = [];
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    curve.getPointAt(t, frame); centres.push(frame.clone());
    curve.getTangentAt(t, tangent).normalize(); tangents.push(tangent.clone());
    if (i === 0) {
      nrm.set(0, 1, 0); if (Math.abs(tangent.y) > 0.92) nrm.set(1, 0, 0);
      nrm.addScaledVector(tangent, -nrm.dot(tangent)).normalize();
    } else { q.setFromUnitVectors(prevT, tangent); nrm.applyQuaternion(q).normalize(); }
    bin.crossVectors(tangent, nrm).normalize();
    Ns.push(nrm.clone()); Bs.push(bin.clone()); prevT.copy(tangent);
  }
  const capSteps = 3;
  const startRow = (): void => {
    // pole + hemisphere rings (outward from the pole to the first body ring)
    const r0 = rad(0), T = tangents[0];
    const pole = pos.length / 3;
    pos.push(centres[0].x - T.x * r0, centres[0].y - T.y * r0, centres[0].z - T.z * r0); nor.push(-T.x, -T.y, -T.z); along.push(0);
    let prev: number[] | null = null;
    for (let k = capSteps; k >= 1; k--) {
      const phi = (k / (capSteps + 1)) * Math.PI / 2, c = centres[0].clone().addScaledVector(T, -r0 * Math.sin(phi));
      const row = ring(c, r0 * Math.cos(phi), Ns[0], Bs[0], T, 0, 0, -Math.tan(phi));
      if (prev) for (let j = 0; j < radial; j++) { const a = prev[j], b = prev[(j + 1) % radial], c2 = row[j], d = row[(j + 1) % radial]; index.push(a, c2, b, b, c2, d); }
      else for (let j = 0; j < radial; j++) index.push(pole, row[j], row[(j + 1) % radial]);
      prev = row;
    }
    rows.push(prev!);
  };
  if (o.capStart !== false) startRow();
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1), r = rad(t), r2 = rad(Math.min(1, t + 0.02)), r1 = rad(Math.max(0, t - 0.02));
    const slope = (r2 - r1) / (curve.getLength() * 0.04 || 1);
    rows.push(ring(centres[i], r, Ns[i], Bs[i], tangents[i], slope, t));
  }
  if (o.capEnd !== false) {
    const n = rings - 1, r1 = rad(1), T = tangents[n];
    for (let k = 1; k <= capSteps; k++) {
      const phi = (k / (capSteps + 1)) * Math.PI / 2, c = centres[n].clone().addScaledVector(T, r1 * Math.sin(phi));
      rows.push(ring(c, r1 * Math.cos(phi), Ns[n], Bs[n], T, 0, 1, Math.tan(phi)));
    }
  }
  for (let i = 0; i + 1 < rows.length; i++) for (let j = 0; j < radial; j++) {
    const a = rows[i][j], b = rows[i][(j + 1) % radial], c = rows[i + 1][j], d = rows[i + 1][(j + 1) % radial];
    index.push(a, c, b, b, c, d);
  }
  if (o.capEnd !== false) {
    const last = rows[rows.length - 1], pole = pos.length / 3, T = tangents[rings - 1], r1 = rad(1);
    pos.push(centres[rings - 1].x + T.x * r1, centres[rings - 1].y + T.y * r1, centres[rings - 1].z + T.z * r1); nor.push(T.x, T.y, T.z); along.push(1);
    for (let j = 0; j < radial; j++) index.push(pole, last[(j + 1) % radial], last[j]);
  }
  const g = finish(pos, nor, index);
  g.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  return g;
}

/** Closed lofted solid along an axis: rings are [axis coordinate, centre a, centre b, radius a, radius b]. */
export function loft(rings: readonly (readonly [number, number, number, number, number])[], axis: 'x' | 'z' = 'z', radial = 14): THREE.BufferGeometry {
  const pos: number[] = [], index: number[] = [];
  for (const [a, b, c, r1, r2] of rings) for (let j = 0; j < radial; j++) {
    const th = (j / radial) * Math.PI * 2, u = b + r1 * Math.cos(th), v = c + r2 * Math.sin(th);
    if (axis === 'z') pos.push(u, v, a); else pos.push(a, u, v);
  }
  for (let k = 0; k < rings.length - 1; k++) for (let j = 0; j < radial; j++) {
    const a = k * radial + j, b = k * radial + (j + 1) % radial, c = b + radial, d = a + radial;
    index.push(a, b, d, b, c, d);
  }
  for (const [k, flip] of [[0, true], [rings.length - 1, false]] as const) {
    const r = rings[k], centre = pos.length / 3;
    if (axis === 'z') pos.push(r[1], r[2], r[0]); else pos.push(r[0], r[1], r[2]);
    for (let j = 0; j < radial; j++) { const a = k * radial + j, b = k * radial + (j + 1) % radial; index.push(centre, ...(flip ? [b, a] : [a, b])); }
  }
  return finish(pos, null, index);
}

/** Interpolate control rings to `n` evenly spaced (by index) rings with smooth (Catmull-Rom) blending. */
export function resampleRings(rings: readonly (readonly number[])[], n: number): number[][] {
  const out: number[][] = [], m = rings.length - 1;
  const cr = (p0: number, p1: number, p2: number, p3: number, t: number): number => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  for (let k = 0; k < n; k++) {
    const f = (k / (n - 1)) * m, i = Math.min(m - 1, Math.floor(f)), t = f - i, a = rings[Math.max(0, i - 1)], b = rings[i], c = rings[i + 1], d = rings[Math.min(m, i + 2)];
    out.push(b.map((_, j) => cr(a[j], b[j], c[j], d[j], t)));
  }
  return out;
}

/** Flat-ish cone along +Y (base at y=0), rounded by the caller via scale/rotate. */
export function cone(rBase: number, rTip: number, height: number, radial = 6): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTip, rBase, height, radial, 1);
  g.translate(0, height / 2, 0); g.deleteAttribute('uv');
  return g;
}

/** Place a geometry: scale → rotate (XYZ euler) → translate. */
export function place(g: THREE.BufferGeometry, at: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')), new THREE.Vector3(...scale));
  g.applyMatrix4(m);
  return g;
}

// ------------------------------------------------------------------ rig builder

export class RigBuilder {
  readonly bones: THREE.Bone[] = [];
  readonly names: string[] = [];
  readonly localRest: THREE.Vector3[] = [];
  private readonly worldRest: THREE.Vector3[] = [];
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly col = new THREE.Color();

  /** Add a bone at a rig-space rest position; its local offset is derived from the parent. Returns its index. */
  bone(name: string, at: V3, parent?: string): number {
    const bone = new THREE.Bone(), p = new THREE.Vector3(...at);
    bone.name = name;
    if (parent !== undefined) {
      const pi = this.index(parent);
      bone.position.copy(p).sub(this.worldRest[pi]); this.bones[pi].add(bone);
    } else bone.position.copy(p);
    this.localRest.push(bone.position.clone()); this.worldRest.push(p);
    this.bones.push(bone); this.names.push(name);
    return this.bones.length - 1;
  }
  index(name: string): number {
    const i = this.names.indexOf(name);
    if (i < 0) throw new Error(`critter rig: no bone ${name}`);
    return i;
  }
  restOf(name: string): THREE.Vector3 { return this.worldRest[this.index(name)]; }

  /**
   * Add a solid. Colour is a hex or a function of the rig-space vertex position. Without `skin` the whole part
   * follows `bone`; with `skin` each vertex blends two bones.
   */
  add(source: THREE.BufferGeometry, paint: Paint, bone: string | number, skin?: SkinFn): this {
    const g = source;
    const b = typeof bone === 'string' ? this.index(bone) : bone;
    const p = g.getAttribute('position'), n = p.count;
    const color = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      this.col.setHex(typeof paint === 'number' ? paint : paint(x, y, z));
      color[i * 3] = this.col.r; color[i * 3 + 1] = this.col.g; color[i * 3 + 2] = this.col.b;
      if (skin) { const [a, c, w] = skin(x, y, z); si[i * 4] = a; si[i * 4 + 1] = c; sw[i * 4] = 1 - w; sw[i * 4 + 1] = w; }
      else { si[i * 4] = b; sw[i * 4] = 1; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(color, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    g.deleteAttribute('uv'); g.deleteAttribute('along');
    this.geos.push(g);
    return this;
  }

  /** Skin function for a tube/loft: blends along a chain of bones by the coordinate on `axis` between `from` and `to`. */
  chain(names: readonly string[], axis: 'x' | 'y' | 'z', from: number, to: number): SkinFn {
    const idx = names.map((n) => this.index(n)), last = idx.length - 1;
    return (x, y, z) => {
      const v = axis === 'x' ? x : axis === 'y' ? y : z, f = clamp01((v - from) / (to - from)) * last, i = Math.min(last - 1, Math.floor(f));
      return [idx[i], idx[i + 1], ease(f - i)];
    };
  }

  /** Like chain(), but with an explicit coordinate for every bone (monotonic along the axis, either direction). */
  chainAt(names: readonly string[], axis: 'x' | 'y' | 'z', coords: readonly number[]): SkinFn {
    const idx = names.map((n) => this.index(n)), last = idx.length - 1, inc = coords[last] > coords[0];
    return (x, y, z) => {
      const v = axis === 'x' ? x : axis === 'y' ? y : z;
      for (let i = 0; i < last; i++) {
        const a = coords[i], b = coords[i + 1];
        if (inc ? v <= b : v >= b) return [idx[i], idx[i + 1], i === 0 && (inc ? v < a : v > a) ? 0 : ease((v - a) / (b - a))];
      }
      return [idx[last], idx[last], 0];
    };
  }

  build(name: string, material: THREE.Material = critterMaterial): THREE.SkinnedMesh {
    const geometry = mergeGeometries(this.geos, false);
    if (!geometry) throw new Error('critter rig: empty');
    geometry.computeBoundingSphere();
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = name; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
    for (const bone of this.bones) if (!bone.parent) mesh.add(bone);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(this.bones));
    return mesh;
  }
}

// ------------------------------------------------------------------ pose buffers

/** Per-bone rotation / position offset / scale, blended and then written to the bones. */
export class Pose {
  readonly n: number;
  readonly rot: Float32Array;
  readonly pos: Float32Array;
  readonly scl: Float32Array;
  constructor(n: number) { this.n = n; this.rot = new Float32Array(n * 3); this.pos = new Float32Array(n * 3); this.scl = new Float32Array(n * 3).fill(1); }
  reset(): this { this.rot.fill(0); this.pos.fill(0); this.scl.fill(1); return this; }
  copy(o: Pose): this { this.rot.set(o.rot); this.pos.set(o.pos); this.scl.set(o.scl); return this; }
  r(i: number, x: number, y = 0, z = 0): this { this.rot[i * 3] = x; this.rot[i * 3 + 1] = y; this.rot[i * 3 + 2] = z; return this; }
  radd(i: number, x: number, y = 0, z = 0): this { this.rot[i * 3] += x; this.rot[i * 3 + 1] += y; this.rot[i * 3 + 2] += z; return this; }
  p(i: number, x: number, y = 0, z = 0): this { this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; return this; }
  padd(i: number, x: number, y = 0, z = 0): this { this.pos[i * 3] += x; this.pos[i * 3 + 1] += y; this.pos[i * 3 + 2] += z; return this; }
  s(i: number, x: number, y = x, z = x): this { this.scl[i * 3] = x; this.scl[i * 3 + 1] = y; this.scl[i * 3 + 2] = z; return this; }
  /** this = a·(1-w) + b·w */
  mixOf(a: Pose, b: Pose, w: number): this {
    for (let i = 0; i < this.rot.length; i++) {
      this.rot[i] = a.rot[i] + (b.rot[i] - a.rot[i]) * w;
      this.pos[i] = a.pos[i] + (b.pos[i] - a.pos[i]) * w;
      this.scl[i] = a.scl[i] + (b.scl[i] - a.scl[i]) * w;
    }
    return this;
  }
  apply(bones: readonly THREE.Bone[], rest: readonly THREE.Vector3[]): void {
    for (let i = 0; i < bones.length; i++) {
      const b = bones[i], k = i * 3;
      b.rotation.set(this.rot[k], this.rot[k + 1], this.rot[k + 2]);
      b.position.set(rest[i].x + this.pos[k], rest[i].y + this.pos[k + 1], rest[i].z + this.pos[k + 2]);
      b.scale.set(this.scl[k], this.scl[k + 1], this.scl[k + 2]);
    }
  }
}

// ------------------------------------------------------------------ two-bone leg solver (world space)

const _origin = new THREE.Vector3(), _cur = new THREE.Vector3(), _to = new THREE.Vector3(), _pos = new THREE.Vector3(), _scl = new THREE.Vector3(), _knee = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

function aim(bone: THREE.Bone, child: THREE.Bone, target: THREE.Vector3): void {
  _origin.setFromMatrixPosition(bone.matrixWorld);
  _cur.setFromMatrixPosition(child.matrixWorld).sub(_origin).normalize();
  _to.copy(target).sub(_origin).normalize();
  _q1.setFromUnitVectors(_cur, _to);
  bone.matrixWorld.decompose(_pos, _q2, _scl);          // world quaternion of the bone (scale ignored)
  _q2.premultiply(_q1);
  const parent = bone.parent!;
  parent.matrixWorld.decompose(_pos, _q1, _scl);
  bone.quaternion.copy(_q1.invert().multiply(_q2));
  bone.updateMatrixWorld(true);
}

/**
 * Upper → lower → paw chain that points straight down in the bind pose. Goals and poles are world-space; segment
 * lengths are measured in world space too, so the holder may be scaled uniformly.
 */
export class Leg {
  readonly upper: THREE.Bone;
  readonly lower: THREE.Bone;
  readonly paw: THREE.Bone;
  private readonly hip = new THREE.Vector3();
  private readonly end = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly perp = new THREE.Vector3();
  private readonly mid = new THREE.Vector3();
  constructor(upper: THREE.Bone, lower: THREE.Bone, paw: THREE.Bone) {
    this.upper = upper; this.lower = lower; this.paw = paw;
  }
  /** Set the paw's world orientation after solve() (keeps the sole level with the ground). */
  orientPaw(worldQ: THREE.Quaternion): void {
    this.paw.parent!.matrixWorld.decompose(_pos, _q1, _scl);
    this.paw.quaternion.copy(_q1.invert().multiply(worldQ));
    this.paw.updateMatrixWorld(true);
  }
  solve(goal: THREE.Vector3, pole: THREE.Vector3): void {
    this.upper.quaternion.identity(); this.lower.quaternion.identity(); this.paw.quaternion.identity();
    this.upper.updateMatrixWorld(true);
    this.hip.setFromMatrixPosition(this.upper.matrixWorld);
    this.mid.setFromMatrixPosition(this.lower.matrixWorld);
    this.end.setFromMatrixPosition(this.paw.matrixWorld);
    const l1 = this.hip.distanceTo(this.mid), l2 = this.mid.distanceTo(this.end);
    this.axis.copy(goal).sub(this.hip);
    const d = clamp(this.axis.length(), Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
    this.axis.normalize();
    this.perp.copy(pole).addScaledVector(this.axis, -pole.dot(this.axis));
    if (this.perp.lengthSq() < 1e-8) this.perp.set(0, 0, 1).addScaledVector(this.axis, -this.axis.z);
    this.perp.normalize();
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d), height = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    _knee.copy(this.hip).addScaledVector(this.axis, along).addScaledVector(this.perp, height);
    this.end.copy(this.hip).addScaledVector(this.axis, d);
    aim(this.upper, this.lower, _knee);
    aim(this.lower, this.paw, this.end);
  }
}
