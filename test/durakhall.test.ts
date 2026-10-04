// Стол дурака на набережной: места, боты, отсчёт, раздача, ходы, таймер, отошедшие, итог и жетоны,
// колпак дурака, помидор, режим.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DK_AWAY_TICKS, DK_COUNT_TICKS, DK_RESULT_TICKS, DK_TOMATO_TICKS, DK_TURN_TICKS, autoMove, fromView } from '../shared/durak.ts';
import { FOOL_MS } from '../shared/economy.ts';
import { ACT_DURAK, ACT_NONE } from '../shared/lobby.ts';
import { tableSeat, type Interactable } from '../shared/maps/lobby.ts';
import type { ClientMsg, DurakAct } from '../shared/messages.ts';
import type { Client, Hub } from '../server/hub.ts';
import { allOf, lastOf, login, setupHub, steps, type FakeSink } from './kit.ts';

const SUIT: Record<string, number> = { '♠': 0, '♣': 1, '♦': 2, '♥': 3 };
const RANK: Record<string, number> = { '6': 0, '7': 1, '8': 2, '9': 3, '10': 4, 'В': 5, 'Д': 6, 'К': 7, 'Т': 8 };
const C = (s: string): number => SUIT[s.slice(-1)] * 9 + RANK[s.slice(0, -1)];
const H = (...s: string[]): number[] => s.map(C);

/** Колода, при раздаче которой игроки (по номеру в партии) получат эти руки; козырь — trump. */
function deckFor(hands: number[][], trump: number): number[] {
  const used = new Set([...hands.flat(), trump]);
  const rest = [trump, ...Array.from({ length: 36 }, (_, i) => i).filter((c) => !used.has(c))];
  const seq: number[] = [];
  for (let r = 0; r < 6; r++) for (const h of hands) seq.push(h[r]);
  return [...rest, ...seq.reverse()];
}

// Партия на двоих: первый (у него 6♦ — младший козырь) ходит
const TWO = () => deckFor([H('6♦', '7♠', '8♠', '9♣', '10♣', 'В♥'), H('7♦', '6♠', '6♣', '8♥', '9♥', 'Д♠')], C('Т♦'));

function chair(hub: Hub, table: number, ch: number): Interactable {
  const it = hub.lobby.map.interact.find((i) => i.kind === 'durak' && i.arg === tableSeat(table, ch));
  assert.ok(it, `стул ${table}:${ch}`);
  return it;
}

function sit(hub: Hub, c: Client, table: number, ch: number): void {
  const it = chair(hub, table, ch);
  const st = hub.lobby.playerOf(c)!.state;
  st.x = it.x;
  st.y = 0;
  st.z = it.z;
  hub.onJson(c, { t: 'use', id: it.id });
}

function act(hub: Hub, c: Client, a: DurakAct, card?: number, on?: number, table = 0): void {
  hub.onJson(c, { t: 'durak', table, a, card, on } as ClientMsg);
}

function view(s: FakeSink, table = 0) {
  const list = allOf(s, 'durak').filter((m) => m.table === table);
  return list[list.length - 1]?.v;
}

function hand(s: FakeSink, table = 0): number[] | undefined {
  const list = allOf(s, 'durakHand').filter((m) => m.table === table);
  return list[list.length - 1]?.cards;
}

function until(hub: Hub, cond: () => boolean, max: number, what: string): void {
  for (let i = 0; i < max && !cond(); i++) hub.step();
  assert.ok(cond(), what);
}

function tomatoes(s: FakeSink): number[][] {
  const out: number[][] = [];
  for (const m of allOf(s, 'lev')) for (const e of m.e) if (e[0] === 'tomato') out.push(e.slice(1) as number[]);
  return out;
}

/** Человек за стулом 5 и бот (он сядет на первый свободный — стул 0), «Готов», отсчёт, раздача. */
function startWithBot(deck = TWO) {
  const { hub, clock } = setupHub({ durakDeck: deck });
  const a = login(hub, 'Игрок');
  sit(hub, a.c, 0, 5);
  act(hub, a.c, 'bot');
  act(hub, a.c, 'ready', undefined, 1);
  until(hub, () => hub.lobby.durak.table(0).phase === 'play', DK_COUNT_TICKS + 5, 'раздали');
  return { hub, clock, a };
}

