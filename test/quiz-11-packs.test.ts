import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { CrocGame } from '../server/lobby/quiz/croc.ts';
import { fetchQuizPack } from '../server/lobby/quiz/fetch.ts';
import type { ModeHost, ModePerson } from '../server/lobby/quiz/controller.ts';
import { QuizHttp, type QuizHttpOptions } from '../server/lobby/quiz/http.ts';
import { JeopardyGame } from '../server/lobby/quiz/jeopardy.ts';
import { QuizPacks } from '../server/lobby/quiz/packs.ts';
import { crocInk, newCroc, reduceCroc } from '../shared/quiz/croc.ts';
import { QZ_TICKET_HEADER, type QuizServerMsg } from '../shared/quiz/net.ts';
import { PackError, validatePack } from '../shared/quiz/pack.ts';
import { parseText } from '../shared/quiz/text.ts';
import { QZ_CROC as CR, QZ_JP as JP, QZ_PACK, type QzInkOp, type QzOrder, type QzPack, type QzPackKind } from '../shared/quiz/types.ts';
import { QUIZ_VENUE as V } from '../shared/quiz/venue.ts';

const fixture = (name = 'naberezhnaya'): QzPack => parseText(readFileSync(new URL(`./fixtures/quiz/${name}.txt`, import.meta.url), 'utf8')).pack;
function setup(t: TestContext) {
  const packs = new QuizPacks({ dataDir: mkdtempSync(path.join(tmpdir(), 'quiz-11-packs-')) });
  t.after(() => packs.close());
  packs.registerBuiltin('b-jp', fixture());
  packs.registerBuiltin('b-words', fixture('croc-words'));
  const people: ModePerson[] = [1, 2, 3, 4].map(slot => ({ slot, pid: 100 + slot, nick: `Игрок${slot}`, chair: slot - 1, seatedAt: slot }));
  const orders = new Map<QzPackKind, QzOrder>(), used: string[] = [], places = new Map<number, number>();
  const said: Array<{ text: string; clip: string }> = [], inks: QuizServerMsg[] = [];
  const h: ModeHost = { people: () => people, rand: () => 0, packs: kind => packs.all(kind), store: packs,
    hold: (slot, place) => { places.set(slot, place); }, release: slot => { places.delete(slot); },
    say: (text, clip) => { said.push({ text, clip }); }, ping: () => 0, ink: msg => inks.push(msg),
    order: kind => orders.get(kind) ?? null,
    orderUsed: (kind, id) => { if (orders.get(kind)?.id === id) { orders.delete(kind); used.push(id); } },
  };
  const upload = (pack: QzPack, at = 1000) => {
    const draft = packs.begin(101, at + QZ_PACK.TICKET_MS, validatePack(pack, []), at);
    return packs.done(draft.id, 101, at).id;
  };
  const order = (kind: QzPackKind, id: string) => orders.set(kind, { kind, id, title: packs.get(id)!.title, by: { slot: 4, nick: 'Tired' }, at: 1000 });
  return { h, packs, people, places, said, inks, orders, used, upload, order };
}

test('1.1: голоса сразу занимают пульты по времени голоса; не хватает людей — прежний вызов ролей', t => {
  const g = setup(t), game = new JeopardyGame(g.h, 1000, [103, 101, 102], 7);
  t.after(() => game.close());
  assert.equal(game.phase, 'game'); assert.equal(game.call, null);
  assert.equal(game.boardFields().jp?.step, 'packvote'); assert.equal(game.boardFields().jp?.host, null);
  assert.deepEqual(game.boardFields().jp?.players.map(p => p.slot), [3, 1, 2]);
  assert.deepEqual([3, 1, 2].map(slot => g.places.get(slot)), [V.first.pult, V.first.pult + 1, V.first.pult + 2]);
  const fallback = new JeopardyGame(g.h, 1000, [103, 999], 7);
  assert.equal(fallback.phase, 'roles'); assert.equal(fallback.call?.role, 'host'); fallback.close();
});

