// Тревоги «Крепости» — тостами под плашкой волны (верх-центр кита, не больше трёх): «Ворота трещат!», «Липучка лезет
// на стену!», атаки боссов. Строка тревоги «🚪 Ворота трещат! · что делать» → картинка по эмодзи, заголовок и подстрока
// (ui/text.ts). Та же тревога ещё висит — тост просто обновляется, а не встаёт второй. Тревога про ворота или кристалл
// ещё и ставит стрелку у края экрана туда, куда бежать (ui/coach.ts EdgeArrows), пока висит.
import type { TopCenter } from '../../ui/kit/topcenter.ts';
import { fortIcon } from './icons.ts';
import { alarmText } from './text.ts';

export type AlarmTarget = 'gate' | 'crystal' | null;

export class Alarms {
  private readonly top: TopCenter;
  /** Куда бежать и до какого времени (performance.now) */
  target: AlarmTarget = null;
  private targetUntil = 0;

  constructor(top: TopCenter) {
    this.top = top;
  }

  show(text: string, ms = 2600, target: AlarmTarget = null): void {
    const a = alarmText(text);
    this.top.toast({ key: `al-${a.title}`, tone: a.tone, icon: fortIcon(a.icon), title: a.title, sub: a.sub || undefined, life: Math.max(2200, ms) });
    if (target) {
      this.target = target;
      this.targetUntil = performance.now() + Math.max(2200, ms);
    }
  }

  /** Цель тревоги, пока она висит */
  currentTarget(): AlarmTarget {
    if (this.target && performance.now() > this.targetUntil) this.target = null;
    return this.target;
  }

  clear(): void {
    this.target = null;
  }
}
