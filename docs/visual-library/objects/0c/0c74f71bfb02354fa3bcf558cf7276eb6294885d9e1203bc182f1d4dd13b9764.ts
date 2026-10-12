// Земля фермы: две рисованные текстуры (холст при входе, без картинок и data:) и две сетки.
// Ближняя — 80 × 78 м вокруг фермы, ≈ 4 см на пиксель: пятна разных оттенков зелени, подстриженная трава у дорожек
// и участков, дорожки с мягким краем и камешками, мощёный круг у колодца, вытоптанные площадки у костра и Древа,
// мягкие тени под кустами и камнями. Дальняя — до горизонта: луг за забором с лёгкими буграми, холмы с полосами полей,
// живые изгороди, дороги в город и для Фургона. На юге — обрыв к морю (его сетку склеивает decor.ts).
import * as THREE from 'three';
import { makeRng } from '../../../shared/math.ts';
import { FIRE_R, PEDESTAL_R, type FarmZones } from './zones.ts';

// ------------------------------------------------------------ шум

function hash2(ix: number, iz: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed + 1, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Плавный шум 0..1 */
export function vnoise(x: number, z: number, seed = 0): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function fbm(x: number, z: number, seed = 0, oct = 3): number {
  let s = 0;
  let a = 0.5;
  let n = 0;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += vnoise(x * f, z * f, seed + i * 17) * a;
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------ палитра (sRGB 0..1)

type RGB = [number, number, number];
const hex = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: RGB, a = 1): string => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

const G_DARK = hex(0x5e8a43);
const G_LIGHT = hex(0xa2bd65);
const G_LUSH = hex(0x55874a);
const G_DRY = hex(0xb9b06a);
const MEADOW = hex(0x8a9650);
const DIRT = hex(0xc6a477);
const DIRT_LIGHT = hex(0xd9be8f);
const DIRT_EDGE = hex(0xa79d68);
const SOIL = hex(0x7f6447);
const MOWN = hex(0xa6c26a);

/** Цвет травы в точке (sRGB) — общий у земли и у пучков, чтобы пучки не выделялись пятнами */
export function grassRGB(x: number, z: number): RGB {
  const n1 = fbm(x / 11, z / 11, 1, 3);
  const n2 = fbm(x / 3.6 + 40, z / 3.6 - 20, 2, 3);
  const n3 = fbm(x / 30 - 9, z / 30 + 5, 3, 2);
  let c = mix(G_DARK, G_LIGHT, smooth(0.3, 0.68, n1));
  c = mix(c, G_LUSH, smooth(0.46, 0.28, n2) * 0.6);
  c = mix(c, G_DRY, smooth(0.55, 0.72, n3) * 0.55);
  return c;
}

/** Луг за забором — та же трава, но некошеная: темнее и в олив */
export function meadowRGB(x: number, z: number): RGB {
  return mix(grassRGB(x, z), MEADOW, 0.4);
}

// ------------------------------------------------------------ рельеф

/** Ближняя земля (ровная, y = 0): x −40…40, z −40…38; на юге за ней обрыв */
export const NEAR = { x0: -40, x1: 40, z0: -40, z1: 38 };
/** Дальняя земля до горизонта */
export const FAR = { x0: -470, x1: 470, z0: -480, z1: 38 };
/** Высота обрыва: море под ним (world.ts, SEA_DROP 14) */
export const CLIFF_BOTTOM = -16;

/** Насколько точка дальше ровного квадрата фермы */
function farFrom(x: number, z: number): number {
  const dx = Math.max(Math.abs(x) - 40, 0);
  const dn = Math.max(-40 - z, 0);
  return Math.hypot(dx, dn);
}

/** Высота земли: ровно внутри, за фермой — мягкие бугры, дальше — холмы */
export function heightAt(x: number, z: number): number {
  const d = farFrom(x, z);
  if (d <= 0) return 0;
  const near = smooth(0, 26, d);
  const bumps = (fbm(x / 24 + 3, z / 24 - 7, 7, 3) - 0.42) * 2.6 * near;
  const big = smooth(30, 280, d);
  const hills = big * (10 + 46 * fbm(x / 150 + 1.3, z / 150 + 2.1, 8, 3)) * (0.75 + 0.25 * vnoise(x / 60, z / 60, 9));
  return bumps + hills;
}

// ------------------------------------------------------------ холсты

interface Canvas2D {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

function makeCanvas(w: number, h: number): Canvas2D {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

/** Холст в метрах: x → вправо, z → вниз */
function worldTransform(ctx: CanvasRenderingContext2D, W: number, H: number, r: { x0: number; x1: number; z0: number; z1: number }): void {
  const kx = W / (r.x1 - r.x0);
  const kz = H / (r.z1 - r.z0);
  ctx.setTransform(kx, 0, 0, kz, -r.x0 * kx, -r.z0 * kz);
}

/** Пятна травы: шум считается на грубой сетке и растягивается сглаживанием */
function paintBase(ctx: CanvasRenderingContext2D, W: number, H: number, r: { x0: number; x1: number; z0: number; z1: number }, n: number,
  color: (x: number, z: number) => RGB): void {
  const nw = n;
  const nh = Math.max(2, Math.round((n * H) / W));
  const small = makeCanvas(nw, nh);
  const img = small.ctx.createImageData(nw, nh);
  for (let j = 0; j < nh; j++) {
    for (let i = 0; i < nw; i++) {
      const x = r.x0 + ((i + 0.5) / nw) * (r.x1 - r.x0);
      const z = r.z0 + ((j + 0.5) / nh) * (r.z1 - r.z0);
      const c = color(x, z);
      const o = (j * nw + i) * 4;
      img.data[o] = c[0] * 255;
      img.data[o + 1] = c[1] * 255;
      img.data[o + 2] = c[2] * 255;
      img.data[o + 3] = 255;
    }
  }
  small.ctx.putImageData(img, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small.canvas, 0, 0, W, H);
}

/** Мелкая «травяная» рябь: плитка из штрихов, кладётся поверх пятен */
function grainTile(seed: number, size: number, count: number): HTMLCanvasElement {
  const t = makeCanvas(size, size);
  const rng = makeRng(seed);
  const light = hex(0xcfe08e);
  const dark = hex(0x46703a);
  for (let i = 0; i < count; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const l = 1 + rng() * 2.5;
    const a = -Math.PI / 2 + (rng() - 0.5) * 1.2;
    t.ctx.strokeStyle = css(rng() < 0.5 ? light : dark, 0.2 + rng() * 0.3);
    t.ctx.lineWidth = 0.8 + rng() * 0.6;
    t.ctx.beginPath();
    t.ctx.moveTo(x, y);
    t.ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    t.ctx.stroke();
  }
  return t.canvas;
}

function grain(ctx: CanvasRenderingContext2D, W: number, H: number, tile: HTMLCanvasElement, alpha: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = ctx.createPattern(tile, 'repeat')!;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------ ближняя земля

/** Что ещё нарисовать на земле: мягкие тени под предметами (из раскладки decor.ts) */
export interface GroundMarks {
  /** x, z, радиус, сила 0..1 */
  shadows: [number, number, number, number][];
  /** вытоптанные места под скамейками: x, z, yaw, длина, ширина */
  worn: [number, number, number, number, number][];
  /** цветочные куртины: x, z, радиус — трава под ними сочнее */
  lush: [number, number, number][];
}

function strokeSegs(ctx: CanvasRenderingContext2D, zones: FarmZones, extra: number, color: string, scale = 1, kinds: readonly string[] = ['dirt']): void {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of zones.segs) {
    if (!kinds.includes(s.kind)) continue;
    ctx.lineWidth = Math.max(0.05, s.hw * 2 * scale + extra);
    ctx.beginPath();
    ctx.moveTo(s.ax, s.az);
    ctx.lineTo(s.bx, s.bz);
    ctx.stroke();
  }
  if (!kinds.includes('dirt')) return;
  for (const a of zones.arcs) {
    ctx.lineWidth = a.hw * 2 * scale + extra;
    ctx.beginPath();
    ctx.arc(a.cx, a.cz, a.r, a.t0, a.t1);
    ctx.stroke();
  }
}

function softCircle(ctx: CanvasRenderingContext2D, x: number, z: number, r0: number, r1: number, inner: string, outer: string): void {
  const g = ctx.createRadialGradient(x, z, r0, x, z, r1);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, z, r1, 0, Math.PI * 2);
  ctx.fill();
}

export function paintNear(zones: FarmZones, marks: GroundMarks, size: number): HTMLCanvasElement {
  const W = size;
  const H = size;
  // холст квадратный 80 × 80 м: z −40…40, сетка берёт −40…38
  const R = { x0: NEAR.x0, x1: NEAR.x1, z0: NEAR.z0, z1: NEAR.z0 + (NEAR.x1 - NEAR.x0) };
  const { canvas, ctx } = makeCanvas(W, H);
  const B = zones.L.bounds;
  const rng = makeRng(77);
  paintBase(ctx, W, H, R, size >= 2048 ? 320 : 200, (x, z) => {
    const out = Math.min(x - B.minX, B.maxX - x, z - B.minZ);
    return mix(grassRGB(x, z), MEADOW, 0.4 * smooth(-0.2, -1.4, out));
  });
  grain(ctx, W, H, grainTile(5, 128, 1400), 1);
  worldTransform(ctx, W, H, R);

  // подсолнуховая полоса за северным забором
  ctx.fillStyle = css(hex(0x7f8c3c), 0.35);
  ctx.fillRect(-40, -40, 80, 3.4);

  // подстриженный круг у колодца: полосы косилки, к кольцу гаснут
  ctx.save();
  ctx.rotate(Math.PI / 4);
  const fade = ctx.createRadialGradient(0, 0, 9, 0, 0, 18.5);
  fade.addColorStop(0, 'rgba(250,255,214,0.085)');
  fade.addColorStop(1, 'rgba(250,255,214,0)');
  ctx.fillStyle = fade;
  for (let v = -20; v < 20; v += 3.2) ctx.fillRect(v, -20, 1.6, 40);
  ctx.restore();

  // подстриженная трава вдоль дорожек и вокруг участков
  ctx.globalAlpha = 1;
  strokeSegs(ctx, zones, 2.4, css(MOWN, 0.16));
  strokeSegs(ctx, zones, 1.2, css(MOWN, 0.16));
  ctx.lineJoin = 'round';
  for (let i = 0; i < zones.plots.length; i++) {
    const p = zones.plots[i];
    ctx.save();
    ctx.translate(p.x, p.z);
    ctx.rotate(-p.yaw);
    ctx.strokeStyle = css(MOWN, 0.2);
    ctx.lineWidth = 2.4;
    ctx.strokeRect(-zones.hw, -zones.hl, zones.hw * 2, zones.hl * 2);
    ctx.restore();
  }

  // сочная трава под цветочными куртинами
  for (const [x, z, r] of marks.lush) softCircle(ctx, x, z, 0, r * 1.4, css(G_LUSH, 0.32), css(G_LUSH, 0));

  // дворы участков: стриженый газон полосами, земля под грядками, тропинка посередине
  const pl = zones.L.plotLocal;
  for (let i = 0; i < zones.plots.length; i++) {
    const p = zones.plots[i];
    ctx.save();
    ctx.translate(p.x, p.z);
    ctx.rotate(-p.yaw);
    const hw = zones.hw - 0.05;
    const hl = zones.hl - 0.05;
    ctx.fillStyle = css(mix(MOWN, G_DARK, 0.25), 0.55);
    ctx.fillRect(-hw, -hl, hw * 2, hl * 2);
    ctx.fillStyle = 'rgba(255,255,220,0.07)';
    for (let x = -hw; x < hw; x += 1.2) ctx.fillRect(x, -hl, 0.6, hl * 2);
    // земля под грядками — с мягким краем
    for (const b of pl.beds) {
      for (const [grow, a] of [[0.55, 0.25], [0.3, 0.45], [0.12, 0.85]] as const) {
        const s = pl.bedSize / 2 + grow;
        ctx.fillStyle = css(SOIL, a);
        roundRect(ctx, b.x - s, b.z - s, s * 2, s * 2, 0.35);
        ctx.fill();
      }
    }
    // тропинка от калитки вглубь
    const path = pl.path;
    for (const [grow, a, c] of [[0.35, 0.3, DIRT_EDGE], [0.1, 0.9, DIRT], [-0.35, 0.3, DIRT_LIGHT]] as const) {
      ctx.fillStyle = css(c, a);
      roundRect(ctx, path.x0 - grow, path.z0 - grow, path.x1 - path.x0 + grow * 2, path.z1 - path.z0 + grow * 2 + 0.2, 0.3);
      ctx.fill();
    }
    // тень плетня
    ctx.strokeStyle = 'rgba(40,52,24,0.16)';
    ctx.lineWidth = 0.35;
    ctx.strokeRect(-zones.hw, -zones.hl, zones.hw * 2, zones.hl * 2);
    ctx.restore();
  }

  // дорожки: мягкий край в несколько проходов, светлая натоптанная середина, колеи и камешки
  strokeSegs(ctx, zones, 1.3, css(DIRT_EDGE, 0.22), 1, ['dirt', 'worn']);
  strokeSegs(ctx, zones, 0.55, css(DIRT_EDGE, 0.45));
  strokeSegs(ctx, zones, 0, css(DIRT, 0.96));
  strokeSegs(ctx, zones, 0, css(DIRT_LIGHT, 0.35), 0.45);
  strokeSegs(ctx, zones, 0, css(mix(DIRT, DIRT_EDGE, 0.4), 0.55), 0.8, ['worn']);
  // колея Фургона: две полосы земли по траве
  for (const s of zones.segs) {
    if (s.kind !== 'track') continue;
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    const nx = -(s.bz - s.az) / len;
    const nz = (s.bx - s.ax) / len;
    for (const o of [-0.72, 0.72]) {
      for (const [w, c, a] of [[0.85, DIRT_EDGE, 0.3], [0.42, DIRT, 0.85]] as const) {
        ctx.strokeStyle = css(c, a);
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(s.ax + nx * o, s.az + nz * o);
        ctx.lineTo(s.bx + nx * o, s.bz + nz * o);
        ctx.stroke();
      }
    }
  }
  // колеи на дороге в город
  const road = zones.L.paths.road.points;
  for (const o of [-0.62, 0.62]) {
    ctx.strokeStyle = css(mix(DIRT, SOIL, 0.35), 0.35);
    ctx.lineWidth = 0.34;
    ctx.beginPath();
    for (let i = 0; i < road.length; i++) {
      const a = road[Math.max(0, i - 1)];
      const b = road[Math.min(road.length - 1, i + 1)];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const nx = -(b[1] - a[1]) / len;
      const nz = (b[0] - a[0]) / len;
      const x = road[i][0] + nx * o;
      const z = road[i][1] + nz * o;
      if (i === 0) ctx.moveTo(x, z);
      else ctx.lineTo(x, z);
    }
    ctx.stroke();
  }
  // камешки на дорожках
  const pebble = [hex(0xe8dcc0), hex(0xa48a66), hex(0xcfc3aa), hex(0x8f7a5c)];
  for (const s of zones.segs) {
    if (s.kind !== 'dirt') continue;
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    const n = Math.round(len * s.hw * 4);
    for (let i = 0; i < n; i++) {
      const t = rng();
      const o = (rng() * 2 - 1) * s.hw * 0.92;
      const nx = -(s.bz - s.az) / len;
      const nz = (s.bx - s.ax) / len;
      ctx.fillStyle = css(pebble[(rng() * pebble.length) | 0], 0.55 + rng() * 0.35);
      ctx.beginPath();
      ctx.ellipse(s.ax + (s.bx - s.ax) * t + nx * o, s.az + (s.bz - s.az) * t + nz * o, 0.025 + rng() * 0.05, 0.02 + rng() * 0.04, rng() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const a of zones.arcs) {
    const n = Math.round(a.r * (a.t1 - a.t0) * a.hw * 4);
    for (let i = 0; i < n; i++) {
      const t = a.t0 + rng() * (a.t1 - a.t0);
      const r = a.r + (rng() * 2 - 1) * a.hw * 0.92;
      ctx.fillStyle = css(pebble[(rng() * pebble.length) | 0], 0.55 + rng() * 0.35);
      ctx.beginPath();
      ctx.ellipse(a.cx + Math.cos(t) * r, a.cz + Math.sin(t) * r, 0.025 + rng() * 0.05, 0.02 + rng() * 0.04, rng() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  farRoads(ctx);

  // задняя тропка вдоль забора — едва заметная
  ctx.strokeStyle = css(DIRT_EDGE, 0.16);
  ctx.lineWidth = 1.1;
  roundRect(ctx, -34.4, -34.4, 68.8, 68.8, 4);
  ctx.stroke();

  // вытоптанные площадки: у костра и вокруг пьедестала Древа, места под скамейками
  const f = zones.fire;
  softCircle(ctx, f.x, f.z, FIRE_R - 0.6, FIRE_R + 0.5, css(DIRT_EDGE, 0.55), css(DIRT_EDGE, 0));
  softCircle(ctx, f.x, f.z, 0, FIRE_R, css(DIRT, 0.92), css(mix(DIRT, DIRT_EDGE, 0.5), 0.8));
  softCircle(ctx, f.x, f.z, 0.2, 1.4, 'rgba(70,62,54,0.55)', 'rgba(70,62,54,0)');
  const pd = zones.pedestal;
  softCircle(ctx, pd.x, pd.z, PEDESTAL_R - 0.7, PEDESTAL_R + 0.5, css(DIRT_EDGE, 0.5), css(DIRT_EDGE, 0));
  softCircle(ctx, pd.x, pd.z, 0, PEDESTAL_R, css(mix(DIRT, DIRT_EDGE, 0.25), 0.88), css(mix(DIRT, DIRT_EDGE, 0.6), 0.7));
  for (const [x, z, yaw, l, w] of marks.worn) {
    ctx.save();
    ctx.translate(x, z);
    ctx.rotate(-yaw);
    for (const [g, a] of [[0.5, 0.3], [0.2, 0.6]] as const) {
      ctx.fillStyle = css(mix(DIRT, DIRT_EDGE, 0.5), a);
      roundRect(ctx, -l / 2 - g, -w / 2 - g, l + g * 2, w + g * 2, w / 2 + g);
      ctx.fill();
    }
    ctx.restore();
  }

  // мощёный круг у колодца: кольца булыжников, мокрые пятна у корыт
  const ap = zones.apron;
  softCircle(ctx, ap.x, ap.z, ap.r - 0.2, ap.r + 0.55, 'rgba(120,112,96,0.45)', 'rgba(120,112,96,0)');
  ctx.fillStyle = css(hex(0x958d80));
  ctx.beginPath();
  ctx.arc(ap.x, ap.z, ap.r, 0, Math.PI * 2);
  ctx.fill();
  const cob = [hex(0xcbc3b3), hex(0xb7ae9d), hex(0xd6cfbf), hex(0xaaa192), hex(0xc2b7a2)];
  for (let r = 1.32; r < ap.r - 0.1; r += 0.4) {
    const n = Math.floor((Math.PI * 2 * r) / 0.44);
    const t0 = rng() * Math.PI;
    for (let k = 0; k < n; k++) {
      const t = t0 + (k / n) * Math.PI * 2 + (rng() - 0.5) * 0.05;
      const x = ap.x + Math.cos(t) * (r + (rng() - 0.5) * 0.05);
      const z = ap.z + Math.sin(t) * (r + (rng() - 0.5) * 0.05);
      const c = cob[(rng() * cob.length) | 0];
      ctx.fillStyle = css(c);
      ctx.beginPath();
      ctx.ellipse(x, z, 0.2 + rng() * 0.02, 0.165 + rng() * 0.02, t + Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,245,0.22)';
      ctx.beginPath();
      ctx.ellipse(x - 0.04, z - 0.04, 0.1, 0.07, t + Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  softCircle(ctx, ap.x, ap.z, 1.05, 1.7, 'rgba(60,56,50,0.4)', 'rgba(60,56,50,0)');
  for (const t of zones.L.troughs) softCircle(ctx, (t.x + t.use.x) / 2, (t.z + t.use.z) / 2, 0, 0.95, 'rgba(70,80,92,0.32)', 'rgba(70,80,92,0)');

  // тени под забором и перилами
  ctx.strokeStyle = 'rgba(40,52,24,0.14)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(B.minX, B.minZ, B.maxX - B.minX, B.maxZ - B.minZ);

  // мягкие тени под кустами, камнями, сеном, стволами
  for (const [x, z, r, k] of marks.shadows) softCircle(ctx, x, z, 0, r, `rgba(34,48,22,${0.42 * k})`, 'rgba(34,48,22,0)');
  for (const t of zones.trees) softCircle(ctx, t.x, t.z, 0, 1.3, 'rgba(34,48,22,0.3)', 'rgba(34,48,22,0)');

  // за перилами — сухая трава у края обрыва
  ctx.fillStyle = css(G_DRY, 0.22);
  ctx.fillRect(-40, 36.6, 80, 1.6);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ------------------------------------------------------------ дальняя земля: луг, поля, изгороди, дороги

const FIELDS: { base: RGB; row: RGB; rows: number; dots?: RGB }[] = [
  { base: hex(0xd6b55f), row: hex(0xc29a48), rows: 1.6 }, // пшеница
  { base: hex(0xbfc062), row: hex(0xa8ab50), rows: 1.8 }, // поспевает
  { base: hex(0x8db552), row: hex(0x6f9a42), rows: 1.4 }, // зелёные всходы
  { base: hex(0x6e9a46), row: hex(0x5a8a3c), rows: 2.2 }, // люцерна
  { base: hex(0xa27e58), row: hex(0x8a6a48), rows: 1.1 }, // пашня
  { base: hex(0x9a8ac2), row: hex(0x6f8a5a), rows: 1.5 }, // лаванда
  { base: hex(0xa79f6a), row: hex(0x557f3a), rows: 2.6, dots: hex(0x4f7a36) }, // виноградник
  { base: hex(0x7fa04a), row: hex(0xe2bf35), rows: 1.3, dots: hex(0xe8c63a) }, // подсолнух
];

/** Сколько дальних деревьев (кипарис ≈ 320 треугольников, липа ≈ 1000) */
const FAR_TREES = 84;

export interface FarFeatures {
  /** Деревья у изгородей и рощицы: x, z, вид */
  trees: { x: number; z: number; kind: 'cypress' | 'linden' | 'apple' }[];
  /** Рулоны сена на скошенных полях */
  bales: { x: number; z: number; yaw: number }[];
}

/** Дороги за воротами: в город (на запад к берегу) и для Фургона (на восток) */
export const FAR_ROADS: readonly (readonly [number, number])[][] = [
  [[-36, -27], [-60, -30], [-110, -18], [-170, 4], [-260, 22], [-470, 30]],
  [[36, 27], [60, 30], [120, 20], [200, 26], [300, 12], [470, 18]],
];

function roadDist(x: number, z: number): number {
  let d = Infinity;
  for (const r of FAR_ROADS) {
    for (let i = 0; i + 1 < r.length; i++) {
      const s = { ax: r[i][0], az: r[i][1], bx: r[i + 1][0], bz: r[i + 1][1] };
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const t = Math.min(1, Math.max(0, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz)));
      d = Math.min(d, Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t)));
    }
  }
  return d;
}

export function paintFar(W: number, H: number, feats: FarFeatures): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(W, H);
  const R = FAR;
  paintBase(ctx, W, H, R, 512, meadowRGB);
  grain(ctx, W, H, grainTile(9, 64, 260), 0.6);
  worldTransform(ctx, W, H, R);
  const rng = makeRng(4242);

  // лоскуты полей: искажённая сетка, у фермы — луг
  const STEP = 58;
  const nx = Math.ceil((R.x1 - R.x0) / STEP) + 1;
  const nz = Math.ceil((R.z1 - R.z0) / STEP) + 1;
  const gx: number[][] = [];
  const gz: number[][] = [];
  for (let i = 0; i <= nx; i++) {
    gx.push([]);
    gz.push([]);
    for (let j = 0; j <= nz; j++) {
      gx[i].push(R.x0 + i * STEP + (rng() - 0.5) * STEP * 0.5);
      gz[i].push(R.z0 + j * STEP + (rng() - 0.5) * STEP * 0.5);
    }
  }
  const hedges: [number, number, number, number][] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const q: [number, number][] = [[gx[i][j], gz[i][j]], [gx[i + 1][j], gz[i + 1][j]], [gx[i + 1][j + 1], gz[i + 1][j + 1]], [gx[i][j + 1], gz[i][j + 1]]];
      const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4;
      const cz = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
      if (farFrom(cx, cz) < 46 || cz > 20) continue;
      // за северным забором — поле подсолнухов
      const sun = Math.abs(cx) < 95 && cz < -40 && cz > -150;
      const f = sun ? FIELDS[7] : FIELDS[(rng() * FIELDS.length) | 0];
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(q[0][0], q[0][1]);
      for (let k = 1; k < 4; k++) ctx.lineTo(q[k][0], q[k][1]);
      ctx.closePath();
      ctx.fillStyle = css(f.base, 0.94);
      ctx.fill();
      ctx.clip();
      // ряды вдоль одной из сторон лоскута
      const e = rng() < 0.5 ? 0 : 1;
      const ang = Math.atan2(q[e + 1][1] - q[e][1], q[e + 1][0] - q[e][0]);
      ctx.translate(cx, cz);
      ctx.rotate(ang);
      ctx.strokeStyle = css(f.row, 0.7);
      ctx.lineWidth = f.rows * 0.4;
      ctx.beginPath();
      for (let v = -STEP; v < STEP; v += f.rows) {
        ctx.moveTo(-STEP, v);
        ctx.lineTo(STEP, v);
      }
      ctx.stroke();
      if (f.dots) {
        ctx.fillStyle = css(f.dots, 0.9);
        for (let v = -STEP; v < STEP; v += f.rows) for (let u = -STEP; u < STEP; u += f.rows * 0.8) ctx.fillRect(u + rng() * 0.3, v - 0.35, 0.7, 0.7);
      }
      ctx.restore();
      for (let k = 0; k < 4; k++) if (rng() < 0.62) hedges.push([q[k][0], q[k][1], q[(k + 1) % 4][0], q[(k + 1) % 4][1]]);
      // скошенный луг — рулоны сена
      if (f === FIELDS[0] && rng() < 0.6) {
        for (let b = 0; b < 4; b++) feats.bales.push({ x: cx + (rng() - 0.5) * 30, z: cz + (rng() - 0.5) * 30, yaw: rng() * Math.PI });
      }
      if (rng() < 0.35) {
        const n = 3 + ((rng() * 4) | 0);
        const k = (rng() * 4) | 0;
        for (let t = 0; t < n; t++) feats.trees.push({ x: q[k][0] + (rng() - 0.5) * 9, z: q[k][1] + (rng() - 0.5) * 9, kind: rng() < 0.7 ? 'linden' : 'apple' });
      }
    }
  }
  // живые изгороди и кипарисы вдоль части из них
  ctx.lineCap = 'round';
  for (const [ax, az, bx, bz] of hedges) {
    ctx.strokeStyle = css(hex(0x4f7a38), 0.9);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(ax, az);
    ctx.lineTo(bx, bz);
    ctx.stroke();
    if (rng() < 0.22) {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.floor(len / 7);
      for (let t = 1; t < n; t++) feats.trees.push({ x: ax + ((bx - ax) * t) / n, z: az + ((bz - az) * t) / n, kind: 'cypress' });
    }
  }
  // дороги
  farRoads(ctx);
  // убрать деревья и сено с дорог и от фермы
  feats.trees = feats.trees.filter((t) => farFrom(t.x, t.z) > 40 && roadDist(t.x, t.z) > 6 && t.z < 30 && Math.abs(t.x) < 460 && t.z > -470);
  feats.bales = feats.bales.filter((b) => farFrom(b.x, b.z) > 40 && roadDist(b.x, b.z) > 5 && b.z < 30).slice(0, 16);
  // деревьев — не больше FAR_TREES (треугольники): ближние все, дальние через одно; лиственных — до 30
  feats.trees.sort((a, b) => farFrom(a.x, a.z) - farFrom(b.x, b.z));
  let leafy = 0;
  feats.trees = feats.trees.filter((t, i) => {
    if (t.kind !== 'cypress' && ++leafy > 22) return false;
    return i < 60 || i % 3 === 0;
  }).slice(0, FAR_TREES);
  for (const t of feats.trees) softCircle(ctx, t.x, t.z, 0, t.kind === 'cypress' ? 1.6 : 3.2, 'rgba(30,44,20,0.35)', 'rgba(30,44,20,0)');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

/** Дороги за воротами — одинаково на ближней и дальней земле, чтобы сошлись на шве */
function farRoads(ctx: CanvasRenderingContext2D): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [w, c, a] of [[4.2, DIRT_EDGE, 0.35], [2.6, DIRT, 0.9], [1.0, DIRT_LIGHT, 0.35]] as const) {
    ctx.strokeStyle = css(c, a);
    ctx.lineWidth = w;
    for (const r of FAR_ROADS) {
      ctx.beginPath();
      ctx.moveTo(r[0][0], r[0][1]);
      for (let i = 1; i < r.length; i++) ctx.lineTo(r[i][0], r[i][1]);
      ctx.stroke();
    }
  }
}

// ------------------------------------------------------------ сетки

function texture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Ровная ближняя земля: UV — по холсту paintNear (80 × 80 м от (−40; −40)) */
export function nearMesh(canvas: HTMLCanvasElement): THREE.Mesh {
  const W = NEAR.x1 - NEAR.x0;
  const D = NEAR.z1 - NEAR.z0;
  const g = new THREE.PlaneGeometry(W, D, 8, 8).rotateX(-Math.PI / 2);
  g.translate((NEAR.x0 + NEAR.x1) / 2, 0, (NEAR.z0 + NEAR.z1) / 2);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - NEAR.x0) / W, 1 - (pos.getZ(i) - NEAR.z0) / W);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: texture(canvas), roughness: 0.96 }));
  m.name = 'farm-ground-near';
  m.receiveShadow = true;
  m.matrixAutoUpdate = false;
  return m;
}

