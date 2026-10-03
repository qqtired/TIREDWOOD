import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { Quadruped } from '../client/lobby/critter-quadruped.ts';
import { Crab, Gull } from '../client/lobby/critter-coastal.ts';
import { Cove } from '../client/lobby/critter-cove.ts';
import { critterMaterial } from '../client/lobby/critter-kit.ts';
import { newPose, type CritterPose } from '../client/lobby/crittersim.ts';
import { WATER_Y } from '../shared/constants.ts';

type Rig = Quadruped | Gull | Crab;
const rigs = (): Array<[string, Rig]> => [
  ...[0, 1, 2, 3].map((c): [string, Rig] => [`cat${c}`, new Quadruped('cat', c, c)]),
  ['dog', new Quadruped('dog', 0, 14)], ['gull', new Gull(0, 4)], ['crab0', new Crab(0, 10)], ['crab1', new Crab(1, 11)],
];
const pose = (patch: Partial<CritterPose>): CritterPose => Object.assign(newPose(), patch);
function skinned(rig: Rig): THREE.SkinnedMesh { return rig.mesh; }
const box = (rig: Rig): THREE.Box3 => new THREE.Box3().setFromObject(rig.group, true);

test('every animal is one skinned mesh with the one shared material, finite geometry and valid skin weights', () => {
  for (const [name, rig] of rigs()) {
    const mesh = skinned(rig), g = mesh.geometry;
    assert.ok(mesh.material === critterMaterial && !Array.isArray(mesh.material), `${name} shares the material`);
    let skins = 0; rig.group.traverse((o) => { if (o instanceof THREE.SkinnedMesh) skins++; });
    assert.equal(skins, 1, `${name} is a single skinned mesh`);
    const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), sw = g.getAttribute('skinWeight'), si = g.getAttribute('skinIndex'), bones = mesh.skeleton.bones.length;
    assert.ok(g.index!.count / 3 < 12000, `${name} triangle budget (${g.index!.count / 3})`);
    for (let i = 0; i < pos.count; i++) {
      assert.ok(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i)), `${name} finite position`);
      const l = Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i)); assert.ok(l > 0.9 && l < 1.1, `${name} unit normal`);
      assert.ok(Math.abs(sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i) - 1) < 1e-5, `${name} weights sum to one`);
      assert.ok(si.getX(i) < bones && si.getY(i) < bones, `${name} bone index in range`);
    }
  }
});

test('poses stay finite, bounded and grounded: feet on the floor when standing, walking, resting', () => {
  const cat: Array<Partial<CritterPose>> = [
    { action: 'walk' }, { action: 'walk', speed: 0.5 }, { action: 'walk', speed: 1.4 }, { action: 'sit', restWeight: 1, age: 3, remaining: 6 },
    { action: 'groom', restWeight: 1, age: 1.5, remaining: 6 }, { action: 'groom', restWeight: 1, age: 4, remaining: 6 }, { action: 'sleep', restWeight: 1, age: 4, remaining: 9 },
    { action: 'sniff', restWeight: 1, age: 2, remaining: 5 }, { action: 'walk', mood: 'hiss' }, { action: 'walk', mood: 'alert', look: 1, lookYaw: 0.8 }, { action: 'walk', mood: 'greet', excite: 1 },
    { action: 'sit', restWeight: 1, mood: 'purr', age: 2, remaining: 6 },
  ];
  for (const [name, rig] of rigs().filter(([n]) => n.startsWith('cat') || n === 'dog')) {
    for (const [k, patch] of cat.entries()) {
      const p = pose({ ...patch, x: 1, y: 0.5, z: 2, yaw: 0.7 }), speed = p.speed;
      for (let f = 0; f < 90; f++) { p.distance += speed / 60; rig.update(p, 4 + f / 60, 1 / 60); }
      const b = box(rig), size = b.getSize(new THREE.Vector3());
      assert.ok(Number.isFinite(b.min.y + b.max.y + size.x), `${name} pose ${k} finite`);
      assert.ok(b.min.y > 0.5 - 0.04 && b.min.y < 0.5 + 0.035, `${name} pose ${k}: grounded (min y ${b.min.y - 0.5})`);
      assert.ok(size.x < 1.1 && size.y < 1.1 && size.z < 1.6, `${name} pose ${k} bounded ${size.toArray()}`);
    }
    // asleep: the eyes shut
    const p = pose({ action: 'sleep', restWeight: 1, age: 4, remaining: 9 });
    for (let f = 0; f < 120; f++) rig.update(p, 4 + f / 60, 1 / 60);
    const eye = (rig as Quadruped).mesh.skeleton.bones.find((b) => b.name === 'eyeR')!;
    assert.ok(eye.scale.y < 0.3, `${name} sleeps with closed eyes`);
  }
});

