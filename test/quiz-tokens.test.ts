import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QuizTokens, emptyQuizStats, normalizeQuizStats, quizMyRecords, quizTopRecords } from '../server/lobby/quiz/tokens.ts';
import { arcDay } from '../shared/arcade/rewards.ts';
import { QZ_TOKENS as TOK } from '../shared/quiz/types.ts';
import { normalizeProfile } from '../server/store.ts';

const at = Date.parse('2026-10-30T12:00:00Z');
test('минуты: +8 при действии за две минуты, без AFK, повторов и выплат вне game', () => {
  const q = new QuizTokens(); q.startGame(at); q.action(1, at); q.action(2, at + 1);
  assert.deepEqual(q.minute([1, 2, 3], at + 59_999), []);
  assert.deepEqual(q.minute([1, 2, 3], at + 60_000).map(a => [a.pid, a.n]), [[1, 8], [2, 8]]);
  assert.deepEqual(q.minute([1, 2, 3], at + 60_000), []);
  assert.equal(q.minute([1, 2, 3], at + 120_000).length, 2);
  assert.deepEqual(q.minute([1, 2, 3], at + 180_000), []);
  q.action(3, at + 180_000); assert.equal(q.minute([1, 2, 3], at + 240_000)[0].pid, 3);
  q.endGame(); q.action(1, at + 300_000); assert.deepEqual(q.minute([1, 2, 3], at + 300_000), []);
  assert.equal(q.gameCoins(1), 16);
});
test('вдвоём — половина минутных без бонусов, один — ничего; дубликаты pid не увеличивают число людей', () => {
  const q = new QuizTokens(); q.startGame(at); q.action(1, at);
  assert.deepEqual(q.minute([1, 2, 2], at + 60_000).map(a => [a.pid, a.n]), [[1, 4]]);
  assert.deepEqual(q.event({ kind: 'croc', id: 'end', players: [{ pid: 1, score: 8 }, { pid: 2, score: 4 }], completed: true }, [1, 2], at + 60_000), []);
  assert.equal(q.stats(1, at).qzDayCoins, 4);
  q.action(1, at + 110_000); assert.deepEqual(q.minute([1, 1], at + 120_000), []);
});
test('общий потолок 400, остаток выплаты, сброс ровно в полночь Москвы', () => {
  const q = new QuizTokens([{ pid: 1, stats: { qzDay: arcDay(at), qzDayCoins: 396 } }]); q.startGame(at); q.action(1, at);
  const award = q.minute([1, 2, 3], at + 60_000)[0]; assert.equal(award.n, 4); assert.equal(award.capped, true);
  assert.equal(q.event({ kind: 'croc', id: 'end', players: [{ pid: 1, score: 10 }], completed: true }, [1, 2, 3], at)[0].n, 0);
  assert.equal(q.stats(1, Date.parse('2026-10-30T20:59:59.999Z')).qzDayCoins, 400);
  const midnight = Date.parse('2026-10-30T21:00:00Z'); assert.equal(q.stats(1, midnight).qzDayCoins, 0);
  q.startGame(midnight); q.action(1, midnight); assert.equal(q.minute([1, 2, 3], midnight + 60_000)[0].n, 8);
});
test('бонус загадки: 60 с, два разных угадывающих, не больше трёх одной паре за скользящий час', () => {
  const q = new QuizTokens(); q.startGame(at);
  const event = (id: string, duration = 60_000, guessers = [2, 3], now = at) => q.event({ kind: 'riddle', id, riddler: 1, solver: 2, duration, guessers, solved: true }, [1, 2, 3], now);
  assert.deepEqual(event('short', 59_999), []); assert.deepEqual(event('one', 60_000, [2, 2]), []);
  assert.deepEqual(event('a').map(a => [a.pid, a.n]), [[1, 10], [2, 15]]); assert.deepEqual(event('a'), []);
  event('b', 60_000, [2, 3], at + 1); event('c', 60_000, [2, 3], at + 2);
  q.startGame(at + 3); assert.deepEqual(event('four', 60_000, [2, 3], at + 3), []);
  assert.equal(event('new', 60_000, [2, 3], at + 3600_000).length, 2);
  assert.equal(q.stats(1, at).qzRdMade, 7); assert.equal(q.stats(2, at).qzRdSolved, 7);
});
test('Своя игра: места только от трёх пультов, ведущему за окончание, рекорды и повтор результата', () => {
  const q = new QuizTokens(); q.startGame(at);
  const two = q.event({ kind: 'jeopardy', id: '2', players: [{ pid: 1, score: 400 }, { pid: 2, score: 200 }], host: 4, completed: true }, [1, 2, 4], at);
  assert.deepEqual(two.map(a => [a.pid, a.n]), [[4, 50]]);
  q.startGame(at + 1);
  const event = { kind: 'jeopardy' as const, id: '3', players: [{ pid: 1, score: 500 }, { pid: 2, score: 400 }, { pid: 3, score: 200 }], host: 4, completed: true };
  assert.deepEqual(q.event(event, [1, 2, 3, 4], at + 1).map(a => [a.pid, a.n]), [[1, 100], [2, 50], [3, 25], [4, 50]]);
  assert.deepEqual(q.event(event, [1, 2, 3, 4], at + 1), []);
  assert.equal(q.stats(1, at).qzJpGames, 2); assert.equal(q.stats(1, at).qzJpWins, 2); assert.equal(q.stats(1, at).qzJpBest, 500);
  assert.deepEqual(q.event({ ...event, id: 'aborted', completed: false }, [1, 2, 3, 4], at + 1), []);
});
test('Крокодил и Кто из нас: места, рекорды рисунка, равные победители, минимум пять для +40', () => {
  const q = new QuizTokens(); q.startGame(at);
  q.event({ kind: 'crocTurn', id: '1', drawer: 1, guessed: [2, 3, 3], counted: true }, [1, 2, 3], at);
  q.event({ kind: 'crocTurn', id: '2', drawer: 1, guessed: [2], counted: false }, [1, 2, 3], at);
  assert.equal(q.stats(1, at).qzCrDrawn, 1); assert.equal(q.stats(3, at).qzCrGuessed, 1);
  const rows = [1, 2, 3].map(pid => ({ pid, score: 10 - pid }));
  assert.deepEqual(q.event({ kind: 'croc', id: 'end', players: rows, completed: true }, [1, 2, 3], at).map(a => a.n), [60, 30, 15]);
  q.startGame(at + 1);
  assert.deepEqual(q.event({ kind: 'whoofus', id: 'four', players: [...rows, { pid: 4, score: 0 }], titles: [1, 1, 2], completed: true }, [1, 2, 3, 4], at), []);
  const players = [1, 2, 3, 4, 5].map(pid => ({ pid, score: pid <= 2 ? 10 : 1 }));
  assert.deepEqual(q.event({ kind: 'whoofus', id: 'five', players, titles: [1, 2], completed: true }, [1, 2, 3, 4, 5], at).map(a => [a.pid, a.n]), [[1, 40], [2, 40]]);
  assert.equal(q.stats(1, at).qzWhoTitles, 3);
  assert.deepEqual(q.event({ kind: 'whoofus', id: 'stopped', players, titles: [1], completed: false }, [1, 2, 3, 4, 5], at), []);
  assert.equal(q.stats(1, at).qzWhoTitles, 4, 'уже раскрытый титул остаётся в рекордах при смене игры');
});
test('старые профили без qz-полей: нули, без изменения прежних полей; свои рекорды и top-5', () => {
  const profile = normalizeProfile({ id: 1, nick: 'Tester7', tokens: 1234, xp: 1200, stats: { pbWins: 8, fsCaught: 19 } })!;
  assert.equal(profile.tokens, 1234); assert.equal(profile.stats.pbWins, 8); assert.equal(profile.stats.fsCaught, 19);
  for (const key of Object.keys(emptyQuizStats()) as Array<keyof ReturnType<typeof emptyQuizStats>>) assert.equal(profile.stats[key], 0, key);
  const kept = normalizeProfile({ ...profile, stats: { ...profile.stats, qzJpWins: 7, qzDayCoins: 56 } })!;
  assert.equal(kept.stats.qzJpWins, 7); assert.equal(kept.stats.qzDayCoins, 56); assert.equal(kept.stats.pbWins, 8);
  const old = { pbWins: 8, fishing: { level: 20 } }, copy = structuredClone(old);
  assert.deepEqual(normalizeQuizStats(old), emptyQuizStats()); assert.deepEqual(old, copy);
  assert.equal(normalizeQuizStats({ qzJpWins: -3, qzCrGuessed: NaN }).qzJpWins, 0);
  const records = quizMyRecords({ qzJpWins: 3, qzDayCoins: TOK.DAY_CAP, qzDay: arcDay(at) }, at);
  assert.equal(records.jpWins, 3); assert.equal(records.dayCoins, 400);
  const top = quizTopRecords(Array.from({ length: 8 }, (_, i) => ({ slot: i + 1, nick: `P${i}`, stats: { qzJpWins: i } })));
  assert.equal(top.jpWins.length, 5); assert.equal(top.jpWins[0].pts, 7); assert.equal(top.crGuessed.length, 0);
});
