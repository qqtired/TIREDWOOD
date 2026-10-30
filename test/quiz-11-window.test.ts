// «Ракушка» 1.1, окно паков (U2): «Сыграть» и строка заказа, «Загрузить» тремя шагами, плашка «загружать пока может только …»,
// пак по ссылке из библиотеки SIGame (F5: fetchPack против заглушки и против настоящего QuizHttp). Всё без DOM: модели — чистые
// функции, сеть — заглушка. Главная логика и главный сценарий.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, type TestContext } from 'node:test';
import zlib from 'node:zlib';
import { parseSiq, type MediaTools } from '../client/lobby/quiz/ui/siq.ts';
import { UploadError, fetchPack, uploadPack, type FetchProgress, type UploadDeps } from '../client/lobby/quiz/ui/upload.ts';
import {
  canOrder, fetchText, lockHtml, orderRows, ordersHtml, orderWhen, packOutlineHtml, packRow, saveGate, savedHtml, sigameLink, sourceNote, uploadGate, UPLOAD_WAYS,
} from '../client/lobby/quiz/ui/win-model.ts';
import { QuizHttp } from '../server/lobby/quiz/http.ts';
import { QuizPacks } from '../server/lobby/quiz/packs.ts';
import { QZ_TICKET_HEADER } from '../shared/quiz/net.ts';
import { blankPack } from '../shared/quiz/pack.ts';
import { QZ_PACK, type QzOrder, type QzPackInfo } from '../shared/quiz/types.ts';

const pic = (id: string) => `<i class="${id}"></i>`;
const info = (o: Partial<QzPackInfo> = {}): QzPackInfo => ({
  id: 'a1b2c3d4e5f6', title: 'Кино 90-х', author: 'Tired', kind: 'jeopardy', adult: false, rounds: 2, themes: 8, questions: 40, bytes: 1000, at: 1, plays: 3, likes: 2,
  builtin: false, canDel: false, liked: false, ...o,
});
const order = (o: Partial<QzOrder> = {}): QzOrder => ({ id: 'a1b2c3d4e5f6', title: 'Кино 90-х', kind: 'jeopardy', by: { slot: 4, nick: 'Tired' }, at: 1, ...o });

