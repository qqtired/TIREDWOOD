// Переключатель вида (client/render/look.ts): новый вид набережной включается адресом ?look=2 или константой
// DEFAULT_LOOK; адрес важнее запомненного выбора, мусор не в счёт. Модуль грузится и без браузера.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_LOOK, LOOK, LOOK2, pickLook } from '../client/render/look.ts';

test('вид: без браузера — по умолчанию', () => {
  assert.equal(LOOK, DEFAULT_LOOK);
  assert.equal(LOOK2, DEFAULT_LOOK === 2);
  assert.equal(pickLook('', null), DEFAULT_LOOK);
});

test('вид: адрес важнее запомненного, запомненное — важнее константы', () => {
  assert.equal(pickLook('?look=2', null, 1), 2);
  assert.equal(pickLook('?debug&look=2', '1', 1), 2);
  assert.equal(pickLook('?look=1', '2', 2), 1);
  assert.equal(pickLook('', '2', 1), 2);
  assert.equal(pickLook('?debug', '1', 2), 1);
});

test('вид: незнакомые значения — как не было', () => {
  assert.equal(pickLook('?look=3', null, 1), 1);
  assert.equal(pickLook('?look=', 'x', 2), 2);
  assert.equal(pickLook('?look=v2', '0', 1), 1);
});
