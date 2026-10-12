// Колесо обозрения у кафе (выпуск 5). Общее для сервера и клиента: где стоит колесо, как вертится, где каждая
// кабинка и каждое место в ней. Колесо крутится всегда, оборот — 90 с; угол считается от тика сервера, поэтому у всех
// он один и тот же. E у кассы: 5 жетонов — садишься в нижнюю кабинку, один оборот, внизу выходишь. Сидящих двигает
// сервер (seatAt), клиент рисует кабинки по тем же часам — желейки сидят ровно на своих местах.
import { TICK_RATE } from './constants.ts';

/** Колесо стоит в юго-восточном углу площади лицом к ней: ось — вдоль x, кабинки ходят в плоскости x = WHEEL.x */
export const WHEEL = { x: 27, z: 13 };
/** От оси до подвеса кабинки */
export const WHEEL_R = 7;
export const WHEEL_CABINS = 8;
export const WHEEL_SEATS = 4;
export const WHEEL_PRICE = 5;
/** Один оборот, тиков */
export const WHEEL_PERIOD = 90 * TICK_RATE;
/** Кабинка висит под подвесом: пол на столько ниже него */
export const CABIN_DROP = 2.3;
/** Пол нижней кабинки — на ступеньку выше площади */
export const CABIN_FLOOR_LOW = 0.3;
/** Высота оси колеса */
export const WHEEL_HUB_Y = CABIN_FLOOR_LOW + CABIN_DROP + WHEEL_R;
/** Касса и вход: E — отсюда (с площади, с запада от нижней кабинки) */
export const WHEEL_GATE = { x: 24.4, z: 13 };
/** Где встаёт приехавший: на помосте у выхода, лицом к площади */
export const WHEEL_EXIT = { x: 24.75, z: 14.6, yaw: Math.PI / 2 };
/** Скамейки — в стольких метрах от середины кабинки по x, места на скамейке — по z */
export const SEAT_DX = 0.52;
export const SEAT_DZ = 0.48;
/** Между кабинками, тиков: через столько вниз приходит следующая */
export const CABIN_STEP = WHEEL_PERIOD / WHEEL_CABINS;

/** Поворот колеса в тик tick (можно дробный — на часах отрисовки), рад: 0 — кабинка 0 внизу; растёт — кабинки поднимаются со стороны моря (+z). */
export function wheelTurn(tick: number): number {
  return (phase(tick) / WHEEL_PERIOD) * 2 * Math.PI;
}

/** Где подвес кабинки c в тик tick (кабинка висит под ним, её пол — на CABIN_DROP ниже). */
export function cabinAt(c: number, tick: number, out: { y: number; z: number }): { y: number; z: number } {
  const a = wheelTurn(tick) + (c * 2 * Math.PI) / WHEEL_CABINS;
  out.y = WHEEL_HUB_Y - WHEEL_R * Math.cos(a);
  out.z = WHEEL.z + WHEEL_R * Math.sin(a);
  return out;
}

/**
 * Место i (кабинка × WHEEL_SEATS + место) в тик tick: в кабинке две скамейки поперёк — западная (места 0, 1) смотрит
 * на восток, восточная (2, 3) — на запад, на площадь. Высота — пол кабинки.
 */
export function seatAt(i: number, tick: number, out: { x: number; y: number; z: number; yaw: number }): { x: number; y: number; z: number; yaw: number } {
  const k = i % WHEEL_SEATS;
  const a = wheelTurn(tick) + ((i - k) / WHEEL_SEATS) * ((2 * Math.PI) / WHEEL_CABINS);
  const west = k < 2;
  out.x = WHEEL.x + (west ? -SEAT_DX : SEAT_DX);
  out.y = WHEEL_HUB_Y - WHEEL_R * Math.cos(a) - CABIN_DROP;
  out.z = WHEEL.z + WHEEL_R * Math.sin(a) + (k % 2 === 0 ? -SEAT_DZ : SEAT_DZ);
  out.yaw = west ? -Math.PI / 2 : Math.PI / 2;
  return out;
}

/** Какая кабинка сейчас внизу (ближе всех к нижней точке) и через сколько тиков она в самом низу (< 0 — уже прошла). */
export function bottomCabin(tick: number): { c: number; dt: number } {
  const t = phase(tick);
  const k = Math.round(t / CABIN_STEP);
  return { c: (WHEEL_CABINS - (k % WHEEL_CABINS)) % WHEEL_CABINS, dt: k * CABIN_STEP - t };
}

/**
 * Сел в кабинку c в тик tick — тик, когда она снова внизу: ближайший её проход через низ не раньше чем через
 * полоборота (сел чуть до низа — оборот и ещё немного, чуть после — оборот без малого).
 */
export function wheelArrival(c: number, tick: number): number {
  // кабинка c внизу, когда (фаза + c·шаг) кратно обороту
  let at = tick + ((WHEEL_PERIOD - ((phase(tick) + c * CABIN_STEP) % WHEEL_PERIOD)) % WHEEL_PERIOD);
  while (at - tick < WHEEL_PERIOD / 2) at += WHEEL_PERIOD;
  return at;
}

function phase(tick: number): number {
  return ((tick % WHEEL_PERIOD) + WHEEL_PERIOD) % WHEEL_PERIOD;
}
