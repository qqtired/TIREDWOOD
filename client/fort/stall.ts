// Прилавок «Крепости»: немодальная панель справа (лавка оружейника, ворота, кристалл, место башни). Бегать и стрелять
// можно, пока она открыта; покупка — клавиши 1–9 (на телефоне — касание строки), закрыть — E, Esc или отойти на 4 м.
// Строки (что, почём, почему нельзя) считает shared/fortarsenal.ts — те же, что проверяет сервер. DOM строк
// создаётся один раз и меняется, только когда изменился текст.
import type { PanelRow } from '../../shared/fortarsenal.ts';
import { TOUCH } from '../touch.ts';
import './arsenal.css';

/** Картинки товаров (нарисованы Codex, client/assets/fort/<имя>.webp) */
const ICONS = import.meta.glob('../assets/fort/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export function iconUrl(name: string): string | null {
  return ICONS[`../assets/fort/${name}.webp`] ?? null;
}

export type StallKind = 'shop' | 'gate' | 'crystal' | 'tower';

interface RowEl {
  root: HTMLButtonElement;
  key: HTMLElement;
  img: HTMLImageElement;
  name: HTMLElement;
  detail: HTMLElement;
  pips: HTMLElement;
  price: HTMLElement;
  sig: string;
  id: number;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

const fmt = (n: number): string => Math.floor(n).toLocaleString('ru-RU');

export class StallPanel {
  onBuy: (id: number) => void = () => {};
  onClose: () => void = () => {};
  private readonly root: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly subEl: HTMLElement;
  private readonly goldEl: HTMLElement;
  private readonly list: HTMLElement;
  private readonly msgEl: HTMLElement;
  private readonly rows: RowEl[] = [];
  private shownKind: StallKind | null = null;
  private goldShown = -1;
  private msgTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = el('aside', 'ars-stall', parent);
    this.root.setAttribute('aria-live', 'polite');
    this.root.setAttribute('aria-label', 'Лавка');
    el('div', 'ars-awning', this.root);
    const head = el('div', 'ars-head', this.root);
    const titles = el('div', 'ars-titles', head);
    this.titleEl = el('h2', 'ars-title', titles, 'Лавка оружейника');
    this.subEl = el('div', 'ars-sub', titles, '');
    this.goldEl = el('div', 'ars-gold', head, '💰 0');
    const close = el('button', 'ars-close', head, '✕');
    close.type = 'button';
    close.title = 'Закрыть (E или Esc)';
    close.addEventListener('click', () => this.onClose());
    this.list = el('div', 'ars-rows', this.root);
    this.msgEl = el('div', 'ars-msg', this.root, '');
    el('div', 'ars-foot', this.root, TOUCH ? 'Коснись строки — купить · отойди — закроется' : '1–9 — купить · E или Esc — закрыть · отойди — закроется');
  }

  get shown(): boolean {
    return this.shownKind !== null;
  }

  get kind(): StallKind | null {
    return this.shownKind;
  }

  open(kind: StallKind, title: string, sub: string): void {
    this.shownKind = kind;
    this.titleEl.textContent = title;
    this.subEl.textContent = sub;
    this.root.dataset.kind = kind;
    this.msgEl.textContent = '';
    this.root.classList.add('show');
  }

  setSub(sub: string): void {
    if (this.subEl.textContent !== sub) this.subEl.textContent = sub;
  }

  close(): void {
    if (!this.shownKind) return;
    this.shownKind = null;
    this.root.classList.remove('show');
  }

  /** Строки панели: до 9; pending — id покупки, ждущей ответа сервера */
  render(rows: readonly PanelRow[], gold: number, pending: number | null): void {
    if (gold !== this.goldShown) {
      this.goldShown = gold;
      this.goldEl.textContent = `💰 ${fmt(gold)}`;
      this.goldEl.classList.remove('bump');
      void this.goldEl.offsetWidth;
      this.goldEl.classList.add('bump');
    }
    for (let i = 0; i < Math.max(rows.length, this.rows.length); i++) {
      const r = rows[i];
      let e = this.rows[i];
      if (!r) {
        if (e) e.root.hidden = true;
        continue;
      }
      if (!e) e = this.makeRow(i);
      e.root.hidden = false;
      e.id = r.id;
      const state = pending === r.id ? 'wait' : r.locked ? 'locked' : r.reason ? 'poor' : 'can';
      const pips = r.tier >= 0 && r.max > 0 && r.max <= 12 ? '●'.repeat(Math.min(r.tier, r.max)) + '○'.repeat(Math.max(0, r.max - r.tier)) : r.tier > 0 ? `ур. ${r.tier}` : '';
      const price = r.tag ?? (r.locked ? r.reason : `${fmt(r.price)} 💰`);
      const sig = `${r.icon}|${r.name}|${r.detail}|${pips}|${price}|${state}|${r.reason}`;
      if (sig === e.sig) continue;
      e.sig = sig;
      const url = iconUrl(r.icon);
      if (url && e.img.getAttribute('src') !== url) e.img.src = url;
      e.img.hidden = !url;
      e.name.textContent = r.name;
      e.detail.textContent = r.reason && !r.locked ? `${r.detail} · ${r.reason} 💰` : r.detail;
      e.pips.textContent = pips;
      e.price.textContent = pending === r.id ? '…' : price;
      e.root.className = `ars-row ${state}`;
      e.root.setAttribute('aria-label', `${i + 1}: ${r.name}, ${r.locked ? r.reason : `${r.price} золота`}`);
    }
  }

