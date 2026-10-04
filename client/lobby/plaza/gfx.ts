// Общие помощники оформления площади (plaza2): склейка раскрашенных частей, текстурные боксы, холсты вывесок,
// бегущие лампочки и флаги на ветру. Всё статичное клеится по материалам: десятки вызовов отрисовки, не сотни.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng } from '../../../shared/math.ts';
import { addBox, mergeColored, paint, parts, staticMesh, type GeoParts, type V3 } from '../../render/kit.ts';
import * as tex from '../../render/textures.ts';

export const FONT = 'Rubik, system-ui, sans-serif';

// ------------------------------------------------------------ холсты

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return [c, c.getContext('2d')!];
}

export function canvasTexture(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/** Строка размера size, уменьшенная, чтобы влезть в maxW; возвращает итоговый размер (кегль). */
export function fitFont(ctx: CanvasRenderingContext2D, text: string, size: number, maxW: number, weight = 900): number {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const w = ctx.measureText(text).width;
  if (w > maxW) {
    size = Math.max(8, Math.floor((size * maxW) / w));
    ctx.font = `${weight} ${size}px ${FONT}`;
  }
  return size;
}

/** Крупная надпись с обводкой и тенью. Выравнивание — по центру x, по середине y. */
export function bigText(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, maxW: number,
  fill: string, stroke: string, lineW: number, weight = 900, shadow = 'rgba(0,0,0,0.4)',
): number {
  const s = fitFont(ctx, text, size, maxW, weight);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (shadow) {
    ctx.fillStyle = shadow;
    ctx.strokeStyle = shadow;
    ctx.lineWidth = lineW;
    ctx.strokeText(text, x + s * 0.035, y + s * 0.05);
    ctx.fillText(text, x + s * 0.035, y + s * 0.05);
  }
  if (lineW > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineW;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  return s;
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Крапинки краски и потёртости: плотность n точек на 10 000 пикселей. */
export function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, light = 'rgba(255,255,255,0.08)', dark = 'rgba(0,0,0,0.1)', n = 14): void {
  const rng = makeRng(seed);
  const count = Math.round((w * h * n) / 10000);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = rng() < 0.5 ? light : dark;
    const s = 1 + rng() * 3;
    ctx.fillRect(rng() * w, rng() * h, s, s * (0.5 + rng()));
  }
}

/** Доски по горизонтали: тёмные швы через каждые step пикселей. */
export function plankLines(ctx: CanvasRenderingContext2D, w: number, h: number, step: number, color = 'rgba(0,0,0,0.16)'): void {
  ctx.fillStyle = color;
  for (let y = step; y < h; y += step) ctx.fillRect(0, y, w, Math.max(2, step * 0.07));
}

// ------------------------------------------------------------ склейка раскрашенных деталей

function placeEuler(g: THREE.BufferGeometry, x: number, y: number, z: number, rx: number, ry: number, rz: number): void {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  m.setPosition(x, y, z);
  g.applyMatrix4(m);
}

/** Накопитель раскрашенных частей: один меш с вершинными цветами. Углы — в порядке YXZ (как у kit.place). */
export class Mesher {
  private list: THREE.BufferGeometry[] = [];

  get size(): number {
    return this.list.length;
  }

  add(g: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0): this {
    const p = paint(g, color);
    placeEuler(p, x, y, z, rx, ry, rz);
    this.list.push(p);
    return this;
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, ry = 0, rx = 0, rz = 0): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, ry, rx, rz);
  }

  cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, color: number, seg = 10, ry = 0, rx = 0, rz = 0): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), color, x, y, z, ry, rx, rz);
  }

  cone(r: number, h: number, x: number, y: number, z: number, color: number, seg = 8, ry = 0, rx = 0, rz = 0): this {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, x, y, z, ry, rx, rz);
  }

  ball(r: number, x: number, y: number, z: number, color: number, ws = 10, hs = 8, sx = 1, sy = 1, sz = 1): this {
    const g = new THREE.SphereGeometry(r, ws, hs);
    if (sx !== 1 || sy !== 1 || sz !== 1) g.scale(sx, sy, sz);
    return this.add(g, color, x, y, z);
  }

  torus(R: number, r: number, x: number, y: number, z: number, color: number, rx = Math.PI / 2, ry = 0, rz = 0, radial = 6, tubular = 18): this {
    return this.add(new THREE.TorusGeometry(R, r, radial, tubular), color, x, y, z, ry, rx, rz);
  }

  /** Стержень от точки a до точки b (цепь, трос, жердь). */
  rod(a: V3, b: V3, r: number, color: number, seg = 6): this {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dir.length();
    if (len < 1e-6) return this;
    const p = paint(new THREE.CylinderGeometry(r, r, len, seg), color);
    const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    m.setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    p.applyMatrix4(m);
    this.list.push(p);
    return this;
  }

  /** Всё, что собрано в локальных осях другого накопителя, — сюда: повёрнутым на ry вокруг Y и сдвинутым в (x, y, z). */
  group(build: (m: Mesher) => void, x: number, y: number, z: number, ry = 0): this {
    const sub = new Mesher();
    build(sub);
    const m = new THREE.Matrix4().makeRotationY(ry);
    m.setPosition(x, y, z);
    for (const g of sub.list) {
      g.applyMatrix4(m);
      this.list.push(g);
    }
    return this;
  }

  geometry(): THREE.BufferGeometry | null {
    return this.list.length ? mergeColored(this.list) : null;
  }
}

