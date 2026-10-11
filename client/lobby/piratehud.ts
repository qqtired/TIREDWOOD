// «Набег пиратов»: интерфейс защитника на ките 2.0 (как на странице lab/ui «Режимы» → «Пираты: набег»).
// Плашка «Пираты на горизонте!» / «Волна N» — событие в верх-центре (client/ui/kit/topcenter.ts); панель набега (корабль,
// ящики, волна, время) — плашкой кита под стопкой верх-центра (слот tcUnder: плашка и тосты её не закрывают). Пока
// пираты на горизонте — три задачи защитника плашкой внизу по центру (.mo-tasks; подсказка набережной .pz-hint — под ней).
// Прицел (.k-cross: точка — цвет своей краски; у пушки — большое кольцо с перезарядкой пилюлей), отметка попадания
// (.k-cross.is-hit / is-head), стрелки к угрозам у края экрана (.k-edge с иконкой и метрами) — в слое без zoom (.k-world).
// Кнопка «Огонь» на телефоне и окно итогов (ModeResults, client/ui/kit/modes.ts). В кадре меняем только то, что поменялось.
import { PIRATE_END, PIRATE_WAVES, paintOf, type PirateView } from '../../shared/pirates.ts';
import { COIN_HTML } from '../ui/coin.ts';
// окно итогов — ModeResults кита (client/ui/kit/modes.ts); модуль кита грузим лениво: он тянет картинки через Vite
// (import.meta.glob), а этот файл открывают и тесты в Node
import type { ModeResults } from '../ui/kit/modes.ts';
import { PRIO, escHtml, type TcEvent } from '../ui/kit/topcenter.ts';
import './pirates.css';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}

const esc = escHtml;
const coinHtml = (): string => COIN_HTML.replace('class="coin"', 'class="k-coin"');
/** Тонкая полоса кита 0…1 (как meterHtml в client/ui/kit/dom.ts) */
const meterHtml = (v: number, tone: string): string => `<span class="k-meter k-meter--thin k-meter--${tone}" style="--v:${v}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span>`;
/** Левая кнопка мыши колпачком кита */
const LMB = '<i class="k-mouse k-mouse--l" aria-label="ЛКМ"></i>';
const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export type ArrowKind = 'thief' | 'pirate' | 'boat' | 'loot';
export interface ArrowSpec { kind: ArrowKind; x: number; y: number; angle: number; label: string }
export type ReticleMode = 'off' | 'marker' | 'cannon';
export interface ReticleSpec { mode: ReticleMode; slot: number; text: string; state: 'good' | 'wait' | 'bad' | 'none' }

const ARROWS = 8;
const KEY = 'pirates';
/** Стрелки: что это (подпись), тон кита, иконка */
const ARROW_TEXT: Record<ArrowKind, string> = { thief: 'вор с ящиком', pirate: 'пират', boat: 'шлюпка', loot: 'ящик' };
const ARROW_TONE: Record<ArrowKind, string> = { thief: 'bad', pirate: 'bad', boat: 'info', loot: 'gold' };
const ARROW_ICON: Record<ArrowKind, string> = { thief: 'pirate-flag', pirate: 'pirate-flag', boat: 'boat', loot: 'loot' };
/** Отступ стрелок от края экрана, px (× масштаб HUD) */
const EDGE = 56;
/** Угрозы в одной стороне (шаг угла) — одной стрелкой */
const ARROW_BIN = Math.PI / 9;

/** Куда класть плашку: верх-центр HUD и картинки кита (без них — тесты — плашки нет); under — слот панели набега */
export interface PirateTop {
  top?: { event(e: TcEvent): void; clear(key: string): void };
  icon?(id: string): string;
  under?: HTMLElement;
  /** Слот низ-центра (задачи защитника перед набегом) */
  bottom?: HTMLElement;
  /** Оболочка HUD (#hud): окно итогов — рядом со слоем кита, не внутри (двойной zoom) */
  shell?: HTMLElement;
  /** Итоги закрыли кнопкой или Esc — сцене снова нужна мышь */
  closed?(): void;
}

interface Arrow { root: HTMLElement; disc: HTMLElement; label: HTMLElement; icon: string; text: string }

