import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BJ_CHIPS, BJ_MAX_BET } from '../shared/blackjack.ts';
import { BJ_DENOMS, addChip, canAdd, chipsFor, limitHint, parseAmount } from '../client/lobby/bjbet.ts';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

test('сумма раскладывается на фишки стола точно, крупные внизу', () => {
  assert.deepEqual(chipsFor(0), []);
  assert.deepEqual(chipsFor(10), [10]);
  assert.deepEqual(chipsFor(85), [50, 20, 10, 5]);
  assert.deepEqual(chipsFor(137), [100, 20, 10, 5, 1, 1]);
  assert.deepEqual(chipsFor(500), [100, 100, 100, 100, 100]);
  assert.deepEqual(chipsFor(-4), []);
  assert.deepEqual(chipsFor(NaN), []);
  assert.deepEqual(chipsFor(12.9), [10, 1, 1]);
});

test('любая допустимая ставка раскладывается без потерь и в разумную стопку', () => {
  for (let n = 1; n <= BJ_MAX_BET; n++) {
    const chips = chipsFor(n);
    assert.equal(sum(chips), n, `ставка ${n}`);
    assert.ok(chips.length <= 12, `ставка ${n}: ${chips.length} фишек`);
    assert.ok(chips.every((c) => (BJ_DENOMS as readonly number[]).includes(c)));
    assert.deepEqual([...chips].sort((a, b) => b - a), chips, 'крупные внизу');
  }
});

test('клик по фишке добавляет номинал; больше доступного — не добавляет', () => {
  assert.deepEqual(BJ_CHIPS, [10, 20, 50, 100]);
  let draft = 0;
  draft = addChip(draft, 10, 1000);
  draft = addChip(draft, 50, 1000);
  draft = addChip(draft, 20, 1000);
  assert.equal(draft, 80, 'разные фишки складываются');
  assert.equal(addChip(95, 10, 100), 95, 'после 95 из 100 десятка не помещается');
  assert.equal(canAdd(95, 5, 100), true);
  assert.equal(addChip(0, 100, 60), 0, 'на баланс 60 фишка 100 не добавляется');
  assert.equal(addChip(450, 100, 10_000), 450, 'выше лимита стола нельзя');
  assert.equal(addChip(400, 100, 10_000), 500);
  assert.equal(canAdd(500, 10, 10_000), false);
  assert.equal(canAdd(0, 0, 100), false);
  assert.equal(canAdd(0, 2.5, 100), false);
});

test('поле суммы: только цифры, не больше баланса и лимита стола, мусор — 0', () => {
  assert.equal(parseAmount('85', 1000), 85);
  assert.equal(parseAmount('8a5', 1000), 85);
  assert.equal(parseAmount('  7 ', 1000), 7);
  assert.equal(parseAmount('', 1000), 0);
  assert.equal(parseAmount('abc', 1000), 0);
  assert.equal(parseAmount('-5', 1000), 5, 'минус не цифра');
  assert.equal(parseAmount('999', 1000), BJ_MAX_BET);
  assert.equal(parseAmount('999', 42), 42);
  assert.equal(parseAmount('50', 0), 0);
  assert.equal(parseAmount('0007', 100), 7);
  assert.equal(parseAmount('99999999999', 1000), BJ_MAX_BET);
});

test('подсказка под полем говорит, что ограничивает ставку', () => {
  assert.match(limitHint(100), /до 100/);
  assert.match(limitHint(100), /у тебя/);
  assert.match(limitHint(10_000), new RegExp(`до ${BJ_MAX_BET}`));
  assert.match(limitHint(10_000), /лимит стола/);
  assert.match(limitHint(0), /бесплатно/);
});
