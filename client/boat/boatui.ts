// Интерфейс своих лодок на ките UI 2.0 (эталон — lab/ui «Рыбалка»: «8. своя лодка» и вкладка «Лодки» в «6. Дед Семён»):
//  · BoatHud — скорость и якорь одной плашкой верх-центра (.k-event), «куда плыть» плитками под бейджем (.k-tile со
//    стрелкой), кнопки Z «Якорь» и G «Продать» в ряду .fi-boatbar справа внизу (R «Радио» ставит client/boat/radiopanel.ts);
//  · SummonDialog — окно вызова лодки к месту (E у таблички): выбор лодки карточками, схема пирса, золотая «Вызвать»;
//  · BoatShopTab — вкладка «Лодки» в окне Семёна: три карточки с фото, шкалами, пилюлями и кнопкой покупки.
// Логика и сеть — client/boat/ownboats.ts. Стили — ownboats.css (раскладка) и fishkit.css (.fi-boat, .fi-spec, .fi-nav …).
import { BOATS, boatBuyState, fmtInt, ownedBoats, type BoatBuyState, type BoatId } from '../../shared/fishboat.ts';
import { fishLevel, type FishProgress } from '../../shared/fishprogress.ts';
import { BERTHS, OB_KEEP_FREE, PARK_COUNT, isParkBerth } from '../../shared/ownboat.ts';
import type { MeState } from '../scene.ts';
import { fishDialog, gearUrl, winHeadHtml, winIn, type FishKitUi } from '../lobby/fishkit.ts';
import type { FishNpcDialog } from '../lobby/fishnpcdialog.ts';
import { coinHtml, iconImg, keyHtml, meterHtml } from '../ui/kit/dom.ts';
import { escHtml } from '../ui/kit/topcenter.ts';
import { boatBar } from './boatbar.ts';
import type { PlateInfo } from './models.ts';
import './ownboats.css';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement | null, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

