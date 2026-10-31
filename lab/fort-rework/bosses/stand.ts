// Стенд новых боссов крепости: настоящий мир крепости (FortWorld — небо, море, замок, свет и тени игры), две желейки на
// ходу северной стены для масштаба, босс снаружи у западной части стены. Камеры: игровая (за спиной игрока на стене),
// 3/4, сбоку, со спины; мышью — вращение и зум вокруг босса. Клипы — кнопки (состояние сервера → поза модели), метки
// атак (красное — сюда ударит, заливка растёт до удара), снаряды, пыль, дым из трубы, тряска камеры.
// window.__bosses — для снимков из headless Chrome.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DEFAULT_OUTFIT } from '../../../shared/outfit.ts';
import { E_ALIVE, E_GROUNDED } from '../../../shared/protocol.ts';
import { WALL_H, buildFort } from '../../../shared/fortmap.ts';
import { Avatar, tickAvatarShared, type AvatarPose } from '../../../client/render/avatar.ts';
import { Renderer } from '../../../client/render/renderer.ts';
import { FortWorld } from '../../../client/fort/world.ts';
import { BARON } from '../../../client/fort/mobs/boss-baron.ts';
import { GOLEM } from '../../../client/fort/mobs/boss-golem.ts';
import { BOSS_LESHY } from '../../../client/fort/mobs/boss-leshy.ts';
import { RAM } from '../../../client/fort/mobs/boss-ram.ts';
import { buildPreview } from '../../../client/fort/mobs/kit.ts';
import { bossTris, buildBoss, type BossClip, type BossDef, type MobAnim } from './bosskit.ts';
import { HS, HUT, HUT_POINTS, HUT_WARN, NEST_DY, NEST_DZ } from './hut.ts';
import { PELICAN, PELICAN_STAGE } from './pelican.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage');
const params = new URLSearchParams(location.search);

const renderer = new Renderer(canvas);
const map = buildFort();
const world = new FortWorld(renderer, map);
const scene = world.scene;
const camera = world.camera;
camera.fov = 55;
const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;
orbit.maxPolarAngle = Math.PI * 0.49;
orbit.minDistance = 4;
orbit.maxDistance = 70;

// ------------------------------------------------------------ желейки на стене

const GROUND = { groundBelow: (): number => WALL_H };
interface Guy { a: Avatar; pose: AvatarPose }
const guys: Guy[] = [];
const GUY_AT: Array<[number, number, string]> = [[-7.4, -14.3, 'pink'], [-11.2, -14.5, 'mint']];
for (const [x, z] of GUY_AT) {
  const a = new Avatar(guys.length + 1, { voice: false });
  a.setOutfit({ ...DEFAULT_OUTFIT, h: 'none', c: guys.length ? 2 : 0 } as typeof DEFAULT_OUTFIT);
  a.setInfo('', null, false, 1);
  a.addTo(scene);
  guys.push({ a, pose: { x, y: WALL_H, z, yaw: 0, pitch: 0, flags: E_ALIVE | E_GROUNDED } });
}

// ------------------------------------------------------------ частицы: пыль, щепки, дым, варенье

const PMAX = 420;
interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; g: number; life: number; age: number; s0: number; s1: number; c: THREE.Color }
const parts: P[] = [];
const pMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 1 }), PMAX);
pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
pMesh.setColorAt(0, new THREE.Color());
pMesh.count = 0;
pMesh.frustumCulled = false;
scene.add(pMesh);
const _pm = new THREE.Matrix4();
const _c = new THREE.Color();

function burst(x: number, y: number, z: number, n: number, hex: number, speed: number, up: number, size: number, life = 1.2, g = 9.8, grow = 1): void {
  for (let i = 0; i < n && parts.length < PMAX; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random();
    parts.push({ x, y, z, vx: Math.cos(a) * speed * r, vy: up * (0.4 + Math.random() * 0.8), vz: Math.sin(a) * speed * r, g, life: life * (0.6 + Math.random() * 0.6), age: 0,
      s0: size * (0.6 + Math.random() * 0.8), s1: size * grow, c: _c.setHex(hex).clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.08) });
  }
}

