// Общее для окон фермы на ките (client/ui/kit): значки, помощники разметки и основа окна — нативный <dialog>
// (верхний слой: фон не нажимается, клавиши игре не уходят, Esc закрывает), внутри — кит-окно .k-scrim > .k-window
// (шапка с портретом, вкладки .k-tabs, тело, подвал). Закрывается ×, Esc и кликом мимо; мышь освобождает сцена (host.free).
// Окно не знает про сеть: всё идёт через FarmHost. Разметку окна собирают наследники строкой, как на странице lab/ui
// (lab/ui/screens/farm.js); чужой текст (ники) — только через esc().
import type { FarmProgress } from '../../../shared/farm.ts';
import { resourceById } from '../../../shared/farmdata.ts';
import type { FarmClientMsg, FarmPlotView, FarmRosterRow } from '../../../shared/farmnet.ts';
import type { FarmBossResult, FarmBossView, FarmVanView } from '../../../shared/farmsys.ts';
import { coinHtml, iconImg } from '../../ui/kit/dom.ts';
import { sfx, bindClickSounds } from '../../ui/kit/sfx.ts';
import { uiIcon } from '../../ui/kit/icons.ts';
import { big } from './fmt.ts';

export { big, clockHour, dec, fmtLeft, fmtMin, mskHour, msToMskMidnight, msToNextHour, pigView, plural, soldToday, wellView } from './fmt.ts';
export { escHtml as esc } from '../../ui/kit/topcenter.ts';

const ICONS = import.meta.glob('../../assets/farm/icons/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
/** Иконка фермы по имени файла из client/assets/farm/icons (нет файла — пустая строка) */
export const farmIcon = (name: string): string => ICONS[`../../assets/farm/icons/${name}.png`] ?? '';

/** Адрес картинки: «ui:rift-tree» — иконка кита (client/assets/ui/icons), иначе — иконка фермы */
export function iconUrl(name: string): string {
  return name.startsWith('ui:') ? uiIcon(name.slice(3)) : farmIcon(name);
}

/** Картинка-иконка в строку текста (.k-ic) или своего класса; нет файла — пусто */
export function fi(name: string, cls = 'k-ic'): string {
  const src = iconUrl(name);
  return src ? `<img${cls ? ` class="${cls}"` : ''} src="${src}" alt="" draggable="false">` : '';
}

/** Иконка кита по id */
export const ui = (id: string, cls = 'k-ic'): string => iconImg(id, cls);

export const C = (): string => coinHtml();

export const resIconName = (id: string): string => resourceById(id)?.icon ?? '';
export const resName = (id: string): string => resourceById(id)?.name ?? id;

/** Полоса кита: значение 0…1, класс, подпись внутри; g — «след» */
export function meter(v: number, cls = '', label = '', g?: number): string {
  const k = Math.round(Math.min(1, Math.max(0, v || 0)) * 1000) / 1000;
  return `<div class="k-meter ${cls}"${cls.includes('k-meter--mode') ? ' data-mode="farm"' : ''} style="--v:${k}${g != null ? `;--g:${g}` : ''}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i>${label ? `<span class="k-meter-label">${label}</span>` : ''}</div>`;
}

/** Всплывающее число у элемента (.k-pop живёт 1,6 с) */
export function popAt(host: HTMLElement | null, text: string, cls = ''): void {
  if (!host) return;
  host.querySelector(':scope > .k-pop')?.remove();
  const p = document.createElement('span');
  p.className = `k-pop ${cls}`.trim();
  p.textContent = text;
  host.append(p);
  window.setTimeout(() => p.remove(), 1700);
}

/** Шаги обучения Семечкина: одна фраза на шаг */
export const TUTORIAL_TEXT: readonly string[] = [
  'Посади редис — первый пакетик дарю. Подойди к своей грядке и нажми E',
  'Набери лейку у колодца — встань у корыта и нажми E',
  'Полей грядку — E у растущей грядки',
  'Созрело! Собери — E у светящейся грядки',
  'Отнеси урожай Дядюшке Грибу — он у лавки с весами',
  'Посади ещё и загляни на доску заказов',
];

// ------------------------------------------------------------ связь окон с ведущим (FarmHud)

export interface FarmToast {
  key?: string;
  tone?: 'info' | 'reward' | 'warn' | 'good';
  /** Иконка: имя файла фермы или «ui:id» */
  icon: string;
  title: string;
  sub?: string;
}

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
  /** Тост в верх-центр HUD (ui.top) */
  toast(t: FarmToast): void;
  /** Окно закрылось (мышь — обратно игре) */
  closed(win: FarmWin): void;
  /** Надеть вещи каталога («Надеть» на экране уровня) */
  wear(ids: string[]): void;
  /** Фургон, Древо и итог прошлого цветения от B1 (farmVan, farmBoss, farmBossEnd); пока не пришли — null */
  van(): FarmVanView | null;
  boss(): FarmBossView | null;
  bossLast(): FarmBossResult | null;
  /** Доска фермы → «Помочь»: окно закрыто, подскажи дорогу к участку */
  goPlot(plot: number): void;
}

