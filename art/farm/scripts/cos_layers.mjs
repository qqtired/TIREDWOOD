// TIREDWOOD, фермерская косметика: слои ткани для шейдера желе (слоты u и l). Запуск: node art/farm/scripts/cos_layers.mjs
// Развёртка (как vObj в шейдере желе, client/render/avatar.ts): u = phi / 2pi, phi = atan2(x, z) в осях тела
// (0 — спина +Z, 0.25 — правый бок +X, 0.5 — лицо -Z, 0.75 — левый бок), v = y / 1.58; верхняя строка PNG — v = 1.
// RGB — цвет ткани (sRGB), A — где ткань (0 — видно желе). Шов развёртки — посередине спины.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../../../client/assets/farm/textures/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const W = 1024, HPX = 512, H = 1.58, TAU = Math.PI * 2, PI = Math.PI;

// ---------------------------------------------------------------- профиль тела (как bodyR в outfit3d.ts)
const P = [[0.001, 0], [0.3, 0], [0.43, 0.07], [0.505, 0.25], [0.525, 0.55], [0.51, 0.84], [0.46, 1.09], [0.37, 1.31], [0.23, 1.49], [0.001, H]];
const cr = (t, p0, p1, p2, p3) => { const v0 = (p2 - p0) * .5, v1 = (p3 - p1) * .5, t2 = t * t, t3 = t * t2; return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1; };
const PTS = [];
for (let i = 0; i <= 28; i++) {
  const t = i / 28, p = (P.length - 1) * t, ip = Math.floor(p), w = p - ip;
  const a = P[ip === 0 ? ip : ip - 1], b = P[ip], c = P[ip > P.length - 2 ? P.length - 1 : ip + 1], d = P[ip > P.length - 3 ? P.length - 1 : ip + 2];
  PTS.push([cr(w, a[0], b[0], c[0], d[0]), cr(w, a[1], b[1], c[1], d[1])]);
}
const bodyR = (y) => { if (y <= 0) return 0.3; for (let i = 1; i < PTS.length; i++) { const a = PTS[i - 1], b = PTS[i]; if (y <= b[1] && b[1] > a[1]) return a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]); } return 0; };

// ---------------------------------------------------------------- помощники
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const fract = (x) => x - Math.floor(x);
const h2 = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
const fbm = (x, y) => noise(x, y) * 0.55 + noise(x * 2.1 + 5.3, y * 2.1 + 1.7) * 0.3 + noise(x * 4.3 + 9.1, y * 4.3 + 3.3) * 0.15;
/** Мягкий край: 1 внутри (d < 0), 0 снаружи; ширина w метров */
const inside = (d, w = 0.003) => 1 - sstep(-w, w, d);
/** Расстояние до отрезка */
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
  const t = clamp((wx * vx + wy * vy) / (vx * vx + vy * vy));
  return Math.hypot(wx - vx * t, wy - vy * t);
}
/** Пятиконечная звезда (знаковое расстояние, приближённо): центр, радиус, поворот */
function starD(px, py, cx, cy, r, rot = 0) {
  const x = px - cx, y = py - cy;
  let a = Math.atan2(x, y) - rot;
  const k = TAU / 5;
  a = ((a % k) + k) % k - k / 2;
  const d = Math.hypot(x, y);
  const rr = r * (0.48 + 0.52 * Math.pow(Math.abs(Math.cos(a * 2.5)), 2.2));
  return d - rr;
}

/** Верх: край у шеи — спереди под ртом (yF), к бокам и спине поднимается до yS. d — угол от лица. */
const topEdge = (d, yF, yS, d0 = 0.42, d1 = 1.35) => yF + (yS - yF) * sstep(d0, d1, d);
const U_BOT = 0.711; // 45 % высоты

