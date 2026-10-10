// Счётчик видов острова «Последний свет» для лестницы косметики острова (ISLE_LADDER в shared/fishstyle.ts). Виды острова —
// таблицы рыбалки (shared/fishing.ts в конце FISH, shared/fishrules.ts ISLE_COLLECTION, zone 'isle'): 12 всегда + 8 в туман.
// Ключи альбома — id видов: счётчик — сколько видов острова в альбоме; коллекция 52 видов от них не растёт.
import { FISH } from './fishing.ts';
import { ISLE_COLLECTION, ISLE_SIZE } from './fishrules.ts';

/** Видов на острове: 12 всегда + 8 только в туман (дизайн §5) */
export const ISLE_TOTAL = ISLE_SIZE;

/** id видов острова — ключи альбома, по порядку журнала (категории, внутри — как в таблице) */
export const ISLE_SPECIES: readonly string[] = ISLE_COLLECTION.map((sp) => FISH[sp].id);

/** Сколько видов острова в альбоме (профиль сервера или свой профиль на клиенте) */
export function isleCaught(p: { album: Readonly<Record<string, unknown>> }): number {
  let n = 0;
  for (const id of ISLE_SPECIES) if (p.album[id]) n++;
  return n;
}
