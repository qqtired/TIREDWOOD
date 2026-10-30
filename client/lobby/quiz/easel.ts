// «Ракушка», часть 2: мольберт «Крокодила» (docs/quiz/tech.md §22). В начале игры выезжает из-за кулис (easel.park →
// easel.show, 1 с), в конце уезжает. На нём холст 1024 × 768: мазки приходят письмами qzInk (рисунок d, full — заново),
// текстура обновляется не чаще 10 раз в секунду; табло дублирует рисунок (boardUi.drawing). Рисующий рисует мышью прямо
// по холсту в мире (луч → UV → точка холста): мазки уходят crInk пачками не чаще раза в 50 мс (так их принимает сервер),
// до 64 точек в письме. Цвет и толщину выбирает полоса инструментов (ui/) — через crocInk ниже; Z / «Отмена» и «Очистить» —
// тоже. «Ракушка» 1.1: C6 — ведёрко (клик — заливка ['f', id, цвет, x, y]; область — ui/fill.ts, слоем под мазками);
// C7 — на итоге (шаг reveal) рисунок прорисовывается заново за 3 с по сохранённым мазкам, по часам сервера — у всех вместе.
import * as THREE from 'three';
import { QZ_CROC, type QzBoard, type QzInkOp } from '../../../shared/quiz/types.ts';
import { QUIZ_VENUE } from '../../../shared/quiz/venue.ts';
import { worldGeometry } from '../plaza3/models.ts';
import { canvasMesh, canvasTex, ease, familyOf, type CanvasTex, type FamilyMats } from './kit3d.ts';
import { FILL_STEP, FillGrid, GH, GW, strokeRadius, type InkItem } from './ui/fill.ts';

/** Инструмент рисующего — его меняет полоса инструментов (ui/): цвет 0–7, 8 — ластик; толщина 0–2; fill — ведёрко.
 *  undo() / clear() — «Отмена» (Z) и «Очистить»; full — холст полон (на полосе «Холст полон») */
export const crocInk = {
  tool: { color: 0, width: 1, fill: false },
  full: false,
  undo: (): void => {},
  clear: (): void => {},
};

const PAPER = QZ_CROC.ERASER_COLOR;
/** Текстура холста — не чаще 10 раз в секунду (бриф); в повторе на итоге — 20 */
const TEX_MIN_S = 0.1;
const TEX_REPLAY_S = 0.05;
/** C7: повтор рисунка — за столько от начала шага reveal (он 4 с: последняя секунда — готовый рисунок) */
export const REPLAY_MS = 3000;
/** В повторе заливка «весит» столько точек мазка — появляется в свой момент, а не вспышкой */
const FILL_WEIGHT = 24;
/** Пачки мазков — не чаще (сервер принимает раз в INK_BATCH_MS по своим часам; запас на неровную сеть) */
const SEND_GAP_S = (QZ_CROC.INK_BATCH_MS + 25) / 1000;
/** Клик ведёрком по линии — ищем свободную клетку не дальше стольких клеток */
const FILL_NEAR = 4;

type Stroke = Extract<InkItem, { k: 's' }>;

/** Цвета палитры для слоя заливок: [r, g, b] */
const RGB = QZ_CROC.COLORS.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);

function layer(w: number, h: number): CanvasRenderingContext2D {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c.getContext('2d')!;
}

/**
 * Рисунок по мазкам: три слоя — бумага, заливки (сетка 512 × 384 без сглаживания, ui/fill.ts), мазки поверх (ластик
 * стирает мазки до прозрачного и снимает заливку под собой). 's' — начать или дописать мазок, 'f' — заливка, 'u' — убрать
 * по номеру (перерисовка), 'x' — очистить. Порядок — как у сервера: дописка старого мазка после заливки идёт после неё.
 */
