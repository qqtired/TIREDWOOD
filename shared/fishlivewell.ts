// Лайвел (садок) своей лодки (флаг ISLE; решения владельца 10.10, план внедрения п. 8): 25 / 50 / 75 мест у «Волжанки» /
// «Альбакора» / «Нортсильвера» — по лучшей купленной лодке. Рюкзак полон — пойманная рыба ложится в лайвел по той же цене
// поимки (где бы ни ловил: с мостков, с баркаса, с якоря — в чужой лодке рыба всё равно идёт в лайвел СВОЕЙ лодки). Лодки
// нет — при полном рюкзаке заброс не уходит, как раньше, с причиной на экране. Продаётся у любого скупщика (Семён, Саня,
// Игнат) — рюкзак, лайвел или всё сразу — и кнопкой «Продать улов» в меню своей лодки (server/lobby/fishlivewell.ts).
// Хранение — профиль fishing.livewell (BagFish[], номера общие с рюкзаком), нормализация — shared/fishprogress.ts.
import { BOATS } from './fishboat.ts';
import { LIVEWELL_MAX, bagSlots, bagValue, type BagFish, type FishProgress } from './fishprogress.ts';
import { BAG_FULL_HINT } from './fishrelease.ts';

export { LIVEWELL_MAX };

/** Что продать: рюкзак, лайвел или всё */
export type SellWhat = 'bag' | 'well' | 'all';

/** Мест в лайвеле: по лучшей купленной лодке; 0 — лодки нет */
export function livewellCap(p: Readonly<Pick<FishProgress, 'boats'>>): number {
  let cap = 0;
  for (const b of BOATS) if (p.boats?.includes(b.id)) cap = Math.max(cap, b.livewell);
  return Math.min(LIVEWELL_MAX, cap);
}

/** Рыба в лайвеле (в старых сохранениях поля нет — пусто) */
export function livewellOf(p: Readonly<Pick<FishProgress, 'livewell'>>): readonly BagFish[] {
  return p.livewell ?? [];
}

/** Куда ляжет следующая пойманная рыба: в рюкзак, в лайвел; null — некуда (заброс не уходит) */
export function catchRoom(p: Readonly<FishProgress>): 'bag' | 'well' | null {
  if (p.bag.length < bagSlots(p)) return 'bag';
  if (livewellOf(p).length < livewellCap(p)) return 'well';
  return null;
}

/** Почему заброс не уходит (некуда положить рыбу) — прямо в интерфейсе; null — место есть */
export function catchFullHint(p: Readonly<FishProgress>, isle: boolean): string | null {
  if (catchRoom(p)) return null;
  if (livewellCap(p) > 0) return 'Рюкзак и лайвел лодки полны — продай улов скупщику или из меню лодки';
  return isle ? 'Рюкзак полон, а лодки с лайвелом нет — продай улов скупщику или отпусти рыбу из рюкзака (I)' : BAG_FULL_HINT;
}

/** Рыба на продажу: рюкзак, лайвел или всё */
export function sellList(p: Readonly<FishProgress>, what: SellWhat): readonly BagFish[] {
  if (what === 'bag') return p.bag;
  if (what === 'well') return livewellOf(p);
  return [...p.bag, ...livewellOf(p)];
}

/** Цена улова: рюкзак, лайвел или всё */
export function catchValue(p: Readonly<FishProgress>, what: SellWhat = 'all'): number {
  return bagValue(sellList(p, what));
}
