// Экран с чатом друзей из Telegram (server/tgfeed.ts): строки (имена, ссылки, вложения, команды), выбор чата,
// offset, исправления, рассылка набережной, файл с последними строками, нет токена и плохой токен, паузы при ошибках
// сети — и что токен не попадает ни в журнал, ни в файлы, ни в рассылку.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { PROTOCOL_VERSION } from '../shared/constants.ts';
import { TG_KEEP, type ServerMsg } from '../shared/messages.ts';
import { Hub } from '../server/hub.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { CONFLICT_MS, EMPTY_GAP_MS, FETCH_MS, RECHECK_MS, RETRY_MS, SAVE_MS, SEND_MS, TgFeed, formatLine, scrub, type TgMessage, type Timers } from '../server/tgfeed.ts';
import { fakeSink, newKey } from './kit.ts';

const dirs: string[] = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function tmp(): string {
  const d = mkdtempSync(path.join(tmpdir(), 'opus-tg-'));
  dirs.push(d);
  return d;
}

/** Явно ненастоящие токены */
const TOKEN = '123456:FAKE-token_for-tests-only';
const FRIENDS = { id: -1001, type: 'supergroup', title: 'Друзья' };
const OTHER = { id: -2002, type: 'group', title: 'Чужая группа' };
const PRIVATE = { id: 555, type: 'private', first_name: 'Петя' };
const DATE0 = 1_790_000_000;

/** Таймеры по команде: fire(ms) выполняет все, поставленные на столько мс */
class FakeTimers implements Timers {
  private seq = 0;
  readonly list = new Map<number, { fn: () => void; ms: number }>();
  set(fn: () => void, ms: number): unknown {
    this.list.set(++this.seq, { fn, ms });
    return this.seq;
  }
  clear(h: unknown): void {
    this.list.delete(h as number);
  }
  pending(ms: number): number {
    return [...this.list.values()].filter((t) => t.ms === ms).length;
  }
  fire(ms: number): void {
    for (const [id, t] of [...this.list]) {
      if (t.ms !== ms) continue;
      this.list.delete(id);
      t.fn();
    }
  }
}

type Reply = { status: number; body?: unknown; raw?: string } | Error | 'hang';

/** Поддельный fetch: отвечает по очереди; очередь кончилась — «долгий запрос», который ждёт, пока его оборвут. */
function fakeFetch(replies: Reply[]) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetch = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
    const r = replies.shift() ?? 'hang';
    if (r === 'hang') {
      return new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted', 'AbortError')));
      });
    }
    if (r instanceof Error) throw r;
    return new Response(r.raw ?? JSON.stringify(r.body), { status: r.status });
  };
  return { fetch, calls };
}

function setup(o: { token?: string | null; replies?: Reply[]; dir?: string } = {}) {
  const dir = o.dir ?? tmp();
  if (o.token !== null) writeFileSync(path.join(dir, 'tg-token'), `${o.token ?? TOKEN}\n`);
  const logs: string[] = [];
  const replies = o.replies ?? [];
  const { fetch, calls } = fakeFetch(replies);
  const timers = new FakeTimers();
  const clock = { now: DATE0 * 1000 };
  const feed = new TgFeed({ dir, fetch, timers, log: (s) => logs.push(s), now: () => clock.now });
  const sent: ServerMsg[] = [];
  feed.onSend = (msg) => sent.push(msg);
  return { dir, feed, logs, replies, calls, timers, sent, clock };
}

function m(id: number, fields: Record<string, unknown> = {}, chat: object = FRIENDS): TgMessage {
  return { message_id: id, date: DATE0 + id, chat, from: { id: 7, first_name: 'Петя', last_name: 'Сидоров', username: 'petya_s' }, text: `сообщение ${id}`, ...fields } as TgMessage;
}

let nextUpdate = 1000;
const u = (message: TgMessage) => ({ update_id: nextUpdate++, message });
const ue = (edited: TgMessage) => ({ update_id: nextUpdate++, edited_message: edited });
const ok = (...updates: object[]): Reply => ({ status: 200, body: { ok: true, result: updates } });
const ids = (f: TgFeed) => f.view().lines.map((l) => l.id);
const texts = (f: TgFeed) => f.view().lines.map((l) => l.text);
const ch = (...codes: number[]) => String.fromCodePoint(...codes);
const graphemes = (s: string) => [...new Intl.Segmenter('ru', { granularity: 'grapheme' }).segment(s)].length;
const tick = () => new Promise((r) => setImmediate(r));

