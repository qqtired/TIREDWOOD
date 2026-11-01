// Карточка «Смола из гранат» (Т-8): граната оставляет лужу смолы котла — −55 % скорости, радиус 3 м, 4 с. Лужа рисуется так же,
// как у «Смоляного котла» (arsenal3d.ts: та же текстура и материал), только из своего пула: событие ['gtar', id, x, z,
// радиус, тик конца] — вырастает за 0,4 с и тает за последние 0,8 с. Замедление мобов считает сервер.
import * as THREE from 'three';
import { TICK_RATE } from '../../../shared/constants.ts';
import { tarTexture } from '../arsenal3d.ts';
import type { IdeasDeps } from './deps.ts';

const SLOTS = 6;
/** Лужа чуть выше луж котла (0,035): две вплотную не мерцают */
const Y = 0.05;
const GROW_S = 0.4;
const FADE_S = 0.8;

interface Puddle {
  mesh: THREE.Mesh;
  id: number;
  until: number;
  born: number;
}

export class TarPart {
  private readonly d: IdeasDeps;
  private readonly puddles: Puddle[] = [];
  private readonly tex: THREE.CanvasTexture;
  private readonly geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private time = 0;

  constructor(d: IdeasDeps) {
    this.d = d;
    this.tex = tarTexture();
    for (let i = 0; i < SLOTS; i++) {
      const mat = new THREE.MeshStandardMaterial({ map: this.tex, transparent: true, depthWrite: false, roughness: 0.12, metalness: 0.15, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.renderOrder = 2;
      mesh.visible = false;
      d.scene.add(mesh);
      this.puddles.push({ mesh, id: -1, until: 0, born: 0 });
    }
  }

  /** ['gtar', id, x, z, radius, untilTick]. true — наше */
  onEvent(e: readonly unknown[]): boolean {
    if (e[0] !== 'gtar') return false;
    const [, id, x, z, radius, until] = e as [string, number, number, number, number, number];
    if (!(until > this.d.tick())) return true;
    let p = this.puddles.find((q) => q.id === id) ?? this.puddles.find((q) => !q.mesh.visible);
    if (!p) p = this.puddles.reduce((a, b) => (a.until < b.until ? a : b));
    const fresh = p.id !== id || !p.mesh.visible;
    p.id = id;
    p.until = until;
    if (fresh) {
      // лужа уже лежит (вошли посреди боя) — сразу полная; иначе вырастает
      p.born = until - this.d.tick() < 3.5 * TICK_RATE ? this.time - GROW_S : this.time;
      p.mesh.position.set(x, Y, z);
      p.mesh.rotation.y = Math.random() * Math.PI * 2;
      p.mesh.scale.set(radius * 2.1, 1, radius * 2.1);
      p.mesh.visible = true;
    }
    return true;
  }

  frame(dt: number): void {
    this.time += dt;
    const tick = this.d.tick();
    for (const p of this.puddles) {
      if (!p.mesh.visible) continue;
      const left = (p.until - tick) / TICK_RATE;
      if (left <= 0) {
        p.mesh.visible = false;
        p.id = -1;
        continue;
      }
      const grow = Math.min(1, (this.time - p.born) / GROW_S);
      const k = Math.min(grow, left / FADE_S, 1);
      (p.mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, k);
    }
  }

  dispose(): void {
    for (const p of this.puddles) {
      p.mesh.removeFromParent();
      (p.mesh.material as THREE.Material).dispose();
    }
    this.geo.dispose();
    this.tex.dispose();
  }
}
