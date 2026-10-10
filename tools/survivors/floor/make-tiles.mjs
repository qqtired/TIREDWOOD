// Текстуры пола «Подземелья»: исходники Codex image_gen (PNG ~1254 px) → бесшовные JPEG 1024 px
// в client/assets/dungeon/floor/ + превью «плитка 3 × 3» для проверки повтора.
//   node tools/survivors/floor/make-tiles.mjs <папка с исходниками> <папка превью>
// В папке исходников — <биом>.png (cellars, mushrooms, crystals, mine, jam).
// Конвертация — системным `sips` (PNG ↔ BMP ↔ JPEG), пиксели — здесь, без пакетов.
// Шов: тонкую линию на стыке смягчаем размытием ±4 px поперёк стыка. Если край совсем не сходится с противоположным (разрыв заметно больше обычной разницы соседних пикселей),
// картинку смешиваем с её копией, сдвинутой на полразмера, по полосе у края (сначала по x, потом по y — так оба
// края бесшовные). Codex 10.10.2026 дал бесшовные плитки сразу — смешивание не понадобилось (NOFIX=1 — не смешивать).
// В конце печатает средний цвет каждой текстуры (линейный) — он нужен шейдеру пола (world.ts, FLOOR_TEX).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = resolve(process.argv[2] ?? '.');
const PREV = resolve(process.argv[3] ?? join(SRC, 'preview'));
const OUT = join(ROOT, 'client/assets/dungeon/floor');
const N = 1024;
const BAND = 160; // полоса смешивания у края, px
const QUALITY = Number(process.env.Q ?? 80);
const BIOMES = ['cellars', 'mushrooms', 'crystals', 'mine', 'jam'];

const tmp = mkdtempSync(join(tmpdir(), 'dg-floor-'));
mkdirSync(OUT, { recursive: true });
mkdirSync(PREV, { recursive: true });

const sips = (...a) => execFileSync('sips', a, { stdio: ['ignore', 'ignore', 'inherit'] });

function readBmp(file) {
  const b = readFileSync(file);
  const off = b.readUInt32LE(10);
  const w = b.readInt32LE(18);
  const hRaw = b.readInt32LE(22);
  const bpp = b.readUInt16LE(28);
  const h = Math.abs(hRaw);
  const bytes = bpp / 8;
  const stride = Math.ceil((w * bytes) / 4) * 4;
  const px = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const row = hRaw < 0 ? y : h - 1 - y;
    for (let x = 0; x < w; x++) {
      const o = off + row * stride + x * bytes;
      const i = (y * w + x) * 3;
      px[i] = b[o + 2] / 255;
      px[i + 1] = b[o + 1] / 255;
      px[i + 2] = b[o] / 255;
    }
  }
  return { w, h, px };
}

function writeBmp(file, img) {
  const { w, h, px } = img;
  const stride = Math.ceil((w * 3) / 4) * 4;
  const b = Buffer.alloc(54 + stride * h);
  b.write('BM', 0);
  b.writeUInt32LE(b.length, 2);
  b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18);
  b.writeInt32LE(-h, 22);
  b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28);
  b.writeUInt32LE(stride * h, 34);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const o = 54 + y * stride + x * 3;
      const c = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
      b[o] = c(px[i + 2]);
      b[o + 1] = c(px[i + 1]);
      b[o + 2] = c(px[i]);
    }
  }
  writeFileSync(file, b);
}

const lum = (px, i) => 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];

/** Разрыв на краю против обычной разницы соседних столбцов (axis 0) или строк (axis 1) */
function seam(img, axis) {
  const { w, h, px } = img;
  let edge = 0;
  let inner = 0;
  let k = 0;
  const n = axis === 0 ? h : w;
  const m = axis === 0 ? w : h;
  const at = (a, b) => (axis === 0 ? (b * w + a) * 3 : (a * w + b) * 3);
  for (let t = 0; t < n; t++) {
    edge += Math.abs(lum(px, at(0, t)) - lum(px, at(m - 1, t)));
    for (let s = 0; s < m - 1; s += 7) {
      inner += Math.abs(lum(px, at(s, t)) - lum(px, at(s + 1, t)));
      k++;
    }
  }
  return edge / n / (inner / k);
}

/** Площадное уменьшение до n × n с заворотом краёв (у sips края «прижаты», и стык плитки портится) */
function resize(img, n) {
  const pass = (src, w, h, horiz) => {
    const len = horiz ? w : h;
    const k = len / n;
    const ow = horiz ? n : w;
    const oh = horiz ? h : n;
    const out = new Float32Array(ow * oh * 3);
    for (let a = 0; a < (horiz ? h : w); a++) {
      for (let o = 0; o < n; o++) {
        const x0 = o * k;
        const x1 = x0 + k;
        const acc = [0, 0, 0];
        for (let x = Math.floor(x0); x < x1; x++) {
          const wgt = Math.min(x + 1, x1) - Math.max(x, x0);
          const xx = ((x % len) + len) % len;
          const i = (horiz ? a * w + xx : xx * w + a) * 3;
          for (let c = 0; c < 3; c++) acc[c] += src[i + c] * wgt;
        }
        const j = (horiz ? a * ow + o : o * ow + a) * 3;
        for (let c = 0; c < 3; c++) out[j + c] = acc[c] / k;
      }
    }
    return out;
  };
  const h1 = pass(img.px, img.w, img.h, true);
  return { w: n, h: n, px: pass(h1, n, img.h, false) };
}