export class PirateHud {
  readonly root: HTMLElement;
  private readonly tc: PirateTop;
  /** Плашка: заголовок, подстрока, отсчёт (пусто — без него) */
  private bannerT = '';
  private bannerS = '';
  private readonly panel: HTMLElement;
  private readonly wave: HTMLElement;
  private readonly time: HTMLElement;
  private readonly shipFill: HTMLElement;
  private readonly shipVal: HTMLElement;
  private readonly have: HTMLElement;
  private readonly slots: HTMLElement[] = [];
  private readonly stolenVal: HTMLElement;
  private readonly tasks: HTMLElement;
  private tasksTouch: boolean | null = null;
  private readonly ret: HTMLElement;
  private readonly retTxt: HTMLElement;
  private readonly arrows: Arrow[] = [];
  private readonly bins = new Map<number, { s: ArrowSpec; n: number }>();
  private readonly fire: HTMLButtonElement;
  private result: ModeResults | null = null;
  private readonly cache = new Map<HTMLElement, string>();
  private lastId = '';
  private lastWave = 0;
  private bannerUntil = 0;
  private kickT = 0;
  private hitTimer: ReturnType<typeof setTimeout> | undefined;
  private resultFor = '';
  /** Итоги этого набега закрыли сами — больше не показывать */
  private closedFor = '';

  constructor(parent: HTMLElement, hooks: { fire(down: boolean): void } & PirateTop) {
    this.tc = hooks;
    // слой без zoom: прицел и стрелки привязаны к точкам экрана, увеличиваются сами (scale: --hud-k)
    this.root = el('div', 'k-world pr-hud', parent);
    this.root.hidden = true;
    this.panel = el('div', 'k-plate pr-panel', hooks.under ?? this.root);
    this.panel.hidden = true;
    const head = el('div', 'pr-head', this.panel);
    const title = el('span', 'pr-title', head);
    const flag = hooks.icon?.('pirate-flag');
    if (flag) Object.assign(el('img', 'pr-title-ic', title), { src: flag, alt: '' });
    title.append('Набег пиратов');
    this.wave = el('span', 'pr-wave', head);
    this.time = el('span', 'pr-time', head);
    const ship = el('div', 'pr-row', this.panel);
    el('span', 'pr-lab', ship, 'Корабль');
    const bar = el('div', 'pr-bar', ship);
    this.shipFill = el('i', 'pr-fill', bar);
    this.shipVal = el('b', 'pr-val', ship);
    const loot = el('div', 'pr-row', this.panel);
    el('span', 'pr-lab', loot, 'Ящики');
    this.have = el('span', 'pr-have', loot);
    el('span', 'pr-sub', loot, 'на причале · украдено');
    const slots = el('span', 'pr-slots', loot);
    for (let i = 0; i < 6; i++) this.slots.push(el('i', '', slots));
    this.stolenVal = el('b', 'pr-val', loot);
    // задачи защитника (пираты на горизонте): над подсказкой набережной — она остаётся на своём месте внизу
    this.tasks = document.createElement('div');
    this.tasks.className = 'k-plate mo-tasks pr-tasks';
    this.tasks.hidden = true;
    if (hooks.bottom) hooks.bottom.prepend(this.tasks);
    // прицел: крест кита; точка — цвет своей краски, у пушки — кольцо и пилюля перезарядки
    this.ret = el('div', 'k-cross pr-cross', this.root);
    this.ret.innerHTML = '<i></i><i></i><i></i><i></i><b class="pr-ring"></b>';
    this.ret.hidden = true;
    this.retTxt = el('span', 'k-pill k-pill--plate k-pill--xs pr-ret-txt', this.ret);
    for (let i = 0; i < ARROWS; i++) {
      const root = el('div', 'k-edge', this.root);
      root.hidden = true;
      this.arrows.push({ root, disc: el('span', 'k-edge-disc', root), label: el('span', 'k-edge-label', root), icon: '', text: '' });
    }
    this.fire = el('button', 'k-btn k-btn--stop pr-fire', this.root, 'Огонь');
    this.fire.type = 'button';
    this.fire.hidden = true;
    const press = (down: boolean) => (e: Event) => { e.preventDefault(); this.fire.classList.toggle('is-pressed', down); hooks.fire(down); };
    this.fire.addEventListener('pointerdown', press(true));
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.fire.addEventListener(ev, press(false));
    // итоги — окно кита; без оболочки (тесты) — без окна
    const shell = hooks.shell;
    if (shell) void import('../ui/kit/modes.ts').then((m) => {
      const res = new m.ModeResults(shell);
      this.result = res;
      res.scrim.classList.add('pr-scrim');
      res.onAction = () => this.closeResults();
      // Esc при свободной мыши (захват браузер снимает сам — тогда клавиша до страницы не доходит)
      window.addEventListener('keydown', (e) => {
        if (e.code !== 'Escape' || !this.resultsOpen || document.pointerLockElement) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this.closeResults();
      }, true);
    });
  }

