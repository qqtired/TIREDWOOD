// Текстуры помех «Портового кольца»: плиты-ускорители, лужи масла и воды, указатели. Рисуются на canvas при загрузке.
import * as THREE from 'three';
import { makeRng } from '../../shared/math.ts';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

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

/**
 * Плита-ускоритель на дороге: янтарная краска, чёрные шевроны по ходу (вверх по холсту — вперёд по дороге),
 * белая рамка. Шевроны едут вперёд — в мире сдвигается развёртка (map.offset.y).
 */
export function padTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 512;
  const [c, ctx] = canvas(W, H);
  const rng = makeRng(211);
  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#ffc02a');
  base.addColorStop(1, '#f59a12');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  // шевроны: «галочки» остриём вверх, четыре штуки на повтор в 512 px
  const step = H / 4;
  ctx.fillStyle = '#1d1a16';
  for (let k = -1; k < 5; k++) {
    const y = k * step;
    ctx.beginPath();
    ctx.moveTo(26, y + step * 0.58);
    ctx.lineTo(W / 2, y + step * 0.2);
    ctx.lineTo(W - 26, y + step * 0.58);
    ctx.lineTo(W - 26, y + step * 0.86);
    ctx.lineTo(W / 2, y + step * 0.48);
    ctx.lineTo(26, y + step * 0.86);
    ctx.closePath();
    ctx.fill();
  }
  // стёртая краска и грязь
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = `rgba(60,48,30,${0.03 + rng() * 0.08})`;
    ctx.beginPath();
    ctx.arc(rng() * W, rng() * H, 2 + rng() * 14, 0, Math.PI * 2);
    ctx.fill();
  }
  grain(ctx, W, H, 16, rng);
  // белая рамка по краям: после зерна, чтобы линия осталась чистой
  ctx.strokeStyle = 'rgba(244,240,228,0.95)';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, W - 10, H - 10);
  return toTexture(c, true);
}

/** Доля половины холста, которую занимает пятно лужи (без выступов) */
export const SLICK_FILL = 0.78;

/** Радиус пятна в направлении a: ровный овал с небольшими выступами (как растёкшаяся лужа) */
function blobRadius(a: number, k: number, rng: () => number, waves: number[][]): number {
  let r = 1;
  for (const [f, amp, ph] of waves) r += Math.sin(a * f + ph) * amp;
  return r * k + (rng() - 0.5) * 0.004;
}

/**
 * Лужа на дороге с прозрачным краем. kind 0 — вода: серо-голубая, со светлыми бликами и кругами; 1 — масло:
 * чёрная, глянцевая, с радужной плёнкой. Пятно занимает SLICK_FILL холста — по нему мир подбирает размер квадрата, чтобы
 * пятно совпало с овалом помехи по полуосям; обводка мокрого асфальта чуть шире.
 */