/**
 * Облако из шаров: белая верхушка, голубоватый низ. (x, y, z) — центр, s — размер (1 ≈ 3 м шириной), stretch — вытянуто по x.
 * Кладётся в незасвеченный накопитель (Venue.flat): облако не темнеет в тени и не гаснет в грозу.
 */
export function cloud(m: Mesher, x: number, y: number, z: number, s = 1, stretch = 1.5): void {
  const puffs: Array<[number, number, number, number]> = [
    [0, 0, 0, 0.55], [-0.55, -0.1, 0.1, 0.4], [0.55, -0.12, -0.05, 0.42], [0.2, 0.28, 0.05, 0.42], [-0.25, 0.22, -0.1, 0.34], [1.0, -0.2, 0.05, 0.28], [-1.0, -0.22, 0, 0.28],
  ];
  for (const [dx, dy, dz, r] of puffs) {
    const tone = dy > 0.15 ? 0xffffff : dy > -0.15 ? 0xf0f6fc : 0xd8e6f4;
    m.ball(r * s * 1.5, x + dx * s * 1.5 * stretch, y + dy * s * 1.5, z + dz * s * 1.5, tone, 12, 8, stretch > 1 ? 1.0 : 1, 0.85, 1);
  }
}

let solidMat: THREE.MeshStandardMaterial | null = null;
/** Материал для всех раскрашенных деталей: вершинные цвета, чуть матовый. */
export function detailMaterial(wet: Wet = (m) => m): THREE.MeshStandardMaterial {
  solidMat ??= wet(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0.08 }));
  return solidMat;
}

export type Wet = <T extends THREE.MeshStandardMaterial>(m: T) => T;

export function detailMesh(m: Mesher, wet: Wet, shadows = true): THREE.Mesh | null {
  const g = m.geometry();
  if (!g) return null;
  return staticMesh(g, detailMaterial(wet), shadows);
}

// ------------------------------------------------------------ текстурные боксы (кирпич, камень, доски)

const TEX_CACHE = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = TEX_CACHE.get(key);
  if (!t) TEX_CACHE.set(key, (t = make()));
  return t;
}

const SURFACES: Record<string, { map: () => THREE.Texture; props: Partial<THREE.MeshStandardMaterialParameters> }> = {
  brick: { map: tex.brickTexture, props: { roughness: 0.92 } },
  concrete: { map: tex.concreteTexture, props: { roughness: 0.95 } },
  plank: { map: tex.plankTexture, props: { roughness: 0.85 } },
  wood: { map: tex.crateTexture, props: { roughness: 0.88 } },
  roof: { map: tex.containerTexture, props: { roughness: 0.6, metalness: 0.35 } },
};

