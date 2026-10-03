// Серверные границы прогрессии: старые сохранения, авторитетные траты/квесты, одна удочка,
// единая погода и подиум отдельных уловов. Все данные временные, реальные профили не читаются.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import { FISH } from '../shared/fishing.ts';
import { buildFishTop, FishBoard } from '../server/lobby/fishtop.ts';
import { Weather } from '../server/lobby/weather.ts';
import { Profiles } from '../server/profiles.ts';
import { normalizeProfile, Store } from '../server/store.ts';

const dirs: string[] = [];
after(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const sp = (id: string): number => FISH.findIndex((f) => f.id === id);

function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-fish-server-'));
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 2, 12) };
  const store = new Store(dir, { now: () => clock.now, log: () => {}, saveDelayMs: 60_000 });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const login = profiles.login({ key: 'fisher-authority-key-1234', nick: 'Рыболов' }, '');
  assert.ok(login.ok);
  return { dir, clock, store, profiles, p: login.profile };
}

test('старый профиль получает пустую прогрессию, сохраняет прежнюю статистику и восстанавливает максимальный вес настоящей рыбы', () => {
  const p = normalizeProfile({ id: 8, nick: 'Старый', stats: { fsFish: 8, fsGrams: 2400 }, album: { scad: [300, 8], chest: [9000, 1] } })!;
  assert.deepEqual(p.fishing, { xp: 0, questsDone: 0, questCaught: 0, rod: 0, beerUntil: 0 });
  assert.equal(p.stats.fsFish, 8);
  assert.equal(p.stats.fsGrams, 2400);
  assert.equal(p.stats.fsMaxGrams, 300, 'сундук не становится крупнейшей рыбой');
  for (const key of ['fsCasts', 'fsBites', 'fsLost', 'fsEarned'] as const) assert.equal(p.stats[key], 0);
});

test('пиво: сервер снимает ровно15, отклоняет активную повторную покупку и разрешает после10мин без наложения', () => {
  const e = setup();
  assert.equal(e.profiles.buyFishBeer(e.p), 'ok');
  assert.equal(e.p.tokens, 85);
  assert.equal(e.p.fishing.beerUntil, e.clock.now + 600_000);
  assert.equal(e.profiles.buyFishBeer(e.p), 'active');
  assert.equal(e.p.tokens, 85);
  const until = e.p.fishing.beerUntil;
  e.clock.now = until;
  assert.equal(e.profiles.refreshFishing(e.p), true);
  assert.equal(e.p.fishing.beerUntil, 0);
  assert.equal(e.profiles.buyFishBeer(e.p), 'ok');
  assert.equal(e.p.tokens, 70);
  assert.equal(e.p.fishing.beerUntil, until + 600_000);
  e.p.tokens = 14;
  e.clock.now += 600_000;
  assert.equal(e.profiles.buyFishBeer(e.p), 'no_tokens');
  assert.equal(e.p.tokens, 14);
});

test('квесты:5→10→15, серверная награда, избыток не переносится; повтор без нужных рыб не платит', () => {
  const e = setup();
  e.p.fishing.questCaught = 20;
  assert.deepEqual(e.profiles.claimFishQuest(e.p), { ok: true, need: 5, reward: 25, rod: 1 });
  assert.equal(e.p.fishing.questCaught, 0);
  assert.deepEqual(e.profiles.claimFishQuest(e.p), { ok: false });
  e.p.fishing.questCaught = 10;
  assert.deepEqual(e.profiles.claimFishQuest(e.p), { ok: true, need: 10, reward: 50, rod: 1 });
  assert.deepEqual(e.profiles.claimFishQuest(e.p), { ok: false });
  assert.equal(e.p.fishing.questsDone, 2);
  assert.equal(e.p.fishing.questCaught, 0);
  assert.equal(e.p.tokens, 175);
  assert.equal(e.p.stats.fsEarned, 75);
});

