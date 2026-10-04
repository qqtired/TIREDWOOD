// Всплывающие уведомления сверху по центру: бонус, покупка, «автомат занят». Тают сами.
import { setCoinText } from './coin.ts';
import './toastbig.css';

const MAX = 4;

export class Toasts {
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'toasts';
    parent.appendChild(this.root);
  }

  /**
   * key — вид уведомления: новое заменяет прежнее такого же вида, а не встаёт в стопку (M жмут подряд);
   * sub — вторая строка помельче (заголовок + коротко «что это даёт», как у рыболовного события);
   * big — крупный золотой тост для редкого события на весь сервер (клад Посейдона)
   */
  show(text: string, ms = 3800, key = '', sub = '', big = false): void {
    const t = document.createElement('div');
    t.className = big ? 'toast big' : 'toast';
    if (key) {
      t.dataset.key = key;
      for (const old of Array.from(this.root.children)) if ((old as HTMLElement).dataset.key === key) old.remove();
    }
    // текст сервера: 🪙 — значком, остальное — только как текст
    if (sub) {
      t.classList.add('two');
      const title = t.appendChild(document.createElement('b'));
      title.className = 'toast-title';
      setCoinText(title, text);
      const line = t.appendChild(document.createElement('span'));
      line.className = 'toast-sub';
      setCoinText(line, sub);
    } else setCoinText(t, text);
    this.root.appendChild(t);
    while (this.root.childElementCount > MAX) this.root.firstElementChild?.remove();
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 450);
  }

  clear(): void {
    this.root.textContent = '';
  }
}
