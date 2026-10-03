// Процедурные текстуры: всё рисуется на canvas при загрузке — ни одного внешнего файла.
import * as THREE from 'three';
import { makeRng } from '../../shared/math.ts';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: false })!;
  return [c, ctx];
}

function toTexture(c: HTMLCanvasElement, srgb = true, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
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

/** Попиксельный шум поверх уже нарисованного. */
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

/** Мягкие пятна (грязь, разводы). */
function blotches(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, rMin: number, rMax: number, color: string, alpha: number, rng: () => number): void {
  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = rMin + rng() * (rMax - rMin);
    // рисуем с переносом через край, чтобы текстура тайлилась без швов
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

/** Бетон настила: плиты 4×4 м со швами, пятна, трещинки. */
export function deckTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(11);
  ctx.fillStyle = '#e9e4da';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 26, 20, 90, 'rgba(120,110,95,1)', 0.14, rng);
  blotches(ctx, S, S, 10, 30, 70, 'rgba(255,255,250,1)', 0.18, rng);
  // масляные пятна
  blotches(ctx, S, S, 4, 10, 26, 'rgba(40,36,34,1)', 0.22, rng);
  // трещинки
  ctx.strokeStyle = 'rgba(70,64,58,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    let x = rng() * S;
    let y = rng() * S;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 14; k++) {
      x += (rng() - 0.5) * 22;
      y += (rng() - 0.5) * 22;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  grain(ctx, S, S, 22, rng);
  // швы между плитами
  ctx.fillStyle = 'rgba(60,55,50,0.55)';
  ctx.fillRect(0, 0, S, 3);
  ctx.fillRect(0, 0, 3, S);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(0, 3, S, 1);
  ctx.fillRect(3, 0, 1, S);
  return toTexture(c);
}

/** Гофра морского контейнера (серая — цвет даёт вершина). 2.44 × 2.6 м. */
export function containerTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  const rng = makeRng(23);
  const ridges = 11;
  const period = W / ridges;
  for (let x = 0; x < W; x++) {
    const p = (x % period) / period;
    // трапециевидный профиль: верх, скат, низ, скат
    let shade: number;
    if (p < 0.35) shade = 0.98;
    else if (p < 0.5) shade = 0.98 - (p - 0.35) / 0.15 * 0.28;
    else if (p < 0.85) shade = 0.72;
    else shade = 0.72 + (p - 0.85) / 0.15 * 0.26;
    const v = Math.round(shade * 235);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, 0, 1, H);
  }
  // верхняя и нижняя балки
  ctx.fillStyle = 'rgba(70,70,70,0.55)';
  ctx.fillRect(0, 0, W, 9);
  ctx.fillRect(0, H - 11, W, 11);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(0, 9, W, 2);
  // ржавые потёки сверху
  for (let i = 0; i < 16; i++) {
    const x = rng() * W;
    const len = 20 + rng() * 120;
    const g = ctx.createLinearGradient(0, 8, 0, 8 + len);
    g.addColorStop(0, 'rgba(110,55,25,0.55)');
    g.addColorStop(1, 'rgba(110,55,25,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 8, 1.5 + rng() * 3, len);
  }
  // грязь снизу
  const dirt = ctx.createLinearGradient(0, H * 0.7, 0, H);
  dirt.addColorStop(0, 'rgba(60,50,40,0)');
  dirt.addColorStop(1, 'rgba(60,50,40,0.35)');
  ctx.fillStyle = dirt;
  ctx.fillRect(0, H * 0.7, W, H * 0.3);
  // царапины и сколы краски
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(40,30,25,0.2)';
    ctx.fillRect(rng() * W, rng() * H, 1 + rng() * 6, 1);
  }
  grain(ctx, W, H, 14, rng);
  return toTexture(c);
}

/** Грань деревянного ящика: доски, рамка, диагональ, гвозди. */
export function crateTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(37);
  const planks = 5;
  const ph = S / planks;
  for (let i = 0; i < planks; i++) {
    const tone = 200 + Math.floor(rng() * 40);
    ctx.fillStyle = `rgb(${tone},${tone - 18},${tone - 45})`;
    ctx.fillRect(0, i * ph, S, ph);
    // волокна
    for (let k = 0; k < 30; k++) {
      ctx.strokeStyle = `rgba(90,60,30,${0.08 + rng() * 0.12})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const y = i * ph + rng() * ph;
      ctx.moveTo(0, y);
      for (let x = 0; x <= S; x += 32) ctx.lineTo(x, y + (rng() - 0.5) * 3);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(50,30,15,0.6)';
    ctx.fillRect(0, i * ph, S, 2);
  }
  // рамка
  const f = 26;
  ctx.fillStyle = 'rgba(150,105,60,0.95)';
  ctx.fillRect(0, 0, S, f);
  ctx.fillRect(0, S - f, S, f);
  ctx.fillRect(0, 0, f, S);
  ctx.fillRect(S - f, 0, f, S);
  // диагональ
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.fillRect(-S * 0.72, -f / 2, S * 1.44, f);
  ctx.restore();
  ctx.strokeStyle = 'rgba(60,35,15,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(f, f, S - f * 2, S - f * 2);
  ctx.strokeRect(1, 1, S - 2, S - 2);
  // гвозди
  ctx.fillStyle = 'rgba(40,40,40,0.8)';
  for (const [x, y] of [[13, 13], [S - 13, 13], [13, S - 13], [S - 13, S - 13], [S / 2, 13], [S / 2, S - 13], [13, S / 2], [S - 13, S / 2]]) {
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  grain(ctx, S, S, 16, rng);
  return toTexture(c);
}

/** Кирпич складов. 512 px = 4 м. */
export function brickTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(41);
  ctx.fillStyle = '#cfc6b8';
  ctx.fillRect(0, 0, S, S);
  const bw = 51.2;
  const bh = 19.7;
  const rows = Math.round(S / bh);
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bw / 2 : 0;
    for (let x = -bw; x < S + bw; x += bw) {
      const t = 205 + Math.floor(rng() * 50);
      ctx.fillStyle = `rgb(${t},${Math.floor(t * 0.86)},${Math.floor(t * 0.8)})`;
      ctx.fillRect(x + off + 2, r * bh + 2, bw - 4, bh - 4);
    }
  }
  blotches(ctx, S, S, 18, 30, 110, 'rgba(60,50,45,1)', 0.12, rng);
  grain(ctx, S, S, 18, rng);
  return toTexture(c);
}

/** Рифлёный металл (лестницы, ворота). 128 px = 1 м. */
export function metalTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(53);
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 16) {
    for (let x = 0; x < S; x += 16) {
      const ox = (y / 16) % 2 ? 8 : 0;
      ctx.save();
      ctx.translate(x + ox + 4, y + 8);
      ctx.rotate(((y / 16) % 2 ? 1 : -1) * 0.7);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(-5, -1.5, 10, 2);
      ctx.fillStyle = 'rgba(60,60,60,0.45)';
      ctx.fillRect(-5, 0.5, 10, 1.5);
      ctx.restore();
    }
  }
  grain(ctx, S, S, 18, rng);
  return toTexture(c);
}

/** Бетонные блоки-отбойники: шершавый бетон + полосы. 256 px = 2 м. */
export function concreteTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(67);
  ctx.fillStyle = '#e4dfd4';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 20, 10, 50, 'rgba(110,100,90,1)', 0.16, rng);
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(80,75,70,${rng() * 0.25})`;
    ctx.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2);
  }
  grain(ctx, S, S, 20, rng);
  return toTexture(c);
}

