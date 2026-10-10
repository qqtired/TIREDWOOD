// Калитка фермы на площади (флаг FARM, docs/farm/level/level.md §9): дуга «ФЕРМА» в парапете на восточном конце Улицы
// Аттракционов, указатель и телега с сеном за парапетом. Без флага ничего не грузится и не рисуется. Склейка по
// материалу — несколько отрисовок на площади. Подсказка у калитки — сколько фермеров и не полна ли ферма.
import * as THREE from 'three';
import { FARM_PLOTS } from '../../shared/farmdata.ts';
import { FARM_LAYOUT } from '../../shared/farmlayout.ts';
import type { FarmStatus } from '../../shared/farmnet.ts';
import { StaticBatch, loadModel } from './models.ts';

const G = FARM_LAYOUT.plazaGate;

function at(x: number, y: number, z: number, yaw: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
}

export class FarmGate {
  private readonly refresh: () => void;
  private st: FarmStatus | null = null;
  private built = false;
  /** Всё, что калитка добавила на площадь (для замера «до и после» и будущей анимации створок) */
  readonly group = new THREE.Group();

  constructor(scene: THREE.Scene, refreshShadows: () => void) {
    this.refresh = refreshShadows;
    this.group.name = 'farm-gate';
    scene.add(this.group);
  }

  /** Режим включён флагом сервера (в приветствии площади есть статус фермы) */
  get on(): boolean {
    return this.st !== null;
  }

  status(st: FarmStatus | null): void {
    this.st = st;
    if (st && !this.built) {
      this.built = true;
      void this.build();
    }
  }

  /** Подсказка у калитки: ключи и текст */
  hint(): [string[], string] {
    const st = this.st;
    if (!st) return [[], ''];
    if (st.n >= (st.max || FARM_PLOTS)) return [[], `Ферма полна: ${st.n} из ${st.max}`];
    return [['E'], `на ферму · ${st.n} из ${st.max} фермеров`];
  }

  private async build(): Promise<void> {
    const m = await loadModel('plaza_gate');
    const a = G.anchor;
    const c = G.current;
    const b = new StaticBatch();
    const node = (n: string) => m.nodes.get(n);
    b.add(node('plaza_gate'), at(a.x, 0, a.z, a.yaw));
    // створки калитки приоткрыты внутрь фермы — видно, что сюда можно
    const hinge = (lx: number, open: number, n: string): void => {
      const cos = Math.cos(a.yaw);
      const sin = Math.sin(a.yaw);
      b.add(node(n), at(a.x + lx * cos, 0, a.z - lx * sin, a.yaw + open));
    };
    hinge(-0.7, -0.5, 'plaza_gate_leaf_l');
    hinge(0.7, 0.5, 'plaza_gate_leaf_r');
    b.add(node('signpost'), at(c.signpost.x, 0, c.signpost.z, a.yaw));
    b.add(node('plaza_cart'), at(c.cart.x, c.cart.y, c.cart.z, a.yaw));
    for (const mesh of b.build()) this.group.add(mesh);
    this.refresh();
  }
}
