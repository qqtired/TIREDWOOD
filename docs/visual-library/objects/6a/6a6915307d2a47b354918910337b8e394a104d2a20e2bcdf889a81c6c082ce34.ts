// Стенд моделей «Набега пиратов» (только для разработки, в сборку не входит):
//   /tools/pirate-lab/index.html?view=ship|ship34|deck|dinghy|pirates|poses|captain|cannon|loot|all
// Параметры: t — секунда анимации, freeze=1 — заморозить, cam=x,y,z,tx,ty,tz — камера, state=run — поза пиратов
// (idle run grab carry carry2 jump stun row seat cheer flee die), kind=1|2 и seed= — модель на poses, fire=1 — отдача
// пушек, damage=0…1, anchored=0|1, flee=0…1, white=1, turn=−1…1, speed=, sink=0…1, cargo=0…4, oars=0|1|2,
// ready=0…1, die=0…1, tint=ff3366 (краска), mix=0.6, q=low|medium|high. Свет — как на набережной (тёплое солнце,
// голубоватое небо), вода — на WATER_Y, настил причала — y = 0.
import * as THREE from 'three';
import { MOB_STRIDE, type MobAnim } from '../../client/fort/mobs/kit.ts';
import {
  PF_BARREL, PF_CRATE, PIRATE_DEFS, PK_CAPTAIN, PK_HAND, PS_CARRY, PS_CHEER, PS_FLEE, PS_GRAB, PS_IDLE, PS_JUMP, PS_ROW, PS_RUN,
  PS_SEAT, PS_STUN, PirateCrowd, buildCannon, buildDinghy, buildLoot, buildShip, crowdRoot,
  type CannonModel, type DinghyModel, type PirateQuality, type ShipModel,
} from '../../client/lobby/piratemodels.ts';

const WATER_Y = -1.25;
const q = new URLSearchParams(location.search);
const num = (k: string, d: number): number => {
  const v = q.get(k);
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? n : d;
};
const view = q.get('view') ?? 'all';
const freeze = q.get('freeze') === '1';
const quality = (q.get('q') ?? 'high') as PirateQuality;
const tint = q.get('tint') ? new THREE.Color(`#${q.get('tint')}`) : null;
const mix = num('mix', 0.6);

const canvas = document.querySelector<HTMLCanvasElement>('#c')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9d3f0);
scene.fog = new THREE.Fog(0xcfe0ef, 90, 420);
// свет набережной (client/lobby/look.ts): солнце золотистое на западе ≈ 24°, небесный свет голубоватый
const hemi = new THREE.HemisphereLight(0xb2c8f4, 0xd2a57c, 1.3);
const sun = new THREE.DirectionalLight(0xffd49a, 3.4);
const sunDir = new THREE.Vector3(-1, 0, 0.32).normalize();
sunDir.multiplyScalar(Math.cos(0.42)).setY(Math.sin(0.42));
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 3;
scene.add(hemi, sun, sun.target);
/** Рамка теней вокруг точки (центр вида) */
function shadowAround(c: THREE.Vector3, r: number): void {
  sun.position.copy(c).addScaledVector(sunDir, 60);
  sun.target.position.copy(c);
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 140 });
  sun.shadow.camera.updateProjectionMatrix();
}

// причал (настил y = 0, кромка — z = 0) и море за ним
const quay = new THREE.Mesh(new THREE.BoxGeometry(160, 2.6, 60), new THREE.MeshStandardMaterial({ color: 0xe2cfa6, roughness: 0.92 }));
quay.position.set(0, -1.3, -30);
quay.receiveShadow = true;
scene.add(quay);
const curb = new THREE.Mesh(new THREE.BoxGeometry(160, 0.5, 0.6), new THREE.MeshStandardMaterial({ color: 0xcfc7b6, roughness: 0.9 }));
curb.position.set(0, -0.2, -0.3);
curb.receiveShadow = true;
scene.add(curb);
const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x1b8fc4, emissive: 0x0a3f5c, roughness: 0.3, metalness: 0 }));
sea.rotation.x = -Math.PI / 2;
sea.position.set(0, WATER_Y, 200);
sea.receiveShadow = true;
scene.add(sea);

