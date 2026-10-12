// Проверочная страница fort-fx (только npm run dev, в сборку не входит): настоящий мир крепости с новым берегом,
// статисты орды и EventFx. Кнопки и параметры адреса вызывают метеор, ящик, туман и золото. Для снимков:
//   /tools/fort-fx/?cam=north&fx=meteor&t=1.3&pause=1   — шагнуть t секунд ровными кадрами и замереть
//   window.__fx: cam(имя | [x,y,z], [tx,ty,tz]), run(имя), advance(с), pause(вкл), stats()
// Заглушки чужого, только чтобы видеть картину целиком: лодка у места высадки — копия корпуса баркаса из zombies3d.ts
// ветки fort; красный круг под метеором — вместо метки marks.ts; дальность тумана сцены в туман — как обещает match.ts.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_Y } from '../../shared/constants.ts';
import { Z_BRUTE, Z_RUNNER, Z_WALKER, ZS_WALK } from '../../shared/fort.ts';
import { buildFort } from '../../shared/fortmap.ts';
import { ZF_CREW, type ZombieSnap } from '../../shared/fortnet.ts';
import { CollisionWorld } from '../../shared/world.ts';
import { Effects } from '../render/effects.ts';
import { Renderer } from '../render/renderer.ts';
import type { Quality } from '../settings.ts';
import { CRATE_DOWN, CRATE_FALL, CRATE_NONE, EventFx } from './eventfx.ts';
import { FortWorld } from './world.ts';
import { Zombies3D } from './zombies3d.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const map = buildFort();
const collision = new CollisionWorld(map);
const world = new FortWorld(renderer, map);
const zombies = new Zombies3D(world.scene, collision);
const effects = new Effects(world.scene, collision);
const fx = new EventFx(world.scene, world.camera, collision);
const orbit = new OrbitControls(world.camera, canvas);
orbit.enableDamping = false;
orbit.maxPolarAngle = Math.PI * 0.495;
const params = new URLSearchParams(location.search);
const qualitySel = document.getElementById('quality') as HTMLSelectElement;
const camSel = document.getElementById('cam') as HTMLSelectElement;
const metrics = document.getElementById('metrics')!;
if (params.has('nopanel')) document.getElementById('qa')!.classList.add('hide');

// --- статисты: шаркуны по северной дороге к воротам и двое абордажников с лодки к морской стене
interface Walker { id: number; kind: number; x: number; z: number; speed: number; lane: number; crew: boolean; dead: number }
const walkers: Walker[] = [];
let nextId = 1000;
for (let i = 0; i < 9; i++) {
  walkers.push({ id: nextId++, kind: i % 4 === 3 ? Z_BRUTE : i % 3 === 2 ? Z_RUNNER : Z_WALKER, x: (i % 3 - 1) * 2.4 + (i % 2) * 0.8, z: -26 - i * 3.6, speed: 1.6 + (i % 3) * 0.4, lane: 0, crew: false, dead: -1 });
}
for (let i = 0; i < 2; i++) walkers.push({ id: nextId++, kind: Z_WALKER, x: 12.5 + (i ? 1.1 : -0.6), z: 21.8 - i * 3.2, speed: 1.1, lane: 1, crew: true, dead: -1 });
const snaps: ZombieSnap[] = [];
let tick = 0;
let simTime = 0;

function updateWalkers(dt: number): void {
  snaps.length = 0;
  for (const w of walkers) {
    if (w.dead >= 0) {
      if (simTime - w.dead < 2.5) continue;
      w.dead = -1;
      w.id = nextId++;
      w.z = w.crew ? 22 : -62;
    }
    if (w.crew) {
      w.z -= w.speed * dt;
      if (w.z < 14.6) w.z = 22.2;
    } else {
      w.z += w.speed * dt;
      if (w.z > -19.5) w.z = -62;
    }
    snaps.push({ id: w.id, kind: w.kind, state: ZS_WALK, hp: 1, x: w.x, y: 0, z: w.z, yaw: w.crew ? Math.PI : 0, atk: 0, flags: w.crew ? ZF_CREW : 0 });
  }
  zombies.push(++tick, snaps, snaps.length);
}