async function until(cond: () => boolean, n = 50): Promise<void> {
  for (let i = 0; i < n && !cond(); i++) await tick();
}

test('строки: только имя до 20 знаков, без переводов строк, ссылки — 🔗, длинное — с «…», команды боту — мимо', () => {
  const l = formatLine(m(1, { text: 'Привет!\nКак дела?\tВсё ок   https://example.com/x?y=1 и www.test.ru, а ещё t.me/joinchat/abc' }));
  assert.deepEqual(l, { id: 1, name: 'Петя', text: 'Привет! Как дела? Всё ок 🔗 и 🔗 а ещё 🔗', at: (DATE0 + 1) * 1000 });
  assert.ok(!JSON.stringify(l).includes('Сидоров') && !JSON.stringify(l).includes('petya'), 'ни фамилии, ни ника');

  const long = formatLine(m(2, { from: { first_name: 'Константин-Александр Великолепный', username: 'kostya' } }))!;
  assert.equal(graphemes(long.name), 20);
  assert.ok(long.name.endsWith('…'));
  const family = ch(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
  assert.equal(formatLine(m(3, { from: { first_name: `${family} Семья` } }))!.name, `${family} Семья`, 'эмодзи-семья — один знак, склейка цела');
  assert.equal(formatLine(m(4, { from: undefined }))!.name, 'Кто-то');
  assert.equal(formatLine(m(5, { from: { first_name: 'Group' }, sender_chat: { id: FRIENDS.id, type: 'supergroup', title: 'Друзья' } }))!.name, 'Админ');

  const text300 = formatLine(m(6, { text: 'а'.repeat(300) }))!.text;
  assert.equal(graphemes(text300), 200);
  assert.ok(text300.endsWith('…'));

  for (const t of ['/start', '/roll@game_bot 6', '   /help', '  \n  ']) assert.equal(formatLine(m(7, { text: t })), null, t);

  // невидимое и «переворачивающее» текст — прочь, гора диакритики — не выше трёх знаков
  assert.equal(formatLine(m(8, { text: `при${ch(0x202e)}вет${ch(0x200b)}!${ch(0x2028)}ок${ch(0xfeff)}` }))!.text, 'привет! ок');
  assert.equal(formatLine(m(9, { text: `a${ch(0x301).repeat(30)}` }))!.text, `${ch(0xe1)}${ch(0x301).repeat(3)}`, 'á — один знак после NFC, сверху — не больше трёх');
});

test('строки: ссылки, почта и телефоны по разметке Telegram — значками, @ник — именем (или «@…»), спойлер скрыт', () => {
  const text = 'зайди на google.com, пиши a@b.ru или +7 900 123-45-67, @vasya и @kto, секрет: тайна';
  const ent = (type: string, part: string) => ({ type, offset: text.indexOf(part), length: part.length });
  const entities = [ent('url', 'google.com'), ent('email', 'a@b.ru'), ent('phone_number', '+7 900 123-45-67'), ent('mention', '@vasya'), ent('mention', '@kto'), ent('spoiler', 'тайна'), ent('bold', 'зайди')];
  const names = new Map([['vasya', 'Вася']]);
  assert.equal(formatLine(m(1, { text, entities }), names)!.text, 'зайди на 🔗, пиши ✉️ или 📞, @Вася и @…, секрет: ░░░░░');
  // спойлер со ссылкой внутри — скрыт целиком; упоминание без ника — только имя, без фамилии
  const t2 = 'смотри https://x.ru/a и спроси Иван Петров';
  const e2 = [
    { type: 'spoiler', offset: 0, length: t2.indexOf(' и ') },
    { type: 'url', offset: t2.indexOf('https'), length: 'https://x.ru/a'.length },
    { type: 'text_mention', offset: t2.indexOf('Иван'), length: 'Иван Петров'.length, user: { id: 9, first_name: 'Иван', last_name: 'Петров' } },
  ];
  assert.equal(formatLine(m(2, { text: t2, entities: e2 }))!.text, '░░░░░░░░ и спроси @Иван');
  // подпись к фото размечена так же
  const cap = 'Вот: example.org/photo';
  assert.equal(formatLine(m(3, { text: undefined, photo: [{}], caption: cap, caption_entities: [{ type: 'url', offset: cap.indexOf('example'), length: 'example.org/photo'.length }] }))!.text, '📷 Вот: 🔗');
});

test('вложения: фото, стикер, голосовое, видео, гифка, кружок, файл — значками; место, контакт, опрос — коротко; служебные — мимо', () => {
  const t = (fields: Record<string, unknown>) => formatLine(m(10, { text: undefined, ...fields }))?.text ?? null;
  assert.equal(t({ photo: [{}, {}], caption: 'Закат\nна море' }), '📷 Закат на море');
  assert.equal(t({ photo: [{}] }), '📷 фото');
  assert.equal(t({ sticker: { emoji: '😂' } }), '😂');
  assert.equal(t({ sticker: {} }), '🙂 стикер');
  assert.equal(t({ voice: { duration: 3 } }), '🎤 голосовое');
  assert.equal(t({ audio: {} }), '🎵 аудио');
  assert.equal(t({ video: {}, caption: 'смотри https://youtu.be/x' }), '🎬 смотри 🔗');
  assert.equal(t({ video: {} }), '🎬 видео');
  assert.equal(t({ animation: {}, document: {} }), '🎬 гифка');
  assert.equal(t({ video_note: {} }), '🎬 кружок');
  assert.equal(t({ document: { file_name: 'паспорт.pdf' } }), '📎 файл');
  assert.equal(t({ location: { latitude: 55.75, longitude: 37.61 } }), '📍 геопозиция');
  assert.equal(t({ venue: { title: 'Кафе у дома' }, location: { latitude: 1, longitude: 2 } }), '📍 геопозиция');
  assert.equal(t({ contact: { phone_number: '+79001234567', first_name: 'Мама' } }), '👤 контакт');
  assert.equal(t({ poll: { question: 'Куда идём?' } }), '📊 Куда идём?');
  assert.equal(t({ dice: { emoji: '🎲', value: 5 } }), '🎲 5');
  for (const s of [{ new_chat_members: [{ first_name: 'Новенький' }] }, { left_chat_member: {} }, { pinned_message: {} }, { new_chat_title: 'Новое' }, { group_chat_created: true }, {}]) {
    assert.equal(t(s), null, JSON.stringify(s));
  }
});

test('чат: первая группа — навсегда (tg-chat.json); вторая группа, личка — мимо, и после перезапуска тоже', async () => {
  const s = setup({ replies: [ok(u(m(1)), u(m(2, { text: 'чужое' }, OTHER)), u(m(3, { text: 'в личку' }, PRIVATE)), u(m(4, { text: 'наше' })))] });
  assert.equal(await s.feed.step(), 0);
  assert.deepEqual(ids(s.feed), [1, 4]);
  assert.equal(s.feed.view().title, 'Друзья');
  assert.deepEqual(JSON.parse(readFileSync(path.join(s.dir, 'tg-chat.json'), 'utf8')), { id: FRIENDS.id });
  assert.ok(s.logs.some((l) => l.includes('«Друзья»')));
  s.feed.stop();

  const s2 = setup({ dir: s.dir, replies: [ok(u(m(5, { text: 'снова чужое' }, OTHER)), u(m(6, { text: 'снова наше' })))] });
  assert.deepEqual(ids(s2.feed), [1, 4], 'строки — с прошлого запуска');
  await s2.feed.step();
  assert.deepEqual(ids(s2.feed), [1, 4, 6]);

  // личные сообщения боту чат не выбирают
  const s3 = setup({ replies: [ok(u(m(1, { text: 'привет, бот' }, PRIVATE)))] });
  await s3.feed.step();
  assert.ok(!existsSync(path.join(s3.dir, 'tg-chat.json')));
  assert.deepEqual(s3.feed.view().lines, []);
});

test('группа стала супергруппой: экран следит за новым номером, старые строки — с номерами через минус', async () => {
  const OLD = { id: -300, type: 'group', title: 'Друзья' };
  const NEW = { id: -100300, type: 'supergroup', title: 'Друзья' };
  const s = setup({
    replies: [ok(
      u(m(5, {}, OLD)),
      u(m(6, { text: undefined, migrate_to_chat_id: NEW.id }, OLD)),
      u(m(1, { text: undefined, migrate_from_chat_id: OLD.id }, NEW)),
      u(m(2, { text: 'уже в супергруппе' }, NEW)),
      u(m(7, { text: 'из старой — мимо' }, OLD)),
    )],
  });
  await s.feed.step();
  assert.deepEqual(ids(s.feed), [-5, 2]);
  assert.deepEqual(texts(s.feed), ['сообщение 5', 'уже в супергруппе']);
  assert.deepEqual(JSON.parse(readFileSync(path.join(s.dir, 'tg-chat.json'), 'utf8')), { id: NEW.id });
});

test('offset: первый запрос — без него, дальше — последний update_id + 1; долгий запрос 50 с, только message и edited_message', async () => {
  nextUpdate = 500;
  const s = setup({ replies: [ok(u(m(1)), u(m(2)), u(m(3))), ok(), ok(u(m(4)))] });
  assert.equal(await s.feed.step(), 0, 'новости были — сразу следующий запрос');
  assert.equal(await s.feed.step(), EMPTY_GAP_MS, 'пустой ответ сразу — пауза, вхолостую не крутимся');
  s.clock.now += 50_000;
  await s.feed.step();
  assert.equal(s.calls.length, 3);
  assert.equal(s.calls[0].url, `https://api.telegram.org/bot${TOKEN}/getUpdates`);
  assert.deepEqual(s.calls[0].body, { timeout: 50, allowed_updates: ['message', 'edited_message'] });
  assert.equal(s.calls[1].body.offset, 503);
  assert.equal(s.calls[2].body.offset, 503, 'пустой ответ offset не двигает');
  assert.deepEqual(ids(s.feed), [1, 2, 3, 4]);
  s.feed.stop();

  // перезапуск до следующего запроса: Telegram повторяет последнюю пачку — строки не двоятся и не уходят в конец
  nextUpdate = 503;
  const s2 = setup({ dir: s.dir, replies: [ok(u(m(4)), u(m(5)))] });
  await s2.feed.step();
  assert.deepEqual(ids(s2.feed), [1, 2, 3, 4, 5]);
});

test('исправленное сообщение меняет строку на месте; старое, уже ушедшее с экрана, — мимо; стало командой — строки нет', async () => {
  const s = setup({
    replies: [
      ok(u(m(1)), u(m(2)), u(m(3))),
      ok(ue(m(2, { text: 'исправил\nопечатку', edit_date: DATE0 + 60 }))),
      ok(ue(m(99, { text: 'этого на экране не было' }))),
      ok(ue(m(3, { text: '/команда' }))),
    ],
  });
  await s.feed.step();
  s.timers.fire(SEND_MS);
  await s.feed.step();
  assert.deepEqual(texts(s.feed), ['сообщение 1', 'исправил опечатку', 'сообщение 3']);
  assert.equal(s.feed.view().lines[1].at, (DATE0 + 2) * 1000, 'время — когда написали, а не когда исправили');
  s.timers.fire(SEND_MS);
  assert.deepEqual(s.sent.at(-1), { t: 'tgUp', title: 'Друзья', lines: [{ id: 2, name: 'Петя', text: 'исправил опечатку', at: (DATE0 + 2) * 1000 }] });
  await s.feed.step();
  s.timers.fire(SEND_MS);
  assert.equal(s.sent.length, 2, 'исправили то, чего на экране нет, — рассылать нечего');
  assert.deepEqual(ids(s.feed), [1, 2, 3]);
  await s.feed.step();
  s.timers.fire(SEND_MS);
  assert.deepEqual(ids(s.feed), [1, 2]);
  assert.equal(s.sent.at(-1)?.t, 'tg', 'строка пропала — всё заново');
});

test(`рассылка: пачка — одним tgUp не чаще раза в ${SEND_MS} мс; на экране — последние ${TG_KEEP}; tg-feed.json переживает перезапуск`, async () => {
  const s = setup({ replies: [ok(u(m(1)), u(m(2))), ok(u(m(3)))] });
  await s.feed.step();
  await s.feed.step();
  assert.equal(s.sent.length, 0, 'ждём, вдруг ещё придёт');
  s.timers.fire(SEND_MS);
  assert.equal(s.sent.length, 1);
  const up = s.sent[0];
  assert.ok(up.t === 'tgUp');
  assert.equal(up.title, 'Друзья');
  assert.deepEqual(up.lines.map((l) => l.id), [1, 2, 3]);
  s.timers.fire(SEND_MS);
  assert.equal(s.sent.length, 1, 'нового нет — не шлём');

  const many = Array.from({ length: 40 }, (_, i) => u(m(10 + i)));
  s.replies.push(ok(...many));
  await s.feed.step();
  s.timers.fire(SEND_MS);
  assert.equal(ids(s.feed).length, TG_KEEP);
  assert.equal(ids(s.feed).at(-1), 49);
  const last = s.sent.at(-1);
  assert.ok(last?.t === 'tgUp');
  assert.equal(last.lines.length, TG_KEEP, 'ушедшие с экрана не рассылаем');

  assert.equal(s.timers.pending(SAVE_MS), 1, 'файл пишется не на каждое сообщение');
  s.timers.fire(SAVE_MS);
  const file = path.join(s.dir, 'tg-feed.json');
  assert.ok(!existsSync(`${file}.tmp`));
  assert.ok(!readFileSync(file, 'utf8').includes('FAKE'), 'токена в файле нет');
  const s2 = setup({ dir: s.dir });
  assert.deepEqual(s2.feed.view(), s.feed.view());

  writeFileSync(file, '{"lines": [1, 2');
  const s3 = setup({ dir: s.dir });
  assert.deepEqual(s3.feed.view(), { title: '', lines: [] });
  assert.ok(s3.logs.some((l) => l.includes('tg-feed.json не читается')));
  writeFileSync(path.join(s.dir, 'tg-chat.json'), 'мусор');
  const s4 = setup({ dir: s.dir, replies: [ok(u(m(100, {}, OTHER)))] });
  assert.ok(s4.logs.some((l) => l.includes('tg-chat.json не читается')));
  await s4.feed.step();
  assert.deepEqual(ids(s4.feed), [100], 'чат выбирается заново');
});

test('нет токена — заставка, Telegram не спрашиваем, в журнал — один раз; файл появился — слушаем без перезапуска; пропал — снова заставка', async () => {
  const dir = tmp();
  writeFileSync(path.join(dir, 'tg-feed.json'), JSON.stringify({ v: 1, chat: FRIENDS.id, title: 'Друзья', max: 1, lines: [{ id: 1, name: 'Петя', text: 'было', at: 1 }] }));
  const s = setup({ dir, token: null, replies: [ok(u(m(2)))] });
  assert.deepEqual(s.feed.view(), { title: '', lines: [] }, 'без токена экран пустой, даже если строки есть');
  assert.equal(await s.feed.step(), RECHECK_MS);
  assert.equal(await s.feed.step(), RECHECK_MS);
  assert.equal(s.calls.length, 0);
  assert.equal(s.logs.filter((l) => l.includes('токена нет')).length, 1);

  writeFileSync(path.join(dir, 'tg-token'), `  ${TOKEN}  \n`);
  assert.equal(await s.feed.step(), 0);
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].url, `https://api.telegram.org/bot${TOKEN}/getUpdates`, 'пробелы и перевод строки вокруг токена — не помеха');
  s.timers.fire(SEND_MS);
  assert.deepEqual(s.sent.at(-1), { t: 'tg', title: 'Друзья', lines: [{ id: 1, name: 'Петя', text: 'было', at: 1 }, { id: 2, name: 'Петя', text: 'сообщение 2', at: (DATE0 + 2) * 1000 }] });

  rmSync(path.join(dir, 'tg-token'));
  assert.equal(await s.feed.step(), RECHECK_MS);
  s.timers.fire(SEND_MS);
  assert.deepEqual(s.sent.at(-1), { t: 'tg', title: '', lines: [] });
  assert.equal(s.calls.length, 1);
});

