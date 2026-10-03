// Модели предметов «Рыбного двора»: 16 видов из простых фигур с цветом в вершинах. Одна модель на вид — и для
// предметов двора, и для прячущихся: по картинке их не отличить. Начало координат — середина низа, «лицо» — к +Z;
// каждая модель помещается в коробку своего вида (HIDE_KIND: полуширины w по X, d по Z, высота h).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HIDE_KINDS, type HideKind } from '../../shared/hideprops.ts';

type G = THREE.BufferGeometry;

/** Раскрасить и поставить: rx, ry, rz — повороты (порядок YXZ), потом сдвиг. */
function put(g: G, color: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): G {
  const src = g.index ? g.toNonIndexed() : g;
  src.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const n = src.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  src.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  m.setPosition(x, y, z);
  src.applyMatrix4(m);
  return src;
}
const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => put(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz);
const cyl = (rt: number, rb: number, h: number, color: number, x: number, y: number, z: number, seg = 14, rx = 0, ry = 0, rz = 0) => put(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y, z, rx, ry, rz);
const ball = (r: number, color: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, seg = 12) => put(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.7 | 0)).scale(sx, sy, sz), color, x, y, z);
const ring = (R: number, r: number, color: number, x: number, y: number, z: number, rx = Math.PI / 2, ry = 0, arc = Math.PI * 2, seg = 20) => put(new THREE.TorusGeometry(R, r, 5, seg, arc), color, x, y, z, rx, ry);
/** Тело вращения: профиль [радиус, высота] снизу вверх, сегменты красятся полосами (клёпка бочки).
 *  Нормали — гладкие, от самой LatheGeometry (посчитанные заново после toNonIndexed дали бы «мятую фольгу»). */