// ------------------------------------------------------------ основа окна

export interface WinSpec {
  id: string;
  eyebrow: string;
  title: string;
  /** Реплика NPC под заголовком (курсив) */
  line?: string;
  /** Портрет: имя иконки фермы или «ui:id» */
  portrait: string;
  size?: 'sm' | 'lg';
  /** Баланс жетонов в шапке (по умолчанию — да) */
  coins?: boolean;
  /** Без шапки и вкладок: классы корня, содержимое рисует наследник целиком (draw получает корень). '+clear' — без затемнения */
  bare?: string;
}

export interface TabDef {
  id: string;
  /** Разметка иконки (fi(...) / ui(...)) */
  icon?: string;
  label: string;
  /** «7 из 19», «1 готов» */
  count?: string;
  /** Разметка после подписи (пилюля «здесь до 15:00») */
  after?: string;
}

/** Нативный <dialog> с кит-окном. Наследник рисует тело в draw(). */
export abstract class FarmWin {
  readonly id: string;
  protected readonly host: FarmHost;
  protected readonly dlg: HTMLDialogElement;
  protected readonly win: HTMLElement;
  protected readonly head: HTMLElement;
  protected readonly body: HTMLElement;
  protected readonly tabbar: HTMLElement;
  protected readonly foot: HTMLElement;
  private readonly bal: HTMLElement | null;
  private liveFns: Array<() => void> = [];
  private tokensShown = -1;
  protected tab = '';

