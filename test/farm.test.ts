// Ферма: правила роста и продажи (shared/farm.ts), числа v11 (shared/farmdata.ts), нормализация старых и битых
// профилей, участки и путь через хаб: калитка на площади → посадить редис → вырос → собрать → продать Грибу → жетоны.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bedStage, capPay, emptyFarm, farmLevel, farmLevelInfo, harvest, normalizeFarm, plant, sell, upgrade, water,
} from '../shared/farm.ts';
import { CROPS, DAILY_CAP, FARM_ITEM_IDS, UPGRADES, cropById, vanQ } from '../shared/farmdata.ts';
import { bedWorld, farmUse, FARM_PLOT_ORDER } from '../shared/farmmap.ts';
import { itemById } from '../shared/outfit.ts';
import { normalizeProfile } from '../server/store.ts';
import { lastOf, login, placeAt, steps } from './kit.ts';
import { setupHub } from './kit.ts';

const T0 = Date.UTC(2026, 9, 10, 9);
const free = (): boolean => true;

test('числа v11: кривая уровней, Фургон по формуле, улучшения на 3 760 🪙, вещи в каталоге', () => {
  assert.equal(farmLevel(0), 1);
  assert.equal(farmLevel(199), 1);
  assert.equal(farmLevel(200), 2);
  assert.equal(farmLevel(141_499), 12);
  assert.equal(farmLevel(141_500), 13);
  assert.deepEqual(farmLevelInfo(141_500 + 45_000), { level: 13, into: 5_000, need: 20_000, stars: 2 });
  assert.equal(CROPS.length, 19);
  for (const c of CROPS) assert.equal(vanQ(c), c.van, `${c.id}: ящик Фургона по формуле Q`);
  assert.equal(UPGRADES.reduce((s, u) => s + u.coins, 0), 3760);
  for (const id of FARM_ITEM_IDS) assert.equal(itemById(id)?.tier, 'trophy', id);
});

test('рост лениво: стадии по времени, полив −20 % оставшегося, первая посадка бесплатно', () => {
  const f = emptyFarm(T0);
  let paid = 0;
  const pay = (n: number): boolean => { paid += n; return true; };
  const r = plant(f, [0], 'radish', T0, pay);
  assert.ok(r.ok);
  assert.equal(paid, 0, 'первый редис — подарок');
  assert.equal(f.beds[0].ripeAt, T0 + 120_000);
  assert.equal(bedStage(f.beds[0], T0), 0);
  assert.equal(bedStage(f.beds[0], T0 + 50_000), 1);
  assert.equal(bedStage(f.beds[0], T0 + 90_000), 2);
  // полив: лейка пустая — нельзя; с зарядом — оставшиеся 100 с превращаются в 80 с, второй раз за цикл нельзя
  assert.deepEqual(water(f, [0], T0 + 20_000), { ok: false, why: 'water' });
  f.water = 300;
  assert.ok(water(f, [0], T0 + 20_000).ok);
  assert.equal(f.beds[0].ripeAt, T0 + 100_000);
  assert.equal(f.water, 200);
  assert.deepEqual(water(f, [0], T0 + 30_000), { ok: false, why: 'watered' });
  // закрытая культура и чужие грядки — отказ
  assert.deepEqual(plant(f, [0], 'lettuce', T0, pay), { ok: false, why: 'level' });
  assert.deepEqual(plant(f, [1], 'radish', T0, pay), { ok: false, why: 'bed' });
  // спелое собирается: опыт, продукт в сумку, грядка пустеет
  assert.deepEqual(harvest(f, [0], T0 + 99_000, () => 0.99), { ok: false, why: 'unripe' });
  const h = harvest(f, [0], T0 + 100_000, () => 0.99);
  assert.ok(h.ok);
  assert.deepEqual(h.r.items, [{ bed: 0, crop: 'radish', n: 1, res: null, xp: 5 }]);
  assert.equal(h.r.generalXp, 1);
  assert.equal(f.bag.radish, 1);
  assert.equal(f.beds[0].crop, null);
  assert.equal(f.counters.harvests, 1);
  // второй редис — уже за семя; компост ускоряет новые посадки
  assert.ok(plant(f, [0], 'radish', T0, pay).ok);
  assert.equal(paid, 1);
  const g = emptyFarm(T0);
  g.built.compost = true;
  g.xp = 200;
  assert.ok(plant(g, [0], 'wheat', T0, free).ok);
  assert.equal(g.beds[0].ripeAt - T0, Math.round(15 * 60_000 * 0.85));
});

