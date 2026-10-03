// Чат кругов (server/lobby/circlechat.ts): «ждёт в круге — 1/6», «поехали, 3 игрока», «заходит в «Пейнтбол»» и анти-спам.
// Сначала сама логика на поддельных часах (секунда за секундой, как проверка кругов на сервере), потом — через настоящий
// хаб без браузера: картинг, регата у пирса, прятки, Fight Club и входы в пейнтбол и крепость.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { PROTOCOL_VERSION, TICK_RATE } from '../shared/constants.ts';
import { FC_CIRCLE } from '../shared/fight.ts';
import { BOAT_RACE_CIRCLE, HIDE_CIRCLE, KART_START } from '../shared/maps/lobby.ts';
import { START_ZONES } from '../shared/startzones.ts';
import { Hub } from '../server/hub.ts';
import { CIRCLE_DWELL_MS, CIRCLE_GAP_MS, CircleChat, LAUNCH_GAP_MS, PLAYER_GAP_MS, playersWord, type CircleFolk, type CircleKind } from '../server/lobby/circlechat.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { SMOKE, allOf, connect, lastOf, login, newKey, placeAt, type FakeSink } from './kit.ts';

// ------------------------------------------------------------ логика на поддельных часах

const A: CircleFolk = { pid: 7, nick: 'Tester7' };
const B: CircleFolk = { pid: 8, nick: 'Tester8' };
const C: CircleFolk = { pid: 9, nick: 'Tester9' };
const D: CircleFolk = { pid: 10, nick: 'Tester10' };

/** Кто стоит в круге и когда: [человек, с какой секунды, до какой] */
type Span = [CircleFolk, number, number];
const spans = (...list: Span[]) => (sec: number): CircleFolk[] => list.filter(([, from, to]) => sec >= from && sec < to).map(([who]) => who);
interface Script { kind: CircleKind; max: number; who: (sec: number) => CircleFolk[] }

function rig() {
  const base = 5_000_000;
  const clock = { now: base };
  const lines: Array<{ at: number; text: string }> = [];
  const chat = new CircleChat({ now: () => clock.now, say: (text) => lines.push({ at: (clock.now - base) / 1000, text }) });
  /** Секунды (from, to]: каждые 0,1 с — проверка кругов, как на сервере */
  const play = (scripts: Script[], from: number, to: number): void => {
    for (let i = Math.round(from * 10) + 1; i <= Math.round(to * 10); i++) {
      clock.now = base + i * 100;
      for (const s of scripts) chat.update(s.kind, s.max, s.who(i / 10));
    }
  };
  const at = (sec: number): void => { clock.now = base + sec * 1000; };
  return { clock, lines, chat, play, at };
}

test('на пустой набережной один игрок в круге — строка нужна: он мог позвать друзей; текст как в задаче', () => {
  const r = rig();
  r.play([{ kind: 'kart', max: 6, who: spans([A, 1, 100]) }], 0, 90);
  assert.deepEqual(r.lines, [{ at: 3, text: '🏁 Tester7 ждёт в круге «Картинг» — 1/6, подходите!' }], 'одна строка, и она не повторяется, пока он стоит');
});

test('пробежал мимо — молчим: строка только когда простоял не меньше двух секунд', () => {
  const r = rig();
  r.play([{ kind: 'kart', max: 6, who: spans([A, 1, 2.5], [B, 4, 5.9]) }], 0, 30);
  assert.equal(r.lines.length, 0);
  assert.equal(CIRCLE_DWELL_MS, 2000);
  r.play([{ kind: 'kart', max: 6, who: spans([C, 31, 33.5]) }], 30, 40);
  assert.equal(r.lines.length, 1, 'а два с половиной — уже встал');
  assert.equal(r.lines[0].at, 33);
});

