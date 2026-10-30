// Таблички пультов «Своей игры»: одна текстура-атлас 1024 × 768 на шесть табличек (меш plate_faces в quiz_venue.glb).
// Клетка пульта i — QUIZ_VENUE.pults[i].plateCell = [x, y, w, h] в пикселях от левого верхнего угла атласа (venue-data.json,
// pultPlate.atlas). Только счёт крупно: ник — над головой игрока в мире. Перенос lab/quiz/v2/js/world/boards-more.js (paintPlate).
import type { QzBoard, QzJpPlayer } from '../../../../shared/quiz/types.ts';
import { QUIZ_VENUE } from '../../../../shared/quiz/venue.ts';
import { C, TEXT, fit, font, rr } from './paint.ts';

export const PLATES_W = 1024;
export const PLATES_H = 768;

/** Что показывает одна табличка; null — пульт свободен */
export interface PlateState {
  score: number;
  /** его ход (золотая рамка) */
  turn: boolean;
  /** отвечает (табличка золотая) */
  lit: boolean;
  /** мой пульт (толстая золотая рамка — видно с телекамеры) */
  own: boolean;
  /** отошёл (счёт держится 2 минуты) */
  away: boolean;
}

/** Табличка в клетке (x, y, w, h) атласа */
export function paintPlate(ctx: CanvasRenderingContext2D, p: PlateState | null, x: number, y: number, W: number, H: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  ctx.clearRect(0, 0, W, H);
  const k = W / 512;
  rr(ctx, 6 * k, 6 * k, W - 12 * k, H - 12 * k, 26 * k);
  ctx.fillStyle = !p ? 'rgba(14, 85, 80, .75)' : p.lit ? C.gold : C.enamelSolid;
  ctx.fill();
  // мой пульт — толстая золотая рамка; ход — золотая рамка потоньше
  ctx.lineWidth = (p?.own ? 30 : p?.turn ? 16 : 8) * k;
  ctx.strokeStyle = p?.turn || p?.own ? C.gold : 'rgba(243, 230, 201, .6)';
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (!p) {
    ctx.font = font(800, 90 * k);
    ctx.fillStyle = 'rgba(255, 244, 220, .35)';
    ctx.fillText('—', W / 2, H / 2 + 4 * k);
  } else {
    const txt = p.away ? 'отошёл' : p.score.toLocaleString('ru-RU');
    ctx.font = font(800, fit(ctx, txt, 800, 150 * k, W - 60 * k, TEXT, 60 * k));
    ctx.fillStyle = p.lit ? C.goldInk : p.score < 0 ? C.badText : C.goldText;
    ctx.fillText(txt, W / 2, H / 2 + 8 * k);
  }
  ctx.restore();
}

/** Все шесть табличек в атлас: по игрокам табло (jp.players[].pult); mySlot — чей пульт «мой» (0 — ничей) */
export function paintPlates(ctx: CanvasRenderingContext2D, b: QzBoard | null, nowMs: number, mySlot = 0): void {
  ctx.clearRect(0, 0, PLATES_W, PLATES_H);
  const jp = b?.phase === 'game' ? (b.jp ?? null) : null;
  QUIZ_VENUE.pults.forEach((pult, i) => {
    const [x, y, w, h] = pult.plateCell;
    const p: QzJpPlayer | undefined = jp?.players.find((q) => q.pult === i);
    paintPlate(ctx, p && jp ? {
      score: p.score,
      turn: jp.turn === p.slot,
      lit: jp.buzz?.slot === p.slot,
      own: mySlot > 0 && p.slot === mySlot,
      away: p.away > nowMs,
    } : null, x, y, w, h);
  });
}
