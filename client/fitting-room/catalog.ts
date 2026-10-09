import { itemPrice } from '../../shared/economy.ts';
import { ITEMS, type Slot, type Tier } from '../../shared/outfit.ts';
import type { FittingItem, FittingSet } from '../../shared/fitting-room.ts';

/** Только фабрики примерочной; игровой ITEMS от этих записей не меняется. */
export const BUILTIN_MODEL_SLOTS: Readonly<Record<string, Slot>> = {
  'harbor-beanie': 'h', 'flower-panama': 'h', 'messenger-bag': 'a',
  camera: 'a', 'round-glasses': 'e', 'crab-buddy': 's',
};

export const BUILTIN_SETS: FittingSet[] = [{
  id: 'set:coastal-courier', name: 'После работы у моря',
  itemIds: ['lab:harbor-beanie', 'lab:messenger-bag', 'lab:round-glasses', 'lab:crab-buddy'],
}];

const PROTOTYPES: Array<[string, string, Slot, Tier, number]> = [
  ['harbor-beanie', 'Портовая шапка', 'h', 'common', 300],
  ['flower-panama', 'Панама с цветком', 'h', 'common', 300],
  ['messenger-bag', 'Сумка почтальона', 'a', 'rare', 1200],
  ['camera', 'Фотоаппарат туриста', 'a', 'rare', 1200],
  ['round-glasses', 'Круглые очки', 'e', 'common', 300],
  ['crab-buddy', 'Краб на плече', 's', 'rare', 1200],
];

export function createCatalog(): FittingItem[] {
  const game: FittingItem[] = ITEMS.map(item => ({
    id: `game:${item.id}`, name: item.name, slot: item.slot, tier: item.tier,
    price: itemPrice(item.tier) ?? 0, source: 'game', stage: 'model', gameKey: item.key,
    notes: item.tier === 'free' ? 'Действующая бесплатная вещь игры.'
      : itemPrice(item.tier) === null ? 'Действующая вещь игры: не продаётся, выдаётся своим игровым способом.'
        : 'Действующая вещь игры. Цена взята из игровой экономики.',
  }));
  const lab: FittingItem[] = PROTOTYPES.map(([model, name, slot, tier, price]) => ({
    id: `lab:${model}`, name, slot, tier, price, model, source: 'lab', stage: 'model',
    notes: 'Лабораторный прототип. Название, редкость и цена предварительные. Игрокам не выдаётся.',
    ...(model === 'harbor-beanie' ? { reference: 'assets/harbor-beanie.png' } : {}),
  }));
  return [...game, ...lab];
}
