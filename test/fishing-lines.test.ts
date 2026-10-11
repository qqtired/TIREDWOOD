// Лески — живое игровое состояние, не декор: Plaza3Perf не должен прятать их у дальнего мола.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { FP_REEL, FP_WAIT } from '../shared/fishing.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { FishingSpots } from '../client/lobby/fishing.ts';
import { Plaza3Perf } from '../client/lobby/plaza3/perf.ts';
import type { Sound } from '../client/audio.ts';
import type { Avatar } from '../client/render/avatar.ts';
import type { Effects } from '../client/render/effects.ts';
import type { LobbyFx } from '../client/lobby/fx.ts';

test('своя и чужая лески у мола видны после скана пустой геометрии, в ожидании и вываживании', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(-50, 2, 50);
  // Отсечение не требует настоящего GL; геометрия, снасти, фазы и слои — настоящие.
  const gl = {
    properties: { get: () => ({}) }, info: { programs: [] }, shadowMap: { enabled: false, needsUpdate: false },
    toneMapping: THREE.NoToneMapping, compileAsync: () => Promise.resolve(),
  } as unknown as THREE.WebGLRenderer;
  const avatars = [-50, -48].map((x) => {
    const root = new THREE.Group();
    root.position.set(x, 0, 50);
    const held = root.add(new THREE.Group()).children[0] as THREE.Group;
    scene.add(root);
    return { root, held, outfit: DEFAULT_OUTFIT, hands: null } as unknown as Avatar;
  });
  const fishing = new FishingSpots(scene,
    { ripple: () => {}, burst: () => {} } as unknown as Effects,
    {} as LobbyFx, {} as Sound, avatars[0],
    avatars.map((av) => ({ x: av.root.position.x, z: 50, yaw: 0 })));
  const perf = new Plaza3Perf({ gl, scene, camera, look: null });
  const scan = (): void => {
    scene.updateMatrixWorld(true);
    (perf as unknown as { scanAt: number; cullAt: number }).scanAt = 0;
    perf.beforeRender();
    perf.afterRender();
  };
  // Первое сканирование на входе: все лески ещё скрыты и их координаты равны нулю.
  scan();
  const lines = scene.children.filter((o): o is THREE.Line => (o as THREE.Line).isLine === true);
  const floats = scene.children.filter((o): o is THREE.Group => (o as THREE.Group).isGroup === true && !avatars.some((av) => av.root === o));
  assert.equal(lines.length, 2);
  for (const ph of [FP_WAIT, FP_REEL]) {
    fishing.reset(avatars.map((av) => ({ ph, x: av.root.position.x, z: 42, sp: -1, g: 0, n: 0 })));
    fishing.update(1 / 60, 1, avatars);
    scan();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      assert.ok(line.visible && line.layers.test(camera.layers), `${i === 0 ? 'своя' : 'чужая'} леска: фаза ${ph}`);
      const p = line.geometry.getAttribute('position');
      const tip = avatars[i].held.children[0].getObjectByProperty('type', 'Object3D')!;
      const at = tip.getWorldPosition(new THREE.Vector3());
      assert.ok(new THREE.Vector3().fromBufferAttribute(p, 0).distanceTo(at) < 1e-5, 'начало — на кончике удочки');
      for (let j = 0; j < p.count; j++) assert.ok(Number.isFinite(p.getX(j) + p.getY(j) + p.getZ(j)));
      assert.ok(new THREE.Vector3().fromBufferAttribute(p, p.count - 1).distanceTo(floats[i].position) < 1e-5, 'конец — на своём поплавке');
    }
  }
  fishing.update(1 / 60, 2, [null, null]);
  assert.ok(lines.every((line) => !line.visible), 'ушёл с места — леска скрыта');
});
