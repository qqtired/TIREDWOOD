import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import * as THREE from 'three';
import { Zombies3D } from '../client/fort/zombies3d.ts';
import { colored, setBone, type MobDef } from '../client/fort/mobs/kit.ts';
import type { MobRenderer } from '../client/fort/mobs/renderer.ts';
import { MOBS_A } from '../client/fort/mobs/set-a.ts';
import { MOBS_E } from '../client/fort/mobs/set-e.ts';
import { KRAKEN_TENTACLE } from '../client/fort/mobs/kraken-tentacle.ts';
import { ZK, Z_BOSS, Z_FLYER, Z_KRAKEN, Z_TENTACLE, Z_WALKER, ZS_BOSS_BOMB, ZS_BOSS_GATE, ZS_FLY_WARN, ZS_KRAKEN_DIVE, ZS_TENT_REST, ZS_WALK } from '../shared/fort.ts';
import { KRAKEN_LURK_Y, TENT_LANES, TENT_ROOT_Z } from '../shared/fortkraken.ts';
import { LADDERS } from '../shared/fortladder.ts';
import { buildFort, WALL_H } from '../shared/fortmap.ts';
import type { ZombieSnap } from '../shared/fortnet.ts';
import { CollisionWorld } from '../shared/world.ts';

/** models — какие модели мобов (client/fort/mobs) рисуют особей; по умолчанию никаких: все — желейки, как раньше */
function renderer(t: TestContext, models: readonly MobDef[] = []) {
  // Node has no canvas. Only the shadow texture's paint surface is substituted; all geometry/matrices are real Three.js.
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({
    getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }),
  }) } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document'); });
  const zombies = new Zombies3D(new THREE.Scene(), new CollisionWorld(buildFort()), models);
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

test('модели мобов: у кого есть — рисует модель, остальные — желейки; гибель доигрывается; босс в воротах сжат', (t) => {
  let stage = -1;
  const baron: MobDef = {
    id: 'test-baron', name: 'Барон (проба)', kinds: [Z_BOSS], height: 5.4,
    parts: [{ bone: 'body', geo: colored(new THREE.BoxGeometry(4, 5.4, 3).translate(0, 2.7, 0), 0x7e2fa8) }],
    pose(a, out) {
      stage = a.stage ?? -1;
      setBone(out.body, 0, 0, 0);
    },
  };
  const { zombies, meshes, camera } = renderer(t, [...MOBS_A, baron]);
  const mobs = (zombies as unknown as { mobs: MobRenderer }).mobs;
  camera.position.set(0, 6, 150);
  // Барон в проёме ворот (gateSqueeze = 1), крылатка без модели — желейка, шаркун — модель набора A
  const inGate: ZombieSnap = { ...boss, z: -16 };
  zombies.push(100, [inGate, flyer, walker], 3);
  zombies.update(100, 1 / 60, 0, camera);
  assert.equal(mobs.count, 2);
  assert.equal(meshes.body.count, 1, 'желейка — только крылатка');
  assert.equal(meshes.wingL.count, 1);
  assert.equal(meshes.core.count, 0, 'ядро — у модели босса');
  assert.equal(meshes.shadow.count, 3, 'пятна-тени — у всех');
  assert.equal(meshes.warning.count, 2, 'метки — у всех');
  assert.equal(stage, 2, 'anim.stage — байт stage из снимка');
  const body = mobs.group.children.find((m) => m.name === 'mob:test-baron:body') as THREE.InstancedMesh;
  const m = new THREE.Matrix4();
  body.getMatrixAt(0, m);
  const sx = new THREE.Vector3().setFromMatrixColumn(m, 0).length();
  const sy = new THREE.Vector3().setFromMatrixColumn(m, 1).length();
  assert.ok(sy < sx * 0.8, `корень сжат по высоте сильнее, чем по ширине: ${sy.toFixed(2)} против ${sx.toFixed(2)}`);
  // сбит: снимок без шаркуна приходит раньше события zdie — модель доигрывает гибель, но уже не цель
  zombies.push(101, [inGate, flyer], 2);
  zombies.kill(walker.id);
  zombies.update(101, 1 / 60, 0.5, camera);
  assert.equal(mobs.count, 2, 'сбитый шаркун ещё падает');
  const targets = new Float64Array(12);
  assert.equal(zombies.targets(101, targets), 2, 'сбитый — не цель');
  zombies.update(101, 1 / 60, 1.7, camera);
  assert.equal(mobs.count, 1, 'гибель доиграна — пропал');
  zombies.push(102, [inGate, flyer], 2);
  assert.equal(zombies.count, 2);
});

