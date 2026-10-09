import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { Avatar } from '../client/render/avatar.ts';
import { createFittingWear, fittingWearObject, transformFittingWear } from '../client/fitting-room/models.ts';
import { bodyR } from '../client/render/outfit3d.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { E_ALIVE, E_GROUNDED } from '../shared/protocol.ts';

const candidates = [
  ['harbor-beanie', 'h'], ['flower-panama', 'h'], ['messenger-bag', 'a'],
  ['camera', 'a'], ['round-glasses', 'e'], ['crab-buddy', 's'],
] as const;

// Catches an empty factory, invalid merged vertices, accidental body-scale exports,
// and a hat/strap made from a sphere that cuts into the real jelly profile.
for (const [key, slot] of candidates) test(`${key}: real colored geometry fits the jelly and stays bounded`, () => {
  const wear = createFittingWear(key);
  assert.ok(wear?.geo, 'candidate has an actual model');
  const g = wear.geo, p = g.getAttribute('position'), n = g.getAttribute('normal');
  assert.equal(g.getAttribute('color').count, p.count);
  const triangles = (g.index?.count ?? p.count) / 3;
  assert.ok(triangles > 100 && triangles < 15000, `triangle budget: ${triangles}`);
  for (let i = 0; i < p.count; i++) {
    assert.ok(Number.isFinite(p.getX(i)) && Number.isFinite(p.getY(i)) && Number.isFinite(p.getZ(i)));
    assert.ok(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) > .85, 'usable lighting normals');
    if (slot === 'h' || slot === 'a') {
      const y = p.getY(i) + wear.y;
      if (y > .07 && y < 1.565) assert.ok(Math.hypot(p.getX(i), p.getZ(i)) >= bodyR(y) + .01, `body clearance at y=${y}`);
    }
  }
  g.computeBoundingBox();
  const b = g.boundingBox!;
  assert.ok(b.min.y + wear.y > .15, 'above support');
  assert.ok(b.max.y + wear.y < 2, 'label and framing safe');
  // A .62m strap radius plus the front lens/side pouch spans up to 1.5m.
  assert.ok(b.max.x - b.min.x < 1.6 && b.max.z - b.min.z < 1.6, 'human-sized item');
  if (slot === 'h') assert.ok(b.min.y + wear.y > 1.22 && b.max.y + wear.y > 1.64, 'seated above eyes');
  if (slot === 'e') assert.ok(b.max.y + wear.y < 1.4 && b.min.y + wear.y > 1.0, 'eyes height');
  g.dispose(); wear.metal?.dispose();
});

test('unknown candidate has no invented replacement model', () => {
  assert.equal(createFittingWear('missing'), null);
});

test('beanie has a rounded crown above the jelly instead of a pointed cap', () => {
  const wear = createFittingWear('harbor-beanie')!, p = wear.geo!.getAttribute('position');
  let crownWidth = 0, top = 0;
  const heights = new Set<number>();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + wear.y;
    top = Math.max(top, y);
    if (y > 1.60 && y < 1.68) crownWidth = Math.max(crownWidth, Math.hypot(p.getX(i), p.getZ(i)));
    if (y > 1.42 && y < 1.75) heights.add(Math.round(y * 1000));
  }
  assert.ok(crownWidth > .26, 'rounded upper shoulder retains width above the body crown');
  assert.ok(top >= 1.74 && top < 1.78, 'rounded top, no extended point');
  assert.ok(heights.size > 12, 'smooth mesh silhouette above the cuff');
  wear.geo!.dispose();
});

