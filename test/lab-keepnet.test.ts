import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  keepnetCandidate, keepnetChoose, keepnetScore, keepnetStart, type KeepnetFish,
} from '../shared/lab-keepnet.ts';

test('keepnet: вес складывается, каждый вид даёт бонус только один раз', () => {
  assert.deepEqual(keepnetScore([
    { species: 'mullet', g: 3000 }, { species: 'mullet', g: 1800 }, { species: 'scad', g: 2400 },
  ]), { grams: 7200, weight: 72, species: 2, variety: 30, total: 102 });
  assert.deepEqual(keepnetScore([null, null, null]), { grams: 0, weight: 0, species: 0, variety: 0, total: 0 });
});

test('keepnet: лёгкий новый вид может быть полезнее тяжёлого повтора', () => {
  const varied = keepnetScore([
    { species: 'mullet', g: 3000 }, { species: 'goby', g: 600 }, { species: 'scad', g: 2400 },
  ]);
  assert.equal(varied.total, 105);
  assert.equal(varied.species, 3);
  assert.ok(varied.total > 102, 'три самых тяжёлых не всегда лучший выбор');
});

test('keepnet: очки веса округляются после суммы, а не для каждой рыбы', () => {
  assert.equal(keepnetScore([{ species: 'mullet', g: 1250 }, { species: 'mullet', g: 1250 }]).weight, 25);
});

test('keepnet: кандидат занимает выбранное пустое место, прежнее состояние не мутирует', () => {
  const start = keepnetStart();
  const next = keepnetChoose(start, 2);
  assert.deepEqual(start.slots, [null, null, null]);
  assert.equal(start.next, 0);
  assert.deepEqual(next.slots, [null, null, { species: 'mullet', g: 1200 }]);
  assert.equal(next.next, 1);
  assert.deepEqual(keepnetCandidate(next), { species: 'mullet', g: 1800 });
});

test('keepnet: замена касается ровно одного места и расходует один улов', () => {
  let game = keepnetStart();
  for (const slot of [0, 1, 2]) game = keepnetChoose(game, slot);
  const previous = game;
  game = keepnetChoose(game, 0);
  assert.deepEqual(game.slots.map((f) => f?.g), [3000, 1800, 1000]);
  assert.deepEqual(previous.slots.map((f) => f?.g), [1200, 1800, 1000]);
  assert.equal(game.next, 4);
  assert.equal(keepnetScore(game.slots).total, 88);
});

test('keepnet: пропуск сохраняет состав, но убирает текущего кандидата', () => {
  const start = keepnetChoose(keepnetStart(), 0);
  const next = keepnetChoose(start, 'skip');
  assert.deepEqual(next.slots, start.slots);
  assert.equal(next.next, 2);
  assert.deepEqual(keepnetCandidate(next), { species: 'scad', g: 1000 });
});

test('keepnet: шестой выбор завершает раунд, лишний ввод ничего не меняет', () => {
  let game = keepnetStart();
  for (const slot of [0, 1, 2, 0, 1, 2]) game = keepnetChoose(game, slot);
  assert.equal(game.next, 6);
  assert.equal(keepnetCandidate(game), null);
  assert.equal(keepnetScore(game.slots).total, 105);
  assert.strictEqual(keepnetChoose(game, 0), game);
  assert.strictEqual(keepnetChoose(game, 'skip'), game);
});

test('keepnet: неверный выбор не съедает улов и не создаёт четвёртое место', () => {
  const game = keepnetStart();
  for (const bad of [-1, 3, 0.5, NaN, Infinity, '0', '', null, undefined, {}, []]) {
    assert.strictEqual(keepnetChoose(game, bad), game, String(bad));
  }
  assert.equal(game.next, 0);
});

test('keepnet: неверные веса, виды и размер садка не превращаются в очки', () => {
  for (const g of [0, -100, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => keepnetScore([{ species: 'mullet', g }]), RangeError);
  }
  assert.throws(() => keepnetScore([{ species: 'unknown', g: 100 } as unknown as KeepnetFish]), RangeError);
  assert.throws(() => keepnetScore([null, null, null, null]), RangeError);
});

test('keepnet: повтор начинает пустой садок с другой последовательностью', () => {
  const first = keepnetChoose(keepnetStart(), 0);
  const replay = keepnetStart(1);
  assert.deepEqual(replay.slots, [null, null, null]);
  assert.equal(replay.next, 0);
  assert.notDeepEqual(keepnetCandidate(replay), keepnetCandidate(keepnetStart()));
  assert.equal(first.slots[0]?.g, 1200);
  for (const bad of [-1, 0.5, NaN, Infinity]) assert.throws(() => keepnetStart(bad), RangeError);
});