// ---------------------------------------------------------------- PNG
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, c]);
}
function png(path, w, h, px, channels) {
  const raw = Buffer.alloc((w * channels + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * channels + 1)] = 0; px.copy(raw, y * (w * channels + 1) + 1, y * w * channels, (y + 1) * w * channels); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = channels === 4 ? 6 : 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

/** Отрисовать слой: fn(ctx) -> [r, g, b, a] (a 0..1); 2 x 2 выборки на пиксель. Возвращает [y_min, y_max] ткани. */
function render(name, fn, glowFn = null) {
  const px = Buffer.alloc(W * HPX * 4);
  const gl = glowFn ? Buffer.alloc(W * HPX) : null;
  let ymin = 9, ymax = -9;
  for (let j = 0; j < HPX; j++) {
    for (let i = 0; i < W; i++) {
      let r = 0, g = 0, b = 0, a = 0, gg = 0;
      for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
        const u = (i + 0.25 + sx * 0.5) / W, v = 1 - (j + 0.25 + sy * 0.5) / HPX;
        const phi = u * TAU, y = v * H, R = bodyR(y);
        const ctx = { phi, y, R, s: (phi - PI) * R, d: Math.abs(phi - PI), u, v };
        const c = fn(ctx);
        const al = clamp(c[3]);
        r += c[0] * al; g += c[1] * al; b += c[2] * al; a += al;
        if (glowFn) gg += clamp(glowFn(ctx));
      }
      const o = (j * W + i) * 4;
      if (a > 0) { px[o] = clamp(r / a, 0, 255); px[o + 1] = clamp(g / a, 0, 255); px[o + 2] = clamp(b / a, 0, 255); }
      px[o + 3] = Math.round(a / 4 * 255);
      if (a > 0.5) { const yy = (1 - (j + 0.5) / HPX) * H; ymin = Math.min(ymin, yy); ymax = Math.max(ymax, yy); }
      if (gl) gl[j * W + i] = Math.round(gg / 4 * 255);
    }
  }
  // цвет под прозрачными пикселями — от ближайшего соседа по строке, чтобы край не темнел на фильтрации
  for (let j = 0; j < HPX; j++) {
    let last = -1;
    for (let i = 0; i < W; i++) { const o = (j * W + i) * 4; if (px[o + 3] > 0) last = o; else if (last >= 0) { px[o] = px[last]; px[o + 1] = px[last + 1]; px[o + 2] = px[last + 2]; } }
  }
  png(OUT + name + '.png', W, HPX, px, 4);
  if (gl) png(OUT + name + '_glow.png', W, HPX, gl, 1);
  return [+ymin.toFixed(3), +ymax.toFixed(3)];
}

// ---------------------------------------------------------------- общие ткани
const jersey = (c, k, x, y) => mul(c, 1 + (noise(x * 160, y * 160) - 0.5) * 0.06 * k + (fbm(x * 9, y * 9) - 0.5) * 0.08 * k);
/** Строчка: пунктир вдоль линии на расстоянии dist (м) от неё */
const stitch = (dist, along, w = 0.0022, dash = 0.012) => inside(Math.abs(dist) - w, 0.0012) * (fract(along / dash) < 0.62 ? 1 : 0);
/** Боковые швы (правый и левый бок): расстояние по дуге */
const sideDist = (c) => Math.min(Math.abs(c.phi - PI / 2), Math.abs(c.phi - 3 * PI / 2)) * c.R;
const backDist = (c) => Math.min(c.phi, TAU - c.phi) * c.R;
const band = (c, y0, y1, w = 0.0025) => clamp(sstep(y0 - w, y0 + w, c.y) * (1 - sstep(y1 - w, y1 + w, c.y)));

const LAYERS = {};

