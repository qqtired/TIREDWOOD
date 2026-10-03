// Полоса босса «Крепости» сверху: имя (и круг: II, III …), фаза и ярость, большая полоса здоровья со «следом»
// урона, что он делает сейчас; окно уязвимости — отдельной бирюзовой полосой с отсчётом «огонь!». У супер-босса
// (Кракен) — морской вид и полоски частей (голова, щупальца). Тексты атак — по состояниям из снимка.
import { BOSS_OPEN_TICKS, ZS_BOSS_APPROACH, ZS_BOSS_BOMB, ZS_BOSS_GATE, ZS_BOSS_OPEN, ZS_BOSS_PULSE } from '../../../shared/fort.ts';
import { el, roman, setText } from './dom.ts';
import { bossInfo } from './schedule.ts';

export interface BossPart {
  label: string;
  frac: number;
}

export interface BossView {
  /** Доля здоровья 0…1; 0 — спрятать */
  frac: number;
  stage: number;
  state: number;
  /** Отсчёт текущего состояния, тиков (у окна — сколько ещё открыто) */
  wind: number;
  kind: number;
  /** Круг босса: 0 — первый, 1 — II … */
  tier?: number;
  rage?: boolean;
  parts?: readonly BossPart[];
  /** Своё имя и вид (иначе — по виду врага): части супер-босса, превью */
  name?: string;
  super?: boolean;
}

const STAGES = ['', 'Осадник', 'Повелитель налёта', 'Ярость'];

/** Что босс делает сейчас; слияние с fort: добавить их состояния (разбег, рёв, камень …) */
export function bossAttackText(state: number): string {
  switch (state) {
    case ZS_BOSS_APPROACH: return 'Идёт к воротам — займите стену';
    case ZS_BOSS_GATE: return 'Замах по воротам — уйдите с красной метки';
    case ZS_BOSS_BOMB: return 'Прицельный залп — уйдите с метки';
    case ZS_BOSS_PULSE: return 'Удар по стене — выйдите из круга или прыгните';
    default: return 'Броня держит — ждите, когда откроется ядро';
  }
}

/** Ширина без перехода (лечение, новый босс) */
export function snapWidth(e: HTMLElement, pct: number): void {
  e.classList.add('snap');
  e.style.width = `${pct}%`;
  void e.offsetWidth;
  e.classList.remove('snap');
}

export class BossBar {
  readonly root: HTMLElement;
  private readonly ico: HTMLElement;
  private readonly name: HTMLElement;
  private readonly phase: HTMLElement;
  private readonly pct: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly ghost: HTMLElement;
  private readonly parts: HTMLElement;
  private readonly status: HTMLElement;
  private readonly window: HTMLElement;
  private readonly windowFill: HTMLElement;
  private lastFrac = 1;
  private shownKind = -1;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'fu-boss', parent);
    const head = el('div', 'fu-boss-head', this.root);
    this.ico = el('span', 'fu-boss-ico', head);
    this.name = el('b', 'fu-boss-name', head);
    this.phase = el('span', 'fu-boss-phase', head);
    this.pct = el('b', 'fu-boss-pct', head);
    const bar = el('div', 'fu-boss-bar', this.root);
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    this.ghost = el('i', 'ghost', bar);
    this.fill = el('i', 'fill', bar);
    this.parts = el('div', 'fu-boss-parts', this.root);
    this.status = el('div', 'fu-boss-status', this.root);
    this.window = el('div', 'fu-boss-window', this.root);
    this.windowFill = el('i', '', this.window);
  }

  set(v: BossView | null): void {
    const show = !!v && v.frac > 0;
    this.root.classList.toggle('show', show);
    if (!v || !show) {
      this.shownKind = -1;
      this.lastFrac = 1;
      return;
    }
    const base = bossInfo(v.kind);
    const info = { ...base, name: v.name ?? base.name, super: v.super ?? base.super, icon: v.super && !base.super ? '🐙' : base.icon };
    const look = v.kind * 2 + (info.super ? 1 : 0);
    if (this.shownKind !== look) {
      this.shownKind = look;
      this.root.classList.toggle('super', info.super);
      snapWidth(this.ghost, Math.ceil(v.frac * 100));
      this.lastFrac = v.frac;
    }
    setText(this.ico, info.icon);
    setText(this.name, `${info.name}${v.tier ? ` ${roman(v.tier + 1)}` : ''}`);
    const rage = v.rage ?? v.stage >= 3;
    this.root.classList.toggle('rage', rage);
    setText(this.phase, rage ? 'Ярость' : STAGES[v.stage] ?? '');
    this.phase.hidden = !this.phase.textContent;
    const pct = Math.max(0, Math.min(100, Math.ceil(v.frac * 100)));
    setText(this.pct, `${pct}%`);
    this.fill.style.width = `${pct}%`;
    this.fill.parentElement!.setAttribute('aria-valuenow', String(pct));
    this.fill.parentElement!.setAttribute('aria-label', `Здоровье: ${info.name}`);
    // «след» урона догоняет полосу с задержкой (переход в CSS); лечение — сразу
    if (v.frac > this.lastFrac + 0.001) snapWidth(this.ghost, pct);
    else if (v.frac < this.lastFrac - 0.001) this.ghost.style.width = `${pct}%`;
    this.lastFrac = v.frac;

    const open = v.state === ZS_BOSS_OPEN;
    this.root.classList.toggle('open', open);
    if (open) {
      setText(this.status, `Ядро открыто — огонь! ${(Math.max(0, v.wind) / 60).toFixed(1).replace('.', ',')} с`);
      this.windowFill.style.transform = `scaleX(${Math.max(0, Math.min(1, v.wind / BOSS_OPEN_TICKS))})`;
    } else {
      setText(this.status, bossAttackText(v.state));
    }
    this.root.classList.toggle('danger', v.state === ZS_BOSS_GATE || v.state === ZS_BOSS_BOMB || v.state === ZS_BOSS_PULSE);

    const parts = v.parts ?? [];
    this.parts.hidden = parts.length === 0;
    while (this.parts.childElementCount < parts.length) {
      const p = el('span', 'fu-part', this.parts);
      el('small', '', p);
      el('i', '', el('span', 'fu-part-bar', p));
    }
    for (let i = 0; i < this.parts.childElementCount; i++) {
      const node = this.parts.children[i] as HTMLElement;
      const part = parts[i];
      node.hidden = !part;
      if (!part) continue;
      setText(node.firstElementChild as HTMLElement, part.label);
      (node.querySelector('.fu-part-bar i') as HTMLElement).style.width = `${Math.round(Math.max(0, Math.min(1, part.frac)) * 100)}%`;
      node.classList.toggle('gone', part.frac <= 0);
    }
  }
}
