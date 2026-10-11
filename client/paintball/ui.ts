// Пейнтбол на ките 2.0 (как на странице lab/ui «Режимы» → «Пейнтбол»). Числа и события по-прежнему считает Hud
// (hud.ts — его же берёт крепость), а показывает их этот слой — в частях кита, как FortHud.adopt в крепости:
// верх-центр — маленькая плашка счёта «ЧЕРНИКА 5 · БОЙ 4:42 · 6 МАНДАРИН» (плашка события TopCenter, тосты — под ней),
// верх-лево — лента сбитых мелкими строками, под бейджем — плитка бонуса автомата, низ-центр — панель бойца
// отдельными блоками (здоровье со щитом, маркер и AWP, патроны, рывок), по центру — «Тебя залили краской!» и крупные
// баннеры, прицел — в слое без масштаба HUD. Tab и итоги раунда — окна кита. Старые окна Hud в пейнтболе спрятаны
// (ui.css, класс .pb-kit на слое сцены); остаются вспышки урона по краям, кляксы на «маске», цифры урона, оптика AWP,
// крестик «стена мешает» и автомат разминки (slot.ts).
import { END_TICKS, TEAM_NAMES, TICK_RATE } from '../../shared/constants.ts';
import type { RosterEntry, SlotBonus } from '../../shared/messages.ts';
import cannonUrl from '../assets/fort/cannon.webp';
import { TOUCH } from '../touch.ts';
import { h, iconImg, meterHtml } from '../ui/kit/dom.ts';
import { uiIcon } from '../ui/kit/icons.ts';
import { ModeFeed, ModeResults, capHtml, esc, put, setMeter } from '../ui/kit/modes.ts';
import type { HudSlots } from '../ui/kit/slots.ts';
import { PRIO, type TopCenter } from '../ui/kit/topcenter.ts';
import type { Hud } from './hud.ts';
import './ui.css';

/** Начало ключей своих плашек, тостов и баннеров: при уходе со склада убираем только их */
const PB = 'pb-';
const SCORE_KEY = 'pb-score';
/** Баннер по центру живёт не дольше своей анимации (kit.css .k-hero.is-play — 3,2 с) */
const HERO_MS = 3300;
/** Пауза итогов до нового раунда, с */
const END_S = END_TICKS / TICK_RATE;

/** Кит игры и что делать по кнопкам окна итогов */
export interface PbKit {
  slots: HudSlots;
  top: TopCenter;
  /** Оболочка #hud — окна (.k-scrim) рядом со слоем кита, не внутри (двойной zoom) */
  hudRoot: HTMLElement;
  /** «На набережную» (кнопка итогов) */
  leave: () => void;
  /** Итоги открылись: мышь отпустить — кнопки нажимаются */
  freeMouse: () => void;
  /** Итоги закрылись (новый раунд): мышь снова в игру */
  wantMouse: () => void;
}

const meterIn = '<i class="k-meter-ghost"></i><i class="k-meter-fill"></i>';
const teamCls = (t: number): string => (t === 1 ? 't1' : 't0');
const nameHtml = (name: string, team: number): string => `<b class="mo-name ${teamCls(team)}">${esc(name)}</b>`;
/** «2,4» — десятые через запятую */
const sec1 = (s: number): string => s.toFixed(1).replace('.', ',');

/** Сообщение Hud (своя разметка с <b>, эмодзи в начале) → чистый текст для тоста */
function plain(html: string): string {
  const t = html.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (_, c: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[c]!);
  return t.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim();
}

// ------------------------------------------------------------ панель бойца

/** Низ-центр: здоровье (со щитом бонуса), ячейки «Маркер» и «AWP», патроны с R, рывок с Shift — каждый блок на своей подложке */
class PbVitals {
  readonly root: HTMLElement;
  private readonly hpBox: HTMLElement;
  private readonly hpNum: HTMLElement;
  private readonly hpBar: HTMLElement;
  private readonly armor: HTMLElement;
  private readonly armorCap: HTMLElement;
  private readonly armorBar: HTMLElement;
  private readonly marker: HTMLElement;
  private readonly awp: HTMLElement;
  private readonly ammoBox: HTMLElement;
  private readonly ammoKey: HTMLElement | null;
  private readonly ammoNum: HTMLElement;
  private readonly ammoBar: HTMLElement;
  private readonly dashBar: HTMLElement;
  private hpKey = '';
  private armorKey = '';
  private ammoHtml = '';
  private ammoCls = '';
  private awpOn = false;

