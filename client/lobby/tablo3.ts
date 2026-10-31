// Электронные табло у режимов в стиле HUD «Веранда v3» (docs/ui3/brief.md, решение №14): «экран в золотой раме» — тёмная
// слива, кремовые строки, золотые числа и время, статус — плашкой с огоньком цвета смысла. Без свечения, бегущих огней и
// мигания. Общая палитра и формы — client/ui/signs3.ts; здесь — то, что нужно только табло (экран, плашка статуса,
// клавиша-колпачок, строка из кусков разного цвета). Включается вместе с SIGNS3 (?ui3).
import { V3, v3Path, v3Plate } from '../ui/signs3.ts';

/** Цвета смысла для плашки статуса: открыто, идёт, закрыто, тише */
export const TONE = { good: V3.good, live: V3.goldHi, bad: V3.coral, idle: V3.creamDim } as const;
export type Tone = keyof typeof TONE;

/** Толщина золотой каймы экрана по ширине холста (издалека — тонкая, но видная линия) */
export const frameLine = (W: number): number => Math.max(3, Math.round(W * 0.0042));

/**
 * Экран в золотой раме на весь холст: тёмная кромка в скошенных углах, слива с лёгким переходом сверху вниз, одна золотая
 * волосяная кайма; звёздочки в углах — только у крупных табло. Возвращает отступ содержимого от края.
 */
export function v3Screen(ctx: CanvasRenderingContext2D, W: number, H: number, o: { stars?: boolean; cut?: number; fill?: string } = {}): number {
  ctx.fillStyle = V3.ink;
  ctx.fillRect(0, 0, W, H);
  const line = frameLine(W);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, o.fill ?? '#352230');
  g.addColorStop(1, V3.plumDeep);
  v3Plate(ctx, 0, 0, W, H, { cut: o.cut ?? Math.round(Math.min(W, H) * 0.075), line, inset: line * 2.6, fill: g, stars: o.stars });
  return line * 2.6 + line;
}

/** Клавиша-колпачок, как в HUD: кремовая, тёмная буква, тень снизу. Возвращает ширину. */
export function v3Key(ctx: CanvasRenderingContext2D, x: number, cy: number, label: string, px: number): number {
  const h = Math.round(px * 1.12);
  ctx.font = `800 ${Math.round(px * 0.8)}px ${V3.font}`;
  const w = Math.max(h, ctx.measureText(label).width + px * 0.5);
  const r = Math.max(3, px * 0.2);
  const y = cy - h / 2;
  const rr = (yy: number): void => {
    ctx.beginPath();
    ctx.moveTo(x + r, yy); ctx.arcTo(x + w, yy, x + w, yy + h, r); ctx.arcTo(x + w, yy + h, x, yy + h, r);
    ctx.arcTo(x, yy + h, x, yy, r); ctx.arcTo(x, yy, x + w, yy, r); ctx.closePath();
  };
  ctx.fillStyle = V3.ink;
  rr(y + Math.max(2, px * 0.07));
  ctx.fill();
  ctx.fillStyle = V3.cream;
  rr(y);
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, px * 0.04);
  ctx.strokeStyle = V3.ink;
  ctx.stroke();
  ctx.fillStyle = '#3a2230';
  const ta = ctx.textAlign, tb = ctx.textBaseline;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, cy + px * 0.04);
  ctx.textAlign = ta;
  ctx.textBaseline = tb;
  return w;
}

/** Кусок строки: текст своим цветом (и весом), клавиша-колпачок или значок (draw шириной dw кеглей, например монетка) */
export interface Seg {
  t: string;
  c?: string;
  w?: number;
  key?: boolean;
  draw?: (ctx: CanvasRenderingContext2D, x: number, cy: number, px: number) => void;
  dw?: number;
}

function segW(ctx: CanvasRenderingContext2D, s: Seg, px: number, weight: number): number {
  if (s.draw) return (s.dw ?? 1) * px;
  if (s.key) {
    ctx.font = `800 ${Math.round(px * 0.8)}px ${V3.font}`;
    return Math.max(Math.round(px * 1.12), ctx.measureText(s.t).width + px * 0.5) + px * 0.28;
  }
  ctx.font = `${s.w ?? weight} ${px}px ${V3.font}`;
  return ctx.measureText(s.t).width;
}

/**
 * Строка из кусков по вертикальному центру cy: выравнивание от x (left — вправо, right — влево, center — по центру);
 * не влезает в maxW — весь шрифт мельче (не меньше 60 %). Возвращает ширину и размер шрифта.
 */
