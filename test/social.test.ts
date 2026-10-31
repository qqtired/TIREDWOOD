// «Общее» (server/social.ts, shared/social.ts): «Позвать», зов в Telegram, итоги недели, огни букв TIREDWOOD, викторина в чате.
// Сначала логика на поддельном хозяине (часы в руках), потом — через настоящий хаб: позвал → второй видит приглашение и «Иду»,
// партия вдвоём зажигает букву, вопрос Затейника платит первому верному.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import type { RoomKind, ServerMsg } from '../shared/messages.ts';
import {
  CALL_GAP_MS, LETTERS_PER_MODE, LETTERS_REWARD, LETTER_COUNT, mskWeekStart, nightOf, socialEnabled, tgCallEnabled,
} from '../shared/social.ts';
import { Hub } from '../server/hub.ts';
import { Profiles } from '../server/profiles.ts';
import { Social, SOCIAL_FILE, collectDigest, formatDigest, type SocialHost, type SocialPeer } from '../server/social.ts';
import { Store, type State } from '../server/store.ts';
import type { TgCall, TgCallStatus } from '../server/tgcall.ts';
import { SMOKE, login, newKey } from './kit.ts';

const dirs: string[] = [];
const tmp = (): string => { const d = mkdtempSync(path.join(tmpdir(), 'opus-social-')); dirs.push(d); return d; };
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

const MIN = 60_000;
/** Суббота 31.10.2026, 21:00 по Москве */
const EVENING = Date.UTC(2026, 9, 31, 18);

// ------------------------------------------------------------ вечер, неделя, флаги

test('вечер кончается в 06:00 по Москве, неделя — в понедельник 00:00', () => {
  const evening = Date.UTC(2026, 9, 31, 20); // 23:00 МСК
  const small = Date.UTC(2026, 10, 1, 2, 59); // 05:59 МСК — ещё тот же вечер
  const morning = Date.UTC(2026, 10, 1, 3, 0); // 06:00 МСК
  assert.equal(nightOf(evening), nightOf(small));
  assert.equal(nightOf(morning), nightOf(small) + 1);
  // 31.10.2026 — суббота, понедельник той недели — 26.10 00:00 МСК
  assert.equal(mskWeekStart(EVENING), Date.UTC(2026, 9, 25, 21));
  assert.equal(mskWeekStart(Date.UTC(2026, 9, 25, 21)), Date.UTC(2026, 9, 25, 21));
  assert.equal(mskWeekStart(Date.UTC(2026, 9, 25, 20, 59)), Date.UTC(2026, 9, 18, 21));
});

test('флаги: SOCIAL — как у HIDE (в dev включён), TG_CALL — только явная 1', () => {
  assert.equal(socialEnabled(undefined, true), true);
  assert.equal(socialEnabled(undefined, false), false);
  assert.equal(socialEnabled('0', true), false);
  assert.equal(socialEnabled('1', false), true);
  assert.equal(tgCallEnabled(undefined), false);
  assert.equal(tgCallEnabled('1'), true);
});

// ------------------------------------------------------------ поддельный хозяин

interface Fake extends SocialPeer { msgs: ServerMsg[]; room: RoomKind }

