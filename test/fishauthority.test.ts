// Авторитетная граница NPC/вываживания через настоящие Hub/LobbyRoom и временное хранилище.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import { FISHER_USE } from '../shared/fishplaces.ts';
import { FE_BITE, FISH, FP_BITE, FP_IDLE, FP_REEL } from '../shared/fishing.ts';
import { fishCatchXp, type FishCastMods } from '../shared/fishprogress.ts';
import { reelRun, reelStart } from '../shared/fishreel.ts';
import { COLLECTION, NEW_BONUS2, REWARD_ITEMS, SP_BOOT, SP_CHEST, fishPrice2, reelStyleFor, type Hooked } from '../shared/fishrules.ts';
import { Hub, type Room } from '../server/hub.ts';
import { type FishingHall2 } from '../server/lobby/fishing2.ts';
import type { WeatherMode } from '../server/lobby/weather.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { EXPERT, playReel, type Play } from './fishbot.ts';
import { SMOKE, allOf, lastOf, login, placeAt } from './kit.ts';

const dirs: string[] = [];
after(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const sp = (id: string): number => FISH.findIndex((f) => f.id === id);

function setup(o: { fish2?: boolean; rain?: boolean; rooms?: boolean; weather?: WeatherMode } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-fish-authority-'));
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 2, 12) };
  const store = new Store(dir, { now: () => clock.now, log: () => {}, saveDelayMs: 60_000 });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({ store, profiles, now: () => clock.now, log: () => {}, build: 'test', smokeToken: SMOKE,
    fish2: o.fish2 ?? true, weather: o.weather ?? (o.rain ? 'rain' : 'clear'), fort: o.rooms, fight: o.rooms });
  const a = login(hub, 'Рыболов');
  return { hub, store, profiles, clock, a };
}

function advance(e: ReturnType<typeof setup>, n: number): void {
  for (let i = 0; i < n; i++) { e.clock.now += 1000 / TICK_RATE; e.hub.step(); }
}

function npc(e: ReturnType<typeof setup>): void {
  placeAt(e.hub, e.a.c, FISHER_USE.x, FISHER_USE.z, FISHER_USE.y);
}

function sit(e: ReturnType<typeof setup>, what: Hooked) {
  const it = e.hub.lobby.map.interact.find((i) => i.kind === 'fish' && i.arg === 0)!;
  placeAt(e.hub, e.a.c, it.x, it.z);
  e.hub.onJson(e.a.c, { t: 'use', id: it.id });
  const hall = e.hub.lobby.fishing2 as FishingHall2;
  assert.ok(hall);
  hall.rand = () => .5;
  hall.roll = () => ({ ...what });
  return hall;
}

function bite(e: ReturnType<typeof setup>, hall: FishingHall2): void {
  e.hub.onJson(e.a.c, { t: 'fish', a: 'cast' });
  for (let i = 0; i < 30 * TICK_RATE && hall.phase(0) !== FP_BITE; i++) advance(e, 1);
  assert.equal(hall.phase(0), FP_BITE);
}

function hook(e: ReturnType<typeof setup>, hall: FishingHall2) {
  bite(e, hall);
  advance(e, 2); // дождаться пакета события поплавка, как настоящий клиент
  const events = allOf(e.a.s, 'lev').flatMap((m) => m.e).filter((ev) => ev[0] === 'fish' && ev[1] === FE_BITE);
  e.hub.onJson(e.a.c, { t: 'fish', a: 'hook', n: events.at(-1)![3] });
  const m = lastOf(e.a.s, 'fishReel')!;
  assert.ok(m);
  return m;
}

function playHonest(e: ReturnType<typeof setup>, p: Play): void {
  let sent = 0;
  for (let u = 0; u < p.ticks;) {
    const next = Math.min(p.ticks, u + 15);
    advance(e, next - u);
    const i = sent;
    const k: number[] = [];
    while (sent < p.toggles.length && p.toggles[sent] < next) k.push(p.toggles[sent++]);
    e.hub.onJson(e.a.c, { t: 'reel', i, k, u: next, ...(next === p.ticks ? { d: 1 } : {}) });
    u = next;
  }
}