  constructor(slot: HTMLElement) {
    this.root = h('div', 'k-vitals pb-vitals pb-only');
    this.root.dataset.mode = 'paintball';
    this.hpBox = this.root.appendChild(h('div', 'k-vitals-hp'));
    const hpRow = this.hpBox.appendChild(h('div', 'k-vitals-row', iconImg('heart', 'k-vitals-ic')));
    this.hpNum = hpRow.appendChild(h('b', 'k-vitals-num', '100'));
    this.hpBar = this.hpBox.appendChild(h('span', 'k-meter k-meter--bad', meterIn));
    this.armor = this.hpBox.appendChild(h('div', 'k-vitals-row mo-armor', iconImg('shield', 'k-vitals-ic')));
    this.armorCap = this.armor.appendChild(h('span', 'k-vitals-cap'));
    this.armorBar = this.armor.appendChild(h('span', 'k-meter k-meter--thin k-meter--info', meterIn));
    this.armor.hidden = true;
    // в пейнтболе оружие не переключают клавишами: AWP берут на складе, пустая — снова маркер (клавиш на ячейках нет)
    const arms = this.root.appendChild(h('div', 'k-vitals-arms'));
    this.marker = arms.appendChild(h('div', 'k-arm is-on', `${iconImg('marker', '')}<span>Маркер</span>`));
    this.awp = arms.appendChild(h('div', 'k-arm is-off', `<img src="${cannonUrl}" alt="" draggable="false"><span>AWP</span>`));
    this.ammoBox = this.root.appendChild(h('div', 'k-vitals-ammo'));
    const ammoRow = this.ammoBox.appendChild(h('div', 'k-vitals-row'));
    this.ammoKey = TOUCH ? null : ammoRow.appendChild(h('kbd', 'k-key k-key--sm', 'R'));
    this.ammoNum = ammoRow.appendChild(h('b', 'k-vitals-num'));
    this.ammoBar = this.ammoBox.appendChild(h('span', 'k-meter k-meter--thin', meterIn));
    const dash = this.root.appendChild(h('div', 'k-vitals-dash', `${TOUCH ? '' : capHtml('Shift', 'k-key--sm')}<span class="k-vitals-cap">рывок</span>`));
    this.dashBar = dash.appendChild(h('span', 'k-meter k-meter--info', meterIn));
    slot.append(this.root);
  }

  setHp(hp: number, maxHp: number, armor: number, maxArmor: number): void {
    const v = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
    const key = `${hp}|${maxHp}`;
    if (key !== this.hpKey) {
      this.hpKey = key;
      put(this.hpNum, String(hp));
      setMeter(this.hpBar, v);
      this.hpBox.classList.toggle('is-low', hp > 0 && v <= 0.3);
    }
    const ak = `${armor}|${maxArmor}`;
    if (ak === this.armorKey) return;
    this.armorKey = ak;
    this.armor.hidden = maxArmor <= 0;
    put(this.armorCap, `щит ${armor}`);
    setMeter(this.armorBar, maxArmor > 0 ? armor / maxArmor : 0);
  }

  /** AWP в руках: ячейка AWP горит, в патронах — «AWP · 3», клавиши R нет (у AWP нет перезарядки) */
  setAwp(on: boolean): void {
    if (on === this.awpOn) return;
    this.awpOn = on;
    this.marker.classList.toggle('is-on', !on);
    this.awp.classList.toggle('is-on', on);
    this.awp.classList.toggle('is-off', !on);
    if (this.ammoKey) this.ammoKey.hidden = on;
  }

  /** reload — доля перезарядки (у AWP — затвора) 0…1, null — нет; low — с какого остатка полоса красная */
  setAmmo(ammo: number, max: number, reload: number | null, low: number): void {
    const r = reload === null ? -1 : Math.round(reload * 50) / 50;
    const html = this.awpOn ? `<small class="pb-awp-l">AWP ·</small>${ammo}` : `${ammo}<small>/ ${max}</small>`;
    if (html !== this.ammoHtml) {
      this.ammoHtml = html;
      this.ammoNum.innerHTML = html;
    }
    const cls = `k-meter k-meter--thin${r >= 0 ? ' k-meter--info' : ammo <= low ? ' k-meter--bad' : ''}`;
    if (cls !== this.ammoCls) this.ammoBar.className = this.ammoCls = cls;
    this.ammoBox.classList.toggle('is-empty', ammo <= 0 && r < 0);
    setMeter(this.ammoBar, r >= 0 ? r : max > 0 ? ammo / max : 0);
  }

