// Рисунки на холстах для вывесок и накладок оформления площади (plaza2): всё процедурное, ни одного файла.
import { makeRng } from '../../../shared/math.ts';
import { bigText, fitFont, plankLines, roundRectPath, speckle } from './gfx.ts';

type Ctx = CanvasRenderingContext2D;

/** Клякса краски: неровное пятно, лучи с каплями и брызги вокруг. */
export function paintSplat(ctx: Ctx, cx: number, cy: number, r: number, color: string, seed: number): void {
  const rng = makeRng(seed);
  ctx.fillStyle = color;
  ctx.beginPath();
  const n = 20;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.62 + rng() * 0.32);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.quadraticCurveTo(cx + Math.cos(a - 0.15) * (rr + r * 0.12), cy + Math.sin(a - 0.15) * (rr + r * 0.12), x, y);
  }
  ctx.fill();
  const rays = 8 + Math.floor(rng() * 4);
  for (let i = 0; i < rays; i++) {
    const a = rng() * Math.PI * 2;
    const len = r * (1.0 + rng() * 0.55);
    const w = r * (0.04 + rng() * 0.06);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(r * 0.5, -w);
    ctx.lineTo(len, -w * 0.3);
    ctx.lineTo(len, w * 0.3);
    ctx.lineTo(r * 0.5, w);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(len, 0, w * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2;
    const d = r * (1.15 + rng() * 0.6);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.02 + rng() * 0.05), 0, Math.PI * 2);
    ctx.fill();
  }
  // блик
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.2, cy - r * 0.25, r * 0.22, r * 0.12, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

/** Шахматная полоса: клетки со стороной s вдоль x. */
export function checkerStrip(ctx: Ctx, x: number, y: number, w: number, s: number, rows = 1, a = '#1b1b1f', b = '#f4f1e8'): void {
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i * s < w; i++) {
      ctx.fillStyle = (i + r) % 2 ? a : b;
      ctx.fillRect(x + i * s, y + r * s, Math.min(s, w - i * s), s);
    }
  }
}

/** Клетчатый флажок на древке: полотнище 4×3 клетки. */
export function checkerFlag(ctx: Ctx, x: number, y: number, s: number, tilt = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.fillStyle = '#4a3a2c';
  ctx.fillRect(-s * 0.1, -s * 0.2, s * 0.2, s * 3.8);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#1b1b1f' : '#f4f1e8';
      ctx.fillRect(s * 0.1 + c * s * 0.5, -s * 0.1 + r * s * 0.5, s * 0.5, s * 0.5);
    }
  }
  ctx.strokeStyle = '#1b1b1f';
  ctx.lineWidth = Math.max(2, s * 0.06);
  ctx.strokeRect(s * 0.1, -s * 0.1, s * 2, s * 1.5);
  ctx.restore();
}

// ------------------------------------------------------------ пейнтбол

export function drawPaintball(ctx: Ctx, W: number, H: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2f66dc');
  g.addColorStop(1, '#173a96');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 31, 'rgba(255,255,255,0.07)', 'rgba(0,0,40,0.12)');
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 10;
  roundRectPath(ctx, 16, 16, W - 32, H - 32, 26);
  ctx.stroke();
  paintSplat(ctx, W * 0.085, H * 0.53, H * 0.4, '#ff4b3e', 5);
  paintSplat(ctx, W * 0.915, H * 0.5, H * 0.4, '#3fc8ff', 9);
  paintSplat(ctx, W * 0.2, H * 0.84, H * 0.15, '#ffd23f', 12);
  paintSplat(ctx, W * 0.82, H * 0.2, H * 0.14, '#ff4b3e', 15);
  bigText(ctx, 'ПЕЙНТБОЛ', W / 2, H * 0.52, H * 0.8, W - H * 2.4, '#ffffff', '#0d2160', H * 0.09);
}

// ------------------------------------------------------------ картинг

export function drawKarting(ctx: Ctx, W: number, H: number): void {
  ctx.fillStyle = '#f2eee2';
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 33, 'rgba(255,255,255,0.18)', 'rgba(60,40,20,0.08)');
  const s = H * 0.11;
  checkerStrip(ctx, 0, 0, W, s, 1);
  checkerStrip(ctx, 0, H - s, W, s, 1, '#f4f1e8', '#1b1b1f');
  // красная полоса под шашечкой
  ctx.fillStyle = '#d9372b';
  ctx.fillRect(0, s, W, H * 0.045);
  ctx.fillRect(0, H - s - H * 0.045, W, H * 0.045);
  // скоростные полосы и флажки по бокам
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? W * 0.045 : W * 0.955;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === 1 ? '#d9372b' : '#1b1b1f';
      const y = H * (0.38 + i * 0.12);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + side * W * (0.07 - i * 0.012), y + H * 0.035);
      ctx.lineTo(x0, y + H * 0.07);
      ctx.closePath();
      ctx.fill();
    }
  }
  checkerFlag(ctx, W * 0.13, H * 0.27, H * 0.2, -0.12);
  ctx.save();
  ctx.translate(W * 0.87, H * 0.27);
  ctx.scale(-1, 1);
  checkerFlag(ctx, 0, 0, H * 0.2, -0.12);
  ctx.restore();
  // «КАРТИНГ» с наклоном вперёд
  ctx.save();
  ctx.translate(W / 2, H * 0.53);
  ctx.transform(1, 0, -0.2, 1, 0, 0);
  bigText(ctx, 'КАРТИНГ', 0, 0, H * 0.58, W * 0.52, '#e0301e', '#17171a', H * 0.075, 900, 'rgba(255,210,63,0.95)');
  ctx.restore();
}

// ------------------------------------------------------------ крепость