/** Для тяжёлой событийной рыбы выбираем выигрышный seed из ограниченного набора, сохраняя настоящий server replay. */
function hookWinning(e: ReturnType<typeof setup>, hall: FishingHall2, species: number): Play {
  bite(e, hall);
  advance(e, 2);
  const mods = hall.views()[0].mods!;
  const style = reelStyleFor(species, mods);
  let seed = 0;
  let play: Play | undefined;
  for (let candidate = 1; candidate <= 100; candidate++) {
    const trial = playReel(style, candidate, EXPERT);
    if (trial.caught) { seed = candidate; play = trial; break; }
  }
  assert.ok(play, 'на ограниченном наборе seed опытный рыбак вытаскивает вид');
  const events = allOf(e.a.s, 'lev').flatMap((m) => m.e).filter((ev) => ev[0] === 'fish' && ev[1] === FE_BITE);
  const rand = hall.rand;
  hall.rand = () => (seed >>> 0) / 0x1_0000_0000;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'hook', n: events.at(-1)![3] });
  hall.rand = rand;
  assert.equal(lastOf(e.a.s, 'fishReel')!.seed, seed);
  return play;
}

test('NPC нельзя покупать издали, с другого этажа, из другой комнаты или при выключенной рыбалке2', () => {
  const e = setup();
  const p = e.a.c.profile!;
  e.hub.onJson(e.a.c, { t: 'fishNpc', a: 'beer' });
  assert.equal(p.tokens, 100);
  assert.equal(lastOf(e.a.s, 'fishNpc')!.open, false);
  assert.ok(lastOf(e.a.s, 'fishNpc')!.message);
  e.clock.now += 1100;
  npc(e);
  e.hub.lobby.playerOf(e.a.c)!.state.y = FISHER_USE.y + 2;
  e.hub.onJson(e.a.c, { t: 'fishNpc', a: 'beer' });
  assert.equal(p.tokens, 100);
  e.hub.move(e.a.c, e.hub.paintball, true);
  e.hub.onJson(e.a.c, { t: 'fishNpc', a: 'beer' });
  assert.equal(p.tokens, 100);
  const old = setup({ fish2: false });
  npc(old);
  old.hub.onJson(old.a.c, { t: 'fishNpc', a: 'beer' });
  assert.equal(old.a.c.profile!.tokens, 100);
});

test('NPC не доверяет price/xp/coins клиента; E открывает окно, пиво и квест возвращают авторитетные данные', () => {
  const e = setup();
  npc(e);
  const it = e.hub.lobby.map.interact.find((i) => i.kind === 'fisher')!;
  e.hub.onJson(e.a.c, { t: 'use', id: it.id });
  assert.equal(lastOf(e.a.s, 'fishNpc')!.open, true);
  e.hub.onJson(e.a.c, { t: 'fishNpc', a: 'beer', price: 0, xp: 15000, coins: 999999 });
  const p = e.a.c.profile!;
  assert.equal(p.tokens, 85);
  assert.equal(p.fishing.xp, 0);
  assert.equal(p.fishing.beerUntil, e.clock.now + 600000);
  assert.equal(lastOf(e.a.s, 'fishProgress')!.progress.beerUntil, p.fishing.beerUntil);
  e.hub.onJson(e.a.c, { t: 'fishNpc', a: 'beer' });
  assert.equal(p.tokens, 85);
  assert.ok(lastOf(e.a.s, 'fishNpc')!.message);
  e.hub.onJson(e.a.c, { t: 'fishNpc', a: 'claim', caught: 5, reward: 999999 });
  assert.equal(p.tokens, 85);
  assert.equal(p.fishing.questsDone, 0);
  e.clock.now += 1100;
  p.fishing.questCaught = 5;
  e.hub.onJson(e.a.c, { t: 'fishNpc', a: 'claim' });
  e.hub.onJson(e.a.c, { t: 'fishNpc', a: 'claim' });
  assert.equal(p.tokens, 110);
  assert.equal(p.fishing.questsDone, 1);
  assert.equal(p.fishing.rod, 1);
  assert.equal(lastOf(e.a.s, 'me')!.fishing.questsDone, 1);
});

