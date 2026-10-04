// fisheco: рюкзак и продажа у Семёна и Сани, лавка (рюкзаки, блёсны, пиво, эль) с уровнями рыбалки, полный рюкзак,
// опыт ×0,4 и ×1,25 на баркасе, утешение за сорвавшуюся эпическую, баркас ×1,25 в минуту на модели игрока, шансы и
// потолок, рулетка (выплаты, залог, рестарт), старое сохранение. Всё — через настоящие Hub/LobbyRoom и временный диск.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import { FE_BITE, FISH, FP_BITE, FP_IDLE } from '../shared/fishing.ts';
import { FISH_NPC_USE, FISH_SPOTS, ROULETTE_SPOT, spotZone } from '../shared/fishplaces.ts';
import {
  BAG_ALE, BAG_BARKAS, BAG_BEER, BAG_LORD, FISH_XP_LEVELS, activeDrink, emptyFishProgress, fishCastMods, fishCatchXp, fishLostXp,
  normalizeFishProgress, type FishGear, type FishProgress, type FishRod,
} from '../shared/fishprogress.ts';
import {
  BARKAS_INCOME, BARKAS_XP, CHEST_PER_10K, CONSOLATION_SHARE, CONSOLATION_TICKS, COLLECTION, JUNK_PER_10K, RAIN_XP, RULE, SP_BOOT, SP_BOTTLE,
  T_COMMON, T_EPIC, T_MYTH, T_RARE, XP_SCALE, basePrice, fishPrice2, junkPer10k, reelStyleFor, rollCatch2, tierOdds, type Hooked,
} from '../shared/fishrules.ts';
import { ALE, BAGS, BAG_BASE, BAG_MAX, BEER, LORD, LORD_CHEST_CHANCE, LURES } from '../shared/fishshop.ts';
import { ROULETTE_MAX_PAYOUT, ROULETTE_WHEEL, roulettePayout, rouletteColor } from '../shared/roulette.ts';
import { Hub } from '../server/hub.ts';
import { BAG_FULL_TEXT, type FishingHall2 } from '../server/lobby/fishing2.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { EXPERT, TYPICAL, fishIncome, playReel, type Play } from './fishbot.ts';
import { SMOKE, allOf, lastOf, login, placeAt } from './kit.ts';

const dirs: string[] = [];
after(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const sp = (id: string): number => FISH.findIndex((f) => f.id === id);

function setup(o: { rain?: boolean; roulette?: boolean } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-fisheco-'));
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 3, 12) };
  const store = new Store(dir, { now: () => clock.now, log: () => {}, saveDelayMs: 60_000 });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({
    store, profiles, now: () => clock.now, log: () => {}, build: 'test', smokeToken: SMOKE, fish2: true, roulette: o.roulette ?? false,
    weather: o.rain ? 'rain' : 'clear',
  });
  const a = login(hub, 'Рыболов');
  return { hub, store, profiles, clock, dir, a };
}
type Env = ReturnType<typeof setup>;

function advance(e: Env, n: number): void {
  for (let i = 0; i < n; i++) { e.clock.now += 1000 / TICK_RATE; e.hub.step(); }
}

/** Встать к Семёну или Сане */
function toNpc(e: Env, npc: 'semyon' | 'sanya', who = e.a): void {
  const u = FISH_NPC_USE[npc]!;
  placeAt(e.hub, who.c, u.x, u.z, u.y);
}

/** Сесть на место spot; rand всегда 0,5; клюёт what */
function sit(e: Env, what: Hooked, spot = 0): FishingHall2 {
  const it = e.hub.lobby.map.interact.find((i) => i.kind === 'fish' && i.arg === spot)!;
  placeAt(e.hub, e.a.c, it.x, it.z);
  e.hub.onJson(e.a.c, { t: 'use', id: it.id });
  const hall = e.hub.lobby.fishing2 as FishingHall2;
  assert.ok(hall);
  hall.rand = () => .5;
  hall.roll = () => ({ ...what });
  return hall;
}

/** Заброс, поклёвка, подсечка с выбранным сидом шкалы; что вытащит (или не вытащит) модель игрока — решает pick */
function hookWith(e: Env, hall: FishingHall2, pick: (style: ReturnType<typeof reelStyleFor>, seed: number) => Play | null): { play: Play; spot: number } {
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'cast' });
  for (let i = 0; i < 30 * TICK_RATE && hall.phase(0) !== FP_BITE && hall.views().every((v) => v.ph !== FP_BITE); i++) advance(e, 1);
  advance(e, 2);
  const spot = hall.views().findIndex((v) => v.ph === FP_BITE);
  assert.ok(spot >= 0, 'поклёвка');
  const view = hall.views()[spot];
  const mods = view.mods!;
  const what = hall.roll(false, () => .5, mods);
  const style = reelStyleFor(what.sp, mods);
  let play: Play | null = null;
  let seed = 0;
  for (let candidate = 1; candidate <= 400 && !play; candidate++) { play = pick(style, candidate); seed = candidate; }
  assert.ok(play, 'нашлась нужная игра');
  const n = allOf(e.a.s, 'lev').flatMap((m) => m.e).filter((ev) => ev[0] === 'fish' && ev[1] === FE_BITE).at(-1)![3];
  const rand = hall.rand;
  hall.rand = () => (seed >>> 0) / 0x1_0000_0000;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'hook', n });
  hall.rand = rand;
  assert.equal(lastOf(e.a.s, 'fishReel')!.seed, seed);
  return { play, spot };
}

function playHonest(e: Env, p: Play): void {
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
  advance(e, 2);
}