  setDash(ready: number): void {
    setMeter(this.dashBar, Math.round(Math.max(0, Math.min(1, ready)) * 40) / 40);
  }

  /** Сбит: панель видна, но серая (как на странице) */
  setDown(down: boolean): void {
    this.root.classList.toggle('is-down', down);
  }
}

// ------------------------------------------------------------ прицел

/** Прицел кита по центру экрана (без масштаба HUD): раствор — разброс маркера в px; попадание — косой крестик */
class PbCross {
  readonly root: HTMLElement;
  private gap = -1;
  private vis = true;
  private ads = false;
  private hitTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = parent.appendChild(h('div', 'k-cross pb-cross', '<i></i><i></i><i></i><i></i>'));
  }

  set(gap: number, visible: boolean, ads: boolean): void {
    const g = Math.round(gap * 2) / 2;
    if (g !== this.gap) {
      this.gap = g;
      this.root.style.setProperty('--gap', `${g}px`);
    }
    if (visible !== this.vis) {
      this.vis = visible;
      this.root.hidden = !visible;
    }
    if (ads !== this.ads) {
      this.ads = ads;
      this.root.classList.toggle('is-ads', ads);
    }
  }

  hit(head: boolean, kill: boolean): void {
    this.root.classList.remove('is-hit', 'is-head', 'is-kill');
    void this.root.offsetWidth;
    this.root.classList.add(head ? 'is-head' : 'is-hit');
    if (kill) this.root.classList.add('is-kill');
    clearTimeout(this.hitTimer);
    this.hitTimer = window.setTimeout(() => this.root.classList.remove('is-hit', 'is-head', 'is-kill'), kill ? 380 : 220);
  }
}

// ------------------------------------------------------------ сбит

/** «Тебя залили краской!» — крупно по центру, под ним плашка «Попал Холодец · в бой через 2,4 с» (своим слотом центра) */
class PbDown {
  readonly root: HTMLElement;
  private readonly hero: HTMLElement;
  private readonly who: HTMLElement;
  private readonly time: HTMLElement;
  private shown = false;

  constructor(layer: HTMLElement) {
    this.root = layer.appendChild(h('div', 'k-slot k-slot--c pb-down pb-only'));
    this.root.hidden = true;
    this.hero = this.root.appendChild(h('div', 'k-hero k-hero--lose', '<p class="k-hero-title is-sm">Тебя залили краской!</p>'));
    const sub = this.hero.appendChild(h('span', 'k-hero-sub'));
    this.who = sub.appendChild(h('span', 'pb-down-who'));
    this.time = sub.appendChild(h('span', 'pb-down-time'));
  }

  show(killer: string | null, kTeam: number, how: string): void {
    let who: string;
    if (how === 'drown') who = killer ? `Столкнул в воду ${nameHtml(killer, kTeam)}` : 'Искупался в море';
    else if (!killer) who = 'Самоустранился';
    else if (how === 'awp') who = `Снял из AWP ${nameHtml(killer, kTeam)}`;
    else who = `Попал ${nameHtml(killer, kTeam)}`;
    this.who.innerHTML = who;
    put(this.time, '');
    this.root.hidden = false;
    this.shown = true;
    this.hero.classList.remove('is-pop');
    void this.hero.offsetWidth;
    this.hero.classList.add('is-pop');
  }

  setRespawn(sec: number): void {
    if (this.shown) put(this.time, sec > 0 ? `· в бой через ${sec1(sec)} с` : '· появляемся…');
  }

  hide(): void {
    this.shown = false;
    this.root.hidden = true;
  }
}

// ------------------------------------------------------------ таблицы