function shield(ctx: Ctx, cx: number, cy: number, s: number): void {
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.5, cy - s * 0.55);
  ctx.lineTo(cx + s * 0.5, cy - s * 0.55);
  ctx.lineTo(cx + s * 0.5, cy + s * 0.1);
  ctx.quadraticCurveTo(cx + s * 0.4, cy + s * 0.55, cx, cy + s * 0.7);
  ctx.quadraticCurveTo(cx - s * 0.4, cy + s * 0.55, cx - s * 0.5, cy + s * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#f2c230';
  ctx.lineWidth = s * 0.07;
  ctx.stroke();
  ctx.fillStyle = '#f2c230';
  ctx.fillRect(cx - s * 0.06, cy - s * 0.38, s * 0.12, s * 0.8);
  ctx.fillRect(cx - s * 0.28, cy - s * 0.12, s * 0.56, s * 0.12);
}

export function drawFortSign(ctx: Ctx, W: number, H: number): void {
  ctx.fillStyle = '#5d3b22';
  ctx.fillRect(0, 0, W, H);
  plankLines(ctx, W, H, H / 4, 'rgba(0,0,0,0.22)');
  speckle(ctx, W, H, 35, 'rgba(255,220,160,0.1)', 'rgba(0,0,0,0.14)');
  ctx.strokeStyle = '#e0b86a';
  ctx.lineWidth = H * 0.06;
  ctx.strokeRect(H * 0.05, H * 0.05, W - H * 0.1, H * 0.9);
  shield(ctx, H * 0.46, H * 0.5, H * 0.56);
  shield(ctx, W - H * 0.46, H * 0.5, H * 0.56);
  bigText(ctx, 'КРЕПОСТЬ', W / 2, H * 0.52, H * 0.7, W - H * 1.45, '#fff1cf', '#2b1a0e', H * 0.085);
  // заклёпки
  ctx.fillStyle = '#2a2018';
  for (const [x, y] of [[0.1, 0.12], [0.9, 0.12], [0.1, 0.88], [0.9, 0.88]] as const) {
    ctx.beginPath();
    ctx.arc(W * x, H * y, H * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Знамя: красное полотнище, золотой щит, зубчатый низ. */
export function drawBanner(ctx: Ctx, W: number, H: number, bg = '#b8322a', fg = '#f2c230'): void {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, H * 0.9);
  ctx.lineTo(W / 2, H);
  ctx.lineTo(0, H * 0.9);
  ctx.closePath();
  ctx.fill();
  speckle(ctx, W, H, 37, 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.12)');
  ctx.strokeStyle = fg;
  ctx.lineWidth = W * 0.06;
  ctx.beginPath();
  ctx.moveTo(W * 0.06, W * 0.06);
  ctx.lineTo(W * 0.94, W * 0.06);
  ctx.lineTo(W * 0.94, H * 0.87);
  ctx.lineTo(W / 2, H * 0.96);
  ctx.lineTo(W * 0.06, H * 0.87);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.fillRect(W * 0.44, H * 0.2, W * 0.12, H * 0.56);
  ctx.fillRect(W * 0.26, H * 0.34, W * 0.48, W * 0.12);
}

/** Табличка «осторожно»: жёлтый ромб с надписью. */
export function drawWarning(ctx: Ctx, W: number, H: number, top: string, bottom: string): void {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#ffd23f';
  roundRectPath(ctx, 6, 6, W - 12, H - 12, 22);
  ctx.fill();
  ctx.strokeStyle = '#1b1b1f';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.fillStyle = '#1b1b1f';
  fitFont(ctx, top, H * 0.34, W - 60);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(top, W / 2, H * 0.34);
  fitFont(ctx, bottom, H * 0.3, W - 60, 800);
  ctx.fillText(bottom, W / 2, H * 0.7);
}

// ------------------------------------------------------------ «Выше облаков»

/** Вывеска в форме облака: белые «клубы» с голубой тенью снизу, текст. Вне облака — прозрачно. */
export function drawCloudSign(ctx: Ctx, W: number, H: number, title: string, sub: string): void {
  ctx.clearRect(0, 0, W, H);
  const puffs: Array<[number, number, number]> = [
    [0.13, 0.62, 0.2], [0.27, 0.42, 0.26], [0.45, 0.33, 0.3], [0.64, 0.4, 0.27], [0.8, 0.52, 0.22], [0.9, 0.66, 0.16],
    [0.2, 0.72, 0.18], [0.5, 0.7, 0.26], [0.75, 0.7, 0.2],
  ];
  const draw = (color: string, dy: number, grow: number) => {
    ctx.fillStyle = color;
    for (const [x, y, r] of puffs) {
      ctx.beginPath();
      ctx.arc(x * W, (y + dy) * H, r * H * grow, 0, Math.PI * 2);
      ctx.fill();
    }
    roundRectPath(ctx, W * 0.1, (0.55 + dy) * H, W * 0.8, H * 0.28 * grow, H * 0.14);
    ctx.fill();
  };
  draw('#9ec9ef', 0.035, 1.0);
  draw('#ffffff', 0, 1.0);
  // лёгкая тень внизу облака
  const g = ctx.createLinearGradient(0, H * 0.55, 0, H * 0.95);
  g.addColorStop(0, 'rgba(180,215,245,0)');
  g.addColorStop(1, 'rgba(150,195,235,0.55)');
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  bigText(ctx, title, W / 2, H * 0.5, H * 0.36, W * 0.74, '#1f58a8', '#ffffff', H * 0.05, 900, 'rgba(60,110,170,0.25)');
  ctx.fillStyle = '#2f6fb8';
  fitFont(ctx, sub, H * 0.13, W * 0.6, 700);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(sub, W / 2, H * 0.74);
}

// ------------------------------------------------------------ накладки на плитку

/** Резиновый коврик перед воротами пейнтбола: красная половина, синяя, разметка, стрелки внутрь и кляксы. */
export function drawPaintPad(ctx: Ctx, W: number, H: number): void {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  roundRectPath(ctx, 4, 4, W - 8, H - 8, H * 0.18);
  ctx.clip();
  ctx.fillStyle = '#2a2f3a';
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 41, 'rgba(255,255,255,0.07)', 'rgba(0,0,0,0.2)', 30);
  ctx.fillStyle = 'rgba(224,64,58,0.34)';
  ctx.fillRect(0, 0, W / 2, H);
  ctx.fillStyle = 'rgba(47,125,224,0.34)';
  ctx.fillRect(W / 2, 0, W / 2, H);
  // стрелки «внутрь» — к воротам, на север (вверх холста)
  for (const cx of [W * 0.2, W * 0.8]) {
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    for (let i = 0; i < 3; i++) {
      const y = H * (0.24 + i * 0.22);
      ctx.beginPath();
      ctx.moveTo(cx, y - H * 0.1);
      ctx.lineTo(cx + H * 0.2, y + H * 0.06);
      ctx.lineTo(cx + H * 0.2, y + H * 0.16);
      ctx.lineTo(cx, y);
      ctx.lineTo(cx - H * 0.2, y + H * 0.16);
      ctx.lineTo(cx - H * 0.2, y + H * 0.06);
      ctx.closePath();
      ctx.fill();
    }
  }
  paintSplat(ctx, W * 0.1, H * 0.78, H * 0.26, 'rgba(255,75,62,0.92)', 21);
  paintSplat(ctx, W * 0.9, H * 0.3, H * 0.24, 'rgba(63,200,255,0.92)', 22);
  paintSplat(ctx, W * 0.34, H * 0.16, H * 0.12, 'rgba(255,210,63,0.9)', 23);
  ctx.restore();
  // каёмка: жёлтая с чёрным по краю, как у ворот
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 8;
  roundRectPath(ctx, 12, 12, W - 24, H - 24, H * 0.17);
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(W / 2, 14);
  ctx.lineTo(W / 2, H - 14);
  ctx.stroke();
}

/** Пит-лейн перед гаражом: асфальт, белые боксы решётки, красно-белый поребрик. */
export function drawKartPad(ctx: Ctx, W: number, H: number): void {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  roundRectPath(ctx, 4, 4, W - 8, H - 8, H * 0.08);
  ctx.clip();
  ctx.fillStyle = '#3a3d45';
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 43, 'rgba(255,255,255,0.1)', 'rgba(0,0,0,0.22)', 40);
  // поребрик красно-белый по южной кромке
  const s = H * 0.055;
  for (let i = 0; i * s < W; i++) {
    ctx.fillStyle = i % 2 ? '#d9372b' : '#f4f1e8';
    ctx.fillRect(i * s, H - s * 1.35, s, s * 1.35);
  }
  // решётка: два ряда белых боксов по обе стороны круга
  ctx.strokeStyle = 'rgba(244,241,232,0.92)';
  ctx.lineWidth = 7;
  const bw = W * 0.105;
  const bh = H * 0.3;
  for (const side of [0.12, 0.78]) {
    for (let r = 0; r < 3; r++) {
      const x = W * side + (r % 2) * bw * 0.35;
      const y = H * (0.08 + r * 0.28);
      ctx.strokeRect(x, y, bw, bh);
    }
  }
  ctx.restore();
  ctx.strokeStyle = '#f4f1e8';
  ctx.lineWidth = 6;
  roundRectPath(ctx, 12, 12, W - 24, H - 24, H * 0.075);
  ctx.stroke();
}

