import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { LobbyCamera } from '../client/lobby/camera.ts';
import { Avatar } from '../client/render/avatar.ts';
import { ACT_SLOT, ACT_NONE } from '../shared/lobby.ts';
import { E_ALIVE, E_GROUNDED } from '../shared/protocol.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { bodyProfile } from '../client/render/outfit3d.ts';

const hook = registerHooks({ load(url, context, next) {
  // Only Vite's asset discovery is substituted; wardrobe turn methods run unchanged.
  if (url.endsWith('/client/lobby/fish2.ts')) {
    const loaded = next(url, context);
    const source = typeof loaded.source === 'string' ? loaded.source : new TextDecoder().decode(loaded.source);
    return { ...loaded, source: source.replace("import.meta.glob('../assets/fish/*.{webp,png}', { eager: true, query: '?url', import: 'default' })", '{}') };
  }
  if (/\.(webp|png|css)$/.test(new URL(url).pathname)) return { format: 'module', source: `export default ${JSON.stringify(url)}`, shortCircuit: true };
  return next(url, context);
} });
let Wardrobe: typeof import('../client/ui/wardrobe.ts').Wardrobe;
try { Wardrobe = (await import('../client/ui/wardrobe.ts')).Wardrobe; } finally { hook.deregister(); }

test('wardrobe inspection turns through the back, wraps a full turn and returns to the front', () => {
  const wardrobe = Object.assign(Object.create(Wardrobe.prototype), { shown: true, inspectYaw: 0 });
  assert.equal(typeof wardrobe.rotatePreview, 'function', 'wardrobe needs a local inspection control');
  wardrobe.rotatePreview(Math.PI / 2);
  assert.ok(Math.abs(wardrobe.previewYaw - Math.PI / 2) < 1e-10);
  wardrobe.rotatePreview(Math.PI / 2);
  assert.ok(Math.abs(Math.abs(wardrobe.previewYaw) - Math.PI) < 1e-10, 'back of the outfit is reachable');
  wardrobe.rotatePreview(Math.PI * 2 + Math.PI / 2);
  assert.ok(Math.abs(wardrobe.previewYaw + Math.PI / 2) < 1e-10, 'repeated dragging stays in a bounded angle');
  wardrobe.resetInspect();
  assert.equal(wardrobe.previewYaw, 0);
  wardrobe.shown = false;
  wardrobe.rotatePreview(1);
  assert.equal(wardrobe.previewYaw, 0, 'closed wardrobe cannot rotate the walking avatar');
});

test('slot camera starts at the player eyes and keeps the reels in the centre', () => {
  const rig = new LobbyCamera(), cam = new THREE.PerspectiveCamera(60, 16 / 9, .1, 200);
  assert.equal(typeof (rig as any).slot, 'function', 'slot view must have a first-person rig');
  (rig as any).slot(cam, 1, -20, 0, -22.7, -20, -23.7);
  assert.ok(Math.abs(cam.position.x + 20) < 1e-10);
  assert.ok(Math.abs(cam.position.y - 1.17) < 1e-10, 'eye height of the jelly');
  assert.ok(Math.abs(cam.position.z + 22.7) < 1e-10);
  cam.updateMatrixWorld();
  const reels = new THREE.Vector3(-20, 1.28, -23.7).project(cam);
  assert.ok(Math.abs(reels.x) < 1e-10 && Math.abs(reels.y) < 1e-10, 'machine screen is unobstructed and centred');
  const lever = new THREE.Vector3(-19.45, 1.3, -24).project(cam);
  assert.ok(Math.abs(lever.x) < 1 && Math.abs(lever.y) < 1, 'lever remains within the view');
});

