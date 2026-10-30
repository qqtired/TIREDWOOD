// «Ракушка», часть 2б: мой клиент загрузки (siq.ts разбирает .siq, upload.ts отправляет) против настоящего сервера паков
// (QuizHttp + QuizPacks из server/lobby/quiz) — без браузера: проверяем, что порядок запросов, заголовки и тела подходят серверу.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import zlib from 'node:zlib';
import { parseSiq, type MediaTools } from '../client/lobby/quiz/ui/siq.ts';
import { UploadError, uploadPack, type UploadDeps, type UploadMemo } from '../client/lobby/quiz/ui/upload.ts';
import { QuizHttp } from '../server/lobby/quiz/http.ts';
import { QuizPacks } from '../server/lobby/quiz/packs.ts';
import { fileName } from '../shared/quiz/pack.ts';
import { QZ_PACK } from '../shared/quiz/types.ts';

/** Маленький ZIP: stored (0) или deflate (8) — как в test/quiz-ui2.test.ts */
function zip(files: Array<[string, Uint8Array | string, 0 | 8]>): Blob {
  const parts: Buffer[] = [], central: Buffer[] = [];
  let off = 0;
  for (const [name, data, method] of files) {
    const raw = Buffer.from(data), nm = Buffer.from(name), comp = method === 8 ? zlib.deflateRawSync(raw) : raw;
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt16LE(method, 8);
    h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nm.length, 26);
    parts.push(h, nm, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(method, 10);
    c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, nm);
    off += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return new Blob([Buffer.concat([...parts, cd, e])]);
}

const q = (price: number, text: string, answer: string, extra = ''): string => `<question price="${price}"><scenario>${extra}<atom>${text}</atom></scenario><right><answer>${answer}</answer></right></question>`;
const theme = (name: string, extra = ''): string => `<theme name="${name}"><questions>${q(100, 'Раз?', 'Один', extra)}${q(200, 'Два?', 'Два')}${q(300, 'Три?', 'Три')}</questions></theme>`;
const content = (title: string): string => `<?xml version="1.0" encoding="utf-8"?><package name="${title}" version="4" xmlns="http://vladimirkhil.com/ygpackage3.0.xsd">
<info><authors><author>Оля</author></authors></info><rounds><round name="Раунд 1"><themes>${theme('Рыбы', '<atom type="image">@pic.png</atom>')}${theme('Море', '<atom type="voice">@s.mp3</atom>')}${theme('Еда')}</themes></round></rounds></package>`;

/** Картинка → «webp» (заголовок RIFF…WEBP — сервер проверяет сигнатуру), звук — 12,5 с; настоящих кодеков в Node нет */
const media = (): MediaTools => ({
  async image(blob) {
    const raw = new Uint8Array(await blob.arrayBuffer());
    return { blob: new Blob([Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.from(raw.slice(0, 40))])]), ext: 'webp' };
  },
  async audio() { return 12.5; },
});

async function setup(t: TestContext) {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'quiz-ui-upload-'));
  let now = Date.parse('2026-10-30T12:00:00Z');
  const packs = new QuizPacks({ dataDir, admins: [99], now: () => now });
  const http = new QuizHttp({ packs, now: () => now, log: () => {} });
  const server = createServer((req, res) => { if (!http.handle(req, res, new URL(req.url ?? '/', 'http://local').pathname)) res.writeHead(404).end(); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => { http.close(); packs.close(); server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))); });
  const calls: string[] = [];
  const deps = (pid: number, level = 3): UploadDeps => ({
    ticket: async () => http.ticket(pid, level),
    fetch: (url, init) => { calls.push(`${init.method} ${url.replace(/[0-9a-f]{64}/g, '<sha>').replace(/\/up\/[0-9a-f]{8,}/, '/up/<id>')}`); return fetch(base + url, init); },
    sleep: async () => {},
  });
  return { packs, http, base, calls, deps, now: () => now, setNow: (n: number) => { now = n; } };
}

