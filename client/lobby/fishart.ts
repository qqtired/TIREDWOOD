// Улов с мостков: рыба в 3D (вылетает из воды и в руках) и картинкой (карточка улова, альбом). Всё рисуется кодом:
// тело — эллиптические сечения с цветом спины и брюха, плавники — плоские треугольники, глаза — шарики; у части
// видов свои приметы (полоски скумбрии, «крылья» морского петуха, жучки осетра, корона золотой рыбки).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FISH, type FishKind } from '../../shared/fishing.ts';
import { paint } from '../render/kit.ts';

/** Приметы рыбы обычной формы: высота и толщина (доли длины), где тело выше всего (0 — хвост, 1 — нос) */
interface FishLook {
  h: number;
  w: number;
  peak: number;
  /** Тёмные волнистые полоски на спине */
  stripes?: boolean;
  /** Серебристая полоса вдоль бока */
  band?: boolean;
  /** Высокий колючий спинной плавник */
  spiky?: boolean;
  /** Большие грудные плавники-«крылья» */
  wings?: boolean;
  /** Усики под подбородком */
  barbels?: boolean;
  crown?: boolean;
  /** Светлые пятнышки на спине */
  spots?: boolean;
  /** Ряды костяных жучков (осётр) */
  scutes?: boolean;
}

const LOOK: Record<string, Partial<FishLook>> = {
  hamsa: { h: 0.2, w: 0.09, band: true },
  goby: { h: 0.27, w: 0.15, peak: 0.76 },
  scad: { h: 0.25, band: true },
  redmullet: { h: 0.27, barbels: true },
  mullet: { h: 0.24, w: 0.12 },
  mackerel: { h: 0.22, stripes: true },
  scorpion: { h: 0.3, w: 0.14, spiky: true, peak: 0.7 },
  bluefish: { h: 0.26 },
  gurnard: { h: 0.25, wings: true, peak: 0.74 },
  goldfish: { h: 0.36, w: 0.13, crown: true },
  dogfish: { spots: true },
  sturgeon: { scutes: true },
};

function lookOf(f: FishKind): FishLook {
  return { h: 0.3, w: 0.12, peak: 0.6, ...LOOK[f.id] };
}

/** Длина (у ската — размах, у сапога — высота), м: как у настоящих — корень кубический из веса; мелочь чуть крупнее. */
export function fishLength(sp: number, g: number): number {
  const f = FISH[sp];
  if (!f) return 0.3;
  const c = Math.cbrt(Math.max(1, g));
  switch (f.shape) {
    case 'long':
      return clamp(0.1 * c, 0.45, 1.3);
    case 'flat':
      return clamp(0.055 * c, 0.32, 1.2);
    case 'ray':
      return clamp(0.05 * c, 0.5, 1.4);
    case 'shark':
      return clamp(0.07 * c, 0.5, 1.8);
    case 'boot':
      return 0.42;
    case 'bottle':
      return 0.36;
    case 'eel':
      return clamp(0.09 * c, 0.5, 1.4);
    case 'sword':
      return clamp(0.075 * c, 0.8, 2.0);
    case 'angler':
      return clamp(0.06 * c, 0.4, 1.3);
    case 'chest':
      return 0.55;
    default:
      return clamp(0.065 * c, 0.26, 1.6);
  }
}

// ------------------------------------------------------------ 3D

let fishMat: THREE.MeshStandardMaterial | null = null;
let goldMat: THREE.MeshStandardMaterial | null = null;
let glassMat: THREE.MeshStandardMaterial | null = null;
/** Геометрия вида длиной 1 (кэш на всё время игры): непрозрачная часть, стекло бутылки, половина размеров */
const cache = new Map<number, { geo: THREE.BufferGeometry; glass: THREE.BufferGeometry | null; half: THREE.Vector3 }>();

/**
 * Рыба вида sp весом g граммов: длина — вдоль X (голова — к +X), спина — +Y, центр — посередине.
 * userData: len — масштаб (длина), half — половина размеров в метрах.
 */
export function makeFish3D(sp: number, g: number): THREE.Group {
  fishMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.08 });
  goldMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.8, emissive: 0x3a2600 });
  glassMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.55, depthWrite: false });
  let c = cache.get(sp);
  if (!c) {
    c = buildGeo(sp);
    cache.set(sp, c);
  }
  const grp = new THREE.Group();
  const mesh = new THREE.Mesh(c.geo, FISH[sp]?.id === 'goldfish' ? goldMat : fishMat);
  mesh.castShadow = true;
  grp.add(mesh);
  if (c.glass) {
    const glass = new THREE.Mesh(c.glass, glassMat);
    glass.renderOrder = 2;
    grp.add(glass);
  }
  const len = fishLength(sp, g);
  grp.scale.setScalar(len);
  grp.userData.len = len;
  grp.userData.half = c.half.clone().multiplyScalar(len);
  return grp;
}