/** Атлас из 4 клякс краски (белые, красятся цветом команды). */
export function splatAtlas(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(71);
  ctx.clearRect(0, 0, S, S);
  for (let v = 0; v < 4; v++) {
    const cx = (v % 2) * 256 + 128;
    const cy = Math.floor(v / 2) * 256 + 128;
    ctx.fillStyle = '#ffffff';
    // основное пятно — неровный круг
    ctx.beginPath();
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 52 + rng() * 22;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.quadraticCurveTo(cx + Math.cos(a - 0.17) * (r + 10), cy + Math.sin(a - 0.17) * (r + 10), x, y);
    }
    ctx.fill();
    // брызги-лучи
    const rays = 7 + Math.floor(rng() * 5);
    for (let i = 0; i < rays; i++) {
      const a = rng() * Math.PI * 2;
      const len = 60 + rng() * 55;
      const w = 5 + rng() * 9;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(40, -w / 2);
      ctx.lineTo(len, -w * 0.2);
      ctx.lineTo(len, w * 0.2);
      ctx.lineTo(40, w / 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(len, 0, w * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // капли вокруг
    for (let i = 0; i < 16; i++) {
      const a = rng() * Math.PI * 2;
      const r = 70 + rng() * 50;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2 + rng() * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const t = toTexture(c, true, false);
  t.premultiplyAlpha = false;
  return t;
}

/** Мягкое круглое пятно (тень под игроком, облачко). */
export function softDot(inner = 'rgba(0,0,0,0.55)', outer = 'rgba(0,0,0,0)'): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.55, inner.replace(/[\d.]+\)$/, (m) => `${parseFloat(m) * 0.6})`));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return toTexture(c, true, false);
}

/**
 * Ореол вокруг прямоугольника w × h (метры) с углами радиуса r: внутри полная яркость, наружу гаснет на ширине margin.
 * Холст в пропорциях плоскости, поэтому ореол со всех сторон одной ширины. Белый, цвет задаёт материал.
 */
export function glowCardTexture(w: number, h: number, margin: number, r = 0): THREE.CanvasTexture {
  const PX = 24;
  const fw = w + margin * 2;
  const fh = h + margin * 2;
  const W = Math.ceil(fw * PX);
  const H = Math.ceil(fh * PX);
  const [c, ctx] = canvas(W, H);
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // расстояние до скруглённого прямоугольника, 0 — внутри
      const qx = Math.abs((x + 0.5) / W - 0.5) * fw - (w / 2 - r);
      const qy = Math.abs((y + 0.5) / H - 0.5) * fh - (h / 2 - r);
      const d = Math.max(0, Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r) / margin;
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = d >= 1 ? 0 : Math.round((1 - d) * (1 - d) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, true, false);
}

/** Карта мягкого затенения пола (AO) по отпечаткам боксов на настиле. */
export function deckAO(boxes: Array<{ min: number[]; max: number[] }>, minX: number, maxX: number, minZ: number, maxZ: number, pxPerM: number): THREE.CanvasTexture {
  const W = Math.round((maxX - minX) * pxPerM);
  const H = Math.round((maxZ - minZ) * pxPerM);
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const draw = (blur: number, alpha: number, grow: number) => {
    ctx.filter = `blur(${blur}px)`;
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    for (const b of boxes) {
      const x0 = (b.min[0] - grow - minX) * pxPerM;
      const x1 = (b.max[0] + grow - minX) * pxPerM;
      const z0 = (b.min[2] - grow - minZ) * pxPerM;
      const z1 = (b.max[2] + grow - minZ) * pxPerM;
      // ось Z текстуры перевёрнута относительно UV (v растёт вверх)
      ctx.fillRect(x0, H - z1, x1 - x0, z1 - z0);
    }
  };
  draw(pxPerM * 1.4, 0.28, 0.5);
  draw(pxPerM * 0.35, 0.45, 0.05);
  ctx.filter = 'none';
  const t = toTexture(c, false, false);
  return t;
}

/** Крашеная табличка с рамкой. Длинный текст ужимается по ширине. */
export function signTexture(text: string, bg: string, fg: string, w = 512, h = 128): THREE.CanvasTexture {
  const [c, ctx] = canvas(w, h);
  const k = h / 128;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 6 * k;
  ctx.strokeRect(8 * k, 8 * k, w - 16 * k, h - 16 * k);
  ctx.fillStyle = fg;
  fitFont(ctx, text, 64 * k, w - 48 * k);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 4 * k);
  const rng = makeRng(text.length * 97);
  grain(ctx, w, h, 18, rng);
  return toTexture(c, true, false);
}

/** Жирный шрифт размера size, уменьшенный, если текст не влезает в maxW. Возвращает итоговый размер. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, size: number, maxW: number, weight = 900): number {
  ctx.font = `${weight} ${size}px Rubik, system-ui, sans-serif`;
  const tw = ctx.measureText(text).width;
  if (tw > maxW) {
    size = Math.floor((size * maxW) / tw);
    ctx.font = `${weight} ${size}px Rubik, system-ui, sans-serif`;
  }
  return size;
}

/** Ткань в клетку для крышки банки варенья. */
export function ginghamTexture(): THREE.CanvasTexture {
  const S = 64;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = '#fff4ee';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(210,40,50,0.6)';
  for (let i = 0; i < S; i += 16) {
    ctx.fillRect(i, 0, 8, S);
    ctx.fillRect(0, i, S, 8);
  }
  return toTexture(c);
}

