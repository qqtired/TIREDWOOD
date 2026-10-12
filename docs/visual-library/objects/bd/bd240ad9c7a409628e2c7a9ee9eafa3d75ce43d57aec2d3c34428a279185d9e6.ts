// Сезон рыбалки (сервер решает — его делает агент A, shared/fishing* и server/lobby/fishing2.ts): всем на набережной
// приходит { t: 'fishSeason', on, endsAt, nextAt } — идёт ли сезон, когда кончится и когда следующий (серверные мс).
// Здесь — последнее письмо и подписи для окна Семёна и доски у его дома: «До сезона рыбалки: 1 ч 12 мин» /
// «Сезон рыбалки идёт! осталось 6:40».
//
// ЗАГЛУШКА до сервера A: пока письма нет, сезон считается по расписанию от серверных часов (каждые 2 ч на 15 мин —
// только чтобы видеть таймер). Первое настоящее письмо выключает заглушку насовсем. После слияния с A заглушку
// (STUB_*) можно удалить: без неё до первого письма таймер просто не показывается.
import { RAIN_MUL, SEASON_MUL } from '../../shared/fishrules.ts';
import { FishClock } from './fishclock.ts';

export interface FishSeasonMsg {
  t: 'fishSeason';
  on: boolean;
  endsAt: number;
  nextAt: number;
}

/** Письмо сервера о сезоне (тип в shared/messages.ts добавляет A — здесь проверяем поля сами) */
export function isFishSeasonMsg(m: unknown): m is FishSeasonMsg {
  const o = m as Partial<FishSeasonMsg> | null;
  return !!o && o.t === 'fishSeason' && typeof o.on === 'boolean' && Number.isFinite(o.endsAt) && Number.isFinite(o.nextAt);
}

const STUB_EVERY_MS = 2 * 3600_000;
const STUB_LONG_MS = 15 * 60_000;
/**
 * Заглушка — только в разработке и с ?debug: на собранной игре без сервера A таймер просто не показывается (не обещаем
 * игрокам ненастоящий сезон). Плашка событий у удочки верит только настоящему письму (live()).
 */
const STUB_ON = typeof location !== 'undefined' && (import.meta.env?.DEV === true || location.search.includes('debug'));

/** Что показать: идёт ли сезон и сколько осталось (мс; до конца или до начала) */
export interface FishSeasonState {
  on: boolean;
  left: number;
}

export class FishSeasonClock {
  private readonly clock = new FishClock();
  private msg: FishSeasonMsg | null = null;
  /** Заглушка: пока сервер о сезоне молчит (только разработка и ?debug) */
  stub = STUB_ON;

  sync(serverNow: number): void {
    this.clock.sync(serverNow);
  }

  onMsg(m: FishSeasonMsg): void {
    this.msg = m;
    this.stub = false;
  }

  now(): number {
    return this.clock.now();
  }

  /** Сейчас: null — сезона нет и не будет (или ещё ничего не знаем) */
  state(now = this.clock.now()): FishSeasonState | null {
    const m = this.msg;
    if (m) {
      if (m.on && m.endsAt > now) return { on: true, left: m.endsAt - now };
      // сезон кончился, а новое письмо ещё не пришло — до следующего, если он известен
      if (m.nextAt > now) return { on: false, left: m.nextAt - now };
      return null;
    }
    if (!this.stub) return null;
    const t = now % STUB_EVERY_MS;
    return t < STUB_LONG_MS ? { on: true, left: STUB_LONG_MS - t } : { on: false, left: STUB_EVERY_MS - t };
  }
}

/** «1 ч 12 мин», «12 мин», «45 с» — до сезона; минуты вверх, чтобы не показывать «0 мин» */
export function seasonWait(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s} с`;
  const m = Math.ceil(s / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? (m % 60 ? `${h} ч ${m % 60} мин` : `${h} ч`) : `${m} мин`;
}

/** «6:40» — сколько осталось идти сезону */
export function seasonLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

/** Строка для окна и доски: «До сезона рыбалки: 1 ч 12 мин» или «Сезон рыбалки идёт! осталось 6:40» */
export function seasonLine(st: FishSeasonState | null): string {
  if (!st) return '';
  return st.on ? `Сезон рыбалки идёт! осталось ${seasonLeft(st.left)}` : `До сезона рыбалки: ${seasonWait(st.left)}`;
}

/**
 * Что даёт сезон — коротко, для плашки, окна Семёна и тоста (как на вывесках: «Все шансы ×2»): все шансы игрока в дождь,
 * со всеми бонусами, — ещё ×2 (SEASON_MUL в shared/fishrules.ts; к ясной погоде ×3 — RAIN_MUL × SEASON_MUL); виды дождя
 * клюют, опыт как в дождь.
 */
export const SEASON_PERKS = `все шансы ×${String(SEASON_MUL).replace('.', ',')} · виды дождя`;
/** То же подробно — для подсказки при наведении */
export const SEASON_PERKS_LONG = `особый дождь для всех на набережной: все твои шансы в дождь, со всеми бонусами, — ещё ×${String(SEASON_MUL).replace('.', ',')} (к ясной погоде ×${String(RAIN_MUL * SEASON_MUL).replace('.', ',')}), от редких до царя морей; клюют виды дождя`;

/** Один на набережную: окно Семёна, доска у дома, плашки событий */
export const FISH_SEASON = new FishSeasonClock();