function stepParts(dt: number): void {
  let n = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.age += dt;
    if (p.age >= p.life) {
      parts.splice(i, 1);
      continue;
    }
    p.vy -= p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.g > 0 && p.y < 0.05) {
      p.y = 0.05;
      p.vy *= -0.3;
      p.vx *= 0.6;
      p.vz *= 0.6;
    }
    const k = p.age / p.life;
    const s = (p.s0 + (p.s1 - p.s0) * k) * (k > 0.8 ? (1 - k) / 0.2 : 1);
    _pm.makeScale(s, s, s).setPosition(p.x, p.y, p.z);
    pMesh.setMatrixAt(n, _pm);
    pMesh.setColorAt(n, p.c);
    n++;
  }
  pMesh.count = n;
  pMesh.instanceMatrix.needsUpdate = true;
  if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
}

// ------------------------------------------------------------ метки атак (красное — сюда ударит; заливка растёт до удара)

interface Mark { group: THREE.Group; edge: THREE.Mesh; fill: THREE.Mesh; mat: THREE.MeshBasicMaterial; fmat: THREE.MeshBasicMaterial; from: number; to: number }
const marks: Mark[] = [];
function makeMark(shape: 'ring' | 'rect', w: number, h: number): Mark {
  const mat = new THREE.MeshBasicMaterial({ color: 0xff6043, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, side: THREE.DoubleSide });
  const fmat = new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, side: THREE.DoubleSide });
  let edge: THREE.Mesh;
  let fill: THREE.Mesh;
  if (shape === 'ring') {
    edge = new THREE.Mesh(new THREE.RingGeometry(w - 0.18, w, 48).rotateX(-Math.PI / 2), mat);
    fill = new THREE.Mesh(new THREE.CircleGeometry(w, 48).rotateX(-Math.PI / 2), fmat);
  } else {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, -h / 2).lineTo(w / 2, -h / 2).lineTo(w / 2, h / 2).lineTo(-w / 2, h / 2).lineTo(-w / 2, -h / 2);
    const hole = new THREE.Path();
    const b = 0.16;
    hole.moveTo(-w / 2 + b, -h / 2 + b).lineTo(-w / 2 + b, h / 2 - b).lineTo(w / 2 - b, h / 2 - b).lineTo(w / 2 - b, -h / 2 + b).lineTo(-w / 2 + b, -h / 2 + b);
    s.holes.push(hole);
    edge = new THREE.Mesh(new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2), mat);
    fill = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), fmat);
  }
  const group = new THREE.Group();
  group.add(edge, fill);
  group.renderOrder = 5;
  edge.renderOrder = 5;
  fill.renderOrder = 5;
  scene.add(group);
  return { group, edge, fill, mat, fmat, from: 0, to: 0 };
}
function clearMarks(): void {
  for (const m of marks) {
    scene.remove(m.group);
    m.edge.geometry.dispose();
    m.fill.geometry.dispose();
  }
  marks.length = 0;
}
function addMark(shape: 'ring' | 'rect', x: number, y: number, z: number, w: number, h: number, from: number, to: number): void {
  const m = makeMark(shape, w, h);
  m.group.position.set(x, y, z);
  m.from = from;
  m.to = to;
  marks.push(m);
}
function stepMarks(T: number): void {
  for (const m of marks) {
    const on = T >= m.from && T <= m.to + 0.25;
    m.group.visible = on && showMarks;
    if (!on) continue;
    const k = Math.min(1, (T - m.from) / Math.max(0.01, m.to - m.from));
    m.fill.scale.set(k, 1, m.fill.geometry.type === 'PlaneGeometry' ? 1 : k);
    m.mat.opacity = 0.55 + 0.4 * Math.abs(Math.sin(T * 9));
    m.fmat.opacity = T > m.to ? 0.6 : 0.22 + 0.18 * k;
  }
}

