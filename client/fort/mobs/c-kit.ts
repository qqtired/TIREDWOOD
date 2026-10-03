// Помощники набора C (mobs-c): раскраска кусков по точке (пятна варенья, полосы), капли, светящиеся глаза, шаг без
// скольжения, мигание, привязка кости к кости и общий масштаб особи. Договор моделей — kit.ts (его не меняем);
// здесь только то, что нужно моделям этого набора: плевальщику, подрывнику, лекарю и броненосцу.
import * as THREE from 'three';
import { setBone, setBoneS, type BoneName, type MobPose } from './kit.ts';

/** Общая примета войска Барона Варенья: фиолетовые пятна и капли варенья, светящиеся сиреневые глаза */
export const JAM = 0x7a2690;
export const JAM_DARK = 0x521860;
export const JAM_LIGHT = 0xa547c0;
export const EYE = 0xa64dff;
export const PUPIL = 0x251030;

export type Paint = (x: number, y: number, z: number) => number;
export type Vec3 = readonly [number, number, number];
/** Пятно варенья: шар (x, y, z, радиус) в осях куска */
export type Spot = readonly [number, number, number, number];

const _c = new THREE.Color();

function writeColors(g: THREE.BufferGeometry, color: (i: number) => number): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    _c.set(color(i));
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}

/** Покрасить по вершинам: цвет вершины — fn(её точка). Края пятен мягкие (цвет плывёт по грани). */
export function paint(geo: THREE.BufferGeometry, fn: Paint | number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (typeof fn === 'number') return writeColors(g, () => fn);
  const p = g.getAttribute('position');
  return writeColors(g, (i) => fn(p.getX(i), p.getY(i), p.getZ(i)));
}

/** Покрасить по граням: цвет треугольника — fn(центр грани). Чёткие полосы и швы. */
export function paintFaces(geo: THREE.BufferGeometry, fn: Paint): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.getAttribute('position');
  const faceColor: number[] = [];
  for (let f = 0; f < p.count / 3; f++) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let k = 0; k < 3; k++) {
      x += p.getX(f * 3 + k);
      y += p.getY(f * 3 + k);
      z += p.getZ(f * 3 + k);
    }
    faceColor.push(fn(x / 3, y / 3, z / 3));
  }
  return writeColors(g, (i) => faceColor[Math.floor(i / 3)]);
}

/** Цвет с пятнами варенья: точка внутри любого пятна — варенье, иначе base */
export function spotted(base: Paint | number, spots: readonly Spot[], jam = JAM): Paint {
  const b: Paint = typeof base === 'number' ? () => base : base;
  return (x, y, z) => {
    for (const [sx, sy, sz, r] of spots) if ((x - sx) ** 2 + (y - sy) ** 2 + (z - sz) ** 2 < r * r) return jam;
    return b(x, y, z);
  };
}

/** Смешать два цвета (0 — a, 1 — b) */
export function mix(a: number, b: number, t: number): number {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - u) + ((b >> s) & 255) * u);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Эллипсоид из сферы */
export function ellipsoid(rx: number, ry: number, rz: number, w = 12, h = 8): THREE.BufferGeometry {
  return new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz);
}

/** Тело вращения по профилю [радиус, высота] вокруг оси Y */
export function lathe(profile: ReadonlyArray<readonly [number, number]>, segments: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _rot = new THREE.Quaternion();

/** Конус-палка от a до b: радиус r0 у a и r1 у b (лапы, стебельки, хвосты) */
export function limb(a: Vec3, b: Vec3, r0: number, r1: number, seg = 7, caps = true): THREE.BufferGeometry {
  _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, !caps).translate(0, len / 2, 0);
  _rot.setFromUnitVectors(_up, _dir.normalize());
  return g.applyQuaternion(_rot).translate(a[0], a[1], a[2]);
}

/** Капля варенья: круглая снизу, острая сверху (висит вниз) */
export function drop(r: number, x: number, y: number, z: number, color = JAM): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 7, 5);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const v = p.getY(i) / r;
    if (v > 0) {
      const k = 1 - 0.75 * v;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * 1.9, p.getZ(i) * k);
    }
  }
  g.computeVertexNormals();
  return paint(g.translate(x, y, z), color);
}

const _z = new THREE.Vector3(0, 0, 1);
const _n = new THREE.Vector3();

