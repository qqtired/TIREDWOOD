// Стенд «Банан за катером» (lab/banana/): настоящая модель банана, «Волжанка», желейки игры, небо и море игры.
// Два режима: «Заезд» — лодка сама виляет вокруг пирса, банан на тросе считает тот же шаг, что сервер (shared/banana.ts),
// переднее место — твоё (A/D держаться, E — обратно из воды), двое других — боты с реакцией ~0,45 с; «Позы» — банан
// у пирса: покачивание, крен и подпрыгивание по ползункам, седок держится / висит на краю / падает / плывёт / возвращается.
// Камеры: «как в игре» (за спиной переднего седока), «с пирса», «мышью» (вращение вокруг банана). Код игры, не копия.
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/600.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/800.css';
import '../ui/kit/tokens.css';
import '../ui/kit/kit.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  ACT_BANANA, BN_BACK_TICKS, BN_SEATS, bnArg, bnHitch, bnRiderStep, bnSpeed, bnStep, bnSwimAt, bnWave, makeBnPose, makeBnRider,
  type BnRider,
} from '../../shared/banana.ts';
import { TICK_RATE, WATER_Y } from '../../shared/constants.ts';
import { BOATS } from '../../shared/fishboat.ts';
import { DEFAULT_OUTFIT, PALETTE } from '../../shared/outfit.ts';
import { E_ALIVE, E_GROUNDED } from '../../shared/protocol.ts';
import { Diorama } from '../lab/kit3d.ts';
import { Avatar, type AvatarPose } from '../render/avatar.ts';
import { Renderer } from '../render/renderer.ts';
import { HudSlots } from '../ui/kit/slots.ts';
import { BananaHud } from './banana.ts';
import { BananaFleet, bananaLook, makeLook, type BananaDraw } from './bananamodel.ts';
import { RiderAnim, riderPose } from './bananapose.ts';
import { BoatFleet, type FleetPose } from './models.ts';

const DT = 1 / TICK_RATE;
const KIND = 0;
const GROUND = { groundBelow: (): number => WATER_Y };
const NAMES = ['Ты', 'Tester7', 'Tester8'];
const COLORS = [PALETTE.indexOf(0xff8a1c), PALETTE.indexOf(0x9bd13b), PALETTE.indexOf(0xff9ec7)];

type Mode = 'ride' | 'poses';
type Cam = 'game' | 'pier' | 'orbit';

interface Seat {
  av: Avatar;
  anim: RiderAnim;
  rider: BnRider;
  /** В воде: сколько тиков осталось, где */
  swim: number;
  at: { x: number; z: number };
  held: number;
  best: number;
  falls: number;
  /** Бот: что видел 0,45 с назад */
  hist: number[];
  pose: AvatarPose;
}