/** Ряд координат: шаг step до ±inner, дальше шаг растёт до края */
function axis(from: number, to: number, a: number, b: number, step: number, grow: number): number[] {
  const out: number[] = [];
  for (let v = a; v <= b + 1e-6; v += step) out.push(v);
  let s = step;
  let v = a;
  while (v > from) { s *= grow; v = Math.max(from, v - s); out.unshift(v); }
  s = step;
  v = out[out.length - 1];
  while (v < to) { s *= grow; v = Math.min(to, v + s); out.push(v); }
  return out;
}

/** Дальняя земля: сетка до горизонта с дырой под ближней, высота — heightAt */
export function farMesh(canvas: HTMLCanvasElement): THREE.Mesh {
  const xs = axis(FAR.x0, FAR.x1, NEAR.x0, NEAR.x1, 4, 1.09);
  const zsN = axis(FAR.z0, NEAR.z1, NEAR.z0, NEAR.z1, 4, 1.09).filter((z) => z <= NEAR.z1);
  if (zsN[zsN.length - 1] < NEAR.z1) zsN.push(NEAR.z1);
  const zs = zsN;
  const nx = xs.length;
  const nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = xs[i];
      const z = zs[j];
      pos[k * 3] = x;
      pos[k * 3 + 1] = heightAt(x, z);
      pos[k * 3 + 2] = z;
      uv[k * 2] = (x - FAR.x0) / (FAR.x1 - FAR.x0);
      uv[k * 2 + 1] = 1 - (z - FAR.z0) / (FAR.z1 - FAR.z0);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j + 1 < nz; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cz = (zs[j] + zs[j + 1]) / 2;
      if (cx > NEAR.x0 && cx < NEAR.x1 && cz > NEAR.z0 && cz < NEAR.z1) continue;
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: texture(canvas), roughness: 1 }));
  m.name = 'farm-ground-far';
  m.receiveShadow = true;
  m.matrixAutoUpdate = false;
  return m;
}