test('slot view can look up, down, left and right while keeping its eye position and limiting the turn', () => {
  const view = (yaw: number, pitch: number) => {
    const rig = new LobbyCamera(), cam = new THREE.PerspectiveCamera(60, 1.6, .1, 200);
    (rig as any).slot(cam, 1, -20, 0, -22.7, -20, -23.7, yaw, pitch);
    return { camera: cam, direction: cam.getWorldDirection(new THREE.Vector3()) };
  };
  const center = view(0, 0), left = view(.2, 0), right = view(-.2, 0), up = view(0, .2), down = view(0, -.2);
  assert.ok(left.direction.x < -.15 && right.direction.x > .15, 'mouse can turn the view to either side');
  assert.ok(up.direction.y > center.direction.y + .15 && down.direction.y < center.direction.y - .15, 'mouse can look above and below the reels');
  for (const changed of [left, right, up, down]) assert.ok(changed.camera.position.distanceTo(center.camera.position) < 1e-10, 'only the gaze turns');
  const extreme = view(20, 20);
  assert.ok(extreme.direction.distanceTo(view(Math.PI / 6, .28).direction) < 1e-10, 'view stays inside a modest horizontal/vertical range');
  assert.ok(extreme.direction.z < -.7, 'cannot look backwards away from the machine');
});

test('wardrobe leaves space below the actual body for its rotation graphic', () => {
  const rig = new LobbyCamera(), cam = new THREE.PerspectiveCamera(60, 1.6, .1, 200);
  rig.mirror(cam, 1, -23.4, 0, -1.4, Math.PI / 2, 68, 2.252);
  cam.updateMatrixWorld();
  const geometry = new THREE.LatheGeometry(bodyProfile(), 36), positions = geometry.getAttribute('position');
  const point = new THREE.Vector3(), origin = new THREE.Vector3(-23.4, 0, -1.4);
  try {
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).add(origin).project(cam);
      assert.ok(point.y > -.76, 'rotation control has its own space beneath the skin');
    }
  } finally { geometry.dispose(); }
});

test('rotation graphic has its own pixel space below the skin on shorter desktop windows', () => {
  const geometry = new THREE.LatheGeometry(bodyProfile(), 36), positions = geometry.getAttribute('position');
  const point = new THREE.Vector3(), origin = new THREE.Vector3(-23.4, 0, -1.4);
  try {
    for (const [width, height] of [[1280, 720], [1440, 600]]) {
      const rig = new LobbyCamera(), cam = new THREE.PerspectiveCamera(60, width / height, .1, 200);
      (rig as any).mirror(cam, 1, -23.4, 0, -1.4, Math.PI / 2, 68, 2.252, 124 / height);
      cam.updateMatrixWorld();
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).add(origin).project(cam);
        assert.ok((1 - point.y) * height / 2 < height - 124, `skin overlaps its rotation control at ${width}x${height}`);
      }
    }
  } finally { geometry.dispose(); }
});

test('wardrobe mirror frames the full tall hat and the base without entering the kiosk wall', () => {
  const rig = new LobbyCamera(), cam = new THREE.PerspectiveCamera(60, 16 / 9, .1, 200);
  (rig as any).mirror(cam, 1, -23.4, 0, -1.4, Math.PI / 2, 68, 3);
  cam.updateMatrixWorld();
  for (const height of [0, 3]) {
    const edge = new THREE.Vector3(-23.4, height, -1.4).project(cam);
    assert.ok(Math.abs(edge.y) < .98, `outfit height ${height} is visible: ${edge.y}`);
    assert.ok(edge.x < 0, 'jelly stays to the left of the outfit panel');
  }
  assert.ok(cam.position.x > -25.5, 'camera remains outside the kiosk front wall');
});

