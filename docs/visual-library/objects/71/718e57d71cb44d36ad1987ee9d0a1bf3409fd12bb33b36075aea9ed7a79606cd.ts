// Проверка модели музыкального автомата (client/lobby/jukebox3d.ts): автомат на плитке, свет и кривая тона как на
// набережной, OrbitControls; «играет / молчит», темп и синтетические bands/beat (синусы). Только для сервера разработки.
// Для снимков: window.__jb — view(имя), play(вкл), bpm(темп), box(вкл), warm(секунд), stats(), bounds().
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/900.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Jukebox3D } from '../../client/lobby/jukebox3d.ts';
import { installLookTone, paintMaterial } from '../../client/render/lookpaint.ts';
import { JUKEBOX, JUKE_D, JUKE_H, JUKE_W } from '../../shared/jukebox.ts';

installLookTone();
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.CustomToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// как в игре: тени статики считаются по запросу
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cc3ec);
const { x: X, z: Z } = JUKEBOX;
// свет нового вида набережной (client/lobby/look.ts): золотистое солнце с запада, голубоватое небо
scene.add(new THREE.HemisphereLight(0xb2c8f4, 0xd2a57c, 1.3));
const sun = new THREE.DirectionalLight(0xffd49a, 3.4);
sun.position.set(X, 0, Z).addScaledVector(new THREE.Vector3(-0.904, 0.408, -0.127), 20);
sun.target.position.set(X, 0, Z);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 50 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 3;
scene.add(sun, sun.target);

// плитка площади: тёплые квадраты со швами
function tiles(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#b89a76';
  ctx.fillRect(0, 0, 256, 256);
  const cols = ['#ead6b2', '#e2cba4', '#efdcbc', '#dcc49c'];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    ctx.fillStyle = cols[(i * 3 + j * 5) % 4];
    ctx.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(20, 20);
  t.anisotropy = 8;
  return t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tiles(), roughness: 0.9 }));
ground.position.set(X, 0, Z);
ground.receiveShadow = true;
scene.add(ground);

const juke = new Jukebox3D(scene);
// «рисованные» материалы, как у набережной в новом виде (client/lobby/look.ts → paintAll)
const lum = 0.2126 * sun.color.r + 0.7152 * sun.color.g + 0.0722 * sun.color.b;
const look = { grain: true, uniforms: { uLookShade: { value: new THREE.Color(0.9, 0.96, 1.22) }, uLookSunInv: { value: 1.6 / (sun.intensity * lum) } } };
scene.traverse((o) => {
  const m = (o as THREE.Mesh).material;
  if (m && !Array.isArray(m)) paintMaterial(m, look);
});
const collider = new THREE.Box3(new THREE.Vector3(X - JUKE_W / 2, 0, Z - JUKE_D / 2), new THREE.Vector3(X + JUKE_W / 2, JUKE_H, Z + JUKE_D / 2));
const boxHelper = new THREE.Box3Helper(collider, 0x00e0a0);
boxHelper.visible = false;
scene.add(boxHelper);

const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

// лицо — на юг (+Z)
const VIEWS: Record<string, [number[], number[]]> = {
  front: [[X, 1.25, Z + 3.4], [X, 1.0, Z]],
  side: [[X + 3.3, 1.35, Z + 0.4], [X, 1.0, Z]],
  back: [[X - 0.6, 1.4, Z - 3.4], [X, 1.0, Z]],
  window: [[X + 0.15, 1.5, Z + 1.25], [X, 1.42, Z]],
  three: [[X - 2.3, 1.55, Z + 2.9], [X, 1.0, Z]],
  far: [[X + 4.5, 2.3, Z + 13.5], [X, 1.1, Z]],
};
function view(name: string): void {
  const v = VIEWS[name] ?? VIEWS.front;
  camera.position.set(v[0][0], v[0][1], v[0][2]);
  controls.target.set(v[1][0], v[1][1], v[1][2]);
  controls.update();
}
view('three');