export function v3Line(ctx: CanvasRenderingContext2D, segs: readonly Seg[], x: number, cy: number, align: CanvasTextAlign, px: number, maxW: number, weight = 700): { w: number; px: number } {
  let size = px;
  let total = segs.reduce((a, s) => a + segW(ctx, s, size, weight), 0);
  if (total > maxW) {
    size = Math.max(Math.floor(px * 0.6), Math.floor((px * maxW) / total));
    total = segs.reduce((a, s) => a + segW(ctx, s, size, weight), 0);
  }
  let cx = align === 'left' || align === 'start' ? x : align === 'center' ? x - total / 2 : x - total;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (const s of segs) {
    const w = segW(ctx, s, size, weight);
    if (s.draw) {
      s.draw(ctx, cx, cy, size);
    } else if (s.key) {
      v3Key(ctx, cx, cy, s.t, size);
    } else {
      ctx.font = `${s.w ?? weight} ${size}px ${V3.font}`;
      ctx.fillStyle = s.c ?? V3.cream;
      ctx.fillText(s.t, cx, cy + size * 0.04);
    }
    cx += w;
  }
  return { w: total, px: size };
}

/**
 * Плашка статуса по центру (cx, cy) или от левого края cx (align 'left'): табличка со скосом, кайма и огонёк слева — цвета смысла (зелёный — открыто,
 * золотой — идёт, красный — закрыто), текст — кремом, числа и время — золотом. Возвращает ширину плашки.
 */
export function v3Status(ctx: CanvasRenderingContext2D, cx: number, cy: number, segs: readonly Seg[], tone: Tone, px: number, maxW: number, align: 'center' | 'left' = 'center'): number {
  const color = TONE[tone];
  const h = Math.round(px * 1.5);
  const dot = px * 0.2;
  const padL = px * 0.5 + dot * 2 + px * 0.36;
  const padR = px * 0.6;
  // сначала мерим текст (с ужатием под ширину)
  let size = px;
  let tw = segs.reduce((a, s) => a + segW(ctx, s, size, 800), 0);
  const room = maxW - padL - padR;
  if (tw > room) {
    size = Math.max(Math.floor(px * 0.6), Math.floor((px * room) / tw));
    tw = segs.reduce((a, s) => a + segW(ctx, s, size, 800), 0);
  }
  const w = Math.min(maxW, tw + padL + padR);
  const x = align === 'left' ? cx : cx - w / 2;
  const y = cy - h / 2;
  const line = Math.max(2.5, px * 0.06);
  v3Path(ctx, x, y, w, h, h * 0.22);
  ctx.fillStyle = V3.plumDeep;
  ctx.fill();
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
  v3Path(ctx, x + line / 2, y + line / 2, w - line, h - line, h * 0.22 - line * 0.3);
  ctx.lineWidth = line;
  ctx.strokeStyle = color;
  ctx.stroke();
  // огонёк: кружок цвета смысла с тёмным ободком (без свечения)
  ctx.beginPath();
  ctx.arc(x + px * 0.5 + dot, cy, dot, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, px * 0.035);
  ctx.strokeStyle = V3.ink;
  ctx.stroke();
  v3Line(ctx, segs, x + padL, cy, 'left', size, tw + 1, 800);
  return w;
}

/** Полоска шашечек внутри рамы (акцент гонок — тонко): клетка size, два ряда, по контуру таблички */
export function v3Checker(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, size: number): void {
  for (let r = 0; r < 2; r++) {
    for (let x = x0, k = 0; x < x1; x += size, k++) {
      ctx.fillStyle = (r + k) % 2 ? V3.creamDim : V3.ink;
      ctx.fillRect(x, y + r * size, Math.min(size, x1 - x), size);
    }
  }
}

/** Медальон с числом (место, номер буя): тёмная слива, золотая кайма, число кремом */
export function v3Medal(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, text: string, opts: { fill?: string; ink?: string; edge?: string } = {}): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = opts.fill ?? V3.plum;
  ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.1);
  ctx.strokeStyle = opts.edge ?? V3.gold;
  ctx.stroke();
  ctx.fillStyle = opts.ink ?? V3.cream;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.round(r * (text.length > 1 ? 1.05 : 1.25))}px ${V3.font}`;
  ctx.fillText(text, cx, cy + r * 0.06);
}

