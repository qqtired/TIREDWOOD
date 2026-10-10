// Оформление площади (plaza2, docs/plaza-redesign-2026-10-04.md): твёрдые предметы у входов. Общие для карты
// (shared/maps/lobby.ts: коллизия считается на сервере и в браузере одинаково) и для рисунка (client/lobby/plaza/*):
// позиции лежат в одном месте, чтобы видимое совпадало с твёрдым. Остальное оформление — над головой, на стенах,
// на земле и за линией зданий: коллизии у него нет.

/** Режим за флагом сервера, чьё оформление твёрдое: без флага режима его предметов нет — ни на экране, ни в карте */
export type PlazaSolidMode = 'hide' | 'regatta' | 'fight' | 'dungeon';

export interface PlazaSolid {
  /** Центр на земле */
  x: number;
  z: number;
  /** Половины сторон бокса и высота */
  hx: number;
  hz: number;
  h: number;
  /** Низ бокса над землёй (по умолчанию 0): верхний ящик в стопке стоит на нижних */
  y?: number;
  /** Режим за флагом, которому предмет принадлежит; нет — предмет всегда на месте */
  mode?: PlazaSolidMode;
}

const solid = (x: number, z: number, hx: number, hz = hx, h = 1): PlazaSolid => ({ x, z, hx, hz, h });
const forMode = <T extends PlazaSolid>(mode: PlazaSolidMode, list: readonly T[]): Array<T & { mode: PlazaSolidMode }> => list.map((s) => ({ ...s, mode }));

/** Бочки-мишени по бокам ворот пейнтбола (красная и синяя) */
export const PB_BARRELS: ReadonlyArray<PlazaSolid & { color: number }> = [
  { ...solid(-5.4, -14.5, 0.36, 0.36, 0.95), color: 0xd8412f },
  { ...solid(5.4, -14.5, 0.36, 0.36, 0.95), color: 0x2f6ad8 },
];

/** Стопки покрышек у гаража картинга (красно-белые, как на трассе) */
export const KART_TIRES: readonly PlazaSolid[] = [solid(15.7, -15.1, 0.46, 0.46, 0.84), solid(24.5, -15.2, 0.46, 0.46, 0.84)];

/**
 * «Рыбный двор» (прятки, круг (−4; 12,5)): арка-ворота с севера, сушилки с рыбой и бочка с жителем с юга, перевёрнутая
 * лодка слева и ящики справа от круга. Батуты — треугольником вокруг розы ветров, в стороне от арки (shared/maps/lobby.ts).
 */
export const YARD_GATE = { x: -4, z: 9.6, half: 2.6 } as const;
export const YARD_RACKS: ReadonlyArray<{ x: number; z: number }> = [{ x: -6.2, z: 14.75 }, { x: -1.8, z: 14.75 }];
export const YARD_BARREL = { x: -4, z: 16.7, r: 0.62, h: 1.0 } as const;
export const YARD_BOAT = { x: -8.1, z: 12.6, hx: 0.6, hz: 1.35, h: 0.6 } as const;
export const YARD_CRATES: ReadonlyArray<PlazaSolid & { y: number }> = [
  { ...solid(-0.55, 12.3, 0.45, 0.45, 0.9), y: 0 }, { ...solid(0.4, 12.3, 0.45, 0.45, 0.9), y: 0 }, { ...solid(-0.1, 12.3, 0.4, 0.4, 0.8), y: 0.9 },
];

/** Две стойки арки «Рыбный двор» и ножки сушилок */
const YARD_SOLIDS: PlazaSolid[] = [
  solid(YARD_GATE.x - YARD_GATE.half, YARD_GATE.z, 0.17, 0.17, 3.4),
  solid(YARD_GATE.x + YARD_GATE.half, YARD_GATE.z, 0.17, 0.17, 3.4),
  ...YARD_RACKS.flatMap((r) => [solid(r.x - 0.95, r.z, 0.07, 0.07, 1.7), solid(r.x + 0.95, r.z, 0.07, 0.07, 1.7)]),
  solid(YARD_BARREL.x, YARD_BARREL.z, YARD_BARREL.r, YARD_BARREL.r, YARD_BARREL.h),
  solid(YARD_BOAT.x, YARD_BOAT.z, YARD_BOAT.hx, YARD_BOAT.hz, YARD_BOAT.h),
];

/**
 * Регата (круг (16; 18)): две спортивные лодки у стенки на воде (декор без коллизии: на воде не стоять; пираты и «Ласточка»
 * не задеваются: шлюпки пиратов у x = 16 и 23, катер уходит южнее) и две мачты по краям площадки с вывеской на оттяжках.
 * Лодки — по оси x, носом на запад, к кругу. Мачты твёрдые и стоят вне путей пиратов (shared/pirates.ts: выходы с причалов
 * (16; 21) и (23; 21), пушки, кучи).
 */
