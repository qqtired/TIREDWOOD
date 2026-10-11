// Примерочная: окно кита справа (желейка в зеркале — левее). Вкладки: цвет, узор, глаза, шапка, аксессуар, питомец.
// Своё (бесплатное и купленное) надевается сразу: сервер сохраняет и показывает всем. Чужое — только примерка
// на своей желейке и кнопка «Купить». Закрыли — примерка снимается, остаётся надетое.
// Окно — .k-scrim > .k-window (как «Хозяйство» и окна рыбалки), но без затемнения и не модальное: сцена слева — это
// и есть примерка (мышью по ней крутят желейку). Закрыть — ✕, «Готово», Esc, E; шаг игрока не выбрасывает (сцена глушит).
// Подарочный код — та же форма, что в меню (Профиль → Подарки и коды, client/ui/menu/gift.ts).
import { itemPrice } from '../../shared/economy.ts';
import {
  DEFAULT_OUTFIT, ITEMS, PALETTE, PALETTE_NAMES, TIER_NAMES, isOwned, isItemVisible, itemOf, sameOutfit, slotKey, withItem,
  type Item, type Outfit, type Slot,
} from '../../shared/outfit.ts';
import { collectionCount } from '../../shared/fishrules.ts';
import { ISLE_ITEMS, REWARD_INFO, isleNeedOf, needOf } from '../../shared/fishstyle.ts';
import { ISLE_TOTAL, isleCaught } from '../../shared/islestyle.ts';
import { FISH2 } from '../lobby/fish2.ts';
import { FISH_ICONS } from './fishicons.ts';
import { isleSpecies, isleVisible, species } from './fishrewards.ts';
import type { MeState } from '../scene.ts';
import type { GiftResultCode } from '../../shared/gifts.ts';
import { GiftForm } from './menu/gift.ts';
import { coinHtml, iconImg, keyHtml } from './kit/dom.ts';
import { uiIcon } from './kit/icons.ts';
import { sfx } from './kit/sfx.ts';
import rotateOrbitUrl from '../assets/wardrobe/rotate-orbit.png';
import './wardrobe.css';

type Tab = 'c' | Slot;

const TABS: ReadonlyArray<readonly [Tab, string]> = [['c', 'Цвет'], ['p', 'Узор'], ['e', 'Глаза'], ['h', 'Шапка'], ['a', 'Аксессуар'], ['s', 'Питомец']];
const SLOTS: readonly Slot[] = ['p', 'e', 'h', 'a', 's'];
/** Под желейкой в пикселях сцены 1440×900 (× --hud-k): 68 стрелки + 43 кнопка «Спереди» + 6 зазор + 12 низ + 3 до тела. */
export const WARDROBE_FOOTER_PX = 132;

/** Усы и спасательный круг — свои SVG: эмодзи 🥸 и 🛟 появились только в Unicode 13–14, в старых шрифтах их нет */
const MUSTACHE_SVG =
  '<svg viewBox="0 0 36 36" width="1.25em" height="1.25em">'
  + '<path d="M18 15.6C20.2 12 25.2 11.6 27.8 14.8C29 16.2 30.9 16.2 31.7 14.3C32.2 13.1 31.7 11.6 30.4 11.3C33.9 10.9 35.6 15.6 33 19.7'
  + 'C29.9 24.4 22 24.6 18 20.4C14 24.6 6.1 24.4 3 19.7C0.4 15.6 2.1 10.9 5.6 11.3C4.3 11.6 3.8 13.1 4.3 14.3C5.1 16.2 7 16.2 8.2 14.8'
  + 'C10.8 11.6 15.8 12 18 15.6Z" fill="#8d5631" stroke="#3f2312" stroke-width="1.3" stroke-linejoin="round"/>'
  + '<path d="M20.4 15.4c2-1.7 4.6-1.8 6.4-.2M15.6 15.4c-2-1.7-4.6-1.8-6.4-.2" fill="none" stroke="#c48a5a" stroke-width="1.1" stroke-linecap="round"/>'
  + '</svg>';
const LIFEBUOY_SVG =
  '<svg viewBox="0 0 36 36" width="1.1em" height="1.1em">'
  + '<circle cx="18" cy="18" r="11.5" fill="none" stroke="#fff4e6" stroke-width="8"/>'
  + '<circle cx="18" cy="18" r="11.5" fill="none" stroke="#e5333b" stroke-width="8" stroke-dasharray="9.03 9.03" stroke-dashoffset="4.52"/>'
  + '<circle cx="18" cy="18" r="15.5" fill="none" stroke="#7a1d22" stroke-width="1.1"/>'
  + '<circle cx="18" cy="18" r="7.5" fill="none" stroke="#7a1d22" stroke-width="1.1"/>'
  + '</svg>';

