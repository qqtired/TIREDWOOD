// Controlled rendering fixture. No Net/App instance, server connection or persistent profile data.
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/900.css';
import '../styles.css';
import { BOSS_OPEN_TICKS, BOSS_WARN_TICKS, FT_WAVE, Z_BOSS, Z_BRUTE, Z_FLYER, Z_WALKER,
  ZS_BOSS_BOMB, ZS_BOSS_GATE, ZS_BOSS_OPEN, ZS_BOSS_PULSE, ZS_FLY_WARN, ZS_SPIT, ZS_WALK, Z_GOLEM, Z_RAM, ZS_CHARGE_WARN, ZS_QUAKE,
  ZS_STOMP, ZS_THROW, isBossKind, Z_BOAT, ZS_BOAT, ZS_BOAT_LAND, ZS_HOP, ZS_CLIMB } from '../../shared/fort.ts';
import { WATER_Y } from '../../shared/constants.ts';
import { GATE, WALL_H, buildFort } from '../../shared/fortmap.ts';
import { ZF_CARRY, ZF_CREW, ZF_RAGE, ZF_SHIELD, type ZombieSnap } from '../../shared/fortnet.ts';
import { GOLEM_HOME_Z, QUAKE_R, RAM_HOME_Z, RAM_LANE, ROCK_FLIGHT_TICKS, ROCK_R, STOMP_R } from '../../shared/fortkinds.ts';
import { CollisionWorld } from '../../shared/world.ts';
import { Renderer } from '../render/renderer.ts';
import type { Quality } from '../settings.ts';
import { FortHud } from './hud.ts';
import { FortWorld } from './world.ts';
import { Zombies3D } from './zombies3d.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const map = buildFort();
const world = new FortWorld(renderer, map);
const zombies = new Zombies3D(world.scene, new CollisionWorld(map));
const hud = new FortHud(document.getElementById('hud')!);
const orbit = new OrbitControls(world.camera, canvas);
orbit.enableDamping = true;
orbit.minDistance = 5;
orbit.maxDistance = 65;
orbit.maxPolarAngle = Math.PI * 0.49;
const attack = document.getElementById('attack') as HTMLSelectElement;
const stage = document.getElementById('stage') as HTMLSelectElement;
const quality = document.getElementById('quality') as HTMLSelectElement;
const cycle = document.getElementById('cycle') as HTMLInputElement;
const metrics = document.getElementById('metrics')!;
let elapsed = 0;
let tick = 0;
let previous = performance.now();
let snapshots: ZombieSnap[] = [];
let shield = false;
const extraControls = document.createElement('div');
for (const [label, action] of [
  ['Щит строений', () => { shield = !shield; }],
  ['Западная лестница', () => { world.camera.position.set(-33, 8, 13); orbit.target.set(-20, 2, 1); orbit.update(); }],
  ['Восточная лестница', () => { world.camera.position.set(33, 8, 13); orbit.target.set(20, 2, 1); orbit.update(); }],
  ['Парад врагов', () => { world.camera.position.set(0, 9.5, -15.2); orbit.target.set(0, 0.6, -27.5); orbit.update(); }],
] as const) {
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = label; button.addEventListener('click', action);
  extraControls.append(button);
}
document.getElementById('qa')!.append(extraControls);

function resetCamera() {
  world.camera.position.set(0, 7.8, -7.5);
  orbit.target.set(0, 3, -23);
  orbit.update();
}
function resize() {
  renderer.resize(window.innerWidth, window.innerHeight, Math.min(devicePixelRatio, quality.value === 'low' ? 1 : quality.value === 'medium' ? 1.25 : 2));
  world.resize(window.innerWidth, window.innerHeight);
}
function setQuality() {
  world.setQuality(quality.value as Quality);
  zombies.setQuality(quality.value as Quality);
  resize();
}

/** Парад всех врагов в ряд перед воротами: типы, элита, чемпион, щит, бочка, экипаж */
function lineup(): ZombieSnap[] {
  const list: ZombieSnap[] = [];
  const kinds = [0, 1, 2, 3, 4, 7, 8, 9, 10, 11];
  kinds.forEach((kind, i) => {
    const flags = kind === 7 ? ZF_SHIELD : kind === 9 ? ZF_CARRY : 0;
    list.push({ id: 100 + i, kind, state: ZS_WALK, hp: 1, x: -13.5 + i * 3, y: 0, z: -24, yaw: Math.PI, atk: 0, flags });
  });
  list.push({ id: 120, kind: 0, state: ZS_WALK, hp: 0.7, x: -6, y: 0, z: -30, yaw: Math.PI, atk: 0, flags: 1 });
  list.push({ id: 121, kind: 2, state: ZS_WALK, hp: 1, x: 0, y: 0, z: -31, yaw: Math.PI, atk: 0, flags: 2 });
  list.push({ id: 122, kind: 0, state: ZS_WALK, hp: 1, x: 6, y: 0, z: -30, yaw: Math.PI, atk: 0, flags: ZF_CREW });
  list.push({ id: 123, kind: 8, state: ZS_SPIT, hp: 1, x: 10, y: 0, z: -30, yaw: Math.PI, atk: 0, wind: 30, tx: 4, ty: WALL_H + 0.8, tz: -14.6, r: 1.6 });
  list.push({ id: 124, kind: 5, state: ZS_WALK, hp: 1, x: -10, y: 8, z: -27, yaw: Math.PI, atk: 0 });
  return list;
}

