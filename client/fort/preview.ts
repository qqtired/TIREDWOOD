// Controlled rendering fixture. No Net/App instance, server connection or persistent profile data.
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/900.css';
import '../styles.css';
import { BOSS_OPEN_TICKS, BOSS_WARN_TICKS, FT_BREAK, FT_END, FT_GATHER, FT_WAVE, Z_BOSS, Z_BRUTE, Z_CLIMBER, Z_FLYER, Z_WALKER,
  ZS_BOSS_BOMB, ZS_BOSS_GATE, ZS_BOSS_OPEN, ZS_BOSS_PULSE, ZS_CLIMB, ZS_FLY_WARN, ZS_WALK, type FortResultRow } from '../../shared/fort.ts';
import { crystalMax, gateMax } from '../../shared/fortarsenal.ts';
import { makeArsenalRow, shopRows } from '../../shared/fortarsenal.ts';
import { GATE, WALL_H, buildFort } from '../../shared/fortmap.ts';
import type { ZombieSnap } from '../../shared/fortnet.ts';
import { CollisionWorld } from '../../shared/world.ts';
import { Renderer } from '../render/renderer.ts';
import type { Quality } from '../settings.ts';
import { TOUCH } from '../touch.ts';
import { FortHud } from './hud.ts';
import { FortWorld } from './world.ts';
import { Zombies3D } from './zombies3d.ts';

