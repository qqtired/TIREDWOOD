// Кнопка и панель радио на лодке на ките UI 2.0 (эталон — lab/ui «Рыбалка» → «8. своя лодка», состояние «на якоре · радио»):
// кнопка «Радио» с клавишей R — третья в ряду Z G R справа внизу (общий ряд .fi-boatbar, client/boat/boatbar.ts; пока ты на
// борту); панель .k-panel.fi-radio — над рядом: включить, три станции (клавиши 1–3, у играющей — эквалайзер), громкость,
// «Слышат все на борту» (только хозяин) и строка, кто управляет. Решает сервер — панель только показывает состояние и просит.
// Панель не модальная: лодкой можно править, пока она открыта. Закрыть — R, Esc или кнопка «Радио» (она в нажатом виде).
// Клавиши: 1–3 станция, 0 вкл/выкл, − / + громкость (client/boat/radio.ts).
import type { MusicPlayer } from '../music/engine.ts';
import { RADIO_STATIONS, RADIO_VOL_MAX, RADIO_VOL_MIN } from '../../shared/boatradio.ts';
import type { FishKitUi } from '../lobby/fishkit.ts';
import { iconImg, keyHtml } from '../ui/kit/dom.ts';
import { escHtml } from '../ui/kit/topcenter.ts';
import { boatBar } from './boatbar.ts';
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
}

export interface RadioPanelActions {
  close(): void;
  toggle(): void;
  power(): void;
  station(i: number): void;
  volume(dv: number): void;
  allowAll(on: boolean): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

const EQ = '<span class="k-eq"><i></i><i></i><i></i></span>';
/** Полос эквалайзера в движке (client/music) — в панели три: низ, середина, верх */
const BANDS = 5;
const BAR_BAND = [0, 2, 4];

export class RadioPanel {
  private readonly root: HTMLElement;
  private readonly chip: HTMLButtonElement;
  private readonly chipEq: HTMLElement;
  private readonly power: HTMLInputElement;
  private readonly rows: Array<{ btn: HTMLButtonElement; eq: HTMLElement[] }> = [];
  private readonly vol: HTMLInputElement;
  private readonly allRow: HTMLElement;
  private readonly allBox: HTMLInputElement;
  private readonly note: HTMLElement;
  private readonly bands = new Float32Array(BANDS);
  private open_ = false;
  private last = '';
  private st = -1;
  private vol_ = RADIO_VOL_MIN;
  private dragging = false;

  constructor(kit: FishKitUi, a: RadioPanelActions) {
    const bar = boatBar(kit.slots);
    // кнопка «Радио» в ряду Z G R (видна, пока ты на борту)
    this.chip = el('button', 'k-btn k-btn--sm k-btn--special br-chip', bar, `${iconImg('radio')}Радио${EQ}${keyHtml('R', 'tr')}`);
    this.chip.type = 'button';
    this.chip.setAttribute('aria-label', 'Радио лодки');
    this.chip.hidden = true;
    this.chipEq = this.chip.querySelector<HTMLElement>('.k-eq')!;
    this.chipEq.hidden = true;
    this.chip.addEventListener('click', () => a.toggle());

    this.root = el('div', 'k-panel fi-radio br');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Радио лодки');
    this.root.innerHTML = `<div class="fi-radio-h">${iconImg('radio', '')}<b>Радио лодки</b>`
      + `<label class="k-switch"><input type="checkbox" class="br-power" aria-label="Включить радио"><span class="k-switch-track"></span></label></div>`
      + RADIO_STATIONS.map((s, i) => `<button type="button" class="fi-station" data-st="${i}"><b>${escHtml(s.title)}</b><span>${escHtml(s.mood)}</span>${EQ}${keyHtml(String(i + 1), 'tl', 'sm')}</button>`).join('')
      + `<div class="fi-radio-row">Громкость<input class="k-slider br-vol" type="range" min="${RADIO_VOL_MIN}" max="${RADIO_VOL_MAX}" step="1" aria-label="Громкость"></div>`
      + `<label class="k-switch br-all">Слышат все на борту<input type="checkbox"><span class="k-switch-track"></span></label>`
      + `<p class="fi-radio-note br-lock"></p>`;
    kit.slots.br.insertBefore(this.root, bar);

    this.power = this.root.querySelector<HTMLInputElement>('.br-power')!;
    this.power.addEventListener('change', () => this.ask(() => a.power(), this.power));
    this.root.querySelectorAll<HTMLButtonElement>('.fi-station').forEach((btn, i) => {
      btn.addEventListener('click', () => a.station(i));
      this.rows.push({ btn, eq: Array.from(btn.querySelectorAll<HTMLElement>('.k-eq > i')) });
    });
    this.vol = this.root.querySelector<HTMLInputElement>('.br-vol')!;
    this.vol.addEventListener('pointerdown', () => { this.dragging = true; });
    window.addEventListener('pointerup', () => { this.dragging = false; });
    this.vol.addEventListener('input', () => this.paintVol(Number(this.vol.value)));
    this.vol.addEventListener('change', () => {
      const v = Math.round(Number(this.vol.value));
      this.dragging = false;
      if (v !== this.vol_) a.volume(v - this.vol_);
      this.last = '';
      this.vol.blur();
    });
    this.allRow = this.root.querySelector<HTMLElement>('.br-all')!;
    this.allBox = this.allRow.querySelector<HTMLInputElement>('input')!;
    this.allBox.addEventListener('change', () => this.ask(() => a.allowAll(this.allBox.checked), this.allBox));
    this.note = this.root.querySelector<HTMLElement>('.br-lock')!;

    // кнопки не забирают фокус (пробел — гудок лодки, а не нажатие кнопки); клики по панели и кнопкам не уходят в игру
    for (const b of [this.chip, ...this.rows.map((r) => r.btn)]) b.addEventListener('mousedown', (e) => e.preventDefault());
    for (const e of [this.root, this.chip]) e.addEventListener('mousedown', (ev) => ev.stopPropagation());
  }

