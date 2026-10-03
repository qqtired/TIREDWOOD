// Эффекты бонусов, которые остаются на месте, а не едут с картом: волна «Хлопка» — кольцо по земле и ударная волна
// вверх, расходятся на радиус хлопка (8 м) за полсекунды. Не больше четырёх волн разом. Пузырь — на самом карте (kart3d.ts).
import * as THREE from 'three';

/** Радиус волны хлопка (как CLAP_R на сервере) и сколько она расходится, с */
const CLAP_R = 8;
const CLAP_S = 0.5;

interface Wave {
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  dome: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  age: number;
}

export class RaceItemFx {
  private readonly waves: Wave[] = [];
  private next = 0;

  constructor(scene: THREE.Scene) {
    const ringGeo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
    const domeGeo = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
      );
      const dome = new THREE.Mesh(
        domeGeo,
        new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
      );
      ring.visible = dome.visible = false;
      ring.renderOrder = dome.renderOrder = 4;
      scene.add(ring, dome);
      this.waves.push({ ring, dome, age: CLAP_S });
    }
  }

  /** Хлопок в точке (x, y, z): волна по земле и купол */
  clap(x: number, y: number, z: number): void {
    const w = this.waves[this.next++ % this.waves.length];
    w.age = 0;
    w.ring.position.set(x, y + 0.08, z);
    w.dome.position.set(x, y, z);
    w.ring.visible = w.dome.visible = true;
  }

  clear(): void {
    for (const w of this.waves) {
      w.age = CLAP_S;
      w.ring.visible = w.dome.visible = false;
    }
  }

  update(dt: number): void {
    for (const w of this.waves) {
      if (w.age >= CLAP_S) {
        w.ring.visible = w.dome.visible = false;
        continue;
      }
      w.age += dt;
      const k = Math.min(1, w.age / CLAP_S);
      const r = 0.6 + (CLAP_R - 0.6) * (1 - (1 - k) * (1 - k));
      w.ring.scale.setScalar(r);
      w.ring.material.opacity = (1 - k) * 0.9;
      w.dome.scale.set(r, r * 0.45, r);
      w.dome.material.opacity = (1 - k) * (1 - k) * 0.35;
    }
  }
}
