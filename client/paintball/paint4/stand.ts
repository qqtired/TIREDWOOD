// Стенд «Четыре краскомёта» (lab/paint4/index.html): желейки на настоящем «Причале» со светом игры держат наборы и
// стреляют по мишеням в движении — Маркер, Брызгалка, Лейка (мишень отлетает), Лук (натяжение и дуга), ведёрко на G.
// Камера — игровая (над плечом, как в бою: shared/aim.ts) или «вращать мышью». Внизу — карточки выбора, как в игре.
// Только для просмотра ведущим и владельцем: сети и сервера нет.
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/600.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/800.css';
import '../../ui/kit/tokens.css';
import '../../ui/kit/kit.css';
import '../../ui/kit/combat.css';
import '../../ui/kit/hud3/veranda3.css';
import * as THREE from 'three';
import { RIG_PB, cameraRig } from '../../../shared/aim.ts';
import { E_ALIVE, E_GROUNDED, E_RELOAD } from '../../../shared/protocol.ts';
import { EYE_HEIGHT, HITBOX_CY, HITBOX_RX, HITBOX_RY, TEAM_COLORS } from '../../../shared/constants.ts';
import { makeGrenade } from '../../../shared/fortgren.ts';
import { buildPier } from '../../../shared/maps/pier.ts';
import {
  BOW_DRAW_TICKS, KITS, KIT_BOW, KIT_CAN, KIT_MARKER, KIT_SQUIRT, arrowSpeed, bucketLaunch, fanDir,
} from '../../../shared/paint4.ts';
import { CollisionWorld, makeRayHit, rayEllipsoid } from '../../../shared/world.ts';
import { Avatar, tickAvatarShared, type AvatarPose } from '../../render/avatar.ts';
import { Effects } from '../../render/effects.ts';
import { Renderer } from '../../render/renderer.ts';
import { World } from '../../render/world.ts';
import { KitCards } from './cards.ts';
import { P4Fx, bowArc, bucketArc } from './fx.ts';
import { KitRig, kitTriangles } from './kits3d.ts';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const map = buildPier();
const world = new World(renderer, map);
const col = new CollisionWorld(map);
const effects = new Effects(world.scene, col);
const fx = new P4Fx(world.scene, effects, col);
const hit = makeRayHit();
const GROUND = { groundBelow: (x: number, y: number, z: number) => col.groundBelow(x, y, z) };

type LaneKind = 'marker' | 'squirt' | 'can' | 'bow' | 'bucket';
interface Lane {
  kind: LaneKind;
  kit: number;
  name: string;
  x: number;
  z: number;
  av: Avatar;
  rig: KitRig;
  pose: AvatarPose;
  target: Avatar;
  tPose: AvatarPose;
  /** Мишень отлетела (Лейка) — плавно возвращается */
  push: number;
  pushV: number;
  t: number;
  shots: number;
}

const ROW_Z = -25.5;
const TARGET_DZ = 6.5;
const lanes: Lane[] = [];
const defs: Array<[LaneKind, number, string, number]> = [
  ['marker', KIT_MARKER, 'Маркер', -3],
  ['squirt', KIT_SQUIRT, 'Брызгалка', 0],
  ['can', KIT_CAN, 'Лейка', 3],
  ['bow', KIT_BOW, 'Лук', 6],
  ['bucket', KIT_SQUIRT, 'Ведёрко (G)', 9],
];
defs.forEach(([kind, kit, name, x], i) => {
  const av = new Avatar(9200 + i, { gun: true, voice: false });
  av.setTeam(0);
  av.setInfo(name, 0, true, 1);
  av.addTo(world.scene);
  const rig = new KitRig(av, 0);
  rig.setKit(kit);
  const target = new Avatar(9300 + i, { gun: true, voice: false });
  target.setTeam(1);
  target.setInfo('Мишень', 1, false, 1);
  target.addTo(world.scene);
  lanes.push({
    kind, kit, name, x, z: ROW_Z, av, rig, target, push: 0, pushV: 0, t: -i * 0.4, shots: 0,
    pose: { x, y: 0, z: ROW_Z, yaw: Math.PI, pitch: 0, flags: E_ALIVE | E_GROUNDED },
    tPose: { x, y: 0, z: ROW_Z + TARGET_DZ, yaw: 0, pitch: 0, flags: E_ALIVE | E_GROUNDED },
  });
});

