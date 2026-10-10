// Общее для окон фермы (часть B2): значки, форматы, помощники DOM, полоска «продано за сутки» и основа окна — нативный
// <dialog> по образцу client/lobby/fishnpcdialog.ts: тёплая тёмная карточка, лицо слева, баланс 🪙 справа, × · Esc,
// вкладки-«таблетки». Закрывается крестиком, Esc и кликом мимо. Окно не знает про сеть: всё идёт через FarmHost.
import { mskDay } from '../../../shared/economy.ts';
import { pigTick, wellNextAt, wellTick, type FarmProgress } from '../../../shared/farm.ts';
import { DAILY_CAP, HELP_BASE, PIG_EVERY_MS, PIG_STORE, RESOURCES, resourceById } from '../../../shared/farmdata.ts';
import type { FarmClientMsg, FarmPlotView, FarmRosterRow } from '../../../shared/farmnet.ts';
import { setCoinText } from '../../ui/coin.ts';

const ICONS = import.meta.glob('../../assets/farm/icons/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
/** Иконка фермы по имени файла из client/assets/farm/icons (нет файла — пустая строка) */
export const farmIcon = (name: string): string => ICONS[`../../assets/farm/icons/${name}.png`] ?? '';

/** Элемент с текстом; 🪙 рисуется значком жетона, как во всей игре */
export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) setCoinText(e, text);
  return e;
};

export function btn(cls: string, text: string, onClick?: () => void): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

