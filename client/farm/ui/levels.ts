// Что открывает уровень фермы: культуры, улучшения, слоты Фургона, вещи (design-v11 §3.2). Для Семечкина и экрана уровня.
import { CROPS, FARM_LEVEL_REWARDS, UPGRADES, VAN_SLOTS_BY_LEVEL, type CropDef, type UpgradeDef } from '../../../shared/farmdata.ts';

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
  const van = VAN_SLOTS_BY_LEVEL.find((v) => v.level === level);
  return {
    crops: CROPS.filter((c) => c.level === level),
    upgrades: UPGRADES.filter((u) => u.level === level),
    van: van ? `Фургон: ${van.slots} ${slotWord(van.slots)}` : null,
    rewards: FARM_LEVEL_REWARDS[level - 1] ?? [],
  };
}