test('NPC сообщает о rate limit, чтобы клиент вышел из ожидания; отклонённый выбор не меняет удочку или баланс', () => {
  const e = setup();
  npc(e);
  e.a.c.profile!.fishing.questsDone = 10;
  e.hub.onJson(e.a.c, { t: 'fishNpc', a: 'open' });
  for (const rod of [0, 1, 2, 3, 0, 3]) e.hub.onJson(e.a.c, { t: 'fishNpc', a: 'rod', rod });
  assert.equal(allOf(e.a.s, 'fishNpc').length, 7, 'каждый запрос получает ответ, включая ограниченный');
  const reply = lastOf(e.a.s, 'fishNpc')!;
  assert.ok(reply.message);
  assert.equal(reply.open, true);
  assert.equal(reply.progress.rod, 0, 'последний запрос был отклонён');
  assert.equal(e.a.c.profile!.tokens, 100);
});

test('рыболовное событие от бубна разослано игрокам всех5комнат; активное не продаётся; оно кончается при пустой набережной', () => {
  const e = setup({ rooms: true });
  const players = [e.a, login(e.hub, 'Склад'), login(e.hub, 'Гонщик'), login(e.hub, 'Крепость'), login(e.hub, 'Боец')];
  e.hub.race.open();
  e.hub.fight!.open('duel', [players[4].c.pid]);
  const rooms: Room[] = [e.hub.lobby, e.hub.paintball, e.hub.race, e.hub.fort!, e.hub.fight!];
  for (let i = 1; i < players.length; i++) assert.equal(e.hub.move(players[i].c, rooms[i], true), true);
  npc(e);
  e.a.c.profile!.tokens = 1000;
  e.hub.onJson(e.a.c, { t: 'fishNpc', a: 'rain' });
  assert.equal(e.a.c.profile!.tokens, 500);
  const event = lastOf(e.a.s, 'fishEvent')!;
  assert.equal(event.on, true);
  assert.ok(event.until >= e.clock.now + 288000 && event.until <= e.clock.now + 480000);
  for (const a of players) assert.deepEqual(lastOf(a.s, 'fishEvent'), event);
  e.hub.onJson(e.a.c, { t: 'fishNpc', a: 'rain' });
  assert.equal(e.a.c.profile!.tokens, 500);
  assert.equal(allOf(e.a.s, 'fishEvent').filter((m) => m.on).length, 1);
  assert.equal(e.hub.move(e.a.c, e.hub.paintball, true), true);
  assert.equal(e.hub.lobby.humans, 0);
  e.clock.now = event.until;
  e.hub.step();
  assert.equal(e.hub.lobby.weather.rain, false);
  for (const a of players) assert.deepEqual(lastOf(a.s, 'fishEvent'), { t: 'fishEvent', on: false, until: 0 });
});

test('реконнект восстанавливает сохранённый прогресс и серверные часы; expiry уведомляет и вне набережной', () => {
  const e = setup();
  npc(e);
  e.hub.onJson(e.a.c, { t: 'fishNpc', a: 'beer' });
  const until = e.a.c.profile!.fishing.beerUntil;
  e.a.c.profile!.fishing.xp = 380;
  e.a.c.profile!.fishing.questsDone = 5;
  e.a.c.profile!.fishing.rod = 2;
  e.hub.disconnect(e.a.c);
  const again = login(e.hub, '', e.a.key);
  assert.deepEqual(lastOf(again.s, 'me')!.fishing, { xp: 380, questsDone: 5, questCaught: 0, rod: 2, beerUntil: until });
  assert.equal(lastOf(again.s, 'fishProgress')!.now, e.clock.now);
  e.hub.move(again.c, e.hub.paintball, true);
  e.clock.now = until;
  for (let i = 0; i < TICK_RATE; i++) e.hub.step();
  assert.equal(lastOf(again.s, 'fishProgress')!.progress.beerUntil, 0);
});

