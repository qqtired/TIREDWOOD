// Примерочная (?dress): ряд желеек во всех вещах прямо на набережной, у точки появления, лицом к закату, —
// проверить наряды глазами при настоящем свете. Мышь — вращать камеру, колесо — ближе/дальше,
// ← → — подойти к желейке, цифры — действия.
import * as THREE from 'three';
import { ACT_DANCE, ACT_LAUGH, ACT_NONE, ACT_SIT, ACT_SLOT, ACT_TIRED, ACT_WAVE } from '../../shared/lobby.ts';
import type { Outfit } from '../../shared/outfit.ts';
import { E_ALIVE, E_GROUNDED } from '../../shared/protocol.ts';
import { Avatar, tickAvatarShared } from '../render/avatar.ts';
import { Renderer } from '../render/renderer.ts';
import { LobbyWorld } from './world.ts';

/** Каждая вещь каталога встречается хотя бы раз. */
const LOOKS: Array<[string, Outfit]> = [
  ['Кепка', { c: 9, c2: 15, p: 'none', e: 'normal', h: 'cap', a: 'scarf' }],
  ['Панама', { c: 8, c2: 15, p: 'stripes', e: 'glasses', h: 'panama', a: 'mustache' }],
  ['Ушанка', { c: 5, c2: 14, p: 'camo', e: 'angry', h: 'ushanka', a: 'epaulets' }],
  ['Рыбак', { c: 4, c2: 13, p: 'spots', e: 'sleepy', h: 'fisher', a: 'lifebuoy' }],
  ['Бандана', { c: 0, c2: 15, p: 'dots', e: 'patch', h: 'bandana', a: 'chain' }],
  ['Каска', { c: 3, c2: 10, p: 'sunset', e: 'shades', h: 'helmet', a: 'headphones' }],
  ['Бескозырка', { c: 15, c2: 9, p: 'stripes', e: 'happy', h: 'sailor', a: 'bowtie' }],
  ['Цилиндр', { c: 10, c2: 15, p: 'sugar', e: 'monocle', h: 'tophat', a: 'bowtie' }],
  ['Корона', { c: 4, c2: 15, p: 'gold', e: 'normal', h: 'crown', a: 'chain' }],
  ['Колпак', { c: 6, c2: 15, p: 'none', e: 'happy', h: 'fool', a: 'none' }],
  ['Без шапки', { c: 12, c2: 15, p: 'none', e: 'normal', h: 'none', a: 'none' }],
  ['Наушники', { c: 7, c2: 4, p: 'dots', e: 'glasses', h: 'none', a: 'headphones' }],
];

const ACTION_KEYS: Record<string, number> = {
  Digit0: ACT_NONE, Digit1: ACT_WAVE, Digit2: ACT_DANCE, Digit3: ACT_TIRED, Digit4: ACT_LAUGH, Digit5: ACT_SIT, Digit6: ACT_SLOT,
};
const PHRASES = ['Привет!', 'Кто в дурака?', 'Ставлю жетон на вишенку, а там посмотрим, как повезёт сегодня вечером', 'ха', 'Пошли кататься'];
const SPACING = 1.6;

const HELP = `<b>Примерочная</b><br>мышь — крутить · колесо — ближе<br>← → — к желейке · Esc — весь ряд<br>
0 стоит · 1 машет · 2 танец · 3 устал · 4 смех · 5 сидит · 6 автомат<br>L рычаг · B облачко · T команда · M свой/чужой · W ходьба · H попадание`;

/** Ряд стоит вдоль Z у точки появления и смотрит на запад (yaw = π/2), на низкое солнце */
const FACE_YAW = Math.PI / 2;

export class DressStudio {
  readonly world: LobbyWorld;
  readonly avatars: Avatar[] = [];
  private readonly renderer: Renderer;
  private readonly stools: THREE.Mesh[] = [];
  private time = 0;
  private team: 0 | 1 | null = null;
  /** В команде: свой (спокойный контур, значок над головой) или противник */
  private mate = false;
  private walk = false;
  /** Камера: угол вокруг цели (−π/2 — с запада, в лицо ряду), наклон, расстояние */
  az = -Math.PI / 2;
  el = 0.16;
  dist = 15.5;
  readonly target = new THREE.Vector3();
  private readonly targetTo = new THREE.Vector3();
  private distTo = 15.5;
  private focus = -1;
  private drag: { x: number; y: number } | null = null;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.world = new LobbyWorld(renderer, 'high');
    this.world.camera.fov = 40;
    this.world.camera.updateProjectionMatrix();
    const scene = this.world.scene;
    this.focusOn(-1);
    this.target.copy(this.targetTo);

