import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QUIZ_VENUE as V, QUIZ_VENUE_DATA, buildVenue, toLocal, toWorld, insideFence, inQuizArea, placeAt, chairPlace, RAMP_STEP } from '../shared/quiz/venue.ts';
import { quizEnabled } from '../shared/quiz/net.ts';
import { STEP_HEIGHT } from '../shared/constants.ts';

test('площадка: координаты, места, ограда, высота и флаг', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI]) {
    const w = { x: 84, y: 2, z: 8, yaw };
    assert.deepEqual(toLocal(w, ...toWorld(w, 3, 4, 5)), [3, 4, 5]);
  }
  assert.equal(V.chairs[0].x, 76.701); assert.equal(V.chairs[0].z, 6.354);
  assert.equal(insideFence((V.arch.a[0] + V.arch.b[0]) / 2, (V.arch.a[1] + V.arch.b[1]) / 2), true);
  assert.equal(insideFence(60, 8), false); assert.equal(insideFence(68.1, 8, .5), true);
  assert.equal(inQuizArea(V.center[0], 20, V.center[1]), false);
  assert.equal(V.first.pult, V.chairs.length); assert.equal(V.first.riddler, V.chairs.length + 7);
  assert.equal(placeAt(chairPlace(0))?.kind, 'chair'); assert.equal(placeAt(-1), null);
  assert.equal(quizEnabled(undefined, true, true), true); assert.equal(quizEnabled('1', false, false), false);
  assert.equal(quizEnabled('0', true, true), false); assert.equal(quizEnabled(undefined, false, true), false);
});

test('ступени до настила, пульты отдельно; поворот не на 90° запрещён', () => {
  const tops = [...new Set(V.solid.filter(b => b.name === 'ramp_step').map(b => b.max[1]))].sort((a, b) => a - b);
  let prev = V.world.y ?? 0;
  for (const top of tops) { assert.ok(top - prev <= STEP_HEIGHT); assert.ok(top - prev <= RAMP_STEP + 1e-6); prev = top; }
  assert.equal(tops.at(-1), V.stage.top); assert.ok(!V.solid.some(b => b.name.startsWith('pult')));
  assert.equal(V.pultSolid.length, 6);
  assert.throws(() => buildVenue({ ...QUIZ_VENUE_DATA, world: { ...V.world, yaw: Math.PI / 4 } }), /90/);
});
