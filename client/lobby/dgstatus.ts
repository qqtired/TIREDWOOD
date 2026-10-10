// «Подземелье» на набережной: последняя табличка рекордов от сервера (поле `dg` приветствия набережной и письма `dgSt`).
// null — режим выключен флагом сервера (пещеры нет, E у неё молчит). Читает оформление площади (client/lobby/plaza/dungeon.ts):
// dgStatus() каждый кадр или onDgStatus — когда поменялось.
import type { DgStatus } from '../../shared/dungeon/api.ts';

let current: DgStatus | null = null;
const subs = new Set<(st: DgStatus | null) => void>();

export function dgStatus(): DgStatus | null {
  return current;
}

export function setDgStatus(st: DgStatus | null): void {
  current = st ? { top: st.top, week: st.week } : null;
  for (const fn of subs) fn(current);
}

/** Подписка на изменения; вернёт отписку */
export function onDgStatus(fn: (st: DgStatus | null) => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** Подсказка у зева пещеры: рекорд, если есть */
export function dgHint(st: DgStatus): string {
  const r = st.top[0];
  return r ? `Подземелье · рекорд ${r.waves} волн — ${r.nick}` : 'Подземелье — спуститься (соло-забег)';
}
