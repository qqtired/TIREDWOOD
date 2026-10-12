// Эффекты пряток: комок краски летит от ловца, шлёпается кляксой на стену или предмет (клякса сохнет 20 с),
// брызги, облачко превращения, конфетти поимки и нотка над тем, кто дразнится.
import * as THREE from 'three';
import { fxCount } from '../render/gfx.ts';
import { glowTexture } from '../render/kit.ts';
import * as tex from '../render/textures.ts';
import { PAINT_COLOR } from './props.ts';

type V3 = [number, number, number];

interface Ball { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; done?: () => void }
interface Drop { v: THREE.Vector3; p: THREE.Vector3; life: number; spin: number }
interface Decal { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; born: number }
interface Puff { sprite: THREE.Sprite; t: number; dx: number; dz: number }


const DECALS = 48;
const DROPS = 160;
const CONFETTI = ['#ff4f7a', '#ffd35a', '#4fc3ff', '#7bd88f', '#c38bff', '#ff8a1c'];



export class HideFx {
  private readonly scene: THREE.Scene;
  private readonly balls: Ball[] = [];
  private readonly ballGeo = new THREE.SphereGeometry(0.075, 10, 8);
  private readonly ballMat = new THREE.MeshStandardMaterial({ color: PAINT_COLOR, roughness: 0.3, emissive: 0x5a0a2a });
  private readonly drops: Drop[] = [];
  private readonly dropMesh: THREE.InstancedMesh;
  private readonly decals: Decal[] = [];
  private decalNext = 0;
  private readonly decalGeos: THREE.PlaneGeometry[] = [];
  private readonly splatTex = tex.splatAtlas();
  private readonly puffs: Puff[] = [];
  private readonly puffMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, depthWrite: false, opacity: 0.8 });
  private readonly confetti: THREE.InstancedMesh;
  private readonly bits: (Drop & { color: THREE.Color; rot: THREE.Euler })[] = [];

  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  time = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 5), new THREE.MeshStandardMaterial({ color: PAINT_COLOR, roughness: 0.3 }), DROPS);
    this.dropMesh.frustumCulled = false; this.dropMesh.count = 0;
    scene.add(this.dropMesh);
    // четыре варианта кляксы из атласа 2×2
    for (let v = 0; v < 4; v++) {
      const g = new THREE.PlaneGeometry(1, 1);
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      const u0 = (v % 2) * 0.5, v0 = (v < 2 ? 0.5 : 0);
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
      this.decalGeos.push(g);
    }
    this.confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.06, 0.1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 120);
    this.confetti.frustumCulled = false; this.confetti.count = 0;
    scene.add(this.confetti);

  }

  /** Комок краски от from к to (быстро: ~25 м/с); по прилёту — done */
  shot(from: V3, to: V3, done?: () => void): void {
    const mesh = new THREE.Mesh(this.ballGeo, this.ballMat);
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    mesh.position.copy(a);
    this.scene.add(mesh);
    this.balls.push({ mesh, from: a, to: b, t: 0, dur: Math.max(0.04, a.distanceTo(b) / 28), done });
  }

  /** Клякса на поверхности (стена, пол, пустой предмет): живёт 20 с, последние 4 — бледнеет */
  decal(p: V3, n: V3, size = 0.55): void {
    let d = this.decals[this.decalNext];
    if (!d) {
      const mat = new THREE.MeshStandardMaterial({ map: this.splatTex, color: PAINT_COLOR, transparent: true, depthWrite: false, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
      d = { mesh: new THREE.Mesh(this.decalGeos[0], mat), mat, born: 0 };
      d.mesh.renderOrder = 1;
      this.scene.add(d.mesh);
      this.decals[this.decalNext] = d;
    }
    this.decalNext = (this.decalNext + 1) % DECALS;
    const normal = new THREE.Vector3(...n);
    if (normal.lengthSq() < 0.5) normal.set(0, 1, 0);
    normal.normalize();
    d.mesh.geometry = this.decalGeos[(Math.random() * 4) | 0];
    d.mesh.position.set(p[0], p[1], p[2]).addScaledVector(normal, 0.012);
    d.mesh.quaternion.setFromUnitVectors(this.zAxis, normal);
    d.mesh.rotateZ(Math.random() * Math.PI * 2);
    d.mesh.scale.setScalar(size * (0.85 + Math.random() * 0.3));
    d.mesh.visible = true;
    d.mat.opacity = 1;
    d.born = this.time;
  }

  /** Брызги краски из точки по нормали */
  splash(p: V3, n: V3, count = 14): void {
    const normal = new THREE.Vector3(...n);
    if (normal.lengthSq() < 0.5) normal.set(0, 1, 0);
    const total = fxCount(count);
    for (let i = 0; i < total && this.drops.length < DROPS; i++) {
      const v = normal.clone().multiplyScalar(1.5 + Math.random() * 2).add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3));
      this.drops.push({ v, p: new THREE.Vector3(...p), life: 0.45 + Math.random() * 0.3, spin: 0.02 + Math.random() * 0.03 });
    }
  }

  /** Облачко превращения */
  puff(p: V3): void {
    for (let i = 0; i < 7; i++) {
      const sprite = new THREE.Sprite(this.puffMat.clone());
      const a = (i / 7) * Math.PI * 2;
      sprite.position.set(p[0] + Math.cos(a) * 0.15, p[1] + 0.25 + Math.random() * 0.3, p[2] + Math.sin(a) * 0.15);
      sprite.scale.setScalar(0.3);
      this.scene.add(sprite);
      this.puffs.push({ sprite, t: 0, dx: Math.cos(a) * 0.9, dz: Math.sin(a) * 0.9 });
    }
  }

  /** Поймали: конфетти вверх */
  confettiAt(p: V3): void {
    for (let i = 0; i < 70; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 4, 3.5 + Math.random() * 3, (Math.random() - 0.5) * 4);
      this.bits.push({ v, p: new THREE.Vector3(p[0], p[1] + 0.5, p[2]), life: 1.8 + Math.random() * 0.8, spin: 4 + Math.random() * 8, color: new THREE.Color(CONFETTI[i % CONFETTI.length]), rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0) });
    }
    if (this.bits.length > 120) this.bits.splice(0, this.bits.length - 120);
  }


  update(dt: number): void {
    this.time += dt;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      b.mesh.position.lerpVectors(b.from, b.to, k);
      b.mesh.position.y += Math.sin(k * Math.PI) * 0.08;
      if (k >= 1) { this.scene.remove(b.mesh); this.balls.splice(i, 1); b.done?.(); }
    }
    let n = 0;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life -= dt;
      if (d.life <= 0) { this.drops.splice(i, 1); continue; }
      d.v.y -= 9.8 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < 0.02) { d.p.y = 0.02; d.v.set(0, 0, 0); }
    }
    for (const d of this.drops) {
      const r = d.spin * Math.min(1, d.life * 3);
      this.m.compose(d.p, this.q.identity(), this.s.set(r, r, r));
      this.dropMesh.setMatrixAt(n++, this.m);
    }
    this.dropMesh.count = n;
    if (n) this.dropMesh.instanceMatrix.needsUpdate = true;
    for (const d of this.decals) {
      if (!d?.mesh.visible) continue;
      const age = this.time - d.born;
      if (age > 20) d.mesh.visible = false;
      else if (age > 16) d.mat.opacity = (20 - age) / 4;
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.t += dt;
      const k = p.t / 0.7;
      if (k >= 1) { this.scene.remove(p.sprite); p.sprite.material.dispose(); this.puffs.splice(i, 1); continue; }
      p.sprite.position.x += p.dx * dt; p.sprite.position.z += p.dz * dt; p.sprite.position.y += dt * 0.6;
      p.sprite.scale.setScalar(0.3 + k * 0.8);
      p.sprite.material.opacity = 0.85 * (1 - k);
    }
    let c = 0;
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.life -= dt;
      if (b.life <= 0) { this.bits.splice(i, 1); continue; }
      b.v.y -= 6 * dt;
      b.v.multiplyScalar(1 - dt * 1.4);
      b.p.addScaledVector(b.v, dt);
      if (b.p.y < 0.01) { b.p.y = 0.01; b.v.set(0, 0, 0); }
      b.rot.x += b.spin * dt; b.rot.y += b.spin * 0.7 * dt;
    }
    for (const b of this.bits) {
      this.m.compose(b.p, this.q.setFromEuler(b.rot), this.s.set(1, 1, 1));
      this.confetti.setMatrixAt(c, this.m);
      this.confetti.setColorAt(c, b.color);
      c++;
    }
    this.confetti.count = c;
    if (c) { this.confetti.instanceMatrix.needsUpdate = true; if (this.confetti.instanceColor) this.confetti.instanceColor.needsUpdate = true; }
  }

  clear(): void {
    for (const b of this.balls) this.scene.remove(b.mesh);
    this.balls.length = 0;
    this.drops.length = 0;
    this.dropMesh.count = 0;
    for (const d of this.decals) if (d) d.mesh.visible = false;
    for (const p of this.puffs) { this.scene.remove(p.sprite); p.sprite.material.dispose(); }
    this.puffs.length = 0;
    this.bits.length = 0;
    this.confetti.count = 0;
  }
}
