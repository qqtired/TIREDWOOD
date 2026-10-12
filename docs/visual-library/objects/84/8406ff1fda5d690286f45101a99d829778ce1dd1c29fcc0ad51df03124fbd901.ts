// «Выше облаков»: палитра, материалы и строительные кирпичики Небесной каланчи. Язык цвета один на всю трассу:
// синие борта — твёрдо и безопасно, жёлтое — подбросит, красно-белое — ударит, зелёный флаг — точка сохранения.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SkyPalette } from '../render/sky.ts';

/** Яркий день над облаками: солнце высоко, небо синее, внизу — белое море облаков. */
export const SKY_DAY: SkyPalette = {
  sunDir: new THREE.Vector3(-0.42, 0.8, 0.43).normalize(),
  horizon: 0xe6f3ff,
  mid: 0xa9d4ff,
  zenith: 0x4b94ea,
  sunGlow: 0xfff3d8,
  cloud: [0.86, 0.9, 0.98],
  cloudLit: [1.12, 1.1, 1.06],
  clouds: { cover: 0.6, alpha: 0.8, top: 0.5 },
  stars: 0,
  deep: 0x5c8fb8,
  shallow: 0x8fc2e0,
  exposure: 1.0,
  fogNear: 170,
  fogFar: 1300,
  sun: 1,
};

export const C = {
  wood: 0xd9b27a,
  woodDark: 0x9c6b3e,
  safe: 0x3f8ad4,
  safeLight: 0x7fb8ec,
  trim: 0xf6f1e6,
  plaster: 0xf2e6cf,
  brick: 0xb6553f,
  brickDark: 0x8f3f2f,
  roof: 0x3f8f7a,
  glass: 0x2d4f73,
  red: 0xe23b30,
  white: 0xffffff,
  yellow: 0xffcf2e,
  green: 0x37b24d,
  steel: 0x6f7c86,
  bronze: 0xc9973d,
  canvas: 0xf7f1e4,
  wicker: 0xa8743d,
  tar: 0x5b6166,
} as const;

/** Красно-белые полосы (ловушки): по диагонали, чтобы читались и в движении. */
let stripes: THREE.CanvasTexture | null = null;
export function stripeTexture(): THREE.CanvasTexture {
  if (stripes) return stripes;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#e23b30';
  for (let i = -128; i < 256; i += 64) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 32, 0);
    g.lineTo(i + 32 + 128, 128);
    g.lineTo(i + 128, 128);
    g.closePath();
    g.fill();
  }
  stripes = new THREE.CanvasTexture(c);
  stripes.colorSpace = THREE.SRGBColorSpace;
  stripes.wrapS = stripes.wrapT = THREE.RepeatWrapping;
  stripes.anisotropy = 4;
  return stripes;
}

/** Доски настила: светлое дерево с щелями между досками. */
let planks: THREE.CanvasTexture | null = null;
export function plankTexture(): THREE.CanvasTexture {
  if (planks) return planks;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    const l = 0.92 + ((i * 37) % 11) / 100;
    g.fillStyle = `rgb(${Math.round(255 * l)},${Math.round(236 * l)},${Math.round(205 * l)})`;
    g.fillRect(0, i * 32, 256, 32);
    g.fillStyle = 'rgba(90,60,30,0.35)';
    g.fillRect(0, i * 32, 256, 2);
    g.fillStyle = 'rgba(120,80,40,0.10)';
    for (let k = 0; k < 6; k++) g.fillRect(((i * 53 + k * 41) % 256), i * 32 + 6 + ((k * 7) % 18), 30 + ((k * 13) % 40), 1);
  }
  planks = new THREE.CanvasTexture(c);
  planks.colorSpace = THREE.SRGBColorSpace;
  planks.wrapS = planks.wrapT = THREE.RepeatWrapping;
  planks.anisotropy = 4;
  return planks;
}

export type MatKey = 'wood' | 'paint' | 'plaster' | 'brick' | 'metal' | 'roof' | 'glass' | 'cloth' | 'deck' | 'glow';