/** Подъёмный мост: доски поперёк, продольные балки, ржавые гвозди. Верх холста — на север (к воротам). */
export function drawDrawbridge(ctx: Ctx, W: number, H: number): void {
  ctx.clearRect(0, 0, W, H);
  const rng = makeRng(47);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const y0 = (i * H) / n;
    const t = 120 + rng() * 40;
    ctx.fillStyle = `rgb(${t | 0},${(t * 0.68) | 0},${(t * 0.42) | 0})`;
    ctx.fillRect(0, y0 + 2, W, H / n - 4);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, y0 + H / n - 4, W, 3);
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = `rgba(60,36,18,${0.08 + rng() * 0.1})`;
      ctx.fillRect(rng() * W, y0 + 4 + rng() * (H / n - 10), W * (0.2 + rng() * 0.4), 2);
    }
  }
  ctx.fillStyle = '#3d2716';
  for (const x of [0, W - W * 0.055]) ctx.fillRect(x, 0, W * 0.055, H);
  ctx.fillStyle = '#242424';
  for (let i = 0; i < n; i++) {
    for (const x of [W * 0.1, W * 0.9]) {
      ctx.beginPath();
      ctx.arc(x, ((i + 0.5) * H) / n, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Облачный порог: пышное кольцо облаков с проёмом посередине (там — круг входа). */
export function drawCloudPad(ctx: Ctx, W: number, H: number): void {
  ctx.clearRect(0, 0, W, H);
  const rng = makeRng(53);
  const cx = W / 2;
  const cy = H / 2;
  const puff = (x: number, y: number, r: number, c: string) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const [color, dy, k] of [['rgba(150,195,235,0.9)', H * 0.02, 1.04], ['rgba(255,255,255,0.97)', 0, 1]] as const) {
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rng() * 0.2;
      const rx = W * (0.36 + rng() * 0.06) * k;
      const ry = H * (0.34 + rng() * 0.06) * k;
      puff(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry + dy, H * (0.1 + rng() * 0.07), color);
    }
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2;
      puff(cx + Math.cos(a) * W * 0.27, cy + Math.sin(a) * H * 0.26 + dy, H * (0.1 + rng() * 0.06), color);
    }
  }
  // проём под круг входа
  ctx.globalCompositeOperation = 'destination-out';
  const g = ctx.createRadialGradient(cx, cy, H * 0.12, cx, cy, H * 0.3);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
}

/** Циферблат башенных часов. */
export function drawClock(ctx: Ctx, W: number, H: number): void {
  ctx.clearRect(0, 0, W, H);
  const r = Math.min(W, H) / 2;
  ctx.translate(W / 2, H / 2);
  ctx.fillStyle = '#2a4a73';
  ctx.beginPath();
  ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fbf6e8';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1b2f4d';
  ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.lineWidth = i % 3 === 0 ? r * 0.07 : r * 0.035;
    ctx.beginPath();
    ctx.moveTo(Math.sin(a) * r * 0.66, -Math.cos(a) * r * 0.66);
    ctx.lineTo(Math.sin(a) * r * 0.78, -Math.cos(a) * r * 0.78);
    ctx.stroke();
  }
  ctx.lineWidth = r * 0.075;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.sin(-0.55) * r * 0.42, -Math.cos(-0.55) * r * 0.42);
  ctx.stroke();
  ctx.lineWidth = r * 0.05;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.sin(2.1) * r * 0.62, -Math.cos(2.1) * r * 0.62);
  ctx.stroke();
  ctx.fillStyle = '#d9372b';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.07, 0, Math.PI * 2);
  ctx.fill();
}

