// Карты рельефа пола «Подземелья» из готовых текстур (make-tiles.mjs): высота — яркость (тёмный шов ниже светлого
// камня), сглаженная на двух масштабах; нормаль — разность высот с заворотом краёв (плитка остаётся бесшовной).
//   node tools/survivors/floor/make-normals.mjs [папка превью]
// Выход: client/assets/dungeon/floor/<биом>_n.jpg, 512 px, R, G — наклон нормали по u, v (0,5 — ровно),
// B — затенение впадин (1 — нет, меньше — шов/трещина темнее). Линейные данные, не цвет.
// Превью <биом>_n-lit.jpg — рельеф под косым светом, для проверки глазами.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = join(ROOT, 'client/assets/dungeon/floor');
const PREV = process.argv[2] ? resolve(process.argv[2]) : null;
const N = 512;
const BIOMES = ['cellars', 'mushrooms', 'crystals', 'mine', 'jam'];
/** Крутизна рельефа по биомам: плиты и камень — выразительнее, земля — мягче */
const STRENGTH = { cellars: 4, mushrooms: 2, crystals: 4, mine: 2.5, jam: 4 };
/** Плиты: вершины камня сплющены (tanh), края крутые — читается кладка, а не шершавая каша */
const PLATE = { cellars: 2.4, mushrooms: 0, crystals: 1.8, mine: 0, jam: 2.4 };
/** Сила затенения впадин */
const CAVITY = { cellars: 2.6, mushrooms: 1.6, crystals: 2.4, mine: 1.8, jam: 2.6 };

const tmp = mkdtempSync(join(tmpdir(), 'dg-floor-n-'));
if (PREV) mkdirSync(PREV, { recursive: true });
const sips = (...a) => execFileSync('sips', a, { stdio: ['ignore', 'ignore', 'inherit'] });

function readBmp(file) {
  const b = readFileSync(file);
  const off = b.readUInt32LE(10);
  const w = b.readInt32LE(18);
  const hRaw = b.readInt32LE(22);
  const bytes = b.readUInt16LE(28) / 8;
  const h = Math.abs(hRaw);
  const stride = Math.ceil((w * bytes) / 4) * 4;
  const lum = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = hRaw < 0 ? y : h - 1 - y;
    for (let x = 0; x < w; x++) {
      const o = off + row * stride + x * bytes;
      lum[y * w + x] = (0.3 * b[o + 2] + 0.59 * b[o + 1] + 0.11 * b[o]) / 255;
    }
  }
  return { w, h, lum };
}

function writeBmp(file, w, h, rgb) {
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
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const o = 54 + y * stride + x * 3;
      b[o] = c(rgb[i + 2]);
      b[o + 1] = c(rgb[i + 1]);
      b[o + 2] = c(rgb[i]);
    }
  }
  writeFileSync(file, b);
}

/** Размытие квадратом радиуса r по обеим осям с заворотом (дважды — почти гаусс) */
function blur(a, n, r) {
  if (r < 1) return a;
  let cur = a;
  for (let pass = 0; pass < 2; pass++) {
    for (const horiz of [true, false]) {
      const out = new Float32Array(n * n);
      for (let t = 0; t < n; t++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += cur[horiz ? t * n + ((k + n) % n) : ((k + n) % n) * n + t];
        for (let p = 0; p < n; p++) {
          out[horiz ? t * n + p : p * n + t] = s / (2 * r + 1);
          const add = (p + r + 1) % n;
          const sub = (p - r + n) % n;
          s += cur[horiz ? t * n + add : add * n + t] - cur[horiz ? t * n + sub : sub * n + t];
        }
      }
      cur = out;
    }
  }
  return cur;
}

for (const b of BIOMES) {
  const bmp = join(tmp, `${b}.bmp`);
  sips('-z', String(N), String(N), '-s', 'format', 'bmp', join(DIR, `${b}.jpg`), '--out', bmp);
  const { lum } = readBmp(bmp);
  // высота: крупные формы (плиты, камни) + немного мелких (трещины, сколы)
  const big = blur(lum, N, 5);
  const small = blur(lum, N, 1);
  const h = new Float32Array(N * N);
  let mean = 0;
  for (let i = 0; i < h.length; i++) mean += (h[i] = 0.9 * big[i] + 0.1 * small[i]);
  mean /= h.length;
  let sd = 0;
  for (let i = 0; i < h.length; i++) sd += (h[i] - mean) ** 2;
  sd = Math.sqrt(sd / h.length) || 1;
  for (let i = 0; i < h.length; i++) {
    h[i] = (h[i] - mean) / sd;
    if (PLATE[b]) h[i] = Math.tanh(h[i] * PLATE[b]) * 1.6;
  }
  // впадины: насколько точка ниже окрестности ~6 % плитки
  const around = blur(h, N, 14);
  const S = STRENGTH[b] / N * 40;
  const out = new Float32Array(N * N * 3);
  const lit = new Float32Array(N * N * 3);
  const L = [-0.45, 0.45, 0.77]; // свет сверху-слева (в осях u, v, вверх)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const at = (xx, yy) => h[((yy + N) % N) * N + ((xx + N) % N)];
      const du = (at(x + 1, y) - at(x - 1, y)) / 2;
      const dv = (at(x, y - 1) - at(x, y + 1)) / 2; // v растёт вверх по картинке (flipY)
      let nx = -du * S * N / 40;
      let ny = -dv * S * N / 40;
      const len = Math.hypot(nx, ny, 1);
      nx /= len;
      ny /= len;
      const nz = 1 / len;
      const cav = Math.max(0, Math.min(1, 1 - Math.max(0, around[y * N + x] - h[y * N + x]) * 0.18 * CAVITY[b]));
      const i = (y * N + x) * 3;
      out[i] = nx * 0.5 + 0.5;
      out[i + 1] = ny * 0.5 + 0.5;
      out[i + 2] = cav;
      const sh = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]) * cav;
      lit[i] = lit[i + 1] = lit[i + 2] = 0.15 + 0.75 * sh;
    }
  }
  const nb = join(tmp, `${b}_n.bmp`);
  writeBmp(nb, N, N, out);
  const jpg = join(DIR, `${b}_n.jpg`);
  sips('-s', 'format', 'jpeg', '-s', 'formatOptions', '88', nb, '--out', jpg);
  if (PREV) {
    const lb = join(tmp, `${b}_lit.bmp`);
    writeBmp(lb, N, N, lit);
    sips('-s', 'format', 'jpeg', '-s', 'formatOptions', '85', lb, '--out', join(PREV, `${b}_n-lit.jpg`));
  }
  console.log(`${b}: ${Math.round(readFileSync(jpg).length / 1024)} КБ`);
}