/** Надпись краской по бетону: крупные буквы, стёртые подошвами и колёсами погрузчиков. */
export function floorLettering(text: string, color: string, seed: number): THREE.CanvasTexture {
  const w = 1024;
  const h = 256;
  const [c, ctx] = canvas(w, h);
  const rng = makeRng(seed);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 190px Rubik, system-ui, sans-serif';
  // растягиваем по ширине, как трафаретные буквы на асфальте
  const m = ctx.measureText(text).width;
  const sx = Math.min(1.6, (w * 0.92) / Math.max(1, m));
  ctx.save();
  ctx.translate(w / 2, h / 2 + 8);
  ctx.scale(sx, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
  // потёртости: стираем пятнами и полосами
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = 2 + rng() * 16;
    ctx.globalAlpha = 0.25 + rng() * 0.6;
    ctx.beginPath();
    ctx.ellipse(x, y, r * (1 + rng() * 2), r, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 14; i++) {
    const y = rng() * h;
    ctx.globalAlpha = 0.18 + rng() * 0.3;
    ctx.fillRect(0, y, w, 3 + rng() * 10);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return toTexture(c, true, false);
}

let metalEnv: THREE.CanvasTexture | null = null;

/**
 * Окружение для золота (корона, цепь, золотая желейка): без него металл в three.js почти чёрный.
 * Равнопромежуточная карта: тёплый закатный горизонт, небо, тёмный низ и пятно солнца.
 */
export function metalEnvTexture(): THREE.CanvasTexture {
  if (metalEnv) return metalEnv;
  const [c, ctx] = canvas(256, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#5d6f9e');
  g.addColorStop(0.38, '#b9a7b8');
  g.addColorStop(0.5, '#ffd9a8');
  g.addColorStop(0.56, '#a8826a');
  g.addColorStop(1, '#2e241e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
  // солнце и пара светлых пятен — чтобы на гранях бегали блики
  for (const [x, y, r, a] of [[64, 56, 22, 1], [190, 40, 34, 0.35], [130, 70, 18, 0.3]] as const) {
    const s = ctx.createRadialGradient(x, y, 0, x, y, r);
    s.addColorStop(0, `rgba(255,244,220,${a})`);
    s.addColorStop(1, 'rgba(255,244,220,0)');
    ctx.fillStyle = s;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  metalEnv = new THREE.CanvasTexture(c);
  metalEnv.colorSpace = THREE.SRGBColorSpace;
  metalEnv.mapping = THREE.EquirectangularReflectionMapping;
  return metalEnv;
}

/** Надпись-спрайт эмоции («zzz», «ха-ха»): светлые буквы с тёмной обводкой. */
export function emoteTexture(text: string, color: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 128);
  ctx.font = '900 64px Rubik, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 12;
  ctx.strokeStyle = 'rgba(30,24,20,0.85)';
  ctx.strokeText(text, 128, 64);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 64);
  return toTexture(c, true, false);
}

// ------------------------------------------------------------ набережная

/** Доски (терраса, мостки, заборы, стены ларька): светлые — цвет даёт вершина. 10 досок на повтор, стыки вразбежку. */
export function plankTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(23);
  const n = 10;
  // прямоугольник с переносом через правый край — текстура тайлится
  const span = (x: number, w: number, y: number, h: number) => {
    const a = ((x % S) + S) % S;
    ctx.fillRect(a, y, Math.min(w, S - a), h);
    if (a + w > S) ctx.fillRect(0, y, a + w - S, h);
  };
  for (let i = 0; i < n; i++) {
    const y = Math.round((i * S) / n);
    const y1 = Math.round(((i + 1) * S) / n);
    const h = y1 - y;
    const start = rng() * S;
    // в ряду одна или две доски на повтор (2 м): частые стыки издали читаются как кирпичная кладка
    const cut = rng() < 0.45 ? S : Math.round(S * (0.35 + rng() * 0.3));
    for (const [x, len] of cut < S ? [[0, cut], [cut, S - cut]] : [[0, S]]) {
      const t = 210 + rng() * 26;
      ctx.fillStyle = `rgb(${t | 0},${(t * 0.95) | 0},${(t * 0.89) | 0})`;
      span(start + x, len, y, h);
      // волокна вдоль доски
      for (let k = 0; k < 7; k++) {
        ctx.fillStyle = `rgba(90,60,40,${0.06 + rng() * 0.1})`;
        span(start + x + rng() * 10, len * (0.4 + rng() * 0.6), y + 2 + rng() * (h - 5), 1);
      }
      // торцевой стык и пара гвоздей
      ctx.fillStyle = 'rgba(40,28,20,0.32)';
      span(start + x, 2, y, h);
      ctx.fillStyle = 'rgba(30,24,20,0.6)';
      span(start + x + 5, 2, y + h * 0.28, 2);
      span(start + x + 5, 2, y + h * 0.68, 2);
    }
    // щель между досками
    ctx.fillStyle = 'rgba(25,18,14,0.75)';
    ctx.fillRect(0, y1 - 3, S, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, y, S, 1);
  }
  blotches(ctx, S, S, 18, 20, 70, 'rgba(70,50,35,1)', 0.12, rng);
  grain(ctx, S, S, 16, rng);
  return toTexture(c);
}

/** Ковёр павильона автоматов: тёмно-бордовый, ромбы и кольца — как в старых залах. 256 px = 1,6 м. */
export function carpetTexture(): THREE.CanvasTexture {
  const S = 256;
  const q = S / 2;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(43);
  ctx.fillStyle = '#4a1420';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 10, 20, 60, 'rgba(110,30,45,1)', 0.35, rng);
  // ромбическая решётка: ромб касается середин краёв — при повторе получается сетка
  ctx.lineJoin = 'round';
  for (const [w, col] of [[7, 'rgba(30,8,14,0.7)'], [3, 'rgba(214,160,72,0.75)']] as const) {
    ctx.lineWidth = w;
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, q);
    ctx.lineTo(q, 0);
    ctx.lineTo(S, q);
    ctx.lineTo(q, S);
    ctx.closePath();
    ctx.stroke();
  }
  const ring = (x: number, y: number, r: number) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#1d4a52';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#d6a048';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = '#c98a3a';
    ctx.fill();
  };
  ring(q, q, 24);
  // в углах — одно кольцо на четыре плитки
  for (const [x, y] of [[0, 0], [S, 0], [0, S], [S, S]]) ring(x, y, 15);
  // мелкие точки в ячейках
  ctx.fillStyle = 'rgba(214,160,72,0.6)';
  for (const [x, y] of [[q / 2, q / 2], [q * 1.5, q / 2], [q / 2, q * 1.5], [q * 1.5, q * 1.5]]) {
    for (const [dx, dy] of [[0, -9], [9, 0], [0, 9], [-9, 0]]) {
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  grain(ctx, S, S, 14, rng);
  return toTexture(c);
}

/** Рулонная дверь гаража: ламели, грязь снизу, ручка. Натягивается один раз на всю дверь. */
export function rollerDoorTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 320;
  const [c, ctx] = canvas(W, H);
  const rng = makeRng(57);
  const n = 26;
  const sh = H / n;
  for (let i = 0; i < n; i++) {
    const y = i * sh;
    const g = ctx.createLinearGradient(0, y, 0, y + sh);
    g.addColorStop(0, '#c3c9bf');
    g.addColorStop(0.45, '#a9b1a6');
    g.addColorStop(1, '#7f877d');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, W, sh);
    ctx.fillStyle = 'rgba(30,34,30,0.55)';
    ctx.fillRect(0, y + sh - 1.5, W, 1.5);
  }
  const dirt = ctx.createLinearGradient(0, H * 0.55, 0, H);
  dirt.addColorStop(0, 'rgba(60,50,40,0)');
  dirt.addColorStop(1, 'rgba(60,50,40,0.5)');
  ctx.fillStyle = dirt;
  ctx.fillRect(0, H * 0.55, W, H * 0.45);
  // потёки ржавчины
  for (let i = 0; i < 26; i++) {
    const x = rng() * W;
    const len = 20 + rng() * 90;
    const y = rng() * H * 0.5;
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, 'rgba(120,70,40,0.35)');
    g.addColorStop(1, 'rgba(120,70,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 1 + rng() * 2, len);
  }
  blotches(ctx, W, H, 12, 20, 60, 'rgba(70,60,50,1)', 0.14, rng);
  // нижняя планка и ручка
  ctx.fillStyle = '#4c524c';
  ctx.fillRect(0, H - 12, W, 12);
  ctx.fillStyle = '#2a2d2a';
  ctx.fillRect(W / 2 - 34, H - 36, 68, 10);
  grain(ctx, W, H, 14, rng);
  return toTexture(c, true, false);
}

export interface BulbSign {
  /** Буквы из лампочек */
  letters: THREE.CanvasTexture;
  /** Рамка: в фазе A горят чётные лампы, в фазе B — нечётные */
  chaseA: THREE.CanvasTexture;
  chaseB: THREE.CanvasTexture;
}

/** Вывеска из ламп накаливания, как над старыми аттракционами. Фон прозрачный — под ней своя панель. */
export function bulbSignTextures(text: string, w: number, h: number): BulbSign {
  const g = Math.round(h / 12);
  const [mc, mx] = canvas(w, h);
  mx.fillStyle = '#fff';
  mx.textAlign = 'center';
  mx.textBaseline = 'middle';
  const size = fitFont(mx, text, Math.round(h * 0.74), w - g * 4);
  mx.fillText(text, w / 2, h / 2 + size * 0.04);
  const mask = mx.getImageData(0, 0, w, h).data;
  mc.width = 0;

  const bulb = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, on: boolean) => {
    if (on) {
      const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 2.7);
      halo.addColorStop(0, 'rgba(255,204,120,0.85)');
      halo.addColorStop(0.45, 'rgba(255,170,80,0.32)');
      halo.addColorStop(1, 'rgba(255,160,70,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(x - r * 2.7, y - r * 2.7, r * 5.4, r * 5.4);
    }
    ctx.fillStyle = on ? '#ffe6b0' : '#6b5642';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = on ? '#fffbf0' : '#8a7660';
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  };

  const [lc, lx] = canvas(w, h);
  for (let y = g / 2; y < h; y += g) {
    for (let x = g / 2; x < w; x += g) {
      if (mask[((y | 0) * w + (x | 0)) * 4 + 3] > 120) bulb(lx, x, y, g * 0.36, true);
    }
  }

  // точки рамки по периметру, шаг ~1,5 шага сетки
  const inset = g * 0.9;
  const pts: Array<[number, number]> = [];
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const k = Math.max(1, Math.round(len / (g * 1.5)));
    for (let i = 0; i < k; i++) pts.push([x0 + ((x1 - x0) * i) / k, y0 + ((y1 - y0) * i) / k]);
  };
  edge(inset, inset, w - inset, inset);
  edge(w - inset, inset, w - inset, h - inset);
  edge(w - inset, h - inset, inset, h - inset);
  edge(inset, h - inset, inset, inset);
  const chase = (phase: number) => {
    const [cc, cx] = canvas(w, h);
    pts.forEach(([x, y], i) => bulb(cx, x, y, g * 0.32, i % 2 === phase));
    return toTexture(cc, true, false);
  };
  return { letters: toTexture(lc, true, false), chaseA: chase(0), chaseB: chase(1) };
}