function rig(o: { tg?: Partial<TgCall> | null; dir?: string; state?: Partial<State> } = {}) {
  const clock = { now: EVENING };
  const peers: Fake[] = [];
  const later: Array<() => void> = [];
  const chat: string[] = [];
  const toasts: Array<[number, string]> = [];
  const paid: Array<[number, number]> = [];
  const state = { fortTop: [], regatta: [], dgTop: [], fishPodium: { day: '', catches: [] }, ...o.state } as unknown as State;
  const host: SocialHost = {
    now: () => clock.now,
    peers: () => peers,
    announceLive: (t) => { chat.push(t); },
    announce: (t) => { chat.push(t); },
    sayTo: (pids, t) => { chat.push(`→${pids.join(',')}: ${t}`); },
    toast: (p, t) => { toasts.push([p.pid, t]); },
    pay: (pid, n) => { paid.push([pid, n]); return true; },
    later: (_t, fn) => { later.push(fn); },
    log: () => {},
    state: () => state,
  };
  const dir = o.dir ?? tmp();
  const social = new Social({ host, dir, tg: (o.tg ?? null) as TgCall | null });
  const add = (pid: number, nick: string, room: RoomKind = 'lobby'): Fake => {
    const p: Fake = { pid, nick, room, msgs: [], send: (m) => { p.msgs.push(m); } };
    peers.push(p);
    return p;
  };
  const flush = (): void => { while (later.length) later.shift()!(); };
  return { social, clock, peers, add, chat, toasts, paid, flush, dir, state };
}
const kinds = (p: Fake): string[] => p.msgs.map((m) => m.t);

test('«Позвать»: на набережной — плашка и столб, в режимах — строка в чат; раз в две минуты', () => {
  const r = rig();
  const a = r.add(1, 'Рома');
  const b = r.add(2, 'Саша');
  const c = r.add(3, 'Миша', 'fort');
  r.social.onMessage(a, { t: 'call', kind: 'kart' });
  assert.deepEqual(kinds(b), ['callAsk', 'callBeam']);
  assert.deepEqual(b.msgs[0], { t: 'callAsk', id: 1, kind: 'kart', nick: 'Рома', ms: 30_000 });
  assert.deepEqual(kinds(c), []);
  assert.ok(r.chat.some((l) => l.startsWith('→3:') && l.includes('Рома зовёт на картинг')));
  assert.deepEqual(a.msgs.map((m) => m.t), ['callWait', 'callBeam']);
  // второй раз сразу — отказ и сколько ждать
  a.msgs.length = 0;
  r.social.onMessage(a, { t: 'call', kind: 'kart' });
  assert.deepEqual(a.msgs, [{ t: 'callWait', sec: 120 }]);
  assert.equal(kinds(b).length, 2);
  r.clock.now += CALL_GAP_MS;
  r.social.onMessage(a, { t: 'call', kind: 'hide' });
  assert.equal(kinds(b).length, 4);
});

test('«Позвать»: неизвестное место и чужая комната — отказ без зова; из крепости — только «в крепость»', () => {
  const r = rig();
  const a = r.add(1, 'Рома', 'fort');
  const b = r.add(2, 'Саша');
  r.social.onMessage(a, { t: 'call', kind: 'kart' });
  assert.deepEqual(kinds(b), []);
  assert.ok(r.toasts.some(([pid, t]) => pid === 1 && t.includes('с набережной')));
  r.social.onMessage(a, { t: 'call', kind: 'fort' });
  assert.deepEqual(kinds(b), ['callAsk', 'callBeam']);
  r.social.onMessage(a, { t: 'call', kind: 'nope' as never });
  assert.equal(kinds(b).length, 2);
});

test('«Иду» говорит зовущему «идёт» — один раз от человека, не позже плашки', () => {
  const r = rig();
  const a = r.add(1, 'Рома');
  const b = r.add(2, 'Саша');
  r.social.onMessage(a, { t: 'call', kind: 'quiz' });
  r.social.onMessage(b, { t: 'callGo', id: 1 });
  r.social.onMessage(b, { t: 'callGo', id: 1 });
  assert.deepEqual(r.toasts.filter(([pid]) => pid === 1).map(([, t]) => t).filter((t) => t.includes('идёт')), ['Саша идёт в «Ракушку»']);
  r.clock.now += 31_000;
  r.social.onMessage(r.add(3, 'Миша'), { t: 'callGo', id: 1 });
  assert.equal(r.toasts.filter(([, t]) => t.includes('Миша')).length, 0);
});

