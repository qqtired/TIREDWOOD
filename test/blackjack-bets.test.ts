import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BJ_COUNT_TICKS, BJ_DEALER_TICKS, BJ_MAX_BET, BJ_RESULT_TICKS, isBet, maxBet, naturalPayout, type BlackjackAct } from '../shared/blackjack.ts';
import { BlackjackHall } from '../server/lobby/blackjack.ts';

const C = (rank: number, suit = 0) => suit * 13 + rank - 1;

/** Стол с двумя игроками: места 12 и 13, слоты 1 и 2, профили 1 и 2 с балансами; колода задана. */
function table(deck: number[], balances: Record<number, number> = { 1: 1000, 2: 1000 }) {
  const money = new Map(Object.entries(balances).map(([k, v]) => [Number(k), v]));
  const escrow = new Map<number, { round: string; amount: number }>();
  const toasts: string[] = [];
  const hall = new BlackjackHall({
    broadcast() {},
    toast: (_slot, text) => toasts.push(text),
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
  let tick = 0;
  const step = (n = 1) => { for (let i = 0; i < n; i++) hall.step(++tick); };
  /** Действие места chair (0 — первое) с актуальной версией стола. */
  const act = (chair: number, a: BlackjackAct, amount?: unknown) => hall.act(12 + chair, chair + 1, a, hall.view().rev, amount as number | undefined);
  const view = () => hall.view();
  const toResult = () => { for (let i = 0; i < BJ_DEALER_TICKS * 15 && view().phase !== 'result'; i++) step(); assert.equal(view().phase, 'result'); };
  hall.sit(12, 1, 1, 'Первый');
  hall.sit(13, 2, 2, 'Второй');
  return { hall, money, escrow, toasts, step, act, view, toResult };
}

// 10+9 против дилера 10+7: оба игрока, если встанут, выигрывают
const WIN2 = [C(10), C(10), C(10), C(9), C(8), C(7)];
// у первого блэкджек, у дилера 17
const NATURAL = [C(1), C(10), C(13), C(7)];

test('ставка — любое целое от 1 до лимита стола; прочее отклоняется, деньги не трогаются', () => {
  const t = table([C(10), C(10), C(8), C(7)]);
  const bad: unknown[] = [0.5, -1, NaN, Infinity, BJ_MAX_BET + 1, 1e21, Number.MAX_SAFE_INTEGER, '10', null, undefined, {}, [10], true];
  for (const amount of bad) {
    t.act(0, 'bet', amount);
    assert.equal(t.view().seats[0].participating, false, `ставка ${String(amount)} не должна пройти`);
  }
  assert.equal(t.toasts.length, bad.length);
  assert.equal(t.money.get(1), 1000);
  assert.equal(t.escrow.size, 0);
  t.act(0, 'bet', 37);
  assert.equal(t.view().seats[0].bet, 37);
  assert.equal(t.money.get(1), 963);
  t.act(1, 'bet', BJ_MAX_BET);
  assert.equal(t.view().seats[1].bet, BJ_MAX_BET);
  assert.equal(t.money.get(2), 1000 - BJ_MAX_BET);
});

test('ставка больше баланса отклоняется сервером; ровно весь баланс — можно', () => {
  const t = table([C(10), C(10), C(8), C(7)], { 1: 30, 2: 5 });
  t.act(0, 'bet', 50);
  assert.equal(t.view().seats[0].participating, false);
  assert.match(t.toasts.at(-1) ?? '', /жетонов/);
  assert.equal(t.money.get(1), 30);
  t.act(0, 'bet', 30);
  assert.equal(t.view().seats[0].bet, 30);
  assert.equal(t.money.get(1), 0);
  t.act(1, 'bet', 6);
  assert.equal(t.view().seats[1].participating, false);
  t.act(1, 'bet', 1);
  assert.equal(t.view().seats[1].bet, 1);
});

test('бесплатная ставка 0 по-прежнему не трогает кошелёк', () => {
  const t = table([C(10), C(10), C(8), C(7)]);
  t.act(0, 'bet', 0);
  assert.equal(t.view().seats[0].participating, true);
  assert.equal(t.view().seats[0].bet, 0);
  assert.equal(t.money.get(1), 1000);
  assert.equal(t.escrow.size, 0);
});

test('maxBet — меньшее из баланса и лимита; isBet принимает только целые 0…лимит', () => {
  assert.equal(maxBet(37), 37);
  assert.equal(maxBet(10_000), BJ_MAX_BET);
  assert.equal(maxBet(12.9), 12);
  assert.equal(maxBet(-5), 0);
  assert.equal(maxBet(NaN), 0);
  assert.equal(isBet(0), true);
  assert.equal(isBet(BJ_MAX_BET), true);
  for (const x of [-1, 0.1, BJ_MAX_BET + 1, NaN, '5', null, undefined]) assert.equal(isBet(x), false);
});

test('блэкджек 3:2 с нечётной ставкой: половинка жетона отбрасывается, в кошельке нет дробей', () => {
  assert.equal(naturalPayout(10), 25);
  assert.equal(naturalPayout(5), 12);
  assert.equal(naturalPayout(7), 17);
  assert.equal(naturalPayout(1), 2);
  assert.equal(naturalPayout(BJ_MAX_BET), 1250);
  const t = table(NATURAL, { 1: 100, 2: 100 });
  t.act(0, 'bet', 7);
  t.step(BJ_COUNT_TICKS);
  t.toResult();
  assert.equal(t.view().seats[0].hands[0].result, 'blackjack');
  assert.equal(t.view().seats[0].hands[0].payout, 17);
  assert.equal(t.money.get(1), 100 - 7 + 17);
  assert.ok(Number.isInteger(t.money.get(1)));
  assert.equal(t.escrow.size, 0);
});

test('сумма из нескольких фишек — это просто целая ставка: 85 жетонов, удвоение и расчёт', () => {
  const t = table([C(5), C(10), C(6), C(7), C(10)], { 1: 500, 2: 0 });
  t.act(0, 'bet', 85);
  t.step(BJ_COUNT_TICKS);
  t.act(0, 'double');
  t.toResult();
  assert.equal(t.view().seats[0].hands[0].bet, 170);
  assert.equal(t.view().seats[0].hands[0].result, 'win');
  assert.equal(t.money.get(1), 500 - 170 + 340);
});

// --------------------------------------------------------------------- «дальше»

test('один игрок: «Следующая раздача» сразу открывает ставки, деньги итог уже получили', () => {
  const t = table([C(10), C(10), C(8), C(7)]);
  t.act(0, 'bet', 10);
  t.step(BJ_COUNT_TICKS);
  t.act(0, 'stand');
  t.toResult();
  const before = t.money.get(1);
  assert.deepEqual(t.view().seats[0].actions, ['skip']);
  t.act(0, 'skip');
  assert.equal(t.view().phase, 'betting');
  assert.deepEqual(t.view().seats[0].actions, ['bet']);
  assert.equal(t.view().seats[0].skip, false);
  assert.equal(t.view().seats[0].hands.length, 0);
  assert.equal(t.money.get(1), before);
});

test('двое: итог ждёт обоих; поторопившийся видит, что ждут остальных, а пауза всё равно кончится сама', () => {
  const t = table(WIN2);
  t.act(0, 'bet', 10);
  t.act(1, 'bet', 20);
  t.step(BJ_COUNT_TICKS);
  t.act(0, 'stand');
  t.act(1, 'stand');
  t.toResult();
  assert.deepEqual(t.view().seats[0].actions, ['skip']);
  t.act(0, 'skip');
  assert.equal(t.view().phase, 'result', 'второй ещё смотрит итог');
  assert.equal(t.view().seats[0].skip, true);
  assert.deepEqual(t.view().seats[0].actions, []);
  assert.deepEqual(t.view().seats[1].actions, ['skip']);
  t.act(1, 'skip');
  assert.equal(t.view().phase, 'betting');
  // а если второй не нажмёт — обычная пауза итога кончается сама
  const slow = table(WIN2);
  slow.act(0, 'bet', 10);
  slow.act(1, 'bet', 20);
  slow.step(BJ_COUNT_TICKS);
  slow.act(0, 'stand');
  slow.act(1, 'stand');
  slow.toResult();
  slow.act(0, 'skip');
  slow.step(BJ_RESULT_TICKS - 1);
  assert.equal(slow.view().phase, 'result');
  slow.step(2);
  assert.equal(slow.view().phase, 'betting');
  assert.ok(slow.view().seats.every((s) => !s.skip));
});

test('сидящий без ставки не нажимает «дальше» и не задерживает остальных', () => {
  const t = table(NATURAL);
  t.act(0, 'bet', 10);
  t.step(BJ_COUNT_TICKS);
  t.toResult();
  assert.deepEqual(t.view().seats[1].actions, [], 'зритель за столом не голосует');
  t.act(1, 'skip');
  assert.equal(t.view().phase, 'result');
  t.act(0, 'skip');
  assert.equal(t.view().phase, 'betting');
});

test('«Раздать сейчас»: только когда поставили все севшие и нажали все; один за столом — сразу', () => {
  const solo = table([C(10), C(10), C(8), C(7)]);
  solo.hall.stand(13, 2);
  solo.act(0, 'bet', 10);
  assert.deepEqual(solo.view().seats[0].actions, ['cancel', 'skip']);
  solo.act(0, 'skip');
  assert.equal(solo.view().phase, 'play');
  assert.equal(solo.view().seats[0].hands[0].cards.length, 2);

  const t = table([C(10), C(10), C(8), C(7), C(9), C(6)]);
  t.act(0, 'bet', 10);
  t.act(0, 'skip');
  assert.equal(t.view().phase, 'countdown', 'второй за столом ещё не поставил');
  assert.equal(t.view().seats[0].skip, true);
  assert.deepEqual(t.view().seats[0].actions, ['cancel']);
  t.act(1, 'bet', 20);
  assert.equal(t.view().phase, 'countdown', 'он сам ещё не нажал');
  assert.deepEqual(t.view().seats[1].actions, ['cancel', 'skip']);
  t.act(1, 'skip');
  assert.equal(t.view().phase, 'play');
  assert.ok(t.view().seats.filter((s) => s.participating).every((s) => s.hands.length === 1 && s.hands[0].cards.length === 2));
  assert.ok(t.view().seats.every((s) => !s.skip), 'голоса сброшены на раздаче');
});

test('отмена ставки снимает «раздать сейчас», а уход последнего несогласного отпускает остальных', () => {
  const t = table([C(10), C(10), C(8), C(7), C(9), C(6)]);
  t.act(0, 'bet', 10);
  t.act(1, 'bet', 10);
  t.act(0, 'skip');
  t.act(1, 'cancel');
  t.step(1);
  assert.equal(t.view().phase, 'countdown', 'второй всё ещё сидит и может поставить заново');
  t.hall.stand(13, 2);
  t.step(1);
  assert.equal(t.view().phase, 'play', 'за столом остался один, и он уже нажал');
  // повторная ставка после отмены снова без голоса
  const u = table([C(10), C(10), C(8), C(7)]);
  u.act(0, 'bet', 10);
  u.act(0, 'skip');
  u.act(0, 'cancel');
  u.act(0, 'bet', 10);
  assert.equal(u.view().seats[0].skip, false);
  assert.deepEqual(u.view().seats[0].actions, ['cancel', 'skip']);
});

test('«дальше» не бывает не вовремя и не шумит: ни тоста, ни смены версии', () => {
  const t = table([C(10), C(10), C(8), C(7)]);
  const rev = t.view().rev;
  t.hall.act(12, 1, 'skip', rev - 1);
  t.act(0, 'skip');
  assert.equal(t.view().rev, rev, 'до ставок «дальше» ничего не меняет');
  assert.equal(t.toasts.length, 0);
  t.act(0, 'bet', 10);
  t.step(BJ_COUNT_TICKS);
  assert.equal(t.view().phase, 'play');
  const playing = t.view().rev;
  t.act(0, 'skip');
  t.hall.act(12, 1, 'skip', 0);
  assert.equal(t.view().rev, playing, 'в ходе игры «дальше» не работает');
  assert.equal(t.toasts.length, 0);
  // чужое место не может нажать за другого
  t.hall.act(13, 1, 'skip', playing);
  assert.equal(t.toasts.length, 1, 'чужое место — обычный отказ «сначала сядьте»');
});
