// Ставка в дураке — только по балансу: больше, чем есть жетонов, поставить нельзя. Сервер отказывает с причиной;
// поднятая ставка стола и потраченные до раздачи жетоны переводят игрока на бесплатную игру, а не ломают партию.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DK_COUNT_TICKS } from '../shared/durak.ts';
import { DurakHall } from '../server/lobby/durak.ts';
import { lastOf, login, placeAt, setupHub } from './kit.ts';

/** Стол с хуком баланса: balances — жетоны по номерам профилей 1, 2, 3 … (они же стулья 0, 1, 2 …). */
function setup(tokens: number[]) {
  const balances = new Map(tokens.map((n, i) => [i + 1, n]));
  const toasts: Array<{ slot: number; text: string }> = [];
  const reserves: Array<Array<{ pid: number; amount: number }>> = [];
  const hall = new DurakHall({
    send() {}, broadcast() {}, event() {}, finished() {},
    toast: (slot, text) => toasts.push({ slot, text }),
    balance: (pid) => balances.get(pid) ?? 0,
    reserve(round, bets) {
      reserves.push(bets.map((b) => ({ ...b })));
      if (bets.some((b) => (balances.get(b.pid) ?? 0) < b.amount)) return false;
      for (const b of bets) balances.set(b.pid, balances.get(b.pid)! - b.amount);
      return !!round;
    },
    settle(_round, payouts) {
      for (const p of payouts) balances.set(p.pid, balances.get(p.pid)! + p.payout);
      return true;
    },
  }, { deck: () => Array.from({ length: 36 }, (_, i) => i), rand: () => 0 });
  let tick = 0;
  const step = (n = 61) => hall.step((tick += n));
  tokens.forEach((_, ch) => hall.sit(ch, ch + 1, ch + 1, `Игрок${ch}`));
  const act = (ch: number, a: string, on?: number) => hall.act(ch, ch + 1, a, undefined, on);
  return { hall, balances, toasts, reserves, step, act, seats: () => hall.table(0).seats };
}

test('ставка не включается, если жетонов меньше ставки стола; причину видит сам игрок', () => {
  const s = setup([5, 100]);
  s.act(0, 'stake', 1);
  assert.equal(s.seats()[0].stake, false);
  assert.deepEqual(s.toasts, [{ slot: 1, text: 'Для ставки нужно 10 🪙, а у тебя 5' }]);
  s.act(1, 'stake', 1);
  assert.equal(s.seats()[1].stake, true, 'у богатого ставка встаёт');
  s.balances.set(1, 10);
  s.act(0, 'stake', 1);
  assert.equal(s.seats()[0].stake, true, 'ровно хватает — можно');
  assert.equal(s.toasts.length, 1, 'лишних сообщений нет');
});

test('бесплатная игра и выключение ставки доступны при любом балансе', () => {
  const s = setup([0, 100]);
  s.act(0, 'ready', 1);
  s.act(1, 'ready', 1);
  s.step(DK_COUNT_TICKS);
  assert.equal(s.hall.table(0).phase, 'play', 'с нулём жетонов играть бесплатно можно');
  assert.equal(s.reserves.length, 0);
  assert.equal(s.toasts.length, 0);
});

test('хозяин поднял ставку стола: кому не хватает — бесплатно, остальные при своём', () => {
  const s = setup([30, 100, 15]);
  for (const ch of [0, 1, 2]) s.act(ch, 'stake', 1);
  s.act(0, 'ante', 20);
  assert.equal(s.hall.table(0).ante, 20);
  assert.deepEqual(s.seats().slice(0, 3).map((x) => x.stake), [true, true, false], 'у третьего 15 < 20');
  assert.match(s.toasts.at(-1)!.text, /^Ставка 20 🪙 больше твоего баланса \(15\)/);
  assert.equal(s.toasts.at(-1)!.slot, 3);
  s.act(0, 'ante', 50);
  assert.deepEqual(s.seats().slice(0, 3).map((x) => x.stake), [false, true, false], 'у первого 30 < 50');
  assert.ok(s.seats().slice(0, 3).every((x) => !x.ready), 'любая смена ставки стола сбрасывает «Готов»');
  s.step();
  s.act(0, 'stake', 1);
  assert.equal(s.seats()[0].stake, false, 'и включить её обратно нельзя');
  assert.equal(s.toasts.at(-1)!.text, 'Для ставки нужно 50 🪙, а у тебя 30');
});

test('жетоны ушли между «Готов» и раздачей: игрок бесплатно, остальным ставка и готовность сохраняются', () => {
  const s = setup([100, 100]);
  for (const ch of [0, 1]) s.act(ch, 'stake', 1);
  for (const ch of [0, 1]) s.act(ch, 'ready', 1);
  assert.equal(s.hall.table(0).phase, 'count');
  s.balances.set(2, 3);
  s.step(DK_COUNT_TICKS);
  const tb = s.hall.table(0);
  assert.equal(tb.phase, 'wait');
  assert.equal(tb.game, null);
  assert.equal(s.reserves.length, 0, 'до списания дело не дошло');
  assert.equal(s.balances.get(1), 100);
  assert.deepEqual([tb.seats[1].stake, tb.seats[1].ready], [false, false]);
  assert.deepEqual([tb.seats[0].stake, tb.seats[0].ready], [true, true]);
  assert.match(s.toasts.at(-1)!.text, /^Ставка 10 🪙 больше твоего баланса \(3\)/);
  s.act(1, 'ready', 1);
  s.step(DK_COUNT_TICKS);
  assert.equal(tb.phase, 'play');
  assert.deepEqual(s.reserves, [[{ pid: 1, amount: 10 }]], 'списан только тот, у кого хватает');
  assert.equal(s.balances.get(2), 3);
});

test('на набережной: не хватает жетонов — отказ с причиной, хватает — ставка встаёт', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Бедняк');
  const it = hub.lobby.map.interact.find((i) => i.kind === 'durak' && i.arg === 0)!;
  placeAt(hub, a.c, it.x, it.z, it.y);
  hub.onJson(a.c, { t: 'use', id: it.id });
  a.c.profile!.tokens = 4;
  hub.onJson(a.c, { t: 'durak', table: 0, a: 'stake', on: 1 });
  assert.equal(hub.lobby.durak.table(0).seats[0].stake, false);
  assert.equal(lastOf(a.s, 'toast')!.text, 'Для ставки нужно 10 🪙, а у тебя 4');
  a.c.profile!.tokens = 10;
  hub.onJson(a.c, { t: 'durak', table: 0, a: 'stake', on: 1 });
  assert.equal(hub.lobby.durak.table(0).seats[0].stake, true);
});