export function slickTexture(kind: number, seed: number): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(seed);
  const waves = [
    [2, 0.04 + rng() * 0.03, rng() * 6.28],
    [3, 0.035 + rng() * 0.03, rng() * 6.28],
    [5, 0.02 + rng() * 0.02, rng() * 6.28],
  ];
  const path = (k: number): void => {
    ctx.beginPath();
    const n = 72;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = blobRadius(a, k, () => 0.5, waves) * (S / 2) * SLICK_FILL;
      const x = S / 2 + Math.cos(a) * r;
      const y = S / 2 + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  // мокрый асфальт вокруг — тёмнее и чуть шире
  path(1.07);
  ctx.fillStyle = kind ? 'rgba(18,18,22,0.42)' : 'rgba(30,48,64,0.34)';
  ctx.fill();
  path(1);
  ctx.save();
  ctx.clip();
  if (kind) {
    const g = ctx.createRadialGradient(S * 0.42, S * 0.4, 6, S / 2, S / 2, S * 0.5);
    g.addColorStop(0, '#2a2c34');
    g.addColorStop(0.6, '#0e0f13');
    g.addColorStop(1, '#050507');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    // радужная плёнка: цветные дуги по поверхности (негромкие: лужа — тёмная, а не карнавальная)
    ctx.lineWidth = 5;
    const tints = ['rgba(120,70,200,0.22)', 'rgba(40,160,150,0.2)', 'rgba(210,150,60,0.17)', 'rgba(70,110,220,0.19)'];
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = tints[i % tints.length];
      ctx.beginPath();
      const cx = S * (0.3 + rng() * 0.4);
      const cy = S * (0.3 + rng() * 0.4);
      ctx.arc(cx, cy, 20 + rng() * 70, rng() * 6, rng() * 6 + 1.5 + rng() * 1.5);
      ctx.stroke();
    }
    // блик
    const hl = ctx.createRadialGradient(S * 0.38, S * 0.36, 2, S * 0.38, S * 0.36, S * 0.2);
    hl.addColorStop(0, 'rgba(255,255,255,0.5)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(0, 0, S, S);
  } else {
    const g = ctx.createRadialGradient(S * 0.46, S * 0.44, 6, S / 2, S / 2, S * 0.5);
    g.addColorStop(0, '#9cc6dc');
    g.addColorStop(0.65, '#5f93b0');
    g.addColorStop(1, '#3f6f8c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    // круги ряби и блики неба
    ctx.strokeStyle = 'rgba(235,248,255,0.55)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(S * (0.3 + rng() * 0.4), S * (0.3 + rng() * 0.4), 12 + rng() * 38, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(S * (0.25 + rng() * 0.5), S * (0.25 + rng() * 0.5), 14 + rng() * 22, 3 + rng() * 4, rng() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  return toTexture(c);
}

/** Стрелка вправо внутри прямоугольника: основание и остриё */
function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - h * 0.22);
  ctx.lineTo(x + len * 0.55, y - h * 0.22);
  ctx.lineTo(x + len * 0.55, y - h * 0.5);
  ctx.lineTo(x + len, y);
  ctx.lineTo(x + len * 0.55, y + h * 0.5);
  ctx.lineTo(x + len * 0.55, y + h * 0.22);
  ctx.lineTo(x, y + h * 0.22);
  ctx.closePath();
  ctx.fill();
}

