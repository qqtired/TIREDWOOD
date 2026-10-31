// Табло «Загадки», новая раскладка раунда и шапки «ждём слово» (31.10.2026, включается ?board2 — см. board-riddle.ts).
// Владелец про прежнее табло: «тут отвратительный UI/UX нужно переделать, все накидано, намешано просто ужас». Палитра остаётся
// своя (решение №18: зелёная эмаль, крем, золото, коралл), меняем раскладку и порядок. Всё держится на одной сетке и одном
// наборе стилей: подпись раздела — eyebrow() (Rubik 800, капс, золото, 40 px); главный текст — Rubik 800 крем; числа и
// заголовок — Rubik Mono One; второстепенное — Rubik 700 creamDim 46 px. Решения владельца по этому табло сохранены:
// «тепло» — только число (цепочки догадок нет, она в карточке «Тепло» у каждого), подсказки без номеров, внизу по
// центру ничего важного (там макушка загадывающего), из зала ~480 px: крупно и мало, текст не мельче 40 px холста.
// Два стиля одной раскладки (на выбор владельцу): «lines» — только типографика и тонкие золотые линии; «panels» — колонки и
// шапка лежат на тёмных утопленных панелях C.track. Старый раунд в board-riddle.ts остаётся рядом — откат без ?board2.
import { QZ, type QzBoard, type QzRiddleBoard } from '../../../../shared/quiz/types.ts';
import { PAD, centerText, eyebrow, pill, timeBar } from './board-base.ts';
import { C, DISPLAY, TEXT, clip, fit, font, leftSec, mmss, rr, title, wrap } from './paint.ts';

export type RiddleStyle = 'lines' | 'panels';

/** Что «свежее» на табло: время последней вспышки «тепло» / «горячо» / новой подсказки (табло — без памяти, помним тут) */
export interface RiddleFlash { warmAt: number; hotAt: number; hintAt: number }

const NEVER = -1e9;
const memo = { key: '', warm: 0, hot: 0, hints: 0, at: { warmAt: NEVER, hotAt: NEVER, hintAt: NEVER } as RiddleFlash };

/** Заметить, что прибавилось «тепло» / «горячо» / подсказка с прошлого кадра; новая загадка начинает с чистого листа */
function track(r: QzRiddleBoard, nowMs: number): RiddleFlash {
  const key = `${r.riddler?.slot ?? 0}|${r.num}`;
  const hot = r.hot ?? 0;
  if (memo.key !== key) {
    memo.key = key;
    memo.at = { warmAt: NEVER, hotAt: NEVER, hintAt: NEVER };
  } else {
    if (r.warm > memo.warm) memo.at.warmAt = nowMs;
    if (hot > memo.hot) memo.at.hotAt = nowMs;
    if (r.hints.length > memo.hints) memo.at.hintAt = nowMs;
  }
  memo.warm = r.warm;
  memo.hot = hot;
  memo.hints = r.hints.length;
  return memo.at;
}

// ------------------------------------------------------------------ сетка (холст 2048 × 1024, PAD 70)

/** Горизонтальные линии: шапка (одна средняя линия), строка под ней, золотая черта, подписи колонок, нижняя строка */
const HEAD_Y = 108;
const SUB_Y = 194;
const RULE_Y = 244;
const LABEL_Y = 308;
const BODY_B = 852;
const FOOT_Y = 904;
const HINT_Y = 404;
const HINT_DY = 104;
const MISS_LABEL_Y = 716;
const MISS_Y = 802;
/** Золото тонких линий и бледный «0» */
const GOLD_LINE = 'rgba(255, 205, 74, .6)';
const GOLD_PALE = 'rgba(255, 214, 101, .3)';
/** Скругление панелей и отступ внутри них */
const PANEL_R = 34;
const PANEL_IN = 36;

interface Rect { x: number; y: number; w: number; h: number }

/** Где что стоит: содержимое шапки, левая колонка («тепло»), правая («подсказки», «мимо»); в «панелях» ещё и сами панели */
interface Geo {
  panels: boolean;
  hx0: number; hx1: number;
  lx: number; lw: number;
  rx: number; rw: number;
  /** Вертикальная золотая линия между колонками («Линии») */
  divX: number;
  head: Rect; left: Rect; right: Rect;
}

