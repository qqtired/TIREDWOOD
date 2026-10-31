// Надувной банан на троих (флаг BANANA, shared/banana.ts): модель client/assets/banana/banana.glb (исходник —
// tools/banana/build_banana.py, Blender без окна), трос и «анимации» банана. Все бананы — одна отрисовка (инстансы
// одной склеенной сетки с цветом в вершинах), все тросы — вторая. Поведение банана — кодом, как у мобов крепости:
// bananaLook() даёт покачивание на воде у причала, подпрыгивание на волнах и задранный нос на ходу, крен наружу
// в повороте (по «толчку» lat с сервера), качок назад, когда седок упал или сел (kick), и «сминается» под севшим.
// Тем же кодом пользуется стенд lab/banana (client/boat/bananalab.ts).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BN_SEAT_Z, BN_SEATS } from '../../shared/banana.ts';

const URL_GLB = new URL('../assets/banana/banana.glb', import.meta.url).href;

/** Сколько бананов в мире (как лодок) и звеньев троса у каждого */
const MAX = 16;
const ROPE_SEG = 8;

/** Как выглядит банан в этот миг: подъём над водой, нос вверх (+), крен (+ — влево по ходу), сжатие под седоком */
export interface BnLook {
  y: number;
  pitch: number;
  roll: number;
  squash: number;
}

export function makeLook(): BnLook {
  return { y: 0, pitch: 0, roll: 0, squash: 1 };
}

/**
 * Поза банана по времени, скорости (м/с) и толчку lat (+ — седоков клонит вправо): у причала качается на волне, на ходу
 * подпрыгивает на гребнях (чаще с ростом скорости) и задирает нос, в повороте ложится наружу. kick — качок −1…1
 * (кто-то упал или сел: банан «отыгрывает» в другую сторону и гаснет), press — 0…1, только что сели (сминается).
 */
export function bananaLook(t: number, speed: number, lat: number, seed: number, kick: number, press: number, out: BnLook = makeLook()): BnLook {
  const run = Math.min(1.4, Math.max(0, speed / 12));
  const calm = 1 - Math.min(1, run) * 0.6;
  const ph = t * (2.1 + run * 2.8) + seed * 1.7;
  const hop = Math.pow(Math.abs(Math.sin(ph)), 3) * 0.17 * run;
  out.y = Math.sin(t * 1.3 + seed) * 0.045 * calm + hop - press * 0.05;
  out.pitch = run * 0.075 + Math.cos(ph) * 0.05 * run + Math.sin(t * 0.9 + seed * 2.3) * 0.022 * calm;
  const lean = Math.max(-0.32, Math.min(0.32, -lat * 0.13));
  out.roll = lean + Math.sin(t * 1.7 + seed * 0.7) * 0.035 * calm + Math.sin(t * 3.1 + seed) * 0.02 * run + kick * 0.22;
  out.squash = 1 - press * 0.07;
  return out;
}

/** Модель в осях банана: верх сиденья (места 0–2) и кольцо троса у носа — из GLB (узлы seat_k, tow) */
export interface BnRig {
  seatY: number[];
  tow: THREE.Vector3;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** Склеенная сетка банана (цвет в вершинах = цвет материала части) и узлы */
async function loadBanana(): Promise<{ geo: THREE.BufferGeometry; rig: BnRig }> {
  const gltf = await new GLTFLoader().loadAsync(URL_GLB);
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.geometry;
    const g = new THREE.BufferGeometry();
    const pos = src.getAttribute('position').clone();
    const nor = src.getAttribute('normal').clone();
    g.setAttribute('position', pos);
    g.setAttribute('normal', nor);
    const c = (mesh.material as THREE.MeshStandardMaterial).color ?? new THREE.Color(1, 1, 1);
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (src.index) g.setIndex(src.index.clone());
    g.applyMatrix4(mesh.matrixWorld);
    parts.push(g.index ? g.toNonIndexed() : g);
  });
  const geo = mergeGeometries(parts, false)!;
  geo.computeBoundingSphere();
  const seatY: number[] = [];
  for (let k = 0; k < BN_SEATS; k++) seatY.push(root.getObjectByName(`seat_${k}`)?.getWorldPosition(new THREE.Vector3()).y ?? 0.58);
  const tow = root.getObjectByName('tow')?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3(0, 0.3, -2.1);
  return { geo, rig: { seatY, tow } };
}