/** Простые контуры повторяют силуэт новых 3D-вещей. */
const premiumIcon = (shape: string): string => `<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">${shape}</svg>`;
const PREMIUM_ICONS = {
  'h:devil': premiumIcon('<path d="M6 29Q20 13 34 29" stroke="#ba2931" stroke-width="4"/><path d="M11 24C4 18 7 9 10 5C9 13 16 15 16 21M24 21C25 15 31 13 30 5C34 11 35 19 29 24" fill="#f34b3e" stroke="#c52833"/>'),
  'a:deviltail': premiumIcon('<path d="M9 8C32 2 30 17 16 22S12 36 28 29" stroke="#ea4437" stroke-width="4"/><path d="m25 25 10-1-5 11Z" fill="#ef4838" stroke="#c82835"/>'),
  'h:astronaut': premiumIcon('<path d="M8 29V19a12 12 0 0 1 24 0v10Z" fill="#e4edf0" stroke="#9daeba"/><path d="M11 20h18v7H11Z" fill="#26394f" stroke="#26394f"/><path d="M15 22h10" stroke="#66e4de"/><path d="m29 11 3-6"/><circle cx="33" cy="5" r="2" fill="#ff8259"/><path d="M7 32h26"/>'),
  'h:storm': premiumIcon('<path d="m12 28 10-23 7 23Z" fill="#62539c"/><path d="M4 29q16-6 32 0l-1 4H5Z" fill="#393257"/><path d="m20 13-3 7h6l-4 7" stroke="#a6ece8"/>'),
  'a:jetpack': premiumIcon('<rect x="6" y="8" width="10" height="23" rx="4" fill="#dce8eb"/><rect x="24" y="8" width="10" height="23" rx="4" fill="#dce8eb"/><path d="M16 14h8v13h-8Z" fill="#293e51"/><path d="M9 33v3m4-3v3m14-3v3m4-3v3" stroke="#68deda"/><path d="M8 13h6m12 0h6" stroke="#ec8b4d"/>'),
  'e:prism': premiumIcon('<path d="m3 20 8-8 8 8-8 8Zm18 0 8-8 8 8-8 8Z" fill="#9ceef4"/><path d="m3 20 8 8 8-8m2 0 8 8 8-8" fill="#9a84d4"/><path d="M18 20h4M5 10h30" stroke="#e8c88a"/>'),
};
const PREMIUM_DETAILS: Record<string, string> = {
  'h:astronaut': 'Белый шлем, бирюзовое стекло и сигнальная антенна.',
  'h:storm': 'Высокий колпак со звёздами и золотым кристаллом.',
  'a:jetpack': 'Два реактивных баллона за спиной. Полёт не даёт.',
  'e:prism': 'Гранёные стёкла в цветах северного сияния.',
};

/** Значок вещи на карточке (у узоров вместо значка — образец ткани); эмодзи — не новее Unicode 12 */
const ICONS: Record<string, string> = {
  'e:normal': '👀', 'e:sleepy': '😴', 'e:angry': '😠', 'e:happy': '😊',
  'e:glasses': '👓', 'e:shades': '🕶️', 'e:patch': '☠️', 'e:monocle': '🧐',
  'h:none': '∅', 'h:cap': '🧢', 'h:panama': '👒', 'h:ushanka': '❄️', 'h:fisher': '🎣', 'h:bandana': '🏴‍☠️',
  'h:helmet': '⛑️', 'h:sailor': '⚓', 'h:tophat': '🎩', 'h:crown': '👑', 'h:fool': '🃏',
  'a:none': '∅', 'a:scarf': '🧣', 'a:mustache': MUSTACHE_SVG, 'a:bowtie': '🎀', 'a:headphones': '🎧',
  'a:lifebuoy': LIFEBUOY_SVG, 'a:chain': '⛓️', 'a:epaulets': '🎖️',
  // награды коллекции рыб (shared/fishstyle.ts): очки — эмодзи, остальное — свои SVG
  'e:angler': '🥽', 's:none': '∅',
  ...PREMIUM_ICONS,
  ...FISH_ICONS,
};

/**
 * Картинка вещи: иконка imagegen client/assets/ui/icons/wd-<слот>-<ключ>.webp, если уже есть, иначе — рисунок вещи
 * из ICONS (SVG или эмодзи: своих картинок у вещей пока нет — список в отчёте задачи 10 редизайна UI).
 */
function itemArt(id: string): string {
  const src = uiIcon(`wd-${id.replace(':', '-')}`);
  return src ? `<img src="${src}" alt="" draggable="false">` : ICONS[id] ?? '·';
}