describe('«Паки»: «Сыграть» и строка заказа', () => {
  it('кнопка «Сыграть» — у «Своей игры», слов и «Кто из нас?»; у «Загадок» её нет', () => {
    for (const kind of ['jeopardy', 'words', 'whoofus'] as const) assert.match(packRow(info({ kind }), false, pic), /data-w="play" data-id="a1b2c3d4e5f6"[^>]*>Сыграть</, kind);
    assert.doesNotMatch(packRow(info({ kind: 'riddles' }), false, pic), /data-w="play"/);
    assert.equal(canOrder('riddles'), false);
    // встроенные тоже можно заказать; «Удалить» остаётся отдельной кнопкой своих паков
    const own = packRow(info({ builtin: true }), false, pic);
    assert.match(own, /data-w="play"/);
    assert.match(packRow(info({ canDel: true }), false, pic), /data-w="play"[\s\S]*data-w="del"/);
  });

  it('нажал — «Заказываю…» без возможности нажать ещё раз; заказан — золотая метка вместо кнопки', () => {
    const wait = packRow(info(), false, pic, 'wait');
    assert.match(wait, /disabled[^>]*>Заказываю…</);
    const done = packRow(info(), false, pic, 'done');
    assert.match(done, /k-pill k-pill--gold qw-ordered">Заказан</);
    assert.doesNotMatch(done, /data-w="play"/);
  });

  it('строка заказа: по одному на вид, порядок «Своя игра» → слова → «Кто из нас?», свой заказ — «ты» и золотой', () => {
    const rows = orderRows([order({ kind: 'whoofus', id: 'c', title: 'Про нас' }), order(), order({ kind: 'words', id: 'b', title: 'Лето', by: { slot: 7, nick: 'Вася' } })], 7);
    assert.deepEqual(rows.map((r) => [r.kind, r.who, r.mine]), [['jeopardy', 'Tired', false], ['words', 'ты', true], ['whoofus', 'Tired', false]]);
    const html = ordersHtml(rows, pic);
    assert.match(html, /Заказан: «Кино 90-х» — Tired<\/span><span class="k-toast-sub">будет первым в следующей «Своей игре»</);
    assert.match(html, /k-toast--reward[^>]*data-id="b"[\s\S]*Заказан: «Лето» — ты/);
    assert.match(html, /слова из него — в следующем «Крокодиле»/);
    assert.match(html, /вопросы из него — первыми в следующем «Кто из нас\?»/);
    assert.equal(orderWhen('riddles'), '');
  });

  it('заказов нет — одна подсказка, как заказать; чужой текст в строке экранируется', () => {
    assert.match(ordersHtml(orderRows(undefined, 1), pic), /Нажми «Сыграть» у пака/);
    assert.equal(orderRows([], 1).length, 0);
    const evil = ordersHtml(orderRows([order({ title: '<img src=x onerror=1>', by: { slot: 2, nick: '<b>ник</b>' } })], 1), pic);
    assert.doesNotMatch(evil, /<img src=x|<b>ник/);
  });
});

describe('«Загрузить»: плашка и три шага', () => {
  it('сервер не пускает — плашка с его словами и дорогой к «Сыграть»; нет поля или можно — форма открыта', () => {
    assert.deepEqual(uploadGate({ canUpload: true }), { open: true, why: '' });
    assert.deepEqual(uploadGate({}), { open: true, why: '' });
    assert.deepEqual(uploadGate(null), { open: true, why: '' });
    const g = uploadGate({ canUpload: false, uploadWhy: 'Загружать паки пока может только Tired' });
    assert.deepEqual(g, { open: false, why: 'Загружать паки пока может только Tired' });
    assert.equal(uploadGate({ canUpload: false }).why, 'Загружать паки сейчас нельзя');
    const html = lockHtml(g.why, pic);
    assert.match(html, /Загружать паки пока может только Tired/);
    assert.match(html, /Сыграть можно любой пак — во вкладке «Паки»/);
    assert.match(html, /data-w="tab" data-tab="packs">К пакам</);
    assert.doesNotMatch(lockHtml('<script>', pic), /<script>/);
  });

  it('три способа шага 1: ссылка, файл, текст', () => {
    assert.deepEqual(UPLOAD_WAYS.map((w) => w.id), ['link', 'file', 'text']);
  });

  it('кнопки шага 3: серые с причиной, пока пака нет; «Сохранить и сыграть» и «Только сохранить» у заказываемых видов', () => {
    const ok = { pack: { ...blankPack(), title: 'Х' }, warnings: [], errors: [], problem: '' };
    const base = { canUpload: true, level: null, busy: '' as const, fetching: false };
    assert.equal(saveGate({ ...base, draft: null }).why, 'Сначала выбери, откуда взять пак');
    assert.equal(saveGate({ ...base, draft: null, fetching: true }).why, 'Скачиваю пак…');
    assert.equal(saveGate({ ...base, draft: ok, busy: 'parse' }).why, 'Разбираю пак…');
    assert.equal(saveGate({ ...base, draft: ok, busy: 'save' }).why, 'Идёт загрузка…');
    assert.equal(saveGate({ ...base, draft: { ...ok, errors: ['Строка 3: …'] } }).why, 'Исправь ошибки в паке');
    const g = saveGate({ ...base, draft: ok });
    assert.deepEqual([g.why, g.play, g.main, g.only], ['', true, 'Сохранить и сыграть', 'Только сохранить']);
    assert.match(g.hint, /«Сохранить и сыграть»: будет первым в следующей «Своей игре»\. «Только сохранить»/);
    // пак, который не заказать, — одна кнопка
    const riddles = saveGate({ ...base, draft: { ...ok, pack: { ...ok.pack, kind: 'riddles' } } });
    assert.deepEqual([riddles.play, riddles.main], [false, 'Сохранить']);
    // слово сервера (canUpload) главнее уровня; поля нет — решает уровень
    assert.equal(saveGate({ ...base, canUpload: true, level: 1, draft: ok }).why, '');
    assert.equal(saveGate({ ...base, canUpload: undefined, level: 2, draft: ok }).why, 'Загружать паки можно с 3-го уровня');
    assert.match(saveGate({ ...base, draft: null }).hint, /Пак увидят все игроки/);
  });

  it('итог шага 3: «Готово: «…» сохранён» и что с заказом', () => {
    const s = (order: 'wait' | 'yes' | 'fail' | 'no') => savedHtml({ id: 'x', title: 'Кино 90-х', kind: 'jeopardy', order }, pic);
    assert.match(s('wait'), /Готово: «Кино 90-х» сохранён<\/span><span class="k-toast-sub">Заказываю…/);
    assert.match(s('yes'), /k-toast--good[\s\S]*Заказан — будет первым в следующей «Своей игре»/);
    assert.match(s('fail'), /k-toast--warn[\s\S]*Заказать не вышло/);
    assert.match(s('no'), /Теперь он есть среди паков/);
    assert.match(s('yes'), /data-w="tab" data-tab="packs">Смотреть в «Паках»</);
    assert.doesNotMatch(savedHtml({ id: 'x', title: '<b>x</b>', kind: 'words', order: 'no' }, pic), /<b>x<\/b>/);
  });

  it('шаг 2: раунды и темы пилюлями (не больше 4 раундов и 8 тем в раунде), откуда пак, ход скачивания', () => {
    const q = { price: 100, type: 'simple' as const, content: [], reveal: [], answers: ['а'], wrong: [], comment: '' };
    const theme = (name: string) => ({ name, questions: [q] });
    const rounds = Array.from({ length: 5 }, (_, i) => ({ name: `Раунд ${i + 1}`, final: false, themes: Array.from({ length: i === 0 ? 10 : 3 }, (_, k) => theme(`Тема ${i}-${k}`)) }));
    const html = packOutlineHtml({ ...blankPack(), rounds });
    assert.equal((html.match(/class="qw-round"/g) ?? []).length, 4);
    assert.match(html, /<span class="k-pill k-pill--xs">Тема 0-7<\/span><span class="k-faint">ещё 2<\/span>/);
    assert.match(html, /…и ещё 1 раунд</);
    assert.equal(packOutlineHtml({ ...blankPack(), kind: 'words' }), '');
    assert.equal(sourceNote({ kind: 'sigame', name: '' }), 'из библиотеки SIGame');
    assert.equal(sourceNote({ kind: 'file', name: 'pack.siq' }), 'из файла pack.siq');
    assert.equal(sourceNote({ kind: 'text', name: '' }), '');
    const p = (o: Partial<FetchProgress>): FetchProgress => ({ phase: 'download', got: 0, total: 0, wait: 0, ...o });
    assert.equal(fetchText(p({ phase: 'ticket' })), 'Готовлюсь скачать пак…');
    assert.equal(fetchText(p({})), 'Скачиваю пак…');
    assert.equal(fetchText(p({ got: 3.4 * 1048576, total: 12 * 1048576 })), 'Скачиваю пак… 3,4 МБ из 12 МБ');
    assert.equal(fetchText(p({ got: 2048 })), 'Скачиваю пак… 2 КБ');
    assert.equal(fetchText(p({ wait: 7 })), 'Сервер просит подождать — 7 с');
  });
});

describe('ссылка из библиотеки SIGame: проверка до билета', () => {
  const GUID = '0b6a0a7e-3c1e-4d0f-9c63-8b2f6d1f2a11';
  it('принимает ссылку с номером пака и прямую на .siq; без https:// и с http:// — поправляет', () => {
    const a = sigameLink(`https://vladimirkhil.com/si/storage/?id=${GUID}`);
    assert.deepEqual(a, { ok: true, url: `https://vladimirkhil.com/si/storage/?id=${GUID}`, name: '' });
    const b = sigameLink('  https://www.vladimirkhil.com/sistorage/files/Кино%2090.siq  ');
    assert.equal(b.ok, true);
    assert.equal(b.ok && b.name, 'Кино 90.siq');
    assert.deepEqual(sigameLink(`vladimirkhil.com/pack/${GUID}`), { ok: true, url: `https://vladimirkhil.com/pack/${GUID}`, name: '' });
    assert.equal(sigameLink(`http://vladimirkhil.com/x/${GUID}`).ok && (sigameLink(`http://vladimirkhil.com/x/${GUID}`) as { url: string }).url.startsWith('https://'), true);
  });

  it('отказывает по-человечески: пусто, не ссылка, чужой сайт, нет номера пака', () => {
    const why = (s: string): string => { const r = sigameLink(s); assert.equal(r.ok, false, s); return r.ok ? '' : r.why; };
    assert.match(why(''), /Вставь ссылку/);
    assert.match(why('просто слова'), /не похоже на ссылку/);
    assert.match(why(`https://example.com/${GUID}`), /Можно только паки из библиотеки SIGame \(vladimirkhil\.com\)/);
    assert.match(why(`https://vladimirkhil.com.evil.ru/${GUID}`), /Можно только паки из библиотеки SIGame/);
    assert.match(why(`https://user:pw@vladimirkhil.com/${GUID}`), /Можно только паки из библиотеки SIGame/);
    assert.match(why('javascript:alert(1)'), /Можно только паки из библиотеки SIGame/);
    assert.match(why('https://vladimirkhil.com/si/storage'), /нет номера пака/);
  });
});

// ------------------------------------------------------------------ fetchPack против заглушки сети

const bytesStream = (chunks: Uint8Array[], fail = false): ReadableStream<Uint8Array> => {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < chunks.length) c.enqueue(chunks[i++]);
      else if (fail) c.error(new Error('обрыв'));
      else c.close();
    },
  });
};
const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function stubDeps(script: Array<(url: string, init: RequestInit) => Response | Promise<Response>>) {
  const calls: Array<{ url: string; init: RequestInit }> = [], slept: number[] = [];
  let tickets = 0, n = 0;
  const deps: UploadDeps = {
    ticket: async () => ({ ticket: `t${++tickets}`, exp: 1, left: 5 }),
    fetch: async (url, init) => { calls.push({ url, init }); const step = script[Math.min(n++, script.length - 1)]; return step(url, init); },
    sleep: async (ms) => { slept.push(ms); },
  };
  return { deps, calls, slept, tickets: () => tickets };
}

