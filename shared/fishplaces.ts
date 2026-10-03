// Общие координаты рыбацкого причала: серверная коллизия и клиентская сцена используют один настил.
// X — восток, Z — юг; yaw=0 — север. Старые шесть мест идут первыми: их arg и interaction ID не меняются.
export interface FishPlaceBox {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}

export const FISH_PIER_COUNT = 8;
export const FISH_LIGHTHOUSE_COUNT = 4;
export const FISH_SPOTS: ReadonlyArray<{ x: number; z: number; yaw: number }> = [
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
];

/** Рыбак стоит точно на прежнем месте доски, смотрит на приходящих с площади. */
export const FISHER_NPC = { x: -15.5, y: 0, z: 37.72, yaw: 0 };
/** Посетитель стоит перед рыбаком и смотрит на юг. Полностью поддерживается новым настилом. */
export const FISHER_USE = { x: -15.5, y: 0, z: 36.5, yaw: Math.PI, r: 1.7 };
export const FISHER_BODY: FishPlaceBox = { x0: -15.92, y0: 0, z0: 37.3, x1: -15.08, y1: 1.6, z1: 38.14 };

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
/** Back posts leave the entire northern approach to Semen open. */
export const FISHER_CANOPY_POSTS = [-1.12, 1.12].map((dx) => ({
  x: FISHER_NPC.x + dx, z: FISHER_NPC.z + 0.12, r: 0.055, h: 2.45,
}));

/** Пристройки встык к существующим мосткам / бетону; верх всех настилов — y=0. */
export const FISH_DECKS: readonly FishPlaceBox[] = [
  { x0: -17, y0: -0.6, z0: 36, x1: -14, y1: 0, z1: 38 },
];

/** Небольшие швартовные тумбы только на внешних углах; проходы между настилами остаются открыты. */
export const FISH_MOORINGS: ReadonlyArray<{ x: number; z: number; r: number; h: number }> = [
  { x: -14.18, z: 36.18, r: 0.11, h: 0.72 }, { x: -14.18, z: 37.82, r: 0.11, h: 0.72 },
];

/** Exact world-space bounds consumed by the lobby's gated FISH2 collision. */
export const FISH_PODIUM_STEP_BOXES: readonly FishPlaceBox[] = FISH_PODIUM_STEPS.map((s) => ({
  x0: FISH_PODIUM.x + s.x - FISH_PODIUM_STEP_WIDTH / 2, y0: FISH_PODIUM.h, z0: FISH_PODIUM.z - 0.64,
  x1: FISH_PODIUM.x + s.x + FISH_PODIUM_STEP_WIDTH / 2, y1: s.h, z1: FISH_PODIUM.z + 0.64,
}));
export const FISHER_CANOPY_BOXES: readonly FishPlaceBox[] = FISHER_CANOPY_POSTS.map((p) => ({
  x0: p.x - p.r, y0: 0, z0: p.z - p.r, x1: p.x + p.r, y1: p.h, z1: p.z + p.r,
}));
