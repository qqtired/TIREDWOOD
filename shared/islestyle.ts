// Остров «Последний свет»: свой счётчик видов («Остров: N из 20») и своя лестница наград — каждые 4 вида что-то новое, за все
// 20 — сет «Смотритель маяка» (docs/superpowers/plans/2026-10-10-fishing-island.md, раздел 7). Отдельной записи в профиле нет:
// счётчик — число видов острова в альбоме. Коллекция 52 видов (COLLECTION, LADDER в shared/fishstyle.ts) от видов острова не
// растёт, её награды не меняются. Вещи (модели, REWARD_INFO, выдача на сервере) подключает пакет косметики острова (E): здесь —
// только счёт и пороги, по образцу LADDER / earnedItems / nextStep.
import { FISH } from './fishing.ts';
import { ISLE_COLLECTION, ISLE_SIZE } from './fishrules.ts';
import type { RewardStep } from './fishstyle.ts';

/** Лестница острова: пороги — число видов острова в альбоме; последняя ступень — все 20 */
export const ISLE_LADDER: readonly RewardStep[] = [
  { need: 4, items: ['b:bellbuoy'] },
  { need: 8, items: ['r:lighthouse'] },
  { need: 12, items: ['w:fog'] },
  { need: 16, items: ['s:puffin'] },
  { need: ISLE_SIZE, items: ['h:keeper', 'a:keeper', 'n:lighthouse'], set: 'Смотритель маяка' },
];

/** Сколько видов острова уже в альбоме (0…20) */
export function isleCount(album: Readonly<Record<string, readonly [number, number]>>): number {
  let n = 0;
  for (const sp of ISLE_COLLECTION) if (album[FISH[sp].id]) n++;
  return n;
}

/** Всё, что положено за got видов острова (по порядку лестницы) */
export function isleEarned(got: number): string[] {
  return ISLE_LADDER.filter((s) => got >= Math.min(s.need, ISLE_SIZE)).flatMap((s) => s.items);
}

/** Следующая ступень после got видов острова; null — всё собрано */
export function isleNextStep(got: number): RewardStep | null {
  return ISLE_LADDER.find((s) => got < Math.min(s.need, ISLE_SIZE)) ?? null;
}

/** Ступень, на которой выдают вещь острова; undefined — не награда острова */
export function isleStepOf(itemId: string): RewardStep | undefined {
  return ISLE_LADDER.find((s) => s.items.includes(itemId));
}

/** Имена наград острова для подписей до подключения вещей (пакет E допишет их в REWARD_INFO и гардероб) */
export const ISLE_REWARD_NAMES: Readonly<Record<string, string>> = {
  'b:bellbuoy': 'поплавок «Колокольный буй»',
  'r:lighthouse': 'удочка «Маячная»',
  'w:fog': 'окно «Туман»',
  's:puffin': 'питомец «Тупик»',
  'h:keeper': '«Шапка смотрителя»',
  'a:keeper': '«Свитер смотрителя»',
  'n:lighthouse': 'значок «Маяк»',
};

/** Ступень острова одним словом: «поплавок «Колокольный буй»», последняя — «сет «Смотритель маяка»» */
export function isleStepLabel(step: RewardStep): string {
  if (step.set) return `сет «${step.set}»`;
  return step.items.map((id) => ISLE_REWARD_NAMES[id] ?? id).join(' и ');
}
