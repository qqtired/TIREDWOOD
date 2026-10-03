// Что знает интерфейс о расписании волн: последняя волна, на какой — босс, кто это, где десант. Тела — на
// shared/fortwaves.ts (FORT_LAST_WAVE, isBossWave, isSuperWave, isSeaWave) и круге боссов BOSS_CYCLE из
// shared/fortkinds.ts (его же берёт директор волн); признаки видов — kindFlags арсенала (KF_* из ZK).
// Остальной интерфейс ходит только сюда.
import { BOSS_CYCLE, ZK, Z_BOSS, Z_KRAKEN } from '../../../shared/fortkinds.ts';
import { FORT_LAST_WAVE, bossNumber, isBossWave, isSeaWave, isSuperWave } from '../../../shared/fortwaves.ts';
import { kindFlags } from '../../../shared/fortarsenal.ts';

export interface BossInfo {
  name: string;
  icon: string;
  /** Супер-босс (Кракен): своя полоса и свой баннер */
  super: boolean;
}

export function lastWave(): number {
  return FORT_LAST_WAVE;
}

/** Босс этой волны или null: каждая 25-я — Кракен, каждая 7-я — следующий по кругу */
export function bossOfWave(wave: number): BossInfo | null {
  if (wave < 1 || wave > lastWave()) return null;
  if (isSuperWave(wave)) return bossInfo(Z_KRAKEN);
  if (!isBossWave(wave)) return null;
  return bossInfo(BOSS_CYCLE[(bossNumber(wave) - 1) % BOSS_CYCLE.length] ?? Z_BOSS);
}

/** Высадка с моря на этой волне */
export function seaWave(wave: number): boolean {
  return isSeaWave(wave);
}

export function isBossKind(kind: number): boolean {
  const f = kindFlags(kind);
  return f.boss || f.superBoss;
}

export function bossInfo(kind: number): BossInfo {
  const f = kindFlags(kind);
  const k = ZK[kind] ?? ZK[Z_BOSS];
  return { name: k.name, icon: k.icon || (f.superBoss ? '🐙' : '👑'), super: f.superBoss };
}
