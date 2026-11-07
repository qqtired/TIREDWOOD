// «Город вверх»: набор предметов трассы. Каждая функция рисует узнаваемую вещь ровно в физический бокс опоры
// (верх бокса — то, на чём стоят ноги), детали снаружи — только ниже верха и не дальше пары сантиметров от бокса.
// Всё — в общий Batch (склейка по материалу), цвета — в вершинах.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SkillBox } from '../../../shared/skillmap.ts';
import { Batch } from '../look.ts';

export type Box = SkillBox;
type V3 = [number, number, number];

/** Палитра «города вверх»: тёплое дерево, терракота, крем, красно-белые и оранжево-белые полосы. Синего с жёлтым нет. */
export const K = {
  wood: 0xc99a62,
  woodLight: 0xe2bd86,
  woodDark: 0x8a5a33,
  woodGrey: 0xb3a38a,
  terracotta: 0xc0643f,
  tile: 0xb8553a,
  cream: 0xf3e6c8,
  ochre: 0xe6b86e,
  pink: 0xeaa595,
  mint: 0xa9d6c0,
  peach: 0xf2c6a0,
  white: 0xf8f4ea,
  red: 0xd9412f,
  orange: 0xee7d2c,
  green: 0x3f8c5c,
  teal: 0x2f8f86,
  maroon: 0x8e3a2e,
  steel: 0x7d8790,
  steelDark: 0x4c535a,
  rust: 0xa9492f,
  rope: 0xcdb88d,
  wicker: 0xb07c45,
  glass: 0x6f9db5,
  glassDark: 0x3d5a6b,
  tar: 0x5d5853,
  concrete: 0xbdb6a9,
  gold: 0xe0aa3c,
  shutterGreen: 0x4d8c63,
} as const;

export const WALLS = [K.cream, K.peach, K.pink, K.ochre, K.mint, K.white, 0xf0d2a6, 0xe7b9a0] as const;
export const CONTAINERS = [K.red, K.terracotta, K.green, K.teal, K.cream, K.orange, K.maroon] as const;

const up = new THREE.Vector3(0, 1, 0);
const W = (x: Box): number => x.x1 - x.x0;
const D = (x: Box): number => x.z1 - x.z0;
const H = (x: Box): number => x.y1 - x.y0;
const cx = (x: Box): number => (x.x0 + x.x1) / 2;
const cz = (x: Box): number => (x.z0 + x.z1) / 2;

/** Псевдослучай от числа: одно и то же у всех игроков. */
export function hash(n: number): number {
  let t = (n * 0x9e3779b1) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const pick = <T>(list: readonly T[], n: number): T => list[Math.floor(hash(n) * list.length) % list.length];

/** Конус-трапеция: низ сужен на kx/kz (корпус лодки, корзина, бак). */
function taper(w: number, h: number, d: number, kx: number, kz: number, bow = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < 0) {
      let x = p.getX(i) * kx;
      if (bow && x > 0) x -= bow;
      p.setXYZ(i, x, p.getY(i), p.getZ(i) * kz);
    }
  }
  g.computeVertexNormals();
  return g;
}

function tri(a: V3, b: V3, c: V3): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...b], 3));
  g.computeVertexNormals();
  return g;
}

/** Цилиндр от a до b (как Batch.beam), но с разными радиусами. */
export function rod(b: Batch, key: Parameters<Batch['add']>[0], color: number, a: V3, c: V3, r: number, seg = 6): void {
  b.beam(key, color, a, c, r, seg);
}

/** Стойка-труба от a до c без торцов (дешевле балки): решётки, ноги, канаты. */
export function strut(b: Batch, key: Parameters<Batch['add']>[0], color: number, a: V3, c: V3, r: number, seg = 4): void {
  const va = new THREE.Vector3(...a), vc = new THREE.Vector3(...c);
  const len = va.distanceTo(vc);
  if (len < 1e-4) return;
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, vc.clone().sub(va).normalize()));
  g.translate((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2);
  b.add(key, g, color);
}

/** Тонкий канат/провод с провисом от a до c: n отрезков. */
export function rope(b: Batch, color: number, a: V3, c: V3, sag: number, r = 0.035, n = 6): void {
  let prev: V3 = a;
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const p: V3 = [a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k - Math.sin(k * Math.PI) * sag, a[2] + (c[2] - a[2]) * k];
    strut(b, 'metal', color, prev, p, r, 3);
    prev = p;
  }
}

// ---------------------------------------------------------------- порт

/** Ящик из досок: крышка из досок, угловые рейки, пояса и раскос на каждой стороне. */
export function crate(b: Batch, x: Box, n: number): void {
  const tint = pick([K.wood, K.woodLight, 0xd2a46c, 0xc08f58], n);
  b.span('wood', tint, x.x0 + 0.03, x.y0, x.z0 + 0.03, x.x1 - 0.03, x.y1 - 0.06, x.z1 - 0.03);
  // крышка: доски поперёк, со щелями
  const along = W(x) >= D(x);
  const len = along ? W(x) : D(x), wide = along ? D(x) : W(x);
  const k = Math.max(2, Math.round(len / 0.32));
  for (let i = 0; i < k; i++) {
    const a = -len / 2 + (len / k) * i + 0.012, c = a + len / k - 0.024;
    if (along) b.span('wood', i % 2 ? tint : K.woodLight, cx(x) + a, x.y1 - 0.07, x.z0, cx(x) + c, x.y1, x.z1);
    else b.span('wood', i % 2 ? tint : K.woodLight, x.x0, x.y1 - 0.07, cz(x) + a, x.x1, x.y1, cz(x) + c);
  }
  void wide;
  const e = 0.11, o = 0.025, dark = K.woodDark;
  for (const [px, pz] of [[x.x0, x.z0], [x.x1, x.z0], [x.x0, x.z1], [x.x1, x.z1]]) {
    b.span('wood', dark, px - (px === x.x0 ? o : e - o), x.y0, pz - (pz === x.z0 ? o : e - o), px + (px === x.x0 ? e - o : o), x.y1 - 0.075, pz + (pz === x.z0 ? e - o : o));
  }
  // пояса сверху и снизу на четырёх сторонах
  for (const y of [x.y0 + 0.05, x.y1 - 0.16]) {
    b.span('wood', dark, x.x0 - o, y, x.z0 - o, x.x1 + o, y + 0.1, x.z0 + 0.02);
    b.span('wood', dark, x.x0 - o, y, x.z1 - 0.02, x.x1 + o, y + 0.1, x.z1 + o);
    b.span('wood', dark, x.x0 - o, y, x.z0, x.x0 + 0.02, y + 0.1, x.z1);
    b.span('wood', dark, x.x1 - 0.02, y, x.z0, x.x1 + o, y + 0.1, x.z1);
  }
  // раскос по длинным сторонам
  if (H(x) > 0.6) {
    const y0 = x.y0 + 0.15, y1 = x.y1 - 0.2;
    if (along) for (const z of [x.z0 - 0.02, x.z1 + 0.02]) b.beam('wood', dark, [x.x0 + 0.1, y0, z], [x.x1 - 0.1, y1, z], 0.04, 4);
    else for (const xx of [x.x0 - 0.02, x.x1 + 0.02]) b.beam('wood', dark, [xx, y0, x.z0 + 0.1], [xx, y1, x.z1 - 0.1], 0.04, 4);
  }
}

/** Бочка: пузатая клёпка, три обруча, тёмная крышка. Бокс → круг по меньшей стороне. */
export function barrel(b: Batch, x: Box, n: number): void {
  const r = Math.min(W(x), D(x)) / 2, h = H(x), y = x.y0, X = cx(x), Z = cz(x);
  const col = pick([0xb7773f, 0xa86a39, 0xc58a4f, K.red], n);
  const lo = new THREE.CylinderGeometry(r, r * 0.86, h / 2, 16);
  lo.translate(X, y + h / 4, Z);
  b.add('wood', lo, col);
  const hi = new THREE.CylinderGeometry(r * 0.88, r, h / 2 - 0.02, 16);
  hi.translate(X, y + h * 0.75 - 0.01, Z);
  b.add('wood', hi, col);
  b.cyl('wood', K.woodDark, X, x.y1 - 0.015, Z, r * 0.86, 0.03, 16);
  for (const k of [0.12, 0.5, 0.88]) {
    const rr = k === 0.5 ? r + 0.02 : r * 0.92 + 0.02;
    b.cyl('metal', K.steelDark, X, y + h * k, Z, rr, 0.07, 16);
  }
}

