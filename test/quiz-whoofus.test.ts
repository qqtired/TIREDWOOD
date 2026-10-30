import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { newWhoOfUs, reduceWhoOfUs, whoOfUsBoard, whoOfUsMe, type WhoOfUsAction } from '../shared/quiz/whoofus.ts';
import { parseText } from '../shared/quiz/text.ts';
import { QZ_WHO as WHO } from '../shared/quiz/types.ts';

const ps = Array.from({ length: 13 }, (_, i) => ({ slot: i + 1, pid: i + 101, nick: `Игрок${i + 1}`, seatedAt: i }));
const pack = () => parseText(readFileSync(new URL('./fixtures/quiz/whoofus.txt', import.meta.url), 'utf8')).pack;
function game(n = 4) {
  let s = newWhoOfUs(ps.slice(0, n), [pack()], 0), now = 0;
  return { get s() { return s; }, get now() { return now; },
    act(a: WhoOfUsAction, at = now) { now = at; const r = reduceWhoOfUs(s, a, now, () => 0); s = r.state; return r; },
    tick(at = s.endsAt) { return this.act({ a: 'tick' }, at); } };
}
test('от четырёх, первые двенадцать по посадке; свои вопросы до двух с титулом через =', () => {
  assert.equal(game(3).s.done, true); assert.equal(game(13).s.players.length, WHO.MAX);
  const g = game();
  g.act({ a: 'whoAsk', slot: 1, text: 'первым уснёт на рыбалке = Соня набережной' });
  g.act({ a: 'whoAsk', slot: 1, text: 'Кто из нас найдёт маяк?' });
  g.act({ a: 'whoAsk', slot: 1, text: 'Третий вопрос' });
  assert.equal(g.s.own.length, 2); assert.equal(whoOfUsMe(g.s, 1).own, 2);
  assert.equal(g.s.own[0].q, 'Кто из нас первым уснёт на рыбалке?'); assert.equal(g.s.own[0].title, 'Соня набережной');
  assert.equal(g.act({ a: 'whoAsk', slot: 2, text: `Тест = ${'я'.repeat(31)}` }).error?.code, 'word');
  g.tick(); assert.equal(g.s.step, 'vote'); assert.equal([g.s.current, ...g.s.queue].filter(q => q?.by?.pid === 101).length, 2);
});
test('тайный голос не за себя, передумал, все проголосовали — 3 с; лидеры и очки', () => {
  const g = game(); g.tick();
  g.act({ a: 'whoVote', slot: 1, target: 1 }); assert.equal(whoOfUsBoard(g.s).voted, 0);
  g.act({ a: 'whoVote', slot: 1, target: 2 }); g.act({ a: 'whoVote', slot: 1, target: 3 });
  assert.equal(whoOfUsBoard(g.s).voted, 1); assert.equal(whoOfUsMe(g.s, 1).vote, 3); assert.equal(whoOfUsMe(g.s, 2).vote, 0);
  const publicJson = JSON.stringify(whoOfUsBoard(g.s)); assert.ok(!publicJson.includes('votes')); assert.ok(!publicJson.includes('pid')); assert.equal(whoOfUsBoard(g.s).tally, null);
  g.act({ a: 'whoVote', slot: 2, target: 3 }); g.act({ a: 'whoVote', slot: 3, target: 2 }); g.act({ a: 'whoVote', slot: 4, target: 3 });
  assert.equal(g.s.endsAt, g.now + WHO.VOTE_ALL_MS); g.tick();
  assert.deepEqual(whoOfUsBoard(g.s).leaders.map(p => p.slot), [3]);
  assert.deepEqual(g.s.scores, { 101: 1, 102: 1, 104: 1 }); assert.equal(g.s.titles[0].slot, 3);
});
test('ничья даёт несколько титулов, ноль голосов без титула; пропуск большинством не считает раунд', () => {
  const g = game(); g.tick(); const q = g.s.current;
  for (const slot of [1, 2]) g.act({ a: 'whoSkip', slot, on: true }); assert.equal(g.s.current?.q, q?.q);
  g.act({ a: 'whoSkip', slot: 3, on: true }); assert.equal(g.s.rounds, 0); assert.notEqual(g.s.current?.q, q?.q);
  for (const [slot, target] of [[1, 2], [2, 1], [3, 1], [4, 2]]) g.act({ a: 'whoVote', slot, target });
  g.tick(); assert.deepEqual(g.s.leaders.map(p => p.slot), [1, 2]); assert.equal(g.s.titles.length, 2); assert.equal(Object.keys(g.s.scores).length, 4);
  g.tick(); g.tick(); assert.equal(g.s.leaders.length, 0); assert.equal(g.s.titles.length, 2);
});
test('новый сидящий со следующего вопроса; ушедший сразу не цель голоса; меньше трёх — конец', () => {
  const g = game(); g.tick(); g.act({ a: 'presence', seated: ps.slice(0, 5) }); assert.equal(g.s.players.length, 4); assert.equal(whoOfUsMe(g.s, 5).in, false);
  g.act({ a: 'whoVote', slot: 1, target: 2 }); g.act({ a: 'presence', seated: [ps[0], ps[2], ps[3], ps[4]] });
  assert.equal(g.s.players.length, 3); assert.equal(whoOfUsBoard(g.s).voted, 0);
  g.tick(); g.tick(); assert.equal(whoOfUsMe(g.s, 5).in, true);
  g.act({ a: 'presence', seated: ps.slice(0, 2) }); assert.equal(g.s.done, true); assert.equal(g.s.result?.completed, false);
});
test('десять вопросов → результаты со всеми титулами и очками', () => {
  const g = game(); g.tick();
  for (let i = 0; i < WHO.ROUNDS; i++) {
    for (const [slot, target] of [[1, 2], [2, 1], [3, 2], [4, 2]]) g.act({ a: 'whoVote', slot, target });
    g.tick(); assert.equal(g.s.rounds, i + 1); g.tick();
  }
  assert.equal(g.s.done, true); assert.equal(g.s.result?.completed, true); assert.equal(g.s.result?.titles.length, WHO.ROUNDS);
  assert.equal(g.s.result?.scores[101], 10); assert.equal(g.s.result?.scores[102], undefined);
});
