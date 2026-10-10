// «Подземелье»: DOM-интерфейс поверх сцены — HUD волны, передышка, карточки уровня, сундук-барабан, пауза (со звуком),
// итоги, баннеры, стрелки к целям, радар, загрузка и заглушка телефона.
// Раскладка HUD: слева сверху — радар; сверху по центру — волна (или босс); справа сверху — убито и пауза; снизу по
// центру — здоровье, уровень и опыт над кнопками рывка и Q; левее них — оружия с кольцом перезарядки; слева снизу —
// пассивки. Цвета, рамки, скругления и тени — переменные `--dg-*` в dungeon.css (тему можно заменить целиком).
// Ничего не решает сам: сцена каждый кадр отдаёт HudFrame, экраны открывает вызовами, клики уходят в HudActions.
// Кадр не пересобирает DOM: элементы созданы один раз, текст и стили меняются, только когда меняется значение.
import './dungeon.css';
import { PASSIVES, WEAPONS } from './data.ts';
import { dgIcon, type DgIconKind } from './icons.ts';
import { dgPrefs, onDgPrefs, setDgPref } from './prefs.ts';
import type {
  DungeonHudApi,
  HudActions,
  HudArrow,
  HudBannerStyle,
  HudBuff,
  HudCards,
  HudChest,
  HudFrame,
  HudItem,
  HudPoiKind,
  HudRadar,
  HudResults,
} from './hudtypes.ts';

const REEL_LEN = 16;
const BANNER_MS = 2800;
const SVGNS = 'http://www.w3.org/2000/svg';
/** Кольцо перезарядки: окружность r = 46 в квадрате 100 × 100 */
const RING_C = 2 * Math.PI * 46;
const WEAPON_SLOTS = 5;

/** Точки интереса: подпись, значок-заглушка (пока нет картинки), категория (цвет рамки) */
const POI: Record<HudPoiKind, { name: string; emoji: string; cat: 'danger' | 'loot' | 'heal' | 'power' | 'tool'; ic: [DgIconKind, string][] }> = {
  boss: { name: 'Босс', emoji: '🐛', cat: 'danger', ic: [['poi', 'boss'], ['mob', 'povidl']] },
  elite: { name: 'Элита', emoji: '👹', cat: 'danger', ic: [['poi', 'elite']] },
  chest: { name: 'Сундук', emoji: '🎁', cat: 'loot', ic: [['poi', 'chest'], ['pickup', 'chest']] },
  cursed: { name: 'Проклятый сундук', emoji: '⛓', cat: 'loot', ic: [['poi', 'cursedChest']] },
  spring: { name: 'Родник', emoji: '💧', cat: 'heal', ic: [['poi', 'spring']] },
  altar: { name: 'Алтарь', emoji: '✨', cat: 'power', ic: [['poi', 'altar']] },
  forge: { name: 'Кузня', emoji: '⚒', cat: 'power', ic: [['poi', 'forge']] },
  cart: { name: 'Вагонетка', emoji: '🛤', cat: 'tool', ic: [['poi', 'minecart']] },
  lamp: { name: 'Фонарь-маяк', emoji: '💡', cat: 'tool', ic: [['poi', 'lamppost']] },
  keg: { name: 'Бочки', emoji: '💥', cat: 'tool', ic: [['poi', 'powderKegs']] },
  tramp: { name: 'Гриб-батут', emoji: '🍄', cat: 'tool', ic: [['poi', 'trampoline']] },
  brazier: { name: 'Жаровня', emoji: '🔥', cat: 'tool', ic: [['poi', 'brazier']] },
};

