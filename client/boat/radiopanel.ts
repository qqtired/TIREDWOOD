// Кнопка и окно радио на лодке: кнопка «📻 R · станция» справа внизу, пока ты на борту; окно — вкл/выкл, три станции,
// громкость, «Разрешить всем на борту» (только хозяин). Решает сервер — окно только показывает состояние и просит.
// Окно не модальное: лодкой можно править, пока оно открыто. Клавиши — значками на кнопках: 1–3 станция, 0 вкл/выкл,
// − / + громкость; Esc или R — закрыть.
import type { MusicPlayer } from '../music/engine.ts';
import { RADIO_STATIONS, RADIO_VOL_MAX } from '../../shared/boatradio.ts';
import './radio.css';

export interface RadioPanelState {
  /** Я хозяин лодки */
  owner: boolean;
  ownerNick: string;
  /** Мне можно управлять (хозяин или хозяин разрешил всем на борту) */
  can: boolean;
  on: boolean;
  st: number;
  vol: number;
  all: boolean;
  /** Последний отказ — строка внизу */
  note: string | null;
}

export interface RadioPanelActions {
  close(): void;
  toggle(): void;
  power(): void;
  station(i: number): void;
  volume(dv: number): void;
  allowAll(on: boolean): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.appendChild(e);
  return e;
}

function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

function btn(cls: string, parent: HTMLElement, html: string, title: string, fn: () => void): HTMLButtonElement {
  const b = el('button', cls, parent);
  b.type = 'button';
  b.innerHTML = html;
  b.title = title;
  b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  return b;
}

const BANDS = 5;

export class RadioPanel {
  private readonly root: HTMLElement;
  private readonly chip: HTMLButtonElement;
  private readonly chipText: HTMLElement;
  private readonly chipEmoji: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly powerBtn: HTMLButtonElement;
  private readonly rows: Array<{ li: HTMLButtonElement; eq: HTMLElement[] }> = [];
  private readonly volFill: HTMLElement;
  private readonly volText: HTMLElement;
  private readonly volBtns: HTMLButtonElement[] = [];
  private readonly allRow: HTMLElement;
  private readonly allBox: HTMLInputElement;
  private readonly lock: HTMLElement;
  private readonly noteEl: HTMLElement;
  private readonly bands = new Float32Array(BANDS);
  private open_ = false;
  private last = '';
  private st = -1;

  constructor(host: HTMLElement, a: RadioPanelActions) {
    // кнопка на HUD (видна, пока ты на борту)
    this.chip = btn('br-chip', host, '', 'Радио лодки (R)', () => a.toggle());
    this.chipEmoji = el('span', 'br-chip-emoji', this.chip);
    el('kbd', 'br-key', this.chip).textContent = 'R';
    this.chipText = el('span', 'br-chip-text', this.chip);
    this.chip.hidden = true;

    this.root = el('div', 'br', host);
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Радио лодки');
    const head = el('div', 'br-head', this.root);
    el('div', 'br-title', head).textContent = '📻 Радио лодки';
    btn('br-x', head, '✕', 'Закрыть (Esc)', () => a.close()).setAttribute('aria-label', 'Закрыть');
    this.sub = el('div', 'br-sub', this.root);

    this.powerBtn = btn('br-power', this.root, '', 'Включить или выключить (0)', () => a.power());

    const list = el('div', 'br-list', this.root);
    RADIO_STATIONS.forEach((s, i) => {
      const li = btn('br-st', list, '', `${s.title} (${i + 1})`, () => a.station(i));
      el('kbd', 'br-key', li).textContent = String(i + 1);
      el('span', 'br-emoji', li).textContent = s.emoji;
      const meta = el('span', 'br-meta', li);
      el('b', '', meta).textContent = s.title;
      el('small', '', meta).textContent = s.mood;
      const eqBox = el('span', 'br-eq', li);
      const eq = Array.from({ length: BANDS }, () => el('i', '', eqBox));
      this.rows.push({ li, eq });
    });

    const vol = el('div', 'br-vol', this.root);
    el('span', 'br-cap', vol).textContent = 'Громкость';
    this.volBtns.push(btn('br-vb', vol, '−', 'Тише (−)', () => a.volume(-1)));
    const bar = el('div', 'br-bar', vol);
    this.volFill = el('i', '', bar);
    this.volBtns.push(btn('br-vb', vol, '+', 'Громче (+)', () => a.volume(1)));
    this.volText = el('span', 'br-vol-n', vol);

    this.allRow = el('label', 'br-all', this.root);
    this.allBox = el('input', '', this.allRow);
    this.allBox.type = 'checkbox';
    this.allBox.addEventListener('change', () => a.allowAll(this.allBox.checked));
    el('span', '', this.allRow).textContent = 'Разрешить всем на борту';

    this.lock = el('div', 'br-lock', this.root);
    this.noteEl = el('div', 'br-note', this.root);
    // клики по окну не уходят в игру (не захватывают мышь)
    for (const e of [this.root, this.chip]) e.addEventListener('mousedown', (ev) => ev.stopPropagation());
  }

  get isOpen(): boolean {
    return this.open_;
  }

  open(): void {
    this.open_ = true;
    this.root.hidden = false;
    this.last = '';
  }

  close(): void {
    this.open_ = false;
    this.root.hidden = true;
  }

  /** Кнопка на HUD: null — не на борту (спрятать) */
  setChip(c: { title: string; emoji: string; on: boolean } | null): void {
    this.chip.hidden = !c;
    if (!c) return;
    setText(this.chipEmoji, c.emoji);
    setText(this.chipText, c.title);
    this.chip.classList.toggle('on', c.on);
    this.chip.classList.toggle('open', this.open_);
  }

  update(s: RadioPanelState): void {
    const key = JSON.stringify(s);
    if (key === this.last) return;
    this.last = key;
    this.st = s.on ? s.st : -1;
    setText(this.sub, s.owner ? 'Твоя лодка — ты хозяин радио' : `Лодка ${s.ownerNick}`);
    this.powerBtn.innerHTML = s.on ? '<kbd class="br-key">0</kbd> Выключить' : '<kbd class="br-key">0</kbd> Включить';
    this.powerBtn.classList.toggle('on', s.on);
    this.powerBtn.disabled = !s.can;
    this.rows.forEach((r, i) => {
      r.li.classList.toggle('cur', s.on && s.st === i);
      r.li.disabled = !s.can;
    });
    this.volFill.style.width = `${(s.vol / RADIO_VOL_MAX) * 100}%`;
    setText(this.volText, String(s.vol));
    for (const b of this.volBtns) b.disabled = !s.can;
    this.allRow.hidden = !s.owner;
    this.allBox.checked = s.all;
    setText(this.lock, s.owner ? (s.all ? 'Все на борту могут переключать станции' : 'Переключаешь только ты') : s.can ? '✅ Хозяин разрешил всем на борту' : `🔒 Радио включает хозяин лодки — ${s.ownerNick}`);
    this.lock.classList.toggle('locked', !s.can);
    setText(this.noteEl, s.note ?? '');
  }

  /** Каждый кадр, пока окно открыто: эквалайзер у играющей станции */
  tick(p: MusicPlayer | null): void {
    if (p) p.bands(this.bands);
    else this.bands.fill(0);
    this.rows.forEach((r, i) => {
      const live = i === this.st && !!p;
      r.eq.forEach((bar, b) => { bar.style.transform = `scaleY(${live ? 0.15 + Math.min(1, this.bands[b] * 1.6) * 0.85 : 0.15})`; });
    });
  }
}