/** Банан на экране: где, как стоит, и откуда тянется трос (корма лодки, мировые координаты; null — троса нет) */
export interface BananaDraw {
  x: number;
  y: number;
  z: number;
  yaw: number;
  look: BnLook;
  stern: THREE.Vector3 | null;
  /** Длина троса (для провиса) */
  rope: number;
}

/**
 * Все бананы и тросы: две отрисовки на весь мир. draw(list) ставит инстансы; seatMatrix/seatAt дают место седока
 * в мире по позе банана на экране (желейка сидит ровно на банане и качается вместе с ним).
 */
export class BananaFleet {
  readonly bananas: THREE.InstancedMesh;
  readonly ropes: THREE.InstancedMesh;
  rig: BnRig = { seatY: [0.58, 0.58, 0.58], tow: new THREE.Vector3(0, 0.3, -2.1) };
  ready = false;
  drawn = 0;
  private loading = false;

  constructor(scene: THREE.Scene) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0 });
    mat.name = 'bn_pvc';
    this.bananas = new THREE.InstancedMesh(new THREE.BufferGeometry(), mat, MAX);
    this.bananas.count = 0;
    this.bananas.frustumCulled = false;
    this.bananas.castShadow = true;
    const rope = new THREE.CylinderGeometry(0.022, 0.022, 1, 5, 1, true);
    rope.translate(0, 0.5, 0);
    this.ropes = new THREE.InstancedMesh(rope, new THREE.MeshStandardMaterial({ color: 0xeee3c8, roughness: 0.85 }), MAX * ROPE_SEG);
    this.ropes.count = 0;
    this.ropes.frustumCulled = false;
    this.bananas.userData.p3keep = true;
    this.ropes.userData.p3keep = true;
    scene.add(this.bananas, this.ropes);
  }

  /** Загрузить модель (один раз, при первом банане) */
  load(): void {
    if (this.loading) return;
    this.loading = true;
    void loadBanana().then(({ geo, rig }) => {
      this.bananas.geometry.dispose();
      this.bananas.geometry = geo;
      this.rig = rig;
      this.ready = true;
    }).catch((e) => console.warn('banana.glb', e));
  }

  /** Матрица банана в мире */
  matrix(d: BananaDraw, out: THREE.Matrix4): THREE.Matrix4 {
    _e.set(d.look.pitch, d.yaw, d.look.roll, 'YXZ');
    _q.setFromEuler(_e);
    _s.set(1, d.look.squash, 1);
    return out.compose(_v.set(d.x, d.y + d.look.y, d.z), _q, _s);
  }

  /** Место седока k в мире (верх сиденья) по позе банана */
  seatAt(d: BananaDraw, k: number, out: THREE.Vector3): THREE.Vector3 {
    this.matrix(d, _m);
    return out.set(0, this.rig.seatY[k] ?? 0.58, BN_SEAT_Z[k] ?? 0).applyMatrix4(_m);
  }

  draw(list: readonly BananaDraw[]): void {
    let n = 0;
    let r = 0;
    for (const d of list) {
      if (n >= MAX) break;
      this.matrix(d, _m);
      this.bananas.setMatrixAt(n++, _m);
      if (!d.stern) continue;
      // трос: от кормы к кольцу у носа; натянут — прямой, ослаб — провисает к воде
      const ring = _a.copy(this.rig.tow).applyMatrix4(_m);
      const from = d.stern;
      const dist = from.distanceTo(ring);
      const sag = Math.min(0.9, Math.sqrt(Math.max(0, d.rope * d.rope - dist * dist)) * 0.35);
      let px = from.x;
      let py = from.y;
      let pz = from.z;
      for (let k = 1; k <= ROPE_SEG; k++) {
        const t = k / ROPE_SEG;
        const x = from.x + (ring.x - from.x) * t;
        const z = from.z + (ring.z - from.z) * t;
        const y = from.y + (ring.y - from.y) * t - sag * 4 * t * (1 - t);
        _b.set(x - px, y - py, z - pz);
        const len = _b.length();
        _q.setFromUnitVectors(_up, _b.divideScalar(len || 1));
        this.ropes.setMatrixAt(r++, _m.compose(_v.set(px, py, pz), _q, _s.set(1, len, 1)));
        px = x;
        py = y;
        pz = z;
      }
    }
    this.bananas.count = this.ready ? n : 0;
    this.ropes.count = this.ready ? r : 0;
    this.drawn = this.bananas.count;
    this.bananas.instanceMatrix.needsUpdate = true;
    this.ropes.instanceMatrix.needsUpdate = true;
  }
}
