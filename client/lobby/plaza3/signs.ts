// Вывески и столбы-указатели новой набережной (PLAZA3, WP10, docs/plaza3/tech-foundation.md §5.5): одна система на всю
// площадь. Все щиты — квадры в мировых координатах из layout.json → signs (места и размеры — по якорям моделей), все
// доски столбов S0–S6 — квадры по posts. Рисуются в два холста-атласа, и вся площадь — ДВЕ отрисовки:
//   · атлас заголовков (2048×2048): щит, иконка, название — рисуется один раз, когда загрузились шрифты и иконки; в нём же
//     доски-указатели и белый пиксель для крашеных деталей (столбы, наконечники) — цвет в вершинах;
//   · атлас статусов (1024×1024): строка «идёт заезд · 3 игрока» с точкой на плашке щита — перерисовывается только при смене
//     текста и не чаще двух раз в секунду.
// Материал — MeshBasicMaterial без тонмаппинга (цвета как в UI); лампочки у входов — в самих моделях павильонов (WP9).
import * as THREE from 'three';
import '@fontsource/rubik-mono-one/cyrillic-400.css';
import '@fontsource/rubik-mono-one/latin-400.css';
import '@fontsource/rubik/800.css';
import { P3 } from '../../../shared/plaza3/layout.ts';
import type { LiveIn } from '../plaza/live.ts';
import {
  ATLAS_PAD, DENSITY_MAX, HEAD_SIZE, MIN_ICON_H, MIN_STATUS_H, PLANK, SIGN_COLOR, SIGN_FONT, SIGN_META, STATUS_SIZE, TONE_COLOR,
  contentOf, enamelAt, fitStatus, fitTitle, headItems, monoRun, packAtlas,
  type Atlas, type AtlasItem, type AtlasRect, type Content, type FlagMode, type IconId, type PostPlan, type SignMeta,
} from './signstyle.ts';
import { emptyExtras, signStatus, statusKey, type SignExtras, type SignStatus } from './status.ts';

const PAD = ATLAS_PAD;
/** Зазор плашки статуса над щитом, м (и polygonOffset) */
const STATUS_GAP = 0.008;
const EVAL_EVERY = 0.25;
const UPLOAD_EVERY = 0.5;
/** Свет в сети погас (гроза): вывески тускнеют яркостью, шейдеры не пересобираются */
const DIM = 0.42;

const iconUrl = (f: string): string => new URL(`../../assets/plaza3/icons/${f}.webp`, import.meta.url).href;
const ICON_URL: Readonly<Record<Exclude<IconId, 'ball'>, string>> = {
  paint: iconUrl('paint'), horn: iconUrl('horn'), kart: iconUrl('kart'), 'bell-cloud': iconUrl('bell-cloud'), dungeon: iconUrl('dungeon'),
  'hide-box': iconUrl('hide-box'), boat: iconUrl('boat'), regatta: iconUrl('regatta'), lighthouse: iconUrl('lighthouse'),
  'quest-fish': iconUrl('quest-fish'), rat: iconUrl('rat'), slide: iconUrl('slide'), wardrobe: iconUrl('wardrobe'),
  compass: iconUrl('compass'), token: iconUrl('token'), scroll: iconUrl('scroll'), cards: iconUrl('cards'), music: iconUrl('music'),
  ticket: iconUrl('ticket'), records: iconUrl('records'), online: iconUrl('online'), 'farm-gate': iconUrl('farm-gate'),
};

type V3 = readonly [number, number, number];

interface Sign {
  id: string;
  title: string;
  meta: SignMeta;
  c: V3;
  yaw: number;
  w: number;
  h: number;
  back: V3 | null;
  hasStatus: boolean;
  hasIcon: boolean;
  head: AtlasRect;
  /** Пикселей холста на метр щита */
  sh: number;
  content: Content;
  strip: AtlasRect | null;
  /** Масштаб плашки статуса к щиту (px плашки / px щита) */
  ss: number;
  aAt: number;
  aN: number;
  bAt: number;
  bN: number;
  key: string;
  status: SignStatus | null;
  on: boolean;
}

interface Plank {
  rect: AtlasRect;
  name: string;
  em: number;
}

// ------------------------------------------------------------------------------------------------ геометрия
/** Накопитель квадров и призм одним мешем: позиции, UV в атлас, цвет вершин */
class Quads {
  readonly pos: number[] = [];
  readonly uv: number[] = [];
  readonly col: number[] = [];
  readonly idx: number[] = [];

  get verts(): number {
    return this.pos.length / 3;
  }

