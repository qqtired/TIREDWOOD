// Рыбалка 2.0 на сервере (флаг FISH2): честное вываживание засчитывается (рыба — в рюкзак по цене поимки, коллекция,
// счётчики, бонус за новый вид — сразу жетонами), подделки — нет: ускорение, нажатия под чужой сид, кривые сообщения,
// молчание; поклёвка по погоде; сундук; доска «Сегодня» / «За всё время» (полночь по Москве); финал лестницы наград
// fishstyle за всю коллекцию (COLLECTION_SIZE видов); без флага — старая рыбалка.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import { FE_BITE, FE_DONE, FE_LAND, FE_LOST, FISH, FP_HOLD, FP_IDLE, FP_REEL } from '../shared/fishing.ts';
import {
  COLLECTION, COLLECTION_SIZE, NEW_BONUS2, RULE, SP_BOOT, SP_CHEST, basePrice, fishPrice2, type Hooked,
} from '../shared/fishrules.ts';
import { earnedItems } from '../shared/fishstyle.ts';
import { fishCatchXp } from '../shared/fishprogress.ts';
import { BAG_BASE } from '../shared/fishshop.ts';
import { REEL_MAX_TICKS, reelRun, reelStart } from '../shared/fishreel.ts';
import type { LobbyEvent } from '../shared/messages.ts';
import { Hub, type Client } from '../server/hub.ts';
import { HOLD2_TICKS, REEL_LAG, fish2Enabled, type FishingHall2 } from '../server/lobby/fishing2.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { EXPERT, playReel, type Play } from './fishbot.ts';
import { SMOKE, allOf, lastOf, login, placeAt, type FakeSink } from './kit.ts';

const sp = (id: string): number => FISH.findIndex((f) => f.id === id);
const dirs: string[] = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function fishHub(o: { rain?: boolean; fish2?: boolean } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-fish2-'));
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 2, 12) };
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now: () => clock.now });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({
    store, profiles, smokeToken: SMOKE, build: 'test', now: () => clock.now, log: () => {}, fish2: o.fish2 ?? true, weather: o.rain ? 'rain' : 'clear',
  });
  return { hub, store, clock };
}

/** n тиков: часы идут вместе с хабом (проверки вываживания — по настоящему времени) */
function advance(hub: Hub, clock: { now: number }, n: number): void {
  for (let i = 0; i < n; i++) {
    clock.now += 1000 / TICK_RATE;
    hub.step();
  }
}

function fishEvents(s: FakeSink): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  for (const m of s.msgs) if (m.t === 'lev') for (const e of m.e as LobbyEvent[]) if (e[0] === 'fish') out.push([e[1], e[2], e[3], e[4]]);
  return out;
}

/** Рыбак на месте 0, rand всегда 0,5 (поклёвка через 12 с, одна проба — поклёвка №2); клюёт what. */
function fisher(what: Hooked, o: { rain?: boolean } = {}) {
  const env = fishHub(o);
  const a = login(env.hub, 'Рыбак');
  const it = env.hub.lobby.map.interact.find((i) => i.kind === 'fish' && i.arg === 0)!;
  placeAt(env.hub, a.c, it.x, it.z);
  env.hub.onJson(a.c, { t: 'use', id: it.id });
  const hall = env.hub.lobby.fishing2 as FishingHall2;
  assert.ok(hall, 'рыбалка 2.0 включена');
  hall.rand = () => 0.5;
  hall.roll = () => ({ ...what });
  return { ...env, a, hall };
}

type Env = ReturnType<typeof fisher>;

/** Забросить и подсечь вовремя: сид шкалы от сервера. */
function hookOne(e: Env): { seed: number; sp: number } {
  e.clock.now += 1000;
  e.a.s.msgs.length = 0;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'cast' });
  for (let i = 0; i < 30 * TICK_RATE && !fishEvents(e.a.s).some((x) => x[0] === FE_BITE); i++) advance(e.hub, e.clock, 1);
  e.hub.onJson(e.a.c, { t: 'fish', a: 'hook', n: 2 });
  const m = lastOf(e.a.s, 'fishReel');
  assert.ok(m, 'шкала: сид от сервера');
  assert.equal(e.hall.phase(0), FP_REEL);
  return { seed: m.seed, sp: m.sp };
}

