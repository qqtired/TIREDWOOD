// Стенд мобов «Крепости»: любая модель из client/fort/mobs крупно, с позами по состояниям, ударом, гибелью и хитбоксом
// её вида. Свет, тон и материал — как в крепости. Параметры адреса (для снимков):
//   ?mob=<id> | all | set:a … set:e | kind:<Z_*> | sample — что показать (без моделей в наборах — образец стенда)
//   &set=a — то же, что mob=set:a;  &st=<ZS>;  &speed=<м/с>;  &seed=<0…1> (одна модель)
//   &freeze=<с> — замереть на этом времени (t, stT, шаг);  &hit=<0…1> &die=<0…1> &flash=<0…1> — в замершем кадре
//   &yaw=<градусы>;  &view=q34|front|side|wall;  &dist=<м> (со стены — 25);  &rage=1;  &box=0;  &clean=1 (без панелей)
//   &blow=<с> — как часто «бьёт» в ZS_ATTACK (крепость обнуляет stT на каждом ударе), по умолчанию 0,8
//   &crowd=<N> — толпа из N особей выбранных моделей идёт к стене через MobRenderer (инстансы, как в крепости):
//                варианты по seed, скорость вида, вспышки попаданий; вид по умолчанию — со стены
//   &squeeze=<0…1> — сжать корень особей, как босса в воротах (ниже на 42 %, уже на 20 %) — проверить свет
//   &flags=<ZF_*> — признаки особи в anim.flags (8 — экипаж: в толпе выберет особые варианты when; 16 — щит цел);
//   &stage=<n> — байт stage в anim.stage (фаза босса, номер щупальца, сколько экипажа в лодке)
//   &q=low|medium|high — качество толпы (на низком у вида один вариант, без теней)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ALL_MOBS, MOB_SETS } from '../../client/fort/mobs/index.ts';
import { MOB_STRIDE, buildPreview, newPose, type MobAnim, type MobDef } from '../../client/fort/mobs/kit.ts';
import { MobRenderer, mobRoot } from '../../client/fort/mobs/renderer.ts';
import { KF_BOSS, ZK } from '../../shared/fortkinds.ts';
import { SAMPLE } from './sample.ts';

const STATES: Array<[number, string]> = [
  [0, 'идёт'], [1, 'бьёт ворота/игрока'], [2, 'лезет по стене'], [3, 'на стене'], [4, 'спрыгнул во двор'],
  [5, 'крылатка: замерла'], [6, 'крылатка: пике'], [7, 'крылатка: выход'], [8, 'босс: по воротам'], [9, 'босс: бомба'],
  [10, 'босс: волна'], [11, 'босс: ядро открыто'], [12, 'босс: подходит'], [13, 'плевок'], [14, 'закладка'],
  [15, 'прыжок'], [16, 'в лодке'], [17, 'высадка'], [18, 'отплытие'], [19, 'таран: прицел'], [20, 'таран: разгон'],
  [21, 'топот'], [22, 'бросок'], [23, 'землетрясение'], [24, 'щупальце: ждёт'], [25, 'щупальце: удар'],
  [26, 'щупальце: отдых'], [27, 'кракен: нырок'], [28, 'кракен: плевок'], [29, 'метеор'], [30, 'бочка'], [31, 'вой'],
];
const q = new URLSearchParams(location.search);
const num = (key: string, d: number): number => (q.has(key) && Number.isFinite(Number(q.get(key))) ? Number(q.get(key)) : d);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
if (q.get('clean') === '1') document.body.classList.add('clean');
/** В атаке крепость обнуляет stT на каждом ударе — стенд «бьёт» раз в blow секунд */
const blow = num('blow', 0.8);

const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd3ef);
scene.fog = new THREE.Fog(0x9fd3ef, 40, 120);
// свет как в крепости (client/fort/world.ts): голубое небо, отсвет травы, высокое солнце с юга — враги идут лицом к нему
scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x7f9a5a, 1.55));
const sun = new THREE.DirectionalLight(0xfff4e2, 3.1);
const SUN_DIR = new THREE.Vector3(0.38, 0.8, 0.46).normalize();
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x8cc06a, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const path = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 400), new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 1 }));
path.rotation.x = -Math.PI / 2;
path.position.y = 0.005;
path.receiveShadow = true;
scene.add(path);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
const controls = new OrbitControls(camera, renderer.domElement);

interface Shown {
  def: MobDef;
  view: ReturnType<typeof buildPreview>;
  box: THREE.Object3D;
  anim: MobAnim;
  dieT: number;
  flash: number;
}
let shown: Shown[] = [];

function kindOf(def: MobDef) {
  return ZK[def.kinds[0]] ?? ZK[0];
}

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