test('удочки после1/5/10 квестов: лучшая новая выбирается; одну заработанную можно выбрать, поддельные/дробные нельзя', () => {
  const e = setup();
  for (const bad of [1, 2, 3, -1, 0.5, NaN, '0', undefined]) assert.equal(e.profiles.equipFishRod(e.p, bad), false);
  assert.equal(e.profiles.equipFishRod(e.p, 0), true);
  let reward = 0;
  for (let i = 1; i <= 10; i++) {
    e.p.fishing.questCaught += i * 5;
    const got = e.profiles.claimFishQuest(e.p);
    assert.ok(got.ok);
    reward += i * 25;
    assert.equal(got.need, i * 5);
    assert.equal(got.reward, i * 25);
    assert.equal(e.p.fishing.rod, i >= 10 ? 3 : i >= 5 ? 2 : 1);
  }
  assert.equal(e.p.tokens, 100 + reward);
  assert.equal(e.profiles.equipFishRod(e.p, 1), true);
  assert.equal(e.p.fishing.rod, 1);
  assert.equal(e.profiles.equipFishRod(e.p, 4), false);
});

test('прогресс и подиум переживают атомарную запись и перезапуск без начисления повторных наград', () => {
  const e = setup();
  e.p.fishing = { xp: 15000, questsDone: 10, questCaught: 2, rod: 3, beerUntil: e.clock.now + 500000 };
  e.p.stats.fsCasts = 40;
  e.p.stats.fsBites = 38;
  e.p.stats.fsLost = 5;
  e.p.stats.fsMaxGrams = 400;
  e.p.stats.fsEarned = 90;
  e.store.state.fishPodium = { day: '2026-10-02', catches: [{ pid: e.p.id, nick: e.p.nick, sp: sp('scad'), g: 400, at: e.clock.now }] };
  e.store.markDirty();
  e.store.close();
  const restored = new Store(e.dir, { now: () => e.clock.now, log: () => {} });
  restored.load();
  assert.deepEqual(restored.state.profiles[0].fishing, e.p.fishing);
  assert.equal(restored.state.profiles[0].stats.fsEarned, 90);
  assert.equal(restored.state.profiles[0].stats.fsCasts, 40);
  assert.deepEqual(restored.state.profiles[0].stats, e.p.stats, 'все новые и старые счётчики сохраняются');
  assert.deepEqual(restored.state.fishPodium, e.store.state.fishPodium);
  const profiles = new Profiles(restored, { now: () => e.clock.now });
  assert.deepEqual(profiles.claimFishQuest(restored.state.profiles[0]), { ok: false });
  assert.equal(restored.state.profiles[0].tokens, 100);
  restored.close();
});

test('обычный дождь длится4м48с–8мин; бубен вызывает тот же дождь и не продлевает активный', () => {
  const clock = { now: Date.UTC(2026, 9, 2, 12) };
  const natural = new Weather(() => 0, 'auto', 0, () => clock.now);
  const start = natural.until;
  assert.equal(natural.step(start), true);
  assert.equal(natural.until - start, 288 * TICK_RATE);
  const forced = new Weather(() => 0, 'auto', 0, () => clock.now);
  assert.equal(forced.startRain(77), true);
  assert.equal(forced.until, 77 + 288 * TICK_RATE);
  assert.equal(forced.eventUntil, clock.now + 288000);
  assert.equal(forced.startRain(88), false);
  assert.equal(forced.until, 77 + 288 * TICK_RATE);
  clock.now += 288000;
  assert.equal(forced.step(78), true, 'событие кончается и после паузы тиков');
  assert.equal(forced.rain, false);
  assert.equal(forced.eventUntil, 0);
});

