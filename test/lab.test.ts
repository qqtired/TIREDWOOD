// Лаборатория /lab: правила решений, хранилище lab.json и HTTP-маршруты. Только временные папки; ключ из lab-key
// читается лишь для запросов и нигде не печатается.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import {
  LAB_ID_MAX, LAB_KEY_HEADER, LAB_LOG_MAX, LAB_MAX_DECISIONS, LAB_NOTE_MAX, LAB_STATUSES, LAB_TITLE_MAX,
  cleanNote, cleanTitle, isLabId, isLabStatus, normalizeLabFile,
} from '../shared/lab.ts';
import { LabHttp, labEnabled } from '../server/lab/http.ts';
import { LabError, LabStore } from '../server/lab/store.ts';

const dirs: string[] = [];
const servers: http.Server[] = [];
after(() => {
  for (const s of servers) s.close();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const tmp = (): string => {
  const d = mkdtempSync(path.join(tmpdir(), 'opus-lab-'));
  dirs.push(d);
  return d;
};

// ---------------------------------------------------------------- правила

test('lab: id, статусы и флаг', () => {
  for (const ok of ['hot-melon', 'a', 'conga-train-2', 'x'.repeat(LAB_ID_MAX)]) assert.ok(isLabId(ok), ok);
  for (const bad of ['', 'Hot', 'hot_melon', '-a', 'a-', 'a--b', 'a/b', '../x', 'a b', 'я', 'x'.repeat(LAB_ID_MAX + 1), 7, null]) {
    assert.ok(!isLabId(bad), String(bad));
  }
  for (const s of LAB_STATUSES) assert.ok(isLabStatus(s));
  assert.ok(!isLabStatus('Take') && !isLabStatus('') && !isLabStatus(undefined));
  assert.equal(labEnabled(undefined, true), true);
  assert.equal(labEnabled(undefined, false), false);
  assert.equal(labEnabled('1', false), true);
  assert.equal(labEnabled('0', true), false);
  assert.equal(labEnabled('yes', true), false, 'иное значение не включает');
});

test('lab: заметка очищается, абзацы остаются, длина режется по символам', () => {
  assert.equal(cleanNote('  Берём.\r\n\r\n\r\n\r\nТаймер   8–15 с.  '), 'Берём.\n\nТаймер 8–15 с.');
  assert.equal(cleanNote('а\u0000б‮в​г\u0007д'), 'абвгд');
  assert.equal(cleanNote(42), '');
  assert.equal(cleanNote('😀'.repeat(LAB_NOTE_MAX + 50)), '😀'.repeat(LAB_NOTE_MAX), 'эмодзи не ломается пополам');
  assert.equal(cleanTitle('  Горячий \n арбуз  '), 'Горячий арбуз');
  assert.equal(Array.from(cleanTitle('я'.repeat(LAB_TITLE_MAX + 10))).length, LAB_TITLE_MAX);
});

test('lab: файл после ручных правок читается терпимо', () => {
  const now = '2026-10-03T10:00:00.000Z';
  assert.deepEqual(normalizeLabFile('мусор', now).decisions, {});
  assert.deepEqual(normalizeLabFile(null, now).log, []);
  const f = normalizeLabFile({
    updatedAt: 'не дата',
    decisions: {
      'hot-melon': { title: 'Горячий арбуз', status: 'take', note: ' ok ', at: '2026-10-01T00:00:00.000Z' },
      'bad status': { status: 'take' },
      'strange': { status: 'maybe' },
      'no-title': { status: 'skip' },
      'not-object': 5,
    },
    log: [{ id: 'hot-melon', from: null, to: 'take', at: now }, { id: 'Bad', from: null, to: 'take' }, { id: 'a', from: 'x', to: 'take' }, 7],
  }, now);
  assert.equal(f.updatedAt, now);
  assert.deepEqual(Object.keys(f.decisions).sort(), ['hot-melon', 'no-title']);
  assert.equal(f.decisions['hot-melon']?.note, 'ok');
  assert.equal(f.decisions['no-title']?.title, 'no-title', 'без названия подставляется id');
  assert.equal(f.log.length, 1);
});

// ---------------------------------------------------------------- хранилище

test('lab: решения записываются, переживают перезапуск, журнал и копия', () => {
  const dir = tmp();
  let n = 0;
  const clock = (): Date => new Date(Date.UTC(2026, 9, 3, 12, 0, n++));
  const s = new LabStore(dir, clock);
  s.load();
  assert.equal(s.size, 0);
  const a = s.set('hot-melon', { status: 'take', note: 'Берём', title: 'Горячий арбуз' });
  assert.equal(a.status, 'take');
  assert.ok(existsSync(path.join(dir, 'lab.json')));
  assert.ok(!existsSync(path.join(dir, 'lab.prev.json')), 'копии нет, пока писать первый раз');
  s.set('hot-melon', { status: 'rework', note: 'Короче фитиль', title: 'Горячий арбуз' });
  assert.ok(existsSync(path.join(dir, 'lab.prev.json')), 'прежний файл лежит рядом');

  const again = new LabStore(dir, clock);
  again.load();
  assert.equal(again.get('hot-melon')?.status, 'rework');
  assert.equal(again.get('hot-melon')?.note, 'Короче фитиль');
  const file = JSON.parse(readFileSync(path.join(dir, 'lab.json'), 'utf8'));
  assert.equal(file.version, 1);
  assert.deepEqual(file.log.map((e: { from: string | null; to: string }) => [e.from, e.to]), [[null, 'take'], ['take', 'rework']]);

  const before = readFileSync(path.join(dir, 'lab.json'), 'utf8');
  again.set('hot-melon', { status: 'rework', note: 'Короче фитиль', title: 'Горячий арбуз' });
  assert.equal(readFileSync(path.join(dir, 'lab.json'), 'utf8'), before, 'повтор без изменений файл не трогает');

  assert.equal(again.clear('hot-melon'), true);
  assert.equal(again.clear('hot-melon'), false);
  assert.equal(again.get('hot-melon'), undefined);
  const last = JSON.parse(readFileSync(path.join(dir, 'lab.json'), 'utf8')).log.at(-1);
  assert.equal(last.to, 'reset');
});

test('lab: журнал и число решений ограничены', () => {
  const dir = tmp();
  const at = '2026-10-03T12:00:00.000Z';
  // файл, набитый до отказа, пишем сразу: двести записей через fsync тянулись бы секунды
  const decisions: Record<string, unknown> = {};
  for (let i = 0; i < LAB_MAX_DECISIONS + 25; i++) decisions[`idea-${i}`] = { title: `Идея ${i}`, status: 'idea', note: '', at };
  const log = Array.from({ length: LAB_LOG_MAX + 25 }, (_, i) => ({ id: `idea-${i % 50}`, from: null, to: 'idea', at }));
  writeFileSync(path.join(dir, 'lab.json'), JSON.stringify({ version: 1, updatedAt: at, decisions, log }));
  const s = new LabStore(dir);
  s.load();
  assert.equal(s.size, LAB_MAX_DECISIONS, 'лишнее из файла отброшено');
  assert.throws(() => s.set('one-more', { status: 'idea', note: '', title: '' }), (e: unknown) => e instanceof LabError && e.status === 409);
  s.set('idea-0', { status: 'take', note: '', title: '' }); // уже существующее менять можно
  const saved = JSON.parse(readFileSync(path.join(dir, 'lab.json'), 'utf8'));
  assert.equal(saved.log.length, LAB_LOG_MAX, 'журнал держит последние записи');
  assert.equal(saved.log.at(-1).id, 'idea-0');
});

test('lab: повреждённый lab.json откладывается, берётся lab.prev.json', () => {
  const dir = tmp();
  const s = new LabStore(dir);
  s.load();
  s.set('a-1', { status: 'take', note: 'первое', title: 'A' });
  s.set('a-1', { status: 'skip', note: 'второе', title: 'A' });
  writeFileSync(path.join(dir, 'lab.json'), '{"version":1, "decisions": {', 'utf8');
  const warn = console.warn;
  console.warn = () => {};
  try {
    const r = new LabStore(dir);
    r.load();
    assert.equal(r.get('a-1')?.note, 'первое', 'взято из копии');
  } finally {
    console.warn = warn;
  }
  assert.ok(!existsSync(path.join(dir, 'lab.json')), 'испорченный файл убран с дороги');
  const aside = readdirSync(dir).filter((f) => f.startsWith('lab.json.corrupt-'));
  assert.equal(aside.length, 1, 'испорченный файл лежит рядом');

  const dir2 = tmp();
  writeFileSync(path.join(dir2, 'lab.json'), 'не json', 'utf8');
  const empty = new LabStore(dir2);
  empty.load();
  assert.equal(empty.size, 0, 'нет копии — начинаем с пустого');
});


// ---------------------------------------------------------------- HTTP

interface Rig {
  base: string;
  dir: string;
  key: () => string;
  lab: LabHttp;
  clock: { t: number };
}

async function start(opts: { enabled?: boolean; ip?: string } = {}): Promise<Rig> {
  const dir = tmp();
  const clock = { t: Date.UTC(2026, 9, 3, 12) };
  const lab = new LabHttp({ enabled: opts.enabled ?? true, dir, ip: () => opts.ip ?? '203.0.113.7', now: () => clock.t });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://local');
    if (!lab.handle(req, res, url.pathname)) res.writeHead(200, { 'content-type': 'text/plain' }).end('page');
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return { base: `http://127.0.0.1:${port}`, dir, key: () => readFileSync(path.join(dir, 'lab-key'), 'utf8').trim(), lab, clock };
}

interface Reply {
  status: number;
  json: Record<string, any>;
  headers: Headers;
  text: string;
}

async function call(rig: Rig, method: string, p: string, o: { key?: string; body?: unknown; raw?: string } = {}): Promise<Reply> {
  const headers: Record<string, string> = {};
  if (o.key !== undefined) headers[LAB_KEY_HEADER] = o.key;
  let body: string | undefined;
  if (o.raw !== undefined) body = o.raw;
  else if (o.body !== undefined) body = JSON.stringify(o.body);
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(rig.base + p, { method, headers, body, redirect: 'manual' });
  const text = await res.text();
  let json: Record<string, any> = {};
  try {
    json = JSON.parse(text);
  } catch {
    // не JSON — это страница или текст
  }
  return { status: res.status, json, headers: res.headers, text };
}

test('lab: выключенный флаг закрывает /lab и /lab/api, ключ не создаётся', async () => {
  const rig = await start({ enabled: false });
  for (const p of ['/lab', '/lab/', '/lab/api/state', '/lab/anything']) {
    const r = await call(rig, 'GET', p);
    assert.equal(r.status, 404, p);
  }
  assert.equal((await call(rig, 'PUT', '/lab/api/decisions/a-1', { key: 'x'.repeat(64), body: { status: 'take' } })).status, 404);
  assert.equal((await call(rig, 'GET', '/')).text, 'page', 'остальные адреса не затронуты');
  assert.ok(!existsSync(path.join(rig.dir, 'lab-key')) && !existsSync(path.join(rig.dir, 'lab.json')));
});

test('lab: включённый флаг — ключ 0600, страница и чужие адреса не затронуты', async () => {
  const rig = await start();
  const st = statSync(path.join(rig.dir, 'lab-key'));
  assert.equal(st.mode & 0o777, 0o600);
  assert.match(rig.key(), /^[0-9a-f]{64}$/);
  const redirect = await call(rig, 'GET', '/lab');
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), '/lab/');
  assert.equal((await call(rig, 'GET', '/lab/')).text, 'page', 'страницу отдаёт не этот модуль');
  assert.equal((await call(rig, 'GET', '/lab/index.html')).text, 'page');
  assert.equal((await call(rig, 'GET', '/labs')).text, 'page');
  assert.equal((await call(rig, 'GET', '/lab/api/nothing')).status, 404);
});

