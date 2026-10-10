// Остров «Последний свет» (флаг ISLE, пакет D): 20 видов острова (12 всегда + 8 в туман), их шансы и сложность, экономика
// (рыба пристани и баркаса ×0,4 под флагом, ×0,65 без него; цены острова не режутся), свой счётчик «Остров: N из 20», лайвел
// своей лодки (переполнение рюкзака, продажа, старые сохранения) и доход острова на модели игрока (test/fishbot.ts).
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import { FISH, FP_BITE, FP_HOLD, FP_IDLE } from '../shared/fishing.ts';
import {
  COLLECTION, COLLECTION_SIZE, FISH_PRICE_CUT, FISH_TARGET_PER_MIN_ISLE, ISLE_COLLECTION, ISLE_DRAIN, ISLE_FIGHT, ISLE_PRICE_CUT, ISLE_SIZE, ISLE_ZONE,
  RAIN_MUL, RULE, SEASON_MUL, SP_BOOT, SP_BOTTLE, SP_CHEST, T_DIVINE, basePrice, biteShare, collectionCount, fishPrice2, fishPriceCut, reelStyleFor,
  rollCatch2, tierOdds, tierOddsParts, tierRank, zoneSpecies, type Hooked,
} from '../shared/fishrules.ts';
import { reelStyle2 } from '../shared/fishability.ts';
import { BAG_FULL_HINT } from '../shared/fishrelease.ts';
import { FISH_XP_LEVELS, LIVEWELL_MAX, bagSlots, emptyFishProgress, fishCastMods, normalizeFishProgress, type BagFish } from '../shared/fishprogress.ts';
import { ISLE, ISLE_CENTER, ISLE_WATERS_R, castZone, fishZoneAtSea, setIsle } from '../shared/fishisle.ts';
import { isleEnabled } from '../shared/isle.ts';
import { catchFullHint, catchRoom, catchValue, livewellCap } from '../shared/fishlivewell.ts';
import { ISLE_SPECIES, ISLE_TOTAL, isleCaught } from '../shared/islestyle.ts';
import { ISLE_LADDER, isleEarned, isleNextStep } from '../shared/fishstyle.ts';
import { reelStart } from '../shared/fishreel.ts';
import { Hub } from '../server/hub.ts';
import { type FishingHall2 } from '../server/lobby/fishing2.ts';
import { boatCatch, sellCatch, sellFromBoat } from '../server/lobby/fishlivewell.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { isleCaseMods } from '../tools/fish/isle-income.ts';
import { EXPERT, TYPICAL, fishIncome, playReel, type Play } from './fishbot.ts';
import { SMOKE, allOf, lastOf, login, placeAt } from './kit.ts';

const dirs: string[] = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  setIsle(false);
});
const sp = (id: string): number => FISH.findIndex((f) => f.id === id);
const at = (zone: 'pier' | 'barkas' | 'isle', level = 0) => fishCastMods({ ...emptyFishProgress(), xp: FISH_XP_LEVELS[level] }, 0, zone);

