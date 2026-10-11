// Аркада новой набережной: какие игры в каких корпусах, проверка журнала ввода и переигровка партии (её делает сервер).
import * as castle from './castle.ts';
import { ARC_MAX_TICKS, HZ, replayRun, type ArcGameId, type ArcMeta, type ArcSimBase } from './kit.ts';
import * as tir from './tir.ts';
import * as train from './train.ts';

export interface ArcGameDef {
  meta: ArcMeta;
  makeSim: (seed: number) => ArcSimBase;
  /** Событие журнала в границах игры (тип, a, b) */
  validEvent: (type: number, a: number, b: number) => boolean;
}

export const ARC_GAMES: Record<ArcGameId, ArcGameDef> = {
  train: { meta: train.meta, makeSim: train.makeSim, validEvent: train.validEvent },
  tir: { meta: tir.meta, makeSim: tir.makeSim, validEvent: tir.validEvent },
  castle: { meta: castle.meta, makeSim: castle.makeSim, validEvent: castle.validEvent },
};

export const ARC_GAME_IDS: readonly ArcGameId[] = ['train', 'tir', 'castle'];

/** Решение владельца 2а (11.10): 6 корпусов, по два на игру, рядом — друзья соревнуются за соседними автоматами */
export const ARC_CABS = 6;
export function arcGameOfCab(cab: number): ArcGameId {
  return ARC_GAME_IDS[Math.floor(cab / 2) % ARC_GAME_IDS.length];
}

/** Не больше событий в журнале: в среднем два за тик (мышь в «Замке» — одно за кадр) и запас на клавиши */
export const arcMaxEvents = (ticks: number): number => ticks * 2 + 600;
/** Не больше событий в одном тике */
export const ARC_EVENTS_PER_TICK = 6;

/**
 * Журнал партии: целые [тик, тип, a, b] по неубыванию тика, тики в [0, ticks), события в границах игры, не больше
 * ARC_EVENTS_PER_TICK за тик и arcMaxEvents всего. null — всё в порядке, иначе — что не так (для журнала сервера).
 */
export function checkArcLog(game: ArcGameId, log: unknown, ticks: number): string | null {
  const def = ARC_GAMES[game];
  if (!def) return 'нет такой игры';
  if (!Number.isSafeInteger(ticks) || ticks < 0 || ticks > ARC_MAX_TICKS) return 'длина партии вне границ';
  if (!Array.isArray(log)) return 'журнал не массив';
  if (log.length > arcMaxEvents(ticks)) return 'слишком много событий';
  let prev = 0;
  let same = 0;
  for (const row of log) {
    if (!Array.isArray(row) || row.length !== 4 || !row.every((v) => Number.isSafeInteger(v))) return 'строка журнала не из четырёх целых';
    const [t, type, a, b] = row as number[];
    if (t < prev || t >= Math.max(1, ticks)) return 'тик вне порядка или границ';
    same = t === prev ? same + 1 : 1;
    if (same > ARC_EVENTS_PER_TICK) return 'слишком много событий в тике';
    prev = t;
    if (!def.validEvent(type, a, b)) return 'событие вне границ игры';
  }
  return null;
}

/** Переиграть партию по журналу на сервере: счёт сервера — единственный, который записывается */
export function replayArc(game: ArcGameId, seed: number, log: readonly (readonly number[])[], ticks: number): { score: number; ticks: number; over: boolean } {
  return replayRun(ARC_GAMES[game].makeSim, seed, log, ticks);
}

/** Сколько реального времени минимум занимает партия из ticks тиков, мс (минус 2 с на дрожание сети и таймеров) */
export const arcMinMs = (ticks: number): number => (ticks / HZ - 2) * 1000;
/** Пауз в партии в сумме не больше, мс */
export const ARC_PAUSE_MS = 5 * 60_000;
