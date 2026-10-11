import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { RAT_BOARD } from '../shared/ratrace.ts';

test('модель бегов заменяет только прежнюю статику; крысы, шлагбаум и живое табло остаются', async () => {
  const module = await import('../client/lobby/plaza3/mounts.ts');
  assert.ok('onRatArena' in module && 'setRatArena' in module, 'нет сигнала успешной загрузки арены');
  const { mountRatArena } = await import('../client/lobby/plaza3/ratmount.ts');
  const parent = new THREE.Group(), body = new THREE.Mesh(), rat = new THREE.Group(), gate = new THREE.Group(), board = new THREE.Group();
  const front = new THREE.Mesh(new THREE.PlaneGeometry(.5, .14)), back = front.clone();
  parent.add(body, rat, gate, board, front, back);
  const boardAt = new THREE.Matrix4().compose(new THREE.Vector3(7, 4.05, 26.53), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), new THREE.Vector3(RAT_BOARD.w / 2, RAT_BOARD.h / 2, 1));
  const finishAt = new THREE.Matrix4().compose(new THREE.Vector3(7, .84, 23.16), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), new THREE.Vector3(.25, .07, 1));
  let fired = false;
  module.onRatArena((m) => { fired = true; mountRatArena(body, board, front, back, m); });
  assert.equal(body.visible, true, 'legacy статика нужна до готовности GLB');
  module.setRatArena({ board: boardAt, finish: finishAt });
  assert.equal(fired, true); assert.equal(body.visible, false);
  for (const object of [rat, gate, board, front, back]) assert.equal(object.visible, true);
  assert.ok(board.position.distanceTo(new THREE.Vector3(7, 4.05, 26.53)) < 1e-6);
  assert.ok(board.scale.distanceTo(new THREE.Vector3(1, 1, 1)) < 1e-6);
  assert.ok(front.position.distanceTo(new THREE.Vector3(7, .84, 23.16)) < 1e-6);
  assert.ok(Math.abs(front.position.distanceTo(back.position) - .07) < 1e-6);
  let late = false; module.onRatArena(() => { late = true; }); assert.equal(late, true);
});
