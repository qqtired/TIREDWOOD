// Ферма: мировой босс «Древо разлома» (design-v11 §11). Просыпается в 19:00 МСК и живёт до 01:00. «Цветение» =
// 2 000 × N, N — фермеры с действием за 72 ч до 19:00 (3–20), фиксируется на старте. Очки — XP со сбора на ферме во
// время события и шишки-ворчуньи (+10, ≤ 30 на игрока). Вклад ≥ 1 % → бафф на 24 ч и +2 репутации за каждый полный 1 %,
// «Последняя капля» — +5. Чистые правила и состояние; таймеры и рассылку ведёт server/farm/boss.ts.
import { mskDay } from './economy.ts';
import type { FarmProgress } from './farm.ts';
import {
  BOSS_ANNOUNCE_MIN_BEFORE, BOSS_END_HOUR, BOSS_HP_PER_FARMER, BOSS_MIN_SHARE, BOSS_N_MAX, BOSS_N_MIN, BOSS_PHASES,
  BOSS_START_HOUR, BUFF_MS, REP_LAST_DROP, REP_PER_BOSS_PERCENT, type FarmBuffKind,
} from './farmdata.ts';

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const MSK = 3 * HOUR;
const BUFF_KINDS: readonly FarmBuffKind[] = ['xp', 'price', 'grow'];

export interface BossWindow {
  /** МСК-день начала события — id события */
  day: string;
  start: number;
  end: number;
  announce: number;
}

/** Текущее (идёт сейчас) или ближайшее событие */
export function bossWindow(now: number): BossWindow {
  const dayStart = Math.floor((now + MSK) / DAY) * DAY - MSK;
  const len = (24 - BOSS_START_HOUR + BOSS_END_HOUR) * HOUR;
  let start = dayStart + BOSS_START_HOUR * HOUR;
  if (now < dayStart + BOSS_END_HOUR * HOUR) start -= DAY;
  return { day: mskDay(start), start, end: start + len, announce: start - BOSS_ANNOUNCE_MIN_BEFORE * 60_000 };
}

export function bossHp(active: number): { n: number; hp: number } {
  const n = Math.min(BOSS_N_MAX, Math.max(BOSS_N_MIN, Math.floor(active)));
  return { n, hp: n * BOSS_HP_PER_FARMER };
}

/** Фаза по цветению: 1 Ворчун, 2 Чих, 3 Щекотно, 4 Пляс */
export function bossPhase(bloom: number, hp: number): number {
  const k = hp > 0 ? bloom / hp : 0;
  let phase = 1;
  for (const t of BOSS_PHASES) if (k >= t) phase++;
  return phase;
}

export interface FarmBossState {
  day: string;
  start: number;
  end: number;
  hp: number;
  n: number;
  bloom: number;
  /** awake — идёт; bloom — расцвело; gone — не успели, ушло спать */
  st: 'awake' | 'bloom' | 'gone';
  /** По pid: очки, подобранные шишки, ник (для итога, даже если игрок ушёл) */
  pts: Record<string, number>;
  cones: Record<string, number>;
  nicks: Record<string, string>;
  /** «Последняя капля»: pid или 0 */
  last: number;
  /** Выданные награды по pid */
  got: Record<string, { buff: FarmBuffKind | null; rep: number }>;
}

export function newBoss(w: BossWindow, active: number): FarmBossState {
  const { n, hp } = bossHp(active);
  return { day: w.day, start: w.start, end: w.end, hp, n, bloom: 0, st: 'awake', pts: {}, cones: {}, nicks: {}, last: 0, got: {} };
}

/** Строки вклада по убыванию */
export function bossRank(s: FarmBossState): { pid: number; pts: number }[] {
  return Object.entries(s.pts).map(([k, v]) => ({ pid: Number(k), pts: v })).filter((r) => r.pts > 0).sort((a, b) => b.pts - a.pts || a.pid - b.pid);
}

export function bossTotal(s: FarmBossState): number {
  let t = 0;
  for (const v of Object.values(s.pts)) t += v;
  return t;
}

export function bossShare(s: FarmBossState, pid: number): number {
  const total = bossTotal(s);
  return total > 0 ? (s.pts[pid] ?? 0) / total : 0;
}

/** Награды цветения: вклад ≥ 1 % — бафф и 2 репутации за каждый полный 1 %; «Последняя капля» — ещё +5 */
export function bossRewards(s: FarmBossState, rng: () => number): Record<string, { buff: FarmBuffKind | null; rep: number }> {
  const out: Record<string, { buff: FarmBuffKind | null; rep: number }> = {};
  for (const { pid } of bossRank(s)) {
    const share = bossShare(s, pid);
    const ok = share >= BOSS_MIN_SHARE - 1e-9;
    const buff = ok ? BUFF_KINDS[Math.min(BUFF_KINDS.length - 1, Math.floor(rng() * BUFF_KINDS.length))] : null;
    const rep = (ok ? REP_PER_BOSS_PERCENT * Math.floor(share * 100 + 1e-9) : 0) + (pid === s.last ? REP_LAST_DROP : 0);
    if (buff || rep) out[pid] = { buff, rep };
  }
  return out;
}

/** Бафф на 24 ч: тот же вид продлевается, просроченные убираются */
export function applyBuff(f: FarmProgress, kind: FarmBuffKind, now: number): void {
  f.buffs = f.buffs.filter((b) => b.until > now && b.kind !== kind);
  f.buffs.push({ kind, until: now + BUFF_MS });
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
}

function numMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (/^\d{1,9}$/.test(k) && num(x) > 0) out[k] = Math.floor(num(x));
  return out;
}

/** Состояние из State.farmBoss (переживает перезапуск); битое — null */
export function normalizeBoss(raw: unknown): FarmBossState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.day)) return null;
  const st = r.st === 'bloom' || r.st === 'gone' ? r.st : 'awake';
  const nicks: Record<string, string> = {};
  if (r.nicks && typeof r.nicks === 'object') {
    for (const [k, v] of Object.entries(r.nicks)) if (/^\d{1,9}$/.test(k) && typeof v === 'string') nicks[k] = v.slice(0, 24);
  }
  const got: FarmBossState['got'] = {};
  if (r.got && typeof r.got === 'object') {
    for (const [k, v] of Object.entries(r.got)) {
      if (!/^\d{1,9}$/.test(k) || !v || typeof v !== 'object') continue;
      const g = v as Record<string, unknown>;
      got[k] = { buff: BUFF_KINDS.includes(g.buff as FarmBuffKind) ? (g.buff as FarmBuffKind) : null, rep: Math.floor(num(g.rep)) };
    }
  }
  const { n, hp } = bossHp(num(r.n));
  return {
    day: r.day, start: num(r.start), end: num(r.end), hp, n, bloom: Math.floor(num(r.bloom)), st,
    pts: numMap(r.pts), cones: numMap(r.cones), nicks, last: Math.floor(num(r.last)), got,
  };
}
