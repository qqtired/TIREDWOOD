// Стенд лагеря Барона (только разработка, /tools/fort50-camp/): настоящий мир крепости без сервера, лагерь на
// CAMP_SPOTS[0], орбитальная камера, кнопки стадий, замаха и выстрела в западную стену, поджога, пожара и уборки,
// стражи для масштаба, замер треугольников и отрисовок. window.__camp — для снимков из headless Chrome.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ZS_WALK } from '../../../shared/fort.ts';
import { CAMP_SPOTS, CATA_FLIGHT, CATA_WINDUP, type F50Camp } from '../../../shared/fort50.ts';
import { TICK_RATE } from '../../../shared/constants.ts';
import { Z_BRUTE, Z_SHIELD, Z_SPITTER, Z_WALKER } from '../../../shared/fortkinds.ts';
import { buildFort } from '../../../shared/fortmap.ts';
import type { ZombieSnap } from '../../../shared/fortnet.ts';
import { CollisionWorld } from '../../../shared/world.ts';
import { Renderer } from '../../render/renderer.ts';
import type { Quality } from '../../settings.ts';
import { PEBBLE } from '../castle/fx.ts';
import { FortWorld } from '../world.ts';
import { Zombies3D } from '../zombies3d.ts';
import { Camp3D, type CampSound } from './camp3d.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const map = buildFort();
const world = new FortWorld(renderer, map);
const zombies = new Zombies3D(world.scene, new CollisionWorld(map));
const orbit = new OrbitControls(world.camera, canvas);
orbit.enableDamping = true;
orbit.maxPolarAngle = Math.PI * 0.495;
const metrics = document.getElementById('metrics')!;
const log = document.getElementById('log')!;
const params = new URLSearchParams(location.search);
if (params.has('clean')) document.getElementById('qa')!.classList.add('hide');

const [cx, cz] = CAMP_SPOTS[0];
const camp = new Camp3D(world.scene);
const TARGET = { x: -18, y: 2.4, z: 7 };
const WIND = CATA_WINDUP / TICK_RATE;
const FLIGHT = CATA_FLIGHT / TICK_RATE;
/** Где стоит поджигающий (не дальше 3 м от центра лагеря) */
const BURNER = { x: cx + 2.4, z: cz + 1.4 };

/** Часы стенда: можно замедлить и остановить */
let simT = 100;
let speed = 1;
const state: F50Camp = { side: -1, x: cx, z: cz, placed: 20, until: 30, stage: 3, burnt: false, guards: 4 };
let shown = true;
let cycle = false;
let cycleAt = 0;
const timers: Array<[number, () => void]> = [];
const sounds: string[] = [];

camp.onSound = (kind: CampSound) => {
  sounds.push(`${simT.toFixed(1)} ${kind}`);
  if (sounds.length > 6) sounds.shift();
  log.textContent = sounds.join('\n');
};
camp.onLand = (x, y, z) => {
  // в игре это делает ведущий: пыль и камешки на стене
  world.castle.fx.puff(x, y, z, 8, 1.2, 1.1, 0.5, 1.8);
  world.castle.fx.burst(x, y, z, 12, PEBBLE, [0.12, 0.1, 0.12], 4, 1, 0.6, 0, 1.4);
};

function at(dt: number, fn: () => void): void {
  timers.push([simT + dt, fn]);
}

function apply(instant = false): void {
  camp.set(shown ? { ...state } : null, simT, instant);
}

function stage(n: number): void {
  if (state.burnt || !shown) {
    state.burnt = false;
    shown = true;
    camp.set(null, simT, true);
    camp.update(0, simT);
  }
  state.stage = n;
  apply();
}

function shoot(): void {
  if (state.stage < 3) stage(3);
  const fireAt = simT + WIND;
  camp.windup(simT, fireAt, TARGET);
  at(WIND, () => camp.fire(TARGET, simT, simT + FLIGHT));
}

function burn(sec = 3, cancel = false): void {
  torch(true);
  camp.burnStart(simT, simT + sec, BURNER);
  if (cancel) at(sec * 0.6, () => {
    camp.burnCancel();
    torch(false);
  });
  else at(sec, () => {
    state.burnt = true;
    camp.burnt(simT);
    apply();
    torch(false);
  });
}

function burnNow(): void {
  state.burnt = true;
  camp.burnt(simT);
  apply();
}

function remove(): void {
  shown = false;
  apply();
}

function restore(): void {
  shown = true;
  state.burnt = false;
  apply();
}

// факел в «руке»: рука поджигающего на высоте 1 м, факел наклонён к лагерю
const hand = new THREE.Group();
hand.position.set(BURNER.x, 1.0, BURNER.z);
hand.rotation.set(0, Math.atan2(cx - BURNER.x, cz - BURNER.z), 0);
const tilt = new THREE.Group();
tilt.rotation.x = 0.6;
hand.add(tilt);
world.scene.add(hand);
function torch(on: boolean): void {
  const t = camp.torch();
  if (on) tilt.add(t);
  else t.removeFromParent();
}
if (params.has('torch')) torch(true);

function cam(p: [number, number, number], t: [number, number, number]): void {
  world.camera.position.set(...p);
  orbit.target.set(...t);
  orbit.update();
}

