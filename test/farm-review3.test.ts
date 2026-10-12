import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addFarmXp, emptyBed, emptyFarm, growMs, harvest, normalizeFarm, pickBeds, plant, repBonus, saleUnit, sell, water } from '../shared/farm.ts';
import { CROPS, FARM_LEVEL_REWARDS, FARM_XP_TOTAL, REP_LEVELS, UPGRADES, cropById } from '../shared/farmdata.ts';
import { farmIncome } from '../shared/farmeconomy.ts';
import { farmUse } from '../shared/farmmap.ts';
import type { FarmEvent, FarmServerMsg } from '../shared/farmnet.ts';
import { vanOffers, vanSlotCount, vanTime } from '../shared/farmvan.ts';
import { FarmPlots } from '../server/farm/plots.ts';
import { grantLevel } from '../server/farm/rewards.ts';
import type { FarmCtx, FarmPlayer } from '../server/farm/room.ts';
import { vanDeliver, vanView } from '../server/farm/van.ts';
import { normalizeProfile } from '../server/store.ts';

const NOW = Date.UTC(2026, 9, 12, 11, 30); // 14:30 МСК, Фургон открыт

function kit(level = 3) {
  const f = emptyFarm(NOW); f.xp = FARM_XP_TOTAL[level - 1];
  const sent: FarmServerMsg[] = [], events: FarmEvent[] = [], items: string[] = [];
  let coins = 0;
  const ctx: FarmCtx = {
    now: () => NOW, rng: () => .5, plots: new FarmPlots(undefined),
    farm: () => f, farmOfPid: () => f, players: () => [], byPid: () => undefined,
    sendMe: () => {}, send: (_p, m) => sent.push(m), plotChanged: () => {}, ev: (_p, e) => events.push(e),
    fail: (_p, a, why) => events.push({ k: 'fail', a, why }),
    xp: (p, n) => { for (const level of addFarmXp(f, n)) grantLevel(ctx, p, level); },
    credit: (_p, n) => { coins += n; }, spend: () => true, grantItem: (_p, id) => { items.push(id); return true; }, dirty: () => {},
  };
  const p = { c: { pid: 9, profile: { id: 9, nick: 'Farmer9' } }, state: { ...farmUse('van') }, plot: 0 } as unknown as FarmPlayer;
  return { f, ctx, p, sent, events, items, coins: () => coins };
}

test('review3: будущие уровни не выдают перчатки, сапоги, титул и светлячков', () => {
  const removed = ['a:greengloves', 'l:boots', 'ti:legend', 'f:fireflies'];
  assert.ok(FARM_LEVEL_REWARDS.flat().every((id) => !removed.includes(id)));
  const k = kit(1);
  for (let level = 1; level <= 13; level++) grantLevel(k.ctx, k.p, level);
  assert.ok(k.items.every((id) => !removed.includes(id)));
  assert.ok(!k.f.decor.includes('ti:legend'));
  assert.ok(k.items.includes('h:leafcrown'));
});

test('review3: нормализация сохраняет уже заработанные вещи, монеты, XP и грабли3', () => {
  const f = emptyFarm(NOW); f.xp = FARM_XP_TOTAL[12] + 43000; f.tools.rake = 3;
  f.decor = ['ti:legend']; f.look.title = 'ti:legend'; f.bag = { 'mythic-mushroom': 11 }; f.rep = 3000;
  const owned = ['a:greengloves', 'l:boots', 'f:fireflies'];
  const p = normalizeProfile({ id: 91, nick: 'Farmer91', tokens: 741, owned, farm: f })!;
  assert.deepEqual(p.owned, owned); assert.equal(p.tokens, 741);
  assert.deepEqual(p.farm, normalizeFarm(f, NOW));
  assert.equal(p.farm!.xp, f.xp); assert.equal(p.farm!.tools.rake, 3);
  assert.deepEqual(p.farm!.decor, f.decor); assert.deepEqual(p.farm!.look, f.look);
  assert.deepEqual(normalizeFarm(p.farm, NOW), p.farm);
});