  constructor(parent: HTMLElement, host: FarmHost, spec: WinSpec) {
    this.id = spec.id;
    this.host = host;
    const d = document.createElement('dialog');
    d.className = `k-scrim farm-scrim${spec.bare?.includes('+clear') ? ' farm-scrim--clear' : ''}`;
    d.dataset.mode = 'farm';
    d.setAttribute('aria-label', spec.title);
    this.dlg = d;
    const size = spec.size ? ` k-window--${spec.size}` : '';
    d.innerHTML = spec.bare
      ? `<section class="${spec.bare.replace('+clear', '').trim()} farm-win farm-win--${spec.id}"></section>`
      : `<section class="k-window${size} farm-win farm-win--${spec.id}">
          <header class="k-win-head">
            <span class="k-win-portrait"><img alt="" draggable="false"></span>
            <div class="k-win-titles"><p class="k-eyebrow"></p><h2 class="k-win-title"></h2><p class="farm-npc"></p></div>
            <div class="k-win-tools">${spec.coins === false ? '' : '<span class="k-pill k-pill--gold k-pill--lg farm-bal"></span>'}<button class="k-close" type="button" aria-label="Закрыть"><kbd class="k-key k-key--sm">Esc</kbd></button></div>
          </header>
          <nav class="k-tabs" hidden></nav>
          <div class="k-win-body"></div>
          <footer class="k-win-foot" hidden></footer>
        </section>`;
    this.win = d.querySelector('section')!;
    this.head = d.querySelector('.k-win-head') ?? this.win;
    this.body = d.querySelector('.k-win-body') ?? this.win;
    this.tabbar = d.querySelector('.k-tabs') ?? document.createElement('nav');
    this.foot = d.querySelector('.k-win-foot') ?? document.createElement('footer');
    this.bal = d.querySelector('.farm-bal');
    if (!spec.bare) this.setHead({ eyebrow: spec.eyebrow, title: spec.title, line: spec.line ?? '', portrait: spec.portrait });
    d.querySelector('.k-close')?.addEventListener('click', () => this.close());
    // фокус — на само окно, а не на ×: клавиши (E, Esc) идут окну, а кольцо фокуса не светится, пока не нажали Tab
    d.tabIndex = -1;
    // клавиши — не игре; Esc закрывает; наследник может взять свои (E в «Ура!»)
    d.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Escape') { e.preventDefault(); this.close(); return; }
      if (!e.repeat && this.onKey(e.code)) e.preventDefault();
    });
    d.addEventListener('keyup', (e) => e.stopPropagation());
    d.addEventListener('mousedown', (e) => { e.stopPropagation(); if ((e.target as Element).closest('button')) e.preventDefault(); });
    for (const type of ['pointerdown', 'wheel'] as const) d.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    d.addEventListener('cancel', (e) => { e.preventDefault(); this.close(); });
    // клик мимо окна (по затемнению) закрывает
    d.addEventListener('click', (e) => { if (e.target === d) this.close(); });
    bindClickSounds(d);
    parent.appendChild(d);
  }

  get isOpen(): boolean {
    return this.dlg.open;
  }

  /** Сменить шапку (номер грядки, имя и т. п.); портрет — имя иконки фермы или «ui:id» */
  protected setHead(o: { eyebrow?: string; title?: string; line?: string; portrait?: string }): void {
    const q = <T extends Element>(s: string): T | null => this.head.querySelector<T>(s);
    if (o.eyebrow !== undefined) q('.k-eyebrow')!.textContent = o.eyebrow;
    if (o.title !== undefined) q('.k-win-title')!.textContent = o.title;
    if (o.line !== undefined) {
      const l = q<HTMLElement>('.farm-npc')!;
      l.textContent = o.line;
      l.hidden = o.line === '';
    }
    if (o.portrait !== undefined) q<HTMLImageElement>('.k-win-portrait img')!.src = iconUrl(o.portrait);
  }

  /** Нарисовать тело окна (вкладки — через setTabs, подвал — через setFoot, секундные подписи — через live) */
  protected abstract draw(body: HTMLElement): void;

  /** Своя клавиша окна (кроме Esc): true — съела */
  protected onKey(_code: string): boolean {
    return false;
  }

  /** Окно открывается на первой вкладке, если не сказано иное */
  protected firstTab(): string {
    return '';
  }

  open(tab?: string): void {
    this.tab = tab ?? this.firstTab();
    this.render();
    if (!this.dlg.open) {
      this.dlg.showModal();
      this.dlg.focus({ preventScroll: true });
      sfx.play('open');
    }
    this.win.classList.remove('is-in');
    void this.win.offsetWidth;
    this.win.classList.add('is-in');
    this.body.scrollTop = 0;
  }

  close(silent = false): void {
    if (!this.dlg.open) return;
    this.dlg.close();
    if (!silent) {
      sfx.play('close');
      this.host.closed(this);
    }
  }

  /** Сервер прислал новое состояние: перерисовать, не сбивая прокрутку */
  refresh(): void {
    if (this.dlg.open) this.render();
  }

  private render(): void {
    const keep = this.body.scrollTop;
    this.liveFns = [];
    this.tabbar.hidden = true;
    this.tabbar.textContent = '';
    this.foot.hidden = true;
    this.foot.textContent = '';
    this.body.textContent = '';
    this.balance(false);
    this.draw(this.body);
    this.body.scrollTop = keep;
    for (const fn of this.liveFns) fn();
  }

  /** Баланс в шапке; если поменялся — «+N / −N» над ним (жетоны приходят отдельным сообщением) */
  private balance(pop: boolean): void {
    if (!this.bal) return;
    const t = this.host.tokens;
    if (t === this.tokensShown) return;
    if (pop && this.tokensShown >= 0) popAt(this.bal, `${t > this.tokensShown ? '+' : '−'}${big(Math.abs(t - this.tokensShown))}`, t < this.tokensShown ? 'k-pop--bad' : '');
    this.tokensShown = t;
    this.bal.innerHTML = `${C()}${big(t)}`;
  }

  /** Раз в секунду: подписи со временем и баланс */
  tick(): void {
    if (!this.dlg.open) return;
    for (const fn of this.liveFns) fn();
    this.balance(true);
  }

  /** Подпись, зависящая от времени: пересчитывается раз в секунду без перерисовки окна. sel — внутри окна */
  protected live(sel: string, text: () => string): void {
    let last = '';
    const fn = (): void => {
      const node = this.win.querySelector(sel);
      if (!node) return;
      const t = text();
      if (t === last && node.innerHTML !== '') return;
      last = t;
      node.innerHTML = t;
    };
    this.liveFns.push(fn);
  }

  /** Вкладки; нажатие — перерисовать окно на этой вкладке */
  protected setTabs(defs: readonly TabDef[]): void {
    this.tabbar.hidden = false;
    this.tabbar.innerHTML = defs
      .map((d) => `<button class="k-tab${d.id === this.tab ? ' is-on' : ''}" type="button" role="tab" aria-selected="${d.id === this.tab}" data-tab="${d.id}">${d.icon ?? ''}${d.label}${d.count ? ` <span class="k-tab-count">${d.count}</span>` : ''}${d.after ?? ''}</button>`)
      .join('');
    this.tabbar.querySelectorAll<HTMLElement>('.k-tab').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.tab === this.tab) return;
      this.tab = b.dataset.tab!;
      this.render();
      this.body.scrollTop = 0;
    }));
  }

  /** Подвал окна: готовая разметка (.k-note слева, кнопки справа) */
  protected setFoot(html: string): void {
    this.foot.hidden = html === '';
    this.foot.innerHTML = html;
  }

  /** Нажатия по элементам внутри окна (тело, подвал, шапка) */
  protected onClick(sel: string, fn: (el: HTMLElement) => void): void {
    this.win.querySelectorAll<HTMLElement>(sel).forEach((e) => e.addEventListener('click', () => fn(e)));
  }
}
