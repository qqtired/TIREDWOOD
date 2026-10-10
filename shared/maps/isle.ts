// Остров «Последний свет» в мире набережной (флаг ISLE, дизайн — docs/superpowers/plans/2026-10-10-fishing-island.md §4):
// где он, причал на 6 бертов, мол с 8 местами рыбалки, смотритель Игнат, точка высадки, маяк, буи подхода и вехи F1–F6.
// Точки — из пустышек GLB острова (client/assets/isle/, `berth_*`, `fish_*`, `npc_ignat`, `spawn`, `lamp_focus`,
// `mole_light`) и расстановки props-layout.json. Координаты острова (u, h, v): метры от его центра, u — восток, v — юг,
// h — от воды; в мире x = ISLE_CENTER.x + u, y = ISLE_Y + h, z = ISLE_CENTER.z + v (как в shared/maps/lobby.ts: X — восток,
// Z — юг, yaw 0 смотрит на север, −Z). Этими точками пользуются лодки (берты, буи) и рыбалка (места на моле).
import { WATER_Y } from '../constants.ts';
import type { FishSpot } from '../fishplaces.ts';
import { ISLE_FLOORS, ISLE_SOLIDS, ISLE_WALLS } from './isleboxes.ts';

/** Центр острова в мире: 2,4 км на запад-юго-запад от площади, в сторону заката */
export const ISLE_CENTER = { x: -2364.9, z: 557.6 } as const;
/** Вода острова в GLB — на высоте 0; в мире море на WATER_Y — остров стоит на нём */
export const ISLE_Y = WATER_Y;
/** Воды острова: свой пул рыб, туман 160 м, упал в воду — выныриваешь на причале */
export const ISLE_WATERS_R = 300;
/** Суша острова — примерно в этом радиусе от центра */
export const ISLE_LAND_R = 110;

/** Точка острова (u, h, v) в мире */
export function isleWorld(u: number, h: number, v: number): { x: number; y: number; z: number } {
  return { x: ISLE_CENTER.x + u, y: ISLE_Y + h, z: ISLE_CENTER.z + v };
}

/** До центра острова по воде, м */
export function isleDist(x: number, z: number): number {
  return Math.hypot(x - ISLE_CENTER.x, z - ISLE_CENTER.z);
}

/** В водах острова (их граница — 300 м от центра) */
export function inIsleWaters(x: number, z: number): boolean {
  return isleDist(x, z) <= ISLE_WATERS_R;
}

const at = (u: number, h: number, v: number, yaw: number) => ({ ...isleWorld(u, h, v), yaw });

/**
 * Точка высадки и выныривания (пустышка `spawn`): площадка у причала, лицом к деревне (на запад). Рядом — ещё несколько
 * свободных мест на той же площадке (бочки, ящики и табличка стоят по краям), чтобы вынырнувшие не стояли друг в друге.
 */
export const ISLE_SPAWN = at(58, 1.8, -10, Math.PI / 2);
export const ISLE_LANDING_SPOTS: ReadonlyArray<{ x: number; y: number; z: number; yaw: number }> = [
  [58, -10], [57.6, -8.4], [58.8, -8.4], [60, -8.4], [59.4, -9.6], [60.4, -9.4],
].map(([u, v]) => at(u, 1.8, v, Math.PI / 2));

/**
 * Берты причала (пустышки `berth_0…5`, номера 1–6 на табличках): точка — корма лодки у южного края понтона, нос на юг
 * (yaw π). Центр лодки = точка + вперёд × L/2. Понтон — на h 0,4 над водой.
 */
export const ISLE_BERTHS: ReadonlyArray<{ n: number; x: number; y: number; z: number; yaw: number }> = Array.from({ length: 6 }, (_, i) => ({
  n: i + 1, ...isleWorld(72.7 + 4.2 * i, 0, -6.25), yaw: Math.PI,
}));

/** Верх камня мола: здесь стоят рыбаки (h 2,28 над водой) */
export const ISLE_MOLE_TOP = 2.28;
/**
 * 8 мест рыбалки на моле (пустышки `fish_0…7`): у бортика, лицом в открытое море (на юг, у изгиба — на юго-восток).
 * Зона рыбалки — 'isle' (пул рыб острова — shared/fishisle.ts). В FISH_SPOTS идут в самый конец: номера прежних не меняются.
 */
