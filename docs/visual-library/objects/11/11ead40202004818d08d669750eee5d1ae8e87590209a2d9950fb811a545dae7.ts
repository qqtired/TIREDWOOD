// Оценка непрерывного цикла всей фермы из действующих серверных правил.
// Первая бесплатная посадка, заказы, Фургон и трюфели — разовые/ограниченные поступления, сюда не входят.
import { growMs, resourceChance, saleUnit, type FarmProgress } from './farm.ts';
import { HELPS_PER_BED, SHOVEL_DOUBLE, WATER_CUT, resourceById, type CropDef } from './farmdata.ts';

/** Ожидание по вероятностям, без простоя и переполнения сумки. Полив/помощь — сразу после посадки. */
export function farmIncome(f: FarmProgress, c: CropDef, now: number, ownWater = false, helpers = 0) {
  const helpCount = Math.max(0, Math.min(HELPS_PER_BED, Math.floor(helpers)));
  const cycleMs = growMs(f, c, now) * (ownWater ? 1 - WATER_CUT : 1) * (1 - WATER_CUT) ** helpCount;
  const harvests = f.beds.length * 3600000 / cycleMs;
  const unit = saleUnit(f, c, now);
  const products = harvests * (1 + SHOVEL_DOUBLE[f.tools.shovel - 1]);
  const resources = harvests * resourceChance(f, c);
  const seedCost = harvests * c.seed;
  return {
    beds: f.beds.length, cycleMs, unit, harvests, products, seedCost,
    net: products * unit - seedCost,
    resources, resourceXp: resources * (resourceById(c.res)?.xp ?? 0),
  };
}
