// Плавный переход между комнатами: клиент грузит новый мир за экраном загрузки и пишет «готов»,
// сервер держит отсчёт перед стартом раунда, пока грузятся все (не дольше LOAD_WAIT_TICKS).
import { TICK_RATE } from './constants.ts';

/** Сколько сервер ждёт загрузки одного игрока, прежде чем начать без него */
export const LOAD_WAIT_TICKS = 8 * TICK_RATE;
/** За сколько до старта раунда сервер шлёт `go` — крупный отсчёт 3-2-1 */
export const GO_TICKS = 3 * TICK_RATE;
/** Клиент: столько ждём готовности нового мира, потом — сообщение и назад на набережную */
export const LOAD_GIVEUP_MS = 15_000;

/** Кто заходит в комнату вместе с тобой: ник и загрузился ли */
export interface LoadWho {
  nick: string;
  ok: boolean;
}

export type LoadServerMsg =
  /** Кто заходит и грузится; wait — сколько секунд ещё ждём (0 — дождались или больше не ждём) */
  | { t: 'load'; who: LoadWho[]; wait: number }
  /** До старта раунда ms миллисекунд — крупный отсчёт */
  | { t: 'go'; ms: number };

/** Новый мир отрисован; e — номер перехода из письма `scene` */
export type LoadClientMsg = { t: 'ready'; e: number };

/** Отсчёт перед стартом раунда, который можно придержать: решётка, вступление, сбор, разминка */
export interface Prestart {
  phaseEnd: number;
}

/** Игрок ещё грузится: не прислал «готов» и не вышел срок ожидания. */
export function stillLoading(ok: boolean, arrivedTick: number, tick: number): boolean {
  return !ok && tick - arrivedTick < LOAD_WAIT_TICKS;
}
