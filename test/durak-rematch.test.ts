import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autoMove, DK_AWAY_TICKS, DK_COUNT_TICKS, DK_RESULT_TICKS } from '../shared/durak.ts';
import { tableSeat } from '../shared/maps/lobby.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { DurakHall, type DurakResult } from '../server/lobby/durak.ts';

function setup() {
  const results: DurakResult[] = [];
  const hands: { slot: number; msg: ServerMsg }[] = [];
  const hall = new DurakHall({
    send: (slot, msg) => hands.push({ slot, msg }), broadcast() {}, event() {}, toast() {},
    finished: (r) => results.push(r),
  }, { deck: () => Array.from({ length: 36 }, (_, c) => c), rand: () => 0 });
  let tick = 0;
  const advance = (n: number) => hall.step(tick += n);
  const act = (ch: number, a: string, on?: number, slot = ch + 1) => hall.act(tableSeat(0, ch), slot, a, undefined, on);
  const sit = (ch: number) => hall.sit(tableSeat(0, ch), ch + 1, 100 + ch, `Игрок ${ch}`);
  const finish = () => {
    const tb = hall.table(0);
    for (let i = 0; i < 10_000 && tb.phase === 'play'; i++) {
      for (const s of tb.seats) {
        if (s.k !== 1 || !s.slot || s.p < 0) continue;
        const m = autoMove(tb.game!, s.p);
        if (m) hall.act(tableSeat(0, tb.seats.indexOf(s)), s.slot, m.a, 'card' in m ? m.card : undefined, 'on' in m ? m.on : undefined);
      }
      advance(61);
    }
    assert.equal(tb.phase, 'result', 'реальная партия завершилась через ходы и step');
    advance(61); // новое окно действий
  };
  const start = (humans = [5, 4], bot = false) => {
    humans.forEach(sit);
    if (bot) act(humans[0], 'bot');
    humans.forEach((ch) => act(ch, 'ready', 1));
    advance(DK_COUNT_TICKS);
    assert.equal(hall.table(0).phase, 'play');
  };
  return { hall, results, hands, advance, act, sit, finish, start };
}

test('повтор: итог сбрасывает согласие; каждый человек подтверждает, места и руки сохраняют владельца', () => {
  const { hall, results, hands, advance, act, start, finish } = setup();
  start();
  finish();
  const tb = hall.table(0);
  assert.equal(results.length, 1);
  assert.equal(tb.seats[5].ready, false);
  assert.equal(tb.seats[4].ready, false);
  const firstGame = tb.game;
  const result = tb.result;
  act(5, 'ready', 1);
  assert.equal(tb.phase, 'result', 'согласие не скрывает результат');
  assert.equal(tb.result, result);
  assert.equal(tb.seats[5].ready, true);
  advance(DK_RESULT_TICKS);
  assert.equal(tb.phase, 'wait', 'один человек не запускает партию за второго');
  assert.equal(tb.seats[5].ready, true, 'согласие переживает показ итога');
  assert.equal(tb.game, null);
  assert.equal(tb.result, null);
  assert.equal(tb.botAt, 0);
  assert.equal(tb.deadline, 0);
  assert.equal(tb.seats[5].p, -1);
  assert.ok(hands.some(({ slot, msg }) => slot === 6 && msg.t === 'durakHand' && msg.cards.length === 0));
  act(4, 'ready', 1);
  assert.equal(tb.phase, 'count');
  advance(DK_COUNT_TICKS);
  assert.equal(tb.phase, 'play');
  assert.notEqual(tb.game, firstGame);
  assert.equal(tb.seats[5].slot, 6);
  assert.equal(tb.seats[4].slot, 5);
  assert.equal(tb.seats[5].pid, 105);
  assert.equal(tb.seats[4].pid, 104);
  assert.equal(tb.game!.hands[tb.seats[5].p].length, 6);
  assert.equal(results.length, 1, 'повтор не выплачивает старый результат снова');
  finish();
  assert.equal(results.length, 2, 'ровно одно завершение для каждой партии');
  advance(DK_RESULT_TICKS + DK_COUNT_TICKS);
  assert.equal(tb.phase, 'wait', 'третья партия сама не запускается');
  assert.equal(results.length, 2);
});

test('повтор с ботом: можно согласиться и отменить во время итога или отсчёта', () => {
  const { hall, advance, act, start, finish } = setup();
  start([5], true);
  finish();
  const tb = hall.table(0);
  act(5, 'ready', 1);
  act(5, 'ready', 0);
  advance(DK_RESULT_TICKS);
  assert.equal(tb.phase, 'wait');
  assert.equal(tb.seats[0].k, 2);
  assert.equal(tb.seats[0].ready, true);
  act(5, 'ready', 1);
  assert.equal(tb.phase, 'count');
  act(5, 'ready', 0);
  advance(DK_COUNT_TICKS);
  assert.equal(tb.phase, 'wait');
  act(5, 'ready', 1);
  advance(DK_COUNT_TICKS);
  assert.equal(tb.phase, 'play');
});

