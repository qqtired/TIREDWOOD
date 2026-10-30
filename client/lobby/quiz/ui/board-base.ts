// Табло «Ракушки»: общее для всех экранов — размеры, фон (эмаль, кремовая кайма, маркиза), полоска времени, пилюля,
// шапка режима. Перенос lab/quiz/v2/js/world/board.js. Читается с 20+ м: заголовки — Rubik Mono One 64–120,
// текст — Rubik 800 не меньше 40. Только canvas 2D, без DOM.
import { C, awning, clip, enamel, font, icon, rr, title, type Pic } from './paint.ts';

export const BOARD_W = 2048;
export const BOARD_H = 1024;
export const PAD = 70;

/** Что сейчас подсвечено мышью на табло и что дорисовать поверх. Ставит интегратор (луч → карточка / клетка / пак), табло читает при
 *  перерисовке: card — карточка режима 0–3, cell — клетка «Своей игры» [тема, цена], pack — пак 0–2 (−1 / null — ничего);
 *  drawing — рисунок «Крокодила» (холст мольберта), его табло дублирует в своей рамке */
export const boardUi: { card: number; cell: [number, number] | null; pack: number; drawing: CanvasImageSource | null } = {
  card: -1, cell: null, pack: -1, drawing: null,
};

/** Фон табло: эмаль, кремовая кайма, маркиза сверху */
export function boardBase(ctx: CanvasRenderingContext2D, W = BOARD_W, H = BOARD_H): void {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = C.deep;
  ctx.fillRect(0, 0, W, H);
  enamel(ctx, 8, 8, W - 16, H - 16, 30);
  ctx.save();
  rr(ctx, 8, 8, W - 16, H - 16, 30);
  ctx.clip();
  awning(ctx, 8, 8, W - 16, 22, 44);
  ctx.restore();
  ctx.save();
  rr(ctx, 18, 18, W - 36, H - 36, 24);
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(243, 230, 201, .55)';
  ctx.stroke();
  ctx.restore();
}

/** Тонкая полоска времени у нижнего края — для зрителей (у стоящих спиной к табло время ещё и кольцом в плашке) */
export function timeBar(ctx: CanvasRenderingContext2D, frac: number, hurry: boolean, W = BOARD_W, H = BOARD_H, y = H - 64, h = 18): void {
  const x = PAD, w = W - PAD * 2;
  ctx.save();
  rr(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = C.track;
  ctx.fill();
  const fw = Math.max(h, w * Math.max(0, Math.min(1, frac)));
  rr(ctx, x, y, fw, h, h / 2);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, hurry ? C.badHi : C.goldHi);
  g.addColorStop(1, hurry ? C.bad : C.gold);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/** Подпись раздела: капсом, с разрядкой, как .k-eyebrow; возвращает ширину */
export function eyebrow(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string = C.goldText, px = 36, align: CanvasTextAlign = 'left'): number {
  ctx.save();
  ctx.font = font(800, px);
  ctx.letterSpacing = '4px';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  const up = text.toUpperCase();
  ctx.fillText(up, x, y);
  const w = ctx.measureText(up).width;
  ctx.restore();
  return w;
}

export interface PillOpts {
  fill?: string;
  ink?: string;
  px?: number;
  img?: Pic;
  align?: 'left' | 'right';
}

/** Пилюля на табло: крем, тёмный текст (категория, «Осталась минута!»); возвращает ширину */
export function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, h: number, o: PillOpts = {}): number {
  const { fill = C.cream, ink = C.ink, px = 42, img = null, align = 'left' } = o;
  ctx.save();
  ctx.font = font(800, px);
  const tw = ctx.measureText(text).width;
  const iw = img ? h * 0.9 : 0;
  const w = tw + h * 0.9 + iw;
  const x0 = align === 'right' ? x - w : x;
  rr(ctx, x0, y + 5, w, h, h / 2);
  ctx.fillStyle = C.ink;
  ctx.fill();
  rr(ctx, x0, y, w, h, h / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (img) icon(ctx, img, x0 + h * 0.45 + iw / 2 - 4, y + h / 2, h * 0.78);
  ctx.fillStyle = ink;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, x0 + h * 0.45 + iw, y + h / 2 + 2);
  ctx.restore();
  return w;
}

/** Шапка режима: название вывеской слева, справа (по желанию) строка поменьше */
export function head(ctx: CanvasRenderingContext2D, name: string, right: string, W = BOARD_W): void {
  title(ctx, name, PAD, 104, 70, C.cream, 'left', 5);
  if (right) {
    ctx.save();
    ctx.font = font(700, 44);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.creamDim;
    ctx.fillText(clip(ctx, right, 1100), W - PAD, 106);
    ctx.restore();
  }
}

/** Крупная строка по центру (подпись шага): px — кегль, color — цвет, weight — вес */
export function centerText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color: string = C.cream, maxW = BOARD_W - PAD * 2, weight = 800): void {
  ctx.save();
  ctx.font = font(weight, px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(clip(ctx, text, maxW), x, y);
  ctx.restore();
}
