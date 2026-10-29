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
// Из зала табло ~480 px в ширину. Цепочки «тепло» на табло нет — она в карточке «Тепло» у каждого (слово владельца).
// Крупно и мало: тема, число «тепло», подсказки, «мимо», время, номер загадки. Внизу по центру ничего важного.

/** Старый адрес слота цепочки — оставлен для совместимости, табло цепочку больше не рисует */
export function riddleChainRect(i) {
  const top = 200, ch = 172, gap = 24;
  const y = top + i * (ch + gap);
  return { x: 184, y, w: 1236, h: ch, badge: { x: 116, y: y + ch / 2 } };
}

/**
 * s: { phase: 'round' | 'solved' | 'timeout' | 'left', category, left, total, warmN, warmAt, hints: [string | { text, fresh }],
 *      misses: [string], num, of, answer, solver, riddler, evening: [[nick, pts]], icons }
 * icons: { warm, miss, win, scroll } — картинки (HTMLImageElement)
 */
export function paintRiddle(ctx, s, t = 0) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  boardBase(ctx, W, H);
  if (s.phase === 'idle') return riddleIdle(ctx, s, W, H);
  if (s.phase === 'solved' || s.phase === 'timeout' || s.phase === 'left') return riddleEnd(ctx, s, t, W, H);
  const hurry = s.left <= 60;
  // шапка: «ЗАГАДКА · тема» слева, время крупно справа
  title(ctx, 'ЗАГАДКА', PAD, 104, 80, C.cream, 'left', 6);
  ctx.save();
  ctx.font = font(400, 80, DISPLAY);
  const tw = ctx.measureText('ЗАГАДКА').width;
  if (s.category) {
    ctx.font = font(800, 84); ctx.textBaseline = 'middle'; ctx.fillStyle = C.goldText;
    ctx.fillText(clip(ctx, `·  ${s.category}`, 1180 - tw), PAD + tw + 36, 108);
  }
  ctx.font = font(400, 96, DISPLAY); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillStyle = hurry && Math.floor(t / 500) % 2 === 0 ? C.coral : C.cream;
  ctx.fillText(mmss(s.left), W - PAD, 112);
  ctx.restore();
  // слева — «тепло»: сколько тёплых догадок (сами догадки — в карточке у каждого)
  const bx = PAD, by = 200, bw = 620, bh = 560;
  ctx.save();
  rr(ctx, bx, by + 9, bw, bh, 34); ctx.fillStyle = C.ink; ctx.fill();
  rr(ctx, bx, by, bw, bh, 34); ctx.fillStyle = C.cream; ctx.fill();
  const fresh = s.warmAt != null && t - s.warmAt < 1800;
  if (fresh) { ctx.lineWidth = 14; ctx.strokeStyle = `rgba(255, 205, 74, ${0.6 + 0.4 * Math.sin(t / 150)})`; ctx.stroke(); }
  badge(ctx, s.icons?.warm, bx + bw / 2, by + 130, 92, C.good);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = font(800, 70); ctx.fillStyle = C.goodLo; ctx.fillText('ТЕПЛО', bx + bw / 2, by + 284);
  ctx.font = font(400, 210, DISPLAY); ctx.fillStyle = (s.warmN ?? 0) ? C.enamelSolid : 'rgba(14, 85, 80, .28)';
  ctx.fillText(String(s.warmN ?? 0), bx + bw / 2, by + 436);
  ctx.restore();
  // справа — подсказки, без номеров (цифры путают с клавишами 1/2/3)
  const rx = bx + bw + 70, rw = W - PAD - rx;
  ctx.save();
  ctx.font = font(800, 54); ctx.letterSpacing = '6px'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.goldText;
  ctx.fillText('ПОДСКАЗКИ', rx, 236); ctx.letterSpacing = '0px';
  const hints = s.hints ?? [];
  if (!hints.length) { ctx.font = font(700, 72); ctx.fillStyle = C.creamFaint; ctx.fillText('пока нет', rx, 350); }
  hints.slice(-3).forEach((hv, i) => {
    const h = typeof hv === 'string' ? hv : hv.text, y = 350 + i * 150;
    ctx.beginPath(); ctx.arc(rx + 22, y, 22, 0, Math.PI * 2);
    ctx.fillStyle = C.gold; ctx.fill();
    if (hv?.fresh) { ctx.lineWidth = 8; ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(t / 160)})`; ctx.stroke(); }
    const px = fit(ctx, h, 800, 100, rw - 80, TEXT, 64);
    ctx.font = font(800, px); ctx.fillStyle = C.cream; ctx.fillText(clip(ctx, h, rw - 80), rx + 72, y + 4);
  });
  ctx.restore();
  // внизу слева — «мимо» одной строкой (по центру снизу — макушка загадывающего), справа — номер загадки
  const misses = (s.misses ?? []).slice(-3).reverse();
  ctx.save();
  ctx.textBaseline = 'middle';
  if (misses.length) {
    icon(ctx, s.icons?.miss, PAD + 36, 862, 70);
    ctx.font = font(700, 66);
    let mx = PAD + 96;
    for (const m of misses) {
      const tm = clip(ctx, m, 380), w = ctx.measureText(tm).width;
      if (mx + w > 1000) break;
      ctx.fillStyle = 'rgba(255, 244, 220, .6)'; ctx.fillText(tm, mx, 864);
      ctx.fillRect(mx - 4, 866, w + 8, 6);
      mx += w + 54;
    }
  }
  if (s.num) {
    ctx.font = font(800, 62); ctx.textAlign = 'right'; ctx.fillStyle = C.creamDim;
    ctx.fillText(`загадка ${s.num} из ${s.of ?? 5}`, W - PAD, 864);
  }
  ctx.restore();
  timeBar(ctx, s.left / s.total, hurry, W, H);
}

/** Табло у входа в простое: «Во что играем?» */
function riddleIdle(ctx, s, W, H) {
  title(ctx, 'ВО ЧТО ИГРАЕМ?', W / 2, 220, 124, C.cream, 'center', 8);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(800, 76);
  ctx.fillStyle = C.goldText;
  ctx.fillText('Загадка · Своя игра · Крокодил · Кто из нас?', W / 2, 470, W - PAD * 2);
  ctx.font = font(700, 66);
  ctx.fillStyle = C.creamDim;
  ctx.fillText(s.hint ?? 'Садись — голосуем, во что играть', W / 2, 640);
  ctx.restore();
}

/** Итог загадки: слово во всё табло, кто угадал (или кто ушёл), «счёт вечера». «Дальше загадывает…» — только на плашке */
function riddleEnd(ctx, s, t, W, H) {
  const win = s.phase === 'solved';
  if (win) confetti(ctx, W, H, t, 120, 11);
  const head = win ? 'РАЗГАДАЛИ!' : s.phase === 'left' ? `${(s.riddler ?? '').toUpperCase()} УШЁЛ` : 'НЕ УГАДАЛИ';
  title(ctx, clip(ctx, head, 1800), W / 2, 130, 96, win ? C.gold : C.coral, 'center', 7);
  ctx.save();
  const word = (s.answer ?? '').toUpperCase();
  const px = fit(ctx, word, 400, 180, 1640, DISPLAY, 80);
  ctx.font = font(400, px, DISPLAY);
  const ww = Math.max(760, ctx.measureText(word).width + 200);
  const bx = (W - ww) / 2, by = 220, bh = 280;
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
  if (win) { ctx.font = font(800, 92); ctx.fillStyle = C.cream; ctx.fillText(clip(ctx, `${s.solver} угадал!`, 1800), W / 2, 610); }
  else { ctx.font = font(800, 80); ctx.fillStyle = C.creamDim; ctx.fillText(s.phase === 'left' ? 'без жетонов · ход следующему' : 'Время вышло', W / 2, 610); }
  // счёт вечера — очки раундов, не жетоны
  const ev = (s.evening ?? []).slice(0, 4);
  if (ev.length) {
    ctx.font = font(800, 50); ctx.letterSpacing = '6px'; ctx.fillStyle = C.goldText;
    ctx.fillText('СЧЁТ ВЕЧЕРА', W / 2, 736); ctx.letterSpacing = '0px';
    ctx.font = font(800, 70);
    const parts = ev.map(([n, p]) => `${n} ${p}`);
    let line = parts.join('   ·   ');
    ctx.fillStyle = C.cream;
    ctx.fillText(clip(ctx, line, W - PAD * 2 - 40), W / 2, 840);
  }
  ctx.restore();
}

/** Вывеска над аркой (sign_face 1024×256): «РАКУШКА» и строка статуса */
export function paintSign(ctx, s) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = C.deep; ctx.fillRect(0, 0, W, H);
  enamel(ctx, 6, 6, W - 12, H - 12, 22);
  ctx.save();
  rr(ctx, 14, 14, W - 28, H - 28, 18); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(243, 230, 201, .6)'; ctx.stroke();
  ctx.restore();
  title(ctx, 'РАКУШКА', W / 2, 104, 92, C.cream, 'center', 6);
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const st = s.status ?? 'Во что играем?';
  ctx.font = font(800, fit(ctx, st, 800, 52, W - 80, TEXT, 30));
  ctx.fillStyle = s.live ? C.goldText : C.creamDim;
  ctx.fillText(st, W / 2, 196);
  ctx.restore();
}

export { wrap };
