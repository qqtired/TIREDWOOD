// Плашка о связи сверху по центру (верх-центр кита, client/ui/kit/topcenter.ts — красная .k-event): «связь
// нестабильна» (сервер молчит несколько секунд) и «связь пропала — восстанавливаем» (сцена остаётся, ждём возврата
// в ту же сессию). Игру не закрывает и клики не перехватывает.
import { uiIcon } from './kit/icons.ts';
import { PRIO, escHtml, type TopCenter } from './kit/topcenter.ts';

export class LinkBanner {
  private readonly top: TopCenter;
  private text = '';
  private tone = '';

  constructor(top: TopCenter) {
    this.top = top;
  }

  /** null — спрятать */
  show(text: string | null, tone: 'warn' | 'down' = 'warn'): void {
    const next = text ?? '';
    if (next === this.text && tone === this.tone) return;
    this.text = next;
    this.tone = tone;
    if (!next) {
      this.top.clear('link');
      return;
    }
    this.top.event({
      key: 'link',
      prio: PRIO.link,
      tone: 'danger',
      html: `<span class="k-event-ic"><img src="${uiIcon('warn')}" alt=""></span><div class="k-event-title">${escHtml(next)}</div>`,
    });
  }
}
