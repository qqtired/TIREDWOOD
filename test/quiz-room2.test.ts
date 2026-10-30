import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QuizClientMsg } from '../shared/quiz/net.ts';
import { QUIZ_VENUE as V } from '../shared/quiz/venue.ts';
import { QZ } from '../shared/quiz/types.ts';
import { arcDay } from '../shared/arcade/rewards.ts';

process.env.PLAZA3 = '1';
const { Hub } = await import('../server/hub.ts');
const { setupHub, login, placeAt, steps, allOf } = await import('./kit.ts');

function setup(n = 3) {
  const { store, profiles, clock } = setupHub();
  const hub = new Hub({ store, profiles, now: () => clock.now, quiz: true, smokeToken: '', build: 'test', log: () => {} });
  const players = Array.from({ length: n }, (_, i) => login(hub, `Tester${i + 7}`));
  const g = {
    hub, players, clock,
    msg(i: number, msg: QuizClientMsg) { hub.onJson(players[i].c, msg); },
    advance(ms: number) { clock.now += ms; steps(hub, 6); },
    choose(mode: number) {
      players.forEach((p, i) => {
        const it = hub.lobby.map.interact.find(it => it.kind === 'quiz' && it.arg === V.first.chair + i)!;
        placeAt(hub, p.c, it.x, it.z, it.y); hub.onJson(p.c, { t: 'use', id: it.id });
      });
      this.msg(0, { t: 'qz', a: 'play' });
      players.forEach((_, i) => this.msg(i, { t: 'qz', a: 'vote', m: mode }));
      this.advance(QZ.VOTE_ALL_MS); this.advance(QZ.WIN_MS);
    },
  };
  return g;
}

test('комната: выплаты идут в Profiles.credit(mode), дневной потолок и qz-рекорды сохраняются', () => {
  const g = setup(), a = g.players[0].c.profile!, b = g.players[1].c.profile!;
  a.stats.qzDay = arcDay(g.clock.now); a.stats.qzDayCoins = 395;
  const coinsA = a.tokens, coinsB = b.tokens, xpB = b.xp;
  g.choose(0); g.msg(0, { t: 'qz', a: 'role', take: true });
  g.msg(0, { t: 'qz', a: 'ask', word: 'пароход', cat: 'Предмет' });
  g.advance(60_000); assert.equal(a.tokens, coinsA + 5); assert.equal(a.stats.qzDayCoins, 400);
  g.msg(2, { t: 'qz', a: 'say', text: 'лодка' }); g.msg(1, { t: 'qz', a: 'say', text: 'пароход' });
  g.advance(QZ.CHECK_MS);
  assert.equal(a.tokens, coinsA + 5); assert.equal(b.tokens, coinsB + 15); assert.ok(b.xp > xpB);
  assert.equal(a.stats.qzRdMade, 1); assert.equal(b.stats.qzRdSolved, 1);
});

test('комната: твёрдое поднятых пультов включается и гаснет; кривое E не снимает роль', () => {
  const g = setup(4), world = g.hub.lobby.world, boxes = g.hub.lobby.map.quizPultBoxes!;
  assert.ok(boxes.every(i => world.minX[i] === world.maxX[i]));
  g.choose(1); assert.equal(g.hub.lobby.quiz!.board().jp?.step, 'packvote');
  assert.deepEqual(g.hub.lobby.quiz!.raisedPults(), [0, 1, 2, 3]);
  assert.ok(boxes.slice(0, 4).every(i => world.maxX[i] > world.minX[i]));
  assert.ok(boxes.slice(4).every(i => world.minX[i] === world.maxX[i]));
  g.hub.onJson(g.players[1].c, { t: 'use', id: 0 });
  assert.equal(g.hub.lobby.quiz!.board().jp!.players[1].away, 0);
  for (const i of [0, 1, 2]) g.msg(i, { t: 'qz', a: 'swap', on: true }); g.advance(100);
  assert.ok(boxes.every(i => world.minX[i] === world.maxX[i]));
});

test('комната: 20 пачек crInk в секунду проходят отдельно от общего лимита qz', () => {
  const g = setup(); g.choose(2); g.msg(0, { t: 'qz', a: 'role', take: true, r: 'drawer' }); g.advance(QZ.CALL_MS);
  g.msg(0, { t: 'qz', a: 'crWord', i: 0 });
  const before = allOf(g.players[1].s, 'qzInk').length;
  for (let i = 0; i < 20; i++) {
    g.advance(50); g.msg(0, { t: 'qz', a: 'crInk', ops: [['s', 1, 0, 0, i, i]] });
  }
  const ink = allOf(g.players[1].s, 'qzInk').slice(before).filter(m => !m.full);
  assert.equal(ink.length, 20); assert.equal(ink.flatMap(m => m.ops).length, 20);
});