// ------------------------------------------------------------ снаряды (бочки варенья по дуге)

interface Shot { mesh: THREE.Mesh; a: THREE.Vector3; b: THREE.Vector3; h: number; t0: number; dur: number; done: boolean; kind: 'bomb' | 'drop' }
const shots: Shot[] = [];
const bombGeo = new THREE.SphereGeometry(0.45, 12, 9);
const bombMat = new THREE.MeshStandardMaterial({ color: 0x5a1a6e, roughness: 0.25 });
const fuseMat = new THREE.MeshStandardMaterial({ color: 0xffc061, emissive: 0xff8a2a, emissiveIntensity: 1.5 });
function addShot(a: THREE.Vector3, b: THREE.Vector3, h: number, t0: number, dur: number, kind: Shot['kind'] = 'bomb', size = 1): void {
  const mesh = new THREE.Mesh(bombGeo, bombMat);
  const fuse = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), fuseMat);
  fuse.position.set(0, 0.45, 0);
  mesh.add(fuse);
  mesh.scale.setScalar(size);
  mesh.castShadow = true;
  mesh.visible = false;
  scene.add(mesh);
  shots.push({ mesh, a: a.clone(), b: b.clone(), h, t0, dur, done: false, kind });
}
function clearShots(): void {
  for (const s of shots) scene.remove(s.mesh);
  shots.length = 0;
}
function stepShots(T: number): void {
  for (const s of shots) {
    const u = (T - s.t0) / s.dur;
    s.mesh.visible = u >= 0 && u < 1 && !s.done;
    if (u < 0 || s.done) continue;
    if (u >= 1) {
      s.done = true;
      burst(s.b.x, s.b.y + 0.3, s.b.z, 26, 0x7e2fa8, 6, 5, 0.22, 0.9);
      burst(s.b.x, s.b.y + 0.2, s.b.z, 14, 0xd8c8a8, 4, 3, 0.35, 1.2, 4, 1.8);
      shake = Math.max(shake, 0.25);
      continue;
    }
    s.mesh.position.lerpVectors(s.a, s.b, u);
    s.mesh.position.y += s.kind === 'bomb' ? s.h * 4 * u * (1 - u) : 0;
    s.mesh.rotation.set(T * 5, T * 3, 0);
  }
}

// ------------------------------------------------------------ боссы

interface Boss { def: BossDef; view: ReturnType<typeof buildBoss>; root: THREE.Group; tris: number }
function makeBoss(def: BossDef): Boss {
  const view = buildBoss(def);
  const root = new THREE.Group();
  root.add(view.group);
  root.visible = false;
  scene.add(root);
  return { def, view, root, tris: bossTris(def) };
}
const BOSSES: Record<string, Boss> = { hut: makeBoss(HUT), pelican: makeBoss(PELICAN) };

/** Печные бомбы: куда по ходу стены (x) и когда вылетают (с); летят 0,7 с. Во 2-й фазе — пять */
const HUT_BOMBS1: Array<[number, number]> = [[-11.5, 1.8], [-9, 2.15], [-6.5, 2.5]];
const HUT_BOMBS2: Array<[number, number]> = [[-13, 1.8], [-11, 1.95], [-9, 2.1], [-7, 2.25], [-5, 2.4]];
/** Где стоит Избушка в атаках: 5,5 м до стены, напротив меток */
const HUT_HOME = new THREE.Vector3(-9, 0, -21.5);

let cur: Boss = BOSSES.hut;
let clip: BossClip = HUT.clips[0];
let T = 0;
let loop = true;
let showMarks = true;
let paused = false;
let shake = 0;
let flash = 0;
let hitK = 0;
let path = 0;
let stage = 1;
let rage = false;
let smokeAcc = 0;
const anim: MobAnim = { t: 0, gait: 0, path: 0, speed: 0, st: 0, stT: 0, hit: 0, die: 0, seed: 0.37, rage: false, flags: 0, stage: 1 };