export class InkCanvas {
  /** Мазки и заливки по порядку */
  readonly items: InkItem[] = [];
  points = 0;
  /** Выход (холст текстуры): бумага + заливки + мазки */
  readonly ctx: CanvasRenderingContext2D;
  private readonly lines: CanvasRenderingContext2D;
  private readonly fills: CanvasRenderingContext2D;
  private readonly img: ImageData;
  readonly grid = new FillGrid();
  /** Выход надо пересобрать (compose) */
  private stale = true;
  /** C7: повтор — курсор (элемент, сколько его точек уже нарисовано) и сколько «веса» показано; null — не идёт */
  private rep: { i: number; n: number; w: number } | null = null;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.lines = layer(ctx.canvas.width, ctx.canvas.height);
    this.fills = layer(GW, GH);
    this.img = this.fills.createImageData(GW, GH);
    this.clear();
  }

  /** Номера в рисунке (для отладки и сценариев: strokes.size) */
  get strokes(): Map<number, InkItem> {
    return new Map(this.items.map((it) => [it.id, it]));
  }

  get replaying(): boolean {
    return this.rep !== null;
  }

  clear(): void {
    this.items.length = 0;
    this.points = 0;
    this.rep = null;
    this.grid.reset();
    this.lines.clearRect(0, 0, this.lines.canvas.width, this.lines.canvas.height);
    this.stale = true;
  }

  /** Применить мазки; skip — свои мазки и заливки (рисующий уже нарисовал их сам) */
  apply(ops: readonly QzInkOp[], skip?: ReadonlySet<number>): void {
    if (this.rep) this.endReplay();
    for (const op of ops) {
      if (op[0] === 'x') this.clear();
      else if (op[0] === 'u') this.remove(op[1]);
      else if (op[0] === 'f') {
        if (!skip?.has(op[1])) this.addFill(op[1], op[2], op[3], op[4]);
      } else if (op[0] === 's') {
        const [, id, c, w, ...pts] = op;
        if (skip?.has(id)) continue;
        this.add(id, c, w, pts);
      }
    }
  }

  /** Дописать точки в мазок (новый — с цветом и толщиной) и нарисовать только новый кусок */
  add(id: number, c: number, w: number, pts: readonly number[]): void {
    const last = this.items[this.items.length - 1];
    let s: Stroke;
    if (last?.k === 's' && last.id === id) s = last;
    else {
      // дописка мазка, после которого уже есть заливка или мазок, — продолжением в конце (как у сервера)
      s = { k: 's', id, c, w, pts: [] };
      this.items.push(s);
    }
    const from = s.pts.length;
    for (const v of pts) s.pts.push(v);
    this.points += pts.length / 2;
    this.grid.stroke(s.c, s.w, s.pts, from);
    this.paint(s, Math.max(0, from - 2), s.pts.length);
    this.stale = true;
  }

  /** Заливка в конец рисунка; вернуть, сколько клеток залито (0 — клик по линии) */
  addFill(id: number, c: number, x: number, y: number): number {
    this.items.push({ k: 'f', id, c, x, y });
    this.points += 1;
    this.stale = true;
    return this.grid.flood(c, x, y);
  }

  /** Убрать мазок или заливку по номеру (все куски) и перерисовать */
  remove(id: number): boolean {
    let hit = false;
    for (let i = this.items.length - 1; i >= 0; i--) if (this.items[i].id === id) { this.items.splice(i, 1); hit = true; }
    if (hit) this.rebuild();
    return hit;
  }

  /** Есть ли номер в рисунке */
  has(id: number): boolean {
    return this.items.some((it) => it.id === id);
  }

  /** Самый большой номер в рисунке (−1 — пусто) */
  maxId(): number {
    let m = -1;
    for (const it of this.items) if (it.id > m) m = it.id;
    return m;
  }

  /** Свободная клетка для ведёрка у точки (x, y): та же, если не линия; иначе ближайшая в FILL_NEAR клетках; null — нет */
  freeNear(x: number, y: number): [number, number] | null {
    const gx = Math.floor(x / FILL_STEP), gy = Math.floor(y / FILL_STEP);
    const free = (cx: number, cy: number): boolean => cx >= 0 && cy >= 0 && cx < GW && cy < GH && !this.grid.mask[cy * GW + cx];
    if (free(gx, gy)) return [x, y];
    for (let r = 1; r <= FILL_NEAR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !free(gx + dx, gy + dy)) continue;
          return [(gx + dx) * FILL_STEP + 1, (gy + dy) * FILL_STEP + 1];
        }
      }
    }
    return null;
  }

  /** Весь рисунок заново (отмена, конец повтора) */
  private rebuild(): void {
    this.grid.reset();
    this.lines.clearRect(0, 0, this.lines.canvas.width, this.lines.canvas.height);
    for (const it of this.items) {
      if (it.k === 's') {
        this.grid.stroke(it.c, it.w, it.pts, 0);
        this.paint(it, 0, it.pts.length);
      } else this.grid.flood(it.c, it.x, it.y);
    }
    this.stale = true;
  }

  /** Нарисовать кусок мазка: точки с индекса from (чётный) до to; одна точка — кружок. Ластик стирает мазки до прозрачного */
  private paint(s: Stroke, from: number, to: number): void {
    const g = this.lines;
    const eraser = s.c === QZ_CROC.ERASER;
    g.save();
    if (eraser) g.globalCompositeOperation = 'destination-out';
    g.strokeStyle = g.fillStyle = eraser ? '#000' : (QZ_CROC.COLORS[s.c] ?? QZ_CROC.COLORS[0]);
    const lw = strokeRadius(s.c, s.w) * 2;
    g.lineWidth = lw;
    g.lineCap = g.lineJoin = 'round';
    const p = s.pts;
    if (to - from <= 2) {
      if (from === 0 && to >= 2) {
        g.beginPath();
        g.arc(p[0], p[1], lw / 2, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      g.beginPath();
      g.moveTo(p[from], p[from + 1]);
      for (let i = from + 2; i + 1 < to; i += 2) g.lineTo(p[i], p[i + 1]);
      g.stroke();
    }
    g.restore();
  }

  /** Собрать выход: бумага, заливки (клетка 2 × 2 без сглаживания), мазки. false — пересобирать было нечего */
  compose(): boolean {
    if (!this.stale) return false;
    this.stale = false;
    if (this.grid.changed) {
      this.grid.changed = false;
      const d = this.img.data, f = this.grid.fill;
      for (let i = 0, o = 0; i < f.length; i++, o += 4) {
        const v = f[i];
        if (!v) { d[o + 3] = 0; continue; }
        const c = RGB[v - 1] ?? RGB[0];
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
      this.fills.putImageData(this.img, 0, 0);
    }
    const g = this.ctx, W = g.canvas.width, H = g.canvas.height;
    g.save();
    g.fillStyle = PAPER;
    g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.fills.canvas, 0, 0, W, H);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.lines.canvas, 0, 0);
    g.restore();
    return true;
  }

  // ------------------------------------------------------------ C7: повтор рисунка

  private static weight(it: InkItem): number {
    return it.k === 'f' ? FILL_WEIGHT : Math.max(1, it.pts.length / 2);
  }

  /** Начать повтор: холст чистый, дальше replayTo(k) дорисовывает по порядку */
  startReplay(): void {
    this.rep = { i: 0, n: 0, w: 0 };
    this.grid.reset();
    this.lines.clearRect(0, 0, this.lines.canvas.width, this.lines.canvas.height);
    this.stale = true;
  }

  /** Показать рисунок до доли k (0…1): мазки рисуются точка за точкой, заливки — в свой момент; k ≥ 1 — готово */
  replayTo(k: number): void {
    const r = this.rep;
    if (!r) return;
    let total = 0;
    for (const it of this.items) total += InkCanvas.weight(it);
    const target = Math.min(1, Math.max(0, k)) * total;
    while (r.i < this.items.length) {
      const it = this.items[r.i];
      if (it.k === 'f') {
        if (r.w + FILL_WEIGHT > target) break;
        this.grid.flood(it.c, it.x, it.y);
        r.w += FILL_WEIGHT;
        r.i++;
        continue;
      }
      const n = it.pts.length / 2;
      const want = Math.min(n, Math.floor(target - r.w));
      if (want > r.n) {
        this.grid.stroke(it.c, it.w, it.pts.slice(0, want * 2), r.n * 2);
        this.paint(it, Math.max(0, r.n * 2 - 2), want * 2);
        r.n = want;
      }
      if (r.n < n) break;
      r.w += InkCanvas.weight(it);
      r.i++;
      r.n = 0;
    }
    this.stale = true;
    if (k >= 1 && r.i >= this.items.length) this.rep = null;
  }

  /** Оборвать повтор — сразу готовый рисунок */
  endReplay(): void {
    if (!this.rep) return;
    this.rep = null;
    this.rebuild();
  }
}

