// Ферма: награды за уровень фермы (design-v11 §3.2) — вещи каталога в owned, убранство (титулы и т. п.) в farm.decor,
// повтор → DUP_ITEM_COINS. Владелец файла — часть B1: сюда же — выдача достижений (§13) по farm.counters.
import { DUP_ITEM_COINS, FARM_LEVEL_REWARDS, isFarmDecor } from '../../shared/farmdata.ts';
import type { FarmCtx, FarmPlayer } from './room.ts';

/** Выдать награды уровня level (зовётся FarmRoom.xp на каждом новом уровне) */
export function grantLevel(ctx: FarmCtx, p: FarmPlayer, level: number): void {
  const f = ctx.farm(p);
  const items = FARM_LEVEL_REWARDS[level - 1] ?? [];
  let coins = 0;
  for (const id of items) {
    if (isFarmDecor(id)) {
      if (f.decor.includes(id)) coins += DUP_ITEM_COINS;
      else f.decor.push(id);
    } else if (!ctx.grantItem(p, id)) coins += DUP_ITEM_COINS;
  }
  ctx.credit(p, coins);
  ctx.ev(p, { k: 'level', level, items: [...items], coins });
  ctx.dirty();
}