test('число выросло — «уже N/6», не чаще раза в 20 с на круг; опоздавшие ждут окна и сливаются в одну строку', () => {
  const r = rig();
  // A встал первым, потом B, C и D — все внутри «окна» в 20 с после первой строки; остаются до конца
  r.play([{ kind: 'kart', max: 6, who: spans([A, 1, 100], [B, 5, 100], [C, 10, 100], [D, 12, 100]) }], 0, 60);
  assert.deepEqual(r.lines, [
    { at: 3, text: '🏁 Tester7 ждёт в круге «Картинг» — 1/6, подходите!' },
    { at: 3 + CIRCLE_GAP_MS / 1000, text: '🏁 Tester10 ждёт в круге «Картинг» — уже 4/6, подходите!' },
  ], 'три прихода за окно — одна строка про последнего, с общим числом');
});

test('кто ушёл, не дождавшись окна, в чат не попадает', () => {
  const r = rig();
  // B пришёл через 2 с после первой строки и ушёл до того, как окно круга открылось
  r.play([{ kind: 'kart', max: 6, who: spans([A, 1, 100], [B, 5, 15]) }], 0, 60);
  assert.deepEqual(r.lines.map((l) => l.text), ['🏁 Tester7 ждёт в круге «Картинг» — 1/6, подходите!']);
});

test('один ушёл, другой пришёл: число снова растёт от меньшего — строка про пришедшего, когда окно открыто', () => {
  const r = rig();
  r.play([{ kind: 'kart', max: 6, who: spans([A, 1, 100], [B, 5, 15], [C, 62, 100]) }], 0, 70);
  assert.deepEqual(r.lines.map((l) => [l.at, l.text]), [
    [3, '🏁 Tester7 ждёт в круге «Картинг» — 1/6, подходите!'],
    [64, '🏁 Tester9 ждёт в круге «Картинг» — уже 2/6, подходите!'],
  ]);
});

test('круг полон: места кончились — «круг полон!», лишние в дуэли новых строк не дают', () => {
  const r = rig();
  r.play([{ kind: 'fight', max: 2, who: spans([A, 1, 200], [B, 2, 200], [C, 30, 200]) }], 0, 80);
  assert.deepEqual(r.lines, [
    { at: 3, text: '🥊 Tester7 ждёт в круге «Fight Club» — 1/2, подходите!' },
    { at: 23, text: '🥊 Tester8 ждёт в круге «Fight Club» — уже 2/2, круг полон!' },
  ]);
});

test('встал, вышел, снова встал — не чаще раза в 60 с на игрока', () => {
  // постоял, вышел, вернулся через 26 с и опять ушёл: молчим
  const r = rig();
  r.play([{ kind: 'kart', max: 6, who: spans([A, 1, 4], [A, 30, 45], [A, 50, 58]) }], 0, 120);
  assert.deepEqual(r.lines.map((l) => l.at), [3], 'одна строка, хотя вставал трижды');
  // а если он вернулся и остался — строка выходит, когда прошла минута с прошлой, и опять про «первого»
  const s = rig();
  s.play([{ kind: 'kart', max: 6, who: spans([A, 1, 4], [A, 30, 200]) }], 0, 120);
  assert.deepEqual(s.lines, [
    { at: 3, text: '🏁 Tester7 ждёт в круге «Картинг» — 1/6, подходите!' },
    { at: 3 + PLAYER_GAP_MS / 1000, text: '🏁 Tester7 ждёт в круге «Картинг» — 1/6, подходите!' },
  ]);
});

test('другой игрок в опустевшем круге не ждёт чужой минуты — только окно круга в 20 с', () => {
  const r = rig();
  r.play([{ kind: 'kart', max: 6, who: spans([A, 1, 4], [B, 5, 100]) }], 0, 60);
  // A: строка в 3 с, B встал в 5 с (круг опустел в 4 с), окно круга открылось в 23 с — строка про B в этот момент
  assert.deepEqual(r.lines, [
    { at: 3, text: '🏁 Tester7 ждёт в круге «Картинг» — 1/6, подходите!' },
    { at: 23, text: '🏁 Tester8 ждёт в круге «Картинг» — 1/6, подходите!' },
  ]);
});

