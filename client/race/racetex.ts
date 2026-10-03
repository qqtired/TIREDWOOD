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
