// Радио на своей лодке (остров «Последний свет», флаг ISLE): три бесконечные станции без слов, музыку синтезирует
// клиент (client/boat/radio*.ts, движок автомата client/music/). Сервер хранит и рассылает только состояние радио
// каждого «носителя» (лодки): вкл, станция, громкость, «управляет только хозяин / все на борту» — и решает, кому можно.
// Станции идут «в эфире» по серверным часам: место в потоке = время сервера, поэтому две лодки на одной станции
// звучат одинаково и в такт, а вошедший слышит то же место, что и все на борту.
// Носитель — абстракция над лодкой (server/lobby/boatradio.ts): номер, хозяин, кто на борту и где он.

/** Станция: что играет (ноты — client/boat/stations/), темп и длина отрезка потока */
export interface RadioStation {
  id: string;
  title: string;
  /** Для чего — строка в окне радио */
  mood: string;
  emoji: string;
  bpm: number;
  /** Долей в такте */
  meter: number;
}

export const RADIO_STATIONS: readonly RadioStation[] = [
  { id: 'forsazh', title: 'Форсаж', mood: 'драйв для гонки по волнам', emoji: '🏁', bpm: 164, meter: 4 },
  { id: 'zavod', title: 'Тихая заводь', mood: 'спокойно — для ловли с якоря', emoji: '🎣', bpm: 72, meter: 4 },
  { id: 'funk', title: 'Морской фанк', mood: 'прогулка с друзьями на борту', emoji: '🐬', bpm: 112, meter: 4 },
];

/** Отрезок потока станции — столько тактов (все отрезки станции одной длины: место в потоке считается делением) */
export const RADIO_BLOCK_BARS = 8;

/** Длина отрезка станции, с */
export function radioBlockSec(st: RadioStation): number {
  return (RADIO_BLOCK_BARS * st.meter * 60) / st.bpm;
}

/** «Эфирное» начало отсчёта потоков: место в потоке = (серверное время − RADIO_EPOCH) / 1000 */
export const RADIO_EPOCH = Date.UTC(2026, 0, 1);

/** Громкость радио — ступени 1…10 (по умолчанию 7) */
export const RADIO_VOL_MIN = 1;
export const RADIO_VOL_MAX = 10;
export const RADIO_VOL_DEFAULT = 7;

/** Громкость ступени как доля 0…1 (на слух ровнее, чем линейно) */
export function radioVolGain(vol: number): number {
  const v = Math.min(RADIO_VOL_MAX, Math.max(0, vol)) / RADIO_VOL_MAX;
  return Math.pow(v, 1.5);
}

/**
 * Громкость радио по расстоянию от слушателя до лодки: на борту и рядом (до 7 м) — полная, дальше плавно до тишины
 * к 45 м. Радио не слышно через всю бухту — только вокруг лодки (в отличие от автомата на площади).
 */
export const RADIO_NEAR = 7;
export const RADIO_FAR = 45;
export function radioGain(dist: number): number {
  if (!(dist > RADIO_NEAR)) return 1;
  if (dist >= RADIO_FAR) return 0;
  const k = (dist - RADIO_NEAR) / (RADIO_FAR - RADIO_NEAR);
  const s = k * k * (3 - 2 * k);
  return 1 - s;
}

/** Носитель радио — лодка (или тестовый носитель): номер, хозяин (id профиля), кто на борту (id профилей) */
export interface RadioCarrier {
  id: number;
  owner: number;
  aboard: readonly number[];
}

/** Состояние радио носителя */
export interface RadioState {
  on: boolean;
  /** Номер станции в RADIO_STATIONS */
  st: number;
  vol: number;
  /** Хозяин разрешил управлять всем на борту */
  all: boolean;
}

export function radioDefault(): RadioState {
  return { on: false, st: 0, vol: RADIO_VOL_DEFAULT, all: false };
}