/** Поймать what честно (опытный игрок, выигрышный сид) */
function catchOne(e: Env, hall: FishingHall2, what: Hooked): void {
  hall.roll = () => ({ ...what });
  const { play } = hookWith(e, hall, (style, seed) => { const p = playReel(style, seed, EXPERT); return p.caught ? p : null; });
  playHonest(e, play);
}

function progressAt(level: number, rod: FishRod = 0, lure: FishGear = 0): FishProgress {
  return { ...emptyFishProgress(), xp: FISH_XP_LEVELS[level], questsDone: rod >= 3 ? 10 : rod >= 2 ? 5 : rod, rod, lure };
}

// ------------------------------------------------------------ лавка

test('лавка: рюкзаки 250/500/1000 с 0/3/5 уровня, блёсны 250/1000/3000/5000 с 1/4/6/8; действует лучший, младший после старшего не продаётся', () => {
  const e = setup();
  const p = e.a.c.profile!;
  toNpc(e, 'semyon');
  const buy = (item: string) => {
    e.clock.now += 1100;
    e.hub.onJson(e.a.c, { t: 'fishNpc', npc: 'semyon', a: 'buy', item });
    return lastOf(e.a.s, 'fishNpc')!;
  };
  assert.deepEqual(BAGS.map((b) => [b.price, b.level, b.slots]), [[250, 0, 10], [500, 3, 15], [1000, 5, 20]]);
  assert.deepEqual(LURES.map((l) => [l.price, l.level, l.calm, l.epic]), [[250, 1, .03, 1.03], [1000, 4, .05, 1.05], [3000, 6, .1, 1.1], [5000, 8, .15, 1.15]]);
  p.tokens = 5000;
  assert.match(buy('bag2').message!, /с 3-го уровня/);
  assert.match(buy('lure1').message!, /с 1-го уровня/);
  assert.equal(p.tokens, 5000, 'по уровню не продаётся — жетоны целы');
  assert.match(buy('bag1').message!, /твой/);
  assert.equal(p.fishing.bagTier, 1);
  assert.equal(p.tokens, 4750);
  assert.match(buy('bag1').message!, /уже есть/);
  p.fishing.xp = FISH_XP_LEVELS[5];
  assert.match(buy('bag3').message!, /твой/);
  assert.equal(p.tokens, 3750);
  assert.match(buy('bag2').message!, /лучше/, 'после профессионала рыболова не продают');
  assert.equal(p.fishing.bagTier, 3);
  assert.equal(lastOf(e.a.s, 'fishNpc')!.progress.bagTier, 3);
  assert.equal(buy('lure2').message, 'Серебряная блесна — твоя!');
  assert.match(buy('lure1').message!, /лучше/);
  assert.match(buy('lure3').message!, /с 6-го уровня/);
  p.fishing.xp = FISH_XP_LEVELS[6];
  p.tokens = 2999;
  assert.match(buy('lure3').message!, /Не хватает/);
  assert.equal(p.fishing.lure, 2);
  assert.match(buy('nope').message!, /нет/);
  assert.equal(p.tokens, 2999);
  // 04.10: платиновая — 5000 с 8-го уровня; после неё младшие не продаются
  p.tokens = 5000;
  assert.match(buy('lure4').message!, /Платиновая блесна — с 8-го уровня/);
  p.fishing.xp = FISH_XP_LEVELS[8];
  assert.equal(buy('lure4').message, 'Платиновая блесна — твоя!');
  assert.equal(p.fishing.lure, 4);
  assert.equal(p.tokens, 0);
  assert.match(buy('lure3').message!, /лучше/);
  const mods = fishCastMods(p.fishing, e.clock.now);
  assert.equal(mods.lure, 4);
  assert.equal(mods.calm, 0.15);
  assert.equal(mods.epicMultiplier, 1.15);
});

test('напитки: пиво 15 (+10 % к цене, редкие ×1,2), эль 30 (+15 %, ×1,3); эль заменяет пиво, пиво поверх эля не наливают', () => {
  const e = setup();
  const p = e.a.c.profile!;
  toNpc(e, 'semyon');
  const order = (a: 'beer' | 'ale') => {
    e.clock.now += 1100;
    e.hub.onJson(e.a.c, { t: 'fishNpc', npc: 'semyon', a });
    return lastOf(e.a.s, 'fishNpc')!.message!;
  };
  assert.deepEqual([BEER.price, BEER.income, BEER.rare, ALE.price, ALE.income, ALE.rare], [15, 1.1, 1.2, 30, 1.15, 1.3]);
  p.tokens = 100;
  assert.match(order('beer'), /пиво действует/);
  assert.equal(p.tokens, 85);
  assert.equal(fishCastMods(p.fishing, e.clock.now).drink, 1);
  assert.match(order('beer'), /уже действует/);
  assert.match(order('ale'), /эль действует/);
  assert.equal(p.tokens, 55);
  assert.equal(p.fishing.beerUntil, 0, 'эль сменил пиво');
  const mods = fishCastMods(p.fishing, e.clock.now);
  assert.equal(mods.drink, 2);
  assert.equal(mods.incomeScale, 1.15);
  assert.ok(Math.abs(mods.rareMultiplier - 1.3) < 1e-12);
  assert.match(order('beer'), /поверх эля/);
  assert.equal(p.tokens, 55);
});

// ------------------------------------------------------------ рюкзак

