// После поимки (shared/fishrelease.ts): рыба в руках — «В рюкзак» (keep, клавиша 1, или не выбрал; заброс с рыбой в руках, пока
// она ждёт выбора, не принимается) или «Отпустить»
// (release, F): из рюкзака в воду, жетонов нет, опыт рыбалки за поимку ×1,5, альбом и счётчики уже засчитаны. Полный
// рюкзак — заброс не уходит, подсказка «продай или отпусти из рюкзака (I)». Всё — через настоящие Hub/LobbyRoom и диск.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import { FE_BITE, FE_DONE, FISH, FP_BITE, FP_HOLD, FP_IDLE } from '../shared/fishing.ts';
import { reelStyle2 } from '../shared/fishability.ts';
import { type Hooked } from '../shared/fishrules.ts';
import { BAG_BASE } from '../shared/fishshop.ts';
import { CHOICE_TICKS, DONE_RELEASE, RELEASE_XP, releaseXp } from '../shared/fishrelease.ts';
import type { LobbyEvent } from '../shared/messages.ts';
import { Hub } from '../server/hub.ts';
import { BAG_FULL_TEXT, type FishingHall2 } from '../server/lobby/fishing2.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { EXPERT, playReel, type Play } from './fishbot.ts';
import { SMOKE, allOf, lastOf, login, placeAt } from './kit.ts';

const dirs: string[] = [];
after(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const sp = (id: string): number => FISH.findIndex((f) => f.id === id);

function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-release-'));
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 4, 12) };
  const store = new Store(dir, { now: () => clock.now, log: () => {}, saveDelayMs: 60_000 });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({ store, profiles, now: () => clock.now, log: () => {}, build: 'test', smokeToken: SMOKE, fish2: true, weather: 'clear' });
  const a = login(hub, 'Рыболов');
  const it = hub.lobby.map.interact.find((i) => i.kind === 'fish' && i.arg === 0)!;
  placeAt(hub, a.c, it.x, it.z);
  hub.onJson(a.c, { t: 'use', id: it.id });
  const hall = hub.lobby.fishing2 as FishingHall2;
  assert.ok(hall);
  hall.rand = () => .5;
  return { hub, clock, a, hall, p: a.c.profile! };
}
type Env = ReturnType<typeof setup>;

function advance(e: Env, n: number): void {
  for (let i = 0; i < n; i++) { e.clock.now += 1000 / TICK_RATE; e.hub.step(); }
}

function fishEvents(e: Env): Array<[number, number, number, number]> {
  return allOf(e.a.s, 'lev').flatMap((m) => m.e as LobbyEvent[]).filter((x) => x[0] === 'fish').map((x) => [x[1], x[2], x[3], x[4]] as [number, number, number, number]);
}

/** Поймать what честно (опытный игрок, выигрышный сид шкалы) — рыба в руках */
function catchOne(e: Env, what: Hooked): void {
  e.hall.roll = () => ({ ...what });
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'cast' });
  for (let i = 0; i < 30 * TICK_RATE && e.hall.phase(0) !== FP_BITE; i++) advance(e, 1);
  advance(e, 2);
  const mods = e.hall.views()[0].mods!;
  const style = reelStyle2(what.sp, mods);
  let play: Play | null = null;
  let seed = 0;
  for (let c = 1; c <= 400 && !play; c++) { const p = playReel(style, c, EXPERT); if (p.caught) { play = p; seed = c; } }
  assert.ok(play);
  const n = fishEvents(e).filter((x) => x[0] === FE_BITE).at(-1)![2];
  const rand = e.hall.rand;
  e.hall.rand = () => (seed >>> 0) / 0x1_0000_0000;
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'hook', n });
  e.hall.rand = rand;
  let sent = 0;
  for (let u = 0; u < play.ticks;) {
    const next = Math.min(play.ticks, u + 15);
    advance(e, next - u);
    const i = sent;
    const k: number[] = [];
    while (sent < play.toggles.length && play.toggles[sent] < next) k.push(play.toggles[sent++]);
    e.hub.onJson(e.a.c, { t: 'reel', i, k, u: next, ...(next === play.ticks ? { d: 1 } : {}) });
    u = next;
  }
  advance(e, 2);
  assert.equal(e.hall.phase(0), FP_HOLD, 'рыба в руках');
}

test('отпустить (F): рыба из рюкзака — в воду, жетонов нет, опыт рыбалки за поимку ×1,5; альбом и счётчики — как у пойманной', () => {
  const e = setup();
  const t0 = e.p.tokens;
  catchOne(e, { sp: sp('scad'), g: 300, coins: 0 });
  const land = lastOf(e.a.s, 'fishLand')!;
  assert.ok(land.xp! > 0);
  assert.equal(e.p.fishing.bag.length, 1, 'пока в руках — уже в рюкзаке (не выбрал — так и останется)');
  const xp0 = e.p.fishing.xp;
  const bonus = e.p.tokens - t0;
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'release' });
  assert.equal(e.hall.phase(0), FP_IDLE);
  assert.equal(e.p.fishing.bag.length, 0, 'в рюкзак не идёт');
  assert.equal(e.p.fishing.xp, xp0 - land.xp! + releaseXp(land.xp!), 'итого за поимку — ×1,5');
  assert.equal(releaseXp(land.xp!), Math.round(land.xp! * RELEASE_XP));
  assert.equal(e.p.tokens - t0, bonus, 'жетонов за рыбу нет (бонус за новый вид — за альбом, остаётся)');
  assert.deepEqual(e.p.album, { scad: [300, 1] }, 'в альбоме — её же поймали');
  assert.equal(e.p.stats.fsCaught, 1);
  advance(e, 2);
  assert.deepEqual(fishEvents(e).at(-1), [FE_DONE, 0, DONE_RELEASE, 0], 'все видят: рыба — в воду');
  assert.deepEqual(lastOf(e.a.s, 'me')!.fishing.bag, [], 'рюкзак в профиле клиента');
  // второй раз — нечего; заброс снова идёт
  const xp1 = e.p.fishing.xp;
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'release' });
  assert.equal(e.p.fishing.xp, xp1);
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'cast' });
  assert.notEqual(e.hall.phase(0), FP_IDLE);
});