const FLAGS = Math.max(0, Math.floor(num('flags', 0)));
const STAGE = Math.max(0, Math.floor(num('stage', 0)));

function restAnim(seed = 0.5): MobAnim {
  return { t: 0, gait: 0, speed: 0, st: 0, stT: 0, hit: 0, die: 0, seed, rage: false, flags: FLAGS, stage: STAGE };
}

/** Габариты модели в покое (по позе, с костями) — сверить с хитбоксом */
function measure(def: MobDef): THREE.Box3 {
  const pose = newPose();
  def.pose(restAnim(), pose);
  const box = new THREE.Box3();
  const b = new THREE.Box3();
  for (const part of def.parts) {
    if (!part.geo.boundingBox) part.geo.computeBoundingBox();
    b.copy(part.geo.boundingBox!).applyMatrix4(pose[part.bone]);
    box.union(b);
  }
  return box;
}

function tris(def: MobDef): number {
  return def.parts.reduce((n, p) => n + (p.geo.index ? p.geo.index.count : p.geo.getAttribute('position').count) / 3, 0);
}

function listFor(sel: string): MobDef[] {
  if (sel === 'sample') return [SAMPLE];
  if (sel === 'all') return ALL_MOBS.length ? [...ALL_MOBS] : [SAMPLE];
  if (sel.startsWith('set:')) return [...(MOB_SETS[sel.slice(4) as keyof typeof MOB_SETS] ?? [])];
  if (sel.startsWith('kind:')) {
    const kind = Number(sel.slice(5));
    return ALL_MOBS.filter((d) => d.kinds.includes(kind));
  }
  const one = ALL_MOBS.find((d) => d.id === sel);
  return one ? [one] : [];
}

let current = '';
let span = { w: 2, h: 1.6 };

// --- толпа через MobRenderer
interface CrowdMob { kind: number; seed: number; x: number; z: number; v: number; anim: MobAnim; flash: number }
const crowdN = Math.min(400, Math.max(0, Math.floor(num('crowd', 0))));
let crowd: { r: MobRenderer; mobs: CrowdMob[] } | null = null;
let rng = 12345;
const rand = (): number => ((rng = (Math.imul(rng, 1103515245) + 12345) >>> 0) / 4294967296);
const _root = new THREE.Matrix4();
const squeeze = Math.min(1, Math.max(0, num('squeeze', 0)));
const _squeeze = new THREE.Matrix4().makeScale(1 - 0.2 * squeeze, 1 - 0.42 * squeeze, 1 - 0.2 * squeeze);

function startCrowd(defs: MobDef[]): void {
  crowd?.r.dispose();
  crowd = null;
  if (!defs.length) return;
  const quality = q.get('q');
  const r = new MobRenderer(scene, defs, quality === 'low' || quality === 'medium' ? quality : 'high', { castShadow: true });
  // как в крепости: тени стен на мобов падают, своих теней на себе нет (там карта теней статичная)
  r.group.traverse((o) => { o.receiveShadow = false; });
  const kinds = [...new Set(defs.flatMap((d) => d.kinds))];
  rng = 12345;
  const mobs: CrowdMob[] = [];
  for (let i = 0; i < crowdN; i++) {
    const kind = kinds[i % kinds.length];
    const v = (ZK[kind]?.speed ?? 2.4) * (0.85 + rand() * 0.3);
    mobs.push({ kind, seed: rand(), x: (rand() - 0.5) * 16, z: -4 - rand() * 40, v, flash: 0,
      anim: { t: rand() * 10, gait: rand(), speed: v, st: 0, stT: rand(), hit: 0, die: 0, seed: 0, rage: false, flags: FLAGS, stage: STAGE } });
  }
  crowd = { r, mobs };
  span = { w: 16, h: 2 };
}

function stepCrowd(dt: number, st: number, rage: boolean): void {
  if (!crowd) return;
  const { r, mobs } = crowd;
  r.begin();
  for (const m of mobs) {
    const a = m.anim;
    const moving = st === 0;
    const v = moving ? m.v : 0;
    m.z += v * dt;
    if (m.z > 6) m.z -= 46;
    a.t += dt;
    a.stT += dt;
    if (st === 1 && a.stT >= blow) a.stT -= blow;
    a.gait = (a.gait + (v * dt) / MOB_STRIDE) % 1;
    a.speed = v;
    a.st = st;
    a.rage = rage;
    a.seed = m.seed;
    if (rand() < dt * 0.25) { a.hit = 1; m.flash = 1; }
    a.hit = Math.max(0, a.hit - dt * 3);
    m.flash = Math.max(0, m.flash - dt * 7);
    mobRoot(_root, m.x, 0, m.z, Math.PI);
    if (squeeze > 0) _root.multiply(_squeeze);
    r.add(m.kind, m.seed, _root, a, m.flash);
  }
  r.end();
}

