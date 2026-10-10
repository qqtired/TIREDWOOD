// Шапки, аксессуары и очки желейки: маленькие меши из примитивов в координатах тела (макушка — y = 1.58,
// лицом в −Z). Геометрии общие на всех (кэш по вещи), цвета — вершинные, один материал на всё;
// золото (корона, цепь, монокль, бубенцы, кокарда) — отдельной геометрией под металлический материал.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { devilHeadParts, devilTailParts } from './devil3d.ts';
import { farmWearOf } from './farmwear.ts';

export const BODY_H = 1.58;

type Geo = THREE.BufferGeometry;
type V3 = [number, number, number];

// ------------------------------------------------------------ профиль тела

const PROFILE: Array<[number, number]> = [
  [0.001, 0.0], [0.3, 0.0], [0.43, 0.07], [0.505, 0.25], [0.525, 0.55], [0.51, 0.84],
  [0.46, 1.09], [0.37, 1.31], [0.23, 1.49], [0.001, BODY_H],
];

/** Точки профиля тела (r, y) — по ним вращается тело желейки. */
export function bodyProfile(): THREE.Vector2[] {
  return new THREE.SplineCurve(PROFILE.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(28);
}

let profileCache: THREE.Vector2[] | null = null;

/** Радиус тела на высоте y (по тем же точкам, что и само тело). */
export function bodyR(y: number): number {
  const pts = (profileCache ??= bodyProfile());
  if (y <= 0) return 0.3;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (y <= b.y && b.y > a.y) return a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
  }
  return 0;
}

// ------------------------------------------------------------ помощники

/** Одним цветом (вершинные цвета), без индекса — чтобы склеивать разные примитивы. */
export function col(g: Geo, hex: number): Geo {
  const ng = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const n = ng.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return ng;
}

/** Цвет по центру каждого треугольника — для полос и секторов с чёткой границей. */
export function colTri(g: Geo, fn: (x: number, y: number, z: number) => number): Geo {
  const ng = g.index ? g.toNonIndexed() : g;
  const pos = ng.getAttribute('position');
  const arr = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    c.set(fn(x, y, z));
    for (let k = 0; k < 3; k++) arr.set([c.r, c.g, c.b], (i + k) * 3);
  }
  ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return ng;
}

/** Для металла: без цвета и без индекса. */
function bare(g: Geo): Geo {
  const ng = g.index ? g.toNonIndexed() : g;
  if (ng.getAttribute('color')) ng.deleteAttribute('color');
  return ng;
}

export function merge(list: Geo[]): Geo | null {
  if (!list.length) return null;
  const g = mergeGeometries(list, false);
  if (!g) throw new Error('outfit3d: не склеилось');
  g.computeBoundingSphere();
  return g;
}

/**
 * Шапочка по настоящему профилю тела с толщиной t. Эллипсоид расходился со сплайном желейки.
 * Верх выше макушки на t; радиальный запас уменьшается к закрытому верху. Нижний край — на высоте yFront спереди и yBack сзади.
 */
function domeCap(t: number, yFront: number, yBack: number, seg = 28, rows = 10): Geo {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const n = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const phi = (i / seg) * Math.PI * 2;
    const yBase = yBack + (yFront - yBack) * ((1 - Math.cos(phi)) / 2);
    for (let j = 0; j <= rows; j++) {
      const u = j / rows;
      const y = BODY_H + t - u * (BODY_H + t - yBase);
      const r = j === 0 ? 0 : bodyR(y - t) + t * u;
      const x = r * Math.sin(phi);
      const z = r * Math.cos(phi);
      pos.push(x, y, z);
      const dr = (bodyR(y - t + 0.001) - bodyR(y - t - 0.001)) / 0.002 - t / (BODY_H + t - yBase);
      n.set(Math.sin(phi), -dr, Math.cos(phi)).normalize();
      nor.push(n.x, n.y, n.z);
      uv.push(i / seg, j / rows);
    }
  }
  const at = (i: number, j: number) => i * (rows + 1) + j;
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < rows; j++) {
      idx.push(at(i, j), at(i, j + 1), at(i + 1, j));
      idx.push(at(i + 1, j), at(i, j + 1), at(i + 1, j + 1));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Замкнутая лента по поверхности тела: y(φ) — высота, off — отступ от тела. φ = 0 — спина (+Z), π — лицо. */
function bandOnBody(yAt: (phi: number) => number, off: number, tube: number, seg = 48): Geo {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < seg; i++) {
    const phi = (i / seg) * Math.PI * 2;
    const y = yAt(phi);
    const r = bodyR(y) + off;
    pts.push(new THREE.Vector3(r * Math.sin(phi), y, r * Math.cos(phi)));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), seg, tube, 6, true);
}

