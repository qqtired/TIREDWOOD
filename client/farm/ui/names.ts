// Названия наград фермы по id: вещи каталога одежды ('h:farmcap'), убранство ('ti:legend') и откуда они берутся.
import { ACHIEVEMENTS, FARM_DECOR, FARM_LEVEL_REWARDS, REP_LEVELS } from '../../../shared/farmdata.ts';
import { itemById } from '../../../shared/outfit.ts';
import { SLOT_EMOJI } from './common.ts';

/** Название награды: вещь одежды или убранство */
export function rewardName(id: string): string {
  return itemById(id)?.name ?? FARM_DECOR.find((d) => d.id === id)?.name ?? id;
}

/** Эмодзи-значок награды по слоту (картинок вещей у нас нет — модель вращается только в игре) */
export function rewardEmoji(id: string): string {
  return SLOT_EMOJI[id.split(':')[0]] ?? '🎁';
}

/** Вещь надевается в примерочной (одежда, питомцы, значки), а не из «Убранства» */
export function isWearable(id: string): boolean {
  return itemById(id) !== undefined;
}

/** Откуда берётся убранство или вещь: «Уровень 13», «Достижение «Первая грядка»», «Репутация 5 — Мастер грядок» */
export function rewardSource(id: string): string {
  const lv = FARM_LEVEL_REWARDS.findIndex((list) => list.includes(id));
  if (lv >= 0) return `уровень фермы ${lv + 1}`;
  const a = ACHIEVEMENTS.find((x) => x.items.includes(id));
  if (a) return `достижение «${a.hidden ? '???' : a.name}»`;
  const r = REP_LEVELS.find((x) => x.reward === id);
  if (r) return `репутация ${r.level} — ${r.name}`;
  return 'награда фермы';
}