test('review3: грабли2 дают +10п.п., грабли3 +15п.п.; пчёлы добавляют ещё10п.п.', () => {
  for (const [rake, bees, threshold] of [[1, false, .3], [2, false, .4], [3, false, .45], [3, true, .55]] as const) {
    for (const [roll, expected] of [[threshold - .00001, 'root'], [threshold + .00001, null]] as const) {
      const f = emptyFarm(NOW); f.tools.rake = rake; f.built.bees = bees;
      f.beds[0] = { ...emptyBed(), crop: 'radish', plantedAt: NOW - 120000, ripeAt: NOW };
      let n = 0;
      const h = harvest(f, [0], NOW, () => ++n === 1 ? .99 : roll);
      assert.ok(h.ok);
      assert.equal(h.r.items[0].res, expected, `грабли${rake}, пчёлы${bees}, roll${roll}`);
    }
  }
});

test('review3: все грабли работают по одной грядке, поддельный массовый запрос отклонён', () => {
  const f = emptyFarm(NOW);
  for (const rake of [1, 2, 3]) {
    f.tools.rake = rake;
    assert.deepEqual(pickBeds(f, [1]), [1]);
    assert.equal(pickBeds(f, [0, 1]), null);
  }
});

test('review3: Фургон3–4 просит3–5, затем растёт постепенно и только12+ до10', () => {
  const ranges = [[3, 3, 5], [4, 3, 5], [5, 4, 6], [7, 4, 6], [8, 5, 7], [9, 5, 7], [10, 6, 8], [11, 6, 8], [12, 7, 10], [13, 7, 10]];
  for (const [level, min, max] of ranges) {
    const k = kit(level); k.f.beds = Array.from({ length: 10 }, emptyBed); k.f.rep = 3000; k.f.tools.bag = 4;
    const quantities = new Set<number>();
    for (let cycle = 1; cycle <= 80; cycle++) for (const o of vanOffers(k.f, 9, cycle, NOW)) {
      if (o.kind === 'gourmet') { assert.ok(o.n === 1 || o.n === 2); continue; }
      assert.ok(o.n >= min && o.n <= max, `ур${level}, ${o.n} вне${min}–${max}`);
      quantities.add(o.n);
    }
    assert.ok(quantities.has(min) && quantities.has(max), `ур${level}: обе границы достижимы`);
  }
});

test('review3: реальный сервер пересчитывает Фургон при уровне, проверяет текущий ящик и повтор', () => {
  const k = kit(4); k.f.xp = FARM_XP_TOTAL[4] - 1;
  k.ctx.xp(k.p, 1, 'уровень');
  const view = k.sent.findLast((m) => m.t === 'farmVan'); assert.ok(view?.t === 'farmVan');
  assert.equal(view.v.slots.filter((s) => s.offer).length, 2);
  assert.deepEqual(view.v, vanView(k.ctx, k.p, NOW));
  const o = view.v.slots[0].offer!; assert.ok(o.n >= 4 && o.n <= 6);
  k.f.bag[o.item] = o.n - 1;
  assert.equal(vanDeliver(k.ctx, k.p, { t: 'farm', a: 'van', slot: o.slot }, NOW), null);
  assert.equal(k.coins(), 0);
  k.f.bag[o.item]++;
  const trade = vanDeliver(k.ctx, k.p, { t: 'farm', a: 'van', slot: o.slot }, NOW); assert.ok(trade);
  assert.equal(trade.o.n, o.n); assert.equal(k.coins(), trade.coins); assert.equal(k.f.bag[o.item], undefined);
  assert.equal(vanDeliver(k.ctx, k.p, { t: 'farm', a: 'van', slot: o.slot }, NOW), null);
  assert.deepEqual(k.f.van, { cycle: vanTime(NOW).cycle, done: [o.slot] });
});