test('рюкзак: улов — в рюкзак по цене поимки (пиво кончилось — цена та же), продажа одной и всего у Семёна; жетоны — без общего опыта второй раз', () => {
  const e = setup();
  const p = e.a.c.profile!;
  p.tokens = 100;
  p.fishing.beerUntil = e.clock.now + 30_000;
  const hall = sit(e, { sp: sp('scad'), g: 300, coins: 0 });
  catchOne(e, hall, { sp: sp('scad'), g: 300, coins: 0 });
  const first = lastOf(e.a.s, 'fishLand')!;
  assert.equal(first.price, Math.round(basePrice(sp('scad'), 300) * BEER.income));
  assert.equal(first.m, BAG_BEER);
  assert.equal(first.bag, 1);
  assert.equal(first.cap, BAG_BASE);
  const xpAfterCatch = p.xp;
  assert.ok(xpAfterCatch >= first.price, 'общий опыт — при поимке, по цене');
  catchOne(e, hall, { sp: sp('mullet'), g: 900, coins: 0 });
  assert.equal(p.fishing.bag.length, 2);
  // пиво кончилось — цена рыбы в рюкзаке не меняется
  e.clock.now += 60_000;
  e.hub.onJson(e.a.c, { t: 'unuse' });
  toNpc(e, 'semyon');
  const tokens = p.tokens;
  const xp = p.xp;
  const [scad, mullet] = p.fishing.bag;
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fishNpc', npc: 'semyon', a: 'sell', n: scad.n });
  let reply = lastOf(e.a.s, 'fishNpc')!;
  assert.deepEqual(reply.sold, { n: 1, coins: first.price });
  assert.equal(p.tokens, tokens + first.price);
  assert.deepEqual(p.fishing.bag, [mullet]);
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fishNpc', npc: 'semyon', a: 'sell', n: scad.n });
  assert.match(lastOf(e.a.s, 'fishNpc')!.message!, /нет/, 'второй раз ту же рыбу не продать');
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fishNpc', npc: 'semyon', a: 'sellAll' });
  reply = lastOf(e.a.s, 'fishNpc')!;
  assert.deepEqual(reply.sold, { n: 1, coins: mullet.p });
  assert.equal(p.tokens, tokens + first.price + mullet.p);
  assert.deepEqual(p.fishing.bag, []);
  assert.equal(p.xp, xp, 'за продажу общий опыт не дают второй раз');
  assert.equal(p.stats.fsSold, 2);
  assert.equal(lastOf(e.a.s, 'me')!.tokens, p.tokens);
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fishNpc', npc: 'semyon', a: 'sellAll' });
  assert.match(lastOf(e.a.s, 'fishNpc')!.message!, /пуст/);
});

test('продать можно только рядом с Семёном или Саней; Саня продаёт тем же окном, чужое действие подключается через register', () => {
  const e = setup();
  const p = e.a.c.profile!;
  p.fishing.bag = [{ n: 0, f: 'scad', g: 300, p: 9, m: 0 }, { n: 1, f: 'sprat', g: 20, p: 11, m: BAG_BARKAS }];
  p.fishing.bagSeq = 2;
  const t0 = p.tokens;
  e.hub.onJson(e.a.c, { t: 'fishNpc', npc: 'semyon', a: 'sellAll' });
  assert.equal(lastOf(e.a.s, 'fishNpc')!.message, 'Подойди к Деду Семёну на пристани');
  assert.equal(lastOf(e.a.s, 'fishNpc')!.open, false);
  toNpc(e, 'semyon');
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fishNpc', npc: 'sanya', a: 'sellAll' });
  assert.equal(lastOf(e.a.s, 'fishNpc')!.message, 'Подойди к Сане на баркасе', 'у Семёна за Саню не продают');
  assert.equal(p.tokens, t0);
  toNpc(e, 'sanya');
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fishNpc', npc: 'sanya', a: 'sell', n: 1 });
  assert.equal(lastOf(e.a.s, 'fishNpc')!.npc, 'sanya');
  assert.equal(p.tokens, t0 + 11);
  // чужое действие (перевоз Сани — модуль баркаса)
  const calls: string[] = [];
  e.hub.lobby.fishNpc!.register('ferry', ({ npc, prof }) => { calls.push(`${npc}:${prof.nick}`); return 'Отчаливаем!'; });
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fishNpc', npc: 'sanya', a: 'ferry' });
  assert.deepEqual(calls, ['sanya:Рыболов']);
  assert.equal(lastOf(e.a.s, 'fishNpc')!.message, 'Отчаливаем!');
  toNpc(e, 'semyon');
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fishNpc', npc: 'sanya', a: 'ferry' });
  assert.equal(calls.length, 1, 'издали — не вызывается');
});

test('полный рюкзак: заброс не уходит, подсказка «продай Семёну или Сане или отпусти рыбу из рюкзака (I)»; отпустить рыбу можно где угодно — и снова ловится', () => {
  const e = setup();
  const p = e.a.c.profile!;
  p.fishing.bag = Array.from({ length: BAG_BASE }, (_v, n) => ({ n, f: 'goby', g: 100, p: 5, m: 0 }));
  p.fishing.bagSeq = BAG_BASE;
  const hall = sit(e, { sp: sp('scad'), g: 300, coins: 0 });
  const casts = p.stats.fsCasts;
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'cast' });
  assert.equal(hall.phase(0), FP_IDLE);
  assert.equal(p.stats.fsCasts, casts);
  assert.equal(lastOf(e.a.s, 'toast')!.text, BAG_FULL_TEXT);
  assert.equal(BAG_FULL_TEXT, 'Рюкзак полон — продай улов Семёну или Сане или отпусти рыбу из рюкзака (I)');
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fishBag', a: 'release', n: 3 });
  assert.equal(p.fishing.bag.length, BAG_BASE - 1);
  assert.ok(!p.fishing.bag.some((f) => f.n === 3));
  assert.equal(lastOf(e.a.s, 'fishProgress')!.progress.bag.length, BAG_BASE - 1);
  e.clock.now += 1100;
  e.hub.onJson(e.a.c, { t: 'fishBag', a: 'release', n: 3 });
  assert.equal(p.fishing.bag.length, BAG_BASE - 1, 'второй раз ту же — ничего');
  catchOne(e, hall, { sp: sp('scad'), g: 300, coins: 0 });
  assert.equal(p.fishing.bag.length, BAG_BASE);
  assert.equal(p.fishing.bag.at(-1)!.n, BAG_BASE, 'номер новой рыбы не повторяет отпущенную');
});

