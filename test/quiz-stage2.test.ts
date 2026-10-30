import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { QuizStage, type QuizHost, type QuizPerson } from '../server/lobby/quiz/stage.ts';
import { QuizPacks } from '../server/lobby/quiz/packs.ts';
import { QuizHttp } from '../server/lobby/quiz/http.ts';
import { registerBuiltinPacks } from '../server/lobby/quiz/builtin.ts';
import { readMessage } from '../server/lobby/quiz/input.ts';
import { emptyStats } from '../shared/economy.ts';
import { arcDay } from '../shared/arcade/rewards.ts';
import { ACT_NONE, ACT_QUIZ } from '../shared/lobby.ts';
import { QUIZ_VENUE as V, placeAt, chairPlace } from '../shared/quiz/venue.ts';
import { QZ, QZ_JP as JP, QZ_CROC as CR, QZ_WHO as WHO } from '../shared/quiz/types.ts';
import type { QuizServerMsg } from '../shared/quiz/net.ts';

function setup(t: TestContext, n = 4, seed?: (profiles: Array<{ stats: ReturnType<typeof emptyStats> }>) => void) {
  let now = Date.parse('2026-10-30T12:00:00Z');
  const people: QuizPerson[] = Array.from({ length: n }, (_, i) => ({ slot: i + 1, pid: i + 101, nick: `Игрок${i + 1}`,
    ...V.chairs[i], action: ACT_NONE, arg: 0, ephemeral: false, riding: false, ping: 0, level: 3 }));
  const profiles = people.map(p => ({ pid: p.pid, nick: p.nick, stats: emptyStats() }));
  seed?.(profiles);
  const packs = new QuizPacks({ dataDir: mkdtempSync(path.join(tmpdir(), 'quiz-stage2-')), admins: [104], now: () => now });
  registerBuiltinPacks(packs, new URL('./fixtures/quiz/', import.meta.url));
  const http = new QuizHttp({ packs, now: () => now }); t.after(() => http.close());
  const sent: Array<{ slot: number; msg: QuizServerMsg }> = [], paid: Array<{ pid: number; n: number }> = [];
  const host: QuizHost = {
    now: () => now, rand: () => 0, people: () => people, packs, http, profiles: () => profiles,
    hold: (slot, place) => { const p = people.find(p => p.slot === slot); if (p) Object.assign(p, placeAt(place), { action: ACT_QUIZ, arg: place }); },
    release: (slot, to) => { const p = people.find(p => p.slot === slot); if (p) Object.assign(p, to ?? {}, { action: ACT_NONE, arg: 0 }); },
    credit: (slot, n, pid) => paid.push({ pid: pid ?? people.find(p => p.slot === slot)!.pid, n }),
    saveStats: (pid, stats) => { const p = profiles.find(p => p.pid === pid); if (p) Object.assign(p.stats, stats); },
    send: (slot, msg) => sent.push({ slot, msg: structuredClone(msg) }),
    sendLobby: (msg, except = []) => { for (const p of people) if (!except.includes(p.slot)) host.send(p.slot, msg); },
    announce: () => {}, toast: () => {}, log: () => {},
  };
  const q = new QuizStage(host);
  const g = {
    q, people, profiles, packs, http, sent, paid, get now() { return now; },
    advance(ms: number) { now += ms; q.step(); },
    msg(slot: number, msg: Record<string, unknown>) { q.message(slot, { t: 'qz', ...msg }); },
    sit(slot: number) { Object.assign(people.find(p => p.slot === slot)!, V.chairs[slot - 1]); q.use(slot, chairPlace(slot - 1)); },
    select(mode: number) {
      for (const p of people) this.sit(p.slot);
      this.msg(1, { a: 'play' }); for (const p of people) this.msg(p.slot, { a: 'vote', m: mode });
      this.advance(QZ.VOTE_ALL_MS); this.advance(QZ.WIN_MS); assert.equal(q.board().phase, mode === 0 || mode === 3 ? 'game' : 'roles');
    },
    jp() {
      for (const p of people) this.sit(p.slot);
      this.msg(1, { a: 'play' }); this.msg(1, { a: 'vote', m: 0 });
      for (const p of people.slice(1)) this.msg(p.slot, { a: 'vote', m: 1 });
      this.advance(QZ.VOTE_ALL_MS); this.advance(QZ.WIN_MS);
      assert.equal(q.board().jp?.step, 'packvote');
      this.msg(1, { a: 'role', take: true, r: 'host' }); assert.equal(q.board().jp?.step, 'setup');
      this.msg(1, { a: 'jpStart', pack: 'b-naberezhnaya', round: 0, themes: [0, 1, 2], final: false });
      assert.equal(q.board().jp?.step, 'pick');
    },
  };
  q.step(); return g;
}