/** 840 → «840 м», 2140 → «2,1 км» */
export function km(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} м` : `${(m / 1000).toFixed(1).replace('.', ',')} км`;
}

/** 43.2 → «43,2»; 5 → «5» (без «,0») */
const fmt1 = (n: number): string => n.toFixed(1).replace('.', ',').replace(/,0$/, '');

/** Фото лодки (кружок в плашке, карточки): client/assets/ownboats/<id>.jpg */
const photo = (id: string): string => gearUrl(`ownboats/${id}`);

/** Приоритет плашки лодки в верх-центре: ниже секундомера (40), выше «прочего» (10) */
const BOAT_PRIO = 35;
const EVENT_KEY = 'boat';

const ARROW = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5 19.5 20 12 15.6 4.5 20z"/></svg>';

// ------------------------------------------------------------ панель в лодке

export interface HudNav {
  /** Полное название (подсказка у плитки) */
  label: string;
  /** Короткое — под плиткой: «Остров», «Бакен F2», «Стоянка» */
  short: string;
  dist: string;

  rot: number;
}

export interface HudView {
  /** Какая лодка (картинка в плашке) и как называется */
  boat: BoatId;
  name: string;
  /** Ник хозяина, если лодка чужая; '' — своя */
  owner: string;
  /** Скорость, км/ч */
  kmh: number;
  /** Что с лодкой не в ходу: «Якорь идёт вниз», «У причала» …; '' — идёт или стоит на якоре */
  phase: string;
  /** Якорь опущен */
  anchored: boolean;
  /** Эхолот, % к скорости поклёвки с якоря */
  sonar: number;
  isle: HudNav;
  park: HudNav;
  /** Показать плитки «куда плыть» */
  nav: boolean;
  /** Показать кнопку якоря (хозяин за штурвалом в море) и опущен ли он */
  anchor: boolean;
  anchorDown: boolean;
  /** «Продать»: показать (хозяин) и можно ли сейчас (лодка у причала) */
  sell: boolean;
  sellOn: boolean;
}

interface NavTile {
  root: HTMLElement;
  arrow: HTMLElement;
  cap: HTMLElement;
  small: HTMLElement;
}

export class BoatHud {
  private readonly kit: FishKitUi;
  private readonly tiles: NavTile[] = [];
  /** Свой ряд плиток — пока рыбалка не создала общий (.fi-tiles) */
  private ownRow: HTMLElement | null = null;
  private readonly bar: HTMLElement;
  private readonly anchorBtn: HTMLButtonElement;
  private readonly sellBtn: HTMLButtonElement;
  private evKey = '';
  private barKey = '';
  private tileKey = '';
  private shown = false;

  constructor(kit: FishKitUi, on: { anchor: () => void; sell: () => void }) {
    this.kit = kit;
    for (const cls of ['isle', 'park']) {
      const root = el('div', `k-tile ob-tile ob-tile--${cls}`, null, `<span class="k-tile-face"><span class="fi-nav">${ARROW}</span></span><span class="k-tile-cap"><span></span><small></small></span>`);
      root.hidden = true;
      root.dataset.mode = 'fishing';
      const cap = root.querySelector<HTMLElement>('.k-tile-cap > span')!;
      this.tiles.push({ root, arrow: root.querySelector<HTMLElement>('.fi-nav')!, cap, small: root.querySelector<HTMLElement>('.k-tile-cap > small')! });
    }
    this.bar = boatBar(kit.slots);
    this.anchorBtn = this.button('k-btn k-btn--sm k-btn--info ob-b-anchor', on.anchor);
    this.sellBtn = this.button('k-btn k-btn--sm ob-b-sell', on.sell);
    this.anchorBtn.hidden = true;
    this.sellBtn.hidden = true;
  }

  private button(cls: string, fn: () => void): HTMLButtonElement {
    const b = el('button', cls, this.bar);
    b.type = 'button';
    b.addEventListener('click', fn);
    // клик по кнопке не уходит в игру (не захватывает мышь заново)
    b.addEventListener('mousedown', (e) => e.stopPropagation());
    return b;
  }

  /** Ряд плиток под бейджем: общий (.fi-tiles — его делает HUD рыбалки), а нет его — свой */
  private row(): HTMLElement {
    const tr = this.kit.slots.tr;
    const cur = this.tiles[0].root.parentElement;
    const common = cur?.classList.contains('fi-tiles') && cur.isConnected ? cur : tr.querySelector<HTMLElement>(':scope > .fi-tiles');
    if (common) {
      if (common.hidden) common.hidden = false;
      return common;
    }
    if (!this.ownRow) this.ownRow = el('div', 'k-tiles ob-tiles', tr);
    return this.ownRow;
  }

  show(v: HudView): void {
    this.shown = true;
    // плитки «куда плыть»: стрелки поворачиваем каждый кадр, остальное — когда поменялся текст
    const row = this.row();
    for (const t of this.tiles) if (t.root.parentElement !== row) row.append(t.root);
    for (const [i, n] of [v.isle, v.park].entries()) {
      this.tiles[i].arrow.style.setProperty('--a', `${((n.rot * 180) / Math.PI).toFixed(1)}deg`);
    }
    const tk = `${v.nav}|${v.isle.label}|${v.isle.short}|${v.isle.dist}|${v.park.label}|${v.park.short}|${v.park.dist}`;
    if (tk !== this.tileKey) {
      this.tileKey = tk;
      for (const [i, n] of [v.isle, v.park].entries()) {
        const t = this.tiles[i];
        t.root.hidden = !v.nav;
        // без всплывающей подсказки: видно куда (n.short) и сколько; полное имя — для экранного диктора
        t.root.setAttribute('aria-label', `${n.label}: ${n.dist}`);
        t.cap.textContent = n.dist;
        t.small.textContent = n.short;
      }
    }
    // плашка сверху: название, эхолот или что делает лодка, скорость (на якоре — значок якоря); разметку собираем, только если что-то поменялось
    const ek = `${v.boat}|${v.name}|${v.owner}|${v.kmh}|${v.phase}|${v.anchored}|${v.sonar}`;
    if (ek !== this.evKey) {
      this.evKey = ek;
      this.kit.top.event({ key: EVENT_KEY, prio: BOAT_PRIO, html: this.plate(v) });
    }
    // кнопки Z и G
    const bk = `${v.anchor}|${v.anchorDown}|${v.sell}|${v.sellOn}`;
    if (bk === this.barKey) return;
    this.barKey = bk;
    this.anchorBtn.hidden = !v.anchor;
    this.anchorBtn.classList.toggle('k-btn--go', v.anchorDown);
    this.anchorBtn.classList.toggle('k-btn--info', !v.anchorDown);
    this.anchorBtn.innerHTML = `${iconImg('anchor')}${v.anchorDown ? 'Поднять' : 'Якорь'}${keyHtml('Z', 'tr')}`;
    this.sellBtn.hidden = !v.sell;
    this.sellBtn.disabled = !v.sellOn;
    this.sellBtn.innerHTML = `${iconImg('sell')}Продать${v.sellOn ? '' : '<small>у причала</small>'}${keyHtml('G', 'tr')}`;
  }

  /** Содержимое плашки: фото лодки, название, эхолот или что делает лодка, скорость (на якоре — значок якоря) */
  private plate(v: HudView): string {
    const sub = v.owner
      ? `Лодка ${v.owner}${v.anchored ? ` · клёв +${v.sonar} %` : v.phase ? ` · ${v.phase.toLowerCase()}` : ''}`
      : v.anchored ? `Рыбачьте втроём · клёв +${v.sonar} %` : v.phase || `Эхолот: с якоря клёв +${v.sonar} %`;
    return `<span class="k-event-ic"><span class="fi-boat-ic" style="background-image:url('${photo(v.boat)}')"></span></span>`
      + `<div class="k-event-title">«${escHtml(v.name)}»${v.anchored ? ' на якоре' : ''}</div>`
      + `<div class="k-event-sub">${escHtml(sub)}</div>`
      + `<div class="k-event-timer fi-speed">${v.anchored ? iconImg('anchor', '') : `${v.kmh}<small>км/ч</small>`}</div>`;
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.evKey = '';
    this.barKey = '';
    this.tileKey = '';
    this.kit.top.clear(EVENT_KEY);
    for (const t of this.tiles) t.root.hidden = true;
    this.anchorBtn.hidden = true;
    this.sellBtn.hidden = true;
  }
}

// ------------------------------------------------------------ окно вызова

interface SummonDeps {
  send: (berth: number, boat: string) => void;
  onOpen: () => void;
  onClose: () => void;
}

/** Вызов своей лодки к свободному месту: выбор лодки, схема пирса (места кликаются), золотая «Вызвать» */
export class SummonDialog {
  private readonly dlg: HTMLDialogElement;
  private readonly win: HTMLElement;
  private readonly eyebrow: HTMLElement;
  private readonly boatsRow: HTMLElement;
  private readonly free: HTMLElement;
  private readonly map: HTMLElement;
  private readonly note: HTMLElement;
  private readonly go: HTMLButtonElement;
  private readonly d: SummonDeps;
  private berth = 0;
  private boat: string | null = null;
  private info: Array<PlateInfo | null> = [];
  private owned: string[] = [];

  constructor(parent: HTMLElement, d: SummonDeps) {
    this.d = d;
    const { dlg, win } = fishDialog(parent, 'fi-win--auto ob-summon');
    this.dlg = dlg;
    this.win = win;
    win.innerHTML = winHeadHtml({ portrait: iconImg('boat', ''), eyebrow: 'Стоянка у Семёна', title: 'Вызвать лодку', say: 'Выбери свободное место — лодка подойдёт из-за ворот за 4 секунды.' })
      + `<div class="k-win-body">`
      + `<h3 class="fi-h">Лодка</h3><div class="ob-boats"></div>`
      + `<h3 class="fi-h">Место у пирса <small class="ob-free"></small></h3><div class="k-well ob-map"></div>`
      + `<p class="k-note ob-note"></p></div>`
      + `<footer class="k-win-foot"><button type="button" class="k-btn k-btn--lg ob-go"></button></footer>`;
    dlg.setAttribute('aria-label', 'Вызвать свою лодку');
    this.eyebrow = win.querySelector<HTMLElement>('.k-eyebrow')!;
    this.boatsRow = win.querySelector<HTMLElement>('.ob-boats')!;
    this.free = win.querySelector<HTMLElement>('.ob-free')!;
    this.map = win.querySelector<HTMLElement>('.ob-map')!;
    this.note = win.querySelector<HTMLElement>('.ob-note')!;
    this.go = win.querySelector<HTMLButtonElement>('.ob-go')!;
    win.querySelector('.k-close')!.addEventListener('click', () => this.close());
    this.go.addEventListener('click', () => this.summon());
    dlg.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Escape') {
        e.preventDefault();
        this.close();
      } else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !this.go.disabled && !(e.target instanceof HTMLButtonElement && e.target !== this.go)) {
        e.preventDefault();
        this.summon();
      }
    });
    dlg.addEventListener('keyup', (e) => e.stopPropagation());
    // Esc и клик по затемнению (fishkit.ts) — событие cancel
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); this.close(); });
  }

  get isOpen(): boolean {
    return this.dlg.open;
  }

  open(berth: number, info: Array<PlateInfo | null>, owned: string[]): void {
    this.berth = berth;
    this.info = info;
    this.owned = owned;
    const own = ownedBoats({ boats: owned });
    if (!this.boat || !own.includes(this.boat as BoatId)) this.boat = own.length ? own[own.length - 1] : null;
    this.render();
    if (!this.dlg.open) {
      this.dlg.showModal();
      winIn(this.win);
      this.d.onOpen();
      this.go.focus({ preventScroll: true });
    }
  }

  /** Состав у пирса поменялся (пока окно открыто — схема обновляется) */
  update(info: Array<PlateInfo | null>, owned: string[]): void {
    this.info = info;
    this.owned = owned;
    if (this.dlg.open) this.render();
  }

  close(): void {
    if (!this.dlg.open) return;
    this.dlg.close();
    this.d.onClose();
  }

  private summon(): void {
    if (!this.boat || this.info[this.berth]) return;
    this.d.send(this.berth, this.boat);
    this.close();
  }

  private render(): void {
    const park = isParkBerth(this.berth);
    const berths = BERTHS.map((_, i) => i).filter((i) => isParkBerth(i) === park);
    this.eyebrow.textContent = park ? `Стоянка у Семёна · ${berths.length} мест` : `Причал острова · ${berths.length} мест`;
    // лодки: купленные — карточками с фото, выбранная в золотом кольце
    const own = ownedBoats({ boats: this.owned });
    this.boatsRow.replaceChildren();
    if (!own.length) {
      this.boatsRow.innerHTML = `<div class="k-cell fi-empty">${iconImg('boat', '')}<div><b>Своей лодки пока нет</b><p>Лодки продаёт Дед Семён: вкладка «Лодки» в его окне, с 6-го уровня рыбалки.</p></div></div>`;
    }
    for (const id of own) {
      const k = BOATS.find((b) => b.id === id)!;
      const b = el('button', `k-cell ob-boatpick${id === this.boat ? ' is-on' : ''}`, this.boatsRow,
        `<span class="ob-boatpick-ph" style="background-image:url('${photo(id)}')"></span><b>${escHtml(k.name)}</b><span>${fmt1(k.speed * 3.6)} км/ч · до острова ${k.trip}</span>`);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(id === this.boat));
      b.addEventListener('click', () => {
        this.boat = id;
        this.render();
      });
    }
    // схема пирса: слева места 1–5, справа 6–10, посередине мостик
    this.map.replaceChildren();
    this.map.classList.toggle('is-isle', !park);
    const half = park ? 5 : berths.length;
    const cols = park ? [berths.slice(0, half), berths.slice(half)] : [berths];
    cols.forEach((list, c) => {
      const col = el('div', 'ob-col', this.map);
      for (const i of list) {
        const inf = this.info[i];
        const label = park ? i + 1 : i - PARK_COUNT + 1;
        const btn = el('button', `k-cell ob-slip${inf ? ' is-busy' : ''}${inf?.mine ? ' is-mine' : ''}${i === this.berth && !inf ? ' is-on' : ''}`, col,
          `<b>${label}</b><span>${inf ? (inf.mine ? 'твоя лодка' : escHtml(inf.nick)) : 'свободно'}</span>`);
        btn.type = 'button';
        btn.setAttribute('aria-pressed', String(i === this.berth));
        btn.disabled = !!inf;
        btn.addEventListener('click', () => {
          this.berth = i;
          this.render();
        });
      }
      if (park && c === 0) el('div', 'ob-walk', this.map).setAttribute('aria-hidden', 'true');
    });
    const free = berths.filter((i) => !this.info[i]).length;
    this.free.textContent = `свободно ${free} из ${berths.length}`;
    this.note.textContent = `${park ? 'Не больше 8 лодок' : 'Не больше 4 лодок'}: ${OB_KEEP_FREE} места всегда свободны. Если места нужны, уходит лодка, которая дольше всех стоит без хозяина. `
      + 'Вызвал другую свою лодку — прежняя уходит.';
    const k = this.boat ? BOATS.find((b) => b.id === this.boat) : null;
    const busy = !!this.info[this.berth];
    this.go.disabled = !k || busy;
    this.go.innerHTML = `${!k ? 'Нет своей лодки' : busy ? 'Место занято — выбери свободное' : `Вызвать «${escHtml(k.name)}» к месту ${park ? this.berth + 1 : this.berth - PARK_COUNT + 1}`}${keyHtml('Enter', 'tr')}`;
  }
}

// ------------------------------------------------------------ вкладка «Лодки» у Семёна

interface Card {
  root: HTMLElement;
  why: HTMLElement;
  own: HTMLElement;
  pill: HTMLElement;
  btn: HTMLButtonElement;
}

/** Вкладка «Лодки» в окне Семёна: три карточки; купить — просьба Семёну (списывает сервер), причина «нельзя» — красной строкой */
export class BoatShopTab {
  private readonly cards: Card[] = [];
  private readonly me: () => MeState;

  constructor(npc: FishNpcDialog, me: () => MeState) {
    this.me = me;
    const panel = npc.addTab('boats', 'boat', 'Лодки', ['semyon'], (_p, prog, busy) => this.render(prog, busy));
    panel.classList.add('ob-shop');
    el('p', 'fi-say ob-intro', panel, 'Своя лодка возит до острова «Последний свет» и рыбачит с якоря втроём. Вызвать — на стоянке за домом, E у таблички места. '
      + 'Эхолот только ускоряет поклёвку с якоря: шансы и цены рыбы он не трогает.');
    const grid = el('div', 'fi-boats', panel);
    const maxTop = Math.max(...BOATS.map((b) => b.speed));
    const minR = Math.min(...BOATS.map((b) => b.speed / b.turn));
    for (const b of BOATS) {
      const r = b.speed / b.turn;
      const root = el('div', 'k-cell fi-boat', grid);
      el('div', 'fi-boat-ph', root).style.backgroundImage = `url('${photo(b.id)}')`;
      el('b', '', root, escHtml(b.name));
      el('p', '', root, escHtml(b.proto));
      el('div', 'fi-spec', root,
        `<span>скорость</span>${meterHtml(b.speed / maxTop, 'mode', 'k-meter--thin')}<span>${fmt1(b.speed * 3.6)} км/ч</span>`
        + `<span>разгон</span>${meterHtml(4 / b.accel, 'mode', 'k-meter--thin')}<span>${fmt1(b.accel)} с</span>`
        + `<span>поворот</span>${meterHtml((minR / r) * 0.9, 'mode', 'k-meter--thin')}<span>круг ${fmt1(r)} м</span>`);
      el('div', 'fi-chips', root,
        `<span class="k-pill k-pill--good k-pill--sm">клёв с якоря +${Math.round(b.sonar * 100)} %</span>`
        + `<span class="k-pill k-pill--sm">${iconImg('livewell')}лайвел ${b.livewell}</span>`
        + `<span class="k-pill k-pill--sm">до острова ${b.trip}</span>`);
      const why = el('p', 'fi-why', root);
      const own = el('p', 'ob-own-note', root, 'Вызывай на стоянке за домом: E у таблички места.');
      const pill = el('span', 'k-pill k-pill--gold ob-own-pill', root, 'Твоя');
      const btn = el('button', 'k-btn k-btn--sm', root, `<span class="k-row-line">Купить · ${fmtInt(b.price)} ${coinHtml()}</span>`);
      btn.type = 'button';
      btn.addEventListener('click', () => npc.ask('buyBoat', { boat: b.id }));
      this.cards.push({ root, why, own, pill, btn });
    }
  }

  private render(p: FishProgress, busy: boolean): void {
    const tokens = this.me().tokens;
    const level = fishLevel(p.xp);
    const owned = ownedBoats(p);
    BOATS.forEach((b, i) => {
      const c = this.cards[i];
      const st: BoatBuyState = boatBuyState(b, owned, level, tokens);
      c.root.classList.toggle('is-own', st === 'owned');
      c.root.classList.toggle('is-lock', st === 'level');
      const why = st === 'level' ? `С ${b.level}-го уровня рыбалки · у тебя ${level}-й` : st === 'tokens' ? `Не хватает ${fmtInt(b.price - tokens)} ${coinHtml()}` : '';
      if (c.why.dataset.k !== why) {
        c.why.dataset.k = why;
        c.why.innerHTML = why;
      }
      c.why.hidden = !why;
      c.own.hidden = c.pill.hidden = st !== 'owned';
      c.btn.hidden = st === 'owned';
      c.btn.disabled = busy || st !== 'ok';
    });
  }
}
