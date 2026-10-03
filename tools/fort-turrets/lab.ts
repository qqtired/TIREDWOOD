// Стенд башен крепости (агент fort-turrets). Настоящий мир «Старой крепости», башни на 8 местах стен — через Arsenal3D,
// как в игре; бой понарошку: зомби идут по дорогам, башни бьют их теми же вызовами, что и ArsenalClient по событиям
// сервера (bolt / cannon / pour / coals / burn). Пауза и шаг кадра — для снимков.
// URL: ?view=wall|gate|yard|terrace|lineup|spot0…spot7|front0…front7 &t=0,1,2,3,3,2,1,0 &l=1,5,10,1,5,10,1,5
//      &ll=1 (уровень ряда во дворе) &battle=1 &q=high|medium|low &clean=1 (без панелей)
// В консоли / CDP: window.__stand — view(name), towers(t, l), fire(spot?), build(spot?), upgrade(spot?), battle(on),
//   pause(on), step(sec), info(); ряд во дворе (все четыре типа одного уровня) — row(level), lfire(i?), lbuild(i?), lup(i?).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Z_BRUTE, Z_FLYER, Z_RUNNER, Z_WALKER, ZK, ZS_ATTACK, ZS_WALK } from '../../shared/fort.ts';
import { CANNON_SPEED, TAR_TICKS, TOWERS, TOWER_SPOT_COUNT, TW_BALLISTA, TW_BRAZIER, TW_CANNON, TW_TAR } from '../../shared/fortarsenal.ts';
import { ROADS, TOWER_MUZZLE, TOWER_SPOTS, buildFort, insideFort, type TowerSpot } from '../../shared/fortmap.ts';
import type { ZombieSnap } from '../../shared/fortnet.ts';
import { CollisionWorld } from '../../shared/world.ts';
import { Turrets3D } from '../../client/fort/turrets/turrets3d.ts';
import { FortWorld } from '../../client/fort/world.ts';
import { Zombies3D } from '../../client/fort/zombies3d.ts';
import { Effects } from '../../client/render/effects.ts';
import { Renderer } from '../../client/render/renderer.ts';
import type { Quality } from '../../client/settings.ts';

const q = new URLSearchParams(location.search);
if (q.get('clean')) document.body.classList.add('clean');
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const map = buildFort();
const collision = new CollisionWorld(map);
const world = new FortWorld(renderer, map);
const a3 = world.arsenal;
const effects = new Effects(world.scene, collision);
const zombies = new Zombies3D(world.scene, collision);
const camera = world.camera;
const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = false;
orbit.maxPolarAngle = Math.PI * 0.495;

// ------------------------------------------------------------ башни на стенах
const types: number[] = (q.get('t') ?? '0,1,2,3,3,2,1,0').split(',').map(Number);
const levels: number[] = (q.get('l') ?? '1,5,10,1,5,10,1,5').split(',').map(Number);
while (types.length < TOWER_SPOT_COUNT) types.push(-1);
while (levels.length < TOWER_SPOT_COUNT) levels.push(1);
a3.setTowers(types, levels);

function towers(t: number[], l: number[]): void {
  for (let i = 0; i < TOWER_SPOT_COUNT; i++) {
    types[i] = t[i] ?? -1;
    levels[i] = l[i] ?? 1;
  }
  a3.setTowers(types, levels);
  marks();
}

/** ?marks=1 — таблички над местами, как в игре («⚔ ур. 5»): видно, не спорят ли они с вымпелами */
function marks(): void {
  if (!q.get('marks')) return;
  for (const st of map.stations) {
    if (st.kind !== 'tower') continue;
    const t = types[st.arg] ?? -1;
    world.props.setMark(st.id, t < 0 ? '🏰' : TOWERS[t].icon, t < 0 ? 'БАШНЯ' : `ур. ${levels[st.arg]}`);
  }
}
marks();

