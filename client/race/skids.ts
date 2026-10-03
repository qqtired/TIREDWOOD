// Следы шин на асфальте: в заносе, при резком торможении и в боковом скольжении задние колёса оставляют тёмные
// полосы. Полосы — четырёхугольники в одном кольцевом буфере на всю сцену (старые затираются новыми). Тают
// за SKID_LIFE секунд в шейдере — по времени рождения вершины, без пересчёта буфера каждый кадр.
import * as THREE from 'three';

/** Четырёхугольников в буфере: шести картам хватает на ~30 с заносов */
export const SKID_MAX = 6000;
/** Тают за столько секунд: 40 % времени держатся, потом бледнеют */
export const SKID_LIFE = 20;
/** Новый кусок полосы — через столько метров */
const SKID_STEP = 0.4;
/** Дальше — это прыжок (возврат на трассу): полосу начинаем заново */
const SKID_JUMP = 3;
/** Полуширина следа, м (заднее колесо — 19 см) */
const SKID_HALF = 0.085;

interface Trail {
  on: boolean;
  /** Срез ещё не построен: полоса только началась */
  fresh: boolean;
  x: number;
  y: number;
  z: number;
  a: number;
  /** Левый и правый края последнего среза */
  lx: number;
  lz: number;
  rx: number;
  rz: number;
}

export class SkidMarks {
  private readonly pos = new Float32Array(SKID_MAX * 12);
  private readonly born = new Float32Array(SKID_MAX * 4).fill(-1e6);
  private readonly alpha = new Float32Array(SKID_MAX * 4);
  readonly geo = new THREE.BufferGeometry();
  private readonly trails = new Map<number, Trail>();
  private readonly uTime = { value: 0 };
  private next = 0;
  /** Какие четырёхугольники поменялись за кадр */
  private lo = Infinity;
  private hi = -1;

  constructor(scene: THREE.Scene) {
    const idx = new Uint16Array(SKID_MAX * 6);
    for (let q = 0; q < SKID_MAX; q++) {
      const v = q * 4;
      idx.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
    }
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aBorn', new THREE.BufferAttribute(this.born, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.MeshBasicMaterial({
      color: 0x15130f, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    const life = SKID_LIFE.toFixed(1);
    const fade = (SKID_LIFE * 0.6).toFixed(1);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader =
        'attribute float aBorn;\nattribute float aAlpha;\nuniform float uTime;\nvarying float vFade;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n\tvFade = aAlpha * clamp((${life} - (uTime - aBorn)) / ${fade}, 0.0, 1.0);`);
      sh.fragmentShader =
        'varying float vFade;\n' +
        sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vFade );');
    };
    mat.customProgramCacheKey = () => 'kart-skids';
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    scene.add(mesh);
  }

  /** Колесо key скользит в точке (x, y, z) — на асфальте; a — насколько тёмный след (0…1) */
  mark(key: number, x: number, y: number, z: number, a: number): void {
    let t = this.trails.get(key);
    if (!t) {
      t = { on: false, fresh: true, x, y, z, a, lx: 0, lz: 0, rx: 0, rz: 0 };
      this.trails.set(key, t);
    }
    const dx = x - t.x;
    const dz = z - t.z;
    const d = Math.hypot(dx, dz);
    if (!t.on || d > SKID_JUMP || Math.abs(y - t.y) > 1) {
      t.on = true;
      t.fresh = true;
      t.x = x;
      t.y = y;
      t.z = z;
      t.a = a;
      return;
    }
    if (d < SKID_STEP) return;
    // поперёк хода колеса
    const px = (-dz / d) * SKID_HALF;
    const pz = (dx / d) * SKID_HALF;
    if (t.fresh) {
      t.fresh = false;
      t.lx = t.x - px;
      t.lz = t.z - pz;
      t.rx = t.x + px;
      t.rz = t.z + pz;
    }
    const q = this.next;
    this.next = (q + 1) % SKID_MAX;
    const P = this.pos;
    const o = q * 12;
    P[o] = t.lx;
    P[o + 1] = t.y;
    P[o + 2] = t.lz;
    P[o + 3] = t.rx;
    P[o + 4] = t.y;
    P[o + 5] = t.rz;
    P[o + 6] = x + px;
    P[o + 7] = y;
    P[o + 8] = z + pz;
    P[o + 9] = x - px;
    P[o + 10] = y;
    P[o + 11] = z - pz;
    const v = q * 4;
    this.born.fill(this.uTime.value, v, v + 4);
    this.alpha[v] = this.alpha[v + 1] = t.a;
    this.alpha[v + 2] = this.alpha[v + 3] = a;
    t.lx = x - px;
    t.lz = z - pz;
    t.rx = x + px;
    t.rz = z + pz;
    t.x = x;
    t.y = y;
    t.z = z;
    t.a = a;
    this.lo = Math.min(this.lo, q);
    this.hi = Math.max(this.hi, q);
  }

  /** Колесо больше не скользит: следующий след начнётся заново */
  lift(key: number): void {
    const t = this.trails.get(key);
    if (t) t.on = false;
  }

  /** Стереть все следы (новый заезд) */
  clear(): void {
    this.born.fill(-1e6);
    for (const t of this.trails.values()) t.on = false;
    this.lo = 0;
    this.hi = SKID_MAX - 1;
  }

  update(dt: number): void {
    this.uTime.value += dt;
    if (this.hi < 0) return;
    this.upload('position', 12);
    this.upload('aBorn', 4);
    this.upload('aAlpha', 4);
    this.lo = Infinity;
    this.hi = -1;
  }

  /** Отдать видеокарте только изменившиеся четырёхугольники */
  private upload(name: string, perQuad: number): void {
    const attr = this.geo.getAttribute(name) as THREE.BufferAttribute;
    attr.clearUpdateRanges();
    attr.addUpdateRange(this.lo * perQuad, (this.hi - this.lo + 1) * perQuad);
    attr.needsUpdate = true;
  }
}