test('плохой токен: 401/404 — стоп, пока в файле тот же; новый — спрашиваем снова; «не токен» в адрес запроса не идёт', async () => {
  const s = setup({
    replies: [
      { status: 401, body: { ok: false, error_code: 401, description: 'Unauthorized' } },
      { status: 404, body: { ok: false, error_code: 404, description: 'Not Found' } },
      ok(),
    ],
  });
  assert.equal(await s.feed.step(), RECHECK_MS);
  assert.equal(await s.feed.step(), RECHECK_MS);
  assert.equal(await s.feed.step(), RECHECK_MS);
  assert.equal(s.calls.length, 1, 'с тем же токеном Telegram больше не спрашиваем');
  assert.equal(s.logs.filter((l) => l.startsWith('tg: токен не подошёл')).length, 1);

  writeFileSync(path.join(s.dir, 'tg-token'), '654321:ANOTHER-fake-token');
  assert.equal(await s.feed.step(), RECHECK_MS);
  assert.equal(s.calls.length, 2);
  assert.equal(s.logs.filter((l) => l.startsWith('tg: токен не подошёл')).length, 2, 'и новый не подошёл — снова в журнал');

  writeFileSync(path.join(s.dir, 'tg-token'), '777:third-fake-token');
  assert.equal(await s.feed.step(), EMPTY_GAP_MS);
  assert.equal(s.calls.length, 3);
  assert.equal(s.calls[2].body.offset, undefined, 'новый бот — своя нумерация обновлений');

  writeFileSync(path.join(s.dir, 'tg-token'), 'TOKEN=abc/../../x?y');
  assert.equal(await s.feed.step(), RECHECK_MS);
  assert.equal(await s.feed.step(), RECHECK_MS);
  assert.equal(s.calls.length, 3);
  assert.equal(s.logs.filter((l) => l.includes('не токен бота')).length, 1);
});

