// Примерочная: панель справа (желейка в зеркале — левее). Вкладки: цвет, узор, глаза, шапка, аксессуар.
// Своё (бесплатное и купленное) надевается сразу: сервер сохраняет и показывает всем. Чужое — только примерка
// на своей желейке и кнопка «Купить». Закрыли — примерка снимается, остаётся надетое.
import { itemPrice } from '../../shared/economy.ts';
import {
  DEFAULT_OUTFIT, ITEMS, PALETTE, PALETTE_NAMES, TIER_NAMES, isOwned, isItemVisible, itemOf, sameOutfit, slotKey, withItem,
  type Item, type Outfit, type Slot,
} from '../../shared/outfit.ts';
import { collectionCount } from '../../shared/fishrules.ts';
import { REWARD_INFO, needOf } from '../../shared/fishstyle.ts';
import { FISH2 } from '../lobby/fish2.ts';
import { FISH_ICONS } from './fishicons.ts';
import { species } from './fishrewards.ts';
import type { MeState } from '../scene.ts';
import type { GiftResultCode } from '../../shared/gifts.ts';
import { GiftCodePanel } from './gift-code.ts';
import { COIN_HTML, setCoinText } from './coin.ts';

type Tab = 'c' | Slot;

const TABS: ReadonlyArray<readonly [Tab, string]> = [['c', 'Цвет'], ['p', 'Узор'], ['e', 'Глаза'], ['h', 'Шапка'], ['a', 'Аксессуар'], ['s', 'Питомец']];
const SLOTS: readonly Slot[] = ['p', 'e', 'h', 'a', 's'];

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

/** Наряд шлём не чаще (сервер принимает 5 в секунду); последний клик всё равно уйдёт */
const SEND_GAP_MS = 300;
/** Ответ, не совпавший с отправленным, столько времени считаем ответом на прошлый клик */
const STALE_MS = 1500;
/** Сколько ждать ответа на покупку, прежде чем снова разрешить кнопку (отказ приходит только всплывашкой) */
const BUY_WAIT_MS = 2500;

const fmt = new Intl.NumberFormat('ru-RU');