// ------------------------------------------------------------ виды
const _v = new THREE.Vector3();
const VIEWS: Record<string, [number, number, number, number, number, number]> = {
  // со стены над воротами — как видит защитник из-за плеча
  wall: [1.4, 5.7, -12.4, -6.5, 3.6, -26],
  // ворота: две надвратные башни со двора-хода
  gate: [0, 6.4, -11.2, 0, 4.1, -18.5],
  // со двора вверх на северную стену
  yard: [0, 2.0, -3.5, 0, 4.6, -17],
  // с террасы, общий план
  terrace: [0, 6.6, 9.5, 0, 3.2, -16],
  // ряд всех типов во дворе (уровень — ?ll=, или row(level))
  lineup: [0.9, 2.3, 0.6, 0.1, 1.0, -4.4],
  // тот же ряд спереди-сбоку (как видят враги) и сзади-сбоку (щитки со звёздами — как видят защитники)
  lineupFront: [5.2, 2.6, -8.6, 0.4, 0.9, -4.0],
  lineupBack: [6.8, 2.2, -0.6, 0.6, 1.0, -4.6],
};
for (let i = 0; i < TOWER_SPOT_COUNT; i++) {
  const s = TOWER_SPOTS[i];
  // изнутри крепости, 3/4 сзади-сбоку (так башню видят защитники)
  const sx = -s.nz;
  const sz = s.nx;
  VIEWS[`spot${i}`] = [s.x - s.nx * 3.4 + sx * 1.7, s.y + 2.1, s.z - s.nz * 3.4 + sz * 1.7, s.x, s.y + 1.05, s.z];
  // снаружи, с луга — как башню видят враги
  VIEWS[`front${i}`] = [s.x + s.nx * 7 + sx * 2.2, 1.7, s.z + s.nz * 7 + sz * 2.2, s.x, s.y + 1.0, s.z];
}
const viewSel = document.getElementById('view') as HTMLSelectElement;
for (const k of Object.keys(VIEWS)) viewSel.add(new Option(k, k));
function view(name: string): void {
  const v = VIEWS[name] ?? VIEWS.wall;
  camera.position.set(v[0], v[1], v[2]);
  orbit.target.set(v[3], v[4], v[5]);
  orbit.update();
  viewSel.value = name in VIEWS ? name : 'wall';
  // ряд во дворе — только на своём виде (не мешает сравнению «до/после»)
  if (name.startsWith('lineup')) row(rowLevel);
  else hideRow();
}
viewSel.addEventListener('change', () => view(viewSel.value));

// ------------------------------------------------------------ зомби понарошку
interface SimZ {
  id: number;
  kind: number;
  road: number;
  s: number;
  lane: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  atk: number;
  wait: number;
  atkAt: number;
}
const roads = ROADS.map((r) => {
  const pts = [...r.pts.map(([x, z]) => [x, z] as [number, number]), [0, -17.2] as [number, number]];
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, len, total: len[len.length - 1] };
});
const sim: SimZ[] = [];
let nextId = 1;
let rng = 12345;
const rnd = (): number => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
function spawn(z: SimZ | null, startAnywhere: boolean): SimZ {
  const kinds = [Z_WALKER, Z_WALKER, Z_WALKER, Z_RUNNER, Z_RUNNER, Z_BRUTE, Z_FLYER];
  const kind = kinds[Math.floor(rnd() * kinds.length)];
  const road = Math.floor(rnd() * roads.length);
  const s: SimZ = z ?? { id: 0, kind: 0, road: 0, s: 0, lane: 0, x: 0, y: 0, z: 0, yaw: 0, hp: 1, atk: 0, wait: 0, atkAt: 0 };
  s.id = nextId++;
  s.kind = kind;
  s.road = road;
  s.s = startAnywhere ? rnd() * roads[road].total * 0.9 : 0;
  s.lane = (rnd() - 0.5) * 2.6;
  s.hp = 1;
  s.atk = 0;
  s.wait = 0;
  return s;
}
for (let i = 0; i < 26; i++) sim.push(spawn(null, true));
const snaps: ZombieSnap[] = [];
let battle = q.get('battle') === '1';
let tick = 0;

