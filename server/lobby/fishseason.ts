// Сезон рыбалки (патч рыбалки 04.10): раз в 2 часа особый дождь «Сезон рыбалки» ровно на 10 минут — все от редких до
// божественного кальмара клюют вдвое чаще, чем в дождь, со всеми бонусами игрока (shared/fishrules.ts SEASON_MUL),
// виды дождя клюют, опыт — как в дождь. Расписание — по серверным часам (чётные часы по Москве: …, 18:00, 20:00,
// 22:00), поэтому у всех одинаково и переживает перезапуск: хранить нечего. Сезон сам по себе дождь: комната (server/lobby/room.ts)
// на время сезона включает погоде особый дождь до его конца (Weather.holdRain) и шлёт всем на набережной fishSeason.
// Отладка: /season в чате набережной (сервер разработки или DEV_GO=1) — сезон сразу, на те же 10 минут.

/** Сезон начинается раз в столько, мс */
export const SEASON_EVERY_MS = 2 * 3600_000;
/** И идёт ровно столько, мс */
export const SEASON_MS = 10 * 60_000;
/** Сдвиг расписания: (мс + сдвиг) кратно 2 часам — это чётный час по Москве (UTC+3) */
export const SEASON_SHIFT_MS = 3 * 3600_000;

/** Что знает клиент (сообщение fishSeason без t) */
export interface FishSeasonView {
  on: boolean;
  /** Конец идущего сезона; нет сезона — конец ближайшего */
  endsAt: number;
  /** Начало следующего сезона (идёт — того, что после него) */
  nextAt: number;
}

/** Сезон по расписанию в момент ms (мс серверных часов); shift — сдвиг расписания (у острова — 4 ч, нечётные часы) */
export function seasonAt(ms: number, shift = SEASON_SHIFT_MS): FishSeasonView {
  const start = Math.floor((ms + shift) / SEASON_EVERY_MS) * SEASON_EVERY_MS - shift;
  const on = ms - start < SEASON_MS;
  const nextAt = start + SEASON_EVERY_MS;
  return { on, endsAt: on ? start + SEASON_MS : nextAt + SEASON_MS, nextAt };
}

/** «18:00» — время по Москве */
export function mskClock(ms: number): string {
  const d = new Date(ms + 3 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export class FishSeason {
  private readonly now: () => number;
  /** Сезон, запущенный командой разработчика: начало, мс (0 — не было) */
  private forcedAt = 0;
  /** Каким был сезон на прошлом шаге (null — шагов ещё не было) */
  private was: boolean | null = null;
  private readonly shift: number;

  constructor(now: () => number = Date.now, shift = SEASON_SHIFT_MS) {
    this.now = now;
    this.shift = shift;
  }

  /** Сезон сейчас: по расписанию или запущенный командой */
  view(): FishSeasonView {
    const now = this.now();
    const s = seasonAt(now, this.shift);
    const end = this.forcedAt + SEASON_MS;
    if (this.forcedAt === 0 || now >= end) return s;
    // запущенный командой: идёт до своего конца (или до конца сезона по расписанию, если тот позже)
    return { on: true, endsAt: s.on ? Math.max(s.endsAt, end) : end, nextAt: s.nextAt };
  }

  get on(): boolean {
    return this.view().on;
  }

  /**
   * Раз в тик: 'start' — сезон начался, 'end' — кончился, null — без перемен. Самый первый шаг (после перезапуска)
   * перемен не объявляет: идущий сезон просто продолжается.
   */
  step(): 'start' | 'end' | null {
    const on = this.on;
    const was = this.was;
    this.was = on;
    if (was === null || was === on) return null;
    return on ? 'start' : 'end';
  }

  /** Отладка: сезон сразу на SEASON_MS. false — уже идёт. */
  force(): boolean {
    if (this.on) return false;
    this.forcedAt = this.now();
    return true;
  }
}
