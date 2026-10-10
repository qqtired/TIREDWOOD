// Ферма, часть B1: доска заказов (design-v11 §10.3) — генератор по уровню, прогресс после выдачи, награда раз, замены.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addFarmXp, emptyFarm, type FarmProgress } from '../shared/farm.ts';
import { ORDER_TEMPLATES, cropById } from '../shared/farmdata.ts';
import { farmUse } from '../shared/farmmap.ts';
import type { FarmEvent } from '../shared/farmnet.ts';
import { makeOrders, orderEnv, orderProgress, ordersResetAt } from '../shared/farmorders.ts';
import { makeRng } from '../shared/math.ts';
import { FarmPlots } from '../server/farm/plots.ts';
import { grantLevel } from '../server/farm/rewards.ts';
import type { FarmCtx, FarmPlayer } from '../server/farm/room.ts';
import { FarmSystems } from '../server/farm/systems.ts';

const T0 = Date.UTC(2026, 9, 10, 9);

test('заказы: 3 слота по правилам уровня, детерминированно от ГСЧ, обновление в полночь МСК', () => {
  const f = emptyFarm(T0);
  const env = orderEnv(f, false, false);
  const a = makeOrders(env, makeRng(11));
  assert.deepEqual(a, makeOrders(env, makeRng(11)));
  assert.equal(a.length, 3);
  assert.ok(a[0].t === 'grow-fast' || a[0].t === 'grow-mid', 'ур. 1 — быстрые или обычные');
  if (a[0].crop) assert.ok(cropById(a[0].crop)!.level <= 1);
  assert.ok(a[1].t.startsWith('grow-'), 'ур. 1 без соседей — вместо «Помоги/Фургон» повторяемый «Вырасти»');
  const special = ORDER_TEMPLATES.find((t) => t.id === a[2].t)!;
  assert.ok(special.kind === 'special' || special.kind === 'grow');
  assert.ok(!['crystal-garden', 'night-gardener', 'patient', 'tree-sprout', 'tree-fest', 'neighbor-friend'].includes(a[2].t));
  // ур. 10, соседи есть: слот B — помощь или Фургон средней/сложной трудности
  for (let s = 1; s < 30; s++) {
    const g = emptyFarm(T0);
    g.xp = 48_500;
    const b = makeOrders(orderEnv(g, true, false), makeRng(s))[1];
    assert.match(b.t, /^(help|van)-(mid|hard)$/);
  }
  assert.equal(ordersResetAt(T0), Date.UTC(2026, 9, 10, 21));
  // «Вырасти»: засчитывается только своя группа или своя культура
  const g = emptyFarm(T0);
  g.orders = { day: '2026-10-10', rerolls: 2, list: [{ t: 'grow-fast', need: 2, got: 0, crop: 'radish', done: false }, { t: 'collector', need: 10, got: 0, done: false }] };
  orderProgress(g, { k: 'harvest', items: [{ crop: 'radish', res: 'root' }, { crop: 'wheat', res: null }, { crop: 'radish', res: null }] }, T0);
  assert.deepEqual(g.orders.list.map((o) => o.got), [2, 1]);
});

test('заказы: забрать награду раз, мимо потолка; две замены в сутки; новые сутки — новая доска', () => {
  const farms = new Map<number, FarmProgress>();
  const coins = new Map<number, number>();
  const evs: FarmEvent[] = [];
  const clock = { now: T0 };
  const ctx: FarmCtx = {
    now: () => clock.now, rng: makeRng(5), plots: new FarmPlots(undefined),
    farm: (p) => farms.get(p.c.pid)!, players: () => [p], byPid: () => undefined, farmOfPid: (pid) => farms.get(pid),
    sendMe: () => {}, send: () => {}, plotChanged: () => {}, ev: (_to, e) => { evs.push(e); }, fail: (_p, a, why) => { evs.push({ k: 'fail', a, why }); },
    xp: (pp, n) => { for (const lv of addFarmXp(farms.get(pp.c.pid)!, n)) grantLevel(ctx, pp, lv); },
    credit: (pp, n) => { coins.set(pp.c.pid, (coins.get(pp.c.pid) ?? 0) + n); }, spend: () => true, grantItem: () => true, dirty: () => {},
  };
  const f = emptyFarm(T0);
  f.sold = { day: '2026-10-10', coins: 700, frac: 0 };
  farms.set(3, f);
  const p = { c: { pid: 3, profile: { id: 3, nick: 'Tester3' } }, state: { ...farmUse('orders')! }, plot: 0 } as unknown as FarmPlayer;
  const sys = new FarmSystems(ctx);
  sys.join(p);
  assert.equal(f.orders.day, '2026-10-10');
  assert.equal(f.orders.list.length, 3);
  assert.equal(f.orders.rerolls, 2);
  f.orders.list[0] = { t: 'grow-fast', need: 2, got: 0, done: false };
  sys.order(p, { t: 'farm', a: 'order', k: 'claim', i: 0 });
  assert.deepEqual(evs.at(-1), { k: 'fail', a: 'order', why: 'order' });
  sys.on(p, { k: 'harvest', xp: 10, items: [{ bed: 0, crop: 'radish', n: 2, res: null, xp: 5 }, { bed: 0, crop: 'radish', n: 1, res: null, xp: 5 }] });
  assert.equal(f.orders.list[0].got, 2, 'двойной урожай — одно растение');
  const xp0 = f.xp;
  sys.order(p, { t: 'farm', a: 'order', k: 'claim', i: 0 });
  assert.equal(coins.get(3), 12, 'заказ платит целиком и после дневного потолка');
  assert.equal(f.xp - xp0, 30);
  assert.ok(f.orders.list[0].done);
  sys.order(p, { t: 'farm', a: 'order', k: 'claim', i: 0 });
  assert.deepEqual(evs.at(-1), { k: 'fail', a: 'order', why: 'item' });
  sys.order(p, { t: 'farm', a: 'order', k: 'reroll', i: 2 });
  sys.order(p, { t: 'farm', a: 'order', k: 'reroll', i: 2 });
  assert.equal(f.orders.rerolls, 0);
  sys.order(p, { t: 'farm', a: 'order', k: 'reroll', i: 2 });
  assert.deepEqual(evs.at(-1), { k: 'fail', a: 'order', why: 'max' });
  // полночь по Москве: новая доска при следующей секунде на ферме
  sys.second(clock.now);
  clock.now = Date.UTC(2026, 9, 10, 21, 0, 1);
  sys.second(clock.now);
  assert.equal(f.orders.day, '2026-10-11');
  assert.equal(f.orders.rerolls, 2);
  assert.ok(f.orders.list.every((o) => !o.done && o.got === 0 || o.t === 'all-mine'));
});
