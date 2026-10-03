// «Портовая регата» на набережной: фазы, награда, сообщения. Гонка идёт в том же мире, что и прогулка (комната
// набережной, server/lobby/regatta.ts): катера видят все. Где катера — двоичное сообщение MSG_REGATTA раз в 2 тика
// (всем на набережной; гонщику — ещё и точное состояние своего катера для сверки предсказания), остальное — JSON.
import { TICK_RATE } from './constants.ts';
import type { Outfit } from './outfit.ts';
import { RG_KEYS, type RgBoat } from './regattaphysics.ts';
import type { GatherStatus } from './startzones.ts';

export { RG_COURSE, RG_LAPS } from './regattacourse.ts';

/** Двоичное сообщение «катера регаты» (1 — ввод, 2 — снимок, 3 — снимок картинга) */
export const MSG_REGATTA = 4;
/** Катеров на воде: людей — до 6, ботами добиваем до 4 */
export const RG_MAX = 6;
export const RG_MIN_BOATS = 4;
/** Сбор в круге у пирса, сетка с отсчётом, итоги, «Ещё!» — через сколько снова на сетке */
export const RG_GATHER_TICKS = 10 * TICK_RATE;
export const RG_GRID_TICKS = 5 * TICK_RATE;
export const RG_RESULTS_TICKS = 10 * TICK_RATE;
export const RG_REMATCH_TICKS = 5 * TICK_RATE;
/** Гонка — не дольше 4 мин; после финиша первого человека ещё 25 с; без кнопок 40 с — на берег */
export const RG_LIMIT_TICKS = 4 * 60 * TICK_RATE;
export const RG_AFTER_FIRST = 25 * TICK_RATE;
export const RG_AFK_TICKS = 40 * TICK_RATE;
/** Награда: 11 🪙 в минуту на ходу (до 3 мин) — если был на ходу хоть 20 с; за места 1–3 (финишировал) — 3, 2, 1 */
export const RG_MIN_ACTIVE = 20 * TICK_RATE;
const PER_MINUTE = 11;
const MAX_PAID = 3 * 60 * TICK_RATE;
const PLACE_BONUS = [3, 2, 1];

export type RgPhase = 'idle' | 'grid' | 'race' | 'results';

/** Катер в заезде: номер (место на решётке), чей (номер в снимке набережной; 0 — бот), ник, наряд, уровень */
export interface RgEntry {
  id: number;
  slot: number;
  pid: number;
  nick: string;
  bot: boolean;
  o: Outfit;
  level: number;
}

/** Строка итогов: место (0 — не финишировал), время гонки и лучший круг (тики), сошёл ли, награда */
export interface RgRow {
  id: number;
  pid: number;
  nick: string;
  bot: boolean;
  pos: number;
  finished: boolean;
  ticks: number;
  best: number;
  left: boolean;
  reward: number;
}

/** Рекорд бухты: лучший круг (мс) */
export interface RgRecordRow {
  pid: number;
  nick: string;
  ms: number;
}

export interface RgView {
  phase: RgPhase;
  /** Тик конца фазы: сетка — «Марш!», гонка — предел, итоги — возврат на площадь */
  end: number;
  /** Тик «Марш!» (гонка идёт по меткам входов не раньше него) и тик, когда гонку остановили (0 — идёт) */
  start: number;
  stop: number;
  laps: number;
  course: string;
  boats: RgEntry[];
  /** Итоги (на фазе итогов) */
  rows: RgRow[];
  /** Кто нажал «Ещё!» (номера катеров) и когда новый заезд (тик, 0 — нет) */
  again: number[];
  rematch: number;
}

export type RegattaServerMsg =
  | { t: 'rg'; v: RgView }
  | { t: 'rgQ'; v: GatherStatus }
  | { t: 'rgTop'; top: RgRecordRow[] }
  | { t: 'rgFin'; place: number; ticks: number; best: number; record: number; pb: boolean };

export type RegattaClientMsg = { t: 'rg'; a: 'quit' };

export function emptyRgView(): RgView {
  return { phase: 'idle', end: 0, start: 0, stop: 0, laps: 3, course: 'harbor-v1', boats: [], rows: [], again: [], rematch: 0 };
}

/** Награда за заезд: за время на ходу (если хоть 20 с) и за место (только финишировавшим). */
export function regattaReward(pos: number, activeTicks: number, finished: boolean): number {
  if (activeTicks < RG_MIN_ACTIVE) return 0;
  const time = Math.floor((Math.min(MAX_PAID, activeTicks) / (60 * TICK_RATE)) * PER_MINUTE);
  return time + (finished ? (PLACE_BONUS[pos - 1] ?? 0) : 0);
}

/** Лучший круг (тики) для доски рекордов, мс */
export function rgLapMs(ticks: number): number {
  return Math.round((ticks * 1000) / TICK_RATE);
}

// ------------------------------------------------------------ двоичное: где катера

export const RG_FL_BOOST = 1;
export const RG_FL_DRIFT = 2;
export const RG_FL_DRIFT_RIGHT = 4;
export const RG_FL_GHOST = 8;
export const RG_FL_DONE = 16;
export const RG_FL_AIR = 32;
export const RG_FL_STALL = 64;
/** Ускорение от флажков (сильнее мини-ускорения) */
export const RG_FL_FLAG = 128;

/** Катер для всех: где, куда носом, скорость, руль, признаки, круг, ворота, место, счётчик ударов */
export interface RgCityBoat {
  id: number;
  slot: number;
  x: number;
  z: number;
  y: number;
  hx: number;
  hz: number;
  speed: number;
  steer: number;
  fl: number;
  lap: number;
  cp: number;
  place: number;
  hits: number;
}