test('сцена: «Своя игра» — роли, трибуна/пульты, личный ответ, результат, места вечера, жетоны и лайк', t => {
  const g = setup(t); g.jp();
  assert.equal(g.people[0].arg, V.first.podium);
  assert.deepEqual(g.q.raisedPults(), [0, 1, 2]);
  g.msg(2, { a: 'jpPick', th: 0, cell: 0 });
  assert.equal(g.packs.list(101).list.find(p => p.id === 'b-naberezhnaya')!.plays, 1);
  assert.ok(g.q.me(1)?.jp?.host?.answers.length);
  assert.equal(g.q.me(2)?.jp?.host, undefined); assert.equal(g.q.board().jp?.answer, null);
  const answer = g.q.me(1)!.jp!.host!.answers[0];
  g.msg(1, { a: 'jpOpen' }); g.msg(2, { a: 'jpBuzz' }); g.advance(JP.BUZZ_WINDOW_MS);
  g.msg(2, { a: 'jpAns', text: answer }); g.msg(1, { a: 'jpJudge', ok: true });
  assert.equal(g.q.board().jp?.answer?.text, answer);
  g.advance(JP.REVEAL_MS); g.msg(1, { a: 'jpEnd' });
  assert.equal(g.q.board().phase, 'results'); assert.equal(g.q.board().results?.pack?.id, 'b-naberezhnaya');
  assert.equal(g.q.me(2)?.result?.tokens, 100); assert.equal(g.q.me(1)?.result?.tokens, 50);
  assert.equal(g.q.me(1)?.result?.place, 0, 'ведущий получает строку жетонов без выдуманного места');
  assert.deepEqual(g.q.board().evening.map(p => p.pts), [5, 3, 3]);
  assert.equal(g.profiles[1].stats.qzJpGames, 1); assert.equal(g.profiles[1].stats.qzJpWins, 1);
  assert.equal(g.profiles[1].stats.qzJpBest, 100); assert.deepEqual(g.q.raisedPults(), []);
  assert.ok(g.people.every(p => p.action === ACT_NONE));
  g.msg(2, { a: 'packLike', id: 'b-naberezhnaya' }); g.msg(2, { a: 'packLike', id: 'b-naberezhnaya' });
  assert.equal(g.packs.list(102).list.find(p => p.id === 'b-naberezhnaya')!.likes, 1);
  g.advance(QZ.RESULTS_MS); assert.equal(g.q.board().phase, 'vote');
});

