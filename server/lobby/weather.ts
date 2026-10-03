// Погода на набережной: обычно ясно, изредка дождь на несколько минут. Решает сервер, у всех она одна:
// входящему её называют в приветствии, остальным шлют сообщение при смене. Остальное (тучи, капли, лужи) — клиент.
import { TICK_RATE } from '../../shared/constants.ts';

/** Ясно между дождями, тиков: от и до */
export const CLEAR_TICKS: readonly [number, number] = [15 * 60 * TICK_RATE, 30 * 60 * TICK_RATE];
/** Сколько идёт дождь, тиков: от и до */
export const RAIN_TICKS: readonly [number, number] = [288 * TICK_RATE, 480 * TICK_RATE];
/** Режим «по кругу» для разработки: столько тиков ясно, потом столько же дождь */
const CYCLE_TICKS = 45 * TICK_RATE;

/** auto — как в игре; для разработки (DEV_WEATHER): rain — всегда дождь, clear — всегда ясно, cycle — по 45 с */
export type WeatherMode = 'auto' | 'rain' | 'clear' | 'cycle';

export class Weather {
  rain: boolean;
  /** Тик следующей смены */
  until: number;
  private readonly mode: WeatherMode;
  private readonly rand: () => number;
  private readonly now: () => number;
  private untilMs: number;
  /** В режиме DEV clear бубен всё равно вызывает обычное конечное событие. */
  private forced = false;

  /** Сначала всегда ясно (кроме режима «дождь»): после перезапуска сервера дождь не начинается сразу. */
  constructor(rand: () => number = Math.random, mode: WeatherMode = 'auto', tick = 0, now: () => number = Date.now) {
    this.rand = rand;
    this.mode = mode;
    this.now = now;
    this.rain = mode === 'rain';
    const span = this.span(this.rain);
    this.until = tick + span;
    this.untilMs = this.now() + span * 1000 / TICK_RATE;
  }

  get eventUntil(): number {
    return !this.rain || this.mode === 'rain' && !this.forced ? 0 : this.untilMs;
  }

  /** Тик набережной; true — погода сменилась (пора всем сказать). */
  step(tick: number): boolean {
    if ((this.mode === 'rain' || this.mode === 'clear') && !this.forced) return false;
    if (tick < this.until && this.now() < this.untilMs) return false;
    this.setRain(!this.rain, tick);
    return true;
  }

  /** Бубен использует ровно тот же переход и длительность, что обычный дождь; активный не продлевается. */
  startRain(tick: number): boolean {
    if (this.rain) return false;
    this.setRain(true, tick);
    this.forced = true;
    return true;
  }

  private setRain(rain: boolean, tick: number): void {
    this.rain = rain;
    if (!rain) this.forced = false;
    const span = this.span(rain);
    this.until = tick + span;
    this.untilMs = this.now() + span * 1000 / TICK_RATE;
  }

  private span(rain: boolean): number {
    if (this.mode === 'cycle') return CYCLE_TICKS;
    const [a, b] = rain ? RAIN_TICKS : CLEAR_TICKS;
    return a + Math.floor(this.rand() * (b - a));
  }
}

/** DEV_WEATHER из окружения: неизвестное — как в игре. */
export function weatherMode(s: string | undefined): WeatherMode {
  return s === 'rain' || s === 'clear' || s === 'cycle' ? s : 'auto';
}
