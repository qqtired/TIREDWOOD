// Что знает интерфейс о расписании волн: последняя волна, кто босс, сколько у него HP, где десант. Тела — на
// shared/fortwaves.ts (FORT_LAST_WAVE, isBossWave, isSuperWave, isSeaWave, bossHp, krakenHp) и видах врагов
// shared/fortkinds.ts; признаки видов — kindFlags арсенала (KF_* из ZK).
// Остальной интерфейс ходит только сюда.
import { ZK, Z_BOSS, Z_GOLEM, Z_KRAKEN } from '../../../shared/fortkinds.ts';
import { FORT_LAST_WAVE, KRAKEN_HEAD_BASE_HP, bossHp, bossTier, isBossWave, isSeaWave, isSuperWave, krakenHp, superTier } from '../../../shared/fortwaves.ts';
import { kindFlags } from '../../../shared/fortarsenal.ts';
import { siegeBossNumber } from '../../../shared/fortsiege.ts';

export interface BossInfo {
  name: string;
  icon: string;
  /** Супер-босс (Кракен): своя полоса и свой баннер */
  super: boolean;
}

let last = FORT_LAST_WAVE;

export function lastWave(): number {
  return last;
}

/** «Крепость 50»: последняя волна забега — 50 (сервер прислал стены Ф50); без флага — как было */
export function setLastWave(n: number): void {
  last = n;
}

/** Дуга от первого увиденного остатка текущей паузы. Колокол сокращает остаток, а не перезапускает дугу. */
export class WaveCountdown {
  private phase = -1;
  private wave = -1;
  private duration = 0;

  update(phase: number, wave: number, leftS: number): number {
    const seconds = Math.max(0, Math.ceil(leftS));
    if (phase !== this.phase || wave !== this.wave) this.duration = 0;
    this.phase = phase;
    this.wave = wave;
    this.duration = Math.max(this.duration, seconds);
    return this.duration > 0 ? seconds / this.duration : 0;
  }

  reset(): void {
    this.phase = this.wave = -1;
    this.duration = 0;
  }
}

/**
 * Полное HP босса, как его считает сервер (server/fort/director.ts planWave, horde.hpFor, kraken.ts fixHp): волна, число
 * защитников, под которое орда усилена (снимок: tail.defenders в бою), круг по номеру босса. 0 — не знаем (не босс-волна).
 */
export function bossMaxHp(kind: number, wave: number, defenders: number, siege = false): number {
  if (wave < 1 || defenders < 1) return 0;
  if (kind === Z_KRAKEN) return krakenHp(KRAKEN_HEAD_BASE_HP, wave, defenders);
  const mul = kind === Z_GOLEM ? 3 : 1;
  const n = siege ? siegeBossNumber(wave) : 0;
  if (n > 0) return bossHp(wave, defenders, Math.floor((n - 1) / 3)) * mul;
  if (!siege && isBossWave(wave)) return bossHp(wave, defenders, bossTier(wave)) * mul;
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
