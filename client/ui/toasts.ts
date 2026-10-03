// Всплывающие уведомления сверху по центру: бонус, покупка, «автомат занят». Тают сами.
import { setCoinText } from './coin.ts';

const MAX = 4;

export class Toasts {
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'toasts';
    parent.appendChild(this.root);
  }

  /** key — вид уведомления: новое заменяет прежнее такого же вида, а не встаёт в стопку (M жмут подряд) */
  show(text: string, ms = 3800, key = ''): void {
    const t = document.createElement('div');
    t.className = 'toast';
    if (key) {
      t.dataset.key = key;
      for (const old of Array.from(this.root.children)) if ((old as HTMLElement).dataset.key === key) old.remove();
    }
    // текст сервера: 🪙 — значком, остальное — только как текст
    setCoinText(t, text);
    this.root.appendChild(t);
    while (this.root.childElementCount > MAX) this.root.firstElementChild?.remove();
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 450);
  }

  clear(): void {
    this.root.textContent = '';
  }
}
