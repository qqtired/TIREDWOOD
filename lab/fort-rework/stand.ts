// Стенд мобов «Крепости» для страницы lab/fort-rework: один WebGL на всю страницу, у каждой карточки — свой вид
// (ножницы по прямоугольнику карточки), своя орбита мышью и свои позы. Модели — настоящий код игры:
// процедурные client/fort/mobs (buildPreview, как tools/fort-mobs) и осадные GLB с запечёнными клипами
// (ApprovedMobRenderer, как tools/fortress). Свет и тон — как в крепости (client/fort/world.ts).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ALL_MOBS } from '../../client/fort/mobs/index.ts';
import { MOB_STRIDE, buildPreview, type MobAnim, type MobDef } from '../../client/fort/mobs/kit.ts';
import { mobRoot } from '../../client/fort/mobs/renderer.ts';
import { ApprovedMobRenderer } from '../../client/fort/approved/renderer.ts';

/** Одна поза моба на стенде: состояние сервера, скорость, как идёт время состояния */
export interface Pose {
  st: number;
  speed?: number;
  /** длительность одного показа, с */
  dur: number;
  /** blow — «бьёт» раз в blow с (stT сбрасывается); hold — stT растёт до dur и держит; hit — вздрагивает раз в dur; die — гибель за 1,2 с */
  mode?: 'loop' | 'blow' | 'hold' | 'hit' | 'die' | 'windup';
  blow?: number;
  flags?: number;
  stage?: number;
  rage?: boolean;
  /** красная/цветная метка на земле на время позы (радиус, цвет) */
  ring?: [number, number];
  /** поднять корень (летуны, щупальце из воды) */
  lift?: number;
  /** GLB: имя клипа */
  clip?: string;
}

export interface StandEntry {
  id: string;
  /** процедурная модель (id MobDef) или GLB осады (kind) */
  def?: string;
  glb?: number;
  height: number;
  /** ширина кадра, если модель шире роста (батарея, кран), м */
  span?: number;
  /** высота точки, куда смотрит камера (по умолчанию половина роста), м */
  aim?: number;
  poses: Record<string, Pose>;
  /** порядок показа «по кругу» */
  cycle: string[];
}

interface Card {
  e: StandEntry;
  el: HTMLElement;
  cam: THREE.PerspectiveCamera;
  ctl: OrbitControls;
  view?: ReturnType<typeof buildPreview>;
  anim: MobAnim;
  pose: string;
  /** по кругу или одна поза */
  auto: boolean;
  t: number;
  onPose?: (name: string) => void;
}

const canvas = document.createElement('canvas');
canvas.className = 'fr-gl';
document.body.prepend(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setScissorTest(true);
renderer.setClearColor(0x000000, 0);

const SKY = 0x9fd3ef;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 30, 90);
scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x7f9a5a, 1.55));
const sun = new THREE.DirectionalLight(0xfff4e2, 3.1);
sun.position.set(0.38, 0.8, 0.46).multiplyScalar(40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 120 });
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x8cc06a, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
const path = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 400), new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 1 }));
path.rotation.x = -Math.PI / 2;
path.position.y = 0.006;
path.receiveShadow = true;
scene.add(ground, path);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xff6043, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), ringMat);
const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0xff6043, transparent: true, opacity: 0.22, depthWrite: false }));
for (const m of [ring, disc]) { m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.visible = false; m.renderOrder = 2; scene.add(m); }

const glb = new ApprovedMobRenderer(scene);
const glbRoot = new THREE.Matrix4();
const cards: Card[] = [];
const byDef = new Map(ALL_MOBS.map((d) => [d.id, d] as [string, MobDef]));

/** Ограничение снизу (липкая полоса выбора) — сюда не рисуем */
let bottomInset = 0;
export function setBottomInset(px: number): void { bottomInset = px; }

export function glbReady(): Promise<void> { return glb.ready; }
export function glbError(): string | null { return glb.error; }

function restAnim(seed: number): MobAnim {
  return { t: 12, gait: 0, speed: 0, st: 0, stT: 0, hit: 0, die: 0, seed, rage: false, flags: 0, stage: 0, path: 0 };
}

/** Приклеить стенд к элементу карточки */
export function attach(el: HTMLElement, e: StandEntry, onPose?: (name: string) => void): { setPose(name: string | null): void } {
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 300);
  const h = Math.max(e.height, (e.span ?? 0) * 0.75);
  const d = h * 2.2 + 2.6;
  cam.position.set(d * 0.55, h * 0.55 + d * 0.22, d * 0.82);
  const ctl = new OrbitControls(cam, el);
  ctl.target.set(0, e.aim ?? h * 0.48, 0);
  ctl.enableDamping = true;
  ctl.enablePan = false;
  ctl.minDistance = Math.max(1.4, h * 0.9);
  ctl.maxDistance = d * 2.2;
  ctl.maxPolarAngle = Math.PI * 0.49;
  ctl.autoRotate = true;
  ctl.autoRotateSpeed = 0.9;
  ctl.addEventListener('start', () => { ctl.autoRotate = false; });
  ctl.update();
  const card: Card = { e, el, cam, ctl, anim: restAnim(0.5), pose: e.cycle[0], auto: true, t: 0, onPose };
  if (e.def) {
    const def = byDef.get(e.def);
    if (def) {
      card.view = buildPreview(def);
      card.view.group.visible = false;
      card.view.group.rotation.y = 0.35;
      scene.add(card.view.group);
    }
  }
  cards.push(card);
  if (e.glb !== undefined) {
    void glb.ready.then(() => {
      for (const p of Object.values(e.poses)) if (p.clip && !p.dur) p.dur = glb.duration(e.glb!, p.clip);
    });
  }
  return {
    setPose(name) {
      card.auto = name === null;
      card.pose = name ?? e.cycle[0];
      card.t = 0;
      resetAnim(card);
      card.onPose?.(card.pose);
    },
  };
}

