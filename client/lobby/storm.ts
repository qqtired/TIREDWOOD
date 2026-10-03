import * as THREE from 'three';
import { STORM_GOAL, STORM_PERIOD, STORM_CALM, emptyStorm, stormWave, type StormView } from '../../shared/storm.ts';
import { WATER_Y } from '../../shared/constants.ts';
export interface StormVisualHooks {
  /** Root adapts existing World weather/lighting without an extra render pass. */
  climate(dark: number, rain: number, flash: number, lampsOn: boolean): void;
  lamp(enabled: boolean): void;
  sound(kind: 'siren' | 'thunder' | 'wave' | 'success'): void;
  light(): void;
  lampPosition?: { x: number; y: number; z: number };
  /** The integrated World already has a lighthouse beam; avoid drawing a second cone. */
  existingBeacon?: boolean;
}
/** Shared old/new-look overlay: one wave, foam, beacon cone and rainbow; no full-screen shader. */
export class Storm3D {
  readonly group = new THREE.Group();
  private readonly hooks: StormVisualHooks;
  private readonly crest: THREE.Mesh;
  private readonly foam: THREE.Mesh;
  private readonly beacon = new THREE.Group();
  private readonly rainbow: THREE.Mesh;
  private readonly panel: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly detail: HTMLDivElement;
  private readonly action: HTMLButtonElement;
  private state = emptyStorm();
  private lastPhase = 'idle';
  private lastId = '';
  private thunderAt = -1;
  private flashUntil = -1;
  private lightning = -1;
  private wave = -1;
  constructor(scene: THREE.Scene, root: HTMLElement, hooks: StormVisualHooks) {
    this.hooks = hooks; this.group.name = 'storm-event'; this.group.visible = false; scene.add(this.group);
    const sea = new THREE.MeshStandardMaterial({ color: 0x668d9a, roughness: .38, transparent: true, opacity: .75 });
    this.crest = new THREE.Mesh(new THREE.BoxGeometry(.65, .9, 16), sea); this.crest.position.set(-24, WATER_Y, 30);
    this.foam = new THREE.Mesh(new THREE.BoxGeometry(.8, .035, 16), new THREE.MeshBasicMaterial({ color: 0xe1f8ff, transparent: true, opacity: .8 }));
    this.foam.position.set(-24, .025, 30); this.group.add(this.crest, this.foam);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(.06, 4, 40, 16, 1, true).rotateZ(Math.PI / 2).translate(20, 0, 0),
      new THREE.MeshBasicMaterial({ color: 0xffedb9, transparent: true, opacity: .06, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    const lamp = hooks.lampPosition ?? { x: -19, y: 9.73, z: 43 };
    this.beacon.position.set(lamp.x, lamp.y, lamp.z); this.beacon.add(cone); this.group.add(this.beacon);
    const geo = new THREE.TorusGeometry(24, .7, 7, 56, Math.PI);
    const colors = new Float32Array(geo.getAttribute('position').count * 3), c = new THREE.Color();
    for (let i = 0; i < colors.length / 3; i++) { c.setHSL((i % 8) / 10, .8, .64); colors.set([c.r, c.g, c.b], i * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.rainbow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .36, depthWrite: false, side: THREE.DoubleSide }));
    this.rainbow.position.set(-4, 1, 64); this.group.add(this.rainbow);
    this.panel = document.createElement('div'); this.panel.className = 'lobby-storm-status';
    Object.assign(this.panel.style, { position: 'absolute', top: '76px', left: '50%', transform: 'translateX(-50%)', maxWidth: 'min(620px,calc(100vw - 32px))',
      padding: '12px 18px', borderRadius: '12px', background: 'rgba(13,28,44,.92)', color: '#eff8ff', textAlign: 'center', pointerEvents: 'none', fontSize: '14px', lineHeight: '1.5' });
    this.panel.setAttribute('role', 'status'); this.title = document.createElement('div'); this.title.style.fontWeight = '900';
    this.detail = document.createElement('div'); this.panel.append(this.title, this.detail); root.append(this.panel);
    this.action = document.createElement('button'); this.action.type = 'button'; this.action.textContent = 'E · Зажечь маяк';
    Object.assign(this.action.style, { position: 'absolute', left: '50%', bottom: '170px', transform: 'translateX(-50%)', padding: '14px 22px', minHeight: '48px',
      borderRadius: '12px', border: '2px solid #bfeeff', background: '#123e56', color: '#fff8d7', font: '700 16px Rubik, sans-serif', pointerEvents: 'auto' });
    this.action.addEventListener('click', () => this.hooks.light()); root.append(this.action); this.panel.hidden = this.action.hidden = true;
  }
  set(view: StormView): void { this.state = view; }
  update(tick: number, _dt: number, position: { x: number; y: number; z: number }, eligible: boolean, low = false): void {
    const v = this.state, active = v.phase !== 'idle'; this.group.visible = active;
    if (v.id !== this.lastId) { this.lastId = v.id; this.lightning = this.wave = -1; }
    if (v.phase !== this.lastPhase) {
      this.lastPhase = v.phase;
      if (v.phase === 'warn') this.hooks.sound('siren');
      if (v.phase === 'calm' && v.winners.length) this.hooks.sound('success');
    }
    const dark = v.phase === 'warn' ? Math.min(.85, .25 + (tick - v.start) / Math.max(1, v.end - v.start) * .6)
      : v.phase === 'storm' ? 1 : v.phase === 'calm' ? Math.max(0, 1 - (tick - v.start) / STORM_CALM) : 0;
    const lightning = Math.floor((tick - v.waveStart) / 420);
    if (v.phase === 'storm' && lightning > 0 && lightning !== this.lightning) {
      this.lightning = lightning; this.flashUntil = tick + 5; this.thunderAt = tick + 40;
    }
    if (this.thunderAt > 0 && tick >= this.thunderAt) { this.hooks.sound('thunder'); this.thunderAt = -1; }
    this.hooks.climate(dark, v.phase === 'storm' ? 1 : dark, v.phase === 'storm' && tick < this.flashUntil ? .7 : 0, v.phase !== 'storm');
    this.hooks.lamp(v.phase !== 'storm');
    this.beacon.visible = this.hooks.existingBeacon === false && v.phase === 'calm' && v.winners.length > 0;
    this.beacon.rotation.y = tick * .002;
    const wave = stormWave(tick, v), offset = ((tick - v.waveStart) % STORM_PERIOD + STORM_PERIOD) % STORM_PERIOD;
    this.foam.visible = wave.foam && !low; this.crest.visible = wave.impact;
    // Incoming foam is on the side the NEXT wave comes from.
    this.foam.position.x = (wave.index + 1) % 2 ? -22.5 : -15.5;
    const direction = wave.direction;
    this.crest.position.set(direction > 0 ? -22 + offset * .14 : -16 - offset * .14, -.05 + Math.sin(Math.min(1, offset / 36) * Math.PI) * .3, 30);
    if (wave.impact && wave.index !== this.wave) { this.wave = wave.index; this.hooks.sound('wave'); }
    this.rainbow.visible = v.phase === 'calm' && tick < v.rainbowEnd;
    this.panel.hidden = !active || !eligible;
    if (active) {
      const seconds = Math.max(0, Math.ceil((v.end - tick) / 60));
      this.title.textContent = v.phase === 'warn' ? `⛈ Шторм через ${seconds} с` : v.phase === 'storm' ? `⛈ Зажги маяк · ${seconds} с` : '🌈 Шторм стих';
      this.detail.textContent = v.phase === 'warn' ? 'К двери маяка по мосткам · E, чтобы включить свет' : v.phase === 'storm'
        ? wave.foam ? `Пена! Через ${Math.max(1, Math.ceil((STORM_PERIOD - offset) / 60))} с волна — прыгай или уйди с мостков` : 'Волна каждые 6 с · на площади безопасно'
        : v.rankEnd > tick ? `Первый: ${v.winners[0]?.nick ?? '—'} · ещё ${Math.ceil((v.rankEnd - tick) / 60)} с на финиш`
        : v.winners.length ? v.winners.map(w => `${w.place}. ${w.nick} +${w.tokens}`).join(' · ') : 'Никто не зажёг маяк — без наград';
    }
    this.action.hidden = !eligible || !(v.phase === 'storm' || v.phase === 'calm' && tick < v.rankEnd)
      || Math.hypot(position.x - STORM_GOAL.x, position.z - STORM_GOAL.z) > STORM_GOAL.r || Math.abs(position.y - STORM_GOAL.y) > .75;
  }
  dispose(): void { this.panel.remove(); this.action.remove(); this.group.removeFromParent(); this.group.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach(x => x.dispose()); } }); this.hooks.climate(0, 0, 0, true); this.hooks.lamp(true); }
}