/** Шлепок варенья: приплюснутая капля, лежит на поверхности в точке p по нормали n (чуть утоплена), с бликом */
export function splat(p: Vec3, n: Vec3, r: number, color = JAM): THREE.BufferGeometry {
  const g = paint(ellipsoid(r, r * 0.82, r * 0.24, 8, 4), (x, y, z) => (z > r * 0.1 && y > r * 0.15 ? JAM_LIGHT : color));
  _n.set(n[0], n[1], n[2]).normalize();
  _rot.setFromUnitVectors(_z, _n);
  return g.applyQuaternion(_rot).translate(p[0] - _n.x * r * 0.08, p[1] - _n.y * r * 0.08, p[2] - _n.z * r * 0.08);
}

/** Светящиеся глаза: шары цвета EYE (отдельная часть с glow) */
export function eyeBalls(pts: readonly Vec3[], r: number, sy = 1, sz = 0.8, color = EYE): THREE.BufferGeometry[] {
  return pts.map(([x, y, z]) => paint(ellipsoid(r, r * sy, r * sz, 8, 6).translate(x, y, z), color));
}

/** Зрачки — тёмные плоские кружки на передней стороне глаз (смотрят по +Z); в обычной, не светящейся части */
export function pupils(pts: readonly Vec3[], r: number, color = PUPIL): THREE.BufferGeometry[] {
  return pts.map(([x, y, z]) => paint(ellipsoid(r, r * 1.15, r * 0.35, 6, 4).translate(x, y, z), color));
}

// ------------------------------------------------------------ движение

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Плавный порог: 0 до a, 1 после b */
export function smooth(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
/** Пружинка после толчка: затухающее колебание (t — секунд с толчка) */
export function spring(t: number, freq: number, damp: number): number {
  return t < 0 ? 0 : Math.exp(-t * damp) * Math.sin(t * freq);
}
/** Постоянное для особи случайное 0…1 (k — номер признака) */
export function rnd(seed: number, k: number): number {
  const v = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453;
  return v - Math.floor(v);
}
/** Мигание 0…1 (1 — глаз закрыт): раз в 3–5 с, у каждой особи в своё время */
export function blink(t: number, seed: number): number {
  const T = 3 + seed * 2.2;
  const ph = (((t + seed * 13.7) % T) + T) % T;
  return ph < 0.16 ? Math.sin((ph / 0.16) * Math.PI) : 0;
}

export interface Step {
  /** Смещение ступни от бедра вдоль хода (м), подъём (м), стоит ли на земле */
  z: number;
  lift: number;
  stance: boolean;
}

/**
 * Ступня без скольжения. p — фаза этой ноги (любое число, берём дробную часть), stride — путь корня за полный цикл
 * фазы (м), duty — доля опоры. В опоре ступня стоит в мире: относительно корня едет назад ровно с его путём. В переносе
 * — вперёд с подъёмом lift.
 */
export function step(p: number, stride: number, duty: number, lift: number, out: Step): Step {
  const q = p - Math.floor(p);
  const half = (stride * duty) / 2;
  if (q < duty) {
    out.z = half - (q / duty) * 2 * half;
    out.lift = 0;
    out.stance = true;
  } else {
    const u = (q - duty) / (1 - duty);
    out.z = -half + u * u * (3 - 2 * u) * 2 * half;
    out.lift = lift * Math.sin(Math.PI * u);
    out.stance = false;
  }
  return out;
}

const _loc = new THREE.Matrix4();
const _root = new THREE.Matrix4();

/** Кость от кости: out = parent × (перенос, поворот YXZ, масштаб) — без выделений памяти */
export function attach(out: THREE.Matrix4, parent: THREE.Matrix4, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1): THREE.Matrix4 {
  setBone(_loc, x, y, z, rx, ry, rz, s);
  return out.multiplyMatrices(parent, _loc);
}

/** То же с разным масштабом по осям */
export function attachS(out: THREE.Matrix4, parent: THREE.Matrix4, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number): THREE.Matrix4 {
  setBoneS(_loc, x, y, z, rx, ry, rz, sx, sy, sz);
  return out.multiplyMatrices(parent, _loc);
}

/** Рост особи (масштаб от ног) и уход в землю: перечисленные кости умножаются слева, одна матрица на всех */
export function finish(out: MobPose, bones: readonly BoneName[], scale: number, sinkY = 0): void {
  _root.makeScale(scale, scale, scale);
  _root.setPosition(0, sinkY, 0);
  for (const b of bones) out[b].premultiply(_root);
}

/** Треугольников в геометрии (для бюджета) */
export function triangles(g: THREE.BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}
