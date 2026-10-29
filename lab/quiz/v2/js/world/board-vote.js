// Табло «Во что играем?» — общий шаг перед любым режимом «Ракушки».
// Четыре карточки режимов (значок, имя, счёт, цветные точки проголосовавших), полоска времени;
// итог — победитель крупно, остальные гаснут; ничья — короткая рулетка между равными.
import { BOARD_H, BOARD_W, PAD, boardBase, timeBar } from './board.js';
import { C, DISPLAY, badge, clip, confetti, fit, font, rr, title } from './paint.js';

const CW = (BOARD_W - PAD * 2 - 36 * 3) / 4, CY = 196, CH = 640;
const cardX = (i) => PAD + i * (CW + 36);
const ease = (k) => 1 - (1 - k) ** 3;

/**
 * s: { phase: 'idle' | 'vote' | 'spin' | 'win', left, total, voted, players,
 *      games: [{ name, img, n, dots: [color], off: 'от 3 игроков' | null }], spin: индекс, win: индекс, winAt: мс }
 */
export function paintVote(ctx, s, t = 0) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  boardBase(ctx, W, H);
  if (s.phase === 'idle') return idle(ctx, s, W, H);
  const head = s.phase === 'spin' ? 'НИЧЬЯ!' : s.phase === 'win' ? 'ИГРАЕМ!' : 'ВО ЧТО ИГРАЕМ?';
  title(ctx, head, PAD, 104, 80, s.phase === 'spin' ? C.gold : C.cream, 'left', 6);
  ctx.save();
  ctx.font = font(800, 62);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.creamDim;
  const right = s.phase === 'vote' ? `голосов ${s.voted} из ${s.players}` : '';
  if (right) ctx.fillText(right, W - PAD, 108);
  ctx.restore();
  const max = Math.max(1, ...s.games.map((g) => (g.off ? 0 : g.n)));
  s.games.forEach((g, i) => {
    let dim = 0, hot = false;
    if (s.phase === 'vote') hot = !g.off && g.n === max && s.voted > 0;
    if (s.phase === 'spin') { dim = s.tied?.includes(i) ? 0 : 0.75; hot = s.spin === i; }
    if (s.phase === 'win') { if (i === s.win) return; dim = 0.8; }
    card(ctx, g, cardX(i), CY, CW, CH, { dim, hot, num: i + 1, t });
  });
  if (s.phase === 'win') winner(ctx, s, t, W, H);
  if (s.phase === 'vote') timeBar(ctx, s.left / s.total, s.left <= 5, W, H);
}

function card(ctx, g, x, y, w, h, { dim = 0, hot = false, num, t, big = false }) {
  const k = big ? 1.55 : 1;
  ctx.save();
  ctx.globalAlpha = 1 - dim;
  rr(ctx, x, y + 9, w, h, 34);
  ctx.fillStyle = C.ink;
  ctx.fill();
  rr(ctx, x, y, w, h, 34);
  ctx.fillStyle = g.off ? 'rgba(255, 244, 220, .32)' : C.cream;
  ctx.fill();
  if (hot) {
    ctx.lineWidth = 14;
    ctx.strokeStyle = big ? C.gold : `rgba(255, 205, 74, ${0.75 + 0.25 * Math.sin(t / 160)})`;
    ctx.stroke();
  }
  // номер клавиши
  if (num) {
    ctx.beginPath(); ctx.arc(x + 54, y + 54, 34, 0, Math.PI * 2);
    ctx.fillStyle = g.off ? 'rgba(10, 59, 55, .25)' : C.gold; ctx.fill();
    ctx.font = font(800, 44); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = g.off ? C.cream : C.goldInk; ctx.fillText(String(num), x + 54, y + 57);
  }
  ctx.globalAlpha = (1 - dim) * (g.off ? 0.45 : 1);
  badge(ctx, g.img, x + w / 2, y + 170 * k, 112 * k, g.off ? '#d9d4cc' : C.cream2, C.ink);
  ctx.globalAlpha = 1 - dim;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const px = fit(ctx, g.name, 800, 70 * k, w - 50, undefined, 40);
  ctx.font = font(800, px);
  ctx.fillStyle = g.off ? C.cream : C.plateInk;
  ctx.fillText(g.name, x + w / 2, y + 350 * k);
  if (g.off) {
    ctx.font = font(700, 54);
    ctx.fillStyle = C.cream;
    ctx.fillText(clip(ctx, g.off, w - 40), x + w / 2, y + 470);
  } else if (!big) {
    ctx.font = font(400, 128, DISPLAY);
    ctx.fillStyle = g.n ? C.enamelSolid : 'rgba(14, 85, 80, .28)';
    ctx.fillText(String(g.n), x + w / 2, y + 476);
    dots(ctx, g.dots, x + w / 2, y + 580, w - 60);
  }
  ctx.restore();
}

