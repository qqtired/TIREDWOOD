// «Ракушка»: док «В игру» (слот bl, над чатом), карточка «Тепло» (слот tl) и полёт копии строки из дока в «Тепло».
// Образец — lab/quiz/v2/js/hud.js (Dock, WarmCard). Всё строится по моделям из hud-model.ts и обновляется на месте:
// строки живут по номеру (id), перерисовывается только изменившаяся, кнопки не пропадают между секундными тиками.
import { OWN_TAG, keyCap, nickClass, ownText, pic, type DockModel, type DockRow, type OwnGuess, type WarmModel } from './hud-model.ts';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

const still = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** «✕» и «↩» штрихами, как микрофон в чате: глифов в шрифте нет, а у ↩ на Маке бывает эмодзи-вид */
const CROSS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
const UNDO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 5.5L4 10l4.5 4.5"/><path d="M4 10h10a5 5 0 0 1 0 10H8"/></svg>';

// ------------------------------------------------------------------ док

/** Строка дока: .k-chat-line как в чате, плюс значок отметки, кнопки загадывающего, «↩ Вернуть» */
export function buildRow(r: DockRow): HTMLElement {
  const row = el('div', `k-chat-line qz-line${r.sys ? ' is-sys' : ''}${r.own ? ' is-own' : ''}${r.sys ? '' : ' is-game'}`);
  row.dataset.id = String(r.id);
  if (r.mark && r.mark !== 'warm') row.classList.add(`is-${r.mark}`);
  if (!r.sys) {
    row.classList.add(nickClass(r.nick));
    const m = row.appendChild(el('span', 'qz-mark'));
    if (r.mark === 'miss') m.innerHTML = pic('q-miss');
    else if (r.mark === 'win' || r.mark === 'check') m.innerHTML = pic('q-win');
    row.appendChild(el('b', '')).textContent = r.nick;
  }
  if (r.got) {
    row.classList.add('is-got');
    row.appendChild(el('span', 'qz-mark', CHECK));
  }
  row.appendChild(el('span', 'qz-text')).textContent = r.text;
  if (r.near) row.classList.add('is-near');
  if (r.near) row.appendChild(el('span', 'k-pill k-pill--gold k-pill--xs qz-near', 'похоже на ответ'));
  if (r.buttons) {
    const cap = (n: string): string => (r.caps ? keyCap(n, 'tr') : '');
    const up = `<button type="button" class="qz-mb qz-mb--warm" data-qz="mark" data-m="warm" title="1 — тепло">${pic('q-warm')}${cap('1')}</button>`;
    const down = `<button type="button" class="qz-mb qz-mb--miss" data-qz="mark" data-m="miss" title="2 — мимо">${pic('q-miss')}${cap('2')}</button>`;
    const win = `<button type="button" class="qz-mb qz-mb--win${r.near ? ' is-big' : ''}" data-qz="mark" data-m="win" title="3 — угадал">${pic('q-win')}${r.near ? '<span>Угадал</span>' : ''}${cap('3')}</button>`;
    // C1: «Горячо!» — сразу сильнее «тепло» (на самой старой строке — клавиша 1 дважды)
    const hot = '<button type="button" class="k-btn k-btn--ghost k-btn--sm qz-hotbtn" data-qz="mark" data-m="hot" title="Горячо! — очень близко">Горячо!</button>';
    row.appendChild(el('span', 'qz-markbtns', (r.near ? win + up + down : up + down + win) + hot));
  }
  if (r.undo) {
    row.classList.add('has-undo');
    const b = row.appendChild(el('button', 'qz-undo', `${UNDO}<span>Вернуть</span>`));
    b.type = 'button';
    b.dataset.qz = 'unmark';
    b.title = 'Вернуть строку — Z';
    b.setAttribute('aria-label', 'Вернуть строку');
  }
  return row;
}

interface DockEntry {
  el: HTMLElement;
  sig: string;
}

export class DockView {
  readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly wait: HTMLElement;
  private readonly rows = new Map<number, DockEntry>();
  /** строки, что уже были «тепло» или «мимо»: вернулись неотмеченными — вспыхивают золотом */
  private readonly marked = new Set<number>();
  private ready = false;

  constructor() {
    this.root = el('div', 'qz-dock');
    this.wait = el('div', 'qz-wait k-faint');
    this.wait.hidden = true;
    this.list = el('div', 'k-chat-list');
    this.root.append(this.wait, this.list);
  }