  private text(e: HTMLElement, s: string): void {
    if (this.cache.get(e) === s) return;
    this.cache.set(e, s);
    e.textContent = s;
  }
  private cls(e: HTMLElement, name: string, on: boolean): void { e.classList.toggle(name, on); }

  /** Плашка, панель, задачи и итоги; show — защитник на набережной и видит события */
  update(v: PirateView, tick: number, show: boolean, inTransit: number, touch: boolean): void {
    const live = show && v.phase !== 'idle';
    this.root.hidden = !live;
    if (!live) { this.hideAll(); return; }
    if (v.id !== this.lastId) { this.lastId = v.id; this.lastWave = 0; this.bannerUntil = 0; this.hideResult(); }
    const secs = Math.max(0, Math.ceil((v.end - tick) / 60));
    // плашка — событие в верх-центре
    let timer = '';
    if (v.phase === 'warn') {
      this.bannerUntil = tick + 60;
      this.bannerT = 'Пираты на горизонте!';
      this.bannerS = `высадка через ${secs} с — к причалу`;
      timer = mmss(secs);
    } else if (v.phase === 'raid') {
      if (v.wave !== this.lastWave) {
        this.lastWave = v.wave;
        this.bannerUntil = tick + (v.wave === 1 ? 4.2 : 3) * 60;
        this.bannerT = v.wave >= PIRATE_WAVES ? 'Последняя волна!' : v.wave === 1 ? 'Высадка!' : `Волна ${v.wave} из ${v.waves}`;
        this.bannerS = v.wave >= PIRATE_WAVES ? 'С ними капитан — красьте крепче' : 'Шлюпки идут к причалам — смотри на кольца';
      }
    }
    if (tick < this.bannerUntil && v.phase !== 'end') this.showBanner(timer, secs <= 10, v.phase === 'warn' && v.end > v.start ? (v.end - tick) / (v.end - v.start) : -1);
    else this.tc.top?.clear(KEY);
    // задачи защитника — пока пираты на горизонте
    this.tasks.hidden = v.phase !== 'warn';
    if (v.phase === 'warn' && this.tasksTouch !== touch) this.paintTasks(touch);
    // панель
    this.panel.hidden = v.phase !== 'raid'; // в конце всё то же — в окне итогов
    if (v.phase === 'raid' || v.phase === 'end') {
      this.text(this.wave, `волна ${Math.max(1, v.wave)}/${v.waves}`);
      this.text(this.time, v.phase === 'raid' ? mmss(secs) : '');
      const hp = Math.max(0, v.hp), pct = v.hpMax > 0 ? hp / v.hpMax : 0;
      this.shipFill.style.width = `${Math.round(pct * 100)}%`;
      this.cls(this.shipFill, 'low', pct <= 0.34);
      this.text(this.shipVal, `${hp}/${v.hpMax}`);
      this.text(this.have, String(v.left));
      for (let i = 0; i < this.slots.length; i++) {
        this.cls(this.slots[i], 'on', i < v.stolen);
        this.cls(this.slots[i], 'warn', i >= v.stolen && i < v.stolen + Math.min(inTransit, 6 - v.stolen));
      }
      this.text(this.stolenVal, `${Math.min(v.stolen, v.limit)}/${v.limit}`);
    }
    this.fire.hidden = !(touch && v.phase === 'raid');
    // итоги: всё время фазы конца (PIRATE_END), пока их не закрыли
    if (v.phase === 'end' && this.closedFor !== v.id) {
      this.showResult(v);
      this.result?.note(`Табличка закроется через ${secs} с`, Math.max(0, Math.min(1, (v.end - tick) / PIRATE_END)));
    } else if (v.phase !== 'end') this.hideResult();
  }

