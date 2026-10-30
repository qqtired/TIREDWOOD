// «Ракушка», часть 2: мольберт «Крокодила» (docs/quiz/tech.md §22). В начале игры выезжает из-за кулис (easel.park →
// easel.show, 1 с), в конце уезжает. На нём холст 1024 × 768: мазки приходят письмами qzInk (рисунок d, full — заново),
// текстура обновляется не чаще 10 раз в секунду; табло дублирует рисунок (boardUi.drawing). Рисующий рисует мышью прямо
// по холсту в мире (луч → UV → точка холста): мазки уходят crInk пачками раз в 50 мс, до 64 точек в письме.
// Цвет и толщину выбирает полоса инструментов Sonnet (ui/) — через crocInk ниже; Z / «Отмена» и «Очистить» — тоже.
import * as THREE from 'three';
import { QZ_CROC, type QzBoard, type QzInkOp } from '../../../shared/quiz/types.ts';
import { QUIZ_VENUE } from '../../../shared/quiz/venue.ts';
import { worldGeometry } from '../plaza3/models.ts';
import { canvasMesh, canvasTex, ease, familyOf, type CanvasTex, type FamilyMats } from './kit3d.ts';

/** Инструмент рисующего — его меняет полоса инструментов (ui/, Sonnet): цвет 0–7, 8 — ластик; толщина 0–2.
 *  undo() / clear() — «Отмена» (Z) и «Очистить»; full — холст полон (на полосе «Холст полон») */
export const crocInk = {
  tool: { color: 0, width: 1 },
  full: false,
  undo: (): void => {},
  clear: (): void => {},
};

const PAPER = QZ_CROC.ERASER_COLOR;
/** Текстура холста — не чаще 10 раз в секунду (бриф) */
const TEX_MIN_S = 0.1;

interface Stroke { c: number; w: number; pts: number[] }

