// Стенд ауры элиток «Крепости» (01.11): настоящий мир крепости (FortWorld — небо, луг, замок, свет и тени игры), настоящие
// модели мобов инстансами (MobRenderer — как в игре), аура — общий код игры client/fort/elite (контур в материале мобов
// и один пул частиц). Два вида: «Близко» — обычный, элита ×1,25 и чемпион ×1,5 с короной рядом, вращение мышью;
// «Толпа со стены» — 20 обычных, 3 элиты и чемпион идут по дорогам к воротам, камера игрока с хода стены.
// Кольца-пояса нет. Рост — ELITE_SCALE из shared/fortideas.ts, корона — как в zombies3d.ts.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROADS, WALL_H, buildFort } from '../../shared/fortmap.ts';
import { ZK, Z_ARMORED, Z_BRUTE, Z_FLYER, Z_RUNNER, Z_WALKER } from '../../shared/fortkinds.ts';
import { ZS_WALK } from '../../shared/fort.ts';
import { ELITE_SCALE } from '../../shared/fortideas.ts';
import { PIVOT_Y, RIG_PB } from '../../shared/aim.ts';
import { viewDir } from '../../shared/math.ts';
import { Renderer } from '../../client/render/renderer.ts';
import { BODY_H, bodyProfile } from '../../client/render/outfit3d.ts';
import { softDot } from '../../client/render/textures.ts';
import { FortWorld } from '../../client/fort/world.ts';
import { FORT_CAM_DEFAULT, FORT_CAM_MAX, FORT_CAM_MIN } from '../../client/fort/fortcam.ts';
import { ALL_MOBS } from '../../client/fort/mobs/index.ts';
import { MOB_STRIDE, type MobAnim, type MobDef } from '../../client/fort/mobs/kit.ts';
import { MobRenderer, mobRoot, mobSeed } from '../../client/fort/mobs/renderer.ts';
import { AURA_JELLY, EliteAura, GAME_AURA, setAuraLook, type AuraColorMode, type AuraVariant } from '../../client/fort/elite/aura.ts';
import { patchJellyAura } from '../../client/fort/elite/rim.ts';

export type View = 'near' | 'crowd';
export type MobType = 'walker' | 'brute' | 'armored' | 'flyer' | 'jelly';

/** Пять героев стенда: настоящие модели игры и желейка без модели */
export const TYPES: Record<MobType, { name: string; kind: number; def: string | null; fly?: number }> = {
  walker: { name: 'Шаркун', kind: Z_WALKER, def: 'walker-mushroom' },
  brute: { name: 'Бугай', kind: Z_BRUTE, def: 'brute-bear' },
  armored: { name: 'Чугунок', kind: Z_ARMORED, def: 'armored-armadillo' },
  flyer: { name: 'Крылатка', kind: Z_FLYER, def: 'flyer-bat', fly: 1.9 },
  jelly: { name: 'Желейка', kind: Z_WALKER, def: null },
};

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);
const renderer = new Renderer(canvas);
const world = new FortWorld(renderer, buildFort());
const scene = world.scene;
const camera = world.camera;
world.setQuality('high');

const mobs = new MobRenderer(scene, ALL_MOBS, 'high');
const aura = new EliteAura(scene);

// ------------------------------------------------------------ желейка без модели (как в zombies3d: тело, лицо, руки)

