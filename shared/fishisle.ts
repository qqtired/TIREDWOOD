// Остров «Последний свет» для рыбалки (флаг сервера ISLE, нужна FISH2; дизайн — docs/superpowers/plans/2026-10-10-fishing-island.md):
// где воды острова и какой пул клюёт в точке заброса. Контракт для пакетов лодок (ловля с якоря) и острова (места на моле):
// fishZoneAtSea(x, z) — 'isle' в 300 м от центра острова, иначе 'barkas' (с лодки в море клюёт пул баркаса).
// X — восток, Z — юг (как в shared/maps/lobby.ts).
import type { FishZone } from './fishplaces.ts';
import { setIsleEconomy } from './fishrules.ts';

/** Центр острова (x, z), м: 2,4 км на запад-юго-запад от площади, в сторону заката */
export const ISLE_CENTER = { x: -2364.9, z: 557.6 } as const;
/** Воды острова — круг такого радиуса от центра: здесь клюёт пул острова */
export const ISLE_WATERS_R = 300;
/** Рыба острова — с этого уровня рыбалки (как первая лодка): ниже заброс не уходит */
export const ISLE_MIN_LEVEL = 6;
/** Причина запрета заброса у острова — прямо в интерфейсе */
export const ISLE_LEVEL_HINT = `Рыба острова — с ${ISLE_MIN_LEVEL}-го уровня рыбалки`;

/** В водах ли острова точка (x, z) */
export function inIsleWaters(x: number, z: number): boolean {
  return Number.isFinite(x) && Number.isFinite(z) && Math.hypot(x - ISLE_CENTER.x, z - ISLE_CENTER.z) <= ISLE_WATERS_R;
}

/** Пул для заброса с лодки в море: в водах острова — остров, везде ещё — баркас */
export function fishZoneAtSea(x: number, z: number): 'barkas' | 'isle' {
  return inIsleWaters(x, z) ? 'isle' : 'barkas';
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
 * Флаг ISLE здесь: на сервере ставит server/main.ts при запуске (ISLE=1; без переменной — только в разработке, нужна FISH2),
 * у клиента — приветствие набережной (поле isle). Включает экономику острова: рыба пристани и баркаса ×0,4 вместо ×0,65.
 */
export const ISLE = { on: false };

export function setIsle(on: boolean): void {
  ISLE.on = on;
  setIsleEconomy(on);
}

/** ISLE=1 — включить, ISLE=0 — выключить, без переменной — только в разработке; без рыбалки 2.0 (FISH2) острова нет */
export function isleEnabled(v: string | undefined, dev: boolean, fish2: boolean): boolean {
  return fish2 && (v === undefined ? dev : v === '1');
}