test('сеть: паузы 5 → 10 → 20 → 40 → 60 → 60 с, удача — сначала; 429 — сколько просит Telegram; 409 — раз в минуту; нет ответа 60 с — обрыв', async () => {
  const netErr = () => new TypeError('fetch failed', { cause: Object.assign(new Error('connect ECONNREFUSED 149.154.167.220:443'), { code: 'ECONNREFUSED' }) });
  const conflict: Reply = { status: 409, body: { ok: false, error_code: 409, description: 'Conflict: terminated by other getUpdates request' } };
  const s = setup({
    replies: [
      ok(),
      netErr(), netErr(), { status: 502, raw: '<html>Bad Gateway</html>' }, netErr(), netErr(), netErr(),
      ok(),
      netErr(), { status: 429, body: { ok: false, error_code: 429, description: 'Too Many Requests: retry after 90', parameters: { retry_after: 90 } } },
      conflict, conflict,
    ],
  });
  const waits: number[] = [];
  for (let i = 0; i < 12; i++) waits.push(await s.feed.step());
  assert.deepEqual(waits, [EMPTY_GAP_MS, 5000, 10_000, 20_000, 40_000, RETRY_MS[1], RETRY_MS[1], EMPTY_GAP_MS, 5000, 90_000, CONFLICT_MS, CONFLICT_MS]);
  assert.equal(s.logs.filter((l) => l.includes('ECONNREFUSED')).length, 2, 'в журнал — в начале каждой полосы ошибок, а не на каждой попытке');
  assert.equal(s.logs.filter((l) => l.includes('HTTP 409')).length, 1);
  assert.ok(s.logs.some((l) => l.includes('снова есть')));

  // Telegram молчит дольше минуты — обрываем запрос сами и пробуем снова (после 409 сеть жива — пауза снова короткая)
  const p = s.feed.step();
  await until(() => s.timers.pending(FETCH_MS) === 1);
  assert.equal(s.timers.pending(FETCH_MS), 1);
  s.timers.fire(FETCH_MS);
  assert.equal(await p, 5000);
  assert.ok(s.logs.at(-1)?.includes('не ответил за 60 с'));
});

