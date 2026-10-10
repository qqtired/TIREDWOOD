// Общие координаты рыбацкого причала: серверная коллизия и клиентская сцена используют один настил.
// X — восток, Z — юг; yaw=0 — север. Старые шесть мест идут первыми: их arg и interaction ID не меняются.
import { BARKAS_DECK_Y, BARKAS_FISH_FIRST, BARKAS_FISH_SPOTS, BARKAS_ROULETTE, SANYA_USE } from './barkas.ts';
import { ISLE_FISH_SPOTS, ISLE_IGNAT_USE } from './maps/isle.ts';

export interface FishPlaceBox {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}

/**
 * Где место рыбалки: пристань (по умолчанию) или баркас в море — свой пул рыб, ×1,25 и злее рыба (shared/fishrules.ts);
 * остров «Последний свет» (флаг ISLE) — свои 20 видов (shared/fishisle.ts).
 */
export type FishZone = 'pier' | 'barkas' | 'isle';

export interface FishSpot {
  x: number;
  z: number;
  yaw: number;
  /** По умолчанию 'pier' */
  zone?: FishZone;
}

export const FISH_PIER_COUNT = 8;
export const FISH_LIGHTHOUSE_COUNT = 4;
/** Мест у острова (пирс и площадка маяка); дальше — на баркасе (shared/barkas.ts) */
export const FISH_ISLAND_COUNT = FISH_PIER_COUNT + FISH_LIGHTHOUSE_COUNT;
export const FISH_BARKAS_COUNT = BARKAS_FISH_SPOTS.length;

/**
 * Пирс дальше в море (выпуск «рыбалка C»): от южного края площадки маяка — дальние мостки шириной 3 м (между местами
 * 10 и 11, их забросы идут вдоль мостков в воду), на конце — широкая площадка («голова» пирса) с домом рыбака Семёна
 * у южного края. Верх настилов — y = 0, как у мостков. Лодка «Удалая» стоит справа от дома (если смотреть с мостков),
 * у западного края площадки (shared/ferry.ts).
 */
export const FISH_PIER2: FishPlaceBox = { x0: -20.5, y0: -0.6, z0: 46, x1: -17.5, y1: 0, z1: 54 };
export const FISH_PIER_HEAD: FishPlaceBox = { x0: -25.5, y0: -0.6, z0: 54, x1: -12.5, y1: 0, z1: 64 };
/**
 * Дом рыбака: сруб у южного края площадки (задняя стена — по краю), крыльцо под навесом смотрит на север, к пирсу.
 * Твёрдое — коробка сруба, две стойки крыльца, бочки и ящики у стен (всё есть и без FISH2: дом — часть пирса).
 */
