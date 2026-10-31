import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { TG_CALL_FILE, TgCall } from '../server/tgcall.ts';
import { CHAT_FILE, TOKEN_FILE, type TgFetch } from '../server/tgfeed.ts';

const dirs: string[] = [];
after(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
// Только фиктивные настройки во временных папках, настоящие файлы бота не читаются.
const token = '123456:ABC-def_123';
const chat = -1001;
const minute = 60_000;
const week = Date.parse('2026-10-25T21:00:00Z'); // Понедельник 00:00 МСК.
const nextWeek = week + 7 * 24 * 60 * minute;
const call = { pid: 1, online: 1, text: 'Рома на набережной, зовёт на картинг' };
const digest = { weekStart: week, text: 'Итоги недели\n\nКартинг' };
const success = (): Response => new Response('{"ok":true,"result":{"message_id":123}}');

function configure(dir: string): void {
  writeFileSync(path.join(dir, TOKEN_FILE), token);
  writeFileSync(path.join(dir, CHAT_FILE), JSON.stringify({ id: chat }));
}

function fixture(configured = true, fetch: TgFetch = async () => success()) {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-tgcall-'));
  dirs.push(dir);
  if (configured) configure(dir);
  const clock = { now: week + 12 * 60 * minute };
  const logs: string[] = [];
  const requests: { url: string; init: RequestInit }[] = [];
  const options = { dir, now: () => clock.now, log: (s: string) => { logs.push(s); },
    fetch: async (url: string, init: RequestInit) => { requests.push({ url, init }); return fetch(url, init); } };
  return { dir, clock, logs, requests, options, tg: new TgCall(options) };
}

function noSecrets(text: string): void {
  for (const secret of [token, 'ABC-def_123', String(chat), String(Math.abs(chat))]) assert.ok(!text.includes(secret));
}

test('tgcall: sent отправляет одну очищенную строку и не пишет настройки в журнал', async () => {
  const f = fixture();
  assert.equal(await f.tg.call({ ...call, text: ' Рома\nна набережной,\tзовёт на картинг\u202e ' }), 'sent');
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  assert.equal(url, `https://api.telegram.org/bot${token}/sendMessage`);
  assert.equal(init.method, 'POST');
  assert.deepEqual(init.headers, { 'content-type': 'application/json' });
  assert.equal(init.signal?.aborted, false);
  assert.deepEqual(JSON.parse(String(init.body)), { chat_id: chat, text: call.text, link_preview_options: { is_disabled: true } });
  noSecrets(f.logs.join('\n'));
  assert.equal(existsSync(path.join(f.dir, TG_CALL_FILE)), false, 'лимиты call остаются только в памяти');
});

test('tgcall: enough проверяется до настроек, unconfigured не занимает слот и предшествует паузам', async () => {
  const f = fixture(false);
  assert.equal(await f.tg.call({ ...call, online: 3 }), 'enough');
  assert.equal(await f.tg.call(call), 'unconfigured');
  writeFileSync(path.join(f.dir, TOKEN_FILE), token);
  assert.equal(await f.tg.call(call), 'unconfigured');
  writeFileSync(path.join(f.dir, CHAT_FILE), '{bad');
  assert.equal(await f.tg.call(call), 'unconfigured');
  assert.equal(f.requests.length, 0);
  configure(f.dir);
  assert.equal(await f.tg.call(call), 'sent');
  writeFileSync(path.join(f.dir, TOKEN_FILE), 'invalid');
  assert.equal(await f.tg.call(call), 'unconfigured');
  assert.equal(await f.tg.call({ ...call, online: 3 }), 'enough');
  configure(f.dir);
  assert.equal(await f.tg.call(call), 'player-gap');
  assert.equal(f.requests.length, 1);
  noSecrets(f.logs.join('\n'));
});

test('tgcall: игрок ждёт 10 минут, группа 5; перезапуск забывает лимиты call', async () => {
  const f = fixture();
  const start = f.clock.now;
  assert.equal(await f.tg.call(call), 'sent');
  f.clock.now = start + 4 * minute;
  assert.equal(await f.tg.call({ ...call, pid: 2 }), 'global-gap');
  f.clock.now = start + 9 * minute;
  assert.equal(await f.tg.call(call), 'player-gap');
  f.clock.now = start + 11 * minute;
  assert.equal(await f.tg.call(call), 'sent');
  assert.equal(f.requests.length, 2);
  assert.equal(await new TgCall(f.options).call(call), 'sent');
});

test('tgcall: 13-й зов за московский день запрещён; digest не расходует эти лимиты', async () => {
  const f = fixture();
  for (let pid = 1; pid <= 12; pid++) {
    assert.equal(await f.tg.call({ ...call, pid }), 'sent');
    f.clock.now += 5 * minute;
  }
  assert.equal(await f.tg.call({ ...call, pid: 13 }), 'day-limit');
  assert.equal(await f.tg.digest(digest), 'sent', 'дневной лимит call не мешает дайджесту');
  assert.equal(await f.tg.call({ ...call, pid: 13 }), 'day-limit');
  f.clock.now = week + 24 * 60 * minute; // Ещё 21:00 UTC того же дня, но в Москве уже следующий.
  assert.equal(await f.tg.call({ ...call, pid: 13 }), 'sent');
  assert.equal(f.requests.length, 14);
});

test('tgcall: пауза сохраняется через московскую полночь', async () => {
  const f = fixture();
  f.clock.now = week + 24 * 60 * minute - minute;
  assert.equal(await f.tg.call(call), 'sent');
  f.clock.now += 2 * minute;
  assert.equal(await f.tg.call(call), 'player-gap');
  assert.equal(await f.tg.call({ ...call, pid: 2 }), 'global-gap');
});

test('tgcall: параллельные вызовы не обходят слот, connect:true освобождает его сразу', async () => {
  let reject!: (error: Error) => void;
  let attempts = 0;
  const f = fixture(true, async () => ++attempts === 1 ? new Promise<Response>((_resolve, no) => { reject = no; }) : success());
  const pending = f.tg.call(call);
  assert.deepEqual(await Promise.all([f.tg.call(call), f.tg.call({ ...call, pid: 2 })]), ['player-gap', 'global-gap']);
  assert.equal(f.requests.length, 1);
  reject(Object.assign(new Error(`offline ${token} ${chat}`), { connect: true }));
  assert.equal(await pending, 'failed');
  assert.equal(await f.tg.call(call), 'sent');
  assert.equal(f.requests.length, 2);
  noSecrets(f.logs.join('\n'));
});

test('tgcall: только HTTP 4xx ok:false — failed; остальные неясные ответы занимают слот', async () => {
  const rejection = JSON.stringify({ ok: false, description: `https://api.telegram.org/bot${token}/sendMessage ${chat}` });
  const cases: { fetch: TgFetch; status: 'failed' | 'uncertain' }[] = [
    { fetch: async () => new Response(rejection, { status: 403 }), status: 'failed' },
    { fetch: async () => new Response(rejection, { status: 500 }), status: 'uncertain' },
    { fetch: async () => new Response('{"ok":true,"result":{"message_id":"123"}}'), status: 'uncertain' },
    { fetch: async () => new Response('{"ok":true,"result":{"message_id":123}}', { status: 400 }), status: 'uncertain' },
    { fetch: async () => new Response(`not json ${token} ${chat}`), status: 'uncertain' },
    { fetch: async () => { throw new Error(`reset after TLS ${token} ${chat}`); }, status: 'uncertain' },
  ];
  for (const c of cases) {
    let attempts = 0;
    const f = fixture(true, async (url, init) => ++attempts === 1 ? c.fetch(url, init) : success());
    assert.equal(await f.tg.call(call), c.status);
    assert.equal(await f.tg.call(call), c.status === 'failed' ? 'sent' : 'player-gap');
    assert.equal(f.requests.length, c.status === 'failed' ? 2 : 1);
    noSecrets(f.logs.join('\n'));
  }
});

test('tgcall: зависший транспорт обрывается через 20 секунд, повтор не отправляется', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(true, async () => new Promise<Response>(() => {}));
  const pending = f.tg.call(call);
  t.mock.timers.tick(20_000);
  assert.equal(await pending, 'uncertain');
  assert.equal(f.requests[0].init.signal?.aborted, true);
  assert.equal(await f.tg.call(call), 'player-gap');
  assert.equal(f.requests.length, 1);
});