test('1.1: «Веду я» доступно свободному внутри; setup отменяет голоса и освобождает паки', t => {
  for (const podium of [false, true]) {
    const g = setup(t), fresh = g.upload(fixture()), game = new JeopardyGame(g.h, 1000, [101, 102, 103], 1);
    t.after(() => game.close());
    assert.equal(game.meFields(4, 1000).jp?.canHost, true);
    assert.equal(game.meFields(1, 1000).jp?.canHost, false);
    assert.equal(game.meFields(99, 1000).jp?.canHost, false);
    game.message(g.people[0], { t: 'qz', a: 'role', r: 'host', take: true }, 0, 1000);
    assert.equal(game.boardFields().jp?.step, 'packvote'); assert.equal(game.accepted, false);
    game.message(g.people[0], { t: 'qz', a: 'jpPv', i: 0 }, 0, 1000);
    assert.equal(g.packs.delete(fresh, 101), 'pending');
    if (podium) game.use(4, V.first.podium, 1001);
    else game.message(g.people[3], { t: 'qz', a: 'role', r: 'host', take: true }, 0, 1001);
    assert.equal(game.boardFields().jp?.step, 'setup'); assert.equal(game.boardFields().jp?.host?.slot, 4);
    assert.equal(game.deadline, 1001 + JP.SETUP_MS); assert.equal(game.boardFields().jp?.packs, null);
    assert.equal(game.meFields(4, 1001).jp?.canHost, false); assert.equal(g.places.get(4), V.first.podium);
    assert.equal(g.packs.get(fresh), null, 'после отмены голосования отложенное удаление больше не заблокировано');
    assert.deepEqual(g.said.at(-1), { text: 'Игрок4 ведёт!', clip: 'point' });
    game.message(g.people[3], { t: 'qz', a: 'jpZat' }, 0, 1002);
    assert.ok(game.boardFields().jp?.packs?.every(p => p.n === 0));
    assert.ok(game.boardFields().jp?.packs?.every(p => p.id !== fresh), 'удалённый после снятия блокировки пак не возвращается в голосование');
  }
});

test('1.1: заказ первым с автором, самый свежий новый пак среди карточек; заказ снят только после вопроса', t => {
  for (const live of [false, true]) {
    const g = setup(t); g.packs.registerBuiltin('b-ordered', fixture());
    const older = g.upload(fixture(), 100), newest = g.upload(fixture(), 200);
    g.order('jeopardy', 'b-ordered');
    const game = new JeopardyGame(g.h, 1000, [101, 102, 103], 1); t.after(() => game.close());
    const options = game.boardFields().jp!.packs!;
    assert.equal(options[0].id, 'b-ordered'); assert.equal(options[0].by, 'Tired');
    assert.equal(options[1].id, newest); assert.equal(options[1].fresh, true); assert.equal(options.length, 3);
    assert.equal(g.packs.all().find(p => p.id === older)?.fresh, true);
    assert.equal(g.packs.all().find(p => p.id === newest)?.at, 200);
    assert.equal(g.packs.all().find(p => p.id === 'b-jp')?.fresh, false);
    if (live) {
      game.use(4, V.first.podium, 1001);
      game.message(g.people[3], { t: 'qz', a: 'jpStart', pack: 'b-ordered', round: 0, themes: [0, 1, 2], final: false }, 0, 1002);
    } else game.tick(game.deadline);
    assert.equal(game.boardFields().jp?.pack?.id, 'b-ordered'); assert.deepEqual(g.used, []);
    const player = g.people.find(p => p.slot === game.boardFields().jp?.turn)!;
    game.message(player, { t: 'qz', a: 'jpPick', th: 0, cell: 0 }, 0, live ? 1003 : game.deadline - JP.PICK_MS + 1);
    assert.deepEqual(g.used, ['b-ordered']); assert.equal(g.packs.all().find(p => p.id === 'b-ordered')?.plays, 1);
  }
  const g = setup(t); g.order('jeopardy', 'b-jp');
  const game = new JeopardyGame(g.h, 1000, [101, 102], 1); game.stop(1001);
  assert.equal(g.orders.get('jeopardy')?.id, 'b-jp', 'не сыгранный заказ остаётся');
});

test('1.1: «Крокодил» сразу берёт первого голосовавшего и каждый ход предлагает слова заказанного пака', t => {
  const g = setup(t), pack = fixture('croc-words'); pack.words = { easy: ['арбуз'], mid: ['караван'], hard: ['телескоп'] };
  const id = g.upload(pack); g.order('words', id);
  const game = new CrocGame(g.h, 1000, 1, [102, 101]); t.after(() => game.close());
  game.tick(1000); assert.equal(game.boardFields().croc.step, 'words'); assert.equal(game.boardFields().croc.drawer?.slot, 2);
  assert.deepEqual(game.meFields(2).croc.choices, ['арбуз', 'караван', 'телескоп']);
  game.message(g.people[1], { t: 'qz', a: 'crWord', i: 0 }, 0, 1000);
  for (const p of g.people.filter(p => p.slot !== 2)) game.message(p, { t: 'qz', a: 'say', text: 'арбуз' }, 0, 1001);
  assert.deepEqual(g.used, []); assert.equal(game.boardFields().croc.last?.end, 'all');
  game.tick(game.deadline); assert.equal(game.boardFields().croc.drawer?.slot, 1);
  assert.deepEqual(game.meFields(1).croc.choices, ['арбуз', 'караван', 'телескоп']);
  game.message(g.people[0], { t: 'qz', a: 'crWord', i: 1 }, 0, game.deadline - CR.WORDS_MS);
  game.tick(game.deadline); game.tick(game.deadline); game.tick(game.deadline);
  assert.ok(game.outcome); assert.deepEqual(g.used, [id]);
  g.order('words', id); const skipped = new CrocGame(g.h, 200_000, 1, [101]); skipped.stop(200_000);
  assert.equal(g.orders.get('words')?.id, id, 'без засчитанного хода заказ остаётся');
});

