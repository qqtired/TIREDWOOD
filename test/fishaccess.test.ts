// Приёмка места через настоящий Hub: пешком по настилу → E → заброс → честная шкала → улов → пешком назад.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { PLAYER_HALF, PLAYER_HEIGHT, TICK_RATE } from '../shared/constants.ts';
import { FISH_BOARD, FISH_ISLE_FIRST, FISH_MOORINGS, FISH_PODIUM, FISHER_NPC } from '../shared/fishplaces.ts';
import { reelStyle2 } from '../shared/fishability.ts';
import { FE_BITE, FE_CAST, FE_LAND, FISH, FP_BITE, FP_HOLD, FP_IDLE, FP_REEL } from '../shared/fishing.ts';
import { ACT_FISH, ACT_NONE } from '../shared/lobby.ts';
import { FISH_SPOTS } from '../shared/maps/lobby.ts';
import type { LobbyEvent } from '../shared/messages.ts';
import { BTN_ADS, BTN_FORWARD } from '../shared/sim.ts';
import { Hub, type Client } from '../server/hub.ts';
import { type FishingHall2 } from '../server/lobby/fishing2.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { EXPERT, playReel, type Play } from './fishbot.ts';
import { FISH_APPROACH_ROUTES, type FishPathPoint } from './fishpaths.ts';
import { SMOKE, lastOf, login, placeAt, sendInput, type FakeSink } from './kit.ts';

const dirs: string[] = [];
after(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const SCAD = FISH.findIndex((f) => f.id === 'scad');

function env(fish2 = true) {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-fish-access-'));
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 3, 12) };
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now: () => clock.now });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({ store, profiles, smokeToken: SMOKE, build: 'test', now: () => clock.now, log: () => {}, fish2, weather: 'clear' });
  return { hub, clock, w: hub.lobby.world };
}
type Env = ReturnType<typeof env>;
type Fisher = ReturnType<typeof login>;
const fishHall = (e: Env) => e.hub.lobby.fishing2 ?? e.hub.lobby.fishing;

function tick(e: Env, n = 1): void {
  for (let k = 0; k < n; k++) { e.clock.now += 1000 / TICK_RATE; e.hub.step(); }
}

function footing(e: Env, c: Client): void {
  const p = e.hub.lobby.playerOf(c)!;
  const s = p.state;
  assert.ok(Math.abs(s.y) < 0.015 && s.grounded, `пеший игрок на полу: y=${s.y},grounded=${s.grounded}`);
  for (const dx of [-PLAYER_HALF, PLAYER_HALF]) for (const dz of [-PLAYER_HALF, PLAYER_HALF]) {
    assert.equal(e.w.groundBelow(s.x + dx, 0, s.z + dz), 0, `ступни на настиле (${s.x},${s.z})`);
  }
  assert.ok(!e.w.overlaps(s.x - PLAYER_HALF, 0.002, s.z - PLAYER_HALF, s.x + PLAYER_HALF, PLAYER_HEIGHT, s.z + PLAYER_HALF), 'пешеход не внутри AABB');
  // Другие сидящие игроки не перекрывают этот проход.
  for (let spot = 0; spot < FISH_SPOTS.length; spot++) {
    const slot = fishHall(e).occupant(spot);
    if (!slot || slot === p.slot) continue;
    const other = FISH_SPOTS[spot];
    assert.ok(Math.abs(s.x - other.x) >= 2 * PLAYER_HALF || Math.abs(s.z - other.z) >= 2 * PLAYER_HALF, `проход мимо занятого места ${spot}`);
  }
}

/** Скорость прицеливания исключает рывок и прыжок; торможение проходит настоящими пустыми входами. */
function walk(e: Env, c: Client, route: readonly FishPathPoint[]): void {
  const p = e.hub.lobby.playerOf(c)!;
  for (const [x, z] of route) {
    let reached = false;
    for (let k = 0; k < 20 * TICK_RATE; k++) {
      const s = p.state;
      const dx = x - s.x, dz = z - s.z;
      if (Math.hypot(dx, dz) < 0.3) { reached = true; break; }
      sendInput(e.hub, c, BTN_FORWARD | BTN_ADS, Math.atan2(-dx, -dz));
      tick(e);
      footing(e, c);
    }
    assert.ok(reached, `дошёл до (${x},${z}), оказался (${p.state.x},${p.state.z})`);
    for (let k = 0; k < 10; k++) { sendInput(e.hub, c, 0); tick(e); footing(e, c); }
    assert.ok(Math.hypot(p.state.x - x, p.state.z - z) < 0.4, 'остановился в точке маршрута');
  }
}

