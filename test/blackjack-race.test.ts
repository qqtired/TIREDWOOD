import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BJ_COUNT_TICKS, BJ_RESULT_TICKS, seatPrint, type BlackjackAct } from '../shared/blackjack.ts';
import { BlackjackHall } from '../server/lobby/blackjack.ts';
import { allOf, login, placeAt, setupHub, steps } from './kit.ts';

const C = (rank: number, suit = 0) => suit * 13 + rank - 1;
/**
 * Четверо за столом: раздача по кругу — первые карты игроков, первая карта дилера, вторые карты игроков, вторая дилера.
 * У игроков 11, 12, 12 и 15 (никто не блэкджек), у дилера 17; дальше идут двойки для «ещё».
 */
const DECK = [C(5), C(5), C(4), C(6), C(10), C(6), C(7), C(8), C(9), C(7), ...Array.from({ length: 40 }, () => C(2))];

/** Стол на n игроков: места 12…, слоты 1…, профили 1… по 1000 жетонов; резерв и расчёт — как у настоящих профилей. */
function table(n: number, deck: number[] = DECK, balance = 1000) {
  const money = new Map<number, number>();
  const escrow = new Map<number, { round: string; amount: number }>();
  const toasts: Array<{ slot: number; text: string }> = [];
  const hall = new BlackjackHall({
    broadcast() {},
    toast: (slot, text) => toasts.push({ slot, text }),
    reserve(pid, round, amount) {
      const have = money.get(pid) ?? 0;
      const old = escrow.get(pid);
      if (!Number.isSafeInteger(amount) || amount <= 0 || have < amount || (old && old.round !== round)) return false;
      money.set(pid, have - amount);
      escrow.set(pid, { round, amount: (old?.amount ?? 0) + amount });
      return true;
    },
    settle(pid, round, wager, payout) {
      const e = escrow.get(pid);
      if (!e || e.round !== round || e.amount !== wager || !Number.isSafeInteger(payout)) return false;
      money.set(pid, (money.get(pid) ?? 0) + payout);
      escrow.delete(pid);
      return true;
    },
  }, { deck: () => [...deck] });
  for (let i = 0; i < n; i++) {
    money.set(i + 1, balance);
    hall.sit(12 + i, i + 1, i + 1, `Игрок ${i + 1}`);
  }
  let tick = 0;
  const step = (k = 1) => { for (let i = 0; i < k; i++) hall.step(++tick); };
  /** Действие места ch по виду стола rev (по умолчанию — по нынешнему). */
  const act = (ch: number, a: BlackjackAct, amount?: number, rev = hall.view().rev) => hall.act(12 + ch, ch + 1, a, rev, amount);
  const view = () => hall.view();
  const toBetting = () => { for (let i = 0; i < 20_000 && view().phase !== 'betting'; i++) step(); assert.equal(view().phase, 'betting'); };
  const texts = () => toasts.map((x) => x.text);
  return { hall, money, escrow, toasts, texts, step, act, view, toBetting };
}

test('гонка ставок: четверо ставят по одному и тому же виду стола — приняты все, отказов нет, списано по разу', () => {
  const t = table(4);
  const rev = t.view().rev;
  for (let ch = 0; ch < 4; ch++) t.act(ch, 'bet', 10 * (ch + 1), rev);
  assert.deepEqual(t.texts(), [], 'ни одного отказа: чужие ставки — не повод');
  for (let ch = 0; ch < 4; ch++) {
    assert.equal(t.view().seats[ch].bet, 10 * (ch + 1));
    assert.equal(t.view().seats[ch].participating, true);
    assert.equal(t.money.get(ch + 1), 1000 - 10 * (ch + 1));
    assert.equal(t.escrow.get(ch + 1)?.amount, 10 * (ch + 1));
  }
  assert.equal(t.view().phase, 'countdown');
});

test('гонка ставок много раз подряд: каждый раунд все четверо ставят по виду до первой ставки, отказов ноль', () => {
  const t = table(4);
  let total = 0;
  for (let round = 0; round < 25; round++) {
    const rev = t.view().rev;
    const order = round % 2 ? [3, 2, 1, 0] : [0, 1, 2, 3];
    for (const ch of order) t.act(ch, 'bet', 1 + ((round + ch) % 5), rev);
    total += [0, 1, 2, 3].reduce((s, ch) => s + 1 + ((round + ch) % 5), 0);
    t.step(BJ_COUNT_TICKS);
    assert.equal(t.view().phase, 'play');
    t.toBetting();
  }
  assert.deepEqual(t.texts(), []);
  const left = [1, 2, 3, 4].reduce((s, pid) => s + t.money.get(pid)!, 0);
  assert.ok(left > 4000 - total - 1 && left <= 4000 + total * 3, 'жетоны сходятся: ничего не списано дважды');
  assert.equal(t.escrow.size, 0, 'резервов не осталось');
});