// ------------------------------------------------------------ гавань: двор, регата, катер

/** Рыбка в профиле, смотрит вправо (flip — влево). */
export function fishIcon(ctx: Ctx, cx: number, cy: number, s: number, color: string, flip = false): void {
  ctx.save();
  ctx.translate(cx, cy);
  if (flip) ctx.scale(-1, 1);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.5, s * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.4, 0);
  ctx.lineTo(-s * 0.78, -s * 0.28);
  ctx.lineTo(-s * 0.7, 0);
  ctx.lineTo(-s * 0.78, s * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#17323d';
  ctx.beginPath();
  ctx.arc(s * 0.3, -s * 0.06, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawYardSign(ctx: Ctx, W: number, H: number): void {
  ctx.fillStyle = '#2d5e6e';
  ctx.fillRect(0, 0, W, H);
  plankLines(ctx, W, H, H / 3, 'rgba(0,0,0,0.2)');
  speckle(ctx, W, H, 61, 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.14)');
  ctx.strokeStyle = '#f2e6cc';
  ctx.lineWidth = H * 0.045;
  roundRectPath(ctx, H * 0.06, H * 0.06, W - H * 0.12, H * 0.88, H * 0.1);
  ctx.stroke();
  fishIcon(ctx, H * 0.58, H * 0.5, H * 0.42, '#ffcf6a');
  fishIcon(ctx, W - H * 0.58, H * 0.5, H * 0.42, '#ffcf6a', true);
  bigText(ctx, 'РЫБНЫЙ ДВОР', W / 2, H * 0.4, H * 0.5, W - H * 1.6, '#fff4d6', '#17323d', H * 0.07);
  ctx.fillStyle = '#ffcf6a';
  const sub = 'ПРЯТКИ · ОТ 2 ДО 8 ИГРОКОВ';
  fitFont(ctx, sub, H * 0.14, W - H * 1.8, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(sub, W / 2, H * 0.76);
}

/** Спасательный круг: красно-белый, смотрит на зрителя. */
export function lifebuoy(ctx: Ctx, cx: number, cy: number, r: number): void {
  ctx.lineWidth = r * 0.42;
  for (let i = 0; i < 8; i++) {
    ctx.strokeStyle = i % 2 ? '#f4f1e8' : '#d9372b';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.8, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2);
    ctx.stroke();
  }
}

export function drawRegattaSign(ctx: Ctx, W: number, H: number): void {
  ctx.fillStyle = '#16365e';
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 63, 'rgba(255,255,255,0.07)', 'rgba(0,0,0,0.14)');
  // кайма из сигнальных флагов
  const flags = ['#d9372b', '#f4f1e8', '#ffd23f', '#2f6ad8', '#1f9d55', '#f4f1e8'];
  const s = H * 0.075;
  for (let i = 0; i * s < W; i++) {
    ctx.fillStyle = flags[i % flags.length];
    ctx.fillRect(i * s, 0, s, s);
    ctx.fillStyle = flags[(i + 3) % flags.length];
    ctx.fillRect(i * s, H - s, s, s);
  }
  lifebuoy(ctx, H * 0.55, H * 0.52, H * 0.27);
  lifebuoy(ctx, W - H * 0.55, H * 0.52, H * 0.27);
  bigText(ctx, 'ПОРТОВАЯ', W / 2, H * 0.27, H * 0.2, W - H * 1.6, '#ffd23f', '#0a1e3a', H * 0.03, 900, '');
  bigText(ctx, 'РЕГАТА', W / 2, H * 0.55, H * 0.42, W - H * 1.6, '#ffffff', '#0a1e3a', H * 0.05);
  ctx.fillStyle = '#9fd6ff';
  const sub = 'КАТЕРА — НА СТАРТ · 3 КРУГА ПО БУХТЕ';
  fitFont(ctx, sub, H * 0.115, W - H * 1.7, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(sub, W / 2, H * 0.83);
}

export function drawBoatGateSign(ctx: Ctx, W: number, H: number): void {
  ctx.fillStyle = '#f6f2e8';
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 65, 'rgba(255,255,255,0.2)', 'rgba(40,60,90,0.07)');
  ctx.strokeStyle = '#1f4a72';
  ctx.lineWidth = H * 0.06;
  roundRectPath(ctx, H * 0.06, H * 0.06, W - H * 0.12, H * 0.88, H * 0.12);
  ctx.stroke();
  lifebuoy(ctx, H * 0.55, H * 0.5, H * 0.27);
  lifebuoy(ctx, W - H * 0.55, H * 0.5, H * 0.27);
  bigText(ctx, 'КАТЕР', W / 2, H * 0.2, H * 0.19, W - H * 1.6, '#d9372b', '#f6f2e8', H * 0.03, 900, '');
  bigText(ctx, '«ЛАСТОЧКА»', W / 2, H * 0.5, H * 0.44, W - H * 1.6, '#1f4a72', '#ffffff', H * 0.04, 900, 'rgba(31,74,114,0.22)');
  ctx.fillStyle = '#2d5e86';
  const sub = 'ПРОГУЛКА ПО БУХТЕ · НАЖМИ E У КАТЕРА';
  fitFont(ctx, sub, H * 0.115, W - H * 1.7, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(sub, W / 2, H * 0.82);
}

export function drawNumberPlate(ctx: Ctx, W: number, H: number, n: number): void {
  ctx.clearRect(0, 0, W, H);
  roundRectPath(ctx, 3, 3, W - 6, H - 6, H * 0.22);
  ctx.fillStyle = '#f6f2e8';
  ctx.fill();
  ctx.strokeStyle = '#1b2f4d';
  ctx.lineWidth = H * 0.06;
  ctx.stroke();
  bigText(ctx, String(n).padStart(2, '0'), W / 2, H * 0.54, H * 0.7, W * 0.8, '#1b2f4d', '#f6f2e8', 0, 900, '');
}

// ------------------------------------------------------------ Fight Club

/** Перчатка: красный кулак с манжетой, смотрит вправо. */
export function gloveIcon(ctx: Ctx, cx: number, cy: number, s: number, color = '#d9372b'): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.5, s * 0.4, -0.15, 0, Math.PI * 2);
  ctx.fill();
  roundRectPath(ctx, -s * 0.72, -s * 0.2, s * 0.34, s * 0.4, s * 0.06);
  ctx.fillStyle = '#f4f1e8';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = s * 0.04;
  ctx.beginPath();
  ctx.moveTo(s * 0.12, -s * 0.2);
  ctx.quadraticCurveTo(s * 0.32, 0, s * 0.12, s * 0.2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.ellipse(-s * 0.05, -s * 0.2, s * 0.2, s * 0.08, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Доска на кронштейне у угла кафе (портрет): перчатка сверху, FIGHT / CLUB, мелкая подпись. Красная окантовка. */
export function drawFightSign(ctx: Ctx, W: number, H: number): void {
  ctx.fillStyle = '#17171b';
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 67, 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)');
  ctx.strokeStyle = '#d9372b';
  ctx.lineWidth = W * 0.045;
  roundRectPath(ctx, W * 0.05, W * 0.05, W * 0.9, H - W * 0.1, W * 0.09);
  ctx.stroke();
  gloveIcon(ctx, W * 0.5, H * 0.2, W * 0.5);
  bigText(ctx, 'FIGHT', W / 2, H * 0.47, H * 0.2, W * 0.84, '#ff4b3e', '#ffffff', W * 0.022, 900, 'rgba(255,60,40,0.5)');
  bigText(ctx, 'CLUB', W / 2, H * 0.67, H * 0.2, W * 0.84, '#ff4b3e', '#ffffff', W * 0.022, 900, 'rgba(255,60,40,0.5)');
  ctx.fillStyle = '#f4f1e8';
  const l1 = 'ПОДВАЛ · БОИ ПО ОЧЕРЕДИ';
  fitFont(ctx, l1, H * 0.062, W * 0.84, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(l1, W / 2, H * 0.83);
  ctx.fillStyle = '#ff8a7a';
  const l2 = 'ВХОД С ЮГА, ВНИЗ ПО СТУПЕНЯМ';
  fitFont(ctx, l2, H * 0.055, W * 0.84, 700);
  ctx.fillText(l2, W / 2, H * 0.91);
}

// ------------------------------------------------------------ коврики-«двери» на земле

/** Брезент с сетью: тёмно-бирюзовая ткань, по краю — сетка с поплавками, внутри — стайка рыб. Верх — север. */
export function drawYardPad(ctx: Ctx, W: number, H: number): void {
  const R = H * 0.12;
  ctx.clearRect(0, 0, W, H);
  roundRectPath(ctx, 0, 0, W, H, R);
  ctx.fillStyle = '#2a6679';
  ctx.fill();
  ctx.save();
  ctx.clip();
  // ткань: перекрёстное плетение
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 2;
  for (let i = -H; i < W + H; i += 14) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + H, H);
    ctx.stroke();
  }
  speckle(ctx, W, H, 71, 'rgba(255,255,255,0.07)', 'rgba(0,0,0,0.12)', 24);
  // сеть по краю: ромбы
  const m = H * 0.2;
  ctx.strokeStyle = 'rgba(8,36,48,0.55)';
  ctx.lineWidth = 3;
  const step = H * 0.075;
  const inside = (x: number, y: number): boolean => x > m && x < W - m && y > m && y < H - m;
  for (let y = -step; y < H + step; y += step) {
    for (let x = -step; x < W + step; x += step) {
      if (inside(x, y) && inside(x + step, y + step)) continue;
      const ox = (Math.round(y / step) % 2) * (step / 2);
      ctx.beginPath();
      ctx.moveTo(x + ox, y);
      ctx.lineTo(x + ox + step / 2, y + step / 2);
      ctx.lineTo(x + ox, y + step);
      ctx.lineTo(x + ox - step / 2, y + step / 2);
      ctx.closePath();
      ctx.stroke();
    }
  }
  // внутренний край сети — светлая верёвка
  ctx.strokeStyle = '#d9c9a0';
  ctx.lineWidth = H * 0.018;
  ctx.setLineDash([H * 0.05, H * 0.025]);
  roundRectPath(ctx, m, m, W - m * 2, H - m * 2, R * 0.6);
  ctx.stroke();
  ctx.setLineDash([]);
  // рыбы кругом: серебристые, хвостом по часовой
  const rng = makeRng(77);
  const cx = W / 2;
  const cy = H / 2;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const rx = W * 0.4 * (0.9 + rng() * 0.08);
    const ry = H * 0.36 * (0.9 + rng() * 0.08);
    ctx.save();
    ctx.translate(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
    ctx.rotate(a + Math.PI / 2);
    fishIcon(ctx, 0, 0, H * 0.11, i % 3 === 0 ? '#ffcf6a' : 'rgba(210,235,240,0.78)');
    ctx.restore();
  }
  ctx.restore();
  // поплавки по периметру
  const floats = ['#ff7a2f', '#f4f1e8'];
  const per = 28;
  for (let i = 0; i < per; i++) {
    const t = i / per;
    const p = rrPoint(W, H, R * 0.5, t);
    ctx.fillStyle = floats[i % 2];
    ctx.beginPath();
    ctx.arc(p[0], p[1], H * 0.026, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(p[0] + H * 0.006, p[1] + H * 0.008, H * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Точка на периметре скруглённого прямоугольника с отступом inset по доле t (0…1) */
function rrPoint(W: number, H: number, inset: number, t: number): [number, number] {
  const w = W - inset * 2;
  const h = H - inset * 2;
  const per = (w + h) * 2;
  let d = t * per;
  if (d < w) return [inset + d, inset];
  d -= w;
  if (d < h) return [inset + w, inset + d];
  d -= h;
  if (d < w) return [inset + w - d, inset + h];
  d -= w;
  return [inset, inset + h - d];
}

/** Стапель регаты: тёмно-синий настил, стрелки к воде, красно-белый поребрик и шашечки линии старта. Верх — север, вода — юг. */
export function drawRegattaPad(ctx: Ctx, W: number, H: number): void {
  const R = H * 0.07;
  ctx.clearRect(0, 0, W, H);
  roundRectPath(ctx, 0, 0, W, H, R);
  ctx.fillStyle = '#1a3c66';
  ctx.fill();
  ctx.save();
  ctx.clip();
  speckle(ctx, W, H, 73, 'rgba(255,255,255,0.06)', 'rgba(0,0,0,0.14)', 20);
  // шевроны к воде (вниз)
  ctx.strokeStyle = 'rgba(160,205,255,0.18)';
  ctx.lineWidth = H * 0.028;
  ctx.lineJoin = 'round';
  for (let k = 0; k < 6; k++) {
    const y = H * (0.12 + k * 0.15);
    ctx.beginPath();
    ctx.moveTo(W * 0.1, y);
    ctx.lineTo(W * 0.5, y + H * 0.1);
    ctx.lineTo(W * 0.9, y);
    ctx.stroke();
  }
  // линия старта: шашечки у южной кромки
  const cell = H * 0.05;
  for (let i = 0; i * cell < W - R * 2; i++) {
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#101820' : '#f4f1e8';
      ctx.fillRect(R + i * cell, H - H * 0.17 + j * cell, cell, cell);
    }
  }
  // поребрик
  const b = H * 0.05;
  for (let i = 0; i * b * 2 < W; i++) {
    ctx.fillStyle = i % 2 ? '#f4f1e8' : '#d9372b';
    ctx.fillRect(i * b * 2, 0, b * 2, b);
    ctx.fillRect(i * b * 2, H - b, b * 2, b);
  }
  for (let j = 0; j * b * 2 < H; j++) {
    ctx.fillStyle = j % 2 ? '#f4f1e8' : '#d9372b';
    ctx.fillRect(0, j * b * 2, b, b * 2);
    ctx.fillRect(W - b, j * b * 2, b, b * 2);
  }
  ctx.restore();
}

/** Бетонный коврик у подвала: тёмный, красно-чёрная диагональ по краю, трещины. Верх — север. */
export function drawFightPad(ctx: Ctx, W: number, H: number): void {
  const R = H * 0.1;
  ctx.clearRect(0, 0, W, H);
  roundRectPath(ctx, 0, 0, W, H, R);
  ctx.fillStyle = '#3b3b42';
  ctx.fill();
  ctx.save();
  ctx.clip();
  speckle(ctx, W, H, 79, 'rgba(255,255,255,0.07)', 'rgba(0,0,0,0.2)', 26);
  // трещины
  const rng = makeRng(81);
  ctx.strokeStyle = 'rgba(0,0,0,0.38)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    let x = rng() * W;
    let y = rng() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (rng() - 0.5) * W * 0.12;
      y += (rng() - 0.3) * H * 0.12;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // красно-чёрная диагональ по периметру
  const b = H * 0.07;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.rect(b, b, W - b * 2, H - b * 2);
  ctx.clip('evenodd');
  const s = b * 1.6;
  for (let i = -H; i < W + H; i += s * 2) {
    ctx.fillStyle = '#d9372b';
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + s, 0);
    ctx.lineTo(i + s + H, H);
    ctx.lineTo(i + H, H);
    ctx.fill();
    ctx.fillStyle = '#17171b';
    ctx.beginPath();
    ctx.moveTo(i + s, 0);
    ctx.lineTo(i + s * 2, 0);
    ctx.lineTo(i + s * 2 + H, H);
    ctx.lineTo(i + s + H, H);
    ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}

// ------------------------------------------------------------ улица: лента, номера домов, уличные доски, указатели

/** Номер дома: синяя эмалевая табличка с белой каймой и цифрой. */
export function drawHouseNumber(ctx: Ctx, W: number, H: number, n: number): void {
  ctx.clearRect(0, 0, W, H);
  roundRectPath(ctx, 1, 1, W - 2, H - 2, H * 0.22);
  ctx.fillStyle = '#1f4a72';
  ctx.fill();
  ctx.strokeStyle = '#f6f2e8';
  ctx.lineWidth = Math.max(2, H * 0.06);
  roundRectPath(ctx, H * 0.08, H * 0.08, W - H * 0.16, H - H * 0.16, H * 0.16);
  ctx.stroke();
  bigText(ctx, String(n), W / 2, H * 0.54, H * 0.66, W * 0.7, '#ffffff', '#1f4a72', 0, 900, '');
}

/** Уличная доска: «УЛИЦА АТТРАКЦИОНОВ» со стрелкой вдоль улицы (dir > 0 — вправо). */
export function drawStreetPlate(ctx: Ctx, W: number, H: number, dir: 1 | -1): void {
  ctx.clearRect(0, 0, W, H);
  roundRectPath(ctx, 1, 1, W - 2, H - 2, H * 0.2);
  ctx.fillStyle = '#1f5aa6';
  ctx.fill();
  ctx.strokeStyle = '#f6f2e8';
  ctx.lineWidth = Math.max(2, H * 0.05);
  roundRectPath(ctx, H * 0.07, H * 0.07, W - H * 0.14, H - H * 0.14, H * 0.15);
  ctx.stroke();
  // стрелка
  const ax = dir > 0 ? W - H * 0.62 : H * 0.62;
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(ax + dir * H * 0.3, H * 0.5);
  ctx.lineTo(ax - dir * H * 0.02, H * 0.22);
  ctx.lineTo(ax - dir * H * 0.02, H * 0.38);
  ctx.lineTo(ax - dir * H * 0.3, H * 0.38);
  ctx.lineTo(ax - dir * H * 0.3, H * 0.62);
  ctx.lineTo(ax - dir * H * 0.02, H * 0.62);
  ctx.lineTo(ax - dir * H * 0.02, H * 0.78);
  ctx.closePath();
  ctx.fill();
  const x0 = dir > 0 ? H * 0.2 : H * 1.2;
  const x1 = dir > 0 ? W - H * 1.2 : W - H * 0.2;
  bigText(ctx, 'УЛИЦА АТТРАКЦИОНОВ', (x0 + x1) / 2, H * 0.53, H * 0.42, x1 - x0, '#ffffff', '#1f5aa6', 0, 800, '');
}

/** Стрелка-указатель на столбе: доска с острым концом (tipRight — остриё справа), название и расстояние. */
export function drawArm(ctx: Ctx, W: number, H: number, label: string, meters: number, tipRight: boolean): void {
  ctx.clearRect(0, 0, W, H);
  const tip = H * 0.55;
  const x0 = tipRight ? 1 : tip;
  const x1 = tipRight ? W - tip : W - 1;
  ctx.beginPath();
  if (tipRight) {
    ctx.moveTo(x0, 2);
    ctx.lineTo(x1, 2);
    ctx.lineTo(W - 2, H / 2);
    ctx.lineTo(x1, H - 2);
    ctx.lineTo(x0, H - 2);
  } else {
    ctx.moveTo(x1, 2);
    ctx.lineTo(x0, 2);
    ctx.lineTo(2, H / 2);
    ctx.lineTo(x0, H - 2);
    ctx.lineTo(x1, H - 2);
  }
  ctx.closePath();
  ctx.fillStyle = '#b98a56';
  ctx.fill();
  ctx.save();
  ctx.clip();
  plankLines(ctx, W, H, H / 3, 'rgba(60,35,15,0.22)');
  speckle(ctx, W, H, 91 + label.length, 'rgba(255,240,200,0.12)', 'rgba(60,35,15,0.14)', 18);
  ctx.restore();
  ctx.strokeStyle = '#6b4423';
  ctx.lineWidth = Math.max(2, H * 0.06);
  ctx.stroke();
  const textX0 = tipRight ? H * 0.2 : tip + H * 0.1;
  const textX1 = tipRight ? W - tip - H * 0.1 : W - H * 0.2;
  const dist = `${Math.round(meters)} м`;
  ctx.fillStyle = '#3a2410';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const dSize = fitFont(ctx, dist, H * 0.34, H * 1.5, 700);
  const dW = ctx.measureText(dist).width;
  const lSize = fitFont(ctx, label, H * 0.5, textX1 - textX0 - dW - H * 0.2, 900);
  ctx.fillStyle = '#2a1608';
  ctx.fillText(label, textX0, H * 0.53);
  ctx.font = `700 ${dSize}px Rubik, system-ui, sans-serif`;
  ctx.fillStyle = '#6b3d14';
  ctx.textAlign = 'right';
  ctx.fillText(dist, textX1, H * 0.55);
  void lSize;
}

/** Дорожка вдоль фасадов (период 2 м по x): тёплая плитка, синяя кайма с белыми «заклёпками» у проезжей части, цепочка ромбов. Верх — север (к домам). */
export function drawStreetRibbon(ctx: Ctx, W: number, H: number): void {
  const mx = W / 2;
  ctx.fillStyle = '#eddcb8';
  ctx.fillRect(0, 0, W, H);
  // плитка 0,5 м: слабые швы
  ctx.strokeStyle = 'rgba(120,88,56,0.16)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo((i * W) / 4, 0);
    ctx.lineTo((i * W) / 4, H);
    ctx.stroke();
  }
  const rows = Math.round(H / (W / 4));
  for (let j = 0; j <= rows; j++) {
    ctx.beginPath();
    ctx.moveTo(0, (j * H) / rows);
    ctx.lineTo(W, (j * H) / rows);
    ctx.stroke();
  }
  speckle(ctx, W, H, 97, 'rgba(255,255,255,0.18)', 'rgba(120,88,56,0.10)', 30);
  // кайма у домов — тонкая; у проезжей части (низ) — широкая с белыми точками
  ctx.fillStyle = '#1f4a72';
  ctx.fillRect(0, 0, W, H * 0.022);
  ctx.fillRect(0, H * 0.935, W, H * 0.065);
  ctx.fillStyle = '#e8923a';
  ctx.fillRect(0, H * 0.912, W, H * 0.018);
  ctx.fillStyle = '#f6f2e8';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(mx / 2 + (i * W) / 4, H * 0.968, H * 0.009, 0, Math.PI * 2);
    ctx.fill();
  }
  // цепочка ромбов посередине: синий и оранжевый через раз, между ними — светлые точки
  const cy = H * 0.5;
  const r = H * 0.075;
  for (let i = 0; i < 2; i++) {
    const cx = W * (0.25 + i * 0.5);
    ctx.fillStyle = i % 2 ? '#e8923a' : '#1f4a72';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 1.25);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r * 1.25);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f6f2e8';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(31,74,114,0.5)';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc((i * W) / 4 + W / 8 + 0, cy, H * 0.014, 0, Math.PI * 2);
    ctx.fill();
  }
  // тонкие линии по бокам ромбов
  ctx.strokeStyle = 'rgba(31,74,114,0.35)';
  ctx.lineWidth = H * 0.008;
  ctx.beginPath();
  ctx.moveTo(0, cy - r * 1.9);
  ctx.lineTo(W, cy - r * 1.9);
  ctx.moveTo(0, cy + r * 1.9);
  ctx.lineTo(W, cy + r * 1.9);
  ctx.stroke();
}