// ------------------------------------------------------------ интерфейс стенда

const ui = document.getElementById('ui')!;
const tri = kitTriangles();
ui.innerHTML = `<div class="k-hud" style="position:fixed;inset:0;pointer-events:none">
  <div class="k-plate st-panel" style="position:absolute;left:16px;top:16px;width:300px;pointer-events:auto;font:500 14px/1.35 Rubik,sans-serif">
    <b style="font-size:18px">Четыре краскомёта · стенд</b>
    <p style="margin:6px 0 8px">Настоящий «Причал», свет игры. Каждая желейка по кругу стреляет по мишени: выстрел, отдача, след и попадание. Лейка отталкивает мишень, Лук тянет тетиву (пунктир — куда полетит), ведёрко — держит G и бросает.</p>
    <div class="st-lanes" style="display:flex;flex-direction:column;gap:4px"></div>
    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
      <button class="k-btn k-btn--sm st-cam">Камера: вращать мышью</button>
      <button class="k-btn k-btn--sm k-btn--ghost st-cards-btn">Спрятать карточки</button>
      <button class="k-btn k-btn--sm k-btn--ghost st-slow">Замедлить</button>
      <button class="k-btn k-btn--sm k-btn--ghost st-pause">Пауза</button>
    </div>
    <p style="margin:8px 0 0;opacity:.75;font-size:12px">Треугольники: Брызгалка ${tri.squirt}, Лейка ${tri.can}, Лук ${tri.bow}, ведёрко ${tri.bucket} (предел предмета — 4 000). Мышь: «вращать» — тащи, колесо — ближе.</p>
  </div>
  <div class="k-slot k-slot--bc st-cards" style="pointer-events:auto"></div>
</div>`;
const laneBox = ui.querySelector('.st-lanes')!;
let sel = 1;
// по умолчанию — спереди-сбоку, чтобы видно было набор в руках; «игровая» — над плечом, как в бою
let orbit = true;
let slow = 1;
let paused = false;
const laneBtns = lanes.map((l, i) => {
  const b = document.createElement('button');
  b.className = 'k-btn k-btn--sm k-btn--ghost';
  b.style.justifyContent = 'flex-start';
  b.innerHTML = `<kbd class="k-key k-key--sm">${i + 1}</kbd> ${l.name}`;
  b.onclick = () => select(i);
  laneBox.appendChild(b);
  return b;
});
const cards = new KitCards(ui.querySelector('.st-cards') as HTMLElement);
cards.show('warmup');
cards.onPick = (k) => select(lanes.findIndex((l) => l.kind !== 'bucket' && l.kit === k));
function select(i: number): void {
  if (i < 0) return;
  sel = i;
  laneBtns.forEach((b, j) => b.classList.toggle('k-btn--gold', j === i));
  if (lanes[i].kind !== 'bucket') cards.setSelected(lanes[i].kit);
}
select(1);
const camBtn = ui.querySelector('.st-cam') as HTMLButtonElement;
camBtn.onclick = () => {
  orbit = !orbit;
  camBtn.textContent = orbit ? 'Камера: вращать мышью' : 'Камера: игровая';
};
const cardsSlot = ui.querySelector('.st-cards') as HTMLElement;
(ui.querySelector('.st-cards-btn') as HTMLButtonElement).onclick = (e) => {
  const off = cardsSlot.style.display !== 'none';
  cardsSlot.style.display = off ? 'none' : '';
  (e.target as HTMLElement).textContent = off ? 'Показать карточки' : 'Спрятать карточки';
};
(ui.querySelector('.st-slow') as HTMLButtonElement).onclick = (e) => {
  slow = slow === 1 ? 0.25 : 1;
  (e.target as HTMLElement).textContent = slow === 1 ? 'Замедлить' : 'Обычная скорость';
};
(ui.querySelector('.st-pause') as HTMLButtonElement).onclick = (e) => {
  paused = !paused;
  (e.target as HTMLElement).textContent = paused ? 'Дальше' : 'Пауза';
};
window.addEventListener('keydown', (e) => {
  const n = Number(e.key);
  if (n >= 1 && n <= lanes.length) select(n - 1);
});