test('уровень/удочка/пиво фиксируются при забросе: expiry до поклёвки не меняет roll, replay или цену этого улова', () => {
  const e = setup();
  const p = e.a.c.profile!;
  p.fishing = { xp: 100, questsDone: 1, questCaught: 0, rod: 1, beerUntil: e.clock.now + 500 };
  const hall = sit(e, { sp: sp('scad'), g: 300, coins: 0 });
  const mods: FishCastMods = { level: 1, rod: 1, zoneScale: 1.025 * 1.1, biteSpeed: 1.1, rareMultiplier: 1.025 * 1.05 * 1.2, incomeScale: 1.1 };
  let rolled: Readonly<FishCastMods> | undefined;
  hall.roll = (_rain, _rand, m) => { rolled = m; return { sp: sp('scad'), g: 300, coins: 0 }; };
  const t0 = p.tokens;
  const h = hook(e, hall);
  assert.ok(e.clock.now > p.fishing.beerUntil);
  assert.deepEqual(h.mods, mods);
  assert.deepEqual(rolled, mods);
  const style = reelStyleFor(h.sp, h.mods);
  const play = playReel(style, h.seed, EXPERT);
  assert.ok(play.caught);
  const replay = reelStart(style, h.seed);
  reelRun(replay, play.toggles, play.ticks);
  playHonest(e, play);
  const land = lastOf(e.a.s, 'fishLand')!;
  assert.ok(land);
  assert.equal(land.price, Math.round(fishPrice2(h.sp, 300) * 1.1));
  assert.equal(land.bonus, NEW_BONUS2[0]);
  assert.equal(p.tokens, t0 + land.price + NEW_BONUS2[0]);
  assert.equal(p.fishing.xp, 100 + fishCatchXp(h.sp, replay.perfect));
  assert.equal(p.fishing.questCaught, 1);
  assert.equal(p.stats.fsFish, 1);
  assert.equal(p.stats.fsMaxGrams, 300);
  assert.equal(p.stats.fsCasts, 1);
  assert.equal(p.stats.fsBites, 1);
  e.hub.onJson(e.a.c, { t: 'reel', i: 0, k: play.toggles, u: play.ticks, d: 1 });
  assert.equal(p.tokens, t0 + land.price + NEW_BONUS2[0]);
  assert.equal(p.fishing.questCaught, 1);
  assert.equal(p.stats.fsFish, 1);
  assert.equal(hall.board.top.podium.length, 1);
  e.clock.now += 1100;
  const next = hook(e, hall);
  assert.equal(next.mods.incomeScale, 1, 'следующий заброс уже без пива');
});

test('дубли reel не начисляют повторно; сундук/хлам/сорвавшаяся рыба не дают XP, квест или подиум', () => {
  const e = setup();
  const hall = sit(e, { sp: SP_CHEST, g: 5000, coins: 180 });
  e.a.c.profile!.fishing.beerUntil = e.clock.now + 600000;
  for (const [fish, g, coins] of [[SP_CHEST, 5000, 180], [SP_BOOT, 800, 0]]) {
    hall.roll = () => ({ sp: fish, g, coins });
    const h = hook(e, hall);
    const play = playReel(reelStyleFor(h.sp, h.mods), h.seed, EXPERT);
    assert.ok(play.caught);
    playHonest(e, play);
    e.hub.onJson(e.a.c, { t: 'reel', i: 0, k: play.toggles, u: play.ticks, d: 1 });
    assert.equal(lastOf(e.a.s, 'fishLand')!.price, coins);
    e.clock.now += 1100;
  }
  const p = e.a.c.profile!;
  assert.equal(p.tokens, 280);
  assert.equal(p.fishing.xp, 0);
  assert.equal(p.fishing.questCaught, 0);
  assert.equal(p.stats.fsFish, 0);
  assert.equal(p.stats.fsChests, 1);
  assert.equal(p.stats.fsEarned, 180);
  assert.deepEqual(hall.board.top.podium, []);
  hall.roll = () => ({ sp: sp('scad'), g: 300, coins: 0 });
  hook(e, hall);
  e.hub.onJson(e.a.c, { t: 'reel', i: 0, k: [0], u: 100000, d: 1 });
  assert.equal(hall.phase(0), FP_IDLE);
  assert.equal(p.stats.fsLost, 1);
  e.hub.onJson(e.a.c, { t: 'unuse' });
  assert.equal(p.stats.fsLost, 1, 'потеря считается один раз');
  assert.equal(p.fishing.questCaught, 0);
});