function show(sel: string): void {
  current = sel;
  for (const s of shown) scene.remove(s.view.group, s.box);
  const defs = listFor(sel);
  if (crowdN > 0) {
    shown = [];
    startCrowd(defs);
    placeCamera();
    const r = 30;
    sun.position.copy(SUN_DIR).multiplyScalar(60).add(new THREE.Vector3(0, 0, -15));
    sun.target.position.set(0, 0, -15);
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 160 });
    sun.shadow.camera.updateProjectionMatrix();
    note();
    return;
  }
  const widths = defs.map((d) => Math.max(1.5, 2 * kindOf(d).hrx + 0.9));
  const total = widths.reduce((a, b) => a + b, 0);
  let x = -total / 2;
  const yaw = (num('yaw', 20) * Math.PI) / 180;
  shown = defs.map((def, i) => {
    const view = buildPreview(def);
    const cx = x + widths[i] / 2;
    x += widths[i];
    view.group.position.x = cx;
    view.group.rotation.y = yaw;
    const box = hitbox(def);
    box.position.x = cx;
    box.visible = $<HTMLInputElement>('box').checked;
    scene.add(view.group, box);
    const seed = defs.length === 1 ? num('seed', 0.5) : (i * 0.37 + 0.13) % 1;
    return { def, view, box, anim: restAnim(seed), dieT: 0, flash: 0 };
  });
  span = { w: Math.max(2, total), h: Math.max(1.5, ...defs.map((d) => d.height)) };
  placeCamera();
  const r = Math.max(span.w / 2, span.h) + 3;
  sun.position.copy(SUN_DIR).multiplyScalar(40);
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 120 });
  sun.shadow.camera.updateProjectionMatrix();
  note();
}

function placeCamera(): void {
  const { w, h } = span;
  const view = $<HTMLSelectElement>('view').value;
  if (crowd) {
    // со стены: глаза защитника на ~5 м, враги в 10–40 м
    const d = num('dist', 10);
    controls.target.set(0, 0.6, -14);
    if (view === 'front') camera.position.set(0, 1.6, 8);
    else if (view === 'side') camera.position.set(22, 4, -14);
    else camera.position.set(0, 5, d - 4);
    scene.fog = new THREE.Fog(0x9fd3ef, 60, 160);
    controls.update();
    return;
  }
  const aspect = innerWidth / Math.max(1, innerHeight);
  const fit = (w / 2 + 0.8) / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(aspect, 2.2));
  const near = shown.length > 1 ? Math.max(fit, h * 2.6) : h * 3.1;
  const d = num('dist', view === 'wall' ? 25 : near);
  controls.target.set(0, h * 0.5, 0);
  if (view === 'wall') camera.position.set(0, 5, d);
  else if (view === 'front') camera.position.set(0, h * 0.62, d);
  else if (view === 'side') camera.position.set(d, h * 0.62, 0);
  else camera.position.set(d * 0.52, h * 0.55 + d * 0.22, d * 0.85);
  if (shown.length > 1 && view === 'q34') camera.position.set(d * 0.22, h * 0.6 + d * 0.12, d);
  scene.fog = new THREE.Fog(0x9fd3ef, d * 2.5, d * 6 + 60);
  controls.update();
}

function note(): void {
  if (crowd) {
    const info = renderer.info.render;
    $('note').textContent = `толпа: ${crowd.mobs.length} особей · моделей ${listFor(current).length} · вызовов отрисовки ${info.calls} · треугольников ${info.triangles.toLocaleString('ru')}`;
    return;
  }
  if (shown.length !== 1) {
    $('note').textContent = `моделей: ${shown.length} · мышь — орбита · колесо — приближение`;
    return;
  }
  const { def } = shown[0];
  const k = kindOf(def);
  const box = measure(def);
  const size = box.getSize(new THREE.Vector3());
  const t = Math.round(tris(def));
  const boss = def.kinds.some((kind) => ((ZK[kind]?.flags ?? 0) & KF_BOSS) !== 0);
  const over = def.parts.length > 6 || t > (boss ? 6000 : 1500) ? ' ⚠ бюджет: до 6 частей, до 1500 треугольников (босс — 6000)' : '';
  const f = (v: number) => v.toFixed(2);
  $('note').textContent = `${def.name} (${def.id}) · виды: ${def.kinds.map((kind) => ZK[kind]?.name ?? kind).join(', ')} · рост ${def.height} м · частей ${def.parts.length} · треугольников ${t}${over}\n`
    + `в покое: верх ${f(box.max.y)} м, низ ${f(box.min.y)}, ширина ${f(size.x)}, глубина ${f(size.z)} · хитбокс: верх ${f(k.hcy + k.hry)}, «в голову» выше ${f(k.headY)}, радиус ${f(k.hrx)}\n`
    + `розовый — хитбокс вида, жёлтое кольцо — выше него «в голову»`;
}

