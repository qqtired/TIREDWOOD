// Линии скорости поверх экрана в ускорении: белые штрихи летят от середины к краям, середина с картом — чистая.
// Мини-турбо — реже и бледнее, турбо из ящика — гуще. Свой холст под интерфейсом гонки; без ускорения он пуст.

interface Streak {
  /** Направление от середины экрана */
  a: number;
  /** Где штрих: доля половины диагонали экрана */
  r: number;
  len: number;
  /** Скорость разлёта, долей в секунду */
  v: number;
  /** Толщина, px */
  w: number;
}

/** Штрихов в секунду при полной силе и не больше стольких сразу */
const RATE = 120;
const MAX = 160;
/** Ближе к середине штрихов нет (доля половины диагонали) */
const CLEAR_R = 0.42;
/** Середина разлёта — чуть выше середины экрана (там дорога впереди) */
const CENTER_Y = 0.46;

export class SpeedLines {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly lines: Streak[] = [];
  /** Сила 0…1 (плавно к цели) */
  private power = 0;
  private acc = 0;
  private drawn = false;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'rc-lines';
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  /** Кадр. target: 0 — без ускорения, 1 — турбо из ящика */
  update(dt: number, target: number): void {
    this.power += (target - this.power) * Math.min(1, dt * (target > this.power ? 10 : 4));
    if (target === 0 && this.power < 0.02) {
      this.power = 0;
      this.lines.length = 0;
    }
    const { canvas, ctx } = this;
    if (this.power === 0) {
      if (this.drawn) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.drawn = false;
      }
      return;
    }
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const W = Math.round(canvas.clientWidth * dpr);
    const H = Math.round(canvas.clientHeight * dpr);
    if (W === 0 || H === 0) return;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }

    this.acc += dt * RATE * this.power;
    while (this.acc >= 1) {
      this.acc -= 1;
      if (this.lines.length >= MAX) continue;
      this.lines.push({
        a: Math.random() * Math.PI * 2, r: CLEAR_R + Math.random() * 0.3, len: 0.08 + Math.random() * 0.2,
        v: 0.9 + Math.random() * 0.9, w: 1.2 + Math.random() * 2.2,
      });
    }

    const cx = W / 2;
    const cy = H * CENTER_Y;
    const R = Math.hypot(W, H) / 2;
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#ffffff';
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const s = this.lines[i];
      // к краям — быстрее, как в перспективе
      s.r += s.v * dt * (0.5 + s.r);
      if (s.r > 1.1) {
        this.lines[i] = this.lines[this.lines.length - 1];
        this.lines.pop();
        continue;
      }
      const c = Math.cos(s.a);
      const sn = Math.sin(s.a);
      const r0 = s.r * R;
      const r1 = (s.r + s.len) * R;
      ctx.globalAlpha = Math.min(1, (s.r - CLEAR_R) * 5) * 0.6 * this.power;
      ctx.lineWidth = s.w * dpr;
      ctx.beginPath();
      ctx.moveTo(cx + c * r0, cy + sn * r0);
      ctx.lineTo(cx + c * r1, cy + sn * r1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.drawn = true;
  }
}