function placeZ(z: SimZ, time: number): void {
  const r = roads[z.road];
  let i = 1;
  while (i < r.pts.length - 1 && r.len[i] < z.s) i++;
  const [ax, az] = r.pts[i - 1];
  const [bx, bz] = r.pts[i];
  const seg = Math.max(1e-3, r.len[i] - r.len[i - 1]);
  const k = Math.min(1, Math.max(0, (z.s - r.len[i - 1]) / seg));
  const dx = (bx - ax) / seg;
  const dz = (bz - az) / seg;
  const lane = z.lane * Math.min(1, (r.total - z.s) / 6);
  z.x = ax + (bx - ax) * k - dz * lane;
  z.z = az + (bz - az) * k + dx * lane;
  z.yaw = Math.atan2(-dx, -dz);
  z.y = 0;
  if (z.kind === Z_FLYER) {
    z.y = 6.2 + Math.sin(time * 1.3 + z.id) * 0.6;
    z.x += Math.sin(time * 0.7 + z.id) * 2;
  }
}

function stepZombies(dt: number, time: number): void {
  for (const z of sim) {
    const r = roads[z.road];
    const sp = (ZK[z.kind]?.speed ?? 2) * 0.55;
    if (z.s < r.total) z.s = Math.min(r.total, z.s + sp * dt);
    else {
      z.wait += dt;
      if (time > z.atkAt) {
        z.atk++;
        z.atkAt = time + 0.8;
      }
      if (z.wait > 7) spawn(z, false);
    }
    if (z.hp <= 0) spawn(z, false);
    placeZ(z, time);
  }
}

function pushZombies(): void {
  snaps.length = 0;
  for (const z of sim) {
    snaps.push({ id: z.id, kind: z.kind, state: z.wait > 0 ? ZS_ATTACK : ZS_WALK, hp: Math.max(0.05, z.hp), x: z.x, y: z.y, z: z.z, yaw: z.yaw, atk: z.atk });
  }
  zombies.push(++tick, snaps, snaps.length);
}

// ------------------------------------------------------------ башни бьют (как сервер: цели и темп из TOWERS)
const cd = new Array(TOWER_SPOT_COUNT).fill(0.5);
const tarUntil = new Array(TOWER_SPOT_COUNT).fill(0);
const balls: Array<{ at: number; x: number; y: number; z: number }> = [];
const out = new THREE.Vector3();

function pick(spot: number, range: number, minRange: number, air: boolean): SimZ | null {
  const s = TOWER_SPOTS[spot];
  const ox = s.x + s.nx * s.port;
  const oy = s.y + TOWER_MUZZLE;
  const oz = s.z + s.nz * s.port;
  let best: SimZ | null = null;
  let bp = Infinity;
  for (const z of sim) {
    const k = ZK[z.kind] ?? ZK[0];
    const d = Math.hypot(z.x - ox, z.y + k.hcy - oy, z.z - oz);
    if (d >= range || d < minRange) continue;
    if (!air && z.kind === Z_FLYER) continue;
    // бойница смотрит наружу: сзади не стреляет
    if ((z.x - s.x) * s.nx + (z.z - s.z) * s.nz < 0.5) continue;
    const pr = d - (air && z.kind === Z_FLYER ? 100 : 0);
    if (pr < bp) {
      bp = pr;
      best = z;
    }
  }
  return best;
}

function hurt(z: SimZ, frac: number): void {
  z.hp -= frac;
  zombies.hit(z.id);
}

