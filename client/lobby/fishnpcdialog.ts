import { SANYA_PRICE } from '../../shared/barkas.ts';
import { BEER_PRICE, RAIN_DRUM_PRICE, emptyFishProgress, questNeed, unlockedRod, rodBonus, type FishProgress, type FishRod } from '../../shared/fishprogress.ts';
import type { ClientMsg, ServerMsg } from '../../shared/messages.ts';
import type { MeState } from '../scene.ts';
import { setCoinText } from '../ui/coin.ts';
import { el } from './fish2.ts';
import { FishClock, confirmedFishBeer, fishTimeLeft } from './fishclock.ts';
import { fishSkillBlock } from './fishprogresshud.ts';

const ROD_URLS = [null,
  new URL('../assets/rods/advanced.png', import.meta.url).href,
  new URL('../assets/rods/professional.png', import.meta.url).href,
  new URL('../assets/rods/master.png', import.meta.url).href,
];
const ROD_NAMES = ['Обычная', 'Продвинутая', 'Профессиональная', 'Мастерская'];
const ROD_QUESTS = [0, 1, 5, 10];
type NpcAction = Extract<ClientMsg, { t: 'fishNpc' }>['a'];
/** Кто говорит: Дед Семён у мостков или его брат Саня на баркасе «Альбатрос» — у обоих всё одинаково */
type Npc = 'semyon' | 'sanya';
const NPC_HEAD: Record<Npc, { eyebrow: string; title: string; intro: string; close: string }> = {
  semyon: { eyebrow: 'РЫБАЦКАЯ ЛАВКА', title: 'Дед Семён', intro: 'Заходи, рыбак. Пополним запасы, выберем снасти — и снова к воде.', close: 'Закрыть разговор с рыбаком' },
  sanya: {
    eyebrow: 'БАРКАС «АЛЬБАТРОС»', title: 'Саня',
    intro: 'Я Семёнов брат — у меня всё как у него на пирсе: припасы, задания, удочки. А надоест качка — домой отправлю.',
    close: 'Закрыть разговор с Саней',
  },
};

/** Native modal: focus containment and inert background, with key events kept out of game input. */
export class FishNpcDialog {
  onOpen: () => void = () => {};
  onClose: () => void = () => {};
  onBeer: () => void = () => {};
  private readonly root: HTMLDialogElement;
  private readonly body: HTMLElement;
  private readonly eyebrow: HTMLElement;
  private readonly heading: HTMLElement;
  private readonly intro: HTMLElement;
  private readonly closeBtn: HTMLButtonElement;
  /** Саня: «на мостки к Семёну» за жетоны (сервер — barkasHome) */
  private readonly homeBox: HTMLElement;
  private readonly homeBtn: HTMLButtonElement;
  private readonly homeNote: HTMLElement;
  private npc: Npc = 'semyon';
  private homePending = 0;
  private readonly balance: HTMLElement;
  private readonly skill: HTMLElement;
  private readonly status: HTMLElement;
  private readonly beerBtn: HTMLButtonElement;
  private readonly beerNote: HTMLElement;
  private readonly rainBtn: HTMLButtonElement;
  private readonly rainNote: HTMLElement;
  private readonly questTitle: HTMLElement;
  private readonly questProgress: HTMLProgressElement;
  private readonly questNote: HTMLElement;
  private readonly claimBtn: HTMLButtonElement;
  private readonly rodBtns: HTMLButtonElement[] = [];
  private readonly rodNotes: HTMLElement[] = [];
  private readonly send: (msg: ClientMsg) => void;
  private readonly me: () => MeState;
  private readonly clock = new FishClock();
  private progress = emptyFishProgress();
  private pending: NpcAction | null = null;
  private pendingBeerBefore = 0;
  private pendingTimer = 0;
  private allowOpen = true;
  private eventUntil = 0;
  private eventOn = false;
  private quiet = false;

