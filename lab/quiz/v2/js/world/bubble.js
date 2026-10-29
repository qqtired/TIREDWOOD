// Облачко над желейкой и плашка ника. Облачко — то же, что в игре (client/render/avatar.ts drawSpeech: тёплый белый,
// Rubik 600 34, хвостик), плюс тон отметки загадывающего и значок на углу:
//   new — обычное, warm — 👍 «тепло» (мятное, значок), miss — 👎 «мимо» (серое, зачёркнуто), win — 🎯 (золото).
// Без DOM: холст снаружи. В игре — тот же спрайт sizeAttenuation:false, что у обычного облачка.
import { C, NICK, TEXT, badge, clip, font, nickTone, rr, wrap } from './paint.js';

export const BUBBLE_W = 512;
export const BUBBLE_H = 232;
const TONE = {
  new: { fill: 'rgba(255,252,246,0.97)', stroke: 'rgba(40,32,28,0.35)', lw: 3, ink: '#2a2420', weight: 600 },
  warm: { fill: C.goodTint, stroke: C.goodLo, lw: 5, ink: '#173d27', weight: 700 },
  miss: { fill: '#ebe8e2', stroke: 'rgba(40,32,28,0.25)', lw: 3, ink: '#8d877f', weight: 600 },
  win: { fill: 'gold', stroke: C.goldLo, lw: 5, ink: C.goldInk, weight: 800 },
};

/** Нарисовать облачко; вернуть рамку пузыря на холсте { x, y, w, h } (без хвостика) */
export function drawBubble(cv, text, tone = 'new', icons = {}, nick = '') {
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  const st = TONE[tone] ?? TONE.new;
  ctx.font = font(st.weight, 34, TEXT);
  const lines = wrap(ctx, text, 340, 2);
  const lineH = 40;
  const hasBadge = tone !== 'new';
  ctx.font = font(700, 25, TEXT);
  const nickT = nick ? clip(ctx, nick, 340) : '';
  const nw = nickT ? ctx.measureText(nickT).width : 0;
  ctx.font = font(st.weight, 34, TEXT);
  const nh = nickT ? 28 : 0;
  const w = Math.max(96, nw, ...lines.map((l) => ctx.measureText(l).width)) + 44 + (hasBadge ? 18 : 0);
  const h = lines.length * lineH + 26 + nh;
  const x = (W - w) / 2;
  const y = H - 20 - h;
  ctx.save();
  if (tone === 'win') {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#ffe58a');
    g.addColorStop(1, C.gold);
    ctx.fillStyle = g;
  } else ctx.fillStyle = st.fill;
  ctx.strokeStyle = st.stroke;
  ctx.lineWidth = st.lw;
  rr(ctx, x, y, w, h, 22);
  ctx.fill();
  ctx.stroke();
  // хвостик
  ctx.beginPath();
  ctx.moveTo(W / 2 - 15, y + h - 2);
  ctx.lineTo(W / 2, H - 4);
  ctx.lineTo(W / 2 + 15, y + h - 2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W / 2 - 15, y + h + st.lw / 2);
  ctx.lineTo(W / 2, H - 4);
  ctx.lineTo(W / 2 + 15, y + h + st.lw / 2);
  ctx.stroke();
  ctx.fillRect(W / 2 - 14, y + h - st.lw, 28, st.lw + 1);
  // текст
  ctx.fillStyle = st.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = W / 2 - (hasBadge ? 9 : 0);
  if (nickT) {
    ctx.save();
    ctx.font = font(700, 25, TEXT);
    ctx.fillStyle = tone === 'win' ? C.goldInk : tone === 'miss' ? '#a8a29a' : NICK[nickTone(nick)];
    ctx.fillText(nickT, cx, y + 13 + 14);
    ctx.restore();
  }
  lines.forEach((l, i) => {
    const ly = y + 13 + nh + lineH * (i + 0.5) + 1;
    ctx.fillText(l, cx, ly);
    if (tone === 'miss') {
      const lw = ctx.measureText(l).width;
      ctx.fillRect(cx - lw / 2 - 3, ly, lw + 6, 3);
    }
  });
  ctx.restore();
  // значок на углу
  if (hasBadge) {
    const img = tone === 'warm' ? icons.warm : tone === 'miss' ? icons.miss : icons.win;
    const fill = tone === 'warm' ? C.good : tone === 'miss' ? '#d9d4cc' : C.cream;
    badge(ctx, img, x + w - 6, y + 4, 30, fill, '#ffffff');
  }
  return { x, y, w, h };
}

export const TAG_W = 320;
export const TAG_H = 56;

/** Плашка ника над головой — как render/leveltag.ts без рамок престижа: тёмный кружок уровня + ник с обводкой */
export function drawTag(cv, nick, level = 1, own = false) {
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath();
  ctx.arc(25, 27, 17, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(22,28,32,.94)';
  ctx.fill();
  ctx.strokeStyle = own ? C.gold : '#fff6e8';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(800, level > 99 ? 15 : 21);
  ctx.fillStyle = '#fff6e8';
  ctx.fillText(String(level), 25, 28, 31);
  let size = 30;
  ctx.font = font(700, size);
  const avail = W - 62;
  while (size > 18 && ctx.measureText(nick).width > avail) { size--; ctx.font = font(700, size); }
  const cx = (W + 44) / 2;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(30,24,20,.85)';
  const t = clip(ctx, nick, avail);
  ctx.strokeText(t, cx, 27);
  ctx.fillStyle = own ? C.goldHi : '#fff6e8';
  ctx.fillText(t, cx, 27);
  ctx.restore();
}

export { NICK, nickTone };
