// Экран загрузки «Последний свет»: игрок оказался у острова (высадка, «/isle»), а остров ещё грузится — картина маяка
// в тумане (client/assets/isle/loading.webp, Codex), название и полоса. Вид — тот же, что у экрана загрузки режимов
// (client/ui/transition.css, классы .tr-*), свой только текст и картина. Виден хотя бы 1,2 с — не мигает.
const ART = new URL('../../assets/isle/loading.webp', import.meta.url).href;
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
    this.root = el('div', 'tr isle-cover', parent);
    this.root.setAttribute('aria-hidden', 'true');
    this.root.style.setProperty('--tint', '#d9d3c9');
    this.root.style.setProperty('--focus', '58% 40%');
    const art = el('div', 'tr-art', this.root);
    const pic = el('img', 'tr-pic', art);
    pic.alt = '';
    pic.decoding = 'async';
    pic.draggable = false;
    pic.addEventListener('load', () => art.classList.add('ready'));
    pic.src = ART;
    el('div', 'tr-shade', this.root);
    el('p', 'tr-brand', this.root).innerHTML = 'TIRED<b>WOOD</b>';
    const card = el('div', 'tr-card', this.root);
    card.setAttribute('role', 'status');
    el('h2', 'tr-title', card).textContent = 'Последний свет';
    el('p', 'tr-sub', card).textContent = 'Остров маяка в тумане: мол с местами рыбалки, смотритель Игнат';
    this.bar = el('i', '', el('div', 'tr-bar', card));
    this.status = el('p', 'tr-status', card);
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
