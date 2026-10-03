// «Выше облаков» — расписания ловушек Небесной каланчи. Всё — функции серверного времени t (тики, с дробью):
// физика (shared/skillphysics.ts) и картинка (client/skilltest/) спрашивают одно и то же, поэтому что видно, то и
// бьёт. Только +, −, ×, /, остаток от деления и sinCos — бит в бит в любом браузере и в Node.
import { TICK_RATE } from './constants.ts';
import { TAU, sinCos } from './math.ts';

/** Сколько тиков от начала своего цикла в момент t. */
export function cyc(t: number, phase: number, period: number): number {
  const c = (t - phase) % period;
  return c < 0 ? c + period : c;
}

function smooth(k: number): number {
  return k * k * (3 - 2 * k);
}

/** Платформа по отрезку: покой → туда → стоит → обратно. */
export interface LineSchedule {
  rest: number;
  go: number;
  stay: number;
  back: number;
  phase: number;
}

/** Доля хода: 0 — в начале, 1 — в конце; разгон и торможение плавные. */
export function lineU(m: LineSchedule, t: number): number {
  let c = cyc(t, m.phase, m.rest + m.go + m.stay + m.back);
  if (c < m.rest) return 0;
  c -= m.rest;
  if (c < m.go) return smooth(c / m.go);
  c -= m.go;
  if (c < m.stay) return 1;
  c -= m.stay;
  return 1 - smooth(c / m.back);
}

const sc = { s: 0, c: 0 };

/** Люлька мельничного колеса: угол φ от нижней точки (растёт: вниз → запад → верх → восток). */
export function orbitAngle(period: number, phase: number, t: number): number {
  return (cyc(t, phase, period) / period) * TAU;
}

/** Смещение люльки от оси колеса в плоскости x–y: (−r·sinφ, −r·cosφ). */
export function orbitOffset(r: number, period: number, phase: number, t: number, out: { x: number; y: number }): { x: number; y: number } {
  sinCos(orbitAngle(period, phase, t), sc);
  out.x = -r * sc.s;
  out.y = -r * sc.c;
  return out;
}

/** Мешок-маятник: угол от вертикали и знак скорости (куда летит). */
export interface SwingPose {
  a: number;
  /** +1 — к плюсу оси качания, −1 — к минусу */
  w: number;
}

export function swingPose(amp: number, period: number, phase: number, t: number, out: SwingPose): SwingPose {
  sinCos((cyc(t, phase, period) / period) * TAU, sc);
  out.a = amp * sc.s;
  out.w = sc.c >= 0 ? 1 : -1;
  return out;
}

/** Таран: цикл в тиках. */
export const RAM_REST = 96;
export const RAM_WIND = 36;
export const RAM_STRIKE = 7;
export const RAM_HOLD = 24;
export const RAM_BACK = 29;
export const RAM_PERIOD = RAM_REST + RAM_WIND + RAM_STRIKE + RAM_HOLD + RAM_BACK;
/** Насколько таран отъезжает назад на замахе, доля хода */
export const RAM_WINDUP = 0.07;

export type RamPhase = 'rest' | 'wind' | 'strike' | 'hold' | 'back';

/** Выдвижение тарана: −RAM_WINDUP (замах) … 1 (весь ход) и фаза. Бьёт только на ударе и пока держит. */
export function ramState(phase: number, t: number, out: { e: number; phase: RamPhase; k: number }): { e: number; phase: RamPhase; k: number } {
  let c = cyc(t, phase, RAM_PERIOD);
  if (c < RAM_REST) {
    out.e = 0; out.phase = 'rest'; out.k = c / RAM_REST;
    return out;
  }
  c -= RAM_REST;
  if (c < RAM_WIND) {
    const k = c / RAM_WIND;
    out.e = -RAM_WINDUP * smooth(k); out.phase = 'wind'; out.k = k;
    return out;
  }
  c -= RAM_WIND;
  if (c < RAM_STRIKE) {
    const k = c / RAM_STRIKE;
    out.e = -RAM_WINDUP + (1 + RAM_WINDUP) * k; out.phase = 'strike'; out.k = k;
    return out;
  }
  c -= RAM_STRIKE;
  if (c < RAM_HOLD) {
    out.e = 1; out.phase = 'hold'; out.k = c / RAM_HOLD;
    return out;
  }
  c -= RAM_HOLD;
  const k = c / RAM_BACK;
  out.e = 1 - smooth(k); out.phase = 'back'; out.k = k;
  return out;
}

