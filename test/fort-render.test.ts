import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import * as THREE from 'three';
import { Zombies3D } from '../client/fort/zombies3d.ts';
import { Z_BOSS, Z_FLYER, Z_WALKER, ZS_BOSS_BOMB, ZS_BOSS_GATE, ZS_FLY_WARN } from '../shared/fort.ts';
import { LADDERS } from '../shared/fortladder.ts';
import { buildFort, WALL_H } from '../shared/fortmap.ts';
import type { ZombieSnap } from '../shared/fortnet.ts';
import { CollisionWorld } from '../shared/world.ts';

function renderer(t: TestContext) {
  // Node has no canvas. Only the shadow texture's paint surface is substituted; all geometry/matrices are real Three.js.
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({
    getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }),
  }) } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document'); });
  const zombies = new Zombies3D(new THREE.Scene(), new CollisionWorld(buildFort()));
  const meshes = zombies as unknown as Record<'body' | 'face' | 'wingL' | 'wingR' | 'core' | 'warning' | 'warningFill' | 'shadow', THREE.InstancedMesh>;
  return { zombies, meshes, camera: new THREE.PerspectiveCamera() };
}

const boss: ZombieSnap = { id: 1, kind: Z_BOSS, state: ZS_BOSS_GATE, hp: 0.5, x: 0, y: 0, z: -23, yaw: Math.PI, atk: 0,
  wind: 54, tx: 0, ty: 1.5, tz: -16, stage: 2 };
const flyer: ZombieSnap = { id: 2, kind: Z_FLYER, state: ZS_FLY_WARN, hp: 1, x: -7, y: 7.4, z: -14.6, yaw: Math.PI, atk: 0,
  wind: 36, tx: -7, ty: 4.2, tz: -14.6, stage: 0 };
const walker: ZombieSnap = { id: 3, kind: Z_WALKER, state: 0, hp: 1, x: 3, y: 0, z: -25, yaw: Math.PI, atk: 0 };

test('качество снижает геометрию, сохраняя крылья, ядро, метки и те же цели попадания', (t) => {
  const { zombies, meshes, camera } = renderer(t);
  camera.position.set(0, 6, 150);
  zombies.push(100, [boss, flyer, walker], 3);
  const targets = new Float64Array(12);
  assert.equal(zombies.targets(100, targets), 3);
  const expected = Array.from(targets);
  const highVertices = meshes.body.geometry.getAttribute('position').count;
  for (const quality of ['low', 'medium', 'high'] as const) {
    zombies.setQuality(quality);
    zombies.update(100, 1 / 60, 0, camera);
    assert.equal(meshes.body.count, 3);
    assert.equal(meshes.wingL.count, 1);
    assert.equal(meshes.wingR.count, 1);
    assert.equal(meshes.core.count, 1);
    assert.equal(meshes.warning.count, 2);
    assert.equal(zombies.targets(100, targets), 3);
    assert.deepEqual(Array.from(targets), expected);
    assert.equal(meshes.face.count, quality === 'high' ? 3 : 1, 'лицо босса остаётся даже на расстоянии');
    if (quality !== 'high') assert.ok(meshes.body.geometry.getAttribute('position').count < highVertices);
  }
  const matrix = new THREE.Matrix4();
  meshes.warning.getMatrixAt(0, matrix);
  assert.ok(Math.abs(new THREE.Vector3().setFromMatrixScale(matrix).x - 6) < 1e-6);
  meshes.warning.getMatrixAt(1, matrix);
  assert.ok(Math.abs(new THREE.Vector3().setFromMatrixScale(matrix).x - 1.8) < 1e-6);
  zombies.kill(boss.id);
  zombies.update(100, 1 / 60, 0, camera);
  assert.equal(meshes.core.count, 0);
  assert.equal(meshes.warning.count, 1, 'мёртвый босс больше не рисует опасную область');
});

test('крылатка бросает тень на каменный ход, а предупреждение залпа лежит на крыше', (t) => {
  const { zombies, meshes, camera } = renderer(t);
  const roofBomb = { ...boss, state: ZS_BOSS_BOMB, tx: -4, ty: 3.46, tz: -17 };
  zombies.push(100, [roofBomb, flyer], 2);
  zombies.update(100, 1 / 60, 0, camera);
  const matrix = new THREE.Matrix4();
  meshes.shadow.getMatrixAt(1, matrix);
  assert.ok(Math.abs(new THREE.Vector3().setFromMatrixPosition(matrix).y - 3.43) < 1e-5);
  meshes.warning.getMatrixAt(0, matrix);
  const pos = new THREE.Vector3().setFromMatrixPosition(matrix);
  assert.ok(Math.abs(pos.y - 3.46) < 1e-5);
  assert.equal(pos.x, -4);
  assert.equal(pos.z, -17);
});

test('structure shield renders only at structures; reentry signs stand over both outer ladders', async (t) => {
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
  const noop=()=>{};
  const ctx=new Proxy({getImageData:(_x:number,_y:number,w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),
    createRadialGradient:()=>({addColorStop:noop}),createLinearGradient:()=>({addColorStop:noop})},
    {get:(o,k)=>Reflect.get(o,k)??noop});
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({getContext:()=>ctx})}});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');});
  const {FortProps}=await import('../client/fort/props.ts');
  const scene=new THREE.Scene();const map=buildFort();const world=new CollisionWorld(map);
  const props=new FortProps(scene,map);
  const field=scene.getObjectByName('fort-structure-shield')!;
  assert.equal(field.visible,false);props.setRally(true);assert.equal(field.visible,true);
  assert.equal(field.children.length,2);
  assert.ok(field.children.some(c=>Math.abs(c.position.z+15.75)<.01));
  assert.ok(field.children.some(c=>Math.abs(c.position.z-2.6)<.01));
  props.setGate(0);props.setRally(true);assert.equal(field.children[1].visible,false);
  props.setRally(false);assert.equal(field.visible,false);
  const signs=scene.children.filter(c=>c.name==='fort-return-ladder');assert.equal(signs.length,2);
  for(const sign of signs){
    const l=LADDERS.find(x=>x.name.endsWith('-out')&&Math.sign(x.x)===Math.sign(sign.position.x))!;
    assert.equal(world.groundBelow(sign.position.x,.1,sign.position.z),0,'табличка над лугом');
    assert.ok(Math.abs(sign.position.z-l.z)<.01,'прямо над лестницей');
    assert.ok(world.groundBelow(l.x-l.nx,4,l.z) >= WALL_H - .01,'наверху лестницы — ход по стене');
  }
});
