// Стенд модели кальмара (не в сборке): ?view=side|top|front|34|all &t=<время анимации, с> &sp=<вид>
import * as THREE from 'three';
import { makeFish3D } from '../../client/lobby/fishart.ts';
import { FISH } from '../../shared/fishing.ts';
import { setSquidTime } from '../../client/lobby/fishsquid.ts';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'all';
const freeze = q.get('t');
const sp = Number(q.get('sp') ?? FISH.findIndex((f) => f.shape === 'squid'));
const canvas = document.querySelector<HTMLCanvasElement>('#c')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
scene.background = new THREE.Color(q.get('bg') ?? '#a9d3f0');
scene.add(new THREE.HemisphereLight(0xcfe6ff, 0xc9a56d, 1.25));
const sun = new THREE.DirectionalLight(0xffd29a, 2.9); sun.position.set(-5, 4.2, 3.2); scene.add(sun);
const views: Record<string, [number, number, number]> = { side: [0, 0, 1], top: [0, 1, 0.02], front: [-1, 0.15, 0.02], back: [1, 0.2, 0.3], '34': [-0.5, 0.45, 0.8] };
const list = view === 'all' ? ['side', '34', 'top', 'front'] : [view];
const cams: THREE.PerspectiveCamera[] = [];
for (const v of list) {
  const fish = makeFish3D(sp, FISH[sp].g[1]);
  fish.scale.setScalar(1);
  scene.add(fish);
  fish.visible = false;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
  const d = new THREE.Vector3(...views[v]).normalize().multiplyScalar(Number(q.get("d") ?? 1.35));
  cam.position.copy(d);
  cam.lookAt(0, 0, 0);
  cams.push(cam);
  (cam as unknown as { fish: THREE.Object3D }).fish = fish;
}
function frame(): void {
  if (freeze !== null) setSquidTime(Number(freeze));
  const W = innerWidth, H = innerHeight;
  renderer.setSize(W, H, false);
  renderer.setScissorTest(true);
  const cols = cams.length > 1 ? 2 : 1, rows = Math.ceil(cams.length / cols);
  cams.forEach((cam, i) => {
    const w = W / cols, h = H / rows, x = (i % cols) * w, y = H - (Math.floor(i / cols) + 1) * h;
    renderer.setViewport(x, y, w, h); renderer.setScissor(x, y, w, h);
    cam.aspect = w / h; cam.updateProjectionMatrix();
    const f = (cam as unknown as { fish: THREE.Object3D }).fish;
    f.visible = true;
    renderer.render(scene, cam);
    f.visible = false;
  });
  requestAnimationFrame(frame);
}
frame();