const crowd = new PirateCrowd(scene, quality);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 900);

interface Actor { tick(t: number, dt: number): void }
const actors: Actor[] = [];
const ships: ShipModel[] = [];
const dinghies: DinghyModel[] = [];
const cannons: CannonModel[] = [];

/** Пират на стенде: своя поза, путь копит фазу шага */
interface Lab {
  kind: number;
  seed: number;
  st: number;
  speed: number;
  flags: number;
  die: number;
  hit: number;
  rage: boolean;
  /** Корень: на земле или на месте шлюпки/корабля */
  place: (out: THREE.Matrix4) => THREE.Matrix4;
  gait: number;
  /** stT растёт со временем (true) или стоит (число) */
  stT: number | null;
  /** Синхронно с гребком шлюпки */
  rowWith?: () => number;
}
const pirates: Lab[] = [];
const _root = new THREE.Matrix4();
const anim: MobAnim = { t: 0, gait: 0, speed: 0, st: 0, stT: 0, hit: 0, die: 0, seed: 0, rage: false, flags: 0 };

const STATES: Record<string, { st: number; speed?: number; flags?: number; stT?: number; die?: number }> = {
  idle: { st: PS_IDLE },
  run: { st: PS_RUN, speed: 3.2 },
  grab: { st: PS_GRAB, flags: PF_CRATE, stT: 0.3 },
  grab2: { st: PS_GRAB, flags: PF_BARREL, stT: 0.55 },
  carry: { st: PS_CARRY, speed: 2.2, flags: PF_CRATE },
  carry2: { st: PS_CARRY, speed: 2.2, flags: PF_BARREL },
  carry3: { st: PS_CARRY, speed: 2.2, flags: PF_CRATE | PF_BARREL },
  jump: { st: PS_JUMP, stT: 0.35 },
  stun: { st: PS_STUN },
  row: { st: PS_ROW },
  seat: { st: PS_SEAT },
  cheer: { st: PS_CHEER },
  flee: { st: PS_FLEE, speed: 4.2 },
  die: { st: PS_STUN, die: 0.35 },
  die2: { st: PS_STUN, die: 0.8 },
};

function addPirate(kind: number, seed: number, state: string, place: (out: THREE.Matrix4) => THREE.Matrix4, rowWith?: () => number): Lab {
  const s = STATES[state] ?? STATES.idle;
  const p: Lab = {
    kind, seed, st: s.st, speed: s.speed ?? 0, flags: s.flags ?? 0, die: num('die', s.die ?? 0), hit: num('hit', 0), rage: q.get('rage') === '1',
    place, gait: seed, stT: s.stT ?? (q.has('stT') ? num('stT', 0) : null), rowWith,
  };
  pirates.push(p);
  return p;
}
/** Курс пиратов на стенде: yaw=градусы (как у игроков: 0 — лицом в −Z, −90 — в профиль, лицом влево на снимке) */
const yawQ = q.has('yaw') ? THREE.MathUtils.degToRad(num('yaw', 0)) : null;
const ground = (x: number, z: number, yaw: number) => (out: THREE.Matrix4) => crowdRoot(out, x, 0, z, yawQ ?? yaw);

function tickPirates(t: number, dt: number): void {
  crowd.begin();
  for (const p of pirates) {
    p.gait += (p.speed * dt) / MOB_STRIDE;
    anim.t = t + p.seed * 7;
    anim.gait = p.rowWith ? p.rowWith() : p.gait - Math.floor(p.gait);
    anim.speed = p.speed;
    anim.st = p.st;
    anim.stT = p.stT ?? (p.st === PS_JUMP ? (t % 1.1) / 1.1 : t % 3);
    anim.hit = p.hit;
    anim.die = p.die;
    anim.seed = p.seed;
    anim.rage = p.rage;
    anim.flags = p.flags;
    crowd.add(p.kind, p.seed, p.place(_root), anim, 0, tint, mix);
  }
  crowd.end();
}