/** Обрыв к морю вдоль z = 38: скальная стенка в цвете вершин (склеивается с дальней статикой) */
export function cliffGeometry(): THREE.BufferGeometry {
  const xs: number[] = [];
  for (let x = FAR.x0; x <= FAR.x1 + 1e-6; x += 4) xs.push(x);
  const rows = 6;
  const pos: number[] = [];
  const col: number[] = [];
  const top = new THREE.Color(0xb39a74);
  const mid = new THREE.Color(0x9c8466);
  const low = new THREE.Color(0x7b6a58);
  const c = new THREE.Color();
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    for (const x of xs) {
      const h0 = heightAt(x, NEAR.z1);
      const y = h0 + (CLIFF_BOTTOM - h0) * t;
      const n = fbm(x / 6, y / 5, 31, 3);
      const z = NEAR.z1 + 0.02 + t * 2.2 + (n - 0.5) * 1.6 * Math.sin(t * Math.PI);
      pos.push(x, y, z);
      c.copy(t < 0.5 ? top : mid).lerp(t < 0.5 ? mid : low, t < 0.5 ? t * 2 : (t - 0.5) * 2).multiplyScalar(0.85 + n * 0.3);
      col.push(c.r, c.g, c.b);
    }
  }
  const nx = xs.length;
  const idx: number[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      const a = j * nx + i;
      idx.push(a, a + 1, a + nx, a + 1, a + nx + 1, a + nx);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