/** Две команды рядом: шапка «Черника 5», таблица игроков (У / С / П, связь), своя строка — золотом, боты — пилюлей */
function teamsHtml(rows: readonly RosterEntry[], myId: number, scores: readonly number[], ping: boolean): string {
  return [0, 1].map((t) => {
    const list = rows.filter((r) => r.team === t).sort((a, b) => b.k - a.k || a.d - b.d);
    const body = list.map((r) => `<tr${r.id === myId ? ' class="is-own"' : ''}><td><span class="k-who">${esc(r.name)}${r.bot ? '<span class="k-pill k-pill--xs">бот</span>' : ''}</span></td>`
      + `<td class="k-r">${r.k}</td><td class="k-r">${r.d}</td><td class="k-r">${r.a}</td>${ping ? `<td class="k-r pb-ping">${r.bot ? '' : `${r.ping} мс`}</td>` : ''}</tr>`).join('');
    return `<div class="mo-board-team t${t}"><div class="mo-board-head"><span class="mo-name t${t}">${TEAM_NAMES[t]}</span><b>${scores[t] ?? 0}</b></div>`
      + `<table class="k-table"><thead><tr><th>Игрок</th><th class="k-r">У</th><th class="k-r">С</th><th class="k-r">П</th>${ping ? '<th class="k-r">Связь</th>' : ''}</tr></thead><tbody>${body}</tbody></table></div>`;
  }).join('');
}

/** Tab — окно кита «Таблица боя»: держишь — открыто, отпустил — закрылось */
class PbBoard {
  readonly scrim: HTMLElement;
  private readonly time: HTMLElement;
  private readonly grid: HTMLElement;
  private html = '';

  constructor(parent: HTMLElement) {
    this.scrim = parent.appendChild(h('div', 'k-scrim pb-scrim pb-only'));
    this.scrim.dataset.mode = 'paintball';
    this.scrim.hidden = true;
    this.scrim.innerHTML = `<section class="k-window k-window--lg mo-board" aria-label="Таблица боя">
      <header class="k-win-head"><span class="k-win-portrait">${iconImg('paintballs', '')}</span><div class="k-win-titles"><p class="k-eyebrow">Пейнтбол · Склад</p><h2 class="k-win-title">Таблица боя</h2></div>
        <div class="k-win-tools"><span class="k-pill k-pill--lg">${iconImg('stopwatch')}<span class="pb-board-time">0:00</span></span></div></header>
      <div class="k-win-body mo-board-grid"></div>
      <footer class="k-win-foot"><span class="k-note">У — убил · С — сбит · П — помог</span><span class="k-note">Отпусти ${capHtml('Tab')} — вернуться в бой</span></footer></section>`;
    this.time = this.scrim.querySelector('.pb-board-time')!;
    this.grid = this.scrim.querySelector('.mo-board-grid')!;
  }

  show(on: boolean, rows: readonly RosterEntry[], myId: number, scores: readonly number[], time: string): void {
    if (!on) {
      if (!this.scrim.hidden) this.scrim.hidden = true;
      return;
    }
    const html = teamsHtml(rows, myId, scores, true);
    if (html !== this.html) {
      this.html = html;
      this.grid.innerHTML = html;
    }
    put(this.time, time);
    if (this.scrim.hidden) {
      this.scrim.hidden = false;
      const win = this.scrim.firstElementChild!;
      win.classList.remove('is-in');
      void (win as HTMLElement).offsetWidth;
      win.classList.add('is-in');
    }
  }
}

// ------------------------------------------------------------ всё вместе

export class PaintballUi {
  private readonly hud: Hud;
  private readonly kit: PbKit;
  private readonly top: TopCenter;
  private readonly feed: ModeFeed;
  private readonly stats: HTMLElement;
  private readonly tiles: HTMLElement;
  private readonly tileFace: HTMLElement;
  private readonly tileCap: HTMLElement;
  private readonly shieldNote: HTMLElement;
  private readonly vitals: PbVitals;
  private readonly cross: PbCross;
  private readonly down: PbDown;
  private readonly board: PbBoard;
  readonly results: ModeResults;
  /** Счёт, время и фаза — для плашки, Tab и строки «новый раунд через» */
  private readonly score: [number, number] = [0, 0];
  private limit = 50;
  private phase = '';
  private time = '0:00';
  private urgent = false;
  private scoreHtml = '';
  private bonusKey = '';
  private statsText = '';
  private shield = false;
  private readonly heroKeys = new Set<string>();

