// Текстуры замка (canvas, без файлов): тёплый песчаник кладки, светлый тёсаный камень, черепица крыш, доска створок,
// трещины-наклейки, знамёна с гербом. Рисуются один раз при постройке мира.
import * as THREE from 'three';
import { makeRng } from '../../../shared/math.ts';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Мягкий шум по пикселям */
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

/** Скруглённый прямоугольник с переносом через правый край (текстура тайлится по x) */
function wrapRound(ctx: CanvasRenderingContext2D, S: number, x: number, y: number, w: number, h: number, r: number): void {
  const a = ((x % S) + S) % S;
  for (const ox of a + w > S ? [a, a - S] : [a]) {
    ctx.beginPath();
    ctx.roundRect(ox, y, w, h, r);
    ctx.fill();
  }
}

/**
 * Кладка: крупные тёплые камни песчаника разной длины, светлые фаски сверху, тень снизу, швы потемнее; кое-где
 * камень порыжее или посерее — «игрушечно», но не однотонно. 512 px = 4 м.
 */
export function masonryTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(907);
  ctx.fillStyle = '#9a7b57';
  ctx.fillRect(0, 0, S, S);
  const rows = 7;
  const rh = S / rows;
  const tones = [[233, 205, 158], [224, 190, 140], [238, 214, 172], [216, 182, 134], [230, 198, 150], [212, 196, 168]];
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    const n = 3 + Math.floor(rng() * 2);
    const wts = Array.from({ length: n }, () => 0.65 + rng() * 0.7);
    const sum = wts.reduce((p, q) => p + q, 0);
    let x = rng() * S;
    for (const wt of wts) {
      const len = (wt / sum) * S;
      const t = tones[Math.floor(rng() * tones.length)];
      const k = 0.94 + rng() * 0.1;
      ctx.fillStyle = `rgb(${Math.round(t[0] * k)},${Math.round(t[1] * k)},${Math.round(t[2] * k)})`;
      wrapRound(ctx, S, x + 3, y + 3, len - 6, rh - 6, 9);
      // фаска: свет сверху, тень снизу
      ctx.fillStyle = 'rgba(255,248,226,0.30)';
      wrapRound(ctx, S, x + 6, y + 5, len - 12, 6, 3);
      ctx.fillStyle = 'rgba(92,60,30,0.22)';
      wrapRound(ctx, S, x + 6, y + rh - 11, len - 12, 6, 3);
      // мелкие сколы и поры
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = `rgba(120,86,50,${0.08 + rng() * 0.12})`;
        const px = x + 10 + rng() * (len - 20);
        const py = y + 10 + rng() * (rh - 20);
        ctx.beginPath();
        ctx.arc(((px % S) + S) % S, py, 1.5 + rng() * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      x += len;
    }
  }
  grain(ctx, S, S, 14, rng);
  return tex(c);
}

/** Тёсаный камень бруствера, зубцов, ступеней и постамента: светлый, ровный, плиты 1 × 0,5 м. 256 px = 2 м. */
export function trimTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(919);
  ctx.fillStyle = '#b9a07c';
  ctx.fillRect(0, 0, S, S);
  for (let r = 0; r < 4; r++) {
    const off = r % 2 ? S / 4 : 0;
    for (let i = -1; i < 2; i++) {
      const t = 238 + Math.floor(rng() * 14);
      ctx.fillStyle = `rgb(${t},${t - 14},${t - 40})`;
      wrapRound(ctx, S, off + i * (S / 2) + 2, r * (S / 4) + 2, S / 2 - 4, S / 4 - 4, 5);
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (let r = 0; r < 4; r++) ctx.fillRect(0, r * (S / 4) + 3, S, 3);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(130,100,60,${rng() * 0.14})`;
    ctx.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2);
  }
  grain(ctx, S, S, 10, rng);
  return tex(c);
}

/** Черепица: ряды полукруглых плиток терракоты, каждая со светлой кромкой. 256 px = 1,6 м. */
export function roofTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(929);
  ctx.fillStyle = '#7f2f1c';
  ctx.fillRect(0, 0, S, S);
  const rows = 8;
  const rh = S / rows;
  const cols = 8;
  const cw = S / cols;
  for (let r = rows; r >= -1; r--) {
    const off = r % 2 ? cw / 2 : 0;
    for (let i = -1; i <= cols; i++) {
      const x = i * cw + off;
      const y = r * rh;
      const k = 0.9 + rng() * 0.18;
      const g = ctx.createLinearGradient(0, y, 0, y + rh * 1.3);
      g.addColorStop(0, `rgb(${Math.round(226 * k)},${Math.round(112 * k)},${Math.round(70 * k)})`);
      g.addColorStop(1, `rgb(${Math.round(176 * k)},${Math.round(72 * k)},${Math.round(44 * k)})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x + 1, y);
      ctx.lineTo(x + cw - 1, y);
      ctx.lineTo(x + cw - 1, y + rh * 0.8);
      ctx.arc(x + cw / 2, y + rh * 0.8, cw / 2 - 1, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,214,170,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + cw / 2, y + rh * 0.8, cw / 2 - 2, 0.15, Math.PI - 0.15);
      ctx.stroke();
    }
  }
  grain(ctx, S, S, 12, rng);
  return tex(c);
}