/** Верхняя табличка указателя: тёмно-синяя, жёлтые буквы. */
export function drawSignTop(ctx: Ctx, W: number, H: number, text: string): void {
  ctx.clearRect(0, 0, W, H);
  roundRectPath(ctx, 1, 1, W - 2, H - 2, H * 0.28);
  ctx.fillStyle = '#16365e';
  ctx.fill();
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = Math.max(2, H * 0.06);
  roundRectPath(ctx, H * 0.1, H * 0.1, W - H * 0.2, H - H * 0.2, H * 0.2);
  ctx.stroke();
  bigText(ctx, text, W / 2, H * 0.54, H * 0.5, W - H * 0.7, '#ffd23f', '#16365e', 0, 900, '');
}

// ------------------------------------------------------------ надувной ПВХ (аквапарк)

/**
 * Плитка надувного ПВХ: две «трубы» одна над другой, как у надувного матраса — между ними сварной шов, посередине блик,
 * к швам — тень. Бесшовная. Оттенок нейтральный (цвет даёт вершина), яркость — ещё и высота для рельефа (bumpMap): шов — канавка.
 */
export function drawPvc(ctx: Ctx, W: number, H: number): void {
  const ribs = 2;
  const rh = H / ribs;
  for (let i = 0; i < ribs; i++) {
    const y0 = i * rh;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + rh);
    g.addColorStop(0, '#76849a');
    g.addColorStop(0.07, '#aab5c4');
    g.addColorStop(0.22, '#f6f9fc');
    g.addColorStop(0.34, '#ffffff');
    g.addColorStop(0.58, '#e9eef4');
    g.addColorStop(0.9, '#b4bfcd');
    g.addColorStop(1, '#76849a');
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, W, rh);
  }
  // чуть светлее и темнее вдоль трубы: бесшовно по ширине
  const along = ctx.createLinearGradient(0, 0, W, 0);
  along.addColorStop(0, 'rgba(255,255,255,0)');
  along.addColorStop(0.25, 'rgba(255,255,255,0.1)');
  along.addColorStop(0.5, 'rgba(60,76,100,0.06)');
  along.addColorStop(0.75, 'rgba(255,255,255,0.1)');
  along.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = along;
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 71, 'rgba(255,255,255,0.14)', 'rgba(70,86,110,0.06)', 30);
}

