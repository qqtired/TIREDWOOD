// Разговор с Дедом Семёном (пристань), Саней (баркас) и смотрителем Игнатом (остров, флаг ISLE) — одно окно кита UI 2.0
// (эталон: lab/ui/screens/fishing.js, сцена «6. Дед Семён»). Шапка: портрет (Семён — кадр из игры, Саня — якорь, Игнат —
// маяк), где он и что делает, реплика, справа — чужие кнопки (extra: «Домой, к Семёну» у Сани — barkas/sanyahome.ts,
// «На большую землю» у Игната — isle/ignathome.ts), жетоны и крестик. Вкладки «Задания» (задание и удочки за задания),
// «Лавка» (напитки и бубен, рюкзаки, блёсны; у Игната только напитки), «Продать» (улов из рюкзака и лайвела по цене
// поимки) и чужие (addTab: «Награды» из журнала и «Лодки» у Семёна). Уровень и сезон окно не повторяет — они в HUD.
// Почему нельзя купить — отдельной красной строкой .fi-why, кнопка тогда выключена. Ответ торговца — подвал окна.
// Решает сервер (server/lobby/fishnpc.ts); здесь — только просьбы и показ.
import type { FishNpcId } from '../../shared/fishplaces.ts';
import {
  ALE_PRICE, BEER_PRICE, RAIN_DRUM_PRICE, RODS, ROD_MAX, VODKA_PRICE, activeDrink, bagSlots, bagValue, emptyFishProgress, fishLevel, questNeed, rodBonus,
  rodOdds, unlockedRod, type FishProgress, type FishRod,
} from '../../shared/fishprogress.ts';
import { ALE, BAGS, BEER, LURES, VODKA, gearState, type GearState } from '../../shared/fishshop.ts';
import { catchValue, livewellCap, livewellOf } from '../../shared/fishlivewell.ts';
import type { ClientMsg, FishNpcAction, ServerMsg } from '../../shared/messages.ts';
import type { MeState } from '../scene.ts';
import { setCoinText } from '../ui/coin.ts';
import { FISH_ICONS } from '../ui/fishicons.ts';
import { coinHtml, h, iconImg } from '../ui/kit/dom.ts';
import { uiIcon } from '../ui/kit/icons.ts';
import { catchRowHtml, emptyHtml } from './fishbag.ts';
import { FishClock, fishTimeLeft } from './fishclock.ts';
import { mul, num, pct, xpTo } from './fishfmt.ts';
import { fishDialog, gearUrl, portraitUrl, tabsHtml, winHeadHtml, winIn } from './fishkit.ts';
// старые стили окна (fe-*, fn-*) — до уборки ведущим
import { escHtml as esc } from '../ui/kit/topcenter.ts';
import './fisheco.css';
import './fishwin.css';

/** «+10 %» (fishfmt.pct пишет «+10%») */
const pctSp = (x: number): string => pct(x).replace('%', ' %');
/** «1 рыба», «3 рыбы», «8 рыб» */
function fishN(n: number): string {
  const d = n % 10;
  const t = n % 100;
  if (d === 1 && t !== 11) return `${n} рыба`;
  if (d >= 2 && d <= 4 && (t < 12 || t > 14)) return `${n} рыбы`;
  return `${n} рыб`;
}

const ROD_PICS = ['', 'advanced', 'professional', 'master', 'legendary'];
const NPC_TITLE: Record<FishNpcId, string> = { semyon: 'Дед Семён', sanya: 'Саня', ignat: 'Смотритель Игнат' };
const NPC_EYEBROW: Record<FishNpcId, string> = {
  semyon: 'Пристань · лавка и задания', sanya: 'Баркас · лавка и задания', ignat: 'Остров «Последний свет» · скупка и напитки',
};
const NPC_INTRO: Record<FishNpcId, string> = {
  semyon: 'Заходи, рыбак. Сдашь улов, возьмёшь снасти — и снова к воде.',
  sanya: 'В море рыба крупнее и злее. Улов возьму, снасти продам.',
  ignat: 'Туман сегодня густой. Улов возьму, налью согреться — а маяк посветит.',
};
/** Портрет в шапке: Семён — кадр из игры, Саня и Игнат — значки места (портретов пока нет) */
const npcPortrait = (npc: FishNpcId): string => (npc === 'semyon'
  ? `<img class="fi-port" src="${portraitUrl('semyon')}" alt="">`
  : iconImg(npc === 'sanya' ? 'anchor' : 'lighthouse', ''));