test('Кракен моделями: рука из воды дотягивается до булавы из снимка; временная отрисовка — только круги на воде', (t) => {
  // щупальце № 1 легло булавой на морскую стену (окно «руби»), голова — в засаде в бухте
  const arm: ZombieSnap = { id: 7, kind: Z_TENTACLE, state: ZS_TENT_REST, hp: 1, x: -4, y: 4.6, z: 13, yaw: 0, atk: 0, wind: 100,
    tx: -4, ty: 4.6, tz: 13, stage: 1 };
  const head: ZombieSnap = { id: 8, kind: Z_KRAKEN, state: ZS_WALK, hp: 1, x: 0, y: KRAKEN_LURK_Y, z: 34, yaw: 0, atk: 0, wind: 0,
    tx: 0, ty: 0, tz: 0, stage: 0 };
  {
    const { zombies, camera } = renderer(t, MOBS_E);
    const mobs = (zombies as unknown as { mobs: MobRenderer }).mobs;
    const temp = (zombies as unknown as { kraken: { arms: number; rings: THREE.InstancedMesh } }).kraken;
    camera.position.set(0, 6, 150);
    zombies.push(100, [arm, head], 2);
    zombies.update(100, 1 / 60, 0, camera);
    assert.equal(mobs.count, 2, 'голова и щупальце — моделями');
    assert.equal(temp.arms, 0, 'временная рука не рисуется');
    const club = KRAKEN_TENTACLE.parts.find((p) => p.bone === 'tail' && !p.glow)!;
    club.geo.computeBoundingBox();
    const mid = (club.geo.boundingBox!.min.y + club.geo.boundingBox!.max.y) / 2;
    const find = (geo: THREE.BufferGeometry) => mobs.group.children.find((m) => (m as THREE.InstancedMesh).geometry?.getAttribute('position') === geo.getAttribute('position')) as THREE.InstancedMesh;
    const m = new THREE.Matrix4();
    find(club.geo).getMatrixAt(0, m);
    const c = new THREE.Vector3(0, mid, 0).applyMatrix4(m);
    const want = new THREE.Vector3(arm.x, arm.y + ZK[Z_TENTACLE].hcy, arm.z);
    assert.ok(c.distanceTo(want) < 0.9, `булава мимо снимка: ${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)}`);
    // основание руки — у своей полосы в бухте, а не у булавы
    const base = KRAKEN_TENTACLE.parts.find((p) => p.bone === 'body')!;
    find(base.geo).getMatrixAt(0, m);
    const b = new THREE.Vector3().setFromMatrixPosition(m);
    assert.ok(Math.hypot(b.x - TENT_LANES[1], b.z - TENT_ROOT_Z) < 1.5, `основание не у полосы: ${b.x.toFixed(2)}, ${b.z.toFixed(2)}`);
    // нырок: голову рисует модель (шляпа на воде), круг — где всплывёт
    zombies.push(101, [arm, { ...head, state: ZS_KRAKEN_DIVE, y: KRAKEN_LURK_Y - 6, tx: 8, tz: 36, wind: 90 }], 2);
    zombies.update(101, 1 / 60, 0.1, camera);
    assert.equal(mobs.count, 2);
    assert.ok(temp.rings.count >= 1, 'круг на воде, где всплывёт голова');
  }
  {
    // без моделей — временная отрисовка, как раньше
    const { zombies, camera } = renderer(t);
    const temp = (zombies as unknown as { kraken: { arms: number } }).kraken;
    zombies.push(100, [arm, head], 2);
    zombies.update(100, 1 / 60, 0, camera);
    assert.equal(temp.arms, 1);
  }
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
