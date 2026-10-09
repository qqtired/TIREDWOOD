// Только лаборатория: эти записи не входят в ITEMS и не выдаются игрокам.
import type { Outfit, Slot, Tier } from './outfit.ts';

export type FittingStage = 'reference' | 'selected' | 'model' | 'approved' | 'rework' | 'rejected';
export interface FittingTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}
export interface FittingItem {
  id: string;
  name: string;
  slot: Slot;
  tier: Tier;
  price: number;
  source: 'game' | 'lab';
  stage: FittingStage;
  notes: string;
  /** Вещь действующего игрового каталога. */
  gameKey?: string;
  /** Фабрика модели только в лаборатории. */
  model?: string;
  /** Ссылка на встроенный файл или local:<id> в хранилище браузера. */
  reference?: string;
  asset?: string;
  color?: string;
  transform?: FittingTransform;
}
export interface FittingSet {
  id: string;
  name: string;
  itemIds: string[];
}
export interface FittingProject {
  version: 1;
  items: FittingItem[];
  sets: FittingSet[];
  outfit: Outfit;
  equipped: Partial<Record<Slot, string>>;
}
export const FITTING_SLOTS: readonly Slot[] = ['h', 'a', 'e', 'p', 's', 'r', 'b', 'w', 'n'];
export const FITTING_STAGES: readonly FittingStage[] = ['reference', 'selected', 'model', 'approved', 'rework', 'rejected'];
export const STAGE_NAMES: Record<FittingStage, string> = {
  reference: 'Референс', selected: 'Выбран для 3D', model: '3D-примерка',
  approved: 'Готово к переносу', rework: 'Доработать', rejected: 'Не берём',
};
