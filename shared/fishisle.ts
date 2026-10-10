// Остров «Последний свет» для рыбалки (флаг сервера ISLE, нужна FISH2; дизайн — docs/superpowers/plans/2026-10-10-fishing-island.md):
// какой пул клюёт в точке заброса. Контракт для пакетов лодок (ловля с якоря) и острова (места на моле):
// fishZoneAtSea(x, z) — 'isle' в 300 м от центра острова, иначе 'barkas' (с лодки в море клюёт пул баркаса).
// Где остров и его воды — shared/maps/isle.ts; погода и сезон острова — server/lobby/isle.ts, флаг — isleEnabled (shared/isle.ts).
import type { FishZone } from './fishplaces.ts';
import { setIsleEconomy } from './fishrules.ts';
import { ISLE_CENTER, ISLE_WATERS_R, inIsleWaters } from './maps/isle.ts';

export { ISLE_CENTER, ISLE_WATERS_R, inIsleWaters };

/** Рыба острова — с этого уровня рыбалки (как первая лодка): ниже заброс не уходит */
export const ISLE_MIN_LEVEL = 6;
/** Причина запрета заброса у острова — прямо в интерфейсе */
export const ISLE_LEVEL_HINT = `Рыба острова — с ${ISLE_MIN_LEVEL}-го уровня рыбалки`;

/** Пул для заброса с лодки в море: в водах острова — остров, везде ещё — баркас */
export function fishZoneAtSea(x: number, z: number): 'barkas' | 'isle' {
  return Number.isFinite(x) && Number.isFinite(z) && inIsleWaters(x, z) ? 'isle' : 'barkas';
}

/**
 * Пул по месту заброса: у пристани — пристань; место в море (баркас, лодка на якоре) — по точке, куда упал поплавок
 * (fishZoneAtSea); место острова (мол) — остров. Без флага ISLE остров не клюёт: вместо него — пул места.
 */
export function castZone(spotZone: FishZone, x: number, z: number, isle = ISLE.on): FishZone {
  if (!isle) return spotZone === 'isle' ? 'barkas' : spotZone;
  if (spotZone === 'barkas') return fishZoneAtSea(x, z);
  return spotZone;
}

/**
 * Флаг ISLE для рыбалки: на сервере ставит Hub (hub.isle), у клиента — приветствие набережной (поле isle). Включает
 * экономику острова: рыба пристани и баркаса ×0,4 вместо ×0,65.
 */
export const ISLE = { on: false };

export function setIsle(on: boolean): void {
  ISLE.on = on;
  setIsleEconomy(on);
}