export function makeMaterials(): Record<MatKey, THREE.Material> {
  const std = (rough: number, metal = 0, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal, ...extra });
  return {
    wood: std(0.85),
    paint: std(0.55),
    plaster: std(0.92),
    brick: std(0.9),
    metal: std(0.38, 0.55),
    roof: std(0.6, 0.15),
    glass: std(0.18, 0.1),
    cloth: std(0.95, 0, { side: THREE.DoubleSide }),
    deck: std(0.82, 0, { map: plankTexture() }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
}

type V3 = [number, number, number];

function paintGeo(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const n = src.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  src.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return src;
}

const up = new THREE.Vector3(0, 1, 0);

/** Сборщик статики: части по материалам, в конце — по одной сетке на материал. */
export class Batch {
  private readonly parts = new Map<MatKey, THREE.BufferGeometry[]>();

  add(key: MatKey, g: THREE.BufferGeometry, color: number): void {
    const list = this.parts.get(key) ?? [];
    if (key !== 'deck') g.deleteAttribute('uv');
    list.push(paintGeo(g, color));
    this.parts.set(key, list);
  }

  box(key: MatKey, color: number, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, ry = 0): void {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    if (ry) g.rotateY(ry);
    g.translate(cx, cy, cz);
    this.add(key, g, color);
  }

  /** Бокс по углам */
  span(key: MatKey, color: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    this.box(key, color, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0);
  }

  cyl(key: MatKey, color: number, x: number, y: number, z: number, r: number, h: number, seg = 10, r2 = r): void {
    const g = new THREE.CylinderGeometry(r2, r, h, seg);
    g.translate(x, y, z);
    this.add(key, g, color);
  }

  /** Балка-цилиндр от a до b */
  beam(key: MatKey, color: number, a: V3, b: V3, r: number, seg = 6): void {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    if (len < 1e-4) return;
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    const q = new THREE.Quaternion().setFromUnitVectors(up, vb.clone().sub(va).normalize());
    g.applyQuaternion(q);
    g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    this.add(key, g, color);
  }

  /** Настил: верх — доски (текстура), борта — синие, снизу — тёмная балка. */
  deck(x0: number, x1: number, z0: number, z1: number, top: number, h: number, side: number = C.safe): void {
    const g = new THREE.BoxGeometry(x1 - x0, 0.06, z1 - z0);
    // доски вдоль длинной стороны, 1 м текстуры = 4 доски
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ((x1 - x0) / 2), uv.getY(i) * ((z1 - z0) / 2));
    g.translate((x0 + x1) / 2, top - 0.03, (z0 + z1) / 2);
    this.add('deck', g, 0xffffff);
    this.span('paint', side, x0, top - Math.min(h, 0.5), z0, x1, top - 0.06, z1);
    if (h > 0.5) this.span('wood', C.woodDark, x0 + 0.08, top - h, z0 + 0.08, x1 - 0.08, top - 0.5, z1 - 0.08);
    // белая кромка — край виден издалека
    const e = 0.07;
    this.span('paint', C.trim, x0 - 0.01, top - 0.11, z0 - 0.01, x1 + 0.01, top - 0.04, z0 + e);
    this.span('paint', C.trim, x0 - 0.01, top - 0.11, z1 - e, x1 + 0.01, top - 0.04, z1 + 0.01);
    this.span('paint', C.trim, x0 - 0.01, top - 0.11, z0, x0 + e, top - 0.04, z1);
    this.span('paint', C.trim, x1 - e, top - 0.11, z0, x1 + 0.01, top - 0.04, z1);
  }

  /** Деревянные козлы под настилом — вниз в облака. */
  trestle(x: number, z: number, top: number, bottom = -24): void {
    this.beam('wood', C.woodDark, [x, bottom, z], [x, top, z], 0.13, 6);
  }

  flush(parent: THREE.Object3D, mats: Record<MatKey, THREE.Material>, shadows = true): void {
    for (const [key, list] of this.parts) {
      if (!list.length) continue;
      const g = mergeGeometries(list, false);
      if (!g) continue;
      const mesh = new THREE.Mesh(g, mats[key]);
      mesh.castShadow = shadows && key !== 'glow' && key !== 'glass';
      mesh.receiveShadow = shadows && key !== 'glow';
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
    }
    this.parts.clear();
  }
}

/** Пушистое облако из шаров: белое сверху, голубоватое снизу. */
export function puffGeometry(rx: number, ry: number, rz: number, seed: number, balls = 9): THREE.BufferGeometry {
  let s = seed >>> 0;
  const rnd = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const list: THREE.BufferGeometry[] = [];
  for (let i = 0; i < balls; i++) {
    const a = rnd() * Math.PI * 2;
    const d = i === 0 ? 0 : 0.35 + rnd() * 0.55;
    const r = (i === 0 ? 0.75 : 0.42 + rnd() * 0.35) * Math.min(rx, rz);
    const g = new THREE.IcosahedronGeometry(r, 2);
    g.scale(1, ry / Math.min(rx, rz), 1);
    g.translate(Math.cos(a) * d * rx, (rnd() - 0.2) * ry * 0.5, Math.sin(a) * d * rz);
    const pos = g.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      const y = pos.getY(k);
      const l = THREE.MathUtils.clamp(0.82 + (y / ry) * 0.25, 0.74, 1.04);
      col[k * 3] = l * 0.97;
      col[k * 3 + 1] = l * 0.985;
      col[k * 3 + 2] = Math.min(1.04, l * 1.03);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    list.push(g.index ? g.toNonIndexed() : g);
  }
  return mergeGeometries(list, false)!;
}