/** Наряд шлём не чаще (сервер принимает 5 в секунду); последний клик всё равно уйдёт */
const SEND_GAP_MS = 300;
/** Ответ, не совпавший с отправленным, столько времени считаем ответом на прошлый клик */
const STALE_MS = 1500;
/** Сколько ждать ответа на покупку, прежде чем снова разрешить кнопку (отказ приходит только всплывашкой) */
const BUY_WAIT_MS = 2500;

const fmt = new Intl.NumberFormat('ru-RU');

export class Wardrobe {
  readonly root: HTMLElement;
  readonly inspect: HTMLElement;
  /** Надеть своё: наряд целиком, только из того, что есть */
  onWear: (o: Outfit) => void = () => {};
  onBuy: (itemId: string) => void = () => {};
  onRedeem: (code: string) => void = () => {};
  /** Показать на своей желейке (вместе с примеркой) */
  onPreview: (o: Outfit) => void = () => {};
  /** Крестик или «Готово» */
  onClose: () => void = () => {};

  private readonly tabsEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly buyEl: HTMLElement;
  private readonly buyArt: HTMLElement;
  private readonly buyName: HTMLElement;
  private readonly buyNote: HTMLElement;
  private readonly buyWhy: HTMLElement;
  private readonly buyBtn: HTMLButtonElement;
  private readonly buyLine: HTMLElement;
  private readonly gift: GiftForm;
  private readonly giftBox: HTMLElement;
  private readonly giftBtn: HTMLButtonElement;
  /** Подарочные коды включены на сервере */
  private giftsOn = false;
  /** Пиксели сцены → экран (--hud-k): под желейкой место для стрелок и «Спереди» */
  private hudK = 1;
  /** Размер окна, для которого прочитан hudK: перечитываем при смене размера, а не каждый кадр */
  private hudKAt = '';
  private tab: Tab = 'c';
  private shown = false;
  private owned: readonly string[] = [];
  private tokens = 0;
  /** Видов в журнале рыбака: трофеи открываются по ним */
  private got = 0;
  /** Видов острова в альбоме (лестница острова, shared/fishstyle.ts ISLE_LADDER) */
  private isleGot = 0;
  /** Что надето (только своё): ответ сервера плюс ещё не подтверждённые клики */
  private wearing: Outfit = { ...DEFAULT_OUTFIT };
  /** Что, по нашим сведениям, сейчас на сервере: последнее отправленное или принятое от него */
  private believed: Outfit = { ...DEFAULT_OUTFIT };
  private sentAt = -Infinity;
  private sendTimer = 0;
  /** Примеряемые чужие вещи по слотам — видно только на своей желейке */
  private tryOn: Partial<Record<Slot, string>> = {};
  /** Последняя примеренная — её и предлагаем купить */
  private picked: Item | null = null;
  private buyingUntil = 0;
  private buyTimer = 0;
  private inspectYaw = 0;
  private inspectDrag: { id: number; x: number; moved: number; orbit: boolean } | null = null;
  private skipInspectClick = false;

