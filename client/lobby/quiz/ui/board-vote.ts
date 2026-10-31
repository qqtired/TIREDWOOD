// Табло «Во что играем?» — общий шаг перед любым режимом «Ракушки» — и «Итоги» любого режима.
// Четыре карточки режимов (значок, имя, счёт, цветные точки проголосовавших), полоска времени; итог — победитель
// крупно, остальные гаснут; ничья — короткая рулетка между равными. Перенос lab/quiz/v2/js/world/board-vote.js.
import { QZ, QZ_MODES, type QzBoard } from '../../../../shared/quiz/types.ts';
import { BOARD_H, BOARD_W, PAD, boardUi, centerText, timeBar } from './board-base.ts';
import { C, DISPLAY, badge, clip, confetti, fit, font, leftSec, nickColor, quizImg, rr, title, type Pic } from './paint.ts';

const CW = (BOARD_W - PAD * 2 - 36 * 3) / 4;
const CY = 196;
const CH = 640;
const cardX = (i: number): number => PAD + i * (CW + 36);
/** Рамка карточки режима i на табло (px холста) — для клика по табло */
export const cardRect = (i: number): { x: number; y: number; w: number; h: number } => ({ x: cardX(i), y: CY, w: CW, h: CH });
const ease = (k: number): number => 1 - (1 - k) ** 3;

/** Паузы бегущей подсветки при ничьей, мс (сумма 2000); дальше она стоит на победителе */
const DELAYS = [80, 80, 90, 100, 120, 140, 170, 210, 260, 330, 420];

/** Какая из равных карточек подсвечена через elapsed мс после начала ничьей: замедляется и встаёт на win */
export function spinPos(tied: readonly number[], win: number, elapsedMs: number): number {
  const n = tied.length;
  if (!n) return win;
  const end = Math.max(0, tied.indexOf(win));
  let k = end - DELAYS.length;
  while (k < 0) k += n * 10;
  let acc = 0, j = 0;
  for (const d of DELAYS) {
    acc += d;
    if (elapsedMs >= acc) j++;
    else break;
  }
  return tied[(k + j) % n];
}

interface Game { name: string; img: Pic; n: number; dots: string[]; off: string | null }

const games = (b: QzBoard): Game[] => QZ_MODES.map((m, i) => {
  const o = b.vote?.options[i];
  return { name: m.name, img: quizImg(m.icon), n: o?.n ?? 0, dots: (o?.who ?? []).map(nickColor), off: o?.off ?? null };
});

const plural = (n: number): string => (n % 10 === 1 && n % 100 !== 11 ? 'голос' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'голоса' : 'голосов');

/** Голосование: идёт подсчёт, ничья, победитель или «никто не выбрал» (b.vote есть, фон уже нарисован) */
export function paintVote(ctx: CanvasRenderingContext2D, b: QzBoard, nowMs: number, W: number, H: number): void {
  const v = b.vote!;
  const toEnd = b.endsAt - nowMs;
  if (v.nobody) return nobody(ctx, W);
  const spin = !!v.spin;
  const win = !spin && v.win >= 0;
  // A1: победитель выбран кнопкой «Ещё раз!» — «Играем снова»
  const head = spin ? 'НИЧЬЯ!' : win ? (v.again ? 'ИГРАЕМ СНОВА!' : 'ИГРАЕМ!') : 'ВО ЧТО ИГРАЕМ?';
  title(ctx, head, PAD, 104, 80, spin ? C.gold : C.cream, 'left', 6);
  if (!spin && !win) {
    ctx.save();
    ctx.font = font(800, 62);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.creamDim;
    const s = leftSec(b.endsAt, nowMs);
    const tm = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    ctx.fillText(`${v.closing ? 'все проголосовали' : `голосов ${v.voted} из ${v.people}`} · ${tm}`, W - PAD, 108);
    ctx.restore();
  }
  const gs = games(b);
  const max = Math.max(1, ...gs.map((g) => (g.off ? 0 : g.n)));
  const spinAt = spin ? spinPos(v.spin!.tied, v.spin!.win, QZ.SPIN_MS - toEnd) : -1;
  const winMs = QZ.WIN_MS - toEnd;
  gs.forEach((g, i) => {
    let dim = 0, hot = false;
    if (!spin && !win) hot = !g.off && ((g.n === max && v.voted > 0) || boardUi.card === i);
    if (spin) { dim = v.spin!.tied.includes(i) ? 0 : 0.75; hot = spinAt === i; }
    // победа: остальные гаснут до нуля, из-под победителя ничего не торчит
    if (win) {
      if (i === v.win) return;
      dim = 0.75 + 0.25 * ease(Math.min(1, Math.max(0, winMs / 500)));
      if (dim >= 0.999) return;
    }
    card(ctx, g, cardX(i), CY, CW, CH, { dim, hot, num: i + 1, t: nowMs, lift: !spin && !win && boardUi.card === i && !g.off });
  });
  if (win) winner(ctx, b, gs, winMs, nowMs, W, H);
  if (!spin && !win) {
    // F4: внутри двое — половина жетонов; один — без жетонов (бриф, «Жетоны»)
    if (b.halfTokens) centerText(ctx, 'Вдвоём — половина жетонов', W / 2, 900, 54, C.goldText, W - PAD * 2, 700);
    else if (b.noTokens) centerText(ctx, 'Один — без жетонов', W / 2, 900, 54, C.goldText, W - PAD * 2, 700);
    timeBar(ctx, toEnd / QZ.VOTE_MS, toEnd <= 5000, W, H);
  }
}