/** Облако: твёрдое → дрожит и пыхает → нет. */
export const CLOUD_SOLID = 180;
export const CLOUD_WARN = 48;
export const CLOUD_GONE = 132;
export const CLOUD_PERIOD = CLOUD_SOLID + CLOUD_WARN + CLOUD_GONE;

/** 0 — твёрдое и спокойно, (0, 1) — дрожит (1 — вот-вот исчезнет), −1 — нет. */
export function cloudState(phase: number, t: number): number {
  const c = cyc(t, phase, CLOUD_PERIOD);
  if (c < CLOUD_SOLID) return 0;
  if (c < CLOUD_SOLID + CLOUD_WARN) return (c - CLOUD_SOLID) / CLOUD_WARN;
  return -1;
}

/** Только для картинки: облако собирается — 0…1 за последние CLOUD_PUFF тиков перед возвращением, иначе 0. */
export const CLOUD_PUFF = 30;
export function cloudReform(phase: number, t: number): number {
  const c = cyc(t, phase, CLOUD_PERIOD);
  const left = CLOUD_PERIOD - c;
  return left <= CLOUD_PUFF ? 1 - left / CLOUD_PUFF : 0;
}

export function cloudSolid(phase: number, t: number): boolean {
  return cyc(t, phase, CLOUD_PERIOD) < CLOUD_SOLID + CLOUD_WARN;
}

/** Ветер: тихо → предупреждение → порыв. */
export const WIND_CALM = 120;
export const WIND_WARN = 36;
export const WIND_GUST = 84;
export const WIND_PERIOD = WIND_CALM + WIND_WARN + WIND_GUST;

/** 0 — тихо, (0, 1) — предупреждение, 1 — порыв. */
export function windState(phase: number, t: number): number {
  const c = cyc(t, phase, WIND_PERIOD);
  if (c < WIND_CALM) return 0;
  if (c < WIND_CALM + WIND_WARN) return (c - WIND_CALM) / WIND_WARN;
  return 1;
}

/** Обвал лестницы: цикл, задержка после сборки, скорость волны (м/с), дрожь перед падением (м пути). */
export const CRUMBLE_PERIOD = 10 * TICK_RATE;
export const CRUMBLE_GRACE = 2 * TICK_RATE;
export const CRUMBLE_SPEED = 6;
export const CRUMBLE_SHAKE = 3;

/** Где фронт обвала на пути лестницы, м (отрицательный — ещё не начался). */
export function crumbleFront(t: number): number {
  return ((cyc(t, 0, CRUMBLE_PERIOD) - CRUMBLE_GRACE) * CRUMBLE_SPEED) / TICK_RATE;
}

/** Ступень на пути s: 0 — стоит, (0, 1) — трясётся (1 — падает), −1 — нет. */
export function crumbleState(s: number, t: number): number {
  const f = crumbleFront(t);
  if (f >= s) return -1;
  if (f > s - CRUMBLE_SHAKE) return (f - (s - CRUMBLE_SHAKE)) / CRUMBLE_SHAKE;
  return 0;
}

/** Сколько тиков до сборки лестницы (для подсказки). */
export function crumbleReformIn(t: number): number {
  return CRUMBLE_PERIOD - cyc(t, 0, CRUMBLE_PERIOD);
}

/** Карусель и перекладина: угол в момент t (рад), ω — рад/тик. */
export function spinAngle(period: number, t: number): number {
  return (cyc(t, 0, period) / period) * TAU;
}