export class BananaLab {
  private readonly renderer: Renderer;
  private readonly dio = new Diorama({ radius: 2.6, rail: false, cam: [10, 4, 12], look: [0, 0, -6], fov: 50 });
  private readonly boats: BoatFleet;
  private readonly bananas: BananaFleet;
  private readonly controls: OrbitControls;
  private readonly hud: BananaHud;
  private readonly seats: Seat[] = [];
  private readonly boat = { x: 0, z: -34, yaw: -Math.PI / 2, v: 0, steer: 0 };
  private readonly bn = makeBnPose();
  private readonly draw: BananaDraw = { x: 0, y: WATER_Y, z: 0, yaw: 0, look: makeLook(), stern: new THREE.Vector3(), rope: 9 };
  private readonly boatPose: FleetPose = { kind: KIND, x: 0, y: WATER_Y, z: 0, yaw: 0, pitch: 0, roll: 0, anchor: 0 };
  private mode: Mode = 'ride';
  private cam: Cam = 'game';
  private tick = 0;
  private time = 0;
  private acc = 0;
  private last = 0;
  private keys = new Set<string>();
  private kickT = 9;
  private kickSide = 0;
  private press = 0;
  /** Позы: ползунки */
  speed = 0;
  lat = 0;
  tilt = 0;
  onStats: ((s: string) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, hudHost: HTMLElement) {
    this.renderer = new Renderer(canvas);
    this.boats = new BoatFleet(this.dio.scene);
    this.boats.load();
    this.bananas = new BananaFleet(this.dio.scene);
    this.bananas.load();
    const slots = new HudSlots(hudHost);
    this.hud = new BananaHud(slots);
    for (let k = 0; k < BN_SEATS; k++) {
      const av = new Avatar(9200 + k, { voice: false });
      av.setOutfit({ ...DEFAULT_OUTFIT, c: COLORS[k], h: 'none' });
      av.setInfo(NAMES[k], null, false, 1);
      av.setAction(ACT_BANANA, bnArg(0, k));
      av.addTo(this.dio.scene);
      this.seats.push({ av, anim: new RiderAnim(), rider: makeBnRider(), swim: 0, at: { x: 0, z: 0 }, held: 0, best: 0, falls: 0, hist: [], pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: E_ALIVE | E_GROUNDED } });
    }
    this.controls = new OrbitControls(this.dio.camera, canvas);
    this.controls.enablePan = false;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 40;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.enabled = false;
    addEventListener('keydown', (e) => this.key(e, true));
    addEventListener('keyup', (e) => this.key(e, false));
    new ResizeObserver(() => this.resize(canvas)).observe(canvas);
    this.resize(canvas);
    this.setMode('ride');
    requestAnimationFrame((t) => this.loop(t));
  }

  private resize(canvas: HTMLCanvasElement): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    this.renderer.resize(Math.max(1, w), Math.max(1, h), Math.min(2, devicePixelRatio || 1));
    this.dio.camera.aspect = w / Math.max(1, h);
    this.dio.camera.updateProjectionMatrix();
  }

  private key(e: KeyboardEvent, down: boolean): void {
    if (e.code === 'KeyA' || e.code === 'KeyD' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      if (down) this.keys.add(e.code);
      else this.keys.delete(e.code);
      e.preventDefault();
    }
    if (down && e.code === 'KeyE' && !e.repeat) this.back(0);
  }

  setMode(m: Mode): void {
    this.mode = m;
    this.tick = 0;
    for (const s of this.seats) this.resetSeat(s);
    if (m === 'ride') {
      Object.assign(this.boat, { x: 0, z: -34, yaw: -Math.PI / 2, v: 0, steer: 0 });
      bnHitch(this.bn, { ...this.boat, length: BOATS[KIND].length });
      this.setCam('game');
    } else {
      Object.assign(this.boat, { x: 4.2, z: -11.5, yaw: 0, v: 0, steer: 0 });
      bnHitch(this.bn, { ...this.boat, length: BOATS[KIND].length });
      this.setCam('orbit');
    }
  }

  setCam(c: Cam): void {
    this.cam = c;
    this.controls.enabled = c === 'orbit';
    if (c === 'orbit') {
      this.controls.target.set(this.bn.x, WATER_Y + 0.8, this.bn.z);
      this.dio.camera.position.set(this.bn.x + 5.5, WATER_Y + 2.6, this.bn.z + 4.5);
      this.controls.update();
    }
  }

  private resetSeat(s: Seat): void {
    s.anim.phase = 'seat';
    s.rider = makeBnRider();
    s.swim = 0;
    s.held = 0;
    s.hist.length = 0;
  }

  /** E: из воды — обратно на место */
  back(k: number): void {
    const s = this.seats[k];
    if (!s || s.swim <= 0) return;
    s.anim.back(s.at.x, s.at.z);
    this.dio.spray.burst(s.at.x, WATER_Y, s.at.z, 10, 0xffffff, 2, 0.8, 0.05);
    s.swim = 0;
    s.rider = makeBnRider();
    s.held = 0;
    this.press = 1;
  }

  /** Позы: седок k падает в сторону side */
  fall(k: number, side: number): void {
    const s = this.seats[k];
    if (!s || s.swim > 0 || s.anim.phase !== 'seat') return;
    const seatW = this.bananas.seatAt(this.draw, k, new THREE.Vector3());
    bnSwimAt(this.bn, k, side, s.at);
    s.anim.fall(seatW, s.at.x, s.at.z, side);
    s.swim = BN_BACK_TICKS;
    s.best = Math.max(s.best, s.held);
    s.held = 0;
    s.falls++;
    this.kickT = 0;
    this.kickSide = side >= 0 ? 0.9 : -0.9;
  }

  private stepRide(): void {
    const b = this.boat;
    const kind = BOATS[KIND];
    const t = this.tick / TICK_RATE;
    // водитель-бот: круг вокруг пирса (радиус ~32 м) и каждые 6 с — резкая «змейка» 1,4 с влево, 1,4 с вправо
    const ang = Math.atan2(b.x, b.z);
    const tx = Math.sin(ang - 0.5) * 32;
    const tz = Math.cos(ang - 0.5) * 32;
    const want = Math.atan2(-(tx - b.x), -(tz - b.z));
    let d = want - b.yaw;
    d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
    let steer = Math.max(-1, Math.min(1, d * 2));
    const ph = t % 6;
    if (t > 4 && ph < 1.4) steer = 1;
    else if (t > 4 && ph < 2.8) steer = -1;
    b.v = Math.min(kind.speed, b.v + (kind.speed / kind.accel) * DT);
    b.steer += (steer - b.steer) * 0.08;
    const rate = 0.3 + (kind.turn - 0.3) * Math.min(1, b.v / kind.speed);
    b.yaw += b.steer * rate * DT;
    b.x += -Math.sin(b.yaw) * b.v * DT;
    b.z += -Math.cos(b.yaw) * b.v * DT;
    bnStep(this.bn, { ...b, length: kind.length }, DT, false);
    const sp = bnSpeed(this.bn);
    for (let k = 0; k < BN_SEATS; k++) {
      const s = this.seats[k];
      if (s.swim > 0) {
        s.swim--;
        // боты сами возвращаются через 1,5–3 с; ты — по E (не успел за 5 с — тоже возвращаем, это стенд)
        if ((k > 0 && s.swim < BN_BACK_TICKS - (1.5 + k * 0.7) * TICK_RATE) || s.swim === 0) this.back(k);
        continue;
      }
      if (s.anim.phase !== 'seat') continue;
      let lean = 0;
      if (k === 0) lean = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
      else {
        s.hist.push(s.rider.tilt);
        if (s.hist.length > 40) s.hist.shift();
        const seen = s.hist[Math.max(0, s.hist.length - 1 - (k === 1 ? 27 : 36))];
        lean = seen > 0.15 ? -1 : seen < -0.15 ? 1 : 0;
      }
      const fell = bnRiderStep(s.rider, this.bn.lat, lean, bnWave(this.tick, 0, k, sp), k, sp);
      if (sp >= 2) s.held++;
      if (fell) this.fall(k, Math.sign(s.rider.tilt) || 1);
    }
  }

  private stepPoses(): void {
    // банан стоит у пирса на тросе; скорость и толчок — с ползунков (только вид), крен седоков — ползунок
    this.bn.lat = this.lat;
    for (let k = 0; k < BN_SEATS; k++) {
      const s = this.seats[k];
      if (s.swim > 0) s.swim = Math.max(1, s.swim - 1);
      s.rider.tilt = k === 1 ? this.tilt : this.tilt * 0.4;
    }
  }

  private loop(now: number): void {
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    this.time += dt;
    this.acc += dt;
    while (this.acc >= DT) {
      this.acc -= DT;
      this.tick++;
      if (this.mode === 'ride') this.stepRide();
      else this.stepPoses();
    }
    for (const s of this.seats) {
      const was = s.anim.phase;
      s.anim.step(dt);
      if (was === 'fall' && s.anim.phase === 'swim') {
        this.dio.spray.burst(s.at.x, WATER_Y + 0.1, s.at.z, 34, 0xffffff, 3.6, 0.9, 0.075);
        this.dio.ripples.spawn(s.at.x, s.at.z, 1.6, 1.8);
      }
    }
    // банан и лодка на экране
    const d = this.draw;
    d.x = this.bn.x;
    d.z = this.bn.z;
    d.yaw = this.bn.yaw;
    this.kickT += dt;
    this.press = Math.max(0, this.press - dt * 3);
    const speed = this.mode === 'ride' ? bnSpeed(this.bn) : this.speed;
    bananaLook(this.time, speed, this.bn.lat, 0.7, this.kickSide * Math.exp(-this.kickT * 3.2) * Math.cos(this.kickT * 9), this.press, d.look);
    const kind = BOATS[KIND];
    const bp = this.boatPose;
    const run = Math.min(1, this.boat.v / kind.speed);
    Object.assign(bp, { x: this.boat.x, z: this.boat.z, yaw: this.boat.yaw, y: WATER_Y + Math.sin(this.time * 1.25) * 0.035, pitch: run * 0.075, roll: this.boat.steer * run * 0.13 });
    d.stern!.set(bp.x + Math.sin(bp.yaw) * kind.length / 2, WATER_Y + 0.42, bp.z + Math.cos(bp.yaw) * kind.length / 2);
    this.boats.draw([bp], this.dio.camera.position);
    this.bananas.draw([d]);
    // седоки
    const seatW = new THREE.Vector3();
    for (let k = 0; k < BN_SEATS; k++) {
      const s = this.seats[k];
      this.bananas.seatAt(d, k, seatW);
      if (this.mode === 'poses' && k === 2 && s.anim.phase === 'seat' && s.swim === 0 && this.tick > 2) {
        // третий на стенде поз — в воде (как плавает)
        bnSwimAt(this.bn, 2, 1, s.at);
        s.anim.phase = 'swim';
        s.swim = BN_BACK_TICKS;
      }
      riderPose(s.av, s.anim, s.pose, seatW, d.yaw, d.look.roll, s.rider.tilt, s.anim.phase === 'swim' ? s.at : null, d, this.time);
      s.av.setAction(ACT_BANANA, bnArg(0, k, s.swim > 0));
      s.av.update(s.pose, dt, this.time, GROUND, this.dio.camera.position, false);
    }
    this.camera(dt);
    // плашка — как у тебя в игре (место 0)
    const me = this.seats[0];
    if (me.swim > 0) this.hud.swim(me.swim / BN_BACK_TICKS, Math.ceil(me.swim / TICK_RATE));
    else this.hud.ride(me.rider.tilt, me.held, speed > 1.2);
    this.dio.update(dt, this.time);
    this.renderer.render(this.dio.scene, this.dio.camera);
    if (this.onStats && this.tick % 15 === 0) {
      const info = this.renderer.gl.info.render;
      const rows = this.seats.map((s, k) => `${NAMES[k]}: ${(Math.max(s.best, s.held) / TICK_RATE).toFixed(0)} с · падений ${s.falls}`).join(' · ');
      this.onStats(`${rows} · отрисовок ${info.calls}`);
    }
    requestAnimationFrame((t) => this.loop(t));
  }

  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();

  private camera(dt: number): void {
    const cam = this.dio.camera;
    const b = this.bn;
    if (this.cam === 'orbit') {
      this.controls.target.lerp(new THREE.Vector3(b.x, WATER_Y + 0.8, b.z), Math.min(1, dt * 4));
      this.controls.update();
      return;
    }
    const k = 1 - Math.exp(-dt * 5);
    if (this.cam === 'game') {
      // за спиной переднего седока, чуть сверху — как камера игры
      const fx = -Math.sin(b.yaw);
      const fz = -Math.cos(b.yaw);
      this.camPos.set(b.x - fx * 6.2, WATER_Y + 3.1, b.z - fz * 6.2);
      this.camLook.set(b.x + fx * 5, WATER_Y + 1.1, b.z + fz * 5);
    } else {
      // с пирса: желейка-зритель стоит на настиле и следит за бананом
      this.camPos.set(0, 1.7, 1.5);
      this.camLook.set(b.x, WATER_Y + 0.6, b.z);
    }
    cam.position.lerp(this.camPos, k);
    cam.lookAt(this.camLook);
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#bn-canvas');
const hud = document.querySelector<HTMLElement>('#bn-hud');
if (canvas && hud) {
  const lab = new BananaLab(canvas, hud);
  const stats = document.querySelector<HTMLElement>('#bn-stats');
  lab.onStats = (s) => { if (stats) stats.textContent = s; };
  const on = (sel: string, fn: (e: HTMLElement) => void): void => document.querySelectorAll<HTMLElement>(sel).forEach((e) => e.addEventListener('click', () => fn(e)));
  const group = (attr: string, value: string): void => document.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((e) => e.classList.toggle('is-on', e.getAttribute(attr) === value));
  on('[data-mode]', (e) => {
    const m = e.dataset.mode as Mode;
    lab.setMode(m);
    group('data-mode', m);
    group('data-cam', m === 'ride' ? 'game' : 'orbit');
    document.body.dataset.mode = m;
  });
  on('[data-cam]', (e) => {
    lab.setCam(e.dataset.cam as Cam);
    group('data-cam', e.dataset.cam!);
  });
  on('[data-act="fall"]', () => lab.fall(1, lab.tilt >= 0 ? 1 : -1));
  on('[data-act="back"]', () => lab.back(1));
  const slider = (id: string, fn: (v: number) => void): void => {
    const el = document.querySelector<HTMLInputElement>(id);
    el?.addEventListener('input', () => fn(Number(el.value)));
  };
  slider('#bn-speed', (v) => { lab.speed = v; });
  slider('#bn-lat', (v) => { lab.lat = v; });
  slider('#bn-tilt', (v) => { lab.tilt = v; });
  (window as unknown as { __banana: BananaLab }).__banana = lab;
}