/**
 * Вид в ворота склада: проход между штабелями контейнеров уходит к ярко освещённой дальней стене,
 * лампы под крышей, кляксы краски на полу и на контейнерах.
 */
export function gateGlowTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 384;
  const [c, ctx] = canvas(W, H);
  const rng = makeRng(77);
  // Перспектива: рамка ворот (6 × 4,5 м) — весь кадр, глаз на высоте 2 м в 5 м перед ней.
  // X — поперёк прохода (1 = 3 м), Y — вверх (1 = 4,5 м), d — метры вглубь от ворот.
  const D0 = 5;
  const vx = W / 2;
  const vy = H * (1 - 2 / 4.5);
  const DEPTH = 14;
  const AISLE = 0.75;
  const ROOF = 1.9;
  const LEVEL = 2.6 / 4.5;
  const LAMPS = [3, 6, 9, 12];
  const k = (d: number) => D0 / (D0 + d);
  const pt = (X: number, Y: number, d: number): [number, number] => [vx + k(d) * (((X + 1) / 2) * W - vx), vy + k(d) * (H * (1 - Y) - vy)];
  const poly = (fill: string | CanvasGradient, ...p: Array<[number, number]>) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
    ctx.closePath();
    ctx.fill();
  };
  const line = (p: [number, number], q: [number, number], color: string, width: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.stroke();
  };
  const mix = (p: number, q: number, t: number) => {
    const ch = (sh: number) => Math.round(((p >> sh) & 255) * (1 - t) + ((q >> sh) & 255) * t);
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
  };
  const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  /** Пятно, лежащее на плоскости в перспективе: rx, ry — полуоси на экране */
  const glowSpot = (x: number, y: number, rx: number, ry: number, inner: string) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, inner);
    g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  };
  const splat = (x: number, y: number, rx: number, ry: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2;
      const r = 1.15 + rng() * 0.7;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r, rx * 0.2, ry * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  // стены выше штабелей — сумрак
  ctx.fillStyle = '#26170e';
  ctx.fillRect(0, 0, W, H);
  // дальняя стена: снизу залита светом, к крыше гаснет; в ней ещё одни ворота — там, дальше, арена
  const [bl, bt] = pt(-2, ROOF, DEPTH);
  const [br, bb] = pt(2, 0, DEPTH);
  const back = ctx.createLinearGradient(0, bb, 0, bt);
  back.addColorStop(0, '#ffeec8');
  back.addColorStop(0.45, '#f4bd78');
  back.addColorStop(1, '#6a4024');
  poly(back, [bl, bt], [br, bt], [br, bb], [bl, bb]);
  poly('#fff8e6', pt(-0.4, 0, DEPTH), pt(-0.4, 0.7, DEPTH), pt(0.4, 0.7, DEPTH), pt(0.4, 0, DEPTH));
  // крыша с фермами
  const roof = ctx.createLinearGradient(0, 0, 0, bt);
  roof.addColorStop(0, '#100804');
  roof.addColorStop(1, '#3e2616');
  poly(roof, pt(-2, ROOF, -2), pt(2, ROOF, -2), pt(2, ROOF, DEPTH), pt(-2, ROOF, DEPTH));
  for (let d = 1; d < DEPTH; d += 2.5) line(pt(-2, ROOF, d), pt(2, ROOF, d), 'rgba(0,0,0,0.55)', 4 * k(d));
  // пол: бетон светлеет к дальней стене, швы сходятся в точку, под лампами — блики
  const fl = ctx.createLinearGradient(0, H, 0, bb);
  fl.addColorStop(0, '#6e482a');
  fl.addColorStop(1, '#f2cc90');
  poly(fl, pt(-2, 0, -1.5), pt(2, 0, -1.5), pt(2, 0, DEPTH), pt(-2, 0, DEPTH));
  for (const X of [-0.25, 0.25]) line(pt(X, 0, -1.5), pt(X, 0, DEPTH), 'rgba(60,36,20,0.35)', 1.5);
  for (let d = 0; d < DEPTH; d += 3) line(pt(-AISLE, 0, d), pt(AISLE, 0, d), 'rgba(60,36,20,0.3)', 2 * k(d));
  for (const d of LAMPS) {
    for (const X of [-0.4, 0.4]) {
      const [x, y] = pt(X, 0, d);
      const rx = 70 * k(d);
      glowSpot(x, y, rx, rx * (3 / (D0 + d)), 'rgba(255,236,190,0.45)');
    }
  }
  const colors = ['rgba(84,112,255,0.85)', 'rgba(255,138,48,0.85)'];
  for (let i = 0; i < 7; i++) {
    const d = 0.3 + rng() * 10;
    const [x, y] = pt((rng() - 0.5) * 1.2, 0, d);
    const rx = (0.3 + rng() * 0.3) * k(d) * (W / 6);
    splat(x, y, rx, rx * (2 / (D0 + d)) * 1.4, colors[i % 2]);
  }
  // штабели контейнеров вдоль прохода: два яруса, кое-где третий; ближние темнее, дальние тонут в тёплом свете
  const palette = [0x8c3b2a, 0x2f566e, 0x3f6040, 0x9a7230, 0x6a6e72, 0x7a2f3a, 0x2f4f5f];
  for (const side of [-1, 1]) {
    const X = side * AISLE;
    for (let lv = 0; lv < 3; lv++) {
      let d = -1.5 - rng() * 2.5;
      while (d < DEPTH - 3.5) {
        const d1 = Math.min(d + 6.06, DEPTH - 1.5);
        if (lv === 2 && rng() < 0.55) {
          d = d1 + 0.15;
          continue;
        }
        const y0 = lv * LEVEL;
        const y1 = y0 + LEVEL - 0.015;
        const t = Math.min(1, Math.max(0, (d + d1) / 2 / DEPTH));
        const base = mix(palette[(rng() * palette.length) | 0], 0x000000, 0.45 * (1 - t) - lv * 0.06);
        poly(css(mix(base, 0xf2b468, 0.5 * t)), pt(X, y0, d), pt(X, y1, d), pt(X, y1, d1), pt(X, y0, d1));
        for (let dd = d + 0.15; dd < d1; dd += 0.3) line(pt(X, y0 + 0.02, dd), pt(X, y1 - 0.02, dd), 'rgba(0,0,0,0.22)', 2 * k(dd));
        line(pt(X, y1, d), pt(X, y1, d1), 'rgba(255,220,160,0.35)', 1.5);
        line(pt(X, y0, d), pt(X, y1, d), 'rgba(0,0,0,0.5)', 4 * k(d));
        line(pt(X, y0, d1), pt(X, y1, d1), 'rgba(0,0,0,0.5)', 4 * k(d1));
        d = d1 + 0.15;
      }
    }
  }
  for (let i = 0; i < 4; i++) {
    const d = 0.5 + rng() * 8;
    const [x, y] = pt((i % 2 ? 1 : -1) * AISLE, 0.25 + rng() * 0.7, d);
    const ry = (0.25 + rng() * 0.25) * k(d) * (W / 6);
    splat(x, y, ry * (2.25 / (D0 + d)) * 1.6, ry, colors[(i + 1) % 2]);
  }
  // лампы на подвесах
  for (const d of LAMPS) {
    for (const X of [-0.4, 0.4]) {
      const [x, y] = pt(X, 1.35, d);
      line([x, y], pt(X, ROOF, d), 'rgba(20,12,8,0.8)', 1);
      glowSpot(x, y, 64 * k(d), 64 * k(d), 'rgba(255,236,190,0.85)');
      ctx.fillStyle = '#fff6dc';
      ctx.fillRect(x - 22 * k(d), y - 3 * k(d), 44 * k(d), 6 * k(d));
    }
  }
  // свечение глубины и затемнение по краям
  const [hx, hy] = pt(0, 0.4, DEPTH);
  glowSpot(hx, hy, W * 0.45, W * 0.45, 'rgba(255,226,170,0.5)');
  const vig = ctx.createRadialGradient(vx, vy, W * 0.2, vx, vy, W * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(16,8,4,0.6)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, 10, rng);
  return toTexture(c, true, false);
}