test('сундук и бонус за новый вид — сразу жетонами, хлам — мимо рюкзака', () => {
  const e = setup();
  const p = e.a.c.profile!;
  const hall = sit(e, { sp: sp('scad'), g: 300, coins: 0 });
  const t0 = p.tokens;
  catchOne(e, hall, { sp: sp('chest'), g: 5000, coins: 137 });
  assert.equal(p.tokens, t0 + 137);
  catchOne(e, hall, { sp: sp('boot'), g: 800, coins: 0 });
  assert.equal(p.fishing.bag.length, 0);
  catchOne(e, hall, { sp: sp('bluefish'), g: 2000, coins: 0 });
  assert.equal(p.tokens, t0 + 137 + 20, 'новая эпическая — +20 сразу');
  assert.equal(p.fishing.bag.length, 1);
});

// ------------------------------------------------------------ опыт

test('опыт рыбалки: прежняя формула ×0,4 (+20 %), на баркасе ещё ×1,25; утешение — четверть опыта за эпическую и выше после 3 с борьбы', () => {
  assert.equal(XP_SCALE, 0.4);
  assert.equal(BARKAS_XP, 1.25);
  for (const s of COLLECTION) {
    const r = RULE[s]!;
    const base = fishCatchXp(s);
    if (r.zone === 'barkas') {
      const raw = r.xpBase! * (r.tier >= 3 ? 5 : 1);
      assert.equal(fishCatchXp(s, false, { zone: 'barkas' }), Math.max(1, Math.round(raw * XP_SCALE * BARKAS_XP)), FISH[s].id);
    }
    assert.ok(fishCatchXp(s, true) >= base, FISH[s].id);
    const lost = fishLostXp(s, CONSOLATION_TICKS, { zone: r.zone });
    if (r.tier >= T_EPIC) assert.equal(lost, Math.max(1, Math.round(fishCatchXp(s, false, { zone: r.zone }) * CONSOLATION_SHARE)), FISH[s].id);
    else assert.equal(lost, 0, `${FISH[s].id}: обычные и редкие — без утешения`);
    assert.equal(fishLostXp(s, CONSOLATION_TICKS - 1, { zone: r.zone }), 0, 'раньше 3 с — без утешения');
  }
});

test('сорвалась эпическая после 3 с борьбы — сервер даёт четверть опыта и шлёт fishLost; сорвалась сразу — ничего', () => {
  const e = setup();
  const p = e.a.c.profile!;
  const hall = sit(e, { sp: sp('bluefish'), g: 2000, coins: 0 });
  hall.roll = () => ({ sp: sp('bluefish'), g: 2000, coins: 0 });
  const late = hookWith(e, hall, (style, seed) => { const q = playReel(style, seed, TYPICAL); return !q.caught && q.ticks >= CONSOLATION_TICKS + 30 ? q : null; });
  playHonest(e, late.play);
  const lost = lastOf(e.a.s, 'fishLost');
  assert.ok(lost, 'утешение пришло');
  const want = fishLostXp(sp('bluefish'), CONSOLATION_TICKS);
  assert.deepEqual(lost, { t: 'fishLost', tier: T_EPIC, xp: want });
  assert.equal(p.fishing.xp, want);
  assert.equal(p.fishing.bag.length, 0);
  // держит кнопку с первой секунды: зона у верха, рыба внизу — сорвалась быстро, без опыта
  const n = allOf(e.a.s, 'fishLost').length;
  hookWith(e, hall, () => ({ caught: false, perfect: false, ticks: 1, toggles: [0] }));
  for (let u = 15; hall.phase(0) !== FP_IDLE && u < 600; u += 15) {
    advance(e, 15);
    e.hub.onJson(e.a.c, { t: 'reel', i: u === 15 ? 0 : 1, k: u === 15 ? [0] : [], u });
  }
  assert.equal(hall.phase(0), FP_IDLE);
  assert.equal(allOf(e.a.s, 'fishLost').length, n);
  assert.equal(p.fishing.xp, want);
});

// ------------------------------------------------------------ шансы

