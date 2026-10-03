// Музыкальный автомат: очередь и время (server/lobby/jukebox.ts) и заказ через настоящий хаб — жетоны, отказы без
// списания, рассылка, вошедший позже, флаг.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { JUKE_GAP_MS, JUKE_LEAD_MS, JUKE_PRICE, JUKE_QUEUE_MAX, JUKE_SONGS, JUKE_USE, jukeGain, songMs, songPrice, songSeconds, songSpecial } from '../shared/jukebox.ts';
import { Hub, type Client } from '../server/hub.ts';
import { Jukebox } from '../server/lobby/jukebox.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { SMOKE, allOf, lastOf, login, newKey, placeAt, type FakeSink } from './kit.ts';

const dirs: string[] = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function env(jukebox = true) {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-juke-'));
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 3, 18) };
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now: () => clock.now });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({ store, profiles, smokeToken: SMOKE, build: 'test', now: () => clock.now, log: () => {}, weather: 'clear', jukebox });
  return { hub, clock, profiles };
}

/** Вошёл и стоит перед автоматом (с разных адресов: новых профилей с одного — не больше 5 в час) */
let ip = 0;
function player(e: ReturnType<typeof env>, nick: string): { c: Client; s: FakeSink } {
  const r = login(e.hub, nick, newKey(), `10.0.1.${++ip}`);
  placeAt(e.hub, r.c, JUKE_USE.x, JUKE_USE.z);
  return r;
}

const order = (e: ReturnType<typeof env>, c: Client, song: unknown): void => { e.hub.onJson(c, { t: 'juke', song } as never); e.clock.now += 2000; };

test('каталог: 9 песен по 60–120 с; цена — обычная 10, особая (девятая) 200; громкость — полная до 12 м, дальше до 40 %', () => {
  assert.equal(JUKE_SONGS.length, 9);
  assert.equal(new Set(JUKE_SONGS.map((s) => s.id)).size, 9);
  for (const s of JUKE_SONGS) assert.ok(songSeconds(s) >= 60 && songSeconds(s) <= 120, `${s.id}: ${songSeconds(s)} с`);
  JUKE_SONGS.forEach((_, i) => {
    assert.equal(songPrice(i), i === 8 ? 200 : JUKE_PRICE, `цена песни ${i}`);
    assert.equal(songSpecial(i), i === 8);
  });
  assert.equal(songPrice(99), JUKE_PRICE);
  assert.equal(jukeGain(0), 1);
  assert.equal(jukeGain(12), 1);
  assert.ok(jukeGain(25) < 1 && jukeGain(25) > 0.4);
  assert.equal(jukeGain(200), 0.4);
  for (let d = 0; d < 60; d++) assert.ok(jukeGain(d + 1) <= jukeGain(d), 'громкость не растёт с расстоянием');
});

test('очередь: первая песня — через паузу на загрузку, следующие — встык через паузу, по часам и задним числом', () => {
  const j = new Jukebox();
  const t0 = 1_000_000;
  assert.equal(j.check(1, 0, t0), null);
  j.add(1, 'A', 0, t0);
  assert.deepEqual(j.cur, { song: 0, pid: 1, nick: 'A', start: t0 + JUKE_LEAD_MS });
  j.add(2, 'B', 1, t0 + 10);
  j.add(3, 'C', 2, t0 + 20);
  assert.equal(j.queue.length, 2);
  const end0 = t0 + JUKE_LEAD_MS + songMs(0);
  assert.equal(j.step(end0 - 1), false);
  assert.equal(j.step(end0), true);
  assert.equal(j.cur?.song, 1);
  assert.equal(j.cur?.start, end0 + JUKE_GAP_MS);
  // сервер «спал» до середины третьей песни: вторая доиграла сама, третья — с верного места
  const start2 = end0 + JUKE_GAP_MS + songMs(1) + JUKE_GAP_MS;
  j.step(start2 + 5000);
  assert.equal(j.cur?.song, 2);
  assert.equal(j.cur?.start, start2);
  assert.equal(j.queue.length, 0);
  j.step(start2 + songMs(2));
  assert.equal(j.cur, null);
});