// ------------------------------------------------------------ вход в аквапарк

/** Вывеска ворот аквапарка: синяя доска с волнами, солнцем и именем. */
export function drawAquaGate(ctx: Ctx, W: number, H: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2d8ef2');
  g.addColorStop(1, '#0f4ea6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // волны по нижней кромке: голубая и белая
  for (let k = 0; k < 2; k++) {
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 6) ctx.lineTo(x, H * (0.9 - k * 0.05) + Math.sin(x / (W * 0.028) + k * 1.4) * H * 0.028);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = k === 0 ? 'rgba(150,222,255,0.4)' : 'rgba(255,255,255,0.3)';
    ctx.fill();
  }
  // солнце слева, завиток волны справа
  const sx = H * 0.52;
  const sy = H * 0.46;
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.arc(sx, sy, H * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = H * 0.04;
  ctx.lineCap = 'round';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(sx + Math.cos(a) * H * 0.23, sy + Math.sin(a) * H * 0.23);
    ctx.lineTo(sx + Math.cos(a) * H * 0.31, sy + Math.sin(a) * H * 0.31);
    ctx.stroke();
  }
  const wx = W - H * 0.52;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = H * 0.06;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const x = wx - H * 0.3 + t * H * 0.6;
      const y = sy - H * 0.16 + k * H * 0.16 + Math.sin(t * Math.PI * 2) * H * 0.05;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  bigText(ctx, 'АКВАПАРК «ВОЛНА»', W / 2, H * 0.4, H * 0.42, W - H * 1.6, '#ffffff', '#0a3a82', H * 0.05, 900, 'rgba(0,30,80,0.45)');
  ctx.fillStyle = '#ffe48a';
  const t = 'ПОЛОСА ПРЕПЯТСТВИЙ · ПРОБЕГИ НА ВРЕМЯ';
  fitFont(ctx, t, H * 0.1, W - H * 1.8, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t, W / 2, H * 0.7);
}

