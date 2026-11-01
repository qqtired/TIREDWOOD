// Стенд моделей пакета «Т-идеи» крепости: настоящий мир крепости (FortWorld — небо, море, замок, свет и тени игры).
// Шапки ремёсел на четырёх желейках и вешалка — на открытом месте северного двора (у RACK тесно для камеры);
// золотой краб на своём маршруте вдоль западной стены (x = −25, к морю);
// пять тяжёлых мобов во дворе спиной к камере, шары слабых мест — из weakSpotWorld (как у сервера и прицела).
// Модели — те же файлы, что в игре. window.__models — для снимков из headless Chrome.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DEFAULT_OUTFIT, type Outfit } from '../../../shared/outfit.ts';
import { E_ALIVE, E_GROUNDED } from '../../../shared/protocol.ts';
import { buildFort } from '../../../shared/fortmap.ts';
import { ZS_ATTACK } from '../../../shared/fort.ts';
import { ZF_SHIELD } from '../../../shared/fortnet.ts';
import { ZK, Z_ARMORED, Z_BRUTE, Z_SHIELD } from '../../../shared/fortkinds.ts';
import { CRAFTS, ZS_CRAB_DIVE } from '../../../shared/fortideas.ts';
import { WEAK_SPOTS, weakSpotWorld } from '../../../shared/fortweak.ts';
import { Avatar, tickAvatarShared, type AvatarPose } from '../../../client/render/avatar.ts';
import { Renderer } from '../../../client/render/renderer.ts';
import { wearOf } from '../../../client/render/outfit3d.ts';
import { FortWorld } from '../../../client/fort/world.ts';
import { buildPreview, type MobAnim, type MobDef } from '../../../client/fort/mobs/kit.ts';
import { mobRoot } from '../../../client/fort/mobs/renderer.ts';
import { GOLD_CRAB } from '../../../client/fort/mobs/gold-crab.ts';
import { BRUTE_TROLL } from '../../../client/fort/mobs/brute-troll.ts';
import { BRUTE_BEAR } from '../../../client/fort/mobs/brute-bear.ts';
import { ARMORED_ARMADILLOS } from '../../../client/fort/mobs/armored-armadillo.ts';
import { shieldTurtle } from '../../../client/fort/mobs/shield-turtle.ts';
import { shieldBeaver } from '../../../client/fort/mobs/shield-beaver.ts';
import { createCraftRack, craftRackTris } from '../../../client/fort/ideas/models/rack3d.ts';

type Tab = 'hats' | 'crab' | 'weak';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const params = new URLSearchParams(location.search);

const renderer = new Renderer(canvas);
const world = new FortWorld(renderer, buildFort());
const scene = world.scene;
const camera = world.camera;
camera.fov = 50;
const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;
orbit.maxPolarAngle = Math.PI * 0.495;
orbit.minDistance = 1.2;
orbit.maxDistance = 40;
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

function triCount(g: THREE.BufferGeometry | null | undefined): number {
  return g ? (g.index ? g.index.count : g.getAttribute('position').count) / 3 : 0;
}
function defTris(d: MobDef): number {
  return d.parts.reduce((s, p) => s + triCount(p.geo), 0);
}
function anim(o: Partial<MobAnim> = {}): MobAnim {
  return { t: 0, gait: 0, path: 0, speed: 0, st: 0, stT: 0, hit: 0, die: 0, seed: 0.5, rage: false, flags: 0, flagT: 99, stage: 0, atkT: 99, ...o };
}

// ------------------------------------------------------------ Т-4: желейки в шапках и вешалка