test('12мест: серверные массивы и welcome содержат все места; все12игроков занимают своё, чужой reel не действует', () => {
  const e = setup();
  const players = [e.a];
  for (let i = 1; i < 12; i++) players.push(login(e.hub, `Рыбак${i}`, undefined, `10.0.0.${i + 1}`));
  const hall = e.hub.lobby.fishing2!;
  hall.rand = () => .5;
  hall.roll = () => ({ sp: sp('scad'), g: 300, coins: 0 });
  const spots = e.hub.lobby.map.interact.filter((i) => i.kind === 'fish');
  assert.equal(spots.length, 12);
  assert.equal(lastOf(e.a.s, 'lobby')!.fish.length, 12);
  for (let i = 0; i < players.length; i++) {
    const it = spots.find((s) => s.arg === i)!;
    placeAt(e.hub, players[i].c, it.x, it.z);
    e.hub.onJson(players[i].c, { t: 'use', id: it.id });
    assert.equal(hall.occupant(i), e.hub.lobby.playerOf(players[i].c)!.slot);
    e.hub.onJson(players[i].c, { t: 'fish', a: 'cast' });
  }
  assert.equal(hall.views().length, 12);
  assert.ok(hall.views().every((s) => s.ph > FP_IDLE));
  for (const p of players) assert.equal(p.c.profile!.stats.fsCasts, 1);
  for (let i = 0; i < 30 * TICK_RATE && hall.phase(0) !== FP_BITE; i++) advance(e, 1);
  advance(e, 2);
  for (const p of players) e.hub.onJson(p.c, { t: 'fish', a: 'hook', n: 2 });
  assert.equal(hall.phase(0), FP_REEL);
  e.hub.onJson(players[1].c, { t: 'reel', spot: 0, i: 0, k: [], u: 100000 });
  assert.equal(hall.phase(1), FP_IDLE, 'поддельный spot игнорируется: сервер потерял только свою рыбу нарушителя');
  assert.equal(hall.phase(0), FP_REEL, 'чужое вываживание осталось целым');
  const h = lastOf(e.a.s, 'fishReel')!;
  const play = playReel(reelStyleFor(h.sp, h.mods), h.seed, EXPERT);
  assert.ok(play.caught);
  let sent = 0;
  for (let u = 0; u < play.ticks;) {
    const next = Math.min(play.ticks, u + 15);
    advance(e, next - u);
    const i = sent;
    const k: number[] = [];
    while (sent < play.toggles.length && play.toggles[sent] < next) k.push(play.toggles[sent++]);
    for (const p of players.filter((_p, spot) => spot !== 1)) e.hub.onJson(p.c, { t: 'reel', i, k, u: next, ...(next === play.ticks ? { d: 1 } : {}) });
    u = next;
  }
  for (const p of players.filter((_p, spot) => spot !== 1)) assert.equal(p.c.profile!.stats.fsFish, 1);
  assert.equal(players[1].c.profile!.stats.fsFish, 0);
});

test('обычный дождь запускает единственное событие и заканчивается для игрока склада при пустой набережной', () => {
  const e = setup({ weather: 'auto' });
  e.hub.move(e.a.c, e.hub.paintball, true);
  e.hub.lobby.weather.until = 2;
  advance(e, 1);
  assert.equal(e.hub.lobby.weather.rain, false);
  advance(e, 1);
  assert.equal(e.hub.lobby.weather.rain, true);
  assert.equal(allOf(e.a.s, 'fishEvent').filter((m) => m.on).length, 1);
  const event = lastOf(e.a.s, 'fishEvent')!;
  e.clock.now = event.until;
  e.hub.step();
  assert.deepEqual(lastOf(e.a.s, 'fishEvent'), { t: 'fishEvent', on: false, until: 0 });
});

test('после отсутствия всех игроков новый вход получает уже завершённое событие, без ложного уведомления о начале', () => {
  const e = setup();
  npc(e);
  e.a.c.profile!.tokens = 500;
  e.hub.onJson(e.a.c, { t: 'fishNpc', a: 'rain' });
  const until = lastOf(e.a.s, 'fishEvent')!.until;
  e.hub.disconnect(e.a.c);
  assert.equal(e.hub.active, false);
  e.clock.now = until + 1;
  const again = login(e.hub, '', e.a.key);
  assert.deepEqual(lastOf(again.s, 'fishEvent'), { t: 'fishEvent', on: false, until: 0 });
  assert.equal(lastOf(again.s, 'lobby')!.rain, 0);
});