describe('fetchPack: POST /quiz/fetch с билетом', () => {
  const URL_OK = 'https://vladimirkhil.com/si/storage/?id=0b6a0a7e-3c1e-4d0f-9c63-8b2f6d1f2a11';

  it('билет → POST с ссылкой в теле → байты кусками; полоска растёт, результат — те же байты', async () => {
    const a = Uint8Array.from({ length: 1000 }, (_, i) => i % 251), b = Uint8Array.from({ length: 500 }, (_, i) => (i * 3) % 251);
    const s = stubDeps([() => new Response(bytesStream([a, b]), { headers: { 'content-type': 'application/octet-stream' } })]);
    const seen: FetchProgress[] = [];
    const blob = await fetchPack(URL_OK, s.deps, (p) => seen.push(p));
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), new Uint8Array([...a, ...b]));
    assert.equal(s.calls.length, 1);
    assert.equal(s.calls[0].url, '/quiz/fetch');
    assert.equal(s.calls[0].init.method, 'POST');
    const h = s.calls[0].init.headers as Record<string, string>;
    assert.equal(h[QZ_TICKET_HEADER], 't1');
    assert.equal(h['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(String(s.calls[0].init.body)), { url: URL_OK });
    assert.equal(seen[0].phase, 'ticket');
    assert.deepEqual(seen.map((p) => p.got).filter((g, i, all) => g > 0 && all.indexOf(g) === i), [1000, 1500]);
  });

  it('билет истёк (401): новый билет и заново; три раза подряд — «нажми «Скачать» ещё раз»', async () => {
    const ok = () => new Response(bytesStream([Uint8Array.of(1, 2, 3)]));
    const s = stubDeps([() => json(401, { ok: false, error: 'Билет истёк — получи новый.' }), ok]);
    assert.equal((await fetchPack(URL_OK, s.deps)).size, 3);
    assert.equal(s.tickets(), 2);
    assert.equal((s.calls[1].init.headers as Record<string, string>)[QZ_TICKET_HEADER], 't2');
    const never = stubDeps([() => json(401, { ok: false })]);
    await assert.rejects(fetchPack(URL_OK, never.deps), (e: unknown) => e instanceof UploadError && e.code === 'ticket' && /нажми «Скачать» ещё раз/.test(e.message));
    assert.equal(never.tickets(), 3);
  });

  it('429: ждём по Retry-After и повторяем с тем же билетом', async () => {
    const s = stubDeps([() => json(429, { ok: false, error: 'Не так быстро — попробуй через минуту.' }, { 'retry-after': '7' }), () => new Response(bytesStream([Uint8Array.of(9)]))]);
    const seen: number[] = [];
    assert.equal((await fetchPack(URL_OK, s.deps, (p) => seen.push(p.wait))).size, 1);
    assert.deepEqual(s.slept, [7000]);
    assert.ok(seen.includes(7) && seen.at(-1) === 0, 'строка «просит подождать» появляется и уходит');
    assert.equal(s.tickets(), 1);
  });

  it('отказы сервера — его строка для игрока; нет связи, обрыв и пустой ответ — свои', async () => {
    for (const [status, error] of [[400, 'Можно только паки из библиотеки SIGame'], [413, 'Пак больше 100 МБ'], [502, 'Библиотека не отдала пак'], [504, 'Библиотека не ответила — попробуй ещё раз']] as const) {
      const s = stubDeps([() => json(status, { ok: false, error })]);
      await assert.rejects(fetchPack(URL_OK, s.deps), (e: unknown) => e instanceof UploadError && e.message === error && e.status === status, String(status));
    }
    // сервер ответил 200, но JSON или страницей — это тоже отказ, а не пак
    await assert.rejects(fetchPack(URL_OK, stubDeps([() => json(200, { ok: false, error: 'Паки пока недоступны.' })]).deps), /Паки пока недоступны/);
    await assert.rejects(fetchPack(URL_OK, stubDeps([() => json(500, 'не json')]).deps), /Сервер отказал \(500\)/);
    await assert.rejects(fetchPack(URL_OK, stubDeps([() => { throw new Error('offline'); }]).deps), (e: unknown) => e instanceof UploadError && e.code === 'net' && /Нет связи/.test(e.message));
    await assert.rejects(fetchPack(URL_OK, stubDeps([() => new Response(bytesStream([Uint8Array.of(1)], true))]).deps), (e: unknown) => e instanceof UploadError && e.code === 'net' && /Связь оборвалась/.test(e.message));
    await assert.rejects(fetchPack(URL_OK, stubDeps([() => new Response(bytesStream([]))]).deps), /Библиотека не отдала пак/);
  });
});