/** Тонкая линия на стыке (край картинки генератора чуть светлее/темнее): размыть ±R px поперёк стыка
 *  с заворотом, сила спадает от стыка. Двойного рисунка нет — это просто мягкий шов в 2–3 px. */
function feather(img, axis, R = 4) {
  const { w, h, px } = img;
  const out = new Float32Array(px);
  const len = axis === 0 ? w : h;
  const at = (a, t) => (axis === 0 ? (t * w + ((a + w) % w)) * 3 : ((((a + h) % h) * w + t) * 3));
  for (let t = 0; t < (axis === 0 ? h : w); t++) {
    for (let d = -R; d < R; d++) {
      const a = (d + len) % len;
      const k = 1 - (Math.abs(d + 0.5) - 0.5) / R;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let q = -2; q <= 2; q++) sum += px[at(a + q, t) + c];
        const i = at(a, t) + c;
        out[i] = px[i] + (sum / 5 - px[i]) * k;
      }
    }
  }
  return { w, h, px: out };
}

/** Смешать с копией, сдвинутой на полразмера по оси, в полосе BAND у краёв этой оси */
function fixAxis(img, axis) {
  const { w, h, px } = img;
  const out = new Float32Array(px.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const sx = axis === 0 ? (x + w / 2) % w : x;
      const sy = axis === 1 ? (y + h / 2) % h : y;
      const j = (sy * w + sx) * 3;
      const d = axis === 0 ? Math.min(x, w - 1 - x) : Math.min(y, h - 1 - y);
      let m = 1 - Math.min(1, d / BAND);
      m = m * m * (3 - 2 * m);
      for (let c = 0; c < 3; c++) out[i + c] = px[i + c] * (1 - m) + px[j + c] * m;
    }
  }
  return { w, h, px: out };
}

/** Плитка 3 × 3 в половинном размере */
function grid3(img) {
  const { w, h, px } = img;
  const hw = w / 2;
  const hh = h / 2;
  const W = hw * 3;
  const H = hh * 3;
  const o = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = (x % hw) * 2;
      const sy = (y % hh) * 2;
      for (let c = 0; c < 3; c++) {
        o[(y * W + x) * 3 + c] =
          (px[(sy * w + sx) * 3 + c] + px[(sy * w + sx + 1) * 3 + c] + px[((sy + 1) * w + sx) * 3 + c] + px[((sy + 1) * w + sx + 1) * 3 + c]) / 4;
      }
    }
  }
  return { w: W, h: H, px: o };
}

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

const means = {};
for (const b of BIOMES) {
  const src = join(SRC, `${b}.png`);
  if (!existsSync(src)) {
    console.log(`${b}: нет ${src}`);
    continue;
  }
  const bmp = join(tmp, `${b}.bmp`);
  sips('-s', 'format', 'bmp', src, '--out', bmp);
  let img = resize(readBmp(bmp), N);
  const sx0 = seam(img, 0);
  const sy0 = seam(img, 1);
  if (!process.env.NOFIX && sx0 > 3) img = fixAxis(img, 0);
  if (!process.env.NOFIX && sy0 > 3) img = fixAxis(img, 1);
  img = feather(feather(img, 0), 1);
  const sx1 = seam(img, 0);
  const sy1 = seam(img, 1);
  writeBmp(bmp, img);
  const jpg = join(OUT, `${b}.jpg`);
  sips('-s', 'format', 'jpeg', '-s', 'formatOptions', String(QUALITY), bmp, '--out', jpg);
  const g = join(tmp, `${b}-3x3.bmp`);
  writeBmp(g, grid3(img));
  sips('-s', 'format', 'jpeg', '-s', 'formatOptions', '80', g, '--out', join(PREV, `${b}-3x3.jpg`));
  let r = 0;
  let gg = 0;
  let bb = 0;
  const n = img.w * img.h;
  for (let i = 0; i < n * 3; i += 3) {
    r += toLin(img.px[i]);
    gg += toLin(img.px[i + 1]);
    bb += toLin(img.px[i + 2]);
  }
  means[b] = [r / n, gg / n, bb / n].map((v) => Number(v.toFixed(4)));
  const kb = Math.round(readFileSync(jpg).length / 1024);
  console.log(`${b}: шов x ${sx0.toFixed(2)} → ${sx1.toFixed(2)}, y ${sy0.toFixed(2)} → ${sy1.toFixed(2)}; ${kb} КБ; средний (лин.) ${means[b].join(', ')}`);
}
console.log(JSON.stringify(means));