// игровая камера: игрок на ходу стены, камера за спиной, взгляд — на босса
const PLAYER = new THREE.Vector3(-7.4, WALL_H, -14.3);

function bossCenter(out: THREE.Vector3): THREE.Vector3 {
  if (cur.def === HUT) {
    out.copy(cur.root.position).setY(cur.root.position.y + 6);
    if (clip.id === 'nest' && !lineup) {
      // наседка прыгает на стену — камера за ней
      const on = Math.min(1, Math.max(0, (T - 1.8) / 0.8)) * (1 - Math.min(1, Math.max(0, (T - 7.8) / 0.9)));
      out.y += NEST_DY * on - 2.5 * on;
      out.z += NEST_DZ * on;
    }
    return out;
  }
  return out.copy(cur.root.position).setY(cur.root.position.y + 2.2);
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
// ряд с эталонами: боссы крепости рядом с новыми, лицом наружу — к камере за стеной
const REFS = [BARON, GOLEM, BOSS_LESHY, RAM].map((d) => ({ def: d, view: buildPreview(d) }));
const LINE_Z = -27;
const LINE_X: Record<string, number> = { 'boss-baron': -21, 'boss-golem': -16.5, 'boss-leshy': -12.5, 'boss-ram': -1.5 };
const refRoot = new THREE.Group();
for (const r of REFS) {
  r.view.group.position.set(LINE_X[r.def.id], 0, LINE_Z);
  r.view.group.rotation.y = Math.PI;
  refRoot.add(r.view.group);
}
refRoot.visible = false;
scene.add(refRoot);
let lineup = false;
const refAnim: MobAnim = { t: 0, gait: 0, speed: 0, st: 0, stT: 0, hit: 0, die: 0, seed: 0.4, rage: false, flags: 0, stage: 1 };

function setLineup(on: boolean): void {
  lineup = on;
  refRoot.visible = on;
  BOSSES.hut.root.visible = on || cur === BOSSES.hut;
  BOSSES.pelican.root.visible = on || cur === BOSSES.pelican;
  if (on) {
    clearMarks();
    clearShots();
    camera.position.set(-10, 5.5, -47);
    orbit.target.set(-10, 4.2, LINE_Z);
    orbit.update();
  } else play(clip.id);
}

/** Сдвиг камеры от центра босса по виду; над крепостью камера не ниже 9 м (там дома и надвратная башня) */
const VIEWS: Record<string, { hut: [number, number, number]; pelican: [number, number, number] }> = {
  q34: { hut: [4.8, 3, 6.6], pelican: [-6.5, 2.2, 7.5] },
  side: { hut: [-16, 0.5, -1], pelican: [-12, 0.8, -1] },
  back: { hut: [6, 3, -17], pelican: [5, 2.5, -12] },
  high: { hut: [10, 20, 12], pelican: [9, 16, 11] },
};
const lastC = new THREE.Vector3();

function setView(name: string): void {
  if (name === 'lineup') {
    setLineup(true);
    view = name;
    return;
  }
  if (lineup) setLineup(false);
  placeRoot(0);
  cur.root.updateMatrixWorld();
  const c = bossCenter(_v);
  lastC.copy(c);
  view = name;
  if (name === 'game') {
    // за спиной игрока на стене, лицом наружу; взгляд — на босса
    camera.position.copy(PLAYER).add(_u.set(0.8, 2.6, 5));
    orbit.target.copy(c);
  } else {
    const o = VIEWS[name]?.[cur.def === HUT ? 'hut' : 'pelican'] ?? VIEWS.q34.hut;
    camera.position.set(c.x + o[0], c.y + o[1], c.z + o[2]);
    if (camera.position.z > -15 && camera.position.y < 9) camera.position.y = 9;
    orbit.target.copy(c);
  }
  orbit.update();
}

/** Камера идёт за боссом: в игровом виде — только взгляд (игрок стоит на стене), в остальных — вся вместе с орбитой */
function follow(dt: number): void {
  if (lineup) return;
  const c = bossCenter(_v);
  if (view === 'game') orbit.target.lerp(c, 1 - Math.exp(-4 * dt));
  else {
    _w.subVectors(c, lastC);
    if (_w.lengthSq() > 400) _w.set(0, 0, 0);
    camera.position.add(_w);
    orbit.target.add(_w);
  }
  lastC.copy(c);
}
const _u = new THREE.Vector3();
let view = 'game';

// ------------------------------------------------------------ клипы

function setBoss(id: string): void {
  if (lineup) setLineup(false);
  for (const b of Object.values(BOSSES)) b.root.visible = false;
  cur = BOSSES[id];
  cur.root.visible = true;
  stage = 1;
  rage = false;
  path = 0;
  play(cur.def.clips[0].id);
  setView(view);
  renderButtons();
  updateInfo();
}

function play(id: string): void {
  const c = cur.def.clips.find((k) => k.id === id);
  if (!c) return;
  parts.length = 0;
  clip = c;
  T = 0;
  if (c.stage) stage = c.stage;
  if (c.rage !== undefined) rage = c.rage;
  else if (c.id === 'appear') {
    stage = 1;
    rage = false;
  }
  clearMarks();
  clearShots();
  setupMarks(c);
  for (const b of document.querySelectorAll<HTMLButtonElement>('#clips button')) b.classList.toggle('on', b.dataset.clip === id);
  $('note').textContent = c.note;
  updateInfo();
}

function setupMarks(c: BossClip): void {
  const W = HUT_WARN;
  if (cur.def === HUT) {
    const wy = WALL_H + 0.03;
    if (c.mark === 'wall') {
      const hitT = c.id === 'nest' ? 2.6 : W;
      addMark('rect', HUT_HOME.x, wy, -14.6, c.id === 'nest' ? 5.5 : 4, 2.6, 0, hitT);
    } else if (c.mark === 'walk') {
      const xs = stage >= 2 ? HUT_BOMBS2 : HUT_BOMBS1;
      xs.forEach(([x, s]) => addMark('ring', x, wy, -14.4, 1.4, 0, 0, s + 0.7));
    } else if (c.mark === 'ring') {
      addMark('ring', HUT_HOME.x, 0.04, HUT_HOME.z, 9, 0, 0, 2.3);
      addMark('rect', HUT_HOME.x, wy, -14.6, 12, 2.6, 0, 2.3);
    }
    return;
  }
  PELICAN_STAGE.marks(c, stage, addMark);
}

/** События клипа: удары, выстрелы, яйца, дым */
function events(c: BossClip, T0: number, T1: number): void {
  const crossed = (s: number): boolean => T0 < s && T1 >= s;
  if (cur.def === HUT) {
    const r = cur.root;
    if (c.id === 'kick' && crossed(HUT_WARN + 0.1)) {
      const x = HUT_HOME.x - 1;
      burst(x, WALL_H + 0.6, -15.8, 40, 0xcbbfa6, 6, 6, 0.28, 1.4);
      burst(x, WALL_H + 0.4, -15.8, 18, 0x8a7a66, 3, 2, 0.6, 1.6, 2, 2.2);
      shake = 0.6;
    }
    if (c.id === 'bombs') {
      const xs = stage >= 2 ? HUT_BOMBS2 : HUT_BOMBS1;
      const top = _v.set(...HUT_POINTS.chimney).add(r.position);
      xs.forEach(([x, s]) => {
        if (crossed(s)) {
          addShot(top, new THREE.Vector3(x, WALL_H + 0.3, -14.4), 7, T1, 0.7);
          burst(top.x, top.y, top.z, 16, 0x6b6460, 1.5, 4, 0.5, 1.6, -1.2, 2.2);
        }
      });
    }
    if (c.id === 'stomp' && crossed(2.3)) {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        burst(r.position.x + Math.cos(a) * 3, 0.2, r.position.z + Math.sin(a) * 3, 3, 0xd6c29a, 7, 2, 0.45, 1.3, 6, 1.6);
      }
      burst(HUT_HOME.x, WALL_H + 0.5, -15.5, 30, 0xcbbfa6, 5, 4, 0.3, 1.2);
      shake = 0.9;
    }
    if (c.id === 'nest') {
      if (crossed(2.6)) {
        burst(HUT_HOME.x, WALL_H + 0.6, -14.6, 60, 0xcbbfa6, 7, 7, 0.32, 1.6);
        burst(HUT_HOME.x, WALL_H + 0.3, -14.6, 20, 0x8a7a66, 4, 2, 0.7, 1.8, 2, 2.4);
        shake = 1;
      }
      for (const s of [3.7, 5.1, 6.5]) {
        if (crossed(s)) {
          const a = new THREE.Vector3(HUT_HOME.x + (Math.random() - 0.5), WALL_H + 0.4, -13.6);
          addShot(a, new THREE.Vector3(HUT_HOME.x + (Math.random() - 0.5) * 6, 0.4, -9 + Math.random() * 2), 2.5, T1, 0.9, 'bomb', 1.5);
        }
      }
      if (crossed(7.85)) burst(HUT_HOME.x, WALL_H + 0.4, -14.6, 30, 0xcbbfa6, 5, 4, 0.3, 1.2);
    }
    if (c.id === 'appear' && crossed(2.95)) burst(r.position.x, 0.2, r.position.z, 30, 0xd6c29a, 5, 2, 0.4, 1.2, 6, 1.5);
    if (c.die && crossed(2.2)) {
      burst(r.position.x, 0.5, r.position.z - 2, 50, 0xd6c29a, 8, 3, 0.5, 1.6, 6, 1.8);
      burst(r.position.x, 2.5, r.position.z - 2, 24, 0x7d6b5c, 6, 7, 0.22, 1.6);
      shake = 0.8;
    }
    if (c.id === 'hit' && crossed(0.05)) hitK = 1;
    return;
  }
  PELICAN_STAGE.events(c, T0, T1, { burst, addShot, shake: (k: number) => (shake = Math.max(shake, k)), hit: () => (hitK = 1), root: cur.root, stage });
}