test('messenger strap descends to the pouch on the same side of the body', () => {
  const wear = createFittingWear('messenger-bag')!, p = wear.geo!.getAttribute('position'), color = wear.geo!.getAttribute('color');
  const olive = new THREE.Color(0x6b7652);
  const strap: THREE.Vector3[] = [], pouch: THREE.Triangle[] = [];
  const terra = new THREE.Color(0xb96b4b);
  const vertex = (i: number) => new THREE.Vector3(p.getX(i), p.getY(i) + wear.y, p.getZ(i));
  for (let i = 0; i < p.count; i++) {
    const q = vertex(i);
    if (Math.abs(color.getX(i) - olive.r) < .001 && q.x > .4 && Math.abs(q.z) < .075 && q.y > .59 && q.y < .76) strap.push(q);
    if (i % 3 === 0 && Math.abs(color.getX(i) - terra.r) < .001) pouch.push(new THREE.Triangle(vertex(i), vertex(i + 1), vertex(i + 2)));
  }
  assert.ok(strap.length > 30, 'strap reaches the pouch height rather than the opposite shoulder');
  let gap = Infinity;
  // Contact with a face can sit between box vertices; test the actual triangle surface.
  const nearest = new THREE.Vector3();
  for (const a of strap) for (const b of pouch) gap = Math.min(gap, b.closestPointToPoint(a, nearest).distanceTo(a));
  assert.ok(gap < .04, `strap/pouch join gap ${gap}`);
  wear.geo!.computeBoundingBox();
  assert.ok(wear.geo!.boundingBox!.max.x < .80, 'pouch sits against the body, within the strap reach');
  wear.geo!.dispose();
});

test('item transform and export preserve the original wearable geometry', () => {
  const w = createFittingWear('harbor-beanie')!, p = w.geo!.getAttribute('position');
  const before = p.array.slice();
  const shifted = transformFittingWear(w, { position: [.2, .3, -.1], rotation: [0, 0, 0], scale: 1 });
  const q = shifted.geo!.getAttribute('position');
  assert.ok(Math.abs(q.getX(0) - p.getX(0) - .2) < .00001);
  assert.ok(Math.abs(q.getY(0) - p.getY(0) - .3) < .00001);
  const object = fittingWearObject(shifted, 'h');
  assert.equal(object.children.length, 1, 'only the item, no character or environment');
  assert.notEqual((object.children[0] as THREE.Mesh).geometry, shifted.geo, 'owned export copy');
  assert.equal(object.position.y, 1.35, 'attachment restored in item export');
  assert.deepEqual(p.array, before, 'source and game caches untouched');
  w.geo!.dispose(); shifted.geo!.dispose();
  const mesh = object.children[0] as THREE.Mesh;
  mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
});

test('preview Wear follows the real avatar attachment and can be restored to game outfit', t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const ctx = new Proxy({}, { get: (_target, key) => {
    if (key === 'getImageData' || key === 'createImageData') return (_x: number, _y: number, w = 512, h = 512) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (key === 'measureText') return (s: string) => ({ width: s.length * 16 });
    return () => {};
  }, set: () => true });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 128, height: 128, getContext: () => ctx }) } });
  const scene = new THREE.Scene(), avatar = new Avatar(9001, { voice: false }), w = createFittingWear('harbor-beanie')!;
  t.after(() => {
    avatar.dispose(scene); w.geo!.dispose();
    if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document');
  });
  avatar.addTo(scene);
  assert.equal(typeof avatar.setPreviewWear, 'function', 'preview attachment API exists');
  avatar.setPreviewWear('h', w);
  let mesh: THREE.Mesh | undefined;
  avatar.root.traverse(o => { if ((o as THREE.Mesh).geometry === w.geo) mesh = o as THREE.Mesh; });
  assert.ok(mesh?.parent, 'actual attachment consumes candidate geometry');
  assert.equal(mesh.parent.position.y, 1.35);
  const pose = { x: 0, y: 0, z: 0, yaw: .4, pitch: 0, flags: E_ALIVE | E_GROUNDED };
  avatar.update(pose, 1 / 60, 0, { groundBelow: () => 0 }, new THREE.Vector3(0, 2, -4), false);
  assert.equal(avatar.root.rotation.y, .4, 'world turn carried by avatar');
  assert.equal(mesh.visible, true);
  avatar.setOutfit({ ...DEFAULT_OUTFIT, h: 'panama' });
  assert.notEqual(mesh.geometry, w.geo, 'regular game outfit replaces preview');
  assert.equal(avatar.outfit.h, 'panama');
});