test('токен не попадает ни в журнал, ни в файлы, ни в рассылку — даже когда он в тексте ошибки', async () => {
  const SECRET = '987654:SuperSecret_FAKE-value-123';
  const url = `https://api.telegram.org/bot${SECRET}/getUpdates`;
  const out: string[] = [];
  const saved = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  console.log = console.error = console.warn = console.info = (...a: unknown[]) => void out.push(a.map(String).join(' '));
  try {
    const s = setup({
      token: SECRET,
      // между ошибками — удачные ответы: каждая ошибка начинает свою полосу и попадает в журнал
      replies: [
        new TypeError(`fetch failed: ${url}`, { cause: new Error(`connect ECONNREFUSED ${url}`) }),
        ok(u(m(1))),
        Object.assign(new Error(`request to ${url} failed, reason: socket hang up`), { code: 'ECONNRESET' }),
        ok(),
        { status: 500, body: { ok: false, error_code: 500, description: `Internal Server Error at ${url}` } },
        ok(),
        { status: 409, body: { ok: false, error_code: 409, description: `Conflict for bot${SECRET}` } },
        { status: 401, body: { ok: false, error_code: 401, description: `Unauthorized: ${SECRET}` } },
      ],
    });
    for (let i = 0; i < 9; i++) await s.feed.step();
    s.timers.fire(SEND_MS);
    s.feed.stop();
    assert.equal(s.calls.length, 8);
    const logged = [...s.logs, ...out].join('\n');
    assert.ok(s.logs.length >= 5, logged);
    for (const bad of [SECRET, 'SuperSecret', 'value-123']) assert.ok(!logged.includes(bad), `в журнале «${bad}»:\n${logged}`);
    assert.doesNotMatch(logged, /bot\d+:[\w-]+/);
    assert.ok(logged.includes('ECONNRESET') && logged.includes('HTTP 500') && logged.includes('токен не подошёл'), logged);
    for (const f of readdirSync(s.dir)) {
      if (f !== 'tg-token') assert.ok(!readFileSync(path.join(s.dir, f), 'utf8').includes('SuperSecret'), f);
    }
    assert.ok(!JSON.stringify(s.sent).includes('SuperSecret'));
  } finally {
    Object.assign(console, saved);
  }
  assert.equal(scrub('ошибка https://api.telegram.org/bot42:abc-DEF_g/getMe и 1234567:AAAAAAAAAAAAAAAAAAAAAAAA'), 'ошибка https://api.telegram.org/bot[токен]/getMe и [токен]');
});

