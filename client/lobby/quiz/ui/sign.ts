// Вывеска над аркой «Ракушки» (холст 1024 × 256): «РАКУШКА» и строка статуса — как на табло, по qzBoard.
// Текст статуса считает та же функция, что и афиша кафе (plaza3/status.ts, quizSignLine): «Игры нет — заходи»,
// «Голосуем · 0:14», «Загадка · 2:31 · 5 игроков», «Итоги · Загадка» — без эмодзи, до 34 знаков.
// Перенос lab/quiz/v2/js/world/board.js (paintSign).
import type { QzBoard } from '../../../../shared/quiz/types.ts';
import { quizSignLine } from '../../plaza3/status.ts';
import { C, TEXT, enamel, fit, font, rr, title } from './paint.ts';

/** Нарисовать вывеску; nowMs — часы сервера. Золотая строка — «идёт сейчас», кремовая — «можно зайти» */
export function paintSign(ctx: CanvasRenderingContext2D, b: QzBoard | null, nowMs: number): void {
  const W = ctx.canvas?.width || 1024;
  const H = ctx.canvas?.height || 256;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = C.deep;
  ctx.fillRect(0, 0, W, H);
  enamel(ctx, 6, 6, W - 12, H - 12, 22);
  ctx.save();
  rr(ctx, 14, 14, W - 28, H - 28, 18);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(243, 230, 201, .6)';
  ctx.stroke();
  ctx.restore();
  title(ctx, 'РАКУШКА', W / 2, 104, 92, C.cream, 'center', 6);
  const st = quizSignLine(b, nowMs);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(800, fit(ctx, st.text, 800, 52, W - 80, TEXT, 30));
  ctx.fillStyle = st.tone === 'go' ? C.goldText : C.creamDim;
  ctx.fillText(st.text, W / 2, 196);
  ctx.restore();
}