// орбита: тащи мышью, колесо — ближе/дальше
// с правой руки желейки (набор — в правой), спереди-сбоку
let oYaw = -0.85;
let oPitch = -0.18;
let oDist = 2.6;
let drag = false;
canvas.addEventListener('pointerdown', () => { drag = true; });
window.addEventListener('pointerup', () => { drag = false; });
window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  orbit = true;
  camBtn.textContent = 'Камера: вращать мышью';
  oYaw -= e.movementX * 0.006;
  oPitch = Math.max(-1.2, Math.min(0.9, oPitch - e.movementY * 0.004));
});
canvas.addEventListener('wheel', (e) => {
  oDist = Math.max(0.9, Math.min(9, oDist * (e.deltaY > 0 ? 1.1 : 0.9)));
}, { passive: true });

// ------------------------------------------------------------ стрельба по мишеням

const _v = new THREE.Vector3();
const dir = { dirX: 0, dirY: 0, dirZ: 0 };
const arcPts = new Float32Array(3 * 90);

/** Луч из точки (ox, oy, oz) по (dx, dy, dz): мир и мишень полосы; конец и что задели */
function ray(l: Lane, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, range: number): { t: number; kind: number; nx: number; ny: number; nz: number } {
  let best = range;
  let kind = 2;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  if (col.raycast(ox, oy, oz, dx, dy, dz, range, hit, true)) {
    best = hit.t;
    kind = 0;
    nx = hit.nx;
    ny = hit.ny;
    nz = hit.nz;
  }
  const tp = l.tPose;
  const t = rayEllipsoid(ox, oy, oz, dx, dy, dz, tp.x, tp.y + HITBOX_CY, tp.z, HITBOX_RX, HITBOX_RY);
  if (t >= 0 && t < best) {
    best = t;
    kind = 1;
  }
  return { t: best, kind, nx, ny, nz };
}

function aimAt(l: Lane, spread: number): THREE.Vector3 {
  const tp = l.tPose;
  _v.set(tp.x + (Math.random() - 0.5) * spread, tp.y + 0.9 + (Math.random() - 0.5) * spread, tp.z - l.z).normalize();
  _v.set(tp.x + (Math.random() - 0.5) * spread - l.x, tp.y + 0.9 + (Math.random() - 0.5) * spread - (l.pose.y + EYE_HEIGHT), tp.z - l.z).normalize();
  return _v;
}

function hitTarget(l: Lane, x: number, y: number, z: number): void {
  l.target.onHit(x, y, z, y - l.tPose.y > 1.14);
}

