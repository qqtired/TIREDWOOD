// Баннеры «Крепости» в одном стиле и по очереди: старт волны, волна отбита и чистая волна, ворота пали, десант,
// боссы. Крупный — по одному (важный встаёт вперёд, текущий неважный укорачивает), мелкие подтверждения
// («башня строится», «гранаты: 3») — своей строкой внизу, тоже по одному. Сообщения пейнтбольного интерфейса
// (centerMessage, bannerMessage) в крепости приходят сюда же — ничего не наслаивается.
import type { Hud } from '../../paintball/hud.ts';
import { el } from './dom.ts';

export type Tone = 'neutral' | 'wave' | 'gold' | 'danger' | 'sea' | 'boss' | 'super' | 'record';

export interface BannerSpec {
  title: string;
  sub?: string;
  /** Медаль слева: номер волны или значок */
  badge?: string;
  tone?: Tone;
  ms?: number;
  /** 0 — обычный, 1 — важный (встаёт вперёд), 2 — срочный (укорачивает текущий) */
  prio?: number;
  /** Тот же ключ — обновить показанный или ждущий, а не добавить второй */
  key?: string;
}

interface Entry extends Required<Omit<BannerSpec, 'key' | 'sub' | 'badge'>> {
  key: string;
  sub: string;
  badge: string;
}

const GAP_MS = 140;
const MIN_SHOW_MS = 900;

export class Banners {
  private readonly big: HTMLElement;
  private readonly badge: HTMLElement;
  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly small: HTMLElement;
  private queue: Entry[] = [];
  private cur: Entry | null = null;
  private curAt = 0;
  private curEnd = 0;
  private freeAt = 0;
  private toasts: { html: string; ms: number }[] = [];
  private toastEnd = 0;
  private toastHtml = '';

  constructor(parent: HTMLElement) {
    this.big = el('div', 'fu-banner', parent);
    this.big.setAttribute('role', 'status');
    this.badge = el('div', 'fu-bbadge', this.big);
    const text = el('div', 'fu-btext', this.big);
    this.title = el('b', 'fu-btitle', text);
    this.sub = el('span', 'fu-bsub', text);
    this.small = el('div', 'fu-toast', parent);
  }

  /** Перехватить сообщения пейнтбольного интерфейса этого экрана */
  adopt(pb: Hud): void {
    pb.centerMessage = (text: string, sub = '', color = '', ms = 1800) => {
      const tone: Tone = color === '#ffd35a' ? 'gold' : color && color !== '' ? 'danger' : 'neutral';
      this.push({ title: text, sub, tone, badge: tone === 'danger' ? '!' : tone === 'gold' ? '★' : '', ms: Math.max(1600, ms), prio: tone === 'danger' ? 2 : 0 });
    };
    pb.bannerMessage = (html: string, ms = 1600) => this.toast(html, ms);
  }

  push(spec: BannerSpec): void {
    const e: Entry = {
      title: spec.title, sub: spec.sub ?? '', badge: spec.badge ?? '', tone: spec.tone ?? 'neutral',
      ms: spec.ms ?? 2600, prio: spec.prio ?? 0, key: spec.key ?? `${spec.tone ?? ''}|${spec.title}`,
    };
    const now = performance.now();
    if (this.cur && this.cur.key === e.key) {
      // тот же баннер — обновить на месте и продлить
      this.cur = e;
      this.render(e);
      this.curEnd = Math.max(this.curEnd, now + Math.min(e.ms, 2600));
      return;
    }
    const i = this.queue.findIndex((q) => q.key === e.key);
    if (i >= 0) this.queue.splice(i, 1);
    let at = this.queue.findIndex((q) => q.prio < e.prio);
    if (at < 0) at = this.queue.length;
    this.queue.splice(at, 0, e);
    if (this.queue.length > 4) this.queue.length = 4;
    // срочный не ждёт неважный: тот уходит через мгновение
    if (this.cur && e.prio >= 2 && this.cur.prio < e.prio) this.curEnd = Math.min(this.curEnd, Math.max(now + 160, this.curAt + 500));
    else if (this.cur && e.prio > this.cur.prio) this.curEnd = Math.min(this.curEnd, Math.max(now + 300, this.curAt + MIN_SHOW_MS));
  }

  /** Убрать баннер: ждущий — из очереди, показанный — уходит сейчас (устарел: «рекордная волна» после побитого рекорда) */
  drop(key: string): void {
    this.queue = this.queue.filter((q) => q.key !== key);
    if (this.cur?.key === key) this.curEnd = Math.min(this.curEnd, performance.now());
  }

  /** Мелкое подтверждение строкой внизу (HTML из своих строк) */
  toast(html: string, ms = 1600): void {
    if (html === this.toastHtml && performance.now() < this.toastEnd) {
      this.toastEnd = performance.now() + ms;
      return;
    }
    if (this.toasts.some((t) => t.html === html)) return;
    this.toasts.push({ html, ms });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  private render(e: Entry): void {
    this.big.className = `fu-banner tone-${e.tone}${e.badge ? ' has-badge' : ''}${this.big.classList.contains('show') ? ' show' : ''}`;
    this.badge.textContent = e.badge;
    this.title.textContent = e.title;
    this.sub.textContent = e.sub;
    this.sub.hidden = !e.sub;
  }

  tick(): void {
    const now = performance.now();
    if (this.cur && now >= this.curEnd) {
      this.cur = null;
      this.big.classList.remove('show');
      this.freeAt = now + GAP_MS + 200;
    }
    if (!this.cur && this.queue.length && now >= this.freeAt) {
      const e = this.queue.shift()!;
      this.cur = e;
      this.curAt = now;
      this.curEnd = now + e.ms;
      this.render(e);
      void this.big.offsetWidth;
      this.big.classList.add('show');
    }
    if (this.toastHtml && now >= this.toastEnd) {
      this.toastHtml = '';
      this.small.classList.remove('show');
      this.toastEnd = now + 160;
    }
    if (!this.toastHtml && this.toasts.length && now >= this.toastEnd) {
      const t = this.toasts.shift()!;
      this.toastHtml = t.html;
      this.toastEnd = now + t.ms;
      this.small.innerHTML = t.html;
      void this.small.offsetWidth;
      this.small.classList.add('show');
    }
  }

  clear(): void {
    this.queue = [];
    this.toasts = [];
    this.cur = null;
    this.toastHtml = '';
    this.big.classList.remove('show');
    this.small.classList.remove('show');
  }

  get showing(): string | null {
    return this.cur?.title ?? null;
  }
}