/** Морской контейнер: гофра на длинных сторонах, рамы, угловые фитинги, двери с запорными штангами на торце. */
export function container(b: Batch, x: Box, n: number, color?: number): void {
  const col = color ?? pick(CONTAINERS, n);
  const dark = new THREE.Color(col).multiplyScalar(0.72).getHex();
  const along = W(x) >= D(x);
  const L = along ? W(x) : D(x), S = along ? D(x) : W(x);
  // локальные оси: u — вдоль, v — поперёк; в мире — x или z
  const put = (key: 'paint' | 'metal', c: number, u0: number, y0: number, v0: number, u1: number, y1: number, v1: number): void => {
    if (along) b.span(key, c, cx(x) + u0, y0, cz(x) + v0, cx(x) + u1, y1, cz(x) + v1);
    else b.span(key, c, cx(x) + v0, y0, cz(x) + u0, cx(x) + v1, y1, cz(x) + u1);
  };
  const hu = L / 2, hv = S / 2, y0 = x.y0, y1 = x.y1;
  put('paint', col, -hu + 0.06, y0 + 0.12, -hv + 0.04, hu - 0.06, y1 - 0.02, hv - 0.04);
  // крыша чуть светлее — читается, где стоять
  put('paint', new THREE.Color(col).lerp(new THREE.Color(0xffffff), 0.12).getHex(), -hu + 0.02, y1 - 0.05, -hv + 0.02, hu - 0.02, y1, hv - 0.02);
  // рама: нижние и верхние продольные балки, угловые стойки
  for (const v of [-1, 1]) {
    put('paint', dark, -hu, y0, v < 0 ? -hv : hv - 0.1, hu, y0 + 0.16, v < 0 ? -hv + 0.1 : hv);
    put('paint', dark, -hu, y1 - 0.14, v < 0 ? -hv : hv - 0.1, hu, y1 - 0.03, v < 0 ? -hv + 0.1 : hv);
  }
  for (const u of [-1, 1]) for (const v of [-1, 1]) {
    put('paint', dark, u < 0 ? -hu : hu - 0.14, y0, v < 0 ? -hv : hv - 0.14, u < 0 ? -hu + 0.14 : hu, y1 - 0.03, v < 0 ? -hv + 0.14 : hv);
    put('metal', K.steelDark, u < 0 ? -hu - 0.01 : hu - 0.17, y0 - 0.01, v < 0 ? -hv - 0.01 : hv - 0.17, u < 0 ? -hu + 0.17 : hu + 0.01, y0 + 0.13, v < 0 ? -hv + 0.17 : hv + 0.01);
  }
  // гофра на длинных сторонах
  const ribs = Math.max(3, Math.floor((L - 0.4) / 0.38));
  for (let i = 0; i < ribs; i++) {
    const u = -hu + 0.25 + ((L - 0.5) / (ribs - 1)) * i;
    for (const v of [-1, 1]) put('paint', i % 2 ? col : dark, u - 0.06, y0 + 0.16, v < 0 ? -hv - 0.02 : hv - 0.02, u + 0.06, y1 - 0.14, v < 0 ? -hv + 0.02 : hv + 0.02);
  }
  // торцы: на одном двери (две створки, четыре запорные штанги), на другом гофра
  const doorU = (n % 2 ? 1 : -1) * hu;
  const out = doorU > 0 ? 1 : -1;
  for (const v of [-hv * 0.5, hv * 0.5]) {
    for (const s of [-0.22, 0.22]) {
      const uu = doorU + out * 0.03, vv = v + s * hv * 0.6;
      if (along) b.beam('metal', K.steel, [cx(x) + uu, y0 + 0.2, cz(x) + vv], [cx(x) + uu, y1 - 0.18, cz(x) + vv], 0.03, 5);
      else b.beam('metal', K.steel, [cx(x) + vv, y0 + 0.2, cz(x) + uu], [cx(x) + vv, y1 - 0.18, cz(x) + uu], 0.03, 5);
    }
  }
  put('paint', dark, doorU - 0.02, y0 + 0.16, -0.02, doorU + out * 0.02 + (out < 0 ? 0.04 : 0), y1 - 0.14, 0.02);
  const back = -doorU;
  for (let i = 0; i < Math.max(2, Math.floor(S / 0.42)); i++) {
    const v = -hv + 0.25 + ((S - 0.5) / Math.max(1, Math.floor(S / 0.42) - 1)) * i;
    put('paint', dark, back - 0.02, y0 + 0.16, v - 0.05, back + 0.02, y1 - 0.14, v + 0.05);
  }
}

/** Палуба лодки (подвижная): верх — палуба, борта и корпус уходят вниз, нос поднят, по борту — красная полоса и круг. */
export function boat(b: Batch, w: number, d: number, h: number, n: number): void {
  const along = w >= d;
  const L = along ? w : d, S = along ? d : w;
  const hullH = Math.max(1.1, h + 0.7);
  const g = taper(L, hullH, S, 0.78, 0.55, 0.3);
  g.translate(0, -hullH / 2 - 0.02, 0);
  if (!along) g.rotateY(Math.PI / 2);
  b.add('paint', g, n % 2 ? K.white : K.cream);
  const stripe = taper(L + 0.02, 0.16, S + 0.02, 0.99, 0.99);
  stripe.translate(0, -0.2, 0);
  if (!along) stripe.rotateY(Math.PI / 2);
  b.add('paint', stripe, n % 2 ? K.red : K.green);
  const keel = taper(L * 0.8, 0.26, S * 0.44, 0.7, 0.4);
  keel.translate(-0.15, -hullH - 0.1, 0);
  if (!along) keel.rotateY(Math.PI / 2);
  b.add('paint', keel, K.maroon);
  // палуба — доски
  const deck = new THREE.BoxGeometry(along ? w - 0.08 : w - 0.08, 0.06, along ? d - 0.08 : d - 0.08);
  deck.translate(0, -0.03, 0);
  b.add('wood', deck, K.woodLight);
  // планширь — тонкая рамка ниже палубы
  const e = 0.07;
  b.span('wood', K.woodDark, -w / 2, -0.12, -d / 2, w / 2, -0.04, -d / 2 + e);
  b.span('wood', K.woodDark, -w / 2, -0.12, d / 2 - e, w / 2, -0.04, d / 2);
  b.span('wood', K.woodDark, -w / 2, -0.12, -d / 2, -w / 2 + e, -0.04, d / 2);
  b.span('wood', K.woodDark, w / 2 - e, -0.12, -d / 2, w / 2, -0.04, d / 2);
  // спасательный круг на борту
  const ring = new THREE.TorusGeometry(0.28, 0.08, 6, 12);
  if (along) ring.translate(0, -0.55, d / 2 + 0.06);
  else { ring.rotateY(Math.PI / 2); ring.translate(w / 2 + 0.06, -0.55, 0); }
  b.add('paint', ring, K.red);
  // кнехты по углам — ниже палубы, на кромке
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('metal', K.steelDark, sx * (w / 2 - 0.2), -0.25, sz * (d / 2 + 0.03), 0.05, 0.3, 6);
}

/** Двутавр вдоль длинной стороны: верхняя и нижняя полки, стенка. */
export function girder(b: Batch, x: Box, color: number = K.rust): void {
  const along = W(x) >= D(x);
  const f = Math.min(0.12, H(x) * 0.18);
  b.span('metal', color, x.x0, x.y1 - f, x.z0, x.x1, x.y1, x.z1);
  b.span('metal', color, x.x0, x.y0, x.z0, x.x1, x.y0 + f, x.z1);
  const t = Math.min(0.08, (along ? D(x) : W(x)) * 0.2);
  if (along) b.span('metal', new THREE.Color(color).multiplyScalar(0.8).getHex(), x.x0, x.y0 + f, cz(x) - t, x.x1, x.y1 - f, cz(x) + t);
  else b.span('metal', new THREE.Color(color).multiplyScalar(0.8).getHex(), cx(x) - t, x.y0 + f, x.z0, cx(x) + t, x.y1 - f, x.z1);
  // заклёпки-пластины через 1,2 м
  const len = along ? W(x) : D(x);
  for (let s = 0.6; s < len - 0.3; s += 1.2) {
    if (along) b.span('metal', K.steelDark, x.x0 + s - 0.06, x.y0 + f, cz(x) - t - 0.02, x.x0 + s + 0.06, x.y1 - f, cz(x) + t + 0.02);
    else b.span('metal', K.steelDark, cx(x) - t - 0.02, x.y0 + f, x.z0 + s - 0.06, cx(x) + t + 0.02, x.y1 - f, x.z0 + s + 0.06);
  }
}