  constructor(parent: HTMLElement, me: () => MeState, send: (msg: ClientMsg) => void) {
    this.me = me;
    this.send = send;
    this.root = el('dialog', 'fn-dialog');
    this.root.setAttribute('aria-labelledby', 'fish-npc-title');
    this.root.setAttribute('aria-describedby', 'fish-npc-intro');
    const head = this.root.appendChild(el('header', 'fn-head'));
    const title = head.appendChild(el('div', 'fn-heading'));
    this.eyebrow = title.appendChild(el('span', 'fn-eyebrow', NPC_HEAD.semyon.eyebrow));
    this.heading = title.appendChild(el('h2', '', NPC_HEAD.semyon.title));
    this.heading.id = 'fish-npc-title';
    this.balance = head.appendChild(el('div', 'fn-balance'));
    const close = this.closeBtn = head.appendChild(el('button', 'fn-close', '×'));
    close.type = 'button';
    close.autofocus = true;
    close.setAttribute('aria-label', NPC_HEAD.semyon.close);
    close.title = 'Закрыть · Esc';
    close.addEventListener('click', () => this.close());
    const body = this.body = this.root.appendChild(el('div', 'fn-body'));
    const intro = this.intro = body.appendChild(el('p', 'fn-intro', NPC_HEAD.semyon.intro));
    intro.id = 'fish-npc-intro';
    // Саня: домой, к Семёну на мостки — за жетоны сразу, бесплатно — на «Удалой»
    this.homeBox = body.appendChild(el('section', 'fn-home'));
    this.homeBox.appendChild(el('span', 'fn-item-icon', '⛵')).setAttribute('aria-hidden', 'true');
    const homeText = this.homeBox.appendChild(el('div', 'fn-home-text'));
    homeText.appendChild(el('h3', '', 'Домой, к Семёну'));
    homeText.appendChild(el('p', 'fn-fine', 'Саня свистнет знакомому катеру — и ты сразу на мостках у Семёна. Или бесплатно на «Удалой»: позвони в колокол у калитки на корме.'));
    this.homeNote = homeText.appendChild(el('div', 'fn-item-note'));
    this.homeBtn = this.homeBox.appendChild(el('button', 'fn-action'));
    this.homeBtn.type = 'button';
    this.homeBtn.addEventListener('click', () => this.goHome());
    this.homeBox.hidden = true;
    const overview = body.appendChild(el('div', 'fn-overview'));
    this.skill = overview.appendChild(el('div', 'fn-skill'));
    const shop = body.appendChild(el('section', 'fn-shop'));
    shop.appendChild(el('h3', '', 'Припасы для рыбалки'));
    const offers = shop.appendChild(el('div', 'fn-offers'));
    const beer = offers.appendChild(el('article', 'fn-offer'));
    beer.appendChild(el('span', 'fn-item-icon', '🍺')).setAttribute('aria-hidden', 'true');
    beer.appendChild(el('h4', '', 'Рыбацкое пиво'));
    beer.appendChild(el('p', '', '10 минут: редкие виды клюют чаще, доход от пойманной рыбы +10%.'));
    beer.appendChild(el('p', 'fn-fine', 'Только рыба. Сундуки, открытия и задания — без этого бонуса.'));
    this.beerNote = beer.appendChild(el('div', 'fn-item-note'));
    this.beerBtn = beer.appendChild(el('button', 'fn-action'));
    this.beerBtn.type = 'button';
    this.beerBtn.addEventListener('click', () => this.request('beer'));
    const rain = offers.appendChild(el('article', 'fn-offer'));
    rain.appendChild(el('span', 'fn-item-icon', '🥁')).setAttribute('aria-hidden', 'true');
    rain.appendChild(el('h4', '', 'Бубен дождя'));
    rain.appendChild(el('p', '', 'Сразу вызывает рыболовное событие для всех игроков — тот же дождь, что приходит сам.'));
    rain.appendChild(el('p', 'fn-fine', 'Во время события доступны уникальные виды. Доход ×1,5 — только от этих рыб.'));
    this.rainNote = rain.appendChild(el('div', 'fn-item-note'));
    this.rainBtn = rain.appendChild(el('button', 'fn-action'));
    this.rainBtn.type = 'button';
    this.rainBtn.addEventListener('click', () => this.request('rain'));
    const quest = overview.appendChild(el('section', 'fn-quest'));
    const qhead = quest.appendChild(el('div', 'fn-section-head'));
    this.questTitle = qhead.appendChild(el('h3', ''));
    this.claimBtn = qhead.appendChild(el('button', 'fn-action'));
    this.claimBtn.type = 'button';
    this.claimBtn.addEventListener('click', () => this.request('claim'));
    this.questProgress = quest.appendChild(el('progress', 'fs-xp'));
    this.questNote = quest.appendChild(el('p', 'fn-fine'));
    const rods = body.appendChild(el('section', 'fn-rods'));
    rods.appendChild(el('h3', '', 'Удочки за задания'));
    rods.appendChild(el('p', 'fn-fine', 'Выбери одну удочку. Её бонус ускоряет поклёвку и расширяет зелёную зону.'));
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
      card.appendChild(el('span', 'fn-rod-bonus', rod ? `+${Math.round(rodBonus(rod as FishRod) * 100)}%` : 'Без бонуса'));
      this.rodNotes.push(card.appendChild(el('span', 'fn-fine')));
      const button = card.appendChild(el('button', 'fn-action'));
      button.type = 'button';
      button.addEventListener('click', () => this.request('rod', rod));
      this.rodBtns.push(button);
    }
    const footer = this.root.appendChild(el('footer', 'fn-footer'));
    const feedback = footer.appendChild(el('div', 'fn-feedback'));
    this.status = feedback.appendChild(el('div', 'fn-status'));
    this.status.setAttribute('role', 'status');
    feedback.appendChild(el('div', 'fn-shortcuts', 'Esc — закрыть · J — журнал рыбака после закрытия'));
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

