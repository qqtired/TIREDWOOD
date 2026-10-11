// Прилавок «Крепости» — окно кита справа (.k-window, как на странице lab/ui «Крепость»): лавка оружейника, ворота,
// кристалл, место башни. Немодальный: бегать и стрелять можно, пока он открыт; покупка — 1–9 (номер на углу строки),
// мышью — кликом по строке, на телефоне — касанием; закрыть — E, Esc, крестик или отойти на 4 м. Строки (что, почём,
// почему нельзя) считает shared/fortarsenal.ts — те же, что проверяет сервер. У ворот и кристалла сверху — прочность.
// DOM строк создаётся один раз и меняется, только когда изменился текст.
import type { PanelRow } from '../../shared/fortarsenal.ts';
import { TOUCH } from '../touch.ts';
import { el, num, setText } from './ui/dom.ts';
import { fortImg } from './ui/icons.ts';

export { iconUrl } from './ui/icons.ts';

export type StallKind = 'shop' | 'gate' | 'crystal' | 'tower';

interface RowEl {
  root: HTMLButtonElement;
  icw: HTMLElement;
  name: HTMLElement;
  detail: HTMLElement;
  buy: HTMLElement;
  sig: string;
  id: number;
}

/** Картинка строки: ремонт ворот — молоток (у строки из shared — ворота) */
const ROW_ICON: Readonly<Record<string, string>> = { repair: 'hammer' };

/** Строка подвала по умолчанию */
const FOOT: Record<StallKind, string> = {
  shop: TOUCH ? 'Покупки — до конца игры · коснись строки — купить' : 'Покупки — до конца игры · 1–9 — купить',
  gate: 'Ворота сломали — новые ставят в передышку',
  crystal: 'Лечить можно и в бою — не стой на месте',
  tower: 'Потом здесь же — улучшение до 10-го уровня',
};

const nug = (): string => fortImg('gold', 'ft-nug');

export class StallPanel {
  onBuy: (id: number) => void = () => {};
  onClose: () => void = () => {};
  /** Обёртка справа (слой HUD кита) */
  readonly wrap: HTMLElement;
  private readonly root: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly subEl: HTMLElement;
  private readonly goldEl: HTMLElement;
  private readonly strength: HTMLElement;
  private readonly note: HTMLElement;
  private readonly list: HTMLElement;
  private readonly msgEl: HTMLElement;
  private readonly rows: RowEl[] = [];
  private shownKind: StallKind | null = null;
  private goldShown = -1;
  private gold = 0;
  private strengthKey = '';
  private msgTimer = 0;

  /** parent — слой HUD кита (.k-hud): окно встаёт справа под бейджем */
  constructor(parent: HTMLElement) {
    this.wrap = el('div', 'ft-stall-wrap', parent);
    this.wrap.dataset.mode = 'fort';
    this.wrap.hidden = true;
    this.root = el('section', 'k-window ft-stall', this.wrap);
    this.root.setAttribute('aria-live', 'polite');
    const head = el('header', 'k-win-head', this.root);
    const titles = el('div', 'k-win-titles', head);
    this.titleEl = el('h2', 'k-win-title', titles, 'Лавка оружейника');
    this.subEl = el('p', 'ft-stall-sub', titles);
    const tools = el('div', 'k-win-tools', head);
    this.goldEl = el('span', 'k-pill k-pill--gold ft-gold-pill', tools);
    const close = el('button', 'k-close', tools);
    close.type = 'button';
    close.setAttribute('aria-label', 'Закрыть');
    close.innerHTML = TOUCH ? '' : '<kbd class="k-key k-key--sm">E</kbd>';
    close.addEventListener('click', (e) => {
      e.preventDefault();
      this.onClose();
    });
    const body = el('div', 'k-win-body', this.root);
    this.strength = el('div', 'k-stat ft-strength', body);
    this.strength.hidden = true;
    this.note = el('p', 'ft-tower-note', body, 'Башня общая: награда за сбитых — тем, кто вложился.');
    this.note.hidden = true;
    this.list = el('div', 'ft-rows', body);
    const foot = el('footer', 'k-win-foot', this.root);
    this.msgEl = el('span', 'k-note ft-msg', foot);
  }

  get shown(): boolean {
    return this.shownKind !== null;
  }

  get kind(): StallKind | null {
    return this.shownKind;
  }

  open(kind: StallKind, title: string, sub: string): void {
    this.shownKind = kind;
    setText(this.titleEl, title);
    this.setSub(sub);
    this.root.dataset.kind = kind;
    this.root.setAttribute('aria-label', title);
    this.note.hidden = kind !== 'tower';
    if (kind !== 'gate' && kind !== 'crystal') this.setStrength(0, 0);
    this.foot();
    this.wrap.hidden = false;
    this.root.classList.remove('is-in');
    void this.root.offsetWidth;
    this.root.classList.add('is-in');
  }

  setSub(sub: string): void {
    setText(this.subEl, sub);
    this.subEl.hidden = !sub;
  }