// как в игре (app.ts): на сенсорном экране — раскладка для телефона
document.documentElement.classList.toggle('touch', TOUCH);
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
const uiMode = document.getElementById('ui') as HTMLSelectElement;
const stage = document.getElementById('stage') as HTMLSelectElement;
const quality = document.getElementById('quality') as HTMLSelectElement;
const cycle = document.getElementById('cycle') as HTMLInputElement;
const metrics = document.getElementById('metrics')!;
let elapsed = 0;
let tick = 0;
let previous = performance.now();
let snapshots: ZombieSnap[] = [];
let shield = false;
let towers = false;
const extraControls = document.createElement('div');
for (const [label, action] of [
  ['Щит строений', () => { shield = !shield; }],
  ['Западная лестница', () => { world.camera.position.set(-29, 6.5, 5); orbit.target.set(-18, 2.4, -1); orbit.update(); }],
  ['Восточная лестница', () => { world.camera.position.set(29, 6.5, 5); orbit.target.set(18, 2.4, -1); orbit.update(); }],
  ['Лавка', () => { world.camera.position.set(5.2, 5.4, 3.4); orbit.target.set(8, 3, 9.6); orbit.update(); }],
  ['Башни', () => {
    // все четыре вида по кругу, уровни 1–4: как выглядят на стенах
    towers = !towers;
    world.arsenal.setTowers(towers ? [0, 1, 2, 3, 3, 2, 1, 0] : [-1, -1, -1, -1, -1, -1, -1, -1], [1, 2, 3, 4, 1, 2, 3, 4]);
  }],
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
hud.stall.onClose = () => hud.stall.close();
hud.stall.onBuy = () => hud.stall.message('В этом превью нет сервера: покупку проверяют в полной игре.', true);
document.getElementById('shop')!.addEventListener('click', () => {
  const row = { ...makeArsenalRow(), g: 1000, gr: 2 };
  row.lv = [2, 1, 0, 0, 0];
  hud.stall.open('shop', 'Лавка оружейника', 'Превью · без сервера');
  hud.stall.render(shopRows({ wave: 7, calm: true, row }), row.g, null);
});
document.getElementById('reset')!.addEventListener('click', resetCamera);

// ------------------------------------------------------------ новый интерфейс (client/fort/ui): заданные сцены
const team = [
  { id: 1, name: 'Tester5', gold: 1240, alive: true, me: true, ready: true },
  { id: 2, name: 'Роман', gold: 2310, alive: true, me: false, ready: true },
  { id: 3, name: 'Лиса', gold: 860, alive: false, me: false, ready: false },
  { id: 4, name: 'Пончик', gold: 1975, alive: true, me: false, ready: false },
];
const results: FortResultRow[] = [
  { id: 2, name: 'Роман', k: 412, d: 3, pts: 9840, waves: 8, tokens: 64 },
  { id: 1, name: 'Tester5', k: 355, d: 5, pts: 8120, waves: 8, tokens: 58 },
  { id: 4, name: 'Пончик', k: 297, d: 2, pts: 7010, waves: 8, tokens: 52 },
  { id: 3, name: 'Лиса', k: 188, d: 9, pts: 4400, waves: 6, tokens: 31 },
];
let uiAt = 0;
let gold = 1240;
function startUi(): void {
  uiAt = elapsed;
  hud.ui.reset();
  hud.hideEnd();
  const m = uiMode.value;
  if (m !== 'coach') hud.ui.coach.skip();
  if (m === 'down') hud.showDeath('Плевок попал — уходи с красной метки');
  else hud.pb.hideDeath();
  if (m === 'fight') {
    hud.ui.waveStart(6);
    hud.alert('🚪 Ворота трещат!', 60000, { target: 'gate' });
  } else if (m === 'break') {
    hud.ui.cleared(6, 168, 50, true);
  } else if (m === 'boss' || m === 'down') {
    hud.ui.waveStart(8);
    hud.alert('Залп Барона · уйди с красной метки', 60000, { timed: true });
  } else if (m === 'kraken') {
    hud.ui.push({ key: 'kraken', badge: '🐙', tone: 'super', prio: 1, ms: 60000, title: 'Кракен поднимается из моря!', sub: 'Сначала щупальца — потом голова · не стойте у воды' });
  } else if (m === 'gate') {
    hud.pb.centerMessage('Ворота пали!', 'Зомби во дворе — защищайте кристалл', '#ff8a6a', 60000);
    hud.alert('🚪 Ворота пали — все к кристаллу!', 60000, { target: 'crystal' });
  } else if (m === 'coach') {
    hud.ui.coach.restart();
  } else if (m === 'win' || m === 'lose') {
    const win = m === 'win';
    hud.showEnd(win, win ? 8 : 5, results[0], results, 1);
    hud.showReward(`+58 жетонов: волны ${win ? 8 : 5} · +40 · сбитые +12 · лучший +6`);
  }
}
uiMode.addEventListener('change', startUi);
/** Кадр интерфейса по выбранной сцене; угрозы — вокруг камеры превью, чтобы стрелки встали у краёв */
function uiFrame(): void {
  const m = uiMode.value;
  const t = elapsed - uiAt;
  const phase = m === 'break' ? FT_BREAK : m === 'coach' ? FT_GATHER : m === 'win' || m === 'lose' ? FT_END : FT_WAVE;
  const wave = m === 'break' ? 7 : m === 'boss' || m === 'down' || m === 'kraken' ? 8 : 6;
  if (m === 'down') hud.pb.setRespawn(5 - (t % 5));
  if (m === 'fight' && Math.floor(t * 2) % 3 === 0) gold += 3;
  const threats: ZombieSnap[] = m === 'fight' || m === 'gate' ? [
    { id: 30, kind: Z_CLIMBER, state: ZS_CLIMB, hp: 1, x: -19, y: 1.5, z: -6, yaw: 0, atk: 0 },
    { id: 31, kind: Z_CLIMBER, state: ZS_CLIMB, hp: 1, x: 19, y: 1.5, z: -4, yaw: 0, atk: 0 },
    { id: 32, kind: Z_FLYER, state: ZS_FLY_WARN, hp: 1, x: 0, y: 8, z: 8, yaw: 0, atk: 0 },
  ] : [];
  hud.ui.frame({
    phase, wave, leftS: phase === FT_WAVE ? 0 : Math.max(0, 20 - t), enemies: phase === FT_WAVE ? Math.max(4, 57 - Math.floor(t * 1.5)) : 0,
    gold, gate: m === 'gate' ? 0 : m === 'fight' ? 520 * 1.5 : 1000, gateMax: gateMax(2), gateTier: 2,
    crystal: m === 'gate' ? 1900 : 2300, crystalMax: crystalMax(1), crystalTier: 1,
    me: { x: world.camera.position.x, y: 3.4, z: world.camera.position.z, yaw: Math.atan2(-(orbit.target.x - world.camera.position.x), -(orbit.target.z - world.camera.position.z)), alive: m !== 'down' },
    team: m === 'down' ? team.map((r) => (r.me ? { ...r, alive: false } : r)) : team, zombies: threats, camera: world.camera, width: window.innerWidth, height: window.innerHeight,
  });
  if (m === 'kraken') {
    hud.ui.boss.set({ frac: 0.62, stage: 2, state: Math.floor(t / 3) % 2 ? ZS_BOSS_OPEN : 0, wind: 150 - ((t * 60) % 180), kind: Z_BOSS, tier: 1, rage: false,
      name: 'Кракен', super: true, parts: [{ label: 'Щупальце', frac: 0 }, { label: 'Щупальце', frac: 0.35 }, { label: 'Щупальце', frac: 0.8 }, { label: 'Щупальце', frac: 1 }, { label: 'Голова', frac: 0.62 }] });
  } else if (m !== 'boss' && m !== 'down') {
    hud.setBoss(0, 0, 0, 0);
  }
}
quality.addEventListener('change', setQuality);
attack.addEventListener('change', () => { elapsed = 0; if (attack.value === 'pulse' && stage.value === '1') stage.value = '2'; });
stage.addEventListener('change', () => { if (attack.value === 'pulse' && stage.value === '1') stage.value = '2'; });
cycle.addEventListener('change', () => { elapsed = 0; });
window.addEventListener('resize', resize);
setQuality();
resetCamera();
startUi();

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
  uiFrame();
  world.update(dt, world.camera.position);
  world.arsenal.update(dt, world.camera.position, () => false);
  renderer.beginFrame(true);
  world.renderScene();
  renderer.endFrame();
  const info = renderer.gl.info.render;
  metrics.textContent = `${quality.value} · ${info.calls} вызовов · ${info.triangles.toLocaleString('ru')} треугольников\nCPU ${renderer.cpuMs.toFixed(1)} мс · GPU ${renderer.gpuMs?.toFixed(1) ?? '—'} мс\nwindow.__fortPreview.state() — данные фикстуры`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