/** Таран и Валун: разбег (дорожка), топот, камень над головой, землетрясение */
function bossAttack(selected: string, rage: boolean): ZombieSnap[] {
  const flags = rage ? ZF_RAGE : 0;
  const base = { id: 1, hp: rage ? 0.4 : 0.85, y: 0, yaw: Math.PI, atk: 0, flags, stage: rage ? 2 : 1 };
  const loop = Math.floor(elapsed * 60) % (BOSS_WARN_TICKS + 30);
  const wind = cycle.checked ? Math.max(0, BOSS_WARN_TICKS - loop) : 54;
  if (selected === 'ram') return [{ ...base, kind: Z_RAM, state: ZS_CHARGE_WARN, x: 0, z: RAM_HOME_Z, wind, tx: 0, ty: 1.5, tz: GATE.face - 2.2, r: RAM_LANE }];
  if (selected === 'stomp') return [{ ...base, kind: Z_RAM, state: ZS_STOMP, x: 0, z: GATE.face - 2.2, wind, tx: 0, ty: 0.8, tz: GATE.face - 2.2, r: STOMP_R }];
  if (selected === 'golem') return [{ ...base, kind: Z_GOLEM, state: ZS_THROW, x: 0, z: GOLEM_HOME_Z, wind: Math.max(ROCK_FLIGHT_TICKS + 1, wind), tx: 5, ty: WALL_H + 0.8, tz: -14.6, r: ROCK_R }];
  return [{ ...base, kind: Z_GOLEM, state: ZS_QUAKE, x: 0, z: GOLEM_HOME_Z, wind, tx: 0, ty: WALL_H + 0.8, tz: -14.6, r: QUAKE_R }];
}

/** Десант: лодка у берега, один прыгает, один на берегу, один лезет на морскую стену; вторая лодка ещё в море */
function landing(): ZombieSnap[] {
  const crew = { kind: 0, hp: 1, yaw: 0, atk: 0, flags: ZF_CREW };
  const sway = Math.sin(elapsed * 2) * 0.5;
  return [
    { id: 300, kind: Z_BOAT, state: ZS_BOAT_LAND, hp: 0.7, x: 12.5, y: WATER_Y, z: 27.5, yaw: 0, atk: 0, stage: 3 },
    { id: 301, kind: Z_BOAT, state: ZS_BOAT, hp: 1, x: -12, y: WATER_Y, z: 60 + sway, yaw: 0, atk: 0, stage: 4 },
    { ...crew, id: 302, state: ZS_HOP, x: 12.2, y: 0.9, z: 25, wind: 20, tx: 12, ty: 0, tz: 22.4 },
    { ...crew, id: 303, state: ZS_WALK, x: 11.4, y: 0, z: 19 },
    { ...crew, id: 304, kind: 3, state: ZS_CLIMB, x: 12.5, y: 1.6, z: 14.5, yaw: Math.PI },
  ];
}