test('сел за стол кафе: сидит за столом, все видят ник на месте; приветствие набережной знает столы', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Шулер');
  const b = login(hub, 'Зевака');
  assert.equal(lastOf(a.s, 'lobby')!.tables.length, 3);
  sit(hub, a.c, 0, 5);
  assert.equal(hub.lobby.playerOf(a.c)!.action, ACT_DURAK);
  steps(hub, 1);
  const v = view(b.s)!;
  assert.equal(v.seats[5].k, 1);
  assert.equal(v.seats[5].nick, 'Шулер');
  assert.equal(v.seats[5].id, hub.lobby.playerOf(a.c)!.slot);
  assert.equal(v.phase, 'wait');
  // бот садится на первый свободный стул — туда человеку нельзя
  act(hub, a.c, 'bot');
  steps(hub, 1);
  assert.equal(view(b.s)!.seats[0].k, 2);
  assert.ok(!hub.lobby.durak.canSit(tableSeat(0, 0), b.c.pid));
  sit(hub, b.c, 0, 0);
  assert.equal(hub.lobby.playerOf(b.c)!.action, ACT_NONE);
  assert.match(lastOf(b.s, 'toast')!.text, /занято/);
});

test('бот и раздача: «Готов» — отсчёт 5 с — партия; руку видит только хозяин', () => {
  const { hub } = setupHub({ durakDeck: TWO });
  const a = login(hub, 'Игрок');
  const b = login(hub, 'Сосед');
  sit(hub, a.c, 0, 5);
  act(hub, a.c, 'bot');
  steps(hub, 1);
  assert.equal(hub.lobby.durak.table(0).phase, 'wait', 'пока не нажал «Готов»');
  act(hub, a.c, 'ready', undefined, 1);
  steps(hub, 1);
  assert.equal(hub.lobby.durak.table(0).phase, 'count');
  assert.ok(view(b.s)!.left > 4000);
  steps(hub, DK_COUNT_TICKS);
  assert.equal(hub.lobby.durak.table(0).phase, 'play');
  const sorted = (l: number[]) => [...l].sort((x, y) => x - y);
  assert.deepEqual(sorted(hand(a.s)!), sorted(H('6♦', '7♠', '8♠', '9♣', '10♣', 'В♥')));
  assert.equal(hand(b.s), undefined, 'соседу рук не шлют');
  const v = view(b.s)!;
  assert.deepEqual(v.game!.counts, [6, 6]);
  assert.equal(v.seats[5].p, 0, 'по часовой стрелке: стул 5 — первый');
  assert.equal(v.seats[0].p, 1);
  assert.equal(v.game!.attacker, 0, 'у человека младший козырь');
  assert.ok(!JSON.stringify(v).includes('"hands"'));
});

test('новый человек сел во время отсчёта — отсчёт сбрасывается, бот уходит, ждём его «Готов»', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Первый');
  const b = login(hub, 'Опоздал');
  sit(hub, a.c, 0, 5);
  act(hub, a.c, 'bot');
  act(hub, a.c, 'ready', undefined, 1);
  steps(hub, 100);
  assert.equal(hub.lobby.durak.table(0).phase, 'count');
  sit(hub, b.c, 0, 3);
  assert.equal(hub.lobby.durak.table(0).phase, 'wait');
  assert.equal(hub.lobby.durak.table(0).seats.filter((s) => s.k === 2).length, 0, 'бот — только для игры одному');
  assert.match(lastOf(a.s, 'toast')!.text, /боты ушли/);
  act(hub, b.c, 'bot');
  assert.equal(hub.lobby.durak.table(0).seats.filter((s) => s.k === 2).length, 0, 'вдвоём бота не добавить');
  act(hub, b.c, 'ready', undefined, 1);
  assert.equal(hub.lobby.durak.table(0).phase, 'count');
  steps(hub, DK_COUNT_TICKS + 1);
  const t = hub.lobby.durak.table(0);
  assert.equal(t.phase, 'play');
  assert.equal(t.game!.n, 2);
});