  constructor(parent: HTMLElement) {
    // слой окна кита (.k-scrim, zoom --hud-k) без затемнения: окно справа, сцена слева — примерка
    this.root = document.createElement('div');
    this.root.className = 'k-scrim wd-scrim';
    this.root.hidden = true;
    this.root.innerHTML = `
      <section class="k-window wd-win" role="dialog" aria-label="Примерочная">
        <header class="k-win-head">
          <span class="k-win-portrait">${iconImg('wardrobe', '')}</span>
          <div class="k-win-titles"><p class="k-eyebrow">Набережная · ларёк у воды</p><h2 class="k-win-title">Примерочная</h2></div>
          <div class="k-win-tools"><button type="button" class="k-close wd-close" aria-label="Закрыть">${keyHtml('Esc', undefined, 'sm')}</button></div>
        </header>
        <nav class="k-tabs wd-tabs" role="tablist">${TABS.map(([k, name]) => `<button type="button" role="tab" class="k-tab" data-tab="${k}">${name}</button>`).join('')}</nav>
        <div class="k-win-body wd-body"></div>
        <div class="k-cell wd-buy" hidden>
          <span class="wd-buy-art"></span>
          <div class="wd-buy-text"><b class="wd-buy-name"></b><p class="wd-buy-note"></p><p class="wd-why" hidden></p></div>
          <button type="button" class="k-btn k-btn--sm wd-buy-btn" data-sfx="reward"><span class="k-row-line"></span></button>
        </div>
        <div class="k-cell mn-box wd-gift" hidden>
          <div class="mn-box-head">${iconImg('gift', '')}<div class="mn-box-text"><div class="k-row-title">Подарочный код</div>`
      + `<div class="k-row-hint">Есть код от друзей или с события? Введи его — подарок сразу появится в примерочной.</div></div></div>
        </div>
        <footer class="k-win-foot">
          <button type="button" class="k-btn k-btn--ghost k-btn--sm wd-gift-btn" aria-expanded="false" hidden><span class="k-row-line">${iconImg('gift')}Подарочный код</span></button>
          <button type="button" class="k-btn k-btn--go k-btn--sm wd-done">Готово</button>
        </footer>
      </section>`;
    const q = <T extends HTMLElement>(s: string): T => this.root.querySelector<T>(s)!;
    this.tabsEl = q('.wd-tabs');
    this.bodyEl = q('.wd-body');
    this.buyEl = q('.wd-buy');
    this.buyArt = q('.wd-buy-art');
    this.buyName = q('.wd-buy-name');
    this.buyNote = q('.wd-buy-note');
    this.buyWhy = q('.wd-why');
    this.buyBtn = q<HTMLButtonElement>('.wd-buy-btn');
    this.buyLine = this.buyBtn.querySelector<HTMLElement>('.k-row-line')!;
    this.giftBox = q('.wd-gift');
    this.giftBtn = q<HTMLButtonElement>('.wd-gift-btn');
    // та же форма, что в меню (Профиль → Подарки и коды): примерочная — всегда на набережной
    this.gift = new GiftForm(code => this.onRedeem(code), () => [this.giftsOn, true]);
    this.giftBox.append(this.gift.root);
    this.giftBtn.addEventListener('click', () => this.showGift(this.giftBox.hidden !== false));
    // кнопки не забирают фокус: иначе пробел и Enter «нажмут» последнюю, а не уйдут игре и чату
    this.root.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button')) e.preventDefault();
    });
    // колесо и клики по окну — не игре (камера, захват мыши)
    for (const type of ['pointerdown', 'wheel'] as const) {
      q('.wd-win').addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    }
    q('.wd-close').addEventListener('click', () => this.onClose());
    q('.wd-done').addEventListener('click', () => this.onClose());
    // под желейкой: стрелки поворота и «Спереди» — светлый HUD, размер сцены (× --hud-k)
    const inspect = this.inspect = document.createElement('div');
    inspect.className = 'wd-inspect';
    inspect.hidden = true;
    inspect.setAttribute('role', 'group');
    inspect.setAttribute('aria-label', 'Осмотр персонажа');
    inspect.innerHTML = `<div class="wd-inspect-in k-hudctx"><div class="wd-orbit">
      <img src="${rotateOrbitUrl}" alt="" aria-hidden="true" draggable="false">
      <button type="button" data-turn="-1" aria-label="Повернуть персонажа влево"></button>
      <button type="button" data-turn="1" aria-label="Повернуть персонажа вправо"></button>
      </div><button type="button" data-turn="0" class="k-btn k-btn--ghost k-btn--sm wd-inspect-reset">Спереди</button></div>`;
    inspect.addEventListener('click', e => {
      if (this.skipInspectClick && (e as MouseEvent).detail > 0) {
        this.skipInspectClick = false;
        return;
      }
      const button = (e.target as HTMLElement).closest<HTMLElement>('[data-turn]');
      if (!button) return;
      const turn = Number(button.dataset.turn);
      if (turn === 0) this.resetInspect();
      else this.rotatePreview(turn * Math.PI / 4);
    });
    inspect.addEventListener('keydown', event => {
      const e = event as KeyboardEvent;
      // Стрелки и пробел осматривают наряд, а не поднимают игрока из примерочной.
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.stopPropagation();
        e.preventDefault();
        this.rotatePreview((e.code === 'ArrowLeft' ? -1 : 1) * Math.PI / 4);
      } else if (e.code === 'Space' || e.code === 'Enter') e.stopPropagation();
    });
    this.tabsEl.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
      if (!b || b.dataset.tab === this.tab) return;
      this.tab = b.dataset.tab as Tab;
      this.bodyEl.scrollTop = 0;
      this.render();
    });
    this.bodyEl.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const card = t.closest<HTMLElement>('[data-id]');
      if (card) {
        const it = ITEMS.find((x) => x.id === card.dataset.id);
        if (it) this.pick(it);
        return;
      }
      const sw = t.closest<HTMLElement>('[data-color]');
      if (sw) this.color(sw.dataset.which === 'c2' ? 'c2' : 'c', Number(sw.dataset.color));
    });
    this.buyBtn.addEventListener('click', () => {
      if (!this.picked || this.buyBtn.disabled) return;
      this.buyingUntil = performance.now() + BUY_WAIT_MS;
      clearTimeout(this.buyTimer);
      this.buyTimer = window.setTimeout(() => this.render(), BUY_WAIT_MS);
      this.onBuy(this.picked.id);
      this.render();
    });
    parent.append(this.inspect, this.root);
  }

  /** Подарочный код: ячейка над подвалом окна — открыть или убрать */
  private showGift(on: boolean): void {
    this.giftBox.hidden = !on;
    this.giftBtn.setAttribute('aria-expanded', String(on));
    this.giftBtn.classList.toggle('is-pressed', on);
    if (on) {
      this.gift.configure(this.giftsOn, true);
      this.giftBox.querySelector('input')?.focus({ preventScroll: true });
    } else this.gift.reset();
  }

  /** Коды включены на сервере — кнопка «Подарочный код» видна */
  private setGifts(on: boolean): void {
    this.giftsOn = on;
    this.giftBtn.hidden = !on;
    if (!on && !this.giftBox.hidden) this.showGift(false);
  }

  get isOpen(): boolean {
    return this.shown;
  }

  /** Поворот только местной примерки: серверный взгляд и наряд не меняются. */
  get previewYaw(): number { return this.inspectYaw; }

  rotatePreview(delta: number): void {
    if (!this.shown) return;
    const yaw = this.inspectYaw + delta;
    this.inspectYaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  }

  resetInspect(): void {
    this.inspectYaw = 0;
    this.inspectDrag = null;
    this.skipInspectClick = false;
  }

  /** Под ногами желейки, независимо от ширины правой панели и высоты шляпы. */
  placeInspect(x: number): void {
    const half = Math.round(136 * this.scale());
    this.inspect.style.left = `clamp(${half}px, ${Math.round(x)}px, calc(100% - ${half}px))`;
  }

  /** Место под желейкой на экране, px: камера зеркала оставляет его под стрелки и «Спереди» */
  get footerPx(): number {
    return WARDROBE_FOOTER_PX * this.scale();
  }

  private scale(): number {
    const at = `${innerWidth}x${innerHeight}`;
    if (at !== this.hudKAt) {
      this.hudKAt = at;
      this.hudK = Number(getComputedStyle(document.documentElement).getPropertyValue('--hud-k')) || 1;
    }
    return this.hudK;
  }

  /** Свободная мышь/палец над сценой вращают желейку, панель вещей остаётся доступной. */
  bindInspect(canvas: HTMLCanvasElement): void {
    const orbit = this.inspect.querySelector<HTMLElement>('.wd-orbit')!;
    const down = (e: PointerEvent) => {
      if (!this.shown || e.button !== 0 || this.inspectDrag) return;
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-turn]') ?? canvas;
      this.inspectDrag = { id: e.pointerId, x: e.clientX, moved: 0, orbit: e.currentTarget === orbit };
      this.skipInspectClick = false;
      target.setPointerCapture(e.pointerId);
      if (target instanceof HTMLButtonElement) target.focus({ preventScroll: true });
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      const drag = this.inspectDrag;
      if (!this.shown || !drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x;
      this.rotatePreview(dx * 0.008);
      drag.moved += Math.abs(dx);
      drag.x = e.clientX;
    };
    const end = (e: PointerEvent) => {
      if (this.inspectDrag?.id !== e.pointerId) return;
      this.skipInspectClick = this.inspectDrag.orbit && this.inspectDrag.moved > 5;
      this.inspectDrag = null;
    };
    for (const target of [canvas, orbit]) {
      target.addEventListener('pointerdown', down);
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', end);
      target.addEventListener('pointercancel', end);
      target.addEventListener('lostpointercapture', end);
    }
  }

  /** Что на желейке в примерочной: надетое плюс примерка. */
  get preview(): Outfit {
    const o = { ...this.wearing };
    for (const slot of SLOTS) {
      const key = this.tryOn[slot];
      if (key !== undefined) o[slot] = key;
    }
    return o;
  }

  open(me: MeState): void {
    this.resetInspect();
    this.setGifts(me.gifts === true);
    this.hudKAt = '';
    this.shown = true;
    this.owned = me.owned;
    this.tokens = me.tokens;
    this.got = collectionCount(me.album);
    this.isleGot = isleCaught(me);
    this.wearing = { ...me.outfit };
    this.believed = { ...me.outfit };
    this.sentAt = -Infinity;
    this.tryOn = {};
    this.picked = null;
    this.buyingUntil = 0;
    this.root.hidden = false;
    this.inspect.hidden = false;
    const win = this.root.querySelector<HTMLElement>('.wd-win')!;
    win.classList.remove('is-in');
    void win.offsetWidth;
    win.classList.add('is-in');
    sfx.play('open');
    this.render();
  }

  /**
   * Закрыть: примерка снимается. Недосланное сюда не доходит — его шлют раньше (flush), пока ещё в примерочной.
   * Возвращает наряд, который уже у сервера, — его и показать на желейке.
   */
  close(): Outfit {
    this.resetInspect();
    this.showGift(false);
    clearTimeout(this.sendTimer);
    this.sendTimer = 0;
    this.shown = false;
    this.tryOn = {};
    this.picked = null;
    clearTimeout(this.buyTimer);
    if (!this.root.hidden) sfx.play('close');
    this.root.hidden = true;
    this.inspect.hidden = true;
    return { ...this.believed };
  }

  /** Отправить недосланный наряд сейчас — перед тем как встать: стоя сервер его уже не примет. */
  flush(): void {
    if (this.sendTimer) {
      clearTimeout(this.sendTimer);
      this.sendTimer = 0;
    }
    if (!this.shown || sameOutfit(this.wearing, this.believed)) return;
    this.believed = { ...this.wearing };
    this.sentAt = performance.now();
    this.onWear(this.believed);
  }

  /** Ответ сервера (me): купленное, жетоны, наряд. Примерка того, что ещё не куплено, остаётся. */
  update(me: MeState): void {
    this.setGifts(me.gifts === true);
    if (!this.shown) return;
    const bought = this.picked && isOwned(me.owned, this.picked) ? this.picked : null;
    this.owned = me.owned;
    this.tokens = me.tokens;
    this.got = collectionCount(me.album);
    this.isleGot = isleCaught(me);
    // ответ на прошлый клик, а следом идёт новый — наряд не трогаем, иначе он мигнёт назад
    const stale = this.sendTimer !== 0 || (!sameOutfit(me.outfit, this.believed) && performance.now() - this.sentAt < STALE_MS);
    if (!stale) {
      this.wearing = { ...me.outfit };
      this.believed = { ...me.outfit };
    } else if (bought) {
      // купленное сервер надел сам — надеваем и мы, следом уйдёт наряд целиком
      this.wearing = withItem(this.wearing, bought);
      this.schedule();
    }
    if (bought) {
      this.picked = null;
      this.buyingUntil = 0;
    }
    for (const slot of SLOTS) {
      const key = this.tryOn[slot];
      if (key === undefined) continue;
      const it = itemOf(slot, key);
      if (!it || isOwned(me.owned, it)) delete this.tryOn[slot];
    }
    this.onPreview(this.preview);
    this.render();
  }

  /** Клик по вещи: своё — надеть, чужое — примерить. */
  private pick(it: Item): void {
    if (!this.shown || !isItemVisible(it, this.owned)) return;
    if (isOwned(this.owned, it)) {
      delete this.tryOn[it.slot];
      if (this.picked?.slot === it.slot) this.picked = null;
      this.wearing = withItem(this.wearing, it);
      this.schedule();
    } else {
      this.tryOn[it.slot] = it.key;
      this.picked = it;
    }
    this.onPreview(this.preview);
    this.render();
  }

  /** Цвета все бесплатные — надеваются сразу. */
  private color(which: 'c' | 'c2', i: number): void {
    if (!this.shown || !(i >= 0 && i < PALETTE.length)) return;
    this.wearing = which === 'c' ? { ...this.wearing, c: i } : { ...this.wearing, c2: i };
    this.schedule();
    this.onPreview(this.preview);
    this.render();
  }

  /** Отправка наряда: сразу, если давно не слали, иначе чуть позже — последним состоянием. */
  private schedule(): void {
    if (this.sendTimer) return;
    const wait = this.sentAt + SEND_GAP_MS - performance.now();
    if (wait <= 0) {
      this.flush();
      return;
    }
    this.sendTimer = window.setTimeout(() => {
      this.sendTimer = 0;
      this.flush();
    }, wait);
  }

  // ------------------------------------------------------------ отрисовка

  private render(): void {
    if (!this.shown) return;
    const d = this.preview;
    // питомцы — награда рыбалки: вкладка, когда она включена (или питомец уже есть)
    const pets = FISH2.on || this.owned.some((id) => id.startsWith('s:'));
    if (this.tab === 's' && !pets) this.tab = 'c';
    for (const b of this.tabsEl.querySelectorAll<HTMLElement>('[data-tab]')) {
      const on = b.dataset.tab === this.tab;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', String(on));
      if (b.dataset.tab === 's') b.hidden = !pets;
    }
    const scroll = this.bodyEl.scrollTop;
    const head = (title: string, lead = ''): string => `<p class="k-eyebrow wd-h">${title}</p>${lead ? `<p class="wd-lead">${lead}</p>` : ''}`;
    if (this.tab === 'c') {
      this.bodyEl.innerHTML = `${head('Цвет желе', 'Все цвета бесплатные — надеваются сразу.')}${swatches('c', d.c, true)}`;
    } else {
      // трофеи рыбалки 2.0 — только когда она включена (или вещь уже есть)
      const available = ITEMS.filter((it) => it.slot === this.tab && isItemVisible(it, this.owned) && (it.tier !== 'trophy' || FISH2.on || isOwned(this.owned, it))
        && isleVisible(it.id, this.owned));
      const grid = (list: Item[]): string => `<div class="wd-grid">${list.map(it => this.card(it, d)).join('')}</div>`;
      const cards = available.filter(it => it.tier !== 'premium' && it.tier !== 'trophy');
      const premium = available.filter(it => it.tier === 'premium');
      const trophy = available.filter(it => it.tier === 'trophy' && !ISLE_ITEMS.has(it.id));
      // трофеи острова «Последний свет» — своим блоком: за виды острова, свой счётчик
      const isle = available.filter(it => ISLE_ITEMS.has(it.id));
      const isleBlock = isle.length ? head('Трофеи острова «Последний свет»', `За виды острова в журнале рыбака (J) · у тебя <b class="k-num">${this.isleGot} из ${ISLE_TOTAL}</b>. Можно примерить заранее.`) + grid(isle) : '';
      const collection = premium.length ? head('Премиальная коллекция', 'За жетоны · только внешний вид. Выбери вещь, чтобы примерить.') + grid(premium) : '';
      const trophies = trophy.length ? head('Трофеи рыбалки', `За виды рыб в журнале рыбака (J) · у тебя <b class="k-num">${this.got}</b>. Можно примерить заранее.`) + grid(trophy) : '';
      const second = this.tab === 'p' ? head('Второй цвет узора') + swatches('c2', d.c2, false) : '';
      this.bodyEl.innerHTML = `${cards.length ? grid(cards) : ''}${trophies}${isleBlock}${collection}${second}`;
    }
    this.bodyEl.scrollTop = scroll;
    this.renderBuy(d);
  }

  /** Ячейка вещи: картинка, имя, цена 🪙 / «своё» золотом / замок с причиной; надетое — золотая рамка, примерка — пунктир */
  private card(it: Item, d: Outfit): string {
    const on = slotKey(d, it.slot) === it.key;
    const owned = isOwned(this.owned, it);
    const price = itemPrice(it.tier);
    const need = it.tier === 'trophy' ? needOf(it.id) : null;
    const isleNeed = isleNeedOf(it.id);
    let meta: string;
    if (it.tier === 'free') meta = '<span class="k-dim">бесплатно</span>';
    else if (owned) meta = '<span class="k-gold">своё</span>';
    else if (price !== null) meta = `${coinHtml()}<span class="k-num">${fmt.format(price)}</span>`;
    else meta = `${iconImg('lock')}<span class="k-dim">${isleNeed !== null ? isleSpecies(isleNeed) : need !== null ? species(need) : TIER_NAMES[it.tier]}</span>`;
    const art = it.slot === 'p'
      ? `<span class="wd-cloth" style="background:${patternCss(it.key, d.c, d.c2)}"></span>`
      : `<span class="wd-art${it.key === 'none' ? ' is-none' : ''}">${itemArt(it.id)}</span>`;
    const cls = ['k-cell', 'wd-item', `tier-${it.tier}`, on ? 'is-on' : '', on && !owned ? 'is-trial' : ''];
    return `<button type="button" class="${cls.filter(Boolean).join(' ')}" data-id="${it.id}" aria-pressed="${on}"><i class="wd-tier"></i>${art}`
      + `<span class="wd-name">${it.name}</span><span class="wd-meta">${meta}</span></button>`;
  }

  /** Строка покупки — для примеренной чужой вещи, пока она на желейке. Причина «нельзя» — красной строкой, не в кнопке. */
  private renderBuy(d: Outfit): void {
    const it = this.picked;
    const show = it !== null && d[it.slot] === it.key && !isOwned(this.owned, it);
    this.buyEl.hidden = !show;
    if (!show || !it) return;
    this.buyArt.innerHTML = it.slot === 'p'
      ? `<span class="wd-cloth" style="background:${patternCss(it.key, d.c, d.c2)}"></span>`
      : `<span class="wd-art">${itemArt(it.id)}</span>`;
    this.buyName.innerHTML = `${it.name} <span class="k-dim">· ${TIER_NAMES[it.tier]}</span>`;
    this.buyNote.textContent = PREMIUM_DETAILS[it.id] ?? REWARD_INFO[it.id]?.text ?? '';
    const price = itemPrice(it.tier);
    const btn = this.buyBtn;
    const need = it.tier === 'trophy' ? needOf(it.id) : null;
    const isleNeed = isleNeedOf(it.id);
    let why = '';
    btn.hidden = price === null;
    if (price === null) {
      why = it.tier === 'jackpot' ? `${iconImg('slots')}Только с джекпота автоматов`
        : isleNeed !== null ? `${iconImg('lock')}Нужно ${isleSpecies(isleNeed)} · у тебя ${this.isleGot}`
          : need !== null ? `${iconImg('lock')}Нужно ${species(need)} в журнале · у тебя ${this.got}` : `${iconImg('lock')}Выдаёт игра`;
    } else if (performance.now() < this.buyingUntil) {
      btn.disabled = true;
      this.buyLine.textContent = 'Покупаем…';
    } else {
      btn.disabled = this.tokens < price;
      this.buyLine.innerHTML = `Купить · ${fmt.format(price)} ${coinHtml()}`;
      if (this.tokens < price) why = `Не хватает ${fmt.format(price - this.tokens)} ${coinHtml()}`;
    }
    this.buyWhy.hidden = !why;
    this.buyWhy.innerHTML = why;
    this.buyWhy.classList.toggle('is-bad', price !== null);
  }

  giftResult(result: GiftResultCode): void { this.gift.result(result); }
}