interface CardOpts { dim?: number; hot?: boolean; num?: number; t: number; lift?: boolean }

function card(ctx: CanvasRenderingContext2D, g: Game, x: number, y0: number, w: number, h: number, o: CardOpts): void {
  const { dim = 0, hot = false, num, t, lift = false } = o;
  const y = lift ? y0 - 12 : y0;
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
    ctx.strokeStyle = `rgba(255, 205, 74, ${0.75 + 0.25 * Math.sin(t / 160)})`;
    ctx.stroke();
  }
  // номер клавиши
  if (num) {
    ctx.beginPath();
    ctx.arc(x + 54, y + 54, 34, 0, Math.PI * 2);
    ctx.fillStyle = g.off ? 'rgba(10, 59, 55, .25)' : C.gold;
    ctx.fill();
    ctx.font = font(800, 44);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = g.off ? C.cream : C.goldInk;
    ctx.fillText(String(num), x + 54, y + 57);
  }
  ctx.globalAlpha = (1 - dim) * (g.off ? 0.45 : 1);
  badge(ctx, g.img, x + w / 2, y + 170, 112, g.off ? '#d9d4cc' : C.cream2, C.ink);
  ctx.globalAlpha = 1 - dim;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const px = fit(ctx, g.name, 800, 70, w - 50, undefined, 40);
  ctx.font = font(800, px);
  ctx.fillStyle = g.off ? C.cream : C.plateInk;
  ctx.fillText(g.name, x + w / 2, y + 350);
  if (g.off) {
    ctx.font = font(700, 54);
    ctx.fillStyle = C.cream;
    ctx.fillText(clip(ctx, g.off, w - 40), x + w / 2, y + 470);
  } else {
    ctx.font = font(400, 128, DISPLAY);
    ctx.fillStyle = g.n ? C.enamelSolid : 'rgba(14, 85, 80, .28)';
    ctx.fillText(String(g.n), x + w / 2, y + 476);
    dots(ctx, g.dots, x + w / 2, y + 580, w - 60);
  }
  ctx.restore();
}

/** Цветные точки проголосовавших: по цвету ника, в один-два ряда */
function dots(ctx: CanvasRenderingContext2D, list: readonly string[], cx: number, cy: number, maxW: number): void {
  if (!list.length) return;
  const r = 20, step = 52, per = Math.max(1, Math.floor(maxW / step));
  list.slice(0, per * 2).forEach((col, i) => {
    const row = Math.floor(i / per), inRow = Math.min(per, list.length - row * per);
    const x = cx - ((inRow - 1) * step) / 2 + (i % per) * step, y = cy + row * 50 - (list.length > per ? 25 : 0);
    ctx.beginPath();
    ctx.arc(x, y + 4, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10, 59, 55, .35)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  });
}

