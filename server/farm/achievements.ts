// Ферма: достижения (design-v11 §13) и косметика ступеней репутации (§8.2). Проверка — после любого действия, при
// входе и на новом уровне: счётчики уже обновлены (farm.ts, help.ts, van.ts, boss.ts), здесь — только выдача.
import { repLevel } from '../../shared/farm.ts';
import { REP_GIVEN, achDue, repDue } from '../../shared/farmach.ts';
import { FARM_COUNTERS } from '../../shared/farmdata.ts';
import { grantItems, sendGot } from './rewards.ts';
import type { FarmCtx, FarmPlayer } from './room.ts';

/** Ступень репутации, её косметика и все созревшие достижения; true — прогресс изменился */
export function checkFarm(ctx: FarmCtx, p: FarmPlayer): boolean {
  const f = ctx.farm(p);
  let changed = false;
  const rl = repLevel(f.rep);
  if (f.counters[FARM_COUNTERS.repLevel] !== rl) {
    f.counters[FARM_COUNTERS.repLevel] = rl;
    changed = true;
  }
  for (const r of repDue(f)) {
    f.counters[REP_GIVEN] = r.level;
    changed = true;
    if (!r.reward) continue;
    const coins = grantItems(ctx, p, [r.reward]);
    ctx.credit(p, coins);
    sendGot(ctx, p, { src: 'rep', id: String(r.level), coins, xp: 0, rep: 0, items: [r.reward] });
  }
  for (const a of achDue(f)) {
    f.achievements.push(a.id);
    const coins = grantItems(ctx, p, a.items) + a.coins;
    ctx.credit(p, coins);
    sendGot(ctx, p, { src: 'ach', id: a.id, coins, xp: 0, rep: 0, items: [...a.items] });
    changed = true;
  }
  if (changed) ctx.dirty();
  return changed;
}