function placeRoot(dt: number): void {
  const r = cur.root;
  if (lineup) {
    BOSSES.hut.root.position.set(-7.5, 0, LINE_Z);
    BOSSES.hut.root.rotation.set(0, Math.PI, 0);
    BOSSES.pelican.root.position.set(3.5, 0, LINE_Z);
    BOSSES.pelican.root.rotation.set(0, Math.PI, 0);
    return;
  }
  if (cur.def === HUT) {
    if (clip.id === 'walk') {
      // «стадион» перед стеной: две прямые и два полукруга, курс — по касательной
      const L = 10;
      const R = 4;
      const per = 2 * L + 2 * Math.PI * R;
      const s = ((path % per) + per) % per;
      const cx = HUT_HOME.x;
      const cz = HUT_HOME.z - R - 1;
      let x: number;
      let z: number;
      let yaw: number;
      if (s < L) {
        x = cx - L / 2 + s;
        z = cz + R;
        yaw = Math.PI / 2;
      } else if (s < L + Math.PI * R) {
        const a = (s - L) / R;
        x = cx + L / 2 + R * Math.sin(a);
        z = cz + R * Math.cos(a);
        yaw = Math.PI / 2 + a;
      } else if (s < 2 * L + Math.PI * R) {
        x = cx + L / 2 - (s - L - Math.PI * R);
        z = cz - R;
        yaw = -Math.PI / 2;
      } else {
        const a = (s - 2 * L - Math.PI * R) / R;
        x = cx - L / 2 - R * Math.sin(a);
        z = cz - R * Math.cos(a);
        yaw = -Math.PI / 2 + a;
      }
      r.position.set(x, 0, z);
      r.rotation.set(0, yaw, 0);
    } else {
      r.position.copy(HUT_HOME);
      r.rotation.set(0, 0, 0);
    }
    return;
  }
  PELICAN_STAGE.place(clip, T, dt, path, r, anim);
}