/** Цветные точки проголосовавших: по цвету ника, в один-два ряда */
function dots(ctx, list, cx, cy, maxW) {
  if (!list?.length) return;
  const r = 20, step = 52, per = Math.max(1, Math.floor(maxW / step));
  list.slice(0, per * 2).forEach((col, i) => {
    const row = Math.floor(i / per), inRow = Math.min(per, list.length - row * per);
    const x = cx - ((inRow - 1) * step) / 2 + (i % per) * step, y = cy + row * 50 - (list.length > per ? 25 : 0);
    ctx.beginPath(); ctx.arc(x, y + 4, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(10, 59, 55, .35)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#ffffff'; ctx.stroke();
  });
}

/** Победитель вырастает из своей карточки в центр */
function winner(ctx, s, t, W, H) {
  const g = s.games[s.win];
  if (!g) return;
  confetti(ctx, W, H, t, 110, 5);
  const k = ease(Math.min(1, Math.max(0, (t - (s.winAt ?? 0)) / 600)));
  const bw = 1060, bh = 720, fx = cardX(s.win), tx = (W - bw) / 2;
  const x = fx + (tx - fx) * k, y = CY + (150 - CY) * k, w = CW + (bw - CW) * k, h = CH + (bh - CH) * k;
  ctx.save();
  rr(ctx, x, y + 12, w, h, 44); ctx.fillStyle = C.ink; ctx.fill();
  rr(ctx, x, y, w, h, 44); ctx.fillStyle = C.cream; ctx.fill();
  ctx.lineWidth = 14; ctx.strokeStyle = C.gold; ctx.stroke();
  ctx.globalAlpha = k;
  badge(ctx, g.img, x + w / 2, y + 210, 160, C.cream2, C.ink);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const px = fit(ctx, g.name.toUpperCase(), 400, 112, w - 120, DISPLAY, 60);
  ctx.font = font(400, px, DISPLAY);
  ctx.fillStyle = C.enamelSolid;
  ctx.fillText(g.name.toUpperCase(), x + w / 2, y + 470);
  ctx.font = font(800, 62);
  ctx.fillStyle = C.plateDim;
  ctx.fillText(s.sub ?? `${g.n} ${plural(g.n)}`, x + w / 2, y + 598);
  ctx.restore();
}

const plural = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'голос' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'голоса' : 'голосов');

/** Ждём игроков: табло зовёт сесть */
function idle(ctx, s, W, H) {
  title(ctx, 'ВО ЧТО ИГРАЕМ?', W / 2, 180, 118, C.cream, 'center', 8);
  ctx.save();
  ctx.font = font(700, 64);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.creamDim;
  ctx.fillText(s.hint ?? 'Сядут двое — Затейник откроет голосование', W / 2, 310);
  ctx.restore();
  const w = 420, gap = 40, x0 = (W - (w * 4 + gap * 3)) / 2;
  s.games.forEach((g, i) => {
    const x = x0 + i * (w + gap), y = 420;
    ctx.save();
    rr(ctx, x, y, w, 400, 30);
    ctx.fillStyle = 'rgba(255, 244, 220, .08)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255, 244, 220, .18)'; ctx.stroke();
    badge(ctx, g.img, x + w / 2, y + 150, 100, C.cream2, C.ink);
    ctx.font = font(800, fit(ctx, g.name, 800, 60, w - 40, undefined, 36));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.cream;
    ctx.fillText(g.name, x + w / 2, y + 310);
    ctx.restore();
  });
  if (s.seated != null) {
    ctx.save(); ctx.font = font(800, 58); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.goldText;
    ctx.fillText(`сидят: ${s.seated}`, W / 2, H - 120); ctx.restore();
  }
}

export { BOARD_W, BOARD_H };
