import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catchText, clock, paintOutText, podiumBonus, roundLines, roundTokens, tauntPoints, type RoundStat } from '../server/hide/score.ts';

const stat = (o: Partial<RoundStat>): RoundStat => ({ nick: 'X', wasProp: false, kind: 'crate', caught: false, caughtAt: 0, survivedEnd: false, finds: 0, tauntPts: 0, misses: 0, paintOuts: 0, lastMiss: null, transforms: 0, ...o });

test('tokens: 1 per 8 points, 30 per round at most; podium only with three players', () => {
  assert.equal(roundTokens(7), 0); assert.equal(roundTokens(8), 1); assert.equal(roundTokens(160), 20); assert.equal(roundTokens(9999), 30); assert.equal(roundTokens(-5), 0);
  assert.equal(podiumBonus(0, 2), 0); assert.equal(podiumBonus(0, 3), 10); assert.equal(podiumBonus(1, 3), 5); assert.equal(podiumBonus(2, 3), 0);
});

test('taunt pays 25 within 6 m, 15 within 12 m, 5 beyond', () => {
  assert.equal(tauntPoints(5.9), 25); assert.equal(tauntPoints(6), 25); assert.equal(tauntPoints(11), 15); assert.equal(tauntPoints(40), 5); assert.equal(tauntPoints(Infinity), 5);
});

test('texts agree with the object, not the player', () => {
  assert.equal(clock(151 * 60), '2:31'); assert.equal(clock(5 * 60), '0:05');
  assert.equal(catchText('bucket', 'Петя', 'Вася'), '💥 Ведро — это Петя! Ловец — Вася');
  assert.equal(paintOutText('Вася', 'bucket'), '🎨 Вася: вся краска ушла на ведро');
  assert.equal(paintOutText('Вася', 'barrel'), '🎨 Вася: вся краска ушла на бочку');
  const lines = roundLines([
    stat({ nick: 'Петя', wasProp: true, kind: 'gnome', caught: true, caughtAt: 151 * 60 }),
    stat({ nick: 'Маша', wasProp: true, kind: 'barrel', caught: true, caughtAt: 12 * 60 }),
    stat({ nick: 'Вася', finds: 2, paintOuts: 1, lastMiss: 'bucket' }),
  ], 'hunters');
  assert.deepEqual(lines, [
    '⏱ Садовый гном (Петя) продержался 2:31',
    '🙈 Бочка (Маша) попалась уже на 12-й секунде',
    '🎯 Лучший ловец — Вася: 2 поимки',
    '🎨 Вася: вся краска ушла на ведро',
  ]);
  assert.deepEqual(roundLines([stat({ nick: 'Оля', wasProp: true, kind: 'bucket', survivedEnd: true, tauntPts: 45 })], 'props'),
    ['🏆 Ведро (Оля) — так и не нашли!', '🦆 Главный дразнила — Оля: +45 за насмешки']);
  assert.deepEqual(roundLines([stat({})], 'cancelled'), ['Раунд без наград: нужны активные соперники']);
});