test('чужие изменения стола — не отказ: посадка, уход и смена ника между видом и ставкой', () => {
  const t = table(3);
  const rev = t.view().rev;
  t.hall.sit(15, 9, 9, 'Новенький');
  t.hall.rename(2, 'Другой ник');
  t.act(0, 'bet', 10, rev);
  t.hall.stand(15, 9);
  t.act(1, 'bet', 20, rev);
  t.hall.sit(16, 10, 10, 'Ещё один');
  t.act(2, 'bet', 30, rev);
  assert.deepEqual(t.texts(), []);
  assert.deepEqual([0, 1, 2].map((ch) => t.view().seats[ch].bet), [10, 20, 30]);
  assert.deepEqual([1, 2, 3].map((pid) => t.money.get(pid)), [990, 980, 970]);
});

test('ход в свой ход проходит, даже если стол успел измениться без тебя', () => {
  const t = table(4);
  for (let ch = 0; ch < 4; ch++) t.act(ch, 'bet', 10);
  t.step(BJ_COUNT_TICKS);
  assert.equal(t.view().phase, 'play');
  assert.equal(t.view().turn, 0);
  const rev = t.view().rev;
  t.hall.sit(16, 7, 7, 'Зритель');
  t.hall.rename(3, 'Ник');
  t.hall.sit(17, 8, 8, 'Ещё зритель');
  t.act(0, 'hit', undefined, rev);
  assert.equal(t.view().seats[0].hands[0].cards.length, 3);
  const afterHit = t.view().rev;
  t.hall.stand(16, 7);
  t.act(0, 'stand', undefined, afterHit);
  assert.equal(t.view().turn, 1);
  const second = t.view().rev;
  t.hall.sit(16, 11, 11, 'Другой зритель');
  t.act(1, 'stand', undefined, second);
  assert.equal(t.view().turn, 2);
  assert.deepEqual(t.texts(), []);
});

test('ставка на смене фазы: на отсчёте принимается, после раздачи — понятный отказ без списания', () => {
  const t = table(3);
  const betting = t.view().rev;
  t.act(0, 'bet', 10, betting);
  assert.equal(t.view().phase, 'countdown', 'первая ставка запустила отсчёт');
  t.act(1, 'bet', 10, betting);
  assert.deepEqual(t.texts(), [], 'вторая ставка по виду до смены фазы принята');
  const countdown = t.view().rev;
  t.step(BJ_COUNT_TICKS);
  assert.equal(t.view().phase, 'play');
  t.act(2, 'bet', 10, countdown);
  assert.equal(t.toasts.length, 1);
  assert.match(t.texts()[0], /Ставки закрыты/);
  assert.equal(t.toasts[0].slot, 3);
  assert.equal(t.money.get(3), 1000);
  assert.equal(t.escrow.has(3), false);
  assert.equal(t.view().seats[2].participating, false);
  assert.equal(t.view().seats[2].hands.length, 0);
  t.toBetting();
  t.act(2, 'bet', 10);
  assert.equal(t.view().seats[2].bet, 10, 'в следующем раунде ставка проходит');
  assert.equal(t.money.get(3), 990);
});

test('ставка после итога раунда отклоняется понятно; отмена единственной ставки не мешает чужой, пришедшей по старому виду', () => {
  const t = table(2);
  const betting = t.view().rev;
  t.act(0, 'bet', 10, betting);
  t.act(0, 'cancel');
  assert.equal(t.view().phase, 'betting', 'отсчёт отменён вместе с ставкой');
  t.act(1, 'bet', 10, betting);
  assert.deepEqual(t.texts(), []);
  assert.equal(t.view().phase, 'countdown');
  t.step(BJ_COUNT_TICKS);
  for (let i = 0; i < 20_000 && t.view().phase !== 'result'; i++) t.step();
  assert.equal(t.view().phase, 'result');
  t.act(0, 'bet', 10);
  assert.equal(t.toasts.length, 1);
  assert.match(t.texts()[0], /следующем/);
  assert.equal(t.money.get(1), 1000);
  t.step(BJ_RESULT_TICKS);
});