  /** Вернулась ли строка из «тепло» / «мимо» (для звука «отмена») — читает hud.ts после update */
  returned = 0;

  update(m: DockModel, ctx: { riddler: boolean; checking: boolean; marked: ReadonlySet<number> }): void {
    this.returned = 0;
    this.root.classList.toggle('is-marks', ctx.riddler);
    this.root.classList.toggle('is-checking', ctx.checking);
    const want = new Set(m.rows.map((r) => r.id));
    for (const [id, e] of this.rows) {
      if (want.has(id)) continue;
      e.el.remove();
      this.rows.delete(id);
    }
    let prev: ChildNode | null = null;
    for (const r of m.rows) {
      let e = this.rows.get(r.id);
      if (!e || e.sig !== r.sig) {
        const row = buildRow(r);
        if (e) {
          e.el.replaceWith(row);
        } else if (this.ready) {
          // новая строка: «поп»; вернувшаяся из отметки — золотая вспышка
          const back = !r.mark && this.marked.has(r.id);
          row.classList.add(back ? 'is-back' : 'is-new');
          if (back) this.returned++;
          window.setTimeout(() => row.classList.remove('is-back', 'is-new'), 1400);
        }
        e = { el: row, sig: r.sig };
        this.rows.set(r.id, e);
      }
      e.el.classList.toggle('is-gone', r.fade);
      const at: ChildNode | null = prev ? prev.nextSibling : this.list.firstChild;
      if (e.el !== at) this.list.insertBefore(e.el, at);
      prev = e.el;
    }
    this.marked.clear();
    for (const id of ctx.marked) this.marked.add(id);
    for (const r of m.rows) if (r.mark === 'miss') this.marked.add(r.id);
    this.wait.hidden = m.waiting === 0;
    if (m.waiting) this.wait.textContent = `ещё ${m.waiting} ждут отметки`;
    this.ready = true;
  }

  rowEl(id: number): HTMLElement | null {
    return this.rows.get(id)?.el ?? null;
  }

  clear(): void {
    this.rows.clear();
    this.list.replaceChildren();
    this.marked.clear();
    this.wait.hidden = true;
    this.ready = false;
  }
}

// ------------------------------------------------------------------ моя последняя догадка

/** Маленький статус своей последней догадки над полем чата: текст и отметка тем же тоном, что облачко */
export class OwnView {
  readonly root: HTMLElement;
  private sig = '';

  constructor() {
    this.root = el('div', 'k-chat-line qz-line qz-me');
  }

  /** Показать догадку (меняется только то, что изменилось); при смене отметки — короткий «поп» */
  set(g: OwnGuess): void {
    const sig = `${g.id}|${g.mark}|${g.text}`;
    if (sig === this.sig) return;
    const was = this.sig;
    this.sig = sig;
    this.root.className = `k-chat-line qz-line qz-me${g.mark ? ` is-${g.mark}` : ''}`;
    const icon = g.mark === 'warm' || g.mark === 'hot' ? pic('q-warm') : g.mark === 'miss' ? pic('q-miss') : g.mark === 'win' || g.mark === 'check' ? pic('q-win') : '';
    this.root.innerHTML = `<span class="qz-mark">${icon}</span><span class="qz-text"></span><span class="qz-tag">${OWN_TAG[g.mark]}</span>`;
    this.root.querySelector('.qz-text')!.textContent = ownText(g.text);
    if (was && !still()) {
      void this.root.offsetWidth;
      this.root.classList.add('is-pop');
    }
  }

  /** Сразу убрать и забыть (ушли из ограды) */
  reset(): void {
    this.sig = '';
    this.root.classList.remove('is-gone');
    this.root.remove();
  }

  /** Убрать с экрана: плавно (is-gone), потом из слота */
  hide(): void {
    this.sig = '';
    if (!this.root.isConnected) return;
    if (still()) { this.root.remove(); return; }
    this.root.classList.add('is-gone');
    window.setTimeout(() => { if (!this.sig) this.root.remove(); this.root.classList.remove('is-gone'); }, 520);
  }
}

// ------------------------------------------------------------------ карточка «Тепло»

interface WarmEntry {
  el: HTMLElement;
  text: string;
  hot: boolean;
}

export class WarmView {
  readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly more: HTMLElement;
  private readonly count: HTMLElement;
  private readonly hints: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly rows = new Map<number, WarmEntry>();
  private shownHints = 0;
  private ready = false;

