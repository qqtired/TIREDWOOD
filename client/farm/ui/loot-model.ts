// Подтверждённый сбор: одинаковые продукты и ресурсы складываются; никаких предсказанных наград.
import type { HarvestItem } from '../../../shared/farm.ts';
import { cropById, resourceById } from '../../../shared/farmdata.ts';

export interface LootRow { key: string; name: string; icon: string; n: number }
export function aggregateHarvest(items: readonly HarvestItem[]): LootRow[] {
  const rows = new Map<string, LootRow>();
  const add = (key: string, name: string, icon: string, n: number): void => {
    const old = rows.get(key);
    if (old) old.n += n;
    else rows.set(key, { key, name, icon, n });
  };
  for (const it of items) {
    const c = cropById(it.crop);
    add(`crop:${it.crop}`, c?.product ?? it.crop, c?.icon ?? 'basket', it.n);
    if (it.res) {
      const r = resourceById(it.res);
      add(`res:${it.res}`, r?.name ?? it.res, r?.icon ?? 'basket', 1);
    }
  }
  return [...rows.values()];
}