/** Доска створки: тёплый дуб, волокна вдоль, сучок; низ потемнее. 64 × 512 px на доску 0,5 × 3 м. */
export function plankTexture(): THREE.CanvasTexture {
  const W = 64;
  const H = 512;
  const [c, ctx] = canvas(W, H);
  const rng = makeRng(941);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#9c6436');
  g.addColorStop(0.5, '#b8783f');
  g.addColorStop(1, '#985f33');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 22; i++) {
    ctx.strokeStyle = `rgba(${rng() < 0.5 ? '80,44,20' : '214,160,104'},${0.12 + rng() * 0.16})`;
    ctx.lineWidth = 1 + rng() * 1.5;
    const x = rng() * W;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    for (let y = 0; y <= H; y += 32) ctx.lineTo(x + Math.sin(y * 0.02 + i) * 3, y);
    ctx.stroke();
  }
  // сучок
  ctx.fillStyle = 'rgba(70,38,16,0.55)';
  ctx.beginPath();
  ctx.ellipse(W * 0.4, H * 0.62, 5, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // кромки досок темнее
  ctx.fillStyle = 'rgba(50,26,10,0.45)';
  ctx.fillRect(0, 0, 3, H);
  ctx.fillRect(W - 3, 0, 3, H);
  grain(ctx, W, H, 12, rng);
  return tex(c, false);
}

/** Трещина-наклейка: тёмный разлом с ветками и светлой щепой по краю (прозрачный фон). 128 px. */
export function crackTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(953);
  ctx.lineCap = 'round';
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number): void => {
    let px = x;
    let py = y;
    for (let i = 0; i < len; i++) {
      a += (rng() - 0.5) * 0.8;
      const nx = px + Math.cos(a) * 6;
      const ny = py + Math.sin(a) * 6;
      ctx.strokeStyle = 'rgba(255,226,180,0.8)';
      ctx.lineWidth = w + 2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(28,14,6,0.95)';
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      if (depth > 0 && rng() < 0.25) branch(nx, ny, a + (rng() < 0.5 ? 0.9 : -0.9), Math.floor(len * 0.5), w * 0.6, depth - 1);
      px = nx;
      py = ny;
      w = Math.max(0.8, w * 0.93);
    }
  };
  branch(S / 2, 6, Math.PI / 2, 18, 4.5, 2);
  return tex(c, false);
}

/**
 * Знамя: полотнище цвета base с каймой trim, герб — кристалл в короне (наш замок держит кристалл), низ — ласточкин
 * хвост (прозрачный вырез). 128 × 256 px.
 */
export function bannerTexture(base: string, trim: string, emblem: string): THREE.CanvasTexture {
  const W = 128;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  // складки
  for (let i = 0; i < 4; i++) {
    const g = ctx.createLinearGradient(i * 32, 0, i * 32 + 32, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.10)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0.10)');
    ctx.fillStyle = g;
    ctx.fillRect(i * 32, 0, 32, H);
  }
  ctx.strokeStyle = trim;
  ctx.lineWidth = 7;
  ctx.strokeRect(8, 8, W - 16, H - 40);
  // корона
  ctx.fillStyle = emblem;
  ctx.beginPath();
  ctx.moveTo(34, 78);
  ctx.lineTo(34, 54);
  ctx.lineTo(48, 66);
  ctx.lineTo(64, 46);
  ctx.lineTo(80, 66);
  ctx.lineTo(94, 54);
  ctx.lineTo(94, 78);
  ctx.closePath();
  ctx.fill();
  // кристалл
  ctx.beginPath();
  ctx.moveTo(64, 90);
  ctx.lineTo(88, 124);
  ctx.lineTo(64, 176);
  ctx.lineTo(40, 124);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.moveTo(64, 96);
  ctx.lineTo(76, 124);
  ctx.lineTo(64, 164);
  ctx.closePath();
  ctx.fill();
  // ласточкин хвост
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(W / 2 - 26, H);
  ctx.lineTo(W / 2, H - 34);
  ctx.lineTo(W / 2 + 26, H);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  return tex(c, false);
}

