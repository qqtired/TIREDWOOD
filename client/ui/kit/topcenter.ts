// Верх-центр HUD (кит 2.0, lab/ui/kit/KIT.md §2–§3): ОДНА плашка события — самая важная по приоритету — и под ней
// до трёх тостов. Голосование, связь, шторм, пираты, секундомер — плашки; уведомления — тосты (ui/toasts.ts).
// Крупный баннер по центру (.k-hero: «Уровень N!», «Маяк горит!», «Джекпот!») — тоже здесь: один, по приоритету.
// Слот верх-центра — в своём слое над меню (kit/slots.ts): голосование, связь и тосты видны и на паузе. Высоту стопки
// пишем в --tc-stack (px сцены) на <html>: панели режимов (пираты) встают под неё. Плашку важного события (голосование,
// связь — приоритет от PRIO.link) — ещё и в --tc-event + data-tc-event: меню Esc опускается под неё; тосты и баннеры меню
// не двигают (тост может ненадолго лечь на его верх).
// TopCenterModel — без DOM (тесты: test/ui-kit.test.ts), TopCenter — разметка .k-slot--tc > .k-event + .k-toasts.
// Здесь нельзя подключать kit/icons.ts и kit/dom.ts (import.meta.glob Vite): модель грузят тесты в Node.
import { setCoinText } from '../coin.ts';
import { sfx } from './sfx.ts';

/** Чья плашка важнее: голосование > связь > босс > режим > шторм = пираты > секундомер > прочее */
export const PRIO = { vote: 90, link: 80, boss: 70, mode: 60, storm: 50, pirates: 50, timer: 40, info: 10 } as const;

/** html — содержимое .k-event (иконка, заголовок, подстрока, таймер, полоса, кнопки) — только своя разметка, ники — экранировать */
export type TcEvent = { key: string; prio: number; html: string; tone?: 'danger' | 'good' | 'special'; lamp?: boolean };
/**
 * icon — адрес картинки (uiIcon(id)); title/sub — текст (🪙 рисуется монеткой); life — сколько висит, мс (4200).
 * cls — свои классы карточки; html — своя разметка вместо title/sub (только своя, ники — экранировать): подсказка новичку крепости.
 */
export type TcToast = { key?: string; tone?: 'info' | 'reward' | 'warn' | 'good'; icon: string; title: string; sub?: string; life?: number; cls?: string; html?: string };

/** Чужой текст (ники, текст сервера) в разметку плашки */
export const escHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const MAX_TOASTS = 3;
const LIFE = 4200;
/** Уход тоста (.is-out в kit.css — 0,3 с) */
const OUT_MS = 320;

/** Крупный баннер по центру: title — крупно, sub — плашкой под ним (🪙 — монеткой), dot — цвет кружка рамки ника перед sub;
 *  small — заголовок поменьше (.k-hero-title.is-sm: длинная фраза, «Улов ушёл в море…») */
export type TcHero = { key: string; prio: number; tone: 'gold' | 'win' | 'lose' | 'info'; title: string; sub?: string; dot?: string; life?: number; small?: boolean };
/** Сколько висит баннер (.k-hero.is-play в kit.css — появиться и растаять за 3,2 с) */
const HERO_LIFE = 3300;
/** Зазор под стопкой верх-центра до того, что под ней (--slot-gap) */
const GAP = 10;

type LiveToast = TcToast & { until: number };
type LiveHero = TcHero & { until: number };

export class TopCenterModel {
  private readonly events = new Map<string, TcEvent>();
  private list: LiveToast[] = [];
  private big: LiveHero | null = null;
  private readonly now: () => number;

  constructor(now: () => number = () => performance.now()) {
    this.now = now;
  }

  /** Показать или обновить плашку (тот же key — та же плашка) */
  show(e: TcEvent): void {
    this.events.set(e.key, e);
  }

  hide(key: string): void {
    this.events.delete(key);
  }

  /** Самая важная; при равном приоритете — та, что появилась раньше */
  current(): TcEvent | null {
    let best: TcEvent | null = null;
    for (const e of this.events.values()) if (!best || e.prio > best.prio) best = e;
    return best;
  }

  /** Новый тост — в конец; тот же key заменяет прежний; больше трёх — старые уходят */
  toast(t: TcToast): void {
    if (t.key) this.list = this.list.filter((x) => x.key !== t.key);
    this.list.push({ ...t, until: this.now() + (t.life ?? LIFE) });
    if (this.list.length > MAX_TOASTS) this.list.splice(0, this.list.length - MAX_TOASTS);
  }