  /** Прочность ворот или кристалла сверху окна; max 0 — спрятать */
  setStrength(hp: number, max: number): void {
    const kind = this.shownKind;
    const key = max > 0 ? `${kind}|${Math.round(hp)}|${max}` : '';
    if (key === this.strengthKey) return;
    this.strengthKey = key;
    this.strength.hidden = !key;
    if (!key) return;
    const v = Math.max(0, Math.min(1, hp / max));
    const crystal = kind === 'crystal';
    const tone = v < 0.35 ? 'k-meter--bad' : crystal ? 'k-meter--info' : 'k-meter--mode';
    this.strength.innerHTML = `${fortImg(crystal ? 'crystal' : 'gate', 'k-stat-ic')}<div class="k-stat-num">${hp > 0 ? `${Math.round(v * 100)}%` : 'пали'}</div>`
      + `<div class="k-stat-cap">Прочность ${num(Math.max(0, hp))} из ${num(max)}</div>`
      + `<span class="k-meter ${tone}" style="--v:${v.toFixed(3)}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span>`;
  }

  close(): void {
    if (!this.shownKind) return;
    this.shownKind = null;
    this.wrap.hidden = true;
  }

  /** Строки панели: до 9; pending — id покупки, ждущей ответа сервера */
  render(rows: readonly PanelRow[], gold: number, pending: number | null): void {
    this.gold = gold;
    if (gold !== this.goldShown) {
      this.goldShown = gold;
      this.goldEl.innerHTML = `${nug()}${num(gold)}`;
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
      const wait = pending === r.id;
      const poor = !r.locked && !r.tag && r.price > gold;
      const sig = `${r.icon}|${r.name}|${r.detail}|${r.tier}|${r.max}|${r.price}|${r.locked}|${r.reason}|${r.tag ?? ''}|${wait}|${poor ? gold : -1}`;
      if (sig === e.sig) continue;
      e.sig = sig;
      const pips = r.tier >= 0 && r.max > 0 && r.max <= 10
        ? `<span class="ft-pips" aria-hidden="true">${Array.from({ length: r.max }, (_, k) => `<i${k < r.tier ? ' class="on"' : ''}></i>`).join('')}</span>` : '';
      e.icw.innerHTML = `${fortImg(ROW_ICON[r.key] ?? r.icon, 'ft-row-ic')}${pips}`;
      const tier = r.tier >= 0 && r.max > 0 ? `<span class="ft-tier">${r.max > 10 ? `ступень ${r.tier}` : `${r.tier} из ${r.max}`}</span>` : '';
      e.name.innerHTML = `<b>${r.name}</b>${tier}`;
      setText(e.detail, r.detail);
      let buy: string;
      if (wait) buy = '<span class="k-pill k-pill--gold">…</span>';
      else if (r.tag) buy = `<span class="k-pill${r.locked ? '' : ' k-pill--good'}">${r.tag}</span>`;
      else if (r.locked) buy = `<span class="ft-why ft-why--lock">${fortImg('lock')}${r.reason}</span>`;
      else if (poor) buy = `<span class="k-pill k-pill--bad">${nug()}${num(r.price)}</span><span class="ft-why">не хватает ${num(r.price - gold)}</span>`;
      else buy = `<span class="k-pill k-pill--gold">${nug()}${num(r.price)}</span>`;
      e.buy.innerHTML = buy;
      e.root.classList.toggle('is-poor', poor);
      e.root.classList.toggle('is-locked', r.locked && !r.tag);
      e.root.setAttribute('aria-label', `${i + 1}: ${r.name}, ${r.locked ? r.reason : r.tag ?? `${r.price} золота`}`);
    }
  }

  private makeRow(i: number): RowEl {
    const root = el('button', 'k-cell ft-row', this.list);
    root.type = 'button';
    if (!TOUCH) el('kbd', 'k-key k-key--tl', root, String(i + 1));
    const icw = el('span', 'ft-row-icw', root);
    const main = el('span', 'ft-row-main', root);
    const name = el('span', 'ft-row-name', main);
    const detail = el('span', 'ft-row-det', main);
    const buy = el('span', 'ft-row-buy', root);
    const row: RowEl = { root, icw, name, detail, buy, sig: '', id: 0 };
    root.addEventListener('click', (e) => {
      e.preventDefault();
      this.onBuy(row.id);
    });
    // мышь в игре не отпускаем: кнопка не забирает фокус
    root.addEventListener('mousedown', (e) => e.preventDefault());
    this.rows[i] = row;
    return row;
  }

  /** Строка мигает: куплено (зелёным) или нельзя (красным) */
  flash(id: number, ok: boolean): void {
    const r = this.rows.find((x) => x.id === id && !x.root.hidden);
    if (!r) return;
    r.root.classList.remove('is-ok', 'is-no');
    void r.root.offsetWidth;
    r.root.classList.add(ok ? 'is-ok' : 'is-no');
    window.setTimeout(() => r.root.classList.remove('is-ok', 'is-no'), 900);
  }

  /** Сообщение в подвале (куплено / почему нельзя) на 2,6 с, потом — строка по умолчанию */
  message(text: string, warn = false): void {
    setText(this.msgEl, text);
    this.msgEl.className = `k-note ft-msg ${warn ? 'k-bad' : 'k-good'}`;
    clearTimeout(this.msgTimer);
    this.msgTimer = window.setTimeout(() => this.foot(), 2600);
  }

  private foot(): void {
    clearTimeout(this.msgTimer);
    this.msgEl.className = 'k-note ft-msg';
    setText(this.msgEl, this.shownKind ? FOOT[this.shownKind] : '');
  }

  /** Золото, которое видит панель (для текста «не хватает») */
  get goldNow(): number {
    return this.gold;
  }

  /** id строки под номером (1–9) или −1 */
  idAt(n: number): number {
    const r = this.rows[n - 1];
    return r && !r.root.hidden ? r.id : -1;
  }
}
