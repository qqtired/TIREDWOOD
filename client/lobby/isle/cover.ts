// Экран загрузки «Последний свет»: игрок оказался у острова (высадка, «/isle»), а остров ещё грузится — картина маяка
// в тумане (HD-версия client/assets/loading/hd/isle.webp, Codex), название и полоса. Вид — тот же, что у экрана загрузки
// режимов (client/ui/transition.css, классы .tr-*, раскладка сцены «Загрузка комнаты»), свой только текст и картина.
// Виден хотя бы 1,2 с — не мигает.
import { logoHtml } from '../../ui/entry.ts';
import { artUrl } from '../../ui/transition-art.ts';

const MIN_MS = 1200;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}

export class IsleCover {
  private readonly root: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly status: HTMLElement;
  private shownAt = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'tr en-scr isle-cover', parent);
    this.root.setAttribute('aria-hidden', 'true');
    this.root.dataset.mode = 'fishing';
    this.root.style.setProperty('--focus', '58% 40%');
    const art = el('div', 'tr-art', this.root);
    const pic = el('img', 'tr-pic en-art', art);
    pic.alt = '';
    pic.decoding = 'async';
    pic.draggable = false;
    pic.addEventListener('load', () => art.classList.add('ready'));
    pic.src = artUrl('isle');
    el('div', 'en-shade en-shade--bottom', this.root);
    el('div', 'tr-brand', this.root).innerHTML = logoHtml('en-logo--sm');
    const info = el('div', 'tr-info', this.root);
    info.setAttribute('role', 'status');
    el('h2', 'tr-title', info).textContent = 'Последний свет';
    const plate = el('div', 'k-plate tr-plate', info);
    el('p', 'tr-sub', plate).textContent = 'Остров маяка в тумане: мол с местами рыбалки, смотритель Игнат';
    this.bar = el('i', 'tr-fill', el('div', 'k-meter k-meter--lg k-meter--mode tr-meter', plate));
    this.status = el('p', 'tr-status', plate);
  }

  get on(): boolean {
    return this.shownAt > 0;
  }

  show(progress: number): void {
    if (!this.shownAt) {
      this.shownAt = performance.now();
      this.root.classList.add('on');
      this.root.setAttribute('aria-hidden', 'false');
    }
    const k = Math.max(0.05, Math.min(1, progress));
    this.bar.style.transform = `translateX(${-(1 - k) * 96}%)`;
    this.status.textContent = k < 0.86 ? 'Туман расступается…' : k < 1 ? 'Зажигаем маяк…' : 'Причал под ногами';
  }

  /** Убрать, если показан достаточно долго; false — ещё рано */
  hide(): boolean {
    if (!this.shownAt) return true;
    if (performance.now() - this.shownAt < MIN_MS) return false;
    this.shownAt = 0;
    this.root.classList.remove('on');
    this.root.setAttribute('aria-hidden', 'true');
    return true;
  }
}