// ---------------------------------------------------------------- u: верх (второй проход: длиннее и выше)
// Полоса u: подол на 17 % высоты, верх — спереди линия под лицом (0.885), к бокам 69 %, на спине 79 %.
const UB = 0.27;
const topU = (d) => 0.885 + 0.195 * sstep(0.55, 1.4, d) + 0.17 * sstep(1.4, 2.8, d);
/** Полуширина распаха спереди у курток (м по дуге): внизу узко, к вороту шире */
const openJ = (y) => 0.03 + 0.1 * sstep(0.3, 0.885, y);
const bandU = (c) => band(c, UB, topU(c.d));
const jacketA = (c) => bandU(c) * sstep(openJ(c.y) - 0.003, openJ(c.y) + 0.003, Math.abs(c.s));
const hemRib = (c, col, k = 0.9, h = 0.03) => (c.y < UB + h ? mul(col, k + 0.06 * (fract(c.s / 0.008) < 0.5 ? 1 : 0)) : col);
/** Тёмная окантовка вдоль распаха (под деталями-бортами) */
const placket = (c, col, k = 0.8) => mix(col, mul(col, k), inside(Math.abs(Math.abs(c.s) - openJ(c.y)) - 0.012, 0.002));

LAYERS.cos_u_workshirt = {
  slot: 'u', roughness: 0.85,
  fn: (c) => {
    const khaki = hex(0x8b8f5a);
    let col = jersey(khaki, 1, c.s, c.y);
    col = hemRib(c, col);
    col = mix(col, mul(khaki, 0.78), inside(sideDist(c) - 0.0025, 0.0015));
    const dirt = sstep(0.62, 0.75, fbm(c.s * 7 + 3, c.y * 7)) * (1 - sstep(UB + 0.04, UB + 0.16, c.y));
    col = mix(col, hex(0x7a6a48), dirt * 0.45);
    return [...col, bandU(c)];
  },
};

LAYERS.cos_u_sprout = {
  slot: 'u', roughness: 0.85,
  fn: (c) => {
    const white = hex(0xf2efe6);
    let col = jersey(white, 0.7, c.s, c.y);
    col = hemRib(c, col, 0.93);
    col = mix(col, mul(white, 0.88), inside(sideDist(c) - 0.0025, 0.0015));
    // принт: росток в глиняном горшке, по центру груди (в 2.2 раза крупнее первого прохода)
    const k = 2.2, x = c.s / k, y = (c.y - 0.6) / k + 0.79, ink = hex(0x4a2c1c);
    const potW = (yy) => (yy < 0.776 ? 0.026 + (yy - 0.728) * 0.28 : 0.044);
    const potD = Math.max(Math.abs(x) - potW(y), 0.728 - y, y - 0.79);
    let pr = null;
    if (potD < 0) pr = y > 0.775 ? hex(0xd8774a) : hex(0xc8643a);
    if (Math.abs(potD) < 0.0016 || (potD < 0 && Math.abs(y - 0.776) < 0.001)) pr = ink;
    if (Math.abs(x) < 0.04 && Math.abs(y - 0.79) < 0.003) pr = hex(0x5a3a22);
    const stem = segDist(x, y, 0, 0.79, 0.004, 0.836);
    if (stem < 0.0032) pr = stem < 0.0022 ? hex(0x5fa03a) : ink;
    for (const sgn of [-1, 1]) {
      const cx = sgn * 0.022, cy = 0.83, ang = sgn * 0.55;
      const lx = (x - cx) * Math.cos(ang) - (y - cy) * Math.sin(ang), ly = (x - cx) * Math.sin(ang) + (y - cy) * Math.cos(ang);
      const e = Math.hypot(lx / 0.022, ly / 0.011) - 1;
      if (e < 0.1) pr = e < 0 ? (ly > 0.002 ? hex(0x9ad65a) : hex(0x7cc04a)) : ink;
    }
    if (pr) col = pr;
    return [...col, bandU(c)];
  },
};

function plaidColor(c) {
  const red = hex(0xa8322a), brown = hex(0x5e3424), cream = hex(0xe8d8b0);
  const s = c.s + 0.5, y = c.y;
  const vx = fract(s / 0.11), vy = fract(y / 0.11);
  const wideX = vx < 0.32, wideY = vy < 0.32;
  let col = red;
  if (wideX && wideY) col = mul(brown, 0.75);
  else if (wideX || wideY) col = mix(red, brown, 0.72);
  if (Math.abs(vx - 0.66) < 0.022 || Math.abs(vy - 0.66) < 0.022) col = mix(col, cream, 0.55);
  return mul(col, 1 + (fract((s + y) / 0.004) < 0.5 ? 0.03 : -0.03) + (noise(s * 90, y * 90) - 0.5) * 0.08);
}

