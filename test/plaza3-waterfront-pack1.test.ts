// Проверки мест после переноса: реальные габариты GLB не закрывают буквы, пол совпадает с посадками,
// рампа проходима в обе стороны, новый понтон/игровые poses не остаются на прежних координатах.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

process.env.PLAZA3 = '1';
const { P3 } = await import('../shared/plaza3/layout.ts');
const { PAVILIONS, glbJson, pavAnchors, propOf } = await import('../client/lobby/plaza3/pavdata.ts');
const { townHeight, townCoastZ } = await import('../client/lobby/plaza3/landscape.ts');
const { signHill, layoutSign, LETTER_H } = await import('../client/lobby/tiredwood.ts');
const { moleJointY } = await import('../client/lobby/plaza3/molefloor.ts');
const { moleRampSteps, PORT } = await import('../shared/plaza3/port.ts');
const { RAT_TRACK, RAT_USE, RAT_BOARD, RAT_DECK, ratTrackPoint } = await import('../shared/ratrace.ts');
const { buildLobby } = await import('../shared/maps/lobby.ts');
const { CollisionWorld } = await import('../shared/world.ts');
const { makeState, makeEvents, stepPlayer, BTN_FORWARD } = await import('../shared/sim.ts');

const ground = (x: number, z: number): number => townHeight(x, z,
  Math.max(Math.min(x - P3.land.town.e, townCoastZ(x) - z), Math.min(P3.land.town.n - z, x + 30)), signHill(x, z));