function boom(x: number, y: number, z: number, r: number): void {
  effects.burst(x, y, z, 0xff9a3a, 34, r * 2.2, 0, 1, 0, 0.07);
  effects.burst(x, y, z, 0xffe08a, 18, r * 1.6, 0, 1, 0, 0.05);
  effects.burst(x, y, z, 0x5a4a3a, 22, r * 1.4, 0, 1.2, 0, 0.06);
  effects.puff(x, y + 0.4, z, r * 1.1, 0xe8dcc8, 0.9, 0.9, 0.6, 2.2);
  effects.puff(x, y + 0.2, z, r * 0.6, 0xffb060, 0.3, 0.4, 0.7, 2.8);
  for (const zz of sim) if (Math.hypot(zz.x - x, zz.z - z) < r) hurt(zz, 0.5);
}

/** Выстрел башни на месте i — те же вызовы, что ArsenalClient.onEvent делает по событиям сервера */
function fire(i: number, time: number, force = false): boolean {
  const type = types[i];
  const s = TOWER_SPOTS[i];
  if (type === TW_BALLISTA) {
    const z = pick(i, TOWERS[type].range, 0, true) ?? (force ? sim[0] : null);
    if (!z) return false;
    const y = z.y + (ZK[z.kind]?.hcy ?? 1);
    const m = a3.bolt(i, z.x, y, z.z, out, z.id);
    effects.burst(z.x, y, z.z, 0xd8c39a, 8, 3, 0, 0.5, 0, 0.035);
    void m;
    hurt(z, 0.4);
    return true;
  }
  if (type === TW_CANNON) {
    const z = pick(i, TOWERS[type].range, TOWERS[type].minRange, false) ?? (force ? sim.find((zz) => zz.kind !== Z_FLYER) ?? null : null);
    if (!z) return false;
    const d = Math.hypot(z.x - s.x, z.z - s.z);
    const flight = Math.max(6, Math.round((d / CANNON_SPEED) * 60));
    const m = a3.cannon(i, z.x, z.y, z.z, flight, out);
    effects.puff(m.x, m.y, m.z, 1.6, 0xe8e2d4, 0.9, 0.5, 0.65);
    balls.push({ at: time + flight / 60, x: z.x, y: z.y, z: z.z });
    return true;
  }
  if (type === TW_TAR) {
    if (tarUntil[i] > time && !force) return false;
    let best: SimZ | null = null;
    let bd = 10;
    for (const z of sim) {
      if (z.kind === Z_FLYER || insideFort(z.x, z.z)) continue;
      const d = Math.hypot(z.x - s.x, z.z - s.z);
      if (d < bd) {
        bd = d;
        best = z;
      }
    }
    const x = best ? best.x : s.x + s.nx * 4;
    const zz = best ? best.z : s.z + s.nz * 4;
    if (!best && !force) return false;
    tarUntil[i] = time + TAR_TICKS / 60;
    const m = a3.pour(i, x, zz, out);
    effects.burst(m.x, m.y, m.z, 0x1a120c, 22, 3, 0, -1, 0, 0.07);
    effects.burst(x, 0.3, zz, 0x2a1c12, 26, 4.5, 0, 1, 0, 0.06);
    return true;
  }
  if (type === TW_BRAZIER) {
    let lit = 0;
    for (const z of sim) {
      if (z.kind === Z_FLYER) continue;
      const k = ZK[z.kind] ?? ZK[0];
      if (Math.hypot(z.x - s.x, z.y + k.hcy - (s.y + 1), z.z - s.z) > TOWERS[type].range) continue;
      a3.burn(z.id, 4);
      hurt(z, 0.15);
      lit++;
    }
    if (!lit && !force) return false;
    const m = a3.coals(i, out);
    effects.burst(m.x, m.y, m.z, 0xff8a2a, 30, 7, 0, 0.6, 0, 0.05);
    effects.burst(m.x, m.y, m.z, 0xffd35a, 14, 5, 0, 1, 0, 0.035);
    return true;
  }
  return false;
}