test('ходы: неправильный не меняет стол, правильный меняет; 30 с без хода — ход делает сервер', () => {
  let { hub, a } = startWithBot();
  const t = hub.lobby.durak.table(0);
  act(hub, a.c, 'attack', C('Т♥'));
  act(hub, a.c, 'beat', C('7♠'), 0);
  act(hub, a.c, 'take');
  act(hub, a.c, 'attack', 99);
  act(hub, a.c, 'attack', '7♠' as unknown as number);
  assert.equal(t.game!.table.length, 0);
  act(hub, a.c, 'attack', C('8♠'));
  assert.deepEqual(t.game!.table, [{ a: C('8♠'), d: -1 }]);
  assert.ok(t.game!.passed.every((x) => !x));
  steps(hub, 1);
  assert.deepEqual(view(a.s)!.game!.table, [{ a: C('8♠'), d: -1 }]);
  assert.equal(hand(a.s)!.length, 5);

  // таймер: человек молчит — за него ходят младшей некозырной
  ({ hub, a } = startWithBot());
  const u = hub.lobby.durak.table(0);
  steps(hub, DK_TURN_TICKS - 5);
  assert.equal(u.game!.table.length, 0);
  steps(hub, 10);
  assert.deepEqual(u.game!.table[0], { a: C('7♠'), d: -1 });
});

test('встал посреди партии: автопилот ходит, вернулся — снова его рука; ушёл на минуту — на месте бот', () => {
  const { hub } = setupHub({ durakDeck: TWO });
  const a = login(hub, 'Ушёл');
  const b = login(hub, 'Сидит');
  const c = login(hub, 'Чужой');
  sit(hub, a.c, 0, 5);
  sit(hub, b.c, 0, 4);
  act(hub, a.c, 'ready', undefined, 1);
  act(hub, b.c, 'ready', undefined, 1);
  until(hub, () => hub.lobby.durak.table(0).phase === 'play', DK_COUNT_TICKS + 5, 'раздали');
  const t = hub.lobby.durak.table(0);
  assert.equal(t.game!.attacker, 0, 'ходит ушедший (стул 5)');
  hub.onJson(a.c, { t: 'unuse' });
  assert.equal(hub.lobby.playerOf(a.c)!.action, ACT_NONE);
  steps(hub, 1);
  assert.equal(view(c.s)!.seats[5].id, 0, 'место держится за ним');
  assert.ok(view(c.s)!.seats[5].away > 50_000);
  assert.ok(!hub.lobby.durak.canSit(tableSeat(0, 5), c.c.pid), 'чужому нельзя');
  until(hub, () => t.game!.table.length > 0, 120, 'автопилот сходил');
  const sentBefore = allOf(a.s, 'durakHand').length;
  sit(hub, a.c, 0, 5);
  assert.equal(hub.lobby.playerOf(a.c)!.action, ACT_DURAK, 'своё место — можно');
  assert.equal(allOf(a.s, 'durakHand').length, sentBefore + 1, 'рука пришла снова');
  assert.deepEqual(hand(a.s), t.game!.hands[0]);
  // второй ушёл на минуту — его место занимает бот, денег ему не будет
  hub.onJson(b.c, { t: 'unuse' });
  steps(hub, DK_AWAY_TICKS + 2);
  assert.equal(t.phase, 'play');
  assert.equal(t.seats[4].k, 2, 'бот вместо ушедшего');
  assert.ok(!hub.lobby.durak.canSit(tableSeat(0, 4), b.c.pid));
  sit(hub, c.c, 0, 4);
  assert.match(lastOf(c.s, 'toast')!.text, /занято/);
});

