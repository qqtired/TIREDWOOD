import { TICK_RATE } from './constants.ts';
export const STORM_WARN = 60 * TICK_RATE;
export const STORM_MAX = 180 * TICK_RATE;
export const STORM_RANK = 10 * TICK_RATE;
export const STORM_CALM = 12 * TICK_RATE;
export const STORM_RAINBOW = 30 * TICK_RATE;
export const STORM_PERIOD = 6 * TICK_RATE;
export const STORM_FOAM = TICK_RATE;
export const STORM_PUSH = 6;
export const STORM_LOCK = 36;
/** Где встать, чтобы зажечь маяк: перед дверью (дверь — на северной грани, STORM_DOOR), в радиусе r */
export const STORM_GOAL = { x: -19, y: 0, z: 40.8, r: 3 };
/** Сама дверь маяка (середина проёма у стены): туда смотрит подсказка и подсветка */
export const STORM_DOOR = { x: -19, y: 1.45, z: 41.6 };
/** По высоте: стоя на бетоне у двери и в прыжке */
export const STORM_REACH_Y: readonly [number, number] = [-0.6, 2.2];
/** Сервер прощает столько метров сверх радиуса: его положение игрока отстаёт от экрана на пинг */
export const STORM_REACH_SLACK = 0.6;
export type StormPhase = 'idle' | 'warn' | 'storm' | 'calm';
export interface StormWinner { pid: number; nick: string; place: number; tokens: number }
export interface StormView {
  id: string; phase: StormPhase; start: number; end: number; rankEnd: number; rainbowEnd: number; waveStart: number;
  winners: StormWinner[];
}
export const emptyStorm = (): StormView => ({ id: '', phase: 'idle', start: 0, end: 0, rankEnd: 0, rainbowEnd: 0, waveStart: 0, winners: [] });
export const stormReward = (place: number): number => place === 1 ? 30 : place === 2 ? 20 : place === 3 ? 15 : 5;
/** Стоит у двери маяка: одна проверка у сервера (со slack) и у подсказки на экране. */
export function stormReach(x: number, y: number, z: number, slack = 0): boolean {
  return y >= STORM_REACH_Y[0] && y <= STORM_REACH_Y[1] && Math.hypot(x - STORM_GOAL.x, z - STORM_GOAL.z) <= STORM_GOAL.r + slack;
}
/** Песчаная отмель у основания мостков (восточнее, ниже настила): на песке волна не толкает. */
const STORM_SHOAL = { x0: -19, x1: -12, z1: 27.5, y: -0.3 };
export function onStormPier(x: number, y: number, z: number): boolean {
  if (x > STORM_SHOAL.x0 && x <= STORM_SHOAL.x1 && z < STORM_SHOAL.z1 && y < STORM_SHOAL.y) return false;
  return x >= -24 && x <= -14 && z >= 22.2 && z < 38 && y > -1.55 && y < 1.0;
}
/** Wave clock relative to authoritative storm start. No hit occurs before the first full period. */
export function stormWave(tick: number, view: Pick<StormView, 'phase' | 'waveStart'>): { index: number; impact: boolean; foam: boolean; direction: number } {
  const elapsed = Math.floor(tick - view.waveStart);
  const index = Math.floor(elapsed / STORM_PERIOD);
  const offset = elapsed - index * STORM_PERIOD;
  return { index, impact: view.phase === 'storm' && index >= 1 && offset < STORM_LOCK,
    foam: view.phase === 'storm' && elapsed >= 0 && offset >= STORM_PERIOD - STORM_FOAM, direction: index % 2 ? 1 : -1 };
}
/**
 * Сила шторма для погоды (0…1, shared/weather.ts stormSample): в предупреждение сгущаются тучи и начинается дождь,
 * в шторм — максимум, после того как зажгли маяк, — стихает за STORM_CALM.
 */
export function stormForce(v: Pick<StormView, 'phase' | 'start' | 'end'>, tick: number): number {
  const k = (a: number) => Math.max(0, Math.min(1, a));
  if (v.phase === 'warn') return 0.15 + 0.7 * k((tick - v.start) / Math.max(1, v.end - v.start));
  if (v.phase === 'storm') return 1;
  if (v.phase === 'calm') return 1 - k((tick - v.start) / STORM_CALM);
  return 0;
}
