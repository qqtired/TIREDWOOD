// Разговор с Дедом Семёном (пристань) и Саней (баркас) — один диалог на двоих (fisheco): вкладки «Квесты» (уровень,
// что он даёт, задание, удочки), «Лавка» (рюкзаки, блёсны, напитки, бубен — эффект, требование, цена) и «Продать»
// (улов из рюкзака по цене поимки). Решает сервер (server/lobby/fishnpc.ts); здесь — только просьбы и показ.
// Контейнер extra в шапке — для чужих кнопок (перевоз Сани — модуль баркаса), этот файл трогать не нужно.
import { FISH } from '../../shared/fishing.ts';
import type { FishNpcId } from '../../shared/fishplaces.ts';
import {
  ALE_PRICE, BEER_PRICE, RAIN_DRUM_PRICE, activeDrink, bagSlots, bagValue, emptyFishProgress, fishLevel, questNeed, rodBonus, unlockedRod,
  type FishProgress, type FishRod,
} from '../../shared/fishprogress.ts';
import { ALE, BAGS, BEER, LURES, gearState, type GearState } from '../../shared/fishshop.ts';
import { RAIN_TOP_MUL, fmtCatch } from '../../shared/fishrules.ts';
import type { ClientMsg, FishNpcAction, ServerMsg } from '../../shared/messages.ts';
import type { MeState } from '../scene.ts';
import { setCoinText } from '../ui/coin.ts';
import { el, fishPic, tierOf } from './fish2.ts';
import { FishClock, fishTimeLeft } from './fishclock.ts';
import { bagMarks, levelOpens, levelPerks, mul, num, pct, shopImg, xpTo } from './fishfmt.ts';
import { fishSkillBlock } from './fishprogresshud.ts';
import './fisheco.css';

const ROD_URLS = [null,
  new URL('../assets/rods/advanced.png', import.meta.url).href,
  new URL('../assets/rods/professional.png', import.meta.url).href,
  new URL('../assets/rods/master.png', import.meta.url).href,
];
const ROD_NAMES = ['Обычная', 'Продвинутая', 'Профессиональная', 'Мастерская'];
const ROD_QUESTS = [0, 1, 5, 10];
const NPC_TITLE: Record<FishNpcId, string> = { semyon: 'Дед Семён', sanya: 'Саня' };
const NPC_EYEBROW: Record<FishNpcId, string> = { semyon: 'ПРИСТАНЬ · ЛАВКА И ЗАДАНИЯ', sanya: 'БАРКАС · ЛАВКА И ЗАДАНИЯ' };
const NPC_INTRO: Record<FishNpcId, string> = {
  semyon: 'Заходи, рыбак. Сдашь улов, возьмёшь снасти — и снова к воде.',
  sanya: 'В море рыба крупнее и злее. Улов возьму, снасти продам.',
};
type Tab = 'quests' | 'shop' | 'sell';
const TABS: ReadonlyArray<[Tab, string]> = [['quests', 'Квесты'], ['shop', 'Лавка'], ['sell', 'Продать']];

interface Offer {
  root: HTMLElement;
  note: HTMLElement;
  btn: HTMLButtonElement;
}

/** Native modal: focus containment and inert background, with key events kept out of game input. */
export class FishNpcDialog {
  onOpen: () => void = () => {};
  onClose: () => void = () => {};
  onBeer: () => void = () => {};
  /** Шапка: сюда другие модули кладут свои кнопки (например, «Перевезти» у Сани) */
  readonly extra: HTMLElement;
  private readonly root: HTMLDialogElement;
  private readonly body: HTMLElement;
  private readonly title: HTMLElement;
  private readonly eyebrow: HTMLElement;
  private readonly intro: HTMLElement;
  private readonly balance: HTMLElement;
  private readonly status: HTMLElement;
  private readonly tabBtns = new Map<Tab, HTMLButtonElement>();
  private readonly panels = new Map<Tab, HTMLElement>();
  // квесты
  private readonly skill: HTMLElement;
  private readonly perks: HTMLElement;
  private readonly questTitle: HTMLElement;
  private readonly questProgress: HTMLProgressElement;
  private readonly questNote: HTMLElement;
  private readonly claimBtn: HTMLButtonElement;
  private readonly rodBtns: HTMLButtonElement[] = [];
  private readonly rodNotes: HTMLElement[] = [];
  // лавка
  private readonly bags: Offer[] = [];
  private readonly lures: Offer[] = [];
  private readonly beer: Offer;
  private readonly ale: Offer;
  private readonly drum: Offer;
  // продажа
  private readonly sellHead: HTMLElement;
  private readonly sellList: HTMLElement;
  private readonly sellAll: HTMLButtonElement;
  private readonly send: (msg: ClientMsg) => void;
  private readonly me: () => MeState;
  private readonly clock = new FishClock();
  private progress = emptyFishProgress();
  private npc: FishNpcId = 'semyon';
  private tab: Tab = 'quests';
  private pending: FishNpcAction | null = null;
  private drinkBefore = 0;
  private pendingTimer = 0;
  private allowOpen = true;
  private eventUntil = 0;
  private eventOn = false;
  private quiet = false;
  private sellKey = '';

