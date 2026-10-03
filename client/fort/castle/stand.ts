// Стенд замка крепости (только разработка, /tools/fort-castle/): настоящий мир крепости без сервера, орбитальная камера,
// ворота во всех состояниях (открыты, прочность, сломаны, укрепление, удар, ремонт), босс в проёме ворот, замер
// вызовов отрисовки и треугольников. window.__castle — для снимков из headless Chrome.
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ZS_WALK, Z_BOSS, Z_GOLEM, Z_RAM, Z_WALKER } from '../../../shared/fort.ts';
import { GATE, buildFort } from '../../../shared/fortmap.ts';
import type { ZombieSnap } from '../../../shared/fortnet.ts';
import { CollisionWorld } from '../../../shared/world.ts';
import { Renderer } from '../../render/renderer.ts';
import type { Quality } from '../../settings.ts';
import { FortWorld } from '../world.ts';
import { Zombies3D } from '../zombies3d.ts';
import { gatePress } from './layout.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const map = buildFort();
const world = new FortWorld(renderer, map);
const zombies = new Zombies3D(world.scene, new CollisionWorld(map));
const orbit = new OrbitControls(world.camera, canvas);
orbit.enableDamping = true;
orbit.maxPolarAngle = Math.PI * 0.495;
const $ = (id: string) => document.getElementById(id) as HTMLInputElement;
const metrics = document.getElementById('metrics')!;
const params = new URLSearchParams(location.search);
if (params.has('clean')) document.getElementById('qa')!.classList.add('hide');

/** Что задано на стенде: ворота, ступени, босс */
const st = { open: 0, hp: 1, broken: false, tier: 0, ctier: 0, boss: -1 as number, bossZ: -30, bossT: 0, bossStop: 99, cycle: false, cycleT: 0 };
let tick = 0;
let elapsed = 0;
let previous = performance.now();

const castle = world.castle;

function apply(instant = false): void {
  castle.setTiers(st.tier, st.ctier);
  castle.gate.set(st.open, st.hp, st.broken, instant);
  world.props.setGate(st.broken ? 0 : 1);
}

function cam(p: [number, number, number], t: [number, number, number]): void {
  world.camera.position.set(...p);
  orbit.target.set(...t);
  orbit.update();
}

const CAMS: Record<string, [[number, number, number], [number, number, number]]> = {
  // со стены: игрок на северной стене у западного бастиона смотрит на ворота и дорогу
  wall: [[-8.5, 5.4, -13.6], [0, 1.6, -24]],
  // снаружи на подходе: с дороги, метров 30 до ворот
  out: [[9, 3.2, -46], [0, 3.4, -15]],
  // двор: с террасы на ворота
  yard: [[3, 4.4, 9.5], [0, 2.2, -12]],
  gate: [[3.2, 2.2, -24.5], [0, 1.9, -16]],
  gin: [[2.6, 2.3, -7.5], [0, 1.8, -15]],
  high: [[30, 26, -48], [0, 0, -2]],
};

function setCam(name: string): void {
  const c = CAMS[name];
  if (c) cam(c[0], c[1]);
}

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-cam]')) b.addEventListener('click', () => setCam(b.dataset.cam!));
for (const id of ['open', 'hp', 'tier', 'ctier']) {
  $(id).addEventListener('input', () => {
    (st as Record<string, unknown>)[id] = Number($(id).value);
    apply();
  });
}
$('broken').addEventListener('change', () => {
  st.broken = $('broken').checked;
  apply();
});
document.getElementById('hit')!.addEventListener('click', () => hit());
document.getElementById('repair')!.addEventListener('click', () => {
  st.broken = false;
  st.hp = Math.min(1, st.hp + 0.25);
  apply();
  castle.gate.repair();
});
document.getElementById('boss')!.addEventListener('click', () => {
  // в игре босс идёт во двор, только когда ворота пали
  st.broken = true;
  $('broken').checked = true;
  apply();
  boss(Z_BOSS);
});
document.getElementById('cycle')!.addEventListener('click', () => {
  st.cycle = !st.cycle;
  st.cycleT = 0;
});

function hit(power = 1): void {
  castle.gate.hit(power);
}

/** Босс идёт по дороге к воротам и дальше во двор (z растёт) */
function boss(kind: number, z = -34, stop = 99): void {
  st.boss = kind;
  st.bossZ = z;
  st.bossT = 0;
  st.bossStop = stop;
}