test('«Шансы сейчас»: доли категорий в сумме 1 у любого снаряжения; уровень, удочка, напиток и блесна поднимают редких и выше, обычные — остаток (потолок — их нет)', () => {
  const levels = [[0, 0, 0], [3, 1, 1], [5, 2, 2], [10, 3, 3]] as const;
  for (const zone of ['pier', 'barkas'] as const) {
    let prev: number[] | null = null;
    for (const [level, rod, lure] of levels) {
      const prog = { ...progressAt(level, rod as FishRod, lure as FishGear), aleUntil: level === 10 ? 1e12 : 0 };
      const mods = fishCastMods(prog, 0, zone);
      for (const rain of [false, true]) {
        const odds = tierOdds(rain, mods);
        assert.ok(Math.abs(odds.reduce((a, b) => a + b, 0) - 1) < 1e-9, `${zone} ур. ${level} дождь ${rain}`);
        assert.ok(odds.every((v) => v >= 0));
      }
      const clear = tierOdds(false, mods);
      if (prev) {
        assert.ok(clear[T_COMMON] < prev[T_COMMON], `${zone}: обычных меньше на ур. ${level}`);
        for (let t = T_RARE; t <= T_MYTH; t++) assert.ok(clear[t] >= prev[t] - 1e-12, `${zone}: категория ${t} не реже на ур. ${level}`);
      }
      prev = clear;
    }
  }
  // явный потолок: обычных не осталось — редкие и выше делят всё в прежних пропорциях, сумма та же
  const top = tierOdds(false, { ...fishCastMods(progressAt(10, 3, 3), 0, 'barkas'), rareMultiplier: 4, epicMultiplier: 1.1 });
  assert.equal(top[T_COMMON], 0);
  assert.ok(Math.abs(top.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  // блесна поднимает только эпических и выше
  const plain = tierOdds(false, fishCastMods(progressAt(6), 0, 'pier'));
  const gold = tierOdds(false, fishCastMods(progressAt(6, 0, 3), 0, 'pier'));
  assert.ok(Math.abs(gold[T_EPIC] / plain[T_EPIC] - 1.1) < 0.01);
  assert.ok(Math.abs(gold[T_MYTH] / plain[T_MYTH] - 1.1) < 0.01);
  assert.ok(Math.abs(gold[T_RARE] / plain[T_RARE] - 1) < 1e-9);
});

// ------------------------------------------------------------ баркас ×1,25

test('баркас: цена каждой рыбы ×1,25 одним округлением, видно на карточке (база и множитель); на модели — ×1,25 ± 0,06 к пристани в минуту на ур. 3, 5, 10', (t) => {
  assert.equal(BARKAS_INCOME, 1.25);
  const mods = fishCastMods({ ...progressAt(3), aleUntil: 1e12 }, 0, 'barkas');
  const g = FISH[sp('cod')].g[1];
  assert.equal(fishPrice2(sp('cod'), g, 0, mods), Math.round(basePrice(sp('cod'), g) * ALE.income * BARKAS_INCOME));
  assert.equal(fishPrice2(sp('chest'), 5000, 150, mods), 150, 'сундук — без множителей');
  for (const [level, rod, lure] of [[3, 1, 1], [5, 2, 2], [10, 3, 3]] as const) {
    const prog = progressAt(level, rod, lure);
    const pier = fishIncome(TYPICAL, false, 300, fishCastMods(prog, 0, 'pier'));
    const sea = fishIncome(TYPICAL, false, 300, fishCastMods(prog, 0, 'barkas'));
    t.diagnostic(`ур. ${level}: пристань ${pier.coins.toFixed(1)} 🪙 ${pier.xp.toFixed(1)} XP, баркас ${sea.coins.toFixed(1)} 🪙 ${sea.xp.toFixed(1)} XP — ×${(sea.coins / pier.coins).toFixed(3)} / ×${(sea.xp / pier.xp).toFixed(3)}`);
    assert.ok(Math.abs(sea.coins / pier.coins - 1.25) <= 0.06, `жетоны, ур. ${level}: ×${(sea.coins / pier.coins).toFixed(3)}`);
    assert.ok(Math.abs(sea.xp / pier.xp - 1.25) <= 0.06, `опыт, ур. ${level}: ×${(sea.xp / pier.xp).toFixed(3)}`);
  }
});

test('на баркасе клюют только его виды, рыба в рюкзаке помечена баркасом и элем; карточка показывает базу', () => {
  const e = setup();
  const p = e.a.c.profile!;
  p.fishing = { ...progressAt(3, 1), aleUntil: e.clock.now + 600_000 };
  const barkas = FISH_SPOTS.findIndex((_s, i) => spotZone(i) === 'barkas');
  assert.ok(barkas >= 0, 'место баркаса есть');
  let rolledZone = '';
  const hall = sit(e, { sp: sp('cod'), g: 2000, coins: 0 }, barkas);
  hall.roll = (_rain, _rand, m) => { rolledZone = m?.zone ?? ''; return { sp: sp('cod'), g: 2000, coins: 0 }; };
  const { play } = hookWith(e, hall, (style, seed) => { const q = playReel(style, seed, EXPERT); return q.caught ? q : null; });
  assert.equal(rolledZone, 'barkas');
  playHonest(e, play);
  const land = lastOf(e.a.s, 'fishLand')!;
  assert.equal(land.m, BAG_BARKAS | BAG_ALE);
  assert.equal(land.base, basePrice(sp('cod'), 2000));
  assert.equal(land.price, Math.round(land.base! * ALE.income * BARKAS_INCOME));
  assert.equal(land.xp, fishCatchXp(sp('cod'), land.perfect, { zone: 'barkas' }));
  assert.deepEqual(p.fishing.bag.map((f) => [f.f, f.p, f.m]), [['cod', land.price, BAG_BARKAS | BAG_ALE]]);
});

// ------------------------------------------------------------ рулетка

test('рулетка: красное и чёрное ×2, зеро ×36, проигрыш — 0; 18 красных, 18 чёрных, одно зеро; выплата не выше потолка', () => {
  const colors = ROULETTE_WHEEL.map(rouletteColor);
  assert.equal(ROULETTE_WHEEL.length, 37);
  assert.equal(new Set(ROULETTE_WHEEL).size, 37);
  assert.deepEqual([colors.filter((c) => c === 'red').length, colors.filter((c) => c === 'black').length, colors.filter((c) => c === 'green').length], [18, 18, 1]);
  assert.equal(roulettePayout(600, 'red', 1), 1200);
  assert.equal(roulettePayout(600, 'black', 2), 1200);
  assert.equal(roulettePayout(600, 'green', 0), Math.min(ROULETTE_MAX_PAYOUT, 21_600));
  assert.equal(roulettePayout(600, 'red', 2), 0);
  assert.equal(roulettePayout(600, 'green', 5), 0);
  assert.equal(roulettePayout(0, 'red', 1), 0);
  // потолок — целое число жетонов (цифру согласует владелец) и действует на любой цвет
  assert.ok(Number.isSafeInteger(ROULETTE_MAX_PAYOUT) && ROULETTE_MAX_PAYOUT >= 1000, `потолок ${ROULETTE_MAX_PAYOUT}`);
  assert.equal(roulettePayout(ROULETTE_MAX_PAYOUT, 'red', 1), ROULETTE_MAX_PAYOUT);
  assert.equal(roulettePayout(ROULETTE_MAX_PAYOUT, 'green', 0), ROULETTE_MAX_PAYOUT);
  const under = Math.floor(ROULETTE_MAX_PAYOUT / 36);
  assert.equal(roulettePayout(under, 'green', 0), under * 36, 'ниже потолка — честные ×36');
});

test('рулетка: весь улов на цвет, общий раунд; все у стола поставили — крутим; выплата жетонами, зеро — в общий чат; залог переживает рестарт', () => {
  const e = setup({ roulette: true });
  const b = login(e.hub, 'Вася', undefined, '10.0.0.7');
  const pa = e.a.c.profile!, pb = b.c.profile!;
  const table = e.hub.lobby.roulette!;
  assert.ok(table, 'стол есть с флагом ROULETTE');
  pa.fishing.bag = [{ n: 0, f: 'scad', g: 300, p: 9, m: 0 }, { n: 1, f: 'cod', g: 2000, p: 31, m: BAG_BARKAS }];
  pb.fishing.bag = [{ n: 0, f: 'tuna', g: 30_000, p: 600, m: 0 }];
  const ta = pa.tokens, tb = pb.tokens;
  // далеко от стола — не принимают
  e.hub.onJson(e.a.c, { t: 'roulette', a: 'bet', c: 'red' });
  assert.equal(lastOf(e.a.s, 'toast')!.text, 'Подойди к столу рулетки');
  placeAt(e.hub, e.a.c, ROULETTE_SPOT.x, ROULETTE_SPOT.z + 1);
  placeAt(e.hub, b.c, ROULETTE_SPOT.x + 1, ROULETTE_SPOT.z + 1);
  table.spin = () => 0;
  e.hub.onJson(e.a.c, { t: 'roulette', a: 'bet', c: 'red' });
  assert.deepEqual(pa.fishing.bag, [], 'улов ушёл на стол');
  assert.deepEqual(pa.rouletteEscrow?.amount, 40);
  let v = lastOf(b.s, 'roulette')!.v;
  assert.equal(v.phase, 'open');
  assert.deepEqual(v.bets.map((x) => [x.nick, x.c, x.stake, x.fish]), [['Рыболов', 'red', 40, 2]]);
  e.hub.onJson(e.a.c, { t: 'roulette', a: 'bet', c: 'black' });
  assert.equal(lastOf(e.a.s, 'toast')!.text, 'Ты уже поставил в этом раунде');
  e.hub.onJson(b.c, { t: 'roulette', a: 'bet', c: 'green' });
  v = lastOf(b.s, 'roulette')!.v;
  assert.equal(v.phase, 'spin', 'все у стола поставили — крутим сразу');
  assert.equal(v.n, 0);
  // пока крутится — новые ставки не принимают; рестарт посреди вращения вернул бы цену улова жетонами
  e.store.flush();
  const copy = new Store(e.dir, { now: () => e.clock.now, log: () => {} });
  copy.load();
  const restored = new Profiles(copy, { now: () => e.clock.now });
  assert.equal(restored.byId(pa.id)!.tokens, ta + 40, 'рестарт: залог вернулся жетонами');
  assert.equal(restored.byId(pa.id)!.rouletteEscrow, null);
  copy.close();
  advance(e, 8 * TICK_RATE);
  assert.equal(lastOf(e.a.s, 'roulette')!.v.phase, 'idle');
  assert.deepEqual(lastOf(e.a.s, 'rouletteResult'), { t: 'rouletteResult', n: 0, c: 'green', stake: 40, payout: 0, fish: 2 });
  // 600 на зеро — ×36 = 21 600, но не больше потолка
  const win = Math.min(ROULETTE_MAX_PAYOUT, 21_600);
  assert.deepEqual(lastOf(b.s, 'rouletteResult'), { t: 'rouletteResult', n: 0, c: 'green', stake: 600, payout: win, fish: 1 });
  assert.equal(pa.tokens, ta);
  assert.equal(pb.tokens, tb + win);
  assert.equal(pa.rouletteEscrow, null);
  assert.equal(pb.stats.rlWon, win);
  assert.equal(pa.stats.rlStaked, 40);
  // разряды — неразрывным пробелом, как везде в чате
  assert.ok(allOf(e.a.s, 'chat').some((m) => m.sys && m.text.includes(`Вася поставил улов на зеро и выиграл ${String(win).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')} 🪙!`)));
  // пустой рюкзак — ставить нечего
  e.hub.onJson(e.a.c, { t: 'roulette', a: 'bet', c: 'red' });
  assert.equal(lastOf(e.a.s, 'toast')!.text, 'Рюкзак пуст — ставить нечего');
});

test('рулетка без флага ROULETTE — стола нет, ставки не принимаются', () => {
  const e = setup();
  assert.equal(e.hub.lobby.roulette, null);
  const p = e.a.c.profile!;
  p.fishing.bag = [{ n: 0, f: 'scad', g: 300, p: 9, m: 0 }];
  placeAt(e.hub, e.a.c, ROULETTE_SPOT.x, ROULETTE_SPOT.z + 1);
  e.hub.onJson(e.a.c, { t: 'roulette', a: 'bet', c: 'red' });
  assert.equal(p.fishing.bag.length, 1);
  assert.ok(!('roulette' in lastOf(e.a.s, 'lobby')!));
});

// ------------------------------------------------------------ сохранение

test('старое сохранение: без рюкзака — пустой рюкзак; битая рыба, чужие виды, дубли номеров и лишнее сверх 20 — отбрасываются', () => {
  const old = normalizeFishProgress({ xp: 400, questsDone: 2, questCaught: 3, rod: 1, beerUntil: 5 });
  assert.deepEqual(old, { ...emptyFishProgress(), xp: 400, questsDone: 2, questCaught: 3, rod: 1, beerUntil: 5 });
  const raw = {
    xp: 0, bagTier: 3, lure: 9, bagSeq: 1,
    bag: [
      { n: 0, f: 'scad', g: 300, p: 9, m: 0 },
      { n: 0, f: 'goby', g: 100, p: 5, m: 0 },
      { n: 1, f: 'goldfish', g: 100, p: 5, m: 0 },
      { n: 2, f: 'boot', g: 900, p: 0, m: 0 },
      { n: 3, f: 'scad', g: 300.5, p: 9, m: 0 },
      { n: 4, f: 'scad', g: 300, p: -1, m: 0 },
      { n: 5, f: 'scad', g: 300, p: 9, m: 99 },
      ...Array.from({ length: 30 }, (_v, i) => ({ n: 10 + i, f: 'cod', g: 2000, p: 30, m: BAG_BARKAS })),
    ],
  };
  const p = normalizeFishProgress(raw);
  assert.equal(p.bagTier, 3);
  assert.equal(p.lure, 0, 'неизвестная блесна — без блесны');
  assert.equal(p.bag.length, BAG_MAX);
  assert.deepEqual(p.bag[0], { n: 0, f: 'scad', g: 300, p: 9, m: 0 });
  assert.ok(p.bag.slice(1).every((f) => f.f === 'cod'));
  assert.equal(p.bagSeq, Math.max(...p.bag.map((f) => f.n)) + 1, 'номер следующей рыбы — после всех');
  assert.deepEqual(normalizeFishProgress(JSON.parse(JSON.stringify(p))), p, 'повторная нормализация ничего не меняет');
});

// ------------------------------------------------------------ 03.10: дождь, хлам, пиво подводного владыки

test('в дождь опыт рыбалки ×1,15 — и за поимку, и утешительный; на сервере — по погоде в момент поимки', () => {
  assert.equal(RAIN_XP, 1.15);
  for (const id of ['scad', 'bluefish', 'sturgeon', 'whiteshark', 'cod', 'oarfish']) {
    const s = sp(id);
    const mods = RULE[s]!.zone === 'barkas' ? fishCastMods(progressAt(3, 1), 0, 'barkas') : undefined;
    for (const perfect of [false, true]) {
      const dry = fishCatchXp(s, perfect, mods), wet = fishCatchXp(s, perfect, mods, true);
      assert.ok(wet > dry && Math.abs(wet - dry * RAIN_XP) <= 1, `${id}: ${dry} → ${wet}`);
    }
  }
  assert.ok(fishLostXp(sp('sturgeon'), CONSOLATION_TICKS, undefined, true) >= fishLostXp(sp('sturgeon'), CONSOLATION_TICKS));
  const e = setup({ rain: true });
  const p = e.a.c.profile!;
  const hall = sit(e, { sp: sp('scad'), g: 300, coins: 0 });
  const xp0 = p.fishing.xp;
  catchOne(e, hall, { sp: sp('scad'), g: 300, coins: 0 });
  const land = lastOf(e.a.s, 'fishLand')!;
  assert.equal(land.xp, fishCatchXp(sp('scad'), land.perfect, { zone: 'pier' }, true));
  assert.equal(p.fishing.xp, xp0 + land.xp!);
});

test('хлам реже с каждым уровнем рыбалки: 4,5 % у новичка, на 10-м — ни одного (освободившееся — рыбе)', () => {
  assert.equal(junkPer10k(0), JUNK_PER_10K);
  for (let l = 1; l <= 10; l++) assert.ok(junkPer10k(l) < junkPer10k(l - 1), `ур. ${l}`);
  assert.equal(junkPer10k(10), 0);
  assert.equal(junkPer10k(5), JUNK_PER_10K / 2);
  for (const level of [0, 5, 10]) {
    const odds = tierOdds(false, fishCastMods(progressAt(level), 0));
    assert.ok(Math.abs(odds[5] - junkPer10k(level) / 10_000) < 1e-12, `ур. ${level}: хлам ${odds[5]}`);
    assert.ok(Math.abs(odds.reduce((s, x) => s + x, 0) - 1) < 1e-9, 'сумма шансов — 1');
  }
  // та же поклёвка из «полосы хлама»: новичку — сапог или бутылка, на 10-м — рыба
  const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
  const band = (CHEST_PER_10K + 100) / 10_000;
  const novice = rollCatch2(false, seq([band, 0.5, 0.5, 0.5]), fishCastMods(progressAt(0), 0));
  const master = rollCatch2(false, seq([band, 0.5, 0.5, 0.5]), fishCastMods(progressAt(10), 0));
  assert.ok(novice.sp === SP_BOOT || novice.sp === SP_BOTTLE);
  assert.ok(RULE[master.sp]!.tier <= T_MYTH, 'на 10-м уровне хлама нет — клюёт рыба');
});

test('сундук: в каждом пятом — пиво подводного владыки, выпивается сразу (доход ×1,2, редкие ×1,4, 10 мин, заменяет эль); пиво и эль поверх не наливают', () => {
  assert.equal(LORD_CHEST_CHANCE, 0.2);
  assert.equal(LORD.ms, ALE.ms);
  const e = setup();
  const p = e.a.c.profile!;
  p.fishing = { ...p.fishing, aleUntil: e.clock.now + 300_000 };
  const hall = sit(e, { sp: sp('scad'), g: 300, coins: 0 });
  // шанс 20 %: rand 0,5 — не выпало
  catchOne(e, hall, { sp: sp('chest'), g: 5000, coins: 60 });
  assert.equal(lastOf(e.a.s, 'fishLand')!.lord, undefined);
  assert.equal(p.fishing.lordUntil, undefined);
  hall.lordChance = 1;
  const t0 = p.tokens;
  catchOne(e, hall, { sp: sp('chest'), g: 5000, coins: 60 });
  const land = lastOf(e.a.s, 'fishLand')!;
  assert.equal(land.lord, true);
  assert.equal(p.tokens, t0 + 60, 'жетоны сундука — как всегда');
  assert.ok(p.fishing.lordUntil! > e.clock.now && p.fishing.lordUntil! <= e.clock.now + LORD.ms);
  assert.equal(p.fishing.aleUntil, 0, 'эль заменён');
  assert.ok(allOf(e.a.s, 'chat').some((m) => /пиво подводного владыки/.test(JSON.stringify(m))), 'в чате — объявление');
  const mods = fishCastMods(p.fishing, e.clock.now);
  assert.equal(mods.drink, 3);
  assert.equal(mods.incomeScale, 1.2);
  assert.ok(Math.abs(mods.rareMultiplier - 1.4) < 1e-12);
  assert.equal(e.profiles.buyFishAle(p), 'lord');
  assert.equal(e.profiles.buyFishBeer(p), 'lord');
  // следующая рыба — с меткой и ×1,2
  catchOne(e, hall, { sp: sp('bluefish'), g: 2000, coins: 0 });
  const fish = lastOf(e.a.s, 'fishLand')!;
  assert.equal(fish.m! & BAG_LORD, BAG_LORD);
  assert.equal(fish.price, Math.round(basePrice(sp('bluefish'), 2000) * LORD.income));
  // кончилось — снова можно пиво и эль
  e.clock.now = p.fishing.lordUntil! + 1;
  assert.equal(activeDrink(p.fishing, e.clock.now), 0);
  assert.equal(e.profiles.buyFishAle(p), 'ok');
  assert.equal(p.fishing.lordUntil, undefined, 'истёкшее пиво владыки снято');
});

test('старые сохранения читаются: без пива владыки — его нет; новое поле и метка рыбы сохраняются и читаются', () => {
  const old = normalizeFishProgress({ xp: 500, questsDone: 1, questCaught: 2, rod: 1, beerUntil: 5, aleUntil: 0, bagTier: 1, lure: 0, bag: [{ n: 0, f: 'scad', g: 300, p: 9, m: BAG_BEER }], bagSeq: 1 });
  assert.equal('lordUntil' in old, false);
  assert.equal(old.bag.length, 1);
  assert.equal(activeDrink(old, 1), 1);
  const fresh = normalizeFishProgress({ ...old, lordUntil: 1_000, bag: [{ n: 0, f: 'scad', g: 300, p: 9, m: BAG_LORD | BAG_BARKAS }] });
  assert.equal(fresh.lordUntil, 1_000);
  assert.equal(fresh.bag[0].m, BAG_LORD | BAG_BARKAS);
  assert.equal(activeDrink(fresh, 999), 3);
  assert.equal(normalizeFishProgress({ ...old, bag: [{ n: 0, f: 'scad', g: 300, p: 9, m: 32 }] }).bag.length, 0, 'неизвестная метка — рыба отбрасывается');
});

// ------------------------------------------------------------ 04.10: сезон рыбалки и божественный кальмар

test('сезон рыбалки на сервере: поклёвка решается с сезоном (виды дождя, ×3), опыт — как в дождь; кальмар — строка «Божественный улов» на весь пирс', () => {
  const e = setup();
  e.clock.now = Date.UTC(2026, 9, 4, 15, 1); // 18:01 по Москве — идёт сезон
  advance(e, 2);
  assert.equal(e.hub.lobby.fishSeason!.on, true);
  const what: Hooked = { sp: sp('kalmar'), g: 1_234_000, coins: 0 };
  const hall = sit(e, what);
  const seen: Array<[boolean, boolean | undefined]> = [];
  hall.roll = (rain, _rand, _mods, season) => { seen.push([rain, season]); return { ...what }; };
  const xp0 = e.a.c.profile!.fishing.xp;
  const { play } = hookWith(e, hall, (style, seed) => { const p = playReel(style, seed, EXPERT); return p.caught ? p : null; });
  assert.ok(seen.some(([rain, season]) => rain && season === true), 'бросок сервера — с сезоном');
  playHonest(e, play);
  const land = lastOf(e.a.s, 'fishLand')!;
  assert.equal(land.sp, sp('kalmar'));
  const gained = e.a.c.profile!.fishing.xp - xp0;
  const mods = fishCastMods(e.a.c.profile!.fishing, e.clock.now);
  assert.ok([false, true].some((perfect) => gained === fishCatchXp(sp('kalmar'), perfect, mods, true)), `опыт как в дождь: ${gained}`);
  const line = allOf(e.a.s, 'chat').map((m) => m.text).find((t) => /Божественный улов/.test(t));
  assert.ok(line && /дальневосточного кальмара на 1\s234 кг/.test(line), `строка в чат: ${line}`);
});
