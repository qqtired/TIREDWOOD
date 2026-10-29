// Табло «Ракушки»: один холст 2048×1024 на задней стене. Рисует то, что идёт на сцене. Только canvas 2D, без DOM:
// переносится в игру почти как есть (client/lobby/quiz/board.ts → CanvasTexture, перерисовка ≤ 4 раз в секунду).
// Читается с 20+ м: заголовки — Rubik Mono One 64–120, текст — Rubik 800 не меньше 40.
import { C, DISPLAY, TEXT, awning, badge, clip, confetti, enamel, fit, font, icon, mmss, rr, title, wrap } from './paint.js';

export const BOARD_W = 2048;
export const BOARD_H = 1024;
export const PAD = 70;

/** Фон табло: эмаль, кремовая кайма, маркиза сверху */
export function boardBase(ctx, W = BOARD_W, H = BOARD_H) {
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

/** Тонкая полоска времени у нижнего края — для зрителей (у угадывающих время ещё и кольцом в плашке) */
export function timeBar(ctx, frac, hurry, W, H) {
  const x = PAD, w = W - PAD * 2, y = H - 64, h = 18;
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

/** Подпись раздела: капсом, с разрядкой, как .k-eyebrow */
function eyebrow(ctx, text, x, y, color = C.goldText, px = 36) {
  ctx.save();
  ctx.font = font(800, px);
  ctx.letterSpacing = '4px';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text.toUpperCase(), x, y);
  const w = ctx.measureText(text.toUpperCase()).width;
  ctx.restore();
  return w;
}

/** Пилюля на табло: крем, тёмный текст (категория, «Осталась минута!») */
export function pill(ctx, text, x, y, h, { fill = C.cream, ink = C.ink, px = 42, img = null, align = 'left' } = {}) {
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
  ctx.fillText(text, x0 + h * 0.45 + iw, y + h / 2 + 2);
  ctx.restore();
  return w;
}

// ---------------------------------------------------------------- «Загадка»
// Из зала табло ~400–550 px в ширину: главное (цепочка «тепло», слово) — 80–90 px холста, второстепенное — 50–64.

/** Где на табло встанет карточка цепочки «тепло» номер i (из видимых) — для полёта облачка на табло */
export function riddleChainRect(i) {
  const top = 200, ch = 172, gap = 24;
  const y = top + i * (ch + gap);
  return { x: 184, y, w: 1236, h: ch, badge: { x: 116, y: y + ch / 2 } };
}

/**
 * s: { phase: 'idle' | 'round' | 'solved' | 'timeout', category, left, total, chain: [{ text, nick, fresh }],
 *      hints: [string | { text, fresh }], misses: [string], answer, solver, solvedIn, warmBy: [nick], next, nextLeft, icons }
 * icons: { warm, miss, win, scroll, chat, cat } — картинки (HTMLImageElement)
 */
export function paintRiddle(ctx, s, t = 0) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  boardBase(ctx, W, H);
  if (s.phase === 'idle') return riddleIdle(ctx, s, W, H);
  if (s.phase === 'solved' || s.phase === 'timeout') return riddleEnd(ctx, s, t, W, H);
  const hurry = s.left <= 60;
  // шапка: «ЗАГАДКА» + тема; справа — «Осталась минута!» (мигает) или как играть
  title(ctx, 'ЗАГАДКА', PAD, 104, 80, C.cream, 'left', 6);
  ctx.save();
  ctx.font = font(400, 80, DISPLAY);
  const tw = ctx.measureText('ЗАГАДКА').width;
  if (s.category) {
    ctx.font = font(800, 84); ctx.textBaseline = 'middle'; ctx.fillStyle = C.goldText;
    ctx.fillText(clip(ctx, `·  ${s.category}`, 1300 - tw), PAD + tw + 36, 108);
  }
  ctx.restore();
  if (hurry && Math.floor(t / 500) % 2 === 0) pill(ctx, 'Осталась минута!', W - PAD, 56, 100, { fill: C.coral, ink: '#ffffff', px: 54, align: 'right' });
  // слева — цепочка «тепло»: последние 3, новая внизу, без ников (ники — в карточке «Тепло» на экране)
  const chain = s.chain ?? [];
  const shown = chain.slice(-3);
  if (shown.length > 1) {
    const a = riddleChainRect(0).badge, b = riddleChainRect(shown.length - 1).badge;
    ctx.save(); ctx.setLineDash([2, 20]); ctx.lineCap = 'round'; ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(158, 236, 182, .75)';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore();
  }
  if (!shown.length) {
    const r = riddleChainRect(0);
    ctx.save(); rr(ctx, PAD, r.y, r.x + r.w - PAD, r.h, 26); ctx.setLineDash([16, 14]); ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255, 244, 220, .35)'; ctx.stroke();
    ctx.font = font(700, 64); ctx.fillStyle = C.creamFaint; ctx.textBaseline = 'middle';
    ctx.fillText(clip(ctx, 'Здесь встанут тёплые догадки', r.x + r.w - PAD - 80), PAD + 40, r.y + r.h / 2 + 2); ctx.restore();
  }
  shown.forEach((c, i) => chainCard(ctx, c, riddleChainRect(i), s.icons?.warm, t));
  // справа — подсказки
  const rx = 1470, rw = W - PAD - rx;
  for (let i = 0; i < (s.hints?.length ?? 0); i++) {
    const y = 196 + i * 190, hv = s.hints?.[i], h = typeof hv === 'string' ? hv : hv?.text, fresh = hv?.fresh;
    ctx.save();
    ctx.beginPath(); ctx.arc(rx + 46, y + 80, 46, 0, Math.PI * 2);
    if (h) { ctx.fillStyle = C.gold; ctx.fill(); if (fresh) { ctx.lineWidth = 8; ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(t / 160)})`; ctx.stroke(); } }
    else { ctx.setLineDash([9, 9]); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255, 244, 220, .35)'; ctx.stroke(); }
    ctx.font = font(800, 54); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = h ? C.goldInk : C.creamFaint; ctx.fillText(String(i + 1), rx + 46, y + 83);
    ctx.textAlign = 'left';
    if (h) { ctx.font = font(800, 76); const ls = wrap(ctx, h, rw - 116, 2); ctx.fillStyle = C.cream; ls.forEach((l, k) => ctx.fillText(l, rx + 116, y + 82 + (k - (ls.length - 1) / 2) * 80)); }
    ctx.restore();
  }
  // «мимо» — одна строка из последних, серым и зачёркнуто: чтобы не повторяться
  const misses = (s.misses ?? []).slice(-3).reverse();
  if (misses.length) {
    ctx.save();
    icon(ctx, s.icons?.miss, PAD + 36, 866, 70);
    ctx.font = font(700, 66); ctx.textBaseline = 'middle';
    let mx = PAD + 96;
    for (const m of misses) {
      const tm = clip(ctx, m, 420), w = ctx.measureText(tm).width;
      if (mx + w > 1060) break;
      ctx.fillStyle = 'rgba(255, 244, 220, .6)'; ctx.fillText(tm, mx, 868);
      ctx.fillRect(mx - 4, 870, w + 8, 6);
      mx += w + 54;
    }
    ctx.restore();
  }
  timeBar(ctx, s.left / s.total, hurry, W, H);
}

function chainCard(ctx, c, r, warmImg, t) {
  ctx.save();
  badge(ctx, warmImg, r.badge.x, r.badge.y, 48, C.good);
  rr(ctx, r.x, r.y + 7, r.w, r.h, 28);
  ctx.fillStyle = C.ink;
  ctx.fill();
  rr(ctx, r.x, r.y, r.w, r.h, 28);
  ctx.fillStyle = C.cream;
  ctx.fill();
  if (c.fresh) {
    ctx.lineWidth = 10;
    ctx.strokeStyle = `rgba(255, 205, 74, ${0.6 + 0.4 * Math.sin(t / 180)})`;
    ctx.stroke();
  }
  ctx.textBaseline = 'middle';
  const maxT = r.w - 72;
  const px = fit(ctx, c.text, 800, 112, maxT, TEXT, 64);
  ctx.font = font(800, px);
  ctx.fillStyle = C.plateInk;
  ctx.fillText(clip(ctx, c.text, maxT), r.x + 36, r.y + r.h / 2 + 4);
  ctx.restore();
}

function riddleIdle(ctx, s, W, H) {
  title(ctx, 'ЗАГАДКА', W / 2, 190, 132, C.cream, 'center', 9);
  ctx.save();
  ctx.font = font(700, 60);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.creamDim;
  ctx.fillText('Загадай что угодно — угадают в чате', W / 2, 318);
  ctx.restore();
  const steps = [
    [s.icons?.scroll, 'У трибуны', 'E — загадать'],
    [s.icons?.chat, 'Угадывай', 'пиши в чат'],
    [s.icons?.warm, 'Тепло / мимо', 'отмечает загадавший'],
  ];
  const cw = 586, gap = 40, x0 = (W - (cw * 3 + gap * 2)) / 2, y = 410, h = 420;
  steps.forEach(([img, a, b], i) => {
    const x = x0 + i * (cw + gap);
    ctx.save();
    rr(ctx, x, y, cw, h, 30);
    ctx.fillStyle = 'rgba(255, 244, 220, .07)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 244, 220, .16)';
    ctx.stroke();
    badge(ctx, img, x + cw / 2, y + 128, 92, C.cream2, C.ink);
    ctx.beginPath(); ctx.arc(x + 58, y + 58, 34, 0, Math.PI * 2); ctx.fillStyle = C.gold; ctx.fill();
    ctx.font = font(800, 42); ctx.fillStyle = C.goldInk; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), x + 58, y + 61);
    ctx.font = font(800, 64); ctx.fillStyle = C.cream; ctx.fillText(a, x + cw / 2, y + 290);
    ctx.font = font(600, 46); ctx.fillStyle = C.creamDim; ctx.fillText(b, x + cw / 2, y + 362);
    ctx.restore();
  });
  ctx.save();
  ctx.font = font(700, 42);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.creamFaint;
  ctx.fillText('Ещё: Своя игра · Крокодил · Кто из нас?', W / 2, H - 100);
  ctx.restore();
}

function riddleEnd(ctx, s, t, W, H) {
  const win = s.phase === 'solved';
  if (win) confetti(ctx, W, H, t, 120, 11);
  title(ctx, win ? 'РАЗГАДАЛИ!' : 'НЕ УГАДАЛИ', W / 2, 140, 96, win ? C.gold : C.coral, 'center', 7);
  ctx.save();
  const word = (s.answer ?? '').toUpperCase();
  const px = fit(ctx, word, 400, 190, 1640, DISPLAY, 80);
  ctx.font = font(400, px, DISPLAY);
  const ww = Math.max(760, ctx.measureText(word).width + 200);
  const bx = (W - ww) / 2, by = 236, bh = 300;
  rr(ctx, bx, by + 12, ww, bh, 44); ctx.fillStyle = C.ink; ctx.fill();
  rr(ctx, bx, by, ww, bh, 44); ctx.fillStyle = win ? C.cream : C.cream2; ctx.fill();
  if (win) { ctx.lineWidth = 12; ctx.strokeStyle = C.gold; ctx.stroke(); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.enamelSolid;
  ctx.fillText(word, W / 2, by + bh / 2 + 10);
  if (win) badge(ctx, s.icons?.win, bx + ww - 14, by + 18, 74, C.gold, '#ffffff');
  ctx.restore();
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (win) {
    ctx.font = font(800, 96); ctx.fillStyle = C.cream;
    ctx.fillText(clip(ctx, `${s.solver} угадал!`, 1800), W / 2, 668);
  } else {
    ctx.font = font(800, 80); ctx.fillStyle = C.creamDim;
    ctx.fillText('Время вышло', W / 2, 668);
  }
  if (s.next) {
    const line = `Дальше загадывает ${s.next}`;
    const tm = mmss(s.nextLeft ?? 0);
    ctx.font = font(800, 72);
    const lw = Math.min(ctx.measureText(line).width, 1500);
    const tw2 = ctx.measureText(tm).width;
    const nx = W / 2 - (lw + 36 + tw2) / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.goldText;
    ctx.fillText(clip(ctx, line, 1500), nx, 840);
    ctx.fillStyle = C.cream;
    ctx.fillText(tm, nx + lw + 36, 840);
    timeBar(ctx, (s.nextLeft ?? 0) / 10, false, W, H);
  }
  ctx.restore();
}

export { wrap };
