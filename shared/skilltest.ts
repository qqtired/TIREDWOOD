// «Выше облаков» — Небесная каланча: общие правила, медали, награды и сетевой контракт.
import { TICK_RATE } from './constants.ts';
import type { Stats } from './economy.ts';
import type { Outfit } from './outfit.ts';
import type { PlayerState } from './sim.ts';

/** Новая трасса — новые рекорды: времена старых «Островов» с ней не сравнить. */
export const SKILL_COURSE = 'cloud-tower-185-v2';
export const SKILL_LEGACY_COURSE = 'sky-tower-v1';
export type SkillCourse = typeof SKILL_COURSE | typeof SKILL_LEGACY_COURSE;
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
/** Большая башня: полный подъём, а не короткий забег. Старый курс сохраняет свои пороги. */
export const SKILL_GOLD_TICKS = 300 * TICK_RATE;
export const SKILL_SILVER_TICKS = 480 * TICK_RATE;
export const SKILL_LEGACY_GOLD_TICKS = 120 * TICK_RATE;
export const SKILL_LEGACY_SILVER_TICKS = 210 * TICK_RATE;
export const SKILL_MEDALS = ['', 'Бронза', 'Серебро', 'Золото'] as const;
/** Жетоны за медаль — разово за каждую новую ступень; за «без падений» — разово; за первый подъём дня */
export const SKILL_MEDAL_REWARD = [0, 20, 40, 80] as const;
export const SKILL_CLEAN_REWARD = 30;
export const SKILL_DAILY_REWARD = 10;

/** Участки по порядку: номер участка — номер последней взятой точки. */
export const SKILL_SECTIONS = [
  { name: 'Крыши', rule: 'Разбег и прыжок через пропуски ступеней' },
  { name: 'Мельница', rule: 'Шагни в люльку внизу, сойди наверху' },
  { name: 'Маятники', rule: 'Мешок пролетел — беги. Пережидай в карманах' },
  { name: 'Поршни', rule: 'Таран отъехал назад — сейчас ударит' },
  { name: 'Облака', rule: 'Дрожит — скоро растает. Прыгай за новыми' },
  { name: 'Точная посадка', rule: 'Дождись мешка и приземлись в середину уступа' },
  { name: 'Ветер', rule: 'Флажки рвутся — порыв. Прячься за парус' },
  { name: 'Батутная тележка', rule: 'Тележка подбросит — правь в полёте' },
  { name: 'Восходящий поток', rule: 'Встань над мехами, наверху выйди на настил' },
  { name: 'Карусели', rule: 'Прыгай через перекладину и держи направление' },
  { name: 'Облака под мешком', rule: 'Лови волну облаков после прохода мешка' },
  { name: 'Две корзины', rule: 'Выбери свободную корзину и сойди наверху' },
  { name: 'Два батута', rule: 'Две точные посадки подряд — правь в полёте' },
  { name: 'Поршни на высоте', rule: 'Следи за замахом, пережидай на краю' },
  { name: 'Воздушный шар', rule: 'Прыгай в корзину у нижнего причала' },
  { name: 'Обвал', rule: 'Ступени осыпаются снизу — беги без остановки' },
  { name: 'Ветер и разрывы', rule: 'Укройся от порыва, затем прыгай' },
  { name: 'Колокол', rule: 'Последняя спираль — прыгни в колокол!' },
] as const;

export const SKILL_LEGACY_SECTIONS = [SKILL_SECTIONS[0], SKILL_SECTIONS[1], SKILL_SECTIONS[2], SKILL_SECTIONS[3], SKILL_SECTIONS[4], SKILL_SECTIONS[6], SKILL_SECTIONS[7], SKILL_SECTIONS[9], SKILL_SECTIONS[11], SKILL_SECTIONS[15]] as const;

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
  /**
   * Время подвижного, в котором посчитано это положение (метка последнего входа): по нему клиент рисует чужого так,
   * чтобы стоящий на люльке ехал вместе с ней, а не висел рядом. Нет у старого сервера.
   */
  vt?: number;
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
    t: 'skill_state'; course: SkillCourse; tick: number; id: number; ack: number;
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
export function skillMedal(ticks: number, course: SkillCourse = SKILL_COURSE): number {
  const gold = course === SKILL_LEGACY_COURSE ? SKILL_LEGACY_GOLD_TICKS : SKILL_GOLD_TICKS;
  const silver = course === SKILL_LEGACY_COURSE ? SKILL_LEGACY_SILVER_TICKS : SKILL_SILVER_TICKS;
  return ticks <= gold ? 3 : ticks <= silver ? 2 : 1;
}

export function skillMs(ticks: number): number {
  return Math.round((ticks * 1000) / TICK_RATE);
}

/**
 * Подъём засчитан: статистика профиля и жетоны. Медаль платит разово за каждую новую ступень (сразу золото — все
 * три), «без падений» — разово, первый подъём дня (день по Москве) — каждый день. stats меняются на месте.
 */
export function applySkillFinish(stats: Stats, ticks: number, falls: number, day: number, course: SkillCourse = SKILL_COURSE): Omit<SkillFinish, 'place'> {
  const medal = skillMedal(ticks, course);
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