export function tube(points: V3[], r: number, seg = 24): Geo {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), seg, r, 6, false);
}

/** Лежащее кольцо (тор в плоскости XZ). */
function ring(R: number, r: number, y: number, seg = 32): Geo {
  return new THREE.TorusGeometry(R, r, 6, seg).rotateX(Math.PI / 2).translate(0, y, 0);
}

function star(r: number, depth: number): Geo {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
}

/** Мягкий рог колпака: конус длиной len, изогнутый в сторону +X и вниз. */
function horn(len: number, r: number): Geo {
  const g = new THREE.ConeGeometry(r, len, 12, 10).translate(0, len / 2, 0);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / len;
    pos.setX(i, pos.getX(i) + 0.55 * len * t * t);
    pos.setY(i, pos.getY(i) * (1 - 0.45 * t));
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------ вещи

export interface Wear {
  /** Вершинные цвета, обычный материал */
  geo: Geo | null;
  /** Золото */
  metal: Geo | null;
  /** Высота крепления: по ней считается сдвиг и наклон вместе с макушкой */
  y: number;
}

const NONE: Wear = { geo: null, metal: null, y: 0 };

/** Сдвинуть в систему узла крепления (начало — на высоте y). */
export function wear(parts: Geo[], metal: Geo[], y: number): Wear {
  const shift = (g: Geo) => g.translate(0, -y, 0);
  return { geo: merge(parts.map(shift)), metal: merge(metal.map((g) => shift(bare(g)))), y };
}

const RED = 0xd8473a;
const GOLD_GEM_RED = 0xd0203a;
const GOLD_GEM_BLUE = 0x2a5ad8;

const HATS: Record<string, () => Wear> = {
  devil: () => wear(devilHeadParts(bodyR), [], 1.45),
  astronaut: () => wear([
    col(domeCap(0.075, 1.33, 1.25, 24, 10), 0xe4edf0),
    col(new THREE.BoxGeometry(0.4, 0.09, 0.07).rotateX(0.3).translate(0, 1.45, -0.39), 0x172c45),
    col(new THREE.BoxGeometry(0.3, 0.025, 0.075).rotateX(0.3).translate(0, 1.47, -0.402), 0x66e4de),
    ...[-1, 1].map(s => col(new THREE.CylinderGeometry(0.09, 0.09, 0.085, 12).rotateZ(Math.PI / 2).translate(s * 0.46, 1.32, 0), 0x273b51)),
    col(new THREE.CylinderGeometry(0.013, 0.013, 0.24, 6).rotateZ(-0.25).translate(0.31, 1.74, 0.07), 0x273b51),
    col(new THREE.SphereGeometry(0.038, 8, 6).translate(0.34, 1.865, 0.07), 0xff8259),
  ], [ring(0.44, 0.014, 1.34, 24)], 1.45),

  storm: () => wear([
    col(new THREE.ConeGeometry(0.37, 0.8, 12, 8).rotateZ(-0.13).translate(0.03, 1.79, 0), 0x403975),
    col(new THREE.CylinderGeometry(0.58, 0.59, 0.032, 24).translate(0, 1.405, 0), 0x252745),
    col(new THREE.CylinderGeometry(0.36, 0.37, 0.07, 12, 1, true).translate(0, 1.465, 0), 0x748ed8),
    col(star(0.064, 0.013).rotateX(-0.3).translate(-0.045, 1.67, -0.265), 0x9dece8),
    col(star(0.042, 0.01).rotateX(-0.3).translate(0.11, 1.82, -0.19), 0xe9f4ff),
  ], [ring(0.36, 0.013, 1.445, 24), new THREE.OctahedronGeometry(0.057).translate(0.083, 2.195, 0)], 1.5),

  none: () => NONE,
  cap: () => wear([
    col(domeCap(0.025, 1.345, 1.28), RED),
    col(new THREE.CylinderGeometry(0.28, 0.28, 0.025, 20, 1, false, Math.PI / 2, Math.PI).scale(1, 1, 0.95).rotateX(-0.12).translate(0, 1.34, -0.25), 0xb5382e),
    col(new THREE.SphereGeometry(0.035, 10, 6).translate(0, 1.61, 0), 0xb5382e),
  ], [], 1.45),

  panama: () => wear([
    col(domeCap(0.04, 1.335, 1.335), 0xe6d6ae),
    col(new THREE.CylinderGeometry(0.41, 0.6, 0.08, 28, 1, true).translate(0, 1.31, 0), 0xdcca9c),
    col(new THREE.CylinderGeometry(0.39, 0.41, 0.045, 28, 1, true).translate(0, 1.36, 0), 0x5d7f4f),
  ], [], 1.42),

  ushanka: () => {
    const fur = 0x6a4c34;
    const flap = (s: number) => col(new THREE.SphereGeometry(1, 12, 8).scale(0.06, 0.17, 0.15).rotateZ(s * 0.15).translate(s * 0.43, 1.22, 0.02), fur);
    return wear([
      col(domeCap(0.07, 1.34, 1.31), 0x7d5c42),
      col(ring(0.445, 0.065, 1.35, 36), fur),
      flap(-1),
      flap(1),
      col(new THREE.BoxGeometry(0.34, 0.13, 0.05).rotateX(0.35).translate(0, 1.44, -0.42), fur),
      col(star(0.035, 0.01).rotateX(0.35).translate(0, 1.445, -0.452), 0xd8332a),
    ], [], 1.42);
  },

  fisher: () => wear([
    col(new THREE.CylinderGeometry(0.33, 0.39, 0.24, 24).translate(0, 1.48, 0), 0x8a8456),
    col(new THREE.CylinderGeometry(0.39, 0.58, 0.11, 28, 1, true).translate(0, 1.305, 0), 0x7a7449),
    col(new THREE.CylinderGeometry(0.385, 0.392, 0.045, 24, 1, true).translate(0, 1.385, 0), 0x4f4b2c),
    col(new THREE.SphereGeometry(0.03, 10, 8).translate(0.37, 1.45, 0.14), 0xd23a2a),
    col(new THREE.SphereGeometry(0.022, 10, 8).translate(0.375, 1.41, 0.17), 0xf4f0e6),
  ], [], 1.45),

  bandana: () => wear([
    col(domeCap(0.018, 1.34, 1.18), 0xc83a2e),
    col(new THREE.SphereGeometry(0.06, 12, 8).translate(0, 1.22, 0.45), 0xb23026),
    col(new THREE.ConeGeometry(0.055, 0.22, 4).scale(1, 1, 0.3).rotateX(Math.PI - 0.5).rotateZ(0.35).translate(-0.05, 1.12, 0.5), 0xb23026),
    col(new THREE.ConeGeometry(0.055, 0.2, 4).scale(1, 1, 0.3).rotateX(Math.PI - 0.6).rotateZ(-0.3).translate(0.05, 1.13, 0.5), 0xb23026),
  ], [], 1.42),

  helmet: () => {
    const a = 0.49 + 0.016;
    const b = 0.63 + 0.016;
    const ridge: V3[] = [];
    for (let k = 0; k <= 12; k++) {
      const th = -0.95 + (k / 12) * 1.9;
      ridge.push([0, 1.0 + b * Math.cos(th), a * Math.sin(th)]);
    }
    return wear([
      col(domeCap(0.05, 1.335, 1.28), 0xf0bf2c),
      col(new THREE.TorusGeometry(0.47, 0.035, 6, 36).scale(1, 1, 0.5).rotateX(Math.PI / 2).translate(0, 1.31, 0), 0xe0ad22),
      col(tube(ridge, 0.035, 16), 0xe0ad22),
    ], [], 1.45);
  },

  sailor: () => {
    const tilt = (g: Geo) => g.translate(0, -1.5, 0).rotateX(0.1).translate(0, 1.5, 0);
    const ribbon = (s: number) => col(new THREE.BoxGeometry(0.05, 0.32, 0.008).translate(0, -0.16, 0).rotateZ(s * 0.18).rotateX(-0.5).translate(s * 0.06, 1.45, 0.31), 0x111216);
    return wear([
      tilt(col(new THREE.CylinderGeometry(0.33, 0.29, 0.12, 28, 1, true).translate(0, 1.5, 0), 0x16171b)),
      tilt(col(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 32).translate(0, 1.585, 0), 0x1f2c50)),
      tilt(col(ring(0.4, 0.012, 1.61), 0xf2efe8)),
      tilt(ribbon(-1)),
      tilt(ribbon(1)),
    ], [
      tilt(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 16).rotateX(Math.PI / 2).translate(0, 1.5, -0.318)),
    ], 1.52);
  },

  tophat: () => wear([
    col(new THREE.CylinderGeometry(0.29, 0.27, 0.44, 28).translate(0, 1.72, 0), 0x1c1c22),
    col(new THREE.CylinderGeometry(0.46, 0.46, 0.025, 32).translate(0, 1.5, 0), 0x17171c),
    col(new THREE.CylinderGeometry(0.276, 0.276, 0.07, 28, 1, true).translate(0, 1.55, 0), 0x8e1f2c),
  ], [], 1.6),

  crown: () => {
    const metal: Geo[] = [new THREE.CylinderGeometry(0.34, 0.315, 0.12, 32, 1, true).translate(0, 1.46, 0), ring(0.318, 0.012, 1.405)];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const x = Math.sin(a) * 0.335;
      const z = Math.cos(a) * 0.335;
      metal.push(new THREE.ConeGeometry(0.055, 0.13, 8).translate(x, 1.585, z));
      metal.push(new THREE.SphereGeometry(0.022, 8, 6).translate(x, 1.655, z));
    }
    const gem = (a: number, hex: number) => col(new THREE.SphereGeometry(0.03, 10, 8).scale(1, 1.2, 0.5).rotateY(a).translate(Math.sin(a) * 0.335, 1.46, Math.cos(a) * 0.335), hex);
    return wear([gem(Math.PI, GOLD_GEM_RED), gem(Math.PI - 1.05, GOLD_GEM_BLUE), gem(Math.PI + 1.05, GOLD_GEM_BLUE)], metal, 1.48);
  },

  fool: () => {
    const hornAt = (yaw: number, hex: number) => col(horn(0.5, 0.1).rotateZ(-0.35).translate(0.12, 0, 0).rotateY(yaw).translate(0, 1.42, 0), hex);
    const bell = (yaw: number) => {
      // кончик рога: та же цепочка преобразований, что у horn
      const tip = new THREE.Vector3(0.55 * 0.5, 0.5 * 0.55, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), -0.35);
      tip.x += 0.12;
      tip.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      return new THREE.SphereGeometry(0.045, 10, 8).translate(tip.x, tip.y + 1.42 - 0.03, tip.z);
    };
    return wear([
      colTri(domeCap(0.03, 1.4, 1.4), (x) => (x < 0 ? 0xd8332a : 0x3f9a3a)),
      col(new THREE.CylinderGeometry(0.33, 0.35, 0.09, 24, 1, true).translate(0, 1.385, 0), 0xf2c230),
      hornAt(0, 0xd8332a),
      hornAt(Math.PI, 0x3f9a3a),
      hornAt(-Math.PI / 2, 0xf2c230),
    ], [bell(0), bell(Math.PI), bell(-Math.PI / 2)], 1.48);
  },
  // панама и жилет рыболова, сеты и аксессуары рыбалки — в outfitfish.ts
};

