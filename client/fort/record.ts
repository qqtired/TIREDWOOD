// Рекорд крепости вне крепости: что последним сказал сервер — статус крепости на набережной (раз в секунду) и рекорд
// из самой крепости (приветствие, побитый в бою). Нужен подписи на экране загрузки крепости, профилю (Esc → Профиль →
// Рекорды) и табличке у входа. Сам рекорд считает и хранит сервер (shared/fortrecord.ts, server/fort/game.ts).
import type { FortStatus } from '../../shared/fort.ts';
import { namesLine, wavesText, type FortRecView } from '../../shared/fortrecord.ts';

let rec: FortRecView | null = null;
let on = false;

/** Статус крепости с набережной (null — режим выключен флагом сервера) */
export function noteFortStatus(st: FortStatus | null): void {
  on = st !== null;
  if (st) rec = st.rec ?? null;
}

/** Рекорд из самой крепости: при входе и когда команда его бьёт */
export function noteFortRecord(r: FortRecView | null): void {
  on = true;
  rec = r;
}

/** Рекорд крепости, который знает клиент (null — рекордов ещё нет) */
export function fortRecord(): FortRecView | null {
  return rec;
}

/** Крепость есть на сервере (пришёл её статус) */
export function fortKnown(): boolean {
  return on;
}

/** Подпись на экране загрузки крепости: рекорд и свой рекорд; null — подпись режима по умолчанию */
export function fortLoadingLine(best: number): string | null {
  const mine = best > 0 ? `твой рекорд — ${wavesText(best)}` : '';
  if (!rec) return mine ? `🏆 ${mine[0].toUpperCase()}${mine.slice(1)}` : null;
  return `🏆 Рекорд: ${wavesText(rec.wave)} — ${namesLine(rec.names)}${mine ? ` · ${mine}` : ''}`;
}
