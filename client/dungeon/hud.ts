// «Подземелье»: DOM-интерфейс поверх сцены — HUD волны (опыт, HP, волна или босс, баффы, сборка, рывок и удар),
// передышка, карточки уровня, сундук-барабан, пауза, итоги, баннеры, стрелки к целям, загрузка и заглушка телефона.
// Ничего не решает сам: сцена каждый кадр отдаёт HudFrame, экраны открывает вызовами, клики уходят в HudActions.
// Кадр не пересобирает DOM: элементы созданы один раз, текст и стили меняются, только когда меняется значение.
import './dungeon.css';
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
  HudResults,
} from './hudtypes.ts';

/** Значки для ленты барабана (кроме выпавших вещей) */
const REEL_ICONS = ['🏮', '🔥', '⛏', '✨', '⚡', '🪨', '🧨', '🔦', '🕯', '🫗', '🔍', '🦺', '⛑', '🥾', '🧲'];
const ARROW_ICON: Record<HudArrow['kind'], string> = { elite: '👹', chest: '🎁', spring: '💧', altar: '✨', boss: '🐛' };
const REEL_LEN = 16;
const BANNER_MS = 2800;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
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

const clamp01 = (v: number): number => (v > 1 ? 1 : v < 0 ? 0 : v);
/** Доля для полосы: шаг 1/500, чтобы не трогать стиль из-за дрожи в шестом знаке */
const q01 = (v: number): number => Math.round(clamp01(v) * 500) / 500;

/** Ячейка вещи (сборка в HUD и в итогах) */
function fillItem(cell: HTMLElement, it: HudItem | undefined): void {
  cell.className = `dg-item${it ? '' : ' empty'}${it?.evo ? ' evo' : ''}${it && !it.evo && it.lv >= it.max ? ' max' : ''}`;
  cell.textContent = '';
  if (!it) return;
  cell.append(el('span', 'dg-item-ic', it.icon), el('b', 'dg-item-lv', it.evo ? '★' : String(it.lv)));
}

interface Ring {
  root: HTMLElement;
  p: number;
  cls: string;
}

export class DungeonHud implements DungeonHudApi {
  private readonly root = el('div', 'dg');
  private readonly last = new Map<string, unknown>();
  private _banMode = false;
  private bannerTimer = 0;
  private flashTimer = 0;

  // --- HUD волны
  private readonly hud = el('div', 'dg-hud');
  private readonly xpFill = el('i', 'dg-xp-fill');
  private readonly lv = el('div', 'dg-lv');
  private readonly hpFill = el('i', 'dg-hp-fill');
  private readonly hpTrail = el('i', 'dg-hp-trail');
  private readonly hpText = el('span', 'dg-hp-text');
  private readonly buffs = el('div', 'dg-buffs');
  private readonly buffEls = new Map<string, { root: HTMLElement; sec: HTMLElement; bar: HTMLElement }>();
  private readonly waveTitle = el('div', 'dg-wave-title');
  private readonly squadFill = el('i', 'dg-squad-fill');
  private readonly timer = el('span', 'dg-timer');
  private readonly bossName = el('div', 'dg-boss-name');
  private readonly bossFill = el('i', 'dg-boss-fill');
  private readonly bossMarks = el('div', 'dg-boss-marks');
  private readonly kills = el('span', 'dg-kills-n');
  private readonly weaponRow = el('div', 'dg-items');
  private readonly passiveRow = el('div', 'dg-items');
  private readonly dash: Ring;
  private readonly strike: Ring;

  // --- передышка
  private readonly breather = el('div', 'dg-breather');
  private readonly brTitle = el('div', 'dg-br-title');
  private readonly brMobs = el('div', 'dg-br-mobs');
  private readonly brEvent = el('div', 'dg-br-event');

  // --- экраны
  private readonly cardsLayer = el('div', 'dg-layer dg-cards-layer');
  private readonly chestLayer = el('div', 'dg-layer dg-chest-layer');
  private readonly pauseLayer = el('div', 'dg-layer dg-pause-layer');
  private readonly resultsLayer = el('div', 'dg-layer dg-results-layer');
  private readonly pauseQuit: HTMLButtonElement;
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
  private readonly arrowPool: { root: HTMLElement; ptr: HTMLElement; ic: HTMLElement; d: HTMLElement; key: string }[] = [];
  private readonly loadLayer = el('div', 'dg-loading');
  private readonly loadFill = el('i', 'dg-load-fill');
  private readonly phoneLayer = el('div', 'dg-phone');

  private readonly act: HudActions;