test('пул острова: 20 видов (12 всегда + 8 только в туман), своя книга «Остров: N из 20»; коллекция 52 видов не растёт; кальмар и гренландская акула здесь не клюют', () => {
  assert.equal(COLLECTION_SIZE, 52);
  assert.equal(ISLE_SIZE, 20);
  assert.deepEqual([...zoneSpecies('isle')].sort((a, b) => a - b), [...ISLE_COLLECTION].sort((a, b) => a - b));
  for (const s of ISLE_COLLECTION) {
    assert.ok(!COLLECTION.includes(s), `${FISH[s].id} не в коллекции 52`);
    assert.deepEqual(RULE[s]!.zones, ['isle'], `${FISH[s].id}: только остров`);
  }
  assert.equal(ISLE_COLLECTION.filter((s) => RULE[s]!.rain).length, 8, '8 видов тумана');
  assert.equal(ISLE_COLLECTION.filter((s) => !RULE[s]!.rain).length, 12, '12 видов всегда');
  for (const id of ['kalmar', 'greenlandshark']) assert.ok(!zoneSpecies('isle').includes(sp(id)), `${id} у острова не клюёт`);
  // ни один вид пристани или баркаса не клюёт у острова и наоборот
  for (const s of COLLECTION) assert.equal(biteShare(s, true, at('isle', 10)), 0);
  for (const s of ISLE_COLLECTION) {
    assert.equal(biteShare(s, true, at('pier', 10)), 0);
    assert.equal(biteShare(s, true, at('barkas', 10)), 0);
  }
  // в ясную погоду виды тумана не клюют, в туман — клюют
  const fog = ISLE_COLLECTION.filter((s) => RULE[s]!.rain);
  for (const s of fog) {
    assert.equal(biteShare(s, false, at('isle', 6)), 0, `${FISH[s].id}: в ясную — нет`);
    assert.ok(biteShare(s, true, at('isle', 6)) > 0, `${FISH[s].id}: в туман — да`);
  }
  // плащеносная акула — божественная острова
  assert.equal(RULE[sp('frilledshark')]!.tier, T_DIVINE);
  // счётчик: виды острова считаются только в своём счётчике
  const album = Object.fromEntries(ISLE_COLLECTION.map((s) => [FISH[s].id, [1000, 1] as const]));
  assert.equal(collectionCount(album), 0, 'коллекция 52 от видов острова не растёт');
  assert.equal(isleCaught({ album }), 20);
  assert.equal(isleCaught({ album: { [FISH[sp('capelin')].id]: [20, 1], hamsa: [10, 1] } }), 1);
  // счётчик косметики острова (пакет E, shared/islestyle.ts) — те же 20 видов, что в таблицах
  assert.equal(ISLE_TOTAL, ISLE_SIZE);
  assert.deepEqual([...ISLE_SPECIES].sort(), ISLE_COLLECTION.map((s) => FISH[s].id).sort());
});

