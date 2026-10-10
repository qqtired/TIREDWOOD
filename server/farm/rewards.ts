// Ферма: выдача вещей и награды за уровень фермы (design-v11 §3.2). Вещи каталога — в owned, убранство (титулы,
// рамки, скины, эмоции) — в farm.decor; повтор → DUP_ITEM_COINS (§9.5: 100 монет v10 → 10 🪙). На новом уровне
// заодно открываются достижения с гейтом по уровню и слоты Фургона.
import { DUP_ITEM_COINS, FARM_LEVEL_REWARDS, isFarmDecor } from '../../shared/farmdata.ts';
import type { FarmGot } from '../../shared/farmsys.ts';
import { checkFarm } from './achievements.ts';
import type { FarmCtx, FarmPlayer } from './room.ts';
import { sendVan } from './van.ts';

/** Выдать вещи; вернёт жетоны за повторы (начислять — вызывающему) */
export function grantItems(ctx: FarmCtx, p: FarmPlayer, items: readonly string[]): number {
  const f = ctx.farm(p);
  let coins = 0;
  for (const id of items) {
    if (isFarmDecor(id)) {
      if (f.decor.includes(id)) coins += DUP_ITEM_COINS;
      else f.decor.push(id);
    } else if (!ctx.grantItem(p, id)) coins += DUP_ITEM_COINS;
  }
  return coins;
}

/** Тост награды (окна B2): заказ, помощь, достижение, ступень репутации, Древо */
export function sendGot(ctx: FarmCtx, p: FarmPlayer, g: FarmGot): void {
  ctx.send(p, { t: 'farmGot', g });
}

/** Выдать награды уровня level (зовётся FarmRoom.xp на каждом новом уровне) */
export function grantLevel(ctx: FarmCtx, p: FarmPlayer, level: number): void {
  const items = FARM_LEVEL_REWARDS[level - 1] ?? [];
  const coins = grantItems(ctx, p, items);
  ctx.credit(p, coins);
  ctx.ev(p, { k: 'level', level, items: [...items], coins });
  checkFarm(ctx, p);
  sendVan(ctx, p, ctx.now());
  ctx.dirty();
}