/** Боксы с развёрткой «как у стен площади»: кирпич, камень, доски. Один меш на материал. */
export class TexBoxes {
  private readonly batch = new Map<string, GeoParts>();
  private readonly rng: () => number;

  constructor(seed = 1) {
    this.rng = makeRng(seed);
  }

  /** Бокс min…max (метры). groundY — ниже этого бокс «стоит на земле» и темнеет снизу (за домами земля на −0,6). */
  box(key: keyof typeof SURFACES, min: V3, max: V3, color: number, groundY = 0.01): this {
    let p = this.batch.get(key);
    if (!p) this.batch.set(key, (p = parts()));
    addBox(p, { min, max, color }, key, this.rng, groundY);
    return this;
  }

  get empty(): boolean {
    return this.batch.size === 0;
  }

  meshes(wet: Wet, shadows = true): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [key, p] of this.batch) {
      const s = SURFACES[key];
      const m = wet(new THREE.MeshStandardMaterial({ map: cached(key, s.map), vertexColors: true, ...s.props }));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(p.col, 3));
      g.setIndex(p.idx);
      g.computeBoundingSphere();
      out.push(staticMesh(g, m, shadows));
    }
    return out;
  }
}

// ------------------------------------------------------------ лампочки вывесок

/** Такт бегущей рамки (0 или 1): общий для всех вывесок, меняет его PlazaDress.update. */
const BULB_PHASE = { value: 0 };
export function setBulbPhase(phase: number): void {
  BULB_PHASE.value = phase;
}

let bulbMap: THREE.CanvasTexture | null = null;
/** Лампочка: яркая сердцевина и мягкий ореол. */
function bulbTexture(): THREE.CanvasTexture {
  if (bulbMap) return bulbMap;
  const [c, ctx] = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.16, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.62, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  bulbMap = canvasTexture(c);
  bulbMap.generateMipmaps = false;
  bulbMap.minFilter = THREE.LinearFilter;
  return bulbMap;
}

/**
 * Лампочки вывесок одной площадки: облако светящихся точек в два такта (на фазу 0 горят одни, на фазу 1 — другие).
 * Один вызов отрисовки на площадку; погасить всё — object.visible = false.
 */
export class Bulbs {
  private readonly pos: number[] = [];
  private readonly col: number[] = [];
  private readonly ph: number[] = [];
  object: THREE.Points | null = null;

  add(phase: 0 | 1, x: number, y: number, z: number, color: number): void {
    const c = new THREE.Color(color);
    this.pos.push(x, y, z);
    this.col.push(c.r, c.g, c.b);
    this.ph.push(phase);
  }

  build(parent: THREE.Object3D, size = 0.66): THREE.Points | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aPhase', new THREE.Float32BufferAttribute(this.ph, 1));
    const mat = new THREE.PointsMaterial({
      size, map: bulbTexture(), vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uPhase = BULB_PHASE;
      shader.vertexShader = 'uniform float uPhase;\nattribute float aPhase;\n' + shader.vertexShader.replace(
        '#include <logdepthbuf_vertex>',
        'if (abs(aPhase - uPhase) > 0.5) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);\n#include <logdepthbuf_vertex>',
      );
    };
    mat.customProgramCacheKey = () => 'plaza2-bulbs';
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 4;
    parent.add(pts);
    this.object = pts;
    return pts;
  }
}

// ------------------------------------------------------------ вывеска-«марки»