test('шансы острова: туман — как дождь (×1,5 редким и выше), сезон острова — ещё ×2; сундук и хлам — как везде; бросок даёт только виды острова', () => {
  const m = at('isle', 6);
  const clear = tierOdds(false, m);
  const fog = tierOdds(true, m);
  const pier = tierOdds(false, at('pier', 6));
  // сундук [6] и хлам [5] — как у пристани того же уровня
  assert.equal(clear[5], pier[5]);
  assert.equal(clear[6], pier[6]);
  assert.equal(fog[6], clear[6]);
  for (const t of [1, 2, 3, 4, T_DIVINE]) {
    const k = tierRank(t);
    const c = tierOddsParts(k, false, m).now;
    const f = tierOddsParts(k, true, m).now;
    const s = tierOddsParts(k, true, m, true).now;
    assert.ok(Math.abs(f / c - RAIN_MUL) < 1e-9, `категория ${t}: туман ×${(f / c).toFixed(3)}`);
    // сезон: ×3 к ясной; у редких — сколько останется под потолком (обычным пол 5 %), как на баркасе
    if (k >= 2) assert.ok(Math.abs(s / c - RAIN_MUL * SEASON_MUL) < 1e-9, `категория ${t}: сезон ×${(s / c).toFixed(3)}`);
    else assert.ok(s <= c * RAIN_MUL * SEASON_MUL + 1e-12, `редкие в сезон — не выше ×3`);
  }
  assert.ok(Math.abs(fog.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  // бросок у острова: только виды острова, сундук и хлам
  let x = 12345;
  const rand = (): number => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const ok = new Set([...ISLE_COLLECTION, SP_CHEST, SP_BOOT, SP_BOTTLE]);
  const seen = new Set<number>();
  for (let i = 0; i < 40_000; i++) {
    const h = rollCatch2(true, rand, at('isle', 10));
    assert.ok(ok.has(h.sp), `у острова клюнул ${FISH[h.sp].id}`);
    seen.add(h.sp);
  }
  assert.ok(ISLE_COLLECTION.filter((s) => RULE[s]!.tier !== T_DIVINE).every((s) => seen.has(s)), 'в туман за 40 000 бросков клюют все виды острова');
});

test('сложность острова: зона ×0,95, рывки ×1,3, сопротивление ×1,4 (старые и новые правила шкалы); божественную остров не злит', () => {
  assert.deepEqual([ISLE_ZONE, ISLE_FIGHT, ISLE_DRAIN], [0.95, 1.3, 1.4]);
  const m = at('isle', 10);
  assert.equal(m.zone, 'isle');
  assert.equal(m.sea, ISLE_FIGHT);
  assert.equal(m.seaDrain, ISLE_DRAIN);
  const calm = { ...m, zone: 'pier' as const, sea: 1, seaDrain: 1 };
  for (const style of [reelStyleFor, (s: number, mods: typeof m) => reelStyle2(s, mods, { noAbility: true })]) {
    const isle = style(sp('salmon'), m);
    const plain = style(sp('salmon'), calm);
    assert.ok(Math.abs(isle.zone / plain.zone - 0.95) < 1e-9, `зона ×${isle.zone / plain.zone}`);
    assert.ok(Math.abs(isle.dartSpd / plain.dartSpd - 1.3) < 1e-9, `рывки ×${isle.dartSpd / plain.dartSpd}`);
    assert.ok(Math.abs(isle.drain / plain.drain - 1.4) < 1e-9, `сопротивление ×${isle.drain / plain.drain}`);
  }
  const god = reelStyleFor(sp('frilledshark'), m);
  assert.equal(god.zone, reelStyleFor(sp('frilledshark'), calm).zone);
  // таблица шкалы островных видов — рабочая (шкала стартует)
  for (const s of ISLE_COLLECTION) assert.ok(reelStart(reelStyle2(s, m), 1), FISH[s].id);
});

test('экономика: под флагом ISLE рыба пристани и баркаса ×0,4, без флага — ×0,65; цены острова не режутся; сундук и хлам как были', () => {
  setIsle(false);
  assert.equal(ISLE.on, false);
  assert.equal(fishPriceCut(), FISH_PRICE_CUT);
  const tuna = sp('tuna');
  const full = basePrice(tuna, 60_000, 1);
  assert.equal(fishPrice2(tuna, 60_000), Math.max(1, Math.round(full * FISH_PRICE_CUT)));
  setIsle(true);
  assert.equal(ISLE.on, true);
  assert.equal(fishPriceCut(), ISLE_PRICE_CUT);
  assert.equal(ISLE_PRICE_CUT, 0.4);
  for (const s of COLLECTION) {
    const g = FISH[s].g[1];
    assert.equal(basePrice(s, g), Math.max(1, Math.round(basePrice(s, g, 1) * 0.4)), FISH[s].id);
  }
  // остров: цена из своей таблицы, без урезания
  for (const s of ISLE_COLLECTION) for (const g of FISH[s].g) assert.equal(basePrice(s, g), basePrice(s, g, 1), FISH[s].id);
  const [lo, hi] = RULE[sp('capelin')]!.val;
  assert.equal(basePrice(sp('capelin'), FISH[sp('capelin')].g[0]), lo);
  assert.equal(basePrice(sp('capelin'), FISH[sp('capelin')].g[1]), hi);
  assert.equal(fishPrice2(SP_CHEST, 5000, 137), 137);
  assert.equal(fishPrice2(SP_BOOT, 900), 0);
  setIsle(false);
  assert.equal(fishPriceCut(), FISH_PRICE_CUT, 'флаг выключен — снова ×0,65');
});

test('воды острова: fishZoneAtSea — 300 м от центра; castZone — пул по месту заброса, без флага остров не клюёт; флаг ISLE — только с FISH2', () => {
  assert.equal(ISLE_WATERS_R, 300);
  assert.equal(fishZoneAtSea(ISLE_CENTER.x, ISLE_CENTER.z), 'isle');
  assert.equal(fishZoneAtSea(ISLE_CENTER.x + 299, ISLE_CENTER.z), 'isle');
  assert.equal(fishZoneAtSea(ISLE_CENTER.x + 301, ISLE_CENTER.z), 'barkas');
  assert.equal(fishZoneAtSea(0, 0), 'barkas');
  assert.equal(fishZoneAtSea(NaN, 0), 'barkas');
  assert.equal(castZone('barkas', ISLE_CENTER.x, ISLE_CENTER.z, true), 'isle');
  assert.equal(castZone('barkas', 0, 0, true), 'barkas');
  assert.equal(castZone('pier', ISLE_CENTER.x, ISLE_CENTER.z, true), 'pier');
  assert.equal(castZone('isle', 0, 0, true), 'isle');
  assert.equal(castZone('barkas', ISLE_CENTER.x, ISLE_CENTER.z, false), 'barkas', 'без флага — баркас');
  assert.equal(castZone('isle', ISLE_CENTER.x, ISLE_CENTER.z, false), 'barkas');
  assert.equal(isleEnabled(undefined, true, true), true);
  assert.equal(isleEnabled(undefined, false, true), false);
  assert.equal(isleEnabled('1', false, true), true);
  assert.equal(isleEnabled('1', true, false), false, 'без FISH2 острова нет');
  assert.equal(isleEnabled('0', true, true), false);
});

test('лестница острова: каждые 4 вида — награда, за все 20 — сет «Смотритель маяка»', () => {
  assert.deepEqual(ISLE_LADDER.map((s) => s.need), [4, 8, 12, 16, 20]);
  assert.equal(isleNextStep(0)!.need, 4);
  assert.equal(isleNextStep(19)!.set, 'Смотритель маяка');
  assert.equal(isleNextStep(20), null);
  assert.deepEqual(isleEarned(3), []);
  assert.deepEqual(isleEarned(8), ['b:bellbuoy', 'r:lighthouse']);
  assert.equal(isleEarned(20).length, 7);
});

// ------------------------------------------------------------ лайвел

function profiles() {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-isle-'));
  dirs.push(dir);
  const store = new Store(dir, { now: () => 1e12, log: () => {}, saveDelayMs: 60_000 });
  store.load();
  const pr = new Profiles(store, { now: () => 1e12 });
  const r = pr.login({ key: 'isletest' + 'x'.repeat(20), nick: 'Tester7' }, '10.0.0.1');
  assert.ok(r.ok);
  return { pr, p: r.profile, store };
}
const fish = (id = 'capelin', p = 10): Omit<BagFish, 'n'> => ({ f: id, g: 30, p, m: 0 });

test('лайвел: рюкзак полон — рыба в лайвел лучшей лодки (25/50/75); нет лодки — некуда, заброс не уходит с понятной причиной', () => {
  setIsle(true);
  const { pr, p } = profiles();
  const f = p.fishing;
  const slots = bagSlots(f);
  for (let i = 0; i < slots; i++) assert.ok(pr.bagPut(p, fish()));
  assert.equal(catchRoom(f), null);
  assert.equal(pr.bagPut(p, fish()), null, 'лодки нет — некуда');
  assert.equal(catchFullHint(f, true), 'Рюкзак полон, а лодки с лайвелом нет — продай улов скупщику или отпусти рыбу из рюкзака (I)');
  assert.equal(catchFullHint(f, false), BAG_FULL_HINT);
  // лодки: место — по лучшей
  f.boats = ['volzhanka'];
  assert.equal(livewellCap(f), 25);
  f.boats = ['volzhanka', 'northsilver', 'albakor'];
  assert.equal(livewellCap(f), 75);
  assert.equal(LIVEWELL_MAX, 75);
  f.boats = ['albakor'];
  assert.equal(livewellCap(f), 50);
  assert.equal(catchRoom(f), 'well');
  assert.equal(catchFullHint(f, true), null);
  const put = pr.bagPut(p, fish('salmon', 120))!;
  assert.equal(put.well, true);
  assert.equal(f.bag.length, slots);
  assert.equal(f.livewell!.length, 1);
  for (let i = 1; i < 50; i++) assert.ok(pr.bagPut(p, fish())?.well);
  assert.equal(f.livewell!.length, 50);
  assert.equal(pr.bagPut(p, fish()), null, 'лайвел полон');
  assert.equal(catchFullHint(f, true), 'Рюкзак и лайвел лодки полны — продай улов скупщику или из меню лодки');
  // номера улова — общие: продать или отпустить можно любую рыбу по номеру
  const ns = [...f.bag, ...f.livewell!].map((x) => x.n);
  assert.equal(new Set(ns).size, ns.length);
  assert.ok(pr.releaseFish(p, put.n), 'отпустить рыбу из лайвела');
  assert.equal(f.livewell!.length, 49);
  assert.equal(catchRoom(f), 'well');
});

test('продажа: рюкзак, лайвел или всё — у любого скупщика и «Продать улов» из меню лодки; жетоны по цене поимки', () => {
  setIsle(true);
  const { pr, p } = profiles();
  const f = p.fishing;
  f.boats = ['volzhanka'];
  const slots = bagSlots(f);
  for (let i = 0; i < slots; i++) pr.bagPut(p, fish('capelin', 7));
  for (let i = 0; i < 5; i++) pr.bagPut(p, fish('salmon', 100));
  assert.equal(f.livewell!.length, 5);
  assert.equal(catchValue(f, 'bag'), 7 * slots);
  assert.equal(catchValue(f, 'well'), 500);
  assert.deepEqual(boatCatch(p), { n: slots + 5, coins: 7 * slots + 500 });
  const t0 = p.tokens;
  const well = sellCatch(pr, p, 'well');
  assert.deepEqual([well.n, well.coins], [5, 500]);
  assert.equal(well.message, 'Продано рыб: 5, +500 🪙');
  assert.equal(f.livewell, undefined, 'пустой лайвел не хранится');
  assert.equal(f.bag.length, slots, 'рюкзак не тронут');
  assert.equal(sellCatch(pr, p, 'well').message, 'Лайвел пуст');
  pr.bagPut(p, fish('salmon', 100));
  pr.bagPut(p, fish('salmon', 100));
  const bag = pr.sellFish(p, undefined, 'bag');
  assert.deepEqual(bag, { n: slots, coins: 7 * slots });
  assert.equal(f.livewell!.length, 2, 'лайвел не тронут');
  pr.bagPut(p, fish('capelin', 7));
  const all = sellFromBoat(pr, p);
  assert.deepEqual([all.n, all.coins], [3, 207]);
  assert.equal(p.tokens - t0, 500 + 7 * slots + 207);
  assert.deepEqual(boatCatch(p), { n: 0, coins: 0 });
  assert.equal(sellFromBoat(pr, p).message, 'Продавать нечего: рюкзак и лайвел пусты');
});

test('старые сохранения: без лайвела и лодок грузятся как были; лайвел и лодки нормализуются (мусор, повторы номеров, предел 75)', () => {
  const old = { ...emptyFishProgress(), bag: [{ n: 3, f: 'scad', g: 300, p: 40, m: 0 }], bagSeq: 4 };
  const a = normalizeFishProgress(JSON.parse(JSON.stringify(old)));
  assert.equal('livewell' in a, false);
  assert.equal('boats' in a, false);
  assert.deepEqual(a.bag, old.bag);
  const raw = {
    ...old,
    bagSeq: 1,
    boats: ['albakor', 'albakor', 42, 'x'.repeat(40)],
    livewell: [
      { n: 3, f: 'salmon', g: 2000, p: 90, m: 0 }, // номер уже в рюкзаке — лишняя
      { n: 9, f: 'salmon', g: 2000, p: 90, m: 0 },
      { n: 10, f: 'nope', g: 1, p: 1, m: 0 }, // неизвестный вид
      null,
      ...Array.from({ length: 100 }, (_, i) => ({ n: 100 + i, f: 'capelin', g: 30, p: 7, m: 0 })),
    ],
  };
  const b = normalizeFishProgress(raw);
  assert.deepEqual(b.boats, ['albakor']);
  assert.ok(b.livewell!.length <= LIVEWELL_MAX);
  assert.ok(!b.livewell!.some((x) => x.n === 3), 'номер рюкзака не повторяется');
  assert.ok(b.livewell!.some((x) => x.n === 9));
  assert.ok(!b.livewell!.some((x) => x.f === 'nope'));
  const maxN = Math.max(...b.bag.map((x) => x.n), ...b.livewell!.map((x) => x.n));
  assert.ok(b.bagSeq > maxN, 'новые номера не совпадут со старыми');
  // повторная нормализация ничего не меняет
  assert.deepEqual(normalizeFishProgress(JSON.parse(JSON.stringify(b))), b);
});

// ------------------------------------------------------------ сервер: улов вида острова уходит в лайвел

function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-isle-hub-'));
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 10, 12) };
  const store = new Store(dir, { now: () => clock.now, log: () => {}, saveDelayMs: 60_000 });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({ store, profiles, now: () => clock.now, log: () => {}, build: 'test', smokeToken: SMOKE, fish2: true, isle: true, weather: 'clear' });
  const a = login(hub, 'Tester7');
  const it = hub.lobby.map.interact.find((i) => i.kind === 'fish' && i.arg === 0)!;
  placeAt(hub, a.c, it.x, it.z);
  hub.onJson(a.c, { t: 'use', id: it.id });
  const hall = hub.lobby.fishing2 as FishingHall2;
  hall.rand = () => .5;
  return { hub, clock, a, hall, profiles, p: a.c.profile! };
}
type Env = ReturnType<typeof setup>;