export class Wardrobe {
  readonly root: HTMLElement;
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
  private readonly buyName: HTMLElement;
  private readonly buyBtn: HTMLButtonElement;
  private readonly gift: GiftCodePanel;
  private tab: Tab = 'c';
  private shown = false;
  private owned: readonly string[] = [];
  private tokens = 0;
  /** Видов в журнале рыбака: трофеи открываются по ним */
  private got = 0;
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

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'wardrobe';
    this.root.innerHTML = `
      <div class="wd-head">
        <div class="wd-title">Примерочная</div>
        <button class="wd-close" title="Закрыть (Esc)">✕</button>
      </div>
      <div class="wd-tabs">${TABS.map(([k, name]) => `<button data-tab="${k}">${name}</button>`).join('')}</div>
      <div class="wd-body"></div>
      <div class="wd-buy">
        <div class="wd-buy-name"></div>
        <div class="wd-buy-note"></div>
        <button class="btn primary wd-buy-btn"></button>
      </div>
      <button class="btn ghost wd-done">Готово</button>`;
    this.tabsEl = this.root.querySelector('.wd-tabs')!;
    this.bodyEl = this.root.querySelector('.wd-body')!;
    this.buyEl = this.root.querySelector('.wd-buy')!;
    this.buyName = this.root.querySelector('.wd-buy-name')!;
    this.buyBtn = this.root.querySelector('.wd-buy-btn')!;
    this.gift = new GiftCodePanel(this.root, code => this.onRedeem(code));
    this.root.querySelector('.wd-done')!.before(this.gift.root);
    // кнопки не забирают фокус: иначе пробел и Enter «нажмут» последнюю, а не уйдут игре и чату
    this.root.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button')) e.preventDefault();
    });
    this.root.querySelector('.wd-close')!.addEventListener('click', () => this.onClose());
    this.root.querySelector('.wd-done')!.addEventListener('click', () => this.onClose());
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
    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.shown;
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
    this.gift.configure(me.gifts === true);
    this.shown = true;
    this.owned = me.owned;
    this.tokens = me.tokens;
    this.got = collectionCount(me.album);
    this.wearing = { ...me.outfit };
    this.believed = { ...me.outfit };
    this.sentAt = -Infinity;
    this.tryOn = {};
    this.picked = null;
    this.buyingUntil = 0;
    this.root.classList.add('show');
    this.render();
  }

  /**
   * Закрыть: примерка снимается. Недосланное сюда не доходит — его шлют раньше (flush), пока ещё в примерочной.
   * Возвращает наряд, который уже у сервера, — его и показать на желейке.
   */
  close(): Outfit {
    this.gift.close();
    clearTimeout(this.sendTimer);
    this.sendTimer = 0;
    this.shown = false;
    this.tryOn = {};
    this.picked = null;
    clearTimeout(this.buyTimer);
    this.root.classList.remove('show');
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
    this.gift.configure(me.gifts === true);
    if (!this.shown) return;
    const bought = this.picked && isOwned(me.owned, this.picked) ? this.picked : null;
    this.owned = me.owned;
    this.tokens = me.tokens;
    this.got = collectionCount(me.album);
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
      b.classList.toggle('on', b.dataset.tab === this.tab);
      if (b.dataset.tab === 's') b.hidden = !pets;
    }
    const scroll = this.bodyEl.scrollTop;
    if (this.tab === 'c') {
      this.bodyEl.innerHTML = `<div class="wd-label">Цвет желе</div>${swatches('c', d.c, true)}`;
    } else {
      // трофеи рыбалки 2.0 — только когда она включена (или вещь уже есть)
      const available = ITEMS.filter((it) => it.slot === this.tab && isItemVisible(it, this.owned) && (it.tier !== 'trophy' || FISH2.on || isOwned(this.owned, it)));
      const cards = available.filter(it => it.tier !== 'premium' && it.tier !== 'trophy').map(it => this.card(it, d)).join('');
      const premium = available.filter(it => it.tier === 'premium').map(it => this.card(it, d)).join('');
      const trophy = available.filter(it => it.tier === 'trophy').map(it => this.card(it, d)).join('');
      const collection = premium ? `<div class="wd-label wd-premium-label">Премиальная коллекция</div><p class="wd-collection-note">За игровые жетоны · только внешний вид. Выбери вещь, чтобы примерить.</p><div class="wd-grid">${premium}</div>` : '';
      const trophies = trophy ? `<div class="wd-label">Трофеи рыбалки</div><p class="wd-collection-note">За виды рыб в журнале рыбака (J) · только внешний вид. Можно примерить заранее.</p><div class="wd-grid">${trophy}</div>` : '';
      const second = this.tab === 'p' ? `<div class="wd-label">Второй цвет узора</div>${swatches('c2', d.c2, false)}` : '';
      this.bodyEl.innerHTML = `${cards ? `<div class="wd-grid">${cards}</div>` : ''}${trophies}${collection}${second}`;
    }
    this.bodyEl.scrollTop = scroll;
    this.renderBuy(d);
  }

  private card(it: Item, d: Outfit): string {
    const on = slotKey(d, it.slot) === it.key;
    const owned = isOwned(this.owned, it);
    const price = itemPrice(it.tier);
    const need = it.tier === 'trophy' ? needOf(it.id) : null;
    let meta: string;
    if (it.tier === 'free') meta = 'бесплатно';
    else if (owned) meta = '✓ есть';
    else if (price !== null) meta = `${fmt.format(price)} ${COIN_HTML}`;
    else if (need !== null) meta = `🔒 ${species(need)}`;
    else meta = `🔒 ${TIER_NAMES[it.tier]}`;
    const icon = it.slot === 'p'
      ? `<span class="wd-cloth" style="background:${patternCss(it.key, d.c, d.c2)}"></span>`
      : `<span class="wd-icon${it.key === 'none' ? ' empty' : ''}">${ICONS[it.id] ?? '·'}</span>`;
    const cls = ['wd-item', `tier-${it.tier}`, owned ? 'owned' : 'locked', on ? 'on' : '', on && !owned ? 'trial' : ''];
    const tip = it.tier === 'free' ? it.name : `${it.name} — ${TIER_NAMES[it.tier]}`;
    return `<button class="${cls.filter(Boolean).join(' ')}" data-id="${it.id}" title="${tip}">${icon}`
      + `<span class="wd-name">${it.name}</span><span class="wd-meta"><i></i>${meta}</span></button>`;
  }

  /** Кнопка покупки — для примеренной чужой вещи, пока она на желейке. */
  private renderBuy(d: Outfit): void {
    const it = this.picked;
    const show = it !== null && d[it.slot] === it.key && !isOwned(this.owned, it);
    this.buyEl.classList.toggle('show', show);
    if (!show || !it) return;
    this.buyName.textContent = `${it.name} · ${TIER_NAMES[it.tier]}`;
    this.buyEl.querySelector<HTMLElement>('.wd-buy-note')!.textContent = PREMIUM_DETAILS[it.id] ?? REWARD_INFO[it.id]?.text ?? '';
    const price = itemPrice(it.tier);
    const btn = this.buyBtn;
    btn.classList.remove('busy');
    const need = it.tier === 'trophy' ? needOf(it.id) : null;
    if (price === null) {
      btn.disabled = true;
      btn.textContent = it.tier === 'jackpot' ? 'Только с джекпота 🎰' : need !== null ? `🔒 ${species(need)} · у тебя ${this.got} 🎣` : 'Выдаёт игра';
    } else if (performance.now() < this.buyingUntil) {
      btn.disabled = true;
      btn.classList.add('busy');
      btn.textContent = 'Покупаем…';
    } else if (this.tokens < price) {
      btn.disabled = true;
      setCoinText(btn, `Не хватает ${fmt.format(price - this.tokens)} 🪙`);
    } else {
      btn.disabled = false;
      setCoinText(btn, `Купить за ${fmt.format(price)} 🪙`);
    }
  }

  giftResult(result: GiftResultCode): void { this.gift.result(result); }
}

/** Образцы палитры; which — какой цвет наряда меняют, named — с подписями (вкладка «Цвет»). */
function swatches(which: 'c' | 'c2', selected: number, named: boolean): string {
  const list = PALETTE.map((hex, i) => {
    const label = named ? `<span>${PALETTE_NAMES[i]}</span>` : '';
    return `<button class="wd-sw${i === selected ? ' on' : ''}" data-which="${which}" data-color="${i}" title="${PALETTE_NAMES[i]}">`
      + `<span class="wd-dot" style="background:${css(hex)}"></span>${label}</button>`;
  });
  return `<div class="wd-swatches${named ? ' named' : ''}">${list.join('')}</div>`;
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