function buildGeo(sp: number): { geo: THREE.BufferGeometry; glass: THREE.BufferGeometry | null; half: THREE.Vector3 } {
  const f = FISH[sp] ?? FISH[0];
  const back = new THREE.Color(f.c[0]);
  const belly = new THREE.Color(f.c[1]);
  const parts: THREE.BufferGeometry[] = [];
  let glass: THREE.BufferGeometry | null = null;
  switch (f.shape) {
    case 'long':
      longFish(parts, back, belly);
      break;
    case 'flat':
      flatFish(parts, back, belly);
      break;
    case 'ray':
      rayFish(parts, back, belly);
      break;
    case 'shark':
      sharkFish(parts, back, belly, lookOf(f));
      break;
    case 'boot':
      boot(parts, back, belly);
      break;
    case 'bottle':
      glass = bottle(parts, back, belly);
      break;
    case 'eel':
      eelFish(parts, back, belly);
      break;
    case 'sword':
      swordFish(parts, back, belly);
      break;
    case 'angler':
      anglerFish(parts, back, belly);
      break;
    case 'chest':
      chestBox(parts, back, belly);
      break;
    default:
      plainFish(parts, back, belly, lookOf(f));
  }
  const geo = mergeGeometries(parts, false)!;
  // по центру: держат за середину
  geo.computeBoundingBox();
  const box = geo.boundingBox!.clone();
  if (glass) {
    glass.computeBoundingBox();
    box.union(glass.boundingBox!);
  }
  const ctr = box.getCenter(new THREE.Vector3());
  geo.translate(-ctr.x, -ctr.y, -ctr.z);
  glass?.translate(-ctr.x, -ctr.y, -ctr.z);
  for (const p of parts) p.dispose();
  return { geo, glass, half: box.getSize(new THREE.Vector3()).multiplyScalar(0.5) };
}

type Prof = (s: number) => number;

/** Форма тела: 0 у хвоста и носа, 1 в самом высоком месте (peak), floor — толщина хвостового стебля и морды. */
function profile(peak: number, floor = 0.16, fullness = 0.75): Prof {
  const p = Math.log(0.5) / Math.log(peak);
  return (s) => floor + (1 - floor) * Math.pow(Math.sin(Math.PI * Math.pow(s, p)), fullness);
}

/**
 * Тело вдоль X от хвоста x0 до носа x1: сечения — эллипсы полувысотой hh(s) и полушириной ww(s) с центром на
 * высоте cy(s), s = 0…1 от хвоста; сверху цвет спины, снизу — брюха (переход шириной split). colorAt — свой цвет точки.
 */