const GROUND = { groundBelow: (): number => 0 };
/** Вешалка и желейки на стенде — в открытой северной части двора, лицом к югу; в игре вешалка — у RACK (shared/fortideas.ts) */
const HAT_SPOT = { x: -3.4, z: -10.5 };
const rack = createCraftRack();
rack.position.set(HAT_SPOT.x, 0, HAT_SPOT.z);
scene.add(rack);
interface Guy { a: Avatar; pose: AvatarPose; home: THREE.Vector3; hat: string }
const guys: Guy[] = [];
// цвета желеек — контрастные к шапкам: голубая, молочная, мятная, лимонная
const COLORS = [8, 15, 6, 4];
CRAFTS.forEach((c, i) => {
  const a = new Avatar(i + 1, { voice: false });
  a.setOutfit({ ...DEFAULT_OUTFIT, c: COLORS[i], h: c.hat } as Outfit);
  a.setInfo('', null, false, 1);
  a.addTo(scene);
  const home = new THREE.Vector3(HAT_SPOT.x - 6.4 + i * 1.6, 0, HAT_SPOT.z + 0.5);
  guys.push({ a, pose: { x: home.x, y: 0, z: home.z, yaw: Math.PI, pitch: 0, flags: E_ALIVE | E_GROUNDED }, home, hat: c.hat });
});
for (const c of CRAFTS) {
  const w = wearOf('h', c.hat);
  const el = document.getElementById(`t-${c.hat}`);
  if (el) el.textContent = (triCount(w.geo) + triCount(w.metal) + triCount(w.glow)).toLocaleString('ru');
}
$('t-rack').textContent = craftRackTris().toLocaleString('ru');

// ------------------------------------------------------------ Т-16: золотой краб

const crab = buildPreview(GOLD_CRAB);
crab.group.matrixAutoUpdate = false;
scene.add(crab.group);
$('t-crab').textContent = defTris(GOLD_CRAB).toLocaleString('ru');
const CRAB_X = -25;
const CRAB_V = 70 / 20;
const crabA = anim({ seed: 0.4 });
const crabPos = new THREE.Vector3(CRAB_X, 0, 4);
let crabGait = 0;
let crabHit = 0;
let crabFlash = 0;
let crabHitAcc = 0;

// монеты от краба при попадании (на стенде — для понимания; в игре их рисует интерфейс)
const COINS = 60;
const coinMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 12), new THREE.MeshStandardMaterial({ color: 0xffcf4a, metalness: 0.6, roughness: 0.3, emissive: 0x6a4a00 }), COINS);
coinMesh.count = 0;
coinMesh.frustumCulled = false;
scene.add(coinMesh);
interface Coin { p: THREE.Vector3; v: THREE.Vector3; age: number; spin: number }
const coins: Coin[] = [];
function coinBurst(at: THREE.Vector3, n: number): void {
  for (let i = 0; i < n && coins.length < COINS; i++) {
    const a = Math.random() * Math.PI * 2;
    coins.push({ p: at.clone(), v: new THREE.Vector3(Math.cos(a) * 1.6, 3.2 + Math.random() * 1.5, Math.sin(a) * 1.6), age: 0, spin: Math.random() * 10 });
  }
}
function stepCoins(dt: number): void {
  let n = 0;
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    c.age += dt;
    if (c.age > 1.1) {
      coins.splice(i, 1);
      continue;
    }
    c.v.y -= 9.8 * dt;
    c.p.addScaledVector(c.v, dt);
    _m.makeRotationX(c.age * 12 + c.spin).setPosition(c.p);
    coinMesh.setMatrixAt(n++, _m);
  }
  coinMesh.count = n;
  coinMesh.instanceMatrix.needsUpdate = true;
}

// ------------------------------------------------------------ Т-23: пять тяжёлых со слабыми местами

