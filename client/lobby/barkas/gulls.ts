// Чайки «Альбатроса»: две кружат над кормой (ждут рыбу у Сани; в дождь улетают), две сидят — на перекладине А-рамы
// и на марсе мачты: вертят головой, иногда встряхивают крыльями. Кричат — ambient.ts.
import * as THREE from 'three';
import { BARKAS, BARKAS_AFRAME, BARKAS_HOUSE } from '../../../shared/barkas.ts';

interface Flyer {
  obj: THREE.Group;
  wingL: THREE.Mesh;
  wingR: THREE.Mesh;
  cx: number;
  cz: number;
  y: number;
  r: number;
  speed: number;
  phase: number;
}

interface Sitter {
  obj: THREE.Group;
  head: THREE.Mesh;
  wingL: THREE.Mesh;
  wingR: THREE.Mesh;
  phase: number;
}

export class BarkasGulls {
  private readonly flyers: Flyer[] = [];
  private readonly sitters: Sitter[] = [];
  private away = 0;

  constructor(scene: THREE.Scene) {
    const body = new THREE.SphereGeometry(0.16, 8, 6).scale(1, 0.8, 2.2);
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.18, 0.95, 0.05, 0.05, 0, 0, 0.2, 0.95, 0.05, 0.05, 0.55, 0.02, 0.22, 0, 0, 0.2], 3));
    wing.computeVertexNormals();
    const folded = new THREE.SphereGeometry(0.1, 6, 4).scale(0.5, 0.7, 2.3);
    const headGeo = new THREE.SphereGeometry(0.085, 8, 6);
    const beak = new THREE.ConeGeometry(0.025, 0.1, 5).rotateX(-Math.PI / 2).translate(0, -0.01, -0.11);
    const white = new THREE.MeshLambertMaterial({ color: 0xf4f1ea, side: THREE.DoubleSide });
    const grey = new THREE.MeshLambertMaterial({ color: 0x9aa0a6, side: THREE.DoubleSide });
    const yellow = new THREE.MeshLambertMaterial({ color: 0xe8b63a });
    const cx = BARKAS.stern - 5;
    for (let i = 0; i < 2; i++) {
      const obj = new THREE.Group();
      obj.add(new THREE.Mesh(body, white));
      const wingR = new THREE.Mesh(wing, i ? white : grey);
      const wingL = new THREE.Mesh(wing, i ? white : grey);
      wingL.scale.x = -1;
      obj.add(wingR, wingL);
      obj.scale.setScalar(1.3);
      scene.add(obj);
      this.flyers.push({ obj, wingL, wingR, cx: cx - i * 4, cz: BARKAS.z + (i ? 1.5 : -1), y: 7.5 + i * 2.2, r: 6 + i * 2.5, speed: i ? -5.5 : 6.5, phase: i * 2.1 });
    }
    // где сидят (верх перекладины А-рамы, поручень марса) и куда смотрят; лапы — 0,29 м под центром
    const perches: ReadonlyArray<readonly [number, number, number, number]> = [
      [BARKAS_AFRAME.x + 0.55, BARKAS_AFRAME.h + 0.12, BARKAS.z - 1.6, 1.9],
      [BARKAS_HOUSE.x0 + 0.75 + 0.46, 7.27, BARKAS.z, -2.6],
    ];
    perches.forEach(([x, y, z, yaw], i) => {
      const obj = new THREE.Group();
      obj.add(new THREE.Mesh(body, white));
      const wingL = new THREE.Mesh(folded, grey);
      const wingR = new THREE.Mesh(folded, grey);
      wingL.position.set(-0.11, 0.04, 0.06);
      wingR.position.set(0.11, 0.04, 0.06);
      obj.add(wingL, wingR);
      const head = new THREE.Mesh(headGeo, white);
      head.add(new THREE.Mesh(beak, yellow));
      head.position.set(0, 0.13, -0.27);
      obj.add(head);
      for (const sx of [-0.05, 0.05]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 4), yellow);
        leg.position.set(sx, -0.17, 0);
        obj.add(leg);
      }
      obj.position.set(x, y + 0.29, z);
      obj.rotation.y = yaw;
      obj.scale.setScalar(1.25);
      scene.add(obj);
      this.sitters.push({ obj, head, wingL, wingR, phase: i * 3.7 });
    });
  }

  update(dt: number, t: number, rain: number, visible: boolean): void {
    // в дождь кружащие улетают ввысь и пропадают; кончился — возвращаются
    this.away = THREE.MathUtils.clamp(this.away + (rain > 0.4 ? dt : -dt) / 6, 0, 1);
    for (const g of this.flyers) {
      g.obj.visible = visible && this.away < 0.98;
      if (!g.obj.visible) continue;
      const a = (t * g.speed) / g.r + g.phase;
      const r = g.r * (1 + this.away * 3);
      g.obj.position.set(g.cx + Math.cos(a) * r, g.y + this.away * 30 + Math.sin(t * 0.5 + g.phase) * 0.8, g.cz + Math.sin(a) * r);
      const dir = g.speed > 0 ? 1 : -1;
      g.obj.rotation.set(0, Math.atan2(Math.sin(a) * dir, -Math.cos(a) * dir), -0.3 * dir);
      const flapping = Math.sin(t * 0.6 + g.phase) > 0.1 || this.away > 0;
      const flap = flapping ? Math.sin(t * 8.5 + g.phase) * 0.55 : 0.1;
      g.wingR.rotation.z = flap;
      g.wingL.rotation.z = -flap;
    }
    for (const s of this.sitters) {
      s.obj.visible = visible;
      if (!visible) continue;
      // вертит головой рывками, раз в ~11 с встряхивает крыльями
      const step = Math.floor((t + s.phase) / 1.7);
      s.head.rotation.y = Math.sin(step * 2.3 + s.phase) * 0.9;
      const ph = (t + s.phase * 2) % 11;
      const k = ph < 0.8 ? Math.sin((ph / 0.8) * Math.PI) : 0;
      s.wingL.rotation.z = 0.9 * k * Math.abs(Math.sin(t * 20));
      s.wingR.rotation.z = -0.9 * k * Math.abs(Math.sin(t * 20));
    }
  }
}