  /** От старого к новому */
  toasts(): readonly TcToast[] {
    return this.list;
  }

  /** Убрать просроченные; ближайший срок — когда проверить снова (Infinity — тостов нет) */
  expire(now: number): number {
    this.list = this.list.filter((t) => t.until > now);
    return this.list.reduce((m, t) => Math.min(m, t.until), Infinity);
  }

  /** prefix — убрать только тосты с таким началом ключа (свои тосты режима), без него — все */
  clearToasts(prefix?: string): void {
    this.list = prefix === undefined ? [] : this.list.filter((t) => !t.key?.startsWith(prefix));
  }

  /** Баннер по центру — один: новый вытесняет прежний, если не менее важен или прежний уже растаял; false — не показан */
  hero(h: TcHero): boolean {
    const now = this.now();
    if (this.big && this.big.until > now && this.big.prio > h.prio) return false;
    this.big = { ...h, until: now + (h.life ?? HERO_LIFE) };
    return true;
  }

  /** Баннер, что сейчас на экране (null — нет или растаял) */
  currentHero(): TcHero | null {
    return this.big && this.big.until > this.now() ? this.big : null;
  }

  /** Убрать баннер этого вида; true — он и был на экране */
  clearHero(key: string): boolean {
    if (this.big?.key !== key) return false;
    this.big = null;
    return true;
  }
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

/** Текст с 🪙 — монетками кита */
function coinText(e: HTMLElement, text: string): void {
  setCoinText(e, text);
  for (const img of e.querySelectorAll('img.coin')) img.className = 'k-coin';
}

const still = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class TopCenter {
  /** Слот .k-slot--tc: кнопки плашек (голосование) слушают клики здесь */
  readonly root: HTMLElement;
  /** Слот .k-slot--c для крупного баннера (без него — тесты — баннеров нет) */
  private readonly centre: HTMLElement | null;
  private readonly model = new TopCenterModel();
  private readonly stack: HTMLElement;
  private heroEl: HTMLElement | null = null;
  private heroTimer = 0;
  private readonly shown = new Map<TcToast, HTMLElement>();
  private ev: HTMLElement | null = null;
  private evKey = '';
  private evCls = '';
  private evHtml = '';
  private timer = 0;

  constructor(slot: HTMLElement, centre: HTMLElement | null = null) {
    this.root = slot;
    this.centre = centre;
    this.stack = el('div', 'k-toasts');
    this.stack.setAttribute('aria-live', 'polite');
    slot.append(this.stack);
    // высота стопки — в px сцены (offsetHeight — без zoom слоя); меняется — пересчитать
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => this.publish()).observe(slot);
  }

  /** Показать или обновить плашку; можно звать каждый кадр — DOM меняется, только когда поменялась разметка */
  event(e: TcEvent): void {
    this.model.show(e);
    this.renderEvent();
  }

  clear(key: string): void {
    if (!this.evKey && !this.model.current()) return;
    this.model.hide(key);
    this.renderEvent();
  }

  toast(t: TcToast): void {
    this.model.toast(t);
    this.renderToasts();
    sfx.play('toast');
    this.schedule();
  }

  clearToasts(prefix?: string): void {
    this.model.clearToasts(prefix);
    this.renderToasts();
  }

  /** Крупный баннер по центру на ~3 с; менее важный, пока висит более важный, не показывается — false (можно позже ещё раз) */
  hero(h: TcHero): boolean {
    if (!this.centre || !this.model.hero(h)) return false;
    this.heroEl?.remove();
    const box = el('div', `k-hero k-hero--${h.tone} is-play`);
    box.appendChild(el('p', h.small ? 'k-hero-title is-sm' : 'k-hero-title')).textContent = h.title;
    if (h.sub) {
      const sub = box.appendChild(el('span', 'k-hero-sub'));
      if (h.dot) sub.appendChild(el('span', 'pz-tier-dot')).style.setProperty('--tc', h.dot);
      coinText(sub.appendChild(el('span', '')), h.sub);
    }
    this.centre.append(box);
    this.heroEl = box;
    clearTimeout(this.heroTimer);
    this.heroTimer = window.setTimeout(() => {
      if (this.heroEl === box) this.clearHero(h.key);
    }, h.life ?? HERO_LIFE);
    return true;
  }

