// «Набег пиратов»: шлюпка десанта — круглый деревянный корпус с полосами досок, бело-красный пояс под планширем, три
// банки, две пары вёсел в уключинах, вымпел на корме, груз (ящик, ящик, бочка, ящик). Корень group — в ватерлинии,
// нос по +Z. Геометрии и материалы общие на все шлюпки (счёт ссылок: последняя dispose() освобождает), у каждой
// шлюпки — свой Group с дочерними сетками.
import * as THREE from 'three';
import { colored, merge } from '../fort/mobs/kit.ts';
import { oarDip, oarSweep } from './piratejelly.ts';
import { barrelGeo, crateGeo, lootMaterial } from './pirateloot.ts';

export interface DinghyAnim {
  t: number;
  /** м/с: пена у носа, качка */
  speed: number;
  /** Фаза гребка 0…1 (та же, что a.gait у гребцов PS_ROW) */
  stroke: number;
  /** 0 — гребут, 1 — подняты «домиком» (пришвартовались), 2 — лежат вдоль бортов */
  oars: 0 | 1 | 2;
  /** Сколько груза на борту, 0…4 */
  cargo: number;
  /** 0…1 — тонет (после 1 контроллер убирает) */
  sink: number;
  /** 1 → 0 — вздрогнула от попадания */
  hit: number;
}

export interface DinghyModel {
  /** Корень на ватерлинии, нос +Z */
  group: THREE.Group;
  /** Подгруппа качки (внутри group): seats и cargoSpots — в её осях (в покое совпадают с осями group) */
  readonly hull: THREE.Object3D;
  /**
   * Места гребцов на банках (от носа к корме): y — сиденье банки, «пол» сидящего пирата (PS_ROW, PS_SEAT); yaw — как у
   * crowdRoot (π — лицом к носу, по +Z).
   */
  readonly seats: ReadonlyArray<{ x: number; y: number; z: number; yaw: number }>;
  /** Места груза (рисуются сами по DinghyAnim.cargo: ящик, ящик, бочка, ящик) */
  readonly cargoSpots: ReadonlyArray<{ x: number; y: number; z: number }>;
  update(a: DinghyAnim, dt: number): void;
  /** Мировая матрица корня особи на банке i с качкой и креном шлюпки — сразу для PirateCrowd.add */
  seatRoot(i: number, out: THREE.Matrix4, scale?: number): THREE.Matrix4;
  dispose(): void;
}

// ------------------------------------------------------------ корпус

/** Транец и нос, наибольшая полуширина */
const Z0 = -1.85;
const Z1 = 1.95;
const HALF = 0.85;
/** Цвета: пояс, доски, днище, изнанка */
const WHITE = 0xf6f1e6;
const RED = 0xe0483a;
const PLANK = 0xe39a52;
const PLANK2 = 0xcc7f42;
const BOTTOM = 0x7c4a2e;
const INNER = 0xb9733f;
const SEAT = 0xf0c27a;
const BRASS = 0xe6b84a;

/** Полуширина по длине (t: 0 — транец, 1 — нос) */
function halfW(t: number): number {
  if (t < 0.4) return HALF * (0.66 + 0.34 * Math.sin((t / 0.4) * Math.PI * 0.5));
  return HALF * Math.pow(Math.max(0, Math.cos(((t - 0.4) / 0.6) * Math.PI * 0.5)), 0.75);
}
/** Низ киля и планширь (седловатость: нос выше) */
const keelY = (t: number): number => -0.25 + 0.38 * Math.max(0, (t - 0.72) / 0.28) ** 2 + 0.1 * Math.max(0, (0.22 - t) / 0.22) ** 2;
const rimY = (t: number): number => 0.55 + 0.16 * Math.max(0, (t - 0.6) / 0.4) ** 2 + 0.05 * Math.max(0, (0.3 - t) / 0.3) ** 2;
/** Сечение одного борта от планширя к килю: доля полуширины и доля высоты */
const PROFILE: ReadonlyArray<readonly [number, number]> = [[1, 1], [1, 0.88], [0.985, 0.75], [0.94, 0.57], [0.83, 0.37], [0.6, 0.16], [0, 0]];
/** Полосы между точками профиля */
const BANDS = [WHITE, RED, PLANK, PLANK2, PLANK, BOTTOM];
const N = 10;

function at(t: number, side: number, fx: number, fy: number, inset = 0): THREE.Vector3 {
  const y0 = keelY(t);
  const y1 = rimY(t);
  return new THREE.Vector3(side * Math.max(0, halfW(t) * fx - inset), y0 + (y1 - y0) * fy + (inset > 0 ? inset * (1 - fy) : 0), Z0 + (Z1 - Z0) * t);
}

/** Полоса вдоль корпуса между двумя рядами точек; out — наружу по +X у левого борта (side = 1) */
function strip(a: THREE.Vector3[], b: THREE.Vector3[], color: number, flip: boolean): THREE.BufferGeometry {
  const pos: number[] = [];
  for (let i = 0; i + 1 < a.length; i++) {
    const tri = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3) => (flip ? pos.push(p.x, p.y, p.z, r.x, r.y, r.z, q.x, q.y, q.z) : pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z));
    tri(a[i], a[i + 1], b[i]);
    tri(a[i + 1], b[i + 1], b[i]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return colored(g, color);
}

function hullGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const ts = Array.from({ length: N }, (_, i) => i / (N - 1));
  for (const side of [1, -1]) {
    const flip = side < 0;
    // снаружи: полосы досок
    for (let b = 0; b < BANDS.length; b++) {
      const [fa, ya] = PROFILE[b];
      const [fb, yb] = PROFILE[b + 1];
      parts.push(strip(ts.map((t) => at(t, side, fa, ya)), ts.map((t) => at(t, side, fb, yb)), BANDS[b], flip));
    }
    // изнутри: три полосы, чуть внутрь
    const inner = [0, 3, 5, 6];
    for (let b = 0; b + 1 < inner.length; b++) {
      const [fa, ya] = PROFILE[inner[b]];
      const [fb, yb] = PROFILE[inner[b + 1]];
      parts.push(strip(ts.map((t) => at(t, side, fa, ya, 0.06)), ts.map((t) => at(t, side, fb, yb, 0.06)), INNER, !flip));
    }
    // планширь: белая кромка между наружной и внутренней обшивкой
    parts.push(strip(ts.map((t) => at(t, side, 1, 1, 0.06)), ts.map((t) => at(t, side, 1, 1)), WHITE, flip));
  }
  // транец: плоский щит на корме, снаружи и изнутри
  const ring = [...PROFILE.map(([f, y]) => at(0, 1, f, y)), ...[...PROFILE].reverse().slice(1).map(([f, y]) => at(0, -1, f, y))];
  const c = new THREE.Vector3(0, (keelY(0) + rimY(0)) / 2, Z0);
  const tp: number[] = [];
  for (let i = 0; i + 1 < ring.length; i++) {
    const p = ring[i];
    const q = ring[i + 1];
    tp.push(c.x, c.y, c.z, p.x, p.y, p.z, q.x, q.y, q.z);
    tp.push(c.x, c.y, c.z + 0.02, q.x, q.y, q.z + 0.02, p.x, p.y, p.z + 0.02);
  }
  const tr = new THREE.BufferGeometry();
  tr.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
  tr.computeVertexNormals();
  parts.push(colored(tr, PLANK2));
  // банки, решётка-пайол, уключины, вымпел
  for (const s of SEATS) {
    const tt = (s.z - Z0) / (Z1 - Z0);
    const w = halfW(tt) * 0.94 - 0.06;
    parts.push(colored(new THREE.BoxGeometry(w * 2, 0.06, 0.3).translate(0, s.y - 0.03, s.z), SEAT));
  }
  parts.push(colored(new THREE.BoxGeometry(0.9, 0.04, 2.6).translate(0, 0.0, -0.15), PLANK2));
  for (const l of LOCKS) parts.push(colored(new THREE.BoxGeometry(0.07, 0.12, 0.07).translate(l.x, rimY((l.z - Z0) / (Z1 - Z0)) + 0.05, l.z), BRASS));
  parts.push(colored(new THREE.BoxGeometry(0.04, 0.95, 0.04).translate(0, rimY(0) + 0.42, Z0 + 0.12), PLANK2));
  const flag = new THREE.BufferGeometry();
  const fy = rimY(0) + 0.88;
  const fz = Z0 + 0.12;
  flag.setAttribute('position', new THREE.Float32BufferAttribute([0, fy, fz, 0, fy - 0.24, fz, 0, fy - 0.12, fz - 0.42, 0, fy, fz, 0, fy - 0.12, fz - 0.42, 0, fy - 0.24, fz], 3));
  flag.computeVertexNormals();
  parts.push(colored(flag, RED));
  return merge(parts);
}

/** Весло вдоль +X от уключины: рукоять внутрь (−X), лопасть снаружи; красная лопасть с белым кончиком */
function oarGeo(): THREE.BufferGeometry {
  return merge([
    colored(new THREE.BoxGeometry(2.0, 0.05, 0.05).translate(0.45, 0, 0), 0xf0cf96),
    colored(new THREE.BoxGeometry(0.42, 0.03, 0.17).translate(1.2, 0, 0), RED),
    colored(new THREE.BoxGeometry(0.1, 0.032, 0.172).translate(1.46, 0, 0), WHITE),
  ]);
}

interface Kit {
  hull: THREE.BufferGeometry;
  oar: THREE.BufferGeometry;
  crate: THREE.BufferGeometry;
  barrel: THREE.BufferGeometry;
  mat: THREE.MeshStandardMaterial;
  loot: THREE.MeshStandardMaterial;
  refs: number;
}

let kit: Kit | null = null;

function makeKit(): Kit {
  return {
    hull: hullGeo(),
    oar: oarGeo(),
    crate: crateGeo(true),
    barrel: barrelGeo(true),
    mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 }),
    loot: lootMaterial(),
    refs: 0,
  };
}