test('хаб: входящему на набережную — tg с тем, что на экране; новое — tgUp всем на набережной', async () => {
  const s = setup({ replies: [ok(u(m(1))), ok(u(m(2)))] });
  await s.feed.step();
  s.timers.fire(SEND_MS);
  const store = new Store(tmp(), { log: () => {}, saveDelayMs: 60_000 });
  store.load();
  const hub = new Hub({ store, profiles: new Profiles(store), smokeToken: '', build: 'test', tg: s.feed, log: () => {} });
  const sink = fakeSink();
  const c = hub.connect(sink, '10.0.0.9');
  hub.onJson(c, { t: 'hello', v: PROTOCOL_VERSION, key: newKey(), nick: 'Зритель' });
  const kinds = sink.msgs.map((x) => x.t);
  assert.ok(kinds.indexOf('lobby') >= 0 && kinds.indexOf('lobby') < kinds.indexOf('tg'), kinds.join(','));
  assert.deepEqual(sink.msgs.find((x) => x.t === 'tg'), { t: 'tg', title: 'Друзья', lines: [{ id: 1, name: 'Петя', text: 'сообщение 1', at: (DATE0 + 1) * 1000 }] });
  await s.feed.step();
  s.timers.fire(SEND_MS);
  assert.deepEqual(sink.msgs.filter((x) => x.t === 'tgUp'), [{ t: 'tgUp', title: 'Друзья', lines: [{ id: 2, name: 'Петя', text: 'сообщение 2', at: (DATE0 + 2) * 1000 }] }]);
});

test('start/stop: шаги идут сами, stop обрывает долгий запрос, больше не спрашивает и дописывает tg-feed.json', async () => {
  const s = setup({ replies: [ok(u(m(1)))] });
  s.feed.start();
  await until(() => s.timers.pending(0) === 1);
  assert.equal(s.calls.length, 1);
  assert.equal(s.timers.pending(0), 1, 'новости были — следующий запрос сразу');
  s.timers.fire(0);
  await until(() => s.calls.length === 2);
  assert.equal(s.calls.length, 2, 'второй запрос висит — ждёт новостей');
  s.feed.stop();
  await until(() => s.timers.list.size === 0);
  assert.equal(s.calls.length, 2);
  assert.equal(s.timers.list.size, 0, 'ни таймеров, ни запросов');
  const saved = JSON.parse(readFileSync(path.join(s.dir, 'tg-feed.json'), 'utf8')) as { lines: Array<{ id: number }> };
  assert.deepEqual(saved.lines.map((l) => l.id), [1]);
});