test('1.1: заказ самого свежего пака занимает одну карточку; неиграбельный заказ не навязывается', t => {
  const g = setup(t), older = g.upload(fixture(), 100), newest = g.upload(fixture(), 200);
  g.packs.registerBuiltin('b-another', fixture()); g.order('jeopardy', newest);
  const game = new JeopardyGame(g.h, 1000, [101, 102], 1); t.after(() => game.close());
  const options = game.boardFields().jp!.packs!;
  assert.deepEqual(options.map(p => p.id), [newest, 'b-jp', older], 'после заказанного свежего остальные карточки выбираются с весами');
  const adult = fixture(); adult.adult = true;
  g.packs.registerBuiltin('b-adult', adult); g.order('jeopardy', 'b-adult');
  const other = new JeopardyGame(g.h, 1000, [101, 102], 1); t.after(() => other.close());
  assert.ok(other.boardFields().jp?.packs?.every(p => p.id !== 'b-adult' && p.by === undefined));
  other.tick(other.deadline);
  other.message(g.people[0], { t: 'qz', a: 'jpPick', th: 0, cell: 0 }, 0, other.deadline - JP.PICK_MS + 1);
  assert.equal(g.orders.get('jeopardy')?.id, 'b-adult');
});

test('1.1: неполный заказ слов оставляет общий набор и не снимается после игры', t => {
  const g = setup(t), pack = fixture('croc-words'); pack.words = { easy: ['арбуз'], mid: [], hard: [] };
  const id = g.upload(pack); g.order('words', id);
  const game = new CrocGame(g.h, 1000, 1, [101]); t.after(() => game.close());
  game.tick(1000); assert.deepEqual(game.meFields(1).croc.choices, ['маяк', 'пароход', 'водолаз']);
  game.message(g.people[0], { t: 'qz', a: 'crWord', i: 0 }, 0, 1000);
  game.tick(game.deadline); game.tick(game.deadline); game.tick(game.deadline);
  assert.ok(game.outcome); assert.equal(g.orders.get('words')?.id, id);
});

test('1.1: заливка доступна рисующему, сохраняет порядок, отмену, очистку и общие лимиты мазков', t => {
  const g = setup(t), game = new CrocGame(g.h, 1000, 1, [101]); t.after(() => game.close());
  game.tick(1000); game.message(g.people[0], { t: 'qz', a: 'crWord', i: 0 }, 0, 1000);
  const fill: QzInkOp = ['f', 2, 3, 100, 100];
  game.message(g.people[1], { t: 'qz', a: 'crInk', ops: [fill] }, 0, 1000);
  assert.deepEqual(game.fullInk().ops, []);
  const ops: QzInkOp[] = [['s', 1, 0, 0, 10, 10], fill, ['s', 1, 0, 0, 20, 20]];
  game.message(g.people[0], { t: 'qz', a: 'crInk', ops }, 0, 1000);
  assert.equal(game.accepted, true); assert.deepEqual(game.fullInk().ops, ops);
  assert.deepEqual(g.inks.at(-1), { t: 'qzInk', d: 1, ops });
  game.message(g.people[0], { t: 'qz', a: 'crInk', ops: [['u', 2]] }, 0, 1050);
  assert.ok(game.fullInk().ops.every(op => op[1] !== 2));
  game.message(g.people[0], { t: 'qz', a: 'crInk', ops: [['u', 1]] }, 0, 1100);
  assert.deepEqual(game.fullInk().ops, []);
  game.message(g.people[0], { t: 'qz', a: 'crInk', ops: [['f', 3, 3, 100, 100], ['x']] }, 0, 1150);
  assert.deepEqual(game.fullInk().ops, []);
  game.message(g.people[0], { t: 'qz', a: 'crInk', ops: [['f', 3, 3, 100, 100]] }, 0, 1200);
  assert.equal(game.accepted, false, 'очистка не разрешает повторное использование номера');
  let s = newCroc(g.people, [fixture('croc-words')], 0, [g.people[0]]);
  s = reduceCroc(s, { a: 'tick' }, s.endsAt, () => 0).state;
  s = reduceCroc(s, { a: 'crWord', slot: 1, i: 0 }, s.endsAt - CR.WORDS_MS, () => 0).state;
  s.inkPoints = CR.INK_PTS - 1; s.inkStrokes = CR.INK_STROKES - 1;
  s = reduceCroc(s, { a: 'crInk', slot: 1, ops: [['f', 1, 3, 100, 100]] }, s.endsAt - CR.DRAW_MS, () => 0).state;
  assert.equal(s.inkPoints, CR.INK_PTS); assert.equal(s.inkStrokes, CR.INK_STROKES);
  const full = crocInk(s);
  s = reduceCroc(s, { a: 'crInk', slot: 1, ops: [['f', 2, 3, 100, 100]] }, s.endsAt - CR.DRAW_MS + 50, () => 0).state;
  assert.deepEqual(crocInk(s), full);
});