/** Сбить ближайшего к камере статиста: клякса, как в игре, и монеты, если золотая лихорадка */
function killOne(): void {
  let best: Walker | null = null;
  let bd = 1e9;
  const cam = world.camera.position;
  for (const w of walkers) {
    if (w.dead >= 0 || w.crew) continue;
    const d = Math.hypot(w.x - cam.x, w.z - cam.z);
    if (d < bd) {
      bd = d;
      best = w;
    }
  }
  if (!best) return;
  zombies.kill(best.id);
  effects.deathSplat(best.x, 0, best.z, 0x8fd06a);
  // как в match.ts: в лихорадку, из середины тела
  if (goldOn) fx.coins(best.x, 1, best.z, best.kind === Z_BRUTE);
  best.dead = simTime;
}

// --- копия корпуса баркаса (zombies3d.ts ветки fort) у восточного места высадки
function boatStandIn(): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const col = (g: THREE.BufferGeometry, hex: number) => {
    const ng = g.index ? g.toNonIndexed() : g;
    const c = new THREE.Color(hex);
    const n = ng.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    ng.deleteAttribute('uv');
    return ng;
  };
  const wood = 0x8a5a34;
  const dark = 0x6b4426;
  parts.push(col(new THREE.BoxGeometry(1.1, 0.16, 2.6).translate(0, 0.0, 0.1), dark));
  for (const s of [-1, 1]) {
    parts.push(col(new THREE.BoxGeometry(0.1, 0.62, 2.9).rotateZ(s * 0.32).translate(s * 0.66, 0.3, 0.1), wood));
    parts.push(col(new THREE.BoxGeometry(0.14, 0.08, 2.9).translate(s * 0.78, 0.6, 0.1), 0xd9c7a0));
    parts.push(col(new THREE.BoxGeometry(0.1, 0.62, 0.95).rotateZ(s * 0.32).rotateY(-s * 0.62).translate(s * 0.36, 0.3, -1.62), wood));
  }
  parts.push(col(new THREE.BoxGeometry(1.4, 0.62, 0.1).translate(0, 0.3, 1.55), wood));
  for (const z of [-0.6, 0.15, 0.85]) parts.push(col(new THREE.BoxGeometry(1.2, 0.07, 0.26).translate(0, 0.38, z), 0xa57548));
  parts.push(col(new THREE.CylinderGeometry(0.05, 0.06, 2.7, 8).translate(0, 1.5, -0.35), dark));
  for (let i = 0; i < 4; i++) parts.push(col(new THREE.BoxGeometry(0.03, 0.42, 1.1 - i * 0.18).translate(0.04, 2.45 - i * 0.42, 0.25 - i * 0.02), i % 2 ? 0xf6f2e8 : 0xd8333a));
  const m = new THREE.Mesh(mergeGeometries(parts, false)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
  m.position.set(12.9, WATER_Y, 27.5);
  return m;
}
const boat = boatStandIn();
world.scene.add(boat);

// --- сценарии
interface Job { at: number; run: () => void }
const jobs: Job[] = [];
const later = (s: number, run: () => void) => jobs.push({ at: simTime + s, run });

/** Заглушка метки marks.ts: красный круг на месте удара, пока летит метеор */
const markGeo = new THREE.RingGeometry(2.72, 3, 48).rotateX(-Math.PI / 2);
const markMat = new THREE.MeshBasicMaterial({ color: 0xe8402c, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });

function surfaceAt(x: number, z: number): number {
  const g = collision.groundBelow(x, 30, z);
  return Number.isFinite(g) ? Math.max(0, g) : 0;
}

