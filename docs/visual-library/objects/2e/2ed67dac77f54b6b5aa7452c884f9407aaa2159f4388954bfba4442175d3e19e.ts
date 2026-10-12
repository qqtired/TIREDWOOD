// Процедурные текстуры «Крепости»: кладка стен, луг, дорожная пыль, брусчатка двора, доски ворот (с трещинами и
// дырами — по прочности), сено, таблички стоек. Всё рисуется на canvas при загрузке, без файлов.
import * as THREE from 'three';
import { makeRng } from '../../shared/math.ts';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** Попиксельный шум поверх нарисованного */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, rng: () => number): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

/** Мягкие пятна с переносом через края (текстура тайлится без швов) */
function blotches(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, rMin: number, rMax: number, color: string, alpha: number, rng: () => number): void {
  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = rMin + rng() * (rMax - rMin);
    const a = alpha * (0.4 + rng() * 0.6);
    for (const ox of [-w, 0, w]) {
      for (const oy of [-h, 0, h]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = a;
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
  ctx.globalAlpha = 1;
}

/** Прямоугольник с переносом через правый край */
function wrapRect(ctx: CanvasRenderingContext2D, S: number, x: number, y: number, w: number, h: number): void {
  const a = ((x % S) + S) % S;
  ctx.fillRect(a, y, Math.min(w, S - a), h);
  if (a + w > S) ctx.fillRect(0, y, a + w - S, h);
}

/** Кладка стен: ряды тёсаных камней разной длины, светлый песчаник, швы и сколы. 512 px = 4 м. */
export function stoneTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(311);
  ctx.fillStyle = '#9d907a';
  ctx.fillRect(0, 0, S, S);
  const rows = 8;
  const rh = S / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    const n = 3 + Math.floor(rng() * 2);
    const wts = Array.from({ length: n }, () => 0.7 + rng() * 0.6);
    const sum = wts.reduce((p, q) => p + q, 0);
    let x = rng() * S;
    for (const wt of wts) {
      const len = (wt / sum) * S;
      const t = 196 + Math.floor(rng() * 44);
      ctx.fillStyle = `rgb(${t},${Math.floor(t * 0.93)},${Math.floor(t * 0.8)})`;
      wrapRect(ctx, S, x + 3, y + 3, len - 6, rh - 6);
      // свет сверху, тень снизу — камень «выпуклый»
      ctx.fillStyle = 'rgba(255,250,235,0.22)';
      wrapRect(ctx, S, x + 3, y + 3, len - 6, 4);
      ctx.fillStyle = 'rgba(60,45,30,0.2)';
      wrapRect(ctx, S, x + 3, y + rh - 8, len - 6, 5);
      x += len;
    }
  }
  blotches(ctx, S, S, 26, 20, 90, 'rgba(110,95,70,1)', 0.14, rng);
  // мох и лишайник пятнышками
  blotches(ctx, S, S, 10, 6, 22, 'rgba(110,140,70,1)', 0.22, rng);
  grain(ctx, S, S, 22, rng);
  return toTexture(c);
}

