// Плашка о связи поверх игры: «связь нестабильна» (сервер молчит несколько секунд) и «связь пропала —
// восстанавливаем» (сцена остаётся, ждём возврата в ту же сессию). Игру не закрывает и клики не перехватывает.
import './linkbanner.css';

export class LinkBanner {
  readonly el: HTMLDivElement;
  private text = '';

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'link-banner';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    this.el.hidden = true;
    root.appendChild(this.el);
  }

  /** null — спрятать */
  show(text: string | null, tone: 'warn' | 'down' = 'warn'): void {
    const next = text ?? '';
    if (next === this.text && this.el.dataset.tone === tone) return;
    this.text = next;
    this.el.textContent = next;
    this.el.dataset.tone = tone;
    this.el.hidden = !next;
  }
}
