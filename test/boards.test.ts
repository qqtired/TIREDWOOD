// Табло набережной: надписи «сколько назад» на обороте доски почёта («Последние входы»).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agoText } from '../client/lobby/boards.ts';

test('«Последние входы»: только что, минуты, часы, дни; кто сейчас здесь — «в игре»', () => {
  assert.equal(agoText(0, true), 'в игре');
  assert.equal(agoText(99_999, true), 'в игре');
  assert.equal(agoText(0, false), 'только что');
  assert.equal(agoText(59.9, false), 'только что');
  assert.equal(agoText(60, false), '1 мин назад');
  assert.equal(agoText(59 * 60 + 59, false), '59 мин назад');
  assert.equal(agoText(3600, false), '1 ч назад');
  assert.equal(agoText(23 * 3600 + 3599, false), '23 ч назад');
  assert.equal(agoText(86_400, false), '1 дн. назад');
  assert.equal(agoText(40 * 86_400 + 5, false), '40 дн. назад');
});