function spindle(
  x0: number, x1: number, hh: Prof, ww: Prof, back: THREE.Color, belly: THREE.Color,
  opts: { n?: number; m?: number; cy?: Prof; split?: number; colorAt?: (x: number, y: number, z: number, c: THREE.Color) => void } = {},
): THREE.BufferGeometry {
  const n = opts.n ?? 20;
  const m = opts.m ?? 16;
  const cy = opts.cy ?? (() => 0);
  const split = opts.split ?? 0.3;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  const push = (x: number, y: number, z: number, t: number) => {
    pos.push(x, y, z);
    c.copy(belly).lerp(back, t);
    opts.colorAt?.(x, y, z, c);
    col.push(c.r, c.g, c.b);
  };
  push(x0, cy(0), 0, 0.5);
  for (let i = 1; i < n; i++) {
    const s = i / n;
    const x = x0 + (x1 - x0) * s;
    for (let j = 0; j < m; j++) {
      const a = (j / m) * Math.PI * 2;
      const ca = Math.cos(a);
      push(x, cy(s) + hh(s) * ca, ww(s) * Math.sin(a), smoothstep(-split, split, ca));
    }
  }
  push(x1, cy(1), 0, 0.5);
  const nose = 1 + (n - 1) * m;
  for (let j = 0; j < m; j++) {
    const j1 = (j + 1) % m;
    idx.push(0, 1 + j1, 1 + j);
    const last = 1 + (n - 2) * m;
    idx.push(nose, last + j, last + j1);
    for (let i = 0; i < n - 2; i++) {
      const a = 1 + i * m + j;
      const b = 1 + i * m + j1;
      const d = a + m;
      const cc = b + m;
      idx.push(a, b, d, b, cc, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const out = g.toNonIndexed();
  g.dispose();
  return out;
}

/** Плоский плавник (виден с обеих сторон): веер треугольников из первой точки. */
function fin(points: ReadonlyArray<readonly [number, number, number]>, color: THREE.Color): THREE.BufferGeometry {
  const pos: number[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[0];
    const b = points[i];
    const d = points[i + 1];
    pos.push(...a, ...b, ...d, ...a, ...d, ...b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return paint(g, color);
}

function ball(x: number, y: number, z: number, r: number, color: number | THREE.Color, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 10, 7);
  g.deleteAttribute('uv');
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return paint(g, color);
}

function boxAt(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number | THREE.Color): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.deleteAttribute('uv');
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return paint(g, color);
}

/** Глаза по бокам: белок и зрачок чуть наружу. */
function eyes(parts: THREE.BufferGeometry[], x: number, y: number, z: number, r: number): void {
  for (const sz of [1, -1]) {
    parts.push(ball(x, y, z * sz, r, 0xf4f1e8));
    parts.push(ball(x + r * 0.15, y, (z + r * 0.62) * sz, r * 0.6, 0x15110f));
  }
}

function darker(c: THREE.Color, k: number): THREE.Color {
  return c.clone().multiplyScalar(k);
}

/** Обычная рыба: тело, вильчатый хвост, спинной и анальный плавники, грудные, глаза; приметы вида. */
function plainFish(parts: THREE.BufferGeometry[], back: THREE.Color, belly: THREE.Color, look: FishLook): void {
  const x0 = -0.3;
  const x1 = 0.5;
  const pr = profile(look.peak);
  const hh: Prof = (s) => (look.h / 2) * pr(s);
  const ww: Prof = (s) => (look.w / 2) * pr(s);
  const xs = (s: number) => x0 + (x1 - x0) * s;
  const stripe = darker(back, 0.45);
  const silver = new THREE.Color(0xe8eef2);
  const colorAt = look.stripes
    ? (x: number, y: number, _z: number, c: THREE.Color) => {
        // волнистые полоски — только на спине
        if (y > 0.01 && Math.sin(x * 70 + Math.sin(y * 90) * 1.6) > 0.45) c.lerp(stripe, 0.8);
      }
    : look.band
      ? (_x: number, y: number, _z: number, c: THREE.Color) => {
          if (Math.abs(y) < look.h * 0.07) c.lerp(silver, 0.7);
        }
      : undefined;
  // полоски — мельче шага колец: колец нужно больше
  parts.push(spindle(x0, x1, hh, ww, back, belly, { colorAt, n: look.stripes ? 56 : 20 }));
  const finC = darker(back, 0.82);
  // хвост
  parts.push(fin([[x0 + 0.04, 0.035, 0], [x0 - 0.2, 0.16, 0], [x0 - 0.12, 0, 0], [x0 - 0.2, -0.16, 0], [x0 + 0.04, -0.035, 0]], finC));
  // спинной плавник: у ерша — высокий и колючий
  const sa = 0.42;
  const sb = 0.72;
  if (look.spiky) {
    const pts: Array<[number, number, number]> = [[xs(sa), hh(sa) * 0.9, 0]];
    for (let k = 0; k <= 6; k++) {
      const s = sb - ((sb - sa) * k) / 6;
      pts.push([xs(s) - 0.02, hh(s) + (k % 2 === 0 ? 0.12 : 0.06), 0]);
    }
    pts.push([xs(sb), hh(sb) * 0.9, 0]);
    parts.push(fin(pts, new THREE.Color(0xc0553a)));
  } else {
    parts.push(fin([[xs(sa), hh(sa) * 0.92, 0], [xs(sa) - 0.04, hh(sa) + 0.09, 0], [xs(sb), hh(sb) * 0.92, 0]], finC));
  }
  // анальный
  parts.push(fin([[xs(0.22), -hh(0.22) * 0.9, 0], [xs(0.14), -hh(0.22) - 0.05, 0], [xs(0.36), -hh(0.36) * 0.9, 0]], darker(belly, 0.85)));
  // грудные: у морского петуха — большие веера
  const sp = 0.74;
  const px = xs(sp);
  for (const sz of [1, -1]) {
    const z = ww(sp) * 0.9 * sz;
    if (look.wings) {
      parts.push(fin([[px, -0.01, z], [px - 0.3, 0.06, z + 0.14 * sz], [px - 0.34, -0.06, z + 0.16 * sz], [px - 0.22, -0.14, z + 0.1 * sz]], new THREE.Color(0x4c8fd6)));
    } else {
      parts.push(fin([[px, -0.02, z], [px - 0.12, -0.04, z + 0.05 * sz], [px - 0.08, -0.08, z + 0.03 * sz]], darker(belly, 0.8)));
    }
  }
  if (look.barbels) {
    for (const sz of [1, -1]) parts.push(fin([[0.44, -0.05, 0.015 * sz], [0.36, -0.14, 0.02 * sz], [0.4, -0.05, 0.02 * sz]], new THREE.Color(0xf0d6c0)));
  }
  eyes(parts, xs(0.88), hh(0.88) * 0.3, ww(0.88) * 0.8, 0.032);
  if (look.crown) {
    // корона золотой рыбки: обод и пять зубцов
    const cx = xs(0.72);
    const cy = hh(0.72) + 0.012;
    const gold = new THREE.Color(0xffd24a);
    const ring = new THREE.CylinderGeometry(0.05, 0.045, 0.035, 12, 1, true);
    ring.deleteAttribute('uv');
    ring.translate(cx, cy + 0.017, 0);
    parts.push(paint(ring, gold));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const cone = new THREE.ConeGeometry(0.014, 0.045, 5);
      cone.deleteAttribute('uv');
      cone.translate(cx + Math.cos(a) * 0.047, cy + 0.056, Math.sin(a) * 0.047);
      parts.push(paint(cone, gold));
    }
    parts.push(ball(cx, cy + 0.04, 0.05, 0.012, 0xe0283a));
  }
}

/** Сарган: длинный и тонкий, с клювом-иглой. */
function longFish(parts: THREE.BufferGeometry[], back: THREE.Color, belly: THREE.Color): void {
  const x0 = -0.36;
  const x1 = 0.3;
  const pr = profile(0.5, 0.25, 0.6);
  const hh: Prof = (s) => 0.04 * pr(s);
  const ww: Prof = (s) => 0.028 * pr(s);
  parts.push(spindle(x0, x1, hh, ww, back, belly, { n: 24, m: 12 }));
  parts.push(spindle(0.28, 0.5, (s) => 0.017 * Math.pow(1 - s, 0.8), (s) => 0.012 * Math.pow(1 - s, 0.8), back, belly, { n: 6, m: 8 }));
  const finC = darker(back, 0.8);
  parts.push(fin([[x0 + 0.03, 0.015, 0], [x0 - 0.1, 0.07, 0], [x0 - 0.06, 0, 0], [x0 - 0.1, -0.07, 0], [x0 + 0.03, -0.015, 0]], finC));
  parts.push(fin([[-0.24, 0.03, 0], [-0.3, 0.07, 0], [-0.17, 0.035, 0]], finC));
  parts.push(fin([[-0.24, -0.03, 0], [-0.3, -0.07, 0], [-0.17, -0.035, 0]], darker(belly, 0.85)));
  eyes(parts, 0.25, 0.01, 0.02, 0.018);
}

/** Камбала: плоская, лежит на боку — сверху тёмная в пятнышках, оба глаза сверху. */
function flatFish(parts: THREE.BufferGeometry[], back: THREE.Color, belly: THREE.Color): void {
  const x0 = -0.33;
  const x1 = 0.42;
  const pr = profile(0.55, 0.12, 0.6);
  parts.push(spindle(x0, x1, (s) => 0.04 * pr(s), (s) => 0.26 * pr(s), back, belly, { split: 0.12, m: 20 }));
  parts.push(fin([[x0 + 0.03, 0, 0.04], [x0 - 0.13, 0, 0.11], [x0 - 0.1, 0, 0], [x0 - 0.13, 0, -0.11], [x0 + 0.03, 0, -0.04]], darker(back, 0.8)));
  const dot = back.clone().lerp(new THREE.Color(0xf3e7cf), 0.45);
  const spots: Array<[number, number]> = [[-0.15, 0.1], [-0.05, -0.12], [0.06, 0.13], [0.12, -0.05], [-0.2, -0.04], [0.0, 0.02], [0.2, 0.1]];
  for (const [x, z] of spots) parts.push(ball(x, 0.032, z, 0.026, dot, 1, 0.4, 1));
  parts.push(ball(0.3, 0.034, 0.05, 0.028, 0xf4f1e8));
  parts.push(ball(0.31, 0.05, 0.05, 0.017, 0x15110f));
  parts.push(ball(0.25, 0.036, -0.04, 0.028, 0xf4f1e8));
  parts.push(ball(0.26, 0.052, -0.04, 0.017, 0x15110f));
}

/** Скат: ромб-«крылья» и длинный тонкий хвост; размах — вдоль X, хвост — вперёд (−Z). */
function rayFish(parts: THREE.BufferGeometry[], back: THREE.Color, belly: THREE.Color): void {
  const x0 = -0.28;
  const x1 = 0.28;
  const wing: Prof = (s) => {
    const d = s < 0.42 ? s / 0.42 : (1 - s) / 0.58;
    return Math.pow(Math.max(0, d), 0.85);
  };
  const local: THREE.BufferGeometry[] = [];
  local.push(spindle(x0, x1, (s) => 0.05 * Math.sqrt(Math.sin(Math.PI * s)), (s) => 0.5 * wing(s), back, belly, { split: 0.1, m: 20 }));
  local.push(spindle(-0.95, -0.25, (s) => 0.006 + 0.012 * s, (s) => 0.006 + 0.012 * s, back, belly, { n: 8, m: 6 }));
  local.push(ball(0.13, 0.04, 0.05, 0.022, 0xf4f1e8));
  local.push(ball(0.13, 0.04, -0.05, 0.022, 0xf4f1e8));
  local.push(ball(0.135, 0.052, 0.05, 0.013, 0x15110f));
  local.push(ball(0.135, 0.052, -0.05, 0.013, 0x15110f));
  for (const g of local) {
    g.rotateY(-Math.PI / 2);
    parts.push(g);
  }
}

/** Катран и осётр: вытянутое тело, острая морда, хвост с длинной верхней лопастью, два спинных плавника. */
function sharkFish(parts: THREE.BufferGeometry[], back: THREE.Color, belly: THREE.Color, look: FishLook): void {
  const x0 = -0.3;
  const x1 = look.scutes ? 0.56 : 0.5;
  const pr = profile(0.62, 0.1, 0.62);
  const hh: Prof = (s) => 0.075 * pr(s);
  const ww: Prof = (s) => 0.068 * pr(s);
  const xs = (s: number) => x0 + (x1 - x0) * s;
  parts.push(spindle(x0, x1, hh, ww, back, belly, { n: 24 }));
  const finC = darker(back, 0.85);
  parts.push(fin([[x0 + 0.05, 0.03, 0], [x0 - 0.2, 0.15, 0], [x0 - 0.08, -0.005, 0], [x0 - 0.08, -0.08, 0], [x0 + 0.04, -0.025, 0]], finC));
  parts.push(fin([[xs(0.5), hh(0.5) * 0.9, 0], [xs(0.46), hh(0.5) + 0.09, 0], [xs(0.62), hh(0.62) * 0.9, 0]], finC));
  parts.push(fin([[xs(0.2), hh(0.2) * 0.9, 0], [xs(0.17), hh(0.2) + 0.05, 0], [xs(0.28), hh(0.28) * 0.9, 0]], finC));
  const px = xs(0.72);
  for (const sz of [1, -1]) {
    const z = ww(0.72) * 0.85 * sz;
    parts.push(fin([[px, -0.03, z], [px - 0.1, -0.06, z + 0.11 * sz], [px - 0.07, -0.03, z]], finC));
  }
  eyes(parts, xs(0.86), hh(0.86) * 0.25, ww(0.86) * 0.85, 0.022);
  if (look.spots) {
    const dot = back.clone().lerp(new THREE.Color(0xffffff), 0.6);
    for (const [s, z] of [[0.3, 0.03], [0.38, -0.035], [0.47, 0.025], [0.56, -0.02], [0.66, 0.03], [0.74, -0.028]] as const) {
      parts.push(ball(xs(s), hh(s) * 0.75, z, 0.012, dot, 1, 0.5, 1));
    }
  }
  if (look.scutes) {
    // костяные жучки: ряд по спине и по ряду на боках
    const bone = belly.clone().lerp(new THREE.Color(0xffffff), 0.2);
    for (let k = 0; k < 8; k++) {
      const s = 0.18 + k * 0.085;
      const oct = (y: number, z: number) => {
        const g = new THREE.OctahedronGeometry(0.018);
        g.deleteAttribute('uv');
        g.scale(1.3, 0.8, 1);
        g.translate(xs(s), y, z);
        parts.push(paint(g, bone));
      };
      oct(hh(s) + 0.004, 0);
      oct(0, ww(s) + 0.002);
      oct(0, -ww(s) - 0.002);
    }
  }
}

/** Старый сапог с водорослью. */
function boot(parts: THREE.BufferGeometry[], leather: THREE.Color, sole: THREE.Color): void {
  parts.push(boxAt(-0.32, -0.25, -0.13, 0.02, 0.5, 0.13, leather));
  parts.push(boxAt(-0.32, -0.45, -0.13, 0.32, -0.2, 0.13, leather));
  parts.push(ball(0.31, -0.33, 0, 0.13, leather, 0.8, 0.95, 1));
  parts.push(boxAt(-0.34, -0.52, -0.14, 0.44, -0.45, 0.14, sole));
  parts.push(boxAt(-0.34, -0.6, -0.14, -0.14, -0.52, 0.14, sole));
  parts.push(boxAt(-0.29, 0.47, -0.1, -0.01, 0.505, 0.1, 0x1a1410));
  const weed = new THREE.Color(0x3f7d2c);
  parts.push(fin([[-0.2, 0.52, 0.135], [-0.12, 0.52, 0.135], [-0.05, 0.1, 0.135], [-0.12, -0.08, 0.135], [-0.17, 0.22, 0.135]], weed));
  parts.push(fin([[-0.26, 0.52, -0.135], [-0.18, 0.52, -0.135], [-0.24, 0.0, -0.135], [-0.3, 0.18, -0.135]], weed));
}

/** Бутылка с запиской: стекло — отдельной прозрачной геометрией (её и возвращаем), пробка и свёрнутая записка. */
function bottle(parts: THREE.BufferGeometry[], glassC: THREE.Color, paper: THREE.Color): THREE.BufferGeometry {
  const r: Prof = (s) => (s < 0.6 ? 0.11 : s < 0.72 ? 0.11 + (0.04 - 0.11) * smoothstep(0.6, 0.72, s) : 0.04);
  const glass = spindle(-0.42, 0.42, r, r, glassC, glassC, { n: 28, m: 16 });
  parts.push(spindle(0.39, 0.5, () => 0.037, () => 0.037, new THREE.Color(0x9a6b3e), new THREE.Color(0x8a5d33), { n: 4, m: 10 }));
  parts.push(spindle(-0.3, 0.1, () => 0.046, () => 0.046, paper, paper.clone().multiplyScalar(0.9), { n: 6, m: 10 }));
  parts.push(boxAt(-0.11, -0.05, -0.05, -0.08, 0.05, 0.05, 0xc0392b));
  return glass;
}

/** Угорь (рыбалка 2.0): длинное змеистое тело с изгибом и сплошной плавник по спине и брюху. */
function eelFish(parts: THREE.BufferGeometry[], back: THREE.Color, belly: THREE.Color): void {
  const x0 = -0.5;
  const x1 = 0.5;
  const wave: Prof = (s) => 0.035 * Math.sin(s * Math.PI * 2.2);
  const hh: Prof = (s) => 0.038 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.15 + s * 0.85)), 0.4);
  parts.push(spindle(x0, x1, hh, (s) => hh(s) * 0.8, back, belly, { n: 36, m: 10, cy: wave }));
  const finC = darker(back, 0.75);
  const pts: Array<[number, number, number]> = [];
  for (let k = 0; k <= 10; k++) {
    const s = 0.04 + k * 0.05;
    pts.push([x0 + (x1 - x0) * s, wave(s) + hh(s) + 0.012, 0]);
  }
  parts.push(fin([[x0 + 0.02, wave(0.02), 0], ...pts], finC));
  eyes(parts, 0.44, wave(0.94) + 0.01, 0.02, 0.012);
}

