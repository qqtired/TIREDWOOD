// Табло «Своей игры», «Крокодила», «Кто из нас?» и таблички пультов. Как board.js: только canvas 2D, без DOM.
import { BOARD_H, BOARD_W, boardBase } from './board.js';
import { C, DISPLAY, NICK, TEXT, badge, clip, confetti, fit, font, icon, mmss, nickTone, rr, title, wrap } from './paint.js';

const PAD = 70;

function bar(ctx, frac, hurry, W, H, y = H - 64) {
  const x = PAD, w = W - PAD * 2, h = 18;
  ctx.save();
  rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = C.track; ctx.fill();
  rr(ctx, x, y, Math.max(h, w * Math.max(0, Math.min(1, frac))), h, h / 2);
  ctx.fillStyle = hurry ? C.bad : C.gold; ctx.fill();
  ctx.restore();
}
function head(ctx, name, right, W) {
  title(ctx, name, PAD, 104, 70, C.cream, 'left', 5);
  if (right) {
    ctx.save(); ctx.font = font(700, 44); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.creamDim;
    ctx.fillText(clip(ctx, right, 1100), W - PAD, 106); ctx.restore();
  }
}

// ---------------------------------------------------------------- «Своя игра»
/** s: { phase: 'grid' | 'question' | 'answer', round, pack, themes: [{ name, cells: [price | 0] }], pick: [row, col],
 *       q: { theme, price, text, answer }, buzz: { nick, left }, open: 0..1, verdict: 'yes' | 'no' | 'none', by } */