test('подписанные крупнейшие отдельных улова одного игрока не сворачиваются в личный рекорд; равный вес сохраняет ранний улов', () => {
  const e = setup();
  const at = e.clock.now;
  const top = buildFishTop([e.p], at, [
    { pid: e.p.id, nick: 'Старый ник', sp: sp('scad'), g: 800, at: at - 1000 },
    { pid: e.p.id, nick: e.p.nick, sp: sp('goby'), g: 900, at },
    { pid: e.p.id, nick: e.p.nick, sp: sp('scad'), g: 800, at: at - 2000 },
    { pid: e.p.id, nick: e.p.nick, sp: sp('scad'), g: 100, at },
  ]);
  assert.deepEqual(top.podium.map((c) => [c.g, c.at]), [[900, at], [800, at - 2000], [800, at - 1000], [100, at]]);
  assert.deepEqual(top.podium.map((c) => c.nick), ['Рыболов', 'Рыболов', 'Рыболов', 'Рыболов']);
  assert.deepEqual(top.dn, []);
});

test('подпись подиума обновляется с ником, в московскую полночь подиум сбрасывается, четыре списка сохраняются', () => {
  const e = setup();
  e.p.stats.fsFish = 4;
  e.p.stats.fsGrams = 2000;
  const board = new FishBoard(e.store, () => e.clock.now);
  board.record(e.p, sp('scad'), 400);
  board.record(e.p, sp('scad'), 500);
  assert.deepEqual(board.top.podium.map((c) => c.g), [500, 400]);
  e.p.nick = 'Новый ник';
  board.touch();
  assert.equal(board.check()!.podium[0].nick, 'Новый ник');
  e.clock.now = Date.UTC(2026, 9, 2, 21);
  const next = board.check()!;
  assert.deepEqual(next.podium, []);
  assert.deepEqual(e.store.state.fishPodium, { day: '2026-10-03', catches: [] });
  assert.equal(next.an[0].v, 4);
  assert.equal(next.ag[0].v, 2000);
  assert.deepEqual(next.dn, []);
  assert.deepEqual(next.dg, []);
});

test('свежий welcome подиума не поглощает обновление для уже присутствующих игроков', () => {
  const e = setup();
  const board = new FishBoard(e.store, () => e.clock.now);
  board.record(e.p, sp('scad'), 400);
  assert.equal(board.top.podium[0].g, 400);
  assert.equal(board.check()!.podium[0].g, 400, 'следующая рассылка всё ещё содержит новый улов');
  assert.equal(board.check(), null);
});

test('старый v1 файл безопасно мигрирует; повреждённый timestamp подиума не уничтожает исправные профили', () => {
  const e = setup();
  writeFileSync(path.join(e.dir, 'state.json'), JSON.stringify({ v: 1, nextId: 9, jackpot: 1000,
    profiles: [{ id: 8, nick: 'Старый', tokens: 90, stats: { fsFish: 8, fsGrams: 2400 }, album: { scad: [300, 8] } }],
    fishPodium: { day: '2026-10-02', catches: [{ pid: 8, nick: 'Старый', sp: sp('scad'), g: 400, at: 8_640_000_000_000_000 }] },
  }));
  const migrated = new Store(e.dir, { now: () => e.clock.now, log: () => {} });
  migrated.load();
  assert.equal(migrated.state.profiles.length, 1);
  assert.deepEqual(migrated.state.profiles[0].fishing, { xp: 0, questsDone: 0, questCaught: 0, rod: 0, beerUntil: 0 });
  assert.equal(migrated.state.profiles[0].tokens, 90);
  assert.equal(migrated.state.profiles[0].stats.fsFish, 8);
  assert.equal(migrated.state.profiles[0].stats.fsMaxGrams, 300);
  assert.deepEqual(migrated.state.fishPodium.catches, []);
  migrated.markDirty();
  migrated.close();
  const again = new Store(e.dir, { now: () => e.clock.now, log: () => {} });
  again.load();
  assert.equal(again.state.profiles[0].tokens, 90);
  assert.equal(again.state.profiles[0].stats.fsFish, 8);
  assert.deepEqual(again.state.profiles[0].fishing, migrated.state.profiles[0].fishing);
  again.close();
});
