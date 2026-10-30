import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { QuizHttp, quizFileSignature } from '../server/lobby/quiz/http.ts';
import { QuizPacks } from '../server/lobby/quiz/packs.ts';
import { registerBuiltinPacks } from '../server/lobby/quiz/builtin.ts';
import { fileName, PackError, validatePack } from '../shared/quiz/pack.ts';
import { parseText } from '../shared/quiz/text.ts';
import { QZ_PACK, type QzPack, type QzUpFile } from '../shared/quiz/types.ts';

const basePack = (): QzPack => parseText(readFileSync(new URL('./fixtures/quiz/naberezhnaya.txt', import.meta.url), 'utf8')).pack;
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const file = (bytes: Buffer, ext: QzUpFile['ext'] = 'png'): QzUpFile => ({ sha256: createHash('sha256').update(bytes).digest('hex'), ext, kind: 'image', size: bytes.length });
async function setup(t: TestContext) {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'quiz-packs-test-'));
  let now = Date.parse('2026-10-30T12:00:00Z');
  const packs = new QuizPacks({ dataDir, admins: [99], now: () => now });
  const logs: string[] = [];
  const http = new QuizHttp({ packs, now: () => now, log: m => logs.push(m) });
  const server = createServer((req, res) => { if (!http.handle(req, res, new URL(req.url ?? '/', 'http://local').pathname)) res.writeHead(404).end(); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  t.after(async () => { http.close(); server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); });
  const req = (route: string, method = 'GET', ticket?: string, body?: BodyInit) => fetch(`${url}${route}`, { method,
    headers: { ...(ticket ? { 'X-Quiz-Ticket': ticket } : {}), ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}) }, body });
  const start = async (pid = 1, files: QzUpFile[] = [], pack = basePack()) => {
    const ticket = http.ticket(pid, 3).ticket;
    const res = await req('/quiz/up', 'POST', ticket, JSON.stringify({ pack, files })); assert.equal(res.status, 200);
    const data = await res.json() as { id: string; need: string[] };
    return { ...data, ticket };
  };
  return { dataDir, packs, http, logs, req, start, now: () => now, setNow: (n: number) => { now = n; } };
}

test('билет → JSON → файл → done → каталог/outline/GET; заголовки и одноразовость', async t => {
  const g = await setup(t), f = file(png), p = basePack(); p.rounds[0].themes[0].questions[0].content.push({ kind: 'image', file: fileName(f) });
  const up = await g.start(1, [f], p);
  assert.deepEqual(up.need, [fileName(f)]);
  assert.equal((await g.req(`/quiz/up/${up.id}/done`, 'POST', up.ticket)).status, 400);
  const put = await g.req(`/quiz/up/${up.id}/${fileName(f)}`, 'PUT', up.ticket, png); assert.equal(put.status, 200); assert.deepEqual(await put.json(), { ok: true, left: 0 });
  const done = await g.req(`/quiz/up/${up.id}/done`, 'POST', up.ticket); assert.equal(done.status, 200);
  assert.equal(g.packs.list(1).list[0].canDel, true); assert.equal(g.packs.list(2).list[0].canDel, false);
  assert.ok(existsSync(path.join(g.dataDir, 'quiz', 'packs', up.id, 'pack.json')));
  const outline = g.packs.outline(up.id, 1)!; assert.equal(outline.rounds[0].themes[0].prices[0], 100); assert.ok(!JSON.stringify(outline).includes('осётр'));
  const media = await g.req(`/quiz/m/${up.id}/${fileName(f)}`); assert.equal(media.status, 200);
  assert.equal(media.headers.get('x-content-type-options'), 'nosniff'); assert.match(media.headers.get('content-security-policy')!, /sandbox/);
  assert.match(media.headers.get('cache-control')!, /immutable/); assert.equal(media.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await media.arrayBuffer()), png);
  assert.equal((await g.req(`/quiz/up/${up.id}/done`, 'POST', up.ticket)).status, 401);
  assert.equal((await g.req('/quiz/m/../../anything')).status, 404);
  g.packs.flush();
  const reopened = new QuizPacks({ dataDir: g.dataDir }); t.after(() => reopened.close());
  assert.equal(reopened.get(up.id)?.title, p.title); assert.equal(reopened.list(1).total, 1); assert.deepEqual(g.logs, []);
});