// ------------------------------------------------------------ интерфейс

function renderButtons(): void {
  const box = $('clips');
  box.innerHTML = '';
  let lastPhase = -1;
  for (const c of cur.def.clips) {
    const ph = c.phase ?? 0;
    if (ph !== lastPhase) {
      const h = document.createElement('span');
      h.className = 'grp';
      h.textContent = ph === 0 ? 'Основное' : ph === 4 ? 'Удар и гибель' : `Фаза ${ph}`;
      box.append(h);
      lastPhase = ph;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = c.name;
    b.dataset.clip = c.id;
    b.addEventListener('click', () => play(c.id));
    box.append(b);
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('#clips button')) b.classList.toggle('on', b.dataset.clip === clip.id);
}

function updateInfo(): void {
  $('info').textContent = `${cur.def.name} · ${cur.tris.toLocaleString('ru')} треугольников · ${cur.def.parts.length} частей · фаза ${stage}${rage ? ' · ярость' : ''}`;
}

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-boss]')) {
  b.addEventListener('click', () => {
    for (const o of document.querySelectorAll<HTMLButtonElement>('[data-boss]')) o.classList.toggle('on', o === b);
    setBoss(b.dataset.boss!);
    document.dispatchEvent(new CustomEvent('boss', { detail: b.dataset.boss }));
  });
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-view]')) {
  b.addEventListener('click', () => {
    for (const o of document.querySelectorAll<HTMLButtonElement>('[data-view]')) o.classList.toggle('on', o === b);
    setView(b.dataset.view!);
  });
}
$<HTMLInputElement>('loop').addEventListener('change', (e) => (loop = (e.target as HTMLInputElement).checked));
$<HTMLInputElement>('marks').addEventListener('change', (e) => (showMarks = (e.target as HTMLInputElement).checked));
$('hitbtn').addEventListener('click', () => {
  hitK = 1;
  flash = 1;
});

