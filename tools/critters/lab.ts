// Pose sheet for the harbour animals: ?animal=cat&coat=0&poses=stand,walk,sit&yaw=140&cam=34&freeze=1
// Dev tool (not shipped): lays the animals out in a row under lobby-like light so every pose can be inspected.
import * as THREE from 'three';
import { newPose, type CritterPose } from '../../client/lobby/crittersim.ts';
import { Quadruped } from '../../client/lobby/critter-quadruped.ts';

const q = new URLSearchParams(location.search);
const animal = q.get('animal') ?? 'cat', coat = Number(q.get('coat') ?? 0);
const names = (q.get('poses') ?? 'stand').split(',');
const yawDeg = Number(q.get('yaw') ?? 150), camMode = q.get('cam') ?? '34', zoom = Number(q.get('zoom') ?? 1);
const spacing = Number(q.get('gap') ?? (animal === 'dog' ? 1.3 : animal === 'gull' ? 1.1 : animal === 'crab' ? 0.9 : 0.85));

const canvas = document.querySelector<HTMLCanvasElement>('#c')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9d3f0);
const hemi = new THREE.HemisphereLight(0xcfe6ff, 0xc9a56d, 1.25), sun = new THREE.DirectionalLight(0xffd29a, 2.9);
sun.position.set(-5, 4.2, 3.2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 3, bottom: -3, near: 0.5, far: 20 }); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
scene.add(hemi, sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: q.get('floor') === 'sea' ? 0x5fa8d8 : 0xe2cfa6, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

export interface PoseSpec extends Partial<CritterPose> { seconds?: number; speedUp?: boolean }
const defs: Record<string, PoseSpec> = {
  stand: { action: 'walk', speed: 0, restWeight: 0 },
  walk: { action: 'walk', speed: 0.5, seconds: 2.15 },
  walk2: { action: 'walk', speed: 0.5, seconds: 2.3 },
  trot: { action: 'walk', speed: 1.4, seconds: 2.0 },
  run: { action: 'walk', speed: 2.2, seconds: 2.0 },
  sit: { action: 'sit', restWeight: 1, age: 3, remaining: 6 },
  groom: { action: 'groom', restWeight: 1, age: 1.3 },
  groom2: { action: 'groom', restWeight: 1, age: 3.9 },
  groom3: { action: 'groom', restWeight: 1, age: 6.6 },
  sleep: { action: 'sleep', restWeight: 1, age: 5, remaining: 8 },
  sleep2: { action: 'sleep', restWeight: 1, age: 8.2, remaining: 8 },
  sniff: { action: 'sniff', restWeight: 1, age: 2, remaining: 5 },
  purr: { action: 'sit', restWeight: 1, mood: 'purr', age: 3 },
  purrstand: { action: 'walk', mood: 'purr', speed: 0 },
  hiss: { action: 'walk', mood: 'hiss', speed: 0 },
  alert: { action: 'walk', mood: 'alert', speed: 0, look: 1, lookYaw: 0.5, lookPitch: 0.1 },
  greet: { action: 'walk', mood: 'greet', speed: 0, excite: 1, age: 1 },
  scare: { action: 'walk', mood: 'scare', speed: 1.2, seconds: 1.0 },
  yawn: { action: 'sit', restWeight: 1, age: 3.2, remaining: 6 },
  wake: { action: 'sleep', restWeight: 0.5, age: 5, remaining: 1.0 },
  // gulls
  gstand: { action: 'perch', age: 2, remaining: 5 },
  gwalk: { action: 'walk', speed: 0.5, seconds: 2.1 },
  peck: { action: 'peck', age: 0.27, remaining: 5, seconds: 0.3 },
  peck2: { action: 'peck', age: 3.4, remaining: 5, seconds: 0.3 },
  cry: { action: 'perch', age: 2, remaining: 5, cry: 1 },
  glide: { action: 'fly', age: 3, remaining: 3, pitch: -0.1, speed: 5, y: 0.9, seconds: 1.4 },
  flapa: { action: 'fly', age: 3, remaining: 3, pitch: 0.2, speed: 5, y: 0.9, seconds: 1.25 },
  flapb: { action: 'fly', age: 3, remaining: 3, pitch: 0.2, speed: 5, y: 0.9, seconds: 1.4 },
  takeoff: { action: 'fly', age: 0.3, remaining: 3, pitch: 0.45, speed: 3, y: 0.4, seconds: 0.8 },
  landing: { action: 'fly', age: 3, remaining: 0.4, pitch: -0.3, speed: 2.5, y: 0.35, seconds: 1.2 },
  // crabs
  csit: { action: 'sit', age: 2, remaining: 5, restWeight: 1 },
  scuttle: { action: 'walk', speed: 0.5, seconds: 1.3 },
  scuttle2: { action: 'walk', speed: 0.5, seconds: 1.38 },
  alarm: { action: 'sit', age: 2, remaining: 5, alarm: 1, excite: 1 },
  dig: { action: 'burrow', restWeight: 0.5, age: 1, remaining: 5, seconds: 1.0 },
  burrow: { action: 'burrow', restWeight: 1, age: 3, remaining: 5, seconds: 1.0 },
};

type Rig = { group: THREE.Group; update(p: CritterPose, t: number, dt: number, animate?: boolean): void };
const rigs: { rig: Rig; spec: PoseSpec; pose: CritterPose }[] = [];
async function make(): Promise<Rig> {
  if (animal === 'cat' || animal === 'dog') return new Quadruped(animal, coat);
  if (animal === 'gull') { const m = await import('../../client/lobby/critter-coastal.ts'); return new m.Gull(coat); }
  const m = await import('../../client/lobby/critter-coastal.ts'); return new m.Crab(coat);
}
const n = names.length;
for (let i = 0; i < n; i++) {
  const rig = await make();
  const spec = defs[names[i]] ?? defs.stand;
  const pose = Object.assign(newPose(), { x: (i - (n - 1) / 2) * spacing, yaw: THREE.MathUtils.degToRad(yawDeg) }, spec) as CritterPose;
  rig.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  scene.add(rig.group); rigs.push({ rig, spec, pose });
}
let time = 0;
function step(dt: number): void {
  time += dt;
  for (const r of rigs) {
    const p = r.pose; p.distance += p.speed * dt; r.rig.update(p, time + (r.rig === rigs[0].rig ? 0 : 0), dt);
  }
}
// settle every pose for its own duration at 60 fps so gait phases / accumulators have developed
for (const r of rigs) {
  const frames = Math.round((r.spec.seconds ?? 1.5) * 60);
  for (let f = 0; f < frames; f++) { const p = r.pose; time += 1 / 60; p.distance += p.speed / 60; r.rig.update(p, time, 1 / 60); }
}
const width = Math.max(1.2, (n - 1) * spacing + 1.4);
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
function frame(): void {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h;
  const fit = (width / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov * camera.aspect) / 2) * 1.1 / zoom;
  const cy = animal === 'gull' ? 0.5 : animal === 'dog' ? 0.32 : animal === 'crab' ? 0.1 : 0.2;
  if (camMode === 'side') camera.position.set(0, cy + 0.15, fit); else if (camMode === 'top') camera.position.set(0, fit * 0.95, fit * 0.25); else camera.position.set(fit * 0.25, cy + fit * 0.3, fit * 0.92);
  camera.lookAt(0, cy, 0); camera.updateProjectionMatrix();
}
function render(): void { frame(); renderer.render(scene, camera); }
let live = q.get('freeze') !== '1';
const hud = document.querySelector<HTMLElement>('#hud')!;
hud.textContent = `${animal} ${coat}: ${names.join(' | ')}`;
function loop(): void { if (live) step(1 / 60); render(); requestAnimationFrame(loop); }
(window as unknown as { __lab: unknown }).__lab = { rigs, render, step, freeze: () => { live = false; }, setPose(i: number, patch: PoseSpec) { Object.assign(rigs[i].pose, patch); }, get time() { return time; } };
requestAnimationFrame(loop);