export const ISLE_FISH_SPOTS: ReadonlyArray<FishSpot & { y: number }> = [
  [58.76, 35.51, -2.9679], [67.67, 33.95, -2.9679], [76.57, 32.38, -2.9679], [85.48, 30.82, -2.9679],
  [96.17, 28.95, -2.9679], [105.07, 27.38, -2.9679], [113.98, 23.98, -2.1225], [118.98, 15.85, -2.1225],
].map(([u, v, yaw]) => ({ ...isleWorld(u, ISLE_MOLE_TOP, v), yaw, zone: 'isle' as const }));

/** Смотритель Игнат на крыльце своего дома (пустышка `npc_ignat`): лицом к причалу, на восток */
export const ISLE_IGNAT = at(54.45, 2.6, -16.4, -Math.PI / 2);
/** Где стоит тот, кто говорит с Игнатом: у крыльца, лицом к нему (на запад) */
export const ISLE_IGNAT_USE = { ...isleWorld(56.4, 2.25, -16.4), yaw: Math.PI / 2, r: 1.7 };

/** Маяк «Последний свет»: центр фонаря (пустышка `lamp_focus`), площадка у подножия — на +16 м */
export const ISLE_LAMP = isleWorld(75, 40, -60);
export const ISLE_LIGHTHOUSE_GROUND = 16;
/** Красный огонь на конце мола (`mole_light`) */
export const ISLE_MOLE_LIGHT = isleWorld(119.16, 5.95, 13.36);

/** Буи у острова (расстановка props.glb): красные и зелёные — ворота подхода на 250/190/130 м, колокольный, «Опасное течение» */
export const ISLE_BUOYS: ReadonlyArray<{ id: string; kind: 'red' | 'green' | 'bell' | 'danger' | 'route'; x: number; z: number }> = [
  ['red_01', 'red', 247.9, -31.6], ['red_02', 'red', 188.9, -21.6], ['red_03', 'red', 129.9, -10.6],
  ['green_01', 'green', 243.9, -55.6], ['green_02', 'green', 184.9, -44.6], ['green_03', 'green', 125.9, -34.6],
  ['bell_01', 'bell', 130, -20],
  ['danger_01', 'danger', 105, -110], ['danger_02', 'danger', 140, -95], ['danger_03', 'danger', 150, 55], ['danger_04', 'danger', -160, 10],
  ['F6', 'route', 369.9, -65.6],
].map(([id, kind, u, v]) => ({ id: id as string, kind: kind as 'red' | 'green' | 'bell' | 'danger' | 'route', x: ISLE_CENTER.x + (u as number), z: ISLE_CENTER.z + (v as number) }));

/**
 * Вехи пути от стоянки к острову (props-layout.json route_buoys): красно-белые буи через 400 м, курс от F1 — ЗЮЗ.
 * F6 — в GLB острова (props.glb, `buoy_route_01`), F1–F5 стоят в открытом море — их ставит игра по прототипу `buoy_route`.
 */
export const ISLE_ROUTE_BUOYS: ReadonlyArray<{ id: string; x: number; z: number }> = [
  { id: 'F1', x: -25, z: 145 }, { id: 'F2', x: -419, z: 214 }, { id: 'F3', x: -813, z: 284 },
  { id: 'F4', x: -1207, z: 353 }, { id: 'F5', x: -1601, z: 423 }, { id: 'F6', x: -1995, z: 492 },
];

/** Колокольный буй у входа в бухту (`buoy_bell_01`): звонит по волне */
export const ISLE_BELL = ISLE_BUOYS.find((b) => b.kind === 'bell')!;

type Box = { min: [number, number, number]; max: [number, number, number] };

/**
 * Твёрдое острова в мире — невидимые коробки (рисует client/lobby/isle): полы причала, улицы, пляжа, крыльца, мола,
 * лестницы и площадки маяка, стены по краю суши, дома и маяк. Сгенерированы из GLB (tools/isle/collision.mjs).
 */
export function isleBoxes(): Box[] {
  const { x: cx, z: cz } = ISLE_CENTER;
  return [...ISLE_FLOORS, ...ISLE_WALLS, ...ISLE_SOLIDS].map(([u0, h0, v0, u1, h1, v1]) => ({
    min: [cx + u0, ISLE_Y + h0, cz + v0], max: [cx + u1, ISLE_Y + h1, cz + v1],
  }));
}