function stepTowers(dt: number, time: number): void {
  for (let i = 0; i < TOWER_SPOT_COUNT; i++) {
    if (types[i] < 0) continue;
    cd[i] -= dt;
    if (cd[i] > 0) continue;
    cd[i] = fire(i, time) ? TOWERS[types[i]].every / 60 : 0.1;
  }
  for (let k = balls.length - 1; k >= 0; k--) {
    const b = balls[k];
    if (time < b.at) continue;
    boom(b.x, b.y + 0.4, b.z, TOWERS[TW_CANNON].radius);
    balls.splice(k, 1);
  }
  let bits = 0;
  for (let i = 0; i < TOWER_SPOT_COUNT; i++) if (tarUntil[i] > time) bits |= 1 << i;
  a3.setTar(bits);
}

// ------------------------------------------------------------ ряд во дворе: все четыре типа одного уровня
let quality = (q.get('q') ?? 'high') as Quality;
const LINEUP: TowerSpot[] = [-3.6, -1.2, 1.2, 3.6].map((x, i) => ({ x, y: 0, z: -4.4, nx: -0.94, nz: -0.34, port: 1, name: `ряд ${i}` }));
let lineup: Turrets3D | null = null;
let rowLevel = Number(q.get('ll') ?? 1);
const ROW_TYPES = [TW_BALLISTA, TW_CANNON, TW_TAR, TW_BRAZIER];
/** Ряд уровня level — сразу, без постройки (есть только на виде lineup: иначе мешал бы сравнению «до/после») */
function row(level: number): void {
  rowLevel = level;
  if (!lineup) lineup = new Turrets3D(world.scene, quality, LINEUP, camera);
  lineup.reset();
  lineup.setAll(ROW_TYPES, [level, level, level, level]);
}
function hideRow(): void {
  lineup?.dispose();
  lineup = null;
}
/** Куда смотрит ряд: влево-вперёд, вниз — как со стены на луг */
const ROW_AIM: [number, number, number] = [-14, -1.5, -10];

// ------------------------------------------------------------ кадр
let time = 0;
let paused = q.get('pause') === '1';
const where = (zid: number, o: THREE.Vector3): boolean => zombies.where(zid, o);
const extras: Array<(dt: number, time: number) => void> = [];

function simulate(dt: number): void {
  time += dt;
  if (battle) {
    stepZombies(dt, time);
    stepTowers(dt, time);
  }
  pushZombies();
  zombies.update(tick, dt, time, camera);
  world.update(dt, camera.position);
  a3.update(dt, camera.position, where);
  if (lineup) {
    for (let i = 0; i < LINEUP.length; i++) lineup.aim(i, ROW_AIM[0] + i * 1.5, ROW_AIM[1], ROW_AIM[2]);
    lineup.update(dt, camera.position, where);
  }
  effects.update(dt);
  for (const f of extras) f(dt, time);
}

function render(): void {
  renderer.beginFrame(false);
  world.renderScene();
  renderer.endFrame();
}

function resize(): void {
  renderer.resize(window.innerWidth, window.innerHeight, Math.min(devicePixelRatio, quality === 'low' ? 1 : 1.5));
  world.resize(window.innerWidth, window.innerHeight);
}

function setQuality(v: Quality): void {
  quality = v;
  world.setQuality(v);
  zombies.setQuality(v);
  lineup?.setQuality(v);
  resize();
}

let last = performance.now();
const note = document.getElementById('note')!;
let noteAt = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  orbit.update();
  if (!paused) simulate(dt);
  render();
  if (now - noteAt > 500) {
    noteAt = now;
    const info = renderer.gl.info.render;
    note.textContent = `${info.calls} вызовов · ${info.triangles.toLocaleString('ru')} треуг. · CPU ${renderer.cpuMs.toFixed(1)} мс\n` +
      `башни: ${types.map((t, i) => (t < 0 ? '—' : `${TOWERS[t].name[0]}${levels[i]}`)).join(' ')}`;
  }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------ кнопки и API для снимков
