// Новичку в «Крепости»: три подсказки за первую игру (что защищать, куда целиться, на что тратить золото) — и потом
// молчим; подсказка у лестниц (как у стоек: W — наверх, S — вниз); стрелки у края экрана на угрозы вне поля
// зрения — липучка на стене, крылатка на пике, босс, лодка десанта.
import type * as THREE from 'three';
import { Vector3 } from 'three';
import { LADDERS } from '../../../shared/fortladder.ts';
import { FT_BREAK, FT_END, FT_GATHER, FT_WAVE } from '../../../shared/fort.ts';
import { TOUCH } from '../../touch.ts';
import { ARROW_SVG, el, setText } from './dom.ts';

// ------------------------------------------------------------ три подсказки первой игры

const COACH_KEY = 'fort.coach.v1';

interface Tip {
  title: string;
  lines: readonly string[];
  ms: number;
}

const k = (key: string, touch: string) => (TOUCH ? touch : `<kbd>${key}</kbd>`);

const TIPS: readonly Tip[] = [
  {
    title: 'Защитите кристалл',
    lines: [
      'Зомби ломают ворота 🚪 и идут к кристаллу 💎 во дворе. Разбили кристалл — игра окончена.',
      `Стреляйте со стены: лестницы во дворе — ${k('W', 'вперёд')} лицом к лестнице.`,
    ],
    ms: 12000,
  },
  {
    title: 'Целься в голову',
    lines: [
      'Попадание в голову — больше урона. За каждого сбитого — золото 💰, часть идёт в общак команды.',
      `${k('G', 'Кнопка гранаты')} — граната в толпу у ворот.`,
    ],
    ms: 10000,
  },
  {
    title: 'Тратьте золото',
    lines: [
      `${k('E', 'Касание')} у прилавка на террасе — урон, темп, второй ствол. На стене у флажков — места для башен.`,
      'Ворота и кристалл чинят и укрепляют у них самих. Дальше — сами, удачи!',
    ],
    ms: 12000,
  },
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
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly count: HTMLElement;
  private readonly time: HTMLElement;
  private step = loadStep();
  private showing = -1;
  private until = 0;
  private started = 0;
  private sawWave = false;

  constructor(parent: HTMLElement) {
    this.card = el('div', 'fu-coach', parent);
    this.card.setAttribute('role', 'note');
    const head = el('div', 'fu-coach-head', this.card);
    this.title = el('b', '', head);
    this.count = el('span', 'fu-coach-n', head);
    this.body = el('div', 'fu-coach-body', this.card);
    this.time = el('i', 'fu-coach-time', this.card);
  }

  /** Показать подсказку шага, если до него дошли */
  private show(i: number): void {
    const tip = TIPS[i];
    this.showing = i;
    this.started = performance.now();
    this.until = this.started + tip.ms;
    setText(this.title, tip.title);
    setText(this.count, `${i + 1} из ${TIPS.length}`);
    this.body.innerHTML = tip.lines.map((l) => `<p>${l}</p>`).join('');
    this.card.classList.add('show');
  }

  private finish(): void {
    if (this.showing < 0) return;
    this.step = Math.max(this.step, this.showing + 1);
    saveStep(this.step);
    this.showing = -1;
    this.card.classList.remove('show');
  }

  update(phase: number, alive: boolean): void {
    const now = performance.now();
    if (this.showing >= 0) {
      this.time.style.transform = `scaleX(${Math.max(0, (this.until - now) / (this.until - this.started))})`;
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

  /** Для превью: подсказки уже показаны (не мешают другим сценам) */
  skip(): void {
    this.step = TIPS.length;
    this.showing = -1;
    this.card.classList.remove('show');
  }

  /** Для превью и тестов: начать сначала */
  restart(): void {
    this.step = 0;
    this.showing = -1;
    this.sawWave = false;
    saveStep(0);
    this.card.classList.remove('show');
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

export class LadderTip {
  readonly root: HTMLElement;
  private readonly key: HTMLElement;
  private readonly text: HTMLElement;
  private last: 'up' | 'down' | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'fu-ladder', parent);
    this.key = el('b', 'ft-key', this.root);
    this.text = el('span', '', this.root);
  }

  update(kind: 'up' | 'down' | null): void {
    if (kind === this.last) return;
    this.last = kind;
    this.root.classList.toggle('show', kind !== null);
    if (!kind) return;
    if (kind === 'up') {
      setText(this.key, TOUCH ? '⬆' : 'W');
      setText(this.text, TOUCH ? 'лицом к лестнице — вперёд, наверх' : 'лицом к лестнице — наверх, на стену');
    } else {
      setText(this.key, TOUCH ? '⬇' : 'S');
      setText(this.text, 'спиной к краю — вниз по лестнице · или просто спрыгни');
    }
  }
}

// ------------------------------------------------------------ стрелки у края экрана

export type ThreatKind = 'climb' | 'fly' | 'boss' | 'boat' | 'crate';

export interface Threat {
  x: number;
  y: number;
  z: number;
  kind: ThreatKind;
}

const THREAT_ICON: Record<ThreatKind, string> = { climb: '🧗', fly: '🦇', boss: '👑', boat: '⛵', crate: '📦' };
const THREAT_TEXT: Record<ThreatKind, string> = { climb: 'на стене', fly: 'пикирует', boss: 'босс', boat: 'десант', crate: 'припасы' };
const ARROWS = 5;
/** Угол, в котором угрозы сливаются в одну стрелку */
const BIN = (24 * Math.PI) / 180;

interface ArrowEl {
  root: HTMLElement;
  icon: HTMLElement;
  pointer: HTMLElement;
  label: HTMLElement;
}

const _v = new Vector3();

export class EdgeArrows {
  readonly root: HTMLElement;
  private readonly pool: ArrowEl[] = [];
  private readonly bins = new Map<number, { dx: number; dy: number; n: number; d: number; kind: ThreatKind }>();

  constructor(parent: HTMLElement) {
    this.root = el('div', 'fu-edges', parent);
    for (let i = 0; i < ARROWS; i++) {
      const root = el('div', 'fu-edge', this.root);
      const pointer = el('i', 'fu-edge-ptr', root);
      pointer.innerHTML = ARROW_SVG;
      const icon = el('span', 'fu-edge-ico', root);
      const label = el('small', '', root);
      this.pool.push({ root, icon, pointer, label });
    }
  }

  update(threats: readonly Threat[], camera: THREE.Camera, w: number, h: number): void {
    this.bins.clear();
    for (const t of threats) {
      _v.set(t.x, t.y, t.z).project(camera);
      const behind = _v.z > 1;
      let dx = behind ? -_v.x : _v.x;
      let dy = behind ? _v.y : -_v.y;
      if (!behind && Math.abs(dx) < 0.92 && Math.abs(dy) < 0.84) continue; // и так видно
      if (behind && Math.hypot(dx, dy) < 0.05) dy = 1;
      const ang = Math.atan2(dy, dx);
      const bin = Math.round(ang / BIN);
      const d = camera.position.distanceTo(_v.set(t.x, t.y, t.z));
      const b = this.bins.get(bin);
      // в одной стрелке — самая важная угроза (босс > лодка > крылатка > липучка) и самая близкая
      const rank = (k: ThreatKind) => (k === 'boss' ? 4 : k === 'boat' ? 3 : k === 'fly' ? 2 : k === 'crate' ? 0 : 1);
      if (!b) this.bins.set(bin, { dx, dy, n: 1, d, kind: t.kind });
      else {
        b.n++;
        if (rank(t.kind) > rank(b.kind) || (rank(t.kind) === rank(b.kind) && d < b.d)) {
          b.kind = t.kind;
          b.d = d;
          b.dx = dx;
          b.dy = dy;
        }
      }
    }
    let i = 0;
    for (const b of this.bins.values()) {
      if (i >= ARROWS) break;
      const a = this.pool[i++];
      // по эллипсу внутри экрана: углы (патроны, стволы, здоровье) и низ с подсказками остаются свободными
      const ang = Math.atan2(b.dy, b.dx);
      const x = w / 2 + Math.cos(ang) * (w / 2) * 0.86;
      const y = h / 2 + Math.sin(ang) * (h / 2) * 0.6;
      a.root.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      a.pointer.style.transform = `rotate(${(ang * 180) / Math.PI + 90}deg) translateY(-30px)`;
      setText(a.icon, THREAT_ICON[b.kind]);
      setText(a.label, `${THREAT_TEXT[b.kind]}${b.n > 1 ? ` ×${b.n}` : ''} · ${Math.round(b.d)} м`);
      a.root.className = `fu-edge show k-${b.kind}`;
    }
    for (; i < ARROWS; i++) this.pool[i].root.classList.remove('show');
  }

  clear(): void {
    for (const a of this.pool) a.root.classList.remove('show');
  }
}