/** Брусчатка набережной: камни 0,5 × 0,25 м вразбежку, светлые песочные, изредка персиковые. 512 px = 4 м. */
export function paverTexture(): THREE.CanvasTexture {
  const S = 512;
  const rows = 16;
  const rh = S / rows;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(29);
  ctx.fillStyle = '#a2978a';
  ctx.fillRect(0, 0, S, S);
  const tones = [[238, 232, 222], [230, 224, 214], [222, 219, 213], [242, 236, 224], [214, 208, 200], [234, 224, 214], [238, 216, 198]];
  // прямоугольник с переносом через правый край — текстура тайлится
  const rect = (x: number, y: number, w: number, h: number) => {
    const a = ((x % S) + S) % S;
    ctx.fillRect(a, y, Math.min(w, S - a), h);
    if (a + w > S) ctx.fillRect(0, y, a + w - S, h);
  };
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    // восемь камней на ряд, длины чуть разные, сумма — ровно повтор
    const wts = Array.from({ length: 8 }, () => 0.75 + rng() * 0.5);
    const sum = wts.reduce((p, q) => p + q, 0);
    let x = rng() * S;
    for (const wt of wts) {
      const len = (wt / sum) * S;
      const [cr, cg, cb] = tones[(rng() * tones.length) | 0];
      const j = (rng() - 0.5) * 16;
      ctx.fillStyle = `rgb(${(cr + j) | 0},${(cg + j) | 0},${(cb + j) | 0})`;
      rect(x + 1.5, y + 1.5, len - 3, rh - 3);
      // скос: свет сверху, тень снизу
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      rect(x + 1.5, y + 1.5, len - 3, 2);
      ctx.fillStyle = 'rgba(40,30,24,0.12)';
      rect(x + 1.5, y + rh - 4, len - 3, 2.5);
      x += len;
    }
  }
  blotches(ctx, S, S, 22, 24, 90, 'rgba(120,110,98,1)', 0.12, rng);
  blotches(ctx, S, S, 4, 10, 24, 'rgba(40,34,30,1)', 0.18, rng);
  grain(ctx, S, S, 18, rng);
  return toTexture(c);
}

/**
 * Мозаика «роза ветров» для центра площади: смальта квадратиками, синяя кайма с белыми «волнами»,
 * восьмилучевая звезда (длинные лучи терракотовые, косые — синие, у каждого луча светлая и тёмная половины).
 * Верх холста — север. За кругом прозрачно.
 */
export function compassRoseTexture(): THREE.CanvasTexture {
  const S = 1024;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(77);
  const m = S / 2;
  const R = m - 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(m, m, R, 0, Math.PI * 2);
  ctx.clip();
  const disk = (r: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(m, m, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // кайма, тонкое терракотовое кольцо, светлое поле
  disk(R, '#2d5d86');
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    ctx.fillStyle = '#f1e9d8';
    ctx.beginPath();
    ctx.arc(m + Math.sin(a) * R * 0.915, m - Math.cos(a) * R * 0.915, R * 0.028, 0, Math.PI * 2);
    ctx.fill();
  }
  disk(R * 0.86, '#b4532f');
  disk(R * 0.835, '#efe6d2');
  // звезда: луч — два треугольника от центра к острию, боковые вершины на биссектрисах между лучами
  const ray = (a: number, len: number, w: number, light: string, dark: string) => {
    const tip: [number, number] = [m + Math.sin(a) * len, m - Math.cos(a) * len];
    for (const [side, color] of [[-1, light], [1, dark]] as const) {
      const b = a + side * (Math.PI / 4);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(m, m);
      ctx.lineTo(tip[0], tip[1]);
      ctx.lineTo(m + Math.sin(b) * w, m - Math.cos(b) * w);
      ctx.closePath();
      ctx.fill();
    }
  };
  for (let k = 0; k < 4; k++) ray(Math.PI / 4 + (k * Math.PI) / 2, R * 0.56, R * 0.11, '#6f9fc8', '#2d5d86');
  for (let k = 0; k < 4; k++) ray((k * Math.PI) / 2, R * 0.8, R * 0.15, '#e07a52', '#a8432e');
  disk(R * 0.085, '#8a5a1e');
  disk(R * 0.065, '#e8b84e');
  ctx.restore();
  // смальта: у каждого квадратика свой оттенок, между ними светлый шов
  const t = 14;
  for (let y = 0; y < S; y += t) {
    for (let x = 0; x < S; x += t) {
      const v = rng();
      ctx.fillStyle = v < 0.5 ? `rgba(255,250,240,${(0.05 + v * 0.14).toFixed(3)})` : `rgba(40,28,20,${(0.02 + (v - 0.5) * 0.14).toFixed(3)})`;
      ctx.fillRect(x, y, t, t);
    }
  }
  ctx.fillStyle = 'rgba(214,204,186,0.75)';
  for (let k = 0; k < S; k += t) {
    ctx.fillRect(k, 0, 2, S);
    ctx.fillRect(0, k, S, 2);
  }
  // всё, что вылезло за круг (оттенки и швы), стираем
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  ctx.arc(m, m, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  return toTexture(c, true, false);
}

/** Табличка гаража: «КАРТИНГ», по краям — шашечки финишного флага. */
export function kartSignTexture(): THREE.CanvasTexture {
  const W = 768;
  const H = 128;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#efe8da';
  ctx.fillRect(0, 0, W, H);
  const sq = 16;
  for (const x0 of [10, W - 10 - sq * 4]) {
    for (let r = 0; r < 6; r++) {
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = (r + k) % 2 ? '#efe8da' : '#1d1d20';
        ctx.fillRect(x0 + k * sq, 16 + r * sq, sq, sq);
      }
    }
  }
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#1d1d20';
  fitFont(ctx, 'КАРТИНГ', 84, W - 2 * (10 + sq * 4) - 60);
  ctx.fillText('КАРТИНГ', W / 2, H / 2 + 4);
  grain(ctx, W, H, 16, makeRng(71));
  return toTexture(c, true, false);
}

/** Вывеска кафе: «Кафе «Чайка»» кремовым по морской синеве, рядом — чайка. */
export function cafeSignTexture(): THREE.CanvasTexture {
  const W = 896;
  const H = 128;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#1f4a66';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#f2e6cc';
  ctx.lineWidth = 5;
  ctx.strokeRect(9, 9, W - 18, H - 18);
  // чайка: две дуги крыльев
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(60, 66);
  ctx.quadraticCurveTo(86, 30, 112, 62);
  ctx.quadraticCurveTo(138, 30, 164, 66);
  ctx.stroke();
  ctx.fillStyle = '#f2e6cc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, 'Кафе «Чайка»', 70, W - 260);
  ctx.fillText('Кафе «Чайка»', W / 2 + 60, H / 2 + 4);
  grain(ctx, W, H, 16, makeRng(73));
  return toTexture(c, true, false);
}

export interface FacadeTextures {
  /** Стены и тёмные окна (цвет стены даёт вершина) */
  map: THREE.CanvasTexture;
  /** Свет в окнах */
  emissive: THREE.CanvasTexture;
}

/** Фасады города: 8 × 8 окон, 3 м на окно и этаж (повтор — 24 м); примерно треть окон горит. */
export function townFacadeTextures(): FacadeTextures {
  const S = 512;
  const N = 8;
  const cell = S / N;
  const [c, ctx] = canvas(S, S);
  const [e, ex] = canvas(S, S);
  const rng = makeRng(61);
  ctx.fillStyle = '#e6dfd4';
  ctx.fillRect(0, 0, S, S);
  ex.fillStyle = '#000';
  ex.fillRect(0, 0, S, S);
  const warm = ['#ffcf88', '#ffbe6a', '#ffe0ae', '#ffb05a', '#f6e4c4'];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = i * cell;
      const y = j * cell;
      ctx.fillStyle = 'rgba(80,70,60,0.2)';
      ctx.fillRect(x, y + cell - 4, cell, 4);
      const wx = x + cell * 0.27;
      const wy = y + cell * 0.2;
      const ww = cell * 0.46;
      const wh = cell * 0.5;
      if (rng() < 0.34) {
        ctx.fillStyle = '#c9b48e';
        ctx.fillRect(wx, wy, ww, wh);
        ex.globalAlpha = 0.55 + rng() * 0.45;
        ex.fillStyle = rng() < 0.08 ? '#d4e2ff' : warm[(rng() * warm.length) | 0];
        ex.fillRect(wx, wy, ww, wh);
        // задёрнутая занавеска — полокна темнее
        if (rng() < 0.45) {
          ex.globalAlpha = 0.45;
          ex.fillStyle = '#000';
          ex.fillRect(wx + (rng() < 0.5 ? 0 : ww / 2), wy, ww / 2, wh);
        }
        ex.globalAlpha = 1;
      } else {
        ctx.fillStyle = rng() < 0.5 ? '#2b3440' : '#363e48';
        ctx.fillRect(wx, wy, ww, wh);
      }
      // переплёт
      ctx.fillStyle = 'rgba(232,226,216,0.9)';
      ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      ex.fillStyle = '#000';
      ex.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      // балкон под частью окон
      if (rng() < 0.2) {
        ctx.fillStyle = 'rgba(110,100,92,0.65)';
        ctx.fillRect(x + cell * 0.16, wy + wh + 3, cell * 0.68, cell * 0.17);
      }
    }
  }
  grain(ctx, S, S, 10, rng);
  return { map: toTexture(c), emissive: toTexture(e) };
}

