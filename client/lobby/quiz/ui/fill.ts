// «Ракушка» 1.1, C6: заливка «Крокодила» — чистая функция без DOM, одинаковая у всех клиентов (бриф «C6»). Холст 1024 × 768
// делится на сетку 512 × 384 (клетка 2 × 2 px). Мазки по порядку кладутся в маску «линия» без сглаживания: клетка — линия,
// если её центр ближе половины толщины мазка к его отрезкам; ластик снимает и линию, и заливку под собой. Заливка ['f', id,
// цвет, x, y] красит связную (по 4 соседям) область без линий от клетки (x, y) и заходит на клетку под соседние линии — мазки
// лежат поверх заливок и прячут её край, без белой каймы. Клик прямо по линии ничего не красит. Сетку держит InkCanvas
// (easel.ts): живой рисунок дописывается по кусочку, отмена и «весь рисунок» — проход заново (fillLayer).
import { QZ_CROC } from '../../../../shared/quiz/types.ts';

/** Шаг сетки в пикселях холста и её размер */
export const FILL_STEP = 2;
export const GW = QZ_CROC.W / FILL_STEP;
export const GH = QZ_CROC.H / FILL_STEP;

/** Мазок и заливка рисунка в порядке номеров (как их хранит сервер) */
export type InkItem =
  | { k: 's'; id: number; c: number; w: number; pts: number[] }
  | { k: 'f'; id: number; c: number; x: number; y: number };

/** Полутолщина мазка в пикселях холста (ластик — своя толщина) */
export function strokeRadius(c: number, w: number): number {
  return (c === QZ_CROC.ERASER ? QZ_CROC.ERASER_WIDTH : (QZ_CROC.WIDTHS[w] ?? QZ_CROC.WIDTHS[1])) / 2;
}

/** Маска линий и слой заливок на сетке GW × GH; fill — 0 (нет) или номер цвета + 1 */
export class FillGrid {
  readonly mask = new Uint8Array(GW * GH);
  readonly fill = new Uint8Array(GW * GH);
  /** Слой заливок изменился с прошлого взгляда (рисовалке — обновить картинку) */
  changed = false;
  private readonly seen = new Uint32Array(GW * GH);
  private gen = 0;
  private stack = new Int32Array(4096);

  reset(): void {
    this.mask.fill(0);
    this.fill.fill(0);
    this.changed = true;
  }

  /** Положить в маску кусок мазка: точки pts с индекса from (чётный, точка from/2) — отрезки от точки from − 1 */
  stroke(c: number, w: number, pts: readonly number[], from = 0): void {
    const r = strokeRadius(c, w);
    const erase = c === QZ_CROC.ERASER;
    const n = pts.length >> 1;
    const i0 = from >> 1;
    if (n === 0) return;
    if (i0 === 0) this.capsule(pts[0], pts[1], pts[0], pts[1], r, erase);
    for (let i = Math.max(1, i0); i < n; i++) this.capsule(pts[2 * i - 2], pts[2 * i - 1], pts[2 * i], pts[2 * i + 1], r, erase);
  }

  /** Отрезок a → b толщиной 2r (в px холста): клетки, чей центр ближе r, — линия (ластик — снять линию и заливку) */
  private capsule(ax: number, ay: number, bx: number, by: number, r: number, erase: boolean): void {
    const S = FILL_STEP;
    const gx0 = Math.max(0, Math.floor((Math.min(ax, bx) - r) / S));
    const gx1 = Math.min(GW - 1, Math.floor((Math.max(ax, bx) + r) / S));
    const gy0 = Math.max(0, Math.floor((Math.min(ay, by) - r) / S));
    const gy1 = Math.min(GH - 1, Math.floor((Math.max(ay, by) + r) / S));
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const r2 = r * r;
    for (let gy = gy0; gy <= gy1; gy++) {
      const cy = gy * S + S / 2;
      for (let gx = gx0; gx <= gx1; gx++) {
        const cx = gx * S + S / 2;
        let t = len2 > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = ax + dx * t - cx, ey = ay + dy * t - cy;
        if (ex * ex + ey * ey > r2) continue;
        const i = gy * GW + gx;
        if (erase) {
          this.mask[i] = 0;
          if (this.fill[i]) { this.fill[i] = 0; this.changed = true; }
        } else this.mask[i] = 1;
      }
    }
  }

