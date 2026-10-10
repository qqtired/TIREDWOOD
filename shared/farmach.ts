// Ферма: достижения (design-v11 §13), косметика ступеней репутации (§8.2) и что открывает уровень (§3.2, экран
// нового уровня). Счётчики — farm.counters (FARM_COUNTERS), уровень в достижении — минимальный: прогресс копится,
// награда приходит при достижении уровня. Выдачу проводит server/farm/achievements.ts.
import { farmLevel, repLevel, type FarmProgress } from './farm.ts';
import {
  ACHIEVEMENTS, CROPS, FARM_LEVEL_NAMES, FARM_LEVEL_REWARDS, REP_LEVELS, UPGRADES, type AchievementDef, type CropDef,
  type RepLevel, type UpgradeDef,
} from './farmdata.ts';
import { vanSlotCount } from './farmvan.ts';

/** Счётчик farm.counters: до какой ступени репутации выдана косметика */
export const REP_GIVEN = 'repGiven';

export function achProgress(f: FarmProgress, a: AchievementDef): { have: number; need: number } {
  return { have: Math.min(a.need, f.counters[a.counter] ?? 0), need: a.need };
}

/** Достижения, которые пора выдать */
export function achDue(f: FarmProgress): AchievementDef[] {
  const level = farmLevel(f.xp);
  return ACHIEVEMENTS.filter((a) => !f.achievements.includes(a.id) && level >= a.level && (f.counters[a.counter] ?? 0) >= a.need);
}

/** Ступени репутации с косметикой, которую пора выдать */
export function repDue(f: FarmProgress): RepLevel[] {
  const given = f.counters[REP_GIVEN] ?? 1;
  const now = repLevel(f.rep);
  return REP_LEVELS.filter((r) => r.level > given && r.level <= now);
}

export interface LevelUnlocks {
  level: number;
  name: string;
  /** Вещи за уровень (каталог или убранство) */
  items: readonly string[];
  crops: CropDef[];
  /** Улучшения, которые становятся доступны по уровню */
  upgrades: UpgradeDef[];
  /** Слотов Фургона без репутации: было → стало */
  van: [number, number];
}

/** Для экрана «Уровень фермы 5 — Фермер!»: «Открыто: Морковь, Подсолнух», «Теперь можно: Фургон — 2 слота» */
export function levelUnlocks(level: number): LevelUnlocks {
  return {
    level, name: FARM_LEVEL_NAMES[level - 1] ?? '', items: FARM_LEVEL_REWARDS[level - 1] ?? [],
    crops: CROPS.filter((c) => c.level === level), upgrades: UPGRADES.filter((u) => u.level === level),
    van: [vanSlotCount(level - 1, 0), vanSlotCount(level, 0)],
  };
}