/** Образцы палитры; which — какой цвет наряда меняют, named — с подписями (вкладка «Цвет»). */
function swatches(which: 'c' | 'c2', selected: number, named: boolean): string {
  const list = PALETTE.map((hex, i) => {
    const label = named ? `<span>${PALETTE_NAMES[i]}</span>` : '';
    return `<button type="button" class="wd-sw${i === selected ? ' is-on' : ''}" data-which="${which}" data-color="${i}" aria-label="${PALETTE_NAMES[i]}" aria-pressed="${i === selected}">`
      + `<span class="wd-dot" style="background:${css(hex)}"></span>${label}</button>`;
  });
  return `<div class="wd-swatches${named ? ' is-named' : ''}">${list.join('')}</div>`;
}

function css(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/** Образец ткани для карточки узора — примерно так узор ляжет на желейку. */
function patternCss(key: string, c: number, c2: number): string {
  const hex = PALETTE[c] ?? PALETTE[0];
  const a = css(hex);
  const b = css(PALETTE[c2] ?? PALETTE[15]);
  // тёмные пятна камуфляжа — основной цвет, притушенный (как в шейдере)
  const dark = `rgb(${Math.round(((hex >> 16) & 255) * 0.42)}, ${Math.round(((hex >> 8) & 255) * 0.42)}, ${Math.round((hex & 255) * 0.42)})`;
  switch (key) {
    case 'stripes':
      return `repeating-linear-gradient(180deg, ${a} 0 7px, ${b} 7px 12px)`;
    case 'dots':
      return `radial-gradient(circle, ${b} 0 3px, transparent 3.5px) 0 0 / 13px 13px, radial-gradient(circle, ${b} 0 3px, transparent 3.5px) 6.5px 6.5px / 13px 13px, ${a}`;
    case 'spots':
      return `radial-gradient(circle at 28% 30%, ${b} 0 17%, transparent 18%), radial-gradient(circle at 74% 58%, ${b} 0 15%, transparent 16%), radial-gradient(circle at 38% 82%, ${b} 0 10%, transparent 11%), ${a}`;
    case 'sunset':
      return `linear-gradient(0deg, ${a} 10%, ${b} 95%)`;
    case 'camo':
      return `radial-gradient(ellipse 30% 22% at 26% 34%, ${b} 0 98%, transparent 100%), radial-gradient(ellipse 24% 18% at 72% 70%, ${dark} 0 98%, transparent 100%), radial-gradient(ellipse 20% 14% at 76% 24%, ${dark} 0 98%, transparent 100%), radial-gradient(ellipse 22% 16% at 30% 80%, ${b} 0 98%, transparent 100%), ${a}`;
    case 'sugar':
      return `radial-gradient(circle, rgba(255,255,255,0.95) 0 1.1px, transparent 1.6px) 0 0 / 8px 8px, radial-gradient(circle, rgba(255,255,255,0.8) 0 1px, transparent 1.5px) 4px 5px / 11px 11px, ${a}`;
    case 'gold':
      return 'linear-gradient(135deg, #fff1a8, #e2a92a 40%, #fff1a8 60%, #b07800)';
    default:
      return a;
  }
}