  constructor() {
    this.root = el('div', 'k-plate qz-warm');
    this.root.innerHTML = `<div class="qz-warm-head">${pic('q-warm')}<b>Тепло</b><span class="k-pill k-pill--good k-pill--xs qz-warm-n">0</span></div>`
      + '<div class="qz-warm-more" hidden></div><div class="qz-warm-list"></div>'
      + '<div class="qz-warm-hints" hidden><p class="qz-warm-hl">подсказки</p></div>';
    this.list = this.root.querySelector<HTMLElement>('.qz-warm-list')!;
    this.more = this.root.querySelector<HTMLElement>('.qz-warm-more')!;
    this.count = this.root.querySelector<HTMLElement>('.qz-warm-n')!;
    this.hints = this.root.querySelector<HTMLElement>('.qz-warm-hints')!;
    this.empty = el('div', 'qz-warm-empty k-faint', 'Пока ничего — ждём «тепло»');
    this.list.appendChild(this.empty);
  }

  /**
   * Приземлить строки модели. editable — у загадывающего при наведении «✕»; flying — строки, что ещё летят из дока:
   * они спрятаны (is-wait) до приземления.
   */
  update(m: WarmModel, editable: boolean, flying: ReadonlySet<number>): void {
    this.root.classList.toggle('is-editable', editable);
    const want = new Set(m.rows.map((r) => r.id));
    for (const [id, e] of this.rows) if (!want.has(id)) this.drop(id, e);
    let prev: ChildNode | null = null;
    for (const r of m.rows) {
      let e = this.rows.get(r.id);
      if (!e) {
        const row = el('div', `qz-warm-row ${nickClass(r.nick)}`);
        row.dataset.id = String(r.id);
        row.innerHTML = '<span class="qz-warm-txt"><i class="k-pill k-pill--bad k-pill--xs qz-hot-pill" hidden>Горячо!</i><small></small> <b></b></span>'
          + '<button type="button" class="k-btn k-btn--ghost k-btn--sm qz-warm-hot" data-qz="mark" data-m="hot">Горячо!</button>'
          + `<button type="button" class="qz-warm-x" data-qz="unmark" aria-label="Убрать из «Тепло»" data-tip="Убрать из «Тепло»">${CROSS}</button>`;
        row.querySelector('small')!.textContent = r.nick;
        row.querySelector('b')!.textContent = r.text;
        if (flying.has(r.id)) row.classList.add('is-wait');
        else if (this.ready) {
          row.classList.add('is-new');
          window.setTimeout(() => row.classList.remove('is-new'), 1800);
        }
        e = { el: row, text: r.text, hot: false };
        this.rows.set(r.id, e);
        this.empty.remove();
      }
      // C1: «Горячо!» — первой строкой, красным и крупнее; тепло стало горячо — вспышка
      if (e.hot !== r.hot) {
        const was = e.hot;
        e.hot = r.hot;
        e.el.classList.toggle('is-hot', r.hot);
        e.el.querySelector<HTMLElement>('.qz-hot-pill')!.hidden = !r.hot;
        if (r.hot && !was && this.ready && !flying.has(r.id)) {
          e.el.classList.add('is-new');
          window.setTimeout(() => e.el.classList.remove('is-new'), 1800);
        }
      }
      e.el.hidden = !r.shown;
      const at: ChildNode | null = prev ? prev.nextSibling : this.list.firstChild;
      if (e.el !== at) this.list.insertBefore(e.el, at);
      prev = e.el;
    }
    // на виду «Горячо!» и свежие «тепло» (WARM_SHOWN строк), остальное — «ещё N» (какие видны, решает модель)
    this.more.hidden = m.more === 0;
    if (m.more) this.more.textContent = `ещё ${m.more}`;
    // число — только «тепло», как карточка «Тепло» на табло; «Горячо!» отмечен своей плашкой в строке
    this.count.textContent = String(m.rows.filter((r) => !r.hot).length);
    if (!m.rows.length && !this.empty.isConnected) this.list.appendChild(this.empty);
    // подсказки загадывающего: новая вспыхивает
    if (m.hints.length < this.shownHints) { this.hints.querySelectorAll('.qz-warm-hint').forEach((h) => h.remove()); this.shownHints = 0; }
    for (let i = this.shownHints; i < m.hints.length; i++) {
      const h = el('div', `qz-warm-hint${this.ready ? ' is-new' : ''}`, `<i>${i + 1}</i><span></span>`);
      h.querySelector('span')!.textContent = m.hints[i];
      this.hints.appendChild(h);
      if (this.ready) window.setTimeout(() => h.classList.remove('is-new'), 1800);
    }
    this.shownHints = m.hints.length;
    this.hints.hidden = m.hints.length === 0;
    this.ready = true;
  }