  constructor(parent: HTMLElement, act: HudActions) {
    this.act = act;
    const r = this.root;
    r.append(el('div', 'dg-vignette'), el('div', 'dg-alarm'), el('div', 'dg-low'));

    // сверху: опыт во всю ширину и уровень
    const xp = el('div', 'dg-xp');
    xp.append(this.xpFill);
    this.hud.append(xp, this.lv);

    // слева сверху: HP и баффы
    const hp = el('div', 'dg-hp');
    hp.append(this.hpTrail, this.hpFill, this.hpText);
    const tl = el('div', 'dg-tl');
    tl.append(hp, this.buffs);

    // по центру сверху: волна (или босс)
    const tc = el('div', 'dg-tc');
    const squad = el('div', 'dg-squad');
    squad.append(this.squadFill);
    const waveRow = el('div', 'dg-wave-row');
    waveRow.append(squad, this.timer);
    const wave = el('div', 'dg-wave');
    wave.append(this.waveTitle, waveRow);
    const bossBar = el('div', 'dg-boss-bar');
    bossBar.append(this.bossFill, this.bossMarks);
    const boss = el('div', 'dg-boss');
    boss.append(this.bossName, bossBar);
    tc.append(wave, boss);

    // справа сверху (под жетонами игры): убито и пауза
    const tr = el('div', 'dg-tr');
    const killPill = el('div', 'dg-kills');
    killPill.append(el('span', '', '💀'), this.kills);
    const pauseBtn = el('button', 'dg-pause-btn');
    pauseBtn.type = 'button';
    pauseBtn.append(el('span', '', '⏸'), kbd('Esc'));
    pauseBtn.addEventListener('click', () => this.act.pause());
    tr.append(killPill, pauseBtn);

    // слева снизу: сборка
    const bl = el('div', 'dg-bl');
    bl.append(this.weaponRow, this.passiveRow);

    // снизу по центру: рывок и удар
    const bc = el('div', 'dg-bc');
    this.dash = this.ring('dash', '💨', 'Пробел', 'Рывок');
    this.strike = this.ring('strike', '🏮', 'Q', 'Удар');
    bc.append(this.dash.root, this.strike.root);

    this.hud.append(tl, tc, tr, bl, bc);
    r.append(this.hud, this.arrowLayer);

    // передышка
    const go = button('green dg-go', 'В бой', 'Enter', () => this.act.go());
    this.breather.append(this.brTitle, this.brMobs, this.brEvent, go);
    r.append(this.breather);

    // баннер и звезда уровня
    this.bannerEl.append(this.bannerTitle, this.bannerSub);
    r.append(this.bannerEl, this.flash);

    // карточки
    this.rerollBtn = button('cream', '', '', () => this.act.reroll());
    this.banBtn = button('cream dg-ban-btn', '', '', () => this.setBanMode(!this._banMode));
    const cardsFoot = el('div', 'dg-cards-foot');
    cardsFoot.append(this.rerollBtn, this.banBtn);
    this.cardsLayer.append(this.cardsHead, this.cardsRow, cardsFoot);

    // пауза
    const pauseWin = el('div', 'dg-window dg-pause');
    const pauseActs = el('div', 'dg-actions');
    this.pauseQuit = button('red', 'Выйти', '', () => this.act.quit());
    pauseActs.append(button('green', 'Продолжить', 'Esc', () => this.act.resume()), this.pauseQuit);
    pauseWin.append(el('h2', '', 'Пауза'), pauseActs);
    this.pauseLayer.append(pauseWin);

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

  private ring(cls: string, icon: string, key: string, label: string): Ring {
    const root = el('div', `dg-ring ${cls}`);
    const disc = el('div', 'dg-ring-disc');
    disc.append(el('span', 'dg-ring-ic', icon));
    root.append(disc, el('div', 'dg-ring-label'));
    const lab = root.lastElementChild as HTMLElement;
    lab.append(kbd(key), document.createTextNode(` ${label}`));
    return { root, p: -1, cls: '' };
  }

  private setRing(r: Ring, p: number, state: string): void {
    const q = Math.round(clamp01(p) * 100) / 100;
    if (q !== r.p) {
      r.p = q;
      r.root.style.setProperty('--p', String(q));
    }
    if (state !== r.cls) {
      if (r.cls) r.root.classList.remove(r.cls);
      if (state) r.root.classList.add(state);
      r.cls = state;
    }
  }

  // ------------------------------------------------------------------ кадр

  frame(f: HudFrame, _now: number): void {
    const r = this.root;
    if (this.diff('stage', f.stage)) r.dataset.stage = f.stage;
    this.flag('alarm', r, 'alarm', f.alarm);
    this.flag('low', r, 'low', f.lowHp);

    this.bar('xp', this.xpFill, f.xp01);
    this.text('lv', this.lv, `Ур. ${f.level}`);

    const hpMax = Math.max(1, f.hpMax);
    const hp01 = f.hp / hpMax;
    const q = q01(hp01);
    if (this.diff('hp', q)) {
      this.hpFill.style.transform = `scaleX(${q})`;
      this.hpTrail.style.transform = `scaleX(${q})`;
    }
    this.text('hpText', this.hpText, `${Math.max(0, Math.ceil(f.hp))} / ${Math.round(f.hpMax)}`);

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

    this.text('kills', this.kills, String(f.kills));
    this.updateItems('w', this.weaponRow, f.weapons, f.weaponSlots);
    this.updateItems('p', this.passiveRow, f.passives, f.passiveSlots);

    this.setRing(this.dash, f.dash01, f.dash01 >= 1 ? 'ready' : '');
    if (f.qCharge >= 0) this.setRing(this.strike, f.qCharge, f.qCharge >= 1 ? 'full' : 'charge');
    else this.setRing(this.strike, f.q01, f.q01 >= 1 ? 'ready' : '');

    this.updateBreather(f.breather);
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
        root.append(el('span', 'dg-buff-ic', b.icon), sec, track);
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
      if (this.diff(`${key}:${i}`, sig)) fillItem(row.children[i] as HTMLElement, it);
    }
  }

