// Реестр лаборатории: все карточки каталога. Как добавить своё:
//   идея без живой сцены — запись в client/lab/ideas/<категория>.ts (подхватится сама);
//   прототип — файл client/lab/proto/<id>.ts с живой сценой и одна строка (импорт и имя) в списке PROTOTYPES ниже.
// Тест test/lab-registry.test.ts проверяет: уникальные id и номера, обязательные поля, безопасный SVG, а файлы прототипов
// не тянут three.js и код отрисовки при загрузке (рабочее берут из ctx: так страница остаётся лёгкой).
import { IDEAS } from './ideas/index.ts';
import { bannerPlane } from './proto/banner-plane.ts';
import { congaTrain } from './proto/conga-train.ts';
import { hotMelon } from './proto/hot-melon.ts';
import { islandCampfire } from './proto/island-campfire.ts';
import { prankShop } from './proto/prank-shop.ts';
import { skipStones } from './proto/skip-stones.ts';
import { strongman } from './proto/strongman.ts';
import type { Experiment, Idea } from './types.ts';

/** Прототипы с живой сценой, в порядке показа: сначала те, что нужнее для решения */
export const PROTOTYPES: readonly Experiment[] = [hotMelon, congaTrain, prankShop, skipStones, bannerPlane, strongman, islandCampfire];

/** Весь каталог: прототипы первыми, дальше идеи по номеру из плана */
export const CATALOG: readonly Idea[] = [...PROTOTYPES, ...[...IDEAS].sort((a, b) => a.n - b.n)];

export function findEntry(id: string): Idea | undefined {
  return CATALOG.find((e) => e.id === id);
}