/** Метеор как у сервера fort (server/fort/events.ts): из неба на высоте 46 м, 34 м к северу, вбок до 15 м, 1,4 с */
function meteorAt(tx: number, tz: number, sec = 1.4, side = (Math.random() - 0.5) * 30): void {
  const ground = surfaceAt(tx, tz);
  fx.meteor(tx + side, 46, tz - 34, tx, ground, tz, sec);
  const mark = new THREE.Mesh(markGeo, markMat);
  mark.position.set(tx, ground + 0.05, tz);
  world.scene.add(mark);
  marks.add(mark);
  later(sec, () => {
    fx.meteorHit(tx, ground, tz, 3);
    world.scene.remove(mark);
    marks.delete(mark);
  });
}
const marks = new Set<THREE.Mesh>();

let crateX = -4;
let crateZ = -5;
let crateY = 0;
let crateState = CRATE_NONE;
let crateSince = 0;
function crateAt(x: number, z: number): void {
  crateX = x;
  crateZ = z;
  crateY = surfaceAt(x, z);
}
const SCRIPTS: Record<string, () => void> = {
  meteor: () => meteorAt(-3, -27, 1.4, 12),
  wallmeteor: () => meteorAt(5, -14.6, 1.4, -10),
  rain: () => {
    for (let i = 0; i < 15; i++) {
      const crowd = i % 2 === 0;
      const x = crowd ? (Math.random() - 0.5) * 16 : (Math.random() - 0.5) * 26;
      const z = crowd ? -22 - Math.random() * 22 : -12 + Math.random() * 20;
      later(i * 0.8, () => meteorAt(x, z));
    }
  },
  crate: () => {
    crateAt(-4, -5);
    crateState = CRATE_FALL;
    crateSince = simTime;
  },
  wallcrate: () => {
    crateAt(-6, -14.6);
    crateState = CRATE_FALL;
    crateSince = simTime;
  },
  land: () => {
    crateState = CRATE_DOWN;
  },
  take: () => {
    // как в match.ts на событие supply «подобран»: сперва crate(0), потом cratePicked
    fx.crate(CRATE_NONE, crateX, crateZ, crateY);
    fx.cratePicked(crateX, crateY, crateZ);
    crateState = CRATE_NONE;
  },
  fog: () => {
    fogOn = !fogOn;
    fx.fog(fogOn);
  },
  gold: () => {
    goldOn = !goldOn;
    fx.goldRush(goldOn);
  },
  kill: () => killOne(),
  clear: () => {
    fogOn = goldOn = false;
    fogK = 0;
    crateState = CRATE_NONE;
    jobs.length = 0;
    for (const m of marks) world.scene.remove(m);
    marks.clear();
    fx.clear();
  },
};
let fogOn = false;
let goldOn = false;
let fogK = 0;
const FOG_BASE = [(world.scene.fog as THREE.Fog).near, (world.scene.fog as THREE.Fog).far];

const CAMS: Record<string, [[number, number, number], [number, number, number]]> = {
  north: [[1.5, 6.4, -12.6], [-1, 0.5, -34]],
  sky: [[1.5, 5.6, -12.6], [0, 5.5, -40]],
  wall: [[3.5, 5.6, 12.4], [21, -0.6, 29]],
  sea: [[6, 8.5, 66], [6, 1.2, 16]],
  landing: [[5.2, 3.4, 17.2], [13, -0.4, 25.5]],
  pier: [[14, 4.2, 34], [27, 0.2, 31]],
  yard: [[-8, 7.2, 9.6], [-2, 1.5, -7]],
  top: [[0, 82, 30], [0, 0, 10]],
  crate: [[-11, 4.5, 8.5], [-3, 9, -6]],
  cratenear: [[-9.5, 3.4, 1.8], [-4, 0.5, -5]],
};

type V3 = [number, number, number];

function cam(p: string | V3, t?: V3): void {
  const [pos, target]: [V3, V3] = typeof p === 'string' ? CAMS[p] ?? CAMS.north : [p, t ?? [0, 0, 0]];
  world.camera.position.set(pos[0], pos[1], pos[2]);
  orbit.target.set(target[0], target[1], target[2]);
  orbit.update();
}

function setQuality(q: Quality): void {
  world.setQuality(q);
  zombies.setQuality(q);
  fx.setQuality(q);
  resize();
}