function poiIcon(kind: HudPoiKind): string | null {
  for (const [k, id] of POI[kind].ic) {
    const u = dgIcon(k, id);
    if (u) return u;
  }
  return null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

/** Значок: картинка из client/assets/dungeon/icons (dgIcon) или эмодзи, пока картинки нет */
function ico(kind: DgIconKind, id: string | undefined, emoji: string, cls = ''): HTMLElement {
  const url = id ? dgIcon(kind, id) : null;
  if (url) {
    const im = el('img', `dg-ic ${cls}`);
    im.src = url;
    im.alt = '';
    im.draggable = false;
    return im;
  }
  return el('span', `dg-ic emo ${cls}`, emoji);
}

function itemKind(it: HudItem, row: 'weapon' | 'passive'): DgIconKind {
  return it.evo ? 'evo' : row;
}

function kbd(key: string): HTMLElement {
  return el('kbd', '', key);
}

function button(cls: string, label: string, key: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', `dg-btn ${cls}`);
  b.type = 'button';
  b.append(el('span', 'dg-btn-label', label));
  if (key) b.append(kbd(key));
  b.addEventListener('click', onClick);
  return b;
}

function svgRing(cls: string): { svg: SVGSVGElement; fg: SVGCircleElement } {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', cls);
  const bg = document.createElementNS(SVGNS, 'circle');
  const fg = document.createElementNS(SVGNS, 'circle');
  for (const c of [bg, fg]) {
    c.setAttribute('cx', '50');
    c.setAttribute('cy', '50');
    c.setAttribute('r', '46');
  }
  bg.setAttribute('class', 'bg');
  fg.setAttribute('class', 'fg');
  fg.setAttribute('stroke-dasharray', RING_C.toFixed(2));
  fg.setAttribute('stroke-dashoffset', '0');
  svg.append(bg, fg);
  return { svg, fg };
}

function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

/** «1 волну», «2 волны», «5 волн» (винительный: «отбил», «засчитать») */
const wavesWord = (n: number): string => `${n} ${plural(n, 'волну', 'волны', 'волн')}`;

/** 0:41, 18:32, 1:02:05 */
function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Секунды до готовности: «2.4», «12» */
const secs = (s: number): string => (s <= 0 ? '' : s < 10 ? s.toFixed(1) : String(Math.ceil(s)));

const clamp01 = (v: number): number => (v > 1 ? 1 : v < 0 ? 0 : v);
/** Доля для полосы: шаг 1/500, чтобы не трогать стиль из-за дрожи в шестом знаке */
const q01 = (v: number): number => Math.round(clamp01(v) * 500) / 500;

/** Отметки уровня: max точек, заполнено lv */
function pips(n: number, lv: number): HTMLElement {
  const box = el('div', 'dg-pips');
  for (let i = 0; i < n; i++) box.append(el('i', i < lv ? 'on' : ''));
  return box;
}

/** Ячейка вещи (пассивки в HUD, сборка в итогах) */
function fillItem(cell: HTMLElement, it: HudItem | undefined, row: 'weapon' | 'passive'): void {
  cell.className = `dg-item${it ? '' : ' empty'}${it?.evo ? ' evo' : ''}${it && !it.evo && it.lv >= it.max ? ' max' : ''}`;
  cell.textContent = '';
  if (!it) return;
  cell.title = it.evo ? `${it.name} — эволюция` : `${it.name} · ур. ${it.lv} из ${it.max}`;
  cell.append(ico(itemKind(it, row), it.id, it.icon, 'dg-item-ic'));
  if (it.evo) cell.append(el('b', 'dg-item-star', '★'));
  else cell.append(pips(it.max, it.lv));
}

interface Ring {
  root: HTMLElement;
  fg: SVGCircleElement;
  sec: HTMLElement;
  lab: HTMLElement;
  p: number;
  cls: string;
  s: string;
  label: string;
  /** подпись по умолчанию (клавиша + действие) */
  base: string;
}

interface WSlot {
  root: HTMLElement;
  fg: SVGCircleElement;
  body: HTMLElement;
  sig: string;
  p: number;
  fires: number;
  lv: number;
}

interface ArrowEl {
  root: HTMLElement;
  tip: HTMLElement;
  dist: HTMLElement;
  /** показанное место (плавно догоняет нужное) */
  x: number;
  y: number;
  tx: number;
  ty: number;
  d: number;
  /** когда пропала цель (мс) — ещё 300 мс гаснет, потом удаляется; 0 — жива */
  goneAt: number;
}

export class DungeonHud implements DungeonHudApi {
  private readonly root = el('div', 'dg');
  private readonly last = new Map<string, unknown>();
  private _banMode = false;
  private bannerTimer = 0;
  private flashTimer = 0;

  // --- HUD волны
  private readonly hud = el('div', 'dg-hud');
  private readonly vitals = el('div', 'dg-vitals');
  private readonly lv = el('div', 'dg-lv');
  private readonly lvN = el('b', 'dg-lv-n');
  private readonly xpFill = el('i', 'dg-xp-fill');
  private readonly hp = el('div', 'dg-hp');
  private readonly hpFill = el('i', 'dg-hp-fill');
  private readonly hpTrail = el('i', 'dg-hp-trail');
  private readonly hpText = el('span', 'dg-hp-text');
  private hpLast = -1;
  private readonly buffs = el('div', 'dg-buffs');
  private readonly buffEls = new Map<string, { root: HTMLElement; sec: HTMLElement; bar: HTMLElement }>();
  private readonly waveTitle = el('div', 'dg-wave-title');
  private readonly squadFill = el('i', 'dg-squad-fill');
  private readonly timer = el('span', 'dg-timer');
  private readonly leftover = el('span', 'dg-leftover');
  private readonly toasts = el('div', 'dg-toasts');
  private readonly toastEls = new Map<string, { root: HTMLElement; timer: number }>();
  private readonly bossName = el('div', 'dg-boss-name');
  private readonly bossFill = el('i', 'dg-boss-fill');
  private readonly bossMarks = el('div', 'dg-boss-marks');
  private readonly kills = el('span', 'dg-kills-n');
  private readonly weapRow = el('div', 'dg-weapons');
  private readonly wslots: WSlot[] = [];
  private readonly passiveRow = el('div', 'dg-items');
  private readonly dash: Ring;
  private readonly strike: Ring;
  /** Телефон: кнопка Q справа у большого пальца (на компьютере скрыта в CSS) */
  private readonly qPad: Ring;

  // --- радар
  private readonly radarBox = el('div', 'dg-radar');
  private readonly radarCv = el('canvas', 'dg-radar-cv');
  private readonly radarCtx: CanvasRenderingContext2D | null;
  private readonly radarImg = new Map<HudPoiKind, HTMLImageElement | null>();

  // --- передышка
  private readonly breather = el('div', 'dg-breather');
  private readonly brTitle = el('div', 'dg-br-title');
  private readonly brNext = el('div', 'dg-br-next');
  private readonly brMobs = el('div', 'dg-br-mobs');
  private readonly brEvent = el('div', 'dg-br-event');

  // --- экраны
  private readonly cardsLayer = el('div', 'dg-layer dg-cards-layer');
  private readonly chestLayer = el('div', 'dg-layer dg-chest-layer');
  private readonly pauseLayer = el('div', 'dg-layer dg-pause-layer');
  private readonly resultsLayer = el('div', 'dg-layer dg-results-layer');
  private readonly pauseQuit: HTMLButtonElement;
  private readonly sndAll: HTMLButtonElement;
  private readonly sndXp: HTMLButtonElement;
  private cardsData: HudCards | null = null;
  private readonly cardBtns: HTMLButtonElement[] = [];
  private readonly rerollBtn: HTMLButtonElement;
  private readonly banBtn: HTMLButtonElement;
  private readonly cardsRow = el('div', 'dg-cards');
  private readonly cardsHead = el('div', 'dg-cards-head');

  // --- разное
  private readonly bannerEl = el('div', 'dg-banner');
  private readonly bannerTitle = el('div', 'dg-banner-title');
  private readonly bannerSub = el('div', 'dg-banner-sub');
  private readonly flash = el('div', 'dg-lvflash');
  private readonly arrowLayer = el('div', 'dg-arrows');
  private readonly arrowEls = new Map<string, ArrowEl>();
  private arrowAt = 0;
  /** рамка стрелок: края радара и верх нижнего HUD (перемеряются 2 раза в секунду, не каждый кадр) */
  private edgeAt = 0;
  private readonly edge = { rx: 0, ry: 0, bottom: 0 };
  private readonly loadLayer = el('div', 'dg-loading');
  private readonly loadFill = el('i', 'dg-load-fill');
  private readonly phoneLayer = el('div', 'dg-phone');
  private readonly offPrefs: () => void;

  private readonly act: HudActions;

  constructor(parent: HTMLElement, act: HudActions) {
    this.act = act;
    const r = this.root;
    r.append(el('div', 'dg-vignette'), el('div', 'dg-alarm'), el('div', 'dg-low'));

    // слева сверху: радар
    this.radarCtx = this.radarCv.getContext('2d');
    this.radarBox.append(this.radarCv);

    // по центру сверху: волна (или босс)
    const tc = el('div', 'dg-tc');
    const squad = el('div', 'dg-squad');
    squad.append(this.squadFill);
    const waveRow = el('div', 'dg-wave-row');
    waveRow.append(squad, this.timer, this.leftover);
    const wave = el('div', 'dg-wave');
    wave.append(this.waveTitle, waveRow);
    const bossBar = el('div', 'dg-boss-bar');
    bossBar.append(this.bossFill, this.bossMarks);
    const boss = el('div', 'dg-boss');
    boss.append(this.bossName, bossBar);
    tc.append(wave, boss, this.toasts);

    // справа сверху (под жетонами игры): убито и пауза
    const tr = el('div', 'dg-tr');
    const killPill = el('div', 'dg-kills');
    killPill.title = 'Убито';
    killPill.append(ico('ui', 'kills', '💀', 'dg-kills-ic'), this.kills);
    const pauseBtn = el('button', 'dg-pause-btn');
    pauseBtn.type = 'button';
    pauseBtn.title = 'Пауза и звук';
    pauseBtn.append(el('span', '', '⏸'), kbd('Esc'));
    pauseBtn.addEventListener('click', () => this.act.pause());
    tr.append(killPill, pauseBtn);

    // снизу по центру: баффы, уровень, здоровье и опыт — над рывком и ударом
    this.hp.append(this.hpTrail, this.hpFill, this.hpText);
    const xp = el('div', 'dg-xp');
    xp.append(this.xpFill);
    const bars = el('div', 'dg-bars');
    bars.append(this.hp, xp);
    this.lv.title = 'Уровень';
    this.lv.append(el('small', '', 'ур.'), this.lvN);
    const vrow = el('div', 'dg-vrow');
    vrow.append(this.lv, bars);
    this.vitals.append(this.buffs, vrow);

    // левее кнопок: оружия с перезарядкой
    for (let i = 0; i < WEAPON_SLOTS; i++) this.weapRow.append(this.wslot().root);

    // слева снизу: пассивки
    const bl = el('div', 'dg-bl');
    bl.append(this.passiveRow);

    // снизу по центру: рывок и удар
    const bc = el('div', 'dg-bc');
    this.dash = this.ring('dash', ['active', 'dash'], '💨', 'Пробел', 'Рывок');
    this.strike = this.ring('strike', ['active', 'strike'], '🏮', 'Q', 'Удар');
    bc.append(this.dash.root, this.strike.root);
    this.qPad = this.ring('strike dg-qpad', ['active', 'strike'], '🏮', '', 'удар');
    this.bindQPad(this.qPad.root);

    this.hud.append(this.radarBox, tc, tr, bl, this.weapRow, this.vitals, bc, this.qPad.root);
    r.append(this.hud, this.arrowLayer);

    // передышка
    const go = button('green dg-go', 'В бой', 'Enter', () => this.act.go());
    (go.querySelector('.dg-btn-label') as HTMLElement).textContent = 'В бой';
    this.breather.append(this.brTitle, this.brNext, this.brMobs, this.brEvent, go);
    r.append(this.breather);

    // баннер и звезда уровня
    this.bannerEl.append(this.bannerTitle, this.bannerSub);
    r.append(this.bannerEl, this.flash);

    // карточки
    this.rerollBtn = button('cream', '', '', () => this.act.reroll());
    this.banBtn = button('cream dg-ban-btn', '', '', () => this.setBanMode(!this._banMode));
    this.rerollBtn.prepend(ico('ui', 'reroll', '🎲', 'dg-btn-ic'));
    this.banBtn.prepend(ico('ui', 'banish', '🚫', 'dg-btn-ic'));
    const cardsFoot = el('div', 'dg-cards-foot');
    cardsFoot.append(this.rerollBtn, this.banBtn);
    this.cardsLayer.append(this.cardsHead, this.cardsRow, cardsFoot);

    // пауза: продолжить, выйти, звук режима (сохраняется в этом браузере)
    const pauseWin = el('div', 'dg-window dg-pause');
    const pauseActs = el('div', 'dg-actions');
    this.pauseQuit = button('red', 'Выйти', '', () => this.act.quit());
    pauseActs.append(button('green', 'Продолжить', 'Esc', () => this.act.resume()), this.pauseQuit);
    this.sndAll = this.toggle('🔊', 'Звуки подземелья', () => setDgPref('sound', !dgPrefs().sound));
    this.sndXp = this.toggle('✨', 'Звук подбора опыта', () => setDgPref('xp', !dgPrefs().xp));
    const snd = el('div', 'dg-sound');
    snd.append(el('div', 'dg-sound-title', 'Звук'), this.sndAll, this.sndXp);
    pauseWin.append(el('h2', '', 'Пауза'), pauseActs, snd);
    this.pauseLayer.append(pauseWin);
    this.syncPrefs();
    this.offPrefs = onDgPrefs(() => this.syncPrefs());

    // загрузка и телефон
    const loadBar = el('div', 'dg-load-bar');
    loadBar.append(this.loadFill);
    this.loadLayer.append(el('div', 'dg-load-title', 'Спускаемся в подземелье…'), loadBar);
    const phoneWin = el('div', 'dg-window dg-phone-win');
    phoneWin.append(
      el('p', '', 'На телефоне Подземелье пока нельзя — зайди с компьютера'),
      button('cream', 'На набережную', '', () => this.act.toLobby()),
    );
    this.phoneLayer.append(phoneWin);

    r.append(this.cardsLayer, this.chestLayer, this.pauseLayer, this.resultsLayer, this.loadLayer, this.phoneLayer);
    parent.append(r);
  }

  get banMode(): boolean {
    return this._banMode;
  }

  setBanMode(on: boolean): void {
    const next = on && !!this.cardsData && this.cardsData.banishes > 0;
    if (next === this._banMode) return;
    this._banMode = next;
    this.cardsLayer.classList.toggle('ban', next);
    this.banBtn.setAttribute('aria-pressed', String(next));
    for (const b of this.cardBtns) b.querySelector('.dg-card-ban')?.classList.toggle('hidden', !next);
  }

  setVisible(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
  }

  dispose(): void {
    clearTimeout(this.bannerTimer);
    clearTimeout(this.flashTimer);
    this.offPrefs();
    this.root.remove();
  }

  /** true, если значение по ключу изменилось (и запоминает новое) */
  private diff(key: string, v: unknown): boolean {
    if (this.last.get(key) === v) return false;
    this.last.set(key, v);
    return true;
  }

  private text(key: string, node: HTMLElement, v: string): void {
    if (this.diff(key, v)) node.textContent = v;
  }

  private bar(key: string, node: HTMLElement, v: number): void {
    const q = q01(v);
    if (this.diff(key, q)) node.style.transform = `scaleX(${q})`;
  }

  private flag(key: string, node: HTMLElement, cls: string, on: boolean): void {
    if (this.diff(key, on)) node.classList.toggle(cls, on);
  }

  private toggle(icon: string, label: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', 'dg-toggle');
    b.type = 'button';
    b.append(el('span', 'dg-toggle-ic', icon), el('span', 'dg-toggle-label', label), el('span', 'dg-toggle-state'), el('i', 'dg-switch'));
    b.addEventListener('click', onClick);
    return b;
  }

  private syncPrefs(): void {
    const p = dgPrefs();
    for (const [b, on, dis] of [[this.sndAll, p.sound, false], [this.sndXp, p.xp, !p.sound]] as const) {
      b.setAttribute('aria-pressed', String(on));
      b.disabled = dis;
      (b.querySelector('.dg-toggle-state') as HTMLElement).textContent = on ? 'Вкл' : 'Выкл';
    }
  }

  private ring(cls: string, icon: [DgIconKind, string], emoji: string, key: string, label: string): Ring {
    const root = el('div', `dg-ring ${cls}`);
    const disc = el('div', 'dg-ring-disc');
    const { svg, fg } = svgRing('dg-ring-svg');
    const sec = el('span', 'dg-ring-sec');
    disc.append(svg, ico(icon[0], icon[1], emoji, 'dg-ring-ic'), sec);
    const lab = el('div', 'dg-ring-label');
    root.append(disc, lab);
    const r: Ring = { root, fg, sec, lab, p: -1, cls: '', s: '', label: '', base: label };
    // клавиша — значком на углу кольца, под кольцом — только короткая подпись (не налезает на соседа)
    if (key) disc.append(kbd(key));
    lab.append(el('span', 'dg-ring-text', label));
    return r;
  }

  /** Кнопка Q пальцем: держишь — заряд, отпустил — удар (как клавиша Q); палец съехал или окно закрыло кнопку — отпущено */
  private bindQPad(node: HTMLElement): void {
    let id = -1;
    const up = (): void => {
      if (id < 0) return;
      id = -1;
      node.classList.remove('down');
      this.act.q(false);
    };
    node.addEventListener('pointerdown', (e) => {
      if (id >= 0) return;
      e.preventDefault();
      id = e.pointerId;
      try {
        node.setPointerCapture(id);
      } catch {
        // палец уже убрали
      }
      node.classList.add('down');
      this.act.q(true);
    });
    node.addEventListener('pointerup', (e) => e.pointerId === id && up());
    node.addEventListener('pointercancel', (e) => e.pointerId === id && up());
    node.addEventListener('lostpointercapture', (e) => e.pointerId === id && up());
    node.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Кольцо рывка или Q: p — заполнение, state — ready/charge/full, left — секунд до готовности, label — подпись */
  private setRing(r: Ring, p: number, state: string, left: number, label: string): void {
    const q = Math.round(clamp01(p) * 200) / 200;
    if (q !== r.p) {
      r.p = q;
      r.fg.setAttribute('stroke-dashoffset', (RING_C * (1 - q)).toFixed(1));
    }
    if (state !== r.cls) {
      const becameReady = state === 'ready' && r.cls === '';
      if (r.cls) r.root.classList.remove(r.cls);
      if (state) r.root.classList.add(state);
      r.cls = state;
      // готово — короткий «блик» (щелчок играет звук сцены)
      if (becameReady) r.root.querySelector('.dg-ring-disc')?.animate([{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1.4)' });
    }
    const s = secs(left);
    if (s !== r.s) {
      r.s = s;
      r.sec.textContent = s;
    }
    if (label !== r.label) {
      r.label = label;
      const t = r.lab.querySelector('.dg-ring-text');
      if (t) t.textContent = label;
    }
  }

  private wslot(): WSlot {
    const root = el('div', 'dg-wslot empty');
    const { svg, fg } = svgRing('dg-wslot-svg');
    const body = el('div', 'dg-wslot-body');
    root.append(svg, body);
    const s: WSlot = { root, fg, body, sig: '', p: -1, fires: 0, lv: 0 };
    this.wslots.push(s);
    return s;
  }

  // ------------------------------------------------------------------ кадр

  frame(f: HudFrame, _now: number): void {
    const r = this.root;
    if (this.diff('stage', f.stage)) r.dataset.stage = f.stage;
    this.flag('alarm', r, 'alarm', f.alarm);
    this.flag('low', r, 'low', f.lowHp);

    // уровень, опыт и здоровье
    this.bar('xp', this.xpFill, f.xp01);
    this.text('lv', this.lvN, String(f.level));
    this.updateHp(f.hp, f.hpMax);
    this.updateBuffs(f.buffs);

    // волна или босс
    this.flag('boss', r, 'has-boss', !!f.boss);
    if (f.boss) {
      this.text('bossName', this.bossName, f.boss.name);
      this.bar('bossHp', this.bossFill, f.boss.hp01);
      const marks = f.boss.marks.join(',');
      if (this.diff('bossMarks', marks)) {
        this.bossMarks.textContent = '';
        for (const m of f.boss.marks) {
          const t = el('i');
          t.style.left = `${clamp01(m) * 100}%`;
          this.bossMarks.append(t);
        }
      }
    } else {
      this.text('wave', this.waveTitle, `Волна ${f.wave}`);
      this.bar('squad', this.squadFill, f.squadTotal > 0 ? f.squadLeft / f.squadTotal : 0);
      this.text('timer', this.timer, f.timeLeft < 0 ? '' : clock(Math.ceil(f.timeLeft)));
    }
    const old = f.old ?? 0;
    this.flag('lo', this.leftover, 'on', old > 0);
    if (old > 0) this.text('loT', this.leftover, `+${old} с прошлых волн`);
    this.flag('bossRage', r, 'boss-rage', !!f.boss?.rage);

    this.text('kills', this.kills, String(f.kills));
    this.updateWeapons(f.weapons);
    this.updateItems('p', this.passiveRow, f.passives, f.passiveSlots);

    this.setRing(this.dash, f.dash01, f.dash01 >= 1 ? 'ready' : '', f.dash01 >= 1 ? 0 : f.dashLeft, 'Рывок');
    for (const ring of [this.strike, this.qPad]) {
      const pad = ring === this.qPad;
      if (f.qCharge >= 0) this.setRing(ring, f.qCharge, f.qCharge >= 1 ? 'full' : 'charge', 0, f.qCharge >= 1 ? (pad ? 'отпусти!' : 'Отпусти!') : pad ? 'заряд…' : 'Заряд…');
      else this.setRing(ring, f.q01, f.q01 >= 1 ? 'ready' : '', f.q01 >= 1 ? 0 : f.qLeft, ring.base);
    }

    this.updateBreather(f.breather);
  }

  /** Здоровье: урон — полоса сразу, «призрак» догоняет с задержкой и вспышка; лечение — полоса плавно растёт */
  private updateHp(hp: number, hpMax: number): void {
    const q = q01(hp / Math.max(1, hpMax));
    if (q !== this.hpLast) {
      const hurt = this.hpLast >= 0 && q < this.hpLast;
      const heal = this.hpLast >= 0 && q > this.hpLast;
      this.hp.classList.toggle('heal', heal);
      this.hpFill.style.transform = `scaleX(${q})`;
      this.hpTrail.style.transform = `scaleX(${q})`;
      if (hurt && this.hpLast - q > 0.015) this.hp.animate([{ filter: 'brightness(1.9)' }, { filter: 'none' }], { duration: 220, easing: 'ease-out' });
      this.hpLast = q;
    }
    this.text('hpText', this.hpText, `${Math.max(0, Math.ceil(hp))} / ${Math.round(hpMax)}`);
  }

  private updateBuffs(list: HudBuff[]): void {
    const seen = new Set<string>();
    for (const b of list) {
      seen.add(b.id);
      let e = this.buffEls.get(b.id);
      if (!e) {
        const root = el('div', 'dg-buff');
        root.title = b.name;
        const sec = el('span', 'dg-buff-sec');
        const track = el('div', 'dg-buff-track');
        const bar = el('i');
        track.append(bar);
        root.append(ico('ui', b.id, b.icon, 'dg-buff-ic'), el('span', 'dg-buff-name', b.name), sec, track);
        this.buffs.append(root);
        e = { root, sec, bar };
        this.buffEls.set(b.id, e);
      }
      this.text(`bs:${b.id}`, e.sec, String(Math.max(0, Math.ceil(b.left))));
      this.bar(`bb:${b.id}`, e.bar, b.total > 0 ? b.left / b.total : 0);
    }
    for (const [id, e] of this.buffEls) {
      if (seen.has(id)) continue;
      e.root.remove();
      this.buffEls.delete(id);
      this.last.delete(`bs:${id}`);
      this.last.delete(`bb:${id}`);
    }
  }

  /** Оружия: значок, кольцо перезарядки (выстрел — вспышка), отметки уровня, «готова эволюция» и «нужна пассивка» */
  private updateWeapons(items: HudItem[]): void {
    for (let i = 0; i < this.wslots.length; i++) {
      const s = this.wslots[i];
      const it = items[i];
      const sig = it ? `${it.id}|${it.lv}|${it.evo ? 1 : 0}|${it.evoReady ? 1 : 0}|${it.need?.id ?? ''}` : '';
      if (sig !== s.sig) {
        const lvUp = !!it && s.sig !== '' && s.sig.split('|')[0] === it.id && it.lv > s.lv;
        const fresh = !!it && (s.sig === '' || s.sig.split('|')[0] !== it.id);
        s.sig = sig;
        s.lv = it?.lv ?? 0;
        s.root.className = `dg-wslot${it ? '' : ' empty'}${it?.evo ? ' evo' : ''}${it && !it.evo && it.lv >= it.max ? ' max' : ''}${it?.evoReady ? ' evo-ready' : ''}`;
        s.body.textContent = '';
        s.root.title = '';
        if (it) {
          s.body.append(ico(itemKind(it, 'weapon'), it.id, it.icon, 'dg-wslot-ic'));
          if (it.evo) s.body.append(el('b', 'dg-item-star', '★'));
          else s.body.append(pips(it.max, it.lv));
          let tip = it.evo ? `${it.name} — эволюция` : `${it.name} · ур. ${it.lv} из ${it.max}`;
          if (it.evoReady) {
            s.body.append(el('b', 'dg-evo-mark', '🎁'));
            tip += '\nЭволюция готова — выпадет из ближайшего сундука';
          } else if (it.need) {
            const need = el('b', 'dg-need');
            need.append(ico('passive', it.need.id, it.need.icon));
            s.body.append(need);
            tip += `\nДля эволюции нужна пассивка «${it.need.name}»`;
          }
          s.root.title = tip;
          if (fresh || lvUp) s.root.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.2,.9,.3,1.4)' });
        }
        s.p = -2;
        s.fires = it?.fires ?? 0;
      }
      if (!it) continue;
      const cd = it.cd01 ?? 1;
      const p = cd < 0 ? 1 : Math.round(clamp01(cd) * 100) / 100;
      if (p !== s.p) {
        s.p = p;
        s.fg.setAttribute('stroke-dashoffset', (RING_C * (1 - p)).toFixed(1));
        s.root.classList.toggle('cooling', cd >= 0 && p < 1);
        s.root.classList.toggle('always', cd < 0);
      }
      const fires = it.fires ?? 0;
      if (fires !== s.fires) {
        s.fires = fires;
        s.body.animate([{ transform: 'scale(1.16)', filter: 'brightness(1.8)' }, { transform: 'scale(1)', filter: 'none' }], { duration: 240, easing: 'ease-out' });
      }
    }
  }

  private updateItems(key: string, row: HTMLElement, items: HudItem[], slots: number): void {
    const n = Math.max(slots, items.length);
    if (this.diff(`${key}:n`, n)) {
      row.textContent = '';
      for (let i = 0; i < n; i++) row.append(el('div', 'dg-item empty'));
      for (let i = 0; i < n; i++) this.last.delete(`${key}:${i}`);
    }
    for (let i = 0; i < n; i++) {
      const it = items[i];
      const sig = it ? `${it.id}|${it.icon}|${it.lv}|${it.max}|${it.evo ? 1 : 0}` : '';
      const was = this.last.get(`${key}:${i}`) as string | undefined;
      if (this.diff(`${key}:${i}`, sig)) {
        const cell = row.children[i] as HTMLElement;
        fillItem(cell, it, 'passive');
        if (it && was !== undefined) cell.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.2,.9,.3,1.4)' });
      }
    }
  }

  private updateBreather(b: HudFrame['breather']): void {
    this.flag('br', this.root, 'breathing', !!b);
    if (!b) return;
    this.text('brTitle', this.brTitle, `Передышка ${Math.max(0, Math.ceil(b.left))} с`);
    this.text('brNext', this.brNext, `Дальше — волна ${b.next}`);
    const mobs = b.mobs.map((m) => `${m.icon}${m.name}`).join('|');
    if (this.diff('brMobs', mobs)) {
      this.brMobs.textContent = '';
      for (const m of b.mobs) {
        const chip = el('span', 'dg-mob');
        chip.append(ico('mob', m.id, m.icon, 'dg-mob-ic'), document.createTextNode(m.name));
        this.brMobs.append(chip);
      }
    }
    this.text('brEvent', this.brEvent, b.event);
    this.flag('brEventOn', this.brEvent, 'hidden', !b.event);
  }

  // ------------------------------------------------------------------ карточки

  cards(c: HudCards | null): void {
    this.cardsData = c;
    this.setBanMode(false);
    this.cardsLayer.classList.toggle('open', !!c);
    this.cardBtns.length = 0;
    this.cardsRow.textContent = '';
    if (!c) return;

    this.cardsHead.textContent = '';
    this.cardsHead.append(el('h2', '', 'Новый уровень!'));
    if (c.total > 1) this.cardsHead.append(el('div', 'dg-cards-count', `★ ${c.index} из ${c.total}`));

    c.cards.forEach((card, i) => {
      const b = el('button', `dg-card ${card.kind}`);
      b.type = 'button';
      b.style.setProperty('--i', String(i));
      const kind: DgIconKind = card.kind === 'weapon' ? 'weapon' : card.kind === 'passive' ? 'passive' : card.id === 'stew' ? 'pickup' : 'ui';
      const icBox = el('div', 'dg-card-ic');
      icBox.append(ico(kind, card.id, card.icon));
      b.append(kbd(String(i + 1)), icBox, el('div', 'dg-card-name', card.name));
      if (card.kind === 'misc') b.append(el('div', 'dg-card-lv', ' '));
      else if (card.from <= 0) b.append(el('div', 'dg-card-lv new', 'Новое'));
      else {
        const lv = el('div', 'dg-card-lv');
        lv.append(el('span', '', `Ур. ${card.from} → ${card.to}`), pips(card.kind === 'weapon' ? WEAPONS[card.id ?? '']?.max ?? 7 : PASSIVES[card.id ?? '']?.max ?? 5, card.to));
        b.append(lv);
      }
      b.append(el('div', 'dg-card-text', card.text), el('div', 'dg-card-ban hidden', 'Убрать навсегда'));
      b.addEventListener('click', () => {
        if (this._banMode) {
          this.setBanMode(false);
          this.act.ban(i);
        } else this.act.pick(i);
      });
      this.cardBtns.push(b);
      this.cardsRow.append(b);
    });

    (this.rerollBtn.querySelector('.dg-btn-label') as HTMLElement).textContent = `Перебросить (${c.rerolls})`;
    this.rerollBtn.disabled = c.rerolls <= 0;
    (this.banBtn.querySelector('.dg-btn-label') as HTMLElement).textContent = `Убрать (${c.banishes})`;
    this.banBtn.disabled = c.banishes <= 0;
    this.banBtn.setAttribute('aria-pressed', 'false');
  }

  // ------------------------------------------------------------------ сундук

  chest(c: HudChest | null): void {
    const L = this.chestLayer;
    L.classList.toggle('open', !!c);
    L.textContent = '';
    if (!c) return;
    const win = el('div', `dg-window dg-chest${c.big ? ' big' : ''}`);
    win.append(el('h2', 'dg-chest-title', c.big ? 'Большой сундук!' : 'Сундук!'));
    // лента барабана: свои вещи и все оружия/пассивки
    const pool: [DgIconKind, string, string][] = [
      ...Object.entries(WEAPONS).filter(([id]) => !id.endsWith('_evo')).map(([id, w]) => ['weapon', id, w.icon] as [DgIconKind, string, string]),
      ...Object.entries(PASSIVES).map(([id, p]) => ['passive', id, p.icon] as [DgIconKind, string, string]),
    ];
    c.items.forEach((it, i) => {
      const row = el('div', `dg-reel-row${it.evo ? ' evo' : ''}`);
      row.style.setProperty('--d', `${1.2 + i * 0.3}s`);
      const reel = el('div', 'dg-reel');
      const strip = el('div', 'dg-reel-strip');
      for (let k = 0; k < REEL_LEN - 1; k++) {
        const [kind, id, emo] = pool[Math.floor(Math.random() * pool.length)];
        const cell = el('span');
        cell.append(ico(kind, id, emo));
        strip.append(cell);
      }
      const end = el('span');
      end.append(ico(it.kind ?? (it.evo ? 'evo' : 'weapon'), it.id, it.icon));
      strip.append(end);
      strip.style.setProperty('--end', `${-(REEL_LEN - 1)}`);
      reel.append(strip);
      const info = el('div', 'dg-reel-info');
      info.append(el('div', 'dg-reel-name', it.name));
      if (it.evo) info.append(el('div', 'dg-reel-evo', 'Эволюция!'));
      else info.append(el('div', 'dg-reel-lv', it.from <= 0 ? 'Новое' : `Ур. ${it.from} → ${it.to}`));
      row.append(reel, info);
      win.append(row);
    });
    if (!c.items.length && c.fallback) win.append(el('div', 'dg-chest-fallback', c.fallback));
    const acts = el('div', 'dg-actions');
    const take = button('green', 'Забрать', 'Enter', () => this.act.chestDone());
    acts.append(take);
    win.append(acts);
    L.append(win);
  }

  // ------------------------------------------------------------------ пауза

  pause(open: boolean, wavesDone: number): void {
    this.pauseLayer.classList.toggle('open', open);
    if (!open) return;
    this.syncPrefs();
    (this.pauseQuit.firstElementChild as HTMLElement).textContent =
      wavesDone > 0 ? `Выйти (засчитать ${wavesWord(wavesDone)})` : 'Выйти';
  }

  // ------------------------------------------------------------------ итоги

  results(r: HudResults | null): void {
    const L = this.resultsLayer;
    const wasOpen = L.classList.contains('open');
    L.classList.toggle('open', !!r);
    this.root.classList.toggle('results-open', !!r);
    L.textContent = '';
    if (!r) return;
    const win = el('div', 'dg-window dg-results');
    if (wasOpen) win.style.animation = 'none'; // второй вызов (пришли жетоны) — без повторного «влёта»

    const head = el('div', 'dg-res-head');
    head.append(
      el('h2', 'dg-res-title', r.waves > 0 ? `Ты отбил ${wavesWord(r.waves)}` : 'Ни одной волны'),
      el('div', 'dg-res-time', clock(r.ms / 1000)),
    );
    win.append(head);
    if (r.newBest) win.append(el('div', 'dg-res-best', 'Твой новый рекорд!'));
    else if (r.weekRank > 0) win.append(el('div', 'dg-res-rank', `${r.weekRank}-е место за неделю`));
    // жетоны
    const coins = el('div', 'dg-res-coins');
    if (r.pending) coins.append(el('div', 'dg-res-pending', 'Считаем жетоны…'));
    else {
      for (const c of r.coins) {
        const row = el('div', 'dg-coin-row');
        row.append(el('span', '', c.label), this.coinsEl(c.n));
        coins.append(row);
      }
      const total = el('div', 'dg-coin-row total');
      total.append(el('span', '', 'Итого'), this.coinsEl(r.coinsTotal));
      coins.append(total);
    }
    win.append(coins);
    if (r.killedBy) win.append(el('div', 'dg-res-killed', r.killedBy));

    // сборка
    const build = el('div', 'dg-res-build');
    for (const [list, row] of [[r.weapons, 'weapon'], [r.passives, 'passive']] as const) {
      for (const it of list) {
        const cell = el('div');
        fillItem(cell, it, row);
        build.append(cell);
      }
    }
    if (build.childElementCount) win.append(build);

    // урон по оружиям
    const dmg = [...r.dmg].sort((a, b) => b.n - a.n);
    const sum = dmg.reduce((s, d) => s + d.n, 0);
    if (dmg.length && sum > 0) {
      const list = el('div', 'dg-res-dmg');
      const top = dmg[0].n;
      for (const d of dmg) {
        const row = el('div', 'dg-dmg-row');
        const track = el('div', 'dg-dmg-track');
        const fill = el('i');
        fill.style.width = `${(d.n / top) * 100}%`;
        track.append(fill, el('span', 'dg-dmg-name', d.name));
        const dic = el('span', 'dg-dmg-ic');
        dic.append(d.id && d.id in WEAPONS ? ico('weapon', d.id, d.icon) : el('span', 'dg-ic emo', d.icon));
        row.append(dic, track, el('b', 'dg-dmg-pct', `${Math.round((d.n / sum) * 100)} %`));
        list.append(row);
      }
      win.append(list);
    }

    // счётчики
    const stats = el('div', 'dg-res-stats');
    for (const [label, n] of [['Убито', r.kills], ['Уровень', r.level], ['Сундуков', r.chests]] as const) {
      const s = el('div', 'dg-stat');
      s.append(el('b', '', String(n)), el('span', '', label));
      stats.append(s);
    }
    win.append(stats);

    const acts = el('div', 'dg-actions');
    acts.append(button('green', 'Ещё раз', 'R', () => this.act.again()), button('cream', 'На набережную', 'Esc', () => this.act.toLobby()));
    win.append(acts);
    L.append(win);
  }

  /** «18 🪙» — число и монета (картинка ui-gold) */
  private coinsEl(n: number): HTMLElement {
    const b = el('b', 'dg-coins', `${n} `);
    b.append(ico('ui', 'gold', '🪙', 'dg-coin-ic'));
    return b;
  }

  // ------------------------------------------------------------------ баннер, уровень, стрелки, радар

  banner(title: string, sub: string, style: HudBannerStyle): void {
    const b = this.bannerEl;
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub;
    this.bannerSub.classList.toggle('hidden', !sub);
    b.className = `dg-banner ${style}`;
    void b.offsetWidth; // перезапуск анимации
    b.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => b.classList.remove('show'), BANNER_MS);
  }

  /** Маленькая плашка под волной на 2,5 с: «Волна 4 выстояна», «12 врагов озверели»; тот же key — та же плашка */
  toast(key: string, text: string, style: 'ok' | 'warn' = 'ok'): void {
    let t = this.toastEls.get(key);
    if (!t) {
      const root = el('div', `dg-toast ${style}`);
      this.toasts.append(root);
      t = { root, timer: 0 };
      this.toastEls.set(key, t);
      // больше трёх — самая старая уходит
      if (this.toastEls.size > 3) {
        const [k0, t0] = this.toastEls.entries().next().value as [string, { root: HTMLElement; timer: number }];
        clearTimeout(t0.timer);
        t0.root.remove();
        this.toastEls.delete(k0);
      }
    }
    t.root.textContent = text;
    clearTimeout(t.timer);
    const tt = t;
    tt.timer = window.setTimeout(() => {
      tt.root.classList.add('out');
      tt.timer = window.setTimeout(() => {
        tt.root.remove();
        if (this.toastEls.get(key) === tt) this.toastEls.delete(key);
      }, 300);
    }, 2500);
    tt.root.classList.remove('out');
  }

  /** «★ Ур. N» вспыхивает над героем и слетает в значок уровня внизу */
  levelFlash(level: number): void {
    const f = this.flash;
    f.textContent = `★ Ур. ${level}`;
    f.classList.remove('show');
    this.lv.classList.remove('bump');
    const rb = this.lv.getBoundingClientRect();
    const rr = this.root.getBoundingClientRect();
    const x = rb.left - rr.left + rb.width / 2;
    const y = rb.top - rr.top + rb.height / 2;
    f.style.left = `${x}px`;
    f.style.top = `${y}px`;
    f.style.setProperty('--dx', `${rr.width / 2 - x}px`);
    f.style.setProperty('--dy', `${rr.height * 0.36 - y}px`);
    void f.offsetWidth;
    f.classList.add('show');
    clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => {
      f.classList.remove('show');
      this.lv.classList.add('bump');
    }, 900);
  }

  /**
   * Стрелки у края экрана: место — на краю рамки по направлению на цель (рамка обходит радар и нижний HUD), соседние
   * раздвигаются, место меняется плавно; появилась — проявляется, пропала — гаснет.
   */
  arrows(list: HudArrow[]): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this.arrowAt || now)) / 1000);
    this.arrowAt = now;
    const W = this.root.clientWidth || window.innerWidth;
    const H = this.root.clientHeight || window.innerHeight;
    const touch = document.documentElement.classList.contains('touch');
    if (now - this.edgeAt > 500 || now < this.edgeAt) {
      this.edgeAt = now;
      const rad = this.radarBox.getBoundingClientRect();
      const vit = this.vitals.getBoundingClientRect();
      this.edge.rx = rad.width > 0 ? rad.right + 34 : 0;
      this.edge.ry = rad.height > 0 ? rad.bottom + 34 : 0;
      this.edge.bottom = vit.height > 0 ? vit.top : H - 200;
    }
    const T = touch ? 120 : 118;
    // снизу — выше здоровья и баффов (диск 29 px и подпись под ним)
    const B = touch ? H - 120 : Math.min(H - 250, this.edge.bottom - 66);
    const Lx = touch ? 64 : 48;
    const R = W - (touch ? 150 : 48);
    const cx = W / 2;
    const cy = Math.max(T + 1, Math.min(B - 1, H / 2));
    const { rx, ry } = this.edge;
    const live = new Set<string>();
    const placed: ArrowEl[] = [];
    for (const a of list) {
      live.add(a.id);
      let e = this.arrowEls.get(a.id);
      const c = Math.cos(a.angle);
      const s = Math.sin(a.angle);
      const kx = c > 1e-4 ? (R - cx) / c : c < -1e-4 ? (Lx - cx) / c : Infinity;
      const ky = s > 1e-4 ? (B - cy) / s : s < -1e-4 ? (T - cy) / s : Infinity;
      const k = Math.min(kx, ky);
      let x = cx + c * k;
      let y = cy + s * k;
      // радар в левом верхнем углу: стрелка — под ним или правее
      if (x < rx && y < ry) {
        if (ry - y < rx - x) y = ry;
        else x = rx;
      }
      if (!e) {
        e = this.arrowEl(a.kind);
        e.x = x;
        e.y = y;
        this.arrowEls.set(a.id, e);
      }
      if (e.goneAt) {
        e.goneAt = 0;
        e.root.classList.add('on');
      }
      e.tx = x;
      e.ty = y;
      const d = Math.round(a.dist);
      if (d !== e.d) {
        e.d = d;
        e.dist.textContent = `${d} м`;
      }
      e.tip.style.transform = `rotate(${a.angle.toFixed(3)}rad)`;
      placed.push(e);
    }
    // раздвинуть соседей (по 3 прохода), не выходя за рамку
    const MIN = 74;
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i];
          const b = placed[j];
          let dx = b.tx - a.tx;
          let dy = b.ty - a.ty;
          let d = Math.hypot(dx, dy);
          if (d >= MIN) continue;
          if (d < 0.01) {
            dx = 1;
            dy = 0.3;
            d = Math.hypot(dx, dy);
          }
          const push = (MIN - d) / 2;
          a.tx -= (dx / d) * push;
          a.ty -= (dy / d) * push;
          b.tx += (dx / d) * push;
          b.ty += (dy / d) * push;
        }
      }
      for (const p of placed) {
        p.tx = Math.max(Lx, Math.min(R, p.tx));
        p.ty = Math.max(T, Math.min(B, p.ty));
      }
    }
    const kk = 1 - Math.exp(-dt * 12);
    for (const [id, e] of this.arrowEls) {
      if (!live.has(id)) {
        if (!e.goneAt) {
          e.goneAt = now;
          e.root.classList.remove('on');
        } else if (now - e.goneAt > 320) {
          e.root.remove();
          this.arrowEls.delete(id);
        }
        continue;
      }
      e.x += (e.tx - e.x) * kk;
      e.y += (e.ty - e.y) * kk;
      e.root.style.transform = `translate(${e.x.toFixed(1)}px, ${e.y.toFixed(1)}px)`;
    }
  }

  private arrowEl(kind: HudPoiKind): ArrowEl {
    const info = POI[kind];
    const root = el('div', `dg-arrow cat-${info.cat}`);
    root.dataset.kind = kind;
    const tip = el('div', 'dg-arrow-tip');
    const disc = el('div', 'dg-arrow-disc');
    const url = poiIcon(kind);
    if (url) {
      const im = el('img', 'dg-ic');
      im.src = url;
      im.alt = '';
      disc.append(im);
    } else disc.append(el('span', 'dg-ic emo', info.emoji));
    const lab = el('div', 'dg-arrow-lab');
    const dist = el('b', 'dg-arrow-d');
    lab.append(el('span', 'dg-arrow-name', info.name), dist);
    root.append(tip, disc, lab);
    this.arrowLayer.append(root);
    // проявление со следующего кадра (переход opacity/scale)
    requestAnimationFrame(() => root.classList.add('on'));
    return { root, tip, dist, x: 0, y: 0, tx: 0, ty: 0, d: -1, goneAt: 0 };
  }

  /** Радар: свой 2D-холст, рисуется по вызову сцены (10–15 раз в секунду) */
  radar(r: HudRadar): void {
    const ctx = this.radarCtx;
    const cv = this.radarCv;
    if (!ctx) return;
    const S = this.radarBox.clientWidth;
    if (S <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(S * dpr);
    if (cv.width !== px || cv.height !== px) {
      cv.width = px;
      cv.height = px;
    }
    const css = getComputedStyle(this.radarBox);
    const col = (name: string, def: string): string => css.getPropertyValue(name).trim() || def;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, S, S);
    const c = S / 2;
    const Rr = c - 3;
    const k = (Rr - 4) / r.range;
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, Rr, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = col('--dg-radar-bg', 'rgba(18, 13, 11, .78)');
    ctx.fillRect(0, 0, S, S);
    // кольца дальности
    ctx.strokeStyle = col('--dg-radar-grid', 'rgba(255, 236, 205, .12)');
    ctx.lineWidth = 1;
    for (const f of [0.5, 1]) {
      ctx.beginPath();
      ctx.arc(c, c, r.range * f * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    // что видно на экране
    if (r.view.length === 8) {
      ctx.beginPath();
      for (let i = 0; i < 4; i++) ctx[i ? 'lineTo' : 'moveTo'](c + r.view[i * 2] * k, c + r.view[i * 2 + 1] * k);
      ctx.closePath();
      ctx.fillStyle = col('--dg-radar-view', 'rgba(255, 236, 205, .07)');
      ctx.fill();
      ctx.strokeStyle = col('--dg-radar-view-line', 'rgba(255, 236, 205, .22)');
      ctx.stroke();
    }
    // враги — точки
    ctx.fillStyle = col('--dg-radar-mob', 'rgba(205, 130, 255, .85)');
    const m = r.mobs;
    for (let i = 0; i + 1 < m.length; i += 2) ctx.fillRect(c + m[i] * k - 1, c + m[i + 1] * k - 1, 2.2, 2.2);
    // постройки: мелкие — точками, важные — значками
    const edge = (x: number, z: number): [number, number] => {
      let X = x * k;
      let Z = z * k;
      const d = Math.hypot(X, Z);
      const lim = Rr - 7;
      if (d > lim) {
        X *= lim / d;
        Z *= lim / d;
      }
      return [c + X, c + Z];
    };
    for (const p of r.pois) {
      const [X, Z] = edge(p.x, p.z);
      if (p.kind === 'brazier' || p.kind === 'lamp' || p.kind === 'keg' || p.kind === 'tramp') {
        ctx.globalAlpha = p.on ? 0.95 : 0.45;
        ctx.fillStyle = p.kind === 'brazier' ? '#ffb347' : p.kind === 'lamp' ? '#ffe7a0' : p.kind === 'keg' ? '#ff6b5a' : '#b8e07a';
        ctx.beginPath();
        ctx.arc(X, Z, p.kind === 'lamp' ? 2.6 : 2, 0, Math.PI * 2);
        ctx.fill();
        if (p.kind === 'lamp' && !p.on) {
          ctx.strokeStyle = '#ffe7a0';
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.globalAlpha = p.on ? 1 : 0.45;
      this.radarIcon(ctx, p.kind, X, Z, 15);
      ctx.globalAlpha = 1;
    }
    // элиты и боссы — крупно, у края — на краю
    for (let i = 0; i + 1 < r.elites.length; i += 2) {
      const [X, Z] = edge(r.elites[i], r.elites[i + 1]);
      ctx.fillStyle = col('--dg-radar-elite', '#ff8fb0');
      ctx.strokeStyle = 'rgba(0, 0, 0, .7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(X, Z, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160);
    for (let i = 0; i + 1 < r.bosses.length; i += 2) {
      const [X, Z] = edge(r.bosses[i], r.bosses[i + 1]);
      ctx.fillStyle = col('--dg-radar-boss', '#d6a8ff');
      ctx.globalAlpha = 0.35 * pulse;
      ctx.beginPath();
      ctx.arc(X, Z, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(0, 0, 0, .7)';
      ctx.beginPath();
      ctx.arc(X, Z, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // герой — стрелка по ходу
    ctx.translate(c, c);
    ctx.rotate(Math.PI - r.yaw);
    ctx.fillStyle = col('--dg-radar-hero', '#ffd27a');
    ctx.strokeStyle = 'rgba(0, 0, 0, .75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private radarIcon(ctx: CanvasRenderingContext2D, kind: HudPoiKind, x: number, y: number, size: number): void {
    let im = this.radarImg.get(kind);
    if (im === undefined) {
      const url = poiIcon(kind);
      im = null;
      if (url) {
        im = new Image();
        im.src = url;
      }
      this.radarImg.set(kind, im);
    }
    if (im && im.complete && im.naturalWidth > 0) {
      ctx.drawImage(im, x - size / 2, y - size / 2, size, size);
      return;
    }
    ctx.font = `${size - 3}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(POI[kind].emoji, x, y + 1);
  }

  // ------------------------------------------------------------------ загрузка и телефон

  loading(p: number | null): void {
    this.loadLayer.classList.toggle('open', p !== null);
    if (p !== null) this.loadFill.style.transform = `scaleX(${q01(p)})`;
  }

  phoneStub(on: boolean): void {
    this.phoneLayer.classList.toggle('open', on);
  }
}

