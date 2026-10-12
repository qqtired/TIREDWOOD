// Краскомёт ловца от первого лица: игрушечный бластер с прозрачным баком наверху — по нему видно, сколько краски.
// Рисуется вторым проходом поверх мира (своя сцена и камера, глубина очищена): не залезает в стены.
import * as THREE from 'three';
import type { Renderer } from '../render/renderer.ts';
import { PAINT_COLOR } from './props.ts';

/** Положение краскомёта относительно камеры: справа внизу, бак виден, но не закрывает обзор */
const GUN_X = 0.21, GUN_Y = -0.235, GUN_Z = -0.45;

export class PaintGun {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.01, 10);
  private readonly root = new THREE.Group();
  private readonly fill: THREE.Mesh;
  private readonly fillMat: THREE.MeshStandardMaterial;
  private readonly tankH = 0.13;
  private kick = 0;
  private bob = 0;
  private shake = 0;
  private level = 1;
  visible = false;

  constructor() {
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x8a6a50, 2.2));
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.4);
    sun.position.set(-1, 2, 1.5);
    this.scene.add(sun);
    const mat = (color: number, rough = 0.45, metal = 0.05) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    const body = mat(0xff8a1c), dark = mat(0x2f3338, 0.6), cream = mat(0xfff3de, 0.5);
    const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      this.root.add(mesh);
      return mesh;
    };
    add(new THREE.BoxGeometry(0.11, 0.1, 0.36), body, 0, 0, 0);
    add(new THREE.CylinderGeometry(0.045, 0.05, 0.18, 14), cream, 0, 0.005, -0.25, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.052, 0.052, 0.03, 14), dark, 0, 0.005, -0.345, Math.PI / 2);
    add(new THREE.BoxGeometry(0.06, 0.15, 0.07), dark, 0, -0.1, 0.1, -0.25);
    add(new THREE.BoxGeometry(0.02, 0.05, 0.05), dark, 0, -0.07, 0.02);
    add(new THREE.BoxGeometry(0.115, 0.03, 0.12), cream, 0, -0.035, -0.08);
    // бак: прозрачная колба и краска внутри (высота — по запасу); стоит ближе к стволу, чтобы не закрывать полэкрана
    const tz = -0.07;
    add(new THREE.CylinderGeometry(0.048, 0.048, this.tankH + 0.02, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }), 0, 0.06 + (this.tankH + 0.02) / 2, tz);
    add(new THREE.CylinderGeometry(0.054, 0.054, 0.02, 16), dark, 0, 0.06, tz);
    add(new THREE.CylinderGeometry(0.054, 0.054, 0.02, 16), dark, 0, 0.08 + this.tankH, tz);
    this.fillMat = new THREE.MeshStandardMaterial({ color: PAINT_COLOR, roughness: 0.25, emissive: 0x3a0518 });
    this.fill = add(new THREE.CylinderGeometry(0.042, 0.042, 1, 16).translate(0, 0.5, 0), this.fillMat, 0, 0.07, tz);
    // варежка на рукояти
    add(new THREE.SphereGeometry(0.06, 12, 10).scale(1, 1.2, 1), mat(0xffd35a, 0.7), 0.01, -0.13, 0.11);
    this.root.position.set(GUN_X, GUN_Y, GUN_Z);
    this.root.rotation.set(0.02, -0.08, 0);
    this.scene.add(this.root);
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  fire(): void { this.kick = 1; }
  jam(): void { this.shake = 0.5; }

  /** paint 0…100; moving — 0…1 (бег качает ствол) */
  update(dt: number, paint: number, jammed: boolean, moving: number): void {
    this.level += (paint / 100 - this.level) * Math.min(1, dt * 8);
    this.fill.scale.y = Math.max(0.001, this.level * this.tankH);
    this.fillMat.color.set(jammed ? 0x8a8f96 : PAINT_COLOR);
    this.kick = Math.max(0, this.kick - dt * 6);
    this.shake = Math.max(0, this.shake - dt);
    this.bob += dt * (4 + moving * 6);
    const b = moving * 0.012;
    const k = Math.sin(this.kick * Math.PI) * this.kick;
    const sh = this.shake > 0 ? Math.sin(this.shake * 60) * 0.006 : 0;
    this.root.position.set(GUN_X + Math.sin(this.bob) * b + sh, GUN_Y + Math.abs(Math.cos(this.bob)) * b + k * 0.02, GUN_Z + k * 0.07);
    this.root.rotation.x = 0.02 + k * 0.25;
  }

  render(r: Renderer): void {
    if (!this.visible) return;
    r.gl.clearDepth();
    r.gl.render(this.scene, this.camera);
  }
}
