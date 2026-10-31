// Карточки выбора набора (флаг PAINT4): в разминке и после «Тебя залили краской!» — ряд из четырёх карточек над
// панелью бойца. Детали кита (client/ui/kit): подложка .k-plate, клавиша .k-key в углу (как ячейки оружия .k-arm),
// тонкие полосы .k-meter, своё — золотой рамкой (как .k-arm.is-on). Выбор: клавиши 1–4, колесо мыши, клик.
// Мышь в бою захвачена игрой, поэтому пока сбит (камера сама смотрит на обидчика), движение мыши ведёт по карточкам
// свою стрелку, а ЛКМ выбирает; в разминке мышь — прицел, там колесо и клавиши. Без захвата (телефон, свободная мышь) —
// обычные кнопки.
import { KITS, KIT_COUNT } from '../../../shared/paint4.ts';
import { TOUCH } from '../../touch.ts';
import { h, iconImg, meterHtml } from '../../ui/kit/dom.ts';
import './cards.css';

const BARS = ['урон', 'темп', 'дальность'] as const;

/** warmup — разминка; down — сбит (мышью своей стрелкой); spawn — только появился, под защитой (клавиши и колесо) */
export type CardsMode = 'warmup' | 'down' | 'spawn';

export class KitCards {
  readonly root: HTMLElement;
  private readonly head: HTMLElement;
  private readonly cards: HTMLButtonElement[] = [];
  private readonly cursor: HTMLElement;
  private sel = 0;
  private hover = -1;
  private mode: CardsMode | null = null;
  /** Стрелка мыши поверх карточек (пока сбит), px от левого верхнего угла ряда */
  private cx = 0;
  private cy = 0;
  private virtual = false;
  /** Где ходит стрелка: края ряда в её собственных координатах */
  private box = { x0: 0, y0: 0, x1: 0, y1: 0 };
  /** Игрок выбрал набор k */
  onPick: (k: number) => void = () => {};

  constructor(parent: HTMLElement) {
    // над панелью бойца: первым в нижнем слоте
    this.root = parent.insertBefore(h('div', 'p4-cards pb-only'), parent.firstChild);
    this.root.hidden = true;
    this.head = this.root.appendChild(h('div', 'k-plate p4-cards-head'));
    const row = this.root.appendChild(h('div', 'p4-cards-row'));
    for (let k = 0; k < KIT_COUNT; k++) {
      const s = KITS[k];
      const b = row.appendChild(h('button', 'k-plate p4-card')) as HTMLButtonElement;
      b.type = 'button';
      b.dataset.k = String(k);
      b.style.setProperty('--i', String(k));
      const bars = BARS.map((name, i) => `<span class="p4-bar"><small>${name}</small>${meterHtml(s.card[i], i === 0 ? 'bad' : i === 1 ? 'good' : 'info', 'k-meter--thin')}</span>`).join('');
      b.innerHTML = `${TOUCH ? '' : `<kbd class="k-key k-key--sm k-key--tr">${k + 1}</kbd>`}`
        + `<span class="p4-card-ic">${iconImg(s.id, '')}</span><b class="p4-card-name">${s.name}</b>`
        + `<span class="p4-card-good">${s.good}</span><span class="p4-card-weak">${s.weak}</span><span class="p4-bars">${bars}</span>`;
      b.addEventListener('click', (e) => {
        e.preventDefault();
        this.pick(k);
      });
      b.addEventListener('pointerenter', () => this.setHover(k));
      b.addEventListener('pointerleave', () => this.setHover(-1));
      this.cards.push(b);
    }
    this.cursor = this.root.appendChild(h('i', 'p4-cursor'));
    this.cursor.hidden = true;
    this.renderSel();
  }

  get shown(): boolean {
    return this.mode !== null;
  }

  get selected(): number {
    return this.sel;
  }

  /** Какой набор сейчас (свой выбор или ответ сервера) */
  setSelected(k: number): void {
    if (k === this.sel) return;
    this.sel = k;
    this.renderSel();
  }