const ACCS: Record<string, () => Wear> = {
  deviltail: () => wear(devilTailParts(), [], .43),
  jetpack: () => {
    const tanks: Geo[] = [];
    for (const side of [-1, 1]) {
      const x = side * 0.24;
      tanks.push(
        col(new THREE.CylinderGeometry(0.13, 0.13, 0.48, 12).translate(x, 0.96, 0.69), 0xdce8eb),
        col(new THREE.SphereGeometry(0.13, 12, 8).translate(x, 1.2, 0.69), 0xec8b4d),
        col(new THREE.CylinderGeometry(0.13, 0.09, 0.12, 12).translate(x, 0.66, 0.69), 0x293e51),
        col(new THREE.CylinderGeometry(0.095, 0.07, 0.045, 12).translate(x, 0.58, 0.69), 0x68deda),
        col(new THREE.BoxGeometry(0.045, 0.21, 0.03).translate(x, 0.97, 0.835), 0x438d9e),
      );
    }
    return wear([
      col(new THREE.BoxGeometry(0.3, 0.32, 0.12).translate(0, 0.94, 0.63), 0x293e51), ...tanks,
    ], [new THREE.BoxGeometry(0.13, 0.065, 0.025).translate(0, 1.07, 0.705)], 0.98);
  },
  none: () => NONE,
  scarf: () => {
    const stripe = (a: number) => (Math.floor(((a + Math.PI) / (Math.PI * 2)) * 14) % 2 ? 0xf3ede2 : 0xd23a3a);
    const tail = (y0: number, h: number, hex: number) => col(new THREE.BoxGeometry(0.13, h, 0.05).translate(0, y0 - h / 2, 0).rotateX(0.2).rotateZ(0.12).translate(-0.18, 0.95, -0.54), hex);
    return wear([
      colTri(new THREE.TorusGeometry(0.475, 0.075, 10, 56), (x, y) => stripe(Math.atan2(y, x))).rotateX(Math.PI / 2).translate(0, 0.95, 0),
      tail(0, 0.12, 0xd23a3a),
      tail(-0.12, 0.1, 0xf3ede2),
      tail(-0.22, 0.12, 0xd23a3a),
    ], [], 0.95);
  },

  mustache: () => {
    const half = (s: number): V3[] => [[0, 1.02, -0.508], [s * 0.08, 1.0, -0.5], [s * 0.16, 0.99, -0.476], [s * 0.21, 1.03, -0.456], [s * 0.2, 1.07, -0.45]];
    const c = 0x3a2618;
    return wear([
      col(tube(half(1), 0.028), c),
      col(tube(half(-1), 0.028), c),
      col(new THREE.SphereGeometry(0.03, 8, 6).translate(0.2, 1.07, -0.45), c),
      col(new THREE.SphereGeometry(0.03, 8, 6).translate(-0.2, 1.07, -0.45), c),
    ], [], 1.0);
  },

  bowtie: () => {
    const z = -(bodyR(0.86) + 0.03);
    const wing = (s: number) => col(new THREE.ConeGeometry(0.075, 0.13, 4).rotateZ(-s * Math.PI / 2).scale(1, 1, 0.45).translate(-s * 0.07, 0.86, z), 0xc0283a);
    return wear([wing(1), wing(-1), col(new THREE.SphereGeometry(0.035, 10, 8).scale(1, 1, 0.6).translate(0, 0.86, z - 0.01), 0x9a1f2e)], [], 0.86);
  },

  headphones: () => {
    const cup = (s: number) => col(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 20).rotateZ(Math.PI / 2).translate(s * 0.49, 1.15, 0), 0x3b7bd8);
    const pad = (s: number) => col(new THREE.TorusGeometry(0.1, 0.03, 6, 20).rotateY(Math.PI / 2).translate(s * 0.45, 1.15, 0), 0x1c1d21);
    return wear([
      col(new THREE.TorusGeometry(0.49, 0.025, 8, 32, Math.PI).translate(0, 1.15, 0), 0x2b2e35),
      cup(1), cup(-1), pad(1), pad(-1),
    ], [], 1.3);
  },

  lifebuoy: () => wear([
    colTri(new THREE.TorusGeometry(0.63, 0.12, 10, 48), (x, y) => (Math.floor(((Math.atan2(y, x) + Math.PI) / (Math.PI * 2)) * 8) % 2 ? 0xf4f0e6 : 0xe0412f))
      .rotateX(Math.PI / 2).translate(0, 0.45, 0),
  ], [], 0.45),

  chain: () => {
    const links: Geo[] = [];
    const N = 26;
    for (let k = 0; k < N; k++) {
      const phi = (k / N) * Math.PI * 2;
      const y = 0.97 - 0.13 * Math.pow(Math.max(0, -Math.cos(phi)), 1.5);
      const r = bodyR(y) + 0.014;
      const g = new THREE.TorusGeometry(0.03, 0.009, 6, 10);
      if (k % 2) g.rotateX(Math.PI / 2);
      links.push(g.rotateY(phi).translate(r * Math.sin(phi), y, r * Math.cos(phi)));
    }
    const mz = -(bodyR(0.8) + 0.025);
    links.push(new THREE.CylinderGeometry(0.075, 0.075, 0.018, 20).rotateX(Math.PI / 2).translate(0, 0.79, mz));
    links.push(new THREE.TorusGeometry(0.02, 0.007, 6, 10).translate(0, 0.875, mz + 0.005));
    return wear([], links, 0.92);
  },

  epaulets: () => {
    // погоны на «плечах» — там, где пузико переходит в купол; наружный край ниже, бахрома по дуге края
    const Y = 0.99;
    const X = 0.5;
    const TILT = 0.3;
    const pad = (s: number) => col(new THREE.SphereGeometry(1, 16, 8).scale(0.15, 0.03, 0.11).rotateZ(-s * TILT).translate(s * X, Y, 0), 0x1f2c50);
    const fringe = (s: number): Geo[] => {
      const out: Geo[] = [];
      for (let k = 0; k < 9; k++) {
        const a = -1.2 + (k * 2.4) / 8;
        const u = 0.15 * Math.cos(a) * 0.92;
        out.push(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 5).translate(s * (X + u * Math.cos(TILT)), Y - u * Math.sin(TILT) - 0.04, 0.11 * Math.sin(a) * 0.92));
      }
      out.push(new THREE.SphereGeometry(0.022, 8, 6).translate(s * (X + 0.05), Y + 0.025, 0));
      return out;
    };
    return wear([pad(1), pad(-1)], [...fringe(1), ...fringe(-1)], Y);
  },
  // жилет рыболова, штормовка, китель, кукан и сачок — в outfitfish.ts
};

