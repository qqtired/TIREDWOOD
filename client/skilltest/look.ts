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
