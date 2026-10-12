import { ZS_SIEGE_APPROACH, ZS_SIEGE_DEPLOY, ZS_SIEGE_WINDUP, ZS_SIEGE_ACTION, ZS_SIEGE_OPEN } from '../../../shared/fortsiege.ts';
// Полоса босса «Крепости» — плашкой события верх-центра (кит: .k-event, приоритет босса — выше плашки волны):
// имя (и круг: II, III …) и «Ярость», «волна 7 · ещё 12 зомби», процент, полоса 16 со «следом» урона; окно уязвимости —
// второй, бирюзовой полосой «Ядро открыто — огонь! 2,4 с»; ниже — одна строка «что делать» (красная — уйди с метки,
// бирюзовая — бей). У Кракена — щупальца и голова маленькими полосками. Тексты атак — по состояниям из снимка.
import {
  BOSS_OPEN_TICKS, ZS_BOSS_APPROACH, ZS_BOSS_BOMB, ZS_BOSS_GATE, ZS_BOSS_OPEN, ZS_BOSS_PULSE, ZS_CHARGE, ZS_CHARGE_WARN, ZS_HOWL, ZS_QUAKE,
  ZS_STOMP, ZS_THROW,
} from '../../../shared/fort.ts';
import { TICK_RATE } from '../../../shared/constants.ts';
import { PRIO, escHtml, type TopCenter } from '../../ui/kit/topcenter.ts';
import { num, roman } from './dom.ts';
import { fortImg } from './icons.ts';
import { bossInfo } from './schedule.ts';
import { foeIcon, sec1 } from './text.ts';

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
  /** Полное HP (ui/schedule.ts bossMaxHp): на полосе «1 628 / 2 200»; 0 — только проценты */
  max?: number;
  rage?: boolean;
  parts?: readonly BossPart[];
  /** Своё имя и вид (иначе — по виду врага): части супер-босса, превью */
  name?: string;
  super?: boolean;
  /** Своя строка «что делает» (Кракен: под водой, оглушён …) вместо текста по состоянию */
  status?: string;
  /** Полное окно уязвимости, тиков (у Кракена оглушение дольше); по умолчанию — BOSS_OPEN_TICKS */
  openTicks?: number;
  /** Опасная атака (строка «что делать» красная); по умолчанию — по состоянию (DANGER). Новые боссы — client/fort/bosses-f.ts */
  danger?: boolean;
}

/** Что босс делает сейчас (Барон, Таран, Валун — server/fort/bosses.ts) */
export function bossAttackText(state: number): string {
  switch (state) {
    case ZS_SIEGE_APPROACH: return 'Подходит — займите стену';
    case ZS_SIEGE_DEPLOY: return 'Разворачивается — стреляйте в механизм';
    case ZS_SIEGE_WINDUP: return 'Готовит удар — уйдите с метки или сорвите механизм';
    case ZS_SIEGE_ACTION: return 'Атакует — прочь из опасной зоны';
    case ZS_SIEGE_OPEN: return 'Механизм открыт — огонь!';
    case ZS_BOSS_APPROACH: return 'Подходит — займите стену';
    case ZS_BOSS_GATE: return 'Замах по воротам — уйдите с красной метки';
    case ZS_BOSS_BOMB: return 'Прицельный залп — уйдите с метки';
    case ZS_BOSS_PULSE: return 'Волна по кругу — выйдите из круга или прыгните';
    case ZS_CHARGE_WARN: return 'Разбег — уйдите с красной дорожки';
    case ZS_CHARGE: return 'Рывок!';
    case ZS_STOMP: return 'Встаёт на дыбы — прыгайте';
    case ZS_HOWL: return 'Воет — сейчас выбегут шустрики';
    case ZS_THROW: return 'Камень — уйдите из круга';
    case ZS_QUAKE: return 'Трясёт стену — прыгайте';
    default: return 'Броня держит — ждите, когда откроется ядро';
  }
}

/** Опасные состояния: строка «что делать» краснеет */
const DANGER = new Set([ZS_SIEGE_WINDUP, ZS_SIEGE_ACTION, ZS_BOSS_GATE, ZS_BOSS_BOMB, ZS_BOSS_PULSE, ZS_CHARGE_WARN, ZS_CHARGE, ZS_STOMP, ZS_THROW, ZS_QUAKE]);
const KEY = 'fort-boss';
/** «След» урона стоит столько, потом догоняет полосу (доля в секунду) */
const TRAIL_WAIT = 0.4;
const TRAIL_SPEED = 0.6;

const meter = (v: number, cls: string, g = v, label = ''): string =>
  `<span class="k-meter ${cls}" style="--v:${v.toFixed(3)};--g:${g.toFixed(3)}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i>${label ? `<span class="k-meter-label">${label}</span>` : ''}</span>`;