/** Рисунок по мазкам на 2D-холсте: 's' — начать или дописать, 'u' — убрать (перерисовка), 'x' — очистить */
export class InkCanvas {
  readonly strokes = new Map<number, Stroke>();
  points = 0;
  readonly ctx: CanvasRenderingContext2D;
  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.clear();
  }

  clear(): void {
    this.strokes.clear();
    this.points = 0;
    const g = this.ctx;
    g.fillStyle = PAPER;
    g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  }

  /** Применить мазки; skip — свои мазки (рисующий уже нарисовал их сам) */
  apply(ops: readonly QzInkOp[], skip?: ReadonlySet<number>): void {
    for (const op of ops) {
      if (op[0] === 'x') this.clear();
      else if (op[0] === 'u') {
        if (this.strokes.delete(op[1])) this.redraw();
      } else if (op[0] === 's') {
        const [, id, c, w, ...pts] = op;
        if (skip?.has(id)) continue;
        this.add(id, c, w, pts);
      }
    }
  }

  /** Дописать точки в мазок (новый — с цветом и толщиной) и нарисовать только новый кусок */
  add(id: number, c: number, w: number, pts: readonly number[]): void {
    let s = this.strokes.get(id);
    if (!s) {
      s = { c, w, pts: [] };
      this.strokes.set(id, s);
    }
    const from = s.pts.length;
    for (const v of pts) s.pts.push(v);
    this.points += pts.length / 2;
    this.paint(s, Math.max(0, from - 2));
  }

  private redraw(): void {
    const g = this.ctx;
    g.fillStyle = PAPER;
    g.fillRect(0, 0, g.canvas.width, g.canvas.height);
    for (const s of this.strokes.values()) this.paint(s, 0);
  }

  /** Нарисовать мазок с точки from (индекс в pts, чётный) */
  private paint(s: Stroke, from: number): void {
    const g = this.ctx;
    const eraser = s.c === QZ_CROC.ERASER;
    g.strokeStyle = g.fillStyle = eraser ? PAPER : (QZ_CROC.COLORS[s.c] ?? QZ_CROC.COLORS[0]);
    const lw = eraser ? QZ_CROC.ERASER_WIDTH : (QZ_CROC.WIDTHS[s.w] ?? QZ_CROC.WIDTHS[1]);
    g.lineWidth = lw;
    g.lineCap = g.lineJoin = 'round';
    const p = s.pts;
    if (p.length === 2 && from === 0) {
      g.beginPath();
      g.arc(p[0], p[1], lw / 2, 0, Math.PI * 2);
      g.fill();
      return;
    }
    g.beginPath();
    g.moveTo(p[from], p[from + 1]);
    for (let i = from + 2; i + 1 < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
    g.stroke();
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
  /** Инструмент с полосы Sonnet (hud.crocTool); нет — crocInk.tool */
  tool?: () => { color: number; width: number } | null;
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
  // --- рисующий
  private readonly own = new Set<number>();
  private cur: Stroke & { id: number } | null = null;
  private pending: QzInkOp[] = [];
  private flushAt = 0;
  tris = 0;

  private readonly d: EaselDeps;

  constructor(d: EaselDeps) {
    this.d = d;
    const W = QZ_CROC.W, H = QZ_CROC.H;
    this.tex = canvasTex(W, H);
    this.ink = new InkCanvas(this.tex.ctx);
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

  /** Снимок: «Крокодил» идёт — мольберт на сцене; новый рисунок — чистый холст */
  set(b: QzBoard | null): void {
    const croc = b?.phase === 'game' && b.mode === 'croc' ? (b.croc ?? null) : null;
    this.want = !!croc;
    if (croc && croc.drawing !== this.drawing) this.reset(croc.drawing);
  }

  /** Письмо qzInk */
  onInk(m: { d: number; ops: QzInkOp[]; full?: boolean }): void {
    if (m.full || m.d !== this.drawing) this.reset(m.d);
    this.ink.apply(m.ops, m.full ? undefined : this.own);
    this.touch();
  }

  private reset(d: number): void {
    this.drawing = d;
    this.ink.clear();
    this.own.clear();
    this.cur = null;
    this.pending = [];
    crocInk.full = false;
    this.touch();
  }

  private touch(): void {
    this.dirty = true;
    this.d.changed();
  }

  update(dt: number): void {
    this.time += dt;
    const to = this.want ? 1 : 0;
    if (this.k !== to) {
      this.k = to > this.k ? Math.min(1, this.k + dt) : Math.max(0, this.k - dt);
      this.place();
    }
    if (this.dirty && this.time - this.texAt >= TEX_MIN_S) {
      this.dirty = false;
      this.texAt = this.time;
      this.tex.tex.needsUpdate = true;
    }
    if (this.pending.length && this.time >= this.flushAt) this.flush();
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
      let id = 1;
      for (const k of this.ink.strokes.keys()) id = Math.max(id, k + 1);
      const t = this.d.tool?.() ?? crocInk.tool;
      this.cur = { id, c: t.color, w: t.width, pts: [] };
      this.own.add(id);
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
      this.flush();
    });
  }

  /** Точка холста под мышью (null — мимо холста) */
  private hit(e: PointerEvent): [number, number] | null {
    if (!this.face) return null;
    const r = this.d.canvas.getBoundingClientRect();
    _v2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    _ray.setFromCamera(_v2, this.d.camera);
    const hit = _ray.intersectObject(this.face, false)[0];
    if (!hit?.uv) return null;
    return [Math.round(hit.uv.x * QZ_CROC.W), Math.round(hit.uv.y * QZ_CROC.H)];
  }

  private point(at: [number, number]): void {
    const s = this.cur!;
    if (this.ink.strokes.size >= QZ_CROC.INK_STROKES && !this.ink.strokes.has(s.id)) {
      crocInk.full = true;
      return;
    }
    if (this.ink.points >= QZ_CROC.INK_PTS) {
      crocInk.full = true;
      return;
    }
    this.ink.add(s.id, s.c, s.w, at);
    s.pts.push(at[0], at[1]);
    const last = this.pending[this.pending.length - 1];
    if (last && last[0] === 's' && last[1] === s.id && last.length - 4 < QZ_CROC.INK_PTS_MSG * 2) last.push(at[0], at[1]);
    else this.pending.push(['s', s.id, s.c, s.w, at[0], at[1]]);
    if (this.pending.length === 1 && this.flushAt <= this.time) this.flushAt = this.time + QZ_CROC.INK_BATCH_MS / 1000;
    this.touch();
  }

  /** Пачка мазков на сервер: до 64 точек в письме */
  private flush(): void {
    if (!this.pending.length) return;
    let batch: QzInkOp[] = [];
    let pts = 0;
    for (const op of this.pending) {
      const n = op[0] === 's' ? (op.length - 4) / 2 : 0;
      if (pts + n > QZ_CROC.INK_PTS_MSG && batch.length) {
        this.d.send(batch);
        batch = [];
        pts = 0;
      }
      batch.push(op);
      pts += n;
    }
    if (batch.length) this.d.send(batch);
    this.pending = [];
    this.flushAt = this.time + QZ_CROC.INK_BATCH_MS / 1000;
  }

  /** Z / «Отмена»: убрать свой последний мазок */
  undo(): void {
    if (!this.d.canDraw()) return;
    const last = [...this.own].filter((id) => this.ink.strokes.has(id)).pop();
    if (last === undefined) return;
    this.flush();
    this.ink.apply([['u', last]]);
    this.d.send([['u', last]]);
    crocInk.full = false;
    this.touch();
  }

  /** «Очистить» */
  wipe(): void {
    if (!this.d.canDraw()) return;
    this.flush();
    this.ink.apply([['x']]);
    this.d.send([['x']]);
    crocInk.full = false;
    this.touch();
  }
}