function step(l: Lane, dt: number): void {
  l.t += dt;
  const color = TEAM_COLORS[0];
  const ox = l.x;
  const oy = EYE_HEIGHT;
  const oz = l.z;
  const muzzle = (out: THREE.Vector3) => l.rig.muzzle(out) ?? l.av.muzzle(out);
  if (l.kind === 'marker') {
    const T = 2.6;
    const t = l.t % T;
    const n = Math.floor(t / 0.1);
    if (t < 0.8 && n >= l.shots) {
      l.shots = n + 1;
      const d = aimAt(l, 0.5);
      const r = ray(l, ox, oy, oz, d.x, d.y, d.z, 160);
      muzzle(_v);
      l.av.onShot();
      effects.puff(_v.x, _v.y, _v.z, 0.35, 0xffffff, 0.14, 0.3, 0.45, 1.4);
      effects.shootBall(_v.x, _v.y, _v.z, ox + d.x * r.t, oy + d.y * r.t, oz + d.z * r.t, color, 9200, { kind: r.kind, nx: r.nx, ny: r.ny, nz: r.nz, victim: r.kind === 1 ? 9300 : 0, head: false });
    }
    if (t >= 0.8) l.shots = 0;
  } else if (l.kind === 'squirt') {
    const T = 3.4;
    const t = l.t % T;
    const n = Math.floor(t / 0.05);
    const mag = KITS[KIT_SQUIRT].mag;
    if (t < 1.4 && n >= l.shots) {
      l.shots = n + 1;
      const d = aimAt(l, 0.35);
      const r = ray(l, ox, oy, oz, d.x, d.y, d.z, 28);
      muzzle(_v);
      l.rig.fire();
      l.av.onShot();
      fx.squirt(_v.x, _v.y, _v.z, ox + d.x * r.t, oy + d.y * r.t, oz + d.z * r.t, r.kind, r.nx, r.ny, r.nz, color);
      if (r.kind === 1) hitTarget(l, ox + d.x * r.t, oy + d.y * r.t, oz + d.z * r.t);
    }
    l.rig.setLevel(t < 1.4 ? 1 - Math.min(n, mag) / mag : 0.1);
    if (t >= 1.5 && t < 3.1) l.rig.setReload((t - 1.5) / 1.6);
    else l.rig.setReload(null);
    l.pose.flags = E_ALIVE | E_GROUNDED | (t >= 1.5 && t < 3.1 ? E_RELOAD : 0);
    if (t >= 1.4) l.shots = 0;
  } else if (l.kind === 'can') {
    const T = 4.4;
    const t = l.t % T;
    const n = Math.floor(t / 0.6);
    if (t < 1.8 && n >= l.shots) {
      l.shots = n + 1;
      const d = aimAt(l, 0);
      const spec = KITS[KIT_CAN];
      muzzle(_v);
      const sx = _v.x;
      const sy = _v.y;
      const sz = _v.z;
      const ends: number[] = [];
      let hits = 0;
      for (let i = 0; i < spec.pellets; i++) {
        fanDir(d.x, d.y, d.z, i, spec.pellets, spec.fan, 77, l.t * 1000 | 0, dir);
        const r = ray(l, ox, oy, oz, dir.dirX, dir.dirY, dir.dirZ, spec.range);
        ends.push(ox + dir.dirX * r.t, oy + dir.dirY * r.t, oz + dir.dirZ * r.t, r.kind);
        if (r.kind === 1) hits++;
      }
      l.rig.fire();
      l.av.onShot();
      fx.fan(sx, sy, sz, ends, color);
      if (hits >= 3) {
        hitTarget(l, l.tPose.x, 1, l.tPose.z);
        l.pushV = 5 + hits * 0.8;
      }
    }
    if (t >= 2.0 && t < 4.2) l.rig.setReload((t - 2.0) / 2.2);
    else l.rig.setReload(null);
    if (t >= 1.8) l.shots = 0;
  } else if (l.kind === 'bow') {
    const T = 2.4;
    const t = l.t % T;
    // 0…0,7 — тянет, 0,7…1,1 — держит, 1,1 — отпускает
    const draw = t < 1.1 ? Math.min(1, t / (BOW_DRAW_TICKS / 60)) : 0;
    l.rig.setDraw(draw);
    // пунктир — куда полетит стрела (как у игрока, пока тянет)
    const aim = aimAt(l, 0);
    const pitchUp = 0.035;
    const d = _v.set(aim.x, aim.y + pitchUp, aim.z).normalize();
    if (sel === lanes.indexOf(l) && draw > 0) {
      const n = bowArc(ox, oy, oz, d.x, d.y, d.z, arrowSpeed(Math.max(0.2, draw)), col, arcPts);
      fx.setArc(arcPts, n, arcPts[(n - 1) * 3], arcPts[(n - 1) * 3 + 1], arcPts[(n - 1) * 3 + 2], true, 0);
    } else if (sel === lanes.indexOf(l)) fx.hideArc();
    if (t >= 1.1 && l.shots === 0) {
      l.shots = 1;
      const sp = arrowSpeed(1);
      muzzle(_v);
      l.rig.fire();
      l.av.onShot();
      fx.arrow(9203, Math.floor(l.t), _v.x, _v.y, _v.z, d.x * sp, d.y * sp, d.z * sp, 0);
      window.setTimeout(() => hitTarget(l, l.tPose.x, 1.05, l.tPose.z), 140);
    }
    if (t < 1.1) l.shots = 0;
  } else if (l.kind === 'bucket') {
    const T = 3.6;
    const t = l.t % T;
    l.rig.holdBucket(t > 0.2 && t < 1.2);
    if (t > 0.2 && t < 1.2 && sel === lanes.indexOf(l)) {
      const n = bucketArc(ox, 0, oz, Math.PI, -0.12, col, arcPts);
      fx.setArc(arcPts, n, arcPts[(n - 1) * 3], arcPts[(n - 1) * 3 + 1], arcPts[(n - 1) * 3 + 2], true, 3.2);
    } else if (sel === lanes.indexOf(l) && t >= 1.2) fx.hideArc();
    if (t >= 1.2 && l.shots === 0) {
      l.shots = 1;
      l.rig.throwBucket();
      const g = makeGrenade();
      bucketLaunch(ox, 0, oz, Math.PI, -0.12, col, hit, g);
      window.setTimeout(() => fx.bucket(9204, g.x, g.y, g.z, g.vx, g.vy, g.vz, 0, color), 120);
    }
    if (t < 1.2) l.shots = 0;
  }
  // мишень Лейки отлетает и возвращается
  l.push += l.pushV * dt;
  l.pushV += (-l.push * 30 - l.pushV * 8) * dt;
  l.tPose.z = l.z + TARGET_DZ + Math.max(0, l.push);
}