/** Решётчатая ферма-мачта: 4 стойки, пояса и раскосы зигзагом. step — шаг пояса, м. */
export function lattice(b: Batch, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, color: number, r = 0.07, step = 1.8, alt?: number): void {
  const cs: V3[] = [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]];
  for (const c of cs) strut(b, 'metal', color, [c[0], y0, c[2]], [c[0], y1, c[2]], r * 1.3, 5);
  const n = Math.max(1, Math.round((y1 - y0) / step)), s = (y1 - y0) / n;
  for (let i = 0; i <= n; i++) {
    const y = y0 + s * i;
    const c2 = alt !== undefined && i % 2 ? alt : color;
    for (let k = 0; k < 4; k++) {
      const a = cs[k], c = cs[(k + 1) % 4];
      strut(b, 'metal', c2, [a[0], y, a[2]], [c[0], y, c[2]], r * 0.8, 3);
      if (i < n) strut(b, 'metal', c2, [(i + k) % 2 ? a[0] : c[0], y, (i + k) % 2 ? a[2] : c[2]], [(i + k) % 2 ? c[0] : a[0], y + s, (i + k) % 2 ? c[2] : a[2]], r * 0.65, 3);
    }
  }
}

/** Стрела крана: дорожка-настил сверху (решётка), два верхних пояса, нижний пояс посередине, раскосы. */
export function jib(b: Batch, x: Box, color: number = K.orange): void {
  const along = W(x) >= D(x);
  const L = along ? W(x) : D(x), S = along ? D(x) : W(x);
  const depth = Math.max(1.0, Math.min(2.2, S * 1.4));
  const P = (u: number, y: number, v: number): V3 => (along ? [cx(x) + u, y, cz(x) + v] : [cx(x) + v, y, cz(x) + u]);
  const top = x.y1;
  // настил-решётка
  if (along) b.span('metal', K.steelDark, x.x0, top - 0.06, x.z0, x.x1, top, x.z1);
  else b.span('metal', K.steelDark, x.x0, top - 0.06, x.z0, x.x1, top, x.z1);
  const hv = S / 2;
  for (const v of [-hv, hv]) b.beam('metal', color, P(-L / 2, top - 0.12, v), P(L / 2, top - 0.12, v), 0.08, 6);
  const bot = top - depth;
  b.beam('metal', color, P(-L / 2, bot, 0), P(L / 2, bot, 0), 0.09, 6);
  const n = Math.max(2, Math.round(L / 1.6)), s = L / n;
  for (let i = 0; i <= n; i++) {
    const u = -L / 2 + s * i;
    const c = i % 2 ? K.white : color;
    b.beam('metal', c, P(u, top - 0.12, -hv), P(u, top - 0.12, hv), 0.045, 4);
    if (i < n) for (const v of [-hv, hv]) b.beam('metal', c, P(u, top - 0.12, v), P(u + s / 2, bot, 0), 0.05, 4), b.beam('metal', c, P(u + s / 2, bot, 0), P(u + s, top - 0.12, v), 0.05, 4);
  }
}

/** Кабина крана: корпус, остекление с двух сторон, крыша — площадка. */
export function cab(b: Batch, x: Box, color: number = K.orange): void {
  b.span('paint', color, x.x0 + 0.04, x.y0, x.z0 + 0.04, x.x1 - 0.04, x.y1 - 0.08, x.z1 - 0.04);
  b.span('paint', K.white, x.x0, x.y1 - 0.1, x.z0, x.x1, x.y1, x.z1);
  const gy0 = x.y0 + H(x) * 0.35, gy1 = x.y1 - 0.25;
  if (gy1 - gy0 > 0.3) {
    b.span('glass', K.glass, x.x0 + 0.15, gy0, x.z0 + 0.01, x.x1 - 0.15, gy1, x.z0 + 0.06);
    b.span('glass', K.glass, x.x0 + 0.15, gy0, x.z1 - 0.06, x.x1 - 0.15, gy1, x.z1 - 0.01);
    b.span('glass', K.glass, x.x0 + 0.01, gy0, x.z0 + 0.15, x.x0 + 0.06, gy1, x.z1 - 0.15);
  }
  b.span('paint', K.red, x.x0 + 0.02, x.y0 + 0.1, x.z0 + 0.02, x.x1 - 0.02, x.y0 + 0.28, x.z1 - 0.02);
}

/** Перекладина (стальная труба квадратного сечения), с тёмными торцами. */
export function rung(b: Batch, x: Box, color: number = K.orange): void {
  b.span('metal', color, x.x0, x.y0, x.z0, x.x1, x.y1, x.z1);
  const along = W(x) >= D(x), e = 0.08;
  if (along) { b.span('metal', K.steelDark, x.x0 - 0.01, x.y0 - 0.01, x.z0 - 0.01, x.x0 + e, x.y1 - 0.02, x.z1 + 0.01); b.span('metal', K.steelDark, x.x1 - e, x.y0 - 0.01, x.z0 - 0.01, x.x1 + 0.01, x.y1 - 0.02, x.z1 + 0.01); }
  else { b.span('metal', K.steelDark, x.x0 - 0.01, x.y0 - 0.01, x.z0 - 0.01, x.x1 + 0.01, x.y1 - 0.02, x.z0 + e); b.span('metal', K.steelDark, x.x0 - 0.01, x.y0 - 0.01, x.z1 - e, x.x1 + 0.01, x.y1 - 0.02, x.z1 + 0.01); }
}

/** Узкий трап с канатными леерами по бокам (ниже ног) и поперечными планками. */
export function gangway(b: Batch, x: Box): void {
  const along = W(x) >= D(x);
  b.span('wood', K.woodDark, x.x0 + 0.03, x.y0, x.z0 + 0.03, x.x1 - 0.03, x.y1 - 0.06, x.z1 - 0.03);
  const len = along ? W(x) : D(x), n = Math.max(2, Math.round(len / 0.28));
  for (let i = 0; i < n; i++) {
    const a = (len / n) * i + 0.015, c = a + len / n - 0.03;
    if (along) b.span('wood', i % 3 ? K.woodLight : K.wood, x.x0 + a, x.y1 - 0.06, x.z0, x.x0 + c, x.y1, x.z1);
    else b.span('wood', i % 3 ? K.woodLight : K.wood, x.x0, x.y1 - 0.06, x.z0 + a, x.x1, x.y1, x.z0 + c);
  }
}

/** Плетёный мешок-сетка с рыбой (для маятника): локально, центр мешка в (0,0,0), r — радиус. */
export function netBag(b: Batch, r: number): void {
  const g = new THREE.IcosahedronGeometry(r, 1);
  g.scale(1, 1.15, 1);
  b.add('cloth', g, 0xb7a274);
  // ячейки сети — тёмные кольца
  for (const k of [-0.5, 0, 0.5]) {
    const t = new THREE.TorusGeometry(r * Math.cos(k) * 1.02, 0.03, 4, 12);
    t.rotateX(Math.PI / 2);
    t.translate(0, r * Math.sin(k) * 1.1, 0);
    b.add('metal', t, 0x6b5a3a);
  }
  // рыбьи хвосты торчат
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7, x = Math.cos(a) * r * 0.85, z = Math.sin(a) * r * 0.85, y = r * (0.1 + 0.25 * (i % 2));
    b.add('paint', tri([x, y, z], [x * 1.35, y + 0.28, z * 1.35 + 0.1], [x * 1.35, y + 0.28, z * 1.35 - 0.12]), 0xa9b8bf);
  }
}

/** Мешок с песком (для шаров): холщовый, перевязан. */
export function sandBag(b: Batch, r: number): void {
  const g = new THREE.IcosahedronGeometry(r, 1);
  g.scale(0.95, 1.2, 0.95);
  b.add('cloth', g, 0xd8c39a);
  b.cyl('metal', K.woodDark, 0, r * 1.05, 0, r * 0.3, 0.12, 8);
  const t = new THREE.TorusGeometry(r * 0.96, 0.04, 4, 14);
  t.rotateX(Math.PI / 2);
  b.add('metal', t, K.red);
}

// ---------------------------------------------------------------- крыши старого города

