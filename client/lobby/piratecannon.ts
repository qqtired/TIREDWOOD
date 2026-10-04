// «Набег пиратов»: береговая пушка на кромке причала — дощатая площадка, деревянный станок на двух колёсах, тёмный
// ствол с золотыми поясками, рядом пирамидка ядер и бочонок пороха. Готова — над запальным отверстием искрит фитиль;
// заряжается (ready < 1) — из дула ходит банник, фитиль погашен. Корень group — на земле и не повёрнут: станок
// поворачивается внутри (yaw — как у игроков). Геометрии и материалы общие на все пушки (счёт ссылок).
import * as THREE from 'three';
import { colored, merge } from '../fort/mobs/kit.ts';
import { barrelGeo } from './pirateloot.ts';

export interface CannonAnim {
  /** Курс ствола как у игроков: 0 — смотрит в −Z */
  yaw: number;
  /** Подъём ствола, рад (−0,1…0,6) */
  pitch: number;
  /** 1 в момент выстрела → 0: откат ствола и станка */
  recoil: number;
  /** 0…1 — заряжена (1 — готова) */
  ready: number;
  t: number;
}

export interface CannonModel {
  group: THREE.Group;
  /** Пустышка на дульном срезе: мировая точка вылета ядра — muzzle.getWorldPosition */
  readonly muzzle: THREE.Object3D;
  update(a: CannonAnim, dt: number): void;
  dispose(): void;
}

interface Kit {
  base: THREE.BufferGeometry;
  carriage: THREE.BufferGeometry;
  barrel: THREE.BufferGeometry;
  rammer: THREE.BufferGeometry;
  spark: THREE.BufferGeometry;
  mat: THREE.MeshStandardMaterial;
  sparkMat: THREE.MeshBasicMaterial;
  refs: number;
}

let kit: Kit | null = null;

/** Ось цапф над землёй, длина ствола и сдвиг его середины вперёд от цапф */
const TRUNNION_Y = 0.78;
const BARREL_L = 1.7;
const BARREL_Z = 0.35;
const IRON = 0x435268;
const IRON2 = 0x262d38;
const GOLD = 0xe6b84a;
const WOOD = 0xc9773f;
const WOOD2 = 0xa95f32;
const DECK = 0xd9ad72;
const DECK2 = 0xc39459;

/** Ядро: тёмное железо, верх светлее (блик неба) */
function ballGeo(r: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 6, 3);
  const n = g.getAttribute('normal');
  const col = new Float32Array(n.count * 3);
  const a = new THREE.Color(0x3a4352);
  const b = new THREE.Color(0x9aa6b6);
  const c = new THREE.Color();
  for (let i = 0; i < n.count; i++) {
    c.copy(a).lerp(b, Math.max(0, n.getY(i)) ** 1.5);
    c.toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Колесо: дерево, середина (ступица) золотая */
function paintWheel(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const col = new Float32Array(p.count * 3);
  const wood = new THREE.Color(WOOD2);
  const gold = new THREE.Color(GOLD);
  for (let i = 0; i < p.count; i++) (Math.hypot(p.getY(i) - 0.37, p.getZ(i) - 0.28) < 0.05 ? gold : wood).toArray(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function makeKit(): Kit {
  // площадка из трёх досок, пирамидка из 4 ядер (справа сзади), бочонок пороха (слева сзади)
  const base: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) base.push(colored(new THREE.BoxGeometry(0.61, 0.1, 2.2).translate((i - 1) * 0.64, 0.05, 0), i % 2 ? DECK2 : DECK));
  const R = 0.15;
  for (const [x, z] of [[0.62, -0.62], [0.92, -0.62], [0.77, -0.88]]) base.push(ballGeo(R).translate(x, 0.1 + R, z));
  base.push(ballGeo(R).translate(0.77, 0.1 + R + 0.245, -0.71));
  const keg = barrelGeo(true).scale(0.62, 0.62, 0.62).translate(-0.72, 0.1, -0.75);
  base.push(keg);
  // станок: две щеки ступенькой, ось с двумя колёсами впереди, полозок сзади
  const carriage: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    carriage.push(colored(new THREE.BoxGeometry(0.1, 0.36, 1.05).translate(sx * 0.25, 0.4, -0.05), WOOD));
    carriage.push(colored(new THREE.BoxGeometry(0.1, 0.22, 0.5).translate(sx * 0.25, 0.68, 0.2), WOOD));
    const wheel = new THREE.CylinderGeometry(0.27, 0.27, 0.09, 10).rotateZ(Math.PI / 2).translate(sx * 0.4, 0.37, 0.28);
    carriage.push(paintWheel(wheel));
  }
  carriage.push(colored(new THREE.BoxGeometry(0.86, 0.08, 0.08).translate(0, 0.37, 0.28), IRON2));
  carriage.push(colored(new THREE.BoxGeometry(0.6, 0.12, 0.3).translate(0, 0.16, -0.5), WOOD2));
  carriage.push(colored(new THREE.BoxGeometry(0.42, 0.1, 0.9).translate(0, 0.3, -0.05), WOOD2));
  // ствол вдоль +Z от цапф (0, 0, 0): казна с шишкой, тело сужается к дулу, золотые пояски, дульное утолщение
  const zb = BARREL_Z - BARREL_L / 2;
  const zm = BARREL_Z + BARREL_L / 2;
  const tube = (r0: number, r1: number, len: number, z: number, color: number, seg = 12) =>
    colored(new THREE.CylinderGeometry(r1, r0, len, seg, 1, true).rotateX(Math.PI / 2).translate(0, 0, z + len / 2), color);
  const barrel: THREE.BufferGeometry[] = [
    tube(0.21, 0.165, BARREL_L - 0.14, zb, IRON),
    tube(0.2, 0.2, 0.14, zm - 0.14, IRON),
    colored(new THREE.RingGeometry(0.155, 0.205, 12).rotateY(Math.PI).translate(0, 0, zm - 0.14), IRON),
    tube(0.225, 0.225, 0.08, zb + 0.2, GOLD),
    tube(0.19, 0.19, 0.07, zb + 0.95, GOLD),
    colored(new THREE.RingGeometry(0.11, 0.2, 12).translate(0, 0, zm), IRON),
    colored(new THREE.CircleGeometry(0.11, 12).translate(0, 0, zm - 0.05), 0x0d0f12),
    colored(new THREE.ConeGeometry(0.21, 0.16, 12, 1, true).rotateX(-Math.PI / 2).translate(0, 0, zb - 0.08), IRON),
    colored(new THREE.OctahedronGeometry(0.075).translate(0, 0, zb - 0.2), GOLD),
    colored(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6).rotateZ(Math.PI / 2), GOLD),
    // запальное отверстие и фитиль
    colored(new THREE.BoxGeometry(0.03, 0.1, 0.03).translate(0, 0.22, zb + 0.12), 0x5c4332),
  ];
  // банник: древко с пушистой головкой (виден, пока заряжают)
  const rammer = merge([
    colored(new THREE.BoxGeometry(0.04, 0.04, 1.0).translate(0, 0, 0.5), 0xe8c48a),
    colored(new THREE.BoxGeometry(0.17, 0.17, 0.2).translate(0, 0, 0), 0xf3e1b8),
  ]);
  return {
    base: merge(base),
    carriage: merge(carriage),
    barrel: merge(barrel),
    rammer,
    spark: new THREE.OctahedronGeometry(0.07),
    mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
    sparkMat: new THREE.MeshBasicMaterial({ color: 0xffd23a }),
    refs: 0,
  };
}

