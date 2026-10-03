// «Выше облаков» — Небесная каланча: общие правила, медали, награды и сетевой контракт.
import { TICK_RATE } from './constants.ts';
import type { Stats } from './economy.ts';
import type { Outfit } from './outfit.ts';
import type { PlayerState } from './sim.ts';

/** Новая трасса — новые рекорды: времена старых «Островов» с ней не сравнить. */
export const SKILL_COURSE = 'sky-tower-v1';
export const SKILL_CAPACITY = 5;
export const SKILL_REJOIN_TICKS = 10 * 60 * TICK_RATE;
/** Сбор забега: ждём друзей столько (экран загрузки продлевает — server/readygate.ts); последние 3 с — отсчёт */
export const SKILL_GATHER_TICKS = 7 * TICK_RATE;
export const SKILL_COUNT_TICKS = 3 * TICK_RATE;
/** «Ещё забег»: все уже здесь — сбор короче */
export const SKILL_AGAIN_TICKS = 5 * TICK_RATE;
/** После первого колокола остальным даётся столько, потом — итоги */
export const SKILL_AFTER_FIRST_TICKS = 30 * TICK_RATE;
export const SKILL_RESULTS_TICKS = 12 * TICK_RATE;
/** Медали: золото — до 2:00, серебро — до 3:30, бронза — любой подъём */
export const SKILL_GOLD_TICKS = 120 * TICK_RATE;
export const SKILL_SILVER_TICKS = 210 * TICK_RATE;
export const SKILL_MEDALS = ['', 'Бронза', 'Серебро', 'Золото'] as const;
/** Жетоны за медаль — разово за каждую новую ступень; за «без падений» — разово; за первый подъём дня */
export const SKILL_MEDAL_REWARD = [0, 20, 40, 80] as const;
export const SKILL_CLEAN_REWARD = 30;
export const SKILL_DAILY_REWARD = 10;

/** Участки по порядку: номер участка — номер последней взятой точки. */
export const SKILL_SECTIONS = [
  { name: 'Крыша', rule: 'Разбег и прыжок. Жёлтый гриб подбрасывает' },
  { name: 'Мельница', rule: 'Шагни в люльку внизу, сойди наверху' },
  { name: 'Маятники', rule: 'Мешок пролетел — беги. Пережидай в карманах' },
  { name: 'Поршни', rule: 'Таран отъехал назад — сейчас ударит' },
  { name: 'Облака', rule: 'Дрожит — скоро растает. Прыгай за новыми' },
  { name: 'Ветер', rule: 'Флажки рвутся — порыв. Прячься за парус' },
  { name: 'Батуты', rule: 'Гриб и тележка подбрасывают — правь в полёте' },
  { name: 'Карусель', rule: 'Прыгай через перекладину, мимо столбиков' },
  { name: 'Шары', rule: 'Корзина везёт наверх. Мешок — отойди в сторону' },
  { name: 'Колокольня', rule: 'Ступени осыпаются снизу — беги и прыгни в колокол' },
] as const;

export interface SkillProgress {
  /** Последняя взятая точка: 0 — крыша, 9 — причал у колокольни */
  checkpoint: number;
  startedAt: number | null;
  finishedAt: number | null;
  falls: number;
  run: number;
  /** Стартовал вместе с забегом (иначе — свой подъём: время и медаль считаются, места нет) */
  racer: boolean;
}

export function makeSkillProgress(run = 1, racer = false): SkillProgress {
  return { checkpoint: 0, startedAt: null, finishedAt: null, falls: 0, run, racer };
}

export interface SkillPeer {
  level: number;
  id: number;
  pid: number;
  nick: string;
  outfit: Outfit;
  x: number;
  y: number;
  z: number;
  yaw: number;
  grounded: number;
  checkpoint: number;
  finished: boolean;
  /** В забеге */
  racer: boolean;
  /** Тиков в пути (идёт — сколько уже, финиш — итог), 0 — не стартовал */
  ticks: number;
  /** Сбит (кувыркается) — тиков осталось */
  knock: number;
}

