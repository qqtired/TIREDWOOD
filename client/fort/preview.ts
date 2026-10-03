// Controlled rendering fixture. No Net/App instance, server connection or persistent profile data.
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/900.css';
import '../styles.css';
import { BOSS_OPEN_TICKS, BOSS_WARN_TICKS, FT_WAVE, Z_BOSS, Z_BRUTE, Z_FLYER, Z_WALKER,
  ZS_BOSS_BOMB, ZS_BOSS_GATE, ZS_BOSS_OPEN, ZS_BOSS_PULSE, ZS_FLY_WARN, ZS_WALK } from '../../shared/fort.ts';
import { GATE, WALL_H, buildFort } from '../../shared/fortmap.ts';
import type { ZombieSnap } from '../../shared/fortnet.ts';
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

function makeSnapshots(): ZombieSnap[] {
  const selected = attack.value;
  const phase = Number(stage.value);
  const isRoof = selected === 'roof';
  const chosen = selected === 'open' ? ZS_BOSS_OPEN : selected === 'pulse' ? ZS_BOSS_PULSE
    : selected === 'bomb' || isRoof ? ZS_BOSS_BOMB : ZS_BOSS_GATE;
  const loop = Math.floor(elapsed * 60) % (BOSS_WARN_TICKS + BOSS_OPEN_TICKS + 60);
  const state = !cycle.checked || selected === 'open' ? chosen : loop < BOSS_WARN_TICKS ? chosen
    : loop < BOSS_WARN_TICKS + BOSS_OPEN_TICKS ? ZS_BOSS_OPEN : ZS_WALK;
  const wind = !cycle.checked || selected === 'open' ? state === ZS_BOSS_OPEN ? 150 : 54 : state === ZS_BOSS_OPEN
    ? BOSS_WARN_TICKS + BOSS_OPEN_TICKS - loop : state === ZS_WALK ? 60 : BOSS_WARN_TICKS - loop;
  const boss: ZombieSnap = { id: 1, kind: Z_BOSS, state, hp: phase === 1 ? 1 : phase === 2 ? 0.6 : 0.3,
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
attack.addEventListener('change', () => { elapsed = 0; if (attack.value === 'pulse' && stage.value === '1') stage.value = '2'; });
stage.addEventListener('change', () => { if (attack.value === 'pulse' && stage.value === '1') stage.value = '2'; });
cycle.addEventListener('change', () => { elapsed = 0; });
window.addEventListener('resize', resize);
setQuality();
resetCamera();

const state = () => ({ controlledFixture: true, attack: attack.value, phase: Number(stage.value), quality: quality.value,
  shield, enemies: snapshots.length, boss: snapshots.find((z) => z.kind === Z_BOSS) ?? null,
  render: { ...renderer.gl.info.render }, cpuMs: renderer.cpuMs, gpuMs: renderer.gpuMs });
(window as unknown as Record<string, unknown>).__fortPreview = { state };

function frame(now: number) {
  const dt = Math.min(0.1, (now - previous) / 1000);
  previous = now;
  elapsed += dt;
  orbit.update();
  snapshots = makeSnapshots();
  zombies.push(++tick, snapshots, snapshots.length);
  zombies.update(tick, dt, now / 1000, world.camera);
  const boss = snapshots.find((z) => z.kind === Z_BOSS);
  hud.setWave(FT_WAVE, 8, `${snapshots.length} заданных врагов`, false);
  hud.setDefense(FT_WAVE, 6, shield ? 480 : 0, shield ? 1800 : 0);
  world.props.setRally(shield);
  hud.setBoss(boss?.hp ?? 0, boss?.stage ?? 0, boss?.state ?? 0, boss?.wind ?? 0);
  world.update(dt, world.camera.position);
  renderer.beginFrame(true);
  world.renderScene();
  renderer.endFrame();
  const info = renderer.gl.info.render;
  metrics.textContent = `${quality.value} · ${info.calls} вызовов · ${info.triangles.toLocaleString('ru')} треугольников\nCPU ${renderer.cpuMs.toFixed(1)} мс · GPU ${renderer.gpuMs?.toFixed(1) ?? '—'} мс\nwindow.__fortPreview.state() — данные фикстуры`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
