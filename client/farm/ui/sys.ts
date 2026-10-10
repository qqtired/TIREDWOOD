// Сообщения части B1 (shared/farmsys.ts) для окон. Пока FarmSysMsg = never, сервер их не шлёт; здесь — заглушки с ожидаемым
// форматом, чтобы Фургон, доска фермы и тосты заработали сразу, как B1 начнёт слать. Разбор «мягкий»: чужие и кривые
// сообщения молча пропускаем. Когда B1 зафиксирует имена и поля, достаточно поправить parse* ниже (окна не трогаем).
//
// Ожидаемые сообщения (имена из комментария farmsys.ts — «farmVan» и т. п.):
//   { t:'farmVan',  cycle, open, until, offers:[{ slot, crop, n, mult, coins, xp, gourmet? }] }  — ящики Фургона
//   { t:'farmBoss', phase:'sleep'|'awake'|'done', bloom, share, startsAt, top:[{ nick, pct }] }  — Древо разлома
//   { t:'farmHelp', by, crop?, n }                                                              — «Tester7 полил твою тыкву»
//   { t:'farmAch',  id }                                                                         — достижение получено
import { ACHIEVEMENTS, cropById } from '../../../shared/farmdata.ts';
import type { BossState, VanOffer, VanState } from './common.ts';

type Raw = Record<string, unknown>;
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function parseVan(m: Raw): VanState | null {
  if (!Array.isArray(m.offers)) return null;
  const offers: VanOffer[] = [];
  for (const o of m.offers as Raw[]) {
    if (!o || typeof o !== 'object') continue;
    offers.push({ slot: num(o.slot), crop: str(o.crop), n: num(o.n), mult: num(o.mult, 1.3), coins: num(o.coins), xp: num(o.xp), gourmet: o.gourmet === true });
  }
  return { cycle: num(m.cycle, -1), open: m.open === true, until: num(m.until), offers };
}

export function parseBoss(m: Raw): BossState {
  const phase = m.phase === 'awake' || m.phase === 'done' ? m.phase : 'sleep';
  const top = Array.isArray(m.top) ? (m.top as Raw[]).map((t) => ({ nick: str(t?.nick), pct: num(t?.pct) })) : [];
  return { phase, bloom: num(m.bloom), share: num(m.share), startsAt: num(m.startsAt), top };
}

/** Тост по сообщению B1: [заголовок, подпись] или null — тостить нечего */
export function sysToast(m: Raw): [string, string] | null {
  if (m.t === 'farmHelp') {
    const c = cropById(str(m.crop));
    return [`${str(m.by) || 'Сосед'} полил твою грядку`, c ? c.name : ''];
  }
  if (m.t === 'farmAch') {
    const a = ACHIEVEMENTS.find((x) => x.id === str(m.id));
    return a ? ['Достижение получено!', `«${a.name}»`] : null;
  }
  return null;
}