test('двойная отправка: тот же запрос второй раз молча игнорируется, жетоны списываются один раз', () => {
  const t = table(2);
  const rev = t.view().rev;
  t.act(0, 'bet', 50, rev);
  t.act(0, 'bet', 50, rev);
  assert.equal(t.money.get(1), 950);
  assert.equal(t.escrow.get(1)?.amount, 50);
  t.act(1, 'bet', 10, rev);
  t.act(1, 'bet', 10, rev);
  const cancel = t.view().rev;
  t.act(1, 'cancel', undefined, cancel);
  t.act(1, 'cancel', undefined, cancel);
  assert.equal(t.money.get(2), 1000, 'ставка вернулась один раз');
  t.act(1, 'bet', 10);
  t.step(BJ_COUNT_TICKS);
  assert.equal(t.view().phase, 'play');
  const play = t.view().rev;
  t.act(0, 'double', undefined, play);
  t.act(0, 'double', undefined, play);
  assert.equal(t.view().seats[0].hands[0].cards.length, 3, 'одна карта');
  assert.equal(t.view().seats[0].hands[0].bet, 100, 'ставка удвоена один раз');
  assert.equal(t.money.get(1), 900);
  assert.equal(t.escrow.get(1)?.amount, 100);
  assert.deepEqual(t.texts(), [], 'повтор не шумит');
});

test('двойная отправка «ещё» и «хватит»: карта одна, ход один', () => {
  const t = table(2);
  t.act(0, 'bet', 10);
  t.act(1, 'bet', 10);
  t.step(BJ_COUNT_TICKS);
  const rev = t.view().rev;
  t.act(0, 'hit', undefined, rev);
  t.act(0, 'hit', undefined, rev);
  assert.equal(t.view().seats[0].hands[0].cards.length, 3);
  const next = t.view().rev;
  t.act(0, 'stand', undefined, next);
  t.act(0, 'stand', undefined, next);
  assert.equal(t.view().turn, 1);
  assert.equal(t.view().seats[1].hands[0].cards.length, 2, 'чужая рука не тронута повтором');
  assert.deepEqual(t.texts(), []);
});

test('устаревшее по своему месту действие отклоняется, остальное остаётся как было', () => {
  const t = table(2);
  t.act(0, 'bet', 10);
  t.act(1, 'bet', 10);
  t.step(BJ_COUNT_TICKS);
  const rev = t.view().rev;
  t.act(0, 'hit', undefined, rev);
  const cards = t.view().seats[0].hands[0].cards.length;
  t.act(0, 'stand', undefined, rev);
  assert.equal(t.toasts.length, 1);
  assert.match(t.texts()[0], /уже изменилось/);
  assert.equal(t.view().seats[0].hands[0].status, 'playing');
  assert.equal(t.view().turn, 0);
  assert.equal(t.view().seats[0].hands[0].cards.length, cards);
  t.act(0, 'stand');
  assert.equal(t.view().turn, 1, 'по свежему виду — проходит');
  assert.equal(t.toasts.length, 1);
});

test('настоящие отказы остаются, и каждый называет причину', () => {
  const t = table(4, DECK, 30);
  t.act(0, 'bet', 50);
  assert.match(t.texts().at(-1) ?? '', /жетонов/, 'денег нет');
  assert.equal(t.money.get(1), 30);
  t.act(0, 'bet', 10);
  t.act(0, 'bet', 20);
  assert.match(t.texts().at(-1) ?? '', /уже сделана/, 'вторая, другая ставка');
  assert.equal(t.money.get(1), 20);
  t.act(1, 'cancel');
  assert.match(t.texts().at(-1) ?? '', /убирать нечего/);
  t.act(1, 'bet', 10);
  t.act(2, 'bet', 10);
  t.act(3, 'bet', 10);
  t.step(BJ_COUNT_TICKS);
  assert.equal(t.view().turn, 0);
  t.act(1, 'hit');
  assert.match(t.texts().at(-1) ?? '', /не твой ход/);
  t.act(0, 'cancel');
  assert.match(t.texts().at(-1) ?? '', /ставку не убрать/);
  t.act(0, 'hit');
  t.act(0, 'double');
  assert.match(t.texts().at(-1) ?? '', /первых двух картах/);
  assert.equal(t.view().seats[0].hands[0].cards.length, 3);
  assert.ok(t.texts().every((x) => !/Состояние стола/.test(x)), 'прежнего ложного отказа нет');
});