LAYERS.cos_u_plaid = {
  slot: 'u', roughness: 0.9,
  fn: (c) => {
    let col = plaidColor(c);
    col = mix(col, mul(col, 0.8), inside(sideDist(c) - 0.002, 0.0015));
    col = placket(c, hemRib(c, col, 0.86, 0.022), 0.85);
    return [...col, jacketA(c)];
  },
};

LAYERS.cos_u_windbreaker = {
  slot: 'u', roughness: 0.55,
  fn: (c) => {
    const olive = hex(0x6b7a3a), yoke = hex(0x5b6932);
    const yokeY = 1.06 + 0.08 * sstep(1.4, 2.8, c.d);
    let col = c.y > yokeY ? yoke : olive;
    col = mul(col, 1 + (fbm(c.s * 6, c.y * 6) - 0.5) * 0.12 + (noise(c.s * 200, c.y * 200) - 0.5) * 0.03);
    col = mix(col, mul(olive, 0.7), inside(Math.abs(c.y - yokeY) - 0.002, 0.0012));
    col = mix(col, mul(olive, 0.72), inside(sideDist(c) - 0.002, 0.0012));
    col = placket(c, hemRib(c, col, 0.82, 0.035), 0.78);
    return [...col, jacketA(c)];
  },
};

function stars(c) {
  let best = 1;
  const cw = 0.13, ch = 0.085;
  const gx = Math.floor((c.s + 3) / cw), gy = Math.floor(c.y / ch);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const ix = gx + dx, iy = gy + dy;
    const cx = (ix + 0.2 + 0.6 * h2(ix, iy)) * cw - 3, cy = (iy + 0.2 + 0.6 * h2(iy + 7, ix)) * ch;
    if (Math.abs(cx) < openJ(cy) + 0.04) continue;
    const r = 0.011 + 0.008 * h2(ix + 3, iy + 5);
    best = Math.min(best, starD(c.s, c.y, cx, cy, r, h2(ix, iy + 9) * 1.2) / r);
  }
  return best;
}

LAYERS.cos_u_stargardener = {
  slot: 'u', roughness: 0.85,
  fn: (c) => {
    const green = hex(0x2f4a32), honey = hex(0xf2c25a);
    const wale = fract(c.s / 0.007);
    let col = mul(green, 0.9 + 0.2 * Math.sin(wale * PI) + (noise(c.s * 60, c.y * 60) - 0.5) * 0.06);
    col = mix(col, mul(green, 0.7), inside(sideDist(c) - 0.002, 0.0012));
    col = placket(c, hemRib(c, col, 0.85, 0.022), 0.75);
    const st = stars(c);
    if (st < 0.15) col = mix(col, st < 0 ? mul(honey, 1 - 0.12 * (fract((c.s - c.y) / 0.003) < 0.5 ? 1 : 0)) : mul(honey, 0.6), st < 0 ? 1 : 0.6);
    return [...col, jacketA(c)];
  },
  glow: (c) => (jacketA(c) > 0.5 ? 1 - sstep(-0.05, 0.1, stars(c)) : 0),
};

