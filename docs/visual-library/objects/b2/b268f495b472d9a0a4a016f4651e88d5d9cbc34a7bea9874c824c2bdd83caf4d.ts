// Интерфейс гонщика «Портовой регаты» (DOM поверх игры): место, круг, время и скорость слева сверху, места всех справа,
// отсчёт «3 · 2 · 1 · Марш!», баннеры (флажки, круг, финиш), «Не туда!», подсказки снизу и карточка итогов с кнопкой
// «Ещё!» (E). В кадре трогаем только то, что поменялось.
import { TOUCH } from '../touch.ts';
import './regatta.css';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}

/** Тики (60 в секунду) → «1:23.45» */
export function fmtRg(ticks: number): string {
  const cs = Math.max(0, Math.round((ticks * 100) / 60));
  return `${Math.floor(cs / 6000)}:${String(Math.floor((cs % 6000) / 100)).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

export interface RgHudRow {
  place: number;
  nick: string;
  me: boolean;
  bot: boolean;
  /** «2/3», «финиш», «сошёл» */
  info: string;
}

export interface RgResultRow {
  place: string;
  nick: string;
  time: string;
  best: string;
  me: boolean;
  dim: boolean;
  again: boolean;
}

export class RegattaHud {
  readonly root: HTMLElement;
  /** Нажали «Ещё!» (кнопка на экране — для телефона; на компьютере — E) */
  onAgain: () => void = () => {};
  private readonly stand: HTMLElement;
  private readonly place: HTMLElement;
  private readonly lap: HTMLElement;
  private readonly time: HTMLElement;
  private readonly best: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly list: HTMLElement;
  private readonly count: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly wrong: HTMLElement;
  private readonly help: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly results: HTMLElement;
  private readonly resTitle: HTMLElement;
  private readonly resSub: HTMLElement;
  private readonly resBody: HTMLElement;
  private readonly resFoot: HTMLElement;
  private readonly again: HTMLButtonElement;
  private readonly keys = new Map<HTMLElement, string>();
  private bannerTimer = 0;
  private countKey = '';

  constructor(parent: HTMLElement) {
    this.root = el('div', 'rg-hud', parent);
    this.root.hidden = true;
    this.stand = el('div', 'rg-stand', this.root);
    this.place = el('div', 'rg-place', this.stand);
    this.lap = el('div', 'rg-lap', this.stand);
    this.time = el('div', 'rg-time', this.stand);
    this.best = el('div', 'rg-best', this.stand);
    this.speed = el('div', 'rg-speed', this.stand);
    this.list = el('div', 'rg-list', this.root);
    this.count = el('div', 'rg-count', this.root);
    this.banner = el('div', 'rg-banner', this.root);
    this.wrong = el('div', 'rg-wrong', this.root, 'Не туда! Разворачивайся');
    this.tip = el('div', 'rg-tip', this.root);
    this.help = el('div', 'rg-help', this.root);
    this.results = el('div', 'rg-results', this.root);
    const card = el('div', 'rg-res-card', this.results);
    this.resTitle = el('div', 'rg-res-title', card);
    this.resSub = el('div', 'rg-res-sub', card);
    this.resBody = el('div', 'rg-res-body', card);
    this.resFoot = el('div', 'rg-res-foot', card);
    this.again = el('button', 'rg-again', card, TOUCH ? 'Ещё заезд!' : 'E — ещё заезд!');
    this.again.type = 'button';
    this.again.addEventListener('click', (e) => {
      e.preventDefault();
      this.onAgain();
    });
  }

  show(on: boolean): void {
    if (this.root.hidden === !on) return;
    this.root.hidden = !on;
    if (!on) {
      this.results.classList.remove('show');
      this.wrong.classList.remove('show');
      this.banner.classList.remove('show');
      this.countKey = '';
    }
  }

  private text(e: HTMLElement, s: string): void {
    if (this.keys.get(e) === s) return;
    this.keys.set(e, s);
    e.textContent = s;
  }

  private html(e: HTMLElement, s: string): void {
    if (this.keys.get(e) === s) return;
    this.keys.set(e, s);
    e.innerHTML = s;
  }

  /** Слева сверху: место, круг, время гонки, лучший круг, скорость (км/ч). */
  setStand(place: number, total: number, lap: number, laps: number, ticks: number, best: number, kmh: number, done: boolean): void {
    this.html(this.place, place > 0 ? `<b>${place}</b>/${total}` : '');
    this.text(this.lap, done ? 'Финиш!' : `Круг ${Math.min(lap, laps)}/${laps}`);
    this.text(this.time, fmtRg(ticks));
    this.text(this.best, best > 0 ? `лучший круг ${fmtRg(best)}` : '');
    this.html(this.speed, `<b>${Math.round(kmh)}</b> км/ч`);
  }

  /** Справа: кто на каком месте. */
  setRows(rows: RgHudRow[]): void {
    const html = rows
      .map((r) => `<div class="rg-row${r.me ? ' me' : ''}"><b>${r.place}</b><span>${esc(r.nick)}${r.bot ? ' 🤖' : ''}</span><i>${esc(r.info)}</i></div>`)
      .join('');
    this.html(this.list, html);
  }

  /** Отсчёт: 3, 2, 1, «Марш!»; null — убрать. */
  setCount(v: string | null): void {
    const key = v ?? '';
    if (key === this.countKey) return;
    this.countKey = key;
    this.count.className = 'rg-count';
    if (!v) return;
    this.count.textContent = v;
    // перезапуск анимации
    void this.count.offsetWidth;
    this.count.className = `rg-count show${v.length > 2 ? ' go' : ''}`;
  }

  /** Баннер на ~2 с: «Флажки! Ускорение», «Круг 2», «Последний круг!», «Финиш!» */
  flash(text: string, gold = false, small = ''): void {
    this.banner.innerHTML = `${esc(text)}${small ? `<small>${esc(small)}</small>` : ''}`;
    this.banner.className = `rg-banner${gold ? ' gold' : ''}`;
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.banner.classList.remove('show'), 2000);
  }

  setWrong(on: boolean): void {
    this.wrong.classList.toggle('show', on);
  }

  setHelp(text: string | null): void {
    this.text(this.help, text ?? '');
    this.help.classList.toggle('show', !!text);
  }

  setTip(text: string | null): void {
    this.text(this.tip, text ?? '');
    this.tip.classList.toggle('show', !!text);
  }

  /** Итоги: null — спрятать. foot — «На площадь через 7 с» / «Ты в деле! Новый заезд через 4 с». */
  setResults(r: { title: string; win: boolean; sub: string; rows: RgResultRow[]; foot: string; canAgain: boolean } | null): void {
    this.results.classList.toggle('show', !!r);
    this.stand.classList.toggle('hide', !!r);
    this.list.classList.toggle('hide', !!r);
    if (!r) return;
    this.text(this.resTitle, r.title);
    this.resTitle.classList.toggle('win', r.win);
    this.text(this.resSub, r.sub);
    const rows = r.rows
      .map((x) => `<tr class="${x.me ? 'me' : ''}${x.dim ? ' dim' : ''}"><td class="pl">${esc(x.place)}</td><td class="n">${esc(x.nick)}${x.again ? ' <em>ещё!</em>' : ''}</td><td>${esc(x.time)}</td><td>${esc(x.best)}</td></tr>`)
      .join('');
    this.html(this.resBody, `<table><tr><th></th><th class="n">Гонщик</th><th>Время</th><th>Лучший круг</th></tr>${rows}</table>`);
    this.text(this.resFoot, r.foot);
    this.again.style.display = r.canAgain ? '' : 'none';
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