test('счёт игрока общий на все круги: перебежал из круга в круг — вторая строка про него не выходит', () => {
  const r = rig();
  r.play([
    { kind: 'kart', max: 6, who: spans([A, 1, 20]) },
    { kind: 'hide', max: 8, who: spans([A, 25, 200]) },
  ], 0, 62);
  assert.deepEqual(r.lines.map((l) => l.at), [3], 'до минуты после первой строки про A тишина');
  r.play([
    { kind: 'kart', max: 6, who: spans([A, 1, 20]) },
    { kind: 'hide', max: 8, who: spans([A, 25, 200]) },
  ], 62, 64);
  assert.deepEqual(r.lines.map((l) => l.text), ['🏁 Tester7 ждёт в круге «Картинг» — 1/6, подходите!', '🔎 Tester7 ждёт в круге «Прятки» — 1/8, подходите!']);
  assert.equal(r.lines[1].at, 63, 'минута с прошлой строки про него — и он ещё стоит');
});

test('у каждого круга своё окно: картинг и регата говорят одновременно', () => {
  const r = rig();
  r.play([
    { kind: 'kart', max: 6, who: spans([A, 1, 100]) },
    { kind: 'boatrace', max: 6, who: spans([B, 1, 100]) },
  ], 0, 10);
  assert.deepEqual(r.lines.map((l) => l.text), [
    '🏁 Tester7 ждёт в круге «Картинг» — 1/6, подходите!',
    '🚤 Tester8 ждёт в круге «Портовая регата» — 1/6, подходите!',
  ]);
});

test('поток людей не превращается в поток строк: за 10 минут не больше раза в 20 с на круг и в минуту на игрока', () => {
  const r = rig();
  // шесть игроков по очереди заходят-выходят каждые 7–9 с, четверо — в одном круге
  const crowd: Span[] = [];
  const folk = [A, B, C, D, { pid: 11, nick: 'Tester11' }, { pid: 12, nick: 'Tester12' }];
  for (let t = 1, i = 0; t < 600; t += 7 + (i % 3), i++) crowd.push([folk[i % folk.length], t, t + 12]);
  r.play([{ kind: 'kart', max: 6, who: spans(...crowd) }], 0, 600);
  for (let i = 1; i < r.lines.length; i++) assert.ok(r.lines[i].at - r.lines[i - 1].at >= CIRCLE_GAP_MS / 1000, `строки ${i - 1} и ${i} ближе 20 с`);
  const byWho = new Map<string, number[]>();
  for (const l of r.lines) {
    const nick = /^\S+ (\S+) /.exec(l.text)![1];
    byWho.set(nick, [...(byWho.get(nick) ?? []), l.at]);
  }
  for (const [nick, times] of byWho) for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= PLAYER_GAP_MS / 1000, `${nick}: строки ближе минуты`);
  assert.ok(r.lines.length >= 5 && r.lines.length <= 30, `строк за 10 минут: ${r.lines.length}`);
});

test('круг ушёл в режим: одна строка «поехали, 3 игрока», не чаще раза в 10 с на круг', () => {
  const r = rig();
  r.at(30);
  r.chat.launched('kart', 3);
  r.chat.launched('kart', 3);
  r.at(30 + LAUNCH_GAP_MS / 1000 - 1);
  r.chat.launched('kart', 2);
  r.at(30 + LAUNCH_GAP_MS / 1000);
  r.chat.launched('kart', 1);
  r.chat.launched('boatrace', 2);
  r.chat.launched('hide', 5);
  r.chat.launched('fight', 4);
  r.chat.launched('hide', 0);
  assert.deepEqual(r.lines.map((l) => l.text), [
    '🏁 Картинг: поехали, 3 игрока',
    '🏁 Картинг: поехали, 1 игрок',
    '🚤 Портовая регата: поехали, 2 игрока',
    '🔎 Прятки: начинаем, 5 игроков',
    '🥊 Fight Club: бой, 4 игрока',
  ]);
  assert.deepEqual([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 111].map(playersWord), ['1 игрок', '2 игрока', '4 игрока', '5 игроков', '11 игроков', '12 игроков', '14 игроков', '21 игрок', '22 игрока', '25 игроков', '111 игроков']);
});