function advance(e: Env, n: number): void {
  for (let i = 0; i < n; i++) { e.clock.now += 1000 / TICK_RATE; e.hub.step(); }
}

function catchOne(e: Env, what: Hooked): void {
  e.hall.roll = () => ({ ...what });
  e.clock.now += 1100;
  if (e.hall.phase(0) === FP_HOLD) e.hub.onJson(e.a.c, { t: 'fish', a: 'keep' });
  e.hub.onJson(e.a.c, { t: 'fish', a: 'cast' });
  for (let i = 0; i < 30 * TICK_RATE && e.hall.phase(0) !== FP_BITE; i++) advance(e, 1);
  advance(e, 2);
  assert.equal(e.hall.phase(0), FP_BITE, 'поклёвка');
  const n = allOf(e.a.s, 'lev').flatMap((m) => m.e).filter((x) => x[0] === 'fish').at(-1)![3] as number;
  const style = reelStyle2(what.sp, e.hall.views()[0].mods!);
  let play: Play | null = null;
  let seed = 0;
  for (let c = 1; c <= 400 && !play; c++) { const p = playReel(style, c, EXPERT); if (p.caught) { play = p; seed = c; } }
  assert.ok(play);
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

test('сервер (ISLE): вид острова — в свой счётчик, полный рюкзак — в лайвел своей лодки; лайвел полон — заброс не уходит, причина тостом', () => {
  const e = setup();
  assert.equal(ISLE.on, true, 'Hub включил флаг острова');
  assert.equal(fishPriceCut(), ISLE_PRICE_CUT);
  const f = e.p.fishing;
  f.boats = ['volzhanka'];
  f.bag = Array.from({ length: bagSlots(f) }, (_, i) => ({ n: 1000 + i, f: 'scad', g: 300, p: 5, m: 0 }));
  f.bagSeq = 2000;
  catchOne(e, { sp: sp('salmon'), g: 4000, coins: 0 });
  const land = lastOf(e.a.s, 'fishLand')!;
  assert.equal(land.well, 1, 'рыба — в лайвел');
  assert.equal(land.wcap, 25);
  assert.equal(land.isle, 1, '«Остров: 1 из 20»');
  assert.equal(land.got, 0, 'коллекция 52 не растёт');
  assert.equal(land.price, basePrice(sp('salmon'), 4000), 'цена острова — без урезания');
  assert.equal(f.livewell!.length, 1);
  assert.equal(f.livewell![0].f, 'salmon');
  // лайвел полон — заброс не уходит
  e.hub.onJson(e.a.c, { t: 'fish', a: 'keep' });
  f.livewell = Array.from({ length: 25 }, (_, i) => ({ n: 3000 + i, f: 'capelin', g: 30, p: 7, m: 0 }));
  e.clock.now += 1100;
  advance(e, 2);
  const casts = e.p.stats.fsCasts;
  e.hub.onJson(e.a.c, { t: 'fish', a: 'cast' });
  advance(e, 2);
  assert.equal(e.p.stats.fsCasts, casts, 'заброс не ушёл');
  assert.equal(e.hall.phase(0), FP_IDLE);
  assert.equal(lastOf(e.a.s, 'toast')?.text, 'Рюкзак и лайвел лодки полны — продай улов скупщику или из меню лодки');
});

test('доход острова: 10-й уровень на «Нортсильвере» в ясную погоду без напитков — 6 000–7 000 🪙/ч; новичок у пристани под флагом — ~7,3 🪙/мин рыбой', (t) => {
  setIsle(true);
  const inc = fishIncome(TYPICAL, false, 200, isleCaseMods(10, 'isle', 0.15), reelStyle2);
  const hour = (inc.coins + inc.chest) * 60;
  t.diagnostic(`остров, ур. 10, «Нортсильвер»: ${Math.round(hour)} 🪙/ч, опыт ${inc.xp.toFixed(1)}/мин`);
  assert.ok(hour >= 6000 && hour <= 7000, `${Math.round(hour)} 🪙/ч`);
  const pier = fishIncome(TYPICAL, false, 300);
  t.diagnostic(`пристань, новичок, ×0,4: ${pier.coins.toFixed(3)} 🪙/мин рыбой + ${pier.chest.toFixed(3)} сундуками`);
  assert.ok(Math.abs(pier.coins / FISH_TARGET_PER_MIN_ISLE - 1) < 0.05, `${pier.coins.toFixed(3)} против ${FISH_TARGET_PER_MIN_ISLE}`);
  setIsle(false);
});
