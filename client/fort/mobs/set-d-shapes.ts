// Набор D (боссы на суше) — общие заготовки: формы из примитивов с цветами вершин (тело вращения по профилю,
// валун, трубка с утончением), варенье (пятна и потёки — общая примета войска Барона), светящийся глаз и мелочи
// для поз. Только для моделей этого набора; договор моделей — kit.ts.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { colored, merge } from './kit.ts';

export type Geo = THREE.BufferGeometry;
export type V3 = readonly [number, number, number];

/** Варенье: тёмная ягода и блик */
export const JAM = 0x6e1a52;
export const JAM_HI = 0x9a2f74;
/** Светящиеся глаза войска — сиреневые */
export const EYE_GLOW = 0xd7a8ff;

const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------ числа

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Плавная ступенька: 0 до a, 1 после b */
export function smooth(a: number, b: number, v: number): number {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
}

export function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

/** Окно: растёт с a0 до a1, держится, спадает с b0 до b1 */
export function win(a0: number, a1: number, b0: number, b1: number, v: number): number {
  return smooth(a0, a1, v) * (1 - smooth(b0, b1, v));
}

/** Удар сердца: два толчка за период (0…1) */
export function heartbeat(t: number, period: number): number {
  const p = (((t / period) % 1) + 1) % 1;
  const a = Math.max(0, 1 - Math.abs(p - 0.07) / 0.07);
  const b = Math.max(0, 1 - Math.abs(p - 0.27) / 0.08) * 0.65;
  return Math.max(a * a * (3 - 2 * a), b * b * (3 - 2 * b));
}

/** Затухающая дрожь после толчка в момент 0 */
export function wobble(t: number, freq: number, decay: number): number {
  return t < 0 ? 0 : Math.exp(-decay * t) * Math.cos(freq * t);
}

/** Кусочно-линейная кривая по точкам [x, y] (x по возрастанию) — для расписаний замаха */
export function keys(v: number, pts: ReadonlyArray<readonly [number, number]>): number {
  if (v <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    if (v <= x1) {
      const [x0, y0] = pts[i - 1];
      const k = (v - x0) / (x1 - x0);
      return y0 + (y1 - y0) * k * k * (3 - 2 * k);
    }
  }
  return pts[pts.length - 1][1];
}

// ------------------------------------------------------------ цвет

/** Покрасить каждую вершину функцией от её положения (геометрия без индекса, с нормалями) */
export function paint(geo: Geo, fn: (x: number, y: number, z: number, c: THREE.Color) => void): Geo {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const p = g.getAttribute('position');
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    _c.setRGB(1, 1, 1);
    fn(p.getX(i), p.getY(i), p.getZ(i), _c);
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Переход цвета по высоте: стопы [y, цвет] по возрастанию y */
export function byHeight(geo: Geo, stops: ReadonlyArray<readonly [number, number]>): Geo {
  return paint(geo, (_x, y, _z, c) => mixStops(stops, y, c));
}

export function mixStops(stops: ReadonlyArray<readonly [number, number]>, v: number, c: THREE.Color): void {
  if (v <= stops[0][0]) {
    c.setHex(stops[0][1]);
    return;
  }
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const k = (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
      c.setHex(stops[i - 1][1]).lerp(_c2.setHex(stops[i][1]), k);
      return;
    }
  }
  c.setHex(stops[stops.length - 1][1]);
}

// ------------------------------------------------------------ формы

/** Тело вращения по точкам профиля (r, y) через сплайн; φ = 0 — вперёд (+Z) */
export function lathe(profile: ReadonlyArray<readonly [number, number]>, points: number, segs: number, phiStart = 0, phiLength = Math.PI * 2): Geo {
  const curve = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y)));
  return new THREE.LatheGeometry(curve.getPoints(points), segs, phiStart, phiLength);
}

/** Радиус профиля на высоте y (по тем же точкам сплайна, что и lathe) */
export function profileR(profile: ReadonlyArray<readonly [number, number]>, points: number): (y: number) => number {
  const pts = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(points);
  return (y: number) => {
    if (y <= pts[0].y) return pts[0].x;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (y <= b.y && b.y > a.y) return a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
    }
    return 0;
  };
}

/** Сфера с гладкими нормалями без шва (вершины склеены) — чтобы потом мять её форму */
export function smoothSphere(detail: number): Geo {
  const g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return mergeVertices(g);
}

/** Неровность валуна по направлению — сумма медленных волн (−1…1 примерно) */
export function lump(x: number, y: number, z: number, s: number): number {
  return 0.5 * Math.sin(2.3 * x + 1.7 * s) * Math.cos(2.1 * y + 0.9 * s)
    + 0.32 * Math.sin(3.7 * z + 2.9 * s + 1.3 * x)
    + 0.22 * Math.cos(4.9 * y - 3.1 * x + s);
}

