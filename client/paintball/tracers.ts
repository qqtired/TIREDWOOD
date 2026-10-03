// Трассеры выстрелов AWP: яркая нить от дула до попадания с ореолом цвета команды, тает за 0,4 с.
// Небольшой пул: выстрелов AWP мало (одна винтовка на карте, раз в 1,2 с).
import * as THREE from 'three';

const MAX = 6;
const LIFE = 0.4;
const CORE_R = 0.026;
const GLOW_R = 0.085;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

interface Tracer {
  core: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  glow: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  life: number;
}

export class Tracers {
  private readonly list: Tracer[] = [];
  private next = 0;

  constructor(scene: THREE.Scene) {
    // цилиндр от 0 до 1 по +Y: ставим в дуло, поворачиваем к цели и растягиваем на длину выстрела
    const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0);
    const mat = (color: number) => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, fog: false });
    for (let i = 0; i < MAX; i++) {
      const core = new THREE.Mesh(geo, mat(0xfffbea));
      const glow = new THREE.Mesh(geo, mat(0xffffff));
      for (const m of [core, glow]) {
        m.visible = false;
        m.frustumCulled = false;
        m.renderOrder = 4;
        scene.add(m);
      }
      this.list.push({ core, glow, life: 0 });
    }
  }

  /** Нить от (fx, fy, fz) до (tx, ty, tz); color — ореол (цвет команды стрелка). */
  shoot(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, color: number): void {
    _v.set(tx - fx, ty - fy, tz - fz);
    const len = _v.length();
    if (len < 0.05) return;
    const t = this.list[this.next];
    this.next = (this.next + 1) % MAX;
    _q.setFromUnitVectors(Y_AXIS, _v.multiplyScalar(1 / len));
    for (const m of [t.core, t.glow]) {
      m.position.set(fx, fy, fz);
      m.quaternion.copy(_q);
      m.visible = true;
    }
    t.core.scale.set(CORE_R, len, CORE_R);
    t.glow.scale.set(GLOW_R, len, GLOW_R);
    t.glow.material.color.set(color);
    t.life = LIFE;
  }

  update(dt: number): void {
    for (const t of this.list) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.core.visible = false;
        t.glow.visible = false;
        continue;
      }
      const k = t.life / LIFE;
      t.core.material.opacity = Math.min(1, k * 1.6);
      t.glow.material.opacity = 0.45 * k;
      // нить тоньше, ореол чуть расплывается
      const rc = CORE_R * (0.35 + 0.65 * k);
      const rg = GLOW_R * (1.5 - 0.5 * k);
      t.core.scale.x = rc;
      t.core.scale.z = rc;
      t.glow.scale.x = rg;
      t.glow.scale.z = rg;
    }
  }

  clear(): void {
    for (const t of this.list) {
      t.life = 0;
      t.core.visible = false;
      t.glow.visible = false;
    }
  }
}
