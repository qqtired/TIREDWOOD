// Мелкие эффекты замка из заранее созданных пулов (без выделений в кадре): огни факелов и фонарей, свечение,
// искры кузни (аддитивные спрайты-квадраты, мерцают в шейдере), клубы пыли (обычная прозрачность), камешки, щепки и
// обломки досок (кубики с простой физикой: падают, отскакивают, ложатся и тают).
import * as THREE from 'three';
import { fireAtlas, puffTexture } from './textures.ts';

const VERT = /* glsl */ `
attribute vec4 aPos;
attribute vec4 aCol;
attribute vec4 aExt;
uniform float uTime;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(aPos.xyz, 1.0);
  float f = 1.0;
  if (aExt.y >= 0.0) f = 1.0 + 0.17 * sin(uTime * 13.0 + aExt.y) + 0.09 * sin(uTime * 23.0 + aExt.y * 1.7);
  float c = cos(aExt.w);
  float s = sin(aExt.w);
  vec2 p = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
  p.y *= aExt.z * f;
  p.x *= 2.0 - f;
  mv.xy += p * aPos.w;
  gl_Position = projectionMatrix * mv;
  vUv = vec2(aExt.x + uv.x * __CELL__, uv.y);
  vCol = aCol;
  if (aExt.y >= 0.0) vCol.a *= 0.8 + 0.2 * f;
}`;

const FRAG_ADD = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vec4 t = texture2D(map, vUv);
  float a = t.a * vCol.a;
  gl_FragColor = vec4(vCol.rgb * t.rgb * a, a);
}`;

const FRAG_ALPHA = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vec4 t = texture2D(map, vUv);
  float a = t.a * vCol.a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol.rgb, a);
}`;

/** Квадраты, всегда лицом к камере: позиция и размер, цвет и прозрачность, клетка атласа, мерцание, вытяжка, поворот */
export class Billboards {
  readonly mesh: THREE.Mesh;
  readonly uTime = { value: 0 };
  private readonly geo = new THREE.InstancedBufferGeometry();
  private readonly pos: THREE.InstancedBufferAttribute;
  private readonly col: THREE.InstancedBufferAttribute;
  private readonly ext: THREE.InstancedBufferAttribute;
  readonly max: number;
  private readonly cells: number;
  count = 0;

  constructor(max: number, map: THREE.Texture, additive: boolean, cells: number) {
    this.max = max;
    this.cells = cells;
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.getAttribute('position'));
    this.geo.setAttribute('uv', base.getAttribute('uv'));
    this.pos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.ext = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aPos', this.pos);
    this.geo.setAttribute('aCol', this.col);
    this.geo.setAttribute('aExt', this.ext);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, uTime: this.uTime },
      vertexShader: VERT.replace('__CELL__', (1 / cells).toFixed(4)),
      fragmentShader: additive ? FRAG_ADD : FRAG_ALPHA,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.CustomBlending : THREE.NormalBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    if (!additive) {
      mat.blendSrc = THREE.SrcAlphaFactor;
      mat.blendDst = THREE.OneMinusSrcAlphaFactor;
    }
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 4 : 3;
  }

  /** cell — клетка атласа, phase < 0 — без мерцания, stretch — вытянуть по вертикали */
  set(i: number, x: number, y: number, z: number, size: number, c: THREE.Color, a: number, cell = 0, phase = -1, stretch = 1, rot = 0): void {
    this.pos.setXYZW(i, x, y, z, size);
    this.col.setXYZW(i, c.r, c.g, c.b, a);
    this.ext.setXYZW(i, cell / this.cells, phase, stretch, rot);
  }

  commit(count: number): void {
    this.count = count;
    this.geo.instanceCount = count;
    this.pos.needsUpdate = true;
    this.col.needsUpdate = true;
    this.ext.needsUpdate = true;
  }
}

interface Puff {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  grow: number;
  life: number;
  max: number;
  alpha: number;
  rot: number;
  spin: number;
  color: THREE.Color;
}