test('actual GLB кафе/веранды и досок у spawn оставляют буквы TIREDWOOD открытыми с площади и колеса', async () => {
  const letters = layoutSign(ground);
  const eyes = [new THREE.Vector3(P3.lobby.spawn.x, 1.7, P3.lobby.spawn.z), new THREE.Vector3(P3.center.x, 1.7, P3.center.z), new THREE.Vector3(27, 17, 13)];
  for (const id of ['cafe', 'cardveranda', 'honor', 'online']) {
    const p = PAVILIONS.find((v) => v.id === id)!;
    const bytes = readFileSync(new URL(`../client/assets/plaza3/${p.file}`, import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    gltf.scene.position.set(p.x, p.y ?? 0, p.z);
    gltf.scene.rotation.y = p.yaw;
    gltf.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    assert.ok(!box.isEmpty(), `${id}: реальные габариты модели`);
    for (const eye of eyes) for (const l of letters) for (const u of [-0.45, -0.2, 0, 0.2, 0.45]) for (const v of [0.05, 0.5, 0.95]) {
      const target = new THREE.Vector3(l.x + l.w * u * Math.cos(l.yaw), l.y + LETTER_H * v, l.z - l.w * u * Math.sin(l.yaw));
      const direction = target.clone().sub(eye);
      const distance = direction.length();
      const hit = new THREE.Ray(eye, direction.normalize()).intersectBox(box, new THREE.Vector3());
      assert.ok(!hit || eye.distanceTo(hit) >= distance, `${id} заслоняет ${l.ch} с (${eye.x};${eye.z})`);
    }
  }
});

test('пологий стык мола: шаги ≤10 см, опора по всей ширине, видимый верх отклоняется от физики не больше одного шага', () => {
  const steps = moleRampSteps();
  assert.equal(steps.length, 5);
  let previous = -0.5;
  for (const s of steps) {
    assert.ok(s.max[1] - previous <= 0.1 + 1e-9 && s.max[1] > previous);
    assert.deepEqual([s.min[2], s.max[2]], [43.5, 46.5]);
    for (const x of [s.min[0], (s.min[0] + s.max[0]) / 2, s.max[0]]) {
      assert.ok(s.max[1] >= moleJointY(x) - 1e-9 && s.max[1] - moleJointY(x) <= 0.1 + 1e-9);
    }
    previous = s.max[1];
  }
  assert.equal(previous, PORT.stair.y);
  assert.equal(PORT.stair.box[0], steps.at(-1)!.max[0]);
});

test('стык в собранной карте проходим без прыжка в обе стороны по трём полосам рампы', () => {
  const world = new CollisionWorld(buildLobby());
  for (const z of [44, 45, 46]) for (const direction of [-1, 1]) {
    const state = Object.assign(makeState(), { x: direction === 1 ? -29 : -24.2, y: direction === 1 ? -0.5 : 0, z, grounded: 1 });
    const event = makeEvents();
    for (let seq = 1; seq <= 150 && (direction === 1 ? state.x < -24.2 : state.x > -29); seq++) {
      stepPlayer(state, { seq, buttons: BTN_FORWARD, yaw: -direction * Math.PI / 2, pitch: 0, viewTick: 0 }, world, false, 1, event);
      assert.ok(state.y >= -0.51, 'не падает в щель/воду');
    }
    assert.ok(direction === 1 ? state.x >= -24.3 : state.x <= -28.9, `прошёл направление ${direction}, полосаz${z}: x${state.x}`);
    assert.ok(Math.abs(state.y - (direction === 1 ? 0 : -0.5)) < 0.15, 'конечная высота на настиле');
  }
});

test('огород: физическая опора до северной границы имеет верх0, старые invisible границы сохранены', () => {
  const world = new CollisionWorld(buildLobby());
  for (const [x, z] of [[53, -40], [90, -68], [85, -25], [81, -15]]) assert.equal(world.groundBelow(x, 0.5, z), 0);
  for (const id of ['wall.field1', 'wall.field2', 'wall.field3', 'wall.field4', 'wall.garden']) {
    const wall = P3.colliders.find((c) => c.id === id)!;
    assert.equal(wall.mat, 'invisible');
    assert.equal(wall.max[1], 30);
  }
});

test('бега: трасса, табло, use и понтон переносятся вместе, круг гонки и номера крыс сохраняются', () => {
  const near = (a: number, b: number): void => assert.ok(Math.abs(a - b) < 1e-9);
  near(RAT_TRACK.x, -0.4);
  near(RAT_USE.x, RAT_TRACK.x);
  near(RAT_BOARD.x, RAT_TRACK.x);
  near(RAT_DECK.x0, -3.8);
  near(RAT_DECK.x1, 3);
  const p = ratTrackPoint(0, 0);
  near(p.x, RAT_TRACK.x);
  assert.equal(p.z, RAT_TRACK.z - RAT_TRACK.r);
  const pav = PAVILIONS.find((v) => v.id === 'rats')!;
  near(pav.x, RAT_TRACK.x);
  const use = buildLobby().interact.find((it) => it.kind === 'ratrace')!;
  near(use.x, RAT_USE.x);
  near(use.z, RAT_USE.z);
});

test('беседка: в actual GLB одна скамья, её два места совпадают с данными и находятся вне колонн', () => {
  const p = PAVILIONS.find((v) => v.id === 'sunset')!;
  const bytes = readFileSync(new URL(`../client/assets/plaza3/${p.file}`, import.meta.url));
  const model = glbJson(bytes);
  assert.equal(model.nodes.filter((n) => propOf(n.name ?? '') === 'bench').length, 1);
  const anchors = pavAnchors(model, p);
  const bench = P3.modes.sunsetBench;
  const world = new CollisionWorld(buildLobby());
  for (const [i, side] of [-1, 1].entries()) {
    const seat = anchors.get(`anchor_seat_${24 + i}`)!;
    assert.ok(seat, 'оба индивидуальных места экспортированы');
    assert.ok(Math.abs(seat.x - bench.x - side * bench.offset * Math.cos(bench.yaw)) < 1e-4);
    assert.ok(Math.abs(seat.z - bench.z + side * bench.offset * Math.sin(bench.yaw)) < 1e-4);
    assert.ok(Math.abs(seat.yaw - bench.yaw) < 1e-4, 'лицом к воде');
    assert.ok(Math.abs(bench.y + 0.3 - Number(seat.data.seat_y)) < 1e-6, 'ACT_SIT lift совпадает с поверхностью сиденья');
    assert.ok(!world.overlaps(seat.x - 0.42, 0.56, seat.z - 0.42, seat.x + 0.42, 2, seat.z + 0.42), 'тело сидящего не пересекает колонны');
  }
});
