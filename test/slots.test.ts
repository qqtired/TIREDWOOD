// Однорукие бандиты: точная математика каждого автомата по полному перебору всех 64³ исходов.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  JACKPOT_MULT, PAYTABLES, POOL_MIN, POOL_SHARE, REELS, REEL_SIZE, STAKES, evaluate, jackpotPayout, poolAfterStake, symbolFromRoll,
} from '../shared/slots.ts';

const ALL = REEL_SIZE ** 3;

/** Полный перебор автомата: сумма выплат, число выигрышных и джекпотных исходов (из 64³). */
function exhaust(m: number): { paid: number; hits: number; jackpots: number } {
  let paid = 0;
  let hits = 0;
  let jackpots = 0;
  const w = REELS[m];
  for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) for (let c = 0; c < 6; c++) {
    const n = w[0][a] * w[1][b] * w[2][c];
    const r = evaluate(m, [a, b, c]);
    paid += n * r.win;
    if (r.win > 0) hits += n;
    if (r.jackpot) jackpots += n;
  }
  return { paid, hits, jackpots };
}

/**
 * Возврат вместе с банком, если весь вечер играть только на этом автомате: 5 % ставок уходят в банк и
 * возвращаются джекпотом; банк в среднем копится до 2,5 / q (q — шанс джекпота), джекпот забирает
 * «банк × ставка / 50», а если в банке остаётся меньше 1000 — казино добавляет до 1000 (затравка).
 */
function withBank(m: number): number {
  const s = STAKES[m];
  const { paid, jackpots } = exhaust(m);
  const q = jackpots / ALL;
  const pool = POOL_SHARE * 50 / q;
  const seed = Math.max(0, POOL_MIN - pool * (1 - s / 50));
  return paid / ALL / s + POOL_SHARE + (q * seed) / s;
}

test('ленты: 64 положения, символы — ровно с заданными весами, на каждом барабане каждого автомата', () => {
  assert.equal(REELS.length, STAKES.length);
  for (let m = 0; m < REELS.length; m++) {
    for (let reel = 0; reel < 3; reel++) {
      const w = REELS[m][reel];
      assert.equal(w.reduce((a, b) => a + b, 0), REEL_SIZE, `автомат ${m}, барабан ${reel}`);
      const count = new Array(w.length).fill(0);
      for (let r = 0; r < REEL_SIZE; r++) count[symbolFromRoll(m, reel, r)]++;
      assert.deepEqual(count, [...w]);
    }
  }
});

test('таблицы: по убыванию выплаты, джекпот — ставка ×100, каждый следующий автомат — на одну комбинацию больше', () => {
  const key = (l: { kind: string; syms: readonly number[] }) => `${l.kind}:${l.syms.join('')}`;
  for (let m = 0; m < PAYTABLES.length; m++) {
    const t = PAYTABLES[m];
    assert.deepEqual(key(t[0]), 'triple:5');
    assert.equal(t[0].win, STAKES[m] * JACKPOT_MULT);
    for (let i = 1; i < t.length; i++) assert.ok(t[i].win <= t[i - 1].win, `автомат ${m}: строка ${i} по убыванию`);
    for (const l of t) assert.ok(Number.isInteger(l.win) && l.win > 0);
    if (m === 0) {
      assert.equal(t.length, 8);
      continue;
    }
    const prev = new Set(PAYTABLES[m - 1].map(key));
    const added = t.map(key).filter((k) => !prev.has(k));
    assert.equal(t.length, PAYTABLES[m - 1].length + 1);
    assert.deepEqual(added, [['left:0'], ['left:5'], ['mix:345'], ['mix:012']][m - 1]);
  }
});