function arrive(e: Env, a: Fisher, spot: number): void {
  // Только исходная точка теста задаётся напрямую; весь подход и выход идут серверной физикой/протоколом ввода.
  const route = FISH_APPROACH_ROUTES[spot];
  placeAt(e.hub, a.c, route[0][0], route[0][1]);
  sendInput(e.hub, a.c, 0);
  tick(e, 2);
  walk(e, a.c, route.slice(1));
  const it = e.hub.lobby.map.interact.find((i) => i.kind === 'fish' && i.arg === spot)!;
  e.hub.onJson(a.c, { t: 'use', id: it.id });
  const p = e.hub.lobby.playerOf(a.c)!;
  assert.equal(p.action, ACT_FISH);
  assert.equal(p.arg, spot);
  assert.equal(fishHall(e).occupant(spot), p.slot);
  footing(e, a.c);
}

function events(s: FakeSink): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  for (const m of s.msgs) if (m.t === 'lev') for (const f of m.e as LobbyEvent[]) if (f[0] === 'fish') out.push([f[1], f[2], f[3], f[4]]);
  return out;
}

function hookAll(e: Env, fishers: Array<{ a: Fisher; spot: number }>): Play[] {
  const hall = e.hub.lobby.fishing2 as FishingHall2;
  assert.ok(hall);
  hall.rand = () => 0.5;
  hall.roll = () => ({ sp: SCAD, g: 300, coins: 0 });
  for (const { a } of fishers) { a.s.msgs.length = 0; e.hub.onJson(a.c, { t: 'fish', a: 'cast' }); }
  let bitten = false;
  for (let k = 0; k < 30 * TICK_RATE; k++) {
    tick(e);
    if (fishers.every(({ a, spot }) => events(a.s).some((f) => f[0] === FE_BITE && f[1] === spot))) { bitten = true; break; }
  }
  assert.ok(bitten, 'каждому поплавку пришла настоящая поклёвка');
  return fishers.map(({ a, spot }) => {
    assert.equal(hall.phase(spot), FP_BITE);
    const cast = events(a.s).find((f) => f[0] === FE_CAST && f[1] === spot)!;
    assert.ok(cast, 'клиент получил настоящий серверный заброс');
    assert.equal(e.w.groundBelow(cast[2], 0, cast[3]), -Infinity, 'серверный поплавок находится в море');
    const bite = events(a.s).find((f) => f[0] === FE_BITE && f[1] === spot)!;
    e.hub.onJson(a.c, { t: 'fish', a: 'hook', n: bite[2] });
    const m = lastOf(a.s, 'fishReel');
    assert.ok(m, `сервер выдал seed шкалы места ${spot}`);
    assert.equal(m.spot, spot);
    assert.equal(hall.phase(spot), FP_REEL);
    const play = playReel(reelStyle2(m.sp, m.mods), m.seed, EXPERT);
    assert.ok(play.caught, 'ставрида поймана моделью честных нажатий');
    return play;
  });
}

/** Все 12 шкал идут параллельно в реальном серверном времени, пакетами каждые15тиков. */
function landAll(e: Env, fishers: Array<{ a: Fisher; spot: number }>, plays: Play[]): void {
  const sent = plays.map(() => 0);
  const max = Math.max(...plays.map((p) => p.ticks));
  for (let u = 0; u < max; u++) {
    tick(e);
    const now = u + 1;
    for (let n = 0; n < plays.length; n++) {
      const play = plays[n];
      if (now > play.ticks || (now % 15 !== 0 && now !== play.ticks)) continue;
      const i = sent[n], k: number[] = [];
      while (sent[n] < play.toggles.length && play.toggles[sent[n]] < now) k.push(play.toggles[sent[n]++]);
      e.hub.onJson(fishers[n].a.c, { t: 'reel', i, k, u: now, ...(now === play.ticks ? { d: 1 } : {}) });
    }
  }
  tick(e, 2);
  for (const { a, spot } of fishers) {
    const land = lastOf(a.s, 'fishLand');
    assert.ok(land, `реальный сервер засчитал улов места ${spot}`);
    assert.equal(land.sp, SCAD);
    assert.equal(land.g, 300);
    assert.ok(land.price > 0);
    assert.equal(a.c.profile!.stats.fsCaught, 1);
    assert.deepEqual(a.c.profile!.album.scad, [300, 1]);
    assert.ok(events(a.s).some((f) => f[0] === FE_LAND && f[1] === spot));
    assert.equal(e.hub.lobby.fishing2!.phase(spot), FP_HOLD);
    assert.equal(fishHall(e).occupant(spot), e.hub.lobby.playerOf(a.c)!.slot);
  }
}

for (let spot = 6; spot < 12; spot++) test(`новое место ${spot}: пеший подход → E → заброс → честное вываживание/улов → свободный выход`, () => {
  const e = env();
  const a = login(e.hub, `Точка${spot}`);
  arrive(e, a, spot);
  const cast = [{ a, spot }];
  landAll(e, cast, hookAll(e, cast));
  const route = FISH_APPROACH_ROUTES[spot];
  walk(e, a.c, route.slice(0, -1).toReversed());
  assert.equal(e.hub.lobby.playerOf(a.c)!.action, ACT_NONE);
  assert.equal(fishHall(e).occupant(spot), 0);
  assert.equal(e.hub.lobby.fishing2!.phase(spot), FP_IDLE);
});