// ---------------------------------------------------------------- облака-площадки (участок 5)

/**
 * Цвета облака-площадки (sRGB). Белое море вокруг — ровно белое, поэтому площадка другая: тёплый золотистый верх («твёрдое»),
 * белые бока, голубое брюшко; кант — голубая кромка безопасной площадки, перед растаиванием краснеет.
 */
export const CLOUD = {
  top: 0xffd993,
  topSoft: 0xffecc6,
  side: 0xf6f8ff,
  belly: 0x8fb4e8,
  bellyLow: 0x7ba3e3,
  rim: C.safe,
  rimWarn: 0xe5522b,
  glow: 0xffcc57,
} as const;

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Скруглённый квадрат со стороной 2h, центр в нуле (в плоскости x–y). */
function roundedSquare<T extends THREE.Path>(p: T, h: number, r: number): T {
  p.moveTo(-h + r, -h);
  p.lineTo(h - r, -h);
  p.absarc(h - r, -h + r, r, -Math.PI / 2, 0, false);
  p.lineTo(h, h - r);
  p.absarc(h - r, h - r, r, 0, Math.PI / 2, false);
  p.lineTo(-h + r, h);
  p.absarc(-h + r, h - r, r, Math.PI / 2, Math.PI, false);
  p.lineTo(-h, -h + r);
  p.absarc(-h + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
  return p;
}

/**
 * Облако, на которое прыгают: ровная «подушка» под ногами (верх — на y = −0,015, ноль — верх площадки), вокруг пушистая кайма
 * из шаров, снизу голубое брюшко. Один меш, цвета в вершинах: верх золотистый, бока белые, низ голубеет к самому дну.
 * half — половина стороны площадки, м.
 */
export function cloudPadGeometry(seed: number, half: number): THREE.BufferGeometry {
  const rnd = seeded(seed);
  const cTop = new THREE.Color(CLOUD.top), cSoft = new THREE.Color(CLOUD.topSoft), cSide = new THREE.Color(CLOUD.side);
  const cBelly = new THREE.Color(CLOUD.belly), cLow = new THREE.Color(CLOUD.bellyLow);
  const smooth = THREE.MathUtils.smoothstep, clamp = THREE.MathUtils.clamp;
  const TOP = -0.015, BOT = -0.95;
  const parts: THREE.BufferGeometry[] = [];
  const finish = (g: THREE.BufferGeometry, paint: (y: number, ny: number, out: THREE.Color) => void): void => {
    const geo = g.index ? g.toNonIndexed() : g;
    geo.deleteAttribute('uv');
    const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal');
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      paint(pos.getY(i), nor.getY(i), c);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(geo);
  };
  // подушка: верх ровный и тёплый, бока светлеют к белому, низ голубой
  const paintPad = (y: number, ny: number, out: THREE.Color): void => {
    if (ny > 0.7) out.copy(cTop);
    else if (ny < -0.7) out.copy(cBelly);
    else out.copy(cSoft).lerp(cSide, clamp((TOP - y) / 0.3, 0, 1)).lerp(cBelly, smooth(TOP - y, 0.2, 0.32) * 0.35);
  };
  // шары: от золотистой кромки у верха к белому и голубому брюшку внизу
  const paintPuff = (y: number, ny: number, out: THREE.Color): void => {
    const t = clamp((y - BOT) / (TOP - BOT), 0, 1);
    out.copy(cLow).lerp(cBelly, smooth(t, 0, 0.3)).lerp(cSide, smooth(t, 0.3, 0.72)).lerp(cSoft, smooth(t, 0.8, 1) * 0.6);
    if (ny < -0.15) out.lerp(cBelly, clamp(-ny, 0, 1) * 0.45);
  };
  const puff = (x: number, z: number, top: number, rx: number, ry: number, rz: number, detail: number): void => {
    const g = new THREE.IcosahedronGeometry(1, detail);
    g.scale(rx, ry, rz);
    g.translate(x, top - ry, z);
    finish(g, paintPuff);
  };
  const pad = new THREE.ExtrudeGeometry(roundedSquare(new THREE.Shape(), half + 0.04, 0.55), {
    depth: 0.16, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 2, curveSegments: 6,
  });
  pad.rotateX(-Math.PI / 2);
  pad.translate(0, TOP - 0.23, 0);
  finish(pad, paintPad);
  // нижнее брюшко под подушкой и кучки пониже — объём и голубая тень
  puff(0, 0, -0.1, half * 1.05, 0.36, half * 1.05, 2);
  for (let i = 0; i < 5; i++) {
    const a = rnd() * Math.PI * 2, d = half * (0.25 + rnd() * 0.7);
    puff(Math.cos(a) * d, Math.sin(a) * d, -0.42 - rnd() * 0.1, 0.5 + rnd() * 0.3, 0.22 + rnd() * 0.08, 0.5 + rnd() * 0.3, 1);
  }
  // пушистая кайма по кругу: вровень с подушкой или чуть ниже, дальше от середины — чуть выше
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = ((i + (rnd() - 0.5) * 0.5) / n) * Math.PI * 2;
    const d = half * (1.12 + rnd() * 0.3);
    const r = 0.62 + rnd() * 0.34;
    puff(Math.cos(a) * d, Math.sin(a) * d, -0.07 + (d > 1.8 ? rnd() * 0.12 : 0), r, 0.3 + rnd() * 0.1, r * (0.85 + rnd() * 0.3), 2);
  }
  const geo = mergeGeometries(parts, false)!;
  geo.computeBoundingSphere();
  return geo;
}