  private makeRow(i: number): RowEl {
    const root = el('button', 'ars-row', this.list);
    root.type = 'button';
    const key = el('b', 'ars-key', root, String(i + 1));
    const img = el('img', 'ars-ico', root);
    img.alt = '';
    img.draggable = false;
    const text = el('span', 'ars-text', root);
    const top = el('span', 'ars-line', text);
    const name = el('span', 'ars-name', top);
    const pips = el('span', 'ars-pips', top);
    const detail = el('span', 'ars-detail', text);
    const price = el('span', 'ars-price', root);
    const row: RowEl = { root, key, img, name, detail, pips, price, sig: '', id: 0 };
    root.addEventListener('click', (e) => {
      e.preventDefault();
      this.onBuy(row.id);
    });
    this.rows[i] = row;
    return row;
  }

  /** Строка мигает: куплено (зелёным) или нельзя (красным) */
  flash(id: number, ok: boolean): void {
    const r = this.rows.find((x) => x.id === id && !x.root.hidden);
    if (!r) return;
    r.root.classList.remove('flash-ok', 'flash-no');
    void r.root.offsetWidth;
    r.root.classList.add(ok ? 'flash-ok' : 'flash-no');
  }

  message(text: string, warn = false): void {
    this.msgEl.textContent = text;
    this.msgEl.classList.toggle('warn', warn);
    clearTimeout(this.msgTimer);
    this.msgTimer = window.setTimeout(() => (this.msgEl.textContent = ''), 2600);
  }

  /** id строки под номером (1–9) или −1 */
  idAt(n: number): number {
    const r = this.rows[n - 1];
    return r && !r.root.hidden ? r.id : -1;
  }
}

/** Полоска над патронами: «1» маркер, «2» тяжёлый ствол (если куплен), гранаты; в руках — подсвечено */
export class ArmsStrip {
  private readonly root: HTMLElement;
  private readonly marker: HTMLElement;
  private readonly heavy: HTMLElement;
  private readonly heavyImg: HTMLImageElement;
  private readonly heavyN: HTMLElement;
  private readonly gren: HTMLElement;
  private readonly grenN: HTMLElement;
  private sig = '';

  constructor(parent: HTMLElement) {
    this.root = el('div', 'ars-arms', parent);
    const slot = (cls: string, key: string, icon: string): [HTMLElement, HTMLImageElement, HTMLElement] => {
      const s = el('div', `ars-slot ${cls}`, this.root);
      el('b', '', s, key);
      const img = el('img', '', s);
      img.alt = '';
      const url = iconUrl(icon);
      if (url) img.src = url;
      const n = el('span', 'n', s, '');
      return [s, img, n];
    };
    [this.marker] = slot('marker', '1', 'mag');
    this.marker.querySelector('span')!.textContent = 'маркер';
    [this.heavy, this.heavyImg, this.heavyN] = slot('heavy none', '2', 'shotgun');
    [this.gren, , this.grenN] = slot('gren', 'G', 'gren');
  }

  /** gun — в руках (0 — маркер), heavy — второй ствол (0 — нет), other — патронов в убранном, gr / grMax — гранаты */
  set(gun: number, heavy: number, heavyName: string, heavyIcon: string, other: number, gr: number, grMax: number): void {
    const sig = `${gun}|${heavy}|${other}|${gr}|${grMax}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.marker.classList.toggle('on', gun === 0);
    this.heavy.classList.toggle('none', heavy <= 0);
    this.heavy.classList.toggle('on', gun !== 0);
    if (heavy > 0) {
      const url = iconUrl(heavyIcon);
      if (url && this.heavyImg.getAttribute('src') !== url) this.heavyImg.src = url;
      this.heavyN.textContent = gun === 0 ? `${heavyName} · ${other}` : heavyName;
    }
    this.grenN.textContent = `${gr}/${grMax}`;
    this.gren.classList.toggle('empty', gr <= 0);
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }
}