LAYERS.cos_u_sweater = {
  slot: 'u', roughness: 0.95,
  fn: (c) => {
    const oat = hex(0xe6d6b0), gold = hex(0xd9a43a), red = hex(0xc8402f), leaf = hex(0x5f8f34);
    const cx = fract(c.s / 0.022), ry = fract(c.y / 0.016 + (cx < 0.5 ? cx : 1 - cx) * 0.9);
    let col = mul(oat, 0.9 + 0.12 * Math.sin(ry * PI) - 0.1 * (Math.abs(cx - 0.5) < 0.06 ? 1 : 0));
    // полоса узора: колоски и яблоки по кругу, точки сверху и снизу
    const y0 = 0.56, y1 = 0.66;
    if (c.y > y0 && c.y < y1) {
      const cell = 0.1, k = Math.floor((c.s + 3) / cell), lx = fract((c.s + 3) / cell) * cell - cell / 2, ly = c.y - (y0 + y1) / 2;
      if (k % 2 === 0) {
        if (Math.abs(lx) < 0.004 && ly < 0.036 && ly > -0.042) col = mul(gold, 0.85);
        for (let g = 0; g < 4; g++) for (const sgn of [-1, 1]) {
          const qx = lx - sgn * 0.0105, qy = ly - (-0.014 + g * 0.014), an = sgn * 0.6;
          const ex = qx * Math.cos(an) - qy * Math.sin(an), ey = qx * Math.sin(an) + qy * Math.cos(an);
          if (Math.hypot(ex / 0.007, ey / 0.0125) < 1) col = gold;
        }
      } else {
        if (Math.hypot(lx / 0.026, (ly + 0.005) / 0.024) < 1) col = mul(red, 1 - 0.15 * (lx > 0.007 && ly > 0 ? 1 : 0));
        if (Math.abs(lx) < 0.003 && ly > 0.014 && ly < 0.031) col = hex(0x5a3a22);
        if (Math.hypot((lx - 0.012) / 0.012, (ly - 0.029) / 0.006) < 1) col = leaf;
      }
    }
    for (const yy of [y0 - 0.014, y1 + 0.014, 0.8]) if (Math.abs(c.y - yy) < 0.005 && fract(c.s / 0.022) < 0.45) col = leaf;
    if (c.y < UB + 0.05) col = mul(oat, 0.86 + 0.1 * (fract(c.s / 0.012) < 0.5 ? 1 : 0)); // резинка
    return [...col, bandU(c)];
  },
};

LAYERS.cos_u_treevest = {
  slot: 'u', roughness: 0.92,
  fn: (c) => {
    const bark = hex(0x6e4a2c), ridge = hex(0x8c6642), groove = hex(0x3e2a1a);
    const open = 0.05 + Math.max(0, c.y - 0.55) * 0.42;
    const a = bandU(c) * sstep(open - 0.003, open + 0.003, Math.abs(c.s));
    const n = fbm(c.s * 22, c.y * 4.5);
    let col = n > 0.62 ? groove : n > 0.45 ? bark : ridge;
    col = mul(col, 1 + (noise(c.s * 120, c.y * 40) - 0.5) * 0.16);
    const moss = sstep(0.68, 0.8, fbm(c.s * 9 + 11, c.y * 9)) * (1 - sstep(UB, UB + 0.16, c.y));
    col = mix(col, hex(0x6f8a3a), moss * 0.7);
    const edge = Math.min(Math.abs(Math.abs(c.s) - open), Math.abs(c.y - UB));
    col = mix(col, mul(groove, 1.1), inside(edge - 0.01, 0.002));
    return [...col, a];
  },
};

// ---------------------------------------------------------------- l: низ
function denim(c, base) {
  const tw = fract((c.s * 0.9 + c.y) / 0.0055);
  let col = mul(base, 0.93 + 0.12 * (tw < 0.5 ? 1 : 0) + (noise(c.s * 70, c.y * 210) - 0.5) * 0.12);
  // потёртости: светлее спереди внизу и на «коленях»
  const fade = sstep(0.6, 0.85, fbm(c.s * 5, c.y * 3)) * 0.16 + sstep(0.2, 0.0, Math.abs(c.s)) * sstep(0.15, 0.4, c.y) * sstep(0.6, 0.4, c.y) * 0.18;
  return mix(col, hex(0x9fb6d4), fade);
}
const ORANGE = hex(0xe08a2a);