  /** hud — движок чисел (hud.ts); root — слой сцены (.hud): там прицел без масштаба */
  constructor(hud: Hud, root: HTMLElement, kit: PbKit) {
    this.hud = hud;
    this.kit = kit;
    this.top = kit.top;
    root.classList.add('pb-kit');
    const { slots } = kit;
    // верх-лево: служебная строка FPS (если включена в настройках) и лента сбитых
    this.stats = slots.tl.appendChild(h('div', 'k-faint pz-stats pb-stats pb-only'));
    this.stats.hidden = true;
    this.feed = new ModeFeed(slots.tl, 4, 5500);
    this.feed.root.classList.add('pb-feed', 'pb-only');
    // под бейджем: плитка бонуса автомата «+5 HP / +25 щит · +9 %»
    this.tiles = slots.tr.appendChild(h('div', 'k-tiles pb-tiles pb-only'));
    this.tiles.hidden = true;
    const tile = this.tiles.appendChild(h('div', 'k-tile'));
    this.tileFace = tile.appendChild(h('span', 'k-tile-face', iconImg('level', '')));
    this.tileCap = tile.appendChild(h('span', 'k-tile-cap'));
    // низ-центр: защита после появления — подсказкой над панелью бойца, пока действует
    this.shieldNote = slots.bc.appendChild(h('div', 'k-prompt pb-shield pb-only',
      `${iconImg('shield')}<span>Защита после появления</span><span class="k-prompt-sep"></span><span class="k-prompt-note">выстрел её снимет</span>`));
    this.shieldNote.hidden = true;
    this.vitals = new PbVitals(slots.bc);
    // прицел — слой без zoom в слое сцены (как .ft-world в крепости)
    const world = root.appendChild(h('div', 'k-world pb-world'));
    this.cross = new PbCross(world);
    this.down = new PbDown(slots.root);
    this.board = new PbBoard(kit.hudRoot);
    this.results = new ModeResults(kit.hudRoot);
    this.results.scrim.classList.add('pb-only');
    this.results.onAction = (id) => {
      if (id === 'leave') kit.leave();
    };
    this.adopt();
  }

  /** Числа и события Hud — в части кита (старые окна Hud в пейнтболе спрятаны в ui.css) */
  private adopt(): void {
    const pb = this.hud;
    const wrap = <K extends keyof Hud>(name: K, after: Hud[K]): void => {
      const orig = (pb[name] as (...a: unknown[]) => unknown).bind(pb);
      const mine = after as (...a: unknown[]) => unknown;
      (pb as unknown as Record<string, unknown>)[name] = (...a: unknown[]) => {
        orig(...a);
        mine(...a);
      };
    };
    // старое считает виньетку, «призрак» здоровья, класс .dead у слоя, оптику — его зовём тоже
    wrap('setVitals', (hp: number, maxHp: number, armor: number, maxArmor: number, prot: boolean) => {
      this.vitals.setHp(Math.max(0, Math.ceil(hp)), maxHp, Math.max(0, Math.ceil(armor)), maxArmor);
      if (prot !== this.shield) {
        this.shield = prot;
        this.shieldNote.hidden = !prot;
      }
    });
    wrap('setAwp', (on: boolean) => this.vitals.setAwp(on));
    wrap('setAmmo', (ammo: number, max: number, reload: number | null, low = 6) => this.vitals.setAmmo(ammo, max, reload, low));
    wrap('setDash', (ready: number) => this.vitals.setDash(ready));
    wrap('setCrosshair', (gap: number, visible: boolean, ads: boolean) => this.cross.set(gap, visible, ads));
    wrap('hitmarker', (head: boolean, kill: boolean) => this.cross.hit(head, kill));
    wrap('setRespawn', (sec: number) => this.down.setRespawn(sec));
    wrap('hideDeath', () => this.down.hide());
    wrap('setAliveUi', (alive: boolean) => this.vitals.setDown(!alive));
    wrap('setVisible', (v: boolean) => {
      if (!v) this.reset();
    });
    // остальное — только в кит
    pb.setScores = (a: number, b: number, limit: number) => {
      this.score[0] = a;
      this.score[1] = b;
      this.limit = limit;
      this.renderScore();
    };
    pb.setClock = (phaseText: string, seconds: number, urgent: boolean) => {
      const s = Math.max(0, Math.ceil(seconds));
      this.phase = phaseText;
      this.time = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      this.urgent = urgent;
      this.renderScore();
      // в итогах идёт пауза до нового раунда — её и показываем под наградой
      if (this.results.shown) this.results.note(`Новый раунд начнётся сам через ${s} с`, s / END_S);
    };
    pb.setBonus = (b: SlotBonus | null) => this.setBonus(b);
    pb.setStats = (text: string | null) => {
      const t = text ?? '';
      if (t === this.statsText) return;
      this.statsText = t;
      this.stats.hidden = !t;
      put(this.stats, t);
    };
    pb.killfeed = (killer, kTeam, victim, vTeam, head, how, mine) => this.killfeed(killer, kTeam, victim, vTeam, head, how, mine);
    pb.centerMessage = (text: string, sub = '', _color = '', ms = 1800) => this.center(text, sub, ms);
    pb.bannerMessage = (html: string, ms = 1600) => this.banner(html, ms);
    pb.showDeath = (killer: string | null, kTeam: number, how: string) => this.down.show(killer, kTeam, how);
    pb.showBoard = (show: boolean, rows: RosterEntry[], myId: number) => this.board.show(show, rows, myId, this.score, this.time);
    pb.showEnd = (winner, mvp, scores, rows, myId, myTeam) => this.showEnd(winner, mvp, scores, rows, myId, myTeam);
    pb.showReward = (text: string) => this.results.reward(text);
    pb.hideEnd = () => this.hideEnd();
    Object.defineProperty(pb, 'endShown', { get: () => this.results.shown, configurable: true });
  }