test('семь рыб дают один готовый квест без переполнения и пять крупнейших отдельных уловов; награда появляется лишь при получении у NPC', () => {
  const e = setup();
  const hall = sit(e, { sp: sp('scad'), g: 300, coins: 0 });
  for (const g of [300, 450, 400, 450, 200, 100, 150]) {
    hall.roll = () => ({ sp: sp('scad'), g, coins: 0 });
    const h = hook(e, hall);
    const play = playReel(reelStyleFor(h.sp, h.mods), h.seed, EXPERT);
    assert.ok(play.caught);
    playHonest(e, play);
    e.clock.now += 1100;
  }
  const p = e.a.c.profile!;
  assert.equal(p.stats.fsFish, 7);
  assert.equal(p.stats.fsGrams, 2050);
  assert.equal(p.stats.fsMaxGrams, 450);
  assert.equal(p.fishing.questCaught, 5);
  assert.equal(p.fishing.questsDone, 0);
  assert.deepEqual(hall.board.top.podium.map((c) => [c.pid, c.g]), [[p.id, 450], [p.id, 450], [p.id, 400], [p.id, 300], [p.id, 200]]);
  assert.ok(hall.board.top.podium[0].at < hall.board.top.podium[1].at);
  e.hub.onJson(e.a.c, { t: 'unuse' });
  npc(e);
  const balance = p.tokens;
  e.hub.onJson(e.a.c, { t: 'fishNpc', a: 'claim' });
  assert.equal(p.tokens, balance + 25);
  assert.equal(p.fishing.questCaught, 0);
  assert.equal(p.fishing.questsDone, 1);
  assert.equal(p.fishing.rod, 1);
});

test('счёт сорванных рыб включает позднюю/ошибочную подсечку и уход; ранняя попытка без рыбы не считается', () => {
  const e = setup();
  const hall = sit(e, { sp: sp('scad'), g: 300, coins: 0 });
  bite(e, hall);
  advance(e, 3 * TICK_RATE);
  assert.equal(e.a.c.profile!.stats.fsLost, 1);
  bite(e, hall);
  e.hub.onJson(e.a.c, { t: 'fish', a: 'hook', n: 999 });
  assert.equal(e.a.c.profile!.stats.fsLost, 2);
  e.clock.now += 1100;
  hook(e, hall);
  e.hub.onJson(e.a.c, { t: 'unuse' });
  assert.equal(e.a.c.profile!.stats.fsLost, 3);
  e.clock.now += 1100;
  sit(e, { sp: sp('scad'), g: 300, coins: 0 });
  e.hub.onJson(e.a.c, { t: 'fish', a: 'cast' });
  advance(e, TICK_RATE);
  e.hub.onJson(e.a.c, { t: 'fish', a: 'hook', n: 0 });
  assert.equal(e.a.c.profile!.stats.fsLost, 3);
  assert.equal(e.a.c.profile!.fishing.questCaught, 0);
  assert.equal(e.a.c.profile!.fishing.xp, 0);
});

test('событие и пиво применены к продаже один раз; обычная рыба во время события и бонус открытия не получают лишних×1.5', () => {
  const e = setup({ rain: true });
  const hall = sit(e, { sp: sp('scad'), g: 300, coins: 0 });
  const p = e.a.c.profile!;
  p.fishing.beerUntil = e.clock.now + 600000;
  for (const [fish, g] of [[sp('scad'), 300], [sp('eel'), 900]]) {
    hall.roll = () => ({ sp: fish, g, coins: 0 });
    const t0 = p.tokens;
    const h = hook(e, hall);
    const play = playReel(reelStyleFor(h.sp, h.mods), h.seed, EXPERT);
    assert.ok(play.caught);
    playHonest(e, play);
    const land = lastOf(e.a.s, 'fishLand')!;
    assert.equal(land.price, Math.round(fishPrice2(fish, g) * 1.1));
    assert.equal(p.tokens, t0 + land.price + land.bonus);
    e.clock.now += 1100;
  }
});

