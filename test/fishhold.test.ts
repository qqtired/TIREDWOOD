// Рыба в руках (server/lobby/fishhold.ts): в руки — только рыба, которая правда в рюкзаке; ушла из рюкзака (продал,
// отпустил, рулетка) — из рук; ушёл с набережной — у всех пусто; вошедший видит, кто что держит.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { FishHolds } from '../server/lobby/fishhold.ts';
import { FISH } from '../shared/fishing.ts';
import type { BagFish } from '../shared/fishprogress.ts';
import { P_FRONT, P_HANG, P_SIDE, holdPose, placeHeld } from '../client/lobby/fishhold.ts';
import { fishLength, makeFish3D } from '../client/lobby/fishart.ts';

const sp = (id: string) => FISH.findIndex((f) => f.id === id);
const bag: BagFish[] = [
  { n: 4, f: 'mackerel', g: 600, p: 5, m: 0 },
  { n: 9, f: 'whiteshark', g: 400_000, p: 300, m: 0 },
];

test('в руки — только своя рыба из рюкзака; кривые номера и чужая рыба — мимо', () => {
  const h = new FishHolds();
  assert.equal(h.hold(1, bag, 5), null, 'такой рыбы нет');
  assert.equal(h.hold(1, null, 4), null, 'без профиля');
  for (const bad of ['4', 4.5, NaN, Infinity, null, undefined, {}]) assert.equal(h.hold(1, bag, bad), null);
  assert.deepEqual(h.hold(1, bag, 4), { t: 'fishHold', id: 1, n: 4, sp: sp('mackerel'), g: 600 });
  assert.equal(h.hold(1, bag, 4), null, 'та же рыба — ничего не шлём');
  assert.deepEqual(h.hold(1, bag, 9), { t: 'fishHold', id: 1, n: 9, sp: sp('whiteshark'), g: 400_000 }, 'сменил рыбу');
  assert.deepEqual(h.hold(1, bag, -1), { t: 'fishHold', id: 1, n: -1, sp: -1, g: 0 }, 'убрал');
  assert.equal(h.hold(1, bag, -1), null, 'и так пусто');
});

test('рыба ушла из рюкзака (продал, отпустил, рулетка) — пропадает из рук; вошедший видит, кто что держит', () => {
  const h = new FishHolds();
  h.hold(1, bag, 4);
  h.hold(2, bag, 9);
  assert.deepEqual(h.views().map((m) => [m.id, m.n]), [[1, 4], [2, 9]]);
  const bags = new Map<number, BagFish[]>([[1, bag], [2, bag]]);
  assert.deepEqual(h.sweep((s) => bags.get(s) ?? null), [], 'всё на месте');
  bags.set(1, [bag[1]]);
  bags.set(2, []);
  assert.deepEqual(h.sweep((s) => bags.get(s) ?? null).map((m) => [m.id, m.n]), [[1, -1], [2, -1]]);
  assert.equal(h.size, 0);
  h.hold(3, bag, 4);
  assert.deepEqual(h.drop(3), { t: 'fishHold', id: 3, n: -1, sp: -1, g: 0 }, 'ушёл с набережной');
  assert.equal(h.drop(3), null);
});

test('поза: мелочь — в руке, средняя — двумя руками, крупная — рядом во весь рост; маленький кальмар висит, большой — рядом', () => {
  assert.equal(holdPose(fishLength(sp('goby'), 200), false), P_HANG);
  assert.equal(holdPose(fishLength(sp('mullet'), 1500), false), P_FRONT);
  assert.equal(holdPose(fishLength(sp('whiteshark'), 400_000), false), P_SIDE);
  assert.equal(holdPose(0.6, true), P_HANG);
  assert.equal(holdPose(1.2, true), P_FRONT);
  assert.equal(holdPose(2, true), P_SIDE);
});

test('фото с уловом: рыба не закрывает лицо (глаза — 1,17 м) — мелкая и средняя ниже лица, крупная рядом и стоит на настиле', () => {
  const squid = FISH.findIndex((f) => f.shape === 'squid');
  const cases: Array<[number, number]> = [[sp('goby'), 200], [sp('mackerel'), 600], [sp('mullet'), 1500], [sp('whiteshark'), 400_000]];
  if (squid >= 0) cases.push([squid, FISH[squid].g[0]], [squid, FISH[squid].g[1]], [squid, 3_000_000]);
  for (const [k, g] of cases) {
    const fish = makeFish3D(k, g);
    const len = fish.userData.len as number;
    const isSquid = FISH[k].shape === 'squid';
    const pose = holdPose(len, isSquid);
    const hands = [0, 0, 0, 0, 0, 0];
    for (const t of [0, 0.2, 1, 3.3, 7]) {
      placeHeld(fish, hands, pose, len, fish.userData.half as THREE.Vector3, isSquid, t);
      fish.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(fish);
      const what = `${FISH[k].id} ${g} г, поза ${pose}, t ${t}`;
      assert.ok(box.min.y > -0.06, `${what}: не уходит под настил (${box.min.y.toFixed(2)})`);
      // лицо спереди — |x| < 0,28 м, от 1,0 до 1,4 м (глаза — ±0,13 на 1,17): рыба туда не заходит
      const face = box.max.y > 1.0 && box.min.y < 1.4 && box.min.x < 0.28 && box.max.x > -0.28 && box.min.z < -0.2;
      assert.ok(!face, `${what}: закрывает лицо (${box.min.x.toFixed(2)}…${box.max.x.toFixed(2)}, ${box.min.y.toFixed(2)}…${box.max.y.toFixed(2)})`);
      if (pose !== P_SIDE) assert.ok(box.max.y < 1.2, `${what}: на уровне пояса–груди`);
      for (const v of hands) assert.ok(Number.isFinite(v));
    }
  }
});

test('кальмар: модель с полупрозрачными плавниками и анимацией в шейдере, длина по весу, в пределах', () => {
  const k = FISH.findIndex((f) => f.shape === 'squid');
  if (k < 0) return; // вид придёт от A
  const m = makeFish3D(k, FISH[k].g[1]);
  const meshes = m.children.filter((o): o is THREE.Mesh => (o as THREE.Mesh).isMesh);
  assert.equal(meshes.length, 2, 'тело и плавники');
  for (const mesh of meshes) {
    assert.ok(mesh.geometry.getAttribute('aAnim'), 'анимация — атрибутом вершин');
    assert.ok(typeof mesh.onBeforeRender === 'function');
  }
  assert.ok((meshes[1].material as THREE.Material).transparent, 'плавники полупрозрачные');
  const size = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - fishLength(k, FISH[k].g[1])) < 0.15, `длина ${size.x}`);
  assert.ok(size.y < size.x * 0.35 && size.z < size.x * 0.4, 'вытянутый: плавники и руки не шире трети длины');
  assert.ok(fishLength(k, FISH[k].g[0]) <= fishLength(k, FISH[k].g[1]));
  let tris = 0;
  for (const mesh of meshes) tris += (mesh.geometry.index?.count ?? 0) / 3;
  assert.ok(tris < 12_000, `${tris} треугольников`);
});
