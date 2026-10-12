// Плашка о связи сверху по центру (верх-центр кита, client/ui/kit/topcenter.ts — красная .k-event --danger, как на странице
// lab/ui «Связь нестабильна»): «связь нестабильна» (сервер молчит несколько секунд) и «связь пропала — восстанавливаем»
// (сцена остаётся, ждём возврата в ту же сессию). Крутилка вместо иконки; игру не закрывает и клики не перехватывает.
// Текст «заголовок — пояснение» делится на две строки плашки.
import { PRIO, escHtml, type TopCenter } from './kit/topcenter.ts';
import './entry.css';

export class LinkBanner {
  private readonly top: TopCenter;
  private text = '';

  constructor(top: TopCenter) {
    this.top = top;
  }

  /** null — спрятать */
  show(text: string | null): void {
    const next = text ?? '';
    if (next === this.text) return;
    this.text = next;
    if (!next) {
      this.top.clear('link');
      return;
    }
    const [title, rest] = next.split(' — ');
    const sub = rest ? rest[0].toUpperCase() + rest.slice(1) : '';
    this.top.event({
      key: 'link',
      prio: PRIO.link,
      tone: 'danger',
      html: `<span class="k-event-ic"><i class="en-spin en-ev-spin"></i></span><div class="k-event-title">${escHtml(title)}</div>${sub ? `<div class="k-event-sub">${escHtml(sub)}</div>` : ''}`,
    });
  }
}