test('.siq: разбор в браузере → билет → POST → PUT по одному → done: сервер принял пак, файлы отдаются', async (t) => {
  const g = await setup(t);
  const bytes = Uint8Array.from({ length: 300 }, (_, i) => (i * 7) % 251);
  const siq = zip([['content.xml', content('Пак Оли'), 8], ['Images/pic.png', bytes, 8], ['Audio/s.mp3', Buffer.concat([Buffer.from('ID3'), Buffer.alloc(120, 1)]), 0]]);
  const parsed = await parseSiq(siq, { media: media() });
  assert.equal(parsed.files.length, 2);
  const info = await uploadPack({ pack: parsed.pack, files: parsed.files, blobs: parsed.blobs }, g.deps(5));
  assert.equal(info.title, 'Пак Оли');
  assert.equal(info.kind, 'jeopardy');
  assert.deepEqual(g.calls, ['POST /quiz/up', 'PUT /quiz/up/<id>/<sha>.webp', 'PUT /quiz/up/<id>/<sha>.mp3', 'POST /quiz/up/<id>/done']);
  const list = g.packs.list(5).list;
  assert.equal(list.length, 1);
  assert.equal(list[0].canDel, true);
  assert.equal(list[0].questions, 9);
  // файл из пака отдаётся по /quiz/m/<id>/<file> теми же байтами, что отправил клиент
  const f = parsed.files.find((x) => x.ext === 'webp')!;
  const res = await fetch(`${g.base}/quiz/m/${info.id}/${fileName(f)}`);
  assert.equal(res.status, 200);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), Buffer.from(await parsed.blobs.get(fileName(f))!.arrayBuffer()));
});

test('пак без файлов (текст): только POST и done, без PUT', async (t) => {
  const g = await setup(t);
  const siq = zip([['content.xml', content('Без файлов').replace('<atom type="image">@pic.png</atom>', '').replace('<atom type="voice">@s.mp3</atom>', ''), 8]]);
  const parsed = await parseSiq(siq, { media: media() });
  assert.equal(parsed.files.length, 0);
  const seen: number[] = [];
  const info = await uploadPack({ pack: parsed.pack, files: [], blobs: new Map() }, g.deps(6), (p) => seen.push(p.sent));
  assert.equal(info.title, 'Без файлов');
  assert.deepEqual(g.calls, ['POST /quiz/up', 'POST /quiz/up/<id>/done']);
  assert.equal(seen.at(-1), 0, 'полоска без файлов не делит на ноль');
});

test('уровень ниже 3 — билета нет; пятая загрузка за день проходит, шестая — отказ сервера со строкой для игрока', async (t) => {
  const g = await setup(t);
  assert.throws(() => g.http.ticket(7, 2), /3-го уровня/);
  const parsed = await parseSiq(zip([['content.xml', content('Один').replace('<atom type="image">@pic.png</atom>', '').replace('<atom type="voice">@s.mp3</atom>', ''), 8]]), { media: media() });
  let last: Error | null = null;
  for (let i = 0; i < 6; i++) {
    try { await uploadPack({ pack: { ...parsed.pack, title: `Пак ${i}` }, files: [], blobs: new Map() }, g.deps(8)); } catch (e) { last = e as Error; }
  }
  assert.ok(last instanceof Error, 'шестой пак за день отклонён');
  // отказ — либо при выдаче билета (limit), либо на POST (строка сервера): в обоих случаях игрок получает понятный текст, а не «ошибка 4xx»
  assert.match(last!.message, /[А-Яа-я]/);
  assert.equal(g.packs.list(8).list.length, 5);
});

test('истёкший билет (401): клиент берёт новый билет и отправляет пак заново целиком', async (t) => {
  const g = await setup(t);
  const parsed = await parseSiq(zip([['content.xml', content('Двойной билет').replace('<atom type="voice">@s.mp3</atom>', ''), 8], ['Images/pic.png', new Uint8Array(200).fill(3), 0]]), { media: media() });
  const d = g.deps(9);
  let tickets = 0, expired = false;
  const realFetch = d.fetch;
  d.ticket = async () => { tickets++; return g.http.ticket(9, 3); };
  d.fetch = async (url, init) => {
    // пока шли файлы, прошло пять минут: сервер считает билет истёкшим и отвечает 401
    if (!expired && init.method === 'PUT') { expired = true; g.setNow(g.now() + QZ_PACK.TICKET_MS + 1); }
    return realFetch(url, init);
  };
  const memo: UploadMemo = { cur: null };
  const info = await uploadPack({ pack: parsed.pack, files: parsed.files, blobs: parsed.blobs }, { ...d, memo });
  assert.equal(info.title, 'Двойной билет');
  assert.equal(tickets, 2, 'второй билет взят после 401');
  assert.equal(memo.cur, null, 'после успеха память пуста');
  assert.equal(g.packs.list(9).list.length, 1, 'пак в каталоге один — недозагруженный черновик не остался');
});