// ------------------------------------------------------------------ вся цепочка F5 против настоящего QuizHttp

function zip(files: Array<[string, Uint8Array | string]>): Uint8Array<ArrayBuffer> {
  const parts: Buffer[] = [], central: Buffer[] = [];
  let off = 0;
  for (const [name, data] of files) {
    const raw = Buffer.from(data), nm = Buffer.from(name), comp = zlib.deflateRawSync(raw);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nm.length, 26);
    parts.push(h, nm, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, nm);
    off += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, e]));
}
const q = (price: number, text: string, answer: string): string => `<question price="${price}"><scenario><atom>${text}</atom></scenario><right><answer>${answer}</answer></right></question>`;
const theme = (name: string): string => `<theme name="${name}"><questions>${q(100, 'Раз?', 'Один')}${q(200, 'Два?', 'Два')}${q(300, 'Три?', 'Три')}</questions></theme>`;
const content = (title: string): string => `<?xml version="1.0" encoding="utf-8"?><package name="${title}" version="4" xmlns="http://vladimirkhil.com/ygpackage3.0.xsd">
<info><authors><author>Оля</author></authors></info><rounds><round name="Раунд 1"><themes>${theme('Рыбы')}${theme('Море')}${theme('Еда')}</themes></round></rounds></package>`;
const media: MediaTools = { async image() { return null; }, async audio() { return null; } };