/** Плоский кант-рамка по краю верха: тонкое скруглённое кольцо в плоскости x–z, смотрит вверх. */
export function cloudFrameGeometry(outer: number, inner: number): THREE.BufferGeometry {
  const shape = roundedSquare(new THREE.Shape(), outer, 0.5);
  shape.holes.push(roundedSquare(new THREE.Path(), inner, Math.max(0.1, 0.5 - (outer - inner))));
  const g = new THREE.ShapeGeometry(shape, 6);
  g.rotateX(-Math.PI / 2);
  g.deleteAttribute('uv');
  return g;
}

/** Мягкое пятно: белое в середине, прозрачное по краю (цвет задаёт материал). */
let softDisc: THREE.CanvasTexture | null = null;
export function softDiscTexture(): THREE.CanvasTexture {
  if (softDisc) return softDisc;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.78, 'rgba(255,255,255,0.14)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  softDisc = new THREE.CanvasTexture(c);
  softDisc.colorSpace = THREE.SRGBColorSpace;
  return softDisc;
}

/**
 * Шеврон «сюда»: V с остриём вниз, толщина k (по вертикали), плечо поднимается на r, полуширина a; margin > 0 — обводка шире
 * на столько. Центр по высоте — в нуле, выдавлен назад на depth (лицом к +z).
 */
export function chevronGeometry(a: number, r: number, k: number, margin: number, depth: number): THREE.ExtrudeGeometry {
  const sl = r / a;
  const dv = margin / (a / Math.hypot(a, r));
  const ax = a + margin;
  const lo = (x: number): number => sl * Math.abs(x) - dv;
  const up = (x: number): number => k + sl * Math.abs(x) + dv;
  const shape = new THREE.Shape();
  shape.moveTo(-ax, lo(ax));
  shape.lineTo(0, lo(0));
  shape.lineTo(ax, lo(ax));
  shape.lineTo(ax, up(ax));
  shape.lineTo(0, up(0));
  shape.lineTo(-ax, up(ax));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.translate(0, -(k + r) / 2, 0);
  return g;
}

/** Подпись на табличке (canvas → текстура). */
export function signTexture(title: string, sub: string, w = 512, h = 192, bg = '#2f5f8f'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(0, 0, w, h, 26);
  g.fill();
  g.strokeStyle = '#f6f1e6';
  g.lineWidth = 8;
  g.beginPath();
  g.roundRect(8, 8, w - 16, h - 16, 20);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${title.length > 12 ? 52 : 64}px Rubik, sans-serif`;
  g.fillText(title, w / 2, sub ? h * 0.4 : h / 2, w - 40);
  if (sub) {
    g.fillStyle = '#d8ecff';
    g.font = '500 32px Rubik, sans-serif';
    g.fillText(sub, w / 2, h * 0.76, w - 40);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
