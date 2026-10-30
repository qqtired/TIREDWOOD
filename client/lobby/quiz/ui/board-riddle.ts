// Табло «Загадки»: раунд (тема, «тепло», подсказки, «мимо», время), итог загадки, ожидание слова и вызов роли.
// Из зала табло ~480 px в ширину. Цепочки «тепло» на табло нет — она в карточке «Тепло» у каждого (слово владельца).
// Крупно и мало: тема, число «тепло», подсказки, «мимо», время, номер загадки. Внизу по центру ничего важного —
// там макушка загадывающего. Перенос lab/quiz/v2/js/world/board.js (paintRiddle).
import { QZ, QZ_MODES, type QzBoard, type QzRiddleBoard } from '../../../../shared/quiz/types.ts';
import { PAD, centerText, pill, timeBar } from './board-base.ts';
import { C, DISPLAY, TEXT, badge, clip, confetti, fit, font, icon, leftSec, mmss, quizImg, rr, title } from './paint.ts';

/** Что «свежее» на табло: новое «тепло» и новая подсказка вспыхивают на пару секунд (табло — без памяти, помним тут) */
const memo = { key: '', warm: 0, warmAt: -1e9, hot: 0, hotAt: -1e9, hints: 0, hintAt: -1e9 };

function fresh(r: QzRiddleBoard, nowMs: number): void {
  const key = `${r.riddler?.slot ?? 0}|${r.num}`;
  if (memo.key !== key) {
    memo.key = key;
    memo.warm = r.warm;
    memo.hot = r.hot ?? 0;
    memo.hints = r.hints.length;
    memo.warmAt = memo.hotAt = memo.hintAt = -1e9;
    return;
  }
  if (r.warm > memo.warm) memo.warmAt = nowMs;
  if ((r.hot ?? 0) > memo.hot) memo.hotAt = nowMs;
  if (r.hints.length > memo.hints) memo.hintAt = nowMs;
  memo.warm = r.warm;
  memo.hot = r.hot ?? 0;
  memo.hints = r.hints.length;
}

/** Табло «Загадки» по шагу: раунд / проверка, итог, ожидание слова, вызов */
export function paintRiddleBoard(ctx: CanvasRenderingContext2D, b: QzBoard, nowMs: number, W: number, H: number): void {
  const r = b.riddle!;
  if (r.step === 'round' || r.step === 'check') return round(ctx, b, r, nowMs, W, H);
  if (r.last) return end(ctx, b, r, nowMs, W, H);
  if (r.step === 'ask') return ask(ctx, b, r, nowMs, W, H);
  return paintRoles(ctx, b, nowMs, W, H);
}