// очки — в системе лица: начало в центре между глазами (0, 1.17, −0.4)
const FACE: V3 = [0, 1.17, -0.4];

function face(parts: Geo[], metal: Geo[]): Wear {
  const shift = (g: Geo) => g.translate(-FACE[0], -FACE[1], -FACE[2]);
  return { geo: merge(parts.map(shift)), metal: merge(metal.map((g) => shift(bare(g)))), y: FACE[1] };
}

const EYEWEAR: Record<string, () => Wear> = {
  prism: () => {
    const lens = (side: number): Geo => colTri(new THREE.OctahedronGeometry(0.148).scale(1, 0.77, 0.32).translate(side * 0.145, 1.18, -0.49),
      (x, y) => y > 1.18 ? 0x9ceef4 : x * side > 0.145 ? 0x787bdb : 0xe8a0df);
    return face([
      lens(-1), lens(1),
      col(new THREE.BoxGeometry(0.48, 0.032, 0.028).translate(0, 1.282, -0.483), 0x293449),
      ...[-1, 1].map(s => col(new THREE.BoxGeometry(0.02, 0.025, 0.28).rotateY(s * 0.36).translate(s * 0.285, 1.24, -0.34), 0x293449)),
    ], [new THREE.BoxGeometry(0.08, 0.025, 0.025).translate(0, 1.19, -0.49)]);
  },
  glasses: () => {
    const c = 0x3a2a20;
    const frame = (s: number) => col(new THREE.TorusGeometry(0.105, 0.012, 6, 24).scale(1, 1.1, 1).translate(s * 0.13, 1.17, -0.478), c);
    const temple = (s: number) => col(new THREE.BoxGeometry(0.012, 0.012, 0.26).rotateY(s * 0.35).translate(s * 0.27, 1.18, -0.36), c);
    return face([frame(1), frame(-1), col(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 6).rotateZ(Math.PI / 2).translate(0, 1.2, -0.485), c), temple(1), temple(-1)], []);
  },
  shades: () => {
    const lens = (s: number) => col(new THREE.SphereGeometry(0.115, 16, 10).scale(1, 0.9, 0.22).translate(s * 0.13, 1.17, -0.482), 0x101114);
    const glint = (s: number) => col(new THREE.PlaneGeometry(0.05, 0.014).rotateZ(0.5).translate(s * 0.13 - 0.035, 1.205, -0.508), 0xffffff);
    const temple = (s: number) => col(new THREE.BoxGeometry(0.014, 0.014, 0.26).rotateY(s * 0.35).translate(s * 0.28, 1.2, -0.36), 0x101114);
    return face([lens(1), lens(-1), col(new THREE.BoxGeometry(0.44, 0.022, 0.02).translate(0, 1.255, -0.484), 0x101114), glint(1), glint(-1), temple(1), temple(-1)], []);
  },
  patch: () => face([
    col(new THREE.SphereGeometry(0.12, 14, 10).scale(1, 1.05, 0.25).translate(-0.13, 1.17, -0.478), 0x141416),
    col(bandOnBody((phi) => 1.25 + 0.1 * Math.sin(phi), 0.012, 0.012, 56), 0x141416),
  ], []),
  monocle: () => face([], [
    new THREE.TorusGeometry(0.1, 0.014, 8, 28).translate(0.13, 1.17, -0.482),
    tube([[0.13, 1.066, -0.482], [0.165, 0.95, -0.492], [0.245, 0.8, -0.463], [0.33, 0.68, -0.42]], 0.006, 20),
  ]),
  // очки рыболова (рыбацкий комплект): янтарные поляризационные стёкла, тёмно-зелёная оправа, шнурок за головой
  angler: () => {
    const fr = 0x1f3a2c;
    const lens = (s: number) => col(new THREE.SphereGeometry(0.115, 16, 10).scale(1, 0.85, 0.22).translate(s * 0.13, 1.17, -0.482), 0xe39b2d);
    const glint = (s: number) => col(new THREE.PlaneGeometry(0.05, 0.014).rotateZ(0.5).translate(s * 0.13 - 0.035, 1.2, -0.508), 0xfff6dc);
    const temple = (s: number) => col(new THREE.BoxGeometry(0.016, 0.016, 0.26).rotateY(s * 0.35).translate(s * 0.28, 1.2, -0.36), fr);
    return face([
      lens(1), lens(-1), glint(1), glint(-1), temple(1), temple(-1),
      col(new THREE.BoxGeometry(0.46, 0.026, 0.022).translate(0, 1.25, -0.484), fr),
      col(bandOnBody((phi) => 1.2 - 0.16 * Math.max(0, Math.cos(phi)), 0.01, 0.008, 56), 0x3f8a5a),
    ], []);
  },
};

const cache = new Map<string, Wear>();

/** Геометрия вещи (общая для всех желеек). Неизвестная или «пустая» — без мешей. */
export function wearOf(slot: 'h' | 'a' | 'e', key: string): Wear {
  const id = `${slot}:${key}`;
  let w = cache.get(id);
  if (!w) {
    const table = slot === 'h' ? HATS : slot === 'a' ? ACCS : EYEWEAR;
    w = Object.hasOwn(table, key) ? table[key]() : farmWearOf(slot, key) ?? NONE;
    cache.set(id, w);
  }
  return w;
}
