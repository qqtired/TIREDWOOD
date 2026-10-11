// Аркада: жетоны и рекорды (решение владельца 1а, 11.10.2026). Считает сервер (server/lobby/arcade.ts) по своему счёту
// партии — тому, что получил, сам переиграв журнал ввода.
// - Жетоны за медаль партии: бронза / серебро / золото — meta.coins игры («Паровозик» и «Замок» 8/15/25, «Тир» 5/10/15).
// - Свой новый рекорд в игре — +10 (раз в день на игру).
// - Занял 1-е место недели или всех времён в игре — +25 (и строка в общий чат).
// - Потолок аркады — 150 🪙 в день по Москве на всё вместе. Дальше — игра за рекорды.
// Рекорды хранятся в статистике профиля (Stats.ar*): таблицы «неделя» и «всё время» собираются из профилей.
import type { Stats } from '../economy.ts';
import type { ArcGameId } from './kit.ts';

export const ARC_DAY_CAP = 150;
export const ARC_RECORD_BONUS = 10;
export const ARC_FIRST_BONUS = 25;
/** Строк в таблице рекордов у автомата */
export const ARC_TOP_SHOWN = 5;

const DAY = 86_400_000;
const MSK = 3 * 3600_000;

/** Номер дня по Москве (UTC+3 круглый год) */
export function arcDay(ms: number): number {
  return Math.floor((ms + MSK) / DAY);
}

/** Номер дня понедельника той недели (неделя — с понедельника 00:00 по Москве) */
export function arcWeek(ms: number): number {
  const day = arcDay(ms);
  // 1 января 1970 — четверг: (day + 3) % 7 — дней с понедельника
  return day - ((day + 3) % 7);
}

const SUFFIX: Record<ArcGameId, 'Tr' | 'Ti' | 'Ca'> = { train: 'Tr', tir: 'Ti', castle: 'Ca' };

/** Поля статистики игры */
export function arcKeys(game: ArcGameId): { best: keyof Stats; wk: keyof Stats; wkBest: keyof Stats; runs: keyof Stats } {
  const s = SUFFIX[game];
  return { best: `arBest${s}`, wk: `arWk${s}`, wkBest: `arWkBest${s}`, runs: `arRuns${s}` };
}

/** Лучший счёт профиля в игре за всё время и за текущую неделю, партий */
export function arcBest(st: Stats, game: ArcGameId, now: number): { best: number; week: number; runs: number } {
  const k = arcKeys(game);
  return { best: st[k.best], week: st[k.wk] === arcWeek(now) ? st[k.wkBest] : 0, runs: st[k.runs] };
}

/** Жетоны аркады, уже полученные сегодня */
export function arcDayCoins(st: Stats, now: number): number {
  return st.arDay === arcDay(now) ? st.arDayCoins : 0;
}

export interface ArcRewardIn {
  /** Медаль партии (0–3) и жетоны за медали этой игры */
  medal: number;
  coins: readonly [number, number, number];
  /** Партия — новый личный рекорд и «+10 за рекорд» в этой игре сегодня ещё не давали */
  record: boolean;
  /** Занял 1-е место недели или всех времён (раньше там был не он) */
  first: boolean;
  /** Жетоны аркады, уже полученные сегодня */
  dayCoins: number;
}

export interface ArcReward {
  medal: number;
  record: number;
  first: number;
  /** Сколько начислено (с учётом потолка) */
  total: number;
  /** Потолок урезал награду (или уже был набран) */
  capped: boolean;
}

export function arcadeReward(r: ArcRewardIn): ArcReward {
  const medal = r.medal > 0 ? r.coins[r.medal - 1] ?? 0 : 0;
  const record = r.record ? ARC_RECORD_BONUS : 0;
  const first = r.first ? ARC_FIRST_BONUS : 0;
  const want = medal + record + first;
  const left = Math.max(0, ARC_DAY_CAP - Math.max(0, r.dayCoins));
  const total = Math.min(want, left);
  return { medal, record, first, total, capped: total < want };
}

/** Строка таблицы рекордов */
export interface ArcRow {
  pid: number;
  nick: string;
  score: number;
}

export interface ArcProfileLike {
  id: number;
  nick: string;
  stats: Stats;
}

/**
 * Таблицы рекордов игры из профилей: за всё время и за текущую неделю (у профиля одна строка — лучшая), по убыванию
 * счёта, при равенстве — кто раньше завёл профиль. n — сколько строк вернуть.
 */
export function arcTables(profiles: Iterable<ArcProfileLike>, game: ArcGameId, now: number, n = ARC_TOP_SHOWN): { week: ArcRow[]; all: ArcRow[] } {
  const k = arcKeys(game);
  const wk = arcWeek(now);
  const all: ArcRow[] = [];
  const week: ArcRow[] = [];
  for (const p of profiles) {
    const st = p.stats;
    if (st[k.best] > 0) all.push({ pid: p.id, nick: p.nick, score: st[k.best] });
    if (st[k.wk] === wk && st[k.wkBest] > 0) week.push({ pid: p.id, nick: p.nick, score: st[k.wkBest] });
  }
  const order = (a: ArcRow, b: ArcRow): number => b.score - a.score || a.pid - b.pid;
  all.sort(order);
  week.sort(order);
  return { week: week.slice(0, n), all: all.slice(0, n) };
}