export function paintJeopardy(ctx, s, t = 0) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  boardBase(ctx, W, H);
  if (s.phase === 'grid') {
    head(ctx, 'СВОЯ ИГРА', s.turn ? `выбирает ${s.turn}` : `${s.round} · «${s.pack}»`, W);
    const rows = s.themes.length, cols = 5;
    const top = 170, bottom = H - 50, gx = 12, gy = 12;
    const tw = 620, cw = (W - PAD * 2 - tw - gx * cols) / cols, ch = (bottom - top - gy * (rows - 1)) / rows;
    s.themes.forEach((th, r) => {
      const y = top + r * (ch + gy);
      ctx.save();
      rr(ctx, PAD, y, tw, ch, 18); ctx.fillStyle = 'rgba(3, 32, 30, .45)'; ctx.fill();
      const px = fit(ctx, th.name, 800, 60, tw - 50, TEXT, 36);
      ctx.font = font(800, px); ctx.fillStyle = C.cream; ctx.textBaseline = 'middle';
      ctx.fillText(clip(ctx, th.name, tw - 50), PAD + 26, y + ch / 2 + 3);
      for (let c = 0; c < cols; c++) {
        const x = PAD + tw + gx + c * (cw + gx), v = th.cells[c];
        const on = s.pick && s.pick[0] === r && s.pick[1] === c;
        rr(ctx, x, y, cw, ch, 18);
        if (v) {
          ctx.fillStyle = on ? C.gold : C.cream; ctx.fill();
          ctx.font = font(800, 76); ctx.textAlign = 'center'; ctx.fillStyle = on ? C.goldInk : C.enamelSolid;
          ctx.fillText(String(v), x + cw / 2, y + ch / 2 + 4); ctx.textAlign = 'left';
          if (on) { ctx.lineWidth = 10; ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(t / 120)})`; ctx.stroke(); }
        } else { ctx.fillStyle = 'rgba(3, 32, 30, .3)'; ctx.fill(); }
      }
      ctx.restore();
    });
    return;
  }
  const q = s.q;
  head(ctx, q.theme.toUpperCase().slice(0, 18), '', W);
  ctx.save();
  ctx.font = font(400, 70, DISPLAY);
  const tw = ctx.measureText(q.theme.toUpperCase().slice(0, 18)).width;
  rr(ctx, PAD + tw + 40, 62, 210, 92, 46); ctx.fillStyle = C.gold; ctx.fill();
  ctx.font = font(800, 62); ctx.fillStyle = C.goldInk; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(q.price), PAD + tw + 145, 110);
  ctx.restore();
  if (s.phase === 'answer') {
    const ok = s.verdict === 'yes';
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    title(ctx, ok ? 'ВЕРНО!' : s.verdict === 'no' ? 'НЕВЕРНО' : 'НИКТО НЕ ЗНАЕТ', W / 2, 300, 110, ok ? C.gold : C.coral, 'center', 8);
    ctx.font = font(800, 96); ctx.fillStyle = C.cream;
    ctx.fillText(clip(ctx, q.answer, 1800), W / 2, 500);
    if (s.by) { ctx.font = font(700, 64); ctx.fillStyle = ok ? C.goodText : C.badText; ctx.fillText(`${s.by} ${ok ? '+' : '−'}${q.price}`, W / 2, 660); }
    ctx.restore();
    if (ok) confetti(ctx, W, H, t, 70, 3);
    return;
  }
  ctx.save();
  ctx.font = font(800, 86);
  const lines = wrap(ctx, q.text, W - PAD * 2 - 80, 5);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.cream;
  const y0 = 520 - (lines.length - 1) * 54;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * 108));
  ctx.restore();
  // внизу — «кнопки откроются» или кто жмёт первым
  if (s.buzz) {
    ctx.save();
    const txt = `${s.buzz.nick} отвечает`, tm = mmss(s.buzz.left);
    ctx.font = font(800, 64);
    const a = ctx.measureText(txt).width, b2 = ctx.measureText(tm).width, w = a + b2 + 140;
    rr(ctx, (W - w) / 2, H - 206, w, 108, 54); ctx.fillStyle = C.gold; ctx.fill();
    ctx.fillStyle = C.goldInk; ctx.textBaseline = 'middle';
    ctx.fillText(txt, (W - w) / 2 + 50, H - 150);
    ctx.globalAlpha = 0.75; ctx.fillText(tm, (W - w) / 2 + 50 + a + 40, H - 150); ctx.globalAlpha = 1;
    ctx.restore();
  } else if (s.open < 1) {
    ctx.save(); ctx.font = font(700, 46); ctx.fillStyle = C.creamDim; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('кнопки откроются…', W / 2, H - 120); ctx.restore();
    bar(ctx, s.open, false, W, H);
  } else {
    ctx.save(); ctx.font = font(800, 58); ctx.fillStyle = C.goldText; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (Math.floor(t / 400) % 2 === 0) ctx.fillText('ЖМИ!', W / 2, H - 120); ctx.restore();
    bar(ctx, 1, false, W, H);
  }
}

/** Табличка пульта 512×256: ник, счёт; turn — золото (его ход), lit — лампа нажата, away — отошёл */
export function paintPlate(ctx, p) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);
  rr(ctx, 0, 0, W, H, 26);
  ctx.fillStyle = p.lit ? C.gold : C.enamelSolid; ctx.fill();
  ctx.lineWidth = 12; ctx.strokeStyle = p.turn ? C.gold : C.cream2; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = font(800, fit(ctx, p.nick, 800, 64, W - 60));
  ctx.fillStyle = p.lit ? C.goldInk : C.cream;
  ctx.fillText(clip(ctx, p.nick, W - 60), W / 2, 74);
  ctx.font = font(800, 104);
  ctx.fillStyle = p.lit ? C.goldInk : p.score < 0 ? C.badText : C.goldText;
  ctx.fillText(p.away ? 'отошёл' : p.score.toLocaleString('ru-RU'), W / 2, 176);
}

// ---------------------------------------------------------------- «Крокодил»
/** s: { drawer, left, total, mask: 'М _ _ _', strokes: [{ c, w, pts }], guessed: [nick], progress 0..1 } — рисунок дублируется на табло */
export function paintCroc(ctx, s, t = 0) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  boardBase(ctx, W, H);
  head(ctx, 'КРОКОДИЛ', '', W);
  // холст рисунка 4:3 слева
  // низ по центру табло из зала закрывает мольберт (маска кадра) — всё важное выше y≈740
  const ch = 570, cw = ch * 4 / 3, cx = PAD, cy = 160;
  rr(ctx, cx, cy + 8, cw, ch, 22); ctx.fillStyle = C.ink; ctx.fill();
  rr(ctx, cx, cy, cw, ch, 22); ctx.fillStyle = '#fffdf7'; ctx.fill();
  ctx.save(); rr(ctx, cx, cy, cw, ch, 22); ctx.clip();
  drawStrokes(ctx, s.strokes, cx, cy, cw / 1024, s.progress ?? 1);
  ctx.restore();
  // справа: буквы, кто угадал
  const rx = cx + cw + 60, rw = W - PAD - rx;
  ctx.save();
  ctx.font = font(800, 48); ctx.fillStyle = C.goldText; ctx.letterSpacing = '4px'; ctx.textBaseline = 'middle';
  ctx.fillText('СЛОВО', rx, 200); ctx.letterSpacing = '0px';
  ctx.font = font(400, fit(ctx, s.mask, 400, 120, rw, DISPLAY, 50), DISPLAY); ctx.fillStyle = C.cream;
  ctx.fillText(s.mask, rx, 300);
  ctx.font = font(800, 48); ctx.fillStyle = C.goodText; ctx.letterSpacing = '4px';
  ctx.fillText('УГАДАЛИ', rx, 430); ctx.letterSpacing = '0px';
  const gs = s.guessed ?? [];
  gs.slice(0, 3).forEach((n, i) => {
    const y = 516 + i * 92;
    ctx.beginPath(); ctx.arc(rx + 32, y, 32, 0, Math.PI * 2); ctx.fillStyle = C.good; ctx.fill();
    ctx.font = font(800, 40); ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'; ctx.fillText(String(i + 1), rx + 32, y + 2);
    ctx.textAlign = 'left'; ctx.font = font(800, 68); ctx.fillStyle = C.cream; ctx.fillText(clip(ctx, n, rw - 90 - (i === 2 && gs.length > 3 ? 150 : 0)), rx + 84, y + 2);
  });
  if (gs.length > 3) { ctx.font = font(800, 56); ctx.fillStyle = C.goodText; ctx.textAlign = 'right'; ctx.fillText(`+${gs.length - 3}`, W - PAD, 516 + 2 * 92 + 2); ctx.textAlign = 'left'; }
  if (!gs.length) { ctx.font = font(700, 56); ctx.fillStyle = C.creamFaint; ctx.fillText('пока никто', rx, 516); }
  ctx.restore();
  bar(ctx, s.left / s.total, s.left <= 10, W, H, H - 48);
}

export function drawStrokes(ctx, strokes, ox, oy, k, progress = 1) {
  const total = strokes.reduce((a, st) => a + st.pts.length, 0);
  let budget = Math.round(total * progress);
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const st of strokes) {
    if (budget <= 1) break;
    const n = Math.min(st.pts.length, budget);
    budget -= n;
    ctx.strokeStyle = st.c; ctx.lineWidth = st.w * k;
    ctx.beginPath();
    st.pts.slice(0, n).forEach(([x, y], i) => (i ? ctx.lineTo(ox + x * k, oy + y * k) : ctx.moveTo(ox + x * k, oy + y * k)));
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- «Кто из нас?»
/** s: { phase: 'vote' | 'reveal', round, rounds, q, left, total, votes: number, voters, results: [{ nick, n }], title } */
export function paintWho(ctx, s, t = 0) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  boardBase(ctx, W, H);
  head(ctx, 'КТО ИЗ НАС?', `вопрос ${s.round} из ${s.rounds}`, W);
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (s.phase === 'vote') {
    ctx.font = font(800, 96);
    const lines = wrap(ctx, s.q, W - PAD * 2 - 60, 3);
    const y0 = 440 - (lines.length - 1) * 60;
    ctx.fillStyle = C.cream;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * 120));
    ctx.font = font(700, 50); ctx.fillStyle = C.creamDim;
    ctx.fillText(`проголосовали ${s.votes} из ${s.voters} · кликни по желейке`, W / 2, H - 150);
    ctx.restore();
    bar(ctx, s.left / s.total, s.left <= 5, W, H);
    return;
  }
  ctx.font = font(700, 54); ctx.fillStyle = C.creamDim;
  ctx.fillText(clip(ctx, s.q, W - PAD * 2), W / 2, 210);
  const max = Math.max(1, ...s.results.map((r) => r.n));
  const top = 290, rowH = 118;
  s.results.slice(0, 5).forEach((r, i) => {
    const y = top + i * rowH, lead = r.n === max;
    const bw = (W - PAD * 2 - 560) * (r.n / max) * Math.min(1, (t + 200) / 900);
    ctx.textAlign = 'left';
    ctx.font = font(800, 60); ctx.fillStyle = lead ? C.goldText : C.cream;
    ctx.fillText(clip(ctx, r.nick, 440), PAD, y + 50);
    rr(ctx, PAD + 480, y + 14, W - PAD * 2 - 560, 72, 36); ctx.fillStyle = C.track; ctx.fill();
    if (bw > 4) { rr(ctx, PAD + 480, y + 14, Math.max(72, bw), 72, 36); ctx.fillStyle = lead ? C.gold : C.info; ctx.fill(); }
    ctx.font = font(800, 60); ctx.textAlign = 'right'; ctx.fillStyle = lead ? C.goldText : C.cream;
    ctx.fillText(String(r.n), W - PAD, y + 52);
  });
  if (s.title) {
    ctx.textAlign = 'center';
    const lead = s.results.find((r) => r.n === max)?.nick ?? '';
    const txt = `${lead} — «${s.title}»`;
    ctx.font = font(800, 64);
    const w = Math.min(W - PAD * 2, ctx.measureText(txt).width + 120);
    rr(ctx, (W - w) / 2, H - 170, w, 100, 50); ctx.fillStyle = C.gold; ctx.fill();
    ctx.fillStyle = C.goldInk; ctx.fillText(clip(ctx, txt, w - 80), W / 2, H - 118);
  }
  ctx.restore();
}

export { BOARD_W, BOARD_H, NICK, nickTone, badge, icon };