  /** Переключатель нажали: просьба серверу, а на экране остаётся то, что скажет сервер (следующий кадр панели) */
  private ask(fn: () => void, box: HTMLInputElement): void {
    fn();
    this.last = '';
    box.blur();
  }

  get isOpen(): boolean {
    return this.open_;
  }

  open(): void {
    this.open_ = true;
    this.root.hidden = false;
    this.chip.classList.add('is-pressed');
    this.last = '';
  }

  close(): void {
    this.open_ = false;
    this.root.hidden = true;
    this.chip.classList.remove('is-pressed');
    this.dragging = false;
  }

  /** Кнопка в ряду: null — не на борту (спрятать); on — радио играет (в кнопке бегут полоски) */
  setChip(c: { title: string; on: boolean } | null): void {
    this.chip.hidden = !c;
    if (!c) return;
    this.chipEq.hidden = !c.on;
    // без всплывающей подсказки (UI 2.0: что важно — видно сразу): станция — в открытой панели, играет — эквалайзер на кнопке
    this.chip.setAttribute('aria-label', c.on ? `Радио лодки: ${c.title}` : 'Радио лодки');
    this.chip.classList.toggle('is-pressed', this.open_);
  }

  update(s: RadioPanelState): void {
    const key = JSON.stringify(s);
    if (key === this.last) return;
    this.last = key;
    this.st = s.on ? s.st : -1;
    this.vol_ = s.vol;
    this.power.checked = s.on;
    this.power.disabled = !s.can;
    this.rows.forEach((r, i) => {
      const cur = s.on && s.st === i;
      r.btn.classList.toggle('is-on', cur);
      r.btn.disabled = !s.can;
    });
    if (!this.dragging) {
      this.vol.value = String(s.vol);
      this.paintVol(s.vol);
    }
    this.vol.disabled = !s.can;
    this.allRow.hidden = !s.owner;
    this.allBox.checked = s.all;
    this.note.classList.toggle('locked', !s.can);
    this.note.innerHTML = s.owner ? (s.all ? 'Все на борту могут переключать станции' : 'Переключаешь только ты')
      : s.can ? `Хозяин (${escHtml(s.ownerNick)}) разрешил всем на борту`
        : `${iconImg('lock')}Радио включает хозяин лодки — ${escHtml(s.ownerNick)}`;
  }

  /** Заливка ползунка (--v: 0…1) */
  private paintVol(v: number): void {
    this.vol.style.setProperty('--v', String(Math.max(0, Math.min(1, (v - RADIO_VOL_MIN) / (RADIO_VOL_MAX - RADIO_VOL_MIN)))));
  }

  /** Нельзя: строка про хозяина мигает */
  flashLock(): void {
    this.note.classList.remove('flash');
    void this.note.offsetWidth;
    this.note.classList.add('flash');
  }

  /** Каждый кадр, пока панель открыта: эквалайзер у играющей станции */
  tick(p: MusicPlayer | null): void {
    if (p) p.bands(this.bands);
    else this.bands.fill(0);
    this.rows.forEach((r, i) => {
      const live = i === this.st && !!p;
      r.eq.forEach((bar, b) => { bar.style.transform = `scaleY(${live ? 0.2 + Math.min(1, this.bands[BAR_BAND[b]] * 1.6) * 0.8 : 0.2})`; });
    });
  }
}