const CAMS: Record<string, [[number, number, number], [number, number, number]]> = {
  // со стены: игрок на западной стене смотрит на лагерь
  wall: [[-17, 5, 0], [cx, 1.5, cz]],
  near: [[cx + 8.5, 3.2, cz + 5.5], [cx, 1.8, cz]],
  gate: [[cx + 6.5, 1.7, cz + 1.2], [cx, 1.6, cz]],
  side: [[cx + 1, 3.2, cz + 10], [cx, 2.2, cz]],
  back: [[cx - 8, 4.5, cz - 6], [cx, 1.6, cz]],
  high: [[cx + 9, 14, cz + 9], [cx, 0.5, cz]],
  flight: [[-24, 9, 14], [-26, 4, -1]],
};

/** Камера в осях лагеря (+Z — вход к крепости, +X — правая рука): откуда и куда */
const YAW0 = Math.atan2(-18 - cx, 2.5);
function campPoint(x: number, y: number, z: number): [number, number, number] {
  const c = Math.cos(YAW0);
  const s = Math.sin(YAW0);
  return [cx + x * c + z * s, y, cz - x * s + z * c];
}
function look(x: number, y: number, z: number, tx: number, ty: number, tz: number): void {
  cam(campPoint(x, y, z), campPoint(tx, ty, tz));
}

function setCam(name: string): void {
  const c = CAMS[name];
  if (c) cam(c[0], c[1]);
}

const actions: Record<string, () => void> = {
  s0: () => stage(0), s1: () => stage(1), s2: () => stage(2), s3: () => stage(3),
  shoot, cycle: () => {
    cycle = !cycle;
    cycleAt = simT;
  },
  burn: () => burn(3), cancel: () => burn(3, true), burnt: burnNow, remove, restore,
  torch: () => torch(!camp.torch().parent),
  slow: () => (speed = speed === 1 ? 0.25 : 1),
  pause: () => (speed = speed === 0 ? 1 : 0),
};
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-act]')) b.addEventListener('click', () => actions[b.dataset.act!]?.());
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-cam]')) b.addEventListener('click', () => setCam(b.dataset.cam!));

/** Стражи у лагеря (для масштаба): ходят кругом */
function guards(): ZombieSnap[] {
  if (!shown || params.get('guards') === '0') return [];
  const kinds = [Z_SHIELD, Z_BRUTE, Z_WALKER, Z_SPITTER];
  return kinds.map((kind, i) => {
    const a = simT * 0.09 + (i / kinds.length) * Math.PI * 2;
    const r = 6.2 + (i % 2) * 0.6;
    return { id: 50 + i, kind, state: ZS_WALK, hp: 1, x: cx + Math.sin(a) * r, y: 0, z: cz + Math.cos(a) * r, yaw: a + Math.PI / 2, atk: 0, flags: 0 };
  });
}

function resize(): void {
  renderer.resize(window.innerWidth, window.innerHeight, Math.min(devicePixelRatio, 2));
  world.resize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', resize);
resize();
const q = (params.get('q') as Quality) || 'high';
world.setQuality(q);
zombies.setQuality(q);
setCam(params.get('cam') ?? 'wall');
state.stage = Number(params.get('stage') ?? 3);
apply(!params.has('grow'));

let last = { calls: 0, triangles: 0 };
let tick = 0;
(window as unknown as Record<string, unknown>).__camp = {
  camp, world, renderer, cam, setCam, look, stage, shoot, burn, burnNow, remove, restore, torch,
  speed: (k: number) => (speed = k),
  t: () => simT,
  /** Перемотать время стенда на dt секунд (кадрами по 1/60) */
  skip(dt: number) {
    const n = Math.round(dt * 60);
    for (let i = 0; i < n; i++) step(1 / 60);
  },
  state: () => ({ ...camp.info(), render: last, cpuMs: renderer.cpuMs, campTris: camp.triangles, draws: camp.draws }),
};

function step(dt: number): void {
  simT += dt;
  for (let i = timers.length - 1; i >= 0; i--) {
    if (simT >= timers[i][0]) {
      const fn = timers[i][1];
      timers.splice(i, 1);
      fn();
    }
  }
  if (cycle && simT >= cycleAt) {
    cycleAt = simT + 15;
    shoot();
  }
  camp.update(dt, simT);
}

let previous = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - previous) / 1000);
  previous = now;
  orbit.update();
  if (speed > 0) step(dt * speed);
  const list = guards();
  zombies.push(++tick, list, list.length);
  zombies.update(tick, dt, now / 1000, world.camera);
  world.update(dt, world.camera.position);
  renderer.beginFrame(true);
  world.renderScene();
  renderer.endFrame();
  const info = renderer.gl.info.render;
  last = { calls: info.calls, triangles: info.triangles };
  const ci = camp.info();
  metrics.textContent =
    `лагерь: ${camp.triangles.toLocaleString('ru')} треуг. · ${camp.draws} отрисовок\n` +
    `стадия ${ci.stage} · рычаг ${ci.arm}° · наводка ${ci.aim}° · огней ${ci.flames}\n` +
    `кадр: ${info.calls} вызовов · ${info.triangles.toLocaleString('ru')} треуг. · CPU ${renderer.cpuMs.toFixed(1)} мс`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
