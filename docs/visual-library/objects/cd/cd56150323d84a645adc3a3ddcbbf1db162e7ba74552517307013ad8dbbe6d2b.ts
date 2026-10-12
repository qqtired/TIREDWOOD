// «Press F to pay respects» у статуи на набережной: где можно, сколько длится, куда смотреть. Общее для сервера
// и клиента (подсказка). Координаты статуи только читаем — её файлы не трогаем.
import { TICK_RATE } from './constants.ts';
import { STATUE } from './maps/lobby.ts';

/** Где стоит статуя (к ней поворачиваются, отдавая честь) */
export const STATUE_AT: { readonly x: number; readonly z: number } = { x: STATUE.x, z: STATUE.z };
/** Сколько желейка отдаёт честь, тиков (5 с); шаг прерывает, как любую эмоцию */
export const RESPECT_TICKS = 5 * TICK_RATE;
/** Дальше 7 м от статуи подсказки нет и сервер не примет */
export const RESPECT_RANGE = 7;
/** Счётчик «RESPECTS PAID» растёт от одного игрока не чаще раза в 10 с */
export const RESPECT_COUNT_MS = 10_000;

/** Можно ли отдать честь, стоя в (x, y, z): ближе 7 м к статуе и на земле, а не в прыжке над ней. */
export function respectReach(x: number, y: number, z: number): boolean {
  return Math.hypot(x - STATUE.x, z - STATUE.z) <= RESPECT_RANGE && Math.abs(y) < 1.5;
}