/** Язычок пламени: тёплый градиент на прозрачном (спрайт факела, жаровни, горна) */
export function flameTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64, 128);
  const g = ctx.createRadialGradient(32, 96, 4, 32, 82, 44);
  g.addColorStop(0, 'rgba(255,252,220,1)');
  g.addColorStop(0.3, 'rgba(255,206,92,0.95)');
  g.addColorStop(0.65, 'rgba(255,112,36,0.65)');
  g.addColorStop(1, 'rgba(255,70,20,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(32, 2);
  ctx.bezierCurveTo(58, 50, 62, 94, 32, 126);
  ctx.bezierCurveTo(2, 94, 6, 50, 32, 2);
  ctx.fill();
  return tex(c, false);
}

/** Знамя в атласе: полотнище, кайма, корона над кристаллом, низ — ласточкин хвост (вырез прозрачный) */
function drawBanner(ctx: CanvasRenderingContext2D, x0: number, y0: number, W: number, H: number, base: string, trim: string, crown: string, gem: string): void {
  ctx.save();
  ctx.translate(x0, y0);
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) {
    const g = ctx.createLinearGradient((i * W) / 4, 0, ((i + 1) * W) / 4, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.12)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = g;
    ctx.fillRect((i * W) / 4, 0, W / 4, H);
  }
  ctx.strokeStyle = trim;
  ctx.lineWidth = 8;
  ctx.strokeRect(9, 9, W - 18, H - 44);
  ctx.fillStyle = trim;
  ctx.fillRect(0, 0, W, 7);
  // корона
  const s = W / 128;
  ctx.fillStyle = crown;
  ctx.beginPath();
  ctx.moveTo(34 * s, 80);
  ctx.lineTo(34 * s, 54);
  ctx.lineTo(48 * s, 67);
  ctx.lineTo(64 * s, 45);
  ctx.lineTo(80 * s, 67);
  ctx.lineTo(94 * s, 54);
  ctx.lineTo(94 * s, 80);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(36 * s, 72, 56 * s, 4);
  // кристалл
  ctx.fillStyle = gem;
  ctx.beginPath();
  ctx.moveTo(64 * s, 92);
  ctx.lineTo(88 * s, 126);
  ctx.lineTo(64 * s, 178);
  ctx.lineTo(40 * s, 126);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.moveTo(64 * s, 98);
  ctx.lineTo(77 * s, 126);
  ctx.lineTo(64 * s, 166);
  ctx.closePath();
  ctx.fill();
  // ласточкин хвост
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(W / 2 - 27 * s, H);
  ctx.lineTo(W / 2, H - 36);
  ctx.lineTo(W / 2 + 27 * s, H);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

/** Где в атласе флагов что лежит (u0, v0, u1, v1 — в долях; v снизу вверх, как у three.js) */
export const FLAG_ATLAS = {
  banner: (i: number): [number, number, number, number] => [(i * 128) / 512, 0.5, ((i + 1) * 128) / 512, 1],
  castle: [0, 0.25, 0.5, 0.5] as [number, number, number, number],
  white: [0.89, 0.01, 0.99, 0.11] as [number, number, number, number],
};

/**
 * Атлас флагов: сверху четыре знамени (красное, синее, зелёное, золотое — корона над кристаллом), ниже — большой
 * флаг замка (красно-золотой, с ласточкиным хвостом), в углу — белая клетка для гирлянд и вымпелов (их цвет — в
 * вершинах). 512 × 512.
 */
