// Прятки: очки → жетоны и смешные итоги раунда. Тексты без рода игрока: глагол согласуется с предметом
// («Садовый гном (Петя) продержался 2:31», «Бочка (Маша) так и не нашли»), ник не склоняется.
import { HIDE_TOKENS, TAUNT } from '../../shared/hide.ts';
import { HIDE_KIND, hideCap, hideG, plural, type HideKind } from '../../shared/hideprops.ts';

export function roundTokens(points: number): number {
  return Math.max(0, Math.min(HIDE_TOKENS.roundCap, Math.floor(points / HIDE_TOKENS.perPoints)));
}
/** Бонус за место в матче (rank с нуля) — только когда играли хотя бы трое. */
export function podiumBonus(rank: number, players: number): number {
  return players >= 3 ? HIDE_TOKENS.podium[rank] ?? 0 : 0;
}
export function clock(ticks: number): string {
  const s = Math.max(0, Math.round(ticks / 60));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
/** «на 7-й секунде» в первую минуту, дальше «на 1:05» */
export function when(ticks: number): string {
  const s = Math.max(1, Math.round(ticks / 60));
  return s < 60 ? `на ${s}-й секунде` : `на ${clock(ticks)}`;
}
/** Очки за свою насмешку по расстоянию до ближайшего ищущего. */
export function tauntPoints(dist: number): number {
  return dist <= TAUNT.near[1] ? TAUNT.pts[2] : dist <= TAUNT.near[0] ? TAUNT.pts[1] : TAUNT.pts[0];
}
export function catchText(kind: HideKind, victim: string, catcher: string): string {
  return `💥 ${hideCap(HIDE_KIND[kind].name)} — это ${victim}! Ловец — ${catcher}`;
}
export function paintOutText(nick: string, kind: HideKind | null): string {
  return kind ? `🎨 ${nick}: вся краска ушла на ${HIDE_KIND[kind].acc}` : `🎨 ${nick}: краска кончилась`;
}

/** Что запомнили о игроке за раунд — для итогов. */
export interface RoundStat {
  nick: string;
  /** был прячущимся в начале раунда (или вошёл в подготовку) */
  wasProp: boolean;
  kind: HideKind;
  caught: boolean;
  /** через сколько тиков поиска поймали */
  caughtAt: number;
  survivedEnd: boolean;
  finds: number;
  tauntPts: number;
  misses: number;
  paintOuts: number;
  lastMiss: HideKind | null;
  transforms: number;
}

/** До четырёх строк итогов: кто так и не нашёлся, кто дольше всех продержался, лучший ловец, растратчик краски, дразнила. */
export function roundLines(stats: readonly RoundStat[], winner: 'hunters' | 'props' | 'cancelled'): string[] {
  if (winner === 'cancelled') return ['Раунд без наград: нужны активные соперники'];
  const lines: string[] = [];
  const survivors = stats.filter(s => s.survivedEnd);
  if (survivors.length >= 3) lines.push(`🏆 Так и не нашли: ${survivors.map(s => s.nick).join(', ')}`);
  else for (const s of survivors) lines.push(`🏆 ${hideCap(HIDE_KIND[s.kind].name)} (${s.nick}) — так и не нашли!`);
  const caught = stats.filter(s => s.caught).sort((a, b) => b.caughtAt - a.caughtAt);
  if (caught.length) {
    const best = caught[0];
    lines.push(`⏱ ${hideCap(HIDE_KIND[best.kind].name)} (${best.nick}) ${hideG(best.kind, 'продержался', 'продержалась', 'продержалось')} ${clock(best.caughtAt)}`);
    const quick = caught[caught.length - 1];
    if (caught.length > 1 && quick.caughtAt < 1200) lines.push(`🙈 ${hideCap(HIDE_KIND[quick.kind].name)} (${quick.nick}) ${hideG(quick.kind, 'попался', 'попалась', 'попалось')} уже ${when(quick.caughtAt)}`);
  }
  const hunter = [...stats].sort((a, b) => b.finds - a.finds)[0];
  if (hunter && hunter.finds >= 2) lines.push(`🎯 Лучший ловец — ${hunter.nick}: ${hunter.finds} ${plural(hunter.finds, 'поимка', 'поимки', 'поимок')}`);
  const waster = [...stats].sort((a, b) => b.paintOuts - a.paintOuts || b.misses - a.misses)[0];
  if (waster && waster.paintOuts > 0) lines.push(paintOutText(waster.nick, waster.lastMiss));
  else if (waster && waster.misses >= 4) lines.push(`🎨 ${waster.nick}: ${waster.misses} ${plural(waster.misses, 'клякса', 'кляксы', 'клякс')} в пустые предметы`);
  const teaser = [...stats].sort((a, b) => b.tauntPts - a.tauntPts)[0];
  if (teaser && teaser.tauntPts >= 30) lines.push(`🦆 Главный дразнила — ${teaser.nick}: +${teaser.tauntPts} за насмешки`);
  const shifter = [...stats].sort((a, b) => b.transforms - a.transforms)[0];
  if (shifter && shifter.transforms >= 5) lines.push(`✨ ${shifter.nick}: ${shifter.transforms} ${plural(shifter.transforms, 'превращение', 'превращения', 'превращений')} за раунд`);
  return lines.slice(0, 4);
}