/** Сыграть, как честный клиент: нажатия по модели игрока, сообщение раз в 15 тиков, время идёт по-настоящему. */
function playHonest(e: Env, play: Play, c: Client = e.a.c): void {
  let sent = 0;
  for (let u = 0; u < play.ticks;) {
    const next = Math.min(play.ticks, u + 15);
    advance(e.hub, e.clock, next - u);
    const i = sent;
    const k: number[] = [];
    while (sent < play.toggles.length && play.toggles[sent] < next) k.push(play.toggles[sent++]);
    e.hub.onJson(c, { t: 'reel', i, k, u: next, ...(next === play.ticks ? { d: 1 } : {}) });
    u = next;
  }
}

test('флаг FISH2: «1» — рыбалка 2.0, иначе старая; без флага в lobby нет fish2 и доски, reel не принимается', () => {
  assert.equal(fish2Enabled('1'), true);
  assert.equal(fish2Enabled(undefined), false);
  assert.equal(fish2Enabled('0'), false);
  const off = fishHub({ fish2: false });
  assert.equal(off.hub.lobby.fishing2, null);
  const a = login(off.hub, 'Старый');
  const lobby = lastOf(a.s, 'lobby')!;
  assert.ok(!('fish2' in lobby) && !('ftop' in lobby));
  const on = fishHub();
  const b = login(on.hub, 'Новый');
  const l2 = lastOf(b.s, 'lobby')!;
  assert.equal(l2.fish2, 1);
  assert.deepEqual(l2.ftop, { day: '2026-10-02', dn: [], dg: [], an: [], ag: [], podium: [] });
});

test('честное вываживание: повтор сервера дошёл до 100 % — рыба в рюкзак по цене поимки, коллекция, счётчики, бонус за новый вид жетонами; потом удочка пустая', () => {
  const e = fisher({ sp: sp('scad'), g: 300, coins: 0 });
  const t0 = e.a.c.profile!.tokens;
  const { seed } = hookOne(e);
  const play = playReel(RULE[sp('scad')]!.style, seed, EXPERT);
  assert.ok(play.caught, 'ставриду опытный вытаскивает');
  playHonest(e, play);
  advance(e.hub, e.clock, 2);
  const land = lastOf(e.a.s, 'fishLand');
  assert.ok(land, 'улов засчитан');
  const price = fishPrice2(sp('scad'), 300);
  assert.equal(typeof land.perfect, 'boolean');
  assert.deepEqual(land, {
    t: 'fishLand', sp: sp('scad'), g: 300, price, coins: 0, bonus: NEW_BONUS2[0], fresh: true, record: false, best: 0, got: 1, full: false,
    base: basePrice(sp('scad'), 300), m: 0, xp: fishCatchXp(sp('scad'), land.perfect), perfect: land.perfect, bag: 1, cap: BAG_BASE,
  });
  const prof = e.a.c.profile!;
  // жетоны за рыбу — при продаже Семёну или Сане; бонус за новый вид — сразу
  assert.equal(prof.tokens, t0 + NEW_BONUS2[0]);
  assert.deepEqual(prof.fishing.bag, [{ n: 0, f: 'scad', g: 300, p: price, m: 0 }]);
  assert.deepEqual(prof.album, { scad: [300, 1] });
  assert.equal(prof.stats.fsCaught, 1);
  assert.equal(prof.stats.fsFish, 1);
  assert.equal(prof.stats.fsGrams, 300);
  assert.equal(prof.stats.fsDayFish, 1);
  assert.equal(e.hall.phase(0), FP_HOLD);
  assert.ok(fishEvents(e.a.s).some((x) => x[0] === FE_LAND && x[2] === sp('scad') && x[3] === 300));
  assert.deepEqual(lastOf(e.a.s, 'me')!.album, { scad: [300, 1] }, 'альбом — в профиль клиента');
  advance(e.hub, e.clock, HOLD2_TICKS + 1);
  assert.equal(e.hall.phase(0), FP_IDLE);
  assert.deepEqual(fishEvents(e.a.s).find((x) => x[0] === FE_DONE), [FE_DONE, 0, 1, 0]);
  // второй раз — тяжелее: рекорд, бонуса нет; заброс прямо из «в руках»
  e.hall.roll = () => ({ sp: sp('scad'), g: 400, coins: 0 });
  const h2 = hookOne(e);
  playHonest(e, playReel(RULE[sp('scad')]!.style, h2.seed, EXPERT));
  advance(e.hub, e.clock, 2);
  const l2 = lastOf(e.a.s, 'fishLand')!;
  assert.equal(l2.record, true);
  assert.equal(l2.best, 300);
  assert.equal(l2.bonus, 0);
  assert.deepEqual(prof.album, { scad: [400, 2] });
  e.hub.onJson(e.a.c, { t: 'fish', a: 'cast' });
  assert.notEqual(e.hall.phase(0), FP_HOLD, 'заброс из «в руках» — сразу');
});