test('бесплатная партия и повтор сидя: статистика ровно раз, жетоны не начисляются', () => {
  const { hub, a } = startWithBot();
  const t = hub.lobby.durak.table(0);
  const tokens0 = a.c.profile!.tokens;
  for (let i = 0; i < 200_000 && t.phase === 'play'; i++) {
    const v = view(a.s);
    const h = hand(a.s);
    if (v?.game && h && !v.game.over) {
      const me = v.seats[5].p;
      const m = autoMove(fromView(v.game, me, h), me);
      if (m) act(hub, a.c, m.a, 'card' in m ? m.card : undefined, 'on' in m ? m.on : undefined);
    }
    hub.step();
  }
  assert.equal(t.phase, 'result');
  const r = t.result!;
  const me = t.seats[5].p;
  assert.equal(a.c.profile!.tokens, tokens0);
  assert.equal(lastOf(a.s, 'tokens')!.n, tokens0);
  assert.equal(a.c.profile!.stats.dkGames, 1);
  assert.equal(a.c.profile!.stats.dkFools, r.fool === me ? 1 : 0);
  assert.ok(allOf(a.s, 'chat').some((l) => l.sys && l.text.startsWith('🃏 Стол 1')));
  steps(hub, 1);
  assert.equal(view(a.s)!.phase, 'result');
  assert.ok(view(a.s)!.result);
  steps(hub, DK_RESULT_TICKS + 1);
  assert.equal(t.phase, 'wait');
  assert.equal(t.game, null);
  assert.equal(t.seats[5].ready, false, 'готовность сброшена');
  assert.equal(t.seats[0].k, 2, 'бот остался');
  const player = hub.lobby.playerOf(a.c)!;
  assert.equal(player.action, ACT_DURAK, 'итог не поднимает со стула');
  assert.equal(player.arg, tableSeat(0, 5), 'номер стула сохранён');
  const tokens1 = a.c.profile!.tokens;
  act(hub, a.c, 'ready', undefined, 1);
  steps(hub, DK_COUNT_TICKS + 1);
  assert.equal(t.phase, 'play');
  assert.equal(a.c.profile!.tokens, tokens1, 'повтор бесплатный, без списания жетонов');
  assert.equal(a.c.profile!.stats.dkGames, 1, 'раздача не повторяет награду');
  for (let i = 0; i < 200_000 && t.phase === 'play'; i++) {
    const v = view(a.s);
    const h = hand(a.s);
    if (v?.game && h && !v.game.over) {
      const me = v.seats[5].p;
      const m = autoMove(fromView(v.game, me, h), me);
      if (m) act(hub, a.c, m.a, 'card' in m ? m.card : undefined, 'on' in m ? m.on : undefined);
    }
    hub.step();
  }
  assert.equal(t.phase, 'result');
  assert.equal(a.c.profile!.tokens, tokens1);
  assert.equal(a.c.profile!.stats.dkGames, 2);
  steps(hub, DK_RESULT_TICKS + DK_COUNT_TICKS + 1);
  assert.equal(t.phase, 'wait');
  assert.equal(a.c.profile!.tokens, tokens1);
  assert.equal(a.c.profile!.stats.dkGames, 2, 'без согласия третья партия не начинается');
});

test('дурак-человек: колпак (и погоны) у всех на 10 минут, потом свой наряд', () => {
  const { hub, clock } = setupHub();
  const a = login(hub, 'Простак');
  const b = login(hub, 'Смотрит');
  const slot = hub.lobby.playerOf(a.c)!.slot;
  hub.onDurakGame({
    table: 1, ep: true, draw: false,
    players: [
      { pid: a.c.pid, slot, nick: 'Простак', bot: false, fool: true, first: false, present: true },
      { pid: 0, slot: 0, nick: 'Зефир', bot: true, fool: false, first: true, present: true },
    ],
  });
  const o = lastOf(b.s, 'outfitOf')!;
  assert.equal(o.id, slot);
  assert.equal(o.o.h, 'fool');
  assert.equal(o.o.a, 'epaulets');
  assert.equal(hub.outfitOf(a.c.profile!).h, 'fool');
  assert.equal(a.c.profile!.outfit.h, 'cap', 'свой наряд не тронут');
  assert.equal(a.c.profile!.tokens, 100);
  assert.match(lastOf(a.s, 'toast')!.text, /колпак и погоны/);
  assert.ok(allOf(b.s, 'chat').some((l) => l.text === '🃏 Стол 2: Простак остаётся в дураках — и с погонами!'));
  // перезашёл на набережную — в списке игроков колпак на месте
  hub.lobby.leave(a.c);
  hub.lobby.join(a.c, null);
  assert.equal(lastOf(b.s, 'lroster')!.players.find((p) => p.pid === a.c.pid)!.o.h, 'fool');
  clock.now += FOOL_MS + 1;
  steps(hub, 61);
  const back = lastOf(b.s, 'outfitOf')!;
  assert.equal(back.o.h, 'cap');
  assert.equal(back.o.a, 'none');
});