/** Тёсаный камень бруствера, ступеней и постамента: ровнее кладки. 256 px = 2 м. */
export function cutStoneTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(331);
  ctx.fillStyle = '#e8e0cc';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(120,105,80,0.35)';
  ctx.fillRect(0, 0, S, 3);
  ctx.fillRect(0, S / 2, S, 3);
  ctx.fillRect(S / 2, 0, 3, S / 2);
  ctx.fillRect(0, S / 2, 3, S / 2);
  blotches(ctx, S, S, 22, 10, 50, 'rgba(130,115,90,1)', 0.14, rng);
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(90,80,64,${rng() * 0.22})`;
    ctx.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2);
  }
  grain(ctx, S, S, 16, rng);
  return toTexture(c);
}

/** Луг: трава мазками разных оттенков, клевер и жёлтые цветочки. 512 px = 8 м. */
export function grassTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(421);
  ctx.fillStyle = '#76a64c';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 30, 30, 110, 'rgba(150,190,80,1)', 0.25, rng);
  blotches(ctx, S, S, 24, 30, 100, 'rgba(60,110,50,1)', 0.22, rng);
  const greens = ['#5f9a3e', '#86b85a', '#6aa44a', '#9cc766', '#4f8a38'];
  for (let i = 0; i < 9000; i++) {
    const x = rng() * S;
    const y = rng() * S;
    ctx.strokeStyle = greens[Math.floor(rng() * greens.length)];
    ctx.globalAlpha = 0.45 + rng() * 0.4;
    ctx.lineWidth = 1 + rng() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 4, y - 3 - rng() * 6);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 70; i++) {
    const x = rng() * S;
    const y = rng() * S;
    ctx.fillStyle = rng() < 0.6 ? '#fff6c2' : '#f5d64a';
    ctx.beginPath();
    ctx.arc(x, y, 1.6 + rng() * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  grain(ctx, S, S, 14, rng);
  return toTexture(c);
}

/** Грунтовка: утоптанная пыль, камешки, колеи. Белая основа — цвет даёт материал. 256 px = 4 м. */
export function dirtTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(433);
  ctx.fillStyle = '#c9a77a';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 24, 14, 60, 'rgba(150,115,75,1)', 0.25, rng);
  blotches(ctx, S, S, 16, 14, 50, 'rgba(225,200,160,1)', 0.25, rng);
  for (let i = 0; i < 260; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const r = 0.8 + rng() * 2.2;
    const t = 150 + Math.floor(rng() * 80);
    ctx.fillStyle = `rgb(${t},${Math.floor(t * 0.9)},${Math.floor(t * 0.78)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  grain(ctx, S, S, 18, rng);
  return toTexture(c);
}

/** Брусчатка двора: круглые булыжники. 256 px = 3 м. */
export function cobbleTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(443);
  ctx.fillStyle = '#8e8270';
  ctx.fillRect(0, 0, S, S);
  const cell = 21.3;
  for (let gy = 0; gy < 12; gy++) {
    for (let gx = 0; gx < 12; gx++) {
      const x = gx * cell + (gy % 2 ? cell / 2 : 0) + (rng() - 0.5) * 3;
      const y = gy * cell + (rng() - 0.5) * 3;
      const t = 178 + Math.floor(rng() * 50);
      for (const ox of [-S, 0, S]) {
        const g = ctx.createRadialGradient(x + ox - 2, y - 3, 1, x + ox, y, cell * 0.5);
        g.addColorStop(0, `rgb(${t + 20},${t + 14},${t})`);
        g.addColorStop(1, `rgb(${t - 30},${t - 36},${t - 46})`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x + ox, y, cell * 0.44, cell * 0.4, rng() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  blotches(ctx, S, S, 10, 20, 60, 'rgba(90,80,60,1)', 0.15, rng);
  grain(ctx, S, S, 14, rng);
  return toTexture(c);
}

/** Сено стога: жёлтые соломинки вразнобой. */
export function hayTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(457);
  ctx.fillStyle = '#d8b65c';
  ctx.fillRect(0, 0, S, S);
  const tones = ['#f0d27a', '#c99a3e', '#e6c46a', '#b8892f', '#fae29a'];
  for (let i = 0; i < 2600; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const a = (rng() - 0.5) * 1.4;
    const len = 6 + rng() * 14;
    ctx.strokeStyle = tones[Math.floor(rng() * tones.length)];
    ctx.lineWidth = 1 + rng();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  grain(ctx, S, S, 12, rng);
  return toTexture(c);
}

/**
 * Створки ворот: вертикальные доски, две железные полосы с заклёпками. level 0 — целые, 1 — трещины, 2 — выбитые
 * щепки (сквозные дыры — прозрачные, у материала alphaTest), 3 — почти развалились. 512 × 320 px на обе створки.
 */
export function gateTexture(level: number): THREE.CanvasTexture {
  const W = 512;
  const H = 320;
  const [c, ctx] = canvas(W, H);
  const rng = makeRng(467);
  const planks = 12;
  const pw = W / planks;
  for (let i = 0; i < planks; i++) {
    const t = 128 + Math.floor(rng() * 36);
    ctx.fillStyle = `rgb(${t},${Math.floor(t * 0.66)},${Math.floor(t * 0.4)})`;
    ctx.fillRect(i * pw, 0, pw, H);
    // волокна
    for (let k = 0; k < 14; k++) {
      ctx.strokeStyle = `rgba(60,35,18,${0.12 + rng() * 0.18})`;
      ctx.lineWidth = 1;
      const x = i * pw + 3 + rng() * (pw - 6);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (rng() - 0.5) * 6, H * 0.3, x + (rng() - 0.5) * 6, H * 0.7, x + (rng() - 0.5) * 4, H);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(40,22,10,0.55)';
    ctx.fillRect(i * pw, 0, 2, H);
  }
  // шов между створками
  ctx.fillStyle = 'rgba(30,16,8,0.85)';
  ctx.fillRect(W / 2 - 2, 0, 4, H);
  // железные полосы и заклёпки
  for (const y of [H * 0.18, H * 0.74]) {
    ctx.fillStyle = '#4a4744';
    ctx.fillRect(0, y, W, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, y, W, 3);
    for (let x = 14; x < W; x += 32) {
      ctx.fillStyle = '#2e2c2a';
      ctx.beginPath();
      ctx.arc(x, y + 9, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x - 1.5, y + 6, 2, 2);
    }
  }
  if (level >= 1) {
    // трещины: тёмные ломаные вдоль досок
    const cracks = level === 1 ? 7 : level === 2 ? 12 : 18;
    for (let i = 0; i < cracks; i++) {
      let x = rng() * W;
      let y = rng() * H;
      ctx.strokeStyle = 'rgba(25,12,5,0.85)';
      ctx.lineWidth = 2 + rng() * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (rng() - 0.5) * 16;
        y += (rng() - 0.3) * 30;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  if (level >= 2) {
    // выбитые куски: сквозные дыры с рваным краем и светлыми щепками по кромке
    const holes = level === 2 ? 4 : 9;
    for (let i = 0; i < holes; i++) {
      const x = 30 + rng() * (W - 60);
      const y = 40 + rng() * (H - 80);
      const r = (level === 2 ? 12 : 16) + rng() * 16;
      ctx.beginPath();
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const rr = r * (0.55 + rng() * 0.6);
        ctx.lineTo(x + Math.cos(a) * rr * 0.7, y + Math.sin(a) * rr * 1.25);
      }
      ctx.closePath();
      ctx.strokeStyle = '#e8c28a';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fill();
      ctx.restore();
    }
  }
  grain(ctx, W, H, 14, rng);
  const t = toTexture(c, false);
  t.anisotropy = 4;
  return t;
}

/** Лужа варенья: неровное пятно с бликами, края прозрачные. Цвет — в самой текстуре. */
export function puddleTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(479);
  ctx.translate(S / 2, S / 2);
  ctx.beginPath();
  const n = 18;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2;
    const r = S * (0.36 + rng() * 0.11);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(-20, -20, 10, 0, 0, S * 0.48);
  g.addColorStop(0, '#d8243f');
  g.addColorStop(0.7, '#a8102a');
  g.addColorStop(1, '#7a0a1c');
  ctx.fillStyle = g;
  ctx.fill();
  // капли вокруг
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2;
    const r = S * (0.42 + rng() * 0.05);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 4 + rng() * 7, 0, Math.PI * 2);
    ctx.fill();
  }
  // блики и ягодки
  ctx.fillStyle = 'rgba(255,220,225,0.55)';
  ctx.beginPath();
  ctx.ellipse(-30, -34, 26, 9, -0.5, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = '#6e0716';
    ctx.beginPath();
    ctx.arc((rng() - 0.5) * 120, (rng() - 0.5) * 120, 5 + rng() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c, false);
}

/** Пунктирный круг «здесь можно поставить» (краскомёт на башне) */
export function ringTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  ctx.strokeStyle = 'rgba(255,236,190,0.95)';
  ctx.lineWidth = 7;
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2);
  ctx.stroke();
  return toTexture(c, false);
}

/** Табличка над стойкой: значок и цена (или подпись) на светлой плашке. */
export function labelTexture(icon: string, text: string): THREE.CanvasTexture {
  const hasText = text.length > 0;
  // только значок — круглая плашка (спрайт под неё — почти квадратный)
  const W = hasText ? 256 : 104;
  const [c, ctx] = canvas(W, 96);
  ctx.fillStyle = 'rgba(42,30,22,0.82)';
  ctx.beginPath();
  ctx.roundRect(4, 8, W - 8, 80, 40);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,226,170,0.85)';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = '52px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.fillText(icon, hasText ? 62 : W / 2, 52);
  if (hasText) {
    ctx.font = '900 44px Rubik, system-ui, sans-serif';
    ctx.fillStyle = '#ffe7a8';
    ctx.fillText(text, 162, 52, 150);
  }
  return toTexture(c, false);
}
