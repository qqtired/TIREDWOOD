/** Настоящие подключения Hub/LobbyRoom, без сети, браузера и локального сервера. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Client } from '../server/hub.ts';
import type { QuizClientMsg } from '../shared/quiz/net.ts';

process.env.PLAZA3 = '1';
const { Hub } = await import('../server/hub.ts');
const { setupHub, login, lastOf, allOf, hold, placeAt, steps } = await import('./kit.ts');
const { QUIZ_VENUE: V } = await import('../shared/quiz/venue.ts');
const { QZ } = await import('../shared/quiz/types.ts');
const { ACT_NONE, ACT_QUIZ, ACT_WAVE } = await import('../shared/lobby.ts');
const { BTN_FORWARD, BTN_DASH, BTN_JUMP } = await import('../shared/sim.ts');

function setup(quiz = true) {
  const { store, profiles, clock } = setupHub();
  const hub = new Hub({ store, profiles, now: () => clock.now, quiz, smokeToken: '', build: 'test', log: () => {} });
  const a = login(hub, 'Tester7'), b = login(hub, 'Tester8'), out = login(hub, 'Tester9');
  function sit(c: Client, chair: number) {
    const it = hub.lobby.map.interact.find(i => i.kind === 'quiz' && i.arg === chair)!;
    placeAt(hub, c, it.x, it.z, it.y); hub.onJson(c, { t: 'use', id: it.id });
  }
  function msg(c: Client, message: QuizClientMsg) { hub.onJson(c, message); }
  function advance(ms: number) { clock.now += ms; steps(hub, 6); }
  function round() {
    sit(a.c, 0); sit(b.c, 1); msg(a.c, { t: 'qz', a: 'play' });
    msg(a.c, { t: 'qz', a: 'vote', m: 0 }); msg(b.c, { t: 'qz', a: 'vote', m: 0 });
    advance(QZ.VOTE_ALL_MS); advance(QZ.WIN_MS);
    msg(a.c, { t: 'qz', a: 'role', take: true }); msg(a.c, { t: 'qz', a: 'ask', word: 'пароход', cat: 'Предмет' });
    assert.equal(hub.lobby.quiz!.board().riddle?.step, 'round');
  }
  return { hub, a, b, out, sit, msg, advance, round, clock };
}

test('комната: QUIZ включает приветствие и твёрдое; без флага точки игнорируются', () => {
  const off = setup(false), on = setup(true);
  assert.equal(lastOf(off.a.s, 'lobby')?.quiz, undefined); assert.ok(lastOf(on.a.s, 'lobby')?.quiz);
  const b = V.solid.find(b => b.name === 'stage_a')!, x = (b.min[0] + b.max[0]) / 2, z = (b.min[2] + b.max[2]) / 2;
  assert.ok(off.hub.lobby.world.groundBelow(x, 1, z) < V.stage.top);
  assert.equal(on.hub.lobby.world.groundBelow(x, 1, z), V.stage.top);
  off.sit(off.a.c, 0); assert.equal(off.hub.lobby.playerOf(off.a.c)!.action, ACT_NONE);
  assert.ok(on.hub.lobby.map.interact.slice(-V.chairs.length).every(it => it.kind === 'quiz'));
  assert.ok(on.hub.lobby.map.interact.slice(0, -V.chairs.length).every(it => it.kind !== 'quiz'));
});

test('комната: кресло держит ввод; unuse встаёт, на сцене игнорируется; чат локален', () => {
  const g = setup(); g.sit(g.a.c, 0);
  hold(g.hub, [g.a.c], BTN_FORWARD | BTN_DASH | BTN_JUMP, 2);
  assert.equal(g.hub.lobby.playerOf(g.a.c)!.action, ACT_QUIZ);
  g.hub.onJson(g.a.c, { t: 'unuse' }); assert.equal(g.hub.lobby.playerOf(g.a.c)!.action, ACT_NONE);
  g.round();
  g.hub.onJson(g.a.c, { t: 'unuse' }); assert.equal(g.hub.lobby.playerOf(g.a.c)!.arg, V.first.riddler);
  const common = allOf(g.out.s, 'chat').length;
  g.msg(g.b.c, { t: 'qz', a: 'say', text: 'секретная догадка' }); g.advance(QZ.SNAP_MIN_MS);
  assert.ok(lastOf(g.a.s, 'qz')?.v.riddle?.lines.some(l => l.text === 'секретная догадка'));
  assert.equal(allOf(g.out.s, 'chat').length, common);
  assert.equal(allOf(g.out.s, 'qz').length, 0);
  assert.ok(!JSON.stringify(lastOf(g.out.s, 'qzBoard')).includes('секретная догадка'));
  g.hub.disconnect(g.a.c); g.advance(100);
  assert.equal(g.hub.lobby.quiz!.board().riddle?.last?.end, 'left');
});

test('комната: общий лимит qz — 10 за секунду, стоящие не играют эмоции во время vote', () => {
  const g = setup(); g.sit(g.a.c, 0); placeAt(g.hub, g.b.c, V.chairs[1].x, V.chairs[1].z);
  for (let i = 0; i < 10; i++) g.hub.onJson(g.a.c, { t: 'qz', a: 'garbage' });
  g.msg(g.a.c, { t: 'qz', a: 'play' }); assert.equal(g.hub.lobby.quiz!.board().phase, 'idle');
  g.advance(1000); g.msg(g.a.c, { t: 'qz', a: 'play' }); assert.equal(g.hub.lobby.quiz!.board().phase, 'vote');
  g.hub.onJson(g.b.c, { t: 'emote', e: ACT_WAVE });
  assert.equal(g.hub.lobby.playerOf(g.b.c)!.action, ACT_NONE);
});

test('комната: обрыв связи заканчивает загадку, таймеры идут без игроков', () => {
  const g = setup(); g.round();
  g.a.c.lostAt = g.clock.now; g.advance(100);
  assert.equal(g.hub.lobby.quiz!.board().riddle?.last?.end, 'left');
  g.hub.disconnect(g.a.c); g.hub.disconnect(g.b.c); g.hub.disconnect(g.out.c);
  assert.equal(g.hub.active, true);
  g.advance(QZ.ALONE_MS); g.advance(QZ.ALONE_MS);
  assert.equal(g.hub.lobby.quiz!.board().phase, 'idle'); assert.equal(g.hub.active, false);
});

test('комната: после обрыва зритель освобождает кресло и возвращается стоя', () => {
  const g = setup(); g.round();
  g.b.c.lostAt = g.clock.now; g.advance(100);
  assert.equal(g.hub.lobby.playerOf(g.b.c)!.action, ACT_NONE);
  g.sit(g.out.c, 1); assert.equal(g.hub.lobby.playerOf(g.out.c)!.action, ACT_QUIZ);
  g.b.c.lostAt = 0; g.advance(100);
  assert.equal(g.hub.lobby.playerOf(g.b.c)!.action, ACT_NONE);
});
