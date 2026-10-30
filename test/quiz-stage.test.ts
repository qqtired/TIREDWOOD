import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QuizStage, type QuizPerson, type QuizHost } from '../server/lobby/quiz/stage.ts';
import { ACT_NONE, ACT_QUIZ, RIDE_LOCK, holdMask, isHeld, isRiding, stepHeld } from '../shared/lobby.ts';
import { QZ } from '../shared/quiz/types.ts';
import { QUIZ_VENUE as V, placeAt } from '../shared/quiz/venue.ts';
import type { QuizClientMsg, QuizServerMsg } from '../shared/quiz/net.ts';
import { BTN_FORWARD, BTN_JUMP, BTN_DASH, makeState, makeInput, makeEvents } from '../shared/sim.ts';
import { CollisionWorld } from '../shared/world.ts';
import { buildLobby } from '../shared/maps/lobby.ts';

function setup(n = 3) {
  let now = 100_000;
  const people: QuizPerson[] = Array.from({ length: n }, (_, i) => ({ slot: i + 1, pid: i + 101, nick: ['Барон', 'Оля', 'Петя', 'Вася'][i] ?? `Гость${i}`,
    ...V.chairs[i], action: ACT_NONE, arg: 0, ephemeral: false, riding: false }));
  const sent: Array<{ slot: number; at: number; msg: QuizServerMsg }> = [];
  const announced: Array<{ text: string; at: number }> = [];
  const toasts: string[] = [];
  const host: QuizHost = {
    now: () => now, rand: () => 0, people: () => people,
    hold: (slot, place) => { const p = people.find(p => p.slot === slot)!; Object.assign(p, placeAt(place), { action: ACT_QUIZ, arg: place }); },
    release: (slot, to) => { const p = people.find(p => p.slot === slot); if (p) Object.assign(p, to ?? {}, { action: ACT_NONE, arg: 0 }); },
    send: (slot, msg) => sent.push({ slot, at: now, msg: structuredClone(msg) }),
    sendLobby: (msg, except = []) => { for (const p of people) if (!except.includes(p.slot)) host.send(p.slot, msg); },
    announce: text => announced.push({ text, at: now }), toast: (_slot, text) => toasts.push(text), log: () => {},
  };
  const q = new QuizStage(host);
  const api = {
    q, people, sent, announced, toasts,
    get now() { return now; },
    advance(ms: number) { now += ms; q.step(); },
    msg(slot: number, m: Omit<QuizClientMsg, 't'>) { q.message(slot, { t: 'qz', ...m }); },
    sit(slot: number, chair = slot - 1) { Object.assign(people.find(p => p.slot === slot)!, V.chairs[chair]); q.use(slot, chair); },
    vote() {
      this.sit(1); this.sit(2); this.msg(1, { a: 'play' });
      for (const p of people) this.msg(p.slot, { a: 'vote', m: 0 } as Omit<QuizClientMsg, 't'>);
      this.advance(QZ.VOTE_ALL_MS); this.advance(QZ.WIN_MS);
      assert.equal(q.board().phase, 'roles');
    },
    ask(slot = 1) {
      this.msg(slot, { a: 'role', take: true } as Omit<QuizClientMsg, 't'>);
      q.message(slot, { t: 'qz', a: 'ask', word: 'пароход', cat: 'Предмет' });
      assert.equal(q.board().riddle?.step, 'round');
    },
  };
  q.step(); return api;
}

test('ACT_QUIZ: WASD, прыжок и Shift держат место, поездкой не считается', () => {
  assert.equal(ACT_QUIZ, 23); assert.equal(isHeld(ACT_QUIZ), true); assert.equal(isRiding(ACT_QUIZ), false);
  assert.equal(holdMask(ACT_QUIZ), RIDE_LOCK);
  const s = makeState(); const input = makeInput(); const world = new CollisionWorld(buildLobby());
  for (const buttons of [BTN_FORWARD, BTN_JUMP, BTN_DASH]) {
    input.buttons = buttons; assert.equal(stepHeld(s, holdMask(ACT_QUIZ), input, world, false, 0, makeEvents()), RIDE_LOCK);
  }
});

test('двое сели: через 2 с vote; nobody блокирует повтор до новой посадки', () => {
  const g = setup(); g.sit(1); g.sit(2);
  g.advance(QZ.AUTO_VOTE_DELAY_MS - 1); assert.equal(g.q.board().phase, 'idle');
  g.advance(1); assert.equal(g.q.board().phase, 'vote');
  g.advance(QZ.VOTE_MS); assert.equal(g.q.board().vote?.nobody, true);
  g.advance(QZ.NOBODY_MS); g.advance(60_000); assert.equal(g.q.board().phase, 'idle');
  g.sit(3); g.advance(QZ.AUTO_VOTE_DELAY_MS); assert.equal(g.q.board().phase, 'vote');
});

test('Сыграем требует двоих; первый F берёт роль; Затейник и пропуск', () => {
  const solo = setup(1); solo.sit(1); solo.msg(1, { a: 'play' });
  assert.equal(solo.sent.at(-1)?.msg.t, 'qzErr');
  const g = setup(); g.vote(); g.advance(QZ.CALL_MS);
  assert.equal(g.q.view().call?.by, 'zat'); assert.equal(g.q.view().call?.to?.slot, 1);
  g.q.message(1, { t: 'qz', a: 'role', take: false });
  assert.equal(g.q.view().call?.to?.slot, 2);
  g.ask(2); g.q.message(1, { t: 'qz', a: 'role', take: true });
  assert.equal(g.q.board().riddle?.riddler?.slot, 2);
});