/** Файл пака + обрыв сети на втором запросе PUT: так выглядит плохой Wi-Fi посреди загрузки */
async function brokenOnSecondPut(g: Awaited<ReturnType<typeof setup>>, pid: number) {
  const parsed = await parseSiq(zip([['content.xml', content('Оборванный'), 8], ['Images/pic.png', new Uint8Array(200).fill(5), 0], ['Audio/s.mp3', Buffer.concat([Buffer.from('ID3'), Buffer.alloc(90, 2)]), 0]]), { media: media() });
  const d = g.deps(pid);
  let puts = 0, cut = true;
  const realFetch = d.fetch;
  d.fetch = async (url, init) => {
    if (cut && init.method === 'PUT' && ++puts === 2) { cut = false; throw new TypeError('fetch failed'); }
    return realFetch(url, init);
  };
  return { parsed, d };
}

test('обрыв сети посреди файлов: «Сохранить» ещё раз продолжает тот же пак — без нового POST, сервер не отвечает «билет уже использован»', async (t) => {
  const g = await setup(t);
  const { parsed, d } = await brokenOnSecondPut(g, 11);
  const memo: UploadMemo = { cur: null };
  const job = { pack: parsed.pack, files: parsed.files, blobs: parsed.blobs };
  await assert.rejects(() => uploadPack(job, { ...d, memo }), (e: unknown) => e instanceof UploadError && e.code === 'net');
  assert.ok(memo.cur, 'билет и пак запомнены');
  g.calls.length = 0;
  const info = await uploadPack(job, { ...d, memo });
  assert.equal(info.title, 'Оборванный');
  assert.ok(!g.calls.includes('POST /quiz/up'), 'второй попыткой пак не создаём заново');
  assert.deepEqual(g.calls.filter((c) => c.startsWith('PUT')).length, 2, 'оба файла присланы повторно');
  assert.equal(memo.cur, null);
  assert.equal(g.packs.list(11).list.length, 1);
});

test('обрыв, а потом пак изменён (другое название) — понятный отказ про пять минут, а не сырое слово сервера', async (t) => {
  const g = await setup(t);
  const { parsed, d } = await brokenOnSecondPut(g, 12);
  const memo: UploadMemo = { cur: null };
  await assert.rejects(() => uploadPack({ pack: parsed.pack, files: parsed.files, blobs: parsed.blobs }, { ...d, memo }), (e: unknown) => e instanceof UploadError && e.code === 'net');
  await assert.rejects(() => uploadPack({ pack: { ...parsed.pack, title: 'Другое название' }, files: parsed.files, blobs: parsed.blobs }, { ...d, memo }),
    (e: unknown) => e instanceof UploadError && e.code === 'busy' && /тот же пак|пять минут/.test(e.message));
});

test('без памяти (окно закрыли и открыли) повтор после обрыва: сервер говорит «билет уже использован» — игрок читает «подожди пять минут»', async (t) => {
  const g = await setup(t);
  const { parsed, d } = await brokenOnSecondPut(g, 13);
  const job = { pack: parsed.pack, files: parsed.files, blobs: parsed.blobs };
  await assert.rejects(() => uploadPack(job, d), (e: unknown) => e instanceof UploadError && e.code === 'net');
  await assert.rejects(() => uploadPack(job, d), (e: unknown) => e instanceof UploadError && e.code === 'busy' && /пять минут/.test(e.message));
  // через пять минут билет истёк — загрузка идёт с нуля
  g.setNow(g.now() + QZ_PACK.TICKET_MS + 1);
  const info = await uploadPack(job, d);
  assert.equal(info.title, 'Оборванный');
});

test('отказ сервера на POST (пак не прошёл проверку) — строка сервера в ошибке', async (t) => {
  const g = await setup(t);
  const parsed = await parseSiq(zip([['content.xml', content('Плохой').replace('<atom type="image">@pic.png</atom>', '').replace('<atom type="voice">@s.mp3</atom>', ''), 8]]), { media: media() });
  const broken = { ...parsed.pack, rounds: [] };
  await assert.rejects(() => uploadPack({ pack: broken, files: [], blobs: new Map() }, g.deps(10)), (e: unknown) => e instanceof UploadError && e.code === 'bad' && /[А-Яа-я]/.test(e.message));
});