function makeSnapshots(): ZombieSnap[] {
  const selected = attack.value;
  if (selected === 'lineup') return lineup();
  if (selected === 'landing') return landing();
  if (selected === 'ram' || selected === 'stomp' || selected === 'golem' || selected === 'quake') return bossAttack(selected, stage.value === '2');
  const phase = Number(stage.value);
  const isRoof = selected === 'roof';
  const chosen = selected === 'open' ? ZS_BOSS_OPEN : selected === 'pulse' ? ZS_BOSS_PULSE
    : selected === 'bomb' || isRoof ? ZS_BOSS_BOMB : ZS_BOSS_GATE;
  const loop = Math.floor(elapsed * 60) % (BOSS_WARN_TICKS + BOSS_OPEN_TICKS + 60);
  const state = !cycle.checked || selected === 'open' ? chosen : loop < BOSS_WARN_TICKS ? chosen
    : loop < BOSS_WARN_TICKS + BOSS_OPEN_TICKS ? ZS_BOSS_OPEN : ZS_WALK;
  const wind = !cycle.checked || selected === 'open' ? state === ZS_BOSS_OPEN ? 150 : 54 : state === ZS_BOSS_OPEN
    ? BOSS_WARN_TICKS + BOSS_OPEN_TICKS - loop : state === ZS_WALK ? 60 : BOSS_WARN_TICKS - loop;
  const boss: ZombieSnap = { id: 1, kind: Z_BOSS, state, hp: phase === 1 ? 0.85 : 0.4, flags: phase === 2 ? ZF_RAGE : 0,
    x: 0, y: 0, z: -23, yaw: Math.PI, atk: 0, stage: phase, wind,
    tx: isRoof ? -4 : 0, ty: isRoof ? 3.46 : chosen === ZS_BOSS_GATE ? 1.5 : WALL_H + 0.8,
    tz: isRoof ? -17 : chosen === ZS_BOSS_GATE ? GATE.face : -14.6 };
  const enemy = (id: number, kind: number, x: number, y: number, z: number): ZombieSnap =>
    ({ id, kind, state: ZS_WALK, hp: 1, x, y, z, yaw: Math.PI, atk: 0 });
  const list = [enemy(2, Z_BRUTE, 4, 0, -26), enemy(3, Z_WALKER, -3.5, 0, -26),
    { ...enemy(4, Z_FLYER, -7.5, 7.4, -20), state: ZS_FLY_WARN, wind: 36, tx: -7.5, ty: 4.2, tz: -14.6 },
    enemy(5, Z_FLYER, 7, 8.3, -27)];
  if (selected !== 'dead') list.unshift(boss);
  return list;
}

hud.setVisible(true);
hud.pb.setCrosshair(0, false, false);
hud.pb.setAliveUi(false);
hud.setGate(1000, 1600);
hud.setCrystal(2300, 2500);
hud.setPoints(1000);
hud.onShopClose = () => hud.hideShop();
hud.onShopBuy = () => hud.shopMessage('В этом превью нет сервера: покупку проверяют в полной игре.');
document.getElementById('shop')!.addEventListener('click', () => {
  hud.showShop();
  hud.updateShop({ phase: 2, pts: 1000, gate: 1000, crystal: 2300, turrets: 3, jams: 0, mag: false }, 7, 20, null);
});
document.getElementById('reset')!.addEventListener('click', resetCamera);
quality.addEventListener('change', setQuality);
attack.addEventListener('change', () => { elapsed = 0; });
cycle.addEventListener('change', () => { elapsed = 0; });
window.addEventListener('resize', resize);
setQuality();
resetCamera();

const state = () => ({ controlledFixture: true, attack: attack.value, phase: Number(stage.value), quality: quality.value,
  shield, enemies: snapshots.length, boss: snapshots.find((z) => isBossKind(z.kind)) ?? null,
  render: { ...renderer.gl.info.render }, cpuMs: renderer.cpuMs, gpuMs: renderer.gpuMs });
function cam(p: [number, number, number], t: [number, number, number]) {
  world.camera.position.set(...p);
  orbit.target.set(...t);
  orbit.update();
}
(window as unknown as Record<string, unknown>).__fortPreview = { state, cam };

function frame(now: number) {
  const dt = Math.min(0.1, (now - previous) / 1000);
  previous = now;
  elapsed += dt;
  orbit.update();
  snapshots = makeSnapshots();
  zombies.push(++tick, snapshots, snapshots.length);
  zombies.update(tick, dt, now / 1000, world.camera);
  const boss = snapshots.find((z) => isBossKind(z.kind));
  hud.setWave(FT_WAVE, 8, `${snapshots.length} заданных врагов`, false);
  hud.setDefense(FT_WAVE, 6, shield ? 480 : 0, shield ? 1800 : 0);
  world.props.setRally(shield);
  hud.setBoss(boss?.hp ?? 0, boss?.stage ?? 0, boss?.state ?? 0, boss?.wind ?? 0, boss?.kind ?? Z_BOSS, 0, ((boss?.flags ?? 0) & ZF_RAGE) !== 0);
  world.update(dt, world.camera.position);
  renderer.beginFrame(true);
  world.renderScene();
  renderer.endFrame();
  const info = renderer.gl.info.render;
  metrics.textContent = `${quality.value} · ${info.calls} вызовов · ${info.triangles.toLocaleString('ru')} треугольников\nCPU ${renderer.cpuMs.toFixed(1)} мс · GPU ${renderer.gpuMs?.toFixed(1) ?? '—'} мс\nwindow.__fortPreview.state() — данные фикстуры`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