// ------------------------------------------------------------ кадр

function resize(): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.resize(w, h, Math.min(devicePixelRatio, 2));
  world.resize(w, h);
}
new ResizeObserver(resize).observe(canvas);
resize();
world.setQuality('high');

let visible = true;
new IntersectionObserver((e) => (visible = e[0].isIntersecting)).observe(canvas);

let prev = performance.now();
let elapsed = 0;
let shakeOff = new THREE.Vector3();
const START = params.get('boss') === 'pelican' ? 'pelican' : 'hut';
for (const o of document.querySelectorAll<HTMLButtonElement>('[data-boss]')) o.classList.toggle('on', o.dataset.boss === START);
setBoss(START);
document.dispatchEvent(new CustomEvent('boss', { detail: START }));
for (const [id, el] of [['hut', 'hutTris'], ['pelican', 'pelTris']] as const) {
  const n = document.getElementById(el);
  if (n) n.textContent = `${BOSSES[id].tris.toLocaleString('ru')} треугольников`;
}
if (params.get('clip')) play(params.get('clip')!);
if (params.get('view')) setView(params.get('view')!);

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt0 = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  if (!visible || document.hidden) return;
  const dt = paused ? 0 : dt0;
  elapsed += dt;
  const T0 = T;
  T += dt;
  const c = clip;
  if (c.dur > 0 && T > c.dur + (loop ? 0.8 : 0)) {
    if (loop) {
      T = 0;
          clearShots();
      clearMarks();
      setupMarks(c);
    } else T = c.dur + 0.8;
  }
  const speed = c.speed ?? 0;
  path += speed * dt;
  events(c, T0, T);
  placeRoot(dt);
  // поза
  anim.t = elapsed;
  anim.st = c.st;
  anim.stT = Math.min(T, c.dur > 0 ? c.dur : T);
  anim.speed = speed;
  anim.path = path;
  anim.gait = (path / 1.25) % 1;
  anim.die = c.die ? Math.min(1, T / c.dur) : 0;
  anim.rage = rage;
  anim.stage = stage;
  hitK = Math.max(0, hitK - dt * 2.2);
  anim.hit = hitK;
  if (c.id === 'hit' && T < 0.05) flash = 1;
  flash = Math.max(hitK > 0.95 ? 1 : 0, flash - dt * 6);
  if (lineup) {
    refAnim.t = elapsed;
    for (const r of REFS) r.view.update(refAnim);
    anim.st = 0;
    anim.speed = 0;
    anim.die = 0;
    anim.rage = false;
    BOSSES.hut.view.update(anim);
    anim.st = 9;
    BOSSES.pelican.view.update(anim);
    anim.st = 0;
  } else cur.view.update(anim, flash * 0.6, rage ? _c.setHex(0xff5a3a) : null, 0.12);
  // дым из трубы Избушки
  if (cur.def === HUT && anim.die <= 0) {
    smokeAcc += dt;
    const every = stage >= 2 ? 0.18 : 0.45;
    if (smokeAcc > every) {
      smokeAcc = 0;
      const top = _v.set(...HUT_POINTS.chimney).applyMatrix4(cur.root.matrixWorld);
      if (c.id === 'nest') top.add(_w.set(0, 0, 0));
      burst(top.x, top.y, top.z, 1, stage >= 2 ? 0x5e5652 : 0xd9d4cc, 0.4, 1.4, 0.35, 2.6, -0.6, 3.2);
      if (stage >= 2 && Math.random() < 0.5) burst(top.x, top.y, top.z, 1, 0xffa040, 0.6, 3, 0.07, 0.9, 1);
    }
  }
  stepParts(dt);
  stepMarks(T);
  stepShots(T);
  for (const g of guys) {
    g.pose.yaw = Math.atan2(-(cur.root.position.x - g.pose.x), -(cur.root.position.z - g.pose.z));
    g.a.update(g.pose, dt0, elapsed, GROUND, camera.position, false);
  }
  tickAvatarShared(elapsed, canvas.clientHeight);
  // камера: за боссом, орбита и тряска
  camera.position.sub(shakeOff);
  follow(dt0);
  orbit.update();
  shake = Math.max(0, shake - dt0 * 1.8);
  shakeOff.set((Math.random() - 0.5) * shake * 0.5, (Math.random() - 0.5) * shake * 0.5, (Math.random() - 0.5) * shake * 0.3);
  camera.position.add(shakeOff);
  world.update(dt0, camera.position);
  renderer.beginFrame(false);
  world.renderScene();
  renderer.endFrame();
}
requestAnimationFrame(frame);

