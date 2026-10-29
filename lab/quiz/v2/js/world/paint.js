// Общее для холстов в мире (табло, таблички пультов, мольберт, облачка): палитра «Ретро-парк 2.0» как в
// client/ui/kit/tokens.css, шрифты, скругления, перенос строк, подгонка размера. Без DOM-зависимостей: только
// CanvasRenderingContext2D и картинки, которые передали снаружи. Переносится в игру как есть (client/lobby/quiz/paint.ts).

/** Цвета — из tokens.css (retro2 + HUD «Светлый»); своих не придумываем */
export const C = {
  enamel: '#13675f', enamelLo: '#0d524d', enamelSolid: '#0e5550', ink: '#0a3b37', deep: '#072b28',
  cream: '#fff4dc', cream2: '#f3e6c9', creamDim: 'rgba(255, 244, 220, .76)', creamFaint: 'rgba(255, 244, 220, .55)',
  coral: '#ff7a5c', gold: '#ffcd4a', goldHi: '#ffdd7a', goldLo: '#a8760a', goldInk: '#3a2603', goldText: '#ffd665',
  good: '#56c07d', goodHi: '#84dba0', goodLo: '#2a7a4a', goodText: '#9eecb6', goodTint: '#e6f6ec',
  bad: '#e5484d', badHi: '#f47a7e', badLo: '#8e1f27', badText: '#ffa0a3',
  info: '#8fd9cf', infoText: '#b4efe7', special: '#a9b4ff',
  plate: '#fffcf6', plateInk: '#16313a', plateDim: '#4b6670', plateFaint: '#66808a',
  track: 'rgba(3, 32, 30, .5)',
};
/** Цвета ников — как --nick-1…6 HUD «Светлый» */
export const NICK = ['#d0562d', '#1b7a48', '#4b48c9', '#b8336a', '#0b7774', '#955a00'];
export function nickTone(nick) {
  let h = 0;
  for (const ch of nick) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 6;
}

export const TEXT = 'Rubik, system-ui, sans-serif';
export const DISPLAY = "'Rubik Mono One', Rubik, system-ui, sans-serif";
export const font = (w, px, fam = TEXT) => `${w} ${px}px ${fam}`;

export function rr(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/** Подогнать кегль, чтобы текст влез в ширину; вернуть кегль */
export function fit(ctx, text, weight, px, maxW, fam = TEXT, min = 18) {
  let s = px;
  ctx.font = font(weight, s, fam);
  while (s > min && ctx.measureText(text).width > maxW) { s -= 2; ctx.font = font(weight, s, fam); }
  return s;
}

/** Обрезать многоточием */
export function clip(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Перенос по словам, не больше maxLines строк (последняя — с многоточием) */
export function wrap(ctx, text, maxW, maxLines) {
  const lines = [];
  let cur = '';
  for (const word of text.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width <= maxW || !cur) cur = next;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = clip(ctx, `${lines[maxLines - 1]}…`, maxW); }
  return lines.map((l) => clip(ctx, l, maxW));
}

/** Эмаль табло: бирюзовый градиент окна «Ретро-парка» + мягкий блик сверху */
export function enamel(ctx, x, y, w, h, r) {
  ctx.save();
  rr(ctx, x, y, w, h, r);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, C.enamel);
  g.addColorStop(1, C.enamelLo);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  const s = ctx.createLinearGradient(0, y, 0, y + h * 0.32);
  s.addColorStop(0, 'rgba(255,255,255,.06)');
  s.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = s;
  ctx.fillRect(x, y, w, h * 0.32);
  ctx.restore();
}

/** Узкая маркиза — как полоса в шапке окна (--awning-h/w, коралл/крем) */
export function awning(ctx, x, y, w, h, stripe) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let i = 0, sx = x; sx < x + w; i++, sx += stripe) {
    ctx.fillStyle = i % 2 ? C.cream2 : C.coral;
    ctx.fillRect(sx, y, stripe, h);
  }
  ctx.fillStyle = 'rgba(0,0,0,.12)';
  ctx.fillRect(x, y + h - 2, w, 2);
  ctx.restore();
}

/** Заголовок «вывеской»: Rubik Mono One с тёмной ступенькой, как --title-shadow */
export function title(ctx, text, x, y, px, color = C.cream, align = 'left', step = 5) {
  ctx.save();
  ctx.font = font(400, px, DISPLAY);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.ink;
  ctx.fillText(text, x, y + step);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Картинка, вписанная в квадрат size с центром (cx, cy); нет картинки — ничего */
export function icon(ctx, img, cx, cy, size) {
  if (!img || !img.complete || !img.naturalWidth) return;
  const k = size / Math.max(img.naturalWidth, img.naturalHeight);
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

/** Кружок-значок со значком внутри (как .k-event-ic / .k-toast-ic): подложка, кольцо, картинка */
export function badge(ctx, img, cx, cy, r, fill, ring = '#ffffff') {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.08, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10,40,56,.28)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.84, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
  icon(ctx, img, cx, cy, r * 1.5);
}

/** Детерминированный «случай» для конфетти и т. п. */
export function rand(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Конфетти на холсте: t — мс с начала, n — сколько; цвета кита */
export function confetti(ctx, W, H, t, n = 90, seed = 7) {
  const r = rand(seed);
  const cols = [C.gold, C.coral, C.cream, C.good, C.special, C.info];
  ctx.save();
  for (let i = 0; i < n; i++) {
    const x0 = r() * W, sp = 0.18 + r() * 0.22, ph = r() * H, sw = 20 + r() * 40, rot = r() * 6;
    const y = ((ph + t * sp) % (H + 80)) - 40;
    const x = x0 + Math.sin(t / 600 + i) * sw;
    ctx.translate(x, y);
    ctx.rotate(rot + t / (400 + i * 7));
    ctx.fillStyle = cols[i % cols.length];
    ctx.fillRect(-9, -5, 18, 10);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.restore();
}

/** м:сс */
export const mmss = (sec) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, '0')}`;
