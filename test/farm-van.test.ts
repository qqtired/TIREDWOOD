// Ферма, часть B1: Фургон (design-v11 §10.2) — часы по Москве, слоты, зерно игрок × цикл, ящик целиком из сумки.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addFarmXp, emptyFarm, type FarmProgress } from '../shared/farm.ts';
import { cropById, vanQ } from '../shared/farmdata.ts';
import { farmUse } from '../shared/farmmap.ts';
import type { FarmEvent } from '../shared/farmnet.ts';
import { vanOffers, vanSlotCount, vanTime } from '../shared/farmvan.ts';
import { makeRng } from '../shared/math.ts';
import { FarmPlots } from '../server/farm/plots.ts';
import { grantLevel } from '../server/farm/rewards.ts';
import type { FarmCtx, FarmPlayer } from '../server/farm/room.ts';
import { FarmSystems } from '../server/farm/systems.ts';

/** 10.10.2026 14:30 МСК — Фургон открыт до 15:00 */
const T0 = Date.UTC(2026, 9, 10, 11, 30);

test('Фургон: открыт в чётные часы МСК, слоты по уровню и репутации, предложения из зерна', () => {
  assert.deepEqual(vanTime(T0), { cycle: vanTime(T0).cycle, open: true, next: Date.UTC(2026, 9, 10, 12) });
  assert.equal(vanTime(T0 + 40 * 60_000).open, false);
  assert.equal(vanTime(T0 + 40 * 60_000).next, Date.UTC(2026, 9, 10, 13));
  assert.equal(vanSlotCount(2, 3000), 0);
  assert.equal(vanSlotCount(3, 0), 1);
  assert.equal(vanSlotCount(5, 50), 3);
  assert.equal(vanSlotCount(13, 3000), 6);
  const f = emptyFarm(T0);
  f.xp = 700; // ур. 3
  const { cycle } = vanTime(T0);
  const a = vanOffers(f, 7, cycle, T0);
  assert.deepEqual(a, vanOffers(f, 7, cycle, T0), 'одно зерно — одни предложения');
  assert.equal(a.length, 1);
  const c = cropById(a[0].item)!;
  assert.ok(c.min <= 30 && c.level <= 3, 'слот 1 «Ходовой» — открытая культура до 30 мин');
  assert.ok(a[0].n >= 1 && a[0].n <= 16 && a[0].n <= vanQ(c), 'ящик ≤ 80 % сумки');
  assert.equal(a[0].coins, Math.round(a[0].n * c.sale * a[0].mult));
  assert.ok([1.3, 1.4, 1.5].includes(a[0].mult));
  f.xp = 48_500; // ур. 10
  f.rep = 1200; // репутация 6: +3 слота
  f.tools.bag = 4;
  f.beds = Array.from({ length: 6 }, () => ({ crop: null, plantedAt: 0, ripeAt: 0, watered: false, helpers: [] }));
  const b = vanOffers(f, 7, cycle, T0);
  assert.equal(b.length, 6);
  assert.equal(new Set(b.map((o) => o.item)).size, 6, 'продукты в цикле не повторяются');
  assert.ok(b[2].kind === 'expensive' || b[2].kind === 'gourmet');
});

test('Фургон: сдать ящик целиком из сумки — жетоны, XP, счётчик; второй раз и закрытый — отказ', () => {
  const farms = new Map<number, FarmProgress>();
  const coins = new Map<number, number>();
  const evs: FarmEvent[] = [];
  const clock = { now: T0 };
  const ctx: FarmCtx = {
    now: () => clock.now, rng: makeRng(3), plots: new FarmPlots(undefined),
    farm: (p) => farms.get(p.c.pid)!, players: () => [], byPid: () => undefined, farmOfPid: (pid) => farms.get(pid),
    sendMe: () => {}, send: () => {}, plotChanged: () => {}, ev: (_to, e) => { evs.push(e); }, fail: (_p, a, why) => { evs.push({ k: 'fail', a, why }); },
    xp: (p, n) => { for (const lv of addFarmXp(farms.get(p.c.pid)!, n)) grantLevel(ctx, p, lv); },
    credit: (p, n) => { coins.set(p.c.pid, (coins.get(p.c.pid) ?? 0) + n); }, spend: () => true, grantItem: () => true, dirty: () => {},
  };
  const f = emptyFarm(T0);
  f.xp = 700;
  farms.set(5, f);
  const p = { c: { pid: 5, profile: { id: 5, nick: 'Tester5' } }, state: { ...farmUse('van')! }, plot: 0 } as unknown as FarmPlayer;
  const sys = new FarmSystems(ctx);
  const o = vanOffers(f, 5, vanTime(T0).cycle, T0)[0];
  f.bag[o.item] = o.n - 1;
  sys.van(p, { t: 'farm', a: 'van', slot: 0 });
  assert.deepEqual(evs.at(-1), { k: 'fail', a: 'van', why: 'item' }, 'частичной загрузки нет');
  f.bag[o.item] = o.n + 2;
  const xp0 = f.xp;
  sys.van(p, { t: 'farm', a: 'van', slot: 0 });
  assert.equal(coins.get(5), o.coins);
  assert.equal(f.bag[o.item], 2);
  assert.equal(f.xp - xp0, o.xp);
  assert.equal(f.counters.vanDeals, 1);
  assert.equal(f.sold.coins, o.coins, 'сделка идёт в дневной потолок');
  sys.van(p, { t: 'farm', a: 'van', slot: 0 });
  assert.deepEqual(evs.at(-1), { k: 'fail', a: 'van', why: 'max' });
  clock.now = T0 + 40 * 60_000;
  sys.van(p, { t: 'farm', a: 'van', slot: 0 });
  assert.deepEqual(evs.at(-1), { k: 'fail', a: 'van', why: 'off' });
});