test('tgcall: длина строк ограничена, дайджест сохраняет переводы строк, секреты вычищаются', async () => {
  const f = fixture();
  const prefix = `${token} ABC-def_123 ${chat} ${Math.abs(chat)}`;
  assert.equal(await f.tg.call({ ...call, text: `${prefix}\n${'а'.repeat(400)}` }), 'sent');
  assert.equal(await f.tg.digest({ ...digest, text: `${prefix}\r\n\r\nИтоги\tнедели\u202e\r${'б'.repeat(1400)}` }), 'sent');
  const callText = JSON.parse(String(f.requests[0].init.body)).text as string;
  const digestText = JSON.parse(String(f.requests[1].init.body)).text as string;
  assert.equal(callText.length, 300);
  assert.ok(!callText.includes('\n'));
  assert.equal(digestText.length, 1200);
  assert.ok(digestText.includes('\n\nИтоги недели\n'));
  assert.ok(!digestText.includes('\r'));
  noSecrets(callText + digestText + f.logs.join('\n') + readFileSync(path.join(f.dir, TG_CALL_FILE), 'utf8'));
});

test('tgcall digest: sent сохраняется с правами 0600, повтор и перезапуск не дублируют; новая неделя разрешена', async () => {
  const f = fixture();
  assert.equal(f.tg.digestDue(week), true);
  assert.equal(await f.tg.digest(digest), 'sent');
  const file = path.join(f.dir, TG_CALL_FILE);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { digestWeek: week, tries: 1, status: 'sent', at: f.clock.now });
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(existsSync(`${file}.tmp`), false);
  assert.equal(f.tg.digestDue(week), false);
  assert.equal(await f.tg.digest(digest), 'already-sent');
  const restarted = new TgCall(f.options);
  assert.equal(restarted.digestDue(week), false);
  assert.equal(await restarted.digest(digest), 'already-sent');
  assert.equal(f.requests.length, 1);
  assert.equal(restarted.digestDue(nextWeek), true);
  assert.equal(await restarted.digest({ ...digest, weekStart: nextWeek }), 'sent');
  assert.equal(f.requests.length, 2);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).tries, 1);
});

