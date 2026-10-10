// «Подземелье»: дешёвые эффекты — всё инстансами, без пост-эффектов.
// - FloorDecals: квадраты на полу с формой в шейдере (мягкое пятно, кольцо, метка-телеграф круг/полоса/сектор, конус,
//   луч, клякса варенья, лужа). Два экземпляра: обычное смешивание (тени, кляксы, лужи, метки) и сложение (свет,
//   вспышки, ударные волны). Одна отрисовка на экземпляр.
// - Billboards: квадраты лицом к камере из общего атласа (цифры урона, значки подборов, искры, пыль). Обычный и
//   аддитивный — по отрисовке.
// Позиции — уже в координатах кадра (сцена сама переводит тор в «у камеры»).
import * as THREE from 'three';

// ------------------------------------------------------------------ пол

export const D_SOFT = 0;
export const D_RING = 1;
export const D_TCIRCLE = 2;
export const D_TSTRIP = 3;
export const D_TSECTOR = 4;
export const D_CONE = 5;
export const D_BEAM = 6;
export const D_SPLAT = 7;
export const D_PUDDLE = 8;
export const D_SHADOW = 9;

const DECAL_VERT = /* glsl */ `
attribute vec3 aPos;
attribute vec3 aSize;
attribute vec4 aShape;
attribute vec4 aCol;
varying vec2 vUv;
varying vec4 vShape;
varying vec4 vCol;
varying vec2 vSize;
void main() {
  vUv = position.xz * 2.0;
  vShape = aShape;
  vCol = aCol;
  vSize = aSize.xy;
  float c = cos(aSize.z), s = sin(aSize.z);
  // полоса (луч, метка-полоса) растёт от начала вперёд: квадрат сдвинут на половину длины
  vec2 p = position.xz * aSize.xy;
  if (aShape.x == 3.0 || aShape.x == 6.0) p.y += aSize.y * 0.5;
  vec2 r = vec2(p.x * c + p.y * s, -p.x * s + p.y * c);
  vec4 wp = vec4(aPos.x + r.x, aPos.y, aPos.z + r.y, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const DECAL_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying vec4 vShape;
varying vec4 vCol;
varying vec2 vSize;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float t = vShape.x;
  float d = length(vUv);
  float a = 0.0;
  vec3 col = vCol.rgb;
  if (t == 0.0) {
    a = pow(clamp(1.0 - d, 0.0, 1.0), vShape.y);
  } else if (t == 1.0) {
    a = 1.0 - smoothstep(0.0, vShape.z, abs(d - vShape.y));
  } else if (t == 2.0) {
    // метка-круг: кромка, заливка растёт к краю, в конце — пульс
    float edge = 1.0 - smoothstep(0.0, 0.06, abs(d - 0.95));
    float fill = step(d, vShape.y) * (0.28 + 0.25 * smoothstep(vShape.y - 0.15, vShape.y, d));
    float pulse = vShape.y > 0.92 ? 0.25 + 0.25 * sin(uTime * 40.0) : 0.0;
    a = (max(edge * 0.95, fill) + pulse * step(d, 1.0)) * step(d, 1.0);
  } else if (t == 3.0) {
    // метка-полоса: v вдоль (0 — у начала), u поперёк
    float v = vUv.y * 0.5 + 0.5;
    float u = abs(vUv.x);
    float edge = max(1.0 - smoothstep(0.0, 0.08, abs(u - 0.92)), 0.0);
    float fill = step(v, vShape.y) * 0.4;
    a = max(edge * 0.9, fill) * step(u, 1.0);
  } else if (t == 4.0) {
    float ang = atan(vUv.x, vUv.y);
    float inA = step(abs(ang), vShape.z * 0.5);
    float edge = 1.0 - smoothstep(0.0, 0.05, abs(d - 0.96));
    float side = 1.0 - smoothstep(0.0, 0.03 / max(d, 0.1), abs(abs(ang) - vShape.z * 0.5));
    float fill = step(d, vShape.y) * 0.35;
    a = max(max(edge, side * step(d, 1.0)) * 0.9, fill) * inA * step(d, 1.0);
  } else if (t == 5.0) {
    // конус вспышки фонаря
    float ang = atan(vUv.x, vUv.y);
    float k = 1.0 - smoothstep(vShape.z * 0.42, vShape.z * 0.5, abs(ang));
    a = k * (1.0 - smoothstep(0.55, 1.0, d)) * (0.55 + 0.45 * d) * step(0.0, vUv.y + 0.2);
  } else if (t == 6.0) {
    float u = abs(vUv.x);
    a = exp(-u * u * 5.0) * smoothstep(-1.0, -0.85, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
  } else if (t == 7.0) {
    // клякса варенья: неровный край из гармоник
    float ang = atan(vUv.x, vUv.y);
    float seed = vShape.z;
    float rr = 0.62 + 0.13 * sin(ang * 3.0 + seed) + 0.09 * sin(ang * 7.0 + seed * 2.3) + 0.05 * sin(ang * 13.0 + seed * 5.1);
    float drops = 0.0;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float aa = hash(seed + fi) * 6.283;
      vec2 c = vec2(sin(aa), cos(aa)) * (0.72 + 0.2 * hash(seed * 1.7 + fi));
      drops = max(drops, 1.0 - smoothstep(0.08, 0.12, length(vUv - c)));
    }
    a = max(1.0 - smoothstep(rr - 0.04, rr, d), drops);
    float hl = (1.0 - smoothstep(0.0, 0.35, length(vUv - vec2(-0.2, -0.25)))) * 0.35;
    col = mix(col, vec3(0.85, 0.6, 1.0), hl);
  } else if (t == 8.0) {
    float ang = atan(vUv.x, vUv.y);
    float seed = vShape.z;
    float rr = 0.86 + 0.06 * sin(ang * 4.0 + seed + uTime * 0.6) + 0.04 * sin(ang * 9.0 + seed * 3.0 - uTime);
    a = 1.0 - smoothstep(rr - 0.06, rr, d);
    float rim = 1.0 - smoothstep(0.0, 0.1, abs(d - rr + 0.08));
    col = col + vec3(0.25, 0.1, 0.35) * rim * vShape.y + vec3(0.12) * (0.5 + 0.5 * sin(uTime * 2.0 + d * 9.0 + seed)) * (1.0 - d);
  } else {
    a = pow(clamp(1.0 - d, 0.0, 1.0), 1.4);
  }
  float alpha = a * vCol.a;
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(col * (vShape.w > 0.5 ? alpha : 1.0), vShape.w > 0.5 ? 1.0 : alpha);
}
`;

