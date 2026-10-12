// Небольшой обложенный берегом пруд: готовая вода и желейка рыбака, два меша окружения.
import * as THREE from 'three';
import { FARM_POND, POND_NPC, POND_SPOTS } from '../../../shared/farmpond.ts';
import { DEFAULT_OUTFIT } from '../../../shared/outfit.ts';
import { E_ALIVE, E_GROUNDED } from '../../../shared/protocol.ts';
import type { CollisionWorld } from '../../../shared/world.ts';
import { Avatar, type AvatarPose } from '../../render/avatar.ts';
import { mergeColored, paint, place, staticMesh } from '../../render/kit.ts';
import { EVENING, makeSea } from '../../render/sky.ts';

export class Pond3D {
  readonly group = new THREE.Group();
  private readonly water: ReturnType<typeof makeSea>;
  private readonly foma: Avatar;
  private readonly pose: AvatarPose;
  private greeted = false;

  constructor(scene: THREE.Scene) {
    this.group.name = 'farm-pond';
    const p = FARM_POND;
    this.water = makeSea(EVENING);
    this.water.geometry.dispose();
    // Обложенный берегом бассейн совпадает с непроходимым боксом воды; мягкие углы меньше радиуса игрока.
    const w = p.radius.x, h = p.radius.z, r = .2;
    const shape = new THREE.Shape();
    shape.moveTo(-w + r, -h); shape.lineTo(w - r, -h); shape.quadraticCurveTo(w, -h, w, -h + r);
    shape.lineTo(w, h - r); shape.quadraticCurveTo(w, h, w - r, h);
    shape.lineTo(-w + r, h); shape.quadraticCurveTo(-w, h, -w, h - r);
    shape.lineTo(-w, -h + r); shape.quadraticCurveTo(-w, -h, -w + r, -h);
    this.water.geometry = new THREE.ShapeGeometry(shape, 4) as unknown as THREE.PlaneGeometry;
    this.water.position.set(p.center.x, p.waterY, p.center.z);
    this.water.name = 'farm-pond-water'; this.water.userData.p3keep = true;
    this.group.add(this.water);
    const timber: THREE.BufferGeometry[] = [];
    const d = p.deck;
    for (let x = d.x0; x < d.x1 - .05; x += .22) timber.push(place(paint(new THREE.BoxGeometry(.20, .07, d.z1 - d.z0), 0xaa7950), x + .10, d.y - .035, (d.z0 + d.z1) / 2));
    for (const z of [d.z0 + .12, d.z1 - .12]) timber.push(place(paint(new THREE.BoxGeometry(d.x1 - d.x0, .16, .12), 0x67482f), (d.x0 + d.x1) / 2, d.y - .15, z));
    for (const s of POND_SPOTS) {
      timber.push(place(paint(new THREE.CylinderGeometry(.09, .12, .55, 6), 0x795b3d), s.x, -.175, d.z0 + .18));
      timber.push(place(paint(new THREE.BoxGeometry(1.2, .012, .045), 0xddc397), s.x, d.y + .008, s.z + .38));
    }
    // Прилавок Фомы: между покупателем и рыбаком, проход к помосту свободен.
    const nx = POND_NPC.x + .35, nz = POND_NPC.z - .35;
    timber.push(place(paint(new THREE.BoxGeometry(1.15, .08, .65), 0xb07a47), nx, .85, nz));
    for (const sx of [-.45, .45]) for (const sz of [-.20, .20]) timber.push(place(paint(new THREE.BoxGeometry(.08, .85, .08), 0x6e4c2f), nx + sx, .425, nz + sz));
    const wood = staticMesh(mergeColored(timber), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85 }), true);
    wood.name = 'farm-pond-timber'; this.group.add(wood);
    const bank: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) bank.push(place(paint(new THREE.BoxGeometry(.16, .18, h * 2 + .32), 0x8b8566), p.center.x + sx * (w + .08), .07, p.center.z));
    for (const sz of [-1, 1]) bank.push(place(paint(new THREE.BoxGeometry(w * 2, .18, .16), 0x8b8566), p.center.x, .07, p.center.z + sz * (h + .08)));
    // Редкие камыши — общая геометрия, без новых материалов/прозрачных листьев.
    for (let i = 0; i < 12; i++) {
      const x = p.center.x - w + .3 + i * (w * 2 - .6) / 11;
      const z = p.center.z - h - .18;
      bank.push(place(paint(new THREE.CylinderGeometry(.012, .016, .8, 4), 0x698046), x, .4, z));
      bank.push(place(paint(new THREE.CylinderGeometry(.045, .045, .18, 5), 0x775234), x, .79, z));
    }
    this.group.add(staticMesh(mergeColored(bank), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 }), false));
    scene.add(this.group);
    this.foma = new Avatar(9945, { gun: false, voice: false });
    this.foma.setOutfit({ ...DEFAULT_OUTFIT, c: 15, c2: 2, p: 'none', e: 'happy', h: 'angler', a: 'angler' });
    this.foma.setInfo('Рыбак Фома', null, false);
    this.foma.addTo(scene);
    this.pose = { x: POND_NPC.x, y: POND_NPC.y, z: POND_NPC.z, yaw: POND_NPC.yaw, pitch: 0, flags: E_ALIVE | E_GROUNDED };
    this.setVisible(false);
  }

  setVisible(on: boolean): void { this.group.visible = on; this.foma.hidden = !on; }

  update(dt: number, time: number, collision: CollisionWorld, camera: THREE.Vector3, me: { x: number; z: number } | null): void {
    this.water.material.uniforms.uTime.value = time;
    if (!this.group.visible) return;
    const near = !!me && Math.hypot(me.x - POND_NPC.x, me.z - POND_NPC.z) < 3;
    if (near && !this.greeted) this.foma.react(1);
    this.greeted = near;
    this.pose.yaw = near && me ? Math.atan2(-(me.x - this.pose.x), -(me.z - this.pose.z)) : POND_NPC.yaw;
    // Живое ожидание и небольшой шаг у прилавка, без выхода из своей зоны.
    this.pose.x = POND_NPC.x + .08 * Math.sin(time * .5);
    this.foma.update(this.pose, dt, time, collision, camera, false);
  }
}