  /** Итоги на экране (мышь отпущена — кнопки нажимаются) */
  get endShown(): boolean {
    return this.results.shown;
  }

  // ------------------------------------------------------------ верх

  private renderScore(): void {
    const team = (t: 0 | 1): string => {
      const n = this.score[t];
      const name = `<span class="mo-team-name">${TEAM_NAMES[t]}</span>`;
      const num = `<b>${n}</b>`;
      return `<div class="mo-team mo-t${t}"><div class="mo-team-top">${t ? num + name : name + num}</div>${meterHtml(n / Math.max(1, this.limit), '', 'k-meter--thin')}</div>`;
    };
    const html = `${team(0)}<div class="mo-clock"><small>${esc(this.phase)}</small><b${this.urgent ? ' class="is-hurry"' : ''}>${this.time}</b></div>${team(1)}`;
    if (html === this.scoreHtml) return;
    this.scoreHtml = html;
    this.top.event({ key: SCORE_KEY, prio: PRIO.mode, html });
  }

  /** Центр Hud: «Бой!» — крупным баннером, «Разминка» и прочее — тостом под счётом */
  private center(text: string, sub: string, ms: number): void {
    const t = plain(text);
    const s = plain(sub);
    if (t.endsWith('!')) {
      const key = `${PB}c-${t}`;
      this.heroKeys.add(key);
      this.top.hero({ key, prio: PRIO.mode, tone: 'gold', title: t, sub: s || undefined, life: Math.min(HERO_MS, Math.max(2200, ms + 800)) });
      return;
    }
    this.top.toast({ key: `${PB}c-${t}`, tone: 'info', icon: uiIcon('roulette'), title: t, sub: s || undefined, life: Math.max(3200, ms + 800) });
  }

  /** Мелкие плашки Hud (серия, «сбит …», варенье, AWP) — тостами под счётом, с картинкой по смыслу */
  private banner(html: string, ms: number): void {
    const head = html.trimStart().startsWith('🎯');
    const text = plain(html);
    const cut = text.indexOf(' — ');
    let title = cut < 0 ? text : text.slice(0, cut);
    let sub = cut < 0 ? '' : text.slice(cut + 3);
    let key = 'b';
    let icon = uiIcon('paint');
    let tone: 'info' | 'reward' | 'good' = 'good';
    if (text.startsWith('AWP!')) {
      key = 'awp';
      icon = cannonUrl;
      tone = 'reward';
    } else if (text.startsWith('AWP пуста')) {
      key = 'awp';
      icon = uiIcon('marker');
      tone = 'info';
    } else if (text.startsWith('Варенье')) {
      key = 'jam';
      icon = uiIcon('heart');
    } else if (text.startsWith('Серия')) {
      key = 'streak';
      tone = 'reward';
    } else if (text.startsWith('Сбит') || text.startsWith('Снят')) {
      key = 'kill';
      if (head && !text.startsWith('Снят')) sub = 'в голову';
    } else {
      title = text;
      sub = '';
    }
    this.top.toast({ key: `${PB}${key}`, tone, icon, title, sub: sub || undefined, life: Math.max(2400, ms + 800) });
  }