/** Дом-объём в боксе: стены, окна со ставнями, карниз под крышей; верх — плоская крыша с парапетом-кромкой. */
export function house(b: Batch, tiles: Batch, x: Box, n: number, roofTop = true, fronts?: Batch): void {
  const wall = pick(WALLS, n), h = H(x);
  if (fronts) facade(fronts, { x0: x.x0 + 0.05, y0: x.y0, z0: x.z0 + 0.05, x1: x.x1 - 0.05, y1: x.y1 - 0.25, z1: x.z1 - 0.05 }, wall, n);
  else b.span('plaster', wall, x.x0 + 0.05, x.y0, x.z0 + 0.05, x.x1 - 0.05, x.y1 - 0.25, x.z1 - 0.05);
  // цоколь
  if (h > 3) b.span('plaster', new THREE.Color(wall).multiplyScalar(0.82).getHex(), x.x0 + 0.03, x.y0, x.z0 + 0.03, x.x1 - 0.03, x.y0 + Math.min(0.9, h * 0.12), x.z1 - 0.03);
  // карниз: белый пояс чуть ниже верха, выступает
  b.span('plaster', K.white, x.x0 - 0.06, x.y1 - 0.42, x.z0 - 0.06, x.x1 + 0.06, x.y1 - 0.26, x.z1 + 0.06);
  if (roofTop) {
    // парапет — светлая кромка по периметру вровень с верхом; внутри — терракотовая плитка
    const e = Math.min(0.3, Math.min(W(x), D(x)) * 0.12);
    b.span('plaster', K.white, x.x0, x.y1 - 0.25, x.z0, x.x1, x.y1, x.z0 + e);
    b.span('plaster', K.white, x.x0, x.y1 - 0.25, x.z1 - e, x.x1, x.y1, x.z1);
    b.span('plaster', K.white, x.x0, x.y1 - 0.25, x.z0 + e, x.x0 + e, x.y1, x.z1 - e);
    b.span('plaster', K.white, x.x1 - e, x.y1 - 0.25, x.z0 + e, x.x1, x.y1, x.z1 - e);
    tileTop(tiles, x.x0 + e, x.z0 + e, x.x1 - e, x.z1 - e, x.y1 - 0.02, 0.2);
  }
  if (!fronts) windows(b, x, n, x.y0 + (h > 3 ? 1.0 : 0.3), x.y1 - 0.6);
}

/** Стены дома с окнами текстурой (клетка 1,7 × 2,6 м: окно со ставнями), цвет стены — в вершинах. Ключ 'deck' — UV сохраняются. */
export function facade(fronts: Batch, x: Box, wall: number, n: number): void {
  const g = new THREE.BoxGeometry(W(x), H(x), D(x));
  g.translate(cx(x), (x.y0 + x.y1) / 2, cz(x));
  const p = g.getAttribute('position'), nor = g.getAttribute('normal'), uv = g.getAttribute('uv');
  const shift = hash(n) < 0.5 ? 0 : 0.5;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(nor.getX(i)), nz = Math.abs(nor.getZ(i));
    if (nx > 0.5) uv.setXY(i, (p.getZ(i) - cz(x)) / 1.7 + 0.5, (p.getY(i) - x.y0) / 2.6 + shift);
    else if (nz > 0.5) uv.setXY(i, (p.getX(i) - cx(x)) / 1.7 + 0.5, (p.getY(i) - x.y0) / 2.6 + shift);
    else uv.setXY(i, 0.04, 0.04);
  }
  fronts.add('deck', g, wall);
}

/** Плитка-терракота на ровной крыше (UV в метрах: 1 м = 2 плитки). */
export function tileTop(tiles: Batch, x0: number, z0: number, x1: number, z1: number, top: number, th: number): void {
  if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return;
  const g = new THREE.BoxGeometry(x1 - x0, th, z1 - z0);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0), uv.getY(i) * (z1 - z0));
  g.translate((x0 + x1) / 2, top + 0.02 - th / 2, (z0 + z1) / 2);
  tiles.add('deck', g, 0xffffff);
}

/** Окна по всем четырём стенам: стекло, белый наличник, подоконник, ставни (зелёные или красные). */
export function windows(b: Batch, x: Box, n: number, y0: number, y1: number): void {
  const rows = Math.max(0, Math.floor((y1 - y0) / 2.6));
  if (!rows) return;
  const shutter = hash(n + 7) < 0.5 ? K.shutterGreen : K.terracotta;
  const rowH = (y1 - y0) / rows;
  for (const side of [0, 1, 2, 3]) {
    const along = side < 2;
    const len = along ? W(x) : D(x);
    const cols = Math.floor((len - 0.6) / 1.7);
    if (cols < 1) continue;
    const step = len / cols;
    for (let r = 0; r < rows; r++) {
      const wy0 = y0 + r * rowH + rowH * 0.22, wy1 = wy0 + Math.min(1.5, rowH * 0.6);
      for (let c = 0; c < cols; c++) {
        if (hash(n * 31 + side * 7 + r * 5 + c) < 0.12) continue;
        const u = -len / 2 + step * (c + 0.5), hw = 0.42;
        const face = (o: number, t: number, a: number, cc: number, ya: number, yb: number, key: 'glass' | 'plaster' | 'paint'): void => {
          // o — насколько выступает наружу от стены, t — толщина, [a..cc] — вдоль стены
          if (side === 0) b.span(key, colorOf(key), cx(x) + a, ya, x.z0 - o, cx(x) + cc, yb, x.z0 - o + t);
          else if (side === 1) b.span(key, colorOf(key), cx(x) + a, ya, x.z1 + o - t, cx(x) + cc, yb, x.z1 + o);
          else if (side === 2) b.span(key, colorOf(key), x.x0 - o, ya, cz(x) + a, x.x0 - o + t, yb, cz(x) + cc);
          else b.span(key, colorOf(key), x.x1 + o - t, ya, cz(x) + a, x.x1 + o, yb, cz(x) + cc);
        };
        const colorOf = (key: string): number => (key === 'glass' ? K.glassDark : key === 'plaster' ? K.white : shutter);
        face(-0.02, 0.1, u - hw - 0.1, u + hw + 0.1, wy0 - 0.12, wy1 + 0.1, 'plaster');
        face(0.0, 0.1, u - hw, u + hw, wy0, wy1, 'glass');
        face(0.05, 0.08, u - hw - 0.14, u + hw + 0.14, wy0 - 0.16, wy0 - 0.06, 'plaster');
        face(0.04, 0.05, u - hw - 0.48, u - hw - 0.08, wy0, wy1, 'paint');
        face(0.04, 0.05, u + hw + 0.08, u + hw + 0.48, wy0, wy1, 'paint');
      }
    }
  }
}

/** Скатная черепичная крыша над объёмом (не для ходьбы — декор соседних домов). */
export function pitchedRoof(b: Batch, x0: number, z0: number, x1: number, z1: number, y: number, rise: number, color: number = K.tile): void {
  const along = x1 - x0 >= z1 - z0;
  const w = x1 - x0 + 0.4, d = z1 - z0 + 0.4;
  const g = new THREE.CylinderGeometry(0.0001, 1, 1, 4, 1, false, Math.PI / 4);
  // призма: 4-гранная пирамида, растянутая в «щипец»
  g.scale(Math.SQRT1_2 * (along ? w : w), rise, Math.SQRT1_2 * (along ? d : d));
  g.translate((x0 + x1) / 2, y + rise / 2, (z0 + z1) / 2);
  b.add('roof', g, color);
}

/** Черепичный скат-«юбка» по периметру (дом под домом): низ шире, верх — у стены следующего. */
export function roofSkirt(b: Batch, x0: number, z0: number, x1: number, z1: number, y: number, rise: number, color: number = K.tile): void {
  const g = new THREE.CylinderGeometry(Math.SQRT1_2 * 0.82, Math.SQRT1_2, 1, 4, 1, true, Math.PI / 4);
  g.scale(x1 - x0, rise, z1 - z0);
  g.translate((x0 + x1) / 2, y + rise / 2, (z0 + z1) / 2);
  b.add('roof', g, color);
  // свес: тонкая полка по низу ската
  b.span('roof', new THREE.Color(color).multiplyScalar(0.8).getHex(), x0 - 0.04, y - 0.08, z0 - 0.04, x1 + 0.04, y + 0.02, z0 + 0.12);
  b.span('roof', new THREE.Color(color).multiplyScalar(0.8).getHex(), x0 - 0.04, y - 0.08, z1 - 0.12, x1 + 0.04, y + 0.02, z1 + 0.04);
}