test('сцена: пинг берётся у соединения; отойти/вернуться к пульту; согласие ведущего и его уход', t => {
  const g = setup(t, 5); g.jp();
  g.msg(2, { a: 'jpPick', th: 0, cell: 0 }); g.msg(1, { a: 'jpOpen' });
  g.advance(200); g.msg(2, { a: 'jpBuzz' });
  g.people[2].ping = 300; g.advance(50); g.msg(3, { a: 'jpBuzz' }); g.advance(100);
  assert.equal(g.q.board().jp?.buzz?.slot, 3);
  assert.equal(g.q.stood(3), true); Object.assign(g.people[2], { action: ACT_NONE }); g.q.step();
  assert.ok(g.q.board().jp!.players.find(p => p.slot === 3)!.away > g.now);
  Object.assign(g.people[2], V.pults[1].player); g.q.use(3, V.first.pult + 1);
  assert.equal(g.q.board().jp!.players.find(p => p.slot === 3)!.away, 0);
  g.q.stood(5); Object.assign(g.people[4], { action: ACT_NONE }); g.q.step();
  g.advance(JP.AWAY_MS); Object.assign(g.people[4], V.pults[3].player); g.q.use(5, V.first.pult + 3);
  assert.equal(g.q.view(1).jp?.asks[0]?.slot, 5); assert.deepEqual(g.q.view(2).jp?.asks, []);
  g.msg(1, { a: 'jpSeat', slot: 5, ok: true }); assert.equal(g.people[4].arg, V.first.pult + 3);
  g.people[0].x = V.center[0] + 100; g.q.step(); assert.equal(g.q.board().jp?.host, null);
  assert.equal(g.people[0].x, V.center[0] + 100, 'уход ведущего не возвращает его за ограду');
});

test('сцена: «Крокодил» — очередь, место, приватные догадки, мазки внутри/снаружи и итоги', t => {
  const g = setup(t, 3); g.select(2); g.advance(0);
  assert.equal(g.q.board().phase, 'game'); assert.equal(g.people[0].arg, V.first.drawer);
  assert.equal(g.q.board().croc?.step, 'words'); assert.deepEqual(g.q.board().croc?.queue.map(p => p.slot), [2, 3]);
  g.msg(1, { a: 'crWord', i: 0 }); const word = g.q.me(1)!.croc!.word!;
  assert.ok(word); assert.equal(g.q.me(2)?.croc?.word, undefined);
  g.people.push({ ...g.people[2], slot: 4, pid: 104, x: V.center[0] + 100, action: ACT_NONE }); g.q.step();
  assert.ok(g.sent.some(x => x.slot === 4 && x.msg.t === 'qzInk' && x.msg.full));
  const mark = g.sent.length;
  g.advance(50); g.msg(1, { a: 'crInk', ops: [['s', 1, 0, 0, 10, 20]] });
  g.advance(50); g.msg(1, { a: 'crInk', ops: [['s', 1, 0, 0, 30, 40]] });
  assert.equal(g.sent.slice(mark).filter(x => x.slot === 2 && x.msg.t === 'qzInk').length, 2);
  assert.equal(g.sent.slice(mark).filter(x => x.slot === 4 && x.msg.t === 'qzInk').length, 0);
  g.people.push({ ...g.people[3], slot: 5, pid: 105 }); g.q.step();
  const newcomer = g.sent.length;
  g.advance(150);
  const batch = g.sent.slice(mark).find(x => x.slot === 4 && x.msg.t === 'qzInk')!.msg;
  assert.ok(batch.t === 'qzInk'); assert.equal(batch.ops.length, 2);
  assert.equal(g.sent.slice(newcomer).filter(x => x.slot === 5 && x.msg.t === 'qzInk').length, 0, 'full уже содержит отложенные мазки: повторно их не шлём');
  g.msg(2, { a: 'say', text: word }); g.advance(QZ.SAY_GAP_MS);
  g.msg(2, { a: 'say', text: 'секрет после разгадки' }); g.advance(QZ.SNAP_MIN_MS);
  assert.ok(g.q.view(1).croc!.lines.some(l => l.text === 'секрет после разгадки'));
  assert.ok(!g.q.view(3).croc!.lines.some(l => l.text === 'секрет после разгадки'));
  const last3 = g.sent.filter(x => x.slot === 3 && x.msg.t === 'qz').at(-1)!.msg;
  assert.ok(last3.t === 'qz'); assert.ok(!last3.v.croc!.lines.some(l => l.only));
  g.msg(3, { a: 'say', text: word }); assert.equal(g.q.board().croc?.last?.end, 'all');
  assert.equal(g.profiles[0].stats.qzCrDrawn, 1); assert.equal(g.profiles[1].stats.qzCrGuessed, 1);
  g.advance(CR.REVEAL_MS); assert.equal(g.q.board().croc?.drawer?.slot, 2);
  g.msg(2, { a: 'role', take: false, r: 'drawer' }); assert.equal(g.q.board().croc?.drawer?.slot, 3);
  g.msg(3, { a: 'role', take: false, r: 'drawer' }); g.advance(QZ.CALL_MS);
  assert.equal(g.q.board().phase, 'results'); assert.equal(g.q.me(2)?.result?.tokens, 60);
  assert.deepEqual(g.q.board().evening.map(p => p.pts), [5, 4, 4]);
});