function shipAnim(t: number) {
  const g = q.get('fire') === '1' ? 1 : 0;
  return {
    t, speed: num('speed', 0), anchored: num('anchored', 1), turn: num('turn', 0), damage: num('damage', 0), flee: num('flee', 0),
    whiteFlag: q.get('white') === '1', guns: [g, g * 0.6, g * 0.3, 0, g, g * 0.6, g * 0.3, 0],
  };
}

function addShip(x: number, z: number, rotY: number): ShipModel {
  const s = buildShip();
  s.group.position.set(x, WATER_Y, z);
  s.group.rotation.y = rotY;
  scene.add(s.group);
  ships.push(s);
  actors.push({ tick: (t, dt) => s.update(shipAnim(t), dt) });
  return s;
}

function addDinghy(x: number, z: number, rotY: number, o: { oars?: 0 | 1 | 2; cargo?: number; sink?: number; crew?: string[] }): DinghyModel {
  const d = buildDinghy();
  d.group.position.set(x, WATER_Y, z);
  d.group.rotation.y = rotY;
  scene.add(d.group);
  dinghies.push(d);
  let stroke = 0;
  const oars = (q.has('oars') ? num('oars', 0) : o.oars ?? 0) as 0 | 1 | 2;
  const sink = q.has('sink') ? num('sink', 0) : o.sink ?? 0;
  actors.push({
    tick: (t, dt) => {
      stroke = (t * 0.8) % 1;
      d.update({ t, speed: oars === 0 ? num('speed', 1.6) : 0, stroke, oars, cargo: q.has('cargo') ? num('cargo', 0) : o.cargo ?? 0, sink, hit: num('hit', 0) }, dt);
      d.group.updateMatrixWorld();
    },
  });
  (o.crew ?? []).forEach((state, i) => {
    if (!state) return;
    addPirate(i === 2 && state === 'seat' ? PK_CAPTAIN : PK_HAND, (i * 0.27 + x * 0.013 + 0.11) % 1, state, (out) => d.seatRoot(i, out), () => stroke);
  });
  return d;
}

function addCannon(x: number, z: number, o: { yaw?: number; pitch?: number; recoil?: number; ready?: number }): CannonModel {
  const c = buildCannon();
  c.group.position.set(x, 0, z);
  scene.add(c.group);
  cannons.push(c);
  actors.push({
    tick: (t, dt) => c.update({ t, yaw: o.yaw ?? Math.PI, pitch: o.pitch ?? 0.15, recoil: q.get('fire') === '1' ? 1 : o.recoil ?? 0, ready: q.has('ready') ? num('ready', 1) : o.ready ?? 1 }, dt),
  });
  return c;
}

function addLoot(): ReturnType<typeof buildLoot> {
  return buildLoot();
}