/** Полосатая маркиза-батут: верх полосами, фестоны по переднему краю, рама и кронштейны. Локально: верх в y = 0. */
export function awning(b: Batch, w: number, d: number, n: number): void {
  const [ca, cb] = n % 2 ? [K.red, K.white] : [K.orange, K.white];
  const along = w >= d;
  const L = along ? w : d, S = along ? d : w;
  const k = Math.max(4, Math.round(L / 0.45));
  for (let i = 0; i < k; i++) {
    const a = -L / 2 + (L / k) * i, c = a + L / k;
    if (along) b.span('cloth', i % 2 ? ca : cb, a, -0.08, -S / 2, c, 0, S / 2);
    else b.span('cloth', i % 2 ? ca : cb, -S / 2, -0.08, a, S / 2, 0, c);
  }
  // фестоны с двух длинных сторон
  for (const v of [-1, 1]) for (let i = 0; i < k; i++) {
    const a = -L / 2 + (L / k) * i, c = a + L / k, m = (a + c) / 2, s = v * (S / 2 + 0.01);
    const t = along ? tri([a, -0.08, s], [c, -0.08, s], [m, -0.4, s]) : tri([s, -0.08, a], [s, -0.08, c], [s, -0.4, m]);
    b.add('cloth', t, i % 2 ? ca : cb);
  }
  // рама
  const e = 0.06;
  b.span('metal', K.steelDark, -w / 2, -0.14, -d / 2, w / 2, -0.08, -d / 2 + e);
  b.span('metal', K.steelDark, -w / 2, -0.14, d / 2 - e, w / 2, -0.08, d / 2);
  b.span('metal', K.steelDark, -w / 2, -0.14, -d / 2, -w / 2 + e, -0.08, d / 2);
  b.span('metal', K.steelDark, w / 2 - e, -0.14, -d / 2, w / 2, -0.08, d / 2);
}

/** Карниз вдоль стены: каменная полка с профилем, под ней кирпичная кладка на 3 м. */
export function ledge(b: Batch, x: Box): void {
  b.span('plaster', K.cream, x.x0, x.y1 - 0.12, x.z0, x.x1, x.y1, x.z1);
  const along = W(x) >= D(x);
  if (along) {
    b.span('plaster', K.white, x.x0, x.y1 - 0.26, x.z0 + 0.08, x.x1, x.y1 - 0.12, x.z1 - 0.08);
    b.span('plaster', K.white, x.x0, x.y1 - 0.38, x.z0 + 0.18, x.x1, x.y1 - 0.26, x.z1 - 0.18);
  } else {
    b.span('plaster', K.white, x.x0 + 0.08, x.y1 - 0.26, x.z0, x.x1 - 0.08, x.y1 - 0.12, x.z1);
    b.span('plaster', K.white, x.x0 + 0.18, x.y1 - 0.38, x.z0, x.x1 - 0.18, x.y1 - 0.26, x.z1);
  }
  if (H(x) > 0.5) b.span('brick', 0xc9765a, x.x0 + 0.2, x.y0, x.z0 + 0.2, x.x1 - 0.2, x.y1 - 0.38, x.z1 - 0.2);
  // кронштейны-консоли через 1,5 м
  const len = along ? W(x) : D(x);
  for (let s = 0.5; s < len; s += 1.5) {
    if (along) b.span('plaster', K.white, x.x0 + s - 0.08, x.y1 - 0.75, x.z0 + 0.2, x.x0 + s + 0.08, x.y1 - 0.12, x.z1 - 0.2);
    else b.span('plaster', K.white, x.x0 + 0.2, x.y1 - 0.75, x.z0 + s - 0.08, x.x1 - 0.2, x.y1 - 0.12, x.z0 + s + 0.08);
  }
}

/** Оголовок трубы: кирпичный ствол, бетонная шапка-площадка, два глиняных дымника по краю (ниже ног — нет, сбоку). */
export function chimney(b: Batch, x: Box, n: number): void {
  b.span('brick', pick([0xc4694c, 0xb85a42, 0xcf7a5a], n), x.x0 + 0.08, x.y0, x.z0 + 0.08, x.x1 - 0.08, x.y1 - 0.18, x.z1 - 0.08);
  b.span('plaster', K.concrete, x.x0, x.y1 - 0.2, x.z0, x.x1, x.y1, x.z1);
  b.span('plaster', 0x9f9789, x.x0 + 0.04, x.y1 - 0.34, x.z0 + 0.04, x.x1 - 0.04, x.y1 - 0.2, x.z1 - 0.04);
  // пояс кладки
  b.span('brick', 0xa94f3a, x.x0 + 0.03, x.y1 - 0.75, x.z0 + 0.03, x.x1 - 0.03, x.y1 - 0.55, x.z1 - 0.03);
}

/** Деревянный бак водонапорной башни с обручами; верх — дощатая площадка. */
export function waterTank(b: Batch, x: Box): void {
  b.span('wood', 0xb5824e, x.x0 + 0.06, x.y0, x.z0 + 0.06, x.x1 - 0.06, x.y1 - 0.06, x.z1 - 0.06);
  b.deck(x.x0, x.x1, x.z0, x.z1, x.y1, 0.2, K.woodDark);
  const h = H(x);
  for (let k = 0.15; k < 0.95; k += 0.22) b.span('metal', K.steelDark, x.x0 + 0.02, x.y0 + h * k, x.z0 + 0.02, x.x1 - 0.02, x.y0 + h * k + 0.08, x.z1 - 0.02);
  // вертикальные клёпки-рейки
  const len = W(x);
  for (let s = 0.4; s < len - 0.2; s += 0.6) {
    b.span('wood', K.woodDark, x.x0 + s - 0.03, x.y0, x.z0 + 0.02, x.x0 + s + 0.03, x.y1 - 0.2, x.z0 + 0.06);
    b.span('wood', K.woodDark, x.x0 + s - 0.03, x.y0, x.z1 - 0.06, x.x0 + s + 0.03, x.y1 - 0.2, x.z1 - 0.02);
  }
}

/** Ноги под объёмом (бак, площадка): четыре стойки и крестовые связи до низа. */
export function legs(b: Batch, x: Box, y0: number, color: number = K.woodDark, wood = true): void {
  const y1 = x.y0, inset = 0.25, key = wood ? 'wood' : 'metal';
  if (y1 - y0 < 0.3) return;
  const cs: Array<[number, number]> = [[x.x0 + inset, x.z0 + inset], [x.x1 - inset, x.z0 + inset], [x.x1 - inset, x.z1 - inset], [x.x0 + inset, x.z1 - inset]];
  for (const [px, pz] of cs) strut(b, key, color, [px, y0, pz], [px, y1, pz], wood ? 0.13 : 0.09, 6);
  const step = Math.max(2.4, Math.min(5, (y1 - y0) / 3));
  for (let y = y1; y - step > y0 - 0.01; y -= step) {
    for (let k = 0; k < 4; k++) {
      const [ax, az] = cs[k], [bx, bz] = cs[(k + 1) % 4];
      strut(b, key, color, [ax, y, az], [bx, y - step, bz], 0.05, 3);
      strut(b, key, color, [bx, y, bz], [ax, y - step, az], 0.05, 3);
      strut(b, key, color, [ax, y - 0.05, az], [bx, y - 0.05, bz], 0.06, 3);
    }
  }
}

// ---------------------------------------------------------------- стройка