export class BossBar {
  private readonly top: TopCenter;
  private shown = false;
  private look = -1;
  private trail = 1;
  private trailAt = 0;
  private lastAt = 0;
  private wave = 0;
  private left = 0;

  constructor(top: TopCenter) {
    this.top = top;
  }

  /** Волна и сколько врагов осталось — подстрокой плашки */
  setWave(wave: number, left: number): void {
    this.wave = wave;
    this.left = left;
  }

  get active(): boolean {
    return this.shown;
  }

  set(v: BossView | null): void {
    if (!v || !(v.frac > 0)) {
      if (this.shown) this.top.clear(KEY);
      this.shown = false;
      this.look = -1;
      return;
    }
    const base = bossInfo(v.kind);
    const sup = v.super ?? base.super;
    const name = v.name ?? base.name;
    const look = v.kind * 2 + (sup ? 1 : 0);
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, Math.max(0, now - this.lastAt));
    this.lastAt = now;
    const frac = Math.max(0, Math.min(1, v.frac));
    // «след»: новый босс или лечение — сразу; урон — постоит и догонит
    if (look !== this.look || frac > this.trail) {
      this.trail = frac;
      this.trailAt = now;
    } else if (frac < this.trail && now - this.trailAt > TRAIL_WAIT) {
      this.trail = Math.max(frac, this.trail - TRAIL_SPEED * dt);
    } else if (frac >= this.trail) this.trailAt = now;
    this.look = look;
    const pct = Math.max(0, Math.min(100, Math.ceil(frac * 100)));
    const rage = v.rage ?? v.stage >= 2;
    const open = v.state === ZS_BOSS_OPEN || v.state === ZS_SIEGE_OPEN;
    const mechanism = v.state === ZS_SIEGE_OPEN;
    const danger = v.danger ?? DANGER.has(v.state);
    const icon = `<span class="k-event-ic">${fortImg(sup ? 'kraken' : foeIcon(v.kind))}</span>`;
    const pill = sup ? '<span class="k-pill k-pill--special k-pill--sm">супер-босс</span>' : rage ? '<span class="k-pill k-pill--bad k-pill--sm">Ярость</span>' : '';
    const title = `<div class="k-event-title">${escHtml(name)}${v.tier ? ` ${roman(v.tier + 1)}` : ''} ${pill}</div>`;
    const sub = `<div class="k-event-sub">волна ${num(this.wave)} · ещё ${num(this.left)} ${sup ? 'врагов' : 'зомби'}</div>`;
    const timer = `<div class="k-event-timer">${pct}%</div>`;
    const max = v.max ?? 0;
    const nums = max > 0 ? `${num(Math.max(1, Math.round(frac * max)))} / ${num(max)}` : '';
    let html = icon + title + sub + timer + meter(frac, `${sup ? 'k-meter--special' : 'k-meter--bad'} ft-bar`, this.trail, nums);
    // окно уязвимости (у Кракена — оглушение): вторая, бирюзовая полоса с секундами, пока отсчёт идёт
    const timed = open && v.wind > 0;
    if (timed) {
      const w = Math.max(0, Math.min(1, v.wind / (v.openTicks ?? BOSS_OPEN_TICKS)));
      html += meter(w, 'k-meter--info ft-bar', w, `${sup ? 'Оглушён — огонь по голове!' : mechanism ? 'Механизм открыт — огонь!' : 'Ядро открыто — огонь!'} ${sec1(v.wind / TICK_RATE)} с`);
    }
    const parts = v.parts ?? [];
    if (parts.length) {
      html += `<div class="ft-parts">${parts.map((p) => `<div class="ft-part${p.frac <= 0 ? ' is-off' : ''}"><span>${escHtml(p.label.toLowerCase())}</span>${meter(Math.max(0, Math.min(1, p.frac)), /голов/i.test(p.label) ? 'k-meter--special' : 'k-meter--bad')}</div>`).join('')}</div>`;
    }
    const doText = open && (timed || !v.status) ? `<b>Бей в ${sup ? 'голову' : mechanism ? 'механизм' : 'ядро'}</b> — арбалет больнее всего` : `<b>${escHtml(v.status ?? bossAttackText(v.state))}</b>`;
    const doCls = open ? ' is-go' : danger ? ' is-danger' : '';
    html += `<div class="ft-do${doCls}">${fortImg(open ? 'crossbow' : 'warn')}<span>${doText}</span></div>`;
    this.top.event({ key: KEY, prio: PRIO.boss, tone: sup ? 'special' : 'danger', lamp: true, html });
    this.shown = true;
  }
}
