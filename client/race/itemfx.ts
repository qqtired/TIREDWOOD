// Six shield rings and eight short pulse rings at most; no projectiles, hit logic or growing effect arrays.
import * as THREE from 'three';
import { KM_SHIELD, KE_ON, type KartSnap } from '../../shared/kartnet.ts';

export class RaceItemFx {
  private readonly shields: THREE.Mesh[] = [];
  private readonly pulses: Array<{ mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; age: number }> = [];
  private next = 0;
  private readonly pulseGeo = new THREE.RingGeometry(0.88, 1, 32).rotateX(-Math.PI / 2);
  private readonly coneGeo = new THREE.RingGeometry(0.88, 1, 24, 1, -Math.PI / 4, Math.PI / 2).rotateX(-Math.PI / 2);

  constructor(scene: THREE.Scene) {
    const shieldGeo = new THREE.TorusGeometry(1.35, 0.07, 6, 32).rotateX(-Math.PI / 2);
    const shieldMat = new THREE.MeshBasicMaterial({ color: 0x67e3ff, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(shieldGeo, shieldMat);
      mesh.visible = false; scene.add(mesh); this.shields.push(mesh);
    }

    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(this.pulseGeo, new THREE.MeshBasicMaterial({ color: 0xaaccff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      mesh.visible = false; scene.add(mesh); this.pulses.push({ mesh, age: 1 });
    }
  }

  snapshot(karts: readonly KartSnap[], count: number): void {
    for (const mesh of this.shields) mesh.visible = false;
    for (let i = 0; i < count; i++) {
      const k = karts[i]; const mesh = this.shields[k.id - 1];
      if (!mesh) continue;
      mesh.visible = !!(k.misc & KM_SHIELD) && !!(k.flags & KE_ON);
      mesh.position.set(k.x, k.y + 0.5, k.z);
    }
  }

  pulse(x: number, y: number, z: number, yaw?: number): void {
    const p = this.pulses[this.next++ % this.pulses.length];
    p.mesh.geometry = yaw === undefined ? this.pulseGeo : this.coneGeo;
    p.mesh.rotation.y = yaw === undefined ? 0 : yaw + Math.PI / 2;
    p.age = 0; p.mesh.position.set(x, y + 0.1, z); p.mesh.visible = true;
  }

  clear(): void {
    for (const mesh of this.shields) mesh.visible = false;
    for (const p of this.pulses) { p.age = 1; p.mesh.visible = false; }
  }

  update(dt: number): void {
    for (const p of this.pulses) {
      if (p.age >= 0.45) { p.mesh.visible = false; continue; }
      p.age += dt;
      p.mesh.scale.setScalar(1 + p.age * 25);
      p.mesh.material.opacity = Math.max(0, 1 - p.age / 0.45) * 0.7;
    }
  }
}
