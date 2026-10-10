// Что открывает уровень фермы: культуры, улучшения, слоты Фургона, вещи (design-v11 §3.2). Для Семечкина и экрана уровня.
// Данные — levelUnlocks из shared/farmach.ts (B1), здесь только подпись про Фургон.
import { levelUnlocks } from '../../../shared/farmach.ts';
import type { CropDef, UpgradeDef } from '../../../shared/farmdata.ts';

export interface LevelOpens {
  crops: CropDef[];
  upgrades: UpgradeDef[];
  /** «Фургон: 2 слота» */
  van: string | null;
  /** id вещей и убранства за уровень (индекс — уровень − 1) */
  rewards: readonly string[];
}

function slotWord(n: number): string {
  return n === 1 ? 'слот' : n < 5 ? 'слота' : 'слотов';
}

export function levelOpens(level: number): LevelOpens {
  const u = levelUnlocks(level);
  return {
    crops: u.crops,
    upgrades: u.upgrades,
    van: u.van[1] > u.van[0] ? `Фургон: ${u.van[1]} ${slotWord(u.van[1])}` : null,
    rewards: u.items,
  };
}
