// Сезон рыбалки (патч 04.10): раз в 2 часа — в чётный час по Москве — особый дождь ровно на 10 минут. Расписание — по
// серверным часам, у всех одно и переживает перезапуск; начало и конец — fishSeason всем на набережной и строка в чат;
// погода на время сезона держит дождь (k = 3) и в конце сезона его заканчивает; /season — сезон сразу (разработка).
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import { FishSeason, SEASON_EVERY_MS, SEASON_MS, mskClock, seasonAt } from '../server/lobby/fishseason.ts';
import { Weather } from '../server/lobby/weather.ts';
import { Hub } from '../server/hub.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { makeRng } from '../shared/math.ts';
import { SMOKE, allOf, lastOf, login } from './kit.ts';

const dirs: string[] = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

/** 18:00 по Москве 4 октября */
const T18 = Date.UTC(2026, 9, 4, 15, 0);
const MIN = 60_000;

test('расписание: каждые 2 часа в чётный час по Москве, ровно 10 минут; endsAt и nextAt', () => {
  assert.equal(SEASON_EVERY_MS, 2 * 3600_000);
  assert.equal(SEASON_MS, 10 * MIN);
  assert.equal(mskClock(T18), '18:00');
  assert.deepEqual(seasonAt(T18), { on: true, endsAt: T18 + 10 * MIN, nextAt: T18 + 120 * MIN });
  assert.deepEqual(seasonAt(T18 + 10 * MIN - 1), { on: true, endsAt: T18 + 10 * MIN, nextAt: T18 + 120 * MIN });
  assert.deepEqual(seasonAt(T18 + 10 * MIN), { on: false, endsAt: T18 + 130 * MIN, nextAt: T18 + 120 * MIN });
  assert.deepEqual(seasonAt(T18 - 1), { on: false, endsAt: T18 + 10 * MIN, nextAt: T18 });
  assert.equal(seasonAt(T18 + 60 * MIN).on, false, '19:00 — нечётный час, сезона нет');
  // сутки: 12 сезонов, все в чётные часы по Москве
  const starts: string[] = [];
  for (let t = T18 - 18 * 3600_000; t < T18 + 6 * 3600_000; t += MIN) if (seasonAt(t).on && !seasonAt(t - MIN).on) starts.push(mskClock(t));
  assert.deepEqual(starts, ['00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00']);
});

test('смена сезона: первый шаг после запуска ничего не объявляет (перезапуск посреди сезона — сезон просто идёт); /season — сразу на 10 минут', () => {
  const clock = { now: T18 - 1000 };
  const s = new FishSeason(() => clock.now);
  assert.equal(s.step(), null);
  clock.now = T18;
  assert.equal(s.step(), 'start');
  assert.equal(s.step(), null);
  clock.now = T18 + 10 * MIN;
  assert.equal(s.step(), 'end');
  // перезапуск посреди сезона: тот же сезон, без второго объявления
  const again = new FishSeason(() => T18 + 5 * MIN);
  assert.equal(again.on, true);
  assert.equal(again.step(), null);
  // команда: вне расписания — сразу, на SEASON_MS; во время сезона — нельзя
  clock.now = T18 + 60 * MIN;
  assert.equal(s.on, false);
  assert.equal(s.force(), true);
  assert.deepEqual(s.view(), { on: true, endsAt: clock.now + SEASON_MS, nextAt: T18 + 120 * MIN });
  assert.equal(s.step(), 'start');
  assert.equal(s.force(), false, 'уже идёт');
  clock.now += SEASON_MS;
  assert.equal(s.step(), 'end');
});