export interface MarqueeSpec {
  /** Размер панели, м */
  w: number;
  h: number;
  /** Центр панели; ry — поворот вокруг Y: плоскость смотрит в (sin ry, cos ry); 0 — на юг, к площади */
  x: number;
  y: number;
  z: number;
  ry?: number;
  /** Рисует панель (холст W × H пикселей) */
  draw: (ctx: CanvasRenderingContext2D, W: number, H: number) => void;
  /** Лампочки по периметру: цвет (0 — без лампочек), шаг, м */
  bulbs?: number;
  bulbStep?: number;
  /** Цвет рамки (0 — без рамки) */
  frame?: number;
  /** Подсветка холста (0…1) */
  glow?: number;
  /** Ореол вокруг (цвет, сила); 0 — без ореола */
  halo?: number;
  haloK?: number;
  /** Пикселей на метр */
  ppm?: number;
}

export interface MarqueeOut {
  panel: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  halo: THREE.Mesh | null;
}

export interface MarqueeCtx {
  group: THREE.Group;
  detail: Mesher;
  bulbs: Bulbs;
  signs: Map<THREE.MeshStandardMaterial, number>;
  powered: THREE.Object3D[];
}

/**
 * Расписная вывеска с рамкой и лампочками, как «АВТОМАТЫ»: панель с холстом, рамка с задней стенкой (в детали
 * места), по периметру — бегущие лампочки (общие на все вывески) и ореол. Возвращает панель — её можно перерисовать.
 */
export function marquee(c: MarqueeCtx, s: MarqueeSpec): MarqueeOut {
  const ry = s.ry ?? 0;
  const ppm = s.ppm ?? 200;
  const [cv, ctx] = makeCanvas(s.w * ppm, s.h * ppm);
  s.draw(ctx, cv.width, cv.height);
  const map = canvasTexture(cv);
  const glow = s.glow ?? 0.42;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(s.w, s.h),
    new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: glow, roughness: 0.72 }),
  );
  panel.position.set(s.x, s.y, s.z);
  panel.rotation.y = ry;
  c.group.add(panel);
  c.signs.set(panel.material, glow);

  const nx = Math.sin(ry);
  const nz = Math.cos(ry);
  const ax = Math.cos(ry);
  const az = -Math.sin(ry);
  // рамка и задняя стенка — в локальных осях панели
  const frame = s.frame;
  if (frame) {
    const t = 0.18;
    const d = 0.16;
    c.detail.group((m) => {
      m.box(s.w + t * 2 + 0.06, s.h + t * 2 + 0.06, 0.1, 0, 0, -0.07, 0x2a1d17);
      m.box(s.w + t * 2, t, d, 0, s.h / 2 + t / 2, d / 2 - 0.06, frame);
      m.box(s.w + t * 2, t, d, 0, -s.h / 2 - t / 2, d / 2 - 0.06, frame);
      m.box(t, s.h, d, -s.w / 2 - t / 2, 0, d / 2 - 0.06, frame);
      m.box(t, s.h, d, s.w / 2 + t / 2, 0, d / 2 - 0.06, frame);
    }, s.x, s.y, s.z, ry);
  }
  // лампочки по краю панели, в два такта
  if (s.bulbs) {
    const step = s.bulbStep ?? 0.36;
    const inset = s.frame ? 0.09 : 0.02;
    const pts: Array<[number, number]> = [];
    const edge = (x0: number, y0: number, x1: number, y1: number) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const k = Math.max(1, Math.round(len / step));
      for (let i = 0; i < k; i++) pts.push([x0 + ((x1 - x0) * i) / k, y0 + ((y1 - y0) * i) / k]);
    };
    const hw = s.w / 2 + inset;
    const hh = s.h / 2 + inset;
    edge(-hw, hh, hw, hh);
    edge(hw, hh, hw, -hh);
    edge(hw, -hh, -hw, -hh);
    edge(-hw, -hh, -hw, hh);
    const out = s.frame ? 0.13 : 0.06;
    const color = s.bulbs;
    pts.forEach(([lx, ly], i) => c.bulbs.add((i % 2) as 0 | 1, s.x + ax * lx + nx * out, s.y + ly, s.z + az * lx + nz * out, color));
  }
  let halo: THREE.Mesh | null = null;
  if (s.halo) {
    halo = new THREE.Mesh(
      new THREE.PlaneGeometry(s.w + 1.6, s.h + 1.6),
      new THREE.MeshBasicMaterial({
        map: tex.glowCardTexture(s.w, s.h, 0.8), color: s.halo, transparent: true, opacity: s.haloK ?? 0.3,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
      }),
    );
    halo.position.set(s.x - nx * 0.04, s.y, s.z - nz * 0.04);
    halo.rotation.y = ry;
    halo.renderOrder = 3;
    c.group.add(halo);
    c.powered.push(halo);
  }
  return { panel, halo };
}