/** Доска лесов: дощатый настил, стальные трубы-стойки по углам вниз на drop м, ригели. */
export function scaffold(b: Batch, x: Box, drop: number): void {
  const along = W(x) >= D(x);
  b.span('wood', K.woodDark, x.x0 + 0.03, x.y0, x.z0 + 0.03, x.x1 - 0.03, x.y1 - 0.05, x.z1 - 0.03);
  const len = along ? W(x) : D(x), wid = along ? D(x) : W(x);
  const k = Math.max(1, Math.round(wid / 0.25));
  for (let i = 0; i < k; i++) {
    const a = (wid / k) * i + 0.01, c = a + wid / k - 0.02;
    if (along) b.span('wood', i % 2 ? K.woodLight : 0xd7b07a, x.x0, x.y1 - 0.05, x.z0 + a, x.x1, x.y1, x.z0 + c);
    else b.span('wood', i % 2 ? K.woodLight : 0xd7b07a, x.x0 + a, x.y1 - 0.05, x.z0, x.x0 + c, x.y1, x.z1);
  }
  void len;
  // торцы досок покрашены в красное — видно край
  if (along) { b.span('paint', K.red, x.x0 - 0.01, x.y1 - 0.12, x.z0, x.x0 + 0.1, x.y1 - 0.01, x.z1); b.span('paint', K.red, x.x1 - 0.1, x.y1 - 0.12, x.z0, x.x1 + 0.01, x.y1 - 0.01, x.z1); }
  else { b.span('paint', K.red, x.x0, x.y1 - 0.12, x.z0 - 0.01, x.x1, x.y1 - 0.01, x.z0 + 0.1); b.span('paint', K.red, x.x0, x.y1 - 0.12, x.z1 - 0.1, x.x1, x.y1 - 0.01, x.z1 + 0.01); }
  if (drop > 0.4) {
    const y0 = x.y0 - drop;
    const cs: Array<[number, number]> = [[x.x0 + 0.06, x.z0 + 0.06], [x.x1 - 0.06, x.z0 + 0.06], [x.x1 - 0.06, x.z1 - 0.06], [x.x0 + 0.06, x.z1 - 0.06]];
    for (const [px, pz] of cs) b.beam('metal', K.steel, [px, y0, pz], [px, x.y0, pz], 0.045, 5);
    b.beam('metal', K.steel, [cs[0][0], x.y0 - 0.06, cs[0][1]], [cs[2][0], x.y0 - 0.06, cs[2][1]], 0.035, 4);
    if (drop > 2) b.beam('metal', K.steel, [cs[1][0], x.y0, cs[1][1]], [cs[3][0], y0 + 0.2, cs[3][1]], 0.035, 4);
  }
}

/** Клеть подъёмника (подвижная, локально — верх пола в y = 0): решётчатый пол, стойки, верхняя рама, сетка с двух сторон. */
export function cage(b: Batch, w: number, d: number): void {
  b.span('metal', K.steelDark, -w / 2, -0.25, -d / 2, w / 2, -0.04, d / 2);
  b.span('metal', 0x8d969d, -w / 2 + 0.02, -0.04, -d / 2 + 0.02, w / 2 - 0.02, 0, d / 2 - 0.02);
  // красно-белая кромка пола
  const k = Math.max(4, Math.round(w / 0.4));
  for (let i = 0; i < k; i++) for (const z of [-d / 2 - 0.01, d / 2 - 0.05]) b.span('paint', i % 2 ? K.red : K.white, -w / 2 + (w / k) * i, -0.2, z, -w / 2 + (w / k) * (i + 1), -0.06, z + 0.06);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.beam('metal', K.orange, [sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05)], [sx * (w / 2 - 0.05), 2.5, sz * (d / 2 - 0.05)], 0.05, 5);
  for (const sz of [-1, 1]) b.beam('metal', K.orange, [-w / 2, 2.5, sz * (d / 2 - 0.05)], [w / 2, 2.5, sz * (d / 2 - 0.05)], 0.05, 4);
  for (const sx of [-1, 1]) b.beam('metal', K.orange, [sx * (w / 2 - 0.05), 2.5, -d / 2], [sx * (w / 2 - 0.05), 2.5, d / 2], 0.05, 4);
  // сетка по одной боковой стороне — прутья (за спиной у мачты)
  for (let i = 1; i < 8; i++) b.beam('metal', K.steel, [-w / 2 + (w / 8) * i, 0, -d / 2 + 0.05], [-w / 2 + (w / 8) * i, 2.5, -d / 2 + 0.05], 0.015, 3);
  // крюк-подвес
  b.beam('metal', K.steelDark, [0, 2.5, 0], [0, 3.4, 0], 0.06, 5);
}

// ---------------------------------------------------------------- колесо и канатка

/** Люлька колеса обозрения (подвижная, локально — верх пола в y = 0): пол, стойки, полосатый козырёк, подвес к оси. */
export function gondolaCar(b: Batch, w: number, d: number, n: number): void {
  const [ca, cb] = n % 2 ? [K.red, K.white] : [K.orange, K.white];
  b.span('paint', ca, -w / 2, -0.35, -d / 2, w / 2, -0.05, d / 2);
  const deck = new THREE.BoxGeometry(w - 0.06, 0.05, d - 0.06);
  deck.translate(0, -0.025, 0);
  b.add('wood', deck, K.woodLight);
  // низкий бортик снаружи, ниже ног — рамка
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.beam('metal', K.steelDark, [sx * (w / 2 - 0.06), -0.05, sz * (d / 2 - 0.06)], [sx * (w / 2 - 0.06), 2.45, sz * (d / 2 - 0.06)], 0.045, 5);
  // козырёк-шатёр полосами
  const k = 6;
  for (let i = 0; i < k; i++) b.span('cloth', i % 2 ? ca : cb, -w / 2 - 0.1 + ((w + 0.2) / k) * i, 2.45, -d / 2 - 0.1, -w / 2 - 0.1 + ((w + 0.2) / k) * (i + 1), 2.6, d / 2 + 0.1);
  const roof = new THREE.ConeGeometry(Math.max(w, d) * 0.62, 0.55, 4, 1);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, 2.88, 0);
  b.add('cloth', roof, ca);
  b.beam('metal', K.steelDark, [0, 3.1, 0], [0, 3.9, 0], 0.07, 5);
}

/** Кабина канатки (подвижная, верх пола в y = 0): пол, стойки, стёкла по торцам, красная крыша, подвес к тросу. */
export function cableCar(b: Batch, w: number, d: number, hang: number): void {
  b.span('paint', K.red, -w / 2, -0.4, -d / 2, w / 2, -0.05, d / 2);
  const deck = new THREE.BoxGeometry(w - 0.06, 0.05, d - 0.06);
  deck.translate(0, -0.025, 0);
  b.add('wood', deck, K.woodLight);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.beam('metal', K.white, [sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06)], [sx * (w / 2 - 0.06), 2.4, sz * (d / 2 - 0.06)], 0.05, 5);
  b.span('paint', K.red, -w / 2 - 0.08, 2.4, -d / 2 - 0.08, w / 2 + 0.08, 2.62, d / 2 + 0.08);
  b.span('paint', K.white, -w / 2 + 0.2, 2.62, -d / 2 + 0.2, w / 2 - 0.2, 2.72, d / 2 - 0.2);
  // подвес: штанга и ролики
  b.beam('metal', K.steelDark, [0, 2.72, 0], [0, hang, 0], 0.07, 6);
  b.span('metal', K.steelDark, -0.5, hang - 0.12, -0.12, 0.5, hang + 0.12, 0.12);
}

/** Вагончик фуникулёра: деревянный пол, белые стойки, зелёная крыша. */
export function funicular(b: Batch, w: number, d: number): void {
  b.span('paint', K.green, -w / 2, -0.45, -d / 2, w / 2, -0.05, d / 2);
  const deck = new THREE.BoxGeometry(w - 0.06, 0.05, d - 0.06);
  deck.translate(0, -0.025, 0);
  b.add('wood', deck, K.woodLight);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.beam('metal', K.white, [sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06)], [sx * (w / 2 - 0.06), 2.3, sz * (d / 2 - 0.06)], 0.05, 5);
  b.span('paint', K.green, -w / 2 - 0.1, 2.3, -d / 2 - 0.1, w / 2 + 0.1, 2.5, d / 2 + 0.1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('metal', K.steelDark, sx * (w / 2 - 0.3), -0.5, sz * (d / 2 - 0.1), 0.18, 0.1, 10);
}

// ---------------------------------------------------------------- провода

/** Столб: круглый просмолённый ствол в боксе, траверса с изоляторами — ниже верха. */
export function pole(b: Batch, x: Box): void {
  const r = Math.min(W(x), D(x)) / 2;
  b.cyl('wood', 0x7d5a3c, cx(x), (x.y0 + x.y1) / 2 - 0.05, cz(x), r * 0.96, H(x) - 0.1, 10, r * 0.85);
  b.cyl('metal', K.steelDark, cx(x), x.y1 - 0.05, cz(x), r, 0.1, 10);
}