function geo(style: RiddleStyle, W: number): Geo {
  const x1 = W - PAD;
  const leftW = 520;
  if (style === 'panels') {
    const rightX = PAD + leftW + 30;
    return {
      panels: true,
      hx0: PAD + PANEL_IN, hx1: x1 - PANEL_IN,
      lx: PAD + PANEL_IN, lw: leftW - PANEL_IN * 2,
      rx: rightX + PANEL_IN, rw: x1 - rightX - PANEL_IN * 2,
      divX: 0,
      head: { x: PAD, y: 46, w: x1 - PAD, h: 194 },
      left: { x: PAD, y: 262, w: leftW, h: BODY_B - 262 },
      right: { x: rightX, y: 262, w: x1 - rightX, h: BODY_B - 262 },
    };
  }
  const divX = PAD + leftW + 40;
  const rightX = divX + 50;
  return {
    panels: false,
    hx0: PAD, hx1: x1,
    lx: PAD, lw: leftW,
    rx: rightX, rw: x1 - rightX,
    divX,
    head: { x: PAD, y: 46, w: x1 - PAD, h: 194 },
    left: { x: PAD, y: 262, w: leftW, h: BODY_B - 262 },
    right: { x: rightX, y: 262, w: x1 - rightX, h: BODY_B - 262 },
  };
}

/** Яркость вспышки 0…1 (0 — не горит): мигает ~1,8 с после события */
const pulse = (nowMs: number, at: number, ms = 1800): number => (nowMs - at < ms ? 0.6 + 0.4 * Math.sin(nowMs / 150) : 0);

// ------------------------------------------------------------------ детали

/** Тёмная утопленная панель: C.track, тёмная кромка сверху, тонкий светлый контур */
function panel(ctx: CanvasRenderingContext2D, r: Rect): void {
  ctx.save();
  rr(ctx, r.x, r.y, r.w, r.h, PANEL_R);
  ctx.fillStyle = C.track;
  ctx.fill();
  ctx.clip();
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + 22);
  g.addColorStop(0, 'rgba(0, 0, 0, .3)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, 22);
  ctx.restore();
  ctx.save();
  rr(ctx, r.x, r.y, r.w, r.h, PANEL_R);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 244, 220, .1)';
  ctx.stroke();
  ctx.restore();
}

