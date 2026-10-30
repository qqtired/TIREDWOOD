import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVote, castVote, syncVote, voteView, finishVote } from '../shared/quiz/vote.ts';
import { QZ, QZ_MODES } from '../shared/quiz/types.ts';

const people = [{ slot: 1, nick: 'Оля' }, { slot: 2, nick: 'Петя' }];
const ready = QZ_MODES.map(m => m.id);

test('голоса: передумал, серая карточка, ушедшие не считаются', () => {
  let s = createVote(100);
  s = castVote(s, 1, 0, people, ready);
  s = castVote(s, 1, 1, people, ready);
  assert.deepEqual(voteView(s, people, ready).options.map(o => o.n), [0, 1, 0, 0]);
  assert.equal(castVote(s, 2, 3, people, ready), s);
  assert.equal(castVote(s, 2, 1, people), s, 'Скоро');
  assert.equal(voteView(s, people.slice(1), ready).voted, 0);
  assert.equal(finishVote(s, people.slice(1), {}, () => 0, ready).nobody, true);
});

test('все проголосовали: последние 3 с, новый человек не отменяет закрытие', () => {
  let s = castVote(castVote(createVote(0), 1, 0, people), 2, 0, people);
  s = syncVote(s, people, 1000);
  assert.equal(s.endsAt, 1000 + QZ.VOTE_ALL_MS);
  assert.equal(s.closing, true);
  s = syncVote(s, [...people, { slot: 3, nick: 'Вася' }], 1500);
  assert.equal(s.endsAt, 4000);
});

test('ничья: дольше не играли, среди не игравших — rand; ноль голосов', () => {
  let s = castVote(castVote(createVote(0), 1, 0, people, ready), 2, 1, people, ready);
  assert.equal(finishVote(s, people, { riddle: 20, jeopardy: 10 }, () => 0, ready).win, 1);
  assert.equal(finishVote(s, people, {}, () => .99, ready).win, 1);
  assert.deepEqual(finishVote(s, people, {}, () => 0, ready).spin?.tied, [0, 1]);
  assert.equal(finishVote(createVote(0), people, {}, () => 0).nobody, true);
  assert.equal(finishVote(s, people, {}, () => .99).win, 0, 'Скоро не побеждает');
});
