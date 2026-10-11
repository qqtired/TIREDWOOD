// Аркада новой набережной (WP12): общее для симуляций мини-игр — без DOM, одинаково в браузере и на сервере.
// Перенесено из лаборатории (lab/plaza3/arcade/games/kit.js) без изменений логики.
//
// Мини-игра — модуль shared/arcade/<id>.ts: meta (название, правила, пороги медалей), makeSim(seed) — чистая логика
// (sim.step(events) раз в тик, 60 Гц; sim.tick, sim.score, sim.over, sim.fx) и bot — автопилот для демо на экране.
// Журнал ввода — массив [тик, тип, a, b] (целые). Событие применяется в начале своего тика.
// Детерминизм: в симуляции только + − × ÷ и Math.sqrt/floor/round/abs/min/max/ceil, случайность — только из
// rngFrom(seed). Поэтому браузер игрока и сервер (Node) получают один и тот же счёт: сервер переигрывает партию сам.

export const W = 320;
export const H = 240;
export const HZ = 60;

/** Событие ввода в шаге симуляции: [тип, a, b] */
export type ArcEvent = [number, number, number];
/** Строка журнала: [тик, тип, a, b] */
export type ArcLogRow = [number, number, number, number];

/** Эффект шага (для картинки и звука; на счёт не влияет) */
export interface ArcFx {
  k: string;
  x: number;
  y: number;
  [key: string]: unknown;
}

/** Общее у симуляций всех игр */
export interface ArcSimBase {
  tick: number;
  score: number;
  over: boolean;
  fx: ArcFx[];
  step(events: readonly ArcEvent[]): void;
}

export interface ArcMeta {
  id: ArcGameId;
  title: string;
  like: string;
  /** Надпись на старте после «Готов?» */
  go: string;
  /** Заголовок итога партии */
  overTitle: string;
  rules: readonly string[];
  controls: ReadonlyArray<readonly [string, string]>;
  scoring: string;
  /** Пороги медалей: бронза, серебро, золото */
  medals: readonly [number, number, number];
  /** Жетоны за медаль партии: бронза, серебро, золото */
  coins: readonly [number, number, number];
  /** Курсор над экраном в партии */
  cursor: string;
}

export type ArcGameId = 'train' | 'tir' | 'castle';

/** Генератор 0..1 по зерну (mulberry32) */
export function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Целое 0..n−1 */
export const irand = (rng: () => number, n: number): number => Math.floor(rng() * n);

/** Медаль по очкам: 0 — нет, 1 бронза, 2 серебро, 3 золото */
export function medalOf(score: number, thresholds: readonly number[]): number {
  let m = 0;
  for (let i = 0; i < thresholds.length; i++) if (score >= thresholds[i]) m = i + 1;
  return m;
}

export const MEDAL_NAMES = ['Без медали', 'Бронза', 'Серебро', 'Золото'] as const;

/** Потолок длины партии: 15 минут игры (дальше симуляцию не гоняем) */
export const ARC_MAX_TICKS = 15 * 60 * HZ;

/**
 * Партия по журналу, без экрана. ticks — сколько тиков шла (партию могли закончить раньше, через Esc).
 * Журнал — по неубыванию тика (иначе события «из прошлого» пропускаются).
 */
export function replayRun(makeSim: (seed: number) => ArcSimBase, seed: number, log: readonly (readonly number[])[], ticks: number): { score: number; ticks: number; over: boolean } {
  const sim = makeSim(seed >>> 0);
  const cap = Math.min(Number.isFinite(ticks) ? ticks : Infinity, ARC_MAX_TICKS);
  let i = 0;
  const ev: ArcEvent[] = [];
  while (!sim.over && sim.tick < cap) {
    while (i < log.length && log[i][0] < sim.tick) i++;
    ev.length = 0;
    while (i < log.length && log[i][0] === sim.tick) {
      const e = log[i++];
      ev.push([e[1] | 0, e[2] | 0, e[3] | 0]);
    }
    sim.step(ev);
    sim.fx.length = 0;
  }
  return { score: sim.score, ticks: sim.tick, over: sim.over };
}