test('сцена держит кресло и возвращает загадывающего; стоявший — на back', () => {
  const g = setup(); g.vote(); g.ask();
  assert.equal(g.people[0].arg, V.first.riddler);
  assert.equal(g.q.stood(1), false, 'со сцены unuse не снимает');
  g.sit(3, 0); assert.equal(g.people[2].action, ACT_NONE); assert.equal(g.toasts.at(-1), 'Место занято');
  g.q.message(1, { t: 'qz', a: 'giveup' });
  assert.equal(g.people[0].arg, 0); assert.equal(g.q.stood(1), true);
  g.advance(QZ.REVEAL_MS); g.ask(3);
  g.q.message(3, { t: 'qz', a: 'giveup' });
  assert.equal(g.people[2].action, ACT_NONE); assert.equal(g.people[2].x, V.back.x);
});

test('уход за ограду — left; большинство swap показывает слово 3 с и открывает vote', () => {
  const g = setup(); g.vote(); g.ask();
  g.people[0].x = 60; g.q.step(); assert.equal(g.q.board().riddle?.last?.end, 'left');
  g.advance(QZ.REVEAL_MS); g.ask(2);
  g.q.message(2, { t: 'qz', a: 'swap', on: true });
  assert.equal(g.q.board().riddle?.last?.end, 'swap');
  g.advance(QZ.SWAP_REVEAL_MS); assert.equal(g.q.board().phase, 'vote');
});

test('5 загадок → results → vote через 10 с; личный итог и счёт вечера', () => {
  const g = setup(); g.vote();
  for (let i = 0; i < QZ.RIDDLES; i++) {
    const riddler = i % 2 + 1, solver = riddler === 1 ? 2 : 1;
    g.ask(riddler); g.q.message(solver, { t: 'qz', a: 'say', text: 'пароход' });
    g.advance(QZ.CHECK_MS); g.advance(QZ.REVEAL_MS);
  }
  assert.equal(g.q.board().phase, 'results');
  assert.equal(g.q.me(1)?.result?.pts, 19); assert.equal(g.q.me(2)?.result?.pts, 21);
  assert.equal(g.q.me(3)?.result, undefined);
  assert.equal(g.q.board().evening[0].pts, 21);
  g.advance(QZ.RESULTS_MS); assert.equal(g.q.board().phase, 'vote');
});

test('внутри — строки и своё слово, снаружи — только табло; снимки ≤4/с и при изменении', () => {
  const g = setup(4); g.people[3].x = 60; g.q.step(); g.vote(); g.ask();
  g.q.message(2, { t: 'qz', a: 'say', text: 'закрытая догадка' });
  g.advance(QZ.SNAP_MIN_MS);
  const inside = g.sent.filter(e => e.slot === 2 && e.msg.t === 'qz').at(-1)!.msg;
  assert.equal(inside.t, 'qz'); if (inside.t !== 'qz') return;
  assert.ok(inside.v.riddle?.lines.some(l => l.text === 'закрытая догадка'));
  assert.equal(inside.me.word, undefined); assert.equal(g.q.me(1)?.word, 'пароход');
  const outside = g.sent.filter(e => e.slot === 4).at(-1)!.msg;
  assert.equal(outside.t, 'qzBoard'); assert.ok(!JSON.stringify(outside).includes('закрытая догадка'));
  const count = g.sent.length; g.advance(1000); assert.equal(g.sent.length, count, 'часы не вызывают снимки');
  const at = g.now;
  for (let i = 0; i < 10; i++) { g.q.message(1, { t: 'qz', a: 'swap', on: i % 2 === 0 }); g.advance(100); }
  const messages = g.sent.filter(e => e.slot === 2 && e.at > at && e.msg.t === 'qz');
  assert.ok(messages.length <= 4);
  for (let i = 1; i < messages.length; i++) assert.ok(messages[i].at - messages[i - 1].at >= QZ.SNAP_MIN_MS);
});

test('общие объявления не чаще 2 мин; вечер сбрасывается через 30 мин пустоты', () => {
  const g = setup(); g.vote(); g.ask();
  g.q.message(2, { t: 'qz', a: 'say', text: 'пароход' }); g.advance(QZ.CHECK_MS);
  assert.equal(g.announced.length, 1); assert.ok(g.q.board().evening.length > 0);
  g.people.forEach(p => { p.x = 60; }); g.q.step(); g.advance(QZ.ALONE_MS);
  g.advance(QZ.EVENING_IDLE_MS - QZ.ALONE_MS - 1); assert.ok(g.q.board().evening.length > 0);
  g.advance(1); assert.equal(g.q.board().evening.length, 0);
});

test('мусор, посторонние поля, чужая роль и ephemeral не принимаются', () => {
  const g = setup(); g.vote();
  g.q.message(1, { t: 'qz', a: 'role', take: true, word: 'инъекция' });
  assert.equal(g.q.board().phase, 'roles');
  g.people[0].ephemeral = true; g.q.message(1, { t: 'qz', a: 'role', take: true });
  assert.equal(g.q.board().phase, 'roles');
  g.q.message(2, { t: 'qz', a: 'role', take: 'yes' });
  assert.equal(g.q.board().phase, 'roles');
  g.q.message(2, { t: 'qz', a: 'role', take: true, r: 'drawer' });
  assert.equal(g.q.board().phase, 'roles');
  g.q.message(2, { t: 'qz', a: 'role', take: true, r: 'riddler' });
  assert.equal(g.q.board().riddle?.step, 'ask');
});