/** Меч-рыба (рыбалка 2.0): мощное тело, высокий серповидный спинной плавник, хвост-полумесяц и длинный «меч». */
function swordFish(parts: THREE.BufferGeometry[], back: THREE.Color, belly: THREE.Color): void {
  const x0 = -0.32;
  const x1 = 0.3;
  const pr = profile(0.6, 0.12, 0.7);
  const hh: Prof = (s) => 0.075 * pr(s);
  const ww: Prof = (s) => 0.055 * pr(s);
  parts.push(spindle(x0, x1, hh, ww, back, belly, { n: 22 }));
  parts.push(spindle(0.28, 0.62, (s) => 0.014 * (1 - s), (s) => 0.009 * (1 - s), back, back, { n: 6, m: 8 }));
  const finC = darker(back, 0.8);
  parts.push(fin([[x0 + 0.04, 0.02, 0], [x0 - 0.16, 0.2, 0], [x0 - 0.06, 0, 0], [x0 - 0.16, -0.2, 0], [x0 + 0.04, -0.02, 0]], finC));
  parts.push(fin([[0.02, 0.07, 0], [-0.02, 0.25, 0], [-0.1, 0.06, 0]], finC));
  for (const sz of [1, -1]) parts.push(fin([[0.18, -0.04, 0.04 * sz], [0.02, -0.14, 0.1 * sz], [0.1, -0.04, 0.04 * sz]], finC));
  eyes(parts, 0.24, 0.02, 0.035, 0.022);
}