  private vert(p: V3, u: number, v: number, c: V3): void {
    this.pos.push(p[0], p[1], p[2]);
    this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2]);
  }

  /** Прямоугольник с центром c, правым вектором r (единичный по горизонтали), высотой h по Y; лицом к n; UV — прямоугольник атласа */
  quad(c: V3, r: V3, w: number, h: number, rect: AtlasRect, size: number, color: V3 = WHITE): void {
    const at = this.verts;
    const hw = w / 2;
    const hh = h / 2;
    const u0 = rect.x / size;
    const u1 = (rect.x + rect.w) / size;
    const vTop = 1 - rect.y / size;
    const vBot = 1 - (rect.y + rect.h) / size;
    this.vert([c[0] - r[0] * hw, c[1] - hh, c[2] - r[2] * hw], u0, vBot, color);
    this.vert([c[0] + r[0] * hw, c[1] - hh, c[2] + r[2] * hw], u1, vBot, color);
    this.vert([c[0] + r[0] * hw, c[1] + hh, c[2] + r[2] * hw], u1, vTop, color);
    this.vert([c[0] - r[0] * hw, c[1] + hh, c[2] - r[2] * hw], u0, vTop, color);
    this.idx.push(at, at + 1, at + 2, at, at + 2, at + 3);
  }

  /** Плоский цвет: четырёхугольник по четырём точкам против часовой (глядя с лица), UV — в белый пиксель */
  flat(a: V3, b: V3, c: V3, d: V3, uv: readonly [number, number], color: V3): void {
    const at = this.verts;
    for (const p of [a, b, c, d]) this.vert(p, uv[0], uv[1], color);
    this.idx.push(at, at + 1, at + 2, at, at + 2, at + 3);
  }

  tri(a: V3, b: V3, c: V3, uv: readonly [number, number], color: V3): void {
    const at = this.verts;
    for (const p of [a, b, c]) this.vert(p, uv[0], uv[1], color);
    this.idx.push(at, at + 1, at + 2);
  }

  /** Брусок по осям мира (оттенок по граням: светлее сверху, темнее снизу) */
  box(cx: number, y0: number, cz: number, sx: number, sy: number, sz: number, color: V3, uv: readonly [number, number]): void {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2, y1 = y0 + sy;
    const sh = (k: number): V3 => [color[0] * k, color[1] * k, color[2] * k];
    this.flat([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], uv, sh(1));
    this.flat([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], uv, sh(0.5));
    this.flat([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], uv, sh(0.9));
    this.flat([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], uv, sh(0.84));
    this.flat([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], uv, sh(0.78));
    this.flat([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], uv, sh(0.72));
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const WHITE: V3 = [1, 1, 1];
const hex = (s: string): V3 => [parseInt(s.slice(1, 3), 16) / 255, parseInt(s.slice(3, 5), 16) / 255, parseInt(s.slice(5, 7), 16) / 255];
const POLE = hex(SIGN_COLOR.pole);
const BAND = hex(SIGN_COLOR.poleBand);
const CORAL = hex(SIGN_COLOR.coral);
const STONE: V3 = [0.78, 0.74, 0.66];

/** Правый вектор щита, смотрящего по yaw (0 — на −Z): глядя на него снаружи, этот вектор — вправо */
const rightOf = (yaw: number): V3 => [-Math.cos(yaw), 0, Math.sin(yaw)];
const normalOf = (yaw: number): V3 => [-Math.sin(yaw), 0, -Math.cos(yaw)];

// ------------------------------------------------------------------------------------------------ рисование
type Ctx = CanvasRenderingContext2D;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/** Заголовок: знаки Rubik Mono One по одному (моноширинный: трекинг и узкий пробел — по токенам); нет шрифта — Rubik 900 */
function drawTitle(ctx: Ctx, text: string, x: number, base: number, em: number, color: string, shadow: string, dy: number, mono: boolean): void {
  for (const pass of [0, 1]) {
    ctx.fillStyle = pass === 0 ? shadow : color;
    const oy = pass === 0 ? dy : 0;
    if (mono) {
      ctx.font = `400 ${em}px ${SIGN_FONT.title}`;
      const run = monoRun(text, em);
      let i = 0;
      for (const ch of text) {
        if (ch !== ' ') ctx.fillText(ch, x + run.xs[i], base + oy);
        i++;
      }
    } else {
      ctx.font = SIGN_FONT.titleFallback.replace('{px}', String(Math.round(em)));
      ctx.fillText(text, x, base + oy);
    }
  }
}

/** Ширина названия: по сетке Mono One или, без шрифта, по измерению Rubik 900 */
function titleWidth(ctx: Ctx, text: string, em: number, mono: boolean): number {
  if (mono) return monoRun(text, em).width;
  ctx.font = SIGN_FONT.titleFallback.replace('{px}', String(Math.round(em)));
  return ctx.measureText(text).width;
}

function drawBall(ctx: Ctx, cx: number, cy: number, r: number): void {
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#5a5560');
  g.addColorStop(0.55, '#1d1a22');
  g.addColorStop(1, '#0b0a0e');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff8e6';
  ctx.beginPath();
  ctx.arc(cx + r * 0.08, cy + r * 0.04, r * 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.38, cy - r * 0.45, r * 0.2, r * 0.11, -0.7, 0, Math.PI * 2);
  ctx.fill();
}

/** Щит: обводка, кант, эмаль с бликом, маркиза; кольцо иконки, иконка и название. Статуса здесь нет (плашка — в другом атласе). */
function drawSignHead(ctx: Ctx, s: Sign, icons: ReadonlyMap<string, HTMLImageElement>, mono: boolean): void {
  const { x, y, w, h } = s.head;
  const c = s.content;
  const f = c.frame;
  ctx.save();
  ctx.translate(x, y);
  // обводка → кант → эмаль
  roundRect(ctx, 0, 0, w, h, f.radius);
  ctx.fillStyle = SIGN_COLOR.outline;
  ctx.fill();
  roundRect(ctx, f.outline, f.outline, w - 2 * f.outline, h - 2 * f.outline, Math.max(1, f.radius - f.outline));
  ctx.fillStyle = SIGN_COLOR.cream;
  ctx.fill();
  const ins = f.outline + f.rim;
  roundRect(ctx, ins, ins, w - 2 * ins, h - 2 * ins, Math.max(1, f.radius - ins));
  const body = ctx.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, SIGN_COLOR.enamelTop);
  body.addColorStop(1, SIGN_COLOR.enamelBottom);
  ctx.fillStyle = body;
  ctx.fill();
  const sheen = ctx.createLinearGradient(0, 0, 0, h * 0.32);
  sheen.addColorStop(0, SIGN_COLOR.sheen);
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fill();
  // маркиза: полосы coral / cream по верхнему краю, прямой низ
  ctx.save();
  roundRect(ctx, f.outline, f.outline, w - 2 * f.outline, h - 2 * f.outline, Math.max(1, f.radius - f.outline));
  ctx.clip();
  for (let sx = 0, k = 0; sx < w; sx += f.stripe, k++) {
    ctx.fillStyle = k % 2 === 0 ? SIGN_COLOR.coral : SIGN_COLOR.cream;
    ctx.fillRect(sx, f.outline, f.stripe + 1, f.awnH);
  }
  ctx.fillStyle = SIGN_COLOR.outline;
  ctx.fillRect(0, f.outline + f.awnH, w, Math.max(1, Math.round(f.outline / 2)));
  ctx.restore();
  // иконка в круге: кольца cream и coral, внутри радиальный фон и картинка
  const ic = c.icon;
  if (ic) {
    const ring = Math.max(2, Math.round(ic.r * 0.07));
    ctx.fillStyle = SIGN_COLOR.cream;
    ctx.beginPath();
    ctx.arc(ic.cx, ic.cy, ic.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SIGN_COLOR.coral;
    ctx.beginPath();
    ctx.arc(ic.cx, ic.cy, ic.r - ring, 0, Math.PI * 2);
    ctx.fill();
    const r = ic.r - 2 * ring;
    const bg = ctx.createRadialGradient(ic.cx - r * 0.3, ic.cy - r * 0.4, r * 0.05, ic.cx, ic.cy, r);
    bg.addColorStop(0, SIGN_COLOR.iconA);
    bg.addColorStop(0.7, SIGN_COLOR.iconB);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(ic.cx, ic.cy, r, 0, Math.PI * 2);
    ctx.fill();
    const id = s.meta.icon;
    if (id === 'ball') drawBall(ctx, ic.cx, ic.cy, r * 0.74);
    else if (id) {
      const img = icons.get(id);
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(ic.cx, ic.cy, r, 0, Math.PI * 2);
        ctx.clip();
        const d = r * 2 * 1.04;
        ctx.drawImage(img, ic.cx - d / 2, ic.cy - d / 2, d, d);
        ctx.restore();
      }
    }
  }
  // название
  const fit = fitTitle(s.title, c.titleEm, c.textW);
  const tw = titleWidth(ctx, fit.text, fit.em, mono);
  const tx = ic ? c.textX : Math.round(c.textX + (c.textW - tw) / 2);
  drawTitle(ctx, fit.text, tx, c.titleBase, fit.em, SIGN_COLOR.text, SIGN_COLOR.outline, Math.max(1, Math.round(fit.em * 0.07)), mono);
  ctx.restore();
}