// ------------------------------------------------------------ кадр

const camOut = { x: 0, y: 0, z: 0 };
let last = performance.now();
let time = 0;
function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.gl.setSize(w, h, false);
  world.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

function frame(now: number): void {
  const raw = Math.min(0.1, (now - last) / 1000);
  last = now;
  const dt = paused ? 0 : raw * slow;
  time += dt;
  for (const l of lanes) {
    step(l, dt);
    // взгляд на мишень
    const tp = l.tPose;
    l.pose.pitch = Math.atan2(tp.y + 0.9 - EYE_HEIGHT, tp.z - l.z) * 0.6;
    l.av.update(l.pose, dt, time, GROUND, world.camera.position, false);
    l.rig.update(dt);
    l.target.update(l.tPose, dt, time, GROUND, world.camera.position, false);
  }
  effects.update(dt);
  fx.update(dt);
  world.update(dt);
  tickAvatarShared(time, canvas.clientHeight);
  // камера
  const l = lanes[sel];
  const cam = world.camera;
  if (orbit) {
    // точка взгляда ниже рук: желейка с набором — в верхней половине кадра, над карточками
    const cx = l.x - 0.25;
    const cy = 0.45;
    const cz = l.z + 0.2;
    cam.position.set(cx + Math.sin(oYaw) * Math.cos(oPitch) * oDist, cy - Math.sin(oPitch) * oDist, cz + Math.cos(oYaw) * Math.cos(oPitch) * oDist);
    cam.lookAt(cx, cy, cz);
  } else {
    const yaw = Math.PI;
    const pitch = -0.08;
    cameraRig(l.x, 0, l.z, yaw, pitch, RIG_PB, 1, col, camOut);
    cam.position.set(camOut.x, camOut.y, camOut.z);
    cam.rotation.set(pitch, yaw, 0, 'YXZ');
  }
  world.renderScene();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

(window as unknown as { __stand: unknown }).__stand = { lanes, select, fx, setOrbit: (o: boolean) => { orbit = o; camBtn.textContent = o ? 'Камера: вращать мышью' : 'Камера: игровая'; }, setView: (yaw: number, pitch: number, dist: number) => { oYaw = yaw; oPitch = pitch; oDist = dist; }, cards: (on: boolean) => { cardsSlot.style.display = on ? '' : 'none'; }, setPaused: (p: boolean) => { paused = p; }, tri };