const playBox = document.getElementById('play') as HTMLInputElement;
const bpmInput = document.getElementById('bpm') as HTMLInputElement;
const bpmOut = document.getElementById('bpmv')!;
const boxInput = document.getElementById('box') as HTMLInputElement;
const stats = document.getElementById('stats')!;
bpmInput.oninput = () => (bpmOut.textContent = bpmInput.value);
boxInput.onchange = () => (boxHelper.visible = boxInput.checked);
for (const b of document.querySelectorAll<HTMLButtonElement>('button[data-v]')) b.onclick = () => view(b.dataset.v!);

// синтетическая музыка: доля по темпу, полосы — синусы разной частоты, басы бьют на долю
const bands = new Float32Array(7);
let musicT = 0;
let beatPos = 0;
function step(dt: number): void {
  musicT += dt;
  beatPos += (dt * Number(bpmInput.value)) / 60;
  const beat = beatPos % 1;
  const kick = Math.exp(-beat * 5);
  for (let i = 0; i < 7; i++) {
    const v = 0.35 + 0.22 * Math.sin(musicT * (1.1 + i * 0.47) + i * 1.7) + 0.16 * Math.sin(musicT * (3.3 + i * 0.9)) + kick * (i < 2 ? 0.45 : i < 4 ? 0.2 : 0.08);
    bands[i] = Math.min(1, Math.max(0, v));
  }
  juke.update(dt, playBox.checked, bands, beat);
}

function resize(): void {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

/** Вызовы отрисовки и треугольники одного автомата (без плитки и коробки), в обычном кадре и в проходе теней */
function measure(): { calls: number; triangles: number; shadowCalls: number; shadowTriangles: number } {
  const was = [ground.visible, boxHelper.visible];
  ground.visible = false;
  boxHelper.visible = false;
  renderer.render(scene, camera);
  const { calls, triangles } = renderer.info.render;
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
  const shadowCalls = renderer.info.render.calls - calls;
  const shadowTriangles = renderer.info.render.triangles - triangles;
  [ground.visible, boxHelper.visible] = was;
  renderer.shadowMap.needsUpdate = true;
  return { calls, triangles, shadowCalls, shadowTriangles };
}

/** Насколько вершины автомата выходят за коробку-коллайдер (без нот, ореолов и пятна на плитке), метров */
function bounds(): { over: number; box: number[] } {
  const b = new THREE.Box3();
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  juke.group.updateMatrixWorld(true);
  juke.group.traverse((o) => {
    if (o.userData.fx || !(o as THREE.Mesh).isMesh) return;
    const mesh = o as THREE.Mesh;
    const pos = mesh.geometry.getAttribute('position');
    const inst = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh) : null;
    const n = inst ? inst.count : 1;
    for (let k = 0; k < n; k++) {
      if (inst) inst.getMatrixAt(k, m).premultiply(o.matrixWorld);
      else m.copy(o.matrixWorld);
      for (let i = 0; i < pos.count; i++) b.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(m));
    }
  });
  const over = Math.max(collider.min.x - b.min.x, collider.min.y - b.min.y, collider.min.z - b.min.z, b.max.x - collider.max.x, b.max.y - collider.max.y, b.max.z - collider.max.z);
  return { over, box: [b.min.x - X, b.min.y, b.min.z - Z, b.max.x - X, b.max.y, b.max.z - Z].map((n) => Math.round(n * 1000) / 1000) };
}

const timer = new THREE.Timer();
let frame = 0;
function loop(): void {
  requestAnimationFrame(loop);
  timer.update();
  step(Math.min(0.1, timer.getDelta()));
  controls.update();
  renderer.render(scene, camera);
  if (++frame % 30 === 0) {
    const { calls, triangles } = renderer.info.render;
    stats.textContent = `кадр: ${calls} вызовов, ${triangles} треуг. (с плиткой)`;
  }
}
loop();

Object.assign(window, {
  __jb: {
    view,
    play: (on: boolean) => (playBox.checked = on),
    bpm: (v: number) => {
      bpmInput.value = String(v);
      bpmOut.textContent = String(v);
    },
    box: (on: boolean) => {
      boxInput.checked = on;
      boxHelper.visible = on;
    },
    /** Прогнать анимацию на sec секунд вперёд (ноты в полёте, пластинка раскручена) */
    warm: (sec: number) => {
      for (let t = 0; t < sec; t += 1 / 60) step(1 / 60);
    },
    stats: measure,
    bounds,
  },
});