    const stoolGeo = new THREE.CylinderGeometry(0.42, 0.46, 0.3, 20).translate(0, 0.15, 0);
    const stoolMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3b, roughness: 0.7 });
    LOOKS.forEach(([name, outfit], i) => {
      const av = new Avatar(i + 1, { gun: false, voice: false });
      av.setOutfit(outfit);
      av.setInfo(name, null, false);
      av.addTo(scene);
      this.avatars.push(av);
      const stool = new THREE.Mesh(stoolGeo, stoolMat);
      stool.position.copy(this.home(i));
      stool.visible = false;
      scene.add(stool);
      this.stools.push(stool);
    });

    this.bindInput();
  }

  /** Место i-й желейки: камера смотрит с запада, поэтому первая — с −Z (слева на экране) */
  private home(i: number): THREE.Vector3 {
    const { spawn } = this.world.map;
    return new THREE.Vector3(spawn.x, 0, spawn.z + (i - (LOOKS.length - 1) / 2) * SPACING);
  }

  setAction(action: number): void {
    for (const av of this.avatars) av.setAction(action, 0);
    for (const s of this.stools) s.visible = action === ACT_SIT;
  }

  /** i < 0 — весь ряд */
  focusOn(i: number): void {
    this.focus = Math.max(-1, Math.min(LOOKS.length - 1, i));
    if (this.focus < 0) {
      this.targetTo.copy(this.home(0)).lerp(this.home(LOOKS.length - 1), 0.5).setY(0.9);
      this.distTo = 15.5;
    } else {
      this.targetTo.copy(this.home(this.focus)).setY(1.0);
      this.distTo = 3.4;
    }
  }

  private bindInput(): void {
    const cv = this.renderer.canvas;
    cv.addEventListener('pointerdown', (e) => {
      this.drag = { x: e.clientX, y: e.clientY };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.az -= (e.clientX - this.drag.x) * 0.006;
      this.el = THREE.MathUtils.clamp(this.el + (e.clientY - this.drag.y) * 0.004, -0.15, 1.3);
      this.drag = { x: e.clientX, y: e.clientY };
    });
    cv.addEventListener('pointerup', () => (this.drag = null));
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.distTo = THREE.MathUtils.clamp(this.distTo * Math.exp(e.deltaY * 0.0012), 1.6, 40);
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      const act = ACTION_KEYS[e.code];
      if (act !== undefined) this.setAction(act);
      else if (e.code === 'ArrowRight') this.focusOn(this.focus + 1);
      else if (e.code === 'ArrowLeft') this.focusOn(this.focus < 0 ? LOOKS.length - 1 : this.focus - 1);
      else if (e.code === 'Escape') this.focusOn(-1);
      else if (e.code === 'KeyL') for (const av of this.avatars) av.pullLever();
      else if (e.code === 'KeyB') this.avatars.forEach((av, i) => av.say(PHRASES[i % PHRASES.length]));
      else if (e.code === 'KeyW') this.walk = !this.walk;
      else if (e.code === 'KeyT') {
        this.team = this.team === null ? 0 : this.team === 0 ? 1 : null;
        for (const av of this.avatars) av.setTeam(this.team);
      } else if (e.code === 'KeyM') {
        this.mate = !this.mate;
        this.avatars.forEach((av, i) => av.setInfo(LOOKS[i][0], this.team, this.mate));
      } else if (e.code === 'KeyH') {
        for (const av of this.avatars) {
          const a = Math.random() * Math.PI * 2;
          const p = av.root.position;
          av.onHit(p.x + Math.sin(a) * 0.5, p.y + 0.4 + Math.random() * 0.9, p.z - Math.cos(a) * 0.5, false);
        }
      }
    });
  }

  resize(w: number, h: number): void {
    this.world.resize(w, h);
  }

  frame(dt: number): void {
    this.time += dt;
    const t = this.time;
    const cam = this.world.camera;
    this.avatars.forEach((av, i) => {
      // ходьба: туда-обратно поперёк ряда, чтобы видеть, как вещи качаются вместе с телом
      const ph = t * 1.1 + i * 0.7;
      const h = this.home(i);
      const x = h.x + (this.walk ? Math.sin(ph) * 2.2 : 0);
      const yaw = this.walk ? (Math.cos(ph) > 0 ? -FACE_YAW : FACE_YAW) : FACE_YAW;
      av.update({ x, y: 0, z: h.z, yaw, pitch: 0, flags: E_ALIVE | E_GROUNDED }, dt, t, this.world.collision, cam.position, false);
    });
    tickAvatarShared(t, this.renderer.canvas.clientHeight);
    this.world.update(dt);

    const k = 1 - Math.exp(-dt * 6);
    this.target.lerp(this.targetTo, k);
    this.dist += (this.distTo - this.dist) * k;
    const ce = Math.cos(this.el);
    cam.position.set(
      this.target.x + Math.sin(this.az) * ce * this.dist,
      this.target.y + Math.sin(this.el) * this.dist,
      this.target.z - Math.cos(this.az) * ce * this.dist,
    );
    cam.lookAt(this.target);
    this.world.render();
  }
}

/** Запуск вместо игры: свой рендерер на холсте и свой цикл кадров. */
export function startDressStudio(canvas: HTMLCanvasElement, overlay: HTMLElement): DressStudio {
  const renderer = new Renderer(canvas);
  const studio = new DressStudio(renderer);
  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.resize(w, h, Math.min(2, window.devicePixelRatio || 1));
    studio.resize(w, h);
  };
  window.addEventListener('resize', resize);
  resize();
  const help = document.createElement('div');
  help.innerHTML = HELP;
  help.style.cssText = 'position:fixed;left:12px;bottom:12px;padding:10px 14px;border-radius:12px;background:rgba(20,16,24,.72);color:#fff6e8;font:500 13px/1.5 Rubik,system-ui,sans-serif;pointer-events:none';
  overlay.append(help);
  let last = 0;
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    studio.frame(dt);
  };
  requestAnimationFrame(loop);
  if (import.meta.env.DEV || location.search.includes('debug')) (window as unknown as Record<string, unknown>).__dress = studio;
  return studio;
}
