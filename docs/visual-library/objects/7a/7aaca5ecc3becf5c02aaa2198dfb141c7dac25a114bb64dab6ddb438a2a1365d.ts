// Частицы фермы одним запасом точек: «пуф» земли при посадке и сборе, брызги полива, золотые искорки над спелой
// грядкой, искорка роста к Древу, пыльца чиха, лепестки, парок компоста, «пуф» питомца. Две отрисовки на всё
// (обычное смешивание — пыль и лепестки, сложение — свечение), одна программа шейдера. Без текстур: круглое пятно
// считается в шейдере.
import * as THREE from 'three';

const N = 900;

const VERT = /* glsl */ `
  attribute vec4 aColor;
  attribute float aSize;
  varying vec4 vColor;
  uniform float uScale;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vColor = aColor;
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = /* glsl */ `
  varying vec4 vColor;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = dot(d, d) * 4.0;
    if (r > 1.0) discard;
    gl_FragColor = vec4(vColor.rgb, vColor.a * (1.0 - r) * (1.0 - r));
  }`;

export interface Burst {
  x: number;
  y: number;
  z: number;
  n: number;
  color: number;
  /** Разброс скорости, м/с; вверх — отдельно */
  spread?: number;
  up?: number;
  life?: number;
  size?: number;
  gravity?: number;
  /** Светится (сложение) или пыль (обычное смешивание) */
  glow?: boolean;
}

class Pool {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly vel = new Float32Array(N * 3);
  private readonly age = new Float32Array(N);
  private readonly life = new Float32Array(N);
  private readonly base = new Float32Array(N * 4);
  private readonly grav = new Float32Array(N);
  private readonly sz = new Float32Array(N);
  private n = 0;

  constructor(mat: THREE.ShaderMaterial) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 3);
    this.col = new Float32Array(N * 4);
    this.size = new Float32Array(N);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.points.userData.noPaint = true;
  }

  add(x: number, y: number, z: number, vx: number, vy: number, vz: number, c: THREE.Color, a: number, life: number, size: number, gravity: number): void {
    if (this.n >= N) return;
    const i = this.n++;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.base.set([c.r, c.g, c.b, a], i * 4);
    this.age[i] = 0;
    this.life[i] = life;
    this.grav[i] = gravity;
    this.sz[i] = size;
  }

  update(dt: number): void {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const age = this.age[i] + dt;
      if (age >= this.life[i]) continue;
      // сдвинуть живую частицу на место w
      if (w !== i) {
        this.pos.copyWithin(w * 3, i * 3, i * 3 + 3);
        this.vel.copyWithin(w * 3, i * 3, i * 3 + 3);
        this.base.copyWithin(w * 4, i * 4, i * 4 + 4);
        this.life[w] = this.life[i];
        this.grav[w] = this.grav[i];
        this.sz[w] = this.sz[i];
      }
      this.age[w] = age;
      const drag = Math.exp(-dt * 1.6);
      this.vel[w * 3] *= drag;
      this.vel[w * 3 + 1] = this.vel[w * 3 + 1] * drag - this.grav[w] * dt;
      this.vel[w * 3 + 2] *= drag;
      this.pos[w * 3] += this.vel[w * 3] * dt;
      this.pos[w * 3 + 1] += this.vel[w * 3 + 1] * dt;
      this.pos[w * 3 + 2] += this.vel[w * 3 + 2] * dt;
      const k = age / this.life[w];
      const fade = Math.min(1, k * 8) * (1 - k * k);
      this.col[w * 4] = this.base[w * 4];
      this.col[w * 4 + 1] = this.base[w * 4 + 1];
      this.col[w * 4 + 2] = this.base[w * 4 + 2];
      this.col[w * 4 + 3] = this.base[w * 4 + 3] * fade;
      this.size[w] = this.sz[w] * (0.6 + 0.4 * (1 - k));
      w++;
    }
    this.n = w;
    const g = this.points.geometry;
    g.setDrawRange(0, w);
    for (const name of ['position', 'aColor', 'aSize']) (g.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    this.points.visible = w > 0;
  }
}

const _c = new THREE.Color();

export class FarmFx {
  private readonly dust: Pool;
  private readonly glow: Pool;
  private readonly uScale = { value: 600 };

  constructor(parent: THREE.Object3D) {
    const mk = (additive: boolean) => new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { uScale: this.uScale },
    });
    this.dust = new Pool(mk(false));
    this.glow = new Pool(mk(true));
    parent.add(this.dust.points, this.glow.points);
  }

  /** Размер точки на экране: высота кадра в пикселях и угол обзора */
  setView(heightPx: number, fovDeg: number): void {
    this.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  burst(b: Burst): void {
    const pool = b.glow ? this.glow : this.dust;
    const spread = b.spread ?? 0.8;
    const up = b.up ?? 1.2;
    _c.set(b.color);
    for (let i = 0; i < b.n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = spread * (0.3 + Math.random() * 0.7);
      pool.add(
        b.x + (Math.random() - 0.5) * 0.3, b.y, b.z + (Math.random() - 0.5) * 0.3,
        Math.cos(a) * r, up * (0.5 + Math.random() * 0.7), Math.sin(a) * r,
        _c, b.glow ? 1 : 0.85, (b.life ?? 0.8) * (0.7 + Math.random() * 0.5), (b.size ?? 0.12) * (0.7 + Math.random() * 0.6), b.gravity ?? 2,
      );
    }
  }

  /** Одна частица с заданной скоростью (след искорки) */
  one(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, life: number, size: number, glow = true): void {
    _c.set(color);
    (glow ? this.glow : this.dust).add(x, y, z, vx, vy, vz, _c, 1, life, size, 0);
  }

  update(dt: number): void {
    this.dust.update(dt);
    this.glow.update(dt);
  }
}
