// Новичку в «Крепости»: три подсказки за первую игру (что защищать, куда целиться, на что тратить золото) — карточкой
// в стопке тостов под плашкой волны (как на странице lab/ui «Крепость»), то, о чём речь, подсвечено золотой рамкой;
// потом молчим. Подсказка у лестниц (W — наверх, S — вниз) — в подсказке действия (ui/vitals.ts). Стрелки у края экрана
// на угрозы вне поля зрения (кит: .k-edge) — липучка на стене, крылатка на пике, босс, лодка десанта, ящик припасов,
// ворота и кристалл, пока о них тревога.
import type * as THREE from 'three';
import { Vector3 } from 'three';
import { LADDERS } from '../../../shared/fortladder.ts';
import { FT_BREAK, FT_END, FT_GATHER, FT_WAVE } from '../../../shared/fort.ts';
import { TOUCH } from '../../touch.ts';
import type { TopCenter } from '../../ui/kit/topcenter.ts';
import { el } from './dom.ts';
import { fortIcon, fortImg } from './icons.ts';

// ------------------------------------------------------------ три подсказки первой игры

const COACH_KEY = 'fort.coach.v1';
/** Ключ тоста подсказки (начинается с ft- — уходит вместе с тостами крепости) */
const COACH_TOAST = 'ft-coach';

/** На что показать золотой рамкой: карточку крепости, гранату, золото */
export type CoachSpot = 'fort' | 'gren' | 'gold';

interface Tip {
  title: string;
  html: string;
  spot: CoachSpot;
  ms: number;
}

const key = (k: string, touch: string): string => (TOUCH ? touch : `<kbd class="k-key k-key--sm">${k}</kbd>`);

const TIPS: readonly Tip[] = [
  { title: 'Защити кристалл', spot: 'fort', ms: 12000,
    html: `Разбили кристалл во дворе — игра окончена. Стреляй со стены: ${key('W', 'вперёд')} лицом к лестнице.` },
  { title: 'Целься в голову', spot: 'gren', ms: 10000,
    html: `В голову — больнее. За сбитых — золото. ${key('G', 'Кнопка гранаты')} — граната в толпу у ворот.` },
  { title: 'Трать золото', spot: 'gold', ms: 12000,
    html: `${key('E', 'Касание')} у прилавка на террасе — урон, темп, стволы. Башни — у флажков на стене.` },
];

function loadStep(): number {
  try {
    return Number(localStorage.getItem(COACH_KEY) ?? 0) || 0;
  } catch {
    return TIPS.length;
  }
}

function saveStep(n: number): void {
  try {
    localStorage.setItem(COACH_KEY, String(n));
  } catch {
    /* приватный режим — подсказки покажутся ещё раз, не страшно */
  }
}

export class Coach {
  /** Что подсветить сейчас (null — ничего) */
  onSpot: (spot: CoachSpot | null) => void = () => {};
  private readonly top: TopCenter;
  private step = loadStep();
  private showing = -1;
  private until = 0;
  private started = 0;
  private sawWave = false;

  /** top — верх-центр кита: подсказка — тост в общей стопке под плашкой волны (как на странице) */
  constructor(top: TopCenter) {
    this.top = top;
  }

  /** Подсказка на экране или вот-вот встанет в этой фазе (новых врагов тостами в это время не представляем) */
  busy(phase: number): boolean {
    return this.showing >= 0 || this.next(phase) >= 0;
  }

  /** Какую подсказку показать в этой фазе (-1 — никакую) */
  private next(phase: number): number {
    if (this.step >= TIPS.length || phase === FT_END) return -1;
    if (this.step === 0 && (phase === FT_GATHER || phase === FT_BREAK || phase === FT_WAVE)) return 0;
    if (this.step === 1 && phase === FT_WAVE) return 1;
    if (this.step === 2 && phase === FT_BREAK && this.sawWave) return 2;
    return -1;
  }