  /** Залить цветом c область вокруг точки холста (x, y); вернуть, сколько клеток залито (0 — клик по линии или мимо) */
  flood(c: number, x: number, y: number): number {
    const gx = Math.floor(x / FILL_STEP), gy = Math.floor(y / FILL_STEP);
    if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return 0;
    const start = gy * GW + gx;
    if (this.mask[start]) return 0;
    const v = c + 1;
    this.gen = (this.gen + 1) >>> 0 || 1;
    const g = this.gen, seen = this.seen, mask = this.mask, fill = this.fill;
    let sp = 0, n = 0;
    const push = (i: number): void => {
      if (sp >= this.stack.length) {
        const s = new Int32Array(this.stack.length * 2);
        s.set(this.stack);
        this.stack = s;
      }
      this.stack[sp++] = i;
    };
    seen[start] = g;
    push(start);
    while (sp > 0) {
      const i = this.stack[--sp];
      fill[i] = v;
      n++;
      const cx = i % GW, cy = (i - cx) / GW;
      // соседи: свободная клетка — в область (по 4 соседям), линия — красим её тоже (край под мазком, по 8 соседям)
      for (let k = 0; k < 8; k++) {
        const nx = cx + NX[k], ny = cy + NY[k];
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const j = ny * GW + nx;
        if (seen[j] === g) continue;
        if (mask[j]) {
          seen[j] = g;
          fill[j] = v;
        } else if (k < 4) {
          seen[j] = g;
          push(j);
        }
      }
    }
    if (n) this.changed = true;
    return n;
  }

  /** Весь рисунок заново: мазки и заливки по порядку */
  build(items: Iterable<InkItem>): void {
    this.reset();
    for (const it of items) {
      if (it.k === 's') this.stroke(it.c, it.w, it.pts, 0);
      else this.flood(it.c, it.x, it.y);
    }
  }
}

/** Соседи: первые 4 — по сторонам (связность области), ещё 4 — по углам (край под линией) */
const NX = [1, -1, 0, 0, 1, 1, -1, -1];
const NY = [0, 0, 1, -1, 1, -1, 1, -1];

/** Слой заливок рисунка (чистая функция для тестов и сверки): 0 — нет заливки, иначе номер цвета + 1 */
export function fillLayer(items: Iterable<InkItem>): Uint8Array {
  const g = new FillGrid();
  g.build(items);
  return g.fill;
}

/** Мазки письма qzInk → элементы рисунка по порядку, как у сервера и мольберта: 'u' — убрать по номеру, 'x' — всё;
 *  дописка мазка, после которого уже что-то есть, — продолжение в конце (тот же номер) */
export function itemsOf(ops: ReadonlyArray<readonly (string | number)[]>): InkItem[] {
  let out: InkItem[] = [];
  for (const op of ops) {
    if (op[0] === 'x') out = [];
    else if (op[0] === 'u') out = out.filter((it) => it.id !== op[1]);
    else if (op[0] === 'f') {
      const [, id, c, x, y] = op as [string, number, number, number, number];
      out.push({ k: 'f', id, c, x, y });
    } else if (op[0] === 's') {
      const [, id, c, w, ...pts] = op as [string, number, number, number, ...number[]];
      const last = out[out.length - 1];
      if (last?.k === 's' && last.id === id) last.pts.push(...pts);
      else out.push({ k: 's', id, c, w, pts: [...pts] });
    }
  }
  return out;
}
