// Текстуры нового вида набережной (look v2): фасады города со ставнями, балкончиками и цветами, глиняная черепица,
// кайма мозаики вокруг розы ветров, доски указателя. Всё рисуется на canvas при загрузке — ни одного внешнего файла.
import * as THREE from 'three';
import { makeRng } from '../../shared/math.ts';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, repeat: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, rng: () => number): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const n = (rng() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

const pick = <T>(a: readonly T[], rng: () => number): T => a[Math.floor(rng() * a.length)];

/** Ставни: краска приморских городков */
const SHUTTERS = ['#4f8a55', '#3f8f8c', '#3f72a6', '#7f9450', '#9a6040', '#6aa6c8', '#8fae84', '#2f6f6a'];
const FLOWERS = ['#e8403a', '#f27aa8', '#f6f1e6', '#f7c840', '#b070e0', '#ff7a3c'];
const LEAVES = ['#4f9a3a', '#3f8a36', '#5fae42'];

export interface FacadeTextures {
  map: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
}

/**
 * Фасады города для нового вида: та же раскладка, что у прежних (8 × 8 окон, 3 м на окно и этаж, повтор — 24 м,
 * угол (0, 0) — гладкая стена: им окрашены крыши), но у окон ставни, под частью — балкончики с цветами в горшках или
 * ящики с цветами; светится каждое седьмое окно (день).
 */
export function lookFacadeTextures(): FacadeTextures {
  const S = 512;
  const N = 8;
  const cell = S / N;
  const [c, ctx] = canvas(S, S);
  const [e, ex] = canvas(S, S);
  const rng = makeRng(612);
  ctx.fillStyle = '#f3ede2';
  ctx.fillRect(0, 0, S, S);
  ex.fillStyle = '#000';
  ex.fillRect(0, 0, S, S);
  const warm = ['#ffcf88', '#ffbe6a', '#ffe0ae'];
  for (let i = 0; i < N; i++) {
    // у «столбца» окон свой цвет ставен: соседние дома (разный сдвиг развёртки) — разные
    const shutter = SHUTTERS[i % SHUTTERS.length];
    for (let j = 0; j < N; j++) {
      const x = i * cell;
      const y = j * cell;
      // межэтажный карниз
      ctx.fillStyle = 'rgba(120,100,80,0.18)';
      ctx.fillRect(x, y + cell - 5, cell, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x, y + cell - 7, cell, 2);
      const ww = cell * 0.36;
      const wh = cell * 0.5;
      const wx = x + (cell - ww) / 2;
      const wy = y + cell * 0.2;
      const lit = rng() < 0.14;
      const closed = !lit && rng() < 0.16;
      // стекло и рама
      ctx.fillStyle = '#efe9de';
      ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
      ctx.fillStyle = lit ? '#d9bf8f' : rng() < 0.5 ? '#2c3846' : '#34404e';
      ctx.fillRect(wx, wy, ww, wh);
      if (lit) {
        ex.globalAlpha = 0.5 + rng() * 0.4;
        ex.fillStyle = pick(warm, rng);
        ex.fillRect(wx, wy, ww, wh);
        ex.globalAlpha = 1;
      }
      ctx.fillStyle = 'rgba(239,233,222,0.95)';
      ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      ctx.fillRect(wx, wy + wh * 0.42, ww, 2);
      // ставни: распахнуты по бокам или закрыты
      const sw = ww / 2;
      const slats = (sx: number, sy: number, w: number, h: number) => {
        ctx.fillStyle = shutter;
        ctx.fillRect(sx, sy, w, h);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        for (let k = sy + 3; k < sy + h - 1; k += 3) ctx.fillRect(sx + 1, k, w - 2, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(sx, sy, 1, h);
      };
      if (closed) {
        slats(wx, wy, sw - 0.5, wh);
        slats(wx + sw + 0.5, wy, sw - 0.5, wh);
      } else {
        slats(wx - sw - 3, wy - 1, sw, wh + 2);
        slats(wx + ww + 3, wy - 1, sw, wh + 2);
      }
      // подоконник
      ctx.fillStyle = '#e8dfcf';
      ctx.fillRect(wx - 4, wy + wh + 1, ww + 8, 3);
      const r = rng();
      if (r < 0.2 && j < N - 1) {
        // балкончик: плита, кованая решётка, горшки с цветами
        const bx = x + cell * 0.14;
        const bw = cell * 0.72;
        const by = wy + wh + 4;
        ctx.fillStyle = 'rgba(90,80,72,0.55)';
        ctx.fillRect(bx, by + 9, bw, 3);
        for (let k = 0; k < 4; k++) {
          ctx.fillStyle = pick(LEAVES, rng);
          const px = bx + 4 + rng() * (bw - 10);
          ctx.beginPath();
          ctx.arc(px, by + 3, 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = pick(FLOWERS, rng);
          ctx.beginPath();
          ctx.arc(px + (rng() - 0.5) * 3, by + 1.5, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(40,40,44,0.85)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, by - 2.5, bw - 1, 11);
        for (let k = bx + 4; k < bx + bw - 2; k += 4) {
          ctx.beginPath();
          ctx.moveTo(k + 0.5, by - 2);
          ctx.lineTo(k + 0.5, by + 9);
          ctx.stroke();
        }
      } else if (r < 0.5) {
        // ящик с цветами на подоконнике
        const bx = wx - 2;
        const by = wy + wh + 3;
        ctx.fillStyle = '#8a5a3a';
        ctx.fillRect(bx, by + 2, ww + 4, 4);
        for (let k = 0; k < 6; k++) {
          ctx.fillStyle = pick(LEAVES, rng);
          ctx.beginPath();
          ctx.arc(bx + 2 + rng() * ww, by + 1.5, 2.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = pick(FLOWERS, rng);
          ctx.beginPath();
          ctx.arc(bx + 2 + rng() * ww, by, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  // угол (0, 0) — гладкая стена: им окрашены крыши
  ctx.fillStyle = '#f3ede2';
  ctx.fillRect(0, 0, 6, 6);
  grain(ctx, S, S, 10, rng);
  const map = toTexture(c, true);
  const emissive = toTexture(e, true);
  return { map, emissive };
}

/**
 * Глиняная черепица (желобчатая): ряды полукруглых плиток с тенью под каждым рядом. Светлая — цвет даёт материал.
 * Повтор: 8 плиток поперёк, 7 рядов вдоль ската.
 */
export function lookRoofTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  const rng = makeRng(77);
  ctx.fillStyle = '#9a8a80';
  ctx.fillRect(0, 0, W, H);
  const cols = 8;
  const rows = 7;
  const tw = W / cols;
  const rh = H / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    const off = r % 2 ? tw / 2 : 0;
    for (let k = -1; k <= cols; k++) {
      const x = k * tw + off;
      const v = 0.86 + rng() * 0.2;
      const g = ctx.createLinearGradient(x, 0, x + tw, 0);
      const tone = (a: number) => `rgb(${Math.round(250 * v * a)},${Math.round(226 * v * a)},${Math.round(206 * v * a)})`;
      g.addColorStop(0, tone(0.62));
      g.addColorStop(0.35, tone(1.0));
      g.addColorStop(0.65, tone(0.95));
      g.addColorStop(1, tone(0.6));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x + 1, y + rh);
      ctx.lineTo(x + 1, y + 3);
      ctx.quadraticCurveTo(x + tw / 2, y - 2, x + tw - 1, y + 3);
      ctx.lineTo(x + tw - 1, y + rh);
      ctx.closePath();
      ctx.fill();
    }
    // тень от верхнего ряда
    const sg = ctx.createLinearGradient(0, y, 0, y + rh * 0.35);
    sg.addColorStop(0, 'rgba(40,20,10,0.45)');
    sg.addColorStop(1, 'rgba(40,20,10,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, y, W, rh * 0.35);
  }
  grain(ctx, W, H, 14, rng);
  return toTexture(c, true);
}

/**
 * Кайма вокруг розы ветров (смальта): светлое поле с ромбиками — терракота и синие по очереди, синяя полоса
 * с белыми точками, терракотовый край. Квадрат w × w м, внутри радиуса inner — прозрачно (там сама роза).
 */
export function lookRingTexture(inner: number, outer: number): THREE.CanvasTexture {
  const S = 1024;
  const [c, ctx] = canvas(S, S);
  const rng = makeRng(91);
  const m = S / 2;
  const k = m / outer;
  const R = (meters: number) => meters * k;
  const disk = (r: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(m, m, R(r), 0, Math.PI * 2);
    ctx.fill();
  };
  disk(outer, '#b4532f');
  disk(outer - 0.1, '#2d5d86');
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    ctx.fillStyle = '#f1e9d8';
    ctx.beginPath();
    ctx.arc(m + Math.sin(a) * R(outer - 0.27), m - Math.cos(a) * R(outer - 0.27), R(0.07), 0, Math.PI * 2);
    ctx.fill();
  }
  disk(outer - 0.45, '#ebe1cc');
  // ромбики по кругу
  const n = 28;
  const rr = (inner + outer - 0.45) / 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const cx = m + Math.sin(a) * R(rr);
    const cy = m - Math.cos(a) * R(rr);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillStyle = i % 2 ? '#c8643c' : '#3f78a8';
    const s = R(0.2);
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.7, 0);
    ctx.lineTo(0, s);
    ctx.lineTo(-s * 0.7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  disk(inner + 0.08, '#b4532f');
  // смальта: оттенки квадратиков и светлые швы
  const t = 12;
  for (let y = 0; y < S; y += t) {
    for (let x = 0; x < S; x += t) {
      const v = rng();
      ctx.fillStyle = v < 0.5 ? `rgba(255,250,240,${(0.04 + v * 0.12).toFixed(3)})` : `rgba(40,28,20,${(0.02 + (v - 0.5) * 0.12).toFixed(3)})`;
      ctx.fillRect(x, y, t, t);
    }
  }
  ctx.fillStyle = 'rgba(214,204,186,0.7)';
  for (let q = 0; q < S; q += t) {
    ctx.fillRect(q, 0, 2, S);
    ctx.fillRect(0, q, S, 2);
  }
  // за внешним кругом и внутри (там роза) — прозрачно
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  ctx.arc(m, m, R(outer), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(m, m, R(inner), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  return toTexture(c, false);
}

/** Строки указателя: текст и стрелка вправо или влево. Последняя — без стрелки, табличка снизу. */
export const SIGN_ROWS: ReadonlyArray<readonly [string, number]> = [
  ['Пляж', 1],
  ['Порт', 1],
  ['Город', -1],
  ['Хорошие люди везде ♥', 0],
];

/**
 * Полосы текстуры указателя (сверху вниз): строки SIGN_ROWS, за ними — стрелки для обратной стороны досок (стрелка в
 * другую сторону: сзади доска уходит от столба влево).
 */
export const SIGN_ATLAS: ReadonlyArray<readonly [string, number]> = [...SIGN_ROWS, ...SIGN_ROWS.filter(([, d]) => d !== 0).map(([t, d]) => [t, -d] as const)];

/** Доски указателя: по строке SIGN_ATLAS на полосу текстуры, дерево с краской и резьбой букв. */
export function lookSignpostTexture(): THREE.CanvasTexture {
  const W = 512;
  const RH = 128;
  const [c, ctx] = canvas(W, RH * SIGN_ATLAS.length);
  const rng = makeRng(33);
  SIGN_ATLAS.forEach(([text, dir], i) => {
    const y = i * RH;
    ctx.fillStyle = dir === 0 ? '#e9dcc0' : '#8a5a36';
    ctx.fillRect(0, y, W, RH);
    // волокна дерева
    for (let k = 0; k < 18; k++) {
      ctx.fillStyle = dir === 0 ? 'rgba(120,90,60,0.12)' : 'rgba(40,24,12,0.18)';
      ctx.fillRect(0, y + 6 + rng() * (RH - 12), W, 1 + rng() * 2);
    }
    ctx.strokeStyle = dir === 0 ? '#8a5a36' : 'rgba(30,18,10,0.6)';
    ctx.lineWidth = 6;
    ctx.strokeRect(5, y + 5, W - 10, RH - 10);
    ctx.fillStyle = dir === 0 ? '#5a3a24' : '#f6ecd8';
    const size = dir === 0 ? 46 : 76;
    ctx.font = `${dir === 0 ? 700 : 900} ${size}px Rubik, system-ui, sans-serif`;
    const tw = Math.min(W - 150, ctx.measureText(text).width);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const tx = dir === 0 ? (W - tw) / 2 : dir > 0 ? 40 : W - 40 - tw;
    ctx.fillText(text, tx, y + RH / 2 + 4, W - 150);
    if (dir !== 0) {
      // стрелка
      const ax = dir > 0 ? W - 60 : 60;
      ctx.beginPath();
      ctx.moveTo(ax + dir * 28, y + RH / 2);
      ctx.lineTo(ax - dir * 10, y + RH / 2 - 26);
      ctx.lineTo(ax - dir * 10, y + RH / 2 - 10);
      ctx.lineTo(ax - dir * 40, y + RH / 2 - 10);
      ctx.lineTo(ax - dir * 40, y + RH / 2 + 10);
      ctx.lineTo(ax - dir * 10, y + RH / 2 + 10);
      ctx.lineTo(ax - dir * 10, y + RH / 2 + 26);
      ctx.closePath();
      ctx.fill();
    }
  });
  grain(ctx, W, RH * SIGN_ATLAS.length, 12, rng);
  return toTexture(c, false);
}