const JCAP = 16;
function colored(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const n = ng.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  ng.deleteAttribute('uv');
  return ng;
}
function faceGeo(): THREE.BufferGeometry {
  const ey = 1.17;
  const ez = -0.4;
  return mergeGeometries([
    colored(new THREE.SphereGeometry(0.115, 12, 10).scale(1, 1.1, 0.55).translate(-0.14, ey, ez), 0xf6f2dc),
    colored(new THREE.SphereGeometry(0.09, 12, 10).scale(1, 1.0, 0.55).translate(0.14, ey - 0.02, ez), 0xf6f2dc),
    colored(new THREE.SphereGeometry(0.035, 8, 6).scale(1, 1, 0.5).translate(-0.12, ey + 0.01, ez - 0.06), 0x1a1a1a),
    colored(new THREE.SphereGeometry(0.03, 8, 6).scale(1, 1, 0.5).translate(0.16, ey - 0.04, ez - 0.05), 0x1a1a1a),
    colored(new THREE.BoxGeometry(0.24, 0.05, 0.05).rotateZ(-0.12).translate(0.01, 0.94, -0.43), 0x2a1416),
  ], false)!;
}
function armGeo(): THREE.BufferGeometry {
  const arm = new THREE.CylinderGeometry(0.075, 0.085, 0.6, 8).translate(0, -0.3, 0);
  const mitt = new THREE.SphereGeometry(0.12, 10, 8).scale(1, 1.15, 0.9).translate(0, -0.66, 0);
  arm.deleteAttribute('uv');
  mitt.deleteAttribute('uv');
  return mergeGeometries([arm, mitt], false)!;
}
function inst(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, colors: boolean): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (colors) {
    m.setColorAt(0, new THREE.Color());
    m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  }
  m.count = 0;
  m.frustumCulled = false;
  scene.add(m);
  return m;
}
const jBodyGeo = new THREE.LatheGeometry(bodyProfile(), 22);
jBodyGeo.computeVertexNormals();
const jRank = new THREE.InstancedBufferAttribute(new Float32Array(JCAP), 1);
jRank.setUsage(THREE.DynamicDrawUsage);
jBodyGeo.setAttribute('auraRank', jRank);
const jBody = inst(jBodyGeo, patchJellyAura(new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0 })), JCAP, true);
const jFace = inst(faceGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }), JCAP, false);
const jArmMat = new THREE.MeshStandardMaterial({ roughness: 0.45 });
const jArmL = inst(armGeo(), jArmMat, JCAP, true);
const jArmR = inst(armGeo(), jArmMat, JCAP, true);

// корона чемпиона — как crownGeometry() и блестящий материал в zombies3d.ts
function crownGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(0.24, 0.035, 5, 18).rotateX(Math.PI / 2)];
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    parts.push(new THREE.ConeGeometry(0.05, 0.16, 4).translate(Math.sin(a) * 0.24, 0.08, Math.cos(a) * 0.24));
  }
  for (const p of parts) p.deleteAttribute('uv');
  return mergeGeometries(parts, false)!;
}
const crown = inst(crownGeo(), new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.55, emissive: 0x3a2400, emissiveIntensity: 0.5 }), 8, true);
// мягкие пятна-тени под ногами (в крепости карта теней статичная — у живых свои пятна)
const shadow = inst(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ map: softDot('rgba(0,0,0,0.42)'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), 64, false);
shadow.renderOrder = 1;

// ------------------------------------------------------------ особи

interface Mob {
  type: MobType;
  kind: number;
  def: MobDef | null;
  seed: number;
  tier: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  /** дорога и путь по ней (толпа); -1 — стоит на месте (близко) */
  road: number;
  s: number;
  lane: number;
  anim: MobAnim;
}

function seedFor(kind: number, def: string | null, flags: number, from: number): number {
  if (!def) return mobSeed(from);
  for (let i = from; i < from + 2000; i++) {
    const s = mobSeed(i);
    if (mobs.variant(kind, s, flags)?.id === def) return s;
  }
  return 0.5;
}

/** Особь: модель героя стенда (TYPES) или, с any, — любой вариант вида по seed (как в игре) */
function makeMob(type: MobType, tier: number, n: number, opt: { kind?: number; any?: boolean } = {}): Mob {
  const kind = opt.kind ?? TYPES[type].kind;
  const seed = opt.any ? mobSeed(n * 7 + 3) : seedFor(kind, TYPES[type].def, tier, n * 31 + 1);
  const def = type === 'jelly' ? null : mobs.variant(kind, seed, tier);
  return {
    type, kind, def, seed, tier, x: 0, y: 0, z: 0, yaw: Math.PI, speed: 0, road: -1, s: 0, lane: 0,
    anim: { t: n * 0.37, gait: (n * 0.29) % 1, path: 0, speed: 0, st: ZS_WALK, stT: 0, hit: 0, die: 0, seed, rage: false, flags: tier, flagT: 99, stage: 0 },
  };
}

// дороги — длина по точкам, точка и курс на пути s
const roads = ROADS.map((r) => {
  const acc = [0];
  for (let i = 1; i < r.pts.length; i++) acc.push(acc[i - 1] + Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]));
  return { pts: r.pts, acc, len: acc[acc.length - 1] };
});
function onRoad(ri: number, s: number, lane: number, out: { x: number; z: number; yaw: number }): void {
  const r = roads[ri];
  let i = 1;
  while (i < r.acc.length - 1 && r.acc[i] < s) i++;
  const [ax, az] = r.pts[i - 1];
  const [bx, bz] = r.pts[i];
  const seg = r.acc[i] - r.acc[i - 1];
  const t = Math.max(0, Math.min(1, (s - r.acc[i - 1]) / seg));
  const dx = (bx - ax) / seg;
  const dz = (bz - az) / seg;
  out.x = ax + (bx - ax) * t - dz * lane;
  out.z = az + (bz - az) * t + dx * lane;
  out.yaw = Math.atan2(-dx, -dz);
}

