// «Крепость 50»: строка «Стены» в карточке крепости — под воротами и кристаллом, в том же виде (значок, полоса,
// число). Значок — план крепости из 11 участков: цвет участка — его стадия (цела, трещины, обвал зубцов, пролом).
// Число — самый слабый участок; есть пролом — «дыра» («дыры»), обвал бастиона — «обвал». Удар по участку — строка вздрагивает, как у ворот.
import { WALL_SECTIONS, WS_BREACH, wallStage } from '../../../shared/fort50.ts';
import { el, setText } from '../ui/dom.ts';

const HIT_MS = 650;
/** План в осях крепости: x −22…22, z −20…15 → 36 × 30 */
const VX = -22;
const VZ = -20;
const VW = 44;
const VH = 35;

export class WallRow {
  readonly root: HTMLElement;
  private readonly pct: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly cells: SVGRectElement[] = [];
  private last = '';
  private hitTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'ft-hp ft-walls', parent);
    this.root.hidden = true;
    this.root.title = 'Стены: 11 участков. Пролом — враги идут в дыру. Чинить — E у участка';
    this.root.setAttribute('aria-label', 'Стены');
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'ft-hp-ic ft-walls-plan');
    svg.setAttribute('viewBox', `${VX - 1} ${VZ - 1} ${VW + 2} ${VH + 2}`);
    svg.setAttribute('aria-hidden', 'true');
    // контур крепости: стены и бастионы — тихой линией, двор пустой
    const base = document.createElementNS(ns, 'path');
    base.setAttribute('class', 'ft-walls-base');
    base.setAttribute('d', 'M-18 -13 H-21 V-19 H-15 V-16 H15 V-19 H21 V-13 H18 V14 H-18 Z');
    svg.append(base);
    for (const s of WALL_SECTIONS) {
      const [x0, x1, z0, z1] = s.hole;
      const r = document.createElementNS(ns, 'rect');
      // участок толще своей дыры — его видно на 32 пикселях
      const pad = 0.6;
      r.setAttribute('x', String(x0 - pad));
      r.setAttribute('y', String(z0 - pad));
      r.setAttribute('width', String(x1 - x0 + pad * 2));
      r.setAttribute('height', String(z1 - z0 + pad * 2));
      r.setAttribute('rx', '0.8');
      r.dataset.stage = '0';
      svg.append(r);
      this.cells.push(r);
    }
    this.root.append(svg);
    this.pct = el('b', 'ft-hp-pct', this.root);
    this.bar = el('span', 'k-meter k-meter--mode', this.root);
    this.bar.innerHTML = '<i class="k-meter-ghost"></i><i class="k-meter-fill"></i>';
  }

  set(hp: readonly number[], max: readonly number[]): void {
    this.root.hidden = false;
    let sum = 0;
    let total = 0;
    let weakest = 1;
    let holes = 0;
    let passes = 0;
    const stages: number[] = [];
    for (let i = 0; i < WALL_SECTIONS.length; i++) {
      const h = Math.max(0, hp[i] ?? 0);
      const m = Math.max(1, max[i] ?? 1);
      sum += h;
      total += m;
      weakest = Math.min(weakest, h / m);
      const st = wallStage(h, m);
      if (st === WS_BREACH) {
        holes++;
        if (WALL_SECTIONS[i].kind === 'passage') passes++;
      }
      stages.push(st);
    }
    const v = total > 0 ? sum / total : 1;
    const key = `${stages.join('')}|${Math.round(weakest * 100)}|${Math.round(v * 100)}`;
    if (key === this.last) return;
    this.last = key;
    stages.forEach((st, i) => { this.cells[i].dataset.stage = String(st); });
    // сквозной пролом важнее обвала бастиона: туда идут враги. Слово короткое, как «пали» у ворот: в плашке три узкие
    // ячейки, сколько дыр — видно по красным участкам плана
    const word = passes ? (passes > 1 ? 'дыры' : 'дыра') : 'обвал';
    setText(this.pct, holes ? word : `${Math.round(weakest * 100)}%`);
    const low = holes > 0 || weakest < 0.4;
    this.root.classList.toggle('is-low', low);
    this.bar.className = `k-meter ${low ? 'k-meter--bad' : 'k-meter--mode'}`;
    this.bar.style.setProperty('--v', v.toFixed(3));
    this.bar.style.setProperty('--g', v.toFixed(3));
    this.root.setAttribute('aria-label', holes ? `Стены: проломов ${holes}` : `Стены: слабейший участок ${Math.round(weakest * 100)}%`);
  }

  hurt(sec: number): void {
    const c = this.cells[sec];
    if (!c) return;
    this.root.classList.add('is-hit');
    c.classList.add('is-hit');
    clearTimeout(this.hitTimer);
    this.hitTimer = window.setTimeout(() => {
      this.root.classList.remove('is-hit');
      for (const x of this.cells) x.classList.remove('is-hit');
    }, HIT_MS);
  }

  reset(): void {
    clearTimeout(this.hitTimer);
    this.root.classList.remove('is-hit');
    this.last = '';
  }
}