test('подделка: досчитал быстрее настоящего времени — сорвалась, жетонов нет', () => {
  const e = fisher({ sp: sp('scad'), g: 300, coins: 0 });
  const t0 = e.a.c.profile!.tokens;
  const { seed } = hookOne(e);
  const play = playReel(RULE[sp('scad')]!.style, seed, EXPERT);
  // весь бой сразу, через 0,2 с после подсечки
  advance(e.hub, e.clock, 12);
  e.hub.onJson(e.a.c, { t: 'reel', i: 0, k: play.toggles, u: play.ticks, d: 1 });
  advance(e.hub, e.clock, 2);
  assert.equal(e.hall.phase(0), FP_IDLE);
  assert.ok(fishEvents(e.a.s).some((x) => x[0] === FE_LOST));
  assert.equal(lastOf(e.a.s, 'fishLand'), undefined);
  assert.equal(e.a.c.profile!.tokens, t0);
  assert.equal(e.a.c.profile!.stats.fsCaught, 0);
});

test('подделка: нажатия, сыгранные под другой сид, — повтор сервера рыбу не вытащил', () => {
  const e = fisher({ sp: sp('tuna'), g: 30_000, coins: 0 });
  const t0 = e.a.c.profile!.tokens;
  const { seed } = hookOne(e);
  const style = RULE[sp('tuna')]!.style;
  // ищем «чужую» игру: под свой сид тунец пойман, а те же нажатия под настоящий сид его не вытаскивают
  // (у спокойных паттернов чужие нажатия иногда и правда вытаскивают — такие не годятся для проверки)
  let fake: Play | null = null;
  for (let s = 1; s < 400 && !fake; s++) {
    const p = playReel(style, seed ^ (s * 7919), EXPERT);
    if (!p.caught) continue;
    const real = reelStart(style, seed);
    reelRun(real, p.toggles, REEL_MAX_TICKS + 1);
    if (real.done !== 1) fake = p;
  }
  assert.ok(fake, 'нашлась пойманная чужая игра');
  playHonest(e, fake);
  advance(e.hub, e.clock, 2);
  // сервер повторяет нажатия по своему сиду — тунец сорвался
  const land = lastOf(e.a.s, 'fishLand');
  if (land) assert.fail('чужие нажатия засчитаны');
  assert.equal(e.a.c.profile!.tokens, t0);
  assert.equal(e.hall.phase(0), FP_IDLE);
});

