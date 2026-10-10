// Ферма, часть B1: награды уровня (design-v11 §3.2), достижения (§13) и косметика ступеней репутации (§8.2).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addFarmXp, emptyFarm, type FarmProgress } from '../shared/farm.ts';
import { achDue, levelUnlocks } from '../shared/farmach.ts';
import { DUP_ITEM_COINS } from '../shared/farmdata.ts';
import type { FarmEvent, FarmServerMsg } from '../shared/farmnet.ts';
import { makeRng } from '../shared/math.ts';
import { checkFarm } from '../server/farm/achievements.ts';
import { FarmPlots } from '../server/farm/plots.ts';
import { grantLevel } from '../server/farm/rewards.ts';
import type { FarmCtx, FarmPlayer } from '../server/farm/room.ts';

const T0 = Date.UTC(2026, 9, 10, 9);

function kit() {
  const f = emptyFarm(T0);
  const owned = new Set<string>(['h:straw']);
  const evs: FarmEvent[] = [];
  const sent: FarmServerMsg[] = [];
  let coins = 0;
  const ctx: FarmCtx = {
    now: () => T0, rng: makeRng(1), plots: new FarmPlots(undefined),
    farm: () => f, players: () => [], byPid: () => undefined, farmOfPid: () => f,
    sendMe: () => {}, send: (_to, m) => { sent.push(m); }, plotChanged: () => {}, ev: (_to, e) => { evs.push(e); }, fail: () => {},
    xp: (p, n) => { for (const lv of addFarmXp(f, n)) grantLevel(ctx, p, lv); },
    credit: (_p, n) => { coins += n; }, spend: () => true,
    grantItem: (_p, id) => { if (owned.has(id)) return false; owned.add(id); return true; }, dirty: () => {},
  };
  const p = { c: { pid: 1, profile: { id: 1, nick: 'Tester1' } }, state: { x: 0, z: 0 }, plot: 0 } as unknown as FarmPlayer;
  return { f, owned, evs, sent, ctx, p, coins: () => coins };
}

test('уровень: вещи v11, повтор → жетоны, событие для экрана уровня; что открывает уровень', () => {
  const k = kit();
  k.ctx.xp(k.p, 700, 'тест');
  assert.deepEqual(k.evs.filter((e) => e.k === 'level'), [
    { k: 'level', level: 2, items: ['h:straw'], coins: DUP_ITEM_COINS },
    { k: 'level', level: 3, items: ['u:sprout'], coins: 0 },
  ]);
  assert.ok(k.owned.has('u:sprout'));
  assert.equal(k.coins(), DUP_ITEM_COINS);
  assert.ok(k.sent.some((m) => m.t === 'farmVan' && m.v.slots.filter((s) => s.offer).length === 1), 'ур. 3 — открылся Фургон');
  const u5 = levelUnlocks(5);
  assert.equal(u5.name, 'Фермер');
  assert.deepEqual(u5.crops.map((c) => c.id), ['carrot', 'sunflower']);
  assert.deepEqual(u5.van, [1, 2]);
  assert.deepEqual(levelUnlocks(13).items, ['u:stargardener', 'h:leafcrown', 'f:fireflies', 'ti:legend']);
});

test('достижения: по счётчику и с уровня, раз; убранство и вещи, жетоны; ступени репутации с косметикой', () => {
  const k = kit();
  const f: FarmProgress = k.f;
  f.counters.harvests = 25;
  assert.deepEqual(achDue(f).map((a) => a.id), ['first-bed'], 'на ур. 1 «Руки в земле» ждёт уровня');
  f.xp = 200;
  checkFarm(k.ctx, k.p);
  assert.deepEqual(f.achievements, ['first-bed', 'hands-in-soil']);
  assert.ok(f.decor.includes('em:showoff'));
  assert.ok(k.owned.has('n:sprout'));
  assert.equal(k.coins(), 25);
  checkFarm(k.ctx, k.p);
  assert.equal(k.coins(), 25, 'второй раз не выдаётся');
  f.rep = 700;
  checkFarm(k.ctx, k.p);
  assert.equal(f.counters.repLevel, 5);
  assert.ok(k.owned.has('l:sneakers'), 'репутация 3 — кеды');
  assert.ok(f.decor.includes('tl:goldcan'), 'репутация 5 — золотая лейка');
  f.xp = 1700;
  checkFarm(k.ctx, k.p);
  assert.ok(f.achievements.includes('good-name'), 'репутация 4 на ур. 4 — «Хорошее имя»');
  assert.ok(k.sent.some((m) => m.t === 'farmGot' && m.g.src === 'ach' && m.g.id === 'good-name'));
});
