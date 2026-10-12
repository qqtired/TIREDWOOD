// «Подземелье»: мелочи симуляции — шаг, тор, ГПСЧ в состоянии забега. Только +, −, ×, ÷, sqrt, floor/round.
import { sinCos } from '../math.ts';
import { DG_HZ, DG_MAP } from './api.ts';

export const DT = 1 / DG_HZ;
export const L = DG_MAP;
export const HALF = L / 2;

/** Секунды → целые шаги */
export function ticks(sec: number): number {
  return Math.round(sec * DG_HZ);
}

/** Кратчайшая разница на торе: результат в [−120, 120] */
export function wrapD(d: number): number {
  return d - L * Math.round(d / L);
}

/** Координата в [0, 240) */
export function wrapP(x: number): number {
  const r = x - L * Math.floor(x / L);
  return r >= L ? 0 : r;
}

/** ГПСЧ mulberry32 с состоянием в объекте забега (ничего не прячем в замыкания: забег можно копировать) */
export interface RngHolder {
  rng: number;
}
export function rnd(s: RngHolder): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/** Целое в [0, n) */
export function rndInt(s: RngHolder, n: number): number {
  return Math.floor(rnd(s) * n);
}
/** Число в [a, b) */
export function rndRange(s: RngHolder, a: number, b: number): number {
  return a + (b - a) * rnd(s);
}

/** Длина вектора */
export function len2(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}

/** Степень с целым показателем (Math.pow с дробями не берём) */
export function powi(b: number, n: number): number {
  let r = 1;
  for (let i = 0; i < n; i++) r *= b;
  return r;
}

/** cos половины угла в градусах — через sinCos, детерминированно */
const SC = { s: 0, c: 0 };
export function cosDeg(deg: number): number {
  sinCos((deg * Math.PI) / 180, SC);
  return SC.c;
}
/** Поворот единичного вектора на угол a (рад): в out */
export function rotate(x: number, z: number, a: number, out: { x: number; z: number }): void {
  sinCos(a, SC);
  out.x = x * SC.c - z * SC.s;
  out.z = x * SC.s + z * SC.c;
}
/** Единичный вектор по углу (рад) от оси +x к +z */
export function dirOf(a: number, out: { x: number; z: number }): void {
  sinCos(a, SC);
  out.x = SC.c;
  out.z = SC.s;
}