test('выплата — лучшая подходящая строка', () => {
  assert.deepEqual(evaluate(0, [5, 5, 5]), { win: 100, line: 0, jackpot: true });
  assert.equal(evaluate(4, [5, 5, 5]).win, 5000);
  assert.equal(evaluate(0, [0, 3, 0]).win, 2, 'две вишни');
  assert.equal(evaluate(0, [5, 1, 5]).win, 4, 'две семёрки');
  assert.equal(evaluate(0, [0, 1, 2]).win, 0, 'на Копеечке одна вишня — ничего');
  assert.deepEqual(evaluate(0, [1, 2, 3]), { win: 0, line: -1, jackpot: false });
  assert.equal(evaluate(1, [0, 1, 2]).win, 1, 'Пятак: вишня на первом барабане');
  assert.equal(evaluate(1, [1, 0, 2]).win, 0, 'вишня не на первом — ничего');
  assert.equal(evaluate(2, [5, 1, 2]).win, 4, 'Червонец: семёрка на первом');
  assert.equal(evaluate(2, [0, 0, 0]).win, 60);
  assert.equal(evaluate(3, [3, 4, 5]).win, 30, 'Четвертак: ⚓⭐7 вперемешку');
  assert.equal(evaluate(3, [5, 5, 3]).win, 100, 'две семёрки дороже');
  assert.equal(evaluate(3, [4, 4, 4]).win, 1250);
  assert.equal(evaluate(4, [1, 2, 1]).win, 20, 'Полтинник: фрукты вперемешку');
  assert.equal(evaluate(4, [0, 1, 2]).win, 20, 'фрукты дороже вишни слева');
  assert.equal(evaluate(4, [0, 0, 1]).win, 50, 'две вишни дороже фруктов');
  assert.equal(evaluate(4, [1, 1, 1]).win, 400, 'три одинаковых — не «вперемешку»');
  assert.equal(evaluate(4, [3, 3, 4]).win, 75);
});

test('полный перебор: точные суммы; лесенка — чаще выигрыш и джекпот, больше возврат, казино всегда в плюсе', () => {
  const got = STAKES.map((_, m) => exhaust(m));
  assert.deepEqual(got, [
    { paid: 234600, hits: 53656, jackpots: 216 },
    { paid: 1178065, hits: 84489, jackpots: 252 },
    { paid: 2376632, hits: 94180, jackpots: 294 },
    { paid: 5961400, hits: 105574, jackpots: 343 },
    { paid: 11614515, hits: 139297, jackpots: 392 },
  ]);
  const rtp = got.map((g, m) => g.paid / ALL / STAKES[m]);
  const hit = got.map((g) => g.hits / ALL);
  const oneIn = got.map((g) => Math.round(ALL / g.jackpots));
  const bank = STAKES.map((_, m) => withBank(m));
  assert.deepEqual(rtp.map((x) => Math.round(x * 1000) / 10), [89.5, 89.9, 90.7, 91, 88.6]);
  assert.deepEqual(hit.map((x) => Math.round(x * 1000) / 10), [20.5, 32.2, 35.9, 40.3, 53.1]);
  assert.deepEqual(oneIn, [1214, 1040, 892, 764, 669]);
  assert.deepEqual(bank.map((x) => Math.round(x * 1000) / 10), [94.5, 94.9, 95.7, 96.2, 96.6]);
  for (let m = 1; m < STAKES.length; m++) {
    assert.ok(hit[m] > hit[m - 1], 'выигрыш чаще');
    assert.ok(oneIn[m] < oneIn[m - 1], 'джекпот чаще');
    assert.ok(bank[m] > bank[m - 1], 'возврат с банком больше');
  }
  for (const b of bank) assert.ok(b < 0.97, 'казино оставляет себе не меньше 3 %');
});

test('джекпот: ставка ×100 плюс доля банка по ставке; банк не опускается ниже 1000', () => {
  assert.deepEqual(STAKES, [1, 5, 10, 25, 50]);
  assert.deepEqual(jackpotPayout(50, 1500), { win: 6500, share: 1500, poolAfter: POOL_MIN });
  assert.deepEqual(jackpotPayout(1, 5000), { win: 200, share: 100, poolAfter: 4900 });
  assert.deepEqual(jackpotPayout(10, 1234.9), { win: 1246, share: 246, poolAfter: 1000 });
});

test('банк: 5 % каждой ставки копится ровно, без хвостов двоичных дробей', () => {
  let pool = POOL_MIN;
  for (let i = 0; i < 20; i++) pool = poolAfterStake(pool, 1);
  assert.equal(pool, POOL_MIN + 1);
  assert.equal(Math.floor(pool), 1001, 'табло показывает 1001, а не 1000');
  for (const stake of STAKES) pool = poolAfterStake(pool, stake);
  assert.equal(pool, POOL_MIN + 1 + 4.55);
  // хвост из старого файла состояния выравнивается первой же ставкой
  assert.equal(poolAfterStake(1000.9999999999991, 1), 1001.05);
});
