// Что знает интерфейс о расписании волн: последняя волна, кто босс, сколько у него HP, где десант. Тела — на
// shared/fortwaves.ts (FORT_LAST_WAVE, isBossWave, isSuperWave, isSeaWave, bossHp, krakenHp) и видах врагов
// shared/fortkinds.ts; признаки видов — kindFlags арсенала (KF_* из ZK).
// Остальной интерфейс ходит только сюда.
import { ZK, Z_BOSS, Z_KRAKEN } from '../../../shared/fortkinds.ts';
import { FORT_LAST_WAVE, KRAKEN_HEAD_BASE_HP, bossHp, bossTier, isBossWave, isSeaWave, isSuperWave, krakenHp, superTier } from '../../../shared/fortwaves.ts';
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

/**
 * Полное HP босса, как его считает сервер (server/fort/director.ts planWave, horde.hpFor, kraken.ts fixHp): волна, число
 * защитников, под которое орда усилена (снимок: tail.defenders в бою), круг по номеру босса. 0 — не знаем (не босс-волна).
 */
export function bossMaxHp(kind: number, wave: number, defenders: number): number {
  if (wave < 1 || defenders < 1) return 0;
  if (kind === Z_KRAKEN) return krakenHp(KRAKEN_HEAD_BASE_HP, wave, defenders);
  if (isBossWave(wave)) return bossHp(wave, defenders, bossTier(wave));
  // супер-волна без Кракена и финал: Барон кругом выше
  if (isSuperWave(wave)) return bossHp(wave, defenders, superTier(wave) + 1);
  return 0;
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