LAYERS.cos_l_jeans = {
  slot: 'l', roughness: 0.85,
  fn: (c) => {
    const a = 1 - sstep(U_BOT - 0.0025, U_BOT + 0.0025, c.y);
    let col = denim(c, hex(0x3e5f8e));
    // пояс
    if (c.y > 0.655) col = mul(denim(c, hex(0x37557f)), 0.95);
    const along = c.s;
    let st = Math.max(stitch(c.y - 0.662, along), stitch(c.y - 0.703, along));
    // боковые швы: двойная строчка
    const sd = sideDist(c);
    st = Math.max(st, stitch(sd - 0.006, c.y), stitch(sd - 0.012, c.y));
    col = mix(col, mul(hex(0x37557f), 0.85), inside(sd - 0.002, 0.001));
    // гульфик: J-строчка правее середины
    const jx = c.s - 0.05;
    if (c.y > 0.5 && c.y < 0.655) st = Math.max(st, stitch(jx, c.y));
    const jr = Math.hypot(c.s - 0.022, c.y - 0.5) - 0.028;
    if (c.y < 0.5 && c.s > 0) st = Math.max(st, stitch(jr, Math.atan2(c.y - 0.5, c.s - 0.022) * 0.028));
    st = Math.max(st, stitch(c.s + 0.001, c.y) * (c.y > 0.47 && c.y < 0.655 ? 1 : 0) * 0);
    // кокетка сзади (V-шов) и подгибка внизу
    const yokeY = 0.6 - 0.18 * backDist(c);
    if (backDist(c) < 0.45) st = Math.max(st, stitch(c.y - yokeY, c.s), stitch(c.y - yokeY + 0.008, c.s));
    st = Math.max(st, stitch(c.y - 0.05, c.s), stitch(c.y - 0.06, c.s));
    col = mix(col, ORANGE, st * 0.95);
    return [...col, a];
  },
};

LAYERS.cos_l_boots = {
  slot: 'l', roughness: 0.22, clearcoat: 1,
  fn: (c) => {
    const yTop = 0.395;
    const a = 1 - sstep(yTop - 0.0025, yTop + 0.0025, c.y);
    const rub = hex(0x2c5a3a);
    let col = mul(rub, 0.86 + 0.14 * sstep(0.0, 0.3, c.y) + (noise(c.s * 40, c.y * 40) - 0.5) * 0.04);
    // заливочный шов сбоку
    col = mix(col, mul(rub, 0.75), inside(sideDist(c) - 0.002, 0.001));
    return [...col, a];
  },
};

LAYERS.cos_l_overalls = {
  slot: 'l', roughness: 0.85,
  fn: (c) => {
    // низ — до пояса, спереди нагрудник до 0.86 со скруглёнными углами
    const bibW = 0.17, bibTop = 0.86, rr = 0.03;
    const qx = Math.abs(c.s) - (bibW - rr), qy = c.y - (bibTop - rr);
    const bibD = (qx > 0 && qy > 0) ? Math.hypot(qx, qy) - rr : Math.max(Math.abs(c.s) - bibW, c.y - bibTop);
    const lowD = c.y - U_BOT;
    const dd = Math.min(lowD, bibD);
    const a = 1 - sstep(-0.0025, 0.0025, dd);
    let col = denim(c, hex(0x4a6e9e));
    let st = stitch(bibD + 0.008, c.s + c.y) * (c.y > 0.69 ? 1 : 0);
    const sd = sideDist(c);
    st = Math.max(st, stitch(sd - 0.006, c.y), stitch(c.y - 0.05, c.s), stitch(c.y - 0.06, c.s));
    // пояс со строчкой (по бокам и сзади; спереди — нагрудник)
    if (Math.abs(c.s) > bibW) {
      if (c.y > 0.665) col = mul(col, 0.93);
      st = Math.max(st, stitch(c.y - 0.67, c.s), stitch(c.y - 0.704, c.s));
    }
    col = mix(col, mul(hex(0x3a5a86), 0.85), inside(sd - 0.002, 0.001));
    col = mix(col, ORANGE, st * 0.95);
    return [...col, a];
  },
};