test('сумка полна — спелое остаётся на грядке; ресурс по шансу; Грабли 1 — одна грядка', () => {
  const f = emptyFarm(T0);
  assert.ok(plant(f, [0], 'radish', T0, free).ok);
  f.bag.wheat = 20;
  assert.deepEqual(harvest(f, [0], T0 + 200_000, () => 0), { ok: false, why: 'bag' });
  assert.equal(bedStage(f.beds[0], T0 + 200_000), 3);
  f.bag.wheat = 5;
  const h = harvest(f, [0], T0 + 200_000, () => 0.1);
  assert.ok(h.ok);
  assert.equal(h.r.items[0].res, 'root');
  assert.equal(f.cellar.root, 1);
  f.beds.push(emptyFarm(T0).beds[0]);
  assert.deepEqual(plant(f, [0, 1], 'radish', T0, free), { ok: false, why: 'bed' });
});

test('продажа: дневной потолок 700 🪙, после него ×0,25, но не дешевле посадки; трюфели — всегда целиком', () => {
  const f = emptyFarm(T0);
  f.bag = { radish: 1000, wheat: 50, truffle: 2 };
  const r1 = sell(f, 'radish', 350, T0);
  assert.deepEqual(r1, { ok: true, coins: 700, n: 350 });
  assert.equal(f.sold.coins, DAILY_CAP);
  // редис: 2 🪙 × 0,25 = 0,5 — дешевле семени (1), поэтому платят 1 за штуку
  assert.deepEqual(sell(f, 'radish', 10, T0), { ok: true, coins: 10, n: 10 });
  // колос: 11 × 0,25 = 2,75 за штуку, дробь копится
  assert.deepEqual(sell(f, 'wheat', 10, T0), { ok: true, coins: 27, n: 10 });
  assert.equal(f.sold.frac, 0.5);
  assert.deepEqual(sell(f, 'wheat', 1, T0), { ok: true, coins: 3, n: 1 });
  assert.deepEqual(sell(f, 'truffle', 2, T0), { ok: true, coins: 60, n: 2 });
  // сделка через порог делится: до 700 — полностью, остаток ×0,25
  assert.equal(capPay(690, 110, 2 / 11), 10 + 100 * 0.25);
  // новые сутки по Москве — потолок с нуля
  assert.deepEqual(sell(f, 'radish', 5, T0 + 86_400_000), { ok: true, coins: 10, n: 5 });
  assert.deepEqual(sell(f, 'pumpkin', 1, T0), { ok: false, why: 'item' });
  assert.deepEqual(sell(f, 'radish', 0, T0), { ok: false, why: 'count' });
});

test('улучшения: по порядку, с уровня, за ресурсы и жетоны', () => {
  const f = emptyFarm(T0);
  assert.deepEqual(upgrade(f, 'bed2', T0, free), { ok: false, why: 'level' });
  f.xp = 200;
  assert.deepEqual(upgrade(f, 'bed2', T0, free), { ok: false, why: 'res' });
  f.cellar = { fiber: 5, root: 4 };
  assert.deepEqual(upgrade(f, 'bed3', T0, free), { ok: false, why: 'order' });
  assert.ok(upgrade(f, 'bed2', T0, free).ok);
  assert.equal(f.beds.length, 2);
  assert.deepEqual(f.cellar, {});
  f.cellar = { fiber: 20, root: 10 };
  assert.deepEqual(upgrade(f, 'bag2', T0, () => false), { ok: false, why: 'coins' });
  assert.equal(f.cellar.fiber, 20, 'не хватило жетонов — ресурсы на месте');
});