export function fmtMin(min: number): string {
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

/** Остаток времени: до часа — «6:40», дальше — «5 ч 12 мин» */
export function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)} ч ${Math.floor((s % 3600) / 60)} мин`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Число с запятой и одним знаком: 2,2 */
export function dec(n: number): string {
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

export function big(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}

/** Значок культуры, ресурса или вещи: картинка, а если файла нет — эмодзи-замена */
export function icon(name: string, fallback = '🌱', cls = 'fm-ico'): HTMLElement {
  const src = farmIcon(name);
  if (src) {
    const img = el('img', cls);
    img.src = src;
    img.alt = '';
    img.draggable = false;
    return img;
  }
  return el('span', `${cls} emo`, fallback);
}

/** Закрытая культура — тёмный силуэт того же значка */
export function silhouette(name: string): HTMLElement {
  const i = icon(name, '❔', 'fm-ico lock');
  return i;
}

export function resIcon(id: string, cls = 'fm-ico'): HTMLElement {
  return icon(resourceById(id)?.icon ?? '', '🌾', cls);
}

export const resName = (id: string): string => resourceById(id)?.name ?? id;

export const RES_ORDER: readonly string[] = RESOURCES.map((r) => r.id);

// ------------------------------------------------------------ время по Москве (UTC+3, без летнего)

const MSK = 3 * 3600_000;
export const mskHour = (now: number): number => new Date(now + MSK).getUTCHours();
/** Сколько мс до 00:00 МСК: обновление заказов, сброс потолка продаж */
export function msToMskMidnight(now: number): number {
  return 86_400_000 - ((now + MSK) % 86_400_000);
}
export const msToNextHour = (now: number): number => 3_600_000 - (now % 3_600_000);
export const clockHour = (h: number): string => `${String(((h % 24) + 24) % 24).padStart(2, '0')}:00`;

/** Сколько жетонов выплачено Грибом и Фургоном за сегодняшние МСК-сутки */
export function soldToday(f: FarmProgress, now: number): number {
  return f.sold.day === mskDay(now) ? f.sold.coins : 0;
}

/** Полоска «Сегодня продано на 540 / 700 🪙», после потолка — «Ставка ×0,25 до 00:00» (Гриб и Фургон) */
export function capBar(f: FarmProgress, now: number): HTMLElement {
  const sold = Math.floor(soldToday(f, now));
  const box = el('div', 'fm-cap');
  const full = sold >= DAILY_CAP;
  box.classList.toggle('full', full);
  box.append(el('span', 'fm-cap-line', `Сегодня продано на ${sold} / ${DAILY_CAP} 🪙`));
  const bar = el('div', 'fm-cap-bar');
  const fill = el('i');
  fill.style.width = `${Math.min(100, (sold / DAILY_CAP) * 100)}%`;
  bar.append(fill);
  box.append(bar);
  if (full) box.append(el('span', 'fm-cap-note', `Ставка ×0,25 до 00:00 (${fmtLeft(msToMskMidnight(now))}) · заказы и трюфели — полностью`));
  return box;
}

/** Шаги обучения Семечкина (design-v11 §1.4): одна фраза на шаг */
export const TUTORIAL_TEXT: readonly string[] = [
  'Посади редис — первый пакетик дарю. Подойди к своей грядке и нажми E',
  'Набери лейку у колодца — встань у корыта и нажми E',
  'Полей грядку — E у растущей грядки',
  'Созрело! Собери — E у светящейся грядки',
  'Отнеси урожай Дядюшке Грибу — он у лавки с весами',
  'Посади ещё и загляни на доску заказов',
];

export const SLOT_EMOJI: Readonly<Record<string, string>> = { h: '🧢', u: '👕', l: '👖', a: '🧤', s: '🐣', f: '✨', n: '🏅', ti: '🎖', fr: '🖼', tl: '🔧', pl: '🏡', em: '🙌' };

// ------------------------------------------------------------ колодец, свин, помощь: ленивые значения на сейчас

/** Наборы воды и когда будет следующий (0 — колодец полон); сам профиль не трогаем */
export function wellView(f: FarmProgress, now: number): { sets: number; nextAt: number } {
  const c = { well: { ...f.well } } as FarmProgress;
  wellTick(c, now);
  return { sets: c.well.sets, nextAt: wellNextAt(c) };
}

/** Свин: сколько трюфелей в загоне сейчас и когда будет следующий (0 — загон полон) */
export function pigView(f: FarmProgress, now: number): { stored: number; nextAt: number } | null {
  if (!f.built.pig) return null;
  const c = { built: { ...f.built, pig: { ...f.built.pig } } } as FarmProgress;
  pigTick(c, now);
  const p = c.built.pig!;
  return { stored: p.stored, nextAt: p.stored >= PIG_STORE ? 0 : p.since + PIG_EVERY_MS };
}

/** Очки помощи: сколько осталось и когда полный сброс (0 — очки полные). Считаем «points» потраченными */
export function helpView(f: FarmProgress, level: number, now: number): { left: number; max: number; resetAt: number } {
  const max = HELP_BASE + level - 1;
  if (now >= f.help.resetAt || f.help.points <= 0) return { left: max, max, resetAt: 0 };
  return { left: Math.max(0, max - f.help.points), max, resetAt: f.help.resetAt };
}

// ------------------------------------------------------------ связь окон с ведущим (FarmHud)

export interface FarmHost {
  readonly f: FarmProgress;
  /** Серверное время */
  readonly now: number;
  readonly tokens: number;
  /** Свой участок (0–19) и общий вид фермы: для доски */
  readonly plot: number;
  send(m: FarmClientMsg): void;
  plots(): readonly FarmPlotView[];
  roster(): readonly FarmRosterRow[];
  sell(item: string, n: number): void;
  plant(crop: string): void;
  /** Тост в игре (общий Toasts игры) */
  toast(text: string, sub?: string, key?: string): void;
  /** Окно закрылось (мышь — обратно игре) */
  closed(win: FarmWin): void;
  /** Надеть вещи каталога («Надеть» на экране уровня) */
  wear(ids: string[]): void;
  /** Предложения Фургона от B1 (пока нет — null) */
  van(): VanState | null;
  boss(): BossState | null;
}

/** Ящик Фургона: сколько, во что оценён. Формат ждём от B1 (shared/farmsys.ts), см. ui/sys.ts */
export interface VanOffer {
  slot: number;
  crop: string;
  n: number;
  /** Множитель цены ×1,3–1,5 */
  mult: number;
  coins: number;
  xp: number;
  gourmet?: boolean;
}
export interface VanState {
  cycle: number;
  open: boolean;
  until: number;
  offers: VanOffer[];
}
export interface BossState {
  /** 'sleep' — спит, 'awake' — идёт цветение, 'done' — отцвело */
  phase: 'sleep' | 'awake' | 'done';
  /** Цветение 0–1 и мой вклад 0–1 */
  bloom: number;
  share: number;
  startsAt: number;
  top: { nick: string; pct: number }[];
}

// ------------------------------------------------------------ основа окна

export interface WinSpec {
  id: string;
  eyebrow: string;
  title: string;
  intro: string;
  avatar: string;
  /** Цвет бровки и рамки аватара */
  accent: string;
}

type TabDef = readonly [id: string, icon: string, label: string];

/** Нативный <dialog>: фокус внутри, фон не нажимается, клавиши игре не уходят. Наследник рисует тело в draw(). */
export abstract class FarmWin {
  readonly id: string;
  protected readonly host: FarmHost;
  protected readonly dlg: HTMLDialogElement;
  protected readonly body: HTMLElement;
  protected readonly tabbar: HTMLElement;
  protected readonly intro: HTMLElement;
  private readonly balance: HTMLElement;
  private readonly eyebrowEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly faceEl: HTMLElement;
  private liveFns: Array<() => void> = [];
  protected tab = '';

  constructor(parent: HTMLElement, host: FarmHost, spec: WinSpec) {
    this.id = spec.id;
    this.host = host;
    const d = el('dialog', `fm-dlg fm-dlg-${spec.id}`);
    this.dlg = d;
    d.style.setProperty('--fm-accent', spec.accent);
    d.setAttribute('aria-label', spec.title);
    const head = d.appendChild(el('header', 'fm-head'));
    const face = head.appendChild(el('div', 'fm-face', spec.avatar));
    face.setAttribute('aria-hidden', 'true');
    this.faceEl = face;
    const who = head.appendChild(el('div', 'fm-who'));
    this.eyebrowEl = el('span', 'fm-eyebrow', spec.eyebrow);
    this.titleEl = el('h2', '', spec.title);
    who.append(this.eyebrowEl, this.titleEl);
    this.intro = who.appendChild(el('p', 'fm-intro', spec.intro));
    this.balance = head.appendChild(el('div', 'fm-balance'));
    this.balance.title = 'Твои жетоны';
    const close = head.appendChild(el('button', 'fm-close'));
    close.type = 'button';
    close.autofocus = true;
    close.title = 'Закрыть · Esc';
    close.setAttribute('aria-label', 'Закрыть');
    close.append(el('span', '', '×'), el('small', '', 'Esc'));
    close.addEventListener('click', () => this.close());
    this.tabbar = d.appendChild(el('nav', 'fm-tabs'));
    this.tabbar.setAttribute('role', 'tablist');
    this.body = d.appendChild(el('div', 'fm-body'));
    // клавиши — не игре; Esc закрывает
    d.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Escape') { e.preventDefault(); this.close(); }
    });
    d.addEventListener('keyup', (e) => e.stopPropagation());
    d.addEventListener('cancel', (e) => { e.preventDefault(); this.close(); });
    // клик мимо карточки (по затемнению) закрывает
    d.addEventListener('click', (e) => {
      if (e.target !== d) return;
      const r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) this.close();
    });
    parent.appendChild(d);
  }

  get isOpen(): boolean {
    return this.dlg.open;
  }

  /** Сменить шапку (номер грядки, уровень и т. п.) */
  protected setHead(o: { eyebrow?: string; title?: string; intro?: string; avatar?: string }): void {
    if (o.eyebrow !== undefined) this.eyebrowEl.textContent = o.eyebrow;
    if (o.title !== undefined) setCoinText(this.titleEl, o.title);
    if (o.intro !== undefined) setCoinText(this.intro, o.intro);
    if (o.avatar !== undefined) this.faceEl.textContent = o.avatar;
  }

  /** Нарисовать тело окна (вкладки — через setTabs, секундные подписи — через live) */
  protected abstract draw(body: HTMLElement): void;

  /** Окно открывается на первой вкладке, если не сказано иное */
  protected firstTab(): string {
    return '';
  }

  open(tab?: string): void {
    this.tab = tab ?? this.firstTab();
    this.render();
    if (!this.dlg.open) this.dlg.showModal();
    this.body.scrollTop = 0;
  }

  close(silent = false): void {
    if (!this.dlg.open) return;
    this.dlg.close();
    if (!silent) this.host.closed(this);
  }

  /** Сервер прислал новое состояние: перерисовать, не сбивая прокрутку */
  refresh(): void {
    if (this.dlg.open) this.render();
  }

  private render(): void {
    const keep = this.body.scrollTop;
    this.liveFns = [];
    this.tabbar.textContent = '';
    this.tabbar.hidden = true;
    this.body.textContent = '';
    setCoinText(this.balance, `${this.host.tokens} 🪙`);
    this.draw(this.body);
    this.body.scrollTop = keep;
    this.tick();
  }

  /** Раз в секунду: подписи со временем */
  tick(): void {
    if (!this.dlg.open) return;
    for (const fn of this.liveFns) fn();
    setCoinText(this.balance, `${this.host.tokens} 🪙`);
  }

  /** Подпись, зависящая от времени: пересчитывается раз в секунду без перерисовки окна */
  protected live(node: HTMLElement, text: () => string): void {
    let last = '';
    const fn = (): void => {
      const t = text();
      if (t === last) return;
      last = t;
      setCoinText(node, t);
    };
    this.liveFns.push(fn);
  }

  protected setTabs(defs: readonly TabDef[]): void {
    this.tabbar.hidden = false;
    for (const [id, ic, label] of defs) {
      const b = this.tabbar.appendChild(el('button', 'fm-tab'));
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(id === this.tab));
      b.classList.toggle('on', id === this.tab);
      b.append(el('span', 'fm-tab-ico', ic), el('span', '', label));
      b.addEventListener('click', () => { this.tab = id; this.render(); this.body.scrollTop = 0; });
    }
  }
}

/** Строка «ресурс: есть / нужно» с цветом: хватает или нет */
export function needChip(resId: string, have: number, need: number): HTMLElement {
  const c = el('span', `fm-need${have >= need ? ' ok' : ' low'}`);
  c.append(resIcon(resId, 'fm-ico sm'), el('b', '', `${have}/${need}`), el('small', '', resName(resId)));
  return c;
}