export interface EaselDeps {
  root: THREE.Object3D;
  easel: THREE.Group;
  mats: FamilyMats;
  camera: THREE.Camera;
  canvas: HTMLElement;
  /** Я рисую сейчас (шаг draw, мой рисунок) */
  canDraw: () => boolean;
  send: (ops: QzInkOp[]) => void;
  /** Рисунок изменился — табло перерисует свою копию */
  changed: () => void;
  /** Инструмент с полосы (hud.crocTool); нет — crocInk.tool */
  tool?: () => { color: number; width: number; fill?: boolean } | null;
}

const _v2 = new THREE.Vector2();
const _ray = new THREE.Raycaster();

export class QuizEasel {
  readonly group = new THREE.Group();
  private face: THREE.Mesh | null = null;
  private readonly tex: CanvasTex;
  readonly ink: InkCanvas;
  /** Номер рисунка (qzInk.d) */
  private drawing = -1;
  private k = 0;
  private want = false;
  private time = 0;
  private texAt = -1;
  private dirty = false;
  /** C7: начало шага reveal этого рисунка (часы сервера; 0 — не итог) и рисунок, чей повтор уже показан */
  private revealAt = 0;
  private replayed = -1;
  // --- рисующий
  private readonly own = new Set<number>();
  /** Следующий номер: только растёт в рисунке (сервер не берёт номер не больше уже бывшего — и после отмены) */
  private nextId = 1;
  private cur: Stroke | null = null;
  private pending: QzInkOp[] = [];
  private flushAt = 0;
  private sentAt = -1;
  tris = 0;

