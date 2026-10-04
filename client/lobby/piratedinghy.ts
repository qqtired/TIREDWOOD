// «Набег пиратов»: шлюпка десанта — тёплое дерево, две цветные полосы вдоль борта, банки, вёсла в уключинах, груз на
// корме. Корень group — в ватерлинии, нос по +Z. Геометрии и материалы общие на все шлюпки (счёт ссылок: последняя
// dispose() освобождает), у каждой шлюпки — свой Group с дочерними сетками.
import * as THREE from 'three';
import { colored, merge } from '../fort/mobs/kit.ts';
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
    hull: merge([
      colored(new THREE.BoxGeometry(1.7, 0.8, 3.8).translate(0, 0.15, 0), 0x9a6338),
      colored(new THREE.BoxGeometry(1.75, 0.08, 3.85).translate(0, 0.5, 0), 0x2f7fc0),
    ]),
    oar: colored(new THREE.BoxGeometry(2.2, 0.06, 0.12).translate(1.0, 0, 0), 0xd8b07a),
    crate: crateGeo(),
    barrel: barrelGeo(),
    mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    loot: lootMaterial(),
    refs: 0,
  };
}

const SEATS = [
  { x: 0, y: 0.38, z: 0.95, yaw: Math.PI },
  { x: 0, y: 0.38, z: 0, yaw: Math.PI },
  { x: 0, y: 0.38, z: -0.95, yaw: Math.PI },
];
const CARGO = [
  { x: 0, y: 0.18, z: -1.45 },
  { x: 0, y: 0.18, z: 1.55 },
  { x: -0.45, y: 0.18, z: -0.5 },
  { x: 0.45, y: 0.18, z: 0.5 },
];
const LOCKS = [
  { x: 0.82, z: 0.25 },
  { x: -0.82, z: 0.25 },
  { x: 0.82, z: -0.7 },
  { x: -0.82, z: -0.7 },
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
  hull.add(body);
  const oars = new THREE.InstancedMesh(k.oar, k.mat, 4);
  oars.frustumCulled = false;
  hull.add(oars);
  const crates: THREE.Mesh[] = [];
  for (let i = 0; i < CARGO.length; i++) {
    const c = new THREE.Mesh(i === 2 ? k.barrel : k.crate, k.loot);
    c.position.set(CARGO[i].x, CARGO[i].y, CARGO[i].z);
    c.visible = false;
    hull.add(c);
    crates.push(c);
  }
  const dummy = new THREE.Object3D();
  let alive = true;
  return {
    group,
    hull,
    seats: SEATS,
    cargoSpots: CARGO,
    update(a: DinghyAnim) {
      const t = a.t;
      const s = a.sink;
      hull.position.y = 0.05 * Math.sin(t * 1.7) - 1.2 * s * s;
      hull.rotation.set(-0.5 * s + 0.04 * Math.sin(t * 1.3), 0, 0.4 * s + 0.05 * Math.sin(t * 1.1) + 0.1 * a.hit, 'YXZ');
      for (let i = 0; i < 4; i++) {
        const l = LOCKS[i];
        const side = l.x > 0 ? 1 : -1;
        const sweep = a.oars === 0 ? 0.45 * Math.sin(a.stroke * Math.PI * 2) : 0;
        const lift = a.oars === 1 ? 1.2 : a.oars === 2 ? 0 : -0.25;
        dummy.position.set(l.x, 0.55, l.z);
        dummy.rotation.set(0, side > 0 ? sweep : Math.PI - sweep, side > 0 ? -lift : lift, 'YXZ');
        if (a.oars === 2) dummy.rotation.set(0, side > 0 ? Math.PI / 2 : Math.PI / 2, 0, 'YXZ');
        dummy.updateMatrix();
        oars.setMatrixAt(i, dummy.matrix);
      }
      oars.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < crates.length; i++) crates[i].visible = i < a.cargo;
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