/** Победитель вырастает из своей карточки в центр */
function winner(ctx: CanvasRenderingContext2D, b: QzBoard, gs: Game[], winMs: number, t: number, W: number, H: number): void {
  const v = b.vote!;
  const g = gs[v.win];
  if (!g) return;
  confetti(ctx, W, H, t, 110, 5);
  const k = ease(Math.min(1, Math.max(0, winMs / 600)));
  const bw = 1060, bh = 720, fx = cardX(v.win), tx = (W - bw) / 2;
  const x = fx + (tx - fx) * k, y = CY + (150 - CY) * k, w = CW + (bw - CW) * k, h = CH + (bh - CH) * k;
  ctx.save();
  rr(ctx, x, y + 12, w, h, 44);
  ctx.fillStyle = C.ink;
  ctx.fill();
  rr(ctx, x, y, w, h, 44);
  ctx.fillStyle = C.cream;
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = C.gold;
  ctx.stroke();
  ctx.globalAlpha = k;
  badge(ctx, g.img, x + w / 2, y + 210, 160, C.cream2, C.ink);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const name = g.name.toUpperCase();
  const px = fit(ctx, name, 400, 112, w - 120, DISPLAY, 60);
  ctx.font = font(400, px, DISPLAY);
  ctx.fillStyle = C.enamelSolid;
  ctx.fillText(name, x + w / 2, y + 470);
  if (!v.again) { // «Ещё раз!» — заголовок «ИГРАЕМ СНОВА!» уже всё сказал, подпись не нужна
    ctx.font = font(800, 62);
    ctx.fillStyle = C.plateDim;
    ctx.fillText(clip(ctx, v.why || `${g.n} ${plural(g.n)}`, w - 80), x + w / 2, y + 598);
  }
  ctx.restore();
}

/** 0 голосов: «Никто не выбрал» — потом снова «Игры нет» */
function nobody(ctx: CanvasRenderingContext2D, W: number): void {
  title(ctx, 'НИКТО НЕ ВЫБРАЛ', W / 2, 330, 110, C.cream, 'center', 8);
  centerText(ctx, 'Начать снова — кнопкой «Сыграем?»', W / 2, 520, 70, C.creamDim, W - PAD * 2, 700);
  const w = 230, gap = 40, x0 = (W - (w * 4 + gap * 3)) / 2;
  QZ_MODES.forEach((m, i) => {
    ctx.save();
    ctx.globalAlpha = 0.45;
    badge(ctx, quizImg(m.icon), x0 + i * (w + gap) + w / 2, 740, 90, C.cream2, C.ink);
    ctx.restore();
  });
}

/** Ждём игроков: табло зовёт сесть */
export function paintIdle(ctx: CanvasRenderingContext2D, b: QzBoard, W: number, H: number): void {
  title(ctx, 'ВО ЧТО ИГРАЕМ?', W / 2, 180, 118, C.cream, 'center', 8);
  centerText(ctx, b.seated >= 2 ? 'Начать — кнопкой «Сыграем?»' : 'Сядут двое — Затейник откроет голосование', W / 2, 310, 64, C.creamDim, W - PAD * 2, 700);
  const w = 420, gap = 40, x0 = (W - (w * 4 + gap * 3)) / 2;
  QZ_MODES.forEach((m, i) => {
    const x = x0 + i * (w + gap), y = 420;
    ctx.save();
    rr(ctx, x, y, w, 400, 30);
    ctx.fillStyle = 'rgba(255, 244, 220, .08)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 244, 220, .18)';
    ctx.stroke();
    badge(ctx, quizImg(m.icon), x + w / 2, y + 150, 100, C.cream2, C.ink);
    ctx.font = font(800, fit(ctx, m.name, 800, 60, w - 40, undefined, 36));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.cream;
    ctx.fillText(m.name, x + w / 2, y + 310);
    ctx.restore();
  });
  centerText(ctx, b.seated > 0 ? `сидят: ${b.seated}` : 'Садись на стул — сыграем!', W / 2, H - 120, 58, C.goldText);
}