  /** Убрать баннер этого вида (ушли с набережной) */
  clearHero(key: string): void {
    if (!this.model.clearHero(key)) return;
    this.heroEl?.remove();
    this.heroEl = null;
  }

  private renderEvent(): void {
    const e = this.model.current();
    if (!e) {
      if (this.ev) this.leave(this.ev);
      this.ev = null;
      this.evKey = this.evCls = this.evHtml = '';
      this.publish();
      return;
    }
    // ниже связи — плашка режима: пока открыто меню Esc, её не видно (иначе она лежит на шапке окна меню)
    const cls = `k-event${e.tone ? ` k-event--${e.tone}` : ''}${e.lamp ? ' k-lamp' : ''}${e.prio < PRIO.link ? ' is-minor' : ''}`;
    if (!this.ev || this.evKey !== e.key) {
      this.ev?.remove();
      const box = el('div', cls);
      box.setAttribute('role', 'status');
      box.innerHTML = e.html;
      this.root.insertBefore(box, this.stack);
      if (!still()) box.animate([{ opacity: 0, transform: 'translateY(-10px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
      this.ev = box;
      this.evKey = e.key;
      this.evCls = cls;
      this.evHtml = e.html;
      this.publish();
      return;
    }
    if (cls !== this.evCls) this.ev.className = this.evCls = cls;
    if (e.html !== this.evHtml) {
      this.evHtml = e.html;
      morph(this.ev, e.html);
    }
  }

  /** Плашка уходит плавно (без анимации — сразу) */
  private leave(box: HTMLElement): void {
    if (still()) { box.remove(); return; }
    box.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-8px)' }], { duration: 220, easing: 'ease-in' }).finished.then(() => box.remove(), () => box.remove());
  }

  /** Высоты на <html>: --tc-stack — вся стопка (панели под ней), --tc-event + data-tc-event — важная плашка (меню под ней) */
  private publish(): void {
    const root = document.documentElement;
    const stack = this.root.offsetHeight;
    if (stack < 1) root.style.removeProperty('--tc-stack');
    else root.style.setProperty('--tc-stack', `${stack + GAP}px`);
    const e = this.model.current();
    const ev = this.ev && e && e.prio >= PRIO.link ? this.ev.offsetHeight : 0;
    if (ev < 1) {
      delete root.dataset.tcEvent;
      root.style.removeProperty('--tc-event');
    } else {
      root.dataset.tcEvent = '';
      root.style.setProperty('--tc-event', `${ev + GAP}px`);
    }
  }

  private renderToasts(): void {
    const live = new Set(this.model.toasts());
    for (const [t, box] of this.shown) {
      if (live.has(t)) continue;
      this.shown.delete(t);
      box.classList.remove('is-new');
      box.classList.add('is-out');
      setTimeout(() => box.remove(), OUT_MS);
    }
    // новые — сверху, у плашки события (как pushToast на странице кита)
    for (const t of live) {
      if (this.shown.has(t)) continue;
      const box = el('div', `k-toast k-toast--${t.tone ?? 'info'}${t.cls ? ` ${t.cls}` : ''} is-new`);
      const ic = box.appendChild(el('span', 'k-toast-ic'));
      if (t.icon) {
        const img = ic.appendChild(document.createElement('img'));
        img.src = t.icon;
        img.alt = '';
      }
      if (t.html) box.insertAdjacentHTML('beforeend', t.html);
      else {
        coinText(box.appendChild(el('div', 'k-toast-title')), t.title);
        if (t.sub) coinText(box.appendChild(el('div', 'k-toast-sub')), t.sub);
      }
      this.shown.set(t, box);
      this.stack.prepend(box);
    }
  }

  private schedule(): void {
    clearTimeout(this.timer);
    const next = this.model.expire(performance.now());
    if (next === Infinity) return;
    this.timer = window.setTimeout(() => {
      this.model.expire(performance.now());
      this.renderToasts();
      this.schedule();
    }, Math.max(0, next - performance.now()) + 20);
  }
}

/** Обновить плашку на месте: меняются только верхние узлы, что изменились, — кнопки голосования живут между тиками таймера */
function morph(box: HTMLElement, html: string): void {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const next = Array.from(tpl.content.childNodes);
  const prev = Array.from(box.childNodes);
  if (next.length !== prev.length) {
    box.replaceChildren(...next);
    return;
  }
  next.forEach((n, i) => {
    if (!prev[i].isEqualNode(n)) prev[i].replaceWith(n);
  });
}