test('отошёл и вернулся на итог: прежнее согласие отменено, место остаётся своим', () => {
  const { hall, advance, act, start, finish } = setup();
  start();
  finish();
  const tb = hall.table(0);
  act(5, 'ready', 1);
  act(4, 'ready', 1);
  hall.stand(tableSeat(0, 4), 5);
  assert.equal(tb.seats[4].ready, false, 'уход отзывает согласие');
  assert.equal(hall.canSit(tableSeat(0, 4), 104), true);
  assert.equal(hall.canSit(tableSeat(0, 4), 999), false);
  hall.sit(tableSeat(0, 4), 55, 104, 'Вернулся');
  advance(DK_RESULT_TICKS);
  assert.equal(tb.phase, 'wait');
  assert.equal(tb.seats[4].slot, 55);
  act(4, 'ready', 1, 5);
  assert.equal(tb.phase, 'wait', 'старое соединение не даёт согласие');
  act(4, 'ready', 1, 55);
  advance(DK_COUNT_TICKS);
  assert.equal(tb.phase, 'play');
});

test('ушедший не блокирует следующий состав; новое место зрителя требует отдельного согласия', () => {
  const { hall, advance, act, sit, start, finish } = setup();
  start();
  sit(3); // сидящий зритель присоединился после раздачи
  finish();
  const tb = hall.table(0);
  assert.equal(tb.seats[3].p, -1);
  act(5, 'ready', 1);
  hall.stand(tableSeat(0, 4), 5);
  hall.act(tableSeat(0, 3), 999, 'ready', undefined, 1);
  advance(DK_RESULT_TICKS);
  assert.equal(tb.seats[4].k, 0);
  assert.equal(tb.phase, 'wait', 'зритель не дал согласие');
  act(3, 'ready', 1);
  advance(DK_COUNT_TICKS);
  assert.equal(tb.phase, 'play');
  assert.equal(tb.game!.n, 2);
  assert.ok(tb.seats[3].p >= 0);
});

test('согласие всех во время итога начинает отсчёт только после показа результата', () => {
  const { hall, advance, act, start, finish } = setup();
  start();
  finish();
  act(5, 'ready', 1);
  act(4, 'ready', 1);
  assert.equal(hall.table(0).phase, 'result');
  advance(DK_RESULT_TICKS);
  assert.equal(hall.table(0).phase, 'count');
  advance(DK_COUNT_TICKS);
  assert.equal(hall.table(0).phase, 'play');
});

test('временный бот ушедшего доигрывает, но не остаётся в повторной партии', () => {
  const { hall, advance, act, start, finish } = setup();
  start();
  hall.stand(tableSeat(0, 4), 5);
  advance(DK_AWAY_TICKS);
  assert.equal(hall.table(0).seats[4].temp, true);
  finish();
  act(5, 'ready', 1);
  advance(DK_RESULT_TICKS);
  const tb = hall.table(0);
  assert.equal(tb.seats[4].k, 0);
  assert.equal(tb.phase, 'wait', 'оставшемуся нужен новый соперник');
  act(5, 'bot');
  advance(DK_COUNT_TICKS);
  assert.equal(tb.phase, 'play');
  assert.equal(tb.seats[0].temp, false);
});

test('выключенный стол не принимает места и действия, индексы снимков стабильны', () => {
  const hall = new DurakHall({ send() {}, broadcast() {}, event() {}, toast() {}, finished() {} }, { allowedTables: [0, 1] });
  assert.equal(hall.canSit(tableSeat(2, 5), 105), false);
  hall.sit(tableSeat(2, 5), 6, 105, 'Скрытый');
  hall.act(tableSeat(2, 5), 6, 'bot', undefined, undefined);
  hall.act(tableSeat(2, 5), 6, 'ready', undefined, 1);
  hall.step(DK_COUNT_TICKS);
  assert.equal(hall.views().length, 3);
  assert.equal(hall.view(2).phase, 'wait');
  assert.ok(hall.view(2).seats.every((s) => s.k === 0));
  assert.equal(hall.canSit(tableSeat(1, 5), 105), true);
});

test('бот — только для игры одному: вдвоём не добавить; сел второй — боты уходят', () => {
  const { hall, act, sit } = setup();
  const tb = hall.table(0);
  const bots = () => tb.seats.filter((s) => s.k === 2).length;
  sit(5);
  sit(4);
  act(5, 'bot');
  assert.equal(bots(), 0, 'двое людей — бота не добавить');
  hall.stand(tableSeat(0, 4), 5);
  act(5, 'bot');
  act(5, 'bot');
  assert.equal(bots(), 2, 'один человек — боты садятся');
  act(5, 'ready', 1);
  assert.equal(tb.phase, 'count');
  sit(3);
  assert.equal(bots(), 0, 'сел второй — боты ушли');
  assert.equal(tb.phase, 'wait', 'ждём «Готов» второго');
});

test('сел второй, пока показан итог партии с ботом, — после итога бот уходит', () => {
  const { hall, advance, sit, start, finish } = setup();
  start([5], true);
  finish();
  const tb = hall.table(0);
  sit(4);
  assert.equal(tb.seats[0].k, 2, 'итог досматривают как был');
  advance(DK_RESULT_TICKS);
  assert.equal(tb.phase, 'wait');
  assert.equal(tb.seats.filter((s) => s.k === 2).length, 0);
  assert.equal(tb.seats.filter((s) => s.k === 1).length, 2);
});