test('нормализация: битая ферма чинится, старый профиль без фермы остаётся без неё', () => {
  const f = normalizeFarm({
    xp: -5, beds: [{ crop: 'banana' }, { crop: 'radish', plantedAt: 1000, ripeAt: 9e15, helpers: [3, 3, 'x', 4] }],
    tools: { can: 9, rake: 0 }, water: -5, bag: { radish: 3, junk: 2, wheat: -1 }, cellar: { root: 'x', fiber: 2.7 },
    well: { sets: 99 }, buffs: [{ kind: 'gold', until: 5 }], tutorial: 42, sold: { coins: Infinity, frac: 7 },
  }, T0);
  assert.equal(f.xp, 0);
  assert.equal(f.beds[0].crop, null);
  assert.equal(f.beds[1].ripeAt, 1000 + 120_000);
  assert.deepEqual(f.beds[1].helpers, [3, 4]);
  assert.deepEqual(f.tools, { rake: 1, can: 3, shovel: 1, bag: 1 });
  assert.equal(f.water, 0);
  assert.deepEqual(f.bag, { radish: 3 });
  assert.deepEqual(f.cellar, { fiber: 2 });
  assert.equal(f.well.sets, 4);
  assert.deepEqual(f.buffs, []);
  assert.equal(f.tutorial, 6);
  assert.ok(f.sold.frac < 1);
  assert.deepEqual(normalizeFarm(null, T0).beds.length, 1);
  const old = normalizeProfile({ id: 7, nick: 'Tester7', tokens: 50, owned: [], outfit: { c: 1, c2: 2, p: 'none', e: 'normal', h: 'cap', a: 'none' } });
  assert.ok(old);
  assert.equal('farm' in old, false);
  const withFarm = normalizeProfile({ id: 8, nick: 'Tester8', farm: { xp: 300, beds: [] } });
  assert.equal(withFarm?.farm?.xp, 300);
  assert.equal(withFarm?.farm?.beds.length, 1);
  // старый наряд читается как раньше, вещи фермы — только купленные (выданные)
  const dressed = normalizeProfile({ id: 9, nick: 'Tester9', owned: ['u:workshirt'], outfit: { c: 1, c2: 2, p: 'none', e: 'normal', h: 'farmcap', a: 'none', u: 'workshirt', l: 'jeans' } });
  assert.equal(dressed?.outfit.h, 'none');
  assert.equal(dressed?.outfit.u, 'workshirt');
  assert.equal(dressed?.outfit.l, undefined);
});

test('без флага фермы нет: ни комнаты, ни калитки в приветствии площади', () => {
  const { hub } = setupHub();
  const a = login(hub, 'NoFarm1');
  assert.equal(hub.farm, null);
  assert.equal(lastOf(a.s, 'lobby')?.farm, undefined);
});

