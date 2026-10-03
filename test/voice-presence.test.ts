import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { Avatar } from '../client/render/avatar.ts';
import { setVoicePresence } from '../client/render/voice-presence.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { wearOf } from '../client/render/outfit3d.ts';
import { headwearBounds } from '../client/render/hatpose.ts';
import { E_ALIVE, E_GROUNDED } from '../shared/protocol.ts';

test('public talking presence follows avatar entity IDs, clears on replacement and never marks hidden/local/preview avatars', t => {
  // Only the unavailable Node canvas surface is replaced; Avatar, transforms and Sprite materials are real.
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const ctx = new Proxy({}, { get: (_target, key) => {
    if (key === 'getImageData' || key === 'createImageData') return (_x: number, _y: number, w = 512, h = 512) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (key === 'measureText') return (s: string) => ({ width: s.length * 16 });
    return () => {};
  }, set: () => true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 128, height: 128, getContext: () => ctx }) } });
  const scene = new THREE.Scene(), avatars: Avatar[] = [];
  t.after(() => {
    setVoicePresence([]);
    for (const a of avatars) a.dispose(scene);
    if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document');
  });
  const make = (id: number, voice = true) => { const a = new Avatar(id, { voice }); a.setInfo('Игрок', null, false); a.addTo(scene); avatars.push(a); return a; };
  const a = make(7), other = make(8), preview = make(7, false);
  const pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: E_ALIVE | E_GROUNDED };
  const cam = new THREE.Vector3(0, 3, 8), ground = { groundBelow: () => 0 };
  const frame = (avatar: Avatar, local = false) => avatar.update(pose, 0, 0, ground, cam, local);
  const badge = (avatar: Avatar) => avatar.root.getObjectByName('voice-speaking') as THREE.Sprite | undefined;
  const talking = (entityId: number | null) => [{ id: 991, entityId, talking: true, nick: 'Игрок' }];

  setVoicePresence(talking(7)); frame(a); frame(other); frame(preview);
  assert.equal(badge(a)?.visible, true, 'voice session ID 991 maps to avatar 7');
  assert.ok(!badge(other)?.visible); assert.ok(!badge(preview)?.visible);
  const sprite = badge(a)!;
  assert.equal(sprite.parent, a.root, 'hidden parent and walls retain visibility authority');
  assert.equal(sprite.material.depthTest, true); assert.equal(sprite.material.depthWrite, false);

  a.hidden = true; frame(a); assert.equal(a.root.visible, false); assert.equal(sprite.visible, false);
  a.hidden = false; frame(a, true); assert.equal(sprite.visible, false, 'local avatar is not falsely marked');
  frame(a); assert.equal(sprite.visible, true);
  a.update(null, 0, 0, ground, cam, false); assert.equal(sprite.visible, false, 'dead or absent avatar');
  cam.z = 50; frame(a); assert.equal(sprite.visible, false, 'same visibility range as public name'); cam.z = 8;

  setVoicePresence([{ entityId: 7, talking: false }]); frame(a); assert.equal(sprite.visible, false);
  setVoicePresence(talking(null)); frame(a); assert.equal(sprite.visible, false, 'anonymous hider cannot map to an avatar');
  setVoicePresence(talking(8)); frame(a); frame(other);
  assert.equal(sprite.visible, false); assert.equal(badge(other)?.visible, true, 'replacement removes departed peers');
  assert.equal(badge(other)!.material, sprite.material, 'avatars share badge material and texture');

  setVoicePresence(talking(7)); a.setOutfit({ ...DEFAULT_OUTFIT, h: 'devil' }); frame(a);
  assert.ok(sprite.position.y > headwearBounds(wearOf('h', 'devil')).top, 'badge follows actual horn-aware name anchor');
  assert.ok(-sprite.center.y * sprite.scale.y >= .045, 'badge sits above the nickname');
  a.say('Привет'); frame(a);
  assert.ok(-sprite.center.y * sprite.scale.y > .14, 'chat bubble stays readable below the microphone');
  const texture = sprite.material.map!, version = texture.version;
  for (let i = 0; i < 100; i++) frame(a);
  assert.equal(badge(a), sprite); assert.equal(sprite.material.map, texture); assert.equal(texture.version, version, 'no per-frame texture upload');
  a.photoPose(cam); assert.equal(sprite.visible, false, 'world photo excludes interface badge');
  a.photoPose(null); assert.equal(sprite.visible, true);
  setVoicePresence([]); frame(a); frame(other);
  assert.equal(sprite.visible, false); assert.equal(badge(other)?.visible, false, 'scene/disconnect clear');
});