// ------------------------------------------------------------ флаги на ветру

/** Флаги и вымпелы: один меш, волна идёт по полотнищу от древка к краю (вершинный шейдер, общее время ветра). */
export class Flags {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly col: number[] = [];
  private readonly dist: number[] = [];
  private readonly phase: number[] = [];
  private readonly idx: number[] = [];

  /**
   * Прямоугольный флаг: (x, y, z) — верхний угол у древка, w × h, угол angle — куда он тянется по ветру (0 → +X,
   * против часовой сверху), полосы сверху вниз цветами stripes.
   */
  add(x: number, y: number, z: number, w: number, h: number, stripes: readonly number[], angle = 0, phase = 0): void {
    const seg = Math.max(4, Math.round(w / 0.22));
    const dx = Math.cos(angle);
    const dz = -Math.sin(angle);
    const nx = -dz;
    const nz = dx;
    const hs = h / stripes.length;
    stripes.forEach((hex, si) => {
      const c = new THREE.Color(hex);
      const base = this.pos.length / 3;
      for (let i = 0; i <= seg; i++) {
        const d = (i / seg) * w;
        for (const yy of [y - si * hs, y - (si + 1) * hs]) {
          this.pos.push(x + dx * d, yy, z + dz * d);
          this.nor.push(nx, 0, nz);
          this.col.push(c.r, c.g, c.b);
          this.dist.push(d);
          this.phase.push(phase);
        }
      }
      for (let i = 0; i < seg; i++) {
        const a = base + i * 2;
        this.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
  }

  /** Вымпел-треугольник: основание у древка, остриё по ветру. */
  pennant(x: number, y: number, z: number, len: number, h: number, hex: number, angle = 0, phase = 0): void {
    const c = new THREE.Color(hex);
    const dx = Math.cos(angle);
    const dz = -Math.sin(angle);
    const base = this.pos.length / 3;
    const seg = 5;
    for (let i = 0; i <= seg; i++) {
      const d = (i / seg) * len;
      const half = (h / 2) * (1 - i / seg);
      for (const yy of [y + half, y - half]) {
        this.pos.push(x + dx * d, yy, z + dz * d);
        this.nor.push(-dz, 0, dx);
        this.col.push(c.r, c.g, c.b);
        this.dist.push(d);
        this.phase.push(phase);
      }
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  get empty(): boolean {
    return this.pos.length === 0;
  }

  mesh(wind: THREE.IUniform<number>, wet: Wet): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aDist', new THREE.Float32BufferAttribute(this.dist, 1));
    g.setAttribute('aPhase', new THREE.Float32BufferAttribute(this.phase, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    const mat = wet(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide }));
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = wind;
      shader.vertexShader = 'uniform float uWind;\nattribute float aDist;\nattribute float aPhase;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float fl = sin(uWind * 4.1 + aDist * 3.4 + aPhase) + 0.45 * sin(uWind * 7.3 + aDist * 5.1 + aPhase * 1.7);
        transformed += objectNormal * fl * aDist * 0.085;
        transformed.y -= aDist * aDist * 0.012;`,
      );
    };
    mat.customProgramCacheKey = () => 'plaza2-flags';
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.frustumCulled = false;
    return m;
  }
}

/** Склеить несколько раскрашенных геометрий (когда нужны разом). */
export function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  return list.length ? mergeGeometries(list, false) : null;
}

// ------------------------------------------------------------ наклейки: кляксы, рисунки на полу и стенах

let splats: THREE.Texture | null = null;

/** Наклейки из атласа клякс (4 ячейки), красятся цветом вершины: на стенах и на плитке. */
export class Decals {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly uv: number[] = [];
  private readonly col: number[] = [];
  private readonly idx: number[] = [];

  /**
   * Квадрат size × size с центром (x, y, z). Лежит на полу (floor) или висит на стене, лицом в (sin ry, cos ry).
   * cell — ячейка атласа 0…3, rot — поворот в плоскости.
   */
  floor(x: number, z: number, size: number, cell: number, hex: number, rot = 0, y = 0.02): void {
    this.push([x, y, z], [Math.cos(rot), 0, -Math.sin(rot)], [-Math.sin(rot), 0, -Math.cos(rot)], [0, 1, 0], size, cell, hex);
  }

  wall(x: number, y: number, z: number, size: number, ry: number, cell: number, hex: number, rot = 0): void {
    const ax: V3 = [Math.cos(ry), 0, -Math.sin(ry)];
    const n: V3 = [Math.sin(ry), 0, Math.cos(ry)];
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const u: V3 = [ax[0] * c, s, ax[2] * c];
    const v: V3 = [-ax[0] * s, c, -ax[2] * s];
    this.push([x, y, z], u, v, n, size, cell, hex);
  }

  private push(p: V3, u: V3, v: V3, n: V3, size: number, cell: number, hex: number): void {
    const h = size / 2;
    const c = new THREE.Color(hex);
    const ox = (cell % 2) * 0.5;
    const oy = 0.5 - Math.floor(cell / 2) * 0.5;
    const base = this.pos.length / 3;
    for (const [a, b, uu, vv] of [[-1, -1, 0, 0], [1, -1, 0.5, 0], [1, 1, 0.5, 0.5], [-1, 1, 0, 0.5]] as const) {
      this.pos.push(p[0] + (u[0] * a + v[0] * b) * h, p[1] + (u[1] * a + v[1] * b) * h, p[2] + (u[2] * a + v[2] * b) * h);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(ox + uu, oy + vv);
      this.col.push(c.r, c.g, c.b);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  get empty(): boolean {
    return this.pos.length === 0;
  }

  mesh(wet: Wet): THREE.Mesh {
    splats ??= tex.splatAtlas();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    const m = wet(new THREE.MeshStandardMaterial({
      map: splats, vertexColors: true, transparent: true, alphaTest: 0.35, depthWrite: false, roughness: 0.38,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -3,
    }));
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}

/**
 * Плоская накладка на настил: прямоугольник w × d с холстом (коврик, разметка, плитка у входа). Верх холста — на север.
 * Края режутся по альфе (alphaTest), а не смешиваются: накладка пишет глубину и лежит под кругами «Старт» (y ≥ 0,01).
 */
export function floorPad(map: THREE.Texture, cx: number, cz: number, w: number, d: number, wet: Wet, y = 0.005, order = 1): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
    wet(new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.88, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })),
  );
  m.position.set(cx, y, cz);
  m.receiveShadow = true;
  m.renderOrder = order;
  return m;
}

/** Наклейка на стену: прямоугольник w × h с холстом, лицом в (sin ry, cos ry) */
export function wallPlate(map: THREE.Texture, x: number, y: number, z: number, w: number, h: number, ry: number, glow = 0.3): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: glow, roughness: 0.78, transparent: true, alphaTest: 0.02 }),
  );
  m.position.set(x, y, z);
  m.rotation.y = ry;
  return m;
}

/** Холст w × h пикселей, нарисованный функцией, — в текстуру. */
export function paintTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, W: number, H: number) => void, repeat = false): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(w, h);
  draw(ctx, c.width, c.height);
  return canvasTexture(c, repeat);
}

// ------------------------------------------------------------ таблички одним мешем

export interface PlaqueSpec {
  /** Центр, м; плоскость смотрит в (sin ry, cos ry) */
  x: number;
  y: number;
  z: number;
  ry: number;
  w: number;
  h: number;
  /** Рисует табличку на холсте W × H пикселей (прозрачное — не рисуется: alphaTest) */
  draw: (ctx: CanvasRenderingContext2D, W: number, H: number) => void;
  /** Пикселей на метр (по умолчанию 200) */
  ppm?: number;
}

/** Много табличек (номера домов, указатели, уличные доски) — один атлас и один меш: один вызов отрисовки на все. */
export class Plaques {
  private readonly list: PlaqueSpec[] = [];

  add(p: PlaqueSpec): this {
    this.list.push(p);
    return this;
  }

  get empty(): boolean {
    return this.list.length === 0;
  }

  /** Склеить: атлас раскладывается полками, табличка с альфой режется (alphaTest) и чуть светится. */
  mesh(wet: Wet, glow = 0.22): THREE.Mesh | null {
    if (!this.list.length) return null;
    const sized = this.list.map((p) => ({ p, pw: Math.max(8, Math.round(p.w * (p.ppm ?? 200))), ph: Math.max(8, Math.round(p.h * (p.ppm ?? 200))) }));
    const order = sized.map((_, i) => i).sort((a, b) => sized[b].ph - sized[a].ph);
    const AW = 2048;
    let x = 0;
    let y = 0;
    let rowH = 0;
    const rect: Array<[number, number]> = [];
    for (const i of order) {
      const s = sized[i];
      if (x + s.pw + 2 > AW) {
        x = 0;
        y += rowH + 2;
        rowH = 0;
      }
      rect[i] = [x, y];
      x += s.pw + 2;
      rowH = Math.max(rowH, s.ph);
    }
    const AH = Math.max(16, Math.pow(2, Math.ceil(Math.log2(y + rowH + 2))));
    const [cv, ctx] = makeCanvas(AW, AH);
    sized.forEach((s, i) => {
      const [rx, ry] = rect[i];
      ctx.save();
      ctx.translate(rx, ry);
      ctx.beginPath();
      ctx.rect(0, 0, s.pw, s.ph);
      ctx.clip();
      s.p.draw(ctx, s.pw, s.ph);
      ctx.restore();
    });
    const map = canvasTexture(cv);
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    sized.forEach((s, i) => {
      const [rx, ry] = rect[i];
      const { p } = s;
      const ax = Math.cos(p.ry);
      const az = -Math.sin(p.ry);
      const nx = Math.sin(p.ry);
      const nz = Math.cos(p.ry);
      const u0 = rx / AW;
      const u1 = (rx + s.pw) / AW;
      const v1 = 1 - ry / AH;
      const v0 = 1 - (ry + s.ph) / AH;
      const base = pos.length / 3;
      for (const [sx, sy, u, v] of [[-1, -1, u0, v0], [1, -1, u1, v0], [1, 1, u1, v1], [-1, 1, u0, v1]] as const) {
        pos.push(p.x + ax * sx * (p.w / 2), p.y + sy * (p.h / 2), p.z + az * sx * (p.w / 2));
        nor.push(nx, 0, nz);
        uv.push(u, v);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, wet(new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: glow, roughness: 0.75, alphaTest: 0.4 })));
    m.matrixAutoUpdate = false;
    return m;
  }
}

/**
 * Лента-«дорожка» вдоль фасадов: прямоугольник w × d с повторяющимся по x холстом (map.repeat задаёт сколько раз), чуть выше
 * настила и ниже ковриков у входов (те лежат с большим сдвигом глубины).
 */
export function floorRibbon(map: THREE.Texture, cx: number, cz: number, w: number, d: number, wet: Wet, y = 0.003): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
    wet(new THREE.MeshStandardMaterial({ map, roughness: 0.86, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })),
  );
  m.position.set(cx, y, cz);
  m.receiveShadow = true;
  m.renderOrder = 0;
  return m;
}
