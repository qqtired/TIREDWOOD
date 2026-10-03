// Что знает интерфейс о расписании волн: последняя волна, на какой — босс, кто это, где десант.
// Слияние с веткой fort: тела функций — на shared/fortwaves.ts (FORT_LAST_WAVE, isBossWave, isSuperWave,
// bossArchetype, isSeaWave) и флаги видов из ZK. Остальной интерфейс ходит только сюда.
import { FORT_WAVES, ZK, Z_BOSS, waveCounts } from '../../../shared/fort.ts';
import { kindFlags } from '../../../shared/fortarsenal.ts';

export interface BossInfo {
  name: string;
  icon: string;
  /** Супер-босс (Кракен): своя полоса и свой баннер */
  super: boolean;
}

export function lastWave(): number {
  return FORT_WAVES;
}

/** Босс этой волны или null */
export function bossOfWave(wave: number): BossInfo | null {
  if (wave < 1 || wave > lastWave()) return null;
  const counts = waveCounts(wave, 1);
  for (let kind = 0; kind < counts.length; kind++) {
    if (!counts[kind] || !isBossKind(kind)) continue;
    return bossInfo(kind);
  }
  return null;
}

/** Высадка с моря на этой волне (у fort — isSeaWave) */
export function seaWave(_wave: number): boolean {
  return false;
}

export function isBossKind(kind: number): boolean {
  const f = kindFlags(kind);
  return kind === Z_BOSS || f.boss || f.superBoss;
}

export function bossInfo(kind: number): BossInfo {
  const f = kindFlags(kind);
  const k = (ZK[kind] ?? ZK[Z_BOSS]) as (typeof ZK)[number] & { icon?: string };
  return { name: k.name, icon: k.icon ?? (f.superBoss ? '🐙' : '👑'), super: f.superBoss };
}