test('отказы: нет песни, своя уже ждёт, очередь до 5, повтор той, что играет или ждёт', () => {
  const j = new Jukebox();
  const t = 5_000;
  for (const bad of [-1, JUKE_SONGS.length, 1.5, '1', null]) assert.equal(j.check(1, bad, t), 'song');
  j.add(1, 'A', 0, t);
  // своя играет — можно поставить ещё одну; своя ждёт — нельзя
  assert.equal(j.check(1, 1, t), null);
  j.add(1, 'A', 1, t);
  assert.equal(j.check(1, 2, t), 'mine');
  assert.equal(j.check(2, 0, t), 'same');
  assert.equal(j.check(2, 1, t), 'same');
  for (let pid = 2; pid <= JUKE_QUEUE_MAX; pid++) j.add(pid, `P${pid}`, pid, t);
  assert.equal(j.queue.length, JUKE_QUEUE_MAX);
  assert.equal(j.check(99, 7, t), 'full');
});

test('заказ через хаб: −10 🪙, всем — что играет, строка в чат; вошедший позже слышит то же место', () => {
  const e = env();
  const a = player(e, 'Tester1');
  const before = a.c.profile!.tokens;
  const t0 = e.clock.now;
  order(e, a.c, 3);
  assert.equal(a.c.profile!.tokens, before - JUKE_PRICE);
  assert.equal(lastOf(a.s, 'jukeRes')?.ok, true);
  const v = lastOf(a.s, 'juke')!.v;
  assert.equal(v.cur?.song, 3);
  assert.equal(v.cur?.nick, 'Tester1');
  assert.equal(v.cur?.start, t0 + JUKE_LEAD_MS);
  assert.ok(allOf(a.s, 'chat').some((m) => m.sys && m.text === `🎵 Tester1 ставит «${JUKE_SONGS[3].title}»`));
  assert.equal(lastOf(a.s, 'tokens')?.n, a.c.profile!.tokens);
  // через 40 с входит второй: ему — та же песня и то же время старта, место песни = now − start
  e.clock.now = t0 + JUKE_LEAD_MS + 40_000;
  const b = login(e.hub, 'Tester2');
  const late = lastOf(b.s, 'juke')!.v;
  assert.equal(late.cur?.song, 3);
  assert.equal(late.cur?.start, t0 + JUKE_LEAD_MS);
  assert.equal(late.now - late.cur!.start, 40_000);
  // песня кончилась — следующей нет: шаг комнаты рассылает тишину
  e.clock.now = t0 + JUKE_LEAD_MS + songMs(3) + 10;
  for (let i = 0; i < 10; i++) e.hub.step();
  assert.equal(lastOf(b.s, 'juke')!.v.cur, null);
});