test('сцена: «Кто из нас?» — сидящие, свои вопросы, тайность, десять раскрытий и титулы', t => {
  const g = setup(t); g.select(3); assert.equal(g.q.view().call, null);
  assert.equal(g.q.board().who?.step, 'ask');
  g.msg(1, { a: 'whoAsk', text: 'первым уснёт? = Соня' }); g.advance(WHO.ASK_MS);
  for (let round = 0; round < WHO.ROUNDS; round++) {
    assert.equal(g.q.board().who?.step, 'vote');
    for (const p of g.people) g.msg(p.slot, { a: 'whoVote', slot: p.slot === 1 ? 2 : 1 });
    assert.equal(g.q.board().who?.tally, null); assert.equal(g.q.me(2)?.who?.vote, 1);
    assert.equal(g.q.me(1)?.who?.vote, 2);
    g.advance(WHO.VOTE_ALL_MS); assert.equal(g.q.board().who?.step, 'reveal');
    g.advance(WHO.REVEAL_MS);
  }
  assert.equal(g.q.board().phase, 'results'); assert.equal(g.profiles[0].stats.qzWhoTitles, 10);
  assert.equal(g.q.board().results?.titles?.length, 10); assert.equal(g.q.me(2)?.result?.pts, 10);
  assert.ok(!g.paid.some(p => p.n === 40), 'бонус лучшему только от пяти');
  g.advance(QZ.RESULTS_MS); assert.equal(g.q.board().phase, 'vote'); assert.equal(g.q.view().people[0].titles, undefined);
});

test('жетоны через хост: принятые действия, минута, бонус загадки, дневной потолок и рекорды', t => {
  const g = setup(t, 3, ps => { ps[0].stats.qzDay = arcDay(Date.parse('2026-10-30T12:00:00Z')); ps[0].stats.qzDayCoins = 395; });
  g.select(0); g.msg(1, { a: 'role', take: true }); g.msg(1, { a: 'ask', word: 'пароход', cat: 'Предмет' });
  g.msg(3, { a: 'recs' }); g.msg(2, { a: 'say', text: 'x'.repeat(QZ.LINE_MAX + 1) });
  g.advance(60_000); assert.deepEqual(g.paid, [{ pid: 101, n: 5 }]);
  g.msg(3, { a: 'say', text: 'большая лодка' }); g.msg(2, { a: 'say', text: 'пароход' }); g.advance(QZ.CHECK_MS);
  assert.equal(g.profiles[0].stats.qzDayCoins, 400); assert.ok(g.paid.some(p => p.pid === 102 && p.n === 15));
  assert.equal(g.profiles[0].stats.qzRdMade, 1); assert.equal(g.profiles[1].stats.qzRdSolved, 1);
  g.advance(QZ.GAME_MS); assert.equal(g.q.me(1)?.result?.tokens, 5);
  g.msg(1, { a: 'recs' }); const count = g.sent.filter(x => x.msg.t === 'qzRecs').length;
  g.msg(1, { a: 'recs' }); assert.equal(g.sent.filter(x => x.msg.t === 'qzRecs').length, count);
});