export function makeRgCityBoat(): RgCityBoat {
  return { id: 0, slot: 0, x: 0, z: 0, y: 0, hx: 1, hz: 0, speed: 0, steer: 0, fl: 0, lap: 1, cp: 0, place: 0, hits: 0 };
}

const HEAD = 6;
const BOAT_BYTES = 22;
const SELF_HEAD = 6;
export const RG_SELF_BYTES = SELF_HEAD + RG_KEYS.length * 8;

/** Признаки катера по его состоянию */
export function rgFlags(s: RgBoat): number {
  let f = 0;
  if (s.boost > 0) f |= RG_FL_BOOST;
  if (s.boost > 0 && s.boostTop > 22) f |= RG_FL_FLAG;
  if (s.drift > 0) f |= RG_FL_DRIFT;
  if (s.drift > 0 && s.driftDir < 0) f |= RG_FL_DRIFT_RIGHT;
  if (s.ghost > 0) f |= RG_FL_GHOST;
  if (s.done) f |= RG_FL_DONE;
  if (s.air || s.y > 0.05) f |= RG_FL_AIR;
  if (s.stall > 0) f |= RG_FL_STALL;
  return f;
}

/** Общая часть: [MSG_REGATTA][тик u32][катеров u8] и по 22 байта на катер. */
export function encodeRegatta(tick: number, boats: readonly RgCityBoat[]): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(HEAD + boats.length * BOAT_BYTES);
  const v = new DataView(buf.buffer);
  v.setUint8(0, MSG_REGATTA);
  v.setUint32(1, tick >>> 0, true);
  v.setUint8(5, boats.length);
  let o = HEAD;
  for (const b of boats) {
    v.setUint8(o, b.id);
    v.setUint8(o + 1, b.slot);
    v.setFloat32(o + 2, b.x, true);
    v.setFloat32(o + 6, b.z, true);
    v.setUint8(o + 10, Math.max(0, Math.min(255, Math.round(b.y * 40))));
    v.setInt16(o + 11, Math.round(Math.max(-1, Math.min(1, b.hx)) * 32767), true);
    v.setInt16(o + 13, Math.round(Math.max(-1, Math.min(1, b.hz)) * 32767), true);
    v.setUint8(o + 15, Math.max(0, Math.min(255, Math.round(b.speed * 4))));
    v.setInt8(o + 16, Math.round(Math.max(-1, Math.min(1, b.steer)) * 127));
    v.setUint8(o + 17, b.fl & 255);
    v.setUint8(o + 18, Math.max(0, Math.min(255, b.lap)));
    v.setUint8(o + 19, Math.max(0, Math.min(255, b.cp)));
    v.setUint8(o + 20, Math.max(0, Math.min(255, b.place)));
    v.setUint8(o + 21, b.hits & 255);
    o += BOAT_BYTES;
  }
  return buf;
}

/** Общая часть + точное состояние своего катера (подтверждённый вход, счётчик сбросов, поля по RG_KEYS). */
export function withRegattaSelf(common: Uint8Array, ack: number, reset: number, s: RgBoat): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(common.length + RG_SELF_BYTES);
  buf.set(common);
  const v = new DataView(buf.buffer);
  let o = common.length;
  v.setUint32(o, ack >>> 0, true);
  v.setUint16(o + 4, reset & 0xffff, true);
  o += SELF_HEAD;
  for (const k of RG_KEYS) {
    v.setFloat64(o, s[k], true);
    o += 8;
  }
  return buf;
}

export interface RgDecoded {
  tick: number;
  n: number;
  boats: RgCityBoat[];
  /** Своё точное состояние (если пришло) */
  self: boolean;
  ack: number;
  reset: number;
  state: RgBoat;
}

/** Разбор: −1 — не наше сообщение или битое. */
export function decodeRegatta(data: ArrayBuffer, out: RgDecoded): number {
  const v = new DataView(data);
  if (v.byteLength < HEAD || v.getUint8(0) !== MSG_REGATTA) return -1;
  const n = v.getUint8(5);
  if (v.byteLength < HEAD + n * BOAT_BYTES) return -1;
  out.tick = v.getUint32(1, true);
  out.n = n;
  while (out.boats.length < n) out.boats.push(makeRgCityBoat());
  let o = HEAD;
  for (let i = 0; i < n; i++) {
    const b = out.boats[i];
    b.id = v.getUint8(o);
    b.slot = v.getUint8(o + 1);
    b.x = v.getFloat32(o + 2, true);
    b.z = v.getFloat32(o + 6, true);
    b.y = v.getUint8(o + 10) / 40;
    b.hx = v.getInt16(o + 11, true) / 32767;
    b.hz = v.getInt16(o + 13, true) / 32767;
    b.speed = v.getUint8(o + 15) / 4;
    b.steer = v.getInt8(o + 16) / 127;
    b.fl = v.getUint8(o + 17);
    b.lap = v.getUint8(o + 18);
    b.cp = v.getUint8(o + 19);
    b.place = v.getUint8(o + 20);
    b.hits = v.getUint8(o + 21);
    o += BOAT_BYTES;
  }
  out.self = v.byteLength >= o + RG_SELF_BYTES;
  if (out.self) {
    out.ack = v.getUint32(o, true);
    out.reset = v.getUint16(o + 4, true);
    o += SELF_HEAD;
    for (const k of RG_KEYS) {
      out.state[k] = v.getFloat64(o, true);
      o += 8;
    }
  }
  return n;
}
