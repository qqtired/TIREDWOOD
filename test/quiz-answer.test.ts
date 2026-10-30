import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkAnswer } from '../shared/quiz/answer.ts';

test('ответ: регистр, ё, знаки, варианты и примечание пака', () => {
  assert.equal(checkAnswer('  «ЁЖ»!!! ', 'еж'), 'yes');
  assert.equal(checkAnswer('пароход', 'корабль / пароход (принимается: судно)'), 'yes');
  assert.equal(checkAnswer('судно', 'пароход (принимается: судно)'), 'no');
  assert.equal(checkAnswer('три', '3'), 'yes');
  assert.equal(checkAnswer('20', 'двадцать'), 'yes');
  assert.equal(checkAnswer('', 'еж'), 'no');
});

test('ответ: опечатка — near, несколько значимых слов, без совпадения части слова', () => {
  assert.equal(checkAnswer('парохот', 'пароход'), 'near');
  assert.equal(checkAnswer('теливизар', 'телевизор'), 'near');
  assert.equal(checkAnswer('кот', 'кит'), 'no');
  assert.equal(checkAnswer('это война, а ещё мир', 'Война и мир'), 'yes');
  assert.equal(checkAnswer('это пароход?', 'пароход'), 'yes');
  assert.equal(checkAnswer('китовый', 'кит'), 'no');
  assert.equal(checkAnswer('война', 'война и мир'), 'no');
});
