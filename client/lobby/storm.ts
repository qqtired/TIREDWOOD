import * as THREE from 'three';
import { STORM_DOOR, STORM_GOAL, STORM_MAX, STORM_PERIOD, STORM_WARN, emptyStorm, stormForce, stormReach, stormWave, type StormView } from '../../shared/storm.ts';
import { WATER_Y, TICK_RATE } from '../../shared/constants.ts';
import { seedOf, stormRumbles, stormStrikes, type Strike } from '../../shared/weather.ts';
import { TOUCH } from '../touch.ts';
export interface StormVisualHooks {
  /** Шторм — это погода на максимуме: force — сила (0…1), lampsOn — свет в городе (в шторм гаснет). */
  climate(force: number, lampsOn: boolean): void;
  /** Молния по расписанию шторма — та же, что в грозу (разряд, вспышка, гром). */
  strike(s: Strike): void;
  /** Радуга после шторма — общая с дождём (world/skyfx). */
  rainbow(on: boolean): void;
  lamp(enabled: boolean): void;
  sound(kind: 'siren' | 'wave' | 'success'): void;
  light(): void;
  /** Свой pid: кто уже отметился у маяка, тому кнопка не нужна */
  self?(): number;
  lampPosition?: { x: number; y: number; z: number };
  /** The integrated World already has a lighthouse beam; avoid drawing a second cone. */
  existingBeacon?: boolean;
}
/** Что можно у двери маяка: подождать (свет ещё не погас) или зажечь */
export type StormDoor = 'wait' | 'light' | null;
/** Молнию, которую проспали (вкладка спала), не догоняем, с */
const STALE = 1.5;

