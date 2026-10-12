// Связь моделей павильонов (client/lobby/plaza3/pavilions.ts, строит мир набережной) с тем, что строит сцена позже и
// отдельно: доска «Рекорды рыбаков» и рыбы дня (client/lobby/fishboard.ts, fishpodium.ts — их создаёт Fish2Hud) встают на
// поля «Рыбной витрины», когда модель загрузилась; экран Telegram (client/lobby/tgscreen.ts) — на экран крыши Склада №3;
// вход «Подземелья» (plaza3/dress.ts) пересчитывает тени статики.
// Пока модели нет (или GLB не загрузился) — доска и пьедестал остаются своими, как без флага.
import type * as THREE from 'three';

/** Поля «Рыбной витрины» в мире (pav_fishshowcase.glb, README-pb.md) */
export interface ShowcaseMount {
  /** Поле доски «Рекорды рыбаков»: центр, масштаб — половины ширины и высоты, +Z — наружу */
  board: THREE.Matrix4;
  /** Верх гребня вывески — место резной акулы */
  roof: THREE.Matrix4;
  /** Места рыб 1–3: Y вверх, −Z к зрителю. Upright: хвост на якоре, единые maxH/maxW для всех мест. */
  fish: Array<{ matrix: THREE.Matrix4; len: number; maxH: number; maxW?: number; pose?: 'upright' | 'horizontal'; head: number }>;
  /** Таблички под местами: центр, масштаб — половины ширины и высоты, +Z — наружу */
  tags: THREE.Matrix4[];
}

let showcase: ShowcaseMount | null = null;
const waiting: Array<(m: ShowcaseMount) => void> = [];

/** Когда витрина встанет (или сразу, если уже стоит) */
export function onShowcase(fn: (m: ShowcaseMount) => void): void {
  if (showcase) fn(showcase);
  else waiting.push(fn);
}

export function setShowcase(m: ShowcaseMount): void {
  showcase = m;
  for (const fn of waiting.splice(0)) fn(m);
}

let roofScreen: THREE.Matrix4 | null = null;
const roofWaiting: Array<(m: THREE.Matrix4) => void> = [];

/** Поле экрана на крыше Склада №3 (pav_paintball anchor_screen: центр, масштаб — половины ширины и высоты, +Z — наружу) */
export function onRoofScreen(fn: (m: THREE.Matrix4) => void): void {
  if (roofScreen) fn(roofScreen);
  else roofWaiting.push(fn);
}

export function setRoofScreen(m: THREE.Matrix4): void {
  roofScreen = m;
  for (const fn of roofWaiting.splice(0)) fn(m);
}

/** Готовая модель крысиных бегов заменяет только прежнее неподвижное оформление. */
export interface RatArenaMount { board: THREE.Matrix4; finish: THREE.Matrix4 }
let ratArena: RatArenaMount | null = null;
const ratWaiting: Array<(m: RatArenaMount) => void> = [];
export function onRatArena(fn: (m: RatArenaMount) => void): void {
  if (ratArena) fn(ratArena); else ratWaiting.push(fn);
}
export function setRatArena(m: RatArenaMount): void {
  ratArena = m;
  for (const fn of ratWaiting.splice(0)) fn(m);
}

/** Пересчитать тени статики (ставит мир набережной; до того — ничего) */
export const plaza3Shadows = { refresh: (): void => {} };