const NPC_BUSY: Record<FishNpcId, string> = { semyon: 'Семён считает…', sanya: 'Саня считает…', ignat: 'Игнат считает…' };
/** Свои вкладки — «Задания», «Лавка», «Продать»; чужие (addTab, например «Лодки» у Семёна) — по своему id */
type Tab = 'quests' | 'shop' | 'sell' | (string & {});

/** Чужая вкладка (addTab): у кого из торговцев она есть и как её показать */
interface ExtraTab {
  npcs: readonly FishNpcId[];
  render: (panel: HTMLElement, p: FishProgress, busy: boolean) => void;
}

/** Карточка лавки или удочки (.k-cell.fi-item): причина запрета, пояснение, кнопка, золотая пилюля «есть» */
interface Offer {
  root: HTMLElement;
  why: HTMLElement;
  note: HTMLElement;
  btn: HTMLButtonElement;
  line: HTMLElement;
  own: HTMLElement;
}
/** Что показать на карточке: own — пилюля вместо кнопки (gold — своё), why — красная причина, note — спокойное пояснение */
interface OfferView {
  label: string;
  price?: number;
  own?: string;
  gold?: boolean;
  why?: string;
  note?: string;
  off: boolean;
}

/** Текст элемента — только когда поменялся (🪙 — картинкой): кнопки не пересоздаются, клик не теряется */
function setText(e: HTMLElement, text: string): void {
  if (e.dataset.t === text) return;
  e.dataset.t = text;
  setCoinText(e, text);
}
function setHtml(e: HTMLElement, html: string): void {
  if (e.dataset.h === html) return;
  e.dataset.h = html;
  e.innerHTML = html;
}

/** Native modal: focus containment and inert background, with key events kept out of game input. */
export class FishNpcDialog {
  onOpen: () => void = () => {};
  onClose: () => void = () => {};
  onBeer: () => void = () => {};
  /** Шапка: сюда другие модули кладут свои кнопки (например, «Домой, к Семёну» у Сани) — перед жетонами */
  readonly extra: HTMLElement;
  private readonly root: HTMLDialogElement;
  private readonly win: HTMLElement;
  private readonly body: HTMLElement;
  private readonly portrait: HTMLElement;
  private readonly title: HTMLElement;
  private readonly eyebrow: HTMLElement;
  private readonly intro: HTMLElement;
  private readonly balance: HTMLElement;
  private readonly statusBar: HTMLElement;
  private readonly status: HTMLElement;
  private readonly nav: HTMLElement;
  private readonly tabBtns = new Map<Tab, HTMLButtonElement>();
  private readonly tabCounts = new Map<Tab, HTMLElement>();
  private readonly panels = new Map<Tab, HTMLElement>();
  private readonly extraTabs = new Map<Tab, ExtraTab>();
  // задания
  private readonly questTitle: HTMLElement;
  private readonly questNote: HTMLElement;
  private readonly questMeter: HTMLElement;
  private readonly questLabel: HTMLElement;
  private readonly claimBtn: HTMLButtonElement;
  private readonly claimLine: HTMLElement;
  private readonly claimNote: HTMLElement;
  private readonly rods: Offer[] = [];
  // лавка
  /** Рюкзаки и блёсны: у Игната их нет — только напитки */
  private readonly gear: HTMLElement;
  private readonly drinkHead: HTMLElement;
  private readonly bags: Offer[] = [];
  private readonly lures: Offer[] = [];
  private readonly beer: Offer;
  private readonly ale: Offer;
  private readonly vodka: Offer;
  private readonly drum: Offer;
  // продажа
  private readonly sellHead: HTMLElement;
  private readonly sellList: HTMLElement;
  private readonly sellAll: HTMLButtonElement;
  /** Лайвел своей лодки (флаг ISLE): своя строка с продажей лайвела и «всего» — рюкзак и лайвел разом */
  private readonly wellBox: HTMLElement;
  private readonly wellHead: HTMLElement;
  private readonly wellAll: HTMLButtonElement;
  private readonly everyAll: HTMLButtonElement;
  private readonly wellList: HTMLElement;
  private readonly send: (msg: ClientMsg) => void;
  private readonly me: () => MeState;
  private readonly clock = new FishClock();
  private progress = emptyFishProgress();
  private npc: FishNpcId = 'semyon';
  private shownNpc: FishNpcId | null = null;
  private tab: Tab = 'quests';
  private pending: FishNpcAction | null = null;
  private drinkBefore = 0;
  private pendingTimer = 0;
  private allowOpen = true;
  private eventUntil = 0;
  private eventOn = false;
  private quiet = false;
  private sellKey = '';
  /** Открыть на этой вкладке (openTab) */
  private wantTab: Tab | null = null;