test('вдвоём: 4 за активную минуту без бонуса; swap не начисляет места за незаконченную игру', t => {
  const g = setup(t, 2); g.select(0); g.msg(1, { a: 'role', take: true }); g.msg(1, { a: 'ask', word: 'пароход', cat: 'Предмет' });
  g.advance(60_000); g.msg(2, { a: 'say', text: 'пароход' }); g.advance(QZ.CHECK_MS); assert.deepEqual(g.paid, [{ pid: 101, n: 4 }]);
  const j = setup(t); j.jp(); j.msg(1, { a: 'swap', on: true }); j.msg(2, { a: 'swap', on: true }); j.msg(3, { a: 'swap', on: true });
  assert.equal(j.q.board().phase, 'vote'); assert.deepEqual(j.paid, []); assert.deepEqual(j.q.board().evening, []);
  const w = setup(t); w.select(3); w.advance(WHO.ASK_MS);
  for (const p of w.people) w.msg(p.slot, { a: 'whoVote', slot: p.slot === 1 ? 2 : 1 });
  w.advance(WHO.VOTE_ALL_MS);
  for (const slot of [1, 2, 3]) w.msg(slot, { a: 'swap', on: true });
  assert.equal(w.q.board().phase, 'vote'); assert.equal(w.profiles[0].stats.qzWhoTitles, 1, 'раскрытый титул сохраняется и при смене игры');
  assert.deepEqual(w.q.board().evening, []); assert.deepEqual(w.paid, []);
});

test('формы части 2: лишние ключи, длины, целые диапазоны и атомарная пачка мазков', () => {
  for (const msg of [
    { a: 'jpBuzz', ping: 500 }, { a: 'jpPick', th: 6, cell: 0 }, { a: 'jpBet', n: 1.5 },
    { a: 'jpStart', pack: 'b-test', round: 0, themes: [0, 0, 1], final: true },
    { a: 'crInk', ops: [['s', 1, 0, 0, CR.W, 0]] }, { a: 'crInk', ops: [['x', 1]] },
    { a: 'crInk', ops: [['s', 1, 0, 0, ...Array(130).fill(0)]] },
    { a: 'jpAns', text: 'a'.repeat(121) }, { a: 'packs', kind: 'bad' }, { a: 'packDel', id: '../catalog' },
    { a: 'role', take: true, r: 'admin' }, { a: 'jpSeat', slot: 2, ok: 1 }, { a: 'whoVote', slot: 0 },
  ]) assert.equal(readMessage({ t: 'qz', ...msg }), null, JSON.stringify(msg).slice(0, 100));
  assert.ok(readMessage({ t: 'qz', a: 'crInk', ops: [['s', 1, 8, 2, 0, CR.H - 1]] }));
});

test('WS-каталог: личные права, outline без ответов, удаление и билет с уровнем профиля', t => {
  const g = setup(t);
  g.msg(1, { a: 'packs', kind: 'jeopardy' });
  const list = g.sent.at(-1)!.msg; assert.ok(list.t === 'qzPacks');
  assert.equal(list.admin, false); assert.ok(list.list.every(p => p.kind === 'jeopardy' && !p.canDel && !p.liked));
  g.msg(4, { a: 'packs' }); const admin = g.sent.at(-1)!.msg; assert.ok(admin.t === 'qzPacks' && admin.admin);
  g.msg(1, { a: 'packOutline', id: 'b-naberezhnaya' });
  const outline = g.sent.at(-1)!.msg; assert.ok(outline.t === 'qzPackOutline'); assert.ok(!JSON.stringify(outline).includes('answers'));
  g.msg(1, { a: 'packDel', id: 'b-naberezhnaya' }); assert.equal(g.sent.at(-1)!.msg.t, 'qzErr');
  g.people[0].level = 2; g.msg(1, { a: 'upTicket' });
  const error = g.sent.at(-1)!.msg; assert.ok(error.t === 'qzErr' && error.code === 'level');
  g.people[0].level = 3; g.msg(1, { a: 'upTicket' });
  const ticket = g.sent.at(-1)!.msg; assert.ok(ticket.t === 'qzTicket');
  assert.equal(ticket.ticket.length, 64); assert.equal(ticket.left, 5); assert.ok(ticket.exp > g.now);
});