test('в игре только зовущий: без Telegram — «никого рядом», с Telegram — зов уходит в группу', async () => {
  const lone = rig();
  const x = lone.add(1, 'Рома');
  lone.social.onMessage(x, { t: 'call', kind: 'kart' });
  assert.deepEqual(x.msgs, [{ t: 'callWait', sec: 0 }]);

  const calls: unknown[] = [];
  const tg = { call: async (o: unknown): Promise<TgCallStatus> => { calls.push(o); return 'sent'; }, digestDue: () => false };
  const r = rig({ tg });
  const a = r.add(1, 'Рома');
  r.social.onMessage(a, { t: 'call', kind: 'kart' });
  await new Promise((ok) => setImmediate(ok));
  assert.deepEqual(calls, [{ pid: 1, online: 1, text: 'Рома на набережной, зовёт на картинг — game.tired.solutions' }]);
  assert.ok(r.toasts.some(([, t]) => t.includes('Telegram')));
  // трое в игре — Social всё равно передаёт число, решает TgCall (тот ответит 'enough')
  const r3 = rig({ tg });
  const [p1] = [r3.add(1, 'Рома'), r3.add(2, 'Саша'), r3.add(3, 'Миша')];
  r3.social.onMessage(p1, { t: 'call', kind: 'fort' });
  assert.equal((calls[1] as { online: number }).online, 3);
});

// ------------------------------------------------------------ огни букв

test('буква зажигается партией двух людей; режим даёт не больше двух; салют и жетоны на девятой', () => {
  const r = rig();
  const [a, c] = [r.add(1, 'Рома'), r.add(2, 'Саша'), r.add(3, 'Миша')].filter((_, i) => i !== 1);
  assert.equal(r.social.matchDone('kart', [1]), false, 'один человек — не совместная партия');
  assert.equal(r.social.matchDone('kart', [1, 1]), false, 'один и тот же дважды — тоже один');
  assert.equal(r.social.matchDone('kart', [1, 2]), true);
  assert.equal(r.social.matchDone('kart', [1, 2]), true);
  assert.equal(r.social.matchDone('kart', [1, 2]), false, `третья партия того же режима за вечер — нет (${LETTERS_PER_MODE} на режим)`);
  assert.equal(r.social.lit, 2);
  assert.deepEqual(a.msgs.at(-1), { t: 'letters', lit: 2 });
  const modes = ['boatrace', 'hide', 'fort', 'paintball', 'durak'] as const;
  for (const m of modes) r.social.matchDone(m, m === 'durak' ? [2, 3] : [1, 2]);
  while (r.social.lit < LETTER_COUNT - 1) for (const m of modes) if (r.social.matchDone(m, [1, 2])) break;
  assert.equal(r.social.lit, LETTER_COUNT - 1);
  assert.equal(r.paid.length, 0);
  assert.ok(r.social.matchDone('billiards', [2, 3]));
  assert.equal(r.social.lit, LETTER_COUNT);
  assert.deepEqual(c.msgs.at(-1), { t: 'letters', lit: LETTER_COUNT, boom: 1 });
  assert.deepEqual(r.paid.sort(([x], [y]) => x - y), [[1, LETTERS_REWARD], [2, LETTERS_REWARD], [3, LETTERS_REWARD]]);
  assert.ok(r.chat.some((l) => l.includes('Все девять')));
  // все горят — больше ничего не зажигается и не платится второй раз
  assert.equal(r.social.matchDone('billiards', [1, 2]), false);
  assert.equal(r.paid.length, 3);
});

test('партии одного тика — одна партия: игроки собираются, зажигается одна буква', () => {
  const r = rig();
  r.add(1, 'Рома');
  r.add(2, 'Саша');
  r.social.result('kart', 1, true);
  r.social.result('kart', 2, false);
  assert.equal(r.social.lit, 0);
  r.flush();
  assert.equal(r.social.lit, 1);
  // никто не дошёл до конца — не в счёт
  r.social.result('hide', 1, false);
  r.social.result('hide', 2, false);
  r.flush();
  assert.equal(r.social.lit, 1);
  // один человек — не в счёт
  r.social.result('fort', 1, true);
  r.flush();
  assert.equal(r.social.lit, 1);
});

