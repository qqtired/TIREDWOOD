// Рекорды «Подземелья»: таблица за всё время (State.dgTop) и за неделю (State.dgWeek, с понедельника 00:00 по Москве —
// сбрасывается сама: неделя сменилась — таблица читается пустой). Ключ — отбито волн (больше — выше), при равенстве —
// меньше игрового времени, потом — кто раньше. У каждого профиля одна строка — лучшая; смена ника переписывает строки.
import { DG_TOP_SHOWN, type DgRec, type DgStatus } from '../../shared/dungeon/api.ts';

/** Сколько строк храним (у входа видно DG_TOP_SHOWN; остальное — для «твоего места за неделю») */
export const DG_KEEP = 50;

export interface DgWeekTable {
  /** Начало недели, мс (понедельник 00:00 МСК) */
  from: number;
  top: DgRec[];
}

const MSK = 3 * 3600_000;
const DAY = 86_400_000;

/** Понедельник 00:00 по Москве (UTC+3 круглый год) той недели, в которую попадает now, мс */
export function dgWeekStart(now: number): number {
  const day = Math.floor((now + MSK) / DAY);
  // 1 января 1970 — четверг: (day + 3) % 7 — дней с понедельника
  return (day - ((day + 3) % 7)) * DAY - MSK;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Выше ли a, чем b, в таблице */
function better(a: DgRec, b: DgRec): number {
  return b.waves - a.waves || a.ms - b.ms || a.at - b.at;
}

/** Строки из JSON: только целые, у профиля одна (лучшая), по порядку, не больше DG_KEEP */
export function parseDgTop(raw: unknown): DgRec[] {
  if (!Array.isArray(raw)) return [];
  let top: DgRec[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const waves = Math.floor(num(o.waves));
    const pid = o.pid;
    if (!Number.isSafeInteger(pid) || (pid as number) <= 0 || typeof o.nick !== 'string' || !o.nick || waves <= 0 || waves > 100_000) continue;
    top = addDgRun(top, { pid: pid as number, nick: o.nick.slice(0, 40), waves, ms: Math.max(0, Math.floor(num(o.ms))), at: Math.max(0, num(o.at)) }).top;
  }
  return top;
}

export function parseDgWeek(raw: unknown): DgWeekTable {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return { from: Math.max(0, Math.floor(num(r.from))), top: parseDgTop(r.top) };
}

/**
 * Забег в таблицу (у rec обязательно pid): прежняя строка профиля заменяется, только если новая лучше.
 * improved — строка профиля стала лучше (или появилась); rank — место профиля в таблице с 1 (0 — не в таблице).
 */
export function addDgRun(top: readonly DgRec[], rec: DgRec): { top: DgRec[]; improved: boolean; rank: number } {
  const old = top.find((r) => r.pid === rec.pid);
  let next: DgRec[];
  let improved = false;
  if (old && better(rec, old) >= 0) next = [...top];
  else {
    improved = true;
    next = top.filter((r) => r.pid !== rec.pid);
    next.push(rec);
    next.sort(better);
    next = next.slice(0, DG_KEEP);
  }
  return { top: next, improved: improved && next.some((r) => r.pid === rec.pid), rank: next.findIndex((r) => r.pid === rec.pid) + 1 };
}

/** Таблица недели на момент now: неделя сменилась — пустая */
export function weekRows(week: DgWeekTable | undefined, now: number): DgRec[] {
  return week && week.from === dgWeekStart(now) ? week.top : [];
}

/** Табличка у входа: топ каждой таблицы */
export function dgStatusOf(top: readonly DgRec[] | undefined, week: DgWeekTable | undefined, now: number): DgStatus {
  return { top: (top ?? []).slice(0, DG_TOP_SHOWN), week: weekRows(week, now).slice(0, DG_TOP_SHOWN) };
}

/** Новый ник профиля — во всех его строках. true — что-то поменялось */
export function renameDg(tables: ReadonlyArray<readonly DgRec[] | undefined>, pid: number, nick: string): boolean {
  let changed = false;
  for (const t of tables) {
    for (const r of t ?? []) {
      if (r.pid === pid && r.nick !== nick) {
        r.nick = nick;
        changed = true;
      }
    }
  }
  return changed;
}