test('32 вида: прежние30 не завершают коллекцию; новые событийные рыбы дают прогресс, подиум и сохраняются; последняя выдаёт комплект', () => {
  assert.equal(sp('bluemarlin'), 34);
  assert.equal(sp('greenlandshark'), 35);
  const e = setup({ rain: true });
  const p = e.a.c.profile!;
  p.fishing = { xp: 15000, questsDone: 10, questCaught: 0, rod: 3, beerUntil: 0 };
  const old = COLLECTION.filter((s) => s < 34);
  assert.equal(old.length, 30);
  for (const s of old) p.album[FISH[s].id] = [FISH[s].g[0], 1];
  p.stats.fsMaxGrams = Math.max(...old.map((s) => FISH[s].g[0]));
  const hall = sit(e, { sp: sp('scad'), g: 300, coins: 0 });
  let play = hookWinning(e, hall, sp('scad'));
  playHonest(e, play);
  assert.equal(lastOf(e.a.s, 'fishLand')!.got, 30);
  assert.equal(lastOf(e.a.s, 'fishLand')!.full, false);
  assert.equal(p.owned.length, 0);
  const weights = [300];
  for (const [species, got] of [[sp('bluemarlin'), 31], [sp('greenlandshark'), 32]]) {
    const g = FISH[species].g[1];
    weights.push(g);
    hall.roll = (rain) => { assert.equal(rain, true); return { sp: species, g, coins: 0 }; };
    e.clock.now += 1100;
    play = hookWinning(e, hall, species);
    playHonest(e, play);
    const land = lastOf(e.a.s, 'fishLand')!;
    assert.equal(land.got, got);
    assert.equal(land.full, got === 32);
    assert.deepEqual(p.album[FISH[species].id], [g, 1]);
  }
  assert.equal(p.stats.fsFish, 3);
  assert.equal(p.fishing.questCaught, 3);
  assert.ok(p.fishing.xp > 15000);
  assert.equal(p.stats.fsCasts, 3);
  assert.equal(p.stats.fsBites, 3);
  assert.equal(p.stats.fsGrams, weights.reduce((n, g) => n + g, 0));
  assert.equal(p.stats.fsMaxGrams, Math.max(...weights));
  assert.deepEqual(hall.board.top.podium.map((c) => c.g), [...weights].sort((a, b) => b - a));
  for (const id of REWARD_ITEMS) assert.ok(p.owned.includes(id));
  e.store.flush();
  const restored = new Store(e.store.dir, { now: () => e.clock.now, log: () => {} });
  restored.load();
  const saved = restored.state.profiles[0];
  assert.deepEqual(saved.album, p.album);
  assert.deepEqual(saved.fishing, p.fishing);
  assert.deepEqual(saved.stats, p.stats);
  assert.deepEqual(restored.state.fishPodium, e.store.state.fishPodium);
  for (const id of REWARD_ITEMS) assert.ok(saved.owned.includes(id));
  restored.close();
});

test('32 вида: вещи за прежнюю полную коллекцию30 остаются у старого владельца после улова и сохранения', () => {
  assert.equal(sp('greenlandshark'), 35);
  const e = setup();
  const p = e.a.c.profile!;
  for (const s of COLLECTION.filter((s) => s < 34)) p.album[FISH[s].id] = [FISH[s].g[0], 1];
  for (const id of REWARD_ITEMS) e.profiles.grant(p, id);
  const hall = sit(e, { sp: sp('scad'), g: 300, coins: 0 });
  const h = hook(e, hall);
  playHonest(e, playReel(reelStyleFor(h.sp, h.mods), h.seed, EXPERT));
  const land = lastOf(e.a.s, 'fishLand')!;
  assert.equal(land.got, 30);
  assert.equal(land.full, false);
  for (const id of REWARD_ITEMS) assert.ok(p.owned.includes(id));
  e.store.flush();
  const restored = new Store(e.store.dir, { now: () => e.clock.now, log: () => {} });
  restored.load();
  for (const id of REWARD_ITEMS) assert.ok(restored.state.profiles[0].owned.includes(id));
  restored.close();
});
