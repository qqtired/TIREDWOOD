// Стенд мобов «Крепости»: любая модель из client/fort/mobs крупно, с позами по состояниям, ударом, гибелью и хитбоксом
// её вида. Параметры адреса для снимков: ?mob=<id>|all &st=<ZS> &speed=<м/с> &freeze=<секунды> &yaw=<градусы>
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ALL_MOBS } from '../../client/fort/mobs/index.ts';
import { buildPreview, type MobAnim, type MobDef } from '../../client/fort/mobs/kit.ts';
import { ZK } from '../../shared/fortkinds.ts';

const STATES: Array<[number, string]> = [
  [0, 'идёт'], [1, 'бьёт ворота/игрока'], [2, 'лезет по стене'], [3, 'на стене'], [4, 'спрыгнул во двор'],
  [5, 'крылатка: замерла'], [6, 'крылатка: пике'], [7, 'крылатка: выход'], [8, 'босс: по воротам'], [9, 'босс: бомба'],
  [10, 'босс: волна'], [11, 'босс: ядро открыто'], [12, 'босс: подходит'], [13, 'плевок'], [14, 'закладка'],
  [15, 'прыжок'], [16, 'в лодке'], [17, 'высадка'], [18, 'отплытие'], [19, 'таран: прицел'], [20, 'таран: разгон'],
  [21, 'топот'], [22, 'бросок'], [23, 'землетрясение'], [24, 'щупальце: ждёт'], [25, 'щупальце: удар'],
  [26, 'щупальце: отдых'], [27, 'кракен: нырок'], [28, 'кракен: плевок'], [29, 'метеор'], [30, 'бочка'], [31, 'вой'],
];
const STRIDE = 1.25;
const q = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd3ef);
scene.fog = new THREE.Fog(0x9fd3ef, 30, 80);
scene.add(new THREE.HemisphereLight(0xfff4dc, 0x6c8a4a, 1.25));
const sun = new THREE.DirectionalLight(0xfff0d0, 2.2);
sun.position.set(6, 10, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 });
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x8cc06a, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const path = new THREE.Mesh(new THREE.PlaneGeometry(4, 200), new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 1 }));
path.rotation.x = -Math.PI / 2;
path.position.y = 0.005;
path.receiveShadow = true;
scene.add(path);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
camera.position.set(3.2, 2.2, 5.2);

interface Shown { def: MobDef; view: ReturnType<typeof buildPreview>; box: THREE.Object3D; anim: MobAnim }
let shown: Shown[] = [];

function hitbox(def: MobDef): THREE.Object3D {
  const g = new THREE.Group();
  const k = ZK[def.kinds[0]];
  if (!k) return g;
  const mat = new THREE.MeshBasicMaterial({ color: 0xff3366, wireframe: true, transparent: true, opacity: 0.35 });
  const e = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), mat);
  e.scale.set(k.hrx, k.hry, k.hrx);
  e.position.y = k.hcy;
  const head = new THREE.Mesh(new THREE.RingGeometry(k.hrx * 0.9, k.hrx, 32), new THREE.MeshBasicMaterial({ color: 0xffcc00, side: THREE.DoubleSide }));
  head.rotation.x = -Math.PI / 2;
  head.position.y = k.headY;
  g.add(e, head);
  return g;
}

function show(id: string): void {
  for (const s of shown) scene.remove(s.view.group, s.box);
  const defs = id === 'all' ? [...ALL_MOBS] : ALL_MOBS.filter((d) => d.id === id);
  const gap = 2.6;
  shown = defs.map((def, i) => {
    const view = buildPreview(def);
    const x = (i - (defs.length - 1) / 2) * gap;
    view.group.position.x = x;
    view.group.rotation.y = (Number(q.get('yaw') ?? 20) * Math.PI) / 180;
    const box = hitbox(def);
    box.position.x = x;
    box.visible = $<HTMLInputElement>('box').checked;
    scene.add(view.group, box);
    return { def, view, box, anim: { t: 0, gait: 0, speed: 0, st: 0, stT: 0, hit: 0, die: 0, seed: (i * 0.37 + 0.13) % 1, rage: false } };
  });
  const top = Math.max(1.5, ...defs.map((d) => d.height));
  controls.target.set(0, top * 0.5, 0);
  if (id === 'all') camera.position.set(0, top * 1.1, Math.max(8, defs.length * 1.6));
  else camera.position.set(top * 1.6, top * 1.1, top * 2.6);
  note();
}

function note(): void {
  $('note').textContent = shown.length === 1
    ? `${shown[0].def.name} (${shown[0].def.id}) · рост ${shown[0].def.height} м · частей ${shown[0].def.parts.length} · треугольников ${tris(shown[0].def)}\nрозовый — хитбокс вида, жёлтое кольцо — выше него «в голову»`
    : `моделей: ${shown.length} · мышь — орбита · колесо — приближение`;
}
function tris(def: MobDef): number {
  return def.parts.reduce((n, p) => n + (p.geo.index ? p.geo.index.count : p.geo.getAttribute('position').count) / 3, 0);
}

const mobSel = $<HTMLSelectElement>('mob');
mobSel.add(new Option('— все рядом —', 'all'));
for (const d of ALL_MOBS) mobSel.add(new Option(`${d.name} · ${d.id}`, d.id));
const stSel = $<HTMLSelectElement>('st');
for (const [v, label] of STATES) stSel.add(new Option(`${v} · ${label}`, String(v)));
mobSel.value = q.get('mob') ?? (ALL_MOBS[0]?.id ?? 'all');
stSel.value = q.get('st') ?? '0';
$<HTMLInputElement>('speed').value = q.get('speed') ?? '2.4';
mobSel.onchange = () => show(mobSel.value);
stSel.onchange = () => { for (const s of shown) s.anim.stT = 0; };
$('hit').onclick = () => { for (const s of shown) s.anim.hit = 1; };
$('die').onclick = () => { for (const s of shown) s.anim.die = 0.001; };
$<HTMLInputElement>('box').onchange = (e) => { for (const s of shown) s.box.visible = (e.target as HTMLInputElement).checked; };
show(mobSel.value);

const freeze = q.has('freeze') ? Number(q.get('freeze')) : -1;
let last = performance.now();
function frame(now: number): void {
  const dt = freeze >= 0 ? 0 : Math.min(0.05, (now - last) / 1000);
  last = now;
  const w = innerWidth;
  const h = innerHeight;
  if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const speed = Number($<HTMLInputElement>('speed').value);
  const st = Number(stSel.value);
  const rage = $<HTMLInputElement>('rage').checked;
  for (const s of shown) {
    const a = s.anim;
    if (freeze >= 0) {
      a.t = freeze; a.stT = freeze; a.gait = (freeze * speed / STRIDE) % 1;
    } else {
      a.t += dt; a.stT += dt; a.gait = (a.gait + (speed * dt) / STRIDE) % 1;
      a.hit = Math.max(0, a.hit - dt * 3);
      if (a.die > 0) a.die = a.die >= 1 ? 0 : Math.min(1, a.die + dt / 1.2);
    }
    a.speed = speed; a.st = st; a.rage = rage;
    s.view.update(a);
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
Object.assign(window, { __mobs: { ALL_MOBS, show, shown: () => shown } });