/** «ИТОГИ · Загадка»: топ-3 крупно, справа «счёт вечера» (до 5 строк) или титулы, в подвале — до голосования */
export function paintResults(ctx: CanvasRenderingContext2D, b: QzBoard, nowMs: number, W: number, H: number): void {
  const res = b.results!;
  const name = QZ_MODES.find((m) => m.id === res.mode)?.name ?? 'Игра';
  const elapsed = QZ.RESULTS_MS - (res.endsAt - nowMs);
  const left = leftSec(res.endsAt, nowMs);
  if (elapsed < 2600) confetti(ctx, W, H, nowMs, 90, 3);
  title(ctx, 'ИТОГИ', PAD, 104, 80, C.cream, 'left', 6);
  ctx.save();
  ctx.font = font(400, 80, DISPLAY);
  const tw = ctx.measureText('ИТОГИ').width;
  ctx.font = font(800, 84);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = C.goldText;
  ctx.fillText(clip(ctx, `·  ${name}`, 1240 - tw), PAD + tw + 36, 108);
  ctx.restore();
  const PLACE: Array<[string, string]> = [[C.gold, C.goldInk], ['#d9dee6', '#26303d'], ['#d99a63', '#3a1d08']];
  // ноль у всех — мест нет: «Без очков», а не «1» у каждого
  const top = (res.top[0]?.pts ?? 0) > 0 ? res.top.slice(0, 3) : [];
  if (!top.length) centerText(ctx, 'Без очков — в следующий раз!', 700, 440, 64, C.creamDim, 1240, 700);
  top.forEach((p, i) => {
    const place = 1 + top.filter((q) => q.pts > p.pts).length;
    const y = 200 + i * 196, x = PAD, w = 1200, h = 170, [bg, fg] = PLACE[Math.min(2, place - 1)];
    ctx.save();
    rr(ctx, x, y + 8, w, h, 30);
    ctx.fillStyle = C.ink;
    ctx.fill();
    rr(ctx, x, y, w, h, 30);
    ctx.fillStyle = place === 1 ? C.cream : C.cream2;
    ctx.fill();
    if (place === 1) { ctx.lineWidth = 10; ctx.strokeStyle = C.gold; ctx.stroke(); }
    ctx.beginPath();
    ctx.arc(x + 94, y + h / 2, 58, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.font = font(800, 70);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fg;
    ctx.fillText(String(place), x + 94, y + h / 2 + 3);
    ctx.font = font(400, 96, DISPLAY);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.enamelSolid;
    const pts = String(p.pts);
    ctx.fillText(pts, x + w - 40, y + h / 2 + 6);
    const pw = ctx.measureText(pts).width;
    ctx.textAlign = 'left';
    ctx.font = font(800, fit(ctx, p.nick, 800, 96, w - 230 - pw - 60, undefined, 56));
    ctx.fillStyle = C.plateInk;
    ctx.fillText(clip(ctx, p.nick, w - 230 - pw - 60), x + 184, y + h / 2 + 4);
    ctx.restore();
  });
  // справа — титулы («Кто из нас?») или счёт вечера
  const rx = 1340, rw = W - PAD - rx;
  ctx.save();
  ctx.font = font(800, 48);
  ctx.letterSpacing = '4px';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = C.goldText;
  // пустой счёт вечера (очков ещё ни у кого) — без заголовка над пустотой
  if (res.titles?.length || b.evening.length) ctx.fillText(res.titles?.length ? 'ТИТУЛЫ' : 'СЧЁТ ВЕЧЕРА', rx, 214);
  ctx.letterSpacing = '0px';
  if (res.titles?.length) {
    res.titles.slice(0, 5).forEach((t, i) => {
      const y = 290 + i * 112;
      ctx.font = font(800, 56);
      ctx.fillStyle = C.cream;
      ctx.fillText(clip(ctx, t.nick, rw), rx, y);
      ctx.font = font(700, 44);
      ctx.fillStyle = C.goldText;
      ctx.fillText(clip(ctx, `«${t.title}»`, rw), rx, y + 50);
    });
  } else {
    b.evening.slice(0, 5).forEach((p, i) => {
      const y = 300 + i * 112;
      ctx.font = font(800, 64);
      ctx.textAlign = 'right';
      ctx.fillStyle = C.cream;
      const pts = String(p.pts);
      ctx.fillText(pts, W - PAD, y);
      const pw = ctx.measureText(pts).width;
      ctx.textAlign = 'left';
      ctx.fillStyle = C.creamDim;
      ctx.fillText(clip(ctx, p.nick, rw - pw - 30), rx, y);
    });
  }
  ctx.restore();
  // подвал: пак «Своей игры» и до голосования
  ctx.save();
  ctx.font = font(800, 60);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = C.creamDim;
  if (res.pack) ctx.fillText(clip(ctx, `пак «${res.pack.title}»`, W - PAD * 2), PAD, 808);
  const lead = 'дальше — голосование · ';
  ctx.fillText(lead, PAD, 882);
  ctx.fillStyle = C.goldText;
  ctx.fillText(`0:${String(Math.min(59, left)).padStart(2, '0')}`, PAD + ctx.measureText(lead).width, 882);
  ctx.restore();
  timeBar(ctx, left / (QZ.RESULTS_MS / 1000), false, W, H);
}

export { BOARD_H, BOARD_W };