test('буквы горят до утра: переживают перезапуск, в 06:00 по Москве гаснут', () => {
  const r = rig();
  r.add(1, 'Рома');
  r.add(2, 'Саша');
  r.social.matchDone('kart', [1, 2]);
  r.social.matchDone('hide', [1, 2]);
  assert.equal(JSON.parse(readFileSync(path.join(r.dir, SOCIAL_FILE), 'utf8')).letters.lit, 2);
  // сервер перезапустился в ту же ночь
  const again = rig({ dir: r.dir });
  assert.equal(again.social.lit, 2);
  // и режимы не забыты: kart уже дал одну букву, ещё одна — можно, третьей нет
  again.add(1, 'Рома'); again.add(2, 'Саша');
  assert.equal(again.social.matchDone('kart', [1, 2]), true);
  assert.equal(again.social.matchDone('kart', [1, 2]), false);
  // утро
  again.clock.now = Date.UTC(2026, 10, 1, 3, 0);
  assert.equal(again.social.lit, 0);
  assert.equal(again.social.matchDone('kart', [1, 2]), true);
  // а файл прошлой ночи игра не слушает
  const next = rig({ dir: r.dir });
  next.clock.now = Date.UTC(2026, 10, 3, 12);
  assert.equal(next.social.lit, 0);
});

test('вошедшему — сколько букв горит и включена ли викторина', () => {
  const r = rig();
  const a = r.add(1, 'Рома');
  r.social.matchDone('kart', [1, 2]);
  r.social.joined(a);
  assert.deepEqual(a.msgs.at(-1), { t: 'social', call: 1, quiz: 0, lit: 1 });
});

// ------------------------------------------------------------ итоги недели

test('итоги недели: только то, что поставлено за последние 7 дней; пустые — не шлём', () => {
  const now = Date.UTC(2026, 10, 2, 9); // понедельник 12:00 МСК
  const day = 86_400_000;
  const state = {
    fortTop: [{ wave: 14, names: ['Рома', 'Саша'], at: now - day, n: 2 }, { wave: 30, names: ['Старый'], at: now - 20 * day, n: 1 }],
    regatta: [{ pid: 2, nick: 'Саша', ms: 83_400, at: now - 2 * day }],
    dgTop: [{ nick: 'Миша', waves: 11, ms: 1, at: now - 3 * day }],
    fishPodium: { day: '', catches: [] },
  } as unknown as State;
  const d = collectDigest(state, [{ at: now - day, nick: 'Рома', sp: 0, g: 1500 }, { at: now - 12 * day, nick: 'Давно', sp: 0, g: 99_000 }], now);
  assert.deepEqual(d.fort, { wave: 14, names: ['Рома', 'Саша'] });
  assert.deepEqual(d.regatta, { ms: 83_400, nick: 'Саша' });
  assert.deepEqual(d.dungeon, { waves: 11, nick: 'Миша' });
  assert.deepEqual(d.catch, { nick: 'Рома', sp: 0, g: 1500 });
  const text = formatDigest(d)!;
  assert.ok(text.includes('Крепость: 14 волн — Рома, Саша'), text);
  assert.ok(text.includes('лучший круг 1:23.4 — Саша'), text);
  assert.ok(text.includes('1,5 кг — Рома'), text);
  assert.equal(formatDigest({}), null);
});