/** Морской чёрт (рыбалка 2.0): огромная плоская голова с пастью, бахрома, «удочка» с огоньком на лбу. */
function anglerFish(parts: THREE.BufferGeometry[], back: THREE.Color, belly: THREE.Color): void {
  const x0 = -0.42;
  const x1 = 0.36;
  const pr = profile(0.72, 0.14, 0.55);
  const hh: Prof = (s) => 0.16 * pr(s);
  const ww: Prof = (s) => 0.2 * pr(s);
  parts.push(spindle(x0, x1, hh, ww, back, belly, { n: 20, m: 18 }));
  const finC = darker(back, 0.8);
  parts.push(fin([[x0 + 0.04, 0.03, 0], [x0 - 0.14, 0.12, 0], [x0 - 0.1, 0, 0], [x0 - 0.14, -0.12, 0], [x0 + 0.04, -0.03, 0]], finC));
  for (const sz of [1, -1]) parts.push(fin([[0.06, -0.06, 0.16 * sz], [-0.12, -0.12, 0.3 * sz], [-0.02, -0.14, 0.2 * sz]], finC));
  // пасть с зубами
  parts.push(boxAt(0.3, -0.05, -0.12, 0.37, -0.02, 0.12, 0x5a2a2a));
  for (let k = -4; k <= 4; k++) {
    const t = new THREE.ConeGeometry(0.008, 0.03, 4);
    t.deleteAttribute('uv');
    t.translate(0.345, -0.03, k * 0.026);
    parts.push(paint(t, 0xf4efe0));
  }
  // «удочка» и огонёк
  const rod = new THREE.CylinderGeometry(0.005, 0.005, 0.2, 5);
  rod.deleteAttribute('uv');
  rod.rotateZ(-0.6).translate(0.3, 0.2, 0);
  parts.push(paint(rod, darker(back, 0.7)));
  parts.push(ball(0.36, 0.29, 0, 0.026, 0xffe58a));
  eyes(parts, 0.2, 0.12, 0.09, 0.022);
}