test('уровень, истёкший/чужой билет, неверный хеш, SVG вместо PNG и лишние байты', async t => {
  const g = await setup(t);
  assert.throws(() => g.http.ticket(1, 2), /3-го уровня/);
  const f = file(png), up = await g.start(1, [f]);
  const bad = Buffer.from(png); bad[7] ^= 1;
  assert.equal((await g.req(`/quiz/up/${up.id}/${fileName(f)}`, 'PUT', up.ticket, bad)).status, 409);
  const stranger = g.http.ticket(2, 3).ticket;
  assert.equal((await g.req(`/quiz/up/${up.id}/${fileName(f)}`, 'PUT', stranger, png)).status, 401);
  assert.equal((await g.req(`/quiz/up/${up.id}/${fileName(f)}`, 'PUT', up.ticket, Buffer.alloc(QZ_PACK.IMAGE_BYTES + 1))).status, 413);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), fake = file(svg), fakeUp = await g.start(3, [fake]);
  assert.equal((await g.req(`/quiz/up/${fakeUp.id}/${fileName(fake)}`, 'PUT', fakeUp.ticket, svg)).status, 400);
  const tooBig = await g.req('/quiz/up', 'POST', stranger, JSON.stringify({ pack: basePack(), files: [{ ...f, size: QZ_PACK.IMAGE_BYTES + 1 }] }));
  assert.equal(tooBig.status, 413);
  g.setNow(g.now() + QZ_PACK.TICKET_MS);
  assert.equal((await g.req(`/quiz/up/${up.id}/done`, 'POST', up.ticket)).status, 401);
  assert.ok(readdirSync(path.join(g.dataDir, 'quiz', 'trash')).some(n => n.startsWith(up.id)));
  assert.equal(g.packs.draft(up.id), undefined);
});

test('пять загрузок за московский день, удаление не обходит квоту, новый день и права автора/админа', async t => {
  const g = await setup(t), ids: string[] = [];
  for (let i = 0; i < 5; i++) { const up = await g.start(); ids.push(up.id); assert.equal((await g.req(`/quiz/up/${up.id}/done`, 'POST', up.ticket)).status, 200); }
  assert.throws(() => g.http.ticket(1, 3), /5 паков/);
  assert.throws(() => g.packs.delete(ids[0], 2), /автор/);
  assert.equal(g.packs.delete(ids[0], 1), 'deleted');
  assert.equal(g.packs.delete(ids[1], 99), 'deleted');
  assert.equal(g.packs.list(1).total, 3); assert.equal(g.packs.uploadsToday(1), 5);
  assert.throws(() => g.http.ticket(1, 3), /5 паков/);
  assert.ok(readdirSync(path.join(g.dataDir, 'quiz', 'trash')).some(n => n.startsWith(ids[0])));
  g.setNow(Date.parse('2026-10-30T21:00:00Z'));
  assert.equal(g.http.ticket(1, 3).left, 5);
});

test('встроенные, поиск, лайк только игравшему, отложенное удаление, атомарный каталог и восстановление', async t => {
  const g = await setup(t);
  registerBuiltinPacks(g.packs, new URL('./fixtures/quiz/', import.meta.url));
  assert.equal(g.packs.list(1).total, 3); assert.equal(g.packs.usedBytes(), 0);
  assert.equal(g.packs.list(1, 'слова', 'words').list.length, 1);
  assert.throws(() => g.packs.delete('b-croc-words', 99), /автор/);
  const up = await g.start(); await g.req(`/quiz/up/${up.id}/done`, 'POST', up.ticket);
  g.packs.setPlaying(up.id, true); g.packs.played(up.id);
  assert.equal(g.packs.like(up.id, 2), false);
  g.packs.setPlaying(up.id, false, [2]); assert.equal(g.packs.like(up.id, 2), true); assert.equal(g.packs.like(up.id, 2), false);
  assert.equal(g.packs.list(2).list.find(p => p.id === up.id)?.liked, true);
  g.packs.setPlaying(up.id, true); assert.equal(g.packs.delete(up.id, 1), 'pending'); assert.ok(g.packs.get(up.id));
  g.packs.setPlaying(up.id, false); assert.equal(g.packs.get(up.id), null);
  g.packs.flush(); assert.ok(!existsSync(path.join(g.dataDir, 'quiz', 'catalog.json.tmp')));
  const rows = JSON.parse(readFileSync(path.join(g.dataDir, 'quiz', 'catalog.json'), 'utf8')) as Array<Record<string, unknown>>;
  assert.ok(rows.every(r => !('canDel' in r) && !('liked' in r)));
  // Имитируем разрыв после rename packs/, до отложенной записи каталога.
  const recovered = g.packs.begin(4, g.now() + 10000, validatePack(basePack())); g.packs.done(recovered.id, 4);
  const reopened = new QuizPacks({ dataDir: g.dataDir, now: g.now }); t.after(() => reopened.close());
  assert.ok(reopened.get(recovered.id));
  reopened.flush(); reopened.delete(recovered.id, 4);
  const afterDelete = new QuizPacks({ dataDir: g.dataDir, now: g.now }); t.after(() => afterDelete.close());
  assert.equal(afterDelete.get(recovered.id), null, 'перенесённый в trash пак не воскресает до flush каталога');
  assert.equal(afterDelete.uploadsToday(4), 1);
});