const all = (f: (i: number) => void, spot?: number): void => {
  if (spot !== undefined) f(spot);
  else for (let i = 0; i < TOWER_SPOT_COUNT; i++) if (types[i] >= 0) f(i);
};
const api = {
  view,
  towers,
  fire: (spot?: number) => all((i) => fire(i, time, true), spot),
  build: (spot?: number) => all((i) => {
    const t = types[i];
    types[i] = -1;
    a3.setTowers(types, levels);
    types[i] = t;
    a3.setTowers(types, levels);
  }, spot),
  upgrade: (spot?: number) => all((i) => {
    levels[i] = Math.min(10, levels[i] + 1);
    a3.setTowers(types, levels);
  }, spot),
  down: (spot?: number) => all((i) => {
    levels[i] = Math.max(1, levels[i] - 1);
    a3.setTowers(types, levels);
  }, spot),
  battle: (on: boolean) => {
    battle = on;
    (document.getElementById('battle') as HTMLInputElement).checked = on;
  },
  pause: (on: boolean) => {
    paused = on;
  },
  step: (sec: number) => {
    const n = Math.max(1, Math.round(sec * 60));
    for (let k = 0; k < n; k++) simulate(1 / 60);
    render();
    return time;
  },
  quality: setQuality,
  row,
  lfire: (i?: number) => {
    for (let k = 0; k < LINEUP.length; k++) {
      if (i !== undefined && i !== k) continue;
      // котёл льёт себе под ноги, как со стены к её подножию; остальные бьют вдаль
      const s = LINEUP[k];
      if (ROW_TYPES[k] === TW_TAR) lineup?.fire(k, s.x + s.nx * 2.6, 0, s.z + s.nz * 2.6, out);
      else lineup?.fire(k, ROW_AIM[0] + k * 1.5, ROW_AIM[1], ROW_AIM[2], out);
    }
  },
  lbuild: (i?: number) => {
    for (let k = 0; k < LINEUP.length; k++) if (i === undefined || i === k) lineup?.build(k);
  },
  lup: () => {
    rowLevel = Math.min(10, rowLevel + 1);
    lineup?.setAll(ROW_TYPES, [rowLevel, rowLevel, rowLevel, rowLevel]);
  },
  info: () => ({
    calls: renderer.gl.info.render.calls, triangles: renderer.gl.info.render.triangles, cpu: renderer.cpuMs, time, types, levels,
    turrets: (a3 as { turrets?: Turrets3D }).turrets?.info ?? null, row: lineup?.info ?? null,
  }),
  /** Замер: n кадров по 1/60 с — среднее время обновления мира и отрисовки (мс) и вызовы */
  bench: (n = 120) => {
    let sim = 0;
    let ren = 0;
    for (let k = 0; k < n; k++) {
      const t0 = performance.now();
      simulate(1 / 60);
      const t1 = performance.now();
      render();
      const t2 = performance.now();
      sim += t1 - t0;
      ren += t2 - t1;
    }
    return { sim: +(sim / n).toFixed(3), render: +(ren / n).toFixed(3), calls: renderer.gl.info.render.calls, triangles: renderer.gl.info.render.triangles };
  },
  a3,
  get lineup() {
    return lineup;
  },
  world,
  extras,
};
(window as unknown as Record<string, unknown>).__stand = api;

document.getElementById('fire')!.addEventListener('click', () => api.fire());
document.getElementById('build')!.addEventListener('click', () => api.build());
document.getElementById('up')!.addEventListener('click', () => api.upgrade());
document.getElementById('down')!.addEventListener('click', () => api.down());
document.getElementById('battle')!.addEventListener('change', (e) => api.battle((e.target as HTMLInputElement).checked));
document.getElementById('pause')!.addEventListener('click', () => api.pause(!paused));
const qSel = document.getElementById('quality') as HTMLSelectElement;
qSel.value = quality;
qSel.addEventListener('change', () => setQuality(qSel.value as Quality));
(document.getElementById('battle') as HTMLInputElement).checked = battle;
window.addEventListener('resize', resize);
setQuality(quality);
view(q.get('view') ?? 'wall');
for (const z of sim) placeZ(z, 0);
requestAnimationFrame(frame);
void _v;