  private updateBreather(b: HudFrame['breather']): void {
    this.flag('br', this.root, 'breathing', !!b);
    if (!b) return;
    this.text('brTitle', this.brTitle, `Волна ${b.next} через ${Math.max(0, Math.ceil(b.left))} с`);
    const mobs = b.mobs.map((m) => `${m.icon}${m.name}`).join('|');
    if (this.diff('brMobs', mobs)) {
      this.brMobs.textContent = '';
      for (const m of b.mobs) {
        const chip = el('span', 'dg-mob');
        chip.append(el('span', 'dg-mob-ic', m.icon), document.createTextNode(m.name));
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
      b.append(kbd(String(i + 1)), el('div', 'dg-card-ic', card.icon), el('div', 'dg-card-name', card.name));
      b.append(card.from <= 0 ? el('div', 'dg-card-lv new', 'Новое') : el('div', 'dg-card-lv', `Ур. ${card.from} → ${card.to}`));
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

    (this.rerollBtn.firstElementChild as HTMLElement).textContent = `Перебросить (${c.rerolls})`;
    this.rerollBtn.disabled = c.rerolls <= 0;
    (this.banBtn.firstElementChild as HTMLElement).textContent = `Убрать (${c.banishes})`;
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
    const pool = [...new Set([...c.items.map((it) => it.icon), ...REEL_ICONS])];
    c.items.forEach((it, i) => {
      const row = el('div', `dg-reel-row${it.evo ? ' evo' : ''}`);
      row.style.setProperty('--d', `${1.2 + i * 0.3}s`);
      const reel = el('div', 'dg-reel');
      const strip = el('div', 'dg-reel-strip');
      for (let k = 0; k < REEL_LEN - 1; k++) strip.append(el('span', '', pool[Math.floor(Math.random() * pool.length)]));
      strip.append(el('span', '', it.icon));
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
        row.append(el('span', '', c.label), el('b', '', `${c.n} 🪙`));
        coins.append(row);
      }
      const total = el('div', 'dg-coin-row total');
      total.append(el('span', '', 'Итого'), el('b', '', `${r.coinsTotal} 🪙`));
      coins.append(total);
    }
    win.append(coins);
    if (r.killedBy) win.append(el('div', 'dg-res-killed', r.killedBy));

    // сборка
    const build = el('div', 'dg-res-build');
    for (const it of [...r.weapons, ...r.passives]) {
      const cell = el('div');
      fillItem(cell, it);
      build.append(cell);
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
        row.append(el('span', 'dg-dmg-ic', d.icon), track, el('b', 'dg-dmg-pct', `${Math.round((d.n / sum) * 100)} %`));
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

  // ------------------------------------------------------------------ баннер, уровень, стрелки

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

  levelFlash(level: number): void {
    const f = this.flash;
    f.textContent = `★ Ур. ${level}`;
    f.classList.remove('show');
    this.lv.classList.remove('bump');
    void f.offsetWidth;
    f.classList.add('show');
    clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => {
      f.classList.remove('show');
      this.lv.classList.add('bump');
    }, 900);
  }

  arrows(list: HudArrow[]): void {
    while (this.arrowPool.length < list.length) {
      const root = el('div', 'dg-arrow');
      const ptr = el('div', 'dg-arrow-ptr');
      const ic = el('span', 'dg-arrow-ic');
      const d = el('span', 'dg-arrow-d');
      root.append(ptr, ic, d);
      this.arrowLayer.append(root);
      this.arrowPool.push({ root, ptr, ic, d, key: '' });
    }
    this.arrowPool.forEach((a, i) => {
      const t = list[i];
      const key = t ? `${Math.round(t.x)},${Math.round(t.y)},${t.angle.toFixed(2)},${t.kind},${Math.round(t.dist)}` : '';
      if (key === a.key) return;
      const was = a.key;
      a.key = key;
      if (!t) {
        a.root.classList.add('hidden');
        return;
      }
      if (!was) a.root.classList.remove('hidden');
      a.root.style.transform = `translate(${Math.round(t.x)}px, ${Math.round(t.y)}px)`;
      a.ptr.style.transform = `rotate(${t.angle.toFixed(2)}rad)`;
      a.root.dataset.kind = t.kind;
      a.ic.textContent = ARROW_ICON[t.kind];
      a.d.textContent = `${Math.round(t.dist)} м`;
    });
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