  private show(i: number): void {
    const tip = TIPS[i];
    this.showing = i;
    this.started = performance.now();
    this.until = this.started + tip.ms;
    // полоса времени тает сама (ui.css: --life), без правок каждый кадр
    const html = `<div class="k-toast-title"><span class="ft-coach-n">Новичку · ${i + 1} из ${TIPS.length}</span>${tip.title}</div>`
      + `<div class="k-toast-sub">${tip.html}</div>`
      + `<span class="k-meter k-meter--thin k-meter--mode ft-coach-time" style="--life:${tip.ms}ms"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span>`;
    this.top.toast({ key: COACH_TOAST, tone: 'info', icon: fortIcon('scroll'), title: tip.title, life: tip.ms, cls: 'ft-coach', html });
    this.onSpot(tip.spot);
  }

  /** Подсказка прочитана: шаг дальше и запомнить */
  private finish(): void {
    if (this.showing < 0) return;
    this.step = Math.max(this.step, this.showing + 1);
    saveStep(this.step);
    this.close();
  }

  /** Убрать с экрана, не засчитывая */
  private close(): void {
    if (this.showing >= 0) this.top.clearToasts(COACH_TOAST);
    this.showing = -1;
    this.onSpot(null);
  }

  update(phase: number, alive: boolean): void {
    const now = performance.now();
    if (this.showing >= 0) {
      // первая подсказка уходит раньше, если началась волна: дальше — вторая
      const early = this.showing === 0 && phase === FT_WAVE && now - this.started > 4000;
      if (now >= this.until || early || phase === FT_END) this.finish();
      return;
    }
    if (phase === FT_WAVE) this.sawWave = true;
    if (!alive) return;
    const i = this.next(phase);
    if (i >= 0) this.show(i);
  }

  /** Ушли из крепости посреди подсказки: убрать, не засчитывая (покажется в следующий раз) */
  hide(): void {
    this.close();
  }

  /** Для превью: подсказки уже показаны (не мешают другим сценам) */
  skip(): void {
    this.close();
    this.step = TIPS.length;
  }

  /** Для превью и тестов: начать сначала */
  restart(): void {
    this.close();
    this.step = 0;
    this.sawWave = false;
    saveStep(0);
  }
}

// ------------------------------------------------------------ лестницы

/** У подножия лестницы — «наверх», наверху рядом с ней — «вниз» */
export function ladderHint(x: number, y: number, z: number): 'up' | 'down' | null {
  for (const l of LADDERS) {
    const fx = l.x + l.nx * 0.75;
    const fz = l.z + l.nz * 0.75;
    if (y < l.y0 + 0.6 && Math.hypot(x - fx, z - fz) < 1.7) return 'up';
    const tx = l.x - l.nx * 0.9;
    const tz = l.z - l.nz * 0.9;
    if (Math.abs(y - l.y1) < 0.7 && Math.hypot(x - tx, z - tz) < 1.3) return 'down';
  }
  return null;
}

// ------------------------------------------------------------ стрелки у края экрана

export type ThreatKind = 'climb' | 'fly' | 'boss' | 'boat' | 'crate' | 'gate' | 'crystal';

export interface Threat {
  x: number;
  y: number;
  z: number;
  kind: ThreatKind;
  /** Картинка и имя (босс — свой) */
  icon?: string;
  name?: string;
}

const ICON: Record<ThreatKind, string> = { climb: 'climber', fly: 'bat', boss: 'boss', boat: 'landing', crate: 'supply', gate: 'gate', crystal: 'crystal' };
const TEXT: Record<ThreatKind, string> = { climb: 'на стене', fly: 'пикирует', boss: 'босс', boat: 'десант', crate: 'припасы', gate: 'ворота', crystal: 'кристалл' };
const TONE: Record<ThreatKind, string> = { climb: 'bad', fly: 'bad', boss: 'bad', boat: 'bad', crate: 'gold', gate: 'bad', crystal: 'info' };
/** В одной стрелке — самая важная угроза */
const RANK: Record<ThreatKind, number> = { gate: 6, crystal: 6, boss: 5, boat: 4, fly: 3, climb: 2, crate: 1 };
const ARROWS = 5;
/** Угол, в котором угрозы сливаются в одну стрелку */
const BIN = (24 * Math.PI) / 180;
/** Центр круга — так далеко от края экрана (px сцены 1440×900, × масштаб HUD) */
const EDGE = 40;