interface Heavy { def: MobDef; kind: number; view: ReturnType<typeof buildPreview>; x: number; z: number; a: MobAnim; sphere: THREE.Mesh; ring: THREE.LineSegments; flash: number }
const HEAVY: Array<[MobDef, number, string]> = [
  [BRUTE_TROLL, Z_BRUTE, 'бочонок на раме'],
  [BRUTE_BEAR, Z_BRUTE, 'бочонок на лямках'],
  [ARMORED_ARMADILLOS[0], Z_ARMORED, 'вентиль на латах'],
  [shieldTurtle, Z_SHIELD, 'ремень с пряжкой'],
  [shieldBeaver, Z_SHIELD, 'ремень с пряжкой'],
];
const sphereMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.32, depthWrite: false });
const ringMat = new THREE.LineBasicMaterial({ color: 0xff6a10, transparent: true, opacity: 0.9 });
const sphereGeo = new THREE.SphereGeometry(1, 20, 14);
const ringGeo = new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 12, 8));
const heavy: Heavy[] = HEAVY.map(([def, kind], i) => {
  const view = buildPreview(def);
  view.group.matrixAutoUpdate = false;
  scene.add(view.group);
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  const ring = new THREE.LineSegments(ringGeo, ringMat);
  sphere.renderOrder = 6;
  ring.renderOrder = 7;
  scene.add(sphere, ring);
  return { def, kind, view, x: -8.2 + i * 3.0, z: -7.5, a: anim({ seed: 0.5, flags: kind === Z_SHIELD ? ZF_SHIELD : 0 }), sphere, ring, flash: 0 };
});
let heavyScale = 1;
let showSpheres = true;
const HEAVY_YAW = 0; // лицом к −Z (на север, к воротам) — камера сзади, с юга двора
const _spot = [0, 0, 0, 0];
{
  const tbl = $('weakTable');
  for (const [def, kind, what] of HEAVY) {
    const w = WEAK_SPOTS[kind];
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${def.name}</td><td>${what}</td><td class="num">${w.fwd} · ${w.up} · r ${w.r}</td><td class="num" data-id="${def.id}">—</td>`;
    tbl.appendChild(tr);
  }
}

// ------------------------------------------------------------ клипы по вкладкам

interface Clip { id: string; name: string; note: string }
const CLIPS: Record<Tab, Clip[]> = {
  hats: [
    { id: 'idle', name: 'Стоят', note: 'Четыре желейки в шапках ремёсел рядом с вешалкой: Каменщик, Канонир, Подрывник, Стрелок.' },
    { id: 'turn', name: 'Крутятся', note: 'Желейки медленно поворачиваются — видно шапки со всех сторон.' },
    { id: 'hop', name: 'Прыгают', note: 'Прыжок и приземление: шапка сплющивается и тянется вместе с телом.' },
  ],
  crab: [
    { id: 'run', name: 'Бег', note: 'Бежит боком по своему маршруту вдоль западной стены к морю, 3,5 м/с.' },
    { id: 'hit', name: 'Удар', note: 'Попадания раз в 0,7 с: подпрыгнул, клешни вверх, глаза вытянулись; монеты летят от краба (в игре — интерфейс).' },
    { id: 'caught', name: 'Пойман', note: '30-е попадание: подпрыгивает с разворотом и сжимается в искорку.' },
    { id: 'dive', name: 'Нырок', note: 'Последняя секунда маршрута (ZS_CRAB_DIVE): поворачивается к морю и ныряет носом вниз. На стенде путь до z = 27 и опускание до −1,4 (у x = ±25 вода начинается с z ≈ 26,3; сейчас сервер кончает путь у z = 25 и −0,8 — это ещё песок).' },
    { id: 'idle', name: 'Стоит', note: 'На месте: пощёлкивает клешнями, оглядывается.' },
  ],
  weak: [
    { id: 'walk', name: 'Идут', note: 'Шаг на месте со скоростью вида. Деталь живёт вместе со спиной.' },
    { id: 'idle', name: 'Стоят', note: 'Стоят: центр детали совпадает с точкой таблицы (оранжевый шар).' },
    { id: 'attack', name: 'Замах', note: 'Удар по воротам: корпус наклоняется, деталь уходит вместе с ним (сервер считает точку без позы).' },
    { id: 'hit', name: 'Попадание', note: 'Вздрагивают раз в 1,2 с.' },
  ],
};
const VIEWS: Record<Tab, Array<[string, string]>> = {
  hats: [['front', 'Спереди'], ['q34', '3/4'], ['side', 'Сбоку'], ['back', 'Сзади'], ['rack', 'Вешалка крупно'], ['game', 'Игровая камера']],
  crab: [['side', 'Сбоку'], ['q34', '3/4'], ['wall', 'Со стены'], ['near', 'Крупно']],
  weak: [['back', 'Со спины'], ['q34', '3/4 сзади'], ['side', 'Сбоку'], ['front', 'Спереди'], ['wall', 'Со стены']],
};

let tab: Tab = 'hats';
let clip = CLIPS.hats[0];
let view = 'front';
let T = 0;
let elapsed = 0;
let paused = false;

function setTab(t: Tab): void {
  tab = t;
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-tab]')) b.classList.toggle('on', b.dataset.tab === t);
  document.dispatchEvent(new CustomEvent('tab', { detail: t }));
  play(CLIPS[t][0].id);
  view = VIEWS[t][0][0];
  renderButtons();
  setView(view);
}

function play(id: string): void {
  clip = CLIPS[tab].find((c) => c.id === id) ?? CLIPS[tab][0];
  T = 0;
  crabPos.set(CRAB_X, 0, clip.id === 'dive' ? 13 : 4);
  crabA.die = 0;
  crabHit = 0;
  crabHitAcc = 0;
  coins.length = 0;
  for (const h of heavy) h.a.stT = 0;
  for (const g of guys) g.pose.yaw = Math.PI;
  $('note').textContent = clip.note;
  for (const b of document.querySelectorAll<HTMLButtonElement>('#clips button')) b.classList.toggle('on', b.dataset.clip === clip.id);
}

function renderButtons(): void {
  const clips = $('clips');
  clips.innerHTML = '';
  for (const c of CLIPS[tab]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.clip = c.id;
    b.textContent = c.name;
    b.classList.toggle('on', c.id === clip.id);
    b.addEventListener('click', () => play(c.id));
    clips.appendChild(b);
  }
  const views = $('views');
  views.innerHTML = '';
  for (const [id, name] of VIEWS[tab]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.view = id;
    b.textContent = name;
    b.classList.toggle('on', id === view);
    b.addEventListener('click', () => setView(id));
    views.appendChild(b);
  }
}

/** Куда смотрит камера во вкладке (центр — за ним идёт орбита) */
function focus(out: THREE.Vector3): THREE.Vector3 {
  if (tab === 'hats') return view === 'rack' ? out.set(HAT_SPOT.x, 1.3, HAT_SPOT.z) : out.set(HAT_SPOT.x - 3.2, 1.05, HAT_SPOT.z + 0.3);
  if (tab === 'crab') return out.set(crabPos.x, 0.45 + crabPos.y, crabPos.z);
  return out.set(-2.2, 1.15, -7.5);
}

const lastC = new THREE.Vector3();
function setView(id: string): void {
  view = id;
  for (const b of document.querySelectorAll<HTMLButtonElement>('#views button')) b.classList.toggle('on', b.dataset.view === id);
  const c = focus(_v);
  const O: Record<string, [number, number, number]> = tab === 'hats'
    ? { front: [0, 0.9, 6.6], q34: [4.6, 1.6, 5], side: [7, 0.8, 0], back: [0, 1.4, -6.2], rack: [1.2, 0.5, 3.2], game: [0, 2.4, 4.6] }
    : tab === 'crab'
      ? { side: [5.5, 1.6, 1.2], q34: [4, 2.6, -4.2], wall: [11, 6.5, -2], near: [2.1, 0.9, 0.9] }
      : { back: [0, 1.4, 8.4], q34: [-6.5, 2.4, 6.8], side: [-11, 1.2, 0], front: [0, 1.3, -6.6], wall: [0, 6.8, 8.6] };
  const o = O[id] ?? Object.values(O)[0];
  if (tab === 'hats' && id === 'game') {
    // как в игре: за спиной Канонира, чуть сверху, вешалка впереди-справа
    const g = guys[1];
    camera.position.set(g.home.x - 0.6, 2.35, g.home.z + 4.2);
    orbit.target.set(g.home.x + 1.2, 1.1, g.home.z - 1.2);
  } else {
    camera.position.set(c.x + o[0], c.y + o[1], c.z + o[2]);
    orbit.target.copy(c);
  }
  orbit.update();
  lastC.copy(c);
}

/** Камера идёт за крабом (сдвиг вместе с орбитой) */
function follow(): void {
  if (tab !== 'crab') return;
  const c = focus(_v);
  const d = c.clone().sub(lastC);
  if (d.lengthSq() > 100) d.set(0, 0, 0);
  camera.position.add(d);
  orbit.target.add(d);
  lastC.copy(c);
}

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-tab]')) b.addEventListener('click', () => setTab(b.dataset.tab as Tab));
$<HTMLInputElement>('spheres').addEventListener('change', (e) => (showSpheres = (e.target as HTMLInputElement).checked));
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-scale]')) {
  b.addEventListener('click', () => {
    heavyScale = Number(b.dataset.scale);
    for (const o of document.querySelectorAll<HTMLButtonElement>('[data-scale]')) o.classList.toggle('on', o === b);
  });
}

// ------------------------------------------------------------ кадр

function stepHats(dt: number): void {
  const vis = tab === 'hats';
  rack.visible = vis;
  for (const [i, g] of guys.entries()) {
    g.pose.x = g.home.x;
    g.pose.z = g.home.z;
    g.pose.y = 0;
    g.pose.flags = vis ? E_ALIVE | E_GROUNDED : 0;
    if (vis && clip.id === 'turn') g.pose.yaw = Math.PI + elapsed * 0.7 + i * 0.4;
    if (vis && clip.id === 'hop') {
      const p = (T * 0.8 + i * 0.22) % 1.2;
      const up = p < 0.7 ? Math.sin((p / 0.7) * Math.PI) : 0;
      g.pose.y = up * 0.9;
      if (up > 0.02) g.pose.flags = E_ALIVE;

    }
    g.a.update(g.pose, dt, elapsed, GROUND, camera.position, false);
  }
}

function stepCrab(dt: number): void {
  const on = tab === 'crab';
  crab.group.visible = on;
  coinMesh.visible = on;
  if (!on) return;
  const c = clip.id;
  crabA.t = elapsed;
  crabA.st = 0;
  crabA.die = 0;
  let speed = c === 'idle' ? 0 : CRAB_V;
  if (c === 'caught' && T > 1.6) {
    speed = 0;
    crabA.die = Math.min(1, (T - 1.6) / 1.1);
    if (T > 3.6) play('caught');
  }
  if (c === 'dive') {
    // как сервер: 3 с бега, последняя секунда — нырок с опусканием (предложение: до −1,4 у z = 27, в воду), потом пропал и заново
    const left = 4 - T;
    if (left < 1) {
      crabA.st = ZS_CRAB_DIVE;
      crabA.stT = 1 - Math.max(0, left);
      crabPos.y = -1.4 * Math.min(1, 1 - left);
    } else crabPos.y = 0;
    if (T > 5) play('dive');
    if (T > 4) speed = 0;
  }
  if (c === 'run' && crabPos.z > 23) play('run');
  if (c === 'hit') {
    crabHitAcc += dt;
    if (crabHitAcc > 0.7) {
      crabHitAcc = 0;
      crabHit = 1;
      crabFlash = 1;
      coinBurst(_v.set(crabPos.x, crabPos.y + 0.6, crabPos.z), 6);
    }
    if (crabPos.z > 23) crabPos.z = 4;
  }
  crabPos.z += speed * dt;
  crabGait = (crabGait + (speed * dt) / 1.25) % 1;
  crabHit = Math.max(0, crabHit - dt * 3.5);
  crabFlash = Math.max(0, crabFlash - dt * 7);
  crabA.gait = crabGait;
  crabA.speed = speed;
  crabA.hit = crabHit;
  crabA.path += speed * dt;
  crab.group.visible = !(c === 'dive' && T > 4) && !(c === 'caught' && T > 2.75);
  crab.update(crabA, crabFlash * 0.85);
  mobRoot(crab.group.matrix, crabPos.x, crabPos.y, crabPos.z, Math.PI);
  crab.group.matrixWorldNeedsUpdate = true;
  stepCoins(dt);
}

function stepHeavy(dt: number): void {
  const on = tab === 'weak';
  for (const h of heavy) {
    h.view.group.visible = on;
    h.sphere.visible = h.ring.visible = on && showSpheres;
    if (!on) continue;
    const a = h.a;
    const k = ZK[h.kind];
    a.t = elapsed;
    a.st = 0;
    a.hit = 0;
    a.speed = clip.id === 'walk' ? k.speed : 0;
    a.gait = (a.gait + (a.speed * dt) / 1.25) % 1;
    a.path = (a.path ?? 0) + a.speed * dt;
    if (clip.id === 'attack') {
      a.st = ZS_ATTACK;
      a.stT = (T % 0.8);
    } else a.stT = T;
    if (clip.id === 'hit') {
      const p = T % 1.2;
      a.hit = Math.max(0, 1 - p * 3.5);
      h.flash = p < 0.14 ? 1 - p / 0.14 : 0;
    } else h.flash = 0;
    h.view.update(a, h.flash * 0.85);
    mobRoot(h.view.group.matrix, h.x, 0, h.z, HEAVY_YAW, heavyScale);
    h.view.group.matrixWorldNeedsUpdate = true;
    weakSpotWorld(h.kind, h.x, 0, h.z, HEAVY_YAW, heavyScale, _spot);
    h.sphere.position.set(_spot[0], _spot[1], _spot[2]);
    h.sphere.scale.setScalar(_spot[3]);
    h.ring.position.copy(h.sphere.position);
    h.ring.scale.copy(h.sphere.scale);
  }
}

/** Центры деталей в обычном шаге (для таблицы под стендом): тот же расчёт, что в отчёте */
function fillTable(): void {
  for (const h of heavy) {
    const cell = document.querySelector(`[data-id="${h.def.id}"]`);
    if (!cell) continue;
    const w = WEAK_SPOTS[h.kind];
    cell.textContent = MEASURED[h.def.id] ?? `${w.fwd} · ${w.up}`;
  }
}
/** Измерено скриптом по позам «стоит/идёт» трёх особей (scratchpad models-check/probe2.ts): назад · вверх */
const MEASURED: Record<string, string> = {
  'brute-troll': '−0,78 · 1,51 — совпадает',
  'brute-bear': '−0,80 · 1,50 — совпадает',
  'armored-armadillo': '−0,24 · 1,62 — совпадает',
  'shield-turtle': '−0,39 · 1,01 — внутри шара; предложено −0,3',
  'shield-beaver': '−0,24 · 1,02 — вне шара; предложено −0,3',
};
fillTable();

function resize(): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.resize(w, h, Math.min(devicePixelRatio, 2));
  world.resize(w, h);
}
new ResizeObserver(resize).observe(canvas);
resize();
world.setQuality('high');

let prev = performance.now();
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt0 = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  const dt = paused ? 0 : dt0;
  elapsed += dt;
  T += dt;
  stepHats(dt0);
  stepCrab(dt);
  stepHeavy(dt);
  tickAvatarShared(elapsed, canvas.clientHeight);
  follow();
  orbit.update();
  world.update(dt0, camera.position);
  renderer.beginFrame(false);
  world.renderScene();
  renderer.endFrame();
  const i = renderer.gl.info.render;
  $('info').textContent = tab === 'hats' ? `вешалка: ${craftRackTris().toLocaleString('ru')} треуг., 3 отрисовки · кадр: ${i.calls} отрисовок`
    : tab === 'crab' ? `краб: ${defTris(GOLD_CRAB).toLocaleString('ru')} треуг. · z ${crabPos.z.toFixed(1)} · кадр: ${i.calls} отрисовок`
      : `рост ×${String(heavyScale).replace('.', ',')} · кадр: ${i.calls} отрисовок`;
}

const START = (['hats', 'crab', 'weak'] as const).find((t) => t === params.get('tab')) ?? 'hats';
setTab(START);
if (params.get('clip')) play(params.get('clip')!);
if (params.get('view')) setView(params.get('view')!);
requestAnimationFrame(frame);

(window as unknown as Record<string, unknown>).__models = {
  setTab, play, setView, world, renderer,
  /** Камера для снимков: откуда и куда смотреть */
  cam(px: number, py: number, pz: number, tx: number, ty: number, tz: number) {
    camera.position.set(px, py, pz);
    orbit.target.set(tx, ty, tz);
    orbit.update();
    lastC.copy(focus(_v));
  },
  /** Замереть на секунде клипа */
  freeze(id: string, t: number) {
    play(id);
    paused = false;
    const step = 1 / 60;
    for (let s = 0; s < t; s += step) {
      elapsed += step;
      T += step;
      stepHats(step);
      stepCrab(step);
      stepHeavy(step);
    }
    paused = true;
  },
  run() {
    paused = false;
  },
  spheres(on: boolean) {
    showSpheres = on;
    $<HTMLInputElement>('spheres').checked = on;
  },
  scale(s: number) {
    heavyScale = s;
  },
  info: () => ({ tab, clip: clip.id, T, calls: renderer.gl.info.render.calls, triangles: renderer.gl.info.render.triangles, crab: defTris(GOLD_CRAB), rack: craftRackTris() }),
};
