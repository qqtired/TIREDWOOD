import { activeDrink, bagSlots, bagValue, drinkOf, drinkUntil, fishLevelView, questNeed, FISH_MAX_LEVEL, type FishProgress } from '../../shared/fishprogress.ts';
import { BEER, type ShopDrink } from '../../shared/fishshop.ts';
import { catchValue, livewellCap, livewellOf } from '../../shared/fishlivewell.ts';
import { TOUCH } from '../touch.ts';
import { coinHtml, iconImg, keyHtml, meterHtml } from '../ui/kit/dom.ts';
import { uiIcon } from '../ui/kit/icons.ts';
import { el } from './fish2.ts';
import { FishClock, fishTimeLeft } from './fishclock.ts';
import { levelZonePct, num, pct } from './fishfmt.ts';
import { gearUrl } from './fishkit.ts';
import { LEVEL_PERKS } from '../../shared/fishability.ts';

/** Картинка напитка на плитке по номеру из activeDrink(): пиво, эль, пиво подводного владыки, водка */
const DRINK_PIC: Readonly<Record<number, string>> = { 1: 'fishshop/beer', 2: 'fishshop/ale', 3: 'fishshop/beer', 4: 'fishshop/vodka' };

/** Что даёт напиток — коротко, под плиткой: «цена +10 %»; у водки — крупная чаще */
function drinkShort(d: ShopDrink): string {
  return d.top ? `эпик ×${String(d.top).replace('.', ',')}` : `цена ${pct(d.income).replace('%', ' %')}`;
}

/** Текст — только если поменялся (плитки обновляются часто) */
export function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

/**
 * Уровень рыбалки в профиле (меню Esc → «Коллекция», client/ui/profile.ts) — на ките: значок поплавка, опыт полосой .k-meter
 * цвета режима, строка зоны и награды уровня. fresh — уровень только что вырос: строка награды вспыхивает.
 */
export function fishSkillBlock(progress: FishProgress, compact = false, fresh = false): HTMLElement {
  const view = fishLevelView(progress.xp);
  const block = el('div', compact ? 'fs-skill compact' : 'fs-skill');
  block.dataset.mode = 'fishing';
  const head = block.appendChild(el('div', 'fs-skill-head'));
  const title = head.appendChild(el('b', ''));
  title.innerHTML = iconImg('float', 'fs-ic');
  title.append(compact ? `Ур. ${view.level}` : view.level === 0 ? 'Новичок' : `Уровень ${view.level} из ${FISH_MAX_LEVEL}`);
  // Шкала на каждом уровне идёт с нуля: опыт внутри уровня / сколько нужно на весь уровень (5-й: «0 / 1 150 XP»).
  // На максимальном уровне следующего нет — пишем накопленный опыт.
  const gained = Math.max(0, view.xp - view.from);
  const fmt = (n: number): string => n.toLocaleString('ru-RU');
  const stat = view.next === null ? `${fmt(view.xp)} XP` : `${fmt(gained)} / ${fmt(view.next - view.from)}`;
  head.appendChild(el('span', '', compact ? stat : view.next === null ? `${stat} · максимум` : `${stat} XP`));
  const need = view.next === null ? 1 : Math.max(1, view.next - view.from);
  block.insertAdjacentHTML('beforeend', meterHtml(view.next === null ? 1 : gained / need, 'mode'));
  const bar = block.lastElementChild!;
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(need));
  bar.setAttribute('aria-valuenow', String(view.next === null ? need : Math.min(need, gained)));
  bar.setAttribute('aria-label', view.next === null ? 'Максимальный уровень рыбалки' : `До следующего уровня ${Math.max(0, view.next - view.xp)} XP`);
  block.appendChild(el('span', 'fs-skill-sub', view.next === null
    ? `Высший уровень · зелёная зона +${levelZonePct(view.level)}% · опыт продолжает учитываться`
    : view.level === 0
      ? `До 1-го уровня ${Math.max(0, view.next - view.xp).toLocaleString('ru-RU')} XP — там зелёная зона +${levelZonePct(1)}%`
      : `До следующего уровня ${Math.max(0, view.next - view.xp).toLocaleString('ru-RU')} XP · сейчас зелёная зона +${levelZonePct(view.level)}%`));
  // награды уровней 1–15 (shared/fishability.ts): последняя полученная и следующая; в подсказке — все полученные
  const have = LEVEL_PERKS.filter((p) => p.level <= view.level);
  const last = have.at(-1);
  const next = LEVEL_PERKS.find((p) => p.level === view.level + 1);
  const perk = block.appendChild(el('span', `fs-skill-perk${fresh ? ' new' : ''}`));
  if (last) perk.appendChild(el('b', '', last.name));
  if (next) perk.append(`${last ? ' · ' : ''}на ${next.level}-м: ${next.name}`);
  perk.title = [...have.map((p) => `★ ${p.level}. ${p.name} — ${p.text}`), ...(next ? [`дальше, ${next.level}-й: ${next.name} — ${next.text}`] : [])].join('\n');
  return block;
}