const mobSel = $<HTMLSelectElement>('mob');
mobSel.add(new Option('— все рядом —', 'all'));
for (const [letter, list] of Object.entries(MOB_SETS)) if (list.length) mobSel.add(new Option(`— набор ${letter.toUpperCase()} (${list.length}) —`, `set:${letter}`));
const kinds = [...new Set(ALL_MOBS.flatMap((d) => d.kinds))].sort((a, b) => a - b);
for (const kind of kinds) mobSel.add(new Option(`— вид: ${ZK[kind]?.name ?? kind} —`, `kind:${kind}`));
for (const d of ALL_MOBS) mobSel.add(new Option(`${d.name} · ${d.id}`, d.id));
mobSel.add(new Option(`${SAMPLE.name}`, 'sample'));
const stSel = $<HTMLSelectElement>('st');
for (const [v, label] of STATES) stSel.add(new Option(`${v} · ${label}`, String(v)));
const viewSel = $<HTMLSelectElement>('view');
const want = q.get('set') ? `set:${q.get('set')}` : (q.get('mob') ?? (crowdN > 0 ? 'all' : ALL_MOBS[0]?.id ?? 'sample'));
mobSel.value = [...mobSel.options].some((o) => o.value === want) ? want : 'sample';
stSel.value = q.get('st') ?? '0';
viewSel.value = q.get('view') ?? (crowdN > 0 ? 'wall' : 'q34');
$<HTMLInputElement>('speed').value = String(num('speed', 2.4));
$<HTMLInputElement>('rage').checked = q.get('rage') === '1';
$<HTMLInputElement>('box').checked = q.get('box') !== '0';
mobSel.onchange = () => show(mobSel.value);
viewSel.onchange = () => placeCamera();
stSel.onchange = () => { for (const s of shown) s.anim.stT = 0; };
$('hit').onclick = () => { for (const s of shown) { s.anim.hit = 1; s.flash = 1; } };
$('die').onclick = () => { for (const s of shown) s.dieT = 0.001; };
$<HTMLInputElement>('box').onchange = (e) => { for (const s of shown) s.box.visible = (e.target as HTMLInputElement).checked; };
show(mobSel.value);

const freeze = q.has('freeze') ? num('freeze', 0) : -1;
const DIE_S = 1.2;
let last = performance.now();
let lastW = 0;
let lastH = 0;
let noteAt = 0;
function frame(now: number): void {
  const dt = freeze >= 0 ? (crowd ? 1 / 60 : 0) : Math.min(0.05, (now - last) / 1000);
  last = now;
  if (innerWidth !== lastW || innerHeight !== lastH) {
    lastW = innerWidth;
    lastH = innerHeight;
    renderer.setSize(lastW, lastH, false);
    camera.aspect = lastW / lastH;
    camera.updateProjectionMatrix();
    placeCamera();
  }
  const speed = Number($<HTMLInputElement>('speed').value);
  const st = Number(stSel.value);
  const rage = $<HTMLInputElement>('rage').checked;
  stepCrowd(dt, st, rage);
  if (crowd && now - noteAt > 500) {
    noteAt = now;
    note();
  }
  for (const s of shown) {
    const a = s.anim;
    if (freeze >= 0) {
      a.t = freeze;
      a.stT = freeze;
      a.gait = ((freeze * speed) / MOB_STRIDE) % 1;
      a.hit = num('hit', 0);
      a.die = num('die', 0);
      s.flash = num('flash', 0);
    } else {
      a.t += dt;
      a.stT += dt;
      // в атаке крепость обнуляет stT на каждом ударе — здесь «бьём» раз в blow секунд
      if (st === 1 && blow > 0 && a.stT >= blow) a.stT -= blow;
      a.gait = (a.gait + (speed * dt) / MOB_STRIDE) % 1;
      a.hit = Math.max(0, a.hit - dt * 3);
      s.flash = Math.max(0, s.flash - dt * 7);
      // гибель: 0 → 1 за 1,2 с, полсекунды лежит, потом снова живой
      if (s.dieT > 0) {
        s.dieT += dt;
        if (s.dieT > DIE_S + 0.6) s.dieT = 0;
      }
      a.die = Math.min(1, s.dieT / DIE_S);
    }
    a.speed = speed;
    a.st = st;
    a.rage = rage;
    s.view.update(a, s.flash);
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
Object.assign(window, { __mobs: { ALL_MOBS, MOB_SETS, show, shown: () => shown, current: () => current } });
