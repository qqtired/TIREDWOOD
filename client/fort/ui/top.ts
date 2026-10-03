// Верхняя полоса «Крепости»: волна N из последней (в бою — сколько сбито, в паузе — отсчёт до волны), ворота и
// кристалл (полоса со «следом» урона, ступени укрепления, вспышка при ударе), золото со всплывающей прибавкой.
// Под ней — «⚠ дальше босс». Слева под мини-картой — состав команды: кто жив и сколько у кого золота.
import { FT_BREAK, FT_END, FT_GATHER, FT_WAVE } from '../../../shared/fort.ts';
import { CRYSTAL_TIERS, GATE_TIERS } from '../../../shared/fortarsenal.ts';
import { iconUrl } from '../stall.ts';
import { el, num, replay, setText } from './dom.ts';
import { bossOfWave, lastWave } from './schedule.ts';
import { snapWidth } from './boss.ts';

export interface TeamRow {
  id: number;
  name: string;
  gold: number;
  alive: boolean;
  me: boolean;
  ready?: boolean;
}

export interface TopView {
  phase: number;
  wave: number;
  /** До конца фазы, с */
  leftS: number;
  /** Врагов осталось (с ещё не вышедшими) */
  enemies: number;
  gold: number;
  gate: number;
  gateMax: number;
  gateTier: number;
  crystal: number;
  crystalMax: number;
  crystalTier: number;
}

class Meter {
  readonly root: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly ghost: HTMLElement;
  private readonly pct: HTMLElement;
  private readonly pips: HTMLElement[] = [];
  private readonly label: string;
  private last = -1;
  private tier = -1;

  constructor(parent: HTMLElement, cls: string, icon: string, tiers: number, label: string) {
    this.label = label;
    this.root = el('div', `fu-plate fu-meter ${cls}`, parent);
    const src = iconUrl(icon);
    if (src) {
      const img = el('img', 'fu-mico', this.root);
      img.src = src;
      img.alt = '';
    }
    const body = el('div', 'fu-mbody', this.root);
    const line = el('div', 'fu-mline', body);
    el('span', 'fu-mlabel', line, label);
    this.pct = el('b', 'fu-mpct', line);
    const bar = el('div', 'fu-mbar', body);
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', label);
    this.ghost = el('i', 'ghost', bar);
    this.fill = el('i', 'fill', bar);
    const pips = el('div', 'fu-pips', body);
    for (let i = 0; i < tiers; i++) this.pips.push(el('i', '', pips));
  }

  set(hp: number, max: number, tier: number): void {
    const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((hp / max) * 100))) : 0;
    // «пали» — отдельно от процента: 0 % ещё стоят, 0 HP — пали
    const key = hp > 0 ? pct : -1;
    if (key !== this.last) {
      if (pct > this.last) snapWidth(this.ghost, pct);
      else this.ghost.style.width = `${pct}%`;
      this.fill.style.width = `${pct}%`;
      this.last = key;
      setText(this.pct, hp > 0 ? `${pct}%` : 'пали');
      this.root.classList.toggle('low', hp > 0 && pct <= 30);
      this.root.classList.toggle('down', hp <= 0);
    }
    if (tier !== this.tier) {
      this.tier = tier;
      this.pips.forEach((p, i) => p.classList.toggle('on', i < tier));
      this.root.title = `${this.label}: ${num(hp)} из ${num(max)} · укрепление ${tier} из ${this.pips.length}`;
    }
  }

  hurt(): void {
    replay(this.root, 'hit');
  }
}