export interface DecalSpec {
  x: number;
  y: number;
  z: number;
  /** полуразмер по x и по z (для полосы — полуширина и длина) */
  sx: number;
  sz: number;
  yaw: number;
  shape: number;
  p1: number;
  p2: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Квадраты на полу, заполняются заново каждый кадр */
export class FloorDecals {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly pos: THREE.InstancedBufferAttribute;
  private readonly size: THREE.InstancedBufferAttribute;
  private readonly shape: THREE.InstancedBufferAttribute;
  private readonly col: THREE.InstancedBufferAttribute;
  private readonly mat: THREE.ShaderMaterial;
  private n = 0;
  private readonly additive: boolean;

  readonly cap: number;

  constructor(cap: number, additive: boolean, renderOrder: number) {
    this.cap = cap;
    this.additive = additive;
    const base = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    const mk = (n: number): THREE.InstancedBufferAttribute => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.pos = mk(3);
    this.size = mk(3);
    this.shape = mk(4);
    this.col = mk(4);
    g.setAttribute('aPos', this.pos);
    g.setAttribute('aSize', this.size);
    g.setAttribute('aShape', this.shape);
    g.setAttribute('aCol', this.col);
    g.instanceCount = 0;
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: DECAL_VERT,
      fragmentShader: DECAL_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      premultipliedAlpha: false,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
  }

  begin(time: number): void {
    this.n = 0;
    this.mat.uniforms.uTime.value = time;
  }

  add(x: number, y: number, z: number, sx: number, sz: number, yaw: number, shape: number, p1: number, p2: number, r: number, g: number, b: number, a: number, p3 = 0): void {
    if (this.n >= this.cap || a <= 0.003) return;
    const i = this.n++;
    const P = this.pos.array as Float32Array;
    const S = this.size.array as Float32Array;
    const H = this.shape.array as Float32Array;
    const C = this.col.array as Float32Array;
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
    S[i * 3] = sx * 2; S[i * 3 + 1] = sz * 2; S[i * 3 + 2] = yaw;
    if (shape === D_TSTRIP || shape === D_BEAM) S[i * 3 + 1] = sz;
    H[i * 4] = shape; H[i * 4 + 1] = p1; H[i * 4 + 2] = shape === D_SPLAT || shape === D_PUDDLE ? p3 : p2; H[i * 4 + 3] = this.additive ? 1 : 0;
    C[i * 4] = r; C[i * 4 + 1] = g; C[i * 4 + 2] = b; C[i * 4 + 3] = a;
  }