function pile(kit: ReturnType<typeof buildLoot>, x: number, z: number): void {
  const items: Array<[THREE.BufferGeometry, number, number, number, number]> = [
    [kit.crate, -0.42, 0, 0.1, 0.1], [kit.crate, 0.4, 0, -0.05, -0.15], [kit.barrel, 0.05, 0, -0.62, 0], [kit.crate, 0, 0.45, 0, 0.25],
  ];
  for (const [g, dx, y, dz, ry] of items) {
    const m = new THREE.Mesh(g, kit.material);
    m.position.set(x + dx, y, z + dz);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
}

// ------------------------------------------------------------ виды

const cam = { pos: new THREE.Vector3(), at: new THREE.Vector3(), fov: 40, shadowR: 12 };
function look(px: number, py: number, pz: number, tx: number, ty: number, tz: number, fov = 40, shadowR = 12): void {
  cam.pos.set(px, py, pz);
  cam.at.set(tx, ty, tz);
  cam.fov = fov;
  cam.shadowR = shadowR;
}

const order = ['idle', 'run', 'grab', 'carry', 'carry2', 'jump', 'stun', 'row', 'seat', 'cheer', 'flee', 'die', 'die2'];
if (view === 'ship' || view === 'ship34' || view === 'deck') {
  const s = addShip(0, 22, Math.PI / 2);
  if (view === 'deck') {
    for (let i = 0; i < s.deck.length; i++) addPirate(i === 7 ? PK_CAPTAIN : PK_HAND, (i * 0.137 + 0.05) % 1, q.get('state') ?? 'cheer', (out) => s.deckRoot(i, out));
    look(-9, 12, 8, 0, 1.5, 22, 45, 14);
  } else if (view === 'ship') look(0, 3, -16, 0, 4.5, 22, 40, 16);
  else look(-22, 9, -10, 0, 4, 22, 40, 16);
} else if (view === 'dinghy') {
  addDinghy(-3.2, 4.5, 0.25, { oars: 0, cargo: 0, crew: ['row', 'row', 'seat'] });
  addDinghy(1.6, 3.2, -0.15, { oars: 1, cargo: 4, crew: ['seat', '', 'cheer'] });
  addDinghy(6.2, 5.5, 0.4, { oars: 2, cargo: 2, sink: 0.45, crew: [] });
  look(0.5, 4.2, -5.5, 1.5, -0.4, 4.4, 45, 9);
} else if (view === 'pirates') {
  const st = q.get('state') ?? 'idle';
  const kinds = [PK_HAND, PK_HAND, PK_HAND, PK_HAND, PK_CAPTAIN];
  const seeds = [0.1, 0.35, 0.6, 0.85, 0.5];
  kinds.forEach((k, i) => addPirate(k, seeds[i], st, ground((i - 2) * 1.45, -3, 0.35)));
  look(1.2, 2.3, -10.2, 0, 0.95, -3, 40, 6);
} else if (view === 'poses') {
  const kind = num('kind', PK_HAND);
  const seed = num('seed', 0.1);
  const list = (q.get('states') ?? order.join(',')).split(',');
  const gap = kind === PK_CAPTAIN ? 1.7 : 1.35;
  list.forEach((st, i) => addPirate(kind, seed, st, ground((i - (list.length - 1) / 2) * gap, -3, 0.3)));
  const w = list.length * gap;
  look(0.15 * w, 0.32 * w + 1, -3 - 0.95 * w, 0, 0.9, -3, 40, w * 0.7);
} else if (view === 'captain') {
  const list = (q.get('states') ?? 'idle,run,carry3,stun,cheer').split(',');
  list.forEach((st, i) => addPirate(PK_CAPTAIN, 0.5, st, ground((i - (list.length - 1) / 2) * 1.9, -3, 0.3)));
  look(1.5, 2.6, -10.8, 0, 1.15, -3, 40, 7);
} else if (view === 'cannon') {
  addCannon(-2.6, -1.4, { ready: 1 });
  addCannon(0.4, -1.4, { recoil: 1, ready: 0, pitch: 0.3 });
  addCannon(3.4, -1.4, { ready: 0.45, yaw: Math.PI + 0.5 });
  look(1.8, 3.2, -8.5, 0.4, 0.5, -1.4, 40, 6);
} else if (view === 'loot') {
  const kit = addLoot();
  const items: Array<[THREE.BufferGeometry, number]> = [[kit.crate, -1.1], [kit.barrel, 0], [kit.ball, 0.9]];
  for (const [g, x] of items) {
    const m = new THREE.Mesh(g, kit.material);
    m.position.set(x, 0, -2);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
  pile(kit, 2.6, -2.2);
  look(0.8, 1.6, -5.2, 0.8, 0.3, -2, 40, 4);
} else {
  // всё вместе: корабль на рейде бортом к причалу, шлюпки, пушки, пираты с добычей
  addShip(2, 30, Math.PI / 2);
  addDinghy(-4, 4.2, Math.PI, { oars: 1, cargo: 1, crew: ['seat', '', ''] });
  addDinghy(6, 9, 2.8, { oars: 0, cargo: 0, crew: ['row', 'row', 'seat'] });
  addCannon(-9, -1.4, { yaw: Math.PI + 0.3, pitch: 0.2 });
  addCannon(10, -1.4, { yaw: Math.PI - 0.2, pitch: 0.1, ready: 0.4 });
  const kit = addLoot();
  pile(kit, -2, -9);
  pile(kit, 5, -10);
  addPirate(PK_HAND, 0.1, 'carry', ground(-1, -4, Math.PI));
  addPirate(PK_HAND, 0.4, 'run', ground(2, -6, 0.5));
  addPirate(PK_HAND, 0.7, 'carry2', ground(3.5, -3, Math.PI + 0.4));
  addPirate(PK_CAPTAIN, 0.5, 'carry3', ground(-4, -6, Math.PI - 0.3));
  addPirate(PK_HAND, 0.9, 'stun', ground(0.5, -8.5, 0.8));
  look(-12, 8, -20, 2, 1, 6, 45, 30);
}
const camQ = q.get('cam')?.split(',').map(Number);
if (camQ && camQ.length >= 6 && camQ.every(Number.isFinite)) look(camQ[0], camQ[1], camQ[2], camQ[3], camQ[4], camQ[5], num('fov', cam.fov), num('shadow', cam.shadowR));

let time = num('t', 0);
let live = !freeze;
function frame(dt: number, draw = true): void {
  for (const a of actors) a.tick(time, dt);
  tickPirates(time, dt);
  if (!draw) return;
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = cam.fov;
  camera.position.copy(cam.pos);
  camera.lookAt(cam.at);
  camera.updateProjectionMatrix();
  shadowAround(cam.at, cam.shadowR);
  renderer.render(scene, camera);
}
// разогнать фазу шага, чтобы ноги стояли «в пути» (без отрисовки — SwiftShader медленный)
for (let i = 0; i < 30; i++) frame(1 / 60, false);
time = num('t', 0);
const hud = document.querySelector<HTMLElement>('#hud')!;
hud.textContent = `pirate-lab · ${view}${q.get('state') ? ' · ' + q.get('state') : ''}`;
if (q.get('hud') === '0') hud.style.display = 'none';
// заморожено — кадр рисуется один раз (и по __lab.set): вкладка не грузит общий Chrome
let last = performance.now();
function loop(now: number): void {
  if (!live) return;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  time += dt;
  frame(dt);
  requestAnimationFrame(loop);
}
frame(0);
requestAnimationFrame(loop);

/** Треугольники геометрии */
const tris = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
/** Сетки группы: сколько вызовов отрисовки (видимых) и треугольников (инстансы — × count) */
function meshBudget(root: THREE.Object3D): { calls: number; triangles: number } {
  let calls = 0;
  let triangles = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    let v: THREE.Object3D | null = m;
    while (v) {
      if (!v.visible) return;
      v = v.parent;
    }
    const n = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
    const range = m.geometry.drawRange.count;
    const t = Number.isFinite(range) ? Math.min(range / 3, tris(m.geometry)) : tris(m.geometry);
    calls += 1;
    triangles += t * n;
  });
  return { calls, triangles: Math.round(triangles) };
}
/** Бюджеты: пираты (по частям), корабль, шлюпки, пушки */
function budget(): unknown {
  return {
    pirates: PIRATE_DEFS.map((d) => ({ id: d.id, parts: d.parts.length, triangles: Math.round(d.parts.reduce((s, p) => s + tris(p.geo), 0)) })),
    ships: ships.map((s) => meshBudget(s.group)),
    dinghies: dinghies.map((d) => meshBudget(d.group)),
    cannons: cannons.map((c) => meshBudget(c.group)),
  };
}

/** Для снимков из DevTools: __lab.set(t) — кадр в секунду t, info() — треугольники и вызовы, budget() — бюджеты моделей */
(window as unknown as { __lab: unknown }).__lab = {
  set(t: number) { live = false; time = t; frame(0); },
  redraw() { frame(0); },
  play() {
    if (live) return;
    live = true;
    last = performance.now();
    requestAnimationFrame(loop);
  },
  info() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, pirates: crowd.count }; },
  budget,
  ships, dinghies, cannons, crowd, scene, renderer, defs: PIRATE_DEFS,
};