/** Валун: сплюснутая сфера с бугристостью, гладкие нормали; центр в нуле */
export function boulder(rx: number, ry: number, rz: number, seed: number, bump = 0.14, detail = 2): Geo {
  const g = smoothSphere(detail);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + bump * lump(x, y, z, seed);
    p.setXYZ(i, x * rx * k, y * ry * k, z * rz * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Клуб пара: бугристый комок (и комочек сбоку-сверху), белый сверху, сиреневато-серый снизу; центр — at */
export function steamPuff(r: number, at: V3, seed: number, blobs = 2): Geo {
  const parts: Geo[] = [];
  for (let i = 0; i < blobs; i++) {
    const k = i === 0 ? 1 : 0.66;
    const g = boulder(r * k, r * k * 0.88, r * k, seed * 2.3 + i * 3.1, 0.22, 1);
    if (i > 0) g.translate(r * 0.55 * (i % 2 ? 1 : -1) * (seed % 2 < 1 ? 1 : -1), r * 0.4, -r * 0.1);
    const cy = i > 0 ? r * 0.4 : 0;
    parts.push(paint(g, (_x, y, _z, c) => c.setHex(y < cy - r * k * 0.35 ? 0xdcd6e8 : 0xfbfaff)));
  }
  const g = parts.length > 1 ? merge(parts) : parts[0];
  return g.translate(at[0], at[1], at[2]);
}

/** Трубка по точкам (гладкий сплайн) с радиусом от доли длины u; концы открыты */
export function tube(pts: ReadonlyArray<V3>, radius: (u: number) => number, segs: number, radial: number): Geo {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [];
  const idx: number[] = [];
  const P = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    curve.getPointAt(u, P);
    const r = radius(u);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * Math.PI * 2;
      const s = Math.sin(v);
      const c = -Math.cos(v);
      pos.push(P.x + r * (c * N.x + s * B.x), P.y + r * (c * N.y + s * B.y), P.z + r * (c * N.z + s * B.z));
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = (i + 1) * (radial + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Повернуть кусок так, чтобы его ось +Y смотрела вдоль dir, повернуть вокруг неё на spin и поставить в точку */
export function orient(g: Geo, at: V3, dir: V3, spin = 0): Geo {
  if (spin) g.rotateY(spin);
  _v.set(dir[0], dir[1], dir[2]).normalize();
  _q.setFromUnitVectors(UP, _v);
  g.applyQuaternion(_q);
  g.translate(at[0], at[1], at[2]);
  return g;
}

/** Сфера одним цветом (удобная запись) */
export function ball(r: number, hex: number, at: V3, scale: V3 = [1, 1, 1], w = 10, h = 7): Geo {
  return colored(new THREE.SphereGeometry(r, w, h).scale(scale[0], scale[1], scale[2]).translate(at[0], at[1], at[2]), hex);
}

// ------------------------------------------------------------ варенье

/** Пятно варенья: приплюснутая капля, лежит на поверхности (ось +Y — наружу) */
export function jamSpot(r: number, at: V3, normal: V3, spin = 0): Geo {
  const g = new THREE.SphereGeometry(r, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 0.32, 0.8);
  g.translate(0, -r * 0.12, 0);
  return orient(paint(g, (_x, y, _z, c) => c.setHex(y > r * 0.12 ? JAM_HI : JAM)), at, normal, spin);
}

/** Потёк варенья: тянется вниз от точки крепления (0) на len, внизу капля радиуса r */
export function jamDrip(len: number, r: number): Geo {
  const stem = new THREE.CylinderGeometry(r * 0.55, r * 0.8, len, 6, 1, true).translate(0, -len / 2, 0);
  const drop = new THREE.SphereGeometry(r, 6, 4).scale(1, 1.25, 1).translate(0, -len - r * 0.4, 0);
  return merge([colored(stem, JAM), colored(drop, JAM_HI)]);
}

/** Светящийся глаз: выпуклый овал, смотрит вдоль +Z */
export function glowEye(rx: number, ry: number, depth: number, at: V3, hex = EYE_GLOW): Geo {
  return colored(new THREE.SphereGeometry(1, 12, 8).scale(rx, ry, depth).translate(at[0], at[1], at[2]), hex);
}

// ------------------------------------------------------------ позы

const _m = new THREE.Matrix4();

/** out = parent × (перенос, поворот YXZ, масштаб) — дочерняя кость без выделений памяти */
export function attach(out: THREE.Matrix4, parent: THREE.Matrix4, x: number, y: number, z: number, rx: number, ry: number, rz: number,
  sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  composeInto(_m, x, y, z, rx, ry, rz, sx, sy, sz);
  return out.multiplyMatrices(parent, _m);
}

const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _qq = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Матрица из переноса, поворота (YXZ) и масштаба по осям */
export function composeInto(m: THREE.Matrix4, x: number, y: number, z: number, rx: number, ry: number, rz: number,
  sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  _e.set(rx, ry, rz, 'YXZ');
  _qq.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return m.compose(_p, _qq, _s);
}

/** Почти ноль для масштаба спрятанной части (ровно 0 даёт вырожденную матрицу нормалей) */
export const HIDE = 0.001;