interface Chunk {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  q: THREE.Quaternion;
  w: THREE.Vector3;
  sx: number;
  sy: number;
  sz: number;
  life: number;
  rest: number;
  color: THREE.Color;
}

const DUST = new THREE.Color(0xd8c4a2);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _w = new THREE.Vector3();

export const PEBBLE = new THREE.Color(0xc9b08a);
export const SPLINTER = new THREE.Color(0xa8723f);
export const PLANK = new THREE.Color(0x9a6638);
export const SPARK = new THREE.Color(0xffb347);

/** Пыль, искры, камешки и щепки замка */
export class CastleFx {
  /** огонь (статичные факелы и фонари — первые staticCount) и искры */
  readonly fire: Billboards;
  readonly dust: Billboards;
  readonly chunks: THREE.InstancedMesh;
  private staticCount = 0;
  private readonly puffs: Puff[] = [];
  private readonly sparks: Puff[] = [];
  private readonly bits: Chunk[] = [];
  private readonly maxPuffs = 72;
  private readonly maxSparks = 40;
  private readonly maxBits = 120;
  /** доля частиц (качество): 1, 0,7, 0,45 */
  scale = 1;

  constructor() {
    this.fire = new Billboards(160, fireAtlas(), true, 2);
    this.dust = new Billboards(this.maxPuffs, puffTexture(), false, 1);
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.chunks = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.9 }), this.maxBits);
    this.chunks.count = 0;
    this.chunks.frustumCulled = false;
    this.chunks.castShadow = false;
    this.chunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chunks.setColorAt(0, PEBBLE);
  }

  /** Статичный огонь: язычок (клетка 0) или свечение (клетка 1). Вызывать до первого кадра. */
  addStatic(x: number, y: number, z: number, size: number, color: THREE.Color, alpha: number, cell: number, phase: number, stretch = 1): void {
    const i = this.staticCount++;
    this.fire.set(i, x, y, z, size, color, alpha, cell, phase, stretch);
    this.fire.commit(this.staticCount);
  }

  /** Клубы пыли: n штук вокруг точки с разбросом r, вверх со скоростью rise */
  puff(x: number, y: number, z: number, n: number, r: number, size: number, rise = 0.4, life = 1.2, color = DUST, alpha = 0.55, fall = 0): void {
    const k = Math.max(1, Math.round(n * this.scale));
    for (let i = 0; i < k; i++) {
      if (this.puffs.length >= this.maxPuffs) this.puffs.shift();
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * r;
      this.puffs.push({
        x: x + Math.cos(a) * d, y: y + (Math.random() - 0.5) * r * 0.5, z: z + Math.sin(a) * d,
        vx: Math.cos(a) * 0.35 * (0.5 + Math.random()), vy: rise * (0.6 + Math.random() * 0.8) - fall, vz: Math.sin(a) * 0.35 * (0.5 + Math.random()),
        size: size * (0.7 + Math.random() * 0.6), grow: 1.4 + Math.random(), life: 0, max: life * (0.75 + Math.random() * 0.5),
        alpha, rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 1.2, color,
      });
    }
  }

  /** Искры (кузня): летят вверх и гаснут */
  spark(x: number, y: number, z: number, n: number): void {
    for (let i = 0; i < n; i++) {
      if (this.sparks.length >= this.maxSparks) this.sparks.shift();
      this.sparks.push({
        x, y, z, vx: (Math.random() - 0.5) * 0.9, vy: 1.2 + Math.random() * 1.6, vz: (Math.random() - 0.5) * 0.9,
        size: 0.05 + Math.random() * 0.04, grow: 0, life: 0, max: 0.5 + Math.random() * 0.6, alpha: 1, rot: 0, spin: 0, color: SPARK,
      });
    }
  }

  /** Куски (камешки, щепки, обломки): n штук из точки со скоростью speed в сторону dir (плюс разброс) */
  burst(x: number, y: number, z: number, n: number, color: THREE.Color, size: readonly [number, number, number], speed: number, dx = 0, dy = 1, dz = 0, spread = 1): void {
    const k = Math.max(1, Math.round(n * this.scale));
    for (let i = 0; i < k; i++) {
      if (this.bits.length >= this.maxBits) this.bits.shift();
      const j = 0.6 + Math.random() * 0.8;
      this.bits.push({
        x: x + (Math.random() - 0.5) * 0.2, y, z: z + (Math.random() - 0.5) * 0.2,
        vx: (dx + (Math.random() - 0.5) * spread) * speed * j,
        vy: (dy + Math.random() * 0.5 * spread) * speed * j,
        vz: (dz + (Math.random() - 0.5) * spread) * speed * j,
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)),
        w: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
        sx: size[0] * j, sy: size[1] * j, sz: size[2] * j, life: 0, rest: 0, color: color.clone().multiplyScalar(0.85 + Math.random() * 0.3),
      });
    }
  }

  /** Сколько частиц сейчас живо (для стенда) */
  get alive(): number {
    return this.puffs.length + this.sparks.length + this.bits.length;
  }

  update(dt: number, t: number): void {
    this.fire.uTime.value = t;
    // пыль
    let n = 0;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.puffs.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= 1 - dt * 1.5;
      p.vz *= 1 - dt * 1.5;
      p.vy *= 1 - dt * 0.8;
      p.rot += p.spin * dt;
    }
    for (const p of this.puffs) {
      const k = p.life / p.max;
      const a = p.alpha * Math.min(1, k * 6) * (1 - k) * (1 - k * 0.3);
      this.dust.set(n++, p.x, p.y, p.z, p.size * (1 + p.grow * k), p.color, a, 0, -1, 1, p.rot);
    }
    this.dust.commit(n);
    // искры — после статичного огня
    let m = this.staticCount;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.sparks.splice(i, 1);
        continue;
      }
      p.vy -= 1.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
    for (const p of this.sparks) this.fire.set(m++, p.x, p.y, p.z, p.size, p.color, 1 - p.life / p.max, 1, -1, 1);
    if (m !== this.fire.count || this.sparks.length) this.fire.commit(m);
    // куски
    let c = 0;
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.life += dt;
      if (b.rest > 0) {
        b.rest += dt;
        if (b.rest > 2.6) {
          this.bits.splice(i, 1);
          continue;
        }
        continue;
      }
      b.vy -= 11 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      _w.copy(b.w).multiplyScalar(dt);
      const ang = _w.length();
      if (ang > 0) b.q.premultiply(_q.setFromAxisAngle(_w.normalize(), ang));
      const floor = Math.min(b.sx, b.sy, b.sz) * 0.5;
      if (b.y < floor) {
        b.y = floor;
        if (Math.abs(b.vy) < 1.2) {
          b.vx = b.vy = b.vz = 0;
          b.rest = 0.001;
          // лечь плашмя: ближайший к «лёжа» поворот вокруг вертикали
          const e = new THREE.Euler().setFromQuaternion(b.q, 'YXZ');
          b.q.setFromEuler(new THREE.Euler(0, e.y, 0, 'YXZ'));
        } else {
          b.vy = -b.vy * 0.32;
          b.vx *= 0.55;
          b.vz *= 0.55;
          b.w.multiplyScalar(0.5);
        }
      }
    }
    for (const b of this.bits) {
      const shrink = b.rest > 1.8 ? Math.max(0, 1 - (b.rest - 1.8) / 0.8) : 1;
      _m.compose(_v.set(b.x, b.y, b.z), b.q, _s.set(b.sx * shrink, b.sy * shrink, b.sz * shrink));
      this.chunks.setMatrixAt(c, _m);
      this.chunks.setColorAt(c, b.color);
      c++;
    }
    this.chunks.count = c;
    if (c) {
      this.chunks.instanceMatrix.needsUpdate = true;
      if (this.chunks.instanceColor) this.chunks.instanceColor.needsUpdate = true;
    }
  }
}