  /** Показать (разминка или сбит) или спрятать; virtual — мышь захвачена: своя стрелка поверх карточек */
  show(mode: CardsMode | null, virtual = false): void {
    if (mode === this.mode && virtual === this.virtual) return;
    const was = this.mode;
    this.mode = mode;
    this.virtual = virtual && mode === 'down' && !TOUCH;
    this.root.hidden = mode === null;
    this.root.dataset.mode = mode ?? '';
    if (mode === null) {
      this.setHover(-1);
      this.cursor.hidden = true;
      return;
    }
    const keys = TOUCH ? '' : `<kbd class="k-key k-key--sm">1</kbd>–<kbd class="k-key k-key--sm">4</kbd>`;
    const how = TOUCH ? 'нажми на карточку' : mode === 'down' ? `${keys} или мышью` : `${keys} или колесо`;
    const title = mode === 'warmup' ? 'Выбери набор' : 'Сменить набор';
    const tail = mode === 'down' ? 'в бой — с ним' : mode === 'spawn' ? 'пока не выстрелил' : `у всех — ведёрко на ${TOUCH ? 'кнопке' : '<kbd class="k-key k-key--sm">G</kbd>'}`;
    this.head.innerHTML = `<b>${title}</b><span class="p4-cards-how">${how}</span><span class="p4-cards-sep"></span><span class="p4-cards-how">${tail}</span>`;
    if (was !== mode && !(was === 'down' && mode === 'spawn')) {
      this.root.classList.remove('is-in');
      void this.root.offsetWidth;
      this.root.classList.add('is-in');
    }
    this.cursor.hidden = !this.virtual;
    if (this.virtual) {
      // начало координат стрелки меряем на экране: слои HUD могут сдвигать её от ряда
      this.cursor.style.transform = 'translate(0px, 0px)';
      const o = this.cursor.getBoundingClientRect();
      const r = this.root.getBoundingClientRect();
      const c = this.cards[this.sel].getBoundingClientRect();
      this.box = { x0: r.left - o.left, y0: r.top - o.top, x1: r.right - o.left, y1: r.bottom - o.top };
      this.cx = c.left - o.left + c.width / 2;
      this.cy = c.top - o.top + c.height * 0.6;
      this.moveCursor(0, 0);
    }
  }

  /** Захваченная мышь сдвинулась (пока сбит): ведём свою стрелку */
  moveCursor(dx: number, dy: number): void {
    if (!this.virtual) return;
    const b = this.box;
    this.cx = Math.max(b.x0, Math.min(b.x1, this.cx + dx));
    this.cy = Math.max(b.y0, Math.min(b.y1, this.cy + dy));
    this.cursor.style.transform = `translate(${this.cx}px, ${this.cy}px)`;
    // остриё — там, где стрелку видно на экране (как бы ни стояли слои HUD)
    const tip = this.cursor.getBoundingClientRect();
    const x = tip.left;
    const y = tip.top;
    let over = -1;
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i].getBoundingClientRect();
      if (x >= c.left && x <= c.right && y >= c.top && y <= c.bottom) over = i;
    }
    this.setHover(over);
  }

  /** ЛКМ при захваченной мыши: выбрать карточку под стрелкой. true — съели клик */
  clickVirtual(): boolean {
    if (!this.virtual || this.hover < 0) return false;
    this.pick(this.hover);
    return true;
  }

  /** Колесо: соседний набор по кругу */
  wheel(dir: number): void {
    this.pick((this.sel + (dir > 0 ? 1 : KIT_COUNT - 1)) % KIT_COUNT);
  }

  pick(k: number): void {
    if (k < 0 || k >= KIT_COUNT) return;
    const changed = k !== this.sel;
    this.sel = k;
    this.renderSel();
    const b = this.cards[k];
    b.classList.remove('is-pick');
    void b.offsetWidth;
    b.classList.add('is-pick');
    if (changed) this.onPick(k);
  }

  private setHover(k: number): void {
    if (k === this.hover) return;
    if (this.hover >= 0) this.cards[this.hover]?.classList.remove('is-hover');
    this.hover = k;
    if (k >= 0) this.cards[k].classList.add('is-hover');
  }

  private renderSel(): void {
    this.cards.forEach((c, i) => c.classList.toggle('is-on', i === this.sel));
  }
}
