// Частицы башен — три вызова отрисовки на все башни: дым и пыль (обычное смешение), вспышки, огонь и искры (сложение,
// атлас 2×2: мягкое пятно, звезда вспышки, язык пламени, искра), щепки, камешки и конфетти (объёмные, общий материал
// башен). Всё — плоскости-«спрайты»: поворот к камере делает вершинный шейдер, на CPU — только позиция, размер и угол.
// Кадр: begin() → постоянный огонь flame()/glow() от башен → end(dt): частицы летят и дописываются. Без new в кадре.
import * as THREE from 'three';
import { tint } from './kit.ts';

const SMOKE_CAP = 120;
const GLOW_CAP = 160;
const CHIP_CAP = 72;

/** Плоскость лицом к камере: позиция — из instanceMatrix[3], размер и угол — из первых двух столбцов */
const BILLBOARD = `
vec4 mvPosition = modelViewMatrix * vec4( instanceMatrix[ 3 ].xyz, 1.0 );
mvPosition.xy += mat2( instanceMatrix[ 0 ].xy, instanceMatrix[ 1 ].xy ) * position.xy;
gl_Position = projectionMatrix * mvPosition;
`;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  return ctx ? [c, ctx] : null;
}

/** Клуб дыма: мягкий, комковатый, светлее сверху */
function puffTexture(): THREE.CanvasTexture | null {
  const cc = canvas(64, 64);
  if (!cc) return null;
  const [c, ctx] = cc;
  for (const [x, y, r, a] of [[32, 34, 26, 0.75], [22, 28, 14, 0.5], [42, 26, 15, 0.5], [30, 20, 13, 0.45], [36, 42, 14, 0.35]] as const) {
    const g = ctx.createRadialGradient(x - 3, y - 4, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.6, `rgba(235,235,235,${a * 0.6})`);
    g.addColorStop(1, 'rgba(220,220,220,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Атлас огня 2×2: 0 — мягкое пятно, 1 — звезда вспышки, 2 — язык пламени, 3 — искра */
function glowAtlas(): THREE.CanvasTexture | null {
  const cc = canvas(128, 128);
  if (!cc) return null;
  const [c, ctx] = cc;
  const S = 64;
  // 0: мягкое пятно
  let g = ctx.createRadialGradient(32, 32, 0, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // 1: звезда вспышки — лучи и ядро
  ctx.save();
  ctx.translate(S + 32, 32);
  for (let k = 0; k < 8; k++) {
    ctx.rotate(Math.PI / 4);
    const long = k % 2 === 0 ? 30 : 18;
    const lg = ctx.createLinearGradient(0, 0, long, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0.95)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(long, 0);
    ctx.lineTo(0, 4);
    ctx.fill();
  }
  ctx.restore();
  g = ctx.createRadialGradient(S + 32, 32, 0, S + 32, 32, 18);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(S, 0, S, S);
  // 2: язык пламени (низ — широкий и горячий, верх — острый)
  ctx.save();
  ctx.translate(0, S);
  g = ctx.createRadialGradient(32, 46, 2, 32, 40, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(32, 2);
  ctx.bezierCurveTo(50, 26, 58, 44, 32, 62);
  ctx.bezierCurveTo(6, 44, 14, 26, 32, 2);
  ctx.fill();
  ctx.restore();
  // 3: искра
  g = ctx.createRadialGradient(S + 32, S + 32, 0, S + 32, S + 32, 14);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(S, S, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const CELL_SOFT = 0;
export const CELL_FLASH = 1;
export const CELL_FLAME = 2;
export const CELL_SPARK = 3;

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function writeBillboard(a: Float32Array, i: number, x: number, y: number, z: number, sx: number, sy: number, ang: number): void {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const o = i * 16;
  a[o] = sx * c;
  a[o + 1] = sx * s;
  a[o + 2] = 0;
  a[o + 3] = 0;
  a[o + 4] = -sy * s;
  a[o + 5] = sy * c;
  a[o + 6] = 0;
  a[o + 7] = 0;
  a[o + 8] = 0;
  a[o + 9] = 0;
  a[o + 10] = 1;
  a[o + 11] = 0;
  a[o + 12] = x;
  a[o + 13] = y;
  a[o + 14] = z;
  a[o + 15] = 1;
}

/** Пул частиц одного вида: поля — отдельными массивами */
class Pool {
  readonly cap: number;
  n = 0;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly size: Float32Array;
  readonly grow: Float32Array;
  readonly ang: Float32Array;
  readonly spin: Float32Array;
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  readonly a: Float32Array;
  readonly k1: Float32Array;
  readonly k2: Float32Array;
  readonly k3: Float32Array;
  private readonly fields: Float32Array[];
  constructor(cap: number) {
    this.cap = cap;
    const f = (): Float32Array => new Float32Array(cap);
    this.x = f(); this.y = f(); this.z = f(); this.vx = f(); this.vy = f(); this.vz = f(); this.age = f(); this.life = f();
    this.size = f(); this.grow = f(); this.ang = f(); this.spin = f(); this.r = f(); this.g = f(); this.b = f(); this.a = f();
    this.k1 = f(); this.k2 = f(); this.k3 = f();
    this.fields = [this.x, this.y, this.z, this.vx, this.vy, this.vz, this.age, this.life, this.size, this.grow, this.ang, this.spin, this.r, this.g, this.b, this.a, this.k1, this.k2, this.k3];
  }

  /** Новая частица: при полном пуле заменяет самую старую по кругу */
  add(): number {
    if (this.n < this.cap) return this.n++;
    let best = 0;
    let bt = -1;
    for (let i = 0; i < this.n; i++) {
      const t = this.age[i] / this.life[i];
      if (t > bt) {
        bt = t;
        best = i;
      }
    }
    return best;
  }

  kill(i: number): void {
    const j = --this.n;
    if (i === j) return;
    const f = this.fields;
    for (let k = 0; k < f.length; k++) f[k][i] = f[k][j];
  }
}

export class TurretFx {
  private readonly smokeMesh: THREE.InstancedMesh;
  private readonly glowMesh: THREE.InstancedMesh;
  private readonly chipMesh: THREE.InstancedMesh;
  private readonly smokeAlpha: THREE.InstancedBufferAttribute;
  private readonly glowCell: THREE.InstancedBufferAttribute;
  private readonly smoke = new Pool(SMOKE_CAP);
  private readonly sparks = new Pool(GLOW_CAP);
  private readonly chips = new Pool(CHIP_CAP);
  private gn = 0;
  private sn = 0;
  /** 1 — полно частиц, 0.5 — вполовину (низкое качество) */
  scale = 1;

  constructor(scene: THREE.Scene, chipMat: THREE.Material) {
    // дым
    const sg = new THREE.PlaneGeometry(1, 1);
    this.smokeAlpha = new THREE.InstancedBufferAttribute(new Float32Array(SMOKE_CAP), 1).setUsage(THREE.DynamicDrawUsage);
    sg.setAttribute('aAlpha', this.smokeAlpha);
    const sm = new THREE.MeshBasicMaterial({ map: puffTexture(), transparent: true, depthWrite: false });
    sm.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;')
        .replace('#include <project_vertex>', BILLBOARD);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vAlpha;');
    };
    sm.customProgramCacheKey = () => 'fort-turret-smoke';
    this.smokeMesh = this.inst(sg, sm, SMOKE_CAP);
    this.smokeMesh.renderOrder = 3;
    // огонь, вспышки, искры
    const gg = new THREE.PlaneGeometry(1, 1);
    this.glowCell = new THREE.InstancedBufferAttribute(new Float32Array(GLOW_CAP), 1).setUsage(THREE.DynamicDrawUsage);
    gg.setAttribute('aCell', this.glowCell);
    const gm = new THREE.MeshBasicMaterial({ map: glowAtlas(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    gm.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aCell;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vMapUv * 0.5 + vec2( mod( aCell, 2.0 ) * 0.5, 0.5 - floor( aCell * 0.5 ) * 0.5 );\n#endif')
        .replace('#include <project_vertex>', BILLBOARD);
    };
    gm.customProgramCacheKey = () => 'fort-turret-glow';
    this.glowMesh = this.inst(gg, gm, GLOW_CAP);
    this.glowMesh.renderOrder = 4;
    // щепки и камешки
    const cg = tint(new THREE.IcosahedronGeometry(1, 0).scale(1, 0.7, 0.85), 0xffffff, 0);
    this.chipMesh = this.inst(cg, chipMat, CHIP_CAP);
    this.chipMesh.receiveShadow = false;
    scene.add(this.smokeMesh, this.glowMesh, this.chipMesh);
  }

  private inst(g: THREE.BufferGeometry, m: THREE.Material, cap: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(g, m, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, _c.set(1, 1, 1));
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    return mesh;
  }

  // ------------------------------------------------------------ постоянный огонь (каждый кадр заново)

  begin(): void {
    this.gn = 0;
    this.sn = 0;
  }

  /** Язык пламени: низ в (x, y, z), ширина w, высота h, яркость k, цвет hex */
  flame(x: number, y: number, z: number, w: number, h: number, k: number, hex: number, ang = 0): void {
    if (this.gn >= GLOW_CAP) return;
    const i = this.gn++;
    writeBillboard(this.glowMesh.instanceMatrix.array as Float32Array, i, x, y + h * 0.42, z, w, h, ang);
    this.glowColor(i, hex, k);
    this.glowCell.array[i] = CELL_FLAME;
  }

  /** Мягкое свечение (ореол огня, жар углей) */
  glow(x: number, y: number, z: number, size: number, k: number, hex: number, cell = CELL_SOFT): void {
    if (this.gn >= GLOW_CAP) return;
    const i = this.gn++;
    writeBillboard(this.glowMesh.instanceMatrix.array as Float32Array, i, x, y, z, size, size, 0);
    this.glowColor(i, hex, k);
    this.glowCell.array[i] = cell;
  }

  private glowColor(i: number, hex: number, k: number): void {
    _c.setHex(hex).multiplyScalar(k);
    const a = this.glowMesh.instanceColor!.array as Float32Array;
    a[i * 3] = _c.r;
    a[i * 3 + 1] = _c.g;
    a[i * 3 + 2] = _c.b;
  }

  // ------------------------------------------------------------ частицы

  /** Клуб дыма или пыли: размер растёт на grow в секунду, всплывает lift, тормозит drag */
  puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, grow: number, life: number, hex: number, alpha: number, lift = 0.3, drag = 1.6): void {
    const p = this.smoke;
    const i = p.add();
    p.x[i] = x; p.y[i] = y; p.z[i] = z; p.vx[i] = vx; p.vy[i] = vy; p.vz[i] = vz;
    p.age[i] = 0; p.life[i] = life; p.size[i] = size; p.grow[i] = grow; p.ang[i] = Math.random() * 6.28; p.spin[i] = (Math.random() - 0.5) * 1.2;
    _c.setHex(hex);
    p.r[i] = _c.r; p.g[i] = _c.g; p.b[i] = _c.b; p.a[i] = alpha; p.k1[i] = lift; p.k2[i] = drag;
  }

  /** Искра, вспышка или жар: cell — вид, gravity — падение, drag — торможение, grow — рост размера в секунду */
  spark(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, hex: number, k = 1, cell = CELL_SPARK, gravity = 0, drag = 0, grow = 0): void {
    const p = this.sparks;
    const i = p.add();
    p.x[i] = x; p.y[i] = y; p.z[i] = z; p.vx[i] = vx; p.vy[i] = vy; p.vz[i] = vz;
    p.age[i] = 0; p.life[i] = life; p.size[i] = size; p.grow[i] = grow; p.ang[i] = Math.random() * 6.28; p.spin[i] = 0;
    _c.setHex(hex).multiplyScalar(k);
    p.r[i] = _c.r; p.g[i] = _c.g; p.b[i] = _c.b; p.a[i] = cell; p.k1[i] = gravity; p.k2[i] = drag;
  }

  /** Щепка, камешек, уголёк или конфетти: падает, отскакивает от пола floor, кувыркается */
  chip(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, hex: number, floor: number, glow = 0): void {
    const p = this.chips;
    const i = p.add();
    p.x[i] = x; p.y[i] = y; p.z[i] = z; p.vx[i] = vx; p.vy[i] = vy; p.vz[i] = vz;
    p.age[i] = 0; p.life[i] = life; p.size[i] = size; p.grow[i] = 0; p.ang[i] = Math.random() * 6.28; p.spin[i] = (Math.random() - 0.5) * 18;
    _c.setHex(hex).multiplyScalar(1 + glow * 2.5);
    p.r[i] = _c.r; p.g[i] = _c.g; p.b[i] = _c.b; p.a[i] = 1; p.k1[i] = floor; p.k2[i] = Math.random() * 6.28; p.k3[i] = glow;
  }

  // ------------------------------------------------------------ кадр

  end(dt: number): void {
    this.stepSmoke(dt);
    this.stepSparks(dt);
    this.stepChips(dt);
  }

  private stepSmoke(dt: number): void {
    const p = this.smoke;
    const arr = this.smokeMesh.instanceMatrix.array as Float32Array;
    const col = this.smokeMesh.instanceColor!.array as Float32Array;
    const al = this.smokeAlpha.array as Float32Array;
    let n = this.sn;
    for (let i = p.n - 1; i >= 0; i--) {
      p.age[i] += dt;
      if (p.age[i] >= p.life[i]) {
        p.kill(i);
        continue;
      }
      const t = p.age[i] / p.life[i];
      const d = Math.exp(-p.k2[i] * dt);
      p.vx[i] *= d;
      p.vz[i] *= d;
      p.vy[i] = p.vy[i] * d + p.k1[i] * dt;
      p.x[i] += p.vx[i] * dt;
      p.y[i] += p.vy[i] * dt;
      p.z[i] += p.vz[i] * dt;
      p.ang[i] += p.spin[i] * dt;
      if (n >= SMOKE_CAP) continue;
      const s = p.size[i] + p.grow[i] * p.age[i];
      writeBillboard(arr, n, p.x[i], p.y[i], p.z[i], s, s, p.ang[i]);
      col[n * 3] = p.r[i];
      col[n * 3 + 1] = p.g[i];
      col[n * 3 + 2] = p.b[i];
      al[n] = p.a[i] * Math.min(1, t * 10) * (1 - t) * (1 - t);
      n++;
    }
    this.finish(this.smokeMesh, n);
    if (n) this.smokeAlpha.needsUpdate = true;
  }

  private stepSparks(dt: number): void {
    const p = this.sparks;
    const arr = this.glowMesh.instanceMatrix.array as Float32Array;
    const col = this.glowMesh.instanceColor!.array as Float32Array;
    const cell = this.glowCell.array as Float32Array;
    let n = this.gn;
    for (let i = p.n - 1; i >= 0; i--) {
      p.age[i] += dt;
      if (p.age[i] >= p.life[i]) {
        p.kill(i);
        continue;
      }
      const t = p.age[i] / p.life[i];
      const d = Math.exp(-p.k2[i] * dt);
      p.vx[i] *= d;
      p.vz[i] *= d;
      p.vy[i] = p.vy[i] * d - p.k1[i] * dt;
      p.x[i] += p.vx[i] * dt;
      p.y[i] += p.vy[i] * dt;
      p.z[i] += p.vz[i] * dt;
      if (n >= GLOW_CAP) continue;
      const s = Math.max(0.01, p.size[i] + p.grow[i] * p.age[i]);
      const k = (1 - t) * (1 - t * 0.5);
      writeBillboard(arr, n, p.x[i], p.y[i], p.z[i], s, s, p.ang[i]);
      col[n * 3] = p.r[i] * k;
      col[n * 3 + 1] = p.g[i] * k;
      col[n * 3 + 2] = p.b[i] * k;
      cell[n] = p.a[i];
      n++;
    }
    this.finish(this.glowMesh, n);
    if (n) this.glowCell.needsUpdate = true;
  }

  private stepChips(dt: number): void {
    const p = this.chips;
    const mesh = this.chipMesh;
    let n = 0;
    for (let i = p.n - 1; i >= 0; i--) {
      p.age[i] += dt;
      if (p.age[i] >= p.life[i]) {
        p.kill(i);
        continue;
      }
      p.vy[i] -= 9.8 * dt;
      p.x[i] += p.vx[i] * dt;
      p.y[i] += p.vy[i] * dt;
      p.z[i] += p.vz[i] * dt;
      if (p.y[i] < p.k1[i] && p.vy[i] < 0) {
        p.y[i] = p.k1[i];
        p.vy[i] *= -0.32;
        p.vx[i] *= 0.55;
        p.vz[i] *= 0.55;
        p.spin[i] *= 0.5;
      }
      p.ang[i] += p.spin[i] * dt;
      const t = p.age[i] / p.life[i];
      const s = p.size[i] * (t > 0.75 ? (1 - t) / 0.25 : 1);
      _e.set(p.ang[i], p.k2[i] + p.ang[i] * 0.6, p.ang[i] * 0.3);
      _q.setFromEuler(_e);
      _m.compose(_p.set(p.x[i], p.y[i], p.z[i]), _q, _s.set(s, s, s));
      mesh.setMatrixAt(n, _m);
      // угольки остывают
      const cool = p.k3[i] > 0 ? 1 - t * 0.7 : 1;
      mesh.setColorAt(n, _c.setRGB(p.r[i] * cool, p.g[i] * cool, p.b[i] * cool));
      n++;
    }
    this.finish(mesh, n);
  }

  private finish(mesh: THREE.InstancedMesh, n: number): void {
    mesh.count = n;
    mesh.visible = n > 0;
    if (n) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
    }
  }

  /** Сколько частиц сейчас (для отладки и тестов) */
  get active(): number {
    return this.smoke.n + this.sparks.n + this.chips.n;
  }

  clear(): void {
    this.smoke.n = 0;
    this.sparks.n = 0;
    this.chips.n = 0;
  }

  dispose(scene: THREE.Scene): void {
    for (const m of [this.smokeMesh, this.glowMesh, this.chipMesh]) {
      scene.remove(m);
      m.geometry.dispose();
      m.dispose();
    }
    (this.smokeMesh.material as THREE.MeshBasicMaterial).map?.dispose();
    (this.glowMesh.material as THREE.MeshBasicMaterial).map?.dispose();
    (this.smokeMesh.material as THREE.Material).dispose();
    (this.glowMesh.material as THREE.Material).dispose();
  }
}