test('итоги уходят в понедельник после 12:00 по Москве один раз за неделю; в другие дни — нет', async () => {
  const sent: Array<{ weekStart: number; text: string }> = [];
  let due = true;
  const tg = { call: async (): Promise<TgCallStatus> => 'sent', digestDue: () => due, digest: async (o: { weekStart: number; text: string }): Promise<TgCallStatus> => { sent.push(o); due = false; return 'sent'; } };
  const state = { fortTop: [{ wave: 9, names: ['Рома'], at: Date.UTC(2026, 10, 1), n: 1 }] };
  const r = rig({ tg, state });
  r.clock.now = Date.UTC(2026, 10, 2, 8); // понедельник 11:00 МСК — рано
  r.social.step();
  await new Promise((ok) => setImmediate(ok));
  assert.equal(sent.length, 0);
  r.clock.now = Date.UTC(2026, 10, 2, 9, 5); // 12:05
  r.social.step();
  await new Promise((ok) => setImmediate(ok));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].weekStart, Date.UTC(2026, 10, 1, 21));
  r.clock.now += 5 * MIN;
  r.social.step();
  await new Promise((ok) => setImmediate(ok));
  assert.equal(sent.length, 1, 'вторая отправка за неделю — нет');
  const tue = rig({ tg: { ...tg, digestDue: () => true }, state });
  tue.clock.now = Date.UTC(2026, 10, 3, 10); // вторник
  tue.social.step();
  await new Promise((ok) => setImmediate(ok));
  assert.equal(sent.length, 1);
});

// ------------------------------------------------------------ через настоящий хаб

function env(opts: { questions?: boolean } = {}) {
  const dir = tmp();
  const clock = { now: EVENING };
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now: () => clock.now });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({
    store, profiles, smokeToken: SMOKE, build: 'test', now: () => clock.now, log: () => {}, weather: 'clear',
    social: { dir, rand: () => 0, questions: opts.questions ? () => [{ q: 'Столица Франции?', answers: ['Париж'], wrong: [], comment: '' }] : undefined },
  });
  return { hub, clock, store };
}
let ipN = 0;
const join = (e: ReturnType<typeof env>, nick: string) => login(e.hub, nick, newKey(), `10.7.${Math.floor(++ipN / 200)}.${ipN % 200}`);
function run(e: ReturnType<typeof env>, sec: number): void {
  for (let i = 0, n = Math.round(sec * TICK_RATE); i < n; i++) {
    e.clock.now += 1000 / TICK_RATE;
    e.hub.step();
  }
}
const got = <T extends ServerMsg['t']>(msgs: ServerMsg[], t: T): Extract<ServerMsg, { t: T }>[] => msgs.filter((m): m is Extract<ServerMsg, { t: T }> => m.t === t);

test('хаб: вошёл — приходит «social»; позвал — второй видит плашку и столб, «Иду» — зовущий видит тост', () => {
  const e = env();
  const a = join(e, 'Tester7');
  const b = join(e, 'Tester8');
  assert.deepEqual(got(a.s.msgs, 'social')[0], { t: 'social', call: 1, quiz: 0, lit: 0 }, 'без паков викторины нет');
  e.hub.onJson(a.c, { t: 'call', kind: 'kart' });
  const ask = got(b.s.msgs, 'callAsk')[0];
  assert.equal(ask.nick, 'Tester7');
  assert.equal(ask.kind, 'kart');
  assert.equal(got(b.s.msgs, 'callBeam').length, 1);
  assert.equal(got(a.s.msgs, 'callAsk').length, 0, 'зовущему плашки нет');
  e.hub.onJson(b.c, { t: 'callGo', id: ask.id });
  assert.ok(got(a.s.msgs, 'toast').some((m) => m.text.includes('Tester8 идёт на картинг')));
  // сразу ещё раз — нельзя
  e.hub.onJson(a.c, { t: 'call', kind: 'kart' });
  assert.equal(got(b.s.msgs, 'callAsk').length, 1);
  assert.ok(got(a.s.msgs, 'callWait').some((m) => m.sec > 0));
  run(e, CALL_GAP_MS / 1000 + 1);
  e.hub.onJson(a.c, { t: 'call', kind: 'hide' });
  assert.equal(got(b.s.msgs, 'callAsk').length, 2);
});