/** Толпа: 20 обычных (Шаркуны, Бугаи, Чугунки, Крылатки, Шустрики), 3 элиты и чемпион — по трём дорогам */
const CROWD: Array<[MobType, number, number?]> = [
  ['walker', 0], ['walker', 0], ['walker', 0], ['walker', 0], ['walker', 0], ['walker', 0], ['walker', 0], ['walker', 0],
  ['brute', 0], ['brute', 0], ['brute', 0], ['armored', 0], ['armored', 0], ['armored', 0],
  ['flyer', 0], ['flyer', 0], ['flyer', 0], ['walker', 0, Z_RUNNER], ['walker', 0, Z_RUNNER], ['walker', 0, Z_RUNNER],
  ['walker', 1], ['armored', 1], ['flyer', 1], ['brute', 2],
];
const crowd: Mob[] = CROWD.map(([type, tier, kind], i) => {
  const m = makeMob(type, tier, i, { kind, any: !tier });
  // западная и северная дороги (восточную со стены закрывает надвратная башня), от 40 до 9 м до ворот
  m.road = i % 2;
  const r = roads[m.road];
  m.s = r.len - 9 - ((i * 0.618 * 31) % 31);
  m.lane = ((i * 0.37) % 1 - 0.5) * 2.6;
  m.speed = ZK[m.kind].speed * (type === 'flyer' ? 0.42 : 0.8);
  return m;
});
// элиты и чемпион — на западной и северной дорогах, поближе: их видно со стены сразу
[0, 1, 0, 1].forEach((road, i) => { crowd[20 + i].road = road; });
crowd[20].s = roads[crowd[20].road].len - 16;
crowd[21].s = roads[crowd[21].road].len - 22;
crowd[22].s = roads[crowd[22].road].len - 27;
crowd[23].s = roads[crowd[23].road].len - 15;

const NEAR_Z = -33;
let nearType: MobType = (params.get('mob') as MobType) in TYPES ? (params.get('mob') as MobType) : 'walker';
let near: Mob[] = [];
function buildNear(): void {
  const t = TYPES[nearType];
  near = [0, 1, 2].map((tier) => makeMob(nearType, tier, 100 + tier));
  const w = Math.max(0.6, ZK[t.kind].hrx) * 2.3;
  near.forEach((m, i) => {
    m.x = (i - 1) * w * (1 + i * 0.12);
    m.z = NEAR_Z;
    m.yaw = Math.PI - 0.32;
    m.speed = 0;
  });
}

// ------------------------------------------------------------ камера

let view: View = params.get('view') === 'crowd' ? 'crowd' : 'near';
const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;
orbit.enablePan = false;
orbit.maxPolarAngle = Math.PI * 0.495;
orbit.minDistance = 2.5;
orbit.maxDistance = 30;
/** Игрок у парапета северной стены, западнее надвратной башни; камера — как FortCam: за спиной над плечом */
const PLAYER = new THREE.Vector3(-12.5, WALL_H, -15.3);
const look = { yaw: -0.3, pitch: -0.24, back: FORT_CAM_DEFAULT };
const _f = { x: 0, y: 0, z: 0 };

function placeNearCam(): void {
  const h = (near[2]?.def?.height ?? BODY_H) * ELITE_SCALE[2] + (TYPES[nearType].fly ?? 0);
  const d = 3.2 + h * 1.9;
  orbit.target.set(0.3, h * 0.48, NEAR_Z);
  camera.position.set(d * 0.42, h * 0.45 + d * 0.16, NEAR_Z + d * 0.9);
  orbit.update();
}
function placeCrowdCam(): void {
  viewDir(look.yaw, look.pitch, _f);
  const rx = Math.cos(look.yaw);
  const rz = -Math.sin(look.yaw);
  camera.position.set(PLAYER.x - _f.x * look.back + rx * RIG_PB.side, PLAYER.y + PIVOT_Y - _f.y * look.back + RIG_PB.up, PLAYER.z - _f.z * look.back + rz * RIG_PB.side);
  camera.lookAt(camera.position.x + _f.x, camera.position.y + _f.y, camera.position.z + _f.z);
}