/** Сундук (рыбалка 2.0): деревянный ящик с выпуклой крышкой, железные полосы и золотой замок. */
function chestBox(parts: THREE.BufferGeometry[], wood: THREE.Color, iron: THREE.Color): void {
  parts.push(boxAt(-0.4, -0.25, -0.24, 0.4, 0.08, 0.24, wood));
  const lid = new THREE.CylinderGeometry(0.24, 0.24, 0.8, 16, 1, false, 0, Math.PI);
  lid.deleteAttribute('uv');
  lid.rotateZ(Math.PI / 2).rotateX(Math.PI / 2).translate(0, 0.08, 0);
  parts.push(paint(lid, wood.clone().multiplyScalar(1.1)));
  for (const x of [-0.3, 0, 0.3]) {
    parts.push(boxAt(x - 0.03, -0.26, -0.25, x + 0.03, 0.09, 0.25, iron));
    const band = new THREE.CylinderGeometry(0.25, 0.25, 0.06, 16, 1, true, 0, Math.PI);
    band.deleteAttribute('uv');
    band.rotateZ(Math.PI / 2).rotateX(Math.PI / 2).translate(x, 0.08, 0);
    parts.push(paint(band, iron));
  }
  parts.push(boxAt(-0.06, -0.06, 0.24, 0.06, 0.1, 0.27, 0xd8a628));
  parts.push(ball(0, 0.02, 0.275, 0.014, 0x2a1a10));
}

// ------------------------------------------------------------ картинки

/** Цвет «ещё не поймана» в альбоме */
const SIL = '#4b3c42';

/** Рамка рисунка по формам: x от/до, y от/до (y вниз, в долях длины) */
const BOUNDS: Record<string, [number, number, number, number]> = {
  fish: [-0.52, 0.5, -0.3, 0.24],
  long: [-0.48, 0.52, -0.1, 0.1],
  flat: [-0.48, 0.44, -0.3, 0.3],
  ray: [-0.55, 0.55, -0.32, 0.62],
  shark: [-0.52, 0.56, -0.2, 0.14],
  boot: [-0.4, 0.5, -0.56, 0.62],
  bottle: [-0.46, 0.52, -0.15, 0.15],
};

/**
 * Рыба сбоку (камбала и скат — сверху) на всю канву; known = false — тёмный силуэт со знаком вопроса
 * (вид ещё не попадался). Канва — своего размера (ширина и высота в пикселях уже с учётом плотности экрана).
 */