test('tgcall digest: unconfigured не расходует попытку; failed ждёт 10 минут, максимум 3 попытки', async () => {
  const f = fixture(false, async () => { throw Object.assign(new Error(`offline ${token} ${chat}`), { connect: true }); });
  assert.equal(await f.tg.digest(digest), 'unconfigured');
  assert.equal(f.tg.digestDue(week), true);
  assert.equal(existsSync(path.join(f.dir, TG_CALL_FILE)), false);
  configure(f.dir);
  let tg = f.tg;
  for (let attempt = 1; attempt <= 3; attempt++) {
    assert.equal(tg.digestDue(week), true);
    assert.equal(await tg.digest(digest), 'failed');
    assert.equal(tg.digestDue(week), false);
    assert.equal(await tg.digest(digest), 'failed', 'во время паузы возвращается прежний отказ');
    tg = new TgCall(f.options);
    assert.equal(tg.digestDue(week), false, 'отказ и пауза переживают перезапуск');
    f.clock.now += 10 * minute - 1;
    assert.equal(tg.digestDue(week), false);
    f.clock.now++;
  }
  assert.equal(tg.digestDue(week), false);
  f.clock.now += 30 * 24 * 60 * minute;
  assert.equal(tg.digestDue(week), false);
  assert.equal(await tg.digest(digest), 'failed');
  assert.equal(f.requests.length, 3);
  assert.equal(JSON.parse(readFileSync(path.join(f.dir, TG_CALL_FILE), 'utf8')).tries, 3);
  assert.equal(tg.digestDue(nextWeek), true);
  noSecrets(f.logs.join('\n'));
});

test('tgcall digest: отметка до await блокирует параллельный вызов и повтор после обрыва процесса', async () => {
  let resolve!: (response: Response) => void;
  const f = fixture(true, async () => new Promise<Response>((yes) => { resolve = yes; }));
  const pending = f.tg.digest(digest);
  assert.equal(f.tg.digestDue(week), false);
  assert.equal(await f.tg.digest(digest), 'uncertain');
  const restarted = new TgCall(f.options);
  assert.equal(restarted.digestDue(week), false);
  assert.equal(await restarted.digest(digest), 'uncertain');
  resolve(new Response('{"ok":false}', { status: 500 }));
  assert.equal(await pending, 'uncertain');
  assert.equal(await new TgCall(f.options).digest(digest), 'uncertain');
  assert.equal(f.requests.length, 1);
  assert.equal(JSON.parse(readFileSync(path.join(f.dir, TG_CALL_FILE), 'utf8')).status, 'uncertain');
});

test('tgcall digest: битая отметка или сбой записи не дают отправить дубль', async () => {
  const broken = fixture();
  writeFileSync(path.join(broken.dir, TG_CALL_FILE), '{bad');
  const tg = new TgCall(broken.options);
  assert.equal(tg.digestDue(week), false);
  assert.equal(await tg.digest(digest), 'uncertain');
  assert.equal(broken.requests.length, 0);

  const before = fixture();
  mkdirSync(path.join(before.dir, `${TG_CALL_FILE}.tmp`));
  assert.equal(await before.tg.digest(digest), 'uncertain');
  assert.equal(before.requests.length, 0);
  assert.equal(before.tg.digestDue(week), false);

  const afterSend = fixture(true, async () => {
    mkdirSync(path.join(afterSend.dir, `${TG_CALL_FILE}.tmp`));
    return success();
  });
  assert.equal(await afterSend.tg.digest(digest), 'uncertain');
  assert.equal(await new TgCall(afterSend.options).digest(digest), 'uncertain');
  assert.equal(afterSend.requests.length, 1);
});