export function setView(v: View): void {
  view = v;
  orbit.enabled = v === 'near';
  camera.fov = v === 'near' ? 45 : 70;
  camera.updateProjectionMatrix();
  aura.clear();
  if (v === 'near') placeNearCam();
  else placeCrowdCam();
}
export function setMob(t: MobType): void {
  nearType = t;
  buildNear();
  aura.clear();
  if (view === 'near') placeNearCam();
}

// мышь в толпе: тянуть — повернуть голову, колесо — камера ближе и дальше (как в игре)
let drag: { x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  if (view !== 'crowd') return;
  drag = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || view !== 'crowd') return;
  look.yaw -= (e.clientX - drag.x) * 0.004;
  look.pitch = Math.max(-0.75, Math.min(0.3, look.pitch - (e.clientY - drag.y) * 0.004));
  drag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', (e) => {
  if (view !== 'crowd') return;
  e.preventDefault();
  look.back = Math.max(FORT_CAM_MIN, Math.min(FORT_CAM_MAX, look.back * Math.exp(e.deltaY * 0.0012)));
}, { passive: false });

// ------------------------------------------------------------ вид ауры

let variant: AuraVariant = (['A', 'B', 'C', 'A2'] as const).find((v) => v === params.get('v')) ?? GAME_AURA;
let colorMode: AuraColorMode = params.get('mode') === 'mono' ? 'mono' : 'rank';
let auraOn = params.get('v') !== 'off';
export function setVariant(v: AuraVariant | 'off'): void {
  auraOn = v !== 'off';
  if (v !== 'off') variant = v;
  setAuraLook(variant, colorMode, auraOn);
  aura.clear();
}
export function setColorMode(m: AuraColorMode): void {
  colorMode = m;
  setAuraLook(variant, colorMode, auraOn);
}
export function state(): { variant: AuraVariant; auraOn: boolean; colorMode: AuraColorMode; view: View; mob: MobType; paused: boolean } {
  return { variant, auraOn, colorMode, view, mob: nearType, paused };
}
let paused = params.has('pause');
export function setPaused(p: boolean): void { paused = p; }

// ------------------------------------------------------------ кадр

const _root = new THREE.Matrix4();
const _hb = new THREE.Matrix4();
const _arm = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _rd = { x: 0, z: 0, yaw: 0 };

function drawMob(m: Mob, time: number, counts: { j: number; c: number; sh: number }): void {
  const scale = ELITE_SCALE[m.tier] ?? 1;
  const k = ZK[m.kind];
  const a = m.anim;
  a.speed = m.road >= 0 ? m.speed : 0.9;
  a.t = time + m.seed * 10;
  const fly = TYPES[m.type].fly ?? 0;
  const y = fly ? fly + Math.sin(time * 2.1 + m.seed * 9) * 0.18 : 0;
  const tierOn = auraOn ? m.tier : 0;
  if (m.def) {
    mobRoot(_root, m.x, y, m.z, m.yaw, scale);
    mobs.add(m.kind, m.seed, _root, a, 0, null, 0, tierOn);
    aura.add(m.def, _root, a, tierOn, scale);
    // хитбокс вокруг модели — в его осях сидит корона (как _m в zombies3d.drawMob)
    const sxz = k.hrx / 0.5;
    _hb.multiplyMatrices(_root, _m2.makeScale(sxz, m.def.height / BODY_H, sxz));
  } else {
    // желейка: тело по хитбоксу вида, лицом к −Z, покачивается на ходу
    const sy = (k.hcy + k.hry) / BODY_H * scale;
    const sxz = (k.hrx / 0.5) * scale;
    const bob = Math.abs(Math.sin(a.gait * Math.PI * 2)) * 0.06;
    _e.set(-0.06, m.yaw, Math.sin(a.gait * Math.PI * 2) * 0.05);
    _q.setFromEuler(_e);
    _hb.compose(_p.set(m.x, y + bob, m.z), _q, _s.set(sxz, sy, sxz));
    const j = counts.j++;
    jBody.setMatrixAt(j, _hb);
    jBody.setColorAt(j, _c.set(k.color));
    (jRank.array as Float32Array)[j] = tierOn;
    jFace.setMatrixAt(j, _hb);
    const sw = Math.sin(a.gait * Math.PI * 2) * 0.25;
    _c.set(k.color).multiplyScalar(0.82);
    _arm.makeRotationX(1.25 + sw).setPosition(-0.44, 0.92, -0.04);
    jArmL.setMatrixAt(j, _m2.multiplyMatrices(_hb, _arm));
    jArmL.setColorAt(j, _c);
    _arm.makeRotationX(1.25 - sw).setPosition(0.44, 0.92, -0.04);
    jArmR.setMatrixAt(j, _m2.multiplyMatrices(_hb, _arm));
    jArmR.setColorAt(j, _c);
    aura.add(AURA_JELLY, _hb, null, tierOn, scale);
  }
  if (m.tier === 2) {
    _arm.makeRotationY(time * 1.5).setPosition(0, BODY_H + 0.04, 0);
    crown.setMatrixAt(counts.c, _m2.multiplyMatrices(_hb, _arm));
    crown.setColorAt(counts.c++, _c.set(0xffc83a));
  }
  const r = k.hrx * scale * 2.1;
  _hb.compose(_p.set(m.x, 0.03, m.z), _q.identity(), _s.set(r, 1, r * 0.9));
  shadow.setMatrixAt(counts.sh++, _hb);
}

