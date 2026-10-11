// Общие детали режимов на ките 2.0 (как на странице lab/ui «Режимы», screens/modes.js): карточка места, список гонщиков,
// скорость, ряд клавиш, отсчёт, лента событий и ОДНО окно итогов для всех режимов (картинг, регата, пейнтбол, прятки,
// «Выше облаков», пираты, крысиные бега). Вид — client/ui/kit/modes.css (.mo-*), только токены кита.
// Детали кладутся в слоты HUD (ui.slots), окно итогов — в оболочку рядом с .k-hud (не внутрь: двойной zoom).
// В кадре DOM трогаем только когда поменялось. Чужой текст (ники) — только через esc() или textContent.
import { setCoinText } from '../coin.ts';
import { coinHtml, h } from './dom.ts';
import { rewardParts } from './modetext.ts';
import { escHtml } from './topcenter.ts';
import './modes.css';

/** Чужой текст (ники, текст сервера) в разметку */
export const esc = escHtml;

const MOUSE: Record<string, string> = { ЛКМ: 'l', ПКМ: 'r', Колесо: 'wheel' };

/** Клавиша-колпачок; «ЛКМ» / «ПКМ» / «Колесо» — нарисованной мышью. cls — доп. классы (k-key--sm k-key--tr …) */
export function capHtml(k: string, cls = ''): string {
  const m = MOUSE[k];
  const c = `k-key${cls ? ` ${cls}` : ''}`;
  return m ? `<kbd class="${c}"><i class="k-mouse k-mouse--${m}" aria-label="${k}"></i></kbd>` : `<kbd class="${c}">${esc(k)}</kbd>`;
}

/** Место кружком; 1–3 — медалью (.k-place--1…3) */
export function placeHtml(n: number): string {
  return `<span class="k-place${n >= 1 && n <= 3 ? ` k-place--${n}` : ''}">${n > 0 ? n : '—'}</span>`;
}

/** Текст со 🪙 — монеткой кита (как в тостах) */
export function coinText(e: HTMLElement, text: string): void {
  setCoinText(e, text);
  for (const img of e.querySelectorAll('img.coin')) img.className = 'k-coin';
}