test('lab: чтение открыто всем, владелец узнаётся по ключу в заголовке', async () => {
  const rig = await start();
  const key = rig.key();
  const guest = await call(rig, 'GET', '/lab/api/state');
  assert.equal(guest.status, 200);
  assert.equal(guest.json.ok, true);
  assert.equal(guest.json.owner, false);
  assert.deepEqual(guest.json.decisions, {});
  assert.equal(guest.headers.get('cache-control'), 'no-store');
  assert.match(guest.headers.get('content-type') ?? '', /application\/json/);
  assert.equal((await call(rig, 'GET', '/lab/api/state', { key: 'wrong-key' })).json.owner, false, 'неверный ключ при чтении — просто не владелец');
  assert.equal((await call(rig, 'GET', '/lab/api/state', { key })).json.owner, true);
  // ключ в адресе ничего не значит
  assert.equal((await call(rig, 'GET', `/lab/api/state?key=${key}`)).json.owner, false);
  assert.equal((await call(rig, 'POST', '/lab/api/state')).status, 405);
  assert.equal((await call(rig, 'OPTIONS', '/lab/api/state')).status, 405);
});

test('lab: решения меняет только владелец; заметка не стирается кликом по статусу', async () => {
  const rig = await start();
  const key = rig.key();
  const put = (id: string, body: unknown, k: string | null = key): Promise<Reply> =>
    call(rig, 'PUT', `/lab/api/decisions/${id}`, k === null ? { body } : { key: k, body });

  assert.equal((await put('hot-melon', { status: 'take' }, null)).status, 401, 'без ключа');
  assert.equal((await put('hot-melon', { status: 'take' }, 'a'.repeat(64))).status, 401, 'с чужим ключом');
  assert.equal((await call(rig, 'GET', '/lab/api/state')).json.decisions['hot-melon'], undefined);

  const ok = await put('hot-melon', { status: 'testing', note: '  Хочу таймер короче  ', title: 'Горячий арбуз' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.decision.status, 'testing');
  assert.equal(ok.json.decision.note, 'Хочу таймер короче');
  assert.equal(ok.json.decision.title, 'Горячий арбуз');

  const clickOnly = await put('hot-melon', { status: 'take' });
  assert.equal(clickOnly.json.decision.status, 'take');
  assert.equal(clickOnly.json.decision.note, 'Хочу таймер короче', 'заметка осталась');
  assert.equal(clickOnly.json.decision.title, 'Горячий арбуз');

  const cleared = await put('hot-melon', { status: 'take', note: '' });
  assert.equal(cleared.json.decision.note, '', 'пустая заметка стирает');

  const state = await call(rig, 'GET', '/lab/api/state');
  assert.equal(state.json.decisions['hot-melon'].status, 'take');
  const file = JSON.parse(readFileSync(path.join(rig.dir, 'lab.json'), 'utf8'));
  assert.equal(file.decisions['hot-melon'].status, 'take', 'решение лежит в lab.json');
  assert.ok(!JSON.stringify(state.json).includes(key) && !JSON.stringify(file).includes(key), 'ключа нигде нет');

  const del = await call(rig, 'DELETE', '/lab/api/decisions/hot-melon', { key });
  assert.equal(del.status, 200);
  assert.equal(del.json.removed, true);
  assert.equal((await call(rig, 'DELETE', '/lab/api/decisions/hot-melon', { key })).json.removed, false);
  assert.equal((await call(rig, 'DELETE', '/lab/api/decisions/hot-melon')).status, 401);
  assert.deepEqual((await call(rig, 'GET', '/lab/api/state')).json.decisions, {});
});

test('lab: плохие запросы отклоняются понятно', async () => {
  const rig = await start();
  const key = rig.key();
  const put = (p: string, o: { body?: unknown; raw?: string }): Promise<Reply> => call(rig, 'PUT', p, { key, ...o });
  assert.equal((await put('/lab/api/decisions/Bad_Id', { body: { status: 'take' } })).status, 400);
  assert.equal((await put(`/lab/api/decisions/${'x'.repeat(LAB_ID_MAX + 1)}`, { body: { status: 'take' } })).status, 400);
  assert.equal((await put('/lab/api/decisions/a-1', { body: { status: 'maybe' } })).status, 400);
  assert.equal((await put('/lab/api/decisions/a-1', { body: { note: 'без статуса' } })).status, 400);
  assert.equal((await put('/lab/api/decisions/a-1', { body: { status: 'take', note: 5 } })).status, 400);
  assert.equal((await put('/lab/api/decisions/a-1', { body: { status: 'take', title: [] } })).status, 400);
  assert.equal((await put('/lab/api/decisions/a-1', { body: [1] })).status, 400);
  assert.equal((await put('/lab/api/decisions/a-1', { raw: '{"status":' })).status, 400);
  assert.equal((await put('/lab/api/decisions/a-1', { raw: JSON.stringify({ status: 'take', note: 'я'.repeat(5000) }) })).status, 413);
  assert.equal((await call(rig, 'GET', '/lab/api/decisions/a-1', { key })).status, 405);
  assert.equal((await call(rig, 'PUT', '/lab/api/decisions', { key, body: { status: 'take' } })).status, 404);
  assert.equal((await call(rig, 'PUT', '/lab/api/decisions/a-1/extra', { key, body: { status: 'take' } })).status, 404);
  assert.equal((await call(rig, 'GET', '/lab/api/state')).json.decisions['a-1'], undefined, 'ничего не записалось');
  // слишком длинная заметка при нормальном размере тела — обрезается, не ошибка
  const long = await put('/lab/api/decisions/a-1', { body: { status: 'take', note: 'б'.repeat(LAB_NOTE_MAX + 100) } });
  assert.equal(long.status, 200);
  assert.equal(Array.from(long.json.decision.note as string).length, LAB_NOTE_MAX);
});

test('lab: неверный ключ считается, после десяти промахов — 429, окно проходит', async () => {
  const rig = await start();
  const key = rig.key();
  for (let i = 0; i < 10; i++) {
    assert.equal((await call(rig, 'PUT', '/lab/api/decisions/a-1', { key: `wrong-${i}`, body: { status: 'take' } })).status, 401);
  }
  const blocked = await call(rig, 'PUT', '/lab/api/decisions/a-1', { key, body: { status: 'take' } });
  assert.equal(blocked.status, 429, 'даже верный ключ с этого адреса пока не принимается');
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal((await call(rig, 'GET', '/lab/api/state', { key })).json.owner, false);
  assert.equal((await call(rig, 'GET', '/lab/api/state')).status, 200, 'смотреть без ключа можно');

  // другой адрес не страдает
  const other = await start();
  assert.equal((await call(other, 'PUT', '/lab/api/decisions/a-1', { key: other.key(), body: { status: 'take' } })).status, 200);

  rig.clock.t += 11 * 60_000;
  assert.equal((await call(rig, 'PUT', '/lab/api/decisions/a-1', { key, body: { status: 'take' } })).status, 200, 'через десять минут снова можно');
});

test('lab: частота изменений и чтений ограничена', async () => {
  const rig = await start();
  const key = rig.key();
  let last = 0;
  for (let i = 0; i < 31; i++) last = (await call(rig, 'PUT', '/lab/api/decisions/a-1', { key, body: { status: 'take' } })).status;
  assert.equal(last, 429, 'тридцать первое изменение за минуту');
  rig.clock.t += 61_000;
  assert.equal((await call(rig, 'PUT', '/lab/api/decisions/a-1', { key, body: { status: 'skip' } })).status, 200);

  const reader = await start();
  let status = 0;
  for (let i = 0; i < 121; i++) status = (await call(reader, 'GET', '/lab/api/state')).status;
  assert.equal(status, 429, 'сто двадцать первое чтение за минуту');
});

test('lab: смена и удаление файла ключа действуют сразу, без перезапуска', async () => {
  const rig = await start();
  const oldKey = rig.key();
  const keyFile = path.join(rig.dir, 'lab-key');
  const mine = 'k'.repeat(40);
  writeFileSync(keyFile, `${mine}\n`, { mode: 0o600 });
  assert.equal((await call(rig, 'GET', '/lab/api/state', { key: mine })).json.owner, true, 'вписанный вручную ключ подходит');
  assert.equal((await call(rig, 'GET', '/lab/api/state', { key: oldKey })).json.owner, false, 'прежний больше не действует');

  unlinkSync(keyFile);
  const fresh = await call(rig, 'GET', '/lab/api/state', { key: mine });
  assert.equal(fresh.json.owner, false);
  assert.match(rig.key(), /^[0-9a-f]{64}$/, 'файл создан заново');
  assert.equal((await call(rig, 'GET', '/lab/api/state', { key: rig.key() })).json.owner, true);

  writeFileSync(keyFile, 'short\n');
  assert.equal((await call(rig, 'GET', '/lab/api/state', { key: 'short' })).json.owner, false, 'слишком простой ключ не принимается');
  assert.match(rig.key(), /^[0-9a-f]{64}$/, 'вместо него создан новый');
});