/** Может ли игрок pid управлять радио этого носителя: хозяин — всегда, остальные — если разрешено и они на борту */
export function radioCanControl(state: RadioState, carrier: RadioCarrier, pid: number): boolean {
  if (pid === carrier.owner) return true;
  return state.all && carrier.aboard.includes(pid);
}

/** Что просит игрок: включить/выключить, станцию, громкость, разрешение всем (только хозяин) */
export interface RadioPatch {
  on?: boolean;
  st?: number;
  vol?: number;
  all?: boolean;
}

export type RadioRefusal = 'carrier' | 'owner' | 'aboard' | 'bad';

/**
 * Применить просьбу игрока к состоянию радио (не меняет вход): новое состояние или почему нельзя.
 * Разрешение всем меняет только хозяин; выбор станции заодно включает радио.
 */
export function radioApply(state: RadioState, carrier: RadioCarrier, pid: number, patch: RadioPatch): { ok: true; state: RadioState } | { ok: false; why: RadioRefusal } {
  const p = patch as Record<string, unknown>;
  const has = (k: string): boolean => p[k] !== undefined;
  if (!has('on') && !has('st') && !has('vol') && !has('all')) return { ok: false, why: 'bad' };
  if (has('on') && typeof p.on !== 'boolean') return { ok: false, why: 'bad' };
  if (has('all') && typeof p.all !== 'boolean') return { ok: false, why: 'bad' };
  if (has('st') && !(typeof p.st === 'number' && Number.isInteger(p.st) && RADIO_STATIONS[p.st as number])) return { ok: false, why: 'bad' };
  if (has('vol') && !(typeof p.vol === 'number' && Number.isInteger(p.vol) && (p.vol as number) >= RADIO_VOL_MIN && (p.vol as number) <= RADIO_VOL_MAX)) return { ok: false, why: 'bad' };
  if (has('all') && pid !== carrier.owner) return { ok: false, why: 'owner' };
  if (!radioCanControl(state, carrier, pid)) return { ok: false, why: state.all ? 'aboard' : 'owner' };
  const next = { ...state };
  if (has('st')) { next.st = p.st as number; next.on = true; }
  if (has('on')) next.on = p.on as boolean;
  if (has('vol')) next.vol = p.vol as number;
  if (has('all')) next.all = p.all as boolean;
  return { ok: true, state: next };
}

/** Текст отказа — тостом игроку */
export function radioRefusalText(why: RadioRefusal, ownerNick: string): string {
  switch (why) {
    case 'owner': return `📻 Радио включает хозяин лодки${ownerNick ? ` — ${ownerNick}` : ''}`;
    case 'aboard': return '📻 Радио — только для тех, кто на борту';
    case 'carrier': return '📻 Этой лодки уже нет';
    default: return '📻 Не понял, что включить';
  }
}

/** Радио носителя по сети: номер, хозяин (id профиля и ник), состояние; dev — тестовый носитель (желейка хозяина) */
export interface RadioWire {
  id: number;
  owner: number;
  nick: string;
  on: 0 | 1;
  st: number;
  vol: number;
  all: 0 | 1;
  dev?: 1;
}

export function radioWire(id: number, owner: number, nick: string, s: RadioState, dev = false): RadioWire {
  return { id, owner, nick, on: s.on ? 1 : 0, st: s.st, vol: s.vol, all: s.all ? 1 : 0, ...(dev ? { dev: 1 as const } : {}) };
}

export type RadioClientMsg = { t: 'radio'; id: number } & RadioPatch;
export type RadioServerMsg =
  /** Все радио на воде (их мало): now — серверные мс отправки (по ним клиент считает место в эфире) */
  | { t: 'radio'; now: number; r: RadioWire[] }
  /** Отказ — тостом */
  | { t: 'radioRes'; text: string };

/** Тестовый носитель (/radio в чате при --dev или DEV_GO=1): «на борту» — кто ближе стольких метров к хозяину */
export const RADIO_DEV_ABOARD_R = 6;