export type SkillPhase = 'none' | 'pre' | 'run' | 'done';

export interface SkillRow {
  pid: number;
  nick: string;
  /** Время подъёма, тики; 0 — не дошёл */
  ticks: number;
  falls: number;
  /** Место в забеге (1…), 0 — не дошёл */
  place: number;
  medal: number;
}

export interface SkillRaceView {
  /** Номер забега (растёт) */
  id: number;
  phase: SkillPhase;
  /** pre — тик старта; done — когда итоги закроются; run — когда итоги, если уже был колокол (иначе 0) */
  phaseEnd: number;
  /** Тик старта текущего забега (0 — не было) */
  start: number;
  racers: number;
  rows: SkillRow[];
}

/** Итог подъёма лично игроку (карточка финиша). */
export interface SkillFinish {
  ticks: number;
  falls: number;
  medal: number;
  /** Место в забеге, 0 — без места */
  place: number;
  /** Рекорд, мс (после этого подъёма) и побит ли он сейчас */
  best: number;
  newBest: boolean;
  tokens: number;
  /** Новая медаль (выше прежней), значок «без падений», первый подъём дня */
  medalUp: boolean;
  clean: boolean;
  daily: boolean;
}

export type SkillServerMsg =
  | {
    t: 'skill_state'; course: typeof SKILL_COURSE; tick: number; id: number; ack: number;
    state: PlayerState; reset: number; progress: SkillProgress; peers: SkillPeer[]; race: SkillRaceView;
    /** Личный рекорд, мс (0 — не было) */
    best: number;
  }
  | ({ t: 'skill_finish' } & SkillFinish)
  /** Кто-то позвонил в колокол: звук всем в комнате */
  | { t: 'skill_bell'; pid: number; nick: string; ticks: number; first: boolean };

export interface SkillStatus {
  n: number;
  max: number;
  names: string[];
  course: string;
  phase: SkillPhase;
  /** Сколько секунд до старта (сбор) */
  left: number;
}

/** 1:48.25 */
export function skillTime(ticks: number): string {
  const sec = Math.max(0, ticks) / TICK_RATE;
  return `${Math.floor(sec / 60)}:${(sec % 60).toFixed(2).padStart(5, '0')}`;
}

/** 1:48 — для чата и таблички */
export function skillClock(ticks: number): string {
  const sec = Math.floor(Math.max(0, ticks) / TICK_RATE);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** Медаль за время подъёма: 3 — золото, 2 — серебро, 1 — бронза. */
export function skillMedal(ticks: number): number {
  return ticks <= SKILL_GOLD_TICKS ? 3 : ticks <= SKILL_SILVER_TICKS ? 2 : 1;
}

export function skillMs(ticks: number): number {
  return Math.round((ticks * 1000) / TICK_RATE);
}

/**
 * Подъём засчитан: статистика профиля и жетоны. Медаль платит разово за каждую новую ступень (сразу золото — все
 * три), «без падений» — разово, первый подъём дня (день по Москве) — каждый день. stats меняются на месте.
 */
export function applySkillFinish(stats: Stats, ticks: number, falls: number, day: number): Omit<SkillFinish, 'place'> {
  const medal = skillMedal(ticks);
  const had = Math.max(0, Math.min(3, Math.floor(stats.skMedal)));
  let tokens = 0;
  for (let m = had + 1; m <= medal; m++) tokens += SKILL_MEDAL_REWARD[m];
  const clean = falls === 0 && stats.skClean < 1;
  if (clean) tokens += SKILL_CLEAN_REWARD;
  const daily = stats.skDay !== day;
  if (daily) tokens += SKILL_DAILY_REWARD;
  const ms = skillMs(ticks);
  const newBest = stats.skBest <= 0 || ms < stats.skBest;
  stats.skRuns++;
  if (newBest) stats.skBest = ms;
  if (medal > had) stats.skMedal = medal;
  if (clean) stats.skClean = 1;
  stats.skDay = day;
  return { ticks, falls, medal, best: stats.skBest, newBest, tokens, medalUp: medal > had, clean, daily };
}