function round(ctx: CanvasRenderingContext2D, b: QzBoard, r: QzRiddleBoard, nowMs: number, W: number, H: number): void {
  fresh(r, nowMs);
  const total = r.total / 1000;
  const left = Math.max(0, (r.endsAt - nowMs) / 1000);
  const hurry = left <= 60;
  // шапка: «ЗАГАДКА · тема» слева, время крупно справа
  title(ctx, 'ЗАГАДКА', PAD, 104, 80, C.cream, 'left', 6);
  ctx.save();
  ctx.font = font(400, 80, DISPLAY);
  const tw = ctx.measureText('ЗАГАДКА').width;
  if (r.category) {
    ctx.font = font(800, 84);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.goldText;
    ctx.fillText(clip(ctx, `·  ${r.category}`, 1180 - tw), PAD + tw + 36, 108);
  }
  ctx.font = font(400, 96, DISPLAY);
  const timeW = ctx.measureText(mmss(left)).width;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = hurry && Math.floor(nowMs / 500) % 2 === 0 ? C.coral : C.cream;
  ctx.fillText(mmss(left), W - PAD, 112);
  ctx.restore();
  // идёт проверка «угадал»: золотая пилюля между темой и временем
  if (r.checking) pill(ctx, 'ПРОВЕРЯЕМ…', W - PAD - timeW - 50, 62, 92, { fill: C.gold, ink: C.goldInk, px: 46, align: 'right' });
  // слева — «тепло»: сколько тёплых догадок (сами догадки — в карточке у каждого); есть «Горячо!» — карточка ниже, под ней «Горячо!»
  const hot = r.hot ?? 0;
  const bx = PAD, by = 200, bw = 620, bh = hot > 0 ? 380 : 560, kk = bh / 560;
  ctx.save();
  rr(ctx, bx, by + 9, bw, bh, 34);
  ctx.fillStyle = C.ink;
  ctx.fill();
  rr(ctx, bx, by, bw, bh, 34);
  ctx.fillStyle = C.cream;
  ctx.fill();
  if (nowMs - memo.warmAt < 1800) {
    ctx.lineWidth = 14;
    ctx.strokeStyle = `rgba(255, 205, 74, ${0.6 + 0.4 * Math.sin(nowMs / 150)})`;
    ctx.stroke();
  }
  badge(ctx, quizImg('q-warm'), bx + bw / 2, by + 130 * kk, 92 * kk, C.good);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(800, Math.round(70 * kk));
  ctx.fillStyle = C.goodLo;
  ctx.fillText('ТЕПЛО', bx + bw / 2, by + 284 * kk);
  ctx.font = font(400, Math.round(210 * kk), DISPLAY);
  ctx.fillStyle = r.warm ? C.enamelSolid : 'rgba(14, 85, 80, .28)';
  ctx.fillText(String(r.warm), bx + bw / 2, by + 436 * kk);
  ctx.restore();
  if (hot > 0) hotCard(ctx, r, bx, by + bh + 28, bw, nowMs);
  // справа — подсказки, без номеров (цифры путают с клавишами 1/2/3)
  const rx = bx + bw + 70, rw = W - PAD - rx;
  ctx.save();
  ctx.font = font(800, 54);
  ctx.letterSpacing = '6px';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.goldText;
  ctx.fillText('ПОДСКАЗКИ', rx, 236);
  ctx.letterSpacing = '0px';
  const hints = r.hints.slice(-3);
  if (!hints.length) {
    ctx.font = font(700, 72);
    ctx.fillStyle = C.creamFaint;
    ctx.fillText('пока нет', rx, 350);
  }
  hints.forEach((h, i) => {
    const y = 350 + i * 150;
    ctx.beginPath();
    ctx.arc(rx + 22, y, 22, 0, Math.PI * 2);
    ctx.fillStyle = C.gold;
    ctx.fill();
    if (i === hints.length - 1 && nowMs - memo.hintAt < 2000) {
      ctx.lineWidth = 8;
      ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(nowMs / 160)})`;
      ctx.stroke();
    }
    const px = fit(ctx, h, 800, 100, rw - 80, TEXT, 64);
    ctx.font = font(800, px);
    ctx.fillStyle = C.cream;
    ctx.fillText(clip(ctx, h, rw - 80), rx + 72, y + 4);
  });
  ctx.restore();
  // A3: очередь «Хочу загадать» — под подсказками, одной строкой
  queueLine(ctx, r, rx, 786, rw);
  // внизу слева — «мимо» одной строкой (по центру снизу — макушка загадывающего), справа — номер загадки
  const misses = r.misses.slice(-QZ.BOARD_MISSES).reverse();
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  if (misses.length) {
    icon(ctx, quizImg('q-miss'), PAD + 36, 862, 70);
    ctx.font = font(700, 66);
    let mx = PAD + 96;
    for (const m of misses) {
      const tm = clip(ctx, m, 380), w = ctx.measureText(tm).width;
      if (mx + w > 1000) break;
      ctx.fillStyle = 'rgba(255, 244, 220, .6)';
      ctx.fillText(tm, mx, 864);
      ctx.fillRect(mx - 4, 866, w + 8, 6);
      mx += w + 54;
    }
  }
  if (r.num) {
    ctx.font = font(800, 62);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.creamDim;
    ctx.fillText(`загадка ${r.num} из ${r.of}`, W - PAD, 864);
  }
  ctx.restore();
  timeBar(ctx, left / total, hurry, W, H);
}

/** C1: «Горячо!» — крупно под карточкой «Тепло»: сколько и последняя такая догадка (вспыхивает красной рамкой) */
function hotCard(ctx: CanvasRenderingContext2D, r: QzRiddleBoard, x: number, y: number, w: number, nowMs: number): void {
  const h = 172;
  ctx.save();
  rr(ctx, x, y + 9, w, h, 34);
  ctx.fillStyle = C.ink;
  ctx.fill();
  rr(ctx, x, y, w, h, 34);
  ctx.fillStyle = C.cream;
  ctx.fill();
  ctx.lineWidth = nowMs - memo.hotAt < 1800 ? 14 : 8;
  ctx.strokeStyle = nowMs - memo.hotAt < 1800 ? `rgba(229, 72, 77, ${0.65 + 0.35 * Math.sin(nowMs / 150)})` : C.bad;
  ctx.stroke();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = font(800, 56);
  ctx.fillStyle = C.badLo;
  ctx.fillText('ГОРЯЧО!', x + 40, y + 52);
  ctx.textAlign = 'right';
  ctx.font = font(400, 84, DISPLAY);
  ctx.fillStyle = C.bad;
  ctx.fillText(String(r.hot ?? 0), x + w - 40, y + 56);
  ctx.textAlign = 'left';
  const text = r.hotText ?? '';
  if (text) {
    const px = fit(ctx, text, 800, 74, w - 80, TEXT, 40);
    ctx.font = font(800, px);
    ctx.fillStyle = C.plateInk;
    ctx.fillText(clip(ctx, text, w - 80), x + 40, y + 124);
  }
  ctx.restore();
}

/** A3: «ДАЛЬШЕ  Оля, Петя +2» — очередь «Хочу загадать» одной строкой (до трёх имён); пусто — ничего */
function queueLine(ctx: CanvasRenderingContext2D, r: QzRiddleBoard, x: number, y: number, maxW: number, align: 'left' | 'center' = 'left'): void {
  const q = r.queue ?? [];
  if (!q.length) return;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = font(800, 40);
  ctx.letterSpacing = '4px';
  const lead = 'ДАЛЬШЕ';
  const lw = ctx.measureText(lead).width + 26;
  ctx.letterSpacing = '0px';
  const names = q.slice(0, 3).map((p) => p.nick).join(', ') + (q.length > 3 ? ` +${q.length - 3}` : '');
  ctx.font = font(800, 54);
  const text = clip(ctx, names, Math.max(100, maxW - lw));
  const x0 = align === 'center' ? x - (lw + ctx.measureText(text).width) / 2 : x;
  ctx.font = font(800, 40);
  ctx.letterSpacing = '4px';
  ctx.fillStyle = C.goldText;
  ctx.fillText(lead, x0, y);
  ctx.letterSpacing = '0px';
  ctx.font = font(800, 54);
  ctx.fillStyle = C.cream;
  ctx.fillText(text, x0 + lw, y + 1);
  ctx.restore();
}

/** Итог загадки: слово во всё табло, кто угадал (или кто ушёл), «счёт вечера». «Дальше загадывает…» — только на плашке */
function end(ctx: CanvasRenderingContext2D, b: QzBoard, r: QzRiddleBoard, nowMs: number, W: number, H: number): void {
  const last = r.last!;
  const win = last.end === 'solved';
  if (win && r.step === 'reveal') confetti(ctx, W, H, nowMs, 120, 11);
  const nick = (last.riddler.nick || '').toUpperCase();
  const head = win ? 'РАЗГАДАЛИ!' : last.end === 'left' ? `${nick} УШЁЛ` : last.end === 'swap' ? 'МЕНЯЕМ ИГРУ' : last.end === 'empty' ? 'ВСЕ УШЛИ' : 'НЕ УГАДАЛИ';
  title(ctx, clip(ctx, head, 1800), W / 2, 130, 96, win ? C.gold : C.coral, 'center', 7);
  ctx.save();
  const word = last.answer.toUpperCase();
  const px = fit(ctx, word, 400, 180, 1640, DISPLAY, 80);
  ctx.font = font(400, px, DISPLAY);
  const ww = Math.max(760, ctx.measureText(word).width + 200);
  const bx = (W - ww) / 2, by = 220, bh = 280;
  rr(ctx, bx, by + 12, ww, bh, 44);
  ctx.fillStyle = C.ink;
  ctx.fill();
  rr(ctx, bx, by, ww, bh, 44);
  ctx.fillStyle = win ? C.cream : C.cream2;
  ctx.fill();
  if (win) { ctx.lineWidth = 12; ctx.strokeStyle = C.gold; ctx.stroke(); }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.enamelSolid;
  ctx.font = font(400, px, DISPLAY);
  ctx.fillText(word, W / 2, by + bh / 2 + 10);
  if (win) badge(ctx, quizImg('q-win'), bx + ww - 14, by + 18, 74, C.gold, '#ffffff');
  ctx.restore();
  const sub = win ? `${last.solver?.nick ?? ''} угадал!`
    : last.end === 'left' ? 'загадка не в счёт'
      : last.end === 'swap' || last.end === 'empty' ? 'загадка не в счёт' : `Загадывал ${last.riddler.nick}`;
  centerText(ctx, sub, W / 2, 610, win ? 92 : 80, win ? C.cream : C.creamDim, 1800);
  // счёт вечера — очки раундов, не жетоны
  const ev = b.evening.slice(0, 4);
  if (ev.length) {
    ctx.save();
    ctx.font = font(800, 50);
    ctx.letterSpacing = '6px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.goldText;
    ctx.fillText('СЧЁТ ВЕЧЕРА', W / 2, 736);
    ctx.letterSpacing = '0px';
    ctx.restore();
    centerText(ctx, ev.map((p) => `${p.nick} ${p.pts}`).join('   ·   '), W / 2, 840, 70, C.cream, W - PAD * 2 - 40);
  }
}

/** Ждём слово: загадывающий пишет его у себя в окне */
function ask(ctx: CanvasRenderingContext2D, b: QzBoard, r: QzRiddleBoard, nowMs: number, W: number, H: number): void {
  title(ctx, 'ЗАГАДКА', PAD, 104, 80, C.cream, 'left', 6);
  ctx.save();
  ctx.font = font(800, 62);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.creamDim;
  ctx.fillText(`загадка ${r.num} из ${r.of}`, W - PAD, 108);
  ctx.restore();
  const left = leftSec(b.endsAt, nowMs);
  const who = r.riddler?.nick ?? '';
  const px = fit(ctx, `${who} загадывает…`, 800, 130, W - PAD * 2, TEXT, 60);
  centerText(ctx, `${who} загадывает…`, W / 2, 440, px, C.cream, W - PAD * 2);
  centerText(ctx, 'Придумывает слово — скоро начнём', W / 2, 600, 64, C.creamDim, W - PAD * 2, 700);
  if (left > 0) centerText(ctx, mmss(left), W / 2, 740, 70, C.goldText);
  queueLine(ctx, r, W / 2, 850, W - PAD * 2, 'center');
  timeBar(ctx, (b.endsAt - nowMs) / QZ.ASK_MS, left <= 10, W, H);
}

/** Что говорит табло, пока набирают роли (вызов): по режиму */
const ROLES: Record<string, [string, string]> = {
  riddle: ['Кто загадывает?', 'Первый, кто вызвался, придумывает слово'],
  jeopardy: ['Кто ведёт? Кто играет?', 'Ведущий один, играют до шести человек'],
  croc: ['Кто рисует?', 'Жми «Хочу рисовать» — рисуем по очереди'],
  whoofus: ['Садитесь — играют все, кто сидит', 'Нужно от четырёх человек'],
};

/** Набор ролей (шаг сцены roles и вызов между загадками): название игры, вопрос, сколько осталось */
export function paintRoles(ctx: CanvasRenderingContext2D, b: QzBoard, nowMs: number, W: number, H: number): void {
  const mode = QZ_MODES.find((m) => m.id === b.mode);
  const [q, sub] = ROLES[b.mode ?? 'riddle'] ?? ROLES.riddle;
  const name = (mode?.name ?? 'Игра').toUpperCase();
  const px = fit(ctx, name, 400, 124, W - PAD * 2, DISPLAY, 60);
  title(ctx, name, W / 2, 200, px, C.cream, 'center', 8);
  badge(ctx, quizImg(mode?.icon ?? 'scroll'), W / 2, 380, 110, C.cream2, C.ink);
  centerText(ctx, q, W / 2, 570, fit(ctx, q, 800, 100, W - PAD * 2, TEXT, 56), C.cream);
  centerText(ctx, sub, W / 2, 700, 58, C.creamDim, W - PAD * 2, 700);
  const left = leftSec(b.endsAt, nowMs);
  if (b.endsAt > 0 && left > 0) {
    centerText(ctx, mmss(left), W / 2, 820, 70, C.goldText);
    timeBar(ctx, (b.endsAt - nowMs) / QZ.CALL_MS, left <= 3, W, H);
  }
}