export function flagAtlas(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  drawBanner(ctx, 0, 0, 128, 256, '#d8432f', '#f4c63a', '#f4c63a', '#9ff0ff');
  drawBanner(ctx, 128, 0, 128, 256, '#2f66c8', '#f6f0dc', '#f4c63a', '#ffffff');
  drawBanner(ctx, 256, 0, 128, 256, '#3c9447', '#f4c63a', '#f4c63a', '#e8fff4');
  drawBanner(ctx, 384, 0, 128, 256, '#f2be2e', '#c8402c', '#c8402c', '#7fe6ff');
  // флаг замка: две полосы, кайма, корона над кристаллом; справа — вырез
  ctx.save();
  ctx.translate(0, 256);
  ctx.fillStyle = '#d8432f';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#f4c63a';
  ctx.fillRect(0, 64, 256, 64);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(0, 60, 256, 8);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(96, 64, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2f66c8';
  ctx.beginPath();
  ctx.arc(96, 64, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9ff0ff';
  ctx.beginPath();
  ctx.moveTo(96, 40);
  ctx.lineTo(110, 62);
  ctx.lineTo(96, 88);
  ctx.lineTo(82, 62);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f4c63a';
  ctx.beginPath();
  ctx.moveTo(80, 44);
  ctx.lineTo(80, 32);
  ctx.lineTo(88, 39);
  ctx.lineTo(96, 28);
  ctx.lineTo(104, 39);
  ctx.lineTo(112, 32);
  ctx.lineTo(112, 44);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(256, 18);
  ctx.lineTo(210, 64);
  ctx.lineTo(256, 110);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(448, 448, 64, 64);
  return tex(c, false);
}

/** Атлас огня: слева язычок пламени, справа мягкое круглое свечение (для аддитивных спрайтов). 256 × 128. */
export function fireAtlas(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 128);
  const g = ctx.createRadialGradient(64, 98, 3, 64, 84, 46);
  g.addColorStop(0, 'rgba(255,253,230,1)');
  g.addColorStop(0.28, 'rgba(255,214,100,0.95)');
  g.addColorStop(0.62, 'rgba(255,120,40,0.6)');
  g.addColorStop(1, 'rgba(255,70,20,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(64, 4);
  ctx.bezierCurveTo(98, 52, 100, 96, 64, 124);
  ctx.bezierCurveTo(28, 96, 30, 52, 64, 4);
  ctx.fill();
  const d = ctx.createRadialGradient(192, 64, 0, 192, 64, 62);
  d.addColorStop(0, 'rgba(255,255,255,1)');
  d.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  d.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = d;
  ctx.fillRect(128, 0, 128, 128);
  return tex(c, false);
}

/** Клуб пыли: несколько мягких пятен (облачко с неровным краем). 64 px. */
export function puffTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64, 64);
  const rng = makeRng(967);
  for (let i = 0; i < 7; i++) {
    const x = 32 + (rng() - 0.5) * 18;
    const y = 32 + (rng() - 0.5) * 18;
    const r = 12 + rng() * 12;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  return tex(c, false);
}

/** Плющ: стебли и листья на прозрачном (наклейка на стену). 256 px; снизу гуще, кверху редеет. */
export function ivyTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(971);
  const greens = ['#3f7f2c', '#4f9436', '#5ea83e', '#386f28', '#6db84a'];
  const leaf = (x: number, y: number, r: number, a: number): void => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = greens[Math.floor(rng() * greens.length)];
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(r * 1.1, -r * 0.2, 0, r);
    ctx.quadraticCurveTo(-r * 1.1, -r * 0.2, 0, -r);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,240,0.18)';
    ctx.fillRect(-0.6, -r * 0.8, 1.2, r * 1.5);
    ctx.restore();
  };
  ctx.lineCap = 'round';
  for (let s = 0; s < 7; s++) {
    let x = 20 + rng() * (S - 40);
    let y = S;
    let a = -Math.PI / 2 + (rng() - 0.5) * 0.5;
    ctx.strokeStyle = '#4a3a22';
    ctx.lineWidth = 3;
    const top = S * (0.05 + rng() * 0.45);
    while (y > top) {
      const nx = x + Math.cos(a) * 9;
      const ny = y + Math.sin(a) * 9;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      x = Math.max(8, Math.min(S - 8, nx));
      y = ny;
      a += (rng() - 0.5) * 0.6;
      a = Math.max(-Math.PI * 0.85, Math.min(-Math.PI * 0.15, a));
      const dense = 1 - y / S;
      for (let k = 0; k < 3; k++) if (rng() > dense * 0.5) leaf(x + (rng() - 0.5) * 22, y + (rng() - 0.5) * 16, 6 + rng() * 6, rng() * 6.28);
    }
  }
  return tex(c, false);
}