/** Доска-указатель: эмаль, кремовые полоски сверху и снизу (концы открыты — там наконечник), название по центру */
function drawPlank(ctx: Ctx, p: Plank, mono: boolean): void {
  const { x, y, w, h } = p.rect;
  const rim = Math.max(2, Math.round(h * 0.07));
  ctx.save();
  ctx.translate(x, y);
  const body = ctx.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, SIGN_COLOR.enamelTop);
  body.addColorStop(1, SIGN_COLOR.enamelBottom);
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = SIGN_COLOR.cream;
  ctx.fillRect(0, 0, w, rim);
  ctx.fillRect(0, h - rim, w, rim);
  ctx.fillStyle = SIGN_COLOR.outline;
  ctx.fillRect(0, 0, w, 1);
  ctx.fillRect(0, h - 1, w, 1);
  const name = p.name.toUpperCase();
  const fit = fitTitle(name, p.em, w - 2 * Math.round(h * 0.28));
  const tw = titleWidth(ctx, fit.text, fit.em, mono);
  drawTitle(ctx, fit.text, Math.round((w - tw) / 2), Math.round(h / 2 + fit.em * 0.36), fit.em, SIGN_COLOR.text, SIGN_COLOR.outline, Math.max(1, Math.round(fit.em * 0.07)), mono);
  ctx.restore();
}

