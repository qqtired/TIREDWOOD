// Общие координаты рыбацкого причала: серверная коллизия и клиентская сцена используют один настил.
// X — восток, Z — юг; yaw=0 — север. Старые шесть мест идут первыми: их arg и interaction ID не меняются.
import { BARKAS_DECK_Y, BARKAS_FISH_FIRST, BARKAS_FISH_SPOTS, BARKAS_ROULETTE, SANYA_USE } from './barkas.ts';
import { ISLE_FISH_SPOTS, ISLE_IGNAT_USE } from './maps/isle.ts';
import { pick } from './layout.ts';
import { MOLE_DECK_Y, PORT } from './plaza3/port.ts';
import { A, xfBox2, xfP } from './plaza3/xf.ts';

export interface FishPlaceBox {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  /** Материал и цвет бокса настила на карте (по умолчанию дерево: мол и голова plaza3 — камень) */
  mat?: 'wood' | 'concrete';
  color?: number;
}

/**
 * Где место рыбалки: пристань (по умолчанию), баркас в море — свой пул рыб, ×1,25 и злее рыба, или воды острова «Последний свет»
 * (флаг ISLE, shared/fishisle.ts) — 20 своих видов, рыба ещё злее (shared/fishrules.ts).
 */
export type FishZone = 'pier' | 'barkas' | 'isle';