test('помидор: летит в занятое место, раз в 15 с; реакции — раз в 1,2 с', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Метатель');
  const b = login(hub, 'Мишень');
  const c = login(hub, 'Прохожий');
  sit(hub, a.c, 0, 5);
  sit(hub, b.c, 0, 4);
  act(hub, a.c, 'tomato', undefined, 4);
  act(hub, a.c, 'tomato', undefined, 4);
  act(hub, a.c, 'tomato', undefined, 0);
  act(hub, b.c, 'tomato', undefined, 4);
  steps(hub, 2);
  assert.deepEqual(tomatoes(c.s), [[0, 5, 4]], 'один помидор: повтор, пустое место и в себя — нельзя');
  steps(hub, DK_TOMATO_TICKS);
  act(hub, a.c, 'tomato', undefined, 4);
  steps(hub, 2);
  assert.equal(tomatoes(c.s).length, 2);
  act(hub, b.c, 'react', undefined, 1);
  act(hub, b.c, 'react', undefined, 2);
  act(hub, b.c, 'react', undefined, 9);
  steps(hub, 2);
  const reacts = allOf(c.s, 'lev').flatMap((m) => m.e).filter((e) => e[0] === 'react');
  assert.deepEqual(reacts, [['react', 0, 4, 1]]);
});

test('режим выбирает тот, кто сел первым; смена режима сбрасывает чужую готовность', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Хозяин');
  const b = login(hub, 'Гость');
  sit(hub, a.c, 0, 2);
  sit(hub, b.c, 0, 1);
  const t = hub.lobby.durak.table(0);
  act(hub, b.c, 'mode', undefined, 1);
  assert.equal(t.mode, 'throw');
  act(hub, a.c, 'ready', undefined, 1);
  act(hub, b.c, 'ready', undefined, 1);
  assert.equal(t.phase, 'count');
  act(hub, a.c, 'mode', undefined, 1);
  assert.equal(t.mode, 'transfer');
  assert.equal(t.seats[1].ready, false);
  assert.equal(t.seats[2].ready, true);
  assert.equal(t.phase, 'wait');
  steps(hub, 1);
  assert.equal(view(b.s)!.modeBy, 2);
  // первый встал — выбирает следующий по времени
  hub.onJson(a.c, { t: 'unuse' });
  steps(hub, 1);
  assert.equal(view(b.s)!.modeBy, 1);
});

test('последний человек встал — боты уходят со стола', () => {
  const { hub } = setupHub();
  const a = login(hub, 'Один');
  sit(hub, a.c, 1, 0);
  act(hub, a.c, 'bot', undefined, undefined, 1);
  act(hub, a.c, 'bot', undefined, undefined, 1);
  assert.equal(hub.lobby.durak.table(1).seats.filter((s) => s.k === 2).length, 2);
  act(hub, a.c, 'unbot', undefined, undefined, 1);
  assert.equal(hub.lobby.durak.table(1).seats.filter((s) => s.k === 2).length, 1);
  hub.onJson(a.c, { t: 'unuse' });
  assert.equal(hub.lobby.durak.table(1).seats.filter((s) => s.k !== 0).length, 0);
  // за чужой стол не командуют
  sit(hub, a.c, 1, 0);
  act(hub, a.c, 'bot', undefined, undefined, 2);
  assert.equal(hub.lobby.durak.table(2).seats.filter((s) => s.k !== 0).length, 0);
});