/** Изолятор-ступень: стопка «тарелок» с металлической шапкой-площадкой. */
export function insulator(b: Batch, x: Box): void {
  const r = Math.min(W(x), D(x)) / 2, h = H(x);
  b.cyl('metal', K.steelDark, cx(x), x.y1 - 0.06, cz(x), r, 0.12, 12);
  const n = Math.max(2, Math.floor((h - 0.15) / 0.22));
  for (let i = 0; i < n; i++) {
    const y = x.y1 - 0.2 - i * ((h - 0.2) / n);
    b.cyl('glass', 0x7fb59a, cx(x), y, cz(x), r * 0.82, 0.09, 12, r * 0.6);
    b.cyl('glass', 0x6a9d84, cx(x), y - 0.08, cz(x), r * 0.32, 0.12, 8);
  }
}

/** Пучок кабелей-«провод» шириной бокса: три кабеля сверху (верх вровень), два снизу, хомуты через 1,2 м. */
export function cables(b: Batch, x: Box): void {
  const along = W(x) >= D(x);
  const S = along ? D(x) : W(x), r = S / 6, len = along ? W(x) : D(x);
  const A = (u: number, y: number, v: number): V3 => (along ? [x.x0 + u, y, cz(x) + v] : [cx(x) + v, y, x.z0 + u]);
  for (const v of [-2 * r, 0, 2 * r]) b.beam('metal', 0x3c3f42, A(0, x.y1 - r, v), A(len, x.y1 - r, v), r, 8);
  for (const v of [-r, r]) b.beam('metal', 0x2f3235, A(0, x.y1 - 2.7 * r, v), A(len, x.y1 - 2.7 * r, v), r, 8);
  for (let s = 0.6; s < len; s += 1.2) {
    if (along) b.span('metal', K.red, x.x0 + s - 0.05, x.y1 - 3.8 * r, x.z0 - 0.015, x.x0 + s + 0.05, x.y1 - 0.02, x.z1 + 0.015);
    else b.span('metal', K.red, x.x0 - 0.015, x.y1 - 3.8 * r, x.z0 + s - 0.05, x.x1 + 0.015, x.y1 - 0.02, x.z0 + s + 0.05);
  }
}

/** Щит-укрытие от ветра: дощатый щит на двух стойках, красно-белая кайма. Локально: низ в y = 0, щит в плоскости x–y. */
export function shield(b: Batch, w: number, h: number): void {
  b.beam('wood', K.woodDark, [-w / 2 + 0.15, 0, 0.12], [-w / 2 + 0.15, h, 0.12], 0.08, 6);
  b.beam('wood', K.woodDark, [w / 2 - 0.15, 0, 0.12], [w / 2 - 0.15, h, 0.12], 0.08, 6);
  const k = Math.max(3, Math.round(h / 0.3));
  for (let i = 0; i < k; i++) b.span('wood', i % 2 ? K.wood : K.woodLight, -w / 2, 0.4 + ((h - 0.4) / k) * i + 0.01, -0.03, w / 2, 0.4 + ((h - 0.4) / k) * (i + 1) - 0.01, 0.03);
  const s = 8;
  for (let i = 0; i < s; i++) b.span('paint', i % 2 ? K.red : K.white, -w / 2 + (w / s) * i, h - 0.14, -0.05, -w / 2 + (w / s) * (i + 1), h, 0.05);
}

// ---------------------------------------------------------------- шары, змеи, облака

/** Плетёная корзина шара (подвижная, верх пола в y = 0): пол, плетёные борта по bodies или низкий кант, стропы к оболочке. */
export function balloonBasket(b: Batch, w: number, d: number, n: number, walls: Array<{ min: V3; max: V3 }> = []): void {
  basketBody(b, w, d, walls);
  // купол высоко над корзиной: у причала он не должен заслонять камеру
  const R = Math.max(w, d) * 0.7 + 1.1;
  const cy = 9.5 + R * 0.945;
  balloonEnvelope(b, 0, cy, 0, R, n);
  basketRopes(b, w, d, 0, cy - R * 0.945, R);
}

function basketBody(b: Batch, w: number, d: number, walls: Array<{ min: V3; max: V3 }> = []): void {
  b.span('wood', K.wicker, -w / 2, -0.55, -d / 2, w / 2, -0.04, d / 2);
  const deck = new THREE.BoxGeometry(w - 0.1, 0.05, d - 0.1);
  deck.translate(0, -0.025, 0);
  b.add('wood', deck, K.woodLight);
  for (const v of walls) b.span('wood', K.wicker, v.min[0], v.min[1], v.min[2], v.max[0], v.max[1], v.max[2]);
  // кожаный кант по кромке (ниже ног)
  const e = 0.08;
  b.span('paint', 0x7a4a2a, -w / 2 - 0.02, -0.16, -d / 2 - 0.02, w / 2 + 0.02, -0.04, -d / 2 + e);
  b.span('paint', 0x7a4a2a, -w / 2 - 0.02, -0.16, d / 2 - e, w / 2 + 0.02, -0.04, d / 2 + 0.02);
  b.span('paint', 0x7a4a2a, -w / 2 - 0.02, -0.16, -d / 2, -w / 2 + e, -0.04, d / 2);
  b.span('paint', 0x7a4a2a, w / 2 - e, -0.16, -d / 2, w / 2 + 0.02, -0.04, d / 2);
}

function basketRopes(b: Batch, w: number, d: number, y: number, neck: number, R: number): void {
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.beam('metal', K.rope, [sx * (w / 2 - 0.05), y - 0.05, sz * (d / 2 - 0.05)], [sx * R * 0.24, neck - 0.3, sz * R * 0.24], 0.025, 3);
  b.cyl('metal', K.steelDark, 0, neck - 0.75, 0, 0.3, 0.4, 8);
}

/**
 * Оболочка шара с центром (ox, cy, oz) и радиусом R: груша, полосы клиньями, горловина внизу. cut > 0 — верх срезан
 * (дыра такого радиуса: на ней лежит батут купола). Возвращает высоту горловины.
 */
export function balloonEnvelope(b: Batch, ox: number, cy: number, oz: number, R: number, n: number, cut = 0): number {
  const cols = [[K.red, K.white], [K.orange, K.cream], [K.green, K.white], [K.maroon, K.peach]][Math.abs(Math.round(n)) % 4];
  const t0 = cut > 0 ? Math.asin(Math.min(0.95, cut / R)) : 0;
  const g = new THREE.SphereGeometry(R, 18, 12, 0, Math.PI * 2, t0, Math.PI * 0.82 - t0);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / R;
    const k = y < 0 ? 1 - -y * 0.42 : 1;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * (y < 0 ? 1.12 : 1), p.getZ(i) * k);
  }
  g.computeVertexNormals();
  const geo = g.toNonIndexed();
  geo.deleteAttribute("uv");
  geo.translate(ox, cy, oz);
  b.add('cloth', geo, 0xffffff);
  // полосы клиньями: красим по долготе (add() уже положил белый — перекрашиваем тот же объект)
  const pos = geo.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  const ca = new THREE.Color(cols[0]), cb = new THREE.Color(cols[1]);
  for (let t = 0; t < pos.count; t += 3) {
    const mx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3 - ox, mz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3 - oz;
    const seg = Math.floor(((Math.atan2(mz, mx) + Math.PI) / (Math.PI * 2)) * 18);
    const c = seg % 2 ? ca : cb;
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (t + k) * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const neck = cy - R * 0.945;
  b.cyl('cloth', cols[0], ox, neck - 0.1, oz, R * 0.35, 0.3, 10, R * 0.3);
  return neck;
}

/** Верх купола шара — батут (локально верх в y = 0, площадка w×d): оболочка под ним, тугой круг, красный обод, корзина внизу. */
export function domeTop(b: Batch, w: number, d: number, n: number): void {
  const half = Math.max(w, d) / 2;
  const R = half / 0.62, cut = half * 0.98;
  const cy = -0.08 - R * Math.cos(Math.asin(Math.min(0.95, cut / R)));
  const neck = balloonEnvelope(b, 0, cy, 0, R, n, cut);
  const mat = new THREE.CylinderGeometry(half * 0.96, half * 1.0, 0.1, 20);
  mat.translate(0, -0.05, 0);
  b.add('cloth', mat, 0x4a4643);
  const rim = new THREE.TorusGeometry(half * 0.99, 0.1, 6, 24);
  rim.rotateX(Math.PI / 2);
  rim.translate(0, -0.06, 0);
  b.add('paint', rim, K.red);
  // корзина висит под горловиной
  const by = neck - 4.4;
  const g = new THREE.BoxGeometry(1.5, 1.0, 1.5);
  g.translate(0, by - 0.5, 0);
  b.add('wood', g, K.wicker);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.beam('metal', K.rope, [sx * 0.7, by, sz * 0.7], [sx * R * 0.24, neck - 0.3, sz * R * 0.24], 0.025, 3);
}

