// Картинг, «Обгон!» (Э-8): место должно продержаться, мигание соседей в схватке — не обгон; кого обошёл — по местам до и после.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PASS_HOLD_MS, PlaceWatch } from '../client/race/overtake.ts';

const places = (...ids: number[]): Map<number, number> => new Map(ids.map((id, i) => [id, i + 1]));

test('держится дольше порога — обгон, и назван тот, кого обошли', () => {
  const w = new PlaceWatch();
  assert.equal(w.update(0, 1, places(2, 3, 1, 4), true), null);
  assert.equal(w.update(100, 1, places(2, 1, 3, 4), true), null);
  assert.equal(w.update(100 + PASS_HOLD_MS - 1, 1, places(2, 1, 3, 4), true), null);
  const ev = w.update(100 + PASS_HOLD_MS, 1, places(2, 1, 3, 4), true);
  assert.deepEqual(ev, { up: true, from: 3, to: 2, who: 3 });
  // событие одно: дальше то же место молчит
  assert.equal(w.update(2000, 1, places(2, 1, 3, 4), true), null);
});

test('мигнуло и вернулось — молчим; обогнали тебя — up=false и ник обогнавшего', () => {
  const w = new PlaceWatch();
  w.update(0, 1, places(2, 1, 3), true);
  assert.equal(w.update(100, 1, places(1, 2, 3), true), null);
  assert.equal(w.update(200, 1, places(2, 1, 3), true), null);
  assert.equal(w.update(2000, 1, places(2, 1, 3), true), null);
  assert.equal(w.update(2100, 1, places(2, 3, 1), true), null);
  assert.deepEqual(w.update(2100 + PASS_HOLD_MS, 1, places(2, 3, 1), true), { up: false, from: 2, to: 3, who: 3 });
});

test('гонка не идёт или финишировал — наблюдатель сбрасывается и не говорит', () => {
  const w = new PlaceWatch();
  w.update(0, 1, places(1, 2), true);
  assert.equal(w.update(100, 1, places(2, 1), false), null);
  assert.equal(w.update(5000, 1, places(2, 1), false), null);
  // после сброса новое место — просто стартовое, а не обгон
  assert.equal(w.update(6000, 1, places(2, 1), true), null);
});