test('подделка: кривые сообщения (тики назад, не целые, пропуск, лишнее) и молчание — сорвалась', () => {
  const cases: Array<(e: Env) => void> = [
    (e) => e.hub.onJson(e.a.c, { t: 'reel', i: 0, k: [10, 5], u: 20 }),
    (e) => e.hub.onJson(e.a.c, { t: 'reel', i: 0, k: [1.5], u: 20 }),
    (e) => e.hub.onJson(e.a.c, { t: 'reel', i: 3, k: [10], u: 20 }),
    (e) => e.hub.onJson(e.a.c, { t: 'reel', i: 0, k: [30], u: 20 }),
    (e) => e.hub.onJson(e.a.c, { t: 'reel', i: 0, k: 'x' as unknown as number[], u: 20 }),
    (e) => {
      e.hub.onJson(e.a.c, { t: 'reel', i: 0, k: [10], u: 25 });
      e.hub.onJson(e.a.c, { t: 'reel', i: 1, k: [], u: 20 });
    },
    (e) => {
      e.hub.onJson(e.a.c, { t: 'reel', i: 0, k: [10], u: 25 });
      e.hub.onJson(e.a.c, { t: 'reel', i: 1, k: [20], u: 30 });
    },
    (e) => advance(e.hub, e.clock, REEL_LAG + 10),
  ];
  cases.forEach((bad, n) => {
    const e = fisher({ sp: sp('scad'), g: 300, coins: 0 });
    hookOne(e);
    advance(e.hub, e.clock, 30);
    bad(e);
    advance(e.hub, e.clock, 2);
    assert.equal(e.hall.phase(0), FP_IDLE, `случай ${n}`);
    assert.ok(fishEvents(e.a.s).some((x) => x[0] === FE_LOST), `случай ${n}: сорвалась`);
  });
});

test('поклёвка по погоде: в дождь сервер спрашивает улов с дождевыми, в ясную — без', () => {
  for (const rain of [false, true]) {
    const e = fisher({ sp: sp('scad'), g: 300, coins: 0 }, { rain });
    const seen: boolean[] = [];
    e.hall.roll = (r) => {
      seen.push(r);
      return { sp: sp('eel'), g: 900, coins: 0 };
    };
    hookOne(e);
    assert.deepEqual(seen, [rain]);
  }
});

test('сундук: сколько внутри — решено при поклёвке, жетоны — когда вытащил; от 151 — в общий чат; хлам — даром', () => {
  const e = fisher({ sp: SP_CHEST, g: 5000, coins: 180 });
  const b = login(e.hub, 'Зевака');
  const t0 = e.a.c.profile!.tokens;
  const { seed } = hookOne(e);
  playHonest(e, playReel(RULE[SP_CHEST]!.style, seed, EXPERT));
  advance(e.hub, e.clock, 2);
  const land = lastOf(e.a.s, 'fishLand')!;
  assert.equal(land.coins, 180);
  assert.equal(land.price, 180);
  assert.equal(land.bonus, 0);
  assert.equal(e.a.c.profile!.tokens, t0 + 180);
  assert.equal(e.a.c.profile!.stats.fsChests, 1);
  assert.equal(e.a.c.profile!.stats.fsFish, 0, 'сундук — не рыба');
  assert.ok(allOf(b.s, 'chat').some((m) => m.sys && m.text === '💰 Рыбак вылавливает сундук: 180 🪙!'));
  advance(e.hub, e.clock, HOLD2_TICKS + 1);
  e.hall.roll = () => ({ sp: SP_BOOT, g: 800, coins: 0 });
  const t1 = e.a.c.profile!.tokens;
  const h = hookOne(e);
  playHonest(e, playReel(RULE[SP_BOOT]!.style, h.seed, EXPERT));
  advance(e.hub, e.clock, 2);
  assert.equal(lastOf(e.a.s, 'fishLand')!.price, 0);
  assert.equal(e.a.c.profile!.tokens, t1);
});