  // ------------------------------------------------------------ лента и бонус

  private killfeed(killer: string, kTeam: number, victim: string, vTeam: number, head: boolean, how: string, mine: boolean): void {
    // снят из AWP — золотой ярлык; в голову — картинка в золотом кольце; утонул — круг; сам — белый флаг
    const mid = how === 'awp'
      ? `<span class="k-pill k-pill--gold k-pill--xs pb-awp${head ? ' pb-head' : ''}">AWP</span>`
      : iconImg(how === 'drown' ? 'buoy' : how === 'self' ? 'white-flag' : 'paint', head ? 'k-ic pb-head' : 'k-ic');
    this.feed.push(`${killer ? nameHtml(killer, kTeam) : ''}${mid}${nameHtml(victim, vTeam)}`, { own: mine });
  }

  private setBonus(b: SlotBonus | null): void {
    const key = b ? `${b.hp}|${b.armor}|${b.dmg}|${b.jackpot}` : '';
    if (key === this.bonusKey) return;
    this.bonusKey = key;
    this.tiles.hidden = !b;
    if (!b) return;
    const parts: string[] = [];
    if (b.hp) parts.push(`+${b.hp} HP`);
    if (b.armor) parts.push(`+${b.armor} щит`);
    if (b.dmg) parts.push(`+${Math.round(b.dmg * 100)} %`);
    const main = parts.shift() ?? 'бонус';
    this.tileCap.innerHTML = `<b>${esc(main)}</b>${parts.length ? `<small>${esc(parts.join(' · '))}</small>` : ''}`;
    this.tileFace.parentElement!.classList.toggle('k-tile--own', b.jackpot);
  }

  // ------------------------------------------------------------ итоги

  private showEnd(winner: number, mvp: RosterEntry | null, scores: [number, number], rows: RosterEntry[], myId: number, myTeam: number): void {
    const title = winner < 0 ? 'Ничья!' : winner === myTeam ? 'Победа!' : 'Поражение';
    const count = `<b class="mo-name t0">${scores[0]}</b> : <b class="mo-name t1">${scores[1]}</b>`;
    const sub = winner < 0 ? `Счёт равный · ${count}` : `Побеждает «${TEAM_NAMES[winner]}» · ${count}`;
    const extra = mvp
      ? `<div class="mo-mvp"><span class="k-pill k-pill--gold">${iconImg('medal-gold')}Лучший игрок: <b>${esc(mvp.name)}</b> — ${mvp.k} / ${mvp.d}</span></div>`
      : '';
    this.down.hide();
    this.board.show(false, [], 0, this.score, '');
    this.results.show({
      mode: 'paintball', eyebrow: 'Пейнтбол · Склад', title, lose: winner >= 0 && winner !== myTeam, wide: true, sub, extra,
      body: `<div class="mo-board-grid">${teamsHtml(rows, myId, scores, false)}</div>`,
      note: 'Новый раунд начнётся сам через несколько секунд', noteFrac: null,
      actions: [{ id: 'leave', label: 'На набережную', key: TOUCH ? undefined : 'Esc', tone: 'ghost' }],
    });
    this.kit.freeMouse();
  }

  private hideEnd(): void {
    if (!this.results.shown) return;
    this.results.hide();
    this.kit.wantMouse();
  }

  // ------------------------------------------------------------ уход

  /** Ушли со склада: свои плашка, тосты, баннеры и окна — прочь (чужие уведомления остаются) */
  reset(): void {
    this.top.clear(SCORE_KEY);
    this.scoreHtml = '';
    this.top.clearToasts(PB);
    for (const k of this.heroKeys) this.top.clearHero(k);
    this.heroKeys.clear();
    this.feed.clear();
    this.down.hide();
    this.board.show(false, [], 0, this.score, '');
    this.results.hide();
    this.bonusKey = '';
    this.tiles.hidden = true;
    this.shield = false;
    this.shieldNote.hidden = true;
  }
}