export class TopBar {
  readonly root: HTMLElement;
  private readonly wavePlate: HTMLElement;
  private readonly phaseEl: HTMLElement;
  private readonly waveN: HTMLElement;
  private readonly prog: HTMLElement;
  private readonly info: HTMLElement;
  readonly gate: Meter;
  readonly crystal: Meter;
  private readonly goldEl: HTMLElement;
  private readonly goldN: HTMLElement;
  private readonly plus: HTMLElement;
  readonly next: HTMLElement;
  private total = 0;
  private phaseTotal = 0;
  private lastPhase = -1;
  private lastWave = -1;
  private gold = -1;
  private plusSum = 0;
  private plusUntil = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'fu-top', parent);
    this.wavePlate = el('div', 'fu-plate fu-wave', this.root);
    const n = el('div', 'fu-wave-n', this.wavePlate);
    this.phaseEl = el('span', 'fu-wave-phase', n, 'Сбор');
    this.waveN = el('b', '', n, '1');
    el('span', 'fu-wave-of', n, `из ${lastWave()}`);
    const side = el('div', 'fu-wave-side', this.wavePlate);
    this.info = el('span', 'fu-wave-info', side);
    const prog = el('div', 'fu-prog', side);
    this.prog = el('i', '', prog);
    this.gate = new Meter(this.root, 'fu-gate', 'gate', GATE_TIERS, 'Ворота');
    this.crystal = new Meter(this.root, 'fu-crys', 'crystal', CRYSTAL_TIERS, 'Кристалл');
    this.goldEl = el('div', 'fu-plate fu-gold', this.root);
    this.goldEl.title = 'Золото этой игры: за сбитых, общак и бонус волны; тратится у прилавка, ворот, кристалла и на башни';
    el('i', 'fu-coin', this.goldEl);
    this.goldN = el('b', '', this.goldEl, '0');
    this.plus = el('em', 'fu-plus', this.goldEl);
    this.next = el('div', 'fu-next', parent);
  }

  update(v: TopView): void {
    // волна: сколько всего — наибольшее «осталось» с начала волны; пауза — наибольший отсчёт с её начала
    if (v.phase !== this.lastPhase || v.wave !== this.lastWave) {
      this.lastPhase = v.phase;
      this.lastWave = v.wave;
      this.total = 0;
      this.phaseTotal = 0;
    }
    this.total = Math.max(this.total, v.enemies);
    this.phaseTotal = Math.max(this.phaseTotal, v.leftS);
    const fight = v.phase === FT_WAVE;
    const calm = v.phase === FT_GATHER || v.phase === FT_BREAK;
    const shown = calm ? v.wave + 1 : v.wave;
    setText(this.phaseEl, v.phase === FT_GATHER ? 'Сбор' : v.phase === FT_BREAK ? 'Передышка' : v.phase === FT_END ? 'Итоги' : 'Волна');
    setText(this.waveN, String(Math.max(1, Math.min(lastWave(), shown))));
    this.wavePlate.classList.toggle('fight', fight);
    this.wavePlate.classList.toggle('calm', calm);
    let frac = 0;
    if (fight) {
      setText(this.info, v.enemies > 0 ? `🧟 ${num(v.enemies)} осталось` : 'Добиваем…');
      frac = this.total > 0 ? 1 - v.enemies / this.total : 0;
    } else if (calm) {
      const s = Math.max(0, Math.ceil(v.leftS));
      setText(this.info, `до волны ${s} с`);
      frac = this.phaseTotal > 0 ? Math.max(0, v.leftS) / this.phaseTotal : 0;
      this.wavePlate.classList.toggle('urgent', v.leftS < 5.5);
    } else {
      setText(this.info, '');
    }
    if (!calm) this.wavePlate.classList.remove('urgent');
    this.prog.style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;

    this.gate.set(v.gate, v.gateMax, v.gateTier);
    this.crystal.set(v.crystal, v.crystalMax, v.crystalTier);

    // золото: прибавка всплывает и копится, пока сыплется
    const now = performance.now();
    if (this.gold >= 0 && v.gold > this.gold) {
      this.plusSum = now < this.plusUntil ? this.plusSum + (v.gold - this.gold) : v.gold - this.gold;
      this.plusUntil = now + 1100;
      setText(this.plus, `+${num(this.plusSum)}`);
      replay(this.plus, 'show');
      replay(this.goldEl, 'bump');
    } else if (this.gold >= 0 && v.gold < this.gold) {
      replay(this.goldEl, 'spend');
    }
    if (v.gold !== this.gold) setText(this.goldN, num(v.gold));
    this.gold = v.gold;

    // впереди босс: в паузе перед ним и всю волну перед ним (десант — сюрприз, о нём заранее ни слова)
    const ahead = calm ? v.wave + 1 : fight ? v.wave + 1 : 0;
    const boss = ahead > 0 ? bossOfWave(ahead) : null;
    const thisBoss = calm ? null : bossOfWave(v.wave);
    let note = '';
    if (boss && !thisBoss) note = `${calm ? 'Волна с боссом' : 'Дальше босс'}: ${boss.icon} ${boss.name}`;
    setText(this.next, note ? `⚠ ${note}` : '');
    this.next.classList.toggle('show', !!note);
    this.next.classList.toggle('super', !!boss?.super);
  }

  /** Новая игра: прибавка золота не всплывает от сброса */
  reset(): void {
    this.gold = -1;
    this.lastPhase = -1;
  }
}

/** Состав команды под мини-картой */
export class TeamList {
  readonly root: HTMLElement;
  private key = '';

  constructor(parent: HTMLElement) {
    this.root = el('div', 'fu-team', parent);
    this.root.setAttribute('aria-label', 'Защитники');
  }

  update(rows: readonly TeamRow[], calm: boolean): void {
    const key = rows.map((r) => `${r.id}|${r.name}|${r.gold}|${r.alive}|${calm && r.ready}`).join(';');
    if (key === this.key) return;
    this.key = key;
    this.root.hidden = rows.length < 2;
    this.root.replaceChildren(
      ...rows.map((r) => {
        const row = el('div', `fu-tm${r.me ? ' me' : ''}${r.alive ? '' : ' down'}`);
        el('i', 'fu-dot', row).title = r.alive ? 'в бою' : 'повален — встанет на террасе';
        el('span', 'fu-tname', row, r.name);
        if (calm && r.ready) el('span', 'fu-tready', row, '🔔');
        el('b', 'fu-tgold', row, num(r.gold));
        return row;
      }),
    );
  }
}
