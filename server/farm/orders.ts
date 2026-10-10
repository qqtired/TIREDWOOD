// Ферма: доска заказов на сервере (design-v11 §10.3). Новая доска — в первую секунду МСК-суток на ферме или при
// входе; прогресс двигают действия игрока после выдачи (systems.ts → orderEvent); награда — один раз, жетоны мимо
// дневного потолка, опыт фермы и репутация.
import { mskDay } from '../../shared/economy.ts';
import type { FarmOrder } from '../../shared/farm.ts';
import { ORDER_REROLLS } from '../../shared/farmdata.ts';
import { nearUse } from '../../shared/farmmap.ts';
import type { FarmClientMsg } from '../../shared/farmnet.ts';
import {
  makeOrders, orderEnv, orderProgress, orderReady, orderStreak, orderTemplate, slotOrder, type OrderEvent,
} from '../../shared/farmorders.ts';
import { sendGot } from './rewards.ts';
import type { FarmCtx, FarmPlayer } from './room.ts';

/** Окно «кто-то ещё был на ферме» для заказов на помощь */
const SOCIAL_WINDOW_MS = 72 * 3600_000;

/** За 3 суток на ферме был кто-то, кроме pid (по местам на участках: хозяин заходил или он здесь) */
export function socialActive(ctx: FarmCtx, pid: number, now: number): boolean {
  return ctx.plots.seats.some((s) => !!s && s.pid !== pid && (ctx.plots.isPresent(s.pid) || now - s.seen <= SOCIAL_WINDOW_MS));
}

/** Сегодняшняя доска: новые сутки — 3 новых заказа и 2 замены; «Все свои» — по серии дней. true — изменилось */
export function ensureOrders(ctx: FarmCtx, p: FarmPlayer, boss: boolean, now: number): boolean {
  const f = ctx.farm(p);
  const day = mskDay(now);
  let changed = false;
  if (f.orders.day !== day) {
    const env = orderEnv(f, socialActive(ctx, p.c.pid, now), boss);
    f.orders = { day, list: makeOrders(env, () => ctx.rng()), rerolls: ORDER_REROLLS };
    changed = true;
  }
  if (orderStreak(f)) changed = true;
  if (changed) ctx.dirty();
  return changed;
}

export function orderEvent(ctx: FarmCtx, p: FarmPlayer, e: OrderEvent, now: number): boolean {
  const changed = orderProgress(ctx.farm(p), e, now);
  if (changed) ctx.dirty();
  return changed;
}

/** Забрать награду или заменить заказ i. true — прогресс изменился */
export function orderAction(ctx: FarmCtx, p: FarmPlayer, m: Extract<FarmClientMsg, { a: 'order' }>, boss: boolean, now: number): boolean {
  if (!nearUse('orders', p.state.x, p.state.z, 1.5)) { ctx.fail(p, 'order', 'far'); return false; }
  ensureOrders(ctx, p, boss, now);
  const f = ctx.farm(p);
  const o: FarmOrder | undefined = Number.isInteger(m.i) ? f.orders.list[m.i] : undefined;
  if (!o) { ctx.fail(p, 'order', 'order'); return false; }
  if (o.done) { ctx.fail(p, 'order', 'item'); return false; }
  if (m.k === 'claim') {
    const tpl = orderTemplate(o.t);
    if (!tpl || !orderReady(f, o, now)) { ctx.fail(p, 'order', 'order'); return false; }
    o.done = true;
    f.rep += tpl.rep;
    ctx.credit(p, tpl.coins);
    ctx.xp(p, tpl.xp, 'заказ');
    sendGot(ctx, p, { src: 'order', id: tpl.id, coins: tpl.coins, xp: tpl.xp, rep: tpl.rep, items: [] });
  } else if (m.k === 'reroll') {
    if (f.orders.rerolls <= 0) { ctx.fail(p, 'order', 'max'); return false; }
    const env = orderEnv(f, socialActive(ctx, p.c.pid, now), boss);
    let next = slotOrder(m.i, env, () => ctx.rng(), f.orders.list, o.t);
    // та же цель ещё раз — не замена: пробуем ещё пару раз
    for (let k = 0; k < 4 && next.t === o.t && next.crop === o.crop; k++) next = slotOrder(m.i, env, () => ctx.rng(), f.orders.list, o.t);
    f.orders.list[m.i] = next;
    f.orders.rerolls--;
    orderStreak(f);
  } else {
    return false;
  }
  ctx.dirty();
  return true;
}
