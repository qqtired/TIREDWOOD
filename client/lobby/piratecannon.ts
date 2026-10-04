// «Набег пиратов»: береговая пушка на кромке причала — дощатая площадка с кнехтом, станок на колёсах, ствол тёмной
// стали с латунными поясками, пирамидка ядер и бочонок пороха. Корень group — на земле и не повёрнут: лафет
// поворачивается внутри (yaw — как у игроков). Геометрии и материалы общие на все пушки (счёт ссылок).
import * as THREE from 'three';
import { colored, merge } from '../fort/mobs/kit.ts';

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
  mat: THREE.MeshStandardMaterial;
  refs: number;
}

let kit: Kit | null = null;

/** Ось цапф над землёй и длина ствола */
const TRUNNION_Y = 0.78;
const BARREL_L = 1.7;

function makeKit(): Kit {
  return {
    base: merge([colored(new THREE.BoxGeometry(1.9, 0.12, 2.2).translate(0, 0.06, 0), 0xb98a58)]),
    carriage: merge([colored(new THREE.BoxGeometry(0.8, 0.5, 1.2).translate(0, 0.37, 0), 0x9a6338)]),
    barrel: merge([colored(new THREE.CylinderGeometry(0.13, 0.2, BARREL_L, 10).rotateX(Math.PI / 2).translate(0, 0, 0.35), 0x2e3a4a)]),
    mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
    refs: 0,
  };
}

export function buildCannon(): CannonModel {
  const k = (kit ??= makeKit());
  k.refs++;
  const group = new THREE.Group();
  group.name = 'pirate-cannon';
  group.add(new THREE.Mesh(k.base, k.mat));
  const turn = new THREE.Group();
  group.add(turn);
  const slide = new THREE.Group();
  turn.add(slide);
  slide.add(new THREE.Mesh(k.carriage, k.mat));
  const tilt = new THREE.Group();
  tilt.position.set(0, TRUNNION_Y, 0);
  slide.add(tilt);
  tilt.add(new THREE.Mesh(k.barrel, k.mat));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, 0.35 + BARREL_L / 2);
  tilt.add(muzzle);
  let alive = true;
  return {
    group,
    muzzle,
    update(a: CannonAnim) {
      turn.rotation.y = a.yaw + Math.PI;
      const r = Math.max(0, Math.min(1, a.recoil));
      slide.position.z = -0.35 * r;
      tilt.rotation.x = -Math.max(-0.1, Math.min(0.6, a.pitch));
    },
    dispose() {
      if (!alive) return;
      alive = false;
      group.removeFromParent();
      if (--k.refs > 0 || kit !== k) return;
      kit = null;
      for (const g of [k.base, k.carriage, k.barrel]) g.dispose();
      k.mat.dispose();
    },
  };
}
