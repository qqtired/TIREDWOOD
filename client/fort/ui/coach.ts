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
import { el, setText } from './dom.ts';
import { fortImg } from './icons.ts';

// ------------------------------------------------------------ три подсказки первой игры

const COACH_KEY = 'fort.coach.v1';

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
  readonly card: HTMLElement;
  /** Что подсветить сейчас (null — ничего) */
  onSpot: (spot: CoachSpot | null) => void = () => {};
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly count: HTMLElement;
  private readonly time: HTMLElement;
  private step = loadStep();
  private showing = -1;
  private until = 0;
  private started = 0;
  private sawWave = false;

  /** slot — верх-центр (.k-slot--tc): карточка встаёт под тостами */
  constructor(slot: HTMLElement) {
    this.card = el('div', 'k-toast ft-coach');
    this.card.dataset.mode = 'fort';
    this.card.setAttribute('role', 'note');
    this.card.hidden = true;
    el('span', 'k-toast-ic', this.card).innerHTML = fortImg('scroll');
    const head = el('div', 'k-toast-title', this.card);
    this.count = el('span', 'ft-coach-n', head);
    this.title = el('span', '', head);
    this.body = el('div', 'k-toast-sub', this.card);
    this.time = el('span', 'k-meter k-meter--thin k-meter--mode ft-coach-time', this.card);
    this.time.innerHTML = '<i class="k-meter-ghost"></i><i class="k-meter-fill"></i>';
    slot.append(this.card);
  }

  private show(i: number): void {
    const tip = TIPS[i];
    this.showing = i;
    this.started = performance.now();
    this.until = this.started + tip.ms;
    setText(this.title, tip.title);
    setText(this.count, `Новичку · ${i + 1} из ${TIPS.length}`);
    this.body.innerHTML = tip.html;
    this.card.hidden = false;
    this.card.classList.remove('is-new');
    void this.card.offsetWidth;
    this.card.classList.add('is-new');
    this.onSpot(tip.spot);
  }

  private finish(): void {
    if (this.showing < 0) return;
    this.step = Math.max(this.step, this.showing + 1);
    saveStep(this.step);
    this.showing = -1;
    this.card.hidden = true;
    this.onSpot(null);
  }

  update(phase: number, alive: boolean): void {
    const now = performance.now();
    if (this.showing >= 0) {
      const v = Math.max(0, (this.until - now) / (this.until - this.started));
      this.time.style.setProperty('--v', v.toFixed(2));
      // первая подсказка уходит раньше, если началась волна: дальше — вторая
      const early = this.showing === 0 && phase === FT_WAVE && now - this.started > 4000;
      if (now >= this.until || early || phase === FT_END) this.finish();
      return;
    }
    if (this.step >= TIPS.length || phase === FT_END || !alive) return;
    if (phase === FT_WAVE) this.sawWave = true;
    if (this.step === 0 && (phase === FT_GATHER || phase === FT_BREAK || phase === FT_WAVE)) this.show(0);
    else if (this.step === 1 && phase === FT_WAVE) this.show(1);
    else if (this.step === 2 && phase === FT_BREAK && this.sawWave) this.show(2);
  }

  /** Ушли из крепости: подсказка — прочь (шаг сохранён) */
  hide(): void {
    if (this.showing >= 0) this.finish();
  }

  /** Для превью: подсказки уже показаны (не мешают другим сценам) */
  skip(): void {
    this.step = TIPS.length;
    this.showing = -1;
    this.card.hidden = true;
    this.onSpot(null);
  }

  /** Для превью и тестов: начать сначала */
  restart(): void {
    this.step = 0;
    this.showing = -1;
    this.sawWave = false;
    saveStep(0);
    this.card.hidden = true;
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