test('«поехали» не мешает окну круга: строка про круг и про старт — каждая в своём счёте', () => {
  const r = rig();
  r.play([{ kind: 'kart', max: 6, who: spans([A, 1, 16]) }], 0, 16);
  r.chat.launched('kart', 1);
  assert.deepEqual(r.lines.map((l) => l.text), ['🏁 Tester7 ждёт в круге «Картинг» — 1/6, подходите!', '🏁 Картинг: поехали, 1 игрок']);
  // круг опустел (все уехали) — следующий, кто встал, снова «первый»
  r.play([{ kind: 'kart', max: 6, who: spans([B, 30, 100]) }], 16, 60);
  assert.equal(r.lines[2].text, '🏁 Tester8 ждёт в круге «Картинг» — 1/6, подходите!');
});

test('вход в пейнтбол, крепость, «Выше облаков»: строка с числом внутри; те же два ограничения', () => {
  const r = rig();
  r.at(10);
  r.chat.door('paintball', A, 1);
  r.at(15);
  r.chat.door('paintball', B, 2);
  r.chat.door('fort', B, 1);
  r.at(32);
  r.chat.door('paintball', A, 3);
  r.chat.door('paintball', C, 3);
  r.at(80);
  r.chat.door('paintball', A, 4);
  r.at(81);
  r.chat.door('skill', D, 5);
  r.at(102);
  r.chat.door('fort', A, 6);
  r.at(141);
  r.chat.door('fort', A, 6);
  assert.deepEqual(r.lines.map((l) => l.text), [
    '🎯 Tester7 заходит в «Пейнтбол» — внутри 1/16, подходите!',
    '🏰 Tester8 заходит в «Крепость» — внутри 1/6, подходите!',
    '🎯 Tester9 заходит в «Пейнтбол» — внутри 3/16, подходите!',
    '🎯 Tester7 заходит в «Пейнтбол» — внутри 4/16, подходите!',
    '☁️ Tester10 заходит в «Выше облаков» — внутри 5/5, мест больше нет!',
    '🏰 Tester7 заходит в «Крепость» — внутри 6/6, мест больше нет!',
  ]);
  assert.equal(r.lines.length, 6);
});

test('память про игроков не растёт: старые записи уходят, когда минута прошла', () => {
  const r = rig();
  for (let i = 0; i < 40; i++) {
    r.at(i * 21);
    r.chat.door('paintball', { pid: 100 + i, nick: `Гость${i}` }, 1);
  }
  const said = (r.chat as unknown as { said: Map<number, number> }).said;
  assert.ok(said.size <= 4, `в памяти ${said.size} игроков`);
});

// ------------------------------------------------------------ через настоящий хаб

const dirs: string[] = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function env(flags: { boatrace?: boolean; hide?: boolean; fight?: boolean; fort?: boolean } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-circlechat-'));
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 3, 18) };
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now: () => clock.now });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({ store, profiles, smokeToken: SMOKE, build: 'test', now: () => clock.now, log: () => {}, weather: 'clear', skill: true, ...flags });
  return { hub, clock };
}
type Env = ReturnType<typeof env>;

let ipN = 0;
const join = (e: Env, nick: string) => login(e.hub, nick, newKey(), `10.9.${Math.floor(++ipN / 200)}.${ipN % 200}`);
/** Секунды игры: и такты хаба, и часы — вместе, как в жизни */
function run(e: Env, sec: number): void {
  for (let i = 0, n = Math.round(sec * TICK_RATE); i < n; i++) {
    e.clock.now += 1000 / TICK_RATE;
    e.hub.step();
  }
}
const lines = (s: FakeSink): string[] => allOf(s, 'chat').filter((m) => m.sys).map((m) => m.text);
const circleLines = (s: FakeSink): string[] => lines(s).filter((t) => t.includes('круге') || t.includes('заходит в') || t.includes(': поехали') || t.includes(': начинаем') || t.includes(': бой'));