  private readonly d: EaselDeps;

  constructor(d: EaselDeps) {
    this.d = d;
    const W = QZ_CROC.W, H = QZ_CROC.H;
    this.tex = canvasTex(W, H);
    this.ink = new InkCanvas(this.tex.ctx);
    this.ink.compose();
    d.easel.updateMatrixWorld(true);
    const body: THREE.BufferGeometry[] = [];
    let fam: 'matte' | 'gloss' | 'glow' = 'matte';
    d.easel.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const face = m.name.startsWith('easel_face');
      // холсту нужны UV — копия с матрицей; тело — как вся статика plaza3
      const g = face ? m.geometry.clone().applyMatrix4(m.matrixWorld) : worldGeometry(m.geometry, m.matrixWorld);
      if (face) {
        this.face = canvasMesh(g, this.tex, 'quiz-easel-face');
        this.group.add(this.face);
      } else {
        body.push(g);
        fam = familyOf(Array.isArray(m.material) ? m.material[0] : m.material);
      }
      this.tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    });
    for (const g of body) {
      const m = new THREE.Mesh(g, d.mats[fam]);
      m.name = 'quiz-easel';
      m.castShadow = false;
      m.receiveShadow = true;
      m.userData.p3keep = true;
      this.group.add(m);
    }
    this.group.name = 'quiz-easel';
    this.group.visible = false;
    d.root.add(this.group);
    this.place();
    crocInk.undo = () => this.undo();
    crocInk.clear = () => this.wipe();
    this.bind();
  }

  /** Холст рисунка — табло рисует его копию */
  get canvas(): HTMLCanvasElement {
    return this.tex.canvas;
  }

  get shown(): boolean {
    return this.group.visible;
  }

  /** Снимок: «Крокодил» идёт — мольберт на сцене; новый рисунок — чистый холст; итог — повтор рисунка */
  set(b: QzBoard | null): void {
    const croc = b?.phase === 'game' && b.mode === 'croc' ? (b.croc ?? null) : null;
    this.want = !!croc;
    if (croc && croc.drawing !== this.drawing) this.reset(croc.drawing);
    this.revealAt = croc?.step === 'reveal' && croc.drawing === this.drawing && croc.total > 0 ? croc.endsAt - croc.total : 0;
  }

  /** Письмо qzInk */
  onInk(m: { d: number; ops: QzInkOp[]; full?: boolean }): void {
    if (m.full || m.d !== this.drawing) this.reset(m.d);
    this.ink.apply(m.ops, m.full ? undefined : this.own);
    this.nextId = Math.max(this.nextId, this.ink.maxId() + 1);
    this.touch();
  }

  private reset(d: number): void {
    if (d !== this.drawing) this.replayed = -1;
    this.drawing = d;
    this.ink.clear();
    this.own.clear();
    this.nextId = 1;
    this.cur = null;
    this.pending = [];
    crocInk.full = false;
    this.touch();
  }

  private touch(): void {
    this.dirty = true;
    this.d.changed();
  }

  /** now — часы сервера (повтор на итоге идёт у всех вместе) */
  update(dt: number, now = Date.now()): void {
    this.time += dt;
    const to = this.want ? 1 : 0;
    if (this.k !== to) {
      this.k = to > this.k ? Math.min(1, this.k + dt) : Math.max(0, this.k - dt);
      this.place();
    }
    this.replay(now);
    if (this.dirty && this.time - this.texAt >= (this.ink.replaying ? TEX_REPLAY_S : TEX_MIN_S)) {
      this.dirty = false;
      this.texAt = this.time;
      if (this.ink.compose()) this.tex.tex.needsUpdate = true;
    }
    if (this.pending.length && this.time >= this.flushAt && this.time - this.sentAt >= SEND_GAP_S) this.flush();
  }

  /** C7: шаг reveal — рисунок прорисовывается заново за REPLAY_MS (один раз на рисунок) */
  private replay(now: number): void {
    if (!this.revealAt || !this.group.visible || !this.ink.items.length) {
      if (this.ink.replaying) {
        this.ink.endReplay();
        this.touch();
      }
      return;
    }
    const k = (now - this.revealAt) / REPLAY_MS;
    if (!this.ink.replaying) {
      if (this.replayed === this.drawing || k >= 1) return;
      this.replayed = this.drawing;
      this.ink.startReplay();
    }
    this.ink.replayTo(k);
    this.touch();
  }

  private place(): void {
    const e = QUIZ_VENUE.data.easel, a = e.park, b = e.show, k = ease(this.k);
    this.group.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
    let dy = b.yaw - a.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.group.rotation.y = a.yaw + dy * k;
    this.group.visible = this.k > 0;
  }

  // ------------------------------------------------------------ рисующий: мышью по холсту в мире

  private bind(): void {
    const cv = this.d.canvas;
    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.d.canDraw() || !this.group.visible || crocInk.full) return;
      const at = this.hit(e);
      if (!at) return;
      e.preventDefault();
      const t = this.d.tool?.() ?? crocInk.tool;
      if (t.fill) {
        this.fillAt(at, t.color);
        return;
      }
      this.cur = { k: 's', id: this.nextId++, c: t.color, w: t.width, pts: [] };
      this.own.add(this.cur.id);
      this.point(at);
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.cur) return;
      const at = this.hit(e);
      if (!at) return;
      const p = this.cur.pts;
      if (p.length && Math.hypot(at[0] - p[p.length - 2], at[1] - p[p.length - 1]) < 3) return;
      this.point(at);
    });
    window.addEventListener('pointerup', () => {
      if (!this.cur) return;
      this.cur = null;
      // хвост мазка — сразу, как только сервер готов принять пачку
      this.flushAt = this.time;
    });
  }

  /** Точка холста под мышью (null — мимо холста); край — в пределах холста (сервер не берёт x = 1024) */
  private hit(e: PointerEvent): [number, number] | null {
    if (!this.face) return null;
    const r = this.d.canvas.getBoundingClientRect();
    _v2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    _ray.setFromCamera(_v2, this.d.camera);
    const hit = _ray.intersectObject(this.face, false)[0];
    if (!hit?.uv) return null;
    return [Math.min(QZ_CROC.W - 1, Math.round(hit.uv.x * QZ_CROC.W)), Math.min(QZ_CROC.H - 1, Math.round(hit.uv.y * QZ_CROC.H))];
  }

  /** Лимиты рисунка (как у сервера): мазков с заливками — до INK_STROKES, точек — до INK_PTS */
  private roomFor(newItem: boolean): boolean {
    const items = new Set(this.ink.items.map((it) => it.id)).size;
    if ((newItem && items >= QZ_CROC.INK_STROKES) || this.ink.points >= QZ_CROC.INK_PTS) {
      crocInk.full = true;
      return false;
    }
    return true;
  }

  private point(at: [number, number]): void {
    const s = this.cur!;
    if (!this.roomFor(!this.ink.has(s.id))) return;
    this.ink.add(s.id, s.c, s.w, at);
    s.pts.push(at[0], at[1]);
    const last = this.pending[this.pending.length - 1];
    if (last && last[0] === 's' && last[1] === s.id && last.length - 4 < QZ_CROC.INK_PTS_MSG * 2) last.push(at[0], at[1]);
    else this.queue(['s', s.id, s.c, s.w, at[0], at[1]], QZ_CROC.INK_BATCH_MS / 1000);
    this.touch();
  }

  /** C6: ведёрко — залить область под кликом цветом палитры (ластиком не льём); клик по линии — ближайшая свободная клетка */
  private fillAt(at: [number, number], color: number): void {
    if (color < 0 || color >= QZ_CROC.COLORS.length || !this.roomFor(true)) return;
    const p = this.ink.freeNear(at[0], at[1]);
    if (!p) return;
    const id = this.nextId;
    if (!this.ink.addFill(id, color, p[0], p[1])) {
      this.ink.remove(id);
      return;
    }
    this.nextId++;
    this.own.add(id);
    this.queue(['f', id, color, p[0], p[1]], 0);
    this.touch();
  }

  /** В очередь на сервер; первая операция после паузы ждёт wait с (копим пачку) */
  private queue(op: QzInkOp, wait: number): void {
    this.pending.push(op);
    if (this.pending.length === 1) this.flushAt = this.time + wait;
  }

  /** Пачка на сервер: до 64 точек в письме, письма — не чаще SEND_GAP_S (остальное ждёт следующего раза) */
  private flush(): void {
    if (!this.pending.length) return;
    const batch: QzInkOp[] = [];
    let pts = 0, i = 0;
    for (; i < this.pending.length; i++) {
      const op = this.pending[i];
      const n = op[0] === 's' ? (op.length - 4) / 2 : op[0] === 'f' ? 1 : 0;
      if (pts + n > QZ_CROC.INK_PTS_MSG && batch.length) break;
      batch.push(op);
      pts += n;
    }
    this.pending = this.pending.slice(i);
    this.d.send(batch);
    this.sentAt = this.time;
    this.flushAt = this.time;
  }

  /** Z / «Отмена»: убрать свой последний мазок или заливку */
  undo(): void {
    if (!this.d.canDraw()) return;
    let last = -1;
    for (const it of this.ink.items) if (this.own.has(it.id)) last = it.id;
    if (last < 0) return;
    if (this.cur?.id === last) this.cur = null;
    this.ink.remove(last);
    this.queue(['u', last], 0);
    crocInk.full = false;
    this.touch();
  }

  /** «Очистить» */
  wipe(): void {
    if (!this.d.canDraw()) return;
    this.cur = null;
    this.ink.clear();
    this.queue(['x'], 0);
    crocInk.full = false;
    this.touch();
  }
}