export interface FishSpot {
  x: number;
  z: number;
  yaw: number;
  /** По умолчанию 'pier' */
  zone?: FishZone;
  /** Высота, на которой стоит рыбак; по умолчанию 0 (настил). Места на Маячном моле plaza3 — на y −0,5 */
  y?: number;
  /** Эхолот своей лодки (shared/fishboat.ts): ожидание поклёвки короче на эту долю */
  sonar?: number;
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
export interface FishHouse {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly wall: number;
  readonly ridge: number;
  readonly porch: number;
  /** Где дверь на стене с крыльцом: у старого дома x (крыльцо на север), у Лавки Семёна plaza3 — z (крыльцо на запад) */
  readonly door: number;
}
const FISH_HOUSE2: FishHouse = { x0: -22, x1: -16, z0: 59.6, z1: 64, wall: 2.6, ridge: 4.25, porch: 1.2, door: -20.2 };
/**
 * plaza3: Лавка Семёна на берегу у корня мостков (раскладка v5.1, порт B): сруб 4,4 × 5,4 м, конёк 4,25 м, крыльцо на запад.
 * Старый дом на голове пирса там не строится (client/lobby/fishhouse.ts).
 */
export const FISH_HOUSE: FishHouse = pick(FISH_HOUSE2, () => ({ ...PORT.semyon.house, wall: 2.6, ridge: 4.25, porch: 1.2, door: PORT.semyon.npc.z }));
const FISH_HOUSE_BOXES2: readonly FishPlaceBox[] = [
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
/** plaza3: один бокс сруба (на карте виден деревянной коробкой, пока нет модели pav_semyon.glb) */
export const FISH_HOUSE_BOXES: readonly FishPlaceBox[] = pick(FISH_HOUSE_BOXES2, () => [
  { x0: FISH_HOUSE.x0, y0: 0, z0: FISH_HOUSE.z0, x1: FISH_HOUSE.x1, y1: FISH_HOUSE.wall, z1: FISH_HOUSE.z1, mat: 'wood', color: 0xc79d6c },
]);
/** Места рыбалки на дальних мостках и на площадке у дома: только в конец FISH_SPOTS (после баркаса), зона — пристань */
const FISH_FAR_SPOTS2: ReadonlyArray<FishSpot> = [
  // мостки 3 м: западные и восточные места вразбежку — с сидящими рыбаками проход остаётся
  { x: -18.05, z: 47.0, yaw: -Math.PI / 2 }, { x: -19.95, z: 48.5, yaw: Math.PI / 2 },
  { x: -18.05, z: 50.5, yaw: -Math.PI / 2 }, { x: -19.95, z: 52.5, yaw: Math.PI / 2 },
  // площадка у дома: по два места на западном и восточном краю; второе западное — в юго-западном углу у бочек,
  // заброс на юг: на западном краю у дома — причал «Удалой» (shared/ferry.ts)
  { x: -24.95, z: 56.2, yaw: Math.PI / 2 }, { x: -23.65, z: 63.45, yaw: Math.PI },
  { x: -13.05, z: 56.2, yaw: -Math.PI / 2 }, { x: -13.05, z: 61.2, yaw: -Math.PI / 2 },
];
/**
 * plaza3 (порт B «Маячный мол»): те же 8 номеров, но на новом молу — 0–1 на южной кромке головы, 2–7 на южной кромке мола
 * через 3 м, заброс на юг, в открытую воду; рыбак стоит на камне, y −0,5.
 */
export const FISH_FAR_SPOTS: ReadonlyArray<FishSpot> = pick(FISH_FAR_SPOTS2, () => PORT.farSpots.map((s) => ({ x: s.x, z: s.z, yaw: Math.PI, y: MOLE_DECK_Y })));
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

/**
 * Места рыбалки в своих лодках на якоре (флаг ISLE, shared/ownboat.ts): по 3 на лодку (до 16 лодок), номера — сразу
 * за FISH_SPOTS: первое + номер лодки × 3 + место. Где они и куда заброс, ставит лодка, когда бросает якорь (сервер и
 * клиент одинаково, по её позе); пул — баркас (у острова — по точке, shared/fishisle.ts — fishZoneAtSea).
 */
export const BOAT_FISH_FIRST = FISH_SPOTS.length;
export const BOAT_FISH_SPOTS: FishSpot[] = Array.from({ length: 16 * 3 }, () => ({ x: 0, z: 0, yaw: 0, zone: 'barkas' as const }));
/** Всего мест рыбалки: на причалах и баркасе, потом в лодках */
export const FISH_SPOT_COUNT = BOAT_FISH_FIRST + BOAT_FISH_SPOTS.length;

/** Место рыбалки по номеру: на причалах и баркасе или в лодке на якоре */
export function fishSpotAt(spot: number): FishSpot | undefined {
  return spot < BOAT_FISH_FIRST ? FISH_SPOTS[spot] : BOAT_FISH_SPOTS[spot - BOAT_FISH_FIRST];
}

/** Место в своей лодке: номер лодки и место в ней (или null) */
export function boatSpotOf(spot: number): { boat: number; seat: number } | null {
  const i = spot - BOAT_FISH_FIRST;
  return Number.isInteger(i) && i >= 0 && i < BOAT_FISH_SPOTS.length ? { boat: Math.floor(i / 3), seat: i % 3 } : null;
}

/** Пристань или баркас: место рыбалки по номеру. */
export function spotZone(spot: number): FishZone {
  return fishSpotAt(spot)?.zone ?? 'pier';
}
/** То же имя, что в ветке barkas */
export const fishZone = spotZone;

/** Дед Семён — на крыльце своего дома на конце пирса (правее двери), смотрит на север, на приходящих по мосткам. */
export const FISHER_NPC = pick({ x: -17.55, y: 0, z: 59.05, yaw: 0 }, () => ({ x: PORT.semyon.npc.x, y: 0, z: PORT.semyon.npc.z, yaw: PORT.semyon.npc.yaw }));
/** Посетитель стоит перед крыльцом и смотрит на юг, на Семёна. */
export const FISHER_USE = pick({ x: -17.55, y: 0, z: 57.45, yaw: Math.PI, r: 1.7 }, () => ({ ...PORT.semyon.use, y: 0 }));
export const FISHER_BODY: FishPlaceBox = pick({ x0: -17.97, y0: 0, z0: 58.66, x1: -17.13, y1: 1.75, z1: 59.5 }, () => ({
  x0: FISHER_NPC.x - 0.42, y0: 0, z0: FISHER_NPC.z - 0.42, x1: FISHER_NPC.x + 0.42, y1: 1.75, z1: FISHER_NPC.z + 0.42,
}));

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
const FISH_BOARD2 = { x: -15, y: 0, z: 20.8, yaw: 0, w: 3.6, d: 0.16, h: 2.45, panelY: 0.8 };
/**
 * plaza3: доска «Рекорды рыбаков» — над прилавком Рыбной витрины у её задней стены (якорь fishBoard, сдвиг (3; 0,565)):
 * центр (−12; 21,365), ширина и высота холста те же, поле выше — w 3,6, верх h 4,14, низ panelY 2,49 (раскладка v5.1)
 */
export const FISH_BOARD = pick(FISH_BOARD2, () => ({ ...xfP(A.fishBoard, FISH_BOARD2), w: PORT.showcase.board.w, h: PORT.showcase.board.h, panelY: PORT.showcase.board.panelY }));
const FISH_BOARD_BODY2: FishPlaceBox = { x0: -16.88, y0: 0.7, z0: 20.72, x1: -13.12, y1: 2.53, z1: 20.88 };
export const FISH_BOARD_BODY: FishPlaceBox = pick(FISH_BOARD_BODY2, () => ({ ...xfBox2(A.fishBoard, FISH_BOARD_BODY2), y0: FISH_BOARD.panelY - 0.1, y1: FISH_BOARD.h + 0.08 }));
const FISH_PODIUM2 = { x: -11, y: 0, z: 17.2, yaw: 0, w: 5.4, d: 1.4, h: 0.2 };
/** plaza3: прилавок Рыбной витрины — центр (−12; 19,3), поворота нет (якорь fishPodium, сдвиг (−1; 2,1)) */
export const FISH_PODIUM = pick(FISH_PODIUM2, () => xfP(A.fishPodium, FISH_PODIUM2));
const FISH_PODIUM_BODY2: FishPlaceBox = { x0: -13.7, y0: 0, z0: 16.5, x1: -8.3, y1: 0.2, z1: 17.9 };
export const FISH_PODIUM_BODY: FishPlaceBox = pick(FISH_PODIUM_BODY2, () => xfBox2(A.fishPodium, FISH_PODIUM_BODY2));
/** Display positions left to right: 4,2,1,3,5. Heights descend strictly by rank. */
export const FISH_PODIUM_STEPS = [
  { rank: 3, x: -2.12, h: 0.57 }, { rank: 1, x: -1.06, h: 0.95 },
  { rank: 0, x: 0, h: 1.14 }, { rank: 2, x: 1.06, h: 0.76 }, { rank: 4, x: 2.12, h: 0.38 },
] as const;
export const FISH_PODIUM_STEP_WIDTH = 0.98;
/** Прежний навес Семёна у маяка снят (Семён — у своего дома); опор больше нет. */
export const FISHER_CANOPY_POSTS: ReadonlyArray<{ x: number; z: number; r: number; h: number }> = [];

/** Пристройки встык к существующим мосткам / бетону; верх всех настилов — y=0. Дальние мостки и площадка дома — тоже здесь. */
const FISH_DECKS2: readonly FishPlaceBox[] = [
  { x0: -17, y0: -0.6, z0: 36, x1: -14, y1: 0, z1: 38 },
  FISH_PIER2,
  FISH_PIER_HEAD,
];
/**
 * plaza3 (порт B): дальние мостки и голова пирса с домом убраны; вместо них Маячный мол (камень), голова мола (камень) и
 * сходни к стоянке лодок (дерево), верх y −0,5, и ступень с площадки маяка на мол (на 0,25 м выше мола). Мостки к маяку,
 * площадка маяка и обвязка у них — те же.
 */
export const FISH_DECKS: readonly FishPlaceBox[] = pick(FISH_DECKS2, () => [
  FISH_DECKS2[0],
  ...PORT.decks.map((d): FishPlaceBox => ({
    x0: d.box[0], y0: d.y - 0.6, z0: d.box[1], x1: d.box[2], y1: d.y, z1: d.box[3],
    mat: d.kind === 'stone' ? 'concrete' : 'wood', color: d.kind === 'stone' ? 0xb9b3a6 : 0x8a6a4a,
  })),
  { x0: PORT.stair.box[0], y0: MOLE_DECK_Y, z0: PORT.stair.box[1], x1: PORT.stair.box[2], y1: PORT.stair.y, z1: PORT.stair.box[3], mat: 'concrete', color: 0xb9b3a6 },
]);

/** Небольшие швартовные тумбы только на внешних углах; проходы между настилами остаются открыты. */
const FISH_MOORINGS2: ReadonlyArray<{ x: number; z: number; r: number; h: number }> = [
  { x: -14.18, z: 36.18, r: 0.11, h: 0.72 }, { x: -14.18, z: 37.82, r: 0.11, h: 0.72 },
  // углы площадки у дома (северные — у выхода с мостков на площадку)
  { x: -25.25, z: 54.25, r: 0.11, h: 0.72 }, { x: -12.75, z: 54.25, r: 0.11, h: 0.72 },
];
/** plaza3: тумбы на углах площадки у дома убраны вместе с ней; остались две у стыка мостков с площадкой маяка */
export const FISH_MOORINGS: ReadonlyArray<{ x: number; z: number; r: number; h: number }> = pick(FISH_MOORINGS2, () => FISH_MOORINGS2.slice(0, 2));

/** Exact world-space bounds consumed by the lobby's gated FISH2 collision. */
export const FISH_PODIUM_STEP_BOXES: readonly FishPlaceBox[] = FISH_PODIUM_STEPS.map((s) => ({
  x0: FISH_PODIUM.x + s.x - FISH_PODIUM_STEP_WIDTH / 2, y0: FISH_PODIUM.h, z0: FISH_PODIUM.z - 0.64,
  x1: FISH_PODIUM.x + s.x + FISH_PODIUM_STEP_WIDTH / 2, y1: s.h, z1: FISH_PODIUM.z + 0.64,
}));
export const FISHER_CANOPY_BOXES: readonly FishPlaceBox[] = FISHER_CANOPY_POSTS.map((p) => ({
  x0: p.x - p.r, y0: 0, z0: p.z - p.r, x1: p.x + p.r, y1: p.h, z1: p.z + p.r,
}));