  rowEl(id: number): HTMLElement | null {
    return this.rows.get(id)?.el ?? null;
  }

  /** Строка долетела — показать */
  reveal(id: number): void {
    const row = this.rows.get(id)?.el;
    if (!row) return;
    row.classList.remove('is-wait');
    row.classList.add('is-new');
    window.setTimeout(() => row.classList.remove('is-new'), 1800);
  }

  /** Строка уходит схлопыванием (✕, Z — и тихо у остальных) */
  private drop(id: number, e: WarmEntry): void {
    this.rows.delete(id);
    const row = e.el;
    if (!row.hidden && !still()) {
      row.style.maxHeight = `${row.offsetHeight}px`;
      void row.offsetHeight;
      row.classList.add('is-out');
      window.setTimeout(() => row.remove(), 340);
    } else row.remove();
  }

  clear(): void {
    for (const e of this.rows.values()) e.el.remove();
    this.rows.clear();
    this.hints.querySelectorAll('.qz-warm-hint').forEach((h) => h.remove());
    this.hints.hidden = true;
    this.shownHints = 0;
    this.more.hidden = true;
    this.count.textContent = '0';
    this.list.appendChild(this.empty);
    this.ready = false;
  }
}

// ------------------------------------------------------------------ полёт строки в «Тепло»

/** Копия строки летит из дока в угол: слой без zoom (.qz-world), внутри копия с тем же масштабом, что у HUD */
export class Flyer {
  private readonly layer: HTMLElement;

  constructor(shell: HTMLElement) {
    this.layer = el('div', 'qz-world');
    shell.appendChild(this.layer);
  }

  /** from — где была строка (экранные px), to — куда ляжет; ms — долго ли лететь. Возвращает, когда долетела */
  fly(node: HTMLElement, from: DOMRect, to: DOMRect, ms = 520): Promise<void> {
    const k = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hud-k')) || 1;
    const box = el('div', 'qz-fly');
    const inner = el('div', 'qz-fly-in');
    inner.style.width = `${from.width / k}px`;
    inner.appendChild(node);
    box.appendChild(inner);
    this.layer.appendChild(box);
    const scale = Math.min(1, Math.max(0.5, to.width / from.width));
    const a = box.animate([
      { transform: `translate(${from.left}px, ${from.top}px) scale(1)`, opacity: 1 },
      { transform: `translate(${to.left}px, ${to.top}px) scale(${scale})`, opacity: 0.92 },
    ], { duration: ms, easing: 'cubic-bezier(.45,.05,.25,1)', fill: 'forwards' });
    const end = (): void => { box.remove(); };
    return a.finished.then(end, end);
  }

  /** Горстка конфетти вокруг прямоугольника (плашка «Разгадали!») */
  confetti(around: DOMRect | null): void {
    if (still()) return;
    const r = around ?? new DOMRect(innerWidth / 2 - 100, 24, 200, 50);
    const colors = ['#ffcd4a', '#ff7a5c', '#56c07d', '#8fd9cf', '#fff4dc', '#a9b4ff'];
    for (let i = 0; i < 26; i++) {
      const dot = el('i', 'qz-conf');
      dot.style.background = colors[i % colors.length];
      const x0 = r.left + Math.random() * r.width, y0 = r.top + r.height * (0.3 + Math.random() * 0.4);
      const dx = (Math.random() - 0.5) * 220, dy = 50 + Math.random() * 130, rot = (Math.random() - 0.5) * 720;
      this.layer.appendChild(dot);
      const a = dot.animate([
        { transform: `translate(${x0}px, ${y0}px) rotate(0)`, opacity: 1 },
        { transform: `translate(${x0 + dx * 0.6}px, ${y0 - 36 - Math.random() * 30}px) rotate(${rot * 0.5}deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${x0 + dx}px, ${y0 + dy}px) rotate(${rot}deg)`, opacity: 0 },
      ], { duration: 1000 + Math.random() * 600, easing: 'ease-out', fill: 'forwards' });
      a.finished.then(() => dot.remove(), () => dot.remove());
    }
  }

  dispose(): void {
    this.layer.remove();
  }
}
