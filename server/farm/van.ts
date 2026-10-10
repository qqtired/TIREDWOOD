// Ферма: Фургон на сервере (design-v11 §10.2). Предложения — из серверного зерна (игрок × цикл, shared/farmvan.ts),
// ящик сдаётся целиком из сумки и сразу платит: до дневного потолка полностью, после — ×0,25, не дешевле посадки;
// «Гурман» (трюфели) потолком не режется. Сделка — один раз на слот за цикл.
import { farmLevel, payCapped } from '../../shared/farm.ts';
import { FARM_COUNTERS } from '../../shared/farmdata.ts';
import type { FarmClientMsg } from '../../shared/farmnet.ts';
import { nearUse } from '../../shared/farmmap.ts';
import type { FarmVanView } from '../../shared/farmsys.ts';
import { vanFloorShare, vanOffers, vanSlotCount, vanSlotLock, vanTime, type VanOffer } from '../../shared/farmvan.ts';
import type { FarmCtx, FarmPlayer } from './room.ts';

const VAN_SLOTS_SHOWN = 6;

export function vanView(ctx: FarmCtx, p: FarmPlayer, now: number): FarmVanView {
  const f = ctx.farm(p);
  const t = vanTime(now);
  const level = farmLevel(f.xp);
  const count = vanSlotCount(level, f.rep);
  const offers = vanOffers(f, p.c.pid, t.cycle, now);
  const done = f.van.cycle === t.cycle ? f.van.done : [];
  const slots = Array.from({ length: VAN_SLOTS_SHOWN }, (_, i) => ({
    i, offer: i < count ? offers.find((o) => o.slot === i) ?? null : null, done: done.includes(i),
    lock: i < count ? null : vanSlotLock(level, f.rep, i),
  }));
  return { cycle: t.cycle, open: t.open, next: t.next, slots };
}

export function sendVan(ctx: FarmCtx, p: FarmPlayer, now: number): void {
  ctx.send(p, { t: 'farmVan', v: vanView(ctx, p, now) });
}

/** Сдать ящик слота; вернёт сделку или null (отказ уже отправлен) */
export function vanDeliver(ctx: FarmCtx, p: FarmPlayer, m: Extract<FarmClientMsg, { a: 'van' }>, now: number): { o: VanOffer; coins: number } | null {
  if (!nearUse('van', p.state.x, p.state.z, 1.5)) { ctx.fail(p, 'van', 'far'); return null; }
  const f = ctx.farm(p);
  const t = vanTime(now);
  if (vanSlotCount(farmLevel(f.xp), f.rep) === 0) { ctx.fail(p, 'van', 'level'); return null; }
  if (!t.open) { ctx.fail(p, 'van', 'off'); return null; }
  if (f.van.cycle !== t.cycle) f.van = { cycle: t.cycle, done: [] };
  const o = Number.isInteger(m.slot) ? vanOffers(f, p.c.pid, t.cycle, now).find((x) => x.slot === m.slot) : undefined;
  if (!o) { ctx.fail(p, 'van', 'level'); return null; }
  if (f.van.done.includes(o.slot)) { ctx.fail(p, 'van', 'max'); return null; }
  const have = f.bag[o.item] ?? 0;
  if (have < o.n) { ctx.fail(p, 'van', 'item'); return null; }
  f.bag[o.item] = have - o.n;
  if (f.bag[o.item] <= 0) delete f.bag[o.item];
  const coins = o.kind === 'gourmet' ? o.coins : payCapped(f, o.coins, vanFloorShare(o), now);
  f.van.done.push(o.slot);
  f.counters[FARM_COUNTERS.vanDeals] = (f.counters[FARM_COUNTERS.vanDeals] ?? 0) + 1;
  ctx.credit(p, coins);
  ctx.ev(p, { k: 'sold', item: o.item, n: o.n, coins });
  ctx.xp(p, o.xp, 'Фургон');
  return { o, coins };
}
