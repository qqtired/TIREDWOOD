// Общие проверки карты набережной для тестов обеих раскладок (test/plaza-legacy.test.ts, test/plaza3-*.test.ts).
// Без импортов из shared/, кроме модулей без координат (constants, world): тесты plaza3 ставят PLAZA3=1 и грузят
// карту динамическим import() — статический импорт отсюда вычислил бы раскладку раньше (docs/plaza3/tech-foundation.md §1.1).
import { createHash } from 'node:crypto';
import { PLAYER_HALF, PLAYER_HEIGHT } from '../shared/constants.ts';
import type { CollisionWorld } from '../shared/world.ts';
import type { Interactable, LobbyMap, Spot } from '../shared/maps/lobby.ts';
import type { MapBox } from '../shared/maps/types.ts';

/** Отпечаток старой карты набережной — sha(buildLobby()) без флага, снят 11.10.2026 после удаления Fight Club */
// PACK1: общий ISLE перемещён на(-950,180), опора заменена точными треугольниками и 272 настоящими боксами.
// Сверено с WF-пакетом: вне isleBoxes/terrain карта побайтно та же после нормализации индексов последующих боксов.
// Повторная приёмка: только семь чисел у высадки ISLE — все шесть z на −0.5 м, первый x на +1 м,
// чтобы персонаж не попадал в стойки понтона. Остальная карта сверена с bd182c2 без изменений.
export const LEGACY_LOBBY_SHA = '4c9715691677b6b4d4fef03755c916471daa02924e653e4da2a25450f6e02cd1';

/** sha256 от JSON — отпечаток данных (как у «Причала» в test/maps.test.ts) */
export function sha(v: unknown): string {
  return createHash('sha256').update(JSON.stringify(v)).digest('hex');
}

/** Номер точки → [kind, arg]: номера и смысл точек 0–112 одинаковы в обеих раскладках (фикстура lobby-interact-kinds.json) */
export function interactKinds(map: LobbyMap): Array<[string, number]> {
  return map.interact.map((it) => [it.kind, it.arg]);
}

/** Что про площадь знают только модули с её координатами: высоты опор и вода острова */
export interface SpotRules {
  bakY: number;
  parkDeckY: number;
  inIsle: (x: number, z: number) => boolean;
}

/**
 * Точки появления и взаимодействия стоят на опоре и не в стене — то же, что test/maps.test.ts (с теми же исключениями:
 * катер и лодка у мостков, остров, касса колеса 0,15 м, бак баркаса, нижний пирс стоянки). Возвращает список ошибок.
 */
export function spotProblems(map: LobbyMap, world: CollisionWorld, rules: SpotRules): string[] {
  const out: string[] = [];
  const spots: Array<Spot | Interactable> = [map.spawn, map.gateSpawn, map.garageSpawn, map.fortSpawn, ...map.interact];
  for (const s of spots) {
    const it = 'kind' in s ? s : null;
    if (it && (it.kind === 'boat' || (it.kind === 'ferry' && it.arg === 0))) continue;
    if (rules.inIsle(s.x, s.z)) continue;
    // Высота позы сидящего якоря выше земли; физическую опору проверяем отдельно, не подменяем ею anchorY.
    const floor = it?.kind === 'seat' && it.arg >= 24 ? 0 : it?.kind === 'wheel' ? 0.15 : it?.kind === 'juke' && it.arg === 1 ? rules.bakY : it?.kind === 'oboat' ? rules.parkDeckY : it?.y ?? 0;
    const name = it ? `точка ${it.id} ${it.kind}` : 'место появления';
    if (Math.abs(world.groundBelow(s.x, 0.5, s.z) - floor) > 1e-9) out.push(`${name}: нет опоры в (${s.x}; ${s.z})`);
    if (it && (it.kind === 'seat' || it.kind === 'durak' || it.kind === 'blackjack' || it.kind === 'billiards')) continue;
    const H = PLAYER_HALF;
    if (world.overlaps(s.x - H, floor + 0.01, s.z - H, s.x + H, floor + PLAYER_HEIGHT, s.z + H)) out.push(`${name}: в стене (${s.x}; ${s.z})`);
  }
  return out;
}

/** Объём пересечения двух боксов (касание — 0) */
export function boxOverlap(a: MapBox, b: MapBox): number {
  const dx = Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]);
  const dy = Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]);
  const dz = Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]);
  return dx > 1e-6 && dy > 1e-6 && dz > 1e-6 ? dx * dy * dz : 0;
}

/** Боксы с этими номерами не пересекают ни друг друга, ни прочие боксы карты (как plaza2.test.ts) */
export function overlapProblems(map: LobbyMap, ids: readonly number[]): string[] {
  const out: string[] = [];
  const mine = new Set(ids);
  for (const i of ids) {
    for (let j = 0; j < map.boxes.length; j++) {
      if (j === i || (mine.has(j) && j < i)) continue;
      if (boxOverlap(map.boxes[i], map.boxes[j]) > 0) out.push(`бокс ${i} пересекает бокс ${j}`);
    }
  }
  return out;
}

/** Круги сбора (точка + радиус) свободны от этих боксов на высоте игрока: в круг встаёт игрок целиком */
export function circleProblems(map: LobbyMap, ids: readonly number[], circles: ReadonlyArray<{ x: number; z: number; r: number; name: string }>): string[] {
  const out: string[] = [];
  for (const c of circles) {
    for (const i of ids) {
      const b = map.boxes[i];
      if (b.max[1] <= 0.01 || b.min[1] >= PLAYER_HEIGHT) continue;
      const dx = Math.max(b.min[0] - c.x, 0, c.x - b.max[0]);
      const dz = Math.max(b.min[2] - c.z, 0, c.z - b.max[2]);
      if (Math.hypot(dx, dz) < c.r) out.push(`круг «${c.name}» (${c.x}; ${c.z}) задевает бокс ${i}`);
    }
  }
  return out;
}