test('не-число вместо версии — отказ без последствий', () => {
  const t = table(1);
  const junk = [NaN, Infinity, -1, 1.5, '3', null, undefined, {}] as unknown as number[];
  for (const rev of junk) t.hall.act(12, 1, 'bet', rev, 10);
  assert.equal(t.toasts.length, junk.length);
  assert.equal(t.money.get(1), 1000);
  assert.equal(t.view().seats[0].participating, false);
});

test('отпечаток места: чужие ставки, ники и ходы его не меняют, свои — меняют', () => {
  const t = table(4);
  const print = (ch: number) => { const v = t.view(); return seatPrint(v, v.seats[ch], ch); };
  const idle = print(0);
  t.act(1, 'bet', 10);
  t.hall.rename(2, 'Другой ник');
  t.hall.sit(16, 9, 9, 'Зритель');
  assert.equal(print(0), idle, 'чужая ставка, ник и посадка не трогают моё место');
  t.act(0, 'bet', 10);
  const bet = print(0);
  assert.notEqual(bet, idle);
  t.act(2, 'bet', 10);
  t.act(3, 'bet', 10);
  assert.equal(print(0), bet, 'ставки соседей не меняют моё место');
  t.step(BJ_COUNT_TICKS);
  const dealt = print(0);
  assert.notEqual(dealt, bet, 'раздача меняет');
  const other = print(1);
  t.act(0, 'hit');
  assert.notEqual(print(0), dealt, 'моя карта меняет');
  assert.equal(print(1), other, 'а на чужое место не влияет');
});

test('real Hub: четверо ставят в один момент по одному виду и дублируют запрос — ни одного отказа, баланс списан по разу', () => {
  const { hub } = setupHub({ blackjackDeck: () => [...DECK] });
  const players = ['RaceA', 'RaceB', 'RaceC', 'RaceD'].map((nick) => login(hub, nick));
  players.forEach((p, ch) => {
    const it = hub.lobby.map.interact.find((i) => i.kind === 'blackjack' && i.arg === 12 + ch)!;
    placeAt(hub, p.c, it.x, it.z, it.y);
    hub.onJson(p.c, { t: 'use', id: it.id });
  });
  const before = players.map((p) => p.c.profile!.tokens);
  const rev = hub.lobby.blackjack.view().rev;
  players.forEach((p, i) => hub.onJson(p.c, { t: 'blackjack', table: 2, a: 'bet', rev, amount: 10 + i }));
  players.forEach((p, i) => hub.onJson(p.c, { t: 'blackjack', table: 2, a: 'bet', rev, amount: 10 + i }));
  for (const p of players) assert.equal(allOf(p.s, 'blackjackError').length, 0, 'ни одного blackjackError');
  players.forEach((p, i) => {
    assert.equal(p.c.profile!.tokens, before[i] - (10 + i), 'списано один раз');
    assert.equal(p.c.profile!.blackjackEscrow?.amount, 10 + i);
  });
  steps(hub, BJ_COUNT_TICKS);
  assert.equal(hub.lobby.blackjack.view().phase, 'play');
  const play = hub.lobby.blackjack.view().rev;
  hub.onJson(players[0].c, { t: 'blackjack', table: 2, a: 'hit', rev: play });
  hub.onJson(players[0].c, { t: 'blackjack', table: 2, a: 'hit', rev: play });
  assert.equal(hub.lobby.blackjack.view().seats[0].hands[0].cards.length, 3);
  for (const p of players) assert.equal(allOf(p.s, 'blackjackError').length, 0);
});

test('real Hub: настоящий отказ приходит ровно одному игроку и с понятным текстом', () => {
  const { hub } = setupHub({ blackjackDeck: () => [...DECK] });
  const a = login(hub, 'TrueA'), b = login(hub, 'TrueB');
  [a, b].forEach((p, ch) => {
    const it = hub.lobby.map.interact.find((i) => i.kind === 'blackjack' && i.arg === 12 + ch)!;
    placeAt(hub, p.c, it.x, it.z, it.y);
    hub.onJson(p.c, { t: 'use', id: it.id });
  });
  const rev = hub.lobby.blackjack.view().rev;
  hub.onJson(a.c, { t: 'blackjack', table: 2, a: 'bet', rev, amount: 10 });
  hub.onJson(b.c, { t: 'blackjack', table: 2, a: 'hit', rev });
  assert.equal(allOf(a.s, 'blackjackError').length, 0);
  const errors = allOf(b.s, 'blackjackError');
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Раздача ещё не началась/);
});