/** «Зеркало» примерочной без настоящих отражений: холодный градиент и блики наискосок. */
export function mirrorTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#e2eaf0');
  g.addColorStop(0.5, '#a3b5c4');
  g.addColorStop(1, '#71859a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.5);
  for (const [off, w, a] of [[-30, 18, 0.5], [-4, 6, 0.4], [38, 10, 0.28]]) {
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(off - w / 2, -H, w, H * 2);
  }
  ctx.restore();
  return toTexture(c, true, false);
}

// ------------------------------------------------------------ карты

/**
 * Атлас карт: 8 × 5 ячеек. 0–35 — лица (масть = c div 9, достоинство = c mod 9), 36 — рубашка.
 * Карта занимает ячейку не целиком: прозрачная кайма не даёт соседям подтекать на мелких mip-уровнях.
 */
export const CARD_ATLAS = { cols: 8, rows: 5, cellW: 128, cellH: 184, padX: 3, padY: 4, back: 36 } as const;

const CARD_RED = '#cc2730';
const CARD_BLACK = '#1d1f2c';
const CARD_PAPER = '#fbf7ee';
const CARD_RANKS = ['6', '7', '8', '9', '10', 'В', 'Д', 'К', 'Т'];

/** Сердце в единичном квадрате с центром в нуле (y вниз); k = −1 — вверх ногами (для пики). */
function heartPath(ctx: CanvasRenderingContext2D, k: number): void {
  ctx.moveTo(0, 0.5 * k);
  ctx.bezierCurveTo(-0.2, 0.32 * k, -0.5, 0.12 * k, -0.5, -0.12 * k);
  ctx.bezierCurveTo(-0.5, -0.36 * k, -0.36, -0.48 * k, -0.24, -0.48 * k);
  ctx.bezierCurveTo(-0.12, -0.48 * k, -0.02, -0.4 * k, 0, -0.28 * k);
  ctx.bezierCurveTo(0.02, -0.4 * k, 0.12, -0.48 * k, 0.24, -0.48 * k);
  ctx.bezierCurveTo(0.36, -0.48 * k, 0.5, -0.36 * k, 0.5, -0.12 * k);
  ctx.bezierCurveTo(0.5, 0.12 * k, 0.2, 0.32 * k, 0, 0.5 * k);
  ctx.closePath();
}

/** Ножка пики и трефы. */
function stemPath(ctx: CanvasRenderingContext2D): void {
  ctx.moveTo(0, 0.02);
  ctx.quadraticCurveTo(0.03, 0.34, 0.22, 0.5);
  ctx.lineTo(-0.22, 0.5);
  ctx.quadraticCurveTo(-0.03, 0.34, 0, 0.02);
  ctx.closePath();
}

/**
 * Знак масти контуром: глифы ♠ ♣ ♦ ♥ в разных системах рисуются по-разному, а то и цветными эмодзи.
 * (x, y) — центр, s — размер; цвет — текущий fillStyle. Части заливаются по отдельности, чтобы не вычитались.
 */
function drawSuit(ctx: CanvasRenderingContext2D, suit: number, x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const part = (draw: () => void): void => {
    ctx.beginPath();
    draw();
    ctx.fill();
  };
  if (suit === 3) {
    part(() => heartPath(ctx, 1));
  } else if (suit === 2) {
    part(() => {
      ctx.moveTo(0, -0.5);
      ctx.quadraticCurveTo(0.15, -0.2, 0.38, 0);
      ctx.quadraticCurveTo(0.15, 0.2, 0, 0.5);
      ctx.quadraticCurveTo(-0.15, 0.2, -0.38, 0);
      ctx.quadraticCurveTo(-0.15, -0.2, 0, -0.5);
      ctx.closePath();
    });
  } else if (suit === 0) {
    part(() => {
      ctx.save();
      ctx.translate(0, -0.1);
      ctx.scale(0.92, 0.78);
      heartPath(ctx, -1);
      ctx.restore();
    });
    part(() => stemPath(ctx));
  } else {
    for (const [cx, cy] of [[0, -0.25], [-0.25, 0.07], [0.25, 0.07]]) part(() => ctx.arc(cx, cy, 0.225, 0, Math.PI * 2));
    part(() => ctx.arc(0, 0, 0.13, 0, Math.PI * 2));
    part(() => stemPath(ctx));
  }
  ctx.restore();
}

