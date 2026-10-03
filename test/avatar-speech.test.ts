import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { Avatar } from '../client/render/avatar.ts';
import { setVoicePresence } from '../client/render/voice-presence.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { wearOf } from '../client/render/outfit3d.ts';
import { headwearBounds } from '../client/render/hatpose.ts';
import { E_ALIVE, E_GROUNDED } from '../shared/protocol.ts';

test('actual Avatar speech keeps readable projected pixels at FOV 90/120 without growing near the camera or overlapping microphone/name', t => {
  // Node lacks canvas; only drawing primitives are substituted, not Avatar or Three transforms.
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const ctx = new Proxy({}, { get: (_target, key) => {
    if (key === 'getImageData' || key === 'createImageData') return (_x: number, _y: number, w = 512, h = 512) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (key === 'measureText') return (s: string) => ({ width: s.length * 16 });
    return () => {};
  }, set: () => true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 128, height: 128, getContext: () => ctx }) } });
  const scene = new THREE.Scene(), avatar = new Avatar(7);
  t.after(() => {
    setVoicePresence([]); avatar.dispose(scene);
    if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document');
  });
  avatar.addTo(scene); avatar.setInfo('Игрок', null, false); avatar.setOutfit({ ...DEFAULT_OUTFIT, h: 'devil' });
  avatar.say('Читаемое сообщение'); setVoicePresence([{ entityId: 7, talking: true }]);
  const speech = avatar.root.children.find(o => o instanceof THREE.Sprite && (o.material.map?.image as HTMLCanvasElement | undefined)?.width === 512) as THREE.Sprite;
  assert.ok(speech, 'real speech canvas sprite');
  assert.equal(speech.material.sizeAttenuation, false); assert.equal(speech.material.depthTest, true);
  const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: E_ALIVE | E_GROUNDED };
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, .1, 200), ground = { groundBelow: () => 0 };
  const beforeRender = (sprite: THREE.Sprite) => sprite.onBeforeRender({} as THREE.WebGLRenderer, scene, camera, sprite.geometry, sprite.material, null!);
  const heightPx = () => {
    const m = speech.matrixWorld.elements;
    // Same world Y-column length and projection factor consumed by Three's sprite vertex shader.
    return Math.hypot(m[4], m[5], m[6]) * camera.projectionMatrix.elements[5] * 1080 / 2;
  };
  const heights: number[] = [], clearances: number[] = [], textureVersion = speech.material.map!.version;
  for (const horizontalFov of [90, 120]) for (const distance of [3, 30]) {
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(horizontalFov) / 2) / (16 / 9)));
    camera.position.set(0, 2, distance); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    avatar.update(pose, 0, 0, ground, camera.position, false); scene.updateMatrixWorld();
    assert.equal(speech.visible, true);
    const mic = avatar.root.getObjectByName('voice-speaking') as THREE.Sprite;
    // Badge and speech share a render order: both submission orders must produce the same spacing.
    if (distance === 3) { beforeRender(mic); beforeRender(speech); }
    else { beforeRender(speech); beforeRender(mic); }
    heights.push(heightPx());
    assert.ok(speech.position.y > headwearBounds(wearOf('h', 'devil')).top, 'horn-aware anchor follows the actual resized headwear');
    clearances.push(-speech.center.y * speech.scale.y);
    assert.ok(-mic.center.y * mic.scale.y > (1 - speech.center.y) * speech.scale.y, 'microphone stays above enlarged speech');
    assert.ok(speech.scale.x / speech.scale.y > 2.55 && speech.scale.x / speech.scale.y < 2.57, 'text aspect ratio unchanged');
  }
  for (const h of heights) assert.ok(Math.abs(h - 99.36) < .001, `expected 99.36px at both distances/FOVs, got ${h}`);
  for (const bottom of clearances) assert.ok(bottom > .045, 'speech begins above nickname');
  assert.equal(speech.material.map!.version, textureVersion, 'FOV updates never redraw or upload text');
  camera.fov = 30; camera.updateProjectionMatrix(); beforeRender(speech);
  assert.equal(speech.scale.y, .1035, 'zoom retains existing size rather than applying wide-FOV growth');
  camera.position.z = 36; avatar.update(pose, 0, 0, ground, camera.position, false);
  assert.equal(speech.visible, false, '35m distance culling retained');
});
