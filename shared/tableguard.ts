// Столы набережной — не подиум. Над столешницами дурака и блэкджека (терраса кафе «Чайка») и бильярда стоят невидимые
// «колпаки» — высокие боксы ровно по столешнице. Сбоку колпак держит как стена (на стол не запрыгнуть, не взойти
// ступенькой, не заскочить рывком), а сверху на него не попасть: над кафе он выше вершины прыжка с батута, у бильярда —
// до самой крыши навеса. Стулья, места у бильярда и проходы — как были: колпак не шире столешницы и начинается с её крышки.
// Невидимые боксы и так пропускают камера, выстрелы пиратов, дождь и запекание теней; мяч от колпака просто отскакивает.
// Карта общая (shared/maps/lobby.ts) — сервер и предсказание клиента считают по одним боксам.
import { BL_HALL, BL_OUT_HX, BL_OUT_HZ, BL_SURFACE_Y, BL_TABLES } from './billiards.ts';
import { GRAVITY, TRAMPOLINE_VELOCITY } from './constants.ts';

/** Столик кафе в коллизии: квадрат 1,1 × 1,1 м, крышка на высоте 0,75 м (бокс стола в shared/maps/lobby.ts) */
export const CAFE_TABLE_HALF = 0.55;
export const CAFE_TABLE_TOP = 0.75;
/** Верх бильярдного стола в коллизии (борта чуть выше сукна) */
export const BILLIARDS_TABLE_TOP = BL_SURFACE_Y + 0.04;
/** Батут набережной: верх и вершина прыжка с него (0,42 + 16,8² / 48 ≈ 6,3 м) */
const TRAMPOLINE_TOP = 0.42;
export const TRAMPOLINE_APEX = TRAMPOLINE_TOP + (TRAMPOLINE_VELOCITY * TRAMPOLINE_VELOCITY) / (2 * GRAVITY);
/** Верх колпака над столиком кафе: выше любого прыжка с батута — сверху на колпак не опуститься */
export const CAFE_GUARD_TOP = 8;

export interface GuardBox {
  min: [number, number, number];
  max: [number, number, number];
}

/** Колпаки над столиками кафе (дурак и блэкджек): от крышки до CAFE_GUARD_TOP. */
export function cafeTableGuards(tables: ReadonlyArray<{ readonly x: number; readonly z: number }>): GuardBox[] {
  const h = CAFE_TABLE_HALF;
  return tables.map((t) => ({ min: [t.x - h, CAFE_TABLE_TOP, t.z - h], max: [t.x + h, CAFE_GUARD_TOP, t.z + h] }));
}

/** Колпаки над бильярдными столами (флаг BILLIARDS, вместе с остальной коллизией зала): от бортов до крыши навеса. */
export function billiardsTableGuards(): GuardBox[] {
  return BL_TABLES.map((t) => ({
    min: [t.x - BL_OUT_HX, BILLIARDS_TABLE_TOP, t.z - BL_OUT_HZ],
    max: [t.x + BL_OUT_HX, BL_HALL.eaveY, t.z + BL_OUT_HZ],
  }));
}