test('gull flight poses: wings open and flap, folded when perched, never mirrored or NaN', () => {
  const gull = new Gull(0, 0), wing = gull.mesh.skeleton.bones.find((b) => b.name === 'wingR')!;
  const perched = pose({ action: 'perch' });
  for (let f = 0; f < 60; f++) gull.update(perched, f / 60, 1 / 60);
  const folded = box(gull).getSize(new THREE.Vector3());
  assert.ok(folded.x < 0.5 && folded.z < 0.75, `perched gull is compact ${folded.toArray()}`);
  const fly = pose({ action: 'fly', age: 3, remaining: 3, pitch: 0.2, speed: 5, y: 1 });
  const angles: number[] = [];
  for (let f = 0; f < 120; f++) { gull.update(fly, 2 + f / 60, 1 / 60); angles.push(wing.rotation.z); }
  assert.ok(box(gull).getSize(new THREE.Vector3()).x > 0.9, 'wings spread in flight');
  assert.ok(Math.max(...angles) - Math.min(...angles) > 0.5, 'the wing beats');
  for (const [phase, patch] of [['take-off', { age: 0.2, remaining: 4, pitch: 0.5 }], ['landing', { age: 4, remaining: 0.3, pitch: -0.3 }]] as const) {
    const p = pose({ action: 'fly', speed: 3, y: 0.5, ...patch });
    for (let f = 0; f < 60; f++) gull.update(p, f / 60, 1 / 60);
    const b = box(gull); assert.ok(Number.isFinite(b.min.x + b.max.y), phase);
  }
  const peck = pose({ action: 'peck', age: 0.27, remaining: 5 });
  for (let f = 0; f < 20; f++) gull.update(peck, f / 60, 1 / 60);
  const head = gull.mesh.skeleton.bones.find((b) => b.name === 'head')!;
  assert.ok(new THREE.Vector3().setFromMatrixPosition(head.matrixWorld).y < 0.3, 'pecking puts the head down');
  const cry = pose({ action: 'perch', cry: 1 }), jaw = gull.mesh.skeleton.bones.find((b) => b.name === 'jaw')!;
  gull.update(cry, 1, 1 / 60); assert.ok(jaw.rotation.x < -0.4, 'beak opens for the cry');
  gull.group.traverse((o) => assert.ok(o.scale.x > 0 && o.scale.y > 0 && o.scale.z > 0, 'no negative scale'));
});

test('crab: scuttles, snaps, and buries itself so only the eyes stay above the sand', () => {
  const crab = new Crab(0, 10);
  const walking = pose({ action: 'walk', speed: 0.5 });
  for (let f = 0; f < 60; f++) { walking.distance += 0.5 / 60; crab.update(walking, f / 60, 1 / 60); }
  const sizeWalk = box(crab).getSize(new THREE.Vector3());
  assert.ok(sizeWalk.x < 0.8 && sizeWalk.z < 0.8 && sizeWalk.y < 0.3, `crab is small ${sizeWalk.toArray()}`);
  assert.ok(box(crab).min.y > -0.03, 'feet reach the sand, not through it');
  const buried = pose({ action: 'burrow', restWeight: 1, age: 4, remaining: 5 });
  for (let f = 0; f < 60; f++) crab.update(buried, f / 60, 1 / 60);
  const b = box(crab);
  assert.ok(b.max.y < 0.075 && b.max.y > 0.01, `buried crab shows only its back and eyes (${b.max.y})`);
  crab.update(pose({ action: 'sit', alarm: 1, excite: 1 }), 2, 1 / 60);
  assert.ok(Number.isFinite(box(crab).max.y));
});

test('the sandbar mesh is finite, stays on the sand and holds one draw call plus foam', () => {
  const parent = new THREE.Group(), cove = new Cove(parent);
  const meshes: THREE.Mesh[] = []; cove.group.traverse((o) => { if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) meshes.push(o); });
  assert.equal(meshes.length, 2, 'sand + props in one mesh, foam in another');
  const sand = meshes.find((m) => m.name === 'critter-cove-sand')!, pos = sand.geometry.getAttribute('position');
  assert.ok(pos.count > 3000 && pos.count < 40000, `vertex count ${pos.count}`);
  for (let i = 0; i < pos.count; i++) {
    assert.ok(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i)));
    assert.ok(pos.getX(i) > -19.5 && pos.getX(i) < -11.8 && pos.getZ(i) > 21.9 && pos.getZ(i) < 27.6, 'compact: about 7 x 5.5 m at most');
    assert.ok(pos.getY(i) > WATER_Y - 0.8 && pos.getY(i) < 0.2, 'nothing hangs in the air');
  }
  cove.update(0.016, { x: -15, z: 24 }); cove.emitBubble(-15, -0.9, 23); cove.emitSand(-15, -0.9, 23); cove.update(0.1, { x: -15, z: 24 });
  cove.update(0.016, { x: 500, z: 500 }); assert.equal(cove.group.visible, false, 'hidden when far away');
});
