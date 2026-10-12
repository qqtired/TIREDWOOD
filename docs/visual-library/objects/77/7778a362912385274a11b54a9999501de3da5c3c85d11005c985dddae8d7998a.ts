// Прятки 2.0 «Рыбный двор»: правила, числа и сообщения. Все числа баланса — здесь, в одном месте.
// Матч: сбор → 3 раунда (подготовка → поиск → итоги) → подиум → новый матч, если осталось хотя бы двое.
import type { Outfit } from './outfit.ts';
import type { PlayerState } from './sim.ts';
import type { HideKind } from './hideprops.ts';

export const HIDE_CAPACITY = 8, HIDE_MIN = 2, HIDE_ROUNDS = 3;
/** Тики (60 в секунду): сбор (ожидание перед стартом — к нему подключается общая загрузка), подготовка 25 с,
 *  поиск 100 с (было 150 — владелец: «слишком много времени»), из них финал 30 с, итоги 8 с, подиум 10 с */
export const HIDE_COUNT_TICKS = 300, HIDE_PREP_TICKS = 1500, HIDE_SEEK_TICKS = 6000, HIDE_FINAL_TICKS = 1800, HIDE_RESULT_TICKS = 480, HIDE_PODIUM_TICKS = 600;
/** Окно возврата после обрыва связи; через сколько пойманный выходит ищущим */
export const HIDE_REJOIN_TICKS = 600, HIDE_RESPAWN_TICKS = 180;
/** Ищущих на старте раунда: 1 при 2–4 игроках, 2 при 5–8 */
export function hideHunterCount(players: number): number { return players >= 5 ? 2 : 1; }

/** Краска ищущего: промах по пустому предмету дорогой, по стене дешевле, попадание возвращает краску. */
export const PAINT = {
  max: 100, decor: 20, world: 5, hit: 30,
  /** в секунду, если не стрелять regenDelay тиков */
  regen: 2, regenDelay: 120,
  /** на нуле стрелять нельзя, пока не наберётся unjam */
  unjam: 20,
  /** с чем выходит пойманный (заражённый) ищущий */
  infected: 60,
} as const;
export const HIDE_SHOT_TICKS = 24, HIDE_SHOT_RANGE = 42;
/** Компенсация задержки: откат поз прячущихся не дальше 24 тиков (0,4 с), как MAX_REWIND_TICKS пейнтбола */
export const HIDE_MAX_REWIND = 24, HIDE_HISTORY_TICKS = 32;
/** Превращение: дальность (м), перезарядка в поиске и в подготовке */
export const HIDE_TAKE_RANGE = 6, HIDE_TAKE_TICKS = 300, HIDE_TAKE_PREP_TICKS = 60;
/** Насмешки. Обязательная — раз в 30 с (в финале раз в 10 с, первая — в случайный момент 10–30 с): предмет лишь чуть
 *  вздрагивает, без звука и нот — заметит только тот, кто смотрит прямо на него. Своя (Z) — не чаще 15 с: тихий звук
 *  из тайника и та же дрожь, очки за дерзость рядом с ищущим. */
export const TAUNT = { every: 1800, final: 600, firstMin: 600, firstMax: 1800, cd: 900, cap: 75, pts: [5, 15, 25], near: [12, 6], sounds: 8 } as const;
/** Очки: попадание, поимка, победа ищущих (каждому), дожил до конца; за секунду поиска — 1 (последнему — 2) */
export const PTS = { hit: 15, catch: 60, teamWin: 30, survive: 40 } as const;
/** Жетоны: очки ÷ 8 за раунд, не больше 30; за матч при трёх игроках и больше — 1-е место +10, 2-е +5 */
export const HIDE_TOKENS = { perPoints: 8, roundCap: 30, podium: [10, 5], minSeekTicks: 900 } as const;

export type HidePhase = 'gather' | 'hide' | 'seek' | 'result' | 'final';
/** caught — только что пойман, через 3 с выйдет ищущим; spectator — ждёт следующего раунда */
export type HideRole = 'hunter' | 'prop' | 'caught' | 'spectator';

