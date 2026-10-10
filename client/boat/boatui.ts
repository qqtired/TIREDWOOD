// Интерфейс своих лодок: панель в лодке (скорость, стрелки к острову и стоянке, якорь, «Продать улов», место под радио),
// окно вызова лодки к месту на стоянке (схема пирса — места кликаются; по образцу окна Семёна) и вкладка «⛵ Лодки»
// у Семёна (три карточки как на странице ревью: скорость, разгон, поворот, эхолот, якорь, время до острова, кнопка
// покупки с причиной, почему нельзя). Логика и сеть — client/boat/ownboats.ts.
import { BOATS, boatBuyNote, boatBuyState, fmtInt, ownedBoats, type BoatId } from '../../shared/fishboat.ts';
import { fishLevel, type FishProgress } from '../../shared/fishprogress.ts';
import { BERTHS, OB_KEEP_FREE, PARK_COUNT, isParkBerth } from '../../shared/ownboat.ts';
import type { MeState } from '../scene.ts';
import type { FishNpcDialog } from '../lobby/fishnpcdialog.ts';
import { setCoinText } from '../ui/coin.ts';
import { BOAT_PICS, type PlateInfo } from './models.ts';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement | null, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

/** 840 → «840 м», 2140 → «2,1 км» */
export function km(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} м` : `${(m / 1000).toFixed(1).replace('.', ',')} км`;
}

const fmt1 = (n: number): string => n.toFixed(1).replace('.', ',');

// ------------------------------------------------------------ панель в лодке

export interface HudView {
  title: string;
  speed: string;
  phase: string;
  isle: { label: string; dist: string; rot: number };
  park: { label: string; dist: string; rot: number };
  sonar: string;
  /** Показать кнопку якоря (хозяин за штурвалом в море) и опущен ли он */
  anchor: boolean;
  anchorDown: boolean;
  /** Показать «Продать улов» (своя лодка у причала) */
  sell: boolean;
}

export class BoatHud {
  /** Место под кнопку радио (пакет радио) */
  readonly radio: HTMLElement;
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly phase: HTMLElement;
  private readonly sonar: HTMLElement;
  private readonly nav: Array<{ arrow: HTMLElement; label: HTMLElement; dist: HTMLElement }> = [];
  private readonly anchorBtn: HTMLButtonElement;
  private readonly sellBtn: HTMLButtonElement;
  private key = '';

  constructor(parent: HTMLElement, on: { anchor: () => void; sell: () => void }) {
    this.root = el('div', 'ob-hud', parent);
    this.root.hidden = true;
    const top = el('div', 'ob-top', this.root);
    const line = el('div', 'ob-line', top);
    this.title = el('b', 'ob-title', line);
    this.speed = el('span', 'ob-speed', line);
    this.phase = el('div', 'ob-phase', top);
    const nav = el('div', 'ob-nav', this.root);
    for (const cls of ['isle', 'park']) {
      const row = el('div', `ob-navrow ob-${cls}`, nav);
      const arrow = el('i', 'ob-arrow', row, '➤');
      arrow.setAttribute('aria-hidden', 'true');
      const txt = el('div', 'ob-navtxt', row);
      const label = el('span', '', txt);
      const dist = el('b', '', txt);
      this.nav.push({ arrow, label, dist });
    }
    this.sonar = el('div', 'ob-sonar', nav);
    const side = el('div', 'ob-side', this.root);
    this.radio = el('div', 'ob-radio', side);
    this.anchorBtn = el('button', 'ob-btn', side);
    this.anchorBtn.type = 'button';
    this.anchorBtn.addEventListener('click', () => on.anchor());
    this.sellBtn = el('button', 'ob-btn ob-sell', side, 'G — Продать улов');
    this.sellBtn.type = 'button';
    this.sellBtn.addEventListener('click', () => on.sell());
  }

  show(v: HudView): void {
    this.root.hidden = false;
    for (const [i, n] of [v.isle, v.park].entries()) {
      this.nav[i].arrow.style.transform = `rotate(${(n.rot * 180) / Math.PI - 90}deg)`;
    }
    const key = `${v.title}|${v.speed}|${v.phase}|${v.isle.label}|${v.isle.dist}|${v.park.label}|${v.park.dist}|${v.anchor}|${v.anchorDown}|${v.sell}`;
    if (key === this.key) return;
    this.key = key;
    this.title.textContent = `⛵ ${v.title}`;
    this.speed.textContent = v.speed;
    this.phase.textContent = v.phase;
    this.phase.hidden = !v.phase;
    this.nav[0].label.textContent = v.isle.label;
    this.nav[0].dist.textContent = v.isle.dist;
    this.nav[1].label.textContent = v.park.label;
    this.nav[1].dist.textContent = v.park.dist;
    this.sonar.textContent = v.sonar;
    this.anchorBtn.hidden = !v.anchor;
    this.anchorBtn.textContent = v.anchorDown ? 'Z — Поднять якорь' : 'Z — Бросить якорь';
    this.sellBtn.hidden = !v.sell;
  }

  hide(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.key = '';
  }
}

// ------------------------------------------------------------ окно вызова

interface SummonDeps {
  send: (berth: number, boat: string) => void;
  onOpen: () => void;
  onClose: () => void;
}

/** Вызов своей лодки к свободному месту: схема пирса (места кликаются), выбор лодки, кнопка «Вызвать» */
export class SummonDialog {
  private readonly root: HTMLDialogElement;
  private readonly eyebrow: HTMLElement;
  private readonly boatsRow: HTMLElement;
  private readonly map: HTMLElement;
  private readonly note: HTMLElement;
  private readonly go: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly d: SummonDeps;
  private berth = 0;
  private boat: string | null = null;
  private info: Array<PlateInfo | null> = [];
  private owned: string[] = [];

  constructor(parent: HTMLElement, d: SummonDeps) {
    this.d = d;
    this.root = el('dialog', 'fn-dialog fe-npc ob-dialog', parent);
    this.root.setAttribute('aria-labelledby', 'ob-summon-title');
    const head = el('header', 'fn-head', this.root);
    el('div', 'fe-avatar', head, '⛵').setAttribute('aria-hidden', 'true');
    const box = el('div', 'fn-heading', head);
    this.eyebrow = el('span', 'fn-eyebrow', box);
    const h = el('h2', '', box, 'Вызвать свою лодку');
    h.id = 'ob-summon-title';
    el('p', 'fn-intro', box, 'Выбери свободное место — лодка подойдёт из-за ворот за 4 секунды.');
    el('div', '', head);
    const close = el('button', 'fn-close', head, '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Закрыть');
    close.title = 'Закрыть · Esc';
    close.addEventListener('click', () => this.close());
    const body = el('div', 'fn-body ob-body', this.root);
    el('h3', '', body, 'Лодка');
    this.boatsRow = el('div', 'ob-boats', body);
    el('h3', '', body, 'Место у пирса');
    this.map = el('div', 'ob-map', body);
    this.note = el('p', 'fn-fine ob-note', body);
    const footer = el('footer', 'fn-footer', this.root);
    const fb = el('div', 'fn-feedback', footer);
    this.status = el('div', 'fn-status', fb);
    this.status.setAttribute('role', 'status');
    this.go = el('button', 'fn-action ob-go', footer);
    this.go.type = 'button';
    this.go.addEventListener('click', () => this.summon());
    this.root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.code === 'Enter' && !this.go.disabled) {
        e.preventDefault();
        this.summon();
      }
    });
    this.root.addEventListener('keyup', (e) => e.stopPropagation());
    this.root.addEventListener('cancel', (e) => { e.preventDefault(); this.close(); });
    this.root.addEventListener('click', (e) => {
      if (e.target !== this.root) return;
      const r = this.root.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) this.close();
    });
  }

  get isOpen(): boolean {
    return this.root.open;
  }

  open(berth: number, info: Array<PlateInfo | null>, owned: string[]): void {
    this.berth = berth;
    this.info = info;
    this.owned = owned;
    const own = ownedBoats({ boats: owned });
    if (!this.boat || !own.includes(this.boat as BoatId)) this.boat = own.length ? own[own.length - 1] : null;
    this.status.textContent = '';
    this.render();
    if (!this.root.open) {
      this.root.showModal();
      this.d.onOpen();
    }
  }

  /** Состав у пирса поменялся (пока окно открыто — схема обновляется) */
  update(info: Array<PlateInfo | null>, owned: string[]): void {
    this.info = info;
    this.owned = owned;
    if (this.root.open) this.render();
  }

  close(): void {
    if (!this.root.open) return;
    this.root.close();
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
    this.eyebrow.textContent = park ? 'СТОЯНКА ЗА ДОМОМ СЕМЁНА · 10 МЕСТ' : 'ПРИЧАЛ ОСТРОВА · 6 МЕСТ';
    // лодки: купленные — кнопками с картинкой
    const own = ownedBoats({ boats: this.owned });
    this.boatsRow.replaceChildren();
    if (!own.length) el('p', 'fe-empty', this.boatsRow, 'Своей лодки пока нет — их продаёт Дед Семён (вкладка «⛵ Лодки»).');
    for (const id of own) {
      const k = BOATS.find((b) => b.id === id)!;
      const b = el('button', 'ob-boatpick', this.boatsRow);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(id === this.boat));
      const img = el('img', '', b);
      img.src = BOAT_PICS[id];
      img.alt = '';
      img.draggable = false;
      el('b', '', b, `«${k.name}»`);
      el('span', '', b, `${fmt1(k.speed * 3.6)} км/ч · до острова ${k.trip}`);
      b.addEventListener('click', () => {
        this.boat = id;
        this.render();
      });
    }
    // схема пирса: слева места 1–5, справа 6–10, посередине мостик
    this.map.replaceChildren();
    this.map.classList.toggle('isle', !park);
    const half = park ? 5 : berths.length;
    const cols = park ? [berths.slice(0, half), berths.slice(half)] : [berths];
    cols.forEach((list, c) => {
      const col = el('div', 'ob-col', this.map);
      for (const i of list) {
        const inf = this.info[i];
        const btn = el('button', 'ob-slip', col);
        btn.type = 'button';
        btn.classList.toggle('busy', !!inf);
        btn.classList.toggle('mine', !!inf?.mine);
        btn.setAttribute('aria-pressed', String(i === this.berth));
        el('b', '', btn, String(park ? i + 1 : i - PARK_COUNT + 1));
        el('span', '', btn, inf ? (inf.mine ? 'твоя лодка' : inf.nick) : 'свободно');
        btn.disabled = !!inf;
        btn.addEventListener('click', () => {
          this.berth = i;
          this.render();
        });
      }
      if (park && c === 0) el('div', 'ob-walk', this.map).setAttribute('aria-hidden', 'true');
    });
    const free = berths.filter((i) => !this.info[i]).length;
    this.note.textContent = `Свободно ${free} из ${berths.length}. ${park ? 'Не больше 8 лодок' : 'Не больше 4 лодок'}: ${OB_KEEP_FREE} места всегда свободны — `
      + 'если места нужны, уходит лодка, которая дольше всех стоит без хозяина. Вызвал другую свою лодку — прежняя уходит.';
    const k = this.boat ? BOATS.find((b) => b.id === this.boat) : null;
    const busy = !!this.info[this.berth];
    this.go.disabled = !k || busy;
    this.go.textContent = !k ? 'Нет своей лодки' : busy ? 'Место занято — выбери свободное' : `Вызвать «${k.name}» к месту ${park ? this.berth + 1 : this.berth - PARK_COUNT + 1}`;
  }
}

// ------------------------------------------------------------ вкладка «⛵ Лодки» у Семёна

interface Card {
  root: HTMLElement;
  note: HTMLElement;
  btn: HTMLButtonElement;
}

/** Вкладка «⛵ Лодки» в окне Семёна: три карточки; купить — просьба Семёну (списывает сервер), причина — на кнопке */
export class BoatShopTab {
  private readonly cards: Card[] = [];
  private readonly me: () => MeState;

  constructor(npc: FishNpcDialog, me: () => MeState) {
    this.me = me;
    const panel = npc.addTab('boats', '⛵', 'Лодки', ['semyon'], (_p, prog, busy) => this.render(prog, busy));
    el('h3', '', panel, 'Свои лодки');
    el('p', 'fn-fine', panel, 'Своя лодка возит до острова «Последний свет» и рыбачит с якоря втроём. Бонус лодки — только эхолот: '
      + 'с якоря клюёт быстрее; шансы и цены рыбы он не трогает. Вызывают лодку на стоянке за домом — E у таблички места.');
    const grid = el('div', 'ob-cards', panel);
    const maxTop = Math.max(...BOATS.map((b) => b.speed));
    const maxTurn = Math.max(...BOATS.map((b) => b.speed / b.turn));
    for (const b of BOATS) {
      const root = el('article', 'ob-card', grid);
      const img = el('img', 'ob-card-pic', root);
      img.src = BOAT_PICS[b.id];
      img.alt = `Лодка «${b.name}»`;
      img.draggable = false;
      img.decoding = 'async';
      const bd = el('div', 'ob-card-bd', root);
      el('h4', '', bd, `«${b.name}»`);
      el('span', 'ob-proto', bd, `Прототип: ${b.proto}`);
      const meter = (label: string, k: number, value: string): void => {
        const m = el('div', 'ob-meter', bd);
        el('span', '', m, label);
        el('i', '', el('span', 'ob-tr', m)).style.width = `${Math.round(k * 100)}%`;
        el('b', '', m, value);
      };
      meter('скорость', b.speed / maxTop, `${fmt1(b.speed * 3.6)} км/ч`);
      meter('разгон', 4 / b.accel, `${fmt1(b.accel)} с`);
      meter('поворот', (maxTurn / (b.speed / b.turn)) * 0.9, `R ${fmt1(b.speed / b.turn)} м`);
      const chips = el('div', 'ob-chips', bd);
      el('span', 'ob-chip hot', chips, `эхолот: клёв с якоря +${Math.round(b.sonar * 100)} %`);
      el('span', 'ob-chip', chips, `якорь ${fmt1(b.anchor)} с`);
      el('span', 'ob-chip', chips, '3 места');
      el('span', 'ob-chip', chips, `лайвел ${b.livewell} рыб`);
      const trip = el('div', 'ob-trip', bd);
      el('span', '', trip, 'до вод острова');
      el('b', '', trip, b.trip);
      const note = el('div', 'fn-item-note', bd);
      const btn = el('button', 'fn-action ob-buy', bd);
      btn.type = 'button';
      btn.addEventListener('click', () => npc.ask('buyBoat', { boat: b.id }));
      this.cards.push({ root, note, btn });
    }
  }

  private render(p: FishProgress, busy: boolean): void {
    const tokens = this.me().tokens;
    const level = fishLevel(p.xp);
    const owned = ownedBoats(p);
    BOATS.forEach((b, i) => {
      const c = this.cards[i];
      const st = boatBuyState(b, owned, level, tokens);
      c.root.classList.toggle('owned', st === 'owned');
      c.root.classList.toggle('locked', st === 'level');
      c.note.textContent = st === 'owned' ? 'Твоя · вызывай на стоянке за домом' : st === 'level' ? `С ${b.level}-го уровня рыбалки · у тебя ${level}-й`
        : st === 'tokens' ? `Не хватает ${fmtInt(b.price - tokens)} 🪙` : `${fmtInt(b.price)} 🪙 · с ${b.level}-го уровня`;
      setCoinText(c.btn, st === 'owned' ? 'Куплена' : st === 'ok' ? boatBuyNote(b, st, level, tokens) : `Купить · ${fmtInt(b.price)} 🪙`);
      c.btn.disabled = busy || st !== 'ok';
    });
  }
}
