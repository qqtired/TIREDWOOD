import * as THREE from 'three';
import { SKILL_COURSE, type SkillStatus } from '../../shared/skilltest.ts';

/** Lobby gateway only. Matching colliders and interaction belong to the lobby map. */
export class SkillPortal {
  private readonly scene: THREE.Scene;
  private readonly root = new THREE.Group();
  private readonly label: HTMLCanvasElement;
  private readonly texture: THREE.CanvasTexture;
  private lastStatus = '';
  constructor(scene: THREE.Scene, x = -10, z = -12.8) {
    this.scene = scene; this.root.position.set(x, 0, z);
    const stone = new THREE.MeshStandardMaterial({ color: 0xc8e9ed, roughness: 0.6 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x6eafd0, emissive: 0x153344, roughness: 0.65 });
    const box = new THREE.BoxGeometry(1, 1, 1);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(box, stone); post.position.set(side * 1.5, 1.7, 0); post.scale.set(0.36, 3.4, 0.36); this.root.add(post);
      const stripe = new THREE.Mesh(box, blue); stripe.position.set(side * 1.5, 1.55, 0.19); stripe.scale.set(0.11, 2.7, 0.035); this.root.add(stripe);
    }
    const header = new THREE.Mesh(box, stone); header.position.y = 3.125; header.scale.set(3.36, 0.45, 0.36); this.root.add(header);
    this.label = document.createElement('canvas'); this.label.width = 1024; this.label.height = 256;
    this.texture = new THREE.CanvasTexture(this.label); this.texture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.15, 0.79), new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, side: THREE.DoubleSide })); sign.position.set(0, 3.7, 0.2); this.root.add(sign);
    // A faint flat cloud-shaped threshold, no opaque wall or screen-space glow.
    const threshold = new THREE.Mesh(new THREE.CircleGeometry(1.24, 24), new THREE.MeshBasicMaterial({ color: 0x9ce6ef, transparent: true, opacity: 0.28, depthWrite: false })); threshold.rotation.x = -Math.PI / 2; threshold.position.y = 0.015; this.root.add(threshold);
    scene.add(this.root); this.status({ n: 0, max: 5, names: [], course: SKILL_COURSE, phase: 'none', left: 0 });
  }
  status(s: SkillStatus): void {
    const state = `${s.n}/${s.max}`;
    const line = s.n >= s.max ? `Каланча занята · ${state}` : s.phase === 'pre' ? `Сбор забега · старт через ${s.left} с` : s.phase === 'run' ? `Идёт забег · на каланче ${state}` : `Небесная каланча · на каланче ${state}`;
    if (line === this.lastStatus) return; this.lastStatus = line;
    const ctx = this.label.getContext('2d')!; ctx.clearRect(0, 0, 1024, 256);
    ctx.fillStyle = '#31516a'; ctx.beginPath(); ctx.roundRect(0, 0, 1024, 256, 38); ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f1fbff'; ctx.font = '700 82px Rubik, sans-serif'; ctx.fillText('ВЫШЕ ОБЛАКОВ', 512, 85);
    ctx.fillStyle = s.phase === 'pre' ? '#ffd23f' : '#b6e8e7'; ctx.font = '500 43px Rubik, sans-serif'; ctx.fillText(line, 512, 181);
    this.texture.needsUpdate = true;
  }
  update(_dt: number): void {}
  setVisible(on: boolean): void { this.root.visible = on; }
  dispose(): void {
    this.scene.remove(this.root);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.root.traverse(obj => { if (obj instanceof THREE.Mesh) { geometries.add(obj.geometry); for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) materials.add(m); } });
    for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); this.texture.dispose();
  }
}