test('через хаб: калитка → редис → вырос → собрал → продал Грибу → жетоны → обратно на площадь', () => {
  const { hub, clock } = setupHub({ farm: true });
  const a = login(hub, 'Tester7');
  assert.deepEqual(lastOf(a.s, 'lobby')?.farm, { n: 0, max: 20 });
  steps(hub, 121);
  const gate = hub.lobby.map.interact.find((i) => i.kind === 'farm')!;
  placeAt(hub, a.c, gate.x, gate.z);
  hub.onJson(a.c, { t: 'use', id: gate.id });
  assert.equal(a.c.room?.kind, 'farm');
  const hello = lastOf(a.s, 'farm')!;
  assert.equal(hello.plot, FARM_PLOT_ORDER[0], 'первый фермер — на ближний участок');
  assert.equal(hello.plots.length, 20);
  assert.equal(hello.me.beds.length, 1);
  const fp = hub.farm!.playerOf(a.c)!;
  const bed = bedWorld(hello.plot, 0);
  Object.assign(fp.state, { x: bed.x, z: bed.z + 1 });
  const tokens0 = a.c.profile!.tokens;
  hub.onJson(a.c, { t: 'farm', a: 'plant', beds: [0], crop: 'radish' });
  let me = lastOf(a.s, 'farmMe')!.me;
  assert.equal(me.beds[0].crop, 'radish');
  assert.equal(me.tutorial, 1);
  assert.equal(lastOf(a.s, 'farmPlot')?.plot.beds[0].c, 'radish', 'участок виден всем');
  assert.equal(hub.farm!.stageOf(a.c, 0), 0);
  clock.now += 60_000;
  assert.equal(hub.farm!.stageOf(a.c, 0), 1);
  hub.onJson(a.c, { t: 'farm', a: 'harvest', beds: [0] });
  assert.equal(lastOf(a.s, 'farmEv')?.e[0].k, 'fail');
  clock.now += 61_000;
  steps(hub, 61);
  hub.onJson(a.c, { t: 'farm', a: 'harvest', beds: [0] });
  me = lastOf(a.s, 'farmMe')!.me;
  assert.equal(me.bag.radish, 1);
  assert.equal(me.xp, 25 + 5);
  // продать можно только у Гриба
  hub.onJson(a.c, { t: 'farm', a: 'sell', item: 'radish', n: 1 });
  assert.deepEqual(lastOf(a.s, 'farmEv')?.e[0], { k: 'fail', a: 'sell', why: 'far' });
  const grib = farmUse('grib')!;
  Object.assign(fp.state, { x: grib.x, z: grib.z });
  hub.onJson(a.c, { t: 'farm', a: 'sell', item: 'radish', n: 1 });
  assert.deepEqual(lastOf(a.s, 'farmEv')?.e[0], { k: 'sold', item: 'radish', n: 1, coins: 2 });
  assert.equal(a.c.profile!.tokens, tokens0 + 2);
  assert.equal(lastOf(a.s, 'tokens')?.n, tokens0 + 2);
  assert.equal(a.c.profile!.farm!.bag.radish, undefined);
  // клиенту не верим: чужая грядка, далеко, неизвестное действие
  hub.onJson(a.c, { t: 'farm', a: 'plant', beds: [0], crop: 'radish' });
  assert.deepEqual(lastOf(a.s, 'farmEv')?.e[0], { k: 'fail', a: 'plant', why: 'far' });
  // назад на площадь — у калитки
  steps(hub, 121);
  hub.onJson(a.c, { t: 'leave' });
  assert.equal(a.c.room?.kind, 'lobby');
  const p = hub.lobby.playerOf(a.c)!;
  assert.ok(Math.hypot(p.state.x - hub.lobby.map.farmSpawn.x, p.state.z - hub.lobby.map.farmSpawn.z) < 2);
  assert.equal(hub.store.state.farmPlots?.[hello.plot]?.pid, a.c.pid, 'участок ждёт хозяина и после перезапуска');
});

test('20 участков: 21-й остаётся на площади; ушедший держит место 5 минут, потом его участок отдают', () => {
  const { hub, clock } = setupHub({ farm: true });
  const people = Array.from({ length: 21 }, (_, i) => login(hub, `Farmer${i + 1}`, undefined, `10.0.${i}.1`));
  steps(hub, 121);
  for (const p of people.slice(0, 20)) hub.enterFarm(p.c);
  assert.equal(hub.farm!.humans, 20);
  const plots = new Set(people.slice(0, 20).map((p) => hub.farm!.playerOf(p.c)!.plot));
  assert.equal(plots.size, 20);
  const late = people[20];
  hub.enterFarm(late.c);
  assert.equal(late.c.room?.kind, 'lobby');
  assert.match(lastOf(late.s, 'toast')!.text, /Ферма полна: 20 из 20/);
  const gone = people[0];
  const gonePlot = hub.farm!.playerOf(gone.c)!.plot;
  steps(hub, 121);
  hub.onJson(gone.c, { t: 'leave' });
  hub.enterFarm(late.c);
  assert.equal(late.c.room?.kind, 'lobby', 'место ждёт хозяина 5 минут');
  clock.now += 5 * 60_000;
  steps(hub, 61);
  assert.equal(lastOf(people[1].s, 'farmPlot')?.plot.sleeping, true, 'участок уснул — соседи это видят');
  hub.enterFarm(late.c);
  assert.equal(late.c.room?.kind, 'farm');
  assert.equal(hub.farm!.playerOf(late.c)!.plot, gonePlot, 'спящий участок отдан, когда свободных нет');
  assert.equal(hub.health().farm, 20);
  assert.equal(hub.health().busy, 0, 'ферма выкладку не держит');
  assert.ok(cropById('radish'));
});
