// Краска на экране картингиста (в него попали из бонуса «краска»): густые кляксы с брызгами и подтёками почти на весь
// экран. Рисунки клякс готовятся один раз; на попадание — один холст во весь экран (один слой — телефону легко),
// а подтёки — отдельными полосками, они растут вниз (race/hud.ts, CSS .rc-splat и .rc-drip).
import { makeRng } from '../../shared/math.ts';

const TAU = Math.PI * 2;
/** Сторона рисунка кляксы, px; тело — чуть выше середины (CY), под ним место для подтёков */
const S = 640;
const CX = 320;
const CY = 290;
/** Радиус тела кляксы, px рисунка; по вертикали тело чуть сплюснуто */
const R = 168;
const FLAT = 0.88;
/** Дальше этого от середины (px рисунка) край не уходит — иначе пальцы обрежет край холста; длинные пальцы
 *  с KNEE плавно поджимаются, оставаясь острыми */
const MAX_R = 296;
const KNEE = 210;
/** Точек на краю: «пальцы» брызг узкие, нужен частый шаг */
const EDGE_N = 360;
/** Разных клякс */
const KINDS = 3;
/** Цвет краски и кайма */
const PINK = '#ff3fb0';
const RIM = '#a30a6c';

interface Kind {
  canvas: HTMLCanvasElement;
  /** Край тела: радиус (px рисунка) по углу, EDGE_N точек, угол 0 — вправо, по часовой (y вниз) */
  edge: Float32Array;
}

let kinds: Kind[] | null = null;

/**
 * Край кляксы как радиус по углу: неровный круг (несколько гармоник) и острые «пальцы» брызг — узкие выступы
 * в разные стороны, разной длины; пальцами вниз не тянемся — там текут подтёки.
 */
function edgeOf(rng: () => number): Float32Array {
  const harm: Array<[number, number, number]> = [];
  for (let k = 2; k <= 7; k++) harm.push([k, (0.035 + rng() * 0.05) * (3 / k), rng() * TAU]);
  const fingers: Array<[number, number, number]> = [];
  const n = 6 + Math.floor(rng() * 5);
  for (let i = 0; i < n; i++) {
    let a = rng() * TAU;
    // низ (угол около π/2) — место подтёков: палец оттуда — вбок (наверх нельзя: два пальца сверху — «ушки»)
    if (Math.abs(a - Math.PI / 2) < 0.5) a += a < Math.PI / 2 ? -0.9 : 0.9;
    fingers.push([a, 0.35 + rng() * rng() * 1.1, 0.035 + rng() * 0.05]);
  }
  const edge = new Float32Array(EDGE_N);
  for (let i = 0; i < EDGE_N; i++) {
    const a = (i / EDGE_N) * TAU;
    let r = 1;
    for (const [k, amp, ph] of harm) r += amp * Math.sin(k * a + ph);
    for (const [fa, len, w] of fingers) {
      let d = Math.abs(a - fa) % TAU;
      if (d > Math.PI) d = TAU - d;
      r += len * Math.exp(-((d / w) ** 2));
    }
    const e = r * R;
    edge[i] = e <= KNEE ? e : KNEE + (MAX_R - KNEE) * Math.tanh((e - KNEE) / (MAX_R - KNEE));
  }
  return edge;
}

function edgePoint(edge: Float32Array, i: number): [number, number] {
  const a = (i / EDGE_N) * TAU;
  return [CX + Math.cos(a) * edge[i], CY + Math.sin(a) * edge[i] * FLAT];
}

