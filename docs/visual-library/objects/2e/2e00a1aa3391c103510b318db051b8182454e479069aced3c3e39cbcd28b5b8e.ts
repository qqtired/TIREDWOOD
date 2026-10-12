// Тревога «Крепости» под верхней полосой: «Ворота трещат!», «Ворота пали!», «Кристалл под ударом!», атаки боссов и
// крылаток. У тревоги про ворота и кристалл — стрелка, куда бежать (крутится от взгляда), и сколько метров;
// у атак с отсчётом — полоска времени.
import { CRYSTAL, GATE } from '../../../shared/fortmap.ts';
import { ARROW_SVG, el, setText } from './dom.ts';

export type AlarmTarget = 'gate' | 'crystal' | null;

const TARGETS = {
  gate: { x: (GATE.x0 + GATE.x1) / 2, z: GATE.face + 0.4 },
  crystal: { x: CRYSTAL.x, z: CRYSTAL.z },
} as const;

/** Ближе этого стрелка не нужна — уже на месте */
const NEAR_M = 7;

export interface Viewer {
  x: number;
  z: number;
  /** Взгляд: 0 — на север (−z), растёт против часовой */
  yaw: number;
}

export class Alarms {
  readonly root: HTMLElement;
  private readonly text: HTMLElement;
  private readonly arrow: HTMLElement;
  private readonly arrowIcon: HTMLElement;
  private readonly dist: HTMLElement;
  private readonly time: HTMLElement;
  private target: AlarmTarget = null;
  private end = 0;
  private start = 0;
  private timed = false;
  private key = '';

  constructor(parent: HTMLElement) {
    this.root = el('div', 'fu-alarm', parent);
    this.root.setAttribute('role', 'alert');
    this.text = el('span', 'fu-alarm-text', this.root);
    this.arrow = el('span', 'fu-alarm-arrow', this.root);
    this.arrowIcon = el('i', '', this.arrow);
    this.arrowIcon.innerHTML = ARROW_SVG;
    this.dist = el('small', '', this.arrow);
    this.time = el('i', 'fu-alarm-time', this.root);
  }

  /** Показать тревогу; timed — с полоской отсчёта (атака с меткой) */
  show(text: string, ms = 2600, target: AlarmTarget = null, timed = false): void {
    const now = performance.now();
    const key = `${text}|${target}`;
    // та же тревога — просто продлить, без мигания
    if (key === this.key && now < this.end) {
      this.end = Math.max(this.end, now + ms);
      return;
    }
    this.key = key;
    this.target = target;
    this.start = now;
    this.end = now + ms;
    this.timed = timed;
    setText(this.text, text);
    this.root.classList.toggle('timed', timed);
    this.root.classList.toggle('calm', /^🔔|^🛡/.test(text));
    this.root.classList.remove('show');
    void this.root.offsetWidth;
    this.root.classList.add('show');
  }

  update(me: Viewer | null): void {
    const now = performance.now();
    if (!this.root.classList.contains('show')) return;
    if (now >= this.end) {
      this.root.classList.remove('show');
      this.key = '';
      return;
    }
    if (this.timed) this.time.style.transform = `scaleX(${Math.max(0, (this.end - now) / Math.max(1, this.end - this.start))})`;
    const t = this.target ? TARGETS[this.target] : null;
    let showArrow = false;
    if (t && me) {
      const dx = t.x - me.x;
      const dz = t.z - me.z;
      const d = Math.hypot(dx, dz);
      if (d > NEAR_M) {
        showArrow = true;
        // направление на цель в тех же единицах, что и взгляд; вправо — по часовой на экране
        const bearing = Math.atan2(-dx, -dz);
        const rel = bearing - me.yaw;
        this.arrowIcon.style.transform = `rotate(${(-rel * 180) / Math.PI}deg)`;
        setText(this.dist, `${Math.round(d)} м`);
      }
    }
    this.arrow.hidden = !showArrow;
  }

  clear(): void {
    this.root.classList.remove('show');
    this.key = '';
  }
}