export interface HideSelf {
  id: number; ack: number; reset: number; state: PlayerState; role: HideRole;
  kind: HideKind; prop: number; yaw: number; locked: boolean; hits: number;
  paint: number; jam: boolean;
  /** тики, с которых можно снова: превращаться, своя насмешка; когда будет обязательная; когда выйдет из сарая */
  takeAt: number; tauntCd: number; tauntAt: number; back: number;
}
/** Строка табло: роль буквой (h — ищет, p — прячется, c — пойман, s — ждёт) */
export interface HideRow { id: number; nick: string; role: 'h' | 'p' | 'c' | 's'; score: number; pts: number }
export interface HideRoundResult {
  winner: 'hunters' | 'props' | 'cancelled'; round: number; last: boolean;
  /** смешные итоги раунда */
  lines: string[];
  rows: { id: number; nick: string; pts: number; score: number; tokens: number }[];
}

/**
 * Снимок 10 Гц. p — все предметы двора и прячущиеся вперемешку, без признака «живой» (сортировка по случайному id):
 * [id, вид (номер в HIDE_KINDS), x·100, y·100, z·100, поворот 0…23, кляксы] × n.
 * h — ищущие: [id игрока, x·100, y·100, z·100, yaw·1000, pitch·1000] × n.
 */
/**
 * Снимок пряток. Предметы — дельтой: p — только изменившиеся с прошлого снимка этому игроку (по 7 чисел:
 * id, вид, x·100, y·100, z·100, шаг поворота, кляксы), gone — исчезнувшие id, full — сначала забыть все.
 * Предметы двора и прячущиеся в одном списке с случайными id: по данным их не различить.
 * h — ищущие по 6 чисел (id, x·100, y·100, z·100, yaw·1000, pitch·1000), всегда целиком.
 */
export interface HideStateMsg {
  t: 'hide_state'; tick: number; phase: HidePhase; phaseEnd: number; round: number; match: number;
  self: HideSelf; full: boolean; p: number[]; gone: number[]; h: number[]; left: number; total: number; notice: string;
  rows: HideRow[]; res: HideRoundResult | null; seekAt: number;
}
export type HideShotKind = 'air' | 'world' | 'decor' | 'prop';
export type HideEvent =
  | { k: 'shot'; id: number; by: number; from: [number, number, number]; to: [number, number, number]; n: [number, number, number]; hit: HideShotKind; prop: number; size: number }
  | { k: 'catch'; x: number; y: number; z: number; kind: HideKind; who: number; by: number; text: string }
  | { k: 'taunt'; x: number; y: number; z: number; s: number; loud: number }
  /** лёгкая дрожь предмета id (обязательная насмешка и своя) — ~0,4 с, без звука */
  | { k: 'wiggle'; id: number }
  | { k: 'puff'; x: number; y: number; z: number }
  | { k: 'feed'; text: string }
  | { k: 'pts'; n: number; why: string }
  /** личная подсказка: «Не помещается», «Ещё 3 с» */
  | { k: 'note'; text: string }
  | { k: 'door' } | { k: 'final' };
export interface HideEventMsg { t: 'hide_ev'; e: HideEvent[] }
export interface HideRosterMsg { t: 'hide_roster'; players: { id: number; nick: string; level: number; outfit: Outfit }[] }
export type HideServerMsg = HideStateMsg | HideEventMsg | HideRosterMsg;

export type HideClientMsg =
  | { t: 'hide'; a: 'take'; id: number }
  | { t: 'hide'; a: 'lock' }
  | { t: 'hide'; a: 'rotate'; n: number }
  | { t: 'hide'; a: 'taunt' }
  | { t: 'hide'; a: 'shoot'; aim: [number, number]; view: number; seq: number };

export interface HideResult { round: number; role: 'hunter' | 'prop'; won: boolean; found: number; survived: boolean; reward: number }
export interface HideStatus { n: number; max: number; names: string[]; phase: HidePhase }
export function hideEnabled(raw: string | undefined, dev = false): boolean { return raw === '1' || (raw === undefined && dev); }
