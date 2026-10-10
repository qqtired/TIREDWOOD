// Помощники отрисовки карты «Подземелья» (world.ts): периодический шум тора, растущие буферы склейки
// и «шаблоны» пропов — геометрия узла GLB, разложенная на непрозрачное (цвет материала → цвет вершин)
// и свечение (glow_* → яркий цвет вершин), в осях корня узла.
import * as THREE from 'three';

/** Сторона тора, м */
export const L = 240;
/** Сторона куска, м */
export const CHUNK = 24;
/** Кусков по стороне */
export const NCH = 10;

/** Кратчайшая разница на торе: ответ в пределах ±120 */
export function wrap(d: number): number {
  return d - L * Math.round(d / L);
}

export function mod(a: number, n: number): number {
  const r = a % n;
  return r < 0 ? r + n : r;
}

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function smooth(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Целочисленный хеш → [0, 1). Входы — целые. */
export function hash3(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x2545f491);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Хеш точки карты (координаты в дециметрах) — для поворотов и вариантов пропов */
export function hashAt(x: number, z: number, salt: number): number {
  return hash3(Math.round(mod(x, L) * 10), Math.round(mod(z, L) * 10), salt);
}

/**
 * Периодический шум значений: шаг решётки cell делит 240, поэтому на краю карты шум совпадает сам с собой.
 * Ответ в [0, 1].
 */
export function vnoise(x: number, z: number, cell: number, seed: number): number {
  const n = Math.round(L / cell);
  const fx = x / cell;
  const fz = z / cell;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  let tx = fx - ix;
  let tz = fz - iz;
  tx = tx * tx * (3 - 2 * tx);
  tz = tz * tz * (3 - 2 * tz);
  const x0 = mod(ix, n);
  const x1 = mod(ix + 1, n);
  const z0 = mod(iz, n);
  const z1 = mod(iz + 1, n);
  const a = hash3(x0, z0, seed);
  const b = hash3(x1, z0, seed);
  const c = hash3(x0, z1, seed);
  const d = hash3(x1, z1, seed);
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

/** Расстояние от точки до отрезка (круг — отрезок нулевой длины) */
export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px;
  const qz = az + dz * t - pz;
  return Math.sqrt(qx * qx + qz * qz);
}

/** Растущий буфер чисел для склейки */
export class FBuf {
  a: Float32Array;
  n = 0;
  constructor(cap = 4096) {
    this.a = new Float32Array(cap);
  }
  grow(k: number): void {
    if (this.n + k <= this.a.length) return;
    let cap = this.a.length * 2;
    while (cap < this.n + k) cap *= 2;
    const b = new Float32Array(cap);
    b.set(this.a.subarray(0, this.n));
    this.a = b;
  }
  out(): Float32Array {
    return this.a.slice(0, this.n);
  }
}

export class UBuf {
  a: Uint32Array;
  n = 0;
  constructor(cap = 8192) {
    this.a = new Uint32Array(cap);
  }
  grow(k: number): void {
    if (this.n + k <= this.a.length) return;
    let cap = this.a.length * 2;
    while (cap < this.n + k) cap *= 2;
    const b = new Uint32Array(cap);
    b.set(this.a.subarray(0, this.n));
    this.a = b;
  }
  out(): Uint32Array {
    return this.a.slice(0, this.n);
  }
}

export interface TplPart {
  /** xyz в осях корня узла */
  pos: Float32Array;
  /** нормали (у свечения пустой массив) */
  nor: Float32Array;
  /** линейный цвет вершин: у непрозрачного — цвет материала, у свечения — уже с яркостью */
  col: Float32Array;
  idx: Uint32Array;
}

export interface Tpl {
  op: TplPart;
  gl: TplPart;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** Свечение по палитре level.md §6: цвет и сила (линейная, > 1 — под ACES) */
const GLOW: Record<string, readonly [number, number]> = {
  glow_fire: [0xffb347, 2.2],
  glow_crystal: [0x8ae6da, 1.6],
  glow_jam: [0xb25fd6, 1.9],
};

class PartBuf {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  done(): TplPart {
    return {
      pos: new Float32Array(this.pos),
      nor: new Float32Array(this.nor),
      col: new Float32Array(this.col),
      idx: new Uint32Array(this.idx),
    };
  }
}

/**
 * Разобрать узел набора в шаблон. Позицию корня не берём (её и так сбросили), поворот и масштаб корня — да.
 * skip — имена частей, которые не рисуем (решётка колодца, шляпка Патриарха, верх арки).
 */
export function makeTpl(root: THREE.Object3D, skip: ReadonlySet<string>): Tpl {
  const op = new PartBuf();
  const gl = new PartBuf();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  const c = new THREE.Color();
  const zero = new THREE.Vector3();
  const rootM = new THREE.Matrix4().compose(zero, root.quaternion, root.scale);
  const walk = (o: THREE.Object3D, parent: THREE.Matrix4 | null): void => {
    if (parent && skip.has(o.name)) return;
    const m = parent ? new THREE.Matrix4().multiplyMatrices(parent, new THREE.Matrix4().compose(o.position, o.quaternion, o.scale)) : rootM;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      const g = mesh.geometry;
      const pa = g.getAttribute('position');
      const na = g.getAttribute('normal');
      const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
      const name = mat?.name ?? '';
      let glow = GLOW[name] !== undefined || name.startsWith('glow');
      const em = mat?.emissive;
      const emK = mat?.emissiveIntensity ?? 0;
      if (!glow && em && (em.r + em.g + em.b) * emK > 0.15) glow = true;
      if (glow) {
        const pal = GLOW[name];
        if (pal) c.setHex(pal[0]).multiplyScalar(pal[1]);
        else if (em) c.copy(em).multiplyScalar(Math.max(1, emK) * 1.5);
        else c.setRGB(1, 1, 1);
      } else if (mat?.color) c.copy(mat.color);
      else c.setRGB(0.5, 0.5, 0.5);
      const buf = glow ? gl : op;
      const base = buf.pos.length / 3;
      nm.getNormalMatrix(m);
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(m);
        buf.pos.push(v.x, v.y, v.z);
        buf.col.push(c.r, c.g, c.b);
        if (!glow) {
          if (na) n.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
          else n.set(0, 1, 0);
          buf.nor.push(n.x, n.y, n.z);
        }
      }
      if (g.index) {
        const ia = g.index;
        for (let k = 0; k < ia.count; k++) buf.idx.push(base + ia.getX(k));
      } else {
        for (let k = 0; k < pa.count; k++) buf.idx.push(base + k);
      }
    }
    for (const ch of o.children) walk(ch, m);
  };
  walk(root, null);
  const t: Tpl = { op: op.done(), gl: gl.done(), minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9, minZ: 1e9, maxZ: -1e9 };
  for (const p of [t.op.pos, t.gl.pos]) {
    for (let i = 0; i < p.length; i += 3) {
      t.minX = Math.min(t.minX, p[i]);
      t.maxX = Math.max(t.maxX, p[i]);
      t.minY = Math.min(t.minY, p[i + 1]);
      t.maxY = Math.max(t.maxY, p[i + 1]);
      t.minZ = Math.min(t.minZ, p[i + 2]);
      t.maxZ = Math.max(t.maxZ, p[i + 2]);
    }
  }
  return t;
}

/**
 * Как далеко от оси стоит грань пропа на высоте факела (1,5–2,3 м) в направлении (dx, dz) осей шаблона:
 * для настенного факела на колонне.
 */
export function faceDist(t: Tpl, dx: number, dz: number): number {
  let best = 0;
  const p = t.op.pos;
  for (let i = 0; i < p.length; i += 3) {
    const y = p[i + 1];
    if (y < 1.5 || y > 2.3) continue;
    const along = p[i] * dx + p[i + 2] * dz;
    const perp = Math.abs(p[i] * -dz + p[i + 2] * dx);
    if (perp < 0.35 && along > best) best = along;
  }
  return best;
}