const SEATS = [
  { x: 0, y: 0.38, z: 0.85, yaw: Math.PI },
  { x: 0, y: 0.38, z: -0.05, yaw: Math.PI },
  { x: 0, y: 0.38, z: -0.95, yaw: Math.PI },
];
/** Груз: ящик на корме, ящик у левого борта, бочка на носу, ящик у правого борта */
const CARGO = [
  { x: 0, y: 0.04, z: -1.45 },
  { x: 0.33, y: 0.04, z: -0.5 },
  { x: 0, y: 0.04, z: 1.3 },
  { x: -0.33, y: 0.04, z: 0.4 },
];
/** Уключины: передняя пара — у банки 0, задняя — у банки 1 */
const LOCKS = [
  { x: 0.8, z: 0.45 },
  { x: -0.8, z: 0.45 },
  { x: 0.84, z: -0.45 },
  { x: -0.84, z: -0.45 },
];

const _loc = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export function buildDinghy(): DinghyModel {
  const k = (kit ??= makeKit());
  k.refs++;
  const group = new THREE.Group();
  group.name = 'pirate-dinghy';
  const hull = new THREE.Group();
  group.add(hull);
  const body = new THREE.Mesh(k.hull, k.mat);
  body.receiveShadow = true;
  hull.add(body);
  const oars = new THREE.InstancedMesh(k.oar, k.mat, 4);
  oars.frustumCulled = false;
  hull.add(oars);
  const cargo: THREE.Mesh[] = [];
  for (let i = 0; i < CARGO.length; i++) {
    const c = new THREE.Mesh(i === 2 ? k.barrel : k.crate, k.loot);
    c.position.set(CARGO[i].x, CARGO[i].y, CARGO[i].z);
    c.rotation.y = i === 0 ? 0 : i === 2 ? 0.4 : Math.PI / 2 + (i - 2) * 0.1;
    c.visible = false;
    hull.add(c);
    cargo.push(c);
  }
  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YXZ';
  let alive = true;
  return {
    group,
    hull,
    seats: SEATS,
    cargoSpots: CARGO,
    update(a: DinghyAnim) {
      const t = a.t;
      const s = Math.max(0, Math.min(1, a.sink));
      const sp = Math.min(1, Math.max(0, a.speed) / 3);
      // качка, нос чуть вверх на ходу; тонет: корма вниз, нос задран, крен — и уходит под воду
      hull.position.y = 0.04 * Math.sin(t * 1.7) - 1.5 * s * s - 0.1 * s;
      hull.rotation.set(
        -0.04 * sp - 0.55 * s + 0.035 * Math.sin(t * 1.3),
        0,
        0.35 * s + 0.045 * Math.sin(t * 1.1 + 0.6) + 0.12 * a.hit * Math.sin(t * 38),
        'YXZ',
      );
      const sw = oarSweep(a.stroke);
      const dip = oarDip(a.stroke);
      for (let i = 0; i < 4; i++) {
        const l = LOCKS[i];
        const side = l.x > 0 ? 1 : -1;
        const ry = rimY((l.z - Z0) / (Z1 - Z0)) + 0.1;
        if (a.oars === 0) {
          // гребок: рукояти вперёд — лопасть в воде и идёт к корме
          const ps = 0.42 * sw;
          dummy.position.set(l.x, ry, l.z);
          dummy.rotation.set(0, side > 0 ? ps : Math.PI - ps, -(0.2 + 0.28 * dip));
        } else if (a.oars === 1) {
          // подняты «домиком»: рукоять на дне у борта, лопасти сходятся над серединой
          dummy.position.set(side * 0.41, 0.6, l.z);
          dummy.rotation.set(0, side > 0 ? 0 : Math.PI, 1.9);
        } else {
          // вдоль бортов, лопастями к корме
          dummy.position.set(side * (Math.abs(l.x) - 0.12), ry + 0.02, l.z + 0.55);
          dummy.rotation.set(0, Math.PI / 2, 0);
        }
        dummy.updateMatrix();
        oars.setMatrixAt(i, dummy.matrix);
      }
      oars.instanceMatrix.needsUpdate = true;
      const n = Math.max(0, Math.min(4, Math.round(a.cargo)));
      for (let i = 0; i < cargo.length; i++) cargo[i].visible = i < n;
    },
    seatRoot(i: number, out: THREE.Matrix4, scale = 1) {
      const d = SEATS[Math.max(0, Math.min(SEATS.length - 1, i | 0))];
      hull.updateWorldMatrix(true, false);
      _e.set(0, d.yaw + Math.PI, 0, 'YXZ');
      _q.setFromEuler(_e);
      _loc.compose(_p.set(d.x, d.y, d.z), _q, _s.set(scale, scale, scale));
      return out.multiplyMatrices(hull.matrixWorld, _loc);
    },
    dispose() {
      if (!alive) return;
      alive = false;
      group.removeFromParent();
      oars.dispose();
      if (--k.refs > 0 || kit !== k) return;
      kit = null;
      for (const g of [k.hull, k.oar, k.crate, k.barrel]) g.dispose();
      k.mat.dispose();
      k.loot.dispose();
    },
  };
}
