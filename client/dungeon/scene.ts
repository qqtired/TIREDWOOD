// «Подземелье» — ЗАГЛУШКА сцены (часть B, только чтобы вход работал до прихода настоящей сцены части C; C заменяет файл).
// Договор с оболочкой (client/app.ts грузит модуль лениво: import('./dungeon/scene.ts')):
//   export class DungeonScene implements Scene { constructor(d: SceneDeps); setQuality(q); resize(w, h); setPaused?(on) }
// Сообщения сервера dg_hello / dg_ack / dg_wave / dg_end приходят в onJson; свои — d.net.send({ t: 'dg_log' | 'dg_pause' | 'dg_again' }).
// setPaused(on) оболочка зовёт, когда открывается и закрывается меню (Esc, потеря мыши); обрыв связи — d.input.blocked.
import * as THREE from 'three';
import type { ServerMsg } from '../../shared/messages.ts';
import type { Scene, SceneDeps } from '../scene.ts';
import type { Quality } from '../settings.ts';
import type { TouchMode } from '../touch.ts';

export class DungeonScene implements Scene {
  readonly kind = 'dungeon' as const;
  readonly wantsPointer = true;
  readonly touchMode: TouchMode = 'none';
  private readonly d: SceneDeps;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
  private readonly hud: HTMLElement;
  private seed = 0;

  constructor(d: SceneDeps) {
    this.d = d;
    this.scene.background = new THREE.Color(0x1d1a24);
    this.hud = document.createElement('div');
    this.hud.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:#f3e9d2;font:600 28px Rubik,system-ui,sans-serif;text-align:center;pointer-events:none';
    this.hud.innerHTML = '<div>🕯️ Подземелье строится</div><div style="font-size:18px;opacity:.75">Esc → «На набережную»</div>';
  }

  setQuality(_q: Exclude<Quality, 'auto'>): void {}

  setPaused(_on: boolean): void {}

  enter(): void {
    this.d.hudRoot.appendChild(this.hud);
    this.hud.style.display = 'flex';
  }

  exit(): void {
    this.hud.style.display = 'none';
    this.hud.remove();
  }

  onJson(msg: ServerMsg): void {
    if (msg.t === 'dg_hello') this.seed = msg.seed;
  }

  onSnapshot(): void {}

  frame(): void {
    this.d.renderer.render(this.scene, this.camera);
  }

  onKey(): boolean {
    return false;
  }

  onUse(): void {}

  resize(w: number, h: number): void {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  debugState(): Record<string, unknown> | null {
    return { stub: true, seed: this.seed };
  }
}