  constructor(parent: HTMLElement, me: () => MeState, send: (msg: ClientMsg) => void) {
    this.me = me;
    this.send = send;
    const { dlg, win } = fishDialog(parent, 'k-window--lg fi-npc');
    this.root = dlg;
    this.win = win;
    dlg.setAttribute('aria-labelledby', 'fish-npc-title');
    dlg.setAttribute('aria-describedby', 'fish-npc-intro');
    win.innerHTML = winHeadHtml({
      portrait: npcPortrait('semyon'), eyebrow: NPC_EYEBROW.semyon, title: NPC_TITLE.semyon, say: `«${NPC_INTRO.semyon}»`,
      tools: '<div class="fi-extra"></div><span class="k-pill k-pill--gold k-pill--lg fi-balance"></span>',
    }) + tabsHtml([['quests', uiIcon('quest-fish'), 'Задания'], ['shop', gearUrl('fishshop/bag2'), 'Лавка'], ['sell', uiIcon('sell'), 'Продать']], 'quests')
      + '<div class="k-win-body"></div><footer class="k-win-foot fi-status" hidden><span class="k-note" role="status"></span></footer>';
    this.portrait = win.querySelector<HTMLElement>('.k-win-portrait')!;
    this.eyebrow = win.querySelector<HTMLElement>('.k-eyebrow')!;
    this.title = win.querySelector<HTMLElement>('.k-win-title')!;
    this.title.id = 'fish-npc-title';
    this.intro = win.querySelector<HTMLElement>('.fi-say')!;
    this.intro.id = 'fish-npc-intro';
    this.extra = win.querySelector<HTMLElement>('.fi-extra')!;
    this.balance = win.querySelector<HTMLElement>('.fi-balance')!;
    this.nav = win.querySelector<HTMLElement>('.k-tabs')!;
    this.body = win.querySelector<HTMLElement>('.k-win-body')!;
    this.statusBar = win.querySelector<HTMLElement>('.fi-status')!;
    this.status = this.statusBar.querySelector<HTMLElement>('.k-note')!;
    // фокус при открытии — на крестик, не на чужую кнопку в шапке (перевоз Сани): Enter не потратит жетоны
    const x = win.querySelector<HTMLButtonElement>('.k-close')!;
    x.autofocus = true;
    x.addEventListener('click', () => this.close());
    for (const b of this.nav.querySelectorAll<HTMLButtonElement>('[data-tab]')) this.tabButton(b);
    this.nav.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-tab]');
      if (b) this.show(b.dataset.tab as Tab);
    });

    // --- Задания: задание, удочки за задания
    const quests = this.panel('quests');
    const quest = quests.appendChild(h('div', 'k-cell fi-quest',
      `${iconImg('quest-fish', '')}<div class="fi-quest-t"><span></span><small></small></div>`
      + '<div class="k-meter k-meter--lg k-meter--good" style="--v:0"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i><span class="k-meter-label"></span></div>'
      + '<button type="button" class="k-btn"><span class="k-row-line"></span><small></small></button>'));
    this.questTitle = quest.querySelector<HTMLElement>('.fi-quest-t > span')!;
    this.questNote = quest.querySelector<HTMLElement>('.fi-quest-t > small')!;
    this.questMeter = quest.querySelector<HTMLElement>('.k-meter')!;
    this.questLabel = quest.querySelector<HTMLElement>('.k-meter-label')!;
    this.claimBtn = quest.querySelector<HTMLButtonElement>('.k-btn')!;
    this.claimLine = this.claimBtn.querySelector<HTMLElement>('.k-row-line')!;
    this.claimNote = this.claimBtn.querySelector<HTMLElement>('small')!;
    this.claimBtn.addEventListener('click', () => this.request('claim'));
    quests.appendChild(h('h3', 'fi-h', 'Удочки за задания <small>берёшь любую открытую</small>'));
    const rodGrid = quests.appendChild(h('div', 'fi-cards fi-cards--5'));
    for (let rod = 0; rod <= ROD_MAX; rod++) {
      const b = Math.round(rodBonus(rod as FishRod) * 100);
      const pic = rod ? `<img src="${gearUrl(`rods/${ROD_PICS[rod]}`)}" alt="">` : FISH_ICONS['r:basic'] ?? '';
      const o = this.offer(rodGrid, pic, RODS[rod].name, rod ? `зона и поклёвка +${b} % · редкие и выше ${mul(rodOdds(rod))}` : 'без бонуса', 'k-cell fi-item is-rod');
      o.btn.addEventListener('click', () => this.request('rod', { rod }));
      this.rods.push(o);
    }

    // --- Лавка: напитки и бубен, рюкзаки, блёсны
    const shop = this.panel('shop');
    this.drinkHead = shop.appendChild(h('h3', 'fi-h'));
    const drinks = shop.appendChild(h('div', 'fi-cards'));
    const shopPic = (id: string): string => `<img src="${gearUrl(`fishshop/${id}`)}" alt="">`;
    this.beer = this.offer(drinks, shopPic('beer'), BEER.name, `цена улова ${pctSp(BEER.income)} · редкие и выше ${mul(BEER.rare)}`);
    this.beer.btn.addEventListener('click', () => this.request('beer'));
    this.ale = this.offer(drinks, shopPic('ale'), ALE.name, `цена ${pctSp(ALE.income)} · редкие и выше ${mul(ALE.rare)} · заменит пиво`);
    this.ale.btn.addEventListener('click', () => this.request('ale'));
    this.vodka = this.offer(drinks, shopPic('vodka'), VODKA.name,
      `эпические и выше ${mul(VODKA.top ?? 1)}, опыт за них ${mul(VODKA.topXp ?? 1)} — но зона −${Math.round((1 - (VODKA.zone ?? 1)) * 100)} % и шатает`);
    this.vodka.btn.addEventListener('click', () => this.request('vodka'));
    this.drum = this.offer(drinks, shopPic('drum'), 'Бубен дождя', 'сразу вызывает дождь для всех — рыболовное событие');
    this.drum.btn.addEventListener('click', () => this.request('rain'));
    this.gear = shop.appendChild(h('div', 'fi-group'));
    this.gear.appendChild(h('h3', 'fi-h', 'Рюкзаки <small>действует лучший купленный</small>'));
    const bagGrid = this.gear.appendChild(h('div', 'fi-cards'));
    for (const b of BAGS) {
      const o = this.offer(bagGrid, shopPic(b.id), b.name, `${b.slots} мест для улова`);
      o.btn.addEventListener('click', () => this.request('buy', { item: b.id }));
      this.bags.push(o);
    }
    this.gear.appendChild(h('h3', 'fi-h', 'Блёсны <small>навсегда; на леске — лучшая</small>'));
    const lureGrid = this.gear.appendChild(h('div', 'fi-cards'));
    for (const l of LURES) {
      const o = this.offer(lureGrid, shopPic(l.id), l.name.replace(/ блесна$/, ''), `рывки мягче на ${Math.round(l.calm * 100)} % · эпические и выше ${mul(l.epic)}`);
      o.btn.addEventListener('click', () => this.request('buy', { item: l.id }));
      this.lures.push(o);
    }

    // --- Продать: рюкзак и лайвел
    const sell = this.panel('sell');
    const sh = sell.appendChild(h('div', 'fi-shop-h'));
    this.sellHead = sh.appendChild(h('h3', 'fi-h', 'Рюкзак <small></small>')).querySelector('small')!;
    this.sellAll = sh.appendChild(h('button', 'k-btn k-btn--sm', '<span class="k-row-line"></span>'));
    this.sellAll.type = 'button';
    this.sellAll.addEventListener('click', () => this.request('sellAll'));
    this.sellList = sell.appendChild(h('div', 'fi-rows'));
    // лайвел своей лодки: рюкзак полон — рыба там (shared/fishlivewell.ts); виден, если есть лодка или рыба в нём
    this.wellBox = sell.appendChild(h('div', 'fi-group'));
    const wh = this.wellBox.appendChild(h('div', 'fi-shop-h'));
    this.wellHead = wh.appendChild(h('h3', 'fi-h', `${iconImg('livewell', 'fi-ic')}Лайвел лодки <small></small>`)).querySelector('small')!;
    const wb = wh.appendChild(h('div', 'fi-row-a'));
    this.wellAll = wb.appendChild(h('button', 'k-btn k-btn--ghost k-btn--sm', '<span class="k-row-line"></span>'));
    this.wellAll.type = 'button';
    this.wellAll.addEventListener('click', () => this.request('sellWell'));
    this.everyAll = wb.appendChild(h('button', 'k-btn k-btn--sm', '<span class="k-row-line"></span>'));
    this.everyAll.type = 'button';
    this.everyAll.addEventListener('click', () => this.request('sellEvery'));
    this.wellList = this.wellBox.appendChild(h('div', 'fi-rows'));
    for (const list of [this.sellList, this.wellList]) {
      list.addEventListener('click', (e) => {
        const b = (e.target as Element).closest<HTMLButtonElement>('button[data-n]');
        if (b && !b.disabled) this.request('sell', { n: Number(b.dataset.n) });
      });
    }

    dlg.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.code === 'KeyI' && !e.repeat) {
        // рюкзак у торговца — это вкладка «Продать»: там весь улов с ценами
        e.preventDefault();
        this.show('sell');
      }
    });
    dlg.addEventListener('keyup', (e) => e.stopPropagation());
    // Esc и клик мимо окна (fishDialog шлёт cancel)
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); this.close(); });
    window.setInterval(() => { if (this.isOpen) this.render(); }, 1000);
  }

  get isOpen(): boolean { return this.root.open; }

  /**
   * Своя вкладка другого модуля (например, «Лодки» у Семёна — client/boat/boatui.ts): кнопка в строке вкладок, панель
   * в теле окна и отрисовка вместе с окном; icon — id иконки интерфейса (client/assets/ui/icons/<id>.webp, нет — без
   * иконки); npcs — у кого из торговцев она есть. Возвращает панель.
   */
  addTab(id: string, icon: string, label: string, npcs: readonly FishNpcId[], render: ExtraTab['render']): HTMLElement {
    const b = h('div', '', tabsHtml([[id, uiIcon(icon), label]], '')).querySelector<HTMLButtonElement>('[data-tab]')!;
    this.nav.appendChild(b);
    this.tabButton(b);
    this.extraTabs.set(id, { npcs, render });
    const p = this.panel(id);
    p.hidden = true;
    return p;
  }

  /** Просьба торговцу из чужой вкладки (ответ — как у своих: строка состояния и окно) */
  ask(a: FishNpcAction, extra: { boat?: string } = {}): void {
    this.request(a, extra);
  }

  /** Открыть окно сразу на вкладке tab (например, «Лодки») */
  openTab(npc: FishNpcId, tab: string): void {
    this.wantTab = tab;
    this.requestOpen(npc);
  }

  /** Кнопка вкладки: счётчик (скрыт, пока пусто) */
  private tabButton(b: HTMLButtonElement): void {
    const id = b.dataset.tab as Tab;
    const n = b.appendChild(h('span', 'k-tab-count'));
    n.hidden = true;
    this.tabBtns.set(id, b);
    this.tabCounts.set(id, n);
  }

  /** С кем сейчас разговор */
  get who(): FishNpcId { return this.npc; }

  onState(msg: Extract<ServerMsg, { t: 'fishNpc' }>): void {
    const drank = (this.pending === 'beer' && msg.progress.beerUntil > this.drinkBefore && msg.progress.beerUntil > msg.now)
      || (this.pending === 'ale' && msg.progress.aleUntil > this.drinkBefore && msg.progress.aleUntil > msg.now)
      || (this.pending === 'vodka' && (msg.progress.vodkaUntil ?? 0) > this.drinkBefore && (msg.progress.vodkaUntil ?? 0) > msg.now);
    this.clearPending();
    this.progress = msg.progress;
    this.clock.sync(msg.now);
    if (msg.open && !this.isOpen && this.allowOpen) {
      this.npc = msg.npc;
      this.setStatus('');
      this.tab = this.wantTab ?? (msg.progress.bag.length + livewellOf(msg.progress).length > 0 ? 'sell' : 'quests');
      this.wantTab = null;
      this.sellKey = '';
      this.render();
      this.root.showModal();
      winIn(this.win);
      this.body.scrollTop = 0;
      this.onOpen();
    }
    if (msg.message) this.setStatus(msg.message);
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

  /** E у Семёна, Сани или Игната */
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
    const p = this.body.appendChild(h('section', 'fi-panel'));
    p.setAttribute('role', 'tabpanel');
    p.dataset.tab = id;
    this.panels.set(id, p);
    return p;
  }

  /** Карточка .fi-item: картинка (готовая разметка), имя, что даёт; ниже — причина, пояснение, кнопка или пилюля */
  private offer(parent: HTMLElement, pic: string, name: string, text: string, cls = 'k-cell fi-item'): Offer {
    const root = parent.appendChild(h('div', cls,
      `<div class="fi-item-art">${pic}</div><b>${esc(name)}</b><p>${esc(text)}</p><p class="fi-why" hidden></p><p class="fi-note" hidden></p>`
      + '<button type="button" class="k-btn k-btn--sm"><span class="k-row-line"></span></button><span class="k-pill" hidden></span>'));
    const btn = root.querySelector<HTMLButtonElement>('.k-btn')!;
    return {
      root, btn, line: btn.querySelector<HTMLElement>('.k-row-line')!,
      why: root.querySelector<HTMLElement>('.fi-why')!, note: root.querySelector<HTMLElement>('.fi-note')!, own: root.querySelector<HTMLElement>('.k-pill')!,
    };
  }

  /** Показать карточку: кнопка «Купить · 500 🪙» или пилюля, красная причина, пояснение */
  private setOffer(o: Offer, v: OfferView): void {
    const own = v.own ?? '';
    o.root.classList.toggle('is-own', !!own && v.gold !== false);
    o.own.hidden = !own;
    if (own) {
      o.own.classList.toggle('k-pill--gold', v.gold !== false);
      setText(o.own, own);
    }
    o.btn.hidden = !!own;
    setHtml(o.line, v.price === undefined ? esc(v.label) : `${esc(v.label)} · ${num(v.price)} ${coinHtml()}`);
    o.btn.disabled = v.off;
    o.why.hidden = !v.why;
    if (v.why) setText(o.why, v.why);
    o.note.hidden = !v.note;
    if (v.note) setText(o.note, v.note);
  }

  private show(tab: Tab): void {
    this.tab = tab;
    this.render();
    this.body.scrollTop = 0;
  }

  private setStatus(text: string): void {
    setText(this.status, text);
    this.statusBar.hidden = !text;
  }

  private request(a: FishNpcAction, extra: { rod?: number; item?: string; n?: number; boat?: string } = {}): void {
    if (this.pending !== null) return;
    this.pending = a;
    this.drinkBefore = a === 'ale' ? this.progress.aleUntil : a === 'vodka' ? this.progress.vodkaUntil ?? 0 : this.progress.beerUntil;
    if (a !== 'open') this.setStatus(NPC_BUSY[this.npc]);
    this.pendingTimer = window.setTimeout(() => {
      this.clearPending();
      this.setStatus('Ответ не пришёл. Проверь баланс и попробуй ещё раз — действие само не повторяется.');
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

  /** Рюкзак или блесна: есть / есть лучше / причина (уровень, жетоны) / можно купить */
  private gearView(state: GearState, level: number, price: number, tokens: number, have: string, busy: boolean): OfferView {
    if (state === 'owned') return { label: 'Купить', price, own: have, off: true };
    if (state === 'better') return { label: 'Купить', price, own: 'Есть лучше', gold: false, off: true };
    const why = state === 'level' ? `С ${level}-го уровня · ещё ${num(xpTo(this.progress, level))} опыта` : state === 'tokens' ? `Не хватает ${num(price - tokens)} 🪙` : '';
    return { label: 'Купить', price, why, off: busy || state !== 'ok' };
  }

  private render(): void {
    const p = this.progress;
    const now = this.clock.now();
    const busy = this.pending !== null;
    const tokens = this.me().tokens;
    const level = fishLevel(p.xp);
    // шапка: кто, где, что говорит, жетоны
    if (this.shownNpc !== this.npc) {
      this.shownNpc = this.npc;
      this.portrait.innerHTML = npcPortrait(this.npc);
      this.title.textContent = NPC_TITLE[this.npc];
      this.eyebrow.textContent = NPC_EYEBROW[this.npc];
      this.intro.textContent = `«${NPC_INTRO[this.npc]}»`;
      this.root.dataset.npc = this.npc;
    }
    setHtml(this.balance, `${coinHtml()}${num(tokens)}`);
    this.balance.setAttribute('aria-label', `У тебя ${num(tokens)} жетонов`);
    const need = questNeed(p.questsDone);
    const ready = p.questCaught >= need;
    // чужая вкладка не у этого торговца — на первую
    const xt = this.extraTabs.get(this.tab);
    if (xt && !xt.npcs.includes(this.npc)) this.tab = 'quests';
    for (const [id, b] of this.tabBtns) {
      const on = id === this.tab;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', String(on));
      this.panels.get(id)!.hidden = !on;
      const x = this.extraTabs.get(id);
      if (x) b.hidden = !x.npcs.includes(this.npc);
    }
    for (const [id, x] of this.extraTabs) if (id === this.tab) x.render(this.panels.get(id)!, p, busy);
    const well = livewellOf(p);
    const caught = p.bag.length + well.length;
    const qn = this.tabCounts.get('quests')!;
    qn.hidden = !ready;
    qn.classList.toggle('is-gold', ready);
    qn.textContent = 'готово';
    const sn = this.tabCounts.get('sell')!;
    sn.hidden = !caught;
    sn.textContent = String(caught);

    // --- задания
    const done = p.questsDone;
    const nextRod = RODS.find((r) => r.quests > done);
    this.questTitle.textContent = `Задание ${done + 1} — поймай ${fishN(need)}`;
    setText(this.questNote, `Любую рыбу, кроме сундуков и сорвавшейся. Награда — ${num(need * 5)} жетонов`
      + `${nextRod ? `, а за ${nextRod.quests}-е задание — удочка «${nextRod.name}»` : ''}.`);
    this.questMeter.style.setProperty('--v', String(Math.min(1, p.questCaught / need)));
    this.questLabel.textContent = `${Math.min(need, p.questCaught)} из ${need}`;
    setHtml(this.claimLine, `Получить · ${num(need * 5)} ${coinHtml()}`);
    this.claimNote.hidden = ready;
    this.claimNote.textContent = `ещё ${fishN(need - p.questCaught)}`;
    this.claimBtn.disabled = busy || !ready;
    const unlocked = unlockedRod(done);
    this.rods.forEach((o, rod) => {
      const selected = p.rod === rod;
      const earned = rod <= unlocked;
      o.root.classList.toggle('is-lock', !earned);
      this.setOffer(o, { label: 'Взять', own: selected ? 'В руках' : '', why: earned ? '' : `После ${RODS[rod].quests}-го задания`, off: busy || selected || !earned });
    });

    // --- лавка (у Игната — только напитки)
    const isle = this.npc === 'ignat';
    this.gear.hidden = isle;
    this.drum.root.hidden = isle;
    setHtml(this.drinkHead, isle ? 'Напитки <small>действует один напиток, 10 минут</small>' : 'Напитки и бубен <small>действует один напиток, 10 минут</small>');
    BAGS.forEach((b, i) => {
      const st = gearState('bag', b.tier, p.bagTier, level, tokens);
      this.setOffer(this.bags[i], this.gearView(st, b.level, b.price, tokens, 'Есть', busy));
      this.bags[i].root.classList.toggle('is-lock', st === 'level');
    });
    LURES.forEach((l, i) => {
      const st = gearState('lure', l.tier, p.lure, level, tokens);
      this.setOffer(this.lures[i], this.gearView(st, l.level, l.price, tokens, 'На леске', busy));
      this.lures[i].root.classList.toggle('is-lock', st === 'level');
    });
    const drink = activeDrink(p, now);
    const lordWhy = `Действует пиво подводного владыки · ${fishTimeLeft(p.lordUntil ?? 0, now)} — поверх не наливают`;
    const vodkaNote = 'Заменит водку — остаток водки пропадёт';
    const short = (price: number): string => (tokens < price ? `Не хватает ${num(price - tokens)} 🪙` : '');
    this.setOffer(this.beer, {
      label: 'Выпить', price: BEER_PRICE, own: drink === 1 ? `Пьёшь · ${fishTimeLeft(p.beerUntil, now)}` : '',
      why: drink === 3 ? lordWhy : drink === 2 ? 'Эль крепче — пиво поверх не наливают' : short(BEER_PRICE),
      note: drink === 4 ? vodkaNote : '',
      off: busy || (drink >= 1 && drink <= 3) || tokens < BEER_PRICE,
    });
    this.setOffer(this.ale, {
      label: 'Выпить', price: ALE_PRICE, own: drink === 2 ? `Пьёшь · ${fishTimeLeft(p.aleUntil, now)}` : '',
      why: drink === 3 ? lordWhy : short(ALE_PRICE),
      note: drink === 1 ? 'Заменит пиво — остаток пива пропадёт' : drink === 4 ? vodkaNote : '',
      off: busy || drink === 2 || drink === 3 || tokens < ALE_PRICE,
    });
    this.setOffer(this.vodka, {
      label: 'Выпить', price: VODKA_PRICE, own: drink === 4 ? `Пьёшь · ${fishTimeLeft(p.vodkaUntil ?? 0, now)}` : '',
      why: short(VODKA_PRICE),
      note: drink !== 0 && drink !== 4 ? 'Заменит напиток — действует последнее выпитое' : '',
      off: busy || drink === 4 || tokens < VODKA_PRICE,
    });
    const eventActive = this.eventOn && (this.eventUntil === 0 || this.eventUntil > now);
    this.setOffer(this.drum, {
      label: 'Ударить', price: RAIN_DRUM_PRICE,
      why: eventActive ? `Дождь уже идёт${this.eventUntil ? ` · ${fishTimeLeft(this.eventUntil, now)}` : ''}` : short(RAIN_DRUM_PRICE),
      off: busy || eventActive || tokens < RAIN_DRUM_PRICE,
    });

    // --- продажа
    const total = bagValue(p.bag);
    this.sellHead.textContent = `${p.bag.length} из ${bagSlots(p)} · цена записана при поимке`;
    const cap = livewellCap(p);
    const showWell = cap > 0 || well.length > 0;
    this.wellBox.hidden = !showWell;
    // есть лайвел — «Продать всё» продаёт и его, а кнопка рюкзака — только рюкзак
    const bagLabel = showWell ? 'Продать рюкзак' : 'Продать всё';
    setHtml(this.sellAll.firstElementChild as HTMLElement, p.bag.length ? `${bagLabel} · ${num(total)} ${coinHtml()}` : bagLabel);
    this.sellAll.disabled = busy || !p.bag.length;
    if (showWell) {
      this.wellHead.textContent = `${well.length} из ${cap}`;
      setHtml(this.wellAll.firstElementChild as HTMLElement, well.length ? `Продать лайвел · ${num(catchValue(p, 'well'))} ${coinHtml()}` : 'Продать лайвел');
      this.wellAll.disabled = busy || !well.length;
      setHtml(this.everyAll.firstElementChild as HTMLElement, caught ? `Продать всё · ${num(catchValue(p, 'all'))} ${coinHtml()}` : 'Продать всё');
      this.everyAll.disabled = busy || !caught;
    }
    const key = `${busy}|${p.bag.map((f) => f.n).join(',')}|${well.map((f) => f.n).join(',')}`;
    if (key !== this.sellKey) {
      this.sellKey = key;
      const btn = (n: number): string => `<button type="button" class="k-btn k-btn--ghost k-btn--sm" data-n="${n}"${busy ? ' disabled' : ''}>Продать</button>`;
      this.sellList.innerHTML = p.bag.length ? p.bag.map((f) => catchRowHtml(f, btn(f.n))).join('')
        : emptyHtml(gearUrl('fishshop/bag1'), 'Рюкзак пуст', 'Пойманная рыба ложится сюда по цене поимки.');
      if (showWell) this.wellList.innerHTML = well.length ? well.map((f) => catchRowHtml(f, btn(f.n))).join('')
        : emptyHtml(uiIcon('livewell'), 'Лайвел пуст', 'Рюкзак полон — рыба ложится сюда, по той же цене поимки.');
    }
  }
}