test('хаб: без флага «Общего» сообщения игнорируются и «social» не приходит', () => {
  const dir = tmp();
  const clock = { now: EVENING };
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now: () => clock.now });
  store.load();
  const hub = new Hub({ store, profiles: new Profiles(store, { now: () => clock.now }), smokeToken: SMOKE, build: 'test', now: () => clock.now, log: () => {}, weather: 'clear' });
  const a = login(hub, 'Tester7', newKey(), '10.8.0.1');
  const b = login(hub, 'Tester8', newKey(), '10.8.0.2');
  hub.onJson(a.c, { t: 'call', kind: 'kart' });
  assert.equal(got(a.s.msgs, 'social').length, 0);
  assert.equal(got(b.s.msgs, 'callAsk').length, 0);
});

test('хаб: партия вдвоём в картинге и в дураке зажигает буквы, одному — нет', () => {
  const e = env();
  const a = join(e, 'Tester7');
  const b = join(e, 'Tester8');
  const solo = join(e, 'Tester9');
  e.hub.onRaceResult(solo.c, { id: 1, nick: 'Tester9', bot: false, place: 1, time: 1, best: 1, tokens: 0 }, null);
  run(e, 0.2);
  assert.equal(e.hub.social!.lit, 0, 'один человек в заезде');
  for (const x of [a, b]) e.hub.onRaceResult(x.c, { id: 1, nick: x.c.nick, bot: false, place: x.c === a.c ? 1 : 2, time: 1, best: 1, tokens: 0 }, null);
  run(e, 0.2);
  assert.equal(e.hub.social!.lit, 1);
  assert.deepEqual(got(a.s.msgs, 'letters').at(-1), { t: 'letters', lit: 1 });
  assert.ok(got(b.s.msgs, 'chat').some((m) => m.text.includes('Зажглась буква «T»')));
});

test('хаб: Затейник задаёт вопрос в чат, первый верный получает +10, «выключено» — не получает и не видит', () => {
  const e = env({ questions: true });
  const a = join(e, 'Tester7');
  const b = join(e, 'Tester8');
  const c = join(e, 'Tester9');
  assert.equal(got(a.s.msgs, 'social')[0].quiz, 1);
  e.hub.onJson(c.c, { t: 'socPref', quiz: false });
  run(e, 20 * 60 + 5);
  const lines = (x: typeof a) => got(x.s.msgs, 'chat').filter((m) => m.text.includes('Затейник'));
  assert.equal(lines(a).length, 1, 'вопрос у включивших');
  assert.ok(lines(a)[0].text.includes('Столица Франции?'));
  assert.equal(lines(c).length, 0, 'у выключившего вопроса нет');
  const before = e.hub.profiles.byId(b.c.pid)!.tokens;
  const cBefore = e.hub.profiles.byId(c.c.pid)!.tokens;
  e.hub.onJson(c.c, { t: 'chat', text: 'Париж' });
  assert.equal(e.hub.profiles.byId(c.c.pid)!.tokens, cBefore, 'выключивший не участвует');
  e.hub.onJson(b.c, { t: 'chat', text: 'наверное, это Париж' });
  assert.equal(e.hub.profiles.byId(b.c.pid)!.tokens, before + 10);
  assert.ok(lines(a).some((m) => m.text.includes('верно, Tester8')));
  const after = e.hub.profiles.byId(a.c.pid)!.tokens;
  e.hub.onJson(a.c, { t: 'chat', text: 'Париж' });
  assert.equal(e.hub.profiles.byId(a.c.pid)!.tokens, after, 'второй верный — уже без награды');
});

test('хаб: двое в игре — вопроса нет (онлайн от трёх)', () => {
  const e = env({ questions: true });
  const a = join(e, 'Tester7');
  join(e, 'Tester8');
  run(e, 21 * 60);
  assert.equal(got(a.s.msgs, 'chat').filter((m) => m.text.includes('Затейник')).length, 0);
});
