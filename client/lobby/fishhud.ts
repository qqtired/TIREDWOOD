// Рыбалка на экране: крупное «Подсекай!» на поклёвке и карточка улова — картинка, вид, вес, редкость, «Новый вид!» или
// «Рекорд!», кнопки «[1] В коллекцию» и «[2] Продать за N 🪙» (золотую рыбку — отпустить, хлам — выбросить) и полоска:
// сколько осталось думать (потом выберется само). Карточка — над меню: выбрать можно и на паузе.
import { FISH, GOLDFISH, HOLD_TICKS, NEW_BONUS, RARITY_CSS, RARITY_NAMES, R_JUNK, fmtWeight } from '../../shared/fishing.ts';
import { TICK_RATE } from '../../shared/constants.ts';
import { setCoinText } from '../ui/coin.ts';
import { drawFishIcon, fishCanvas } from './fishart.ts';

/** Что пишут в бутылке (выбирается по весу улова) */
const NOTES = [
  'Кто нашёл — тому сегодня везёт!',
  'Привет с того берега! Вода тёплая, приезжайте',
  'Не забудь покормить чаек',
  'Здесь были Вася, Петя и кот',
  'Если читаешь это — улыбнись 🙂',
  'Карта сокровищ потерялась. Сокровище тоже',
  'Сапог не мой. Честно',
  'Чайка, верни мою булочку!',
];

export interface CatchInfo {
  sp: number;
  g: number;
  price: number;
  fresh: boolean;
  record: boolean;
  best: number;
}

export class FishHud {
  /** Выбрал: true — в коллекцию, false — продать (отпустить, выбросить) */
  onChoose: (keep: boolean) => void = () => {};
  private readonly bite: HTMLElement;
  private readonly card: HTMLElement;
  private shown: CatchInfo | null = null;
  private chosen = false;
  private biteTimer = 0;

  /** hud — слой набережной («Подсекай!»), overlay — слой над меню (карточка улова) */
  constructor(hud: HTMLElement, overlay: HTMLElement) {
    this.bite = el('div', 'fs-bite');
    this.bite.textContent = '❗ Подсекай!';
    hud.appendChild(this.bite);
    this.card = el('div', 'fs-card');
    overlay.appendChild(this.card);
  }

  /** Карточка улова на экране и ещё не выбрано */
  get hasCard(): boolean {
    return this.shown !== null && !this.chosen;
  }

  /** «Подсекай!» — на время окна подсечки (само гаснет через ms). */
  showBite(on: boolean, ms = 1600): void {
    clearTimeout(this.biteTimer);
    this.bite.classList.remove('show');
    if (!on) return;
    void this.bite.offsetWidth;
    this.bite.classList.add('show');
    this.biteTimer = window.setTimeout(() => this.bite.classList.remove('show'), ms);
  }

  showCatch(c: CatchInfo): void {
    const f = FISH[c.sp];
    if (!f) return;
    this.shown = c;
    this.chosen = false;
    const card = this.card;
    card.textContent = '';
    card.style.setProperty('--rar', RARITY_CSS[f.rarity]);
    const head = card.appendChild(el('div', 'fs-head'));
    head.appendChild(el('span', 'fs-rar')).textContent = f.rarity === R_JUNK ? 'находка' : RARITY_NAMES[f.rarity];
    if (c.fresh) head.appendChild(el('span', 'fs-badge new')).textContent = f.rarity === R_JUNK ? '★ Новая находка!' : '★ Новый вид!';
    else if (c.record) head.appendChild(el('span', 'fs-badge rec')).textContent = '🏆 Рекорд!';
    card.appendChild(fishCanvas('fs-pic', 252, 112));
    drawFishIcon(card.lastElementChild as HTMLCanvasElement, c.sp, true);
    const title = card.appendChild(el('div', 'fs-title'));
    title.appendChild(el('b', '')).textContent = f.name;
    title.appendChild(el('span', '')).textContent = fmtWeight(c.g);
    const sub = card.appendChild(el('div', 'fs-sub'));
    if (c.sp === GOLDFISH) sub.textContent = 'Говорят, исполняет желания…';
    else if (f.id === 'bottle') sub.textContent = `В записке: «${NOTES[c.g % NOTES.length]}»`;
    else if (c.record) sub.textContent = `Прошлый рекорд — ${fmtWeight(c.best)}`;
    else if (!c.fresh) sub.textContent = `Уже в альбоме · рекорд — ${fmtWeight(c.best)}`;
    else sub.textContent = 'Такого ещё не было в альбоме';

    const keepTxt = c.fresh ? `+${NEW_BONUS[f.rarity]} 🪙 за\u00a0новинку` : c.record ? 'новый рекорд' : 'ещё один в альбом';
    const sellTxt = c.sp === GOLDFISH ? `✨ Отпустить · +${c.price} 🪙` : c.price > 0 ? `🪙 Продать за ${c.price}` : '🗑 Выбросить';
    const keep = this.button('1', '📖 В коллекцию', keepTxt);
    const sell = this.button('2', sellTxt, '');
    keep.addEventListener('click', () => this.choose(true));
    sell.addEventListener('click', () => this.choose(false));
    card.append(keep, sell);
    const bar = card.appendChild(el('div', 'fs-bar'));
    bar.appendChild(el('i', '')).style.animationDuration = `${(HOLD_TICKS / TICK_RATE) * 1000}ms`;
    card.appendChild(el('div', 'fs-auto')).textContent = c.fresh || c.record ? 'Не выберешь — ляжет в альбом сама' : 'Не выберешь — продастся сама';
    card.classList.remove('show');
    void card.offsetWidth;
    card.classList.add('show');
  }

  /** Выбор с клавиатуры или кнопкой: дальше ждём сервер (карточку уберёт событие «выбрано»). */
  choose(keep: boolean): void {
    if (!this.hasCard) return;
    this.chosen = true;
    this.card.classList.add('chosen');
    this.onChoose(keep);
  }

  /** Улов ушёл (в альбом, продан, ушли с места). Новинка в альбом — вернём true: можно порадоваться. */
  hideCatch(kept: boolean): boolean {
    const was = this.shown;
    this.shown = null;
    this.chosen = false;
    this.card.classList.remove('show', 'chosen');
    return kept && !!was?.fresh;
  }

  reset(): void {
    this.hideCatch(false);
    this.showBite(false);
  }

  private button(key: string, text: string, sub: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'fs-btn';
    b.appendChild(el('kbd', '')).textContent = key;
    setCoinText(b.appendChild(el('span', '')), text);
    if (sub) setCoinText(b.appendChild(el('small', '')), sub);
    return b;
  }
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