  constructor(parent: HTMLElement, me: () => MeState, send: (msg: ClientMsg) => void) {
    this.me = me;
    this.send = send;
    this.root = el('dialog', 'fn-dialog fe-npc');
    this.root.setAttribute('aria-labelledby', 'fish-npc-title');
    this.root.setAttribute('aria-describedby', 'fish-npc-intro');
    const head = this.root.appendChild(el('header', 'fn-head'));
    const titleBox = head.appendChild(el('div', 'fn-heading'));
    this.eyebrow = titleBox.appendChild(el('span', 'fn-eyebrow'));
    this.title = titleBox.appendChild(el('h2', ''));
    this.title.id = 'fish-npc-title';
    const side = head.appendChild(el('div', 'fe-headside'));
    this.balance = side.appendChild(el('div', 'fn-balance'));
    this.extra = side.appendChild(el('div', 'fe-extra'));
    const close = head.appendChild(el('button', 'fn-close', '×'));
    close.type = 'button';
    close.autofocus = true;
    close.setAttribute('aria-label', 'Закрыть разговор');
    close.title = 'Закрыть · Esc';
    close.addEventListener('click', () => this.close());

    const tabs = this.root.appendChild(el('nav', 'fe-tabs'));
    tabs.setAttribute('role', 'tablist');
    for (const [id, label] of TABS) {
      const b = tabs.appendChild(el('button', 'fe-tab'));
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.tab = id;
      b.appendChild(el('span', '', label));
      b.appendChild(el('i', 'fe-tab-n'));
      b.addEventListener('click', () => this.show(id));
      this.tabBtns.set(id, b);
    }

    const body = this.body = this.root.appendChild(el('div', 'fn-body'));
    this.intro = body.appendChild(el('p', 'fn-intro'));
    this.intro.id = 'fish-npc-intro';

    // --- Квесты: уровень и что он даёт, задание, удочки
    const quests = this.panel('quests');
    const overview = quests.appendChild(el('div', 'fn-overview'));
    const skillBox = overview.appendChild(el('div', 'fn-skill fe-skillbox'));
    this.skill = skillBox.appendChild(el('div', ''));
    this.perks = skillBox.appendChild(el('div', 'fe-perks'));
    const quest = overview.appendChild(el('section', 'fn-quest'));
    const qhead = quest.appendChild(el('div', 'fn-section-head'));
    this.questTitle = qhead.appendChild(el('h3', ''));
    this.claimBtn = qhead.appendChild(el('button', 'fn-action'));
    this.claimBtn.type = 'button';
    this.claimBtn.addEventListener('click', () => this.request('claim'));
    this.questProgress = quest.appendChild(el('progress', 'fs-xp'));
    this.questNote = quest.appendChild(el('p', 'fn-fine'));
    const rods = quests.appendChild(el('section', 'fn-rods'));
    rods.appendChild(el('h3', '', 'Удочки за задания'));
    rods.appendChild(el('p', 'fn-fine', 'В руках одна удочка — выбери любую заработанную.'));
    const grid = rods.appendChild(el('div', 'fn-rod-grid'));
    for (let rod = 0; rod <= 3; rod++) {
      const card = grid.appendChild(el('article', 'fn-rod'));
      const src = ROD_URLS[rod];
      if (src) {
        const img = card.appendChild(el('img', 'fn-rod-pic'));
        img.src = src;
        img.alt = `${ROD_NAMES[rod]} удочка`;
        img.draggable = false;
        img.decoding = 'async';
      } else card.appendChild(el('div', 'fn-rod-base', '🎣')).setAttribute('aria-hidden', 'true');
      card.appendChild(el('h4', '', ROD_NAMES[rod]));
      const b = Math.round(rodBonus(rod as FishRod) * 100);
      card.appendChild(el('span', 'fn-rod-bonus', rod ? `зона +${b}% · поклёвка быстрее на ${b}% · редкие ${mul(1 + 0.05 * rod)}` : 'Без бонуса'));
      this.rodNotes.push(card.appendChild(el('span', 'fn-fine')));
      const button = card.appendChild(el('button', 'fn-action'));
      button.type = 'button';
      button.addEventListener('click', () => this.request('rod', { rod }));
      this.rodBtns.push(button);
    }

    // --- Лавка
    const shop = this.panel('shop');
    shop.appendChild(el('h3', '', 'Рюкзаки'));
    shop.appendChild(el('p', 'fn-fine', 'Улов лежит в рюкзаке, пока не продашь. Без рюкзака в руках 5 рыб. Действует лучший купленный.'));
    const bagGrid = shop.appendChild(el('div', 'fe-offers'));
    for (const b of BAGS) {
      const o = this.offer(bagGrid, b.id, b.name, `${b.slots} мест в рюкзаке`);
      o.btn.addEventListener('click', () => this.request('buy', { item: b.id }));
      this.bags.push(o);
    }
    shop.appendChild(el('h3', '', 'Блёсны'));
    shop.appendChild(el('p', 'fn-fine', 'Покупаются навсегда, на леске — лучшая. Рыба дёргает мягче, эпические и выше клюют чаще.'));
    const lureGrid = shop.appendChild(el('div', 'fe-offers'));
    for (const l of LURES) {
      const o = this.offer(lureGrid, l.id, l.name, `рывки −${Math.round(l.calm * 100)}% · эпические и выше ${mul(l.epic)}`);
      o.btn.addEventListener('click', () => this.request('buy', { item: l.id }));
      this.lures.push(o);
    }
    shop.appendChild(el('h3', '', 'Напитки и бубен'));
    shop.appendChild(el('p', 'fn-fine', 'Напиток действует 10 минут, один за раз: эль сильнее и заменяет пиво. Бонус — только к рыбе.'));
    const more = shop.appendChild(el('div', 'fe-offers'));
    this.beer = this.offer(more, 'beer', BEER.name, `доход от рыбы ${pct(BEER.income)} · редкие и выше ${mul(BEER.rare)}`);
    this.beer.btn.addEventListener('click', () => this.request('beer'));
    this.ale = this.offer(more, 'ale', ALE.name, `доход от рыбы ${pct(ALE.income)} · редкие и выше ${mul(ALE.rare)}`);
    this.ale.btn.addEventListener('click', () => this.request('ale'));
    this.drum = this.offer(more, 'drum', 'Бубен дождя', `сразу дождь для всех: виды дождя (${mul(1.5)} к цене), легенды и мифик ${mul(RAIN_TOP_MUL)}`);
    this.drum.btn.addEventListener('click', () => this.request('rain'));

    // --- Продать
    const sell = this.panel('sell');
    const sh = sell.appendChild(el('div', 'fn-section-head'));
    this.sellHead = sh.appendChild(el('h3', ''));
    this.sellAll = sh.appendChild(el('button', 'fn-action'));
    this.sellAll.type = 'button';
    this.sellAll.addEventListener('click', () => this.request('sellAll'));
    sell.appendChild(el('p', 'fn-fine', 'Цена каждой рыбы зафиксирована при поимке: напиток, баркас и дождь уже внутри. Опыт ты получил сразу.'));
    this.sellList = sell.appendChild(el('div', 'fe-sell'));

    const footer = this.root.appendChild(el('footer', 'fn-footer'));
    const feedback = footer.appendChild(el('div', 'fn-feedback'));
    this.status = feedback.appendChild(el('div', 'fn-status'));
    this.status.setAttribute('role', 'status');
    feedback.appendChild(el('div', 'fn-shortcuts', 'Esc — закрыть · I — рюкзак · J — журнал после закрытия'));
    const bottomClose = footer.appendChild(el('button', 'fn-action fn-dismiss', 'Закрыть'));
    bottomClose.type = 'button';
    bottomClose.addEventListener('click', () => this.close());
    this.root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
    this.root.addEventListener('keyup', (e) => e.stopPropagation());
    this.root.addEventListener('cancel', (e) => { e.preventDefault(); this.close(); });
    this.root.addEventListener('click', (e) => {
      if (e.target !== this.root) return;
      const r = this.root.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) this.close();
    });
    parent.appendChild(this.root);
    window.setInterval(() => { if (this.isOpen) this.render(); }, 1000);
  }

  get isOpen(): boolean { return this.root.open; }

  /** С кем сейчас разговор */
  get who(): FishNpcId { return this.npc; }

  onState(msg: Extract<ServerMsg, { t: 'fishNpc' }>): void {
    const drank = (this.pending === 'beer' && msg.progress.beerUntil > this.drinkBefore && msg.progress.beerUntil > msg.now)
      || (this.pending === 'ale' && msg.progress.aleUntil > this.drinkBefore && msg.progress.aleUntil > msg.now);
    this.clearPending();
    this.progress = msg.progress;
    this.clock.sync(msg.now);
    if (msg.open && !this.isOpen && this.allowOpen) {
      this.npc = msg.npc;
      this.status.textContent = '';
      this.tab = msg.progress.bag.length > 0 ? 'sell' : 'quests';
      this.sellKey = '';
      this.render();
      this.root.showModal();
      this.body.scrollTop = 0;
      this.onOpen();
    }
    if (msg.message) setCoinText(this.status, msg.message);
    this.render();
    if (drank) this.onBeer();
  }

  setProgress(progress: FishProgress, now?: number): void {
    this.progress = progress;
    if (now !== undefined) this.clock.sync(now);
    if (this.isOpen) this.render();
  }

  setEvent(on: boolean, until: number): void {
    this.eventOn = on;
    this.eventUntil = until;
    if (this.isOpen) this.render();
  }

  refresh(): void { if (this.isOpen) this.render(); }

  /** E у Семёна или Сани */
  requestOpen(npc: FishNpcId = 'semyon'): void {
    this.allowOpen = true;
    this.npc = npc;
    this.request('open');
  }

  close(quiet = false): void {
    this.allowOpen = false;
    if (!this.isOpen) {
      if (quiet) this.clearPending();
      return;
    }
    this.quiet = quiet;
    this.root.close();
    if (quiet) this.clearPending();
    if (!this.quiet) this.onClose();
    this.quiet = false;
  }

  private panel(id: Tab): HTMLElement {
    const p = this.body.appendChild(el('section', 'fe-panel'));
    p.setAttribute('role', 'tabpanel');
    p.dataset.tab = id;
    this.panels.set(id, p);
    return p;
  }

  private offer(parent: HTMLElement, img: string, name: string, effect: string): Offer {
    const root = parent.appendChild(el('article', 'fe-offer'));
    const url = shopImg(img);
    if (url) {
      const pic = root.appendChild(el('img', 'fe-offer-pic'));
      pic.src = url;
      pic.alt = '';
      pic.draggable = false;
      pic.decoding = 'async';
    } else root.appendChild(el('div', 'fe-offer-pic'));
    const text = root.appendChild(el('div', 'fe-offer-text'));
    text.appendChild(el('h4', '', name));
    text.appendChild(el('p', 'fe-offer-eff', effect));
    const note = text.appendChild(el('div', 'fn-item-note'));
    const btn = root.appendChild(el('button', 'fn-action'));
    btn.type = 'button';
    return { root, note, btn };
  }

  private show(tab: Tab): void {
    this.tab = tab;
    this.render();
    this.body.scrollTop = 0;
  }

  private request(a: FishNpcAction, extra: { rod?: number; item?: string; n?: number } = {}): void {
    if (this.pending !== null) return;
    this.pending = a;
    this.drinkBefore = a === 'ale' ? this.progress.aleUntil : this.progress.beerUntil;
    if (a !== 'open') this.status.textContent = this.npc === 'sanya' ? 'Саня считает…' : 'Семён считает…';
    this.pendingTimer = window.setTimeout(() => {
      this.clearPending();
      this.status.textContent = 'Ответ не пришёл. Проверь баланс и попробуй ещё раз — действие само не повторяется.';
      this.render();
    }, 5000);
    if (this.isOpen) this.render();
    this.send({ t: 'fishNpc', npc: this.npc, a, ...extra });
  }

  private clearPending(): void {
    window.clearTimeout(this.pendingTimer);
    this.pendingTimer = 0;
    this.pending = null;
  }

  private gearNote(state: GearState, level: number, price: number, tokens: number, have: string): string {
    if (state === 'owned') return have;
    if (state === 'better') return 'У тебя есть лучше';
    if (state === 'level') return `С ${level}-го уровня рыбалки · ещё ${num(xpTo(this.progress, level))} XP`;
    if (state === 'tokens') return `Не хватает ${num(price - tokens)} 🪙`;
    return 'Можно купить';
  }

  private render(): void {
    const p = this.progress;
    const now = this.clock.now();
    const busy = this.pending !== null;
    const tokens = this.me().tokens;
    const level = fishLevel(p.xp);
    this.title.textContent = NPC_TITLE[this.npc];
    this.eyebrow.textContent = NPC_EYEBROW[this.npc];
    this.intro.textContent = NPC_INTRO[this.npc];
    this.root.dataset.npc = this.npc;
    setCoinText(this.balance, `У тебя 🪙 ${num(tokens)}`);
    const need = questNeed(p.questsDone);
    const ready = p.questCaught >= need;
    for (const [id, b] of this.tabBtns) {
      const on = id === this.tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
      this.panels.get(id)!.hidden = !on;
    }
    this.tabBtns.get('quests')!.classList.toggle('dot', ready);
    this.tabBtns.get('sell')!.querySelector('.fe-tab-n')!.textContent = p.bag.length ? String(p.bag.length) : '';

    // --- квесты
    this.skill.replaceChildren(fishSkillBlock(p));
    const next = Math.min(10, level + 1);
    const opens = levelOpens(next);
    this.perks.textContent = level >= 10
      ? `Ур. 10: ${levelPerks(10)} — максимум`
      : `${level ? `Сейчас — ${levelPerks(level)}` : 'Бонусов уровня пока нет'}. На ур. ${next}: ${levelPerks(next)}${opens.length ? ` · откроется: ${opens.join(', ')}` : ''}.`;
    this.questTitle.textContent = `Задание ${p.questsDone + 1} · поймай ${need} рыб`;
    this.questProgress.max = need;
    this.questProgress.value = Math.min(need, p.questCaught);
    this.questProgress.setAttribute('aria-label', `Поймано ${p.questCaught} из ${need} рыб для задания`);
    this.questNote.textContent = `${p.questCaught} / ${need} рыб · выполнено заданий: ${p.questsDone}. Сорванная рыба и сундуки не считаются. Удочки — за 1-е, 5-е и 10-е задание.`;
    setCoinText(this.claimBtn, `${ready ? 'Получить' : 'Награда'} · ${need * 5} 🪙`);
    this.claimBtn.disabled = busy || !ready;
    const unlocked = unlockedRod(p.questsDone);
    for (let rod = 0; rod < this.rodBtns.length; rod++) {
      const selected = p.rod === rod;
      const earned = rod <= unlocked;
      const btn = this.rodBtns[rod];
      btn.textContent = selected ? 'В руках' : earned ? 'Взять' : 'Закрыта';
      btn.disabled = busy || selected || !earned;
      btn.setAttribute('aria-pressed', String(selected));
      btn.parentElement!.classList.toggle('selected', selected);
      this.rodNotes[rod].textContent = earned ? selected ? rod ? 'В руках · бонус действует' : 'В руках' : 'Получена за задания' : `После ${ROD_QUESTS[rod]}-го задания`;
    }

    // --- лавка
    BAGS.forEach((b, i) => {
      const o = this.bags[i];
      const st = gearState('bag', b.tier, p.bagTier, level, tokens);
      o.note.textContent = this.gearNote(st, b.level, b.price, tokens, `Твой · ${bagSlots(p)} мест`);
      setCoinText(o.btn, st === 'owned' ? 'Куплен' : `Купить · ${num(b.price)} 🪙`);
      o.btn.disabled = busy || st !== 'ok';
      o.root.classList.toggle('owned', st === 'owned');
      o.root.classList.toggle('locked', st === 'level');
    });
    LURES.forEach((l, i) => {
      const o = this.lures[i];
      const st = gearState('lure', l.tier, p.lure, level, tokens);
      o.note.textContent = this.gearNote(st, l.level, l.price, tokens, 'На леске · действует');
      setCoinText(o.btn, st === 'owned' ? 'На леске' : `Купить · ${num(l.price)} 🪙`);
      o.btn.disabled = busy || st !== 'ok';
      o.root.classList.toggle('owned', st === 'owned');
      o.root.classList.toggle('locked', st === 'level');
    });
    const drink = activeDrink(p, now);
    this.beer.note.textContent = drink === 1 ? `Действует · ${fishTimeLeft(p.beerUntil, now)}` : drink === 2 ? 'Эль крепче — пиво поверх не наливают'
      : tokens < BEER_PRICE ? `Не хватает ${BEER_PRICE - tokens} 🪙` : 'Перед следующим забросом';
    setCoinText(this.beer.btn, `Выпить · ${BEER_PRICE} 🪙`);
    this.beer.btn.disabled = busy || drink !== 0 || tokens < BEER_PRICE;
    this.beer.root.classList.toggle('owned', drink === 1);
    this.ale.note.textContent = drink === 2 ? `Действует · ${fishTimeLeft(p.aleUntil, now)}` : drink === 1 ? 'Заменит пиво — остаток пива пропадёт'
      : tokens < ALE_PRICE ? `Не хватает ${ALE_PRICE - tokens} 🪙` : 'Для опытных: редкие чаще, чем с пивом';
    setCoinText(this.ale.btn, `Выпить · ${ALE_PRICE} 🪙`);
    this.ale.btn.disabled = busy || drink === 2 || tokens < ALE_PRICE;
    this.ale.root.classList.toggle('owned', drink === 2);
    const eventActive = this.eventOn && (this.eventUntil === 0 || this.eventUntil > now);
    this.drum.note.textContent = eventActive ? `Дождь уже идёт${this.eventUntil ? ` · ${fishTimeLeft(this.eventUntil, now)}` : ''}`
      : tokens < RAIN_DRUM_PRICE ? `Не хватает ${num(RAIN_DRUM_PRICE - tokens)} 🪙` : 'Начнётся сразу';
    setCoinText(this.drum.btn, `Ударить · ${num(RAIN_DRUM_PRICE)} 🪙`);
    this.drum.btn.disabled = busy || eventActive || tokens < RAIN_DRUM_PRICE;

    // --- продажа
    const total = bagValue(p.bag);
    this.sellHead.textContent = `Рюкзак · ${p.bag.length} из ${bagSlots(p)}`;
    setCoinText(this.sellAll, p.bag.length ? `Продать всё · ${num(total)} 🪙` : 'Продать всё');
    this.sellAll.disabled = busy || !p.bag.length;
    const key = `${busy}|${p.bag.map((f) => f.n).join(',')}`;
    if (key !== this.sellKey) {
      this.sellKey = key;
      this.sellList.replaceChildren(...(p.bag.length ? p.bag.map((f) => this.sellRow(f.n, f.f, f.g, f.p, f.m, busy)) : [el('p', 'fe-empty', 'Рюкзак пуст. Пойманная рыба ложится сюда по цене поимки.')]));
    }
  }

  private sellRow(n: number, id: string, g: number, price: number, m: number, busy: boolean): HTMLElement {
    const sp = FISH.findIndex((f) => f.id === id);
    const row = el('div', 'fe-row');
    const t = tierOf(sp);
    row.style.setProperty('--tc', t.css);
    row.appendChild(fishPic(sp, 'fe-row-pic'));
    const info = row.appendChild(el('div', 'fe-row-info'));
    info.appendChild(el('b', '', FISH[sp]?.name ?? id));
    info.appendChild(el('span', '', `${t.name} · ${fmtCatch(g)}`));
    const marks = bagMarks(m);
    if (marks.length) info.appendChild(el('span', 'fe-marks', marks.join(' · ')));
    setCoinText(row.appendChild(el('div', 'fe-row-price')), `${num(price)} 🪙`);
    const b = row.appendChild(el('button', 'fn-action', 'Продать'));
    b.type = 'button';
    b.disabled = busy;
    b.addEventListener('click', () => this.request('sell', { n }));
    return row;
  }
}