export function drawFishIcon(canvas: HTMLCanvasElement, sp: number, known: boolean): void {
  const ctx = canvas.getContext('2d');
  const f = FISH[sp];
  if (!ctx || !f) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const [bx0, bx1, by0, by1] = BOUNDS[f.shape] ?? BOUNDS.fish;
  const k = Math.min((W * 0.92) / (bx1 - bx0), (H * 0.9) / (by1 - by0));
  ctx.setTransform(k, 0, 0, k, W / 2 - ((bx0 + bx1) / 2) * k, H / 2 - ((by0 + by1) / 2) * k);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const px = 1 / k;
  const back = css(f.c[0]);
  const belly = css(f.c[1]);
  const look = lookOf(f);
  const fill = (style: string | CanvasGradient) => {
    ctx.fillStyle = known ? style : SIL;
    ctx.fill();
  };
  const outline = () => {
    if (!known) return;
    ctx.strokeStyle = 'rgba(20, 12, 10, 0.4)';
    ctx.lineWidth = 1.4 * px;
    ctx.stroke();
  };
  const grad = (y0: number, y1: number, a = back, b = belly) => {
    const gr = ctx.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0.3, a);
    gr.addColorStop(0.7, b);
    return gr;
  };
  const poly = (pts: ReadonlyArray<readonly [number, number]>) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  };
  const eye = (x: number, y: number, r: number) => {
    if (!known) return;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#f6f2e8';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + r * 0.15, y, r * 0.58, 0, Math.PI * 2);
    ctx.fillStyle = '#15110f';
    ctx.fill();
  };
  const finC = known ? shade(f.c[0], 0.8) : SIL;

  switch (f.shape) {
    case 'long': {
      poly([[-0.34, -0.012], [-0.48, -0.07], [-0.43, 0], [-0.48, 0.07], [-0.34, 0.012]]);
      fill(finC);
      ctx.beginPath();
      ctx.moveTo(0.52, 0.004);
      ctx.lineTo(0.3, -0.012);
      ctx.bezierCurveTo(0.15, -0.045, -0.2, -0.04, -0.35, -0.012);
      ctx.lineTo(-0.35, 0.012);
      ctx.bezierCurveTo(-0.2, 0.04, 0.15, 0.04, 0.3, 0.012);
      ctx.closePath();
      fill(grad(-0.04, 0.04));
      outline();
      eye(0.26, -0.005, 0.016);
      break;
    }
    case 'flat': {
      poly([[-0.3, -0.04], [-0.47, -0.12], [-0.43, 0], [-0.47, 0.12], [-0.3, 0.04]]);
      fill(finC);
      ctx.beginPath();
      ctx.ellipse(0.04, 0, 0.38, 0.27, 0, 0, Math.PI * 2);
      fill(back);
      outline();
      if (known) {
        ctx.fillStyle = 'rgba(243, 231, 207, 0.45)';
        for (const [x, y] of [[-0.15, 0.1], [-0.05, -0.12], [0.06, 0.13], [0.12, -0.05], [-0.2, -0.04], [0.2, 0.1]]) {
          ctx.beginPath();
          ctx.arc(x, y, 0.028, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      eye(0.3, -0.05, 0.03);
      eye(0.25, 0.04, 0.03);
      break;
    }
    case 'ray': {
      ctx.beginPath();
      ctx.moveTo(0, -0.02);
      ctx.lineTo(0, 0.6);
      ctx.strokeStyle = known ? back : SIL;
      ctx.lineWidth = 0.025;
      ctx.stroke();
      poly([[0, -0.3], [0.52, 0.02], [0, 0.26], [-0.52, 0.02]]);
      fill(back);
      outline();
      eye(0.05, -0.12, 0.022);
      eye(-0.05, -0.12, 0.022);
      break;
    }
    case 'shark': {
      poly([[-0.25, -0.025], [-0.5, -0.17], [-0.38, 0.005], [-0.37, 0.09], [-0.25, 0.022]]);
      fill(finC);
      poly([[0.02, -0.06], [-0.04, -0.15], [0.12, -0.065]]);
      fill(finC);
      poly([[-0.17, -0.04], [-0.2, -0.09], [-0.1, -0.04]]);
      fill(finC);
      const nose = look.scutes ? 0.56 : 0.5;
      ctx.beginPath();
      ctx.moveTo(nose, 0.01);
      ctx.bezierCurveTo(0.38, -0.07, 0.1, -0.085, -0.1, -0.05);
      ctx.bezierCurveTo(-0.2, -0.035, -0.24, -0.03, -0.27, -0.022);
      ctx.lineTo(-0.27, 0.02);
      ctx.bezierCurveTo(-0.2, 0.03, -0.05, 0.075, 0.15, 0.07);
      ctx.bezierCurveTo(0.35, 0.065, 0.45, 0.04, nose, 0.01);
      ctx.closePath();
      fill(grad(-0.08, 0.07));
      outline();
      poly([[0.2, 0.04], [0.1, 0.14], [0.13, 0.05]]);
      fill(finC);
      if (known && look.scutes) {
        ctx.fillStyle = 'rgba(240, 236, 214, 0.9)';
        for (let i = 0; i < 8; i++) {
          ctx.beginPath();
          ctx.arc(-0.15 + i * 0.075, -0.06 + Math.abs(i - 3.5) * 0.004, 0.012, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(-0.15 + i * 0.075, 0.005, 0.01, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (known && look.spots) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        for (const [x, y] of [[-0.05, -0.03], [0.05, -0.045], [0.16, -0.04], [0.26, -0.03], [0.1, -0.015]]) {
          ctx.beginPath();
          ctx.arc(x, y, 0.009, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (known) {
        ctx.strokeStyle = 'rgba(20, 12, 10, 0.3)';
        ctx.lineWidth = 1.2 * px;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(0.27 - i * 0.025, -0.02);
          ctx.lineTo(0.26 - i * 0.025, 0.035);
          ctx.stroke();
        }
      }
      eye(look.scutes ? 0.42 : 0.38, -0.02, 0.018);
      break;
    }
    case 'boot': {
      ctx.beginPath();
      ctx.moveTo(-0.32, -0.5);
      ctx.lineTo(0.02, -0.5);
      ctx.lineTo(0.02, 0.2);
      ctx.lineTo(0.3, 0.22);
      ctx.quadraticCurveTo(0.46, 0.25, 0.44, 0.45);
      ctx.lineTo(-0.32, 0.45);
      ctx.closePath();
      fill(back);
      outline();
      poly([[-0.34, 0.45], [0.46, 0.45], [0.46, 0.52], [-0.14, 0.52], [-0.14, 0.6], [-0.34, 0.6]]);
      fill(known ? belly : SIL);
      if (known) {
        ctx.beginPath();
        ctx.moveTo(-0.2, -0.52);
        ctx.quadraticCurveTo(-0.02, -0.2, -0.1, 0.1);
        ctx.quadraticCurveTo(-0.16, -0.15, -0.26, -0.52);
        ctx.fillStyle = '#3f7d2c';
        ctx.fill();
      }
      break;
    }
    case 'bottle': {
      ctx.beginPath();
      ctx.moveTo(-0.42, -0.11);
      ctx.lineTo(0.08, -0.11);
      ctx.quadraticCurveTo(0.2, -0.11, 0.22, -0.04);
      ctx.lineTo(0.4, -0.04);
      ctx.lineTo(0.4, 0.04);
      ctx.lineTo(0.22, 0.04);
      ctx.quadraticCurveTo(0.2, 0.11, 0.08, 0.11);
      ctx.lineTo(-0.42, 0.11);
      ctx.closePath();
      ctx.globalAlpha = known ? 0.75 : 1;
      fill(back);
      ctx.globalAlpha = 1;
      outline();
      if (known) {
        ctx.fillStyle = belly;
        ctx.fillRect(-0.3, -0.045, 0.4, 0.09);
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(-0.11, -0.05, 0.03, 0.1);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.fillRect(-0.38, -0.09, 0.42, 0.025);
      }
      poly([[0.4, -0.036], [0.5, -0.036], [0.5, 0.036], [0.4, 0.036]]);
      fill('#9a6b3e');
      break;
    }
    default: {
      const hh = look.h / 2;
      // хвост, спинной и анальный плавники — под телом
      poly([[-0.28, -0.03], [-0.5, -0.17], [-0.42, 0], [-0.5, 0.17], [-0.28, 0.03]]);
      fill(finC);
      if (look.spiky) {
        const pts: Array<[number, number]> = [[0.14, -hh * 0.85]];
        for (let i = 0; i <= 6; i++) pts.push([0.12 - i * 0.045, -hh - (i % 2 === 0 ? 0.11 : 0.05)]);
        pts.push([-0.18, -hh * 0.7]);
        poly(pts);
        fill(known ? '#c0553a' : SIL);
      } else {
        poly([[0.08, -hh * 0.92], [-0.06, -hh - 0.08], [-0.18, -hh * 0.72]]);
        fill(finC);
      }
      poly([[-0.04, hh * 0.85], [-0.14, hh + 0.05], [-0.2, hh * 0.65]]);
      fill(known ? shade(f.c[1], 0.85) : SIL);
      ctx.beginPath();
      ctx.moveTo(0.48, 0.02);
      ctx.bezierCurveTo(0.42, -hh * 0.8, 0.18, -hh, -0.02, -hh * 0.92);
      ctx.bezierCurveTo(-0.17, -hh * 0.8, -0.25, -0.05, -0.3, -0.03);
      ctx.lineTo(-0.3, 0.03);
      ctx.bezierCurveTo(-0.25, 0.05, -0.17, hh * 0.75, -0.02, hh * 0.88);
      ctx.bezierCurveTo(0.18, hh * 0.98, 0.42, hh * 0.7, 0.48, 0.02);
      ctx.closePath();
      fill(grad(-hh, hh));
      if (known) {
        ctx.save();
        ctx.clip();
        if (look.stripes) {
          ctx.strokeStyle = shade(f.c[0], 0.45);
          ctx.lineWidth = 0.018;
          for (let i = 0; i < 9; i++) {
            const x = -0.24 + i * 0.075;
            ctx.beginPath();
            ctx.moveTo(x, -hh);
            ctx.quadraticCurveTo(x + 0.035, -hh * 0.5, x - 0.01, -0.005);
            ctx.stroke();
          }
        }
        if (look.band) {
          ctx.fillStyle = 'rgba(232, 238, 242, 0.85)';
          ctx.fillRect(-0.32, -0.012, 0.75, 0.024);
        }
        ctx.restore();
      }
      outline();
      if (look.wings) {
        poly([[0.18, 0.01], [-0.12, -0.04], [-0.16, 0.06], [-0.04, 0.12]]);
        ctx.globalAlpha = known ? 0.85 : 1;
        fill('#4c8fd6');
        ctx.globalAlpha = 1;
      } else {
        poly([[0.2, 0.02], [0.08, 0.05], [0.12, 0.08]]);
        fill(known ? shade(f.c[1], 0.8) : SIL);
      }
      if (known) {
        // жабры
        ctx.beginPath();
        ctx.arc(0.36, 0.0, hh * 0.65, Math.PI * 0.62, Math.PI * 1.38);
        ctx.strokeStyle = 'rgba(20, 12, 10, 0.3)';
        ctx.lineWidth = 1.3 * px;
        ctx.stroke();
      }
      if (known && look.barbels) {
        ctx.strokeStyle = '#f0d6c0';
        ctx.lineWidth = 0.012;
        ctx.beginPath();
        ctx.moveTo(0.45, 0.04);
        ctx.quadraticCurveTo(0.42, 0.12, 0.36, 0.15);
        ctx.stroke();
      }
      eye(0.38, -0.03, 0.032);
      if (known && look.crown) {
        poly([[0.08, -hh - 0.01], [0.08, -hh - 0.09], [0.12, -hh - 0.05], [0.16, -hh - 0.11], [0.2, -hh - 0.05], [0.24, -hh - 0.09], [0.24, -hh - 0.01]]);
        ctx.fillStyle = '#ffd24a';
        ctx.fill();
        ctx.strokeStyle = '#b8860b';
        ctx.lineWidth = 1.2 * px;
        ctx.stroke();
      }
    }
  }
  if (!known) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(255, 243, 222, 0.55)';
    ctx.font = `900 ${Math.round(H * 0.5)}px Rubik, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', W / 2, H / 2 + H * 0.03);
  }
}

/** Канва под картинку рыбы: css — размер на экране, внутри — с учётом плотности экрана. */
export function fishCanvas(cls: string, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.className = cls;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  return c;
}

function css(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function shade(hex: number, k: number): string {
  const c = new THREE.Color(hex).multiplyScalar(k);
  return `#${c.getHexString()}`;
}

function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