/** Текст элемента — только если поменялся */
function put(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

/**
 * Ряд клавиш одной плашкой (низ-центр, перед стартом): keysRow([['W', 'газ'], [['A', 'D'], 'руль'], ['Space', 'занос']]).
 * Класс key-hint — меню → Управление → «Подсказки клавиш на экране» выключено: ряд прячется (client/ui/menu/menu.css).
 */
export function keysRow(items: ReadonlyArray<readonly [string | readonly string[], string]>): HTMLElement {
  const e = h('div', 'k-plate mo-keys key-hint');
  e.innerHTML = items.map(([k, t]) => {
    const keys = typeof k === 'string' ? [k] : k;
    const caps = keys.length > 1 ? `<span class="k-keys">${keys.map((x) => capHtml(x)).join('')}</span>` : capHtml(keys[0]);
    return `<span class="mo-key">${caps}<em>${esc(t)}</em></span>`;
  }).join('');
  return e;
}

/** Карточка места (верх-лево): «4/6 · Круг 1/3 · 0:21.0», под чертой — «лучший круг 0:36.8». Картинг и регата. */
export class ModeStand {
  readonly root: HTMLElement;
  private readonly place: HTMLElement;
  private readonly of: HTMLElement;
  private readonly lap: HTMLElement;
  private readonly laps: HTMLElement;
  private readonly lapRow: HTMLElement;
  private readonly time: HTMLElement;
  private readonly foot: HTMLElement;
  private readonly best: HTMLElement;

  /** label — что это (трасса) для чтения с экрана; icon — картинка у «лучшего» (uiIcon) */
  constructor(parent: HTMLElement, label = '', icon = '') {
    this.root = h('div', 'k-plate mo-stand');
    if (label) this.root.setAttribute('aria-label', label);
    this.root.innerHTML = `<div class="mo-stand-main"><span class="mo-place"><span>—</span><small>/6</small></span>
      <div class="mo-stand-side"><span class="mo-lap">Круг <b>1</b>/<span>3</span></span><span class="mo-time">0:00.0</span></div></div>
      <div class="mo-stand-foot" hidden>${icon ? `<img class="k-ic" src="${icon}" alt="">` : ''}лучший <b></b></div>`;
    this.place = this.root.querySelector('.mo-place > span')!;
    this.of = this.root.querySelector('.mo-place > small')!;
    this.lapRow = this.root.querySelector('.mo-lap')!;
    this.lap = this.lapRow.querySelector('b')!;
    this.laps = this.lapRow.querySelector('span')!;
    this.time = this.root.querySelector('.mo-time')!;
    this.foot = this.root.querySelector('.mo-stand-foot')!;
    this.best = this.foot.querySelector('b')!;
    parent.append(this.root);
  }

  /** place 0 — ещё не известно (—); laps 0 — без строки круга */
  set(place: number, total: number, lap: number, laps: number): void {
    put(this.place, place > 0 ? String(place) : '—');
    put(this.of, `/${total}`);
    put(this.lap, String(lap));
    put(this.laps, String(laps));
    this.lapRow.hidden = laps <= 0;
  }

  setTime(text: string): void {
    put(this.time, text);
  }

  /** '' — строку «лучший» спрятать */
  setBest(text: string): void {
    this.foot.hidden = !text;
    put(this.best, text);
  }
}

export interface ModeRow {
  place: number;
  nick: string;
  /** Справа: круг «2/3», отставание, коэффициент */
  side: string;
  own?: boolean;
  bot?: boolean;
  /** Цвет кружка перед ником (цвет карта / лодки) */
  dot?: string;
}

/** Список (под бейджем): место медалью, ник, справа — подпись; своя строка — золотом. Регата, бега. */
export class ModeList {
  readonly root: HTMLElement;
  private html = '';

  constructor(parent: HTMLElement, head = '', cls = '') {
    this.root = h('div', `k-plate mo-list${cls ? ` ${cls}` : ''}`);
    if (head) this.root.dataset.head = head;
    parent.append(this.root);
  }

  set(rows: readonly ModeRow[]): void {
    const head = this.root.dataset.head ? `<p class="k-eyebrow">${esc(this.root.dataset.head)}</p>` : '';
    const html = head + rows.map((r) => `<div class="mo-row${r.own ? ' is-own' : ''}">${placeHtml(r.place)}<b>${r.dot ? `<i class="mo-dot" style="background:${esc(r.dot)}"></i>` : ''}<span>${esc(r.nick)}</span>${r.bot ? '<span class="k-pill k-pill--sm">бот</span>' : ''}</b><span class="mo-row-side">${esc(r.side)}</span></div>`).join('');
    if (html === this.html) return;
    this.html = html;
    this.root.innerHTML = html;
  }
}

/** Скорость (низ-право): «79 км/ч» */
export class ModeSpeed {
  readonly root: HTMLElement;
  private readonly num: HTMLElement;

  constructor(parent: HTMLElement, unit = 'км/ч') {
    this.root = h('div', 'k-plate mo-speed', `<b>0</b><span>${esc(unit)}</span>`);
    this.num = this.root.querySelector('b')!;
    parent.append(this.root);
  }

  set(v: number): void {
    put(this.num, String(Math.max(0, Math.round(v))));
  }
}

/** Крупный отсчёт по центру (.k-count в слоте c): set(3) … set('Вперёд!', true); null — убрать */
export class ModeCount {
  private readonly parent: HTMLElement;
  private el: HTMLElement | null = null;
  private key = '';

  constructor(parent: HTMLElement) {
    this.parent = parent;
  }

  set(v: number | string | null, go = false): void {
    const key = v === null ? '' : `${v}|${go}`;
    if (key === this.key) return;
    this.key = key;
    this.el?.remove();
    this.el = null;
    if (v === null) return;
    this.el = h('div', `k-count is-tick${go ? ' k-count--go' : ''}`);
    this.el.textContent = String(v);
    this.parent.append(this.el);
  }
}

/** Лента (верх-лево): мелкие строки на подложке, тают сами; новая — снизу, больше max — старые уходят */
export class ModeFeed {
  readonly root: HTMLElement;
  private readonly max: number;
  private readonly life: number;

  constructor(parent: HTMLElement, max = 4, life = 5500) {
    this.root = h('div', 'mo-feed');
    this.max = max;
    this.life = life;
    parent.append(this.root);
  }

  /** html — своя разметка (ники — через esc); own — твоя строка (золотая обводка), big — важное (золотом) */
  push(html: string, opt: { own?: boolean; big?: boolean } = {}): HTMLElement {
    const line = h('div', `k-plate mo-feed-line${opt.own ? ' is-own' : ''}${opt.big ? ' is-big' : ''}`, html);
    this.root.append(line);
    while (this.root.childElementCount > this.max) this.root.firstElementChild?.remove();
    setTimeout(() => line.classList.add('is-out'), this.life);
    setTimeout(() => line.remove(), this.life + 700);
    return line;
  }

  clear(): void {
    this.root.replaceChildren();
  }
}

export interface ResultsAction {
  /** Что вернёт onAction */
  id: string;
  label: string;
  /** Клавиша на углу кнопки (E, Esc) */
  key?: string;
  tone?: 'go' | 'gold' | 'ghost' | 'stop';
  /** Вторая строка на кнопке («новая игра через 8 с») — меняется через ModeResults.small() */
  small?: string;
}

export interface ResultsRow {
  /** Ячейки — своя разметка (ники — через esc) */
  cells: readonly string[];
  own?: boolean;
  /** Не доехал / выбыл — бледнее */
  dim?: boolean;
}

export interface ResultsSpec {
  /** Акцент режима (data-mode): race, regatta, paintball, hide, skill, pirates … */
  mode?: string;
  eyebrow: string;
  title: string;
  /** Подзаголовок — своя разметка (ники — через esc) */
  sub?: string;
  /** Заголовок красным (проиграл) */
  lose?: boolean;
  /** Шире (две таблицы рядом — пейнтбол) */
  wide?: boolean;
  head?: readonly string[];
  /** С какой колонки — числа справа */
  rightFrom?: number;
  rows?: readonly ResultsRow[];
  /** Своя разметка над таблицей (лучший игрок, значки) */
  extra?: string;
  /** Своя разметка вместо таблицы (пейнтбол — две команды) */
  body?: string;
  /** Награда сразу (иначе — позже через reward()) — текст, 🪙 рисуется монеткой */
  reward?: string;
  /** Строка под наградой («На набережную через 8 с») и полоса 0…1 (null — без полосы) */
  note?: string;
  noteFrac?: number | null;
  actions: readonly ResultsAction[];
}

/** Окно итогов (.k-scrim > .k-window): заголовок, таблица (своя строка золотом), награда, строка «через N с», кнопки с клавишами */
export class ModeResults {
  readonly scrim: HTMLElement;
  /** Нажали кнопку мышью (клавиши режим ловит сам) */
  onAction: (id: string) => void = () => {};
  private rewardEl: HTMLElement | null = null;
  private noteEl: HTMLElement | null = null;
  private noteText: HTMLElement | null = null;
  private noteBar: HTMLElement | null = null;

  /** parent — оболочка (#hud), рядом со слоем кита, не внутри него */
  constructor(parent: HTMLElement) {
    this.scrim = h('div', 'k-scrim mo-scrim');
    this.scrim.hidden = true;
    this.scrim.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-mo-act]');
      if (!b) return;
      e.preventDefault();
      this.onAction(b.dataset.moAct!);
    });
    parent.append(this.scrim);
  }

  show(s: ResultsSpec): void {
    const r = s.rightFrom ?? 99;
    const head = s.head?.length ? `<thead><tr>${s.head.map((x, i) => `<th${i >= r ? ' class="k-r"' : ''}>${x}</th>`).join('')}</tr></thead>` : '';
    const rows = (s.rows ?? []).map((row) => `<tr class="${[row.own ? 'is-own' : '', row.dim ? 'is-dnf' : ''].filter(Boolean).join(' ')}">${row.cells.map((c, i) => `<td${i >= r ? ' class="k-r"' : ''}>${c}</td>`).join('')}</tr>`).join('');
    const table = s.body ?? (rows ? `<table class="k-table">${head}<tbody>${rows}</tbody></table>` : '');
    const btn = (a: ResultsAction): string => `<button class="k-btn${a.tone && a.tone !== 'gold' ? ` k-btn--${a.tone}` : ''}" type="button" data-mo-act="${esc(a.id)}">${esc(a.label)}${a.small !== undefined ? `<small data-mo-small="${esc(a.id)}">${esc(a.small)}</small>` : ''}${a.key ? capHtml(a.key, 'k-key--tr') : ''}</button>`;
    if (s.mode) this.scrim.dataset.mode = s.mode;
    else delete this.scrim.dataset.mode;
    this.scrim.innerHTML = `<section class="k-window mo-results${s.wide ? ' k-window--lg' : ''} is-in" role="dialog" aria-label="${esc(s.title)}">
      <div class="k-results-head"><p class="k-eyebrow">${esc(s.eyebrow)}</p><h2 class="k-results-title${s.lose ? ' is-lose' : ''}">${esc(s.title)}</h2>${s.sub ? `<p class="k-results-sub">${s.sub}</p>` : ''}</div>
      <div class="k-win-body">${s.extra ?? ''}${table}<div class="k-reward" hidden></div>
        <div class="mo-note" hidden><span class="k-meter k-meter--thin k-meter--mode" style="--v:0"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span><span></span></div></div>
      <div class="k-results-actions">${s.actions.map(btn).join('')}</div></section>`;
    this.rewardEl = this.scrim.querySelector('.k-reward');
    this.noteEl = this.scrim.querySelector('.mo-note');
    this.noteBar = this.noteEl!.querySelector('.k-meter');
    this.noteText = this.noteEl!.querySelector('span:last-child');
    if (s.reward) this.reward(s.reward);
    if (s.note) this.note(s.note, s.noteFrac ?? null);
    this.scrim.hidden = false;
  }

  /** Награда: «+40 жетонов за второе место» — число после «+» крупно золотом, 🪙 — монеткой; '' — спрятать */
  reward(text: string): void {
    const e = this.rewardEl;
    if (!e) return;
    e.hidden = !text;
    if (!text) return;
    const p = rewardParts(text);
    if (!p) {
      coinText(e, text.includes('🪙') ? text : `🪙 ${text}`);
      return;
    }
    e.innerHTML = coinHtml();
    e.appendChild(document.createElement('b')).textContent = p.plus;
    coinText(e.appendChild(document.createElement('span')), p.rest);
  }

  /** Строка «через N с» и полоса (frac 0…1, null — без полосы); '' — спрятать */
  note(text: string, frac: number | null = null): void {
    if (!this.noteEl || !this.noteText || !this.noteBar) return;
    this.noteEl.hidden = !text;
    put(this.noteText, text);
    this.noteBar.hidden = frac === null;
    if (frac !== null) {
      const v = (Math.round(Math.max(0, Math.min(1, frac)) * 100) / 100).toFixed(2);
      if (this.noteBar.style.getPropertyValue('--v') !== v) {
        this.noteBar.style.setProperty('--v', v);
        this.noteBar.style.setProperty('--g', v);
      }
    }
  }

  /** Вторая строка на кнопке id */
  small(id: string, text: string): void {
    const e = this.scrim.querySelector<HTMLElement>(`[data-mo-small="${CSS.escape(id)}"]`);
    if (e) put(e, text);
  }

  /** Кнопку id спрятать / показать (нельзя «Ещё заезд» — спрятать) */
  action(id: string, on: boolean): void {
    const b = this.scrim.querySelector<HTMLElement>(`[data-mo-act="${CSS.escape(id)}"]`);
    if (b) b.hidden = !on;
  }

  hide(): void {
    if (this.scrim.hidden) return;
    this.scrim.hidden = true;
    this.scrim.replaceChildren();
    this.rewardEl = this.noteEl = this.noteText = this.noteBar = null;
  }

  get shown(): boolean {
    return !this.scrim.hidden;
  }
}