async function serverSetup(t: TestContext, library: typeof fetch) {
  const packs = new QuizPacks({ dataDir: mkdtempSync(path.join(tmpdir(), 'quiz-11-window-')), now: () => Date.parse('2026-10-31T12:00:00Z') });
  const http = new QuizHttp({ packs, now: () => Date.parse('2026-10-31T12:00:00Z'), log: () => {}, fetch: library });
  const server = createServer((req, res) => { if (!http.handle(req, res, new URL(req.url ?? '/', 'http://local').pathname)) res.writeHead(404).end(); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => { http.close(); packs.close(); server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))); });
  const deps = (pid: number): UploadDeps => ({ ticket: async () => http.ticket(pid, 5, 'Tired'), fetch: (url, init) => fetch(base + url, init), sleep: async () => {} });
  return { packs, http, deps };
}

describe('пак по ссылке: скачать → разобрать → сохранить (настоящий QuizHttp, библиотека — заглушка)', () => {
  const GUID = '0b6a0a7e-3c1e-4d0f-9c63-8b2f6d1f2a11';
  const siq = zip([['content.xml', content('Кино 90-х')]]);
  const library: typeof fetch = async (input) => {
    const url = String(input);
    if (url === `${QZ_PACK.FETCH_API}${GUID}`) return json(200, { directContentUri: 'https://vladimirkhil.com/files/pack.siq' });
    if (url === 'https://vladimirkhil.com/files/pack.siq') return new Response(siq);
    return new Response('нет', { status: 404 });
  };

  it('ссылка с номером пака: те же байты, что отдала библиотека; дальше разбор и сохранение, как у файла', async (t) => {
    const g = await serverSetup(t, library);
    const link = sigameLink(`https://vladimirkhil.com/si/storage/?id=${GUID}`);
    assert.ok(link.ok);
    const blob = await fetchPack(link.url, g.deps(5));
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), siq);
    const parsed = await parseSiq(blob, { media });
    assert.equal(parsed.pack.title, 'Кино 90-х');
    const saved = await uploadPack({ pack: parsed.pack, files: parsed.files, blobs: parsed.blobs }, g.deps(5));
    assert.equal(saved.title, 'Кино 90-х');
    assert.equal(g.packs.list(5).list.some((p) => p.id === saved.id && p.kind === 'jeopardy'), true);
  });

  it('прямая ссылка на .siq работает; чужой сайт и «не пак» — строка сервера для игрока', async (t) => {
    const g = await serverSetup(t, library);
    const direct = await fetchPack('https://vladimirkhil.com/files/pack.siq', g.deps(6));
    assert.equal(direct.size, siq.length);
    // клиент отказал бы раньше; здесь проверяем, что и сервер отвечает по-человечески
    await assert.rejects(fetchPack('https://example.com/pack.siq', g.deps(6)), /Можно только паки из библиотеки SIGame/);
    await assert.rejects(fetchPack('https://vladimirkhil.com/files/other.siq', g.deps(6)), (e: unknown) => e instanceof UploadError && e.status === 502 && /Библиотека не отдала пак/.test(e.message));
    await assert.rejects(fetchPack('https://vladimirkhil.com/si/storage', g.deps(6)), /Нужна ссылка на пак из библиотеки SIGame/);
  });

  it('файл не из SIGame: скачался, но не открывается — это уже отказ разбора с понятной строкой', async (t) => {
    const junk: typeof fetch = async () => new Response(Uint8Array.from({ length: 200 }, (_, i) => i));
    const g = await serverSetup(t, junk);
    const blob = await fetchPack('https://vladimirkhil.com/files/pack.siq', g.deps(7));
    await assert.rejects(parseSiq(blob, { media }), /Это не пак SIGame/);
  });
});