  private showBanner(timer: string, hurry: boolean, frac: number): void {
    const src = this.tc.icon?.('pirate-flag') ?? '';
    this.tc.top?.event({
      key: KEY, prio: PRIO.pirates, tone: 'danger', lamp: true,
      html: `<span class="k-event-ic"><img src="${src}" alt=""></span><div class="k-event-title">${escHtml(this.bannerT)}</div><div class="k-event-sub">${escHtml(this.bannerS)}</div>${timer ? `<div class="k-event-timer${hurry ? ' is-hurry' : ''}">${timer}</div>` : ''}${frac >= 0 ? meterHtml(Math.round(frac * 50) / 50, 'bad') : ''}`,
    });
  }

  /** Три задачи защитника: краска по ворам, ядро по шлюпкам, ящик — коснуться (на телефоне — «Огонь» вместо ЛКМ) */
  private paintTasks(touch: boolean): void {
    this.tasksTouch = touch;
    const loot = this.tc.icon?.('loot') ?? '';
    const fire = touch ? '<kbd class="k-key k-key--wide">Огонь</kbd>' : `<kbd class="k-key">${LMB}</kbd>`;
    const cannon = touch ? '<kbd class="k-key k-key--wide">пушка · Огонь</kbd>' : `<kbd class="k-key k-key--wide">пушка ${LMB}</kbd>`;
    this.tasks.innerHTML = `<div class="mo-task">${fire}<span><b>Крась воров</b> с ящиками</span></div>
      <div class="mo-task">${cannon}<span><b>Ядром</b> по шлюпкам</span></div>
      <div class="mo-task"><kbd class="k-key">${loot ? `<img class="mo-task-ic" src="${loot}" alt="">` : ''}</kbd><span><b>Коснись ящика</b> — спасёшь</span></div>`;
  }

  /** Всё спрятать: плашку, панель набега и задачи (они в общих слотах кита, не в root), прицел, стрелки, итоги */
  hideAll(): void {
    this.tc.top?.clear(KEY);
    this.panel.hidden = true;
    this.tasks.hidden = true;
    this.ret.hidden = true;
    this.fire.hidden = true;
    for (const a of this.arrows) a.root.hidden = true;
    this.hideResult();
  }

  /** Окно итогов открыто (мышь сцене в это время не нужна — его закрывают кнопкой или Esc) */
  get resultsOpen(): boolean { return !!this.result?.shown; }

  /** Закрыть итоги кнопкой или Esc: до следующего набега не показывать */
  closeResults(): void {
    if (!this.resultsOpen) return;
    this.closedFor = this.resultFor;
    this.hideResult();
    this.tc.closed?.();
  }

  private hideResult(): void {
    this.resultFor = '';
    this.result?.hide();
  }

  private showResult(v: PirateView): void {
    if (this.resultFor === v.id || !this.result) return;
    this.resultFor = v.id;
    const mine = v.results.find((x) => x.pid === this.mePid);
    // «Попадания» — все попадания (краска, шлюпки, корабль): так их и считает сервер, по жетону за каждое
    const rows = v.results.map((row) => ({
      own: row.pid === this.mePid,
      cells: [
        `<span class="k-who">${esc(row.nick)}${row.mvp ? ' <span class="k-pill k-pill--gold k-pill--sm">лучший защитник</span>' : ''}</span>`,
        String(row.kos), String(row.sinks), String(row.hits), String(row.saves), `+${row.tokens}`,
      ],
    }));
    this.result.show({
      mode: 'pirates',
      eyebrow: 'Набег пиратов',
      title: v.win ? 'Набег отбит!' : 'Пираты ушли с добычей',
      lose: !v.win,
      sub: esc(v.win ? `Украдено ${v.stolen} из ${v.total}. Корабль уходит ни с чем.` : `Украдено ${v.stolen} из ${v.total}. В следующий раз получится!`),
      head: ['Защитник', 'Пираты', 'Шлюпки', 'Попадания', 'Ящики', coinHtml()],
      rightFrom: 1,
      rows,
      body: rows.length ? undefined : '<p class="pr-nobody">Никто не защищал — наград нет. Красьте воров ЛКМ и топите шлюпки из пушек!</p>',
      reward: mine ? `+${mine.tokens} жетонов${mine.mvp ? ' · лучший защитник' : ''}` : '',
      actions: [{ id: 'close', label: 'Закрыть', key: 'Esc', tone: 'ghost' }],
    });
  }