test('картинг: пока заезд идёт, ждущие в круге попадают в чат всем — по правилам окна; вошедшему позже старое не повторяют', () => {
  const e = env();
  const watcher = join(e, 'Зритель');
  const pilot = join(e, 'Пилот');
  const a = join(e, 'Tester7');
  const b = join(e, 'Tester8');
  placeAt(e.hub, pilot.c, KART_START.x, KART_START.z);
  run(e, 3);
  assert.deepEqual(circleLines(watcher.s), ['🏁 Пилот ждёт в круге «Картинг» — 1/6, подходите!'], 'всем в чат, и тому, кто в стороне, тоже');
  assert.deepEqual(circleLines(pilot.s), circleLines(watcher.s));
  run(e, 13);
  assert.equal(pilot.c.room?.kind, 'race', 'через 15 с заезд поехал');
  assert.equal(circleLines(watcher.s).at(-1), '🏁 Картинг: поехали, 1 игрок');
  // пока гонка идёт, отсчёта нет — в круге ждут следующий заезд
  placeAt(e.hub, a.c, KART_START.x, KART_START.z);
  run(e, 5);
  assert.equal(circleLines(watcher.s).length, 2, 'Tester7 уже стоит больше двух секунд, но окно круга (20 с) ещё закрыто');
  run(e, 2);
  assert.equal(circleLines(watcher.s).at(-1), '🏁 Tester7 ждёт в круге «Картинг» — 1/6, подходите!');
  placeAt(e.hub, b.c, KART_START.x, KART_START.z);
  run(e, 10);
  assert.equal(circleLines(watcher.s).length, 3, 'Tester8 пока в очереди на строку');
  run(e, 10);
  assert.equal(circleLines(watcher.s).at(-1), '🏁 Tester8 ждёт в круге «Картинг» — уже 2/6, подходите!');
  assert.equal(a.c.room?.kind, 'lobby', 'в круге ждали, никого не увезли');
  // вошедший позже не видит старых «ждёт в круге»: они не в журнале чата
  const late = join(e, 'Опоздавший');
  const log = lastOf(late.s, 'chatlog')!.list.map((l) => l.text);
  assert.deepEqual(log.filter((t) => t.includes('круге') || t.includes(': поехали')), []);
});

test('Tester7 встал, вышел и встал снова: второй раз в чате молчат, пока не пройдёт минута', () => {
  const e = env();
  const watcher = join(e, 'Зритель');
  const a = join(e, 'Tester7');
  const b = join(e, 'Tester8');
  // круг занят заездом, чтобы никто не уехал: первый заезд — Tester8
  placeAt(e.hub, b.c, KART_START.x, KART_START.z);
  run(e, 16);
  assert.equal(b.c.room?.kind, 'race');
  const before = circleLines(watcher.s).length;
  placeAt(e.hub, a.c, KART_START.x, KART_START.z);
  run(e, 25);
  assert.equal(circleLines(watcher.s).length, before + 1, 'Tester7: строка в окне круга');
  placeAt(e.hub, a.c, 0, 0);
  run(e, 1);
  for (let k = 0; k < 3; k++) {
    placeAt(e.hub, a.c, KART_START.x, KART_START.z);
    run(e, 5);
    placeAt(e.hub, a.c, 0, 0);
    run(e, 5);
  }
  assert.equal(circleLines(watcher.s).length, before + 1, 'три захода за полминуты — тишина');
});

test('регата у пирса: строка про круг и «поехали»', () => {
  const e = env({ boatrace: true });
  const watcher = join(e, 'Зритель');
  const a = join(e, 'Tester7');
  placeAt(e.hub, a.c, BOAT_RACE_CIRCLE.x, BOAT_RACE_CIRCLE.z);
  run(e, 3);
  assert.deepEqual(circleLines(watcher.s), ['🚤 Tester7 ждёт в круге «Портовая регата» — 1/6, подходите!']);
  run(e, 9);
  assert.deepEqual(circleLines(watcher.s), ['🚤 Tester7 ждёт в круге «Портовая регата» — 1/6, подходите!', '🚤 Портовая регата: поехали, 1 игрок']);
});

test('регата выключена флагом — круга нет, строк нет', () => {
  const e = env({ boatrace: false });
  const watcher = join(e, 'Зритель');
  const a = join(e, 'Tester7');
  placeAt(e.hub, a.c, BOAT_RACE_CIRCLE.x, BOAT_RACE_CIRCLE.z);
  run(e, 6);
  assert.deepEqual(circleLines(watcher.s), []);
});