/** Тонкая золотая линия (или толстая яркая — вспышка) на всю ширину x0…x1 на высоте y */
function bar(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, th: number, color: string): void {
  ctx.save();
  rr(ctx, x0, y - th / 2, x1 - x0, th, th / 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** Подпись раздела: eyebrow() на общей линии, под ней тонкая золотая черта (вспышка нового «тепло» / «горячо» — яркая и толстая) */
function section(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, color: string = C.goldText, flash?: { rgb: string; a: number }): void {
  eyebrow(ctx, text, x, y, color, 40);
  bar(ctx, x, x + w, y + 32, 3, GOLD_LINE);
  if (flash && flash.a > 0) bar(ctx, x, x + w, y + 32, 12, `rgba(${flash.rgb}, ${flash.a.toFixed(2)})`);
}

/** Число крупно по центру x: вывеской (с тёмной ступенькой, как заголовок); бледное («0») — без неё */
function bigNumber(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, px: number, color: string, pale = false): void {
  const s = fit(ctx, text, 400, px, maxW, DISPLAY, 90);
  // у Rubik Mono One цифры сидят выше baseline 'middle' на ~0,1 кегля — опускаем, чтобы y был серединой самой цифры
  const cy = y + s * 0.1;
  if (pale) {
    ctx.save();
    ctx.font = font(400, s, DISPLAY);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = GOLD_PALE;
    ctx.fillText(text, x, cy);
    ctx.restore();
    return;
  }
  title(ctx, text, x, cy, s, color, 'center', Math.max(5, Math.round(s * 0.035)));
}

// ------------------------------------------------------------------ шапка

interface HeadOpts {
  /** Тема раунда (золотая пилюля); '' — нет */
  category?: string;
  /** Время справа: секунды до конца раунда; null — не показывать */
  left: number | null;
  hurry?: boolean;
  /** Идёт проверка «угадал»: пилюля левее времени */
  checking?: boolean;
  /** Строка «загадывает …» слева под заголовком */
  who?: boolean;
  nowMs: number;
}

/** Общая шапка раунда и «ждём слово»: одна средняя линия — «ЗАГАДКА» + тема (пилюля), справа время; под ней строка
 *  «загадывает …» и «загадка N из M»; в «Линиях» ещё золотая черта на всю ширину, в «панелях» всё лежит на панели */
function head(ctx: CanvasRenderingContext2D, g: Geo, r: QzRiddleBoard, o: HeadOpts): void {
  if (g.panels) panel(ctx, g.head);
  title(ctx, 'ЗАГАДКА', g.hx0, HEAD_Y, 80, C.cream, 'left', 6);
  ctx.save();
  ctx.font = font(400, 80, DISPLAY);
  const tw = ctx.measureText('ЗАГАДКА').width;
  let timeW = 0;
  if (o.left !== null) {
    const text = mmss(o.left);
    ctx.font = font(400, 96, DISPLAY);
    timeW = ctx.measureText(text).width;
    title(ctx, text, g.hx1, HEAD_Y + 4, 96, o.hurry && Math.floor(o.nowMs / 500) % 2 === 0 ? C.coral : C.cream, 'right', 6);
  }
  ctx.restore();
  const PH = 84;
  let stop = g.hx1 - (timeW ? timeW + 50 : 0);
  if (o.checking) {
    // идёт проверка «угадал»: золотая пилюля левее времени, на той же линии
    stop -= pill(ctx, 'ПРОВЕРЯЕМ…', stop, HEAD_Y - PH / 2 - 5, PH, { fill: C.gold, ink: C.goldInk, px: 46, align: 'right' }) + 40;
  }
  if (o.category) {
    ctx.save();
    ctx.font = font(800, 48);
    const text = clip(ctx, o.category, Math.max(160, stop - (g.hx0 + tw + 44) - PH * 0.9));
    ctx.restore();
    pill(ctx, text, g.hx0 + tw + 44, HEAD_Y - PH / 2 - 5, PH, { fill: C.gold, ink: C.goldInk, px: 48 });
  }
  // вторая строка: кто загадывает — слева, какая по счёту — справа
  ctx.save();
  ctx.textBaseline = 'middle';
  if (o.who && r.riddler) {
    ctx.textAlign = 'left';
    ctx.font = font(700, 46);
    ctx.fillStyle = C.creamDim;
    ctx.fillText('загадывает', g.hx0, SUB_Y);
    const lead = ctx.measureText('загадывает ').width;
    ctx.font = font(800, 46);
    ctx.fillStyle = C.cream;
    ctx.fillText(clip(ctx, r.riddler.nick, 760), g.hx0 + lead, SUB_Y);
  }
  if (r.num) {
    ctx.textAlign = 'right';
    ctx.font = font(700, 46);
    ctx.fillStyle = C.creamDim;
    ctx.fillText(`загадка ${r.num} из ${r.of}`, g.hx1, SUB_Y);
  }
  ctx.restore();
  if (!g.panels) bar(ctx, g.hx0, g.hx1, RULE_Y, 4, GOLD_LINE);
}

// ------------------------------------------------------------------ колонки

/** Слева — «ТЕПЛО»: сколько тёплых догадок (сами догадки — в карточке у каждого), крупно золотом; есть «горячо» — ниже
 *  «ГОРЯЧО», число кораллом и последняя такая догадка кремом. Новое «тепло» / «горячо» вспыхивает чертой (панель — каймой) */
function warmColumn(ctx: CanvasRenderingContext2D, g: Geo, r: QzRiddleBoard, f: RiddleFlash, nowMs: number): void {
  const hot = r.hot ?? 0;
  const { lx: x, lw: w } = g;
  const cx = x + w / 2;
  section(ctx, 'ТЕПЛО', x, LABEL_Y, w, C.goldText, { rgb: '255, 205, 74', a: pulse(nowMs, f.warmAt) });
  if (!hot) {
    bigNumber(ctx, String(r.warm), cx, 598, w, 340, C.gold, r.warm === 0);
    return;
  }
  bigNumber(ctx, String(r.warm), cx, 416, w, 140, C.gold, r.warm === 0);
  section(ctx, 'ГОРЯЧО', x, 536, w, C.coral, { rgb: '255, 122, 92', a: pulse(nowMs, f.hotAt) });
  bigNumber(ctx, String(hot), cx, 648, w, 140, C.coral);
  const text = r.hotText ?? '';
  if (!text) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.cream;
  // догадка целиком — главное в ней само слово, часто в конце («…это пароход?»): две строки от 54 до 40 px, не влезла —
  // три строки по 40 (узкая колонка «Панелей»); многоточие — только если не влезла и в три
  let px = 54, lines: string[] = [];
  for (const s of [54, 48, 44, 40]) {
    px = s;
    ctx.font = font(800, px);
    lines = wrap(ctx, text, w, 9);
    if (lines.length <= 2) break;
  }
  if (lines.length > 2) lines = wrap(ctx, text, w, 3);
  const lh = lines.length > 2 ? 42 : px + 4;
  const y0 = lines.length === 1 ? 790 : lines.length === 2 ? 762 : 730;
  lines.forEach((ln, i) => ctx.fillText(ln, cx, y0 + i * lh));
  ctx.restore();
}

/** Справа — «ПОДСКАЗКИ» столбиком (без номеров: цифры путают с клавишами 1/2/3), ниже «МИМО» одной строкой */
function hintsColumn(ctx: CanvasRenderingContext2D, g: Geo, r: QzRiddleBoard, f: RiddleFlash, nowMs: number): void {
  const { rx: x, rw: w } = g;
  section(ctx, 'ПОДСКАЗКИ', x, LABEL_Y, w);
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const hints = r.hints.slice(-QZ.HINTS);
  if (!hints.length) {
    ctx.font = font(700, 72);
    ctx.fillStyle = C.creamFaint;
    ctx.fillText('пока нет', x, HINT_Y);
  }
  const DOT = 20, TX = 66;
  // один кегль на весь столбик — по самой длинной подсказке (96 → 56); не влезла и в 56 (до 40 знаков) — две строки по 56
  let px = 96;
  for (const h of hints) px = Math.min(px, fit(ctx, h, 800, 96, w - TX, TEXT, 56));
  hints.forEach((h, i) => {
    const y = HINT_Y + i * HINT_DY;
    ctx.beginPath();
    ctx.arc(x + DOT, y, DOT, 0, Math.PI * 2);
    ctx.fillStyle = C.gold;
    ctx.fill();
    // новая подсказка мигает белым кольцом
    if (i === hints.length - 1 && nowMs - f.hintAt < 2000) {
      ctx.lineWidth = 8;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 + 0.5 * Math.sin(nowMs / 160)})`;
      ctx.stroke();
    }
    ctx.font = font(800, px);
    ctx.fillStyle = C.cream;
    if (ctx.measureText(h).width <= w - TX) return void ctx.fillText(h, x + TX, y + 4);
    const lines = wrap(ctx, h, w - TX, 2);
    lines.forEach((ln, k) => ctx.fillText(ln, x + TX, y + 4 + (k - (lines.length - 1) / 2) * 56));
  });
  ctx.restore();
  const misses = r.misses.slice(-QZ.BOARD_MISSES).reverse();
  if (!misses.length) return;
  section(ctx, 'МИМО', x, MISS_LABEL_Y, w);
  // последние «мимо» — бледным и зачёркнутые; ширина делится поровну, длинное — с многоточием
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = font(700, 56);
  ctx.fillStyle = C.creamFaint;
  const GAP = 56, each = (w - GAP * (misses.length - 1)) / misses.length;
  let mx = x;
  for (const m of misses) {
    const t = clip(ctx, m, Math.max(120, Math.min(each * 1.4, w - (mx - x))));
    const tw = ctx.measureText(t).width;
    if (mx + tw > x + w) break;
    ctx.fillText(t, mx, MISS_Y);
    ctx.fillRect(mx - 4, MISS_Y + 5, tw + 8, 5);
    mx += tw + GAP;
  }
  ctx.restore();
}

/** «ДАЛЬШЕ  Оля, Петя +2» — очередь «Хочу загадать» одной строкой (до трёх имён); пусто — ничего */
function queueRow(ctx: CanvasRenderingContext2D, r: QzRiddleBoard, x: number, y: number, maxW: number, align: 'left' | 'center' = 'left'): void {
  const q = r.queue ?? [];
  if (!q.length) return;
  ctx.save();
  ctx.font = font(800, 40);
  ctx.letterSpacing = '4px';
  const lw = ctx.measureText('ДАЛЬШЕ').width + 30;
  ctx.letterSpacing = '0px';
  const names = q.slice(0, 3).map((p) => p.nick).join(', ') + (q.length > 3 ? ` +${q.length - 3}` : '');
  ctx.font = font(800, 54);
  const text = clip(ctx, names, Math.max(100, maxW - lw));
  const x0 = align === 'center' ? x - (lw + ctx.measureText(text).width) / 2 : x;
  ctx.restore();
  eyebrow(ctx, 'ДАЛЬШЕ', x0, y, C.goldText, 40);
  ctx.save();
  ctx.font = font(800, 54);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.cream;
  ctx.fillText(text, x0 + lw, y + 1);
  ctx.restore();
}

// ------------------------------------------------------------------ экраны

/** Раунд «Загадки» и проверка «угадал»; flash — явные времена вспышек (стенд), иначе табло помнит их само */
export function paintRiddleRound2(
  ctx: CanvasRenderingContext2D, b: QzBoard, r: QzRiddleBoard, nowMs: number, W: number, H: number, style: RiddleStyle = 'panels', flash?: RiddleFlash,
): void {
  const f = flash ?? track(r, nowMs);
  const g = geo(style, W);
  const total = r.total / 1000;
  const left = Math.max(0, (r.endsAt - nowMs) / 1000);
  const hurry = left <= 60;
  if (g.panels) {
    panel(ctx, g.left);
    panel(ctx, g.right);
  } else {
    bar(ctx, g.divX, g.divX + 3, (262 + BODY_B) / 2, BODY_B - 262, GOLD_LINE);
  }
  head(ctx, g, r, { category: r.category, left, hurry, checking: !!r.checking, who: true, nowMs });
  warmColumn(ctx, g, r, f, nowMs);
  hintsColumn(ctx, g, r, f, nowMs);
  queueRow(ctx, r, PAD, FOOT_Y, W - PAD * 2);
  timeBar(ctx, left / total, hurry, W, H);
}

/** Ждём слово: загадывающий пишет его у себя в окне. Шапка общая с раундом: время — в её правом углу, «ДАЛЬШЕ» — внизу слева,
 *  как в раунде (одно место для времени и очереди на обоих экранах) */
export function paintRiddleAsk2(ctx: CanvasRenderingContext2D, b: QzBoard, r: QzRiddleBoard, nowMs: number, W: number, H: number, style: RiddleStyle = 'panels'): void {
  const g = geo(style, W);
  const left = leftSec(b.endsAt, nowMs);
  head(ctx, g, r, { left: left > 0 ? left : null, hurry: left <= 10, nowMs });
  const who = r.riddler?.nick ?? '';
  const px = fit(ctx, `${who} загадывает…`, 800, 130, W - PAD * 2, TEXT, 60);
  centerText(ctx, `${who} загадывает…`, W / 2, 490, px, C.cream, W - PAD * 2);
  centerText(ctx, 'Придумывает слово — скоро начнём', W / 2, 650, 64, C.creamDim, W - PAD * 2, 700);
  queueRow(ctx, r, PAD, FOOT_Y, W - PAD * 2);
  timeBar(ctx, (b.endsAt - nowMs) / QZ.ASK_MS, left <= 10, W, H);
}