interface ArrowEl {
  root: HTMLElement;
  disc: HTMLElement;
  label: HTMLElement;
  icon: string;
  text: string;
}

const _v = new Vector3();

export class EdgeArrows {
  readonly root: HTMLElement;
  private readonly pool: ArrowEl[] = [];
  private readonly bins = new Map<number, { dx: number; dy: number; n: number; d: number; t: Threat }>();

  constructor(parent: HTMLElement) {
    this.root = el('div', 'ft-edges', parent);
    for (let i = 0; i < ARROWS; i++) {
      const root = el('div', 'k-edge', this.root);
      root.hidden = true;
      const disc = el('span', 'k-edge-disc', root);
      const label = el('span', 'k-edge-label', root);
      this.pool.push({ root, disc, label, icon: '', text: '' });
    }
  }

  update(threats: readonly Threat[], camera: THREE.Camera, w: number, h: number, k: number): void {
    this.bins.clear();
    for (const t of threats) {
      _v.set(t.x, t.y, t.z).project(camera);
      const behind = _v.z > 1;
      let dx = behind ? -_v.x : _v.x;
      let dy = behind ? _v.y : -_v.y;
      if (!behind && Math.abs(dx) < 0.92 && Math.abs(dy) < 0.84) continue; // и так видно
      if (behind && Math.hypot(dx, dy) < 0.05) dy = 1;
      const bin = Math.round(Math.atan2(dy, dx) / BIN);
      const d = camera.position.distanceTo(_v.set(t.x, t.y, t.z));
      const b = this.bins.get(bin);
      if (!b) this.bins.set(bin, { dx, dy, n: 1, d, t });
      else {
        if (t.kind === b.t.kind) b.n++;
        if (RANK[t.kind] > RANK[b.t.kind] || (RANK[t.kind] === RANK[b.t.kind] && d < b.d)) {
          if (t.kind !== b.t.kind) b.n = 1;
          Object.assign(b, { dx, dy, d, t });
        }
      }
    }
    let i = 0;
    const m = EDGE * k;
    for (const b of this.bins.values()) {
      if (i >= ARROWS) break;
      const a = this.pool[i++];
      // по эллипсу внутри экрана: углы (карточка, плитки, чат, панель бойца) и верх с плашкой волны остаются свободными
      const ang = Math.atan2(b.dy, b.dx);
      const x = w / 2 + Math.cos(ang) * (w / 2 - m);
      const y = h / 2 + Math.sin(ang) * (h / 2) * 0.58;
      const t = b.t;
      const icon = t.icon ?? ICON[t.kind];
      if (icon !== a.icon) {
        a.icon = icon;
        a.disc.innerHTML = fortImg(icon);
      }
      const text = `${t.name ?? TEXT[t.kind]}${b.n > 1 ? ` ×${b.n}` : ''} · <b>${Math.round(b.d)} м</b>`;
      if (text !== a.text) {
        a.text = text;
        a.label.innerHTML = text;
      }
      const side = x < w * 0.3 ? ' k-edge--left' : x > w * 0.7 ? ' k-edge--right' : y > h * 0.6 ? ' k-edge--up' : '';
      const hot = t.kind === 'fly' || t.kind === 'gate' || t.kind === 'crystal' ? ' is-hot' : '';
      a.root.className = `k-edge k-edge--${TONE[t.kind]}${t.kind === 'boss' ? ' k-edge--lg' : ''}${side}${hot}`;
      a.root.style.left = `${Math.round(x)}px`;
      a.root.style.top = `${Math.round(y)}px`;
      a.root.style.setProperty('--a', `${Math.round((ang * 180) / Math.PI)}deg`);
      a.root.hidden = false;
    }
    for (; i < ARROWS; i++) this.pool[i].root.hidden = true;
  }

  clear(): void {
    for (const a of this.pool) a.root.hidden = true;
  }
}