/** Указатель: крупная надпись и стрелка (dir: 1 — вправо, −1 — влево, 0 — вперёд) на цветном щите с белой рамкой */
export function arrowSignTexture(text: string, bg: string, fg: string, dir: 1 | -1 | 0 = 1, w = 768, h = 256): THREE.CanvasTexture {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.fillStyle = fg;
  const aw = h * 0.8;
  // стрелка: вправо — справа, влево и вперёд — слева; текст занимает остальное
  const ax = dir > 0 ? w - aw - 34 : 34;
  ctx.save();
  if (dir === 0) {
    ctx.translate(ax + aw / 2, h / 2);
    ctx.rotate(-Math.PI / 2);
    arrow(ctx, -aw / 2, 0, aw, h * 0.7);
  } else if (dir < 0) {
    ctx.translate(ax + aw / 2, h / 2);
    ctx.scale(-1, 1);
    arrow(ctx, -aw / 2, 0, aw, h * 0.7);
  } else arrow(ctx, ax, h / 2, aw, h * 0.7);
  ctx.restore();
  const tw = w - aw - 100;
  let size = h * 0.42;
  ctx.font = `900 ${size}px Rubik, system-ui, sans-serif`;
  const m = ctx.measureText(text).width;
  if (m > tw) {
    size = Math.floor((size * tw) / m);
    ctx.font = `900 ${size}px Rubik, system-ui, sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = dir > 0 ? 34 + tw / 2 : w - 34 - tw / 2;
  ctx.fillText(text, cx, h / 2 + size * 0.04);
  grain(ctx, w, h, 14, makeRng(text.length * 31 + 5));
  return toTexture(c);
}

/** Предупреждающий знак «трамплин»: жёлтый щит с чёрной рамкой, пандус и надпись */
export function jumpSignTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 512;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#f3c012';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#1d1a16';
  ctx.lineWidth = 16;
  ctx.strokeRect(14, 14, w - 28, h - 28);
  // пандус с вылетающим картом
  ctx.fillStyle = '#1d1a16';
  ctx.beginPath();
  ctx.moveTo(70, 330);
  ctx.lineTo(300, 330);
  ctx.lineTo(300, 214);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(70, 330, 380, 18);
  ctx.beginPath();
  ctx.ellipse(372, 176, 56, 22, -0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(344, 200, 70, 10);
  ctx.beginPath();
  ctx.arc(352, 220, 17, 0, Math.PI * 2);
  ctx.arc(402, 196, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '900 84px Rubik, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ПРЫЖОК', w / 2, 428);
  grain(ctx, w, h, 14, makeRng(317));
  return toTexture(c);
}

// ------------------------------------------------------------ обочины, рельеф, деревня (обе трассы)

/** Мягкие пятна с переносом через край (текстура тайлится без швов) */
function spots(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, r0: number, r1: number, color: string, alpha: number, rng: () => number): void {
  for (let i = 0; i < n; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = r0 + rng() * (r1 - r0);
    for (const ox of [-w, 0, w]) {
      for (const oy of [-h, 0, h]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = alpha * (0.4 + rng() * 0.6);
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * Трава: сочная зелень пятнами, травинки штрихами. striped — полосы стрижки поперёк v (на обочине: v — вдоль дороги,
 * полоса — 1/4 холста), иначе ровная (склоны холма). Цвет даёт материал (×1), поэтому холст светлый.
 */
export function grassTexture(striped: boolean): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(striped ? 401 : 409);
  ctx.fillStyle = '#72b44e';
  ctx.fillRect(0, 0, S, S);
  if (striped) {
    for (let k = 0; k < 4; k += 2) {
      ctx.fillStyle = 'rgba(30,80,20,0.15)';
      ctx.fillRect(0, (k * S) / 4, S, S / 4);
    }
  }
  spots(ctx, S, S, 26, 30, 90, 'rgba(62,118,40,1)', 0.38, rng);
  spots(ctx, S, S, 16, 20, 70, 'rgba(160,200,100,1)', 0.25, rng);
  for (let i = 0; i < 9000; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const l = 2 + rng() * 5;
    const a = -Math.PI / 2 + (rng() - 0.5) * 0.9;
    const light = rng() < 0.45;
    ctx.strokeStyle = light ? `rgba(190,235,120,${0.2 + rng() * 0.25})` : `rgba(40,95,25,${0.2 + rng() * 0.25})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  // мелкие цветы на ровной траве
  if (!striped) {
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = ['#ffffff', '#ffe25a', '#ff8ab0', '#c9a0ff'][Math.floor(rng() * 4)];
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(rng() * S, rng() * S, 1.2 + rng() * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  grain(ctx, S, S, 14, rng);
  return toTexture(c, true);
}

/** Песок: тёплый светлый, мелкая рябь-волны и крошка */
export function sandTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(419);
  ctx.fillStyle = '#ecd6a4';
  ctx.fillRect(0, 0, S, S);
  spots(ctx, S, S, 24, 30, 110, 'rgba(205,170,110,1)', 0.35, rng);
  spots(ctx, S, S, 14, 30, 90, 'rgba(255,240,200,1)', 0.35, rng);
  // рябь: волнистые полосы поперёк
  for (let k = 0; k < 26; k++) {
    const y0 = (k / 26) * S + rng() * 6;
    ctx.strokeStyle = `rgba(170,130,80,${0.12 + rng() * 0.1})`;
    ctx.lineWidth = 2 + rng() * 2;
    ctx.beginPath();
    for (let x = 0; x <= S; x += 16) {
      const y = y0 + Math.sin((x / S) * Math.PI * 4 + k) * 4;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 9000; i++) {
    const v = rng() < 0.5 ? 120 + rng() * 60 : 230 + rng() * 25;
    ctx.fillStyle = `rgba(${v},${v * 0.86},${v * 0.62},${0.25 + rng() * 0.3})`;
    ctx.fillRect(rng() * S, rng() * S, 1 + rng() * 1.5, 1 + rng() * 1.5);
  }
  grain(ctx, S, S, 12, rng);
  return toTexture(c, true);
}

/** Сухая каменная кладка: тёплый известняк, камни разного размера, тёмные швы (u — вдоль, v — вверх) */
export function stoneWallTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  const rng = makeRng(421);
  ctx.fillStyle = '#8c7a62';
  ctx.fillRect(0, 0, W, H);
  let y = 0;
  while (y < H) {
    const rh = 22 + rng() * 26;
    let x = -rng() * 40;
    while (x < W) {
      const rw = 34 + rng() * 60;
      const tone = 190 + rng() * 45;
      ctx.fillStyle = `rgb(${tone},${tone * 0.9},${tone * 0.74})`;
      const r = 6;
      const x0 = x + 2;
      const y0 = y + 2;
      const w = rw - 4;
      const h = Math.min(rh, H - y) - 4;
      ctx.beginPath();
      ctx.moveTo(x0 + r, y0);
      ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r);
      ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
      ctx.arcTo(x0, y0 + h, x0, y0, r);
      ctx.arcTo(x0, y0, x0 + w, y0, r);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x0 + 3, y0 + 2, w - 6, 3);
      x += rw;
    }
    y += rh;
  }
  grain(ctx, W, H, 20, rng);
  return toTexture(c, true);
}