(window as unknown as Record<string, unknown>).__bosses = {
  play, setBoss, setView, world, renderer, BOSSES,
  /** Камера рядом с боссом: сдвиг от его центра (и дальше идёт за ним) */
  near(dx: number, dy: number, dz: number) {
    placeRoot(0);
    const c = bossCenter(_v);
    view = 'near';
    camera.position.set(c.x + dx, c.y + dy, c.z + dz);
    orbit.target.copy(c);
    orbit.update();
    lastC.copy(c);
  },
  /** Камера для снимков: откуда и куда смотреть */
  cam(px: number, py: number, pz: number, tx: number, ty: number, tz: number) {
    view = 'free';
    camera.position.set(px, py, pz);
    orbit.target.set(tx, ty, tz);
    orbit.update();
    lastC.copy(bossCenter(_v));
  },
  get T() { return T; },
  /** Замереть на секунде клипа (для снимков); at — общее время (фаза взмаха, дыхания) */
  freeze(id: string, t: number, at?: number) {
    play(id);
    T = t;
    if (at !== undefined) elapsed = at;
    paused = true;
  },
  run() {
    paused = false;
  },
  info: () => ({ boss: cur.def.id, clip: clip.id, T, tris: cur.tris, calls: renderer.gl.info.render.calls, triangles: renderer.gl.info.render.triangles }),
  HS, NEST_DY, NEST_DZ,
};