  /** Свой pid — подсветить себя в таблице */
  mePid = 0;

  /** Прицел: маркер / пушка / нет */
  reticle(s: ReticleSpec, dt: number): void {
    const on = s.mode !== 'off';
    this.ret.hidden = !on;
    this.cls(this.ret, 'is-cannon', s.mode === 'cannon');
    for (const k of ['good', 'wait', 'bad'] as const) this.cls(this.ret, `is-${k}`, s.state === k && s.mode === 'cannon');
    // цвет своей краски — это подсказка игры (чей шарик), поэтому не токен кита
    if (on) this.ret.style.setProperty('--pr-c', s.mode === 'marker' ? hex(paintOf(s.slot)) : '#ffffff');
    this.text(this.retTxt, s.text);
    this.retTxt.hidden = s.mode !== 'cannon' || !s.text;
    if (this.kickT > 0) { this.kickT -= dt; if (this.kickT <= 0) this.ret.classList.remove('is-kick'); }
  }

  /** Выстрел маркером: прицел вздрагивает */
  kick(): void { this.kickT = 0.1; this.ret.classList.add('is-kick'); }

  /** Отметка попадания: косой крестик; ko — золотом */
  hitmark(ko: boolean): void {
    const r = this.ret;
    r.classList.remove('is-hit', 'is-head');
    void r.offsetWidth;
    r.classList.add(ko ? 'is-head' : 'is-hit');
    clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => r.classList.remove('is-hit', 'is-head'), ko ? 380 : 240);
  }

  /**
   * Стрелки к угрозам: список (не больше ARROWS; уже по важности — ближние воры и ящики первыми), остальные прячутся.
   * Место — по углу, на эллипсе у края экрана; угрозы в одной стороне — одной стрелкой «ящик ×3» (как в крепости)
   */
  setArrows(list: readonly ArrowSpec[]): void {
    const w = this.width, h = this.height;
    const k = list.length ? Number(document.documentElement?.style.getPropertyValue('--hud-k')) || 1 : 1;
    this.bins.clear();
    for (const s of list) {
      const bin = Math.round(s.angle / ARROW_BIN);
      const b = this.bins.get(bin);
      if (!b) this.bins.set(bin, { s, n: 1 });
      else if (b.s.kind === s.kind) b.n++;
    }
    let i = 0;
    for (const { s, n } of this.bins.values()) {
      if (i >= this.arrows.length) break;
      const a = this.arrows[i++];
      // по эллипсу внутри экрана: углы (бейдж, чат, эмоции) и верх с плашкой события свободны
      const x = w / 2 + Math.cos(s.angle) * (w / 2 - EDGE * k);
      const y = h / 2 + Math.sin(s.angle) * (h / 2) * 0.62;
      const icon = this.tc.icon?.(ARROW_ICON[s.kind]) ?? '';
      if (icon !== a.icon) {
        a.icon = icon;
        a.disc.innerHTML = icon ? `<img src="${icon}" alt="">` : '';
      }
      const text = `${ARROW_TEXT[s.kind]}${n > 1 ? ` ×${n}` : ''}${s.label ? ` · <b>${esc(s.label)} м</b>` : ''}`;
      if (text !== a.text) {
        a.text = text;
        a.label.innerHTML = text;
      }
      const side = x < w * 0.3 ? ' k-edge--left' : x > w * 0.7 ? ' k-edge--right' : y > h * 0.6 ? ' k-edge--up' : '';
      a.root.className = `k-edge k-edge--${ARROW_TONE[s.kind]}${side}${s.kind === 'thief' ? ' is-hot' : ''}`;
      a.root.style.left = `${Math.round(x)}px`;
      a.root.style.top = `${Math.round(y)}px`;
      a.root.style.setProperty('--a', `${Math.round((s.angle * 180) / Math.PI)}deg`);
      a.root.hidden = false;
    }
    for (; i < this.arrows.length; i++) this.arrows[i].root.hidden = true;
  }

  /** Размер области для стрелок, px */
  get width(): number { return this.root.clientWidth || window.innerWidth; }
  get height(): number { return this.root.clientHeight || window.innerHeight; }

  dispose(): void { this.tc.top?.clear(KEY); this.panel.remove(); this.tasks.remove(); this.result?.scrim.remove(); this.root.remove(); }
}
