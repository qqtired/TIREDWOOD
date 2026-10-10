// Ферма: точки входа частей режима, которые достраиваются отдельно (часть B1): помощь соседям и репутация (§8),
// Фургон (§10.2), доска заказов (§10.3), Древо разлома (§11). Пока — заглушки: отвечают «выключено».
// Каждую часть лучше вынести в свой файл (help.ts, van.ts, orders.ts, boss.ts) и оставить здесь только вызовы.
import type { FarmClientMsg } from '../../shared/farmnet.ts';
import type { FarmCtx, FarmPlayer } from './room.ts';

type Msg<A extends FarmClientMsg['a']> = Extract<FarmClientMsg, { a: A }>;

export function onHelp(ctx: FarmCtx, p: FarmPlayer, _m: Msg<'help'>): void {
  ctx.fail(p, 'help', 'off');
}

export function onVan(ctx: FarmCtx, p: FarmPlayer, _m: Msg<'van'>): void {
  ctx.fail(p, 'van', 'off');
}

export function onOrder(ctx: FarmCtx, p: FarmPlayer, _m: Msg<'order'>): void {
  ctx.fail(p, 'order', 'off');
}

export function onCone(ctx: FarmCtx, p: FarmPlayer, _m: Msg<'cone'>): void {
  ctx.fail(p, 'cone', 'off');
}