export function buildCannon(): CannonModel {
  const k = (kit ??= makeKit());
  k.refs++;
  const group = new THREE.Group();
  group.name = 'pirate-cannon';
  const base = new THREE.Mesh(k.base, k.mat);
  base.receiveShadow = true;
  group.add(base);
  const turn = new THREE.Group();
  group.add(turn);
  const slide = new THREE.Group();
  turn.add(slide);
  const carriage = new THREE.Mesh(k.carriage, k.mat);
  carriage.receiveShadow = true;
  slide.add(carriage);
  const tilt = new THREE.Group();
  tilt.position.set(0, TRUNNION_Y, 0);
  slide.add(tilt);
  const barrel = new THREE.Mesh(k.barrel, k.mat);
  barrel.receiveShadow = true;
  tilt.add(barrel);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, BARREL_Z + BARREL_L / 2);
  tilt.add(muzzle);
  const rammer = new THREE.Mesh(k.rammer, k.mat);
  rammer.visible = false;
  tilt.add(rammer);
  const spark = new THREE.Mesh(k.spark, k.sparkMat);
  spark.position.set(0, 0.3, BARREL_Z - BARREL_L / 2 + 0.12);
  tilt.add(spark);
  let alive = true;
  return {
    group,
    muzzle,
    update(a: CannonAnim) {
      const t = a.t;
      turn.rotation.y = a.yaw + Math.PI;
      const r = Math.max(0, Math.min(1, a.recoil));
      const kick = r * r;
      slide.position.z = -0.35 * kick;
      tilt.rotation.x = -Math.max(-0.1, Math.min(0.6, a.pitch)) - 0.18 * kick;
      const ready = a.ready >= 0.999;
      // готова: искра на фитиле пульсирует и вертится
      spark.visible = ready;
      if (ready) {
        const p = 0.8 + 0.35 * Math.abs(Math.sin(t * 9)) + 0.15 * Math.sin(t * 23);
        spark.scale.setScalar(p);
        spark.rotation.set(t * 5, t * 7, 0);
      }
      // заряжают: банник ходит в дуле
      rammer.visible = !ready && r < 0.3;
      if (rammer.visible) rammer.position.set(0, 0, BARREL_Z + BARREL_L / 2 - 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 5)));
    },
    dispose() {
      if (!alive) return;
      alive = false;
      group.removeFromParent();
      if (--k.refs > 0 || kit !== k) return;
      kit = null;
      for (const g of [k.base, k.carriage, k.barrel, k.rammer, k.spark]) g.dispose();
      k.mat.dispose();
      k.sparkMat.dispose();
    },
  };
}