function edgePath(ctx: CanvasRenderingContext2D, edge: Float32Array): void {
  ctx.beginPath();
  for (let i = 0; i < EDGE_N; i++) {
    const [x, y] = edgePoint(edge, i);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Клякса: неровное пятно с пальцами брызг, капли на их продолжении и вокруг, короткие подтёки вниз; тёмная кайма,
 *  светлее слева сверху, мокрые блики. */
function splatKind(seed: number): Kind {
  const rng = makeRng(seed);
  const edge = edgeOf(rng);
  const drops: Array<[number, number, number, number, number]> = [];
  // капли: на продолжении длинных пальцев и вразброс вокруг, вытянуты от середины
  for (let i = 0; i < EDGE_N; i++) {
    const prev = edge[(i + EDGE_N - 1) % EDGE_N];
    const next = edge[(i + 1) % EDGE_N];
    if (edge[i] < R * 1.45 || edge[i] < prev || edge[i] < next) continue;
    const a = (i / EDGE_N) * TAU;
    let d = edge[i] + R * (0.08 + rng() * 0.1);
    let r = R * (0.035 + rng() * 0.03);
    for (let k = 0; k < 3 && r > 2; k++) {
      if (d + r * 1.3 > MAX_R + 12) break;
      drops.push([CX + Math.cos(a) * d, CY + Math.sin(a) * d * FLAT, r * 1.3, r, a]);
      d += r * 2.4 + R * rng() * 0.12;
      r *= 0.6;
    }
  }
  for (let i = 0; i < 26; i++) {
    const a = rng() * TAU;
    const d = Math.min(R * (1.15 + rng() * 0.75), MAX_R - 6);
    const r = 1.6 + rng() * rng() * R * 0.07;
    drops.push([CX + Math.cos(a) * d, CY + Math.sin(a) * d * FLAT, r * (1 + rng()), r, a]);
  }
  const drips: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 3; i++) {
    const idx = Math.round(((Math.PI / 2 + (rng() - 0.5) * 1.1) / TAU) * EDGE_N) % EDGE_N;
    const [x, y] = edgePoint(edge, idx);
    const w = R * (0.06 + rng() * 0.06);
    drips.push([x, y - w * 1.5, w, R * (0.18 + rng() * 0.3)]);
  }
  const shape = (ctx: CanvasRenderingContext2D, grow: number): void => {
    edgePath(ctx, edge);
    ctx.fill();
    if (grow) ctx.stroke();
    for (const [x, y, rx, ry, a] of drops) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx + grow, ry + grow, a, 0, TAU);
      ctx.fill();
    }
    for (const [x, y, w, len] of drips) {
      ctx.beginPath();
      ctx.roundRect(x - w / 2 - grow, y, w + grow * 2, len + grow, w / 2 + grow);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y + len - w * 0.25, w * 0.7 + grow, 0, TAU);
      ctx.fill();
    }
  };

  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  // кайма — отдельным холстом и с тенью разом
  const rim = document.createElement('canvas');
  rim.width = rim.height = S;
  const rctx = rim.getContext('2d')!;
  rctx.fillStyle = rctx.strokeStyle = RIM;
  rctx.lineWidth = 6;
  rctx.lineJoin = 'round';
  shape(rctx, 3);
  ctx.save();
  ctx.shadowColor = 'rgba(60, 0, 36, 0.4)';
  ctx.shadowBlur = 12;
  ctx.drawImage(rim, 0, 0);
  ctx.restore();
  const g = ctx.createRadialGradient(CX - R * 0.4, CY - R * 0.45, R * 0.1, CX, CY, R * 1.9);
  g.addColorStop(0, '#ff7ccd');
  g.addColorStop(0.4, PINK);
  g.addColorStop(1, '#f42ea6');
  ctx.fillStyle = g;
  shape(ctx, 0);
  // мокрые блики: длинный мягкий на теле и маленький рядом
  ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
  ctx.beginPath();
  ctx.ellipse(CX - R * 0.3, CY - R * 0.38, R * 0.24, R * 0.075, -0.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  ctx.ellipse(CX + R * 0.12, CY - R * 0.5, R * 0.07, R * 0.03, -0.5, 0, TAU);
  ctx.fill();
  return { canvas: c, edge };
}

/** Нарисовать кляксы заранее (при входе в гонку), чтобы попадание не подтормаживало */
export function preparePaint(): void {
  kinds ??= Array.from({ length: KINDS }, (_, k) => splatKind(53 + k * 29));
}

/** Где пустить подтёк: css px экрана, delay — мс */
export interface Drip {
  x: number;
  y: number;
  w: number;
  h: number;
  delay: number;
}

/**
 * Краска на экран w×h (css px): по краям — розовая плёнка, сверху кляксы по сетке с разбросом (3×2 лёжа, 2×3 стоя) —
 * ложатся по всему экрану, а не кучей, и почти сходятся; в просветах между ними дорогу чуть видно.
 * dpr — во сколько раз холст плотнее css px. Возвращает холст и где пустить подтёки (с нижнего края клякс).
 */
export function paintScreen(w: number, h: number, dpr: number, rng: () => number = Math.random): { canvas: HTMLCanvasElement; drips: Drip[] } {
  preparePaint();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const film = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.2, w / 2, h * 0.55, Math.hypot(w, h) * 0.6);
  film.addColorStop(0, 'rgba(255, 63, 176, 0.1)');
  film.addColorStop(1, 'rgba(196, 16, 128, 0.5)');
  ctx.fillStyle = film;
  ctx.fillRect(0, 0, w, h);

  const cols = w >= h ? 3 : 2;
  const rows = w >= h ? 2 : 3;
  const cw = w / cols;
  const ch = h / rows;
  const drips: Drip[] = [];
  const splat = (cx: number, cy: number, size: number, drip: boolean): void => {
    const kind = kinds![Math.floor(rng() * KINDS)];
    const flip = rng() < 0.5 ? -1 : 1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(flip, 1);
    ctx.drawImage(kind.canvas, -size / 2, -size / 2, size, size);
    ctx.restore();
    if (!drip) return;
    // подтёки — с нижнего края тела (угол около π/2), начало чуть выше края: вытекает из-под кляксы
    const k = size / S;
    const n = 1 + Math.floor(rng() * 2.6);
    for (let i = 0; i < n; i++) {
      const idx = Math.round(((Math.PI / 2 + (rng() - 0.5) * 1.2) / TAU) * EDGE_N) % EDGE_N;
      const [ex, ey] = edgePoint(kind.edge, idx);
      const dw = size * (0.034 + rng() * 0.024);
      drips.push({
        x: cx + flip * (ex - S / 2) * k - dw / 2,
        y: cy + (ey - S / 2) * k - dw * 1.4,
        w: dw,
        h: size * (0.22 + rng() * 0.28),
        delay: Math.round(rng() * 300),
      });
    }
  };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const cx = (i + 0.5 + (rng() - 0.5) * 0.4) * cw;
      const cy = (j + 0.5 + (rng() - 0.5) * 0.4) * ch;
      splat(cx, cy, Math.max(cw, ch) * (1.45 + rng() * 0.3), true);
    }
  }
  // и пара поменьше — в случайные места: просветы получаются неровными
  for (let i = 0; i < 2; i++) splat(rng() * w, rng() * h, Math.max(cw, ch) * (0.7 + rng() * 0.35), false);
  return { canvas, drips };
}