test('в рюкзак: кнопка keep или не выбрал за CHOICE_TICKS — рыба в рюкзаке, опыт обычный; потом отпустить нельзя', () => {
  const e = setup();
  catchOne(e, { sp: sp('scad'), g: 300, coins: 0 });
  const xp0 = e.p.fishing.xp;
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'keep' });
  assert.equal(e.hall.phase(0), FP_IDLE);
  advance(e, 2);
  assert.deepEqual(fishEvents(e).at(-1), [FE_DONE, 0, 1, 0]);
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'release' });
  assert.equal(e.p.fishing.bag.length, 1);
  assert.equal(e.p.fishing.xp, xp0);
  // не выбрал: ждёт CHOICE_TICKS, потом — в рюкзаке
  catchOne(e, { sp: sp('scad'), g: 350, coins: 0 });
  advance(e, CHOICE_TICKS - 5);
  assert.equal(e.hall.phase(0), FP_HOLD, 'ещё можно выбрать');
  advance(e, 6);
  assert.equal(e.hall.phase(0), FP_IDLE);
  assert.equal(e.p.fishing.bag.length, 2);
  // заброс с рыбой в руках, пока она ждёт выбора, не принимается (хотфикс 10.10); выбрал «В рюкзак» — заброс идёт
  catchOne(e, { sp: sp('scad'), g: 400, coins: 0 });
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'cast' });
  assert.equal(e.hall.phase(0), FP_HOLD, 'пока не выбрал — заброса нет, за игрока ничего не решено');
  assert.equal(e.p.fishing.bag.length, 3, 'рыба уже в рюкзаке с момента поимки');
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'keep' });
  assert.equal(e.hall.phase(0), FP_IDLE);
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'cast' });
  assert.notEqual(e.hall.phase(0), FP_IDLE);
  advance(e, 2);
  assert.ok(fishEvents(e).some((x) => x[0] === FE_DONE && x[2] === 1));
});

test('отпустить нечего: сундук; рыбы уже нет в рюкзаке (весь улов ушёл) — бонуса нет', () => {
  const e = setup();
  const t0 = e.p.tokens;
  catchOne(e, { sp: sp('chest'), g: 5000, coins: 90 });
  const xp0 = e.p.fishing.xp;
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'release' });
  assert.equal(e.hall.phase(0), FP_HOLD, 'сундук не отпускают');
  assert.equal(e.p.tokens, t0 + 90);
  assert.equal(e.p.fishing.xp, xp0);
  catchOne(e, { sp: sp('scad'), g: 300, coins: 0 });
  const xp1 = e.p.fishing.xp;
  e.p.fishing.bag = [];
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'release' });
  assert.equal(e.p.fishing.xp, xp1);
  assert.equal(e.hall.phase(0), FP_HOLD);
});

test('полный рюкзак: заброс не уходит, подсказка «продай или отпусти из рюкзака (I)»; рыба заняла последнее место — F его освобождает', () => {
  const full = setup();
  full.p.fishing.bag = Array.from({ length: BAG_BASE }, (_v, n) => ({ n, f: 'goby', g: 100, p: 5, m: 0 }));
  full.p.fishing.bagSeq = BAG_BASE;
  full.clock.now += 1100;
  full.hub.onJson(full.a.c, { t: 'fish', a: 'cast' });
  assert.equal(full.hall.phase(0), FP_IDLE, 'заброс не ушёл');
  assert.equal(lastOf(full.a.s, 'toast')!.text, BAG_FULL_TEXT);
  assert.equal(BAG_FULL_TEXT, 'Рюкзак полон — продай улов Семёну или Сане или отпусти рыбу из рюкзака (I)');
  // отпустил из рюкзака (I → «Отпустить», где угодно) — место есть, заброс уходит
  full.clock.now += 1100;
  full.hub.onJson(full.a.c, { t: 'fishBag', a: 'release', n: 0 });
  assert.equal(full.p.fishing.bag.length, BAG_BASE - 1);
  full.clock.now += 1100;
  full.hub.onJson(full.a.c, { t: 'fish', a: 'cast' });
  assert.notEqual(full.hall.phase(0), FP_IDLE);
  // рыба заняла последнее место — F: она в воде, место снова есть, заброс уходит
  const e = setup();
  e.p.fishing.bag = Array.from({ length: BAG_BASE - 1 }, (_v, n) => ({ n, f: 'goby', g: 100, p: 5, m: 0 }));
  e.p.fishing.bagSeq = BAG_BASE - 1;
  catchOne(e, { sp: sp('scad'), g: 300, coins: 0 });
  assert.equal(e.p.fishing.bag.length, BAG_BASE);
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'release' });
  assert.equal(e.p.fishing.bag.length, BAG_BASE - 1);
  advance(e, 2);
  assert.deepEqual(fishEvents(e).at(-1), [FE_DONE, 0, DONE_RELEASE, 0]);
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'cast' });
  assert.notEqual(e.hall.phase(0), FP_IDLE);
});