test('прятки: двое в круге — строка про первого, второй не успевает (стартовали раньше окна), потом «начинаем, 2 игрока»', () => {
  const e = env({ hide: true });
  const watcher = join(e, 'Зритель');
  const a = join(e, 'Tester7');
  const b = join(e, 'Tester8');
  placeAt(e.hub, a.c, HIDE_CIRCLE.x, HIDE_CIRCLE.z);
  run(e, 3);
  assert.deepEqual(circleLines(watcher.s), ['🔎 Tester7 ждёт в круге «Прятки» — 1/8, подходите!']);
  placeAt(e.hub, b.c, HIDE_CIRCLE.x + 0.5, HIDE_CIRCLE.z);
  run(e, 20);
  assert.equal(a.c.room?.kind, 'hide');
  assert.deepEqual(circleLines(watcher.s), ['🔎 Tester7 ждёт в круге «Прятки» — 1/8, подходите!', '🔎 Прятки: начинаем, 2 игрока']);
});

test('Fight Club: круг у двери — «1/2» для дуэли, потом «бой»', () => {
  const e = env({ fight: true });
  const watcher = join(e, 'Зритель');
  const a = join(e, 'Tester7');
  placeAt(e.hub, a.c, FC_CIRCLE.x, FC_CIRCLE.z);
  run(e, 3);
  assert.deepEqual(circleLines(watcher.s), ['🥊 Tester7 ждёт в круге «Fight Club» — 1/2, подходите!']);
  run(e, 14);
  assert.equal(a.c.room?.kind, 'fight');
  assert.equal(circleLines(watcher.s).at(-1), '🥊 Fight Club: бой, 1 игрок');
});

test('Fight Club выключен флагом — круга нет, строк нет', () => {
  const e = env();
  const watcher = join(e, 'Зритель');
  const a = join(e, 'Tester7');
  placeAt(e.hub, a.c, FC_CIRCLE.x, FC_CIRCLE.z);
  run(e, 6);
  assert.deepEqual(circleLines(watcher.s), []);
});

test('вход в пейнтбол кругом на 3 с и в крепость по E — строки с числом внутри; повторный заход в минуту молчит', () => {
  const e = env({ fort: true });
  const watcher = join(e, 'Зритель');
  const a = join(e, 'Tester7');
  const b = join(e, 'Tester8');
  const [paint, fort] = START_ZONES;
  placeAt(e.hub, a.c, paint.x, paint.z);
  run(e, 3.5);
  assert.equal(a.c.room?.kind, 'paintball');
  assert.deepEqual(circleLines(watcher.s), ['🎯 Tester7 заходит в «Пейнтбол» — внутри 1/16, подходите!']);
  placeAt(e.hub, b.c, fort.x, fort.z);
  run(e, 3.5);
  assert.equal(b.c.room?.kind, 'fort');
  assert.equal(circleLines(watcher.s).at(-1), '🏰 Tester8 заходит в «Крепость» — внутри 1/6, подходите!');
  // Tester8 вышел и зашёл снова — минуты не прошло
  e.hub.move(b.c, e.hub.lobby, true);
  run(e, 3);
  e.hub.move(b.c, e.hub.fort!, true);
  run(e, 1);
  assert.equal(circleLines(watcher.s).length, 2);
  // «Выше облаков»: портал на E; своё окно у каждого входа
  const portal = e.hub.lobby.map.interact.find((i) => i.kind === 'skill')!;
  placeAt(e.hub, watcher.c, portal.x, portal.z);
  e.hub.onJson(watcher.c, { t: 'use', id: portal.id });
  assert.equal(watcher.c.room?.kind, 'skill');
  assert.equal(circleLines(a.s).at(-1), '☁️ Зритель заходит в «Выше облаков» — внутри 1/5, подходите!');
});

test('проверочный вход (ephemeral) в кругу не виден: строк про него нет', () => {
  const e = env();
  const watcher = join(e, 'Зритель');
  const sm = connect(e.hub, '10.9.250.1');
  e.hub.onJson(sm.c, { t: 'hello', v: PROTOCOL_VERSION, smoke: SMOKE });
  assert.ok(sm.c.ephemeral);
  placeAt(e.hub, sm.c, KART_START.x, KART_START.z);
  run(e, 6);
  assert.deepEqual(circleLines(watcher.s), []);
  assert.deepEqual(circleLines(sm.s), []);
});