function resize(): void {
  const q = qualitySel.value;
  renderer.resize(window.innerWidth, window.innerHeight, Math.min(devicePixelRatio, q === 'low' ? 1 : q === 'medium' ? 1.25 : 2));
  world.resize(window.innerWidth, window.innerHeight);
}

function step(dt: number): void {
  simTime += dt;
  for (let i = jobs.length - 1; i >= 0; i--) {
    if (jobs[i].at > simTime) continue;
    const j = jobs.splice(i, 1)[0];
    j.run();
  }
  // ящик — как из снимков: каждое «обновление» шлёт состояние заново
  if (crateState === CRATE_FALL && simTime - crateSince >= 7) crateState = CRATE_DOWN;
  fx.crate(crateState, crateX, crateZ, crateY);
  // туман: дальность тумана сцены ведёт match.ts (applyFog: FOG_NEAR 6, FOG_FAR 50 за 3 с) — здесь так же
  const fog = world.scene.fog as THREE.Fog;
  fogK = Math.max(0, Math.min(1, fogK + (fogOn ? dt / 3 : -dt / 3)));
  fog.near = FOG_BASE[0] + (6 - FOG_BASE[0]) * fogK;
  fog.far = FOG_BASE[1] + (50 - FOG_BASE[1]) * fogK;
  updateWalkers(dt);
  zombies.update(tick, dt, simTime, world.camera);
  effects.update(dt);
  fx.update(dt);
  world.update(dt, world.camera.position);
}

function render(): void {
  renderer.beginFrame(true);
  world.renderScene();
  renderer.endFrame();
  const info = renderer.gl.info.render;
  const s = fx.stats();
  metrics.textContent = `${info.calls} вызовов · ${info.triangles.toLocaleString('ru')} треуг. · CPU ${renderer.cpuMs.toFixed(1)} мс · GPU ${renderer.gpuMs?.toFixed(1) ?? '—'} мс\n` +
    `частиц ${s.particles} · метеоров ${s.meteors} · монет ${s.coins} · ящик ${s.crate} · туман ${s.fog.toFixed(2)} · золото ${s.gold.toFixed(2)}`;
}

let paused = false;
let previous = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - previous) / 1000);
  previous = now;
  if (!paused) step(dt);
  orbit.update();
  render();
  requestAnimationFrame(frame);
}

/** Шагнуть sec секунд ровными кадрами по 1/60 (для снимков) */
function advance(sec: number): void {
  const n = Math.round(sec * 60);
  for (let i = 0; i < n; i++) step(1 / 60);
  render();
}

for (const b of document.querySelectorAll<HTMLButtonElement>('#qa button[data-fx]')) {
  b.addEventListener('click', () => {
    SCRIPTS[b.dataset.fx!]?.();
    if (b.dataset.fx === 'fog') b.classList.toggle('on', fogOn);
    if (b.dataset.fx === 'gold') b.classList.toggle('on', goldOn);
  });
}
camSel.addEventListener('change', () => cam(camSel.value));
qualitySel.addEventListener('change', () => setQuality(qualitySel.value as Quality));
window.addEventListener('resize', resize);

(window as unknown as Record<string, unknown>).__fx = {
  cam,
  run: (name: string) => SCRIPTS[name]?.(),
  advance,
  pause: (on: boolean) => { paused = on; },
  stats: () => ({ ...fx.stats(), calls: renderer.gl.info.render.calls, triangles: renderer.gl.info.render.triangles, cpuMs: renderer.cpuMs, gpuMs: renderer.gpuMs }),
  crateAt,
  meteorAt,
  fx,
};

qualitySel.value = params.get('q') ?? 'high';
setQuality(qualitySel.value as Quality);
const camName = params.get('cam') ?? 'north';
camSel.value = camName in CAMS ? camName : 'north';
cam(camName in CAMS ? camName : 'north');
// разогрев: статисты встают по местам
advance(0.5);
for (const name of (params.get('fx') ?? '').split(',').filter(Boolean)) SCRIPTS[name]?.();
const t = Number(params.get('t') ?? 0);
if (t > 0) advance(t);
paused = params.has('pause');
requestAnimationFrame(frame);