test('отказ — без списания: далеко, нет жетонов, своя ждёт, повтор, полная очередь, слишком часто', () => {
  const e = env();
  const a = player(e, 'Tester1');
  const prof = a.c.profile!;
  const tokens = (): number => prof.tokens;
  let was = tokens();
  // далеко от автомата
  placeAt(e.hub, a.c, JUKE_USE.x + 8, JUKE_USE.z);
  order(e, a.c, 0);
  assert.equal(tokens(), was);
  assert.match(lastOf(a.s, 'jukeRes')!.text, /Подойди/);
  placeAt(e.hub, a.c, JUKE_USE.x, JUKE_USE.z);
  // нет такой песни
  order(e, a.c, 42);
  assert.equal(tokens(), was);
  assert.equal(lastOf(a.s, 'jukeRes')!.ok, false);
  // не хватает жетонов
  prof.tokens = JUKE_PRICE - 1;
  was = tokens();
  order(e, a.c, 0);
  assert.equal(tokens(), was);
  assert.match(lastOf(a.s, 'jukeRes')!.text, /стоит 10/);
  prof.tokens = 500;
  // первая — играет, вторая — ждёт; третья своя — нельзя
  order(e, a.c, 0);
  order(e, a.c, 1);
  was = tokens();
  order(e, a.c, 2);
  assert.equal(tokens(), was);
  assert.match(lastOf(a.s, 'jukeRes')!.text, /уже в очереди/);
  // повтор той, что играет
  const b = player(e, 'Tester2');
  const bWas = b.c.profile!.tokens;
  order(e, b.c, 0);
  assert.equal(b.c.profile!.tokens, bWas);
  assert.match(lastOf(b.s, 'jukeRes')!.text, /играет/);
  // слишком часто: два заказа подряд без паузы
  e.hub.onJson(b.c, { t: 'juke', song: 4 });
  e.hub.onJson(b.c, { t: 'juke', song: 5 });
  assert.equal(b.c.profile!.tokens, bWas - JUKE_PRICE);
  assert.match(lastOf(b.s, 'jukeRes')!.text, /Не так быстро/);
  // очередь до 5: заполняем другими игроками
  e.clock.now += 2000;
  const others = ['Tester3', 'Tester4', 'Tester5'].map((n) => player(e, n));
  others.forEach((o, i) => order(e, o.c, 5 + i));
  assert.equal(e.hub.lobby.juke!.queue.length, 5);
  const f = player(e, 'Tester6');
  const fWas = f.c.profile!.tokens;
  order(e, f.c, 3);
  assert.equal(f.c.profile!.tokens, fWas);
  assert.match(lastOf(f.s, 'jukeRes')!.text, /полная/);
});

test('особая песня: списывается её цена (200 🪙); не хватает — отказ без списания, очередь не тронута', () => {
  const e = env();
  const special = JUKE_SONGS.findIndex((_, i) => songSpecial(i));
  const price = songPrice(special);
  assert.equal(price, 200);
  const juke = () => e.hub.lobby.juke!;
  const a = player(e, 'Tester1');
  const prof = a.c.profile!;
  prof.tokens = price - 1;
  order(e, a.c, special);
  assert.equal(prof.tokens, price - 1);
  assert.equal(lastOf(a.s, 'jukeRes')!.ok, false);
  assert.match(lastOf(a.s, 'jukeRes')!.text, /стоит 200 🪙, а у тебя 199/);
  assert.equal(juke().cur, null);
  assert.equal(juke().queue.length, 0);
  prof.tokens = price + 5;
  order(e, a.c, special);
  assert.equal(prof.tokens, 5);
  assert.equal(lastOf(a.s, 'jukeRes')!.ok, true);
  assert.equal(juke().cur?.song, special);
  assert.equal(lastOf(a.s, 'tokens')?.n, 5);
  assert.ok(allOf(a.s, 'chat').some((m) => m.sys && m.text === `🎵 Tester1 ставит «${JUKE_SONGS[special].title}»`));
  // обычная после неё — по обычной цене
  const b = player(e, 'Tester2');
  const bWas = b.c.profile!.tokens;
  order(e, b.c, 0);
  assert.equal(b.c.profile!.tokens, bWas - JUKE_PRICE);
  assert.equal(juke().queue[0]?.song, 0);
});

test('без флага JUKEBOX автомата нет: ни состояния, ни заказа, коллизия корпуса выключена', () => {
  const e = env(false);
  const a = player(e, 'Tester1');
  const was = a.c.profile!.tokens;
  assert.equal(e.hub.lobby.juke, null);
  assert.equal(lastOf(a.s, 'juke'), undefined);
  order(e, a.c, 0);
  assert.equal(a.c.profile!.tokens, was);
  assert.equal(lastOf(a.s, 'jukeRes'), undefined);
  const box = e.hub.lobby.map.boxes[e.hub.lobby.map.jukeBoxes[0]];
  const cx = (box.min[0] + box.max[0]) / 2, cz = (box.min[2] + box.max[2]) / 2;
  assert.equal(e.hub.lobby.world.overlaps(cx - 0.1, 0.5, cz - 0.1, cx + 0.1, 1, cz + 0.1), false);
  const on = env(true);
  assert.equal(on.hub.lobby.world.overlaps(cx - 0.1, 0.5, cz - 0.1, cx + 0.1, 1, cz + 0.1), true);
});