test('review3: ступени репутации дают точный несуммируемый бонус цены и накопительные ящики', () => {
  for (const r of REP_LEVELS) {
    assert.equal(repBonus(r.need), r.bonus);
    const slots = REP_LEVELS.filter((x) => x.vanSlot && x.level <= r.level).length;
    assert.equal(vanSlotCount(13, r.need), 3 + slots);
    assert.equal(vanSlotCount(2, r.need), 0, 'ранняя репутация не открывает Фургон до3');
  }
});

test('review3: развитые10грядок дают300–400чистыми/час; ранние культуры не обгоняют поздние', () => {
  const f = emptyFarm(NOW); f.xp = FARM_XP_TOTAL[12]; f.tools.shovel = 3; f.built.compost = true;
  f.beds = Array.from({ length: 10 }, emptyBed);
  const rate = (c: typeof CROPS[number]) => (saleUnit(f, c, NOW) * 1.25 - c.seed) * f.beds.length * 3600000 / (growMs(f, c, NOW) * .8);
  for (const r of REP_LEVELS) {
    f.rep = r.need;
    const late = CROPS.filter(c => c.level >= 10).map(rate);
    assert.ok(late.every(x => x >= 300 && x <= 400), `репутация${r.level}: поздние ${late.join(', ')}`);
    assert.ok(Math.max(...CROPS.filter(c => c.level < 10).map(rate)) < Math.min(...late));
    assert.ok(late.every((x, i) => i === 0 || x > late[i - 1]));
  }
});

test('review3: базовый доход всей фермы не убывает с открытием культур и грядок', () => {
  let previous = 0;
  for (let level = 1; level <= 13; level++) {
    const beds = Math.max(3, ...UPGRADES.filter(u => u.kind === 'bed' && u.level <= level).map(u => u.step));
    const current = Math.max(...CROPS.filter(c => c.level <= level).map(c => (c.sale - c.seed) * beds * 60 / c.min));
    assert.ok(current >= previous, `уровень${level}: ${previous}→${current}`);
    previous = current;
  }
  const late = CROPS.filter(c => c.level >= 10).map(c => (c.sale - c.seed) * 10 * 60 / c.min);
  assert.ok(late.every((x, i) => !i || x > late[i - 1]));
});

test('review3: общий расчёт UI совпадает с реальными10циклами посадки, полива, сбора и продажи', () => {
  const f = emptyFarm(NOW); f.xp = FARM_XP_TOTAL[12]; f.rep = 3000;
  f.tools.shovel = 3; f.tools.bag = 4; f.tools.rake = 3; f.built.compost = true; f.built.bees = true;
  f.beds = Array.from({ length: 10 }, emptyBed);
  const c = cropById('mythic-mushroom')!; f.firstPlanted = [c.id];
  const quote = farmIncome(f, c, NOW, true);
  let now = NOW, cost = 0, products = 0, resources = 0;
  for (let cycle = 0; cycle < 10; cycle++) {
    for (let bed = 0; bed < 10; bed++) {
      assert.ok(plant(f, [bed], c.id, now, n => { cost += n; return true; }).ok);
      f.water = 100; assert.ok(water(f, [bed], now).ok);
    }
    const next = f.beds[0].ripeAt;
    assert.equal(next - now, quote.cycleMs);
    now = next;
    for (let bed = 0; bed < 10; bed++) {
      const i = cycle * 10 + bed; let roll = 0;
      const result = harvest(f, [bed], now, () => ++roll === 1 ? i % 4 === 0 ? 0 : .99 : (i + .5) / 100);
      assert.ok(result.ok); products += result.r.items[0].n; resources += result.r.items[0].res ? 1 : 0;
    }
  }
  const sold = sell(f, c.id, products, now); assert.ok(sold.ok);
  const hours = (now - NOW) / 3600000;
  assert.equal(products, 125); assert.equal(resources, 65); assert.equal(cost, 600);
  assert.ok(Math.abs((sold.coins + f.sold.frac - cost) / hours - quote.net) < 1e-8);
  assert.ok(Math.abs(resources / hours - quote.resources) < 1e-8);
  assert.equal(quote.resourceXp, quote.resources * 8);
});