export const FISH_HOUSE = { x0: -22, x1: -16, z0: 59.6, z1: 64, wall: 2.6, ridge: 4.25, porch: 1.2, door: -20.2 } as const;
export const FISH_HOUSE_BOXES: readonly FishPlaceBox[] = [
  // сруб (крышу не достать прыжком: стены выше 2,5 м)
  { x0: FISH_HOUSE.x0, y0: 0, z0: FISH_HOUSE.z0, x1: FISH_HOUSE.x1, y1: FISH_HOUSE.wall, z1: FISH_HOUSE.z1 },
  // стойки крыльца по углам
  { x0: -21.93, y0: 0, z0: 58.47, x1: -21.77, y1: 2.5, z1: 58.63 },
  { x0: -16.23, y0: 0, z0: 58.47, x1: -16.07, y1: 2.5, z1: 58.63 },
  // бочки у западной стены и штабель ящиков у восточной
  { x0: -23.05, y0: 0, z0: 61.75, x1: -22.05, y1: 0.95, z1: 63.85 },
  { x0: -15.95, y0: 0, z0: 62.3, x1: -14.85, y1: 1.1, z1: 63.85 },
  // ящик с бухтой каната на крыльце, левее двери
  { x0: -21.95, y0: 0, z0: 59.0, x1: -21.15, y1: 0.62, z1: 59.6 },
];
/** Места рыбалки на дальних мостках и на площадке у дома: только в конец FISH_SPOTS (после баркаса), зона — пристань */
export const FISH_FAR_SPOTS: ReadonlyArray<FishSpot> = [
  // мостки 3 м: западные и восточные места вразбежку — с сидящими рыбаками проход остаётся
  { x: -18.05, z: 47.0, yaw: -Math.PI / 2 }, { x: -19.95, z: 48.5, yaw: Math.PI / 2 },
  { x: -18.05, z: 50.5, yaw: -Math.PI / 2 }, { x: -19.95, z: 52.5, yaw: Math.PI / 2 },
  // площадка у дома: по два места на западном и восточном краю; второе западное — в юго-западном углу у бочек,
  // заброс на юг: на западном краю у дома — причал «Удалой» (shared/ferry.ts)
  { x: -24.95, z: 56.2, yaw: Math.PI / 2 }, { x: -23.65, z: 63.45, yaw: Math.PI },
  { x: -13.05, z: 56.2, yaw: -Math.PI / 2 }, { x: -13.05, z: 61.2, yaw: -Math.PI / 2 },
];
export const FISH_SPOTS: ReadonlyArray<FishSpot> = [
  ...[25, 28.5, 32].flatMap((z) => [
    { x: -20.45, z, yaw: Math.PI / 2 }, { x: -17.55, z, yaw: -Math.PI / 2 },
  ]),
  // Четвёртая пара продолжает прежний ритм 3,5 м, сохраняя центральный проход.
  { x: -20.45, z: 35.5, yaw: Math.PI / 2 },
  { x: -17.55, z: 35.5, yaw: -Math.PI / 2 },
  // Четыре независимых внешних края площадки маяка, вдали от декоративных рыбаков и их снастей.
  { x: -23.45, z: 41, yaw: Math.PI / 2 },
  { x: -14.55, z: 42.5, yaw: -Math.PI / 2 },
  { x: -21.65, z: 45.45, yaw: Math.PI },
  { x: -16.35, z: 45.45, yaw: Math.PI },
  // Восемь мест вдоль бортов баркаса «Альбатрос» (zone: 'barkas') — только в конец: номера прежних мест не меняются.
  ...BARKAS_FISH_SPOTS.slice(0, BARKAS_FISH_FIRST),
  // Восемь мест на дальних мостках и у дома рыбака (пристань) — снова в конец: номера мест баркаса не меняются.
  ...FISH_FAR_SPOTS,
  // Ещё два места на удлинённом баркасе — опять в конец: номера всех прежних мест те же.
  ...BARKAS_FISH_SPOTS.slice(BARKAS_FISH_FIRST),
  // Восемь мест на моле острова «Последний свет» (zone: 'isle', флаг ISLE; shared/maps/isle.ts) — в самый конец.
  ...ISLE_FISH_SPOTS,
];
/** Номер в FISH_SPOTS первого места на моле острова */
export const FISH_ISLE_FIRST = FISH_SPOTS.length - ISLE_FISH_SPOTS.length;
/** Номер в FISH_SPOTS первого места на дальних мостках */
export const FISH_FAR_FIRST = FISH_ISLAND_COUNT + BARKAS_FISH_FIRST;
/** Номер в FISH_SPOTS i-го места баркаса (BARKAS_FISH_SPOTS): первые восемь — подряд за островом, остальные — в конце */
export function barkasSpotIndex(i: number): number {
  return i < BARKAS_FISH_FIRST ? FISH_ISLAND_COUNT + i : FISH_FAR_FIRST + FISH_FAR_SPOTS.length + (i - BARKAS_FISH_FIRST);
}

/** Пристань или баркас: место рыбалки по номеру. */
export function spotZone(spot: number): FishZone {
  return FISH_SPOTS[spot]?.zone ?? 'pier';
}
/** То же имя, что в ветке barkas */
export const fishZone = spotZone;

/** Дед Семён — на крыльце своего дома на конце пирса (правее двери), смотрит на север, на приходящих по мосткам. */
export const FISHER_NPC = { x: -17.55, y: 0, z: 59.05, yaw: 0 };
/** Посетитель стоит перед крыльцом и смотрит на юг, на Семёна. */
export const FISHER_USE = { x: -17.55, y: 0, z: 57.45, yaw: Math.PI, r: 1.7 };
export const FISHER_BODY: FishPlaceBox = { x0: -17.97, y0: 0, z0: 58.66, x1: -17.13, y1: 1.75, z1: 59.5 };

/**
 * Рыбаки-торговцы: Дед Семён на пристани и его младший брат Саня на баркасе — одни задания, лавка и скупка улова; смотритель
 * Игнат на острове «Последний свет» (флаг ISLE) — то же окно, в лавке только напитки и «На большую землю».
 */