test('доска у мостков: «Сегодня» и «За всё время» по штукам и весу; в полночь по Москве «Сегодня» пустеет; новый ник', () => {
  const e = fisher({ sp: sp('scad'), g: 300, coins: 0 });
  const b = login(e.hub, 'Зевака');
  for (const g of [300, 450]) {
    e.hall.roll = () => ({ sp: sp('scad'), g, coins: 0 });
    const { seed } = hookOne(e);
    playHonest(e, playReel(RULE[sp('scad')]!.style, seed, EXPERT));
    advance(e.hub, e.clock, TICK_RATE + 1);
  }
  const pid = e.a.c.pid;
  const top = lastOf(b.s, 'fishTop')!.top;
  assert.deepEqual(top.dn, [{ pid, nick: 'Рыбак', v: 2 }]);
  assert.deepEqual(top.dg, [{ pid, nick: 'Рыбак', v: 750 }]);
  assert.deepEqual(top.an, top.dn);
  assert.deepEqual(top.ag, top.dg);
  // новый ник — на доске
  e.hub.onJson(e.a.c, { t: 'rename', nick: 'Рыболов' });
  advance(e.hub, e.clock, TICK_RATE);
  assert.equal(lastOf(b.s, 'fishTop')!.top.an[0].nick, 'Рыболов');
  // полночь по Москве (21:00 UTC): «Сегодня» — пусто, «За всё время» — как было
  e.clock.now = Date.UTC(2026, 9, 2, 21, 0, 5);
  advance(e.hub, e.clock, TICK_RATE);
  const next = lastOf(b.s, 'fishTop')!.top;
  assert.equal(next.day, '2026-10-03');
  assert.deepEqual(next.dn, []);
  assert.deepEqual(next.dg, []);
  assert.equal(next.an[0].v, 2);
  // улов нового дня — «сегодня» с нуля
  e.hall.roll = () => ({ sp: sp('scad'), g: 200, coins: 0 });
  const { seed } = hookOne(e);
  playHonest(e, playReel(RULE[sp('scad')]!.style, seed, EXPERT));
  advance(e.hub, e.clock, TICK_RATE + 1);
  const t3 = lastOf(b.s, 'fishTop')!.top;
  assert.equal(t3.dn[0].v, 1);
  assert.equal(t3.dg[0].v, 200);
  assert.equal(t3.an[0].v, 3);
  assert.equal(t3.ag[0].v, 950);
});

test('коллекция: последний вид из всей коллекции (COLLECTION_SIZE) — вся лестница наград и строка в чат; потом — не повторяется', () => {
  const e = fisher({ sp: sp('goby'), g: 100, coins: 0 });
  const b = login(e.hub, 'Зевака');
  const prof = e.a.c.profile!;
  for (const s of COLLECTION) if (FISH[s].id !== 'goby') prof.album[FISH[s].id] = [FISH[s].g[0], 1];
  const { seed } = hookOne(e);
  playHonest(e, playReel(RULE[sp('goby')]!.style, seed, EXPERT));
  advance(e.hub, e.clock, 2);
  const land = lastOf(e.a.s, 'fishLand')!;
  assert.equal(land.got, COLLECTION_SIZE);
  assert.equal(land.full, true);
  // лестница fishstyle: за все виды — все ступени разом (до улова в альбоме ничего не выдавалось)
  const all = earnedItems(COLLECTION_SIZE);
  assert.deepEqual(land.rw, all);
  for (const id of all) assert.ok(prof.owned.includes(id), id);
  assert.deepEqual(lastOf(e.a.s, 'me')!.owned.filter((id) => all.includes(id)).sort(), [...all].sort());
  assert.ok(allOf(b.s, 'chat').some((m) => m.sys && m.text.includes('собрал всю коллекцию')));
  advance(e.hub, e.clock, HOLD2_TICKS + 1);
  const h = hookOne(e);
  playHonest(e, playReel(RULE[sp('goby')]!.style, h.seed, EXPERT));
  advance(e.hub, e.clock, 2);
  assert.equal(lastOf(e.a.s, 'fishLand')!.full, false);
  assert.equal(allOf(b.s, 'chat').filter((m) => m.text.includes('собрал всю коллекцию')).length, 1);
});

test('ушёл с места посреди вываживания — рыба сорвалась, жетонов нет; золотая рыбка в рыбалке 2.0 не клюёт', () => {
  const e = fisher({ sp: sp('scad'), g: 300, coins: 0 });
  const t0 = e.a.c.profile!.tokens;
  hookOne(e);
  e.hub.onJson(e.a.c, { t: 'unuse' });
  advance(e.hub, e.clock, 2);
  assert.equal(e.hall.occupant(0), 0);
  assert.equal(e.a.c.profile!.tokens, t0);
  assert.ok(!COLLECTION.includes(sp('goldfish')));
});