/** Лицо карты в прямоугольнике (x, y, w, h): индексы в углах (нижний перевёрнут), посередине — крупно достоинство и масть. */
function drawCardFace(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, card: number): void {
  const suit = Math.floor(card / 9);
  const rank = card % 9;
  const ink = suit >= 2 ? CARD_RED : CARD_BLACK;
  const label = CARD_RANKS[rank];
  ctx.fillStyle = CARD_PAPER;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 11);
  ctx.fill();
  ctx.strokeStyle = 'rgba(96,74,52,0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // картинки и туз — в золотой рамке, чтобы отличались от числовых и издалека
  if (rank >= 5) {
    ctx.fillStyle = suit >= 2 ? 'rgba(204,39,48,0.07)' : 'rgba(29,31,44,0.06)';
    ctx.beginPath();
    ctx.roundRect(x + 24, y + 22, w - 48, h - 44, 8);
    ctx.fill();
    ctx.strokeStyle = '#c99a3c';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const flip of [false, true]) {
    ctx.save();
    if (flip) {
      ctx.translate(x + w, y + h);
      ctx.rotate(Math.PI);
    } else {
      ctx.translate(x, y);
    }
    fitFont(ctx, label, 34, 30, 800);
    ctx.fillText(label, 17, 22);
    drawSuit(ctx, suit, 17, 47, 18);
    ctx.restore();
  }
  fitFont(ctx, label, 72, w - 46, 900);
  ctx.fillText(label, x + w / 2, y + h * 0.42);
  drawSuit(ctx, suit, x + w / 2, y + h * 0.71, 42);
}

/** Рубашка: белая кайма, тёмно-вишнёвое поле с ромбовой сеткой, медальон посередине. */
function drawCardBack(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = CARD_PAPER;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 11);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + 7, y + 7, w - 14, h - 14, 7);
  ctx.fillStyle = '#741526';
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,196,196,0.26)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let d = -h; d < w + h; d += 15) {
    ctx.moveTo(x + d, y);
    ctx.lineTo(x + d + h, y + h);
    ctx.moveTo(x + d, y + h);
    ctx.lineTo(x + d + h, y);
  }
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, 24, 33, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#520c19';
  ctx.fill();
  ctx.strokeStyle = '#e8c068';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#e8c068';
  drawSuit(ctx, 2, x + w / 2, y + h / 2, 30);
}

let cardAtlas: HTMLCanvasElement | null = null;

/** Холст атласа карт (один на всё: из него и 3D-карты, и карты руки в интерфейсе). */
export function cardAtlasCanvas(): HTMLCanvasElement {
  if (cardAtlas) return cardAtlas;
  const A = CARD_ATLAS;
  const [c, ctx] = canvas(A.cols * A.cellW, A.rows * A.cellH);
  const w = A.cellW - A.padX * 2;
  const h = A.cellH - A.padY * 2;
  for (let i = 0; i <= A.back; i++) {
    const x = (i % A.cols) * A.cellW + A.padX;
    const y = Math.floor(i / A.cols) * A.cellH + A.padY;
    if (i === A.back) drawCardBack(ctx, x, y, w, h);
    else drawCardFace(ctx, x, y, w, h, i);
  }
  cardAtlas = c;
  return c;
}

/** Атлас всех карт и рубашки (см. CARD_ATLAS). */
export function cardAtlasTexture(): THREE.CanvasTexture {
  return toTexture(cardAtlasCanvas(), true, false);
}

/** Помидор на лице: красная клякса с брызгами, подтёками вниз и семечками; фон прозрачный. */
let tomatoSplat: HTMLCanvasElement | null = null;

/** Клякса помидора: на лицо желейки (текстура) и на экран, если попали в тебя (картинка). */
export function tomatoSplatCanvas(): HTMLCanvasElement {
  if (tomatoSplat) return tomatoSplat;
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(77);
  const TAU = Math.PI * 2;
  ctx.fillStyle = '#d42a1c';
  ctx.beginPath();
  ctx.arc(128, 118, 60, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 16; i++) {
    const a = rng() * TAU;
    const r = 30 + rng() * 34;
    ctx.beginPath();
    ctx.arc(128 + Math.cos(a) * r, 118 + Math.sin(a) * r * 0.8, 18 + rng() * 20, 0, TAU);
    ctx.fill();
  }
  // брызги вокруг
  for (let i = 0; i < 22; i++) {
    const a = rng() * TAU;
    const r = 84 + rng() * 34;
    ctx.beginPath();
    ctx.arc(128 + Math.cos(a) * r, 118 + Math.sin(a) * r * 0.85, 3 + rng() * 8, 0, TAU);
    ctx.fill();
  }
  // подтёки вниз
  for (let i = 0; i < 5; i++) {
    const x = 78 + rng() * 100;
    const w = 9 + rng() * 9;
    const len = 50 + rng() * 60;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, 140, w, len, w / 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, 140 + len - w * 0.3, w * 0.75, 0, TAU);
    ctx.fill();
  }
  // мякоть посветлее
  ctx.fillStyle = 'rgba(255,128,96,0.55)';
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.arc(104 + rng() * 48, 96 + rng() * 44, 9 + rng() * 12, 0, TAU);
    ctx.fill();
  }
  // семечки
  ctx.fillStyle = '#f6e4a2';
  for (let i = 0; i < 18; i++) {
    const a = rng() * TAU;
    const r = rng() * 52;
    ctx.beginPath();
    ctx.ellipse(128 + Math.cos(a) * r, 118 + Math.sin(a) * r * 0.8, 5.5, 3.2, rng() * Math.PI, 0, TAU);
    ctx.fill();
  }
  // мокрый блик
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.ellipse(102, 88, 20, 10, -0.5, 0, TAU);
  ctx.fill();
  tomatoSplat = c;
  return c;
}

export function tomatoSplatTexture(): THREE.CanvasTexture {
  return toTexture(tomatoSplatCanvas(), true, false);
}

/** Эмодзи (реакция над головой): цветной системный шрифт на прозрачном. */
export function emojiTexture(ch: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  ctx.font = '100px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, 64, 70);
  return toTexture(c, true, false);
}

// ------------------------------------------------------------ картинг

/**
 * Асфальт трассы на всю ширину дороги: u 0…1 — от левого края до правого, повтор по длине — тоже ширина.
 * Крошка, заплатки, тёмная накатанная середина, белые линии в 0,3 м от краёв.
 */