/** Подсветка двери: тёплый свет из щелей и мягкое свечение вокруг проёма (дверь 0,53 × 2,04 м в раме 0,73 × 2,24) */
function doorGlowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uK: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.72, 0.36) } },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uK;
      uniform vec3 uColor;
      varying vec2 vP;
      void main() {
        vec2 q = abs(vP) - vec2(0.3, 1.06);
        float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
        float rim = exp(-abs(d) * 9.0);
        float halo = exp(-max(d, 0.0) * 3.2) * 0.35;
        float inside = d < 0.0 ? 0.18 : 0.0;
        float a = (rim + halo + inside) * uK;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor * a, 1.0);
      }
    `,
  });
}

/** Shared old/new-look overlay: one wave, foam, beacon cone and the lighthouse door; weather and rainbow — world. */
export class Storm3D {
  readonly group = new THREE.Group();
  private readonly hooks: StormVisualHooks;
  private readonly crest: THREE.Mesh;
  private readonly foam: THREE.Mesh;
  private readonly beacon = new THREE.Group();
  /** Подсветка двери маяка и круг у неё — где зажигать */
  private readonly doorGlow: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly doorRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly panel: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly detail: HTMLDivElement;
  private readonly action: HTMLButtonElement;
  private state = emptyStorm();
  private lastPhase = 'idle';
  private lastId = '';
  private wave = -1;
  /** Молнии шторма и раскаты перед ним: расписание и следующая по счёту */
  private bolts: Strike[] = [];
  private boltNext = 0;
  private rumbles: Strike[] = [];
  private rumbleNext = 0;
  private time = 0;
  /** У двери маяка: ждать или зажигать — и подсказка для HUD */
  door: StormDoor = null;
  hint: { keys: string[]; text: string } | null = null;
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
    // дверь смотрит на север (−z), к мосткам; свечение чуть перед стеной
    this.doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.9), doorGlowMaterial());
    this.doorGlow.position.set(STORM_DOOR.x, STORM_DOOR.y, STORM_DOOR.z - .06); this.doorGlow.rotation.y = Math.PI;
    this.doorGlow.renderOrder = 6;
    this.doorRing = new THREE.Mesh(new THREE.RingGeometry(STORM_GOAL.r - .12, STORM_GOAL.r, 72).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.doorRing.position.set(STORM_GOAL.x, .03, STORM_GOAL.z); this.doorRing.renderOrder = 4;
    this.group.add(this.doorGlow, this.doorRing);
    this.panel = document.createElement('div'); this.panel.className = 'lobby-storm-status';
    Object.assign(this.panel.style, { position: 'absolute', top: '76px', left: '50%', transform: 'translateX(-50%)', maxWidth: 'min(620px,calc(100vw - 32px))',
      padding: '12px 18px', borderRadius: '12px', background: 'rgba(13,28,44,.92)', color: '#eff8ff', textAlign: 'center', pointerEvents: 'none', fontSize: '14px', lineHeight: '1.5' });
    this.panel.setAttribute('role', 'status'); this.title = document.createElement('div'); this.title.style.fontWeight = '900';
    this.detail = document.createElement('div'); this.panel.append(this.title, this.detail); root.append(this.panel);
    // кнопка — для телефона (на компьютере мышь захвачена: там E или клик, подсказка внизу)
    this.action = document.createElement('button'); this.action.type = 'button'; this.action.textContent = 'E · Зажечь маяк';
    Object.assign(this.action.style, { position: 'absolute', left: '50%', bottom: '170px', transform: 'translateX(-50%)', padding: '14px 22px', minHeight: '48px',
      borderRadius: '12px', border: '2px solid #bfeeff', background: '#123e56', color: '#fff8d7', font: '700 16px Rubik, sans-serif', pointerEvents: 'auto' });
    this.action.addEventListener('click', () => this.hooks.light()); root.append(this.action); this.panel.hidden = this.action.hidden = true;
  }
  set(view: StormView): void { this.state = view; }
  /** Можно зажечь прямо сейчас (E, клик, кнопка) */
  get canLight(): boolean { return this.door === 'light'; }
  update(tick: number, dt: number, position: { x: number; y: number; z: number }, eligible: boolean, low = false): void {
    const v = this.state, active = v.phase !== 'idle'; this.group.visible = active;
    this.time += dt;
    if (v.id !== this.lastId) {
      this.lastId = v.id; this.wave = -1;
      const seed = seedOf(v.id);
      this.bolts = stormStrikes(seed, STORM_MAX / TICK_RATE); this.rumbles = stormRumbles(seed, STORM_WARN / TICK_RATE);
      this.boltNext = this.rumbleNext = 0;
    }
    if (v.phase !== this.lastPhase) {
      this.lastPhase = v.phase;
      if (v.phase === 'warn') this.hooks.sound('siren');
      if (v.phase === 'calm' && v.winners.length) this.hooks.sound('success');
    }
    // погода: шторм — та же гроза на максимуме; в шторм в городе гаснет свет
    const force = stormForce(v, tick);
    this.hooks.climate(force, v.phase !== 'storm');
    this.hooks.lamp(v.phase !== 'storm');
    // раскаты, пока шторм подходит, и молнии в сам шторм — по общему расписанию
    if (v.phase === 'warn') this.rumbleNext = this.fire(this.rumbles, this.rumbleNext, (tick - v.start) / TICK_RATE);
    if (v.phase === 'storm') this.boltNext = this.fire(this.bolts, this.boltNext, (tick - v.waveStart) / TICK_RATE);
    // радуга — когда шторм почти стих; гаснет к концу (за 6 с)
    this.hooks.rainbow(v.phase === 'calm' && force < .55 && tick < v.rainbowEnd - 6 * TICK_RATE);
    this.beacon.visible = this.hooks.existingBeacon === false && v.phase === 'calm' && v.winners.length > 0;
    this.beacon.rotation.y = tick * .002;
    const wave = stormWave(tick, v), offset = ((tick - v.waveStart) % STORM_PERIOD + STORM_PERIOD) % STORM_PERIOD;
    this.foam.visible = wave.foam && !low; this.crest.visible = wave.impact;
    // Incoming foam is on the side the NEXT wave comes from.
    this.foam.position.x = (wave.index + 1) % 2 ? -22.5 : -15.5;
    const direction = wave.direction;
    this.crest.position.set(direction > 0 ? -22 + offset * .14 : -16 - offset * .14, -.05 + Math.sin(Math.min(1, offset / 36) * Math.PI) * .3, 30);
    if (wave.impact && wave.index !== this.wave) { this.wave = wave.index; this.hooks.sound('wave'); }
    // у двери: в предупреждение — ждать (свет ещё горит), в шторм — зажечь, сразу после — отметиться (кто ещё не)
    const self = this.hooks.self?.() ?? -1;
    const ranking = v.phase === 'calm' && tick < v.rankEnd && v.winners.length > 0 && !v.winners.some(w => w.pid === self);
    const reach = eligible && stormReach(position.x, position.y, position.z);
    this.door = !reach ? null : v.phase === 'warn' ? 'wait' : v.phase === 'storm' || ranking ? 'light' : null;
    const keys = TOUCH ? ['E'] : ['E', '/', 'ЛКМ'];
    this.hint = this.door === 'wait' ? { keys: [], text: `Маяк ещё горит · свет погаснет через ${Math.max(1, Math.ceil((v.end - tick) / TICK_RATE))} с — тогда ${TOUCH ? 'жми кнопку' : 'жми E или кликни'}` }
      : this.door === 'light' ? { keys, text: v.phase === 'storm' ? 'зажечь маяк' : 'отметиться у маяка · награда' } : null;
    // подсветка двери: видна с мостков, пока есть что делать; ярче, когда стоишь у двери
    const goal = v.phase === 'warn' || v.phase === 'storm' || ranking;
    const pulse = .5 + .5 * Math.sin(this.time * (v.phase === 'storm' ? 5 : 2.6));
    const k = !eligible || !goal ? 0 : (this.door === 'light' ? 1 : this.door === 'wait' ? .55 : v.phase === 'warn' ? .35 : .7) * (.55 + .45 * pulse);
    this.doorGlow.visible = this.doorRing.visible = k > 0;
    this.doorGlow.material.uniforms.uK.value = k;
    this.doorRing.material.opacity = k * .5;
    this.panel.hidden = !active || !eligible;
    if (active) {
      const seconds = Math.max(0, Math.ceil((v.end - tick) / 60));
      this.title.textContent = v.phase === 'warn' ? `⛈ Шторм через ${seconds} с` : v.phase === 'storm' ? `⛈ Зажги маяк · ${seconds} с` : '🌈 Шторм стих';
      this.detail.textContent = v.phase === 'warn' ? 'Иди к двери маяка по мосткам: когда погаснет свет — E или клик у двери' : v.phase === 'storm'
        ? wave.foam ? `Пена! Через ${Math.max(1, Math.ceil((STORM_PERIOD - offset) / 60))} с волна — прыгай или уйди с мостков` : 'Волна каждые 6 с · на площади безопасно'
        : v.rankEnd > tick ? `Первый: ${v.winners[0]?.nick ?? '—'} · ещё ${Math.ceil((v.rankEnd - tick) / 60)} с на финиш`
        : v.winners.length ? v.winners.map(w => `${w.place}. ${w.nick} +${w.tokens}`).join(' · ') : 'Никто не зажёг маяк — без наград';
    }
    this.action.hidden = !TOUCH || this.door !== 'light';
    if (!this.action.hidden) this.action.textContent = v.phase === 'storm' ? '🔦 Зажечь маяк' : '⚓ Отметиться у маяка';
  }
  /** Молнии из расписания, чьё время пришло (t — секунды от начала фазы); проспанные не догоняем. */
  private fire(list: Strike[], next: number, t: number): number {
    while (next < list.length && list[next].t <= t) {
      const s = list[next++];
      if (t - s.t < STALE) this.hooks.strike(s);
    }
    return next;
  }
  dispose(): void { this.panel.remove(); this.action.remove(); this.group.removeFromParent(); this.group.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach(x => x.dispose()); } }); this.hooks.climate(0, true); this.hooks.rainbow(false); this.hooks.lamp(true); }
}
