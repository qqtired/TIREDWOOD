// Рисунок окна «Набери лейку»: канвас 820×520 в «логических» пикселях (как поле дизайна §7.1). Неподвижный фон (небо,
// камень колодца, дерево корыта) рисуется один раз в слой, на кадр — вода корыта, струя, лейка на качающейся доске,
// ведро в варежке, брызги и круги на воде. Положения берём из общей модели shared/farmwell.ts.
import { WELL, mouthAt, streamWidth, type WellCan } from '../../../shared/farmwell.ts';

export const FIELD_W = 820;
export const FIELD_H = 520;
/** Высота центра ведра, горлышка лейки и воды корыта (логические пиксели) */
const BY = 170;
const CAN_Y = 430;
const MOUTH_Y = 386;
const WATER_Y = 440;

/** Всё, что нужно для кадра: положения из модели (уже сглажены между тиками) */
export interface WellView {
  /** Секунд игры с открытия окна — по ним качается горлышко */
  t: number;
  /** Часы кадра, секунды — для волн и бликов */
  clock: number;
  can: WellCan;
  /** Ведро над корытом, доля поля */
  x: number;
  tilt: number;
  /** Воды в ведре, лейка = 1 */
  bucket: number;
  /** Уровень лейки 0–1 (с учётом того, что было в ней до попытки) */
  level: number;
  hit: boolean;
  /** Налив идёт (ведро наклонено, вода есть) */
  pouring: boolean;
  /** Секунд с момента, когда лейка стала полной (−1 — ещё нет) */
  fullFor: number;
}

interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number }
interface Ripple { x: number; age: number }

const rr = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void => {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
};

