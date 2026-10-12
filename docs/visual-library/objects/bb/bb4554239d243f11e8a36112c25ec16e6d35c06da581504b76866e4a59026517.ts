// Рекорды «Крепости» — общее для сервера и клиента: что уходит по сети и как это пишется словами.
// Рекорд везде — ОТБИТЫЕ волны: последняя полностью отбитая волна игры (FortGame.cleared), а не номер начатой.
// Общий рекорд — лучший забег сервера (первая строка State.fortTop: волн, ники команды, когда). Личный —
// stats.ftBest: сколько волн отбила команда в игре, где тебе засчитана отбитая волна (как жетоны за неё).
// Считает и хранит сервер (server/fort/game.ts, server/store.ts); клиент только показывает.
import { mskDay } from './economy.ts';
import type { FortRunRec } from './fort.ts';

/** Рекорд для экрана: волн отбито, кто (ники команды), когда (мс); live — его ставит игра, которая идёт сейчас */
export interface FortRecView {
  wave: number;
  names: string[];
  at: number;
  live?: boolean;
}

/** Рекорды при входе в крепость (в приветствии `fort`) */
export interface FortRecIntro {
  /** Рекорд крепости сейчас; null — рекордов ещё нет */
  top: FortRecView | null;
  /** Рекорд до этой игры — его и бьёт команда (0 — не было) */
  base: number;
  /** Свой рекорд до этой игры и свой результат в ней (волн) */
  best: number;
  my: number;
}

/**
 * Событие рекорда после отбитой волны (сообщение `frec`): team — команда побила рекорд крепости (впервые за игру), tie —
 * повторила его, me — свой рекорд растёт (first — впервые за игру). prev — что было до этой игры.
 */
export type FortRecKind = 'team' | 'tie' | 'me';

/** Запись таблицы рекордов → то, что видно на экране */
export function recView(r: FortRunRec | null | undefined, live = false): FortRecView | null {
  if (!r || !(r.wave > 0)) return null;
  return { wave: r.wave, names: [...r.names], at: r.at, ...(live ? { live: true } : {}) };
}

/** «волна / волны / волн» по числу */
export function wavesWord(n: number): string {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return 'волна';
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'волны';
  return 'волн';
}

/** «47 волн» */
export function wavesText(n: number): string {
  return `${n} ${wavesWord(n)}`;
}

/** Ники команды: «Рома», «Рома и Петя», «Рома, Петя и Вася», больше max — «Рома, Петя, Вася и ещё 2» */
export function namesLine(names: readonly string[], max = 3): string {
  const list = names.filter(Boolean);
  if (list.length <= 1) return list[0] ?? '';
  if (list.length <= max) return `${list.slice(0, -1).join(', ')} и ${list[list.length - 1]}`;
  return `${list.slice(0, max).join(', ')} и ещё ${list.length - max}`;
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** Когда поставлен рекорд, по Москве: «сегодня», «вчера», «3 октября» (другой год — «3 октября 2025») */
export function recWhen(at: number, now: number): string {
  if (!(at > 0)) return '';
  const day = mskDay(at);
  if (day === mskDay(now)) return 'сегодня';
  if (day === mskDay(now - 86_400_000)) return 'вчера';
  const [y, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${y !== Number(mskDay(now).slice(0, 4)) ? ` ${y}` : ''}`;
}