test('12 игроков одновременно занимают физические места, ловят без очереди; 13-й не вытесняет и садится после освобождения', () => {
  const e = env();
  const fishers = Array.from({ length: 12 }, (_, spot) => ({ a: login(e.hub, `Рыбак${spot}`, undefined, `10.18.0.${spot + 1}`), spot }));
  for (const { a, spot } of fishers) arrive(e, a, spot);
  assert.equal(new Set(fishers.map(({ a }) => e.hub.lobby.playerOf(a.c)!.slot)).size, 12);
  assert.ok(fishers.every(({ a, spot }) => fishHall(e).occupant(spot) === e.hub.lobby.playerOf(a.c)!.slot));
  const extra = login(e.hub, 'Тринадцатый', undefined, '10.18.0.13');
  const it = e.hub.lobby.map.interact.find((i) => i.kind === 'fish' && i.arg === 11)!;
  // Посетитель подходит на безопасное расстояние с внутренней стороны занятого места.
  placeAt(e.hub, extra.c, it.x, it.z - 0.95);
  e.hub.onJson(extra.c, { t: 'use', id: it.id });
  assert.equal(e.hub.lobby.playerOf(extra.c)!.action, ACT_NONE);
  assert.equal(fishHall(e).occupant(11), e.hub.lobby.playerOf(fishers[11].a.c)!.slot);
  const all = hookAll(e, fishers);
  landAll(e, fishers, all);
  for (const { a, spot } of fishers) {
    walk(e, a.c, FISH_APPROACH_ROUTES[spot].slice(0, -1).toReversed());
    assert.equal(e.hub.lobby.playerOf(a.c)!.action, ACT_NONE);
    assert.equal(fishHall(e).occupant(spot), 0);
  }
  e.clock.now += 1000;
  e.hub.onJson(extra.c, { t: 'use', id: it.id });
  assert.equal(e.hub.lobby.playerOf(extra.c)!.action, ACT_FISH, 'место свободно и принимается сразу');
});

test('без FISH2 все12 мест сохраняют старую серверную рыбалку и освобождение шагом', () => {
  const e = env(false);
  assert.equal(e.hub.lobby.fishing2, null);
  const a = login(e.hub, 'Старая');
  const hall = e.hub.lobby.fishing;
  hall.rand = () => 0.5;
  hall.roll = () => ({ sp: SCAD, g: 300 });
  for (let spot = 0; spot < 12; spot++) {
    arrive(e, a, spot);
    a.s.msgs.length = 0;
    e.hub.onJson(a.c, { t: 'fish', a: 'cast' });
    let bite: [number, number, number, number] | undefined;
    for (let k = 0; k < 30 * TICK_RATE && !bite; k++) { tick(e); bite = events(a.s).find((f) => f[0] === FE_BITE && f[1] === spot); }
    assert.ok(bite);
    e.hub.onJson(a.c, { t: 'fish', a: 'hook', n: bite[2] });
    for (let k = 0; k < 5 * TICK_RATE && hall.phase(spot) !== FP_HOLD; k++) tick(e);
    assert.equal(hall.phase(spot), FP_HOLD, `старая рыбалка места ${spot}: улов в руках`);
    walk(e, a.c, FISH_APPROACH_ROUTES[spot].slice(0, -1).toReversed());
    assert.equal(e.hub.lobby.playerOf(a.c)!.action, ACT_NONE);
    assert.equal(hall.occupant(spot), 0);
  }
  assert.equal(a.c.profile!.stats.fsCaught, 12);
});

test('без FISH2 нет невидимых NPC/доски/пьедестала; настилы и видимые швартовные тумбы остаются физическими', () => {
  const on = env(), off = env(false);
  for (const at of [FISHER_NPC, FISH_BOARD, FISH_PODIUM]) {
    const hit = (e: Env) => e.w.overlaps(at.x - PLAYER_HALF, 0.002, at.z - PLAYER_HALF, at.x + PLAYER_HALF, PLAYER_HEIGHT, at.z + PLAYER_HALF);
    assert.ok(hit(on), 'видимый предмет включён в физику');
    assert.ok(!hit(off), 'скрытый при FISH2off предмет пропускает игрока');
  }
  for (const m of FISH_MOORINGS) for (const e of [on, off]) {
    assert.ok(e.w.overlaps(m.x - m.r / 2, 0.01, m.z - m.r / 2, m.x + m.r / 2, m.h, m.z + m.r / 2), 'видимая тумба остаётся твёрдой');
  }
  // места на моле острова стоят на камне, их высоту проверяет test/isle.test.ts
  for (const s of FISH_SPOTS.slice(0, FISH_ISLE_FIRST)) for (const e of [on, off]) {
    for (const dx of [-PLAYER_HALF, PLAYER_HALF]) for (const dz of [-PLAYER_HALF, PLAYER_HALF]) assert.equal(e.w.groundBelow(s.x + dx, 0, s.z + dz), 0);
  }
});