async function httpSetup(t: TestContext, fetcher: typeof fetch) {
  const g = setup(t), logs: string[] = [];
  const options: QuizHttpOptions = { packs: g.packs, uploaders: ['Tired'], fetch: fetcher, log: text => logs.push(text) };
  const http = new QuizHttp(options);
  const server = createServer((req, res) => http.handle(req, res, new URL(req.url!, 'http://local').pathname));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  t.after(async () => { http.close(); server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); });
  const req = (url: string, ticket?: string, body?: string) => fetch(`http://127.0.0.1:${address.port}/quiz/fetch`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(ticket ? { [QZ_TICKET_HEADER]: ticket } : {}) }, body: body ?? JSON.stringify({ url }),
  });
  return { ...g, http, req, logs };
}
const guid = '12345678-1234-1234-1234-123456789abc';
const link = `https://vladimirkhil.com/si/game?package=${guid}`;
const direct = 'https://cdn.vladimirkhil.com/packs/test.siq';

test('1.1: /quiz/fetch — GUID через API/directContentUri, поток байтов и безопасные заголовки', async t => {
  const calls: string[] = [];
  const g = await httpSetup(t, async (url, init) => {
    assert.equal(init?.redirect, 'manual'); assert.ok(init?.signal);
    calls.push(String(url));
    if (String(url) === QZ_PACK.FETCH_API + guid) return Response.json({ directContentUri: direct, contentUri: 'https://example.com/not-used' });
    assert.equal(String(url), direct);
    return new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([80, 75])); c.enqueue(new Uint8Array([3, 4])); c.close(); } }));
  });
  const ticket = g.http.ticket(101, 5, 'tired').ticket, response = await g.req(link, ticket);
  assert.equal(response.status, 200); assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([80, 75, 3, 4]));
  assert.deepEqual(calls, [QZ_PACK.FETCH_API + guid, direct]);
  assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(g.logs, []);
});

test('1.1: /quiz/fetch — билет, https, границы хоста, redirect и размер до выдачи байтов', async t => {
  let reply = () => new Response(null, { status: 302, headers: { location: 'https://evil.ru/pack.siq' } });
  let calls = 0;
  const g = await httpSetup(t, async () => { calls++; return reply(); });
  const ticket = g.http.ticket(101, 5, 'Tired').ticket;
  assert.equal((await g.req(link)).status, 401);
  for (const url of ['http://vladimirkhil.com/a.siq', 'https://vladimirkhil.com.evil.ru/a.siq', 'https://evil.ru/a.siq', 'https://vladimirkhil.com/not-a-pack']) {
    assert.equal((await g.req(url, ticket)).status, 400);
  }
  assert.equal(calls, 0);
  const redirected = await g.req(direct, ticket);
  assert.equal(redirected.status, 400); assert.deepEqual(await redirected.json(), { ok: false, error: 'Можно только паки из библиотеки SIGame' });
  reply = () => new Response(null, { headers: { 'content-length': String(QZ_PACK.FETCH_BYTES + 1) } });
  const oversized = await g.req(direct, ticket);
  assert.equal(oversized.status, 413); assert.deepEqual(await oversized.json(), { ok: false, error: 'Пак больше 100 МБ' });
  assert.equal((await g.req(direct, ticket, JSON.stringify({ url: direct, extra: 'a'.repeat(4096) }))).status, 413);
  assert.deepEqual(g.logs, []);
});