function lathe(profile: [number, number][], seg: number, colors: number[]): G {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg).toNonIndexed();
  g.deleteAttribute('uv');
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  // треугольники идут по сегментам: в каждом (точек − 1) четырёхугольников по 2 треугольника — полоса = номер сегмента
  const perSeg = (profile.length - 1) * 2;
  for (let i = 0; i < pos.count; i += 3) {
    c.set(colors[Math.floor(i / 3 / perSeg) % colors.length]);
    for (let j = 0; j < 3; j++) { col[(i + j) * 3] = c.r; col[(i + j) * 3 + 1] = c.g; col[(i + j) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const WOOD = 0xb98a55, WOOD2 = 0xa7783f, DARK = 0x6a4a2c, IRON = 0x2c3035;

const BUILD: Record<HideKind, () => G[]> = {
  bucket: () => [
    cyl(0.19, 0.15, 0.36, 0x9fb4c0, 0, 0.18, 0, 18),
    ring(0.19, 0.014, 0xc9d6dd, 0, 0.36, 0),
    ring(0.168, 0.01, 0x8aa0ad, 0, 0.1, 0), ring(0.181, 0.01, 0x8aa0ad, 0, 0.26, 0),
    cyl(0.17, 0.17, 0.012, 0x6f8794, 0, 0.33, 0, 18),
    ring(0.16, 0.009, 0x45525a, 0, 0.36, 0.02, -1.35, 0, Math.PI),
  ],
  pot: () => [
    cyl(0.2, 0.14, 0.3, 0xc4673d, 0, 0.15, 0, 16), ring(0.2, 0.026, 0xb55a33, 0, 0.3, 0),
    cyl(0.18, 0.18, 0.02, 0x4a3222, 0, 0.29, 0, 14),
    ball(0.19, 0x4f9a3c, 0, 0.45, 0, 1, 0.88, 1, 10), ball(0.1, 0x62b24a, 0.08, 0.53, 0.05), ball(0.09, 0x3f8a33, -0.09, 0.49, -0.06),
    ball(0.035, 0xff5d8f, 0.12, 0.52, 0.11, 1, 1, 1, 8), ball(0.035, 0xffd23f, -0.1, 0.55, 0.1, 1, 1, 1, 8), ball(0.035, 0xffffff, 0.02, 0.6, -0.12, 1, 1, 1, 8),
    ball(0.035, 0xff5d8f, -0.15, 0.45, -0.04, 1, 1, 1, 8), ball(0.035, 0xffd23f, 0.15, 0.44, -0.07, 1, 1, 1, 8),
  ],
  buoy: () => [
    ball(0.24, 0xe04a3a, 0, 0.27, 0, 1, 0.95, 1, 16), cyl(0.243, 0.243, 0.09, 0xf4f1ea, 0, 0.3, 0, 18),
    cyl(0.05, 0.12, 0.16, 0xe04a3a, 0, 0.5, 0, 12), ring(0.045, 0.012, 0xf4f1ea, 0, 0.56, 0, 0),
    cyl(0.03, 0.03, 0.04, 0x30363b, 0, 0.03, 0, 10),
  ],
  gnome: () => [
    box(0.08, 0.05, 0.12, 0x3a2a20, -0.06, 0.025, 0.02), box(0.08, 0.05, 0.12, 0x3a2a20, 0.06, 0.025, 0.02),
    cyl(0.11, 0.16, 0.24, 0x3d66c8, 0, 0.17, 0, 14), cyl(0.125, 0.135, 0.03, 0x3a2a20, 0, 0.21, 0, 14),
    ball(0.05, 0x3d66c8, -0.14, 0.24, 0.02), ball(0.05, 0x3d66c8, 0.14, 0.24, 0.02),
    ball(0.035, 0xf2c39b, -0.15, 0.2, 0.06, 1, 1, 1, 8), ball(0.035, 0xf2c39b, 0.15, 0.2, 0.06, 1, 1, 1, 8),
    ball(0.09, 0xf2c39b, 0, 0.35, 0), ball(0.03, 0xe8957a, 0, 0.35, 0.09, 1, 1, 1, 8),
    put(new THREE.ConeGeometry(0.095, 0.17, 12), 0xf4f1ea, 0, 0.27, 0.05, Math.PI),
    ball(0.016, 0x1b1b1b, -0.035, 0.38, 0.08, 1, 1, 1, 6), ball(0.016, 0x1b1b1b, 0.035, 0.38, 0.08, 1, 1, 1, 6),
    put(new THREE.ConeGeometry(0.1, 0.2, 14), 0xd8342c, 0, 0.48, -0.01, -0.12),
  ],
  gull: () => [
    cyl(0.08, 0.1, 0.06, DARK, 0, 0.03, 0, 12), cyl(0.012, 0.012, 0.16, 0xf2a03d, -0.03, 0.13, 0, 6), cyl(0.012, 0.012, 0.16, 0xf2a03d, 0.03, 0.13, 0, 6),
    ball(0.12, 0xf4f2ec, -0.02, 0.3, 0, 1.9, 0.95, 1, 14),
    put(new THREE.ConeGeometry(0.07, 0.16, 8), 0x9aa3ab, -0.2, 0.32, 0, 0, 0, Math.PI / 2),
    box(0.26, 0.02, 0.1, 0x8f989f, -0.06, 0.34, 0.083, 0.25), box(0.26, 0.02, 0.1, 0x8f989f, -0.06, 0.34, -0.083, -0.25),
    ball(0.075, 0xf4f2ec, 0.17, 0.41, 0), put(new THREE.ConeGeometry(0.024, 0.09, 8), 0xf5c03a, 0.25, 0.4, 0, 0, 0, -Math.PI / 2),
    ball(0.013, 0x111111, 0.21, 0.43, 0.055, 1, 1, 1, 6), ball(0.013, 0x111111, 0.21, 0.43, -0.055, 1, 1, 1, 6),
  ],
  can: () => [
    cyl(0.115, 0.125, 0.26, 0x3f9a6b, -0.06, 0.13, 0, 16), ring(0.116, 0.012, 0x2f7a52, -0.06, 0.26, 0),
    cyl(0.016, 0.028, 0.3, 0x3f9a6b, 0.12, 0.2, 0, 8, 0, 0, -0.9), cyl(0.045, 0.02, 0.05, 0x2f7a52, 0.23, 0.32, 0, 10, 0, 0, -0.9),
    ring(0.085, 0.014, 0x2f7a52, -0.1, 0.26, 0, 0, 0, Math.PI, 12),
  ],
  barrel: () => [
    lathe([[0.001, 0], [0.29, 0], [0.32, 0.12], [0.345, 0.3], [0.35, 0.46], [0.345, 0.62], [0.32, 0.8], [0.29, 0.92], [0.001, 0.92]], 18, [WOOD, WOOD2, 0xb07f48]),
    ring(0.322, 0.016, IRON, 0, 0.12, 0, Math.PI / 2, 0, Math.PI * 2, 24), ring(0.344, 0.016, IRON, 0, 0.34, 0, Math.PI / 2, 0, Math.PI * 2, 24),
    ring(0.344, 0.016, IRON, 0, 0.58, 0, Math.PI / 2, 0, Math.PI * 2, 24), ring(0.322, 0.016, IRON, 0, 0.8, 0, Math.PI / 2, 0, Math.PI * 2, 24),
    cyl(0.28, 0.28, 0.012, 0xc39257, 0, 0.915, 0, 18),
  ],
  crate: () => {
    const g: G[] = [box(0.66, 0.58, 0.66, 0x5e4126, 0, 0.32, 0)];
    for (let i = 0; i < 3; i++) {
      const y = 0.11 + i * 0.205, c = i % 2 ? WOOD : WOOD2;
      g.push(box(0.7, 0.17, 0.03, c, 0, y, 0.345), box(0.7, 0.17, 0.03, c, 0, y, -0.345), box(0.03, 0.17, 0.7, c, 0.345, y, 0), box(0.03, 0.17, 0.7, c, -0.345, y, 0));
    }
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) g.push(box(0.06, 0.64, 0.06, DARK, x * 0.33, 0.32, z * 0.33));
    for (let i = 0; i < 4; i++) g.push(box(0.16, 0.03, 0.68, i % 2 ? WOOD2 : WOOD, -0.255 + i * 0.17, 0.625, 0));
    g.push(box(0.5, 0.06, 0.008, 0x2a5d9a, 0, 0.32, 0.362));
    return g;
  },
  chair: () => {
    const g: G[] = [box(0.46, 0.04, 0.44, 0xd9a066, 0, 0.45, 0.01)];
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) g.push(cyl(0.016, 0.016, 0.45, 0x2f5544, x * 0.19, 0.225, z * 0.19, 6));
    g.push(cyl(0.016, 0.016, 0.47, 0x2f5544, -0.19, 0.68, -0.2, 6), cyl(0.016, 0.016, 0.47, 0x2f5544, 0.19, 0.68, -0.2, 6));
    for (const y of [0.62, 0.74, 0.86]) g.push(box(0.4, 0.06, 0.02, 0xd9a066, 0, y, -0.21));
    g.push(box(0.4, 0.015, 0.015, 0x2f5544, 0, 0.2, 0.19), box(0.015, 0.015, 0.38, 0x2f5544, -0.19, 0.2, 0), box(0.015, 0.015, 0.38, 0x2f5544, 0.19, 0.2, 0));
    return g;
  },
  sack: () => [
    ball(0.26, 0xc9ab7a, 0, 0.3, 0, 1.08, 1.17, 0.8, 14), cyl(0.07, 0.11, 0.14, 0xbfa070, 0, 0.6, 0, 10),
    ring(0.075, 0.016, 0x7a5a32, 0, 0.6, 0), ball(0.06, 0xc9ab7a, 0, 0.645, 0, 1.2, 0.6, 1.2, 8),
    box(0.3, 0.12, 0.01, 0x9a6b3a, 0, 0.32, 0.205, -0.05),
  ],
  churn: () => [
    lathe([[0.001, 0], [0.19, 0], [0.2, 0.03], [0.2, 0.44], [0.17, 0.52], [0.11, 0.58], [0.1, 0.66], [0.001, 0.66]], 18, [0xc7cdd1, 0xb9c0c5]),
    ring(0.2, 0.012, 0x9aa3a9, 0, 0.1, 0), ring(0.2, 0.012, 0x9aa3a9, 0, 0.4, 0),
    cyl(0.115, 0.12, 0.05, 0xaab2b8, 0, 0.685, 0, 14), cyl(0.03, 0.03, 0.03, 0x6f787e, 0, 0.725, 0, 8),
    ring(0.045, 0.01, 0x6f787e, 0.15, 0.56, 0, 0, 0, Math.PI * 2, 10), ring(0.045, 0.01, 0x6f787e, -0.15, 0.56, 0, 0, 0, Math.PI * 2, 10),
  ],
  trap: () => {
    const g: G[] = [box(0.76, 0.04, 0.6, 0x2e4a52, 0, 0.02, 0)];
    for (const x of [-0.35, 0, 0.35]) g.push(ring(0.29, 0.014, 0x2e4a52, x, 0.04, 0, 0, Math.PI / 2, Math.PI, 14));
    for (const a of [0.35, 0.8, 1.2, 1.57, 1.95, 2.35, 2.8]) g.push(cyl(0.009, 0.009, 0.72, 0x3d6a5f, 0, 0.04 + Math.sin(a) * 0.29, Math.cos(a) * 0.29, 5, 0, 0, Math.PI / 2));
    g.push(put(new THREE.CylinderGeometry(0.28, 0.28, 0.7, 14, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), 0x4f7d63, 0, 0.04, 0));
    g.push(ball(0.07, 0xff8a1c, 0.2, 0.35, 0.06), cyl(0.006, 0.006, 0.2, 0xe9e2d0, 0.1, 0.3, 0.05, 4, 0, 0, 1.2));
    return g;
  },
  bench: () => {
    const g: G[] = [];
    for (const z of [0.14, 0, -0.14]) g.push(box(1.76, 0.035, 0.12, z ? WOOD : WOOD2, 0, 0.45, z));
    g.push(box(1.76, 0.1, 0.03, WOOD, 0, 0.63, -0.27, -0.15), box(1.76, 0.1, 0.03, WOOD2, 0, 0.78, -0.29, -0.15));
    for (const x of [-0.8, 0.8]) {
      g.push(box(0.05, 0.45, 0.05, IRON, x, 0.225, 0.2), box(0.05, 0.45, 0.05, IRON, x, 0.225, -0.2));
      g.push(box(0.05, 0.05, 0.48, IRON, x, 0.6, -0.02), box(0.05, 0.05, 0.05, IRON, x, 0.5, 0.2));
      g.push(box(0.05, 0.44, 0.05, IRON, x, 0.64, -0.28, -0.15), box(0.05, 0.04, 0.46, IRON, x, 0.42, 0));
    }
    return g;
  },
  barrow: () => [
    box(0.86, 0.26, 0.56, 0x3b8a52, -0.03, 0.44, 0), box(0.8, 0.02, 0.5, 0x23553a, -0.03, 0.565, 0),
    box(0.06, 0.2, 0.6, 0x2f7445, 0.38, 0.47, 0, 0, 0, 0.5),
    cyl(0.17, 0.17, 0.07, 0x222222, 0.6, 0.17, 0, 18, Math.PI / 2), cyl(0.06, 0.06, 0.09, 0x9aa3a9, 0.6, 0.17, 0, 10, Math.PI / 2),
    box(0.4, 0.03, 0.03, IRON, 0.42, 0.24, 0.11, 0, 0, 0.35), box(0.4, 0.03, 0.03, IRON, 0.42, 0.24, -0.11, 0, 0, 0.35),
    cyl(0.022, 0.022, 0.62, 0x8a5a32, -0.45, 0.5, 0.24, 8, 0, 0, Math.PI / 2 - 0.12), cyl(0.022, 0.022, 0.62, 0x8a5a32, -0.45, 0.5, -0.24, 8, 0, 0, Math.PI / 2 - 0.12),
    box(0.04, 0.3, 0.04, IRON, -0.32, 0.15, 0.2), box(0.04, 0.3, 0.04, IRON, -0.32, 0.15, -0.2),
  ],
  cart: () => {
    const g: G[] = [box(1.16, 0.56, 0.7, 0xfff4e6, 0, 0.55, 0), box(1.18, 0.12, 0.72, 0xff8fb1, 0, 0.6, 0), box(1.2, 0.05, 0.74, 0x8fd3f4, 0, 0.855, 0)];
    g.push(cyl(0.22, 0.22, 0.06, 0x2c3035, 0.36, 0.22, 0.38, 16, Math.PI / 2), cyl(0.22, 0.22, 0.06, 0x2c3035, 0.36, 0.22, -0.38, 16, Math.PI / 2));
    g.push(cyl(0.07, 0.07, 0.07, 0xd8dde0, 0.36, 0.22, 0.38, 8, Math.PI / 2), cyl(0.07, 0.07, 0.07, 0xd8dde0, 0.36, 0.22, -0.38, 8, Math.PI / 2));
    g.push(box(0.05, 0.27, 0.05, IRON, -0.45, 0.135, 0.25), box(0.05, 0.27, 0.05, IRON, -0.45, 0.135, -0.25));
    g.push(cyl(0.02, 0.02, 0.6, 0x9aa3a9, -0.66, 0.86, 0, 8, Math.PI / 2), box(0.12, 0.03, 0.03, 0x9aa3a9, -0.62, 0.86, 0.3), box(0.12, 0.03, 0.03, 0x9aa3a9, -0.62, 0.86, -0.3));
    g.push(cyl(0.018, 0.018, 0.42, 0xe9e2d0, 0.1, 1.08, 0, 6));
    // зонтик: полосатый, из восьми долек
    for (let i = 0; i < 8; i++) g.push(put(new THREE.ConeGeometry(0.41, 0.13, 3, 1, true, (i * Math.PI) / 4, Math.PI / 4), i % 2 ? 0xffffff : 0xf05d7a, 0.1, 1.285, 0));
    g.push(ball(0.03, 0xf05d7a, 0.1, 1.32, 0, 1, 1, 1, 8));
    for (const [x, c] of [[-0.3, 0xffb3c7], [-0.12, 0xfff1a8], [0.32, 0xa8f0d0]] as const) {
      g.push(put(new THREE.ConeGeometry(0.035, 0.1, 8), 0xd9a066, x, 0.93, 0.18, Math.PI), ball(0.045, c, x, 0.99, 0.18, 1, 1, 1, 8));
    }
    return g;
  },
  pallet: () => {
    const g: G[] = [];
    for (const z of [-0.39, 0, 0.39]) g.push(box(1.18, 0.1, 0.1, DARK, 0, 0.05, z));
    for (let i = 0; i < 6; i++) g.push(box(0.14, 0.03, 0.88, i % 2 ? WOOD : WOOD2, -0.5 + i * 0.2, 0.115, 0));
    const card = [0xc8a171, 0xbf9563, 0xd0aa7a, 0xc49b69];
    for (let i = 0; i < 4; i++) g.push(box(0.56, 0.4, 0.42, card[i], (i % 2 ? 0.29 : -0.29), 0.33, (i < 2 ? 0.215 : -0.215)));
    g.push(box(0.56, 0.4, 0.42, 0xc49b69, -0.29, 0.73, 0.215), box(0.56, 0.4, 0.42, 0xd0aa7a, 0.29, 0.73, -0.215));
    g.push(ball(0.2, 0xc9ab7a, 0.3, 0.74, 0.2, 1.3, 0.62, 0.95, 10));
    g.push(box(0.012, 0.82, 0.88, 0x2a5d9a, 0, 0.53, 0), box(1.18, 0.82, 0.012, 0x2a5d9a, 0, 0.53, 0));
    return g;
  },
};

let cache: Record<HideKind, G> | null = null;

/** Геометрия вида (одна на все экземпляры). */
export function propGeometry(kind: HideKind): G {
  if (!cache) {
    cache = {} as Record<HideKind, G>;
    for (const k of HIDE_KINDS) {
      const merged = mergeGeometries(BUILD[k](), false)!;
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      cache[k] = merged;
    }
  }
  return cache[kind];
}