export type FishNpcId = 'semyon' | 'sanya' | 'ignat';
export const FISH_NPCS: readonly FishNpcId[] = ['semyon', 'sanya', 'ignat'];
/**
 * Где стоит покупатель перед торговцем (arg точки 'fisher' — номер в FISH_NPCS): Семён — на пристани, Саня — у своего
 * прилавка на палубе баркаса (SANYA_USE, shared/barkas.ts).
 */
export const FISH_NPC_USE: Readonly<Record<FishNpcId, { x: number; y: number; z: number; yaw: number; r: number } | null>> = {
  semyon: FISHER_USE,
  sanya: SANYA_USE,
  ignat: ISLE_IGNAT_USE,
};

/**
 * Стол рулетки (флаг сервера ROULETTE): центр стола, куда смотрит крупье, радиус «у стола». На палубе баркаса под тентом
 * за рубкой (BARKAS_ROULETTE) — в дождь там сухо. Табло — к рубке (yaw π/2), игроки подходят со стороны кормы.
 */
export const ROULETTE_SPOT = { x: BARKAS_ROULETTE.x, y: BARKAS_DECK_Y, z: BARKAS_ROULETTE.z, yaw: Math.PI / 2, r: 2.6 } as const;

/** Слева при движении к маяку по южной стороне площади; памятник находится западнее мостков. */
export const FISH_BOARD = { x: -15, y: 0, z: 20.8, yaw: 0, w: 3.6, d: 0.16, h: 2.45, panelY: 0.8 };
export const FISH_BOARD_BODY: FishPlaceBox = { x0: -16.88, y0: 0.7, z0: 20.72, x1: -13.12, y1: 2.53, z1: 20.88 };
export const FISH_PODIUM = { x: -11, y: 0, z: 17.2, yaw: 0, w: 5.4, d: 1.4, h: 0.2 };
export const FISH_PODIUM_BODY: FishPlaceBox = { x0: -13.7, y0: 0, z0: 16.5, x1: -8.3, y1: 0.2, z1: 17.9 };
/** Display positions left to right: 4,2,1,3,5. Heights descend strictly by rank. */
export const FISH_PODIUM_STEPS = [
  { rank: 3, x: -2.12, h: 0.57 }, { rank: 1, x: -1.06, h: 0.95 },
  { rank: 0, x: 0, h: 1.14 }, { rank: 2, x: 1.06, h: 0.76 }, { rank: 4, x: 2.12, h: 0.38 },
] as const;
export const FISH_PODIUM_STEP_WIDTH = 0.98;
/** Прежний навес Семёна у маяка снят (Семён — у своего дома); опор больше нет. */
export const FISHER_CANOPY_POSTS: ReadonlyArray<{ x: number; z: number; r: number; h: number }> = [];

/** Пристройки встык к существующим мосткам / бетону; верх всех настилов — y=0. Дальние мостки и площадка дома — тоже здесь. */
export const FISH_DECKS: readonly FishPlaceBox[] = [
  { x0: -17, y0: -0.6, z0: 36, x1: -14, y1: 0, z1: 38 },
  FISH_PIER2,
  FISH_PIER_HEAD,
];

/** Небольшие швартовные тумбы только на внешних углах; проходы между настилами остаются открыты. */
export const FISH_MOORINGS: ReadonlyArray<{ x: number; z: number; r: number; h: number }> = [
  { x: -14.18, z: 36.18, r: 0.11, h: 0.72 }, { x: -14.18, z: 37.82, r: 0.11, h: 0.72 },
  // углы площадки у дома (северные — у выхода с мостков на площадку)
  { x: -25.25, z: 54.25, r: 0.11, h: 0.72 }, { x: -12.75, z: 54.25, r: 0.11, h: 0.72 },
];

/** Exact world-space bounds consumed by the lobby's gated FISH2 collision. */
export const FISH_PODIUM_STEP_BOXES: readonly FishPlaceBox[] = FISH_PODIUM_STEPS.map((s) => ({
  x0: FISH_PODIUM.x + s.x - FISH_PODIUM_STEP_WIDTH / 2, y0: FISH_PODIUM.h, z0: FISH_PODIUM.z - 0.64,
  x1: FISH_PODIUM.x + s.x + FISH_PODIUM_STEP_WIDTH / 2, y1: s.h, z1: FISH_PODIUM.z + 0.64,
}));
export const FISHER_CANOPY_BOXES: readonly FishPlaceBox[] = FISHER_CANOPY_POSTS.map((p) => ({
  x0: p.x - p.r, y0: 0, z0: p.z - p.r, x1: p.x + p.r, y1: p.h, z1: p.z + p.r,
}));