/** Плитка под бейджем (кит .k-tile): картинка на подложке, клавиша в углу, полоса и подпись в две строки под ней */
interface Tile {
  root: HTMLElement;
  img: HTMLImageElement;
  meter: HTMLElement;
  cap: HTMLElement;
  sub: HTMLElement;
  key: string;
}

function tile(row: HTMLElement, cls: string, src: string, label: string, kbd = '', button = false): Tile {
  const root = row.appendChild(el(button ? 'button' : 'div', `k-tile ${cls}${button ? ' fi-tile-btn' : ''}`));
  if (button) (root as HTMLButtonElement).type = 'button';
  root.setAttribute('aria-label', label);
  const face = root.appendChild(el('span', 'k-tile-face'));
  const img = face.appendChild(el('img', ''));
  img.src = src;
  img.alt = '';
  img.draggable = false;
  if (kbd && !TOUCH) face.insertAdjacentHTML('beforeend', keyHtml(kbd, 'tr', 'sm'));
  face.insertAdjacentHTML('beforeend', meterHtml(0));
  const cap = root.appendChild(el('span', 'k-tile-cap'));
  const b = cap.appendChild(el('b', ''));
  const sub = cap.appendChild(el('small', ''));
  return { root, img, meter: face.querySelector<HTMLElement>('.k-meter')!, cap: b, sub, key: '' };
}

/** Подпись и полоса плитки — только если поменялись; subHtml — своя разметка (монетка) */
function paint(t: Tile, cap: string, subHtml: string, v: number, tone: string): void {
  const key = `${cap}|${subHtml}|${v.toFixed(3)}|${tone}`;
  if (key === t.key) return;
  t.key = key;
  t.cap.textContent = cap;
  t.sub.innerHTML = subHtml;
  t.meter.className = `k-meter${tone ? ` k-meter--${tone}` : ''}`;
  t.meter.style.setProperty('--v', String(Math.min(1, Math.max(0, v))));
}

/**
 * Плитки под бейджем (кит UI 2.0, lab/ui «Рыбалка», v2): рюкзак «6 / 10 · 22 🪙» (I, нажать — окно рюкзака; полон — красная
 * рамка; новая рыба — «+1»), лайвел своей лодки «12 / 25», напиток «7:40 · цена +10 %» (тает полоса) и задание Деда Семёна
 * «7 / 15 · +75 🪙» (готово — золотом). Рюкзак, лайвел и задание — с удочкой, у доски рекордов и у торговцев (context);
 * лайвел — ещё и за штурвалом; напиток — всё время, пока действует, в любой комнате. Ряд — .k-tiles: первая плитка у края экрана; лодка и рулетка ставят
 * свои плитки в этот же ряд (.fi-tiles).
 */
export class FishProgressHud {
  onBag: () => void = () => {};
  readonly row: HTMLElement;
  private readonly bag: Tile;
  private readonly well: Tile;
  private readonly drink: Tile;
  private readonly quest: Tile;
  private readonly clock = new FishClock();
  private progress: FishProgress | null = null;
  /** На набережной (Fish2Hud.frame) и с удочкой / у доски / у торговца */
  private live = false;
  private context = false;
  /** За штурвалом своей лодки: лайвел виден и без удочки (как в эталоне «за штурвалом») */
  private helm = false;
  private bagN = -1;
  private bagPop: HTMLElement | null = null;

  constructor(slot: HTMLElement) {
    this.row = slot.appendChild(el('div', 'k-tiles fi-tiles'));
    this.row.dataset.mode = 'fishing';
    this.bag = tile(this.row, 'fi-bag', gearUrl('fishshop/bag1'), 'Рюкзак', 'I', true);
    this.well = tile(this.row, 'fi-well', uiIcon('livewell'), 'Лайвел лодки', '', true);
    this.drink = tile(this.row, 'fi-drink', gearUrl('fishshop/beer'), BEER.name);
    this.quest = tile(this.row, 'fi-quest-tile', uiIcon('quest-fish'), 'Задание Деда Семёна');
    this.bag.root.addEventListener('click', () => this.onBag());
    this.well.root.addEventListener('click', () => this.onBag());
    this.paintAll();
    window.setInterval(() => this.tick(), 250);
  }