test('POST: 60, PUT: 600; GET/HEAD без лимита; общий объём включает черновики и корзину', async t => {
  const g = await setup(t);
  for (let i = 0; i < 65; i++) assert.equal((await g.req('/quiz/m/no/file', i % 2 ? 'HEAD' : 'GET')).status, 404);
  for (let i = 0; i < 60; i++) assert.equal((await g.req('/quiz/up', 'POST')).status, 401);
  assert.equal((await g.req('/quiz/up', 'POST')).status, 429);
  const route = `/quiz/up/aaaaaaaaaaaa/${fileName(file(png))}`;
  for (let i = 0; i < 600; i++) assert.equal((await g.req(route, 'PUT')).status, 401);
  assert.equal((await g.req(route, 'PUT')).status, 429);
  assert.equal((await g.req('/quiz/m/no/file')).status, 404);
  g.setNow(g.now() + 60_000);
  const f = file(png), up = await g.start(1, [f]);
  for (let i = 0; i < 300; i++) assert.equal((await g.req(`/quiz/up/${up.id}/${fileName(f)}`, 'PUT', up.ticket, png)).status, 200);
  assert.equal((await g.req(`/quiz/up/${up.id}/done`, 'POST', up.ticket)).status, 200);
  const dir = mkdtempSync(path.join(tmpdir(), 'quiz-quota-test-')), store = new QuizPacks({ dataDir: dir });
  t.after(() => store.close());
  // Реальные гигабайты не создаём: лимит по каталогу.
  writeFileSync(path.join(dir, 'quiz', 'catalog.json'), JSON.stringify([{ id: 'aaaaaaaaaaaa', title: 'Пак', author: '', kind: 'words', adult: false,
    rounds: 0, themes: 0, questions: 1, bytes: QZ_PACK.TOTAL_BYTES, at: Date.now(), plays: 0, likes: 0, builtin: false, authorPid: 8, likedBy: [] }]));
  const full = new QuizPacks({ dataDir: dir }); t.after(() => full.close());
  assert.throws(() => full.checkUpload(9, 3), (e: unknown) => e instanceof PackError && e.status === 413);
});

test('ошибка каталога не меняет исходные файлы; встроенные доступны при отключённой загрузке', async t => {
  const g = await setup(t); g.packs.flush();
  const file = path.join(g.dataDir, 'quiz', 'catalog.json'); writeFileSync(file, '{broken');
  const before = readdirSync(path.join(g.dataDir, 'quiz'));
  assert.throws(() => new QuizPacks({ dataDir: g.dataDir }));
  assert.equal(readFileSync(file, 'utf8'), '{broken'); assert.deepEqual(readdirSync(path.join(g.dataDir, 'quiz')), before);
  const fallback = new QuizPacks({ dataDir: mkdtempSync(path.join(tmpdir(), 'quiz-fallback-test-')) });
  registerBuiltinPacks(fallback, new URL('./fixtures/quiz/', import.meta.url));
  const disabled = new QuizHttp({ packs: fallback, enabled: false }); t.after(() => disabled.close());
  assert.equal(fallback.list(1).total, 3); assert.throws(() => disabled.ticket(1, 3), /недоступны/);
});

test('сигнатуры всех разрешённых видов, SVG/HTML не подходят', () => {
  const samples: Array<[QzUpFile['ext'], Buffer]> = [['png', png], ['jpg', Buffer.from([255, 216, 255])], ['gif', Buffer.from('GIF89a')],
    ['webp', Buffer.from('RIFF0000WEBP')], ['mp3', Buffer.from('ID3')], ['ogg', Buffer.from('OggS')], ['m4a', Buffer.from('0000ftypM4A ')]];
  for (const [ext, bytes] of samples) { assert.equal(quizFileSignature(bytes, ext), true, ext); assert.equal(quizFileSignature(Buffer.from('<svg/>'), ext), false, ext); }
});