function finish(mesh: THREE.InstancedMesh, n: number): void {
  mesh.count = n;
  mesh.visible = n > 0;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

let prev = performance.now();
let time = 0;
let fpsAcc = 0;
let fpsN = 0;
let fps = 0;
const info = { calls: 0, triangles: 0, programs: 0, particles: 0, fps: 0 };

/** Шаг сцены на dt (для кадра и для «прогрева» перед снимком) */
function step(dt: number): void {
  time += dt;
  if (view === 'crowd') {
    for (const m of crowd) {
      m.s += m.speed * dt;
      const r = roads[m.road];
      if (m.s > r.len - 6) m.s -= 34;
      onRoad(m.road, m.s, m.lane, _rd);
      m.x = _rd.x;
      m.z = _rd.z;
      m.yaw = _rd.yaw;
    }
  }
  for (const m of view === 'crowd' ? crowd : near) {
    const sp = m.road >= 0 ? m.speed : 0.9;
    m.anim.gait = (m.anim.gait + (sp * dt) / MOB_STRIDE) % 1;
    m.anim.path = (m.anim.path ?? 0) + sp * dt;
    m.anim.stT += dt;
  }
}

function draw(dt: number): void {
  if (view === 'crowd') placeCrowdCam();
  else orbit.update();
  aura.begin(dt, camera.position);
  mobs.begin();
  const counts = { j: 0, c: 0, sh: 0 };
  for (const m of view === 'crowd' ? crowd : near) drawMob(m, time, counts);
  mobs.end();
  aura.end();
  for (const mesh of [jBody, jFace, jArmL, jArmR]) finish(mesh, counts.j);
  jRank.needsUpdate = true;
  finish(crown, counts.c);
  finish(shadow, counts.sh);
  world.update(dt, camera.position);
  world.renderScene();
  const gi = renderer.gl.info;
  info.calls = gi.render.calls;
  info.triangles = gi.render.triangles;
  info.programs = gi.programs?.length ?? 0;
  info.particles = aura.count;
}

/** Прогнать сцену вперёд на sec секунд (частицы набираются, толпа идёт) — для снимков */
export function warm(sec: number): void {
  for (let t = 0; t < sec; t += 1 / 60) {
    step(1 / 60);
    aura.begin(1 / 60, camera.position);
    mobs.begin();
    const counts = { j: 0, c: 0, sh: 0 };
    if (view === 'crowd') placeCrowdCam();
    for (const m of view === 'crowd' ? crowd : near) drawMob(m, time, counts);
    mobs.end();
    aura.end();
  }
}

function frame(now: number): void {
  requestAnimationFrame(frame);
  const raw = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  if (document.hidden) return;
  fpsAcc += raw;
  fpsN++;
  if (fpsAcc > 0.5) {
    fps = fpsN / fpsAcc;
    fpsAcc = 0;
    fpsN = 0;
  }
  info.fps = fps;
  const dt = paused ? 0 : raw;
  step(dt);
  draw(dt);
  onFrame?.(info);
}

let onFrame: ((i: typeof info) => void) | null = null;
export function onInfo(cb: (i: typeof info) => void): void { onFrame = cb; }

function resize(): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.resize(w, h, Math.min(devicePixelRatio, 2));
  world.resize(w, h);
}
new ResizeObserver(resize).observe(canvas);
resize();

buildNear();
setAuraLook(variant, colorMode, auraOn);
setView(view);
requestAnimationFrame(frame);

Object.assign(window, { __elite: { setVariant, setColorMode, setView, setMob, setPaused, warm, state, info, renderer, look, aura } });