export class WellPainter {
  private readonly c: CanvasRenderingContext2D;
  private readonly bg = document.createElement('canvas');
  private scale = 1;
  private parts: Part[] = [];
  private ripples: Ripple[] = [];
  private shown = 0;
  private rippleAt = 0;

  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, startLevel: number) {
    this.canvas = canvas;
    this.c = canvas.getContext('2d')!;
    this.shown = startLevel;
    this.resize();
  }

  /** Подогнать пиксели канваса под размер на экране (с учётом плотности пикселей) */
  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(320, Math.round(this.canvas.getBoundingClientRect().width * dpr));
    if (this.canvas.width === w) return;
    this.canvas.width = w;
    this.canvas.height = Math.round((w * FIELD_H) / FIELD_W);
    this.scale = w / FIELD_W;
    this.bg.width = this.canvas.width;
    this.bg.height = this.canvas.height;
    this.paintBackground();
  }

  // ------------------------------------------------------------ неподвижный фон

  private paintBackground(): void {
    const c = this.bg.getContext('2d')!;
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    const W = FIELD_W;
    const H = FIELD_H;
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#cfe9f1');
    sky.addColorStop(0.5, '#f7ecd2');
    sky.addColorStop(1, '#e2cc9c');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    // облака
    c.fillStyle = 'rgba(255,255,255,0.75)';
    for (const [cx, cy, s] of [[150, 70, 1], [610, 46, 1.3], [430, 140, 0.8]] as const) {
      for (const [dx, dy, r] of [[0, 0, 26], [26, 8, 20], [-28, 8, 18], [8, -14, 18]] as const) {
        c.beginPath();
        c.arc(cx + dx * s, cy + dy * s, r * s, 0, Math.PI * 2);
        c.fill();
      }
    }
    // холмы
    c.fillStyle = '#b9d18f';
    c.beginPath();
    c.moveTo(0, 330);
    c.bezierCurveTo(160, 270, 300, 300, 420, 316);
    c.bezierCurveTo(560, 334, 700, 280, W, 300);
    c.lineTo(W, 400);
    c.lineTo(0, 400);
    c.fill();
    // камень колодца
    c.fillStyle = '#c9bda5';
    c.strokeStyle = 'rgba(110,96,74,0.35)';
    c.lineWidth = 2;
    for (let row = 0; row < 2; row++) {
      for (let i = -1; i < 9; i++) {
        rr(c, i * 100 - 20 + ((i + row) % 2) * 30, 322 + row * 34, 108, 34, 10);
        c.fill();
        c.stroke();
      }
    }
    // земля
    const ground = c.createLinearGradient(0, 380, 0, H);
    ground.addColorStop(0, '#b9ab90');
    ground.addColorStop(1, '#9d8d70');
    c.fillStyle = ground;
    c.fillRect(0, 380, W, H - 380);
    c.fillStyle = 'rgba(80,110,50,0.5)';
    for (let i = 0; i < 26; i++) {
      const gx = 12 + i * 32 + (i % 3) * 5;
      c.beginPath();
      c.moveTo(gx, 382);
      c.lineTo(gx + 3, 372 - (i % 4) * 2);
      c.lineTo(gx + 6, 382);
      c.fill();
    }
    // корыто: дерево с плашками и ободом
    const wood = c.createLinearGradient(0, 414, 0, 496);
    wood.addColorStop(0, '#9a6a38');
    wood.addColorStop(1, '#6f4722');
    c.fillStyle = wood;
    rr(c, 36, 412, W - 72, 84, 18);
    c.fill();
    c.strokeStyle = 'rgba(60,34,12,0.4)';
    c.lineWidth = 3;
    for (let x = 160; x < W - 100; x += 125) {
      c.beginPath();
      c.moveTo(x, 466);
      c.lineTo(x, 494);
      c.stroke();
    }
    c.fillStyle = 'rgba(40,22,8,0.28)';
    rr(c, 40, 486, W - 80, 14, 7);
    c.fill();
  }

  // ------------------------------------------------------------ кадр

  draw(v: WellView, dt: number): void {
    const c = this.c;
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    c.drawImage(this.bg, 0, 0, FIELD_W, FIELD_H);
    this.shown += (v.level - this.shown) * Math.min(1, dt * 9);
    const mouth = mouthAt(v.can, v.t) * FIELD_W;
    const bx = v.x * FIELD_W;
    const stream = (v.x + v.tilt * WELL.shift) * FIELD_W;
    this.troughWater(c, v.clock);
    this.updateParts(dt, v, stream);
    this.drawRipples(c);
    if (v.pouring) this.drawStream(c, v, bx, stream, v.hit ? MOUTH_Y + 4 : WATER_Y);
    this.drawCan(c, v, mouth);
    this.drawParts(c);
    this.drawBucket(c, v, bx);
    if (v.fullFor >= 0) this.drawGlow(c, v, mouth);
  }

  private troughWater(c: CanvasRenderingContext2D, clock: number): void {
    c.save();
    rr(c, 52, 424, FIELD_W - 104, 44, 14);
    c.clip();
    const g = c.createLinearGradient(0, 424, 0, 468);
    g.addColorStop(0, '#86c0cf');
    g.addColorStop(1, '#5a95a8');
    c.fillStyle = g;
    c.fillRect(52, 424, FIELD_W - 104, 44);
    // волна у верхнего края и два блика
    c.fillStyle = '#a9d7e2';
    c.beginPath();
    c.moveTo(52, 468);
    for (let x = 52; x <= FIELD_W - 52; x += 12) c.lineTo(x, 434 + Math.sin(x * 0.03 + clock * 2.1) * 2 + Math.sin(x * 0.011 - clock * 1.3) * 2.5);
    c.lineTo(FIELD_W - 52, 468);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.32)';
    for (let i = 0; i < 3; i++) {
      const sx = 80 + ((i * 260 + clock * 22) % (FIELD_W - 220));
      rr(c, sx, 446 + i * 6, 70 + i * 16, 4, 2);
      c.fill();
    }
    c.restore();
  }

  private drawRipples(c: CanvasRenderingContext2D): void {
    c.save();
    rr(c, 52, 424, FIELD_W - 104, 44, 14);
    c.clip();
    c.lineWidth = 2;
    for (const r of this.ripples) {
      const k = r.age / 0.9;
      c.strokeStyle = `rgba(255,255,255,${(0.6 * (1 - k)).toFixed(3)})`;
      c.beginPath();
      c.ellipse(r.x, WATER_Y + 2, 6 + k * 34, 2.5 + k * 9, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
  }

  /** Лейка на качающейся доске: корпус, вода с волной, горлышко, ручка */
  private drawCan(c: CanvasRenderingContext2D, v: WellView, mouth: number): void {
    const mw = WELL.mouth * FIELD_W;
    const sway = Math.sin((Math.PI * 2 * v.t) / v.can.period + v.can.phase);
    c.save();
    c.translate(mouth, CAN_Y);
    c.rotate(-sway * 0.06);
    // доска
    c.fillStyle = '#a77a45';
    rr(c, -mw / 2 - 40, 30, mw + 80, 12, 6);
    c.fill();
    c.fillStyle = 'rgba(60,34,12,0.35)';
    rr(c, -mw / 2 - 40, 38, mw + 80, 4, 2);
    c.fill();
    // ручка
    c.strokeStyle = '#4b7a8b';
    c.lineWidth = 8;
    c.beginPath();
    c.arc(mw / 2 + 18, -2, 24, -1.2, 1.2);
    c.stroke();
    // корпус
    const bw = mw + 36;
    c.fillStyle = '#5f8f9f';
    rr(c, -bw / 2, -40, bw, 74, 18);
    c.fill();
    // вода внутри: уровень растёт плавно, поверхность в мелкой волне
    const h = 62 * Math.min(1, this.shown);
    if (h > 0.5) {
      c.save();
      rr(c, -bw / 2, -40, bw, 74, 18);
      c.clip();
      const top = 28 - h;
      c.fillStyle = '#9fd7ec';
      c.beginPath();
      c.moveTo(-bw / 2, 40);
      for (let x = -bw / 2; x <= bw / 2 + 6; x += 6) c.lineTo(x, top + Math.sin(x * 0.12 + v.clock * 4 + sway * 3) * 1.8);
      c.lineTo(bw / 2, 40);
      c.fill();
      c.restore();
    }
    // блик на стекле и горлышко
    c.fillStyle = 'rgba(255,255,255,0.28)';
    rr(c, -bw / 2 + 8, -34, 12, 60, 6);
    c.fill();
    c.fillStyle = '#2f5766';
    rr(c, -mw / 2, -46, mw, 12, 6);
    c.fill();
    c.fillStyle = v.hit ? '#3d8aa8' : '#244755';
    rr(c, -mw / 2 + 5, -43, mw - 10, 6, 3);
    c.fill();
    c.restore();
  }

  /** Ведро в варежке: наклон вокруг центра, вода в нём держит горизонталь и убывает */
  private drawBucket(c: CanvasRenderingContext2D, v: WellView, bx: number): void {
    const ang = v.tilt * (Math.PI / 2);
    const bob = v.pouring ? 0 : Math.sin(v.clock * 3) * 1.6;
    c.save();
    c.translate(bx, BY + bob);
    c.save();
    c.rotate(ang);
    c.fillStyle = '#9a6a38';
    c.beginPath();
    c.moveTo(-34, -42);
    c.lineTo(34, -42);
    c.lineTo(26, 36);
    c.lineTo(-26, 36);
    c.closePath();
    c.fill();
    // вода: поверхность горизонтальна, внутри контура ведра
    const frac = Math.max(0, v.bucket / WELL.bucket);
    if (frac > 0.01) {
      c.save();
      c.beginPath();
      c.moveTo(-31, -39);
      c.lineTo(31, -39);
      c.lineTo(24, 33);
      c.lineTo(-24, 33);
      c.closePath();
      c.clip();
      c.rotate(-ang);
      c.fillStyle = '#8ecde6';
      c.beginPath();
      const top = 36 - 82 * frac;
      c.moveTo(-90, 90);
      for (let x = -90; x <= 90; x += 10) c.lineTo(x, top + Math.sin(x * 0.2 + v.clock * 5) * 1.6);
      c.lineTo(90, 90);
      c.fill();
      c.restore();
    }
    c.fillStyle = '#6a4522';
    c.fillRect(-36, -44, 72, 7);
    c.fillRect(-30, -4, 60, 6);
    c.fillStyle = 'rgba(40,22,8,0.22)';
    c.fillRect(-12, -37, 3, 70);
    c.fillRect(10, -37, 3, 70);
    c.strokeStyle = '#5a3a1a';
    c.lineWidth = 4;
    c.beginPath();
    c.arc(0, -42, 30, Math.PI, 0);
    c.stroke();
    // варежка желейки держит дужку и наклоняет ведро вместе с ней
    c.fillStyle = '#f4c34d';
    c.beginPath();
    c.arc(0, -72, 13, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#e3a92f';
    c.beginPath();
    c.arc(9, -67, 5, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.restore();
  }

  /** Струя лентой по параболе от края ведра к горлышку (или к воде корыта), с бегущими бликами */
  private drawStream(c: CanvasRenderingContext2D, v: WellView, bx: number, sx: number, endY: number): void {
    const ang = v.tilt * (Math.PI / 2);
    // от края ведра; при слабом наклоне струя падает почти отвесно, а не заворачивает назад в ведро
    const lx = Math.min(bx + Math.cos(ang) * 34 + Math.sin(ang) * 42, sx);
    const ly = BY + Math.sin(ang) * 34 - Math.cos(ang) * 42;
    const wd = streamWidth(v.tilt) * FIELD_W;
    const N = 22;
    const pts: number[] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      pts.push(lx + (sx - lx) * u, ly + (endY - ly) * u * u);
    }
    c.fillStyle = 'rgba(142,205,230,0.92)';
    c.beginPath();
    const side: number[] = [];
    for (let i = 0; i <= N; i++) {
      const x = pts[i * 2];
      const y = pts[i * 2 + 1];
      const u = i / N;
      const dx = sx - lx;
      const dy = 2 * (endY - ly) * u;
      const len = Math.hypot(dx, dy) || 1;
      const w = (wd * (1 - 0.35 * u)) / 2;
      const nx = (-dy / len) * w;
      const ny = (dx / len) * w;
      if (i === 0) c.moveTo(x + nx, y + ny);
      else c.lineTo(x + nx, y + ny);
      side.push(x - nx, y - ny);
    }
    for (let i = N; i >= 0; i--) c.lineTo(side[i * 2], side[i * 2 + 1]);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = Math.max(1.5, wd * 0.28);
    c.setLineDash([9, 15]);
    c.lineDashOffset = -v.clock * 240;
    c.beginPath();
    c.moveTo(pts[0], pts[1]);
    for (let i = 1; i <= N; i++) c.lineTo(pts[i * 2], pts[i * 2 + 1]);
    c.stroke();
    c.setLineDash([]);
  }

  // ------------------------------------------------------------ брызги и круги

  private updateParts(dt: number, v: WellView, stream: number): void {
    if (v.pouring && Math.random() < dt * 60 && this.parts.length < 140) {
      const hit = v.hit;
      const spread = streamWidth(v.tilt) * FIELD_W;
      this.parts.push({
        x: stream + (Math.random() - 0.5) * (hit ? 10 : spread), y: hit ? MOUTH_Y + 6 : WATER_Y,
        vx: (Math.random() - 0.5) * (hit ? 60 : 110), vy: -(hit ? 50 : 90) * (0.4 + Math.random() * 0.6), life: 0.5, max: 0.5, r: hit ? 2.4 : 3,
      });
    }
    if (v.pouring && !v.hit) {
      this.rippleAt -= dt;
      if (this.rippleAt <= 0 && this.ripples.length < 8) {
        this.ripples.push({ x: stream, age: 0 });
        this.rippleAt = 0.16;
      }
    }
    for (const p of this.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt; }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const r of this.ripples) r.age += dt;
    this.ripples = this.ripples.filter((r) => r.age < 0.9);
  }

  private drawParts(c: CanvasRenderingContext2D): void {
    for (const p of this.parts) {
      c.fillStyle = `rgba(165,220,242,${Math.min(1, (p.life / p.max) * 1.6).toFixed(3)})`;
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      c.fill();
    }
  }

  /** «Полная лейка!»: мягкий золотой блик вокруг лейки и несколько искр вверх */
  private drawGlow(c: CanvasRenderingContext2D, v: WellView, mouth: number): void {
    const k = Math.min(1, v.fullFor / 0.25) * (0.75 + 0.25 * Math.sin(v.clock * 5));
    const g = c.createRadialGradient(mouth, CAN_Y - 10, 8, mouth, CAN_Y - 10, 190);
    g.addColorStop(0, `rgba(255,226,120,${(0.55 * k).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,226,120,0)');
    c.fillStyle = g;
    c.fillRect(mouth - 200, CAN_Y - 200, 400, 400);
    c.fillStyle = `rgba(255,244,190,${(0.9 * k).toFixed(3)})`;
    for (let i = 0; i < 6; i++) {
      const a = v.clock * 0.9 + i * 1.05;
      const rise = (v.fullFor * 70 + i * 23) % 120;
      const px = mouth + Math.sin(a * 1.7 + i) * 80;
      const py = CAN_Y - 30 - rise;
      c.save();
      c.translate(px, py);
      c.rotate(a);
      const s = 5 * (1 - rise / 140);
      c.fillRect(-s, -1, s * 2, 2);
      c.fillRect(-1, -s, 2, s * 2);
      c.restore();
    }
  }
}