/** Плашка статуса: фон — тот же градиент эмали, что на щите (стык не виден), текст Rubik 700 (числа 800) слева, точка справа */
function drawStatus(ctx: Ctx, s: Sign, st: SignStatus): void {
  const strip = s.strip;
  const status = s.content.status;
  if (!strip || !status) return;
  const k = s.ss;
  const z = status.zone;
  const h = s.head.h;
  const x0 = strip.x - PAD / 2;
  const w0 = strip.w + PAD;
  const g = ctx.createLinearGradient(0, strip.y - PAD / 2, 0, strip.y + strip.h + PAD / 2);
  g.addColorStop(0, enamelAt(z.y - PAD / (2 * k), h));
  g.addColorStop(1, enamelAt(z.y + z.h + PAD / (2 * k), h));
  ctx.fillStyle = g;
  ctx.fillRect(x0, strip.y - PAD / 2, w0, strip.h + PAD);
  if (!st.text) return;
  const em = status.em * k;
  const base = strip.y + (status.base - z.y) * k;
  const dot = st.tone === 'none' ? 0 : status.dot.r * k * 2.6;
  const maxW = strip.w - dot;
  ctx.textBaseline = 'alphabetic';
  // кегль подгоняем под ширину (не меньше 60 %), иначе отбрасываем хвост после « · » (signstyle.ts fitStatus)
  const measure = (t: string, size: number): number => {
    let sum = 0;
    for (const part of t.split(/(\d+(?::\d+)*)/)) {
      if (!part) continue;
      ctx.font = `${/^\d/.test(part) ? 800 : 700} ${size}px ${SIGN_FONT.status}`;
      sum += ctx.measureText(part).width;
    }
    return sum;
  };
  const { em: e, text } = fitStatus(st.text, em, maxW, measure);
  let x = strip.x;
  for (const part of text.split(/(\d+(?::\d+)*)/)) {
    if (!part) continue;
    const num = /^\d/.test(part);
    ctx.font = `${num ? 800 : 700} ${e}px ${SIGN_FONT.status}`;
    ctx.fillStyle = num ? SIGN_COLOR.text : SIGN_COLOR.textDim;
    ctx.fillText(part, x, base);
    x += ctx.measureText(part).width;
  }
  if (st.tone !== 'none') {
    const r = status.dot.r * k;
    const cx = strip.x + strip.w - r;
    const cy = strip.y + (status.dot.cy - z.y) * k;
    ctx.fillStyle = SIGN_COLOR.outline;
    ctx.beginPath();
    ctx.arc(cx, cy, r + Math.max(1, r * 0.22), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = TONE_COLOR[st.tone];
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ------------------------------------------------------------------------------------------------ загрузка
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

function canvas(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

// ------------------------------------------------------------------------------------------------ вывески площади
export class Plaza3Signs {
  private readonly signs: Sign[] = [];
  private readonly planks: Plank[] = [];
  private readonly posts: Array<{ id: string; x: number; z: number; plan: PostPlan }> = [];
  private readonly headAtlas: Atlas;
  private statusAtlas: Atlas | null = null;
  private readonly headCanvas = canvas(HEAD_SIZE);
  private readonly statusCanvas = canvas(STATUS_SIZE);
  private readonly headTex: THREE.CanvasTexture;
  private readonly statusTex: THREE.CanvasTexture;
  private readonly matA: THREE.MeshBasicMaterial;
  private readonly matB: THREE.MeshBasicMaterial;
  private readonly meshA: THREE.Mesh;
  private readonly meshB: THREE.Mesh;
  private readonly posA: Float32Array;
  private readonly posB: Float32Array;
  private readonly origA: Float32Array;
  private readonly origB: Float32Array;
  private readonly extras: SignExtras = emptyExtras();
  private readonly flags = new Map<FlagMode, boolean>();
  private ready = false;
  private mono = true;
  private lastEval = -1;
  private lastUpload = -1;
  private uploads = 0;
  private dirty = false;
  private lamps = true;
  private fortLine = '';
  private skyLine = '';

  constructor(scene: THREE.Scene) {
    // --- вывески из раскладки: размер и поворот — из якорей моделей (tools/plaza3/signs.mjs)
    for (const p of P3.signs) {
      const meta = SIGN_META[p.id];
      if (!meta) continue;
      const hasStatus = meta.mode !== 'none' && p.h >= MIN_STATUS_H;
      this.signs.push({
        id: p.id, title: meta.title ?? p.text, meta, c: [p.x, p.y, p.z], yaw: p.yaw, w: p.w, h: p.h, back: p.back ?? null,
        hasStatus, hasIcon: meta.icon !== null && p.h >= MIN_ICON_H,
        head: { id: p.id, x: 0, y: 0, w: 1, h: 1 }, sh: 1, content: contentOf(8, 8, false, false), strip: null, ss: 1,
        aAt: 0, aN: 0, bAt: 0, bN: 0, key: '', status: null, on: !meta.flag,
      });
    }
    // --- доски столбов: длина — по названию
    const { items, plans } = headItems(this.signs, P3.posts);
    P3.posts.forEach((p, i) => this.posts.push({ id: p.id, x: p.x, z: p.z, plan: plans[i] }));
    this.headAtlas = packAtlas(items, HEAD_SIZE, PAD, DENSITY_MAX);
    const rectOf = new Map(this.headAtlas.rects.map((r) => [r.id, r]));
    for (const s of this.signs) {
      s.head = rectOf.get(s.id)!;
      s.sh = s.head.w / s.w;
      s.content = contentOf(s.head.w, s.head.h, s.hasIcon, s.hasStatus);
    }
    for (const p of this.posts) {
      p.plan.planks.forEach((pk, i) => {
        const rect = rectOf.get(`${p.id}.${i}`)!;
        this.planks.push({ rect, name: pk.name, em: pk.em * (rect.h / PLANK.h) });
      });
    }
    // --- плашки статуса: размер зоны в щите → холст
    const stItems: AtlasItem[] = [];
    for (const s of this.signs) {
      const st = s.content.status;
      if (st) stItems.push({ id: s.id, w: st.zone.w / s.sh, h: st.zone.h / s.sh });
    }
    this.statusAtlas = packAtlas(stItems, STATUS_SIZE, PAD, DENSITY_MAX);
    const stRect = new Map(this.statusAtlas.rects.map((r) => [r.id, r]));
    for (const s of this.signs) {
      const r = stRect.get(s.id);
      if (r && s.content.status) {
        s.strip = r;
        s.ss = r.w / s.content.status.zone.w;
      }
    }

    // --- меши
    const white = rectOf.get('_white')!;
    const wuv: [number, number] = [(white.x + white.w / 2) / HEAD_SIZE, 1 - (white.y + white.h / 2) / HEAD_SIZE];
    const A = new Quads();
    const B = new Quads();
    for (const s of this.signs) this.buildSign(A, B, s, wuv);
    for (const p of this.posts) this.buildPost(A, p, wuv, rectOf);
    this.origA = new Float32Array(A.pos);
    this.origB = new Float32Array(B.pos);
    const geoA = A.geometry();
    const geoB = B.geometry();
    this.posA = geoA.getAttribute('position').array as Float32Array;
    this.posB = geoB.getAttribute('position').array as Float32Array;

    this.headTex = this.texture(this.headCanvas);
    this.statusTex = this.texture(this.statusCanvas);
    this.matA = new THREE.MeshBasicMaterial({
      map: this.headTex, vertexColors: true, alphaTest: 0.5, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    this.matB = new THREE.MeshBasicMaterial({
      map: this.statusTex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.meshA = new THREE.Mesh(geoA, this.matA);
    this.meshB = new THREE.Mesh(geoB, this.matB);
    for (const m of [this.meshA, this.meshB]) {
      m.castShadow = false;
      m.receiveShadow = false;
      m.matrixAutoUpdate = false;
      m.visible = false;
      m.renderOrder = 2;
    }
    this.meshA.name = 'plaza3-signs';
    this.meshB.name = 'plaza3-signs-status';
    scene.add(this.meshA, this.meshB);
    for (const s of this.signs) if (!s.on) this.place(s, false);
    void this.load();
  }

  private texture(c: HTMLCanvasElement): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }

  /** Щит и его плашка статуса (и обратные стороны) — в накопители */
  private buildSign(A: Quads, B: Quads, s: Sign, wuv: readonly [number, number]): void {
    const faces: Array<{ c: V3; yaw: number }> = [{ c: s.c, yaw: s.yaw }];
    if (s.back) faces.push({ c: s.back, yaw: s.yaw + Math.PI });
    s.aAt = A.verts;
    s.bAt = B.verts;
    for (const f of faces) {
      const r = rightOf(f.yaw);
      A.quad(f.c, r, s.w, s.h, s.head, HEAD_SIZE);
      if (s.strip && s.content.status) {
        const z = s.content.status.zone;
        const lx = (z.x + z.w / 2 - s.head.w / 2) / s.sh;
        const ly = (s.head.h / 2 - (z.y + z.h / 2)) / s.sh;
        const n = normalOf(f.yaw);
        const c: V3 = [f.c[0] + r[0] * lx + n[0] * STATUS_GAP, f.c[1] + ly, f.c[2] + r[2] * lx + n[2] * STATUS_GAP];
        B.quad(c, r, z.w / s.sh, z.h / s.sh, s.strip, STATUS_SIZE);
      }
    }
    s.aN = A.verts - s.aAt;
    s.bN = B.verts - s.bAt;
    // щит без модели держится на стойках (колесо — порталом, калитка фермы — одной стойкой)
    const mount = s.meta.mount;
    if (mount) {
      const r = rightOf(s.yaw);
      const n = normalOf(s.yaw);
      const bottom = s.c[1] - s.h / 2;
      const post = (k: number, top: number): void => {
        const px = s.c[0] + r[0] * k - n[0] * 0.06;
        const pz = s.c[2] + r[2] * k - n[2] * 0.06;
        A.box(px, 0, pz, 0.12, top, 0.12, POLE, wuv);
        A.box(px, top, pz, 0.18, 0.06, 0.18, BAND, wuv);
      };
      if (mount === 'portal') {
        post(-(s.w / 2 + 0.08), s.c[1] + s.h / 2 + 0.1);
        post(s.w / 2 + 0.08, s.c[1] + s.h / 2 + 0.1);
      } else post(0, bottom);
    }
  }

  /** Столб: цоколь, ствол с кремовыми поясками, коралловый колпак; доски — по стрелкам, текст читается с обеих сторон */
  private buildPost(A: Quads, p: { id: string; x: number; z: number; plan: PostPlan }, wuv: readonly [number, number], rectOf: ReadonlyMap<string, AtlasRect>): void {
    const H = p.plan.height;
    A.box(p.x, 0, p.z, 0.46, 0.14, 0.46, STONE, wuv);
    // ствол 0,2 м: внутри него остаётся цилиндр-заглушка блокаута (r 0,09), его убирает ведущий вместе с regen layout.ts
    A.box(p.x, 0.14, p.z, 0.2, H - 0.14, 0.2, POLE, wuv);
    A.box(p.x, 0.5, p.z, 0.26, 0.06, 0.26, BAND, wuv);
    A.box(p.x, H - 0.06, p.z, 0.26, 0.06, 0.26, BAND, wuv);
    // колпак — четырёхгранная пирамида
    const t: V3 = [p.x, H + 0.26, p.z];
    const q = 0.14;
    const base: V3[] = [[p.x - q, H, p.z - q], [p.x + q, H, p.z - q], [p.x + q, H, p.z + q], [p.x - q, H, p.z + q]];
    for (let i = 0; i < 4; i++) A.tri(base[(i + 1) % 4], base[i], t, wuv, CORAL);
    const planks = p.plan.planks;
    planks.forEach((pk, i) => {
      const rect = rectOf.get(`${p.id}.${i}`)!;
      const [dx, dz] = pk.dir;
      const d: V3 = [dx, 0, dz];
      const nR: V3 = [-dz, 0, dx];
      const start = 0.1 + 0.01;
      const cx = p.x + dx * (start + pk.w / 2);
      const cz = p.z + dz * (start + pk.w / 2);
      const half = 0.02;
      // тело доски — тонкий брусок, лицо с названием — с обеих сторон; наконечник — кремовый клин
      this.plankBody(A, cx, pk.y, cz, d, pk.w, PLANK.h, half, wuv);
      A.quad([cx + nR[0] * (half + 0.003), pk.y, cz + nR[2] * (half + 0.003)], d, pk.w, PLANK.h, rect, HEAD_SIZE);
      A.quad([cx - nR[0] * (half + 0.003), pk.y, cz - nR[2] * (half + 0.003)], [-d[0], 0, -d[2]], pk.w, PLANK.h, rect, HEAD_SIZE);
      const ex = p.x + dx * (start + pk.w);
      const ez = p.z + dz * (start + pk.w);
      const tipX = ex + dx * PLANK.tip;
      const tipZ = ez + dz * PLANK.tip;
      const hh = PLANK.h / 2;
      const P = (px: number, py: number, pz: number, k: number): V3 => [px + nR[0] * k, py, pz + nR[2] * k];
      const top0 = P(ex, pk.y + hh, ez, half);
      const bot0 = P(ex, pk.y - hh, ez, half);
      const top1 = P(ex, pk.y + hh, ez, -half);
      const bot1 = P(ex, pk.y - hh, ez, -half);
      const tipF = P(tipX, pk.y, tipZ, half);
      const tipB = P(tipX, pk.y, tipZ, -half);
      A.tri(bot0, tipF, top0, wuv, BAND);
      A.tri(bot1, top1, tipB, wuv, BAND);
      A.flat(top0, tipF, tipB, top1, wuv, [BAND[0] * 0.95, BAND[1] * 0.95, BAND[2] * 0.95]);
      A.flat(bot1, tipB, tipF, bot0, wuv, [BAND[0] * 0.7, BAND[1] * 0.7, BAND[2] * 0.7]);
    });
  }

  private plankBody(A: Quads, cx: number, cy: number, cz: number, d: V3, w: number, h: number, half: number, wuv: readonly [number, number]): void {
    const nR: V3 = [-d[2], 0, d[0]];
    const hw = w / 2;
    const hh = h / 2;
    const at = (a: number, b: number, k: number): V3 => [cx + d[0] * a + nR[0] * k, cy + b, cz + d[2] * a + nR[2] * k];
    const col: V3 = [0.05, 0.32, 0.3];
    A.flat(at(-hw, hh, half), at(hw, hh, half), at(hw, hh, -half), at(-hw, hh, -half), wuv, col);
    A.flat(at(-hw, -hh, -half), at(hw, -hh, -half), at(hw, -hh, half), at(-hw, -hh, half), wuv, [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6]);
    A.flat(at(-hw, -hh, half), at(-hw, hh, half), at(-hw, hh, -half), at(-hw, -hh, -half), wuv, col);
  }

  /** Показать/спрятать вывеску: квадры схлопываются в точку (без пересборки мешей и шейдеров) */
  private place(s: Sign, on: boolean): void {
    s.on = on;
    const put = (pos: Float32Array, orig: Float32Array, at: number, n: number): void => {
      for (let i = 0; i < n; i++) {
        const o = (at + i) * 3;
        if (on) {
          pos[o] = orig[o];
          pos[o + 1] = orig[o + 1];
          pos[o + 2] = orig[o + 2];
        } else {
          pos[o] = s.c[0];
          pos[o + 1] = s.c[1];
          pos[o + 2] = s.c[2];
        }
      }
    };
    put(this.posA, this.origA, s.aAt, s.aN);
    put(this.posB, this.origB, s.bAt, s.bN);
    this.meshA.geometry.getAttribute('position').needsUpdate = true;
    this.meshB.geometry.getAttribute('position').needsUpdate = true;
  }

  /** Шрифты и иконки → рисуем атлас заголовков и плашки статусов → показываем */
  private async load(): Promise<void> {
    const fonts = typeof document !== 'undefined' ? document.fonts : null;
    if (fonts) {
      await withTimeout(Promise.all([
        fonts.load(`400 64px ${SIGN_FONT.title}`, 'АБВГДЕЖабвгде0123'),
        fonts.load(`700 40px ${SIGN_FONT.status}`, 'Аб7'),
        fonts.load(`800 40px ${SIGN_FONT.status}`, 'Аб7'),
      ]), 6000).catch(() => null);
      this.mono = fonts.check(`400 40px ${SIGN_FONT.title}`, 'АБВ');
    }
    const icons = new Map<string, HTMLImageElement>();
    const ids = new Set<string>();
    for (const s of this.signs) if (s.hasIcon && s.meta.icon && s.meta.icon !== 'ball') ids.add(s.meta.icon);
    await withTimeout(Promise.all([...ids].map(async (id) => {
      const img = await loadImage(ICON_URL[id as Exclude<IconId, 'ball'>]);
      if (img) icons.set(id, img);
    })), 6000);
    this.drawHeads(icons);
    this.ready = true;
    this.dirty = true;
    this.meshA.visible = true;
    // иконка, не успевшая за 6 с, дорисуется, когда придёт (раз)
    for (const id of ids) {
      if (icons.has(id)) continue;
      void loadImage(ICON_URL[id as Exclude<IconId, 'ball'>]).then((img) => {
        if (!img) return;
        icons.set(id, img);
        this.drawHeads(icons);
      });
    }
  }

  private drawHeads(icons: ReadonlyMap<string, HTMLImageElement>): void {
    const ctx = this.headCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, HEAD_SIZE, HEAD_SIZE);
    ctx.textBaseline = 'alphabetic';
    const w = this.headAtlas.rects.find((r) => r.id === '_white')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(w.x, w.y, w.w, w.h);
    for (const s of this.signs) drawSignHead(ctx, s, icons, this.mono);
    for (const p of this.planks) drawPlank(ctx, p, this.mono);
    this.headTex.needsUpdate = true;
  }

  /** Режим за флагом сервера включён или выключен: его вывески видны, только пока включён */
  setMode(mode: FlagMode, on: boolean): void {
    if (this.flags.get(mode) === on) return;
    this.flags.set(mode, on);
    for (const s of this.signs) if (s.meta.flag === mode && s.on !== on) this.place(s, on);
  }

  setFortLine(line: string): void {
    this.fortLine = line;
  }

  setSkyLine(line: string): void {
    this.skyLine = line;
  }

  /** То, чего нет в LiveIn: занятые автоматы и рекорд «Подземелья» */
  setExtras(x: Partial<SignExtras>): void {
    if (x.slots !== undefined) this.extras.slots = x.slots;
    if (x.dungeon !== undefined) this.extras.dungeon = x.dungeon;
  }

  /** Кадр: пересчёт статусов 4 раза в секунду, перерисовка плашек — при смене текста и не чаще двух раз в секунду */
  update(time: number, live: LiveIn, lampsOn: boolean): void {
    if (!this.ready) return;
    if (lampsOn !== this.lamps) {
      this.lamps = lampsOn;
      const k = lampsOn ? 1 : DIM;
      this.matA.color.setScalar(k);
      this.matB.color.setScalar(k);
    }
    if (time < this.lastEval || time - this.lastEval >= EVAL_EVERY) {
      this.lastEval = time;
      for (const s of this.signs) {
        if (!s.hasStatus || !s.strip) continue;
        const st = signStatus(s.meta.mode, live, this.extras);
        const key = statusKey(st);
        if (key !== s.key) {
          s.key = key;
          s.status = st;
          this.dirty = true;
        }
      }
    }
    if (this.dirty && (time < this.lastUpload || time - this.lastUpload >= UPLOAD_EVERY)) {
      this.lastUpload = time;
      this.dirty = false;
      const ctx = this.statusCanvas.getContext('2d')!;
      for (const s of this.signs) {
        if (s.status && s.strip) {
          drawStatus(ctx, s, s.status);
          s.status = null;
        }
      }
      this.statusTex.needsUpdate = true;
      this.meshB.visible = true;
      this.uploads++;
    }
  }

  debug(): Record<string, unknown> {
    return {
      signs: this.signs.length,
      shown: this.signs.filter((s) => s.on).length,
      planks: this.planks.length,
      ready: this.ready,
      mono: this.mono,
      uploads: this.uploads,
      head: { size: HEAD_SIZE, density: Math.round(this.headAtlas.density), fill: +this.headAtlas.fill.toFixed(2) },
      status: this.statusAtlas ? { size: STATUS_SIZE, density: Math.round(this.statusAtlas.density), fill: +this.statusAtlas.fill.toFixed(2) } : null,
      lines: [this.fortLine, this.skyLine],
    };
  }
}