/** Черепица: терракотовые ряды волной (u — вдоль конька, v — от карниза к коньку) */
export function roofTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  const rng = makeRng(431);
  ctx.fillStyle = '#b8552f';
  ctx.fillRect(0, 0, W, H);
  const rows = 8;
  const rh = H / rows;
  for (let r = 0; r < rows; r++) {
    for (let x = (r % 2) * 16; x < W + 32; x += 32) {
      const tone = 0.85 + rng() * 0.3;
      const g = ctx.createLinearGradient(x - 16, 0, x + 16, 0);
      g.addColorStop(0, `rgba(${120 * tone},${45 * tone},${25 * tone},1)`);
      g.addColorStop(0.5, `rgba(${225 * tone},${120 * tone},${75 * tone},1)`);
      g.addColorStop(1, `rgba(${120 * tone},${45 * tone},${25 * tone},1)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, r * rh + rh * 0.55, 15, rh * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(60,20,10,0.35)';
    ctx.fillRect(0, r * rh + rh - 2, W, 2);
  }
  grain(ctx, W, H, 16, rng);
  return toTexture(c, true);
}

/** Солома тюка: золотистые штрихи вдоль, шпагат поперёк (u — вдоль тюка) */
export function hayTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(433);
  ctx.fillStyle = '#e2bd5a';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const l = 6 + rng() * 18;
    const t = rng();
    ctx.strokeStyle = t < 0.4 ? `rgba(160,110,30,${0.3 + rng() * 0.3})` : `rgba(255,236,150,${0.3 + rng() * 0.3})`;
    ctx.lineWidth = 1 + rng();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + l, y + (rng() - 0.5) * 3);
    ctx.stroke();
  }
  for (const u of [0.3, 0.7]) {
    ctx.fillStyle = 'rgba(120,70,20,0.75)';
    ctx.fillRect(u * S - 3, 0, 6, S);
  }
  grain(ctx, S, S, 14, rng);
  return toTexture(c, true);
}

/** Баннер «TIREDWOOD GRAND PRIX»: полосы и крупная надпись (на арку старта, ограждения, трибуны) */
export function bannerTexture(text: string, bg: string, fg: string, accent: string, w = 1024, h = 160): THREE.CanvasTexture {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, w, h * 0.1);
  ctx.fillRect(0, h * 0.9, w, h * 0.1);
  let size = h * 0.5;
  ctx.font = `900 ${size}px Rubik, system-ui, sans-serif`;
  const m = ctx.measureText(text).width;
  if (m > w * 0.92) {
    size = Math.floor((size * w * 0.92) / m);
    ctx.font = `900 ${size}px Rubik, system-ui, sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.14;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.strokeText(text, w / 2, h / 2 + size * 0.04);
  ctx.fillStyle = fg;
  ctx.fillText(text, w / 2, h / 2 + size * 0.04);
  grain(ctx, w, h, 10, makeRng(text.length * 17 + 3));
  return toTexture(c);
}

/** Большой щит перед шпилькой: белые шевроны на красном и полосы по краям (как у боксов на трассах) */
export function hairpinSignTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#d8302a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  for (let k = 0; k < 3; k++) {
    const x = 60 + k * 140;
    ctx.beginPath();
    ctx.moveTo(x, 30);
    ctx.lineTo(x + 60, 30);
    ctx.lineTo(x + 140, H / 2);
    ctx.lineTo(x + 60, H - 30);
    ctx.lineTo(x, H - 30);
    ctx.lineTo(x + 80, H / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 12;
  ctx.strokeRect(8, 8, W - 16, H - 16);
  grain(ctx, W, H, 12, makeRng(439));
  return toTexture(c);
}

/** Вода фонтана и реки на поверхности: светлые блики (прозрачный холст, тайлится) */
export function rippleTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(443);
  for (let i = 0; i < 80; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.15 + rng() * 0.35})`;
    ctx.lineWidth = 1 + rng() * 2;
    const x = rng() * S;
    const y = rng() * S;
    const r = 6 + rng() * 22;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.35, 0, rng() * 2, rng() * 2 + 2);
    ctx.stroke();
  }
  return toTexture(c, true);
}
