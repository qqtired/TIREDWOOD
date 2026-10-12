// Древо разлома: подписи для плашки сверху и для доски фермы — без DOM (test/farm-ui.test.ts).
import { BOSS_ANNOUNCE_MIN_BEFORE, BOSS_PHASES } from '../../../shared/farmdata.ts';
import type { FarmBossView } from '../../../shared/farmsys.ts';
import { clockHour, fmtLeft, mskHour } from './fmt.ts';

/** Фазы по цветению: Ворчун 0–25 %, Чих 25–50 %, Щекотно 50–75 %, Пляс 75–100 % (farmdata BOSS_PHASES) */
export const PHASE_NAMES: readonly string[] = ['Ворчун', 'Чих', 'Щекотно', 'Пляс'];

/** Доля цветения 0…1 */
export function bloomShare(b: Pick<FarmBossView, 'bloom' | 'hp'>): number {
  return Math.min(1, Math.max(0, b.bloom / Math.max(1, b.hp)));
}

/** Строка про свой вклад: «ты 3-й, вклад 8 %» или приглашение помочь */
export function contribLine(b: Pick<FarmBossView, 'bloom' | 'mine' | 'place'>): string {
  const share = b.bloom > 0 ? Math.round((b.mine / b.bloom) * 100) : 0;
  return b.mine > 0 && b.place > 0 ? `ты ${b.place}-й, вклад ${share} %` : 'собирай урожай — помогай Древу';
}

/** Заголовок и подстрока Древа для доски фермы; sleeping — спит до wakeAt (мс серверного времени) */
export function treeLine(b: FarmBossView | null, now: number, wakeAt: number, wakeClock: string): { title: string; sub: string; sleeping: boolean } {
  if (b?.st === 'awake') {
    return { title: `Цветение ${Math.round(bloomShare(b) * 100)} %`, sub: `Фаза «${PHASE_NAMES[Math.min(3, Math.max(0, b.phase - 1))]}» · ${contribLine(b)}`, sleeping: false };
  }
  if (b?.st === 'soon') return { title: 'Древо просыпается', sub: 'скоро цветение — собирай урожай', sleeping: false };
  if (b?.st === 'bloom') return { title: 'Древо расцвело', sub: 'спасибо всем, кто помогал', sleeping: false };
  return { title: `Древо разлома проснётся в ${wakeClock}`, sub: `через ${fmtLeft(wakeAt - now)} · собирай урожай — вырастишь Древо`, sleeping: true };
}

/** Плашка события сверху: «скоро» (с анонса за 5 мин) и «цветёт»; null — плашки нет */
export interface TreeEventData {
  kind: 'soon' | 'awake';
  title: string;
  sub: string;
  /** Цветёт: процент, имя фазы и строка про вклад — для золотого акцента в подстроке */
  pct: number;
  phaseName: string;
  contrib: string;
  /** Справа: сколько осталось до начала или «до 01:00» */
  timer: string;
  /** Полоса 0…1 */
  v: number;
  /** Отметки фаз на полосе, доли 0…1 (только цветёт) */
  marks: readonly number[];
  phase: number;
}

export function treeEvent(b: FarmBossView | null, now: number): TreeEventData | null {
  if (!b) return null;
  if (b.st === 'soon') {
    const left = Math.max(0, b.start - now);
    return { kind: 'soon', title: 'Древо разлома просыпается', sub: 'Собирай урожай — растишь Древо', pct: 0, phaseName: '', contrib: '', timer: fmtLeft(left), v: 1 - Math.min(1, left / (BOSS_ANNOUNCE_MIN_BEFORE * 60_000)), marks: [], phase: 0 };
  }
  if (b.st === 'awake') {
    const pct = Math.round(bloomShare(b) * 100);
    const phaseName = PHASE_NAMES[Math.min(3, Math.max(0, b.phase - 1))];
    const contrib = contribLine(b);
    return {
      kind: 'awake',
      title: `Цветение ${pct} %`,
      sub: `Фаза «${phaseName}» · ${contrib}`,
      pct,
      phaseName,
      contrib,
      timer: `до ${clockHour(mskHour(b.end))}`,
      v: bloomShare(b),
      marks: BOSS_PHASES,
      phase: b.phase,
    };
  }
  return null;
}