  onState(msg: Extract<ServerMsg, { t: 'fishNpc' }>): void {
    const drink = confirmedFishBeer(this.pending, this.pendingBeerBefore, msg.progress.beerUntil, msg.now);
    this.clearPending();
    this.progress = msg.progress;
    this.clock.sync(msg.now);
    this.setNpc(msg.npc ?? 'semyon');
    if (msg.open && !this.isOpen && this.allowOpen) {
      this.status.textContent = '';
      this.render();
      this.root.showModal();
      this.body.scrollTop = 0;
      this.onOpen();
    }
    if (msg.message) setCoinText(this.status, msg.message);
    this.render();
    if (drink) this.onBeer();
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

  /** Ответ на «домой к Семёну»: отправил — разговор закрывается (сцена покажет тост), нет — почему. */
  onHome(ok: boolean, message: string): void {
    window.clearTimeout(this.homePending);
    this.homePending = 0;
    if (ok) {
      this.close();
      return;
    }
    setCoinText(this.status, message);
    this.render();
  }

  private goHome(): void {
    if (this.homePending || this.pending !== null) return;
    this.status.textContent = 'Саня свистит знакомому катеру…';
    this.homePending = window.setTimeout(() => {
      this.homePending = 0;
      this.status.textContent = 'Ответ не пришёл — попробуй ещё раз.';
      this.render();
    }, 5000);
    this.render();
    this.send({ t: 'barkasHome' });
  }

  /** Шапка, вступление и блок «домой» — по тому, кто говорит. */
  private setNpc(npc: Npc): void {
    if (npc === this.npc) return;
    this.npc = npc;
    const h = NPC_HEAD[npc];
    this.eyebrow.textContent = h.eyebrow;
    this.heading.textContent = h.title;
    this.intro.textContent = h.intro;
    this.closeBtn.setAttribute('aria-label', h.close);
    this.homeBox.hidden = npc !== 'sanya';
  }

  requestOpen(): void {
    this.allowOpen = true;
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

  private request(a: NpcAction, rod?: number): void {
    if (this.pending !== null) return;
    this.pending = a;
    this.pendingBeerBefore = this.progress.beerUntil;
    this.status.textContent = 'Рыбак проверяет запас…';
    this.pendingTimer = window.setTimeout(() => {
      this.clearPending();
      this.status.textContent = 'Ответ не пришёл. Проверь баланс и попробуй ещё раз — действие автоматически не повторяется.';
      this.render();
    }, 5000);
    this.render();
    this.send({ t: 'fishNpc', a, ...(rod === undefined ? {} : { rod }) });
  }

  private clearPending(): void {
    window.clearTimeout(this.pendingTimer);
    this.pendingTimer = 0;
    this.pending = null;
  }

  private render(): void {
    const p = this.progress;
    const now = this.clock.now();
    const busy = this.pending !== null;
    const tokens = this.me().tokens;
    const beerActive = p.beerUntil > now;
    setCoinText(this.balance, `У тебя 🪙 ${tokens.toLocaleString('ru-RU')}`);
    this.skill.replaceChildren(fishSkillBlock(p));
    this.beerNote.textContent = beerActive ? `Уже действует · ${fishTimeLeft(p.beerUntil, now)}` : tokens < BEER_PRICE ? `Не хватает ${BEER_PRICE - tokens} жетонов` : 'Можно выпить перед следующим забросом';
    setCoinText(this.beerBtn, `Выпить · ${BEER_PRICE} 🪙`);
    this.beerBtn.disabled = busy || beerActive || tokens < BEER_PRICE;
    const eventActive = this.eventOn && (this.eventUntil === 0 || this.eventUntil > now);
    this.rainNote.textContent = eventActive ? `Событие уже идёт${this.eventUntil ? ` · ${fishTimeLeft(this.eventUntil, now)}` : ''}` : tokens < RAIN_DRUM_PRICE ? `Не хватает ${RAIN_DRUM_PRICE - tokens} жетонов` : 'Начнётся сразу после покупки';
    setCoinText(this.rainBtn, `Вызвать событие · ${RAIN_DRUM_PRICE} 🪙`);
    this.rainBtn.disabled = busy || eventActive || tokens < RAIN_DRUM_PRICE;
    const need = questNeed(p.questsDone);
    const ready = p.questCaught >= need;
    this.questTitle.textContent = `Задание ${p.questsDone + 1} · поймай ${need} рыб`;
    this.questProgress.max = need;
    this.questProgress.value = Math.min(need, p.questCaught);
    this.questProgress.setAttribute('aria-label', `Поймано ${p.questCaught} из ${need} рыб для задания`);
    this.questNote.textContent = `${p.questCaught} / ${need} рыб · выполнено заданий: ${p.questsDone}. Сорванная рыба и сундуки не считаются. Сдай выполненное задание ${this.npc === 'sanya' ? 'Сане' : 'Семёну'}: следующее начнётся с нуля.`;
    setCoinText(this.claimBtn, `${ready ? 'Получить' : 'Награда'} · ${need * 5} 🪙`);
    this.claimBtn.disabled = busy || !ready;
    if (this.npc === 'sanya') {
      this.homeNote.textContent = tokens < SANYA_PRICE ? `Не хватает ${SANYA_PRICE - tokens} жетонов` : 'Сразу — без ожидания лодки';
      setCoinText(this.homeBtn, `На мостки к Семёну · ${SANYA_PRICE} 🪙`);
      this.homeBtn.disabled = busy || this.homePending !== 0 || tokens < SANYA_PRICE;
    }
    const unlocked = unlockedRod(p.questsDone);
    for (let rod = 0; rod < this.rodBtns.length; rod++) {
      const selected = p.rod === rod;
      const earned = rod <= unlocked;
      const btn = this.rodBtns[rod];
      btn.textContent = selected ? 'Выбрана' : earned ? 'Выбрать' : 'Пока закрыта';
      btn.disabled = busy || selected || !earned;
      btn.setAttribute('aria-pressed', String(selected));
      btn.parentElement!.classList.toggle('selected', selected);
      this.rodNotes[rod].textContent = earned ? selected ? 'В руках · бонус действует' : 'Получена за задания' : `После ${ROD_QUESTS[rod]}-го задания`;
    }
  }
}