test('wardrobe camera keeps the lower body visible in front of the kiosk counter at all three places', () => {
  const counter = new THREE.Box3(new THREE.Vector3(-25.5, 1.06, -5.45), new THREE.Vector3(-25.14, 1.13, -3.15));
  for (const z of [-1.4, -3.4, -5.4]) {
    const rig = new LobbyCamera(), cam = new THREE.PerspectiveCamera(60, 16 / 9, .1, 200);
    rig.mirror(cam, 1, -23.4, 0, z, Math.PI / 2, 68);
    const lowerBody = new THREE.Vector3(-23.4, .2, z);
    const ray = new THREE.Ray(cam.position.clone(), lowerBody.clone().sub(cam.position).normalize());
    const hit = ray.intersectBox(counter, new THREE.Vector3());
    assert.ok(!hit || hit.distanceTo(cam.position) > lowerBody.distanceTo(cam.position), `counter occludes the outfit at z=${z}`);
  }
});

test('wardrobe framing includes the near edge of the real body, not just the centre of its base', () => {
  const rig = new LobbyCamera(), cam = new THREE.PerspectiveCamera(60, 1.6, .1, 200);
  rig.mirror(cam, 1, -23.4, 0, -1.4, Math.PI / 2, 68, 2.252);
  cam.updateMatrixWorld();
  const geometry = new THREE.LatheGeometry(bodyProfile(), 36);
  const positions = geometry.getAttribute('position'), point = new THREE.Vector3();
  try {
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).add(new THREE.Vector3(-23.4, 0, -1.4)).project(cam);
      assert.ok(Math.abs(point.y) < .98, `body clipped at projected y=${point.y}`);
    }
  } finally { geometry.dispose(); }
});

test('slot first-person view hides tall hats, keeps the animated hand and restores the avatar on exit', t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const context = new Proxy({}, { get: (_target, key) => {
    if (key === 'getImageData' || key === 'createImageData') return (_x: number, _y: number, w = 512, h = 512) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (key === 'measureText') return (s: string) => ({ width: s.length * 16 });
    return () => {};
  }, set: () => true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 128, height: 128, getContext: () => context }) } });
  const scene = new THREE.Scene(), avatar = new Avatar(7, { gun: false });
  t.after(() => {
    avatar.dispose(scene);
    if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document');
  });
  avatar.addTo(scene);
  avatar.setOutfit({ ...DEFAULT_OUTFIT, h: 'storm' });
  avatar.setAction(ACT_SLOT, 0);
  const pose = { x: -20, y: 0, z: -22.7, yaw: 0, pitch: 0, flags: E_ALIVE | E_GROUNDED };
  const ground = { groundBelow: () => 0 }, eyes = new THREE.Vector3(-20, 1.17, -22.7);
  const av = avatar as any;
  assert.equal(typeof av.slotView, 'function', 'slot mode must keep the hand without showing the hat');
  avatar.update(pose, 0, 0, ground, eyes, true);
  av.slotView(true);
  assert.equal(avatar.root.visible, false, 'all headwear and body stay hidden');
  const hand = scene.children.find(o => o !== avatar.root && o !== avatar.shadow) as THREE.Mesh;
  assert.ok(hand?.visible, 'the right hand is still rendered');
  const before = hand.matrix.elements[13];
  avatar.pullLever();
  avatar.update(pose, .2, .2, ground, eyes, true);
  av.slotView(true);
  assert.ok(hand.matrix.elements[13] < before - .1, 'hand follows the real lever-pull animation');
  const slotCam = new THREE.PerspectiveCamera(60, 1.6, .1, 200);
  new LobbyCamera().slot(slotCam, 1, -20, 0, -22.7, -20, -23.7);
  slotCam.updateMatrixWorld();
  const glove = new THREE.Vector3().setFromMatrixPosition(hand.matrix).project(slotCam);
  assert.ok(Math.abs(glove.x) < .9 && Math.abs(glove.y) < .85, 'hand stays inside the frame while pulling the lever');
  avatar.setAction(ACT_NONE, 0);
  avatar.update(pose, .1, .3, ground, new THREE.Vector3(-20, 2, -19), true);
  av.slotView(false);
  assert.equal(avatar.root.visible, true, 'walking view restores the whole outfit');
  assert.equal(hand.visible, false, 'no duplicate hand remains after leaving the machine');
});