LAYERS.cos_l_patched = {
  slot: 'l', roughness: 0.9,
  fn: (c) => {
    const a = 1 - sstep(U_BOT - 0.0025, U_BOT + 0.0025, c.y);
    const brown = hex(0x7a5232);
    const wale = fract(c.s / 0.009);
    let col = mul(brown, 0.86 + 0.24 * Math.sin(wale * PI) + (noise(c.s * 50, c.y * 50) - 0.5) * 0.08);
    if (c.y > 0.665) col = mul(col, 0.9);
    let st = Math.max(stitch(c.y - 0.67, c.s, 0.002, 0.016), stitch(c.y - 0.05, c.s, 0.002, 0.016));
    st = Math.max(st, stitch(sideDist(c) - 0.006, c.y, 0.002, 0.016));
    col = mix(col, hex(0xd8b37a), st * 0.8);
    return [...col, a];
  },
};

LAYERS.cos_l_sneakers = {
  slot: 'l', roughness: 0.8,
  fn: (c) => {
    // верх кеда: сзади выше (пятка), спереди — язычок под шнуровкой
    const yTop = 0.27 + 0.05 * sstep(0.6, 2.4, c.d) + 0.02 * (1 - sstep(0.0, 0.07, Math.abs(c.s)));
    const a = 1 - sstep(yTop - 0.0025, yTop + 0.0025, c.y);
    const canvas = hex(0x6fae5a), white = hex(0xf2f0e8);
    let col = mul(canvas, 0.94 + 0.08 * (fract((c.s + c.y) / 0.004) < 0.5 ? 1 : 0) + (noise(c.s * 80, c.y * 80) - 0.5) * 0.06);
    // язычок светлее, носок белый резиновый, пятка — белая заплатка
    if (Math.abs(c.s) < 0.07 && c.y > 0.12) col = mul(col, 1.08);
    const toe = Math.hypot(c.s / 0.22, (c.y - 0.03) / 0.1) - 1;
    if (toe < 0) col = white;
    if (backDist(c) < 0.04 && c.y < yTop) col = white;
    // люверсы под шнуровкой
    for (const yy of [0.13, 0.17, 0.21, 0.25]) for (const sg of [-1, 1]) {
      const e = Math.hypot(c.s - sg * 0.045, c.y - yy);
      if (e < 0.0085) col = e < 0.0045 ? hex(0x2a2a2a) : hex(0xc0c6ca);
    }
    // кант по верху
    col = mix(col, mul(canvas, 0.7), inside(Math.abs(c.y - yTop + 0.012) - 0.006, 0.0015));
    return [...col, a];
  },
};

// ---------------------------------------------------------------- прогон
const only = process.argv.slice(2);
const meta = {};
for (const [name, L] of Object.entries(LAYERS)) {
  if (only.length && !only.some((o) => name.endsWith(o))) continue;
  const t0 = Date.now();
  const yr = render(name, L.fn, L.glow ?? null);
  meta[name.replace(/^cos_(.)_/, '$1:')] = {
    png: `${name}.png`, ...(L.glow ? { glow: `${name}_glow.png` } : {}), roughness: L.roughness,
    ...(L.clearcoat ? { clearcoat: L.clearcoat } : {}), y: yr,
  };
  console.log(name, yr, `${Date.now() - t0}ms`);
}
if (!only.length) {
  writeFileSync(OUT + 'cos_layers.json', JSON.stringify({
    order: ['l', 'u'],
    order_note: 'слои рисуются по порядку: сначала l, поверх u (u закрывает l на 0.27–0.711). Исключение l:overalls — нагрудник (до 0.86) и лямки поверх u. Если надет u, детали l выше 0.27 (шлёвки, карманы, заплатки, отворот сапог) прятать',
    u_band: 'подол 0.27 (17 %); верх: спереди 0.885 (под лицом), бока 1.09 (69 %), спина 1.25 (79 %); у курток распах спереди 0.03–0.13 м',
    uv: 'u = atan2(x, z) / 2pi (0 — спина, 0.5 — лицо), v = y / 1.58 (верх PNG — v = 1); x, y, z — vObj тела до покачивания',
    alpha: 'A — покрытие тканью; цвет RGB — sRGB',
    layers: meta,
  }, null, 1) + '\n');
}