export const REGATTA_BOATS: ReadonlyArray<{ x: number; z: number; hull: number; accent: number; num: number; ball?: number; ink?: string }> = [
  { x: 19.9, z: 23.55, hull: 0xd9372b, accent: 0xf4f1e8, num: 7 },
  // второй катер: бирюзовый с белым корпусом-рубкой и оранжевой полосой (был сине-жёлтый); ball — шарик на флагштоке, ink — цвет цифр номера
  { x: 27.1, z: 23.4, hull: 0x14a094, accent: 0xff8a2b, num: 12, ball: 0xff8a2b, ink: '#0d5a52' },
];
/** Размеры лодки (длина, ширина, высота до палубы), м — для рисунка */
export const REGATTA_BOAT_SIZE = { len: 4.7, beam: 1.9, h: 1.0 } as const;
export const REGATTA_MASTS: ReadonlyArray<{ x: number; z: number }> = [{ x: 12.9, z: 21.3 }, { x: 19.4, z: 21.3 }];

/**
 * Катер «Ласточка» (на воде у причала (8; 23,4)): портал-вывеска над местом посадки на краю набережной — две стойки.
 */
export const BOAT_GATE = { x0: 4.9, x1: 10.9, z: 21.3 } as const;

/**
 * Fight Club (круг мелом у приямка в южной стене кафе): латунные столбики с красным канатом перед проёмом — «клуб
 * по записи». Вывеска-кронштейн и красный фонарь — над головой, коврик — на земле, без коллизии.
 */
export const FIGHT_POSTS: readonly PlazaSolid[] = [solid(27.15, 4.42, 0.07, 0.07, 0.95), solid(29.05, 4.42, 0.07, 0.07, 0.95)];

/**
 * «Подземелье» (режим за флагом DUNGEON, западная лужайка): скала с пещерой и доска рекордов (client/lobby/plaza/dungeon.ts).
 * Скала — овал 5,6 × 5,4 м с центром в (−18,4; 11,6), зев смотрит на точку появления (yaw модели = π + yaw из
 * docs/survivors/level.md §8, −1,275). Доска — на двух столбиках в 5 м к юго-востоку от зева, лицом на север, к тропе
 * «точка появления → аквапарк»: с тропы и от зева она читается под умеренным углом. Стоит вдоль оси x, чтобы коллизия была
 * ровной, без «невидимых стен» по углам.
 * Скала — три бокса без пересечений (основной до 3,8 м и два выступа до 3,0 м): рисунок скалы они покрывают с запасом
 * до 0,5 м, ступени у порога и рельсы вне боксов — там можно стоять (точка «E» у зева). Доска — два столбика и плита.
 */
export const DUNGEON_ROCK = { x: -18.4, z: 11.6, yaw: Math.PI - 1.275 } as const;
export const DUNGEON_BOARD = { x: -11, z: 14.3, yaw: Math.PI } as const;
const DUNGEON_SOLIDS: readonly PlazaSolid[] = [
  solid(-18.4, 11.4, 3.2, 2.4, 3.8),
  solid(-18.0, 8.6, 1.8, 0.4, 3.0),
  solid(-18.5, 14.2, 2.1, 0.4, 3.0),
  // доска: два столбика (±1,21 м от центра вдоль x, основания 0,5 м) и плита между ними от 1 до 3 м — под ней голова (1,6 м) не пролезет
  solid(DUNGEON_BOARD.x - 1.21, DUNGEON_BOARD.z + 0.06, 0.26, 0.3, 3.2),
  solid(DUNGEON_BOARD.x + 1.21, DUNGEON_BOARD.z + 0.06, 0.26, 0.3, 3.2),
  { ...solid(DUNGEON_BOARD.x, DUNGEON_BOARD.z + 0.06, 0.94, 0.3, 2.0), y: 1.0 },
];

/** Указатель «Куда идти» у звезды (центр (0; 3,6)): столб на основании, стрелки — над головой */
export const SIGNPOST = { x: -3.8, z: 1.4, h: 3.4 } as const;

/** Все твёрдые предметы оформления в порядке добавления в карту (новые — только в конец) */
export function plazaSolids(): PlazaSolid[] {
  return [
    ...PB_BARRELS, ...KART_TIRES, ...forMode('hide', YARD_SOLIDS),
    ...forMode('hide', YARD_CRATES),
    ...forMode('regatta', REGATTA_MASTS.map((m) => solid(m.x, m.z, 0.17, 0.17, 3.2))),
    solid(BOAT_GATE.x0, BOAT_GATE.z, 0.13, 0.13, 3.6), solid(BOAT_GATE.x1, BOAT_GATE.z, 0.13, 0.13, 3.6),
    ...forMode('fight', FIGHT_POSTS),
    solid(SIGNPOST.x, SIGNPOST.z, 0.12, 0.12, SIGNPOST.h),
    ...forMode('dungeon', DUNGEON_SOLIDS),
  ];
}