function resetAnim(c: Card): void {
  const a = c.anim;
  a.stT = 0; a.hit = 0; a.die = 0;
}

function poseLen(p: Pose): number {
  if (p.mode === 'die') return p.clip ? p.dur + 0.6 : 1.9;
  return Math.max(0.3, p.dur);
}

/** Шаг одной карточки: время, смена позы по кругу, заполнение MobAnim */
function step(c: Card, dt: number): void {
  const e = c.e;
  c.t += dt;
  let p = e.poses[c.pose];
  if (c.t >= poseLen(p)) {
    c.t -= poseLen(p);
    if (c.auto) {
      const i = e.cycle.indexOf(c.pose);
      c.pose = e.cycle[(i + 1) % e.cycle.length];
      resetAnim(c);
      c.onPose?.(c.pose);
      p = e.poses[c.pose];
    } else if (p.mode === 'die' || p.mode === 'hold' || p.mode === 'windup') resetAnim(c);
  }
  const a = c.anim;
  a.t += dt;
  a.st = p.st;
  a.speed = p.speed ?? 0;
  a.flags = p.flags ?? 0;
  a.stage = p.stage ?? 0;
  a.rage = !!p.rage;
  a.gait = (a.gait + (a.speed * dt) / MOB_STRIDE) % 1;
  a.path = (a.path ?? 0) + a.speed * dt;
  a.stT += dt;
  if (p.mode === 'blow') { const b = p.blow ?? 0.8; if (a.stT >= b) a.stT -= b; }
  if (p.mode === 'windup') a.stT = Math.min(a.stT, 0.19);
  if (p.mode === 'hit') { const k = c.t % 1; a.hit = Math.max(0, 1 - k * 3); }
  else a.hit = Math.max(0, a.hit - dt * 3);
  a.die = p.mode === 'die' ? Math.min(1, c.t / 1.2) : 0;
}

const _v = new THREE.Vector3();
let last = performance.now();
let frozen = -1;
/** Для снимков: остановить все карточки на этой позе и времени */
export function freezeAll(pose: string | null, t: number): void {
  frozen = pose ? t : -1;
  for (const c of cards) {
    if (!pose) { c.auto = true; continue; }
    const name = c.e.poses[pose] ? pose : c.e.cycle[0];
    c.auto = false; c.pose = name; c.t = 0; resetAnim(c); c.anim.gait = 0.25;
    step(c, t);
    c.onPose?.(c.pose);
    c.ctl.autoRotate = false;
  }
}

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = frozen >= 0 ? 0 : Math.min(0.05, (now - last) / 1000);
  last = now;
  const W = innerWidth;
  const H = innerHeight;
  if (canvas.width !== Math.round(W * renderer.getPixelRatio()) || canvas.height !== Math.round(H * renderer.getPixelRatio())) renderer.setSize(W, H, false);
  // фон сцены каждый раз переставляет цвет очистки — весь холст чистим в прозрачный заново
  renderer.setClearColor(0x000000, 0);
  renderer.setScissor(0, 0, W, H);
  renderer.clear();
  const limit = H - bottomInset;
  for (const c of cards) {
    const r = c.el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > limit || r.width < 2 || c.el.offsetParent === null) continue;
    if (dt > 0) step(c, dt);
    c.ctl.update();
    const p = c.e.poses[c.pose];
    const lift = p.lift ?? 0;
    if (c.view) {
      c.view.group.visible = true;
      c.view.group.position.y = lift;
      c.view.update(c.anim, c.anim.hit * 0.8);
    } else if (c.e.glb !== undefined) {
      glb.begin();
      mobRoot(glbRoot, 0, lift, 0, Math.PI - 0.35);
      const pz = c.e.poses[c.pose];
      if (pz.clip) {
        const dur = glb.duration(c.e.glb, pz.clip);
        const time = pz.mode === 'die' ? Math.min(1, c.t / Math.max(0.1, pz.dur)) * dur : pz.mode === 'loop' || !pz.mode ? c.t % dur : Math.min(c.t, dur);
        glb.addClip(c.e.glb, glbRoot, pz.clip, time, pz.mode === 'hit' ? Math.max(0, 1 - (c.t % 1) * 4) * 0.6 : 0);
      }
      glb.end();
    }
    if (p.ring) {
      const [rad, color] = p.ring;
      const k = Math.min(1, c.t / Math.max(0.2, p.dur));
      ringMat.color.setHex(color);
      (disc.material as THREE.MeshBasicMaterial).color.setHex(color);
      ring.scale.setScalar(rad);
      disc.scale.setScalar(rad * k);
      ring.visible = disc.visible = true;
    }
    const top = Math.max(0, r.top);
    const bottom = Math.min(limit, r.bottom);
    c.cam.aspect = r.width / r.height;
    c.cam.updateProjectionMatrix();
    renderer.setViewport(r.left, H - r.bottom, r.width, r.height);
    renderer.setScissor(r.left, H - bottom, r.width, bottom - top);
    // тень — вокруг этой модели
    const span = Math.max(4, c.e.height * 1.6);
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span });
    sun.shadow.camera.updateProjectionMatrix();
    _v.set(0.38, 0.8, 0.46).normalize().multiplyScalar(40);
    sun.position.copy(_v);
    renderer.render(scene, c.cam);
    if (c.view) c.view.group.visible = false;
    ring.visible = disc.visible = false;
    if (c.e.glb !== undefined) { glb.begin(); glb.end(); }
  }
}
requestAnimationFrame(frame);

Object.assign(window, { __stand: { cards, freezeAll, glb, renderer } });
