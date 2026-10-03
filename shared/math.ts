// Мелкая математика без зависимостей: работает и в Node, и в браузере.

export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Угол в диапазон (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = a % TAU;
  if (a > Math.PI) a -= TAU;
  else if (a <= -Math.PI) a += TAU;
  return a;
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}

/** Экспоненциальное сглаживание, не зависящее от частоты кадров. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.exp(-rate * dt);
}

/** Целочисленный хеш (детерминированный на любой платформе). */
export function hash32(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be59b, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Число из [0, 1) по хешу. */
export function hashFloat(a: number, b: number): number {
  return hash32(a, b) / 4294967296;
}

/** Быстрый ГПСЧ (mulberry32) для сервера и эффектов. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// π/2 двумя частями: старшая — 33 бита, k · PIO2_HI точно для любых разумных k
const PIO2_HI = 1.5707963267341256;
const PIO2_LO = 6.077100506506192e-11;
const TWO_OVER_PI = 2 / Math.PI;
// ряды Тейлора до r^17 и r^18: на |r| ≤ π/4 остаток меньше 1e-19
const S1 = -1 / 6, S2 = 1 / 120, S3 = -1 / 5040, S4 = 1 / 362880, S5 = -1 / 39916800, S6 = 1 / 6227020800, S7 = -1 / 1307674368000, S8 = 1 / 355687428096000;
const C1 = -1 / 2, C2 = 1 / 24, C3 = -1 / 720, C4 = 1 / 40320, C5 = -1 / 3628800, C6 = 1 / 479001600, C7 = -1 / 87178291200, C8 = 1 / 20922789888000, C9 = -1 / 6402373705728000;

/**
 * Синус и косинус только на +, −, × (без Math.sin/cos): результат бит в бит одинаков в любом браузере
 * и в Node. Math.sin/cos в разных движках расходятся в последнем знаке, и предсказание движения
 * поправлялось бы на каждом снимке. Точность — как у Math (пара единиц последнего знака).
 */
export function sinCos(a: number, out: { s: number; c: number }): void {
  const k = Math.round(a * TWO_OVER_PI);
  const r = a - k * PIO2_HI - k * PIO2_LO;
  const z = r * r;
  const s = r + r * z * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * (S6 + z * (S7 + z * S8)))))));
  const c = 1 + z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * (C6 + z * (C7 + z * (C8 + z * C9))))))));
  // четверть круга: k & 3 верно и для отрицательных k
  const q = k & 3;
  out.s = q === 0 ? s : q === 1 ? c : q === 2 ? -s : -c;
  out.c = q === 0 ? c : q === 1 ? -s : q === 2 ? -c : s;
}

/** Направление взгляда по yaw/pitch (yaw = 0 смотрит в -Z, как камера three.js). */
export function viewDir(yaw: number, pitch: number, out: { x: number; y: number; z: number }): void {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
}