test('погода: сезон — сам дождь (k = 3) до конца сезона; идущий дождь продлевается; бесконечный дождь разработки не трогаем', () => {
  let now = T18;
  const w = new Weather(makeRng(3), 'auto', 0, () => now);
  assert.equal(w.rain, false);
  assert.equal(w.holdRain(10, now + SEASON_MS), true);
  assert.equal(w.rain, true);
  assert.equal(w.wire!.k, 3, 'особый дождь сезона');
  assert.equal(w.eventUntil, now + SEASON_MS);
  assert.equal(w.holdRain(11, now + SEASON_MS), false, 'уже держит — без перемен');
  now += SEASON_MS;
  assert.equal(w.step(10 + SEASON_MS * TICK_RATE / 1000), true, 'сезон кончился — кончился и дождь');
  assert.equal(w.rain, false);
  // обычный дождь короче сезона — продлевается до конца сезона
  const r = new Weather(makeRng(4), 'auto', 0, () => now);
  r.startRain(0);
  const short = r.eventUntil;
  assert.equal(r.holdRain(1, short + 5 * MIN), true);
  assert.equal(r.eventUntil, short + 5 * MIN);
  // DEV_WEATHER=rain — дождь и так всегда
  assert.equal(new Weather(Math.random, 'rain', 0, () => now).holdRain(0, now + SEASON_MS), false);
});

test('сервер: в 18:00 по Москве — fishSeason всем, строка в чат и особый дождь; вошедшему — сразу; в 18:10 — конец и время следующего; /season — только на разработке', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-fishseason-'));
  dirs.push(dir);
  const clock = { now: T18 - 2000 };
  const store = new Store(dir, { now: () => clock.now, log: () => {}, saveDelayMs: 60_000 });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({ store, profiles, now: () => clock.now, log: () => {}, build: 'test', smokeToken: SMOKE, fish2: true, weather: 'clear' });
  const step = (n = 1) => { for (let i = 0; i < n; i++) { clock.now += 1000 / TICK_RATE; hub.step(); } };
  const a = login(hub, 'Tester7');
  assert.equal(lastOf(a.s, 'fishSeason')!.on, false, 'при входе — ясно, сезона нет');
  step(10);
  assert.equal(allOf(a.s, 'fishSeason').length, 1, 'до 18:00 — ничего нового');
  step(2 * TICK_RATE);
  const on = lastOf(a.s, 'fishSeason')!;
  assert.deepEqual(on, { t: 'fishSeason', on: true, endsAt: T18 + 10 * MIN, nextAt: T18 + 120 * MIN });
  assert.ok(allOf(a.s, 'chat').some((m) => m.sys && /Начался сезон рыбалки/.test(m.text)), 'строка в чат');
  const wx = lastOf(a.s, 'weather')!;
  assert.equal(wx.rain, 1);
  assert.equal(wx.wx!.k, 3, 'особый дождь сезона');
  assert.equal(hub.lobby.fishSeason!.on, true);
  // вошедший во время сезона узнаёт сразу
  const b = login(hub, 'Tester8');
  assert.equal(lastOf(b.s, 'fishSeason')!.on, true);
  // конец
  clock.now = T18 + 10 * MIN - 500;
  step(TICK_RATE);
  const off = lastOf(a.s, 'fishSeason')!;
  assert.deepEqual(off, { t: 'fishSeason', on: false, endsAt: T18 + 130 * MIN, nextAt: T18 + 120 * MIN });
  assert.ok(allOf(a.s, 'chat').some((m) => m.sys && /Сезон рыбалки закончился\. Следующий — в 20:00 по Москве/.test(m.text)));
  assert.equal(lastOf(a.s, 'weather')!.rain, 0, 'дождь сезона кончился вместе с ним');
  // /season: без флага разработки — не команда; с ним — сезон сразу
  clock.now = T18 + 60 * MIN;
  step(1);
  const before = allOf(a.s, 'fishSeason').length;
  hub.onJson(a.c, { t: 'chat', text: '/season' });
  step(1);
  assert.equal(allOf(a.s, 'fishSeason').length, before, 'без DEV_GO — не сезон');
  hub.gate.devGo = true;
  clock.now += 6000;
  hub.onJson(a.c, { t: 'chat', text: '/season' });
  assert.equal(lastOf(a.s, 'fishSeason')!.on, true, 'сезон сразу');
  assert.equal(lastOf(a.s, 'fishSeason')!.endsAt, clock.now + SEASON_MS);
  clock.now += 6000;
  hub.onJson(a.c, { t: 'chat', text: '/season' });
  assert.match(lastOf(a.s, 'chat')!.text, /уже идёт/);
});
