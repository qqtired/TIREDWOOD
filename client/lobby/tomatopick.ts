// Куда полетит помидор по клику за столом дурака. Чистые функции: экранные координаты → стул.
// Целимся по экрану, а не по мешу: цель — любой сидящий соперник (игрок или бот), не я и не пустое место. Желейка —
// отрезок на экране от таза до макушки, попадание — в радиусе вокруг него (клик по лицу, макушке, краю силуэта — тоже).
// Радиус не меньше основы (110 px мышью, 140 пальцем), чуть растёт с расстоянием (далёкий не мельче) и не меньше
// размера желейки на экране — у ближнего соседа силуэт огромный, и клик у его края тоже считается.

/** Основа радиуса попадания, px: мышь и палец */
export const TOMATO_REACH_PX = 110;
export const TOMATO_REACH_TOUCH_PX = 140;
/** Запас к размеру желейки на экране: клик у самого края силуэта попадает */
const BODY_MARGIN = 1.15;
/** Далёкому игроку радиус больше не более чем на столько (на расстоянии FAR_FROM + FAR_SPAN м и дальше) */
const FAR_BOOST = 0.15;
const FAR_FROM = 2;
const FAR_SPAN = 4;

/** Место за столом, как в виде стола с сервера (нужны только эти поля) */
export interface PickSeat {
  k: number;
  id: number;
}

/** Сидящий на экране: стул, точка корпуса (x, y) в пикселях и радиус попадания; (x2, y2) — второй конец отрезка таз–макушка */
export interface PickPoint {
  ch: number;
  x: number;
  y: number;
  r: number;
  x2?: number;
  y2?: number;
}

/** Расстояние от точки до цели: до отрезка, если у цели есть второй конец, иначе до точки */
export function distanceTo(p: PickPoint, px: number, py: number): number {
  if (p.x2 === undefined || p.y2 === undefined) return Math.hypot(p.x - px, p.y - py);
  const dx = p.x2 - p.x;
  const dy = p.y2 - p.y;
  const len2 = dx * dx + dy * dy;
  const k = len2 > 0 ? Math.max(0, Math.min(1, ((px - p.x) * dx + (py - p.y) * dy) / len2)) : 0;
  return Math.hypot(p.x + dx * k - px, p.y + dy * k - py);
}

/** Можно ли бросить в это место: чужой игрок или бот; не я, не пустой стул и не «ушёл» (как проверяет сервер). */
export function targetable(seat: PickSeat | undefined | null, ch: number, mine: number): boolean {
  return !!seat && ch !== mine && seat.k !== 0 && !(seat.k === 1 && seat.id === 0);
}

/** Радиус попадания: основа (чуть больше для далёких) или размер желейки на экране — что больше. distance — метры от камеры. */
export function tomatoRadius(base: number, bodyPx: number, distance: number): number {
  const far = 1 + FAR_BOOST * Math.min(1, Math.max(0, (distance - FAR_FROM) / FAR_SPAN));
  return Math.max(base * far, bodyPx * BODY_MARGIN);
}

/**
 * Стул, в который попал клик (px, py), или −1. Из тех, чей круг накрыл точку, берём ближайшего — меряем долей радиуса,
 * чтобы клик по силуэту ближнего соседа не отдавался далёкому, у которого центр случайно ближе.
 */
export function pickTomatoTarget(points: readonly PickPoint[], px: number, py: number, mine = -1): number {
  let best = -1;
  let bestK = Infinity;
  for (const p of points) {
    if (p.ch === mine || !(p.r > 0)) continue;
    const k = distanceTo(p, px, py) / p.r;
    if (k <= 1 && k < bestK) {
      best = p.ch;
      bestK = k;
    }
  }
  return best;
}
