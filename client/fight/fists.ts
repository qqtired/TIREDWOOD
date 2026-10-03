// Отдельные желейные кулаки: собственная камера и свет, после глубины мира перед цветокоррекцией.
// Противник остаётся в сцене; кулак не пропадает внутри его тела или у стены.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FA_GRAB, FA_HEAVY, FA_HOLD, FA_HOOK, FA_JAB, FA_JAB2 } from '../../shared/fight.ts';
import type { Fighter } from '../../shared/fightsim.ts';
import { clamp } from '../../shared/math.ts';
import { handsFor } from './hands.ts';
import { narrowFov } from '../render/renderer.ts';

export class FightFists {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.02, 4);
  private readonly group = new THREE.Group();
  private readonly hands: THREE.Mesh[] = [];
  private readonly material: THREE.MeshStandardMaterial;
  private readonly pose = [0, 0, 0, 0, 0, 0];
  private color = -1;
  private pulse = 0;

  constructor() {
    this.scene.add(new THREE.HemisphereLight(0xffe6c3, 0x567168, 2.4));
    const key = new THREE.DirectionalLight(0xffd8aa, 3.4);
    key.position.set(-1.2, 2, 1.5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xc8e3d2, 2.1);
    rim.position.set(2, 0.6, -2);
    this.scene.add(rim);
    this.material = new THREE.MeshStandardMaterial({ color: 0xff4d6d, roughness: 0.27, metalness: 0.04, emissive: 0x301915, emissiveIntensity: 0.18 });
    for (const side of [-1, 1]) {
      const palm = new THREE.SphereGeometry(0.12, 24, 16).scale(1.13, 0.98, 0.94);
      const thumb = new THREE.SphereGeometry(0.05, 12, 10).scale(1, 1.12, 0.9).translate(side * -0.092, -0.045, 0.01);
      const wrist = new THREE.SphereGeometry(0.064, 14, 10).scale(0.86, 0.92, 1.3).translate(0, -0.042, 0.064);
      const geometry = mergeGeometries([palm, thumb, wrist], false)!;
      palm.dispose(); thumb.dispose(); wrist.dispose();
      const hand = new THREE.Mesh(geometry, this.material);
      hand.name = side < 0 ? 'fc-left-fist' : 'fc-right-fist';
      hand.frustumCulled = false;
      this.hands.push(hand);
      this.group.add(hand);
    }
    this.group.visible = false;
    this.scene.add(this.group);
  }

  setColor(hex: number): void {
    if (hex === this.color) return;
    this.color = hex;
    this.material.color.setHex(hex);
  }

  /** Короткое упругое сжатие после подтверждённого попадания. Время действий и камера продолжают идти. */
  impact(power: number): void {
    this.pulse = Math.max(this.pulse, clamp(power, 0, 1));
  }

  update(f: Fighter, actT: number, time: number, dt: number, aspect: number, enabled: boolean): void {
    this.group.visible = enabled && !f.ko;
    this.pulse *= Math.exp(-dt * 16);
    if (!this.group.visible) return;
    if (this.camera.aspect !== aspect) {
      this.camera.aspect = aspect;
      this.camera.fov = narrowFov(58, aspect);
      this.camera.updateProjectionMatrix();
    }
    handsFor(this.pose, f.act, actT, !!f.block, f.stun > 0, !!f.held, !!f.ko, time, true);
    // Узкий экран: сохраним размер и положение кулаков относительно ширины, не обрежем тяжёлый замах камерой.
    const fitY = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) / Math.tan(THREE.MathUtils.degToRad(58) / 2);
    const fit = Math.min(1, (fitY * aspect) / (16 / 9));
    const swing = f.act === FA_HOOK ? 0.35 : f.act === FA_HEAVY ? -0.2 : 0;
    const open = f.act === FA_GRAB || f.act === FA_HOLD ? 1 : 0;
    for (let i = 0; i < this.hands.length; i++) {
      const h = this.hands[i];
      const j = i * 3;
      h.position.set(this.pose[j] * fit, this.pose[j + 1] * fitY, this.pose[j + 2]);
      h.rotation.set(open * -0.16, i === 0 ? 0.1 : -0.1, (i === 0 ? -1 : 1) * (0.08 + open * 0.22) + (i === 1 ? swing : 0));
      const punching = i === 1 ? f.act === FA_JAB || f.act === FA_HOOK || f.act === FA_HEAVY : f.act === FA_JAB2;
      const stretch = punching ? Math.max(0, -this.pose[j + 2] - 0.65) * 0.22 : 0;
      h.scale.set(fit * (1 + this.pulse * 0.12 - stretch * 0.2), fit * (1 - this.pulse * 0.12), fit * (1 + stretch + this.pulse * 0.06));
    }
  }

  get visible(): boolean { return this.group.visible; }

  debugState(): Record<string, unknown> {
    return { visible: this.visible, fov: this.camera.fov, aspect: this.camera.aspect, pose: [...this.pose], impact: this.pulse };
  }

  dispose(): void {
    for (const h of this.hands) h.geometry.dispose();
    this.material.dispose();
  }
}
