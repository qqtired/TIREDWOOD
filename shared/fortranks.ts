export type FortRankId = 'gunner' | 'fixer' | 'sapper' | 'builder';

export const FORT_RANKS: readonly { id: FortRankId; name: string }[] = [
  { id: 'gunner', name: 'Лучший стрелок' },
  { id: 'fixer', name: 'Ремонтник' },
  { id: 'sapper', name: 'Сапёр' },
  { id: 'builder', name: 'Зодчий' },
];
export const FT_TOK_RANK = 5;
export interface FortRankStat { id: number; damage: number; fix: number; sapped: number; invest: number }

const METRICS = { gunner: 'damage', fixer: 'fix', sapper: 'sapped', builder: 'invest' } as const;

/** Все совладельцы положительного максимума получают звание, в порядке FORT_RANKS. */
export function pickRanks(stats: readonly FortRankStat[]): Map<number, FortRankId[]> {
  const awards = new Map<number, FortRankId[]>();
  for (const { id } of FORT_RANKS) {
    const metric = METRICS[id];
    let max = 0;
    for (const stat of stats) max = Math.max(max, stat[metric]);
    if (max <= 0) continue;
    for (const stat of stats) {
      if (stat[metric] !== max) continue;
      const ranks = awards.get(stat.id) ?? [];
      ranks.push(id);
      awards.set(stat.id, ranks);
    }
  }
  return awards;
}
