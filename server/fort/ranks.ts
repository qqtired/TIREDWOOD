import type { FortRun } from './ledger.ts';

// Учёт живёт столько же, сколько объект забега, включая выход и возврат через ledger.
const counts = new WeakMap<FortRun, { fix: number; sapped: number }>();

export function rankCounts(run: FortRun): { fix: number; sapped: number } {
  return counts.get(run) ?? { fix: 0, sapped: 0 };
}

export function addRankCount(run: FortRun, kind: 'fix' | 'sapped'): void {
  const value = rankCounts(run);
  value[kind]++;
  counts.set(run, value);
}