/**
 * Коврик у мостика: синий, в белых волнах, с большой стрелкой на запад — на воду. Верх холста — север, но читать его будут,
 * идя на запад: рисуем в повёрнутых осях (вверх — на запад, вправо — на север).
 */
export function drawAquaPad(ctx: Ctx, W: number, H: number): void {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-Math.PI / 2);
  const lw = H;
  const lh = W;
  ctx.translate(-lw / 2, -lh / 2);
  const m = Math.min(lw, lh) * 0.03;
  roundRectPath(ctx, m, m, lw - 2 * m, lh - 2 * m, lw * 0.12);
  const g = ctx.createLinearGradient(0, 0, 0, lh);
  g.addColorStop(0, '#1f7ae0');
  g.addColorStop(1, '#0f4ea6');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // волны через весь коврик
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = lw * 0.018;
  for (let k = 0; k < 9; k++) {
    ctx.beginPath();
    for (let x = 0; x <= lw; x += 8) {
      const y = lh * (0.08 + k * 0.115) + Math.sin(x / (lw * 0.09) + k) * lh * 0.012;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = '#f6f2e8';
  ctx.lineWidth = Math.max(4, lw * 0.03);
  roundRectPath(ctx, m + lw * 0.04, m + lw * 0.04, lw - 2 * (m + lw * 0.04), lh - 2 * (m + lw * 0.04), lw * 0.09);
  ctx.stroke();
  // стрелка вверх (= на запад)
  const cx = lw / 2;
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(cx, lh * 0.12);
  ctx.lineTo(cx + lw * 0.3, lh * 0.36);
  ctx.lineTo(cx + lw * 0.13, lh * 0.36);
  ctx.lineTo(cx + lw * 0.13, lh * 0.56);
  ctx.lineTo(cx - lw * 0.13, lh * 0.56);
  ctx.lineTo(cx - lw * 0.13, lh * 0.36);
  ctx.lineTo(cx - lw * 0.3, lh * 0.36);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#0a3a82';
  ctx.lineWidth = lw * 0.014;
  ctx.stroke();
  bigText(ctx, 'НА СТАРТ', cx, lh * 0.73, lw * 0.19, lw * 0.8, '#ffffff', '#0a3a82', lw * 0.02, 900, '');
  ctx.fillStyle = '#d9efff';
  fitFont(ctx, 'сошёл с мостика — пошло время', lw * 0.06, lw * 0.8, 700);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('сошёл с мостика — пошло время', cx, lh * 0.87);
  ctx.restore();
}