test('1.1: билеты на загрузку только для QUIZ_UPLOADERS без учёта регистра', t => {
  const g = setup(t), http = new QuizHttp({ packs: g.packs, uploaders: ['Tired'] }); t.after(() => http.close());
  assert.throws(() => http.ticket(101, 5, 'Петя'), e => e instanceof PackError && e.status === 403 && e.message === 'Загружать паки пока может только Tired');
  assert.ok(http.ticket(101, 5, 'tired').ticket);
  // список заменяет порог уровня: Tired с 1-го уровня тоже может, остальным — нет и на 9-м
  assert.ok(http.ticket(102, 1, 'Tired').ticket);
  assert.equal(http.uploadCheck('Петя', 9).ok, false);
});

test('1.1: /quiz/fetch — contentUri, разрешённый redirect, предел переходов и ошибки библиотеки', async t => {
  let mode = 'fallback', calls = 0;
  const g = await httpSetup(t, async url => {
    calls++;
    if (mode === 'error') return new Response(null, { status: 500 });
    if (mode === 'timeout') throw new DOMException('timeout', 'TimeoutError');
    if (mode === 'loop') return new Response(null, { status: 302, headers: { location: '/again.siq' } });
    if (String(url) === QZ_PACK.FETCH_API + guid) return Response.json({ contentUri: mode === 'foreign' ? 'https://evil.ru/pack.siq' : direct });
    if (String(url) === direct) return new Response(null, { status: 307, headers: { location: '/final.siq' } });
    return new Response(new Uint8Array([80, 75]));
  });
  const ticket = g.http.ticket(101, 5, 'Tired').ticket;
  const response = await g.req(link, ticket); assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([80, 75])); assert.equal(calls, 3);
  mode = 'loop'; calls = 0; assert.equal((await g.req(direct, ticket)).status, 502); assert.equal(calls, 4);
  mode = 'foreign'; calls = 0; assert.equal((await g.req(link, ticket)).status, 400); assert.equal(calls, 1);
  mode = 'error'; assert.equal((await g.req(direct, ticket)).status, 502);
  mode = 'timeout'; const timeout = await g.req(direct, ticket);
  assert.equal(timeout.status, 504); assert.deepEqual(await timeout.json(), { ok: false, error: 'Библиотека не ответила — попробуй ещё раз' });
  assert.deepEqual(g.logs, []);
});

test('1.1: /quiz/fetch — один запрос на билет, общий предел 10 в минуту для адреса', async t => {
  let entered!: () => void, release!: () => void, blocked = true;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const pending = new Promise<void>(resolve => { release = resolve; });
  const g = await httpSetup(t, async () => { if (blocked) { entered(); await pending; } return new Response(new Uint8Array([80, 75])); });
  const ticket = g.http.ticket(101, 5, 'Tired').ticket;
  const first = g.req(direct, ticket); await started;
  try { assert.equal((await g.req(direct, ticket)).status, 409); } finally { blocked = false; release(); }
  const response = await first; assert.equal(response.status, 200); await response.arrayBuffer();
  for (let i = 0; i < 8; i++) { const next = await g.req(direct, ticket); assert.equal(next.status, 200); await next.arrayBuffer(); }
  const another = g.http.ticket(102, 5, 'Tired').ticket;
  assert.equal((await g.req(direct, another)).status, 429); assert.deepEqual(g.logs, []);
});

test('1.1: поток F5 ограничен без content-length, отменяется при превышении и по общему сроку', async () => {
  const block = new Uint8Array(1024 * 1024); let cancelled = false, bytes = 0;
  const oversized: typeof fetch = async () => new Response(new ReadableStream({ pull(c) { c.enqueue(block); }, cancel() { cancelled = true; } }));
  await assert.rejects(async () => { for await (const chunk of fetchQuizPack(direct, oversized)) bytes += chunk.length; }, e => e instanceof PackError && e.status === 413);
  assert.equal(bytes, QZ_PACK.FETCH_BYTES); assert.equal(cancelled, true);
  const controller = new AbortController(); cancelled = false;
  const stalled: typeof fetch = async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  const timer = setTimeout(() => controller.abort(), 10);
  try {
    await assert.rejects(async () => { for await (const _chunk of fetchQuizPack(direct, stalled, controller.signal)) assert.fail('данных нет'); },
      e => e instanceof PackError && e.status === 504);
  } finally { clearTimeout(timer); }
  assert.equal(cancelled, true);
});