  /** На набережной (live), есть ли повод показать рюкзак и задание (context), за штурвалом ли (helm — лайвел лодки) */
  setShown(live: boolean, context: boolean, helm = false): void {
    if (live === this.live && context === this.context && helm === this.helm) return;
    this.live = live;
    this.context = context;
    this.helm = helm;
    this.paintAll();
  }

  set(progress: FishProgress, serverNow?: number): void {
    if (serverNow !== undefined) this.clock.sync(serverNow);
    const n = progress.bag.length;
    // новая рыба в рюкзаке — «+1» под плиткой (первое значение — молча)
    if (this.bagN >= 0 && n > this.bagN && this.live) this.popBag(`+${n - this.bagN}`);
    this.bagN = n;
    this.progress = progress;
    this.paintAll();
  }

  clear(): void {
    this.progress = null;
    this.bagN = -1;
    this.paintAll();
  }

  private popBag(text: string): void {
    this.bagPop?.remove();
    const p = this.bag.root.appendChild(el('span', 'k-pop', text));
    this.bagPop = p;
    setTimeout(() => { if (this.bagPop === p) this.bagPop = null; p.remove(); }, 1600);
  }

  private paintAll(): void {
    const p = this.progress;
    const ctx = this.live && this.context && p !== null;
    // рюкзак: картинка — купленный рюкзак; полон — красная рамка
    this.bag.root.hidden = !ctx;
    if (p) {
      const slots = bagSlots(p);
      const n = p.bag.length;
      const src = gearUrl(`fishshop/bag${Math.min(3, Math.max(1, p.bagTier || 1))}`);
      if (src && this.bag.img.getAttribute('src') !== src) this.bag.img.src = src;
      paint(this.bag, `${n} / ${slots}`, `${num(bagValue(p.bag))} ${coinHtml()}`, n / Math.max(1, slots), n >= slots ? 'bad' : 'good');
      this.bag.root.classList.toggle('k-tile--warn', n >= slots);
      this.bag.root.setAttribute('aria-label', `Рюкзак: ${n} из ${slots} рыб${n >= slots ? ', полон — продай улов Семёну или Сане' : ''}`);
      // лайвел своей лодки (флаг ISLE): лодки нет и пуст — плитки нет
      const cap = livewellCap(p);
      const w = livewellOf(p).length;
      this.well.root.hidden = !(ctx || (this.live && this.helm)) || (cap === 0 && w === 0);
      paint(this.well, `${w} / ${cap}`, `${num(catchValue(p, 'well'))} ${coinHtml()}`, cap ? w / cap : 0, w >= cap ? 'bad' : 'good');
      this.well.root.classList.toggle('k-tile--warn', cap > 0 && w >= cap);
      // задание Семёна: готово — золотом «сдай Семёну»
      const need = questNeed(p.questsDone);
      const ready = p.questCaught >= need;
      this.quest.root.hidden = !ctx;
      paint(this.quest, ready ? 'Готово' : `${Math.min(p.questCaught, need)} / ${need}`, ready ? 'к Семёну' : `+${num(need * 5)} ${coinHtml()}`, Math.min(1, p.questCaught / need), 'mode');
      this.quest.root.classList.toggle('k-tile--own', ready);
    } else {
      this.well.root.hidden = this.quest.root.hidden = true;
    }
    this.tick();
  }

  private tick(): void {
    const now = this.clock.now();
    const p = this.progress;
    const drink = p ? activeDrink(p, now) : 0;
    const d = drinkOf(drink);
    // напиток — в любой комнате и на паузе, пока действует (слоты HUD общие для всех комнат)
    const on = drink !== 0 && d !== null;
    this.drink.root.hidden = !on;
    if (on && p && d) {
      const until = drinkUntil(p, drink);
      const left = until - now;
      const src = gearUrl(DRINK_PIC[drink] ?? 'fishshop/beer');
      if (src && this.drink.img.getAttribute('src') !== src) this.drink.img.src = src;
      paint(this.drink, fishTimeLeft(until, now).replace(/^0(\d)/, '$1'), drinkShort(d), left / d.ms, left <= 60_000 ? 'bad' : '');
      this.drink.root.setAttribute('aria-label', `${d.name}: ещё ${this.drink.cap.textContent}`);
    }
  }
}