export function asphaltTexture(width: number): THREE.CanvasTexture {
  const S = 1024;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(83);
  const px = S / width;
  ctx.fillStyle = '#56585c';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 30, 30, 140, 'rgba(30,31,34,1)', 0.22, rng);
  blotches(ctx, S, S, 14, 40, 120, 'rgba(150,148,142,1)', 0.12, rng);
  // накатанная резина посередине
  const mid = ctx.createLinearGradient(0, 0, S, 0);
  mid.addColorStop(0.2, 'rgba(20,20,22,0)');
  mid.addColorStop(0.5, 'rgba(20,20,22,0.28)');
  mid.addColorStop(0.8, 'rgba(20,20,22,0)');
  ctx.fillStyle = mid;
  ctx.fillRect(0, 0, S, S);
  // заплатки — прямоугольники чуть другого тона, едва заметные
  for (let i = 0; i < 3; i++) {
    const w = (0.8 + rng() * 1.6) * px;
    const h = (0.8 + rng() * 2.4) * px;
    const x = (1 + rng() * (width - 4)) * px;
    const y = rng() * (S - h);
    ctx.fillStyle = rng() < 0.5 ? 'rgba(25,26,29,0.13)' : 'rgba(120,118,112,0.08)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(20,20,22,0.18)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
  }
  // крошка: в основном тёмная, светлой немного (вблизи иначе «соль»)
  for (let i = 0; i < 20000; i++) {
    const light = rng() < 0.25;
    const v = light ? 130 + rng() * 45 : 20 + rng() * 30;
    ctx.fillStyle = `rgba(${v},${v},${v * 0.98},${light ? 0.12 + rng() * 0.18 : 0.2 + rng() * 0.25})`;
    ctx.fillRect(rng() * S, rng() * S, 1 + rng(), 1 + rng());
  }
  // трещинки
  ctx.strokeStyle = 'rgba(18,18,20,0.4)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    let x = rng() * S;
    let y = rng() * S;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 10; k++) {
      x += (rng() - 0.5) * 40;
      y += (rng() - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  grain(ctx, S, S, 18, rng);
  // белые линии по краям, чуть стёртые
  const lw = 0.2 * px;
  for (const x of [0.3 * px, S - 0.3 * px - lw]) {
    ctx.fillStyle = 'rgba(238,236,228,0.92)';
    ctx.fillRect(x, 0, lw, S);
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 90; i++) {
      ctx.globalAlpha = 0.1 + rng() * 0.3;
      ctx.fillRect(x + rng() * lw, rng() * S, 1 + rng() * 3, 2 + rng() * 10);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#56585c';
    ctx.fillRect(x, 0, lw, S);
    ctx.globalCompositeOperation = 'source-over';
  }
  return toTexture(c);
}

/** Бордюр: красная и белая полосы по длине (v), чуть скруглённый край (u — поперёк, от дороги наружу). */
export function kerbTexture(): THREE.CanvasTexture {
  const W = 64;
  const H = 128;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#c8302a';
  ctx.fillRect(0, 0, W, H / 2);
  ctx.fillStyle = '#efebe2';
  ctx.fillRect(0, H / 2, W, H / 2);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.18)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, 14, makeRng(89));
  return toTexture(c);
}

/** Шахматка cols × rows клеток (линия старта, финишный баннер). */
export function checkerTexture(cols: number, rows: number): THREE.CanvasTexture {
  const cell = 32;
  const [c, ctx] = canvas(cols * cell, rows * cell);
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      ctx.fillStyle = (r + k) % 2 ? '#f2efe8' : '#1b1b1e';
      ctx.fillRect(k * cell, r * cell, cell, cell);
    }
  }
  grain(ctx, cols * cell, rows * cell, 12, makeRng(97));
  const t = toTexture(c, true, false);
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** Грань ящика с бонусом: светлые доски в рамке, посередине жёлтый «?» в красном круге. */
export function itemCrateTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(101);
  const ph = S / 4;
  for (let i = 0; i < 4; i++) {
    const tone = 214 + Math.floor(rng() * 30);
    ctx.fillStyle = `rgb(${tone},${tone - 30},${tone - 82})`;
    ctx.fillRect(0, i * ph, S, ph);
    for (let k = 0; k < 18; k++) {
      ctx.strokeStyle = `rgba(110,62,24,${0.08 + rng() * 0.12})`;
      ctx.beginPath();
      const y = i * ph + rng() * ph;
      ctx.moveTo(0, y);
      for (let x = 0; x <= S; x += 32) ctx.lineTo(x, y + (rng() - 0.5) * 3);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(60,32,12,0.55)';
    ctx.fillRect(0, i * ph, S, 2);
  }
  const f = 22;
  ctx.fillStyle = 'rgba(150,88,36,0.97)';
  ctx.fillRect(0, 0, S, f);
  ctx.fillRect(0, S - f, S, f);
  ctx.fillRect(0, 0, f, S);
  ctx.fillRect(S - f, 0, f, S);
  ctx.strokeStyle = 'rgba(60,32,12,0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(f, f, S - f * 2, S - f * 2);
  // знак
  ctx.fillStyle = '#d23a2a';
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#fff3d6';
  ctx.stroke();
  ctx.font = '900 112px Rubik, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#7a1c12';
  ctx.strokeText('?', S / 2, S / 2 + 6);
  ctx.fillStyle = '#ffd54a';
  ctx.fillText('?', S / 2, S / 2 + 6);
  grain(ctx, S, S, 14, rng);
  return toTexture(c, true, false);
}

/** Жёлто-чёрные полосы «опасность» под 45°, тайлятся (трамплин, его край). */
export function hazardTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = '#f0c020';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#1d1d20';
  for (let k = -2; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(k * 64, 0);
    ctx.lineTo(k * 64 + 32, 0);
    ctx.lineTo(k * 64 + 32 + S, S);
    ctx.lineTo(k * 64 + S, S);
    ctx.closePath();
    ctx.fill();
  }
  grain(ctx, S, S, 16, makeRng(103));
  return toTexture(c);
}

/** Щит-указатель поворота: белые шевроны на красном («>>>» — поворот вправо). */
export function chevronSignTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 128;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#c8302a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f4f0e8';
  for (let k = 0; k < 4; k++) {
    const x = 40 + k * 118;
    ctx.beginPath();
    ctx.moveTo(x, 14);
    ctx.lineTo(x + 34, 14);
    ctx.lineTo(x + 84, H / 2);
    ctx.lineTo(x + 34, H - 14);
    ctx.lineTo(x, H - 14);
    ctx.lineTo(x + 50, H / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = '#f4f0e8';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, W - 6, H - 6);
  grain(ctx, W, H, 14, makeRng(107));
  return toTexture(c, true, false);
}

/** Стопка из трёх покрышек сбоку: u — по кругу, v — снизу вверх. Светлая резина — цвет даёт экземпляр. */
export function tireStackTexture(): THREE.CanvasTexture {
  const W = 64;
  const H = 192;
  const [c, ctx] = canvas(W, H);
  const rng = makeRng(109);
  const band = H / 3;
  for (let i = 0; i < 3; i++) {
    const y = i * band;
    const g = ctx.createLinearGradient(0, y, 0, y + band);
    g.addColorStop(0, '#5a5a5a');
    g.addColorStop(0.18, '#b4b4b4');
    g.addColorStop(0.5, '#d6d6d6');
    g.addColorStop(0.82, '#b4b4b4');
    g.addColorStop(1, '#4a4a4a');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, W, band);
    // протектор
    ctx.fillStyle = 'rgba(40,40,40,0.35)';
    for (let x = 0; x < W; x += 8) ctx.fillRect(x, y + band * 0.3, 3, band * 0.4);
  }
  grain(ctx, W, H, 20, rng);
  return toTexture(c);
}

/** Номер карта: чёрная цифра в белом круге на прозрачном. */
export function kartNumberTexture(n: number): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = '#f6f2ea';
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#1d1d20';
  ctx.stroke();
  ctx.fillStyle = '#1d1d20';
  ctx.font = '900 84px Rubik, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), S / 2, S / 2 + 5);
  return toTexture(c, true, false);
}

/** Пляжный мяч (равнопромежуточная развёртка): шесть долек — красная, жёлтая, синяя через белые — и белые «шапочки». */
export function beachBallTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  const colors = ['#ec4a3f', '#fbf7ee', '#ffc53a', '#fbf7ee', '#2f8ae4', '#fbf7ee'];
  const gw = W / colors.length;
  colors.forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.floor(i * gw), 0, Math.ceil(gw) + 1, H);
  });
  const seam = 'rgba(48, 32, 32, 0.18)';
  ctx.fillStyle = seam;
  for (let i = 0; i < colors.length; i++) ctx.fillRect(Math.round(i * gw) - 1, 0, 2, H);
  // шапочки на полюсах
  const cap = Math.round(H * 0.09);
  ctx.fillStyle = '#fbf7ee';
  ctx.fillRect(0, 0, W, cap);
  ctx.fillRect(0, H - cap, W, cap);
  ctx.fillStyle = seam;
  ctx.fillRect(0, cap - 1, W, 2);
  ctx.fillRect(0, H - cap - 1, W, 2);
  const t = toTexture(c, true, false);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