  end(): void {
    const n = this.n;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    for (const a of [this.pos, this.size, this.shape, this.col]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }

  get count(): number {
    return this.n;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ------------------------------------------------------------------ атлас и щиты к камере

/** Клетки атласа 8 × 4 по 64 px: цифры 0–9 (0–9), «+» (10), значки подборов (16…), мягкий круг (24), звезда (25), искра (26), кольцо (27) */
export const A_PLUS = 10;
export const A_ICON = 16;
export const A_SOFT = 24;
export const A_STAR = 25;
export const A_SPARK = 26;
export const A_RING = 27;
export const ICONS: Record<string, number> = { stew: 16, magnet: 17, keg: 18, hourglass: 19, chest: 20, skull: 21, heart: 22, bolt: 23 };
const ICON_GLYPH = ['🍲', '🧲', '🛢️', '⏳', '🎁', '💀', '❤️', '⚡'];

function makeAtlas(): THREE.CanvasTexture {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = S * 8;
  c.height = S * 4;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // цифры: белые с тёмной обводкой (цвет даёт экземпляр)
  g.font = '900 54px Rubik, system-ui, sans-serif';
  g.lineJoin = 'round';
  for (let i = 0; i < 11; i++) {
    const ch = i < 10 ? String(i) : '+';
    const x = (i % 8) * S + S / 2;
    const y = Math.floor(i / 8) * S + S / 2 + 3;
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(30,12,20,0.95)';
    g.strokeText(ch, x, y);
    g.fillStyle = '#fff';
    g.fillText(ch, x, y);
  }
  g.font = '44px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  ICON_GLYPH.forEach((ch, k) => {
    const i = 16 + k;
    g.fillText(ch, (i % 8) * S + S / 2, Math.floor(i / 8) * S + S / 2 + 2);
  });
  const cell = (i: number): [number, number] => [(i % 8) * S + S / 2, Math.floor(i / 8) * S + S / 2];
  // мягкий круг
  {
    const [x, y] = cell(A_SOFT);
    const gr = g.createRadialGradient(x, y, 0, x, y, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(x - S / 2, y - S / 2, S, S);
  }
  // звезда
  {
    const [x, y] = cell(A_STAR);
    g.fillStyle = '#fff';
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 11 : 28;
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.fill();
  }
  // искра: вытянутый ромб с ореолом
  {
    const [x, y] = cell(A_SPARK);
    const gr = g.createRadialGradient(x, y, 0, x, y, 30);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x, y - 30);
    g.lineTo(x + 7, y);
    g.lineTo(x, y + 30);
    g.lineTo(x - 7, y);
    g.fill();
  }
  // кольцо
  {
    const [x, y] = cell(A_RING);
    g.strokeStyle = '#fff';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(x, y, 24, 0, Math.PI * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

let atlas: THREE.CanvasTexture | null = null;

const BB_VERT = /* glsl */ `
attribute vec3 aPos;
attribute vec3 aSize;
attribute float aCell;
attribute vec4 aCol;
uniform vec3 uRight;
uniform vec3 uUp;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  float c = cos(aSize.z), s = sin(aSize.z);
  vec2 q = position.xy * aSize.xy;
  q = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  vec3 wp = aPos + uRight * q.x + uUp * q.y;
  float col = mod(aCell, 8.0);
  float row = floor(aCell / 8.0);
  vUv = vec2((col + position.x + 0.5) / 8.0, 1.0 - (row + 0.5 - position.y) / 4.0);
  vCol = aCol;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;
const BB_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uAdd;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vec4 t = texture2D(uMap, vUv);
  vec4 c = t * vCol;
  if (c.a < 0.01) discard;
  gl_FragColor = uAdd > 0.5 ? vec4(c.rgb * c.a, 1.0) : c;
}
`;

/** Квадраты лицом к камере, заполняются заново каждый кадр */
export class Billboards {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly pos: THREE.InstancedBufferAttribute;
  private readonly size: THREE.InstancedBufferAttribute;
  private readonly cell: THREE.InstancedBufferAttribute;
  private readonly col: THREE.InstancedBufferAttribute;
  readonly mat: THREE.ShaderMaterial;
  private n = 0;

  readonly cap: number;

  constructor(cap: number, additive: boolean, depthTest: boolean, renderOrder: number) {
    this.cap = cap;
    atlas ??= makeAtlas();
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    const mk = (n: number): THREE.InstancedBufferAttribute => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.pos = mk(3);
    this.size = mk(3);
    this.cell = mk(1);
    this.col = mk(4);
    g.setAttribute('aPos', this.pos);
    g.setAttribute('aSize', this.size);
    g.setAttribute('aCell', this.cell);
    g.setAttribute('aCol', this.col);
    g.instanceCount = 0;
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: atlas }, uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uAdd: { value: additive ? 1 : 0 } },
      vertexShader: BB_VERT,
      fragmentShader: BB_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
  }

  begin(camera: THREE.Camera): void {
    this.n = 0;
    const e = camera.matrixWorld.elements;
    (this.mat.uniforms.uRight.value as THREE.Vector3).set(e[0], e[1], e[2]).normalize();
    (this.mat.uniforms.uUp.value as THREE.Vector3).set(e[4], e[5], e[6]).normalize();
  }

  add(x: number, y: number, z: number, w: number, h: number, rot: number, cell: number, r: number, g: number, b: number, a: number): void {
    if (this.n >= this.cap || a <= 0.01) return;
    const i = this.n++;
    const P = this.pos.array as Float32Array;
    const S = this.size.array as Float32Array;
    const C = this.col.array as Float32Array;
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
    S[i * 3] = w; S[i * 3 + 1] = h; S[i * 3 + 2] = rot;
    (this.cell.array as Float32Array)[i] = cell;
    C[i * 4] = r; C[i * 4 + 1] = g; C[i * 4 + 2] = b; C[i * 4 + 3] = a;
  }

  end(): void {
    const n = this.n;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    for (const a of [this.pos, this.size, this.cell, this.col]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }

  get count(): number {
    return this.n;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ------------------------------------------------------------------ частицы и цифры (живут во времени)

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  g: number;
  life: number; max: number;
  size: number; grow: number;
  cell: number;
  r: number; gg: number; b: number;
  add: boolean;
}

interface Num {
  x: number; z: number; y: number;
  n: number;
  life: number;
  big: boolean;
  r: number; g: number; b: number;
}

/** Кольцо, вспышка, конус … на полу, живущие во времени (тор: позиции — мировые, рисуются через функцию сцены) */
export interface TimedDecal {
  x: number; z: number;
  yaw: number;
  shape: number;
  /** радиус (полуразмер) в начале и в конце, м */
  r0: number; r1: number;
  /** для луча — длина */
  len: number;
  p1: number; p2: number;
  r: number; g: number; b: number;
  a: number;
  life: number; max: number;
  add: boolean;
  seed: number;
}

/** Всё живущее во времени: частицы, цифры урона, кляксы и вспышки на полу */
export class FxPool {
  readonly parts: Particle[] = [];
  readonly nums: Num[] = [];
  readonly decals: TimedDecal[] = [];
  private seed = 1;

  rnd(): number {
    // эффекты — не симуляция: свой быстрый генератор, чтобы не трогать Math.random в горячем цикле
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  burst(x: number, y: number, z: number, n: number, speed: number, cell: number, r: number, g: number, b: number, life = 0.5, size = 0.35, add = true, grav = 6, up = 2): void {
    for (let i = 0; i < n && this.parts.length < 900; i++) {
      const a = this.rnd() * Math.PI * 2;
      const s = speed * (0.4 + this.rnd() * 0.8);
      this.parts.push({
        x, y, z,
        vx: Math.cos(a) * s, vy: up * (0.5 + this.rnd()), vz: Math.sin(a) * s,
        g: grav, life: life * (0.6 + this.rnd() * 0.6), max: life, size: size * (0.7 + this.rnd() * 0.6), grow: -0.3,
        cell, r, gg: g, b, add,
      });
    }
  }

  spark(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, cell: number, r: number, g: number, b: number, add = true, grav = 0): void {
    if (this.parts.length >= 900) return;
    this.parts.push({ x, y, z, vx, vy, vz, g: grav, life, max: life, size, grow: 0, cell, r, gg: g, b, add });
  }

  number(x: number, z: number, n: number, big: boolean, r = 1, g = 1, b = 1): void {
    if (this.nums.length > 90) {
      if (!big) return;
      this.nums.shift();
    }
    this.nums.push({ x: x + (this.rnd() - 0.5) * 0.5, z, y: big ? 2.4 : 1.8, n: Math.max(1, Math.round(n)), life: big ? 0.95 : 0.7, big, r, g, b });
  }

  decal(d: Omit<TimedDecal, 'life' | 'seed'> & { seed?: number }): void {
    if (this.decals.length > 400) this.decals.shift();
    this.decals.push({ ...d, life: d.max, seed: d.seed ?? this.rnd() * 100 });
  }

  step(dt: number): void {
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) {
        P[i] = P[P.length - 1];
        P.pop();
        continue;
      }
      p.vy -= p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.05) {
        p.y = 0.05;
        p.vy *= -0.3;
        p.vx *= 0.7;
        p.vz *= 0.7;
      }
      p.size = Math.max(0.02, p.size + p.grow * dt);
    }
    const N = this.nums;
    for (let i = N.length - 1; i >= 0; i--) {
      N[i].life -= dt;
      N[i].y += dt * (N[i].big ? 1.6 : 2.2);
      if (N[i].life <= 0) N.splice(i, 1);
    }
    const D = this.decals;
    for (let i = D.length - 1; i >= 0; i--) {
      D[i].life -= dt;
      if (D[i].life <= 0) {
        D[i] = D[D.length - 1];
        D.pop();
      }
    }
  }

  clear(): void {
    this.parts.length = 0;
    this.nums.length = 0;
    this.decals.length = 0;
  }
}
