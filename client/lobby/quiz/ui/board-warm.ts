// Табло «Разминки с Затейником» («Ракушка» 1.1, F3): шаг idle, один сидящий. Вопрос и тема из встроенных паков «Своей игры»,
// «верно 3 из 5», после вопроса — ответ. Жетонов разминка не даёт — табло их и не обещает. Только canvas 2D, как board-riddle.ts.
import type { QzBoard } from '../../../../shared/quiz/types.ts';
import { PAD, centerText, eyebrow, timeBar } from './board-base.ts';
import { C, TEXT, clip, confetti, fit, font, rr, title, wrap } from './paint.ts';

/** Вопрос разминки на всё табло, под ним — время; после вопроса — ответ крупно и «ВЕРНО!» / «НЕ УГАДАЛ» */
export function paintWarmBoard(ctx: CanvasRenderingContext2D, b: QzBoard, nowMs: number, W: number, H: number): void {
  const w = b.warm!;
  title(ctx, 'РАЗМИНКА', PAD, 104, 80, C.cream, 'left', 6);
  ctx.save();
  ctx.font = font(800, 58);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.creamDim;
  ctx.fillText(clip(ctx, `${w.who.nick} · верно ${w.ok} из ${w.num}`, 1160), W - PAD, 108);
  ctx.restore();
  const left = Math.max(0, (w.endsAt - nowMs) / 1000);
  const bar = (): void => { if (w.total > 0) timeBar(ctx, (w.endsAt - nowMs) / w.total, w.step === 'q' && left <= 5, W, H); };
  if (w.step === 'q') {
    eyebrow(ctx, w.theme || 'Вопрос', W / 2, 232, C.goldText, 46, 'center');
    question(ctx, w.q, 520, 5, W);
    centerText(ctx, `${Math.ceil(left)} с`, W / 2, 850, 64, left <= 5 ? C.coral : C.goldText);
    bar();
    return;
  }
  // ответ: вопрос меньше и тусклее, ниже — верно / нет и сам ответ
  const ok = !!w.last?.ok;
  if (ok) confetti(ctx, W, H, nowMs, 60, 7);
  eyebrow(ctx, w.theme || 'Вопрос', W / 2, 220, C.goldText, 40, 'center');
  question(ctx, w.q, 350, 3, W, 60, C.creamDim);
  title(ctx, ok ? 'ВЕРНО!' : 'НЕ УГАДАЛ', W / 2, 600, 92, ok ? C.gold : C.coral, 'center', 7);
  const answer = w.last?.answer ?? '';
  if (answer) {
    ctx.save();
    const px = fit(ctx, answer, 800, 120, W - PAD * 2 - 240, TEXT, 56);
    ctx.font = font(800, px);
    const bw = Math.min(W - PAD * 2, Math.max(760, ctx.measureText(answer).width + 200)), bx = (W - bw) / 2, by = 690, bh = 190;
    rr(ctx, bx, by + 10, bw, bh, 40);
    ctx.fillStyle = C.ink;
    ctx.fill();
    rr(ctx, bx, by, bw, bh, 40);
    ctx.fillStyle = ok ? C.cream : C.cream2;
    ctx.fill();
    if (ok) { ctx.lineWidth = 10; ctx.strokeStyle = C.gold; ctx.stroke(); }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.enamelSolid;
    ctx.fillText(clip(ctx, answer, bw - 80), W / 2, by + bh / 2 + 4);
    ctx.restore();
  }
  bar();
}

/** Текст вопроса по центру в несколько строк: кегль по длине, не больше maxLines строк */
function question(ctx: CanvasRenderingContext2D, text: string, cy: number, maxLines: number, W: number, px0 = 0, color: string = C.cream): void {
  ctx.save();
  const px = px0 || (text.length > 110 ? 68 : text.length > 70 ? 78 : 92);
  ctx.font = font(800, px);
  const lines = wrap(ctx, text, W - PAD * 2 - 140, maxLines);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  const lh = Math.round(px * 1.22);
  lines.forEach((l, i) => ctx.fillText(l, W / 2, cy + (i - (lines.length - 1) / 2) * lh));
  ctx.restore();
}