function snaps(dt: number): ZombieSnap[] {
  const list: ZombieSnap[] = [];
  if (st.boss >= 0) {
    // идёт к воротам; у входа в «горло» (stop) встаёт — там ему как раз хватает места под надвратной башней
    if (st.bossZ < st.bossStop) st.bossZ = Math.min(st.bossStop, st.bossZ + dt * 2.4);
    else st.bossT += dt;
    if (st.bossZ > 4) st.boss = -1;
    else list.push({ id: 1, kind: st.boss, state: ZS_WALK, hp: 1, x: 0, y: 0, z: st.bossZ, yaw: Math.PI, atk: 0, flags: 0, stage: 1 });
  }
  castle.gate.squeeze(st.boss >= 0 ? gatePress(0, st.bossZ) : 0);
  if (params.has('crowd')) {
    for (let i = 0; i < 8; i++) list.push({ id: 10 + i, kind: Z_WALKER, state: 1, hp: 1, x: -2 + (i % 4) * 1.3, y: 0, z: GATE.face - 1.2 - Math.floor(i / 4) * 1.1, yaw: Math.PI, atk: Math.floor(elapsed * 2 + i), flags: 0 });
  }
  return list;
}

function resize(): void {
  renderer.resize(window.innerWidth, window.innerHeight, Math.min(devicePixelRatio, 2));
  world.resize(window.innerWidth, window.innerHeight);
}

function setQuality(q: Quality): void {
  world.setQuality(q);
  zombies.setQuality(q);
}

window.addEventListener('resize', resize);
resize();
setQuality((params.get('q') as Quality) || 'high');
setCam(params.get('cam') ?? 'wall');
apply(true);

let last = { calls: 0, triangles: 0, points: 0, lines: 0 };
const state = () => ({ st: { ...st }, render: last, cpuMs: renderer.cpuMs, gpuMs: renderer.gpuMs, gate: castle.gate.info(),
  castleTris: castle.triangles, particles: castle.fx.alive, meshes: countMeshes() });
function countMeshes(): { meshes: number; instanced: number; instances: number; sprites: number } {
  let meshes = 0;
  let instanced = 0;
  let instances = 0;
  let sprites = 0;
  world.scene.traverseVisible((o) => {
    const m = o as unknown as { isMesh?: boolean; isInstancedMesh?: boolean; isSprite?: boolean; count?: number };
    if (m.isInstancedMesh) {
      instanced++;
      instances += m.count ?? 0;
    } else if (m.isMesh) meshes++;
    else if (m.isSprite) sprites++;
  });
  return { meshes, instanced, instances, sprites };
}

(window as unknown as Record<string, unknown>).__castle = {
  world, zombies, renderer, state, cam, setCam, hit, boss, apply, castle,
  breach: () => castle.gate.breach(),
  rumble: () => castle.gate.rumble(),
  set(o: Partial<typeof st>, instant = false) {
    Object.assign(st, o);
    apply(instant);
  },
  kinds: { Z_BOSS, Z_RAM, Z_GOLEM },
};

function frame(now: number): void {
  const dt = Math.min(0.1, (now - previous) / 1000);
  previous = now;
  elapsed += dt;
  orbit.update();
  if (st.cycle) {
    // цикл: закрыты → открываются → открыты → закрываются
    st.cycleT += dt;
    const k = (st.cycleT % 6) / 6;
    st.open = k < 0.15 ? 0 : k < 0.5 ? 1 : k < 0.65 ? 1 : 0;
    apply();
  }
  const list = snaps(dt);
  zombies.push(++tick, list, list.length);
  zombies.update(tick, dt, now / 1000, world.camera);
  world.update(dt, world.camera.position);
  renderer.beginFrame(true);
  world.renderScene();
  renderer.endFrame();
  const info = renderer.gl.info.render;
  last = { calls: info.calls, triangles: info.triangles, points: info.points, lines: info.lines };
  metrics.textContent = `${info.calls} вызовов · ${info.triangles.toLocaleString('ru')} треуг.\nCPU ${renderer.cpuMs.toFixed(1)} мс · GPU ${renderer.gpuMs?.toFixed(1) ?? '—'} мс`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