/** Воздушный змей-платформа (локально верх в y = 0): прямоугольный парус двумя цветами по диагонали, крестовина, хвост из бантов. */
export function kite(b: Batch, w: number, d: number, n: number): void {
  const [ca, cb] = [[K.red, K.white], [K.green, K.white], [K.orange, K.cream]][Math.abs(Math.round(n)) % 3];
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  b.span('cloth', ca, x0, -0.08, z0, x1, -0.03, z1);
  // вторая половина — светлый треугольник поверх
  b.add('cloth', tri([x0, -0.025, z0], [x0, -0.025, z1], [x1, -0.025, z1]), cb);
  b.beam('wood', K.woodDark, [x0, -0.1, z0], [x1, -0.1, z1], 0.045, 4);
  b.beam('wood', K.woodDark, [x1, -0.1, z0], [x0, -0.1, z1], 0.045, 4);
  const e = 0.06;
  b.span('wood', K.woodDark, x0, -0.12, z0, x1, -0.06, z0 + e);
  b.span('wood', K.woodDark, x0, -0.12, z1 - e, x1, -0.06, z1);
  b.span('wood', K.woodDark, x0, -0.12, z0, x0 + e, -0.06, z1);
  b.span('wood', K.woodDark, x1 - e, -0.12, z0, x1, -0.06, z1);
  // хвост: бечёвка вниз-назад, банты
  let prev: V3 = [0, -0.1, z1];
  for (let i = 1; i <= 6; i++) {
    const q: V3 = [Math.sin(i * 0.9) * 0.4, -0.1 - i * 0.7, z1 + i * 0.35];
    b.beam('metal', K.rope, prev, q, 0.02, 3);
    b.add('cloth', tri([q[0] - 0.25, q[1], q[2]], [q[0], q[1] + 0.12, q[2]], [q[0], q[1] - 0.12, q[2]]), i % 2 ? ca : cb);
    b.add('cloth', tri([q[0] + 0.25, q[1], q[2]], [q[0], q[1] - 0.12, q[2]], [q[0], q[1] + 0.12, q[2]]), i % 2 ? ca : cb);
    prev = q;
  }
}

/** Гирлянда-балка: тугой канат-брус (верх вровень), флажки треугольниками под ним с двух сторон. */
export function garland(b: Batch, x: Box, n: number): void {
  const along = W(x) >= D(x);
  b.span('wood', K.woodDark, x.x0, x.y1 - 0.12, x.z0, x.x1, x.y1, x.z1);
  b.span('metal', K.rope, x.x0, x.y1 - 0.2, x.z0 + 0.04, x.x1, x.y1 - 0.12, x.z1 - 0.04);
  const len = along ? W(x) : D(x), cols = [K.red, K.white, K.orange, K.green, K.white, K.pink];
  const k = Math.max(2, Math.floor(len / 0.5));
  for (let i = 0; i < k; i++) {
    const a = (len / k) * i + 0.04, c = a + len / k - 0.08, m = (a + c) / 2, col = cols[(i + n) % cols.length];
    for (const s of along ? [x.z0 - 0.01, x.z1 + 0.01] : [x.x0 - 0.01, x.x1 + 0.01]) {
      if (along) b.add('cloth', tri([x.x0 + a, x.y1 - 0.14, s], [x.x0 + c, x.y1 - 0.14, s], [x.x0 + m, x.y1 - 0.6, s]), col);
      else b.add('cloth', tri([s, x.y1 - 0.14, x.z0 + a], [s, x.y1 - 0.14, x.z0 + c], [s, x.y1 - 0.6, x.z0 + m]), col);
    }
  }
}

/** Лестница/ступени: дощатая ступень на тетивах. */
export function stair(b: Batch, x: Box): void {
  b.deck(x.x0, x.x1, x.z0, x.z1, x.y1, Math.min(0.5, H(x)), K.woodDark);
  if (H(x) > 0.5) b.span('wood', K.woodDark, x.x0 + 0.1, x.y0, x.z0 + 0.1, x.x1 - 0.1, x.y1 - 0.4, x.z1 - 0.1);
}

/** Причал на сваях: настил, балки, сваи вниз до дна. */
export function pier(b: Batch, x: Box, bottom: number): void {
  b.deck(x.x0, x.x1, x.z0, x.z1, x.y1, Math.min(0.5, H(x)), K.woodDark);
  const sx = Math.max(1, Math.round(W(x) / 2.5)), sz = Math.max(1, Math.round(D(x) / 2.5));
  for (let i = 0; i <= sx; i++) for (let k = 0; k <= sz; k++) {
    if (i > 0 && i < sx && k > 0 && k < sz) continue;
    const px = x.x0 + 0.15 + ((W(x) - 0.3) / sx) * i, pz = x.z0 + 0.15 + ((D(x) - 0.3) / sz) * k;
    b.beam('wood', 0x6f4f35, [px, bottom, pz], [px, x.y1 - 0.5, pz], 0.14, 6);
  }
}

/** Облако-площадка полегче (≈ 0,8 тыс. треугольников): ровная подушка с золотистым верхом, пухлая кайма, голубое брюшко. Верх — y = 0. */
export function cloudGeo(seed: number, w: number, d: number, belly = 1): THREE.BufferGeometry {
  let s = seed >>> 0;
  const rnd = (): number => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const parts: THREE.BufferGeometry[] = [];
  const top = new THREE.Color(0xfff0c8), side = new THREE.Color(0xf6f8ff), low = new THREE.Color(0x8fb4e8);
  const paintY = (g: THREE.BufferGeometry, y0: number, y1: number): void => {
    const q = g.index ? g.toNonIndexed() : g;
    q.deleteAttribute('uv');
    const pos = q.getAttribute('position'), nor = q.getAttribute('normal'), col = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const k = THREE.MathUtils.clamp((pos.getY(i) - y0) / (y1 - y0), 0, 1);
      c.copy(low).lerp(side, THREE.MathUtils.smoothstep(k, 0.1, 0.7));
      if (nor.getY(i) > 0.75 && pos.getY(i) > -0.12) c.copy(top);
      col.set([c.r, c.g, c.b], i * 3);
    }
    q.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(q);
  };
  // ровный верх для ног — тоньше и уже опоры, края закрывают клубы по периметру (не видно «плиты»)
  const pad = new THREE.BoxGeometry(Math.max(0.6, w - 0.7), 0.16, Math.max(0.6, d - 0.7));
  pad.translate(0, -0.09, 0);
  paintY(pad, -0.9 * belly, 0);
  const ring = Math.max(8, Math.min(14, Math.round((w + d) * 1.3)));
  for (let i = 0; i < ring; i++) {
    const a = ((i + rnd() * 0.3) / ring) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const k = 1 / Math.max(Math.abs(ca) / Math.max(0.3, w / 2 - 0.25), Math.abs(sa) / Math.max(0.3, d / 2 - 0.25));
    const r = Math.min(w, d) * (0.2 + rnd() * 0.07) + 0.25;
    const g = new THREE.IcosahedronGeometry(1, 1);
    g.scale(r, 0.34 + rnd() * 0.08, r);
    g.translate(ca * k, -0.34 - rnd() * 0.04, sa * k);
    paintY(g, -0.9 * belly, 0);
  }
  const b = new THREE.IcosahedronGeometry(1, 1);
  b.scale(w * 0.52, 0.5 * belly, d * 0.52);
  b.translate(0, -0.45 * belly, 0);
  paintY(b, -0.95 * belly, 0);
  return mergeGeometries(parts, false)!;
}

/** Флажок чекпоинта (древко и навершие; само полотнище — отдельной подвижной сеткой). */
export function flagPole(b: Batch, x: number, y: number, z: number): void {
  b.beam('wood', K.white, [x, y, z], [x, y + 3.1, z], 0.06, 6);
  b.cyl('metal', K.gold, x, y + 3.17, z, 0.1, 0.14, 8);
  b.cyl('plaster', K.concrete, x, y + 0.08, z, 0.22, 0.16, 8);
}

export const BOX = { W, D, H, cx, cz } as const;
export { taper, tri, up };
