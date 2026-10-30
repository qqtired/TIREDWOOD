// Табло «Своей игры», «Крокодила» и «Кто из нас?». Как board-riddle.ts: только canvas 2D, без DOM, всё по снимку QzBoard.
// Перенос lab/quiz/v2/js/world/boards-more.js; шаги, которых в обзоре не было (финал «Своей игры», вызов очереди,
// выбор слова), нарисованы тем же набором: крем-плашки на эмали, золото — «сейчас», крупный кегль.
import { QZ_CROC, QZ_WHO, type QzBoard, type QzContent, type QzCrocBoard, type QzJpBoard, type QzWhoBoard } from '../../../../shared/quiz/types.ts';
import { jpCountdown } from '../state.ts';
import { BOARD_H, BOARD_W, PAD, boardUi, centerText, head, timeBar } from './board-base.ts';
import { C, DISPLAY, TEXT, badge, clip, confetti, contain, fit, font, leftSec, mmss, quizImg, remoteImg, rr, title, wrap } from './paint.ts';

// ---------------------------------------------------------------- «Своя игра»

/** Клетка сетки «Своей игры» на табло (px холста 2048×1024): для невидимых кнопок по табло */
export function jpCellRect(r: number, c: number, rows = 6, cols = 5): { x: number; y: number; w: number; h: number; tw: number } {
  const top = 176, bottom = BOARD_H - 50, gx = 12, gy = 12, tw = 600;
  const cw = (BOARD_W - PAD * 2 - tw - gx * cols) / cols, ch = (bottom - top - gy * (rows - 1)) / rows;
  return { x: PAD + tw + gx + c * (cw + gx), y: top + r * (ch + gy), w: cw, h: ch, tw };
}

/** Карточка пака i на табло «Какой пак?» */
export function packRect(i: number): { x: number; y: number; w: number; h: number } {
  const w = 600, gap = 34, x0 = (BOARD_W - (w * 3 + gap * 2)) / 2;
  return { x: x0 + i * (w + gap), y: 210, w, h: 600 };
}

const nickOf = (jp: QzJpBoard, slot: number): string => jp.players.find((p) => p.slot === slot)?.nick ?? '';
const stepBar = (ctx: CanvasRenderingContext2D, jp: QzJpBoard, nowMs: number, W: number, H: number, y = H - 48, hurry = 3): void => {
  if (!jp.endsAt || !jp.total) return;
  timeBar(ctx, (jp.endsAt - nowMs) / jp.total, jp.endsAt - nowMs <= hurry * 1000, W, H, y, 16);
};

export function paintJeopardyBoard(ctx: CanvasRenderingContext2D, b: QzBoard, nowMs: number, W: number, H: number): void {
  const jp = b.jp!;
  switch (jp.step) {
    case 'setup': return jpSetup(ctx, jp, nowMs, W, H);
    case 'packvote': return jpPacks(ctx, jp, nowMs, W, H);
    case 'pick': case 'cat': return jpGrid(ctx, jp, nowMs, W, H);
    case 'fremove': case 'fbet': case 'fanswer': case 'fjudge': case 'freveal': return jpFinal(ctx, jp, nowMs, W, H);
    default: return jp.q ? jpQuestion(ctx, jp, nowMs, W, H) : jpGrid(ctx, jp, nowMs, W, H);
  }
}

/** Ведущий-человек выбирает пак и темы */
function jpSetup(ctx: CanvasRenderingContext2D, jp: QzJpBoard, nowMs: number, W: number, H: number): void {
  head(ctx, 'СВОЯ ИГРА', '', W);
  const who = jp.host?.nick ?? 'Ведущий';
  centerText(ctx, `${who} выбирает пак и темы`, W / 2, 400, fit(ctx, `${who} выбирает пак и темы`, 800, 100, W - PAD * 2, TEXT, 56), C.cream);
  if (jp.players.length) {
    const names = jp.players.map((p) => p.nick).join(', ');
    centerText(ctx, `Играют: ${names}`, W / 2, 570, 60, C.creamDim, W - PAD * 2, 700);
  }
  const left = leftSec(jp.endsAt, nowMs);
  if (jp.endsAt) centerText(ctx, mmss(left), W / 2, 720, 70, C.goldText);
  stepBar(ctx, jp, nowMs, W, H, H - 64, 10);
}

/** Выбор пака залом (ведёт Затейник): 3 карточки, счёт голосов, полоска времени */
function jpPacks(ctx: CanvasRenderingContext2D, jp: QzJpBoard, nowMs: number, W: number, H: number): void {
  head(ctx, 'КАКОЙ ПАК?', 'клик по табло или 1–3', W);
  const packs = jp.packs ?? [];
  const max = Math.max(1, ...packs.map((p) => p.n));
  packs.forEach((p, i) => {
    const r = packRect(i), hot = p.n === max && p.n > 0, hover = boardUi.pack === i;
    ctx.save();
    rr(ctx, r.x, r.y + 9, r.w, r.h, 34);
    ctx.fillStyle = C.ink;
    ctx.fill();
    rr(ctx, r.x, r.y, r.w, r.h, 34);
    ctx.fillStyle = hover ? '#fff8e6' : C.cream;
    ctx.fill();
    if (hot || hover) { ctx.lineWidth = 14; ctx.strokeStyle = C.gold; ctx.stroke(); }
    ctx.beginPath();
    ctx.arc(r.x + 58, r.y + 58, 36, 0, Math.PI * 2);
    ctx.fillStyle = C.gold;
    ctx.fill();
    ctx.font = font(800, 46);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.goldInk;
    ctx.fillText(String(i + 1), r.x + 58, r.y + 61);
    badge(ctx, quizImg('bell'), r.x + r.w / 2, r.y + 160, 92, C.cream2, C.ink);
    ctx.font = font(800, fit(ctx, p.title, 800, 72, r.w - 60, TEXT, 40));
    ctx.fillStyle = C.plateInk;
    ctx.fillText(clip(ctx, p.title, r.w - 60), r.x + r.w / 2, r.y + 320);
    ctx.font = font(700, 44);
    ctx.fillStyle = C.plateDim;
    ctx.fillText(clip(ctx, p.sub, r.w - 50), r.x + r.w / 2, r.y + 392);
    ctx.font = font(400, 120, DISPLAY);
    ctx.fillStyle = p.n ? C.enamelSolid : 'rgba(14, 85, 80, .28)';
    ctx.fillText(String(p.n), r.x + r.w / 2, r.y + 510);
    ctx.restore();
  });
  stepBar(ctx, jp, nowMs, W, H, H - 64, 3);
}

/** Сетка: темы строками, цены столбцами; сыгранные клетки гаснут */
function jpGrid(ctx: CanvasRenderingContext2D, jp: QzJpBoard, nowMs: number, W: number, H: number): void {
  title(ctx, 'СВОЯ ИГРА', PAD, 104, 70, C.cream, 'left', 5);
  const left = jp.themes.reduce((a, th) => a + th.cells.filter(Boolean).length, 0);
  ctx.save();
  ctx.textBaseline = 'middle';
  let rx = W - PAD;
  const turn = nickOf(jp, jp.turn);
  if (turn) {
    ctx.font = font(800, 60);
    const txt = `Ход: ${turn}`, w = Math.min(700, ctx.measureText(txt).width) + 70;
    rr(ctx, rx - w, 60, w, 96, 48);
    ctx.fillStyle = C.gold;
    ctx.fill();
    ctx.fillStyle = C.goldInk;
    ctx.textAlign = 'center';
    ctx.fillText(clip(ctx, txt, w - 60), rx - w / 2, 110);
    rx -= w + 40;
  }
  ctx.font = font(700, 46);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.creamDim;
  ctx.fillText(`${jp.round || 'раунд'} · осталось ${left}`, rx, 110);
  ctx.restore();
  const rows = Math.max(1, jp.themes.length), cols = Math.max(1, ...jp.themes.map((t) => t.cells.length), 5);
  const dim = jp.step === 'cat';
  jp.themes.forEach((th, r) => {
    const { y, h: ch, tw } = jpCellRect(r, 0, rows, cols);
    ctx.save();
    if (dim) ctx.globalAlpha = 0.35;
    rr(ctx, PAD, y, tw, ch, 18);
    ctx.fillStyle = 'rgba(3, 32, 30, .45)';
    ctx.fill();
    ctx.font = font(800, fit(ctx, th.name, 800, 62, tw - 50, TEXT, 36));
    ctx.fillStyle = C.cream;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(clip(ctx, th.name, tw - 50), PAD + 26, y + ch / 2 + 3);
    for (let c = 0; c < cols; c++) {
      const { x, w: cw } = jpCellRect(r, c, rows, cols), v = th.cells[c];
      const hov = !dim && !!v && boardUi.cell?.[0] === r && boardUi.cell?.[1] === c;
      rr(ctx, x, y, cw, ch, 18);
      if (v) {
        ctx.fillStyle = hov ? '#ffeec0' : C.cream;
        ctx.fill();
        ctx.font = font(800, 80);
        ctx.textAlign = 'center';
        ctx.fillStyle = C.enamelSolid;
        ctx.fillText(String(v), x + cw / 2, y + ch / 2 + 4);
        if (hov) { ctx.lineWidth = 18; ctx.strokeStyle = C.gold; ctx.stroke(); }
      } else {
        ctx.fillStyle = 'rgba(3, 32, 30, .3)';
        ctx.fill();
      }
    }
    ctx.restore();
  });
  if (dim) {
    // «Кот в мешке»: выбравший отдаёт вопрос игроку
    const w = 1300, h = 360, x = (W - w) / 2, y = (H - h) / 2 - 20;
    ctx.save();
    rr(ctx, x, y + 12, w, h, 44);
    ctx.fillStyle = C.ink;
    ctx.fill();
    rr(ctx, x, y, w, h, 44);
    ctx.fillStyle = C.cream;
    ctx.fill();
    ctx.lineWidth = 12;
    ctx.strokeStyle = C.gold;
    ctx.stroke();
    ctx.restore();
    title(ctx, 'КОТ В МЕШКЕ', W / 2, y + 100, 96, C.enamelSolid, 'center', 0);
    centerText(ctx, `${turn || 'Игрок'} отдаёт вопрос`, W / 2, y + 230, 70, C.plateInk, w - 100);
    centerText(ctx, mmss(leftSec(jp.endsAt, nowMs)), W / 2, y + 310, 54, C.plateDim);
  }
  if (jp.step === 'pick') stepBar(ctx, jp, nowMs, W, H, H - 38, 3);
}

const textOf = (parts: readonly QzContent[]): string => parts.flatMap((p) => (p.kind === 'text' ? [p.value] : [])).join(' ').trim();
const firstImage = (parts: readonly QzContent[], pack: string | undefined): HTMLImageElement | null => {
  const im = parts.find((p) => p.kind === 'image');
  return im && im.kind === 'image' && pack ? remoteImg(`/quiz/m/${pack}/${im.file}`) : null;
};
const hasAudio = (parts: readonly QzContent[]): boolean => parts.some((p) => p.kind === 'audio');

/** Вопрос на всё табло: тема и цена, текст (или картинка), снизу — кнопки скоро откроются / жми / кто отвечает; ответ */
function jpQuestion(ctx: CanvasRenderingContext2D, jp: QzJpBoard, nowMs: number, W: number, H: number): void {
  const q = jp.q!;
  const theme = q.theme.toUpperCase().slice(0, 18);
  head(ctx, theme, '', W);
  ctx.save();
  ctx.font = font(400, 70, DISPLAY);
  const tw = ctx.measureText(theme).width;
  rr(ctx, PAD + tw + 40, 62, 210, 92, 46);
  ctx.fillStyle = C.gold;
  ctx.fill();
  ctx.font = font(800, 62);
  ctx.fillStyle = C.goldInk;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(q.price ? String(q.price) : 'ФИНАЛ', PAD + tw + 145, 110);
  ctx.restore();
  if (jp.step === 'reveal') return jpAnswer(ctx, jp, nowMs, W, H);
  const pack = jp.pack?.id;
  const img = firstImage(q.content, pack);
  const text = textOf(q.content);
  if (img || (pack && q.content.some((p) => p.kind === 'image'))) {
    // картинка: текст в две строки сверху, картинка во всю середину
    ctx.save();
    ctx.font = font(800, 72);
    const lines = text ? wrap(ctx, text, W - PAD * 2 - 80, 2) : [];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.cream;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, 260 + i * 88));
    ctx.restore();
    const top = lines.length ? 260 + lines.length * 88 + 10 : 190;
    ctx.save();
    rr(ctx, PAD + 200, top, W - PAD * 2 - 400, H - 250 - top, 28);
    ctx.fillStyle = 'rgba(3, 32, 30, .35)';
    ctx.fill();
    ctx.clip();
    contain(ctx, img, PAD + 200, top, W - PAD * 2 - 400, H - 250 - top);
    ctx.restore();
  } else {
    ctx.save();
    ctx.font = font(800, 86);
    const lines = wrap(ctx, text || (hasAudio(q.content) ? 'Слушаем внимательно' : ''), W - PAD * 2 - 80, 5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.cream;
    const y0 = 500 - (lines.length - 1) * 54;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * 108));
    ctx.restore();
  }
  if (hasAudio(q.content) && (text || img)) centerText(ctx, 'играет звук', W - PAD - 220, 200, 44, C.goldText, 420, 700);
  // внизу — кто что делает по шагу
  const toEnd = (jp.endsAt - nowMs) / 1000;
  const who = jp.buzz?.nick ?? '';
  switch (jp.step) {
    case 'read': {
      // B3: за три секунды до открытия кнопок — 3 · 2 · 1 (текущая цифра золотая и крупнее)
      const dg = jpCountdown(jp.openAt, nowMs);
      if (dg) countdown(ctx, dg, W, H);
      else centerText(ctx, 'кнопки откроются…', W / 2, H - 120, 46, C.creamDim, W, 700);
      if (jp.total) timeBar(ctx, 1 - (jp.endsAt - nowMs) / jp.total, false, W, H);
      break;
    }
    case 'buzz':
      if (Math.floor(nowMs / 400) % 2 === 0) centerText(ctx, 'ЖМИ!', W / 2, H - 120, 58, C.goldText);
      stepBar(ctx, jp, nowMs, W, H, H - 64, 2);
      break;
    case 'answer': case 'judge': {
      const txt = jp.step === 'judge' ? 'Ведущий решает…' : `${who} отвечает`;
      pillBottom(ctx, txt, jp.step === 'answer' ? mmss(Math.ceil(toEnd)) : '', W, H);
      if (jp.said) centerText(ctx, `«${jp.said}»`, W / 2, H - 260, 56, C.cream, W - PAD * 2 - 200, 700);
      break;
    }
    case 'wrong':
      centerText(ctx, `${who ? `${who}: ` : ''}неверно`, W / 2, H - 150, 70, C.coral, W - PAD * 2);
      break;
    case 'dispute': {
      const d = jp.dispute;
      centerText(ctx, 'ОСПОРИЛИ — засчитать?', W / 2, H - 190, 62, C.goldText);
      if (d) centerText(ctx, `за ${d.yes} · против ${d.no}`, W / 2, H - 110, 54, C.cream);
      stepBar(ctx, jp, nowMs, W, H, H - 52, 2);
      break;
    }
    default:
  }
}

/** Отсчёт «3 · 2 · 1» внизу табло: прошедшие цифры гаснут, текущая — золотой кружок покрупнее */
function countdown(ctx: CanvasRenderingContext2D, now: number, W: number, H: number): void {
  const y = H - 150;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  [3, 2, 1].forEach((n, i) => {
    const x = W / 2 + (i - 1) * 200, on = n === now, past = n > now;
    const r = on ? 76 : 56;
    ctx.beginPath();
    ctx.arc(x, y + (on ? 8 : 5), r, 0, Math.PI * 2);
    ctx.fillStyle = C.ink;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = on ? C.gold : past ? 'rgba(255, 244, 220, .16)' : C.cream;
    ctx.fill();
    ctx.font = font(800, on ? 96 : 66);
    ctx.fillStyle = on ? C.goldInk : past ? 'rgba(255, 244, 220, .45)' : C.plateInk;
    ctx.fillText(String(n), x, y + 4);
  });
  ctx.restore();
}

function pillBottom(ctx: CanvasRenderingContext2D, txt: string, tm: string, W: number, H: number): void {
  ctx.save();
  ctx.font = font(800, 64);
  const a = ctx.measureText(txt).width, b2 = tm ? ctx.measureText(tm).width : 0, w = a + b2 + (tm ? 140 : 100);
  rr(ctx, (W - w) / 2, H - 206, w, 108, 54);
  ctx.fillStyle = C.gold;
  ctx.fill();
  ctx.fillStyle = C.goldInk;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(txt, (W - w) / 2 + 50, H - 150);
  if (tm) {
    ctx.globalAlpha = 0.75;
    ctx.fillText(tm, (W - w) / 2 + 50 + a + 40, H - 150);
  }
  ctx.restore();
}

/** Ответ на табло: верно / неверно / никто не знает, правильный ответ, комментарий */
function jpAnswer(ctx: CanvasRenderingContext2D, jp: QzJpBoard, nowMs: number, W: number, H: number): void {
  const q = jp.q!;
  const ok = jp.verdict === 'yes';
  const bad = jp.verdict === 'no';
  title(ctx, ok ? 'ВЕРНО!' : bad ? 'НЕВЕРНО' : 'НИКТО НЕ ЗНАЕТ', W / 2, 270, 110, ok ? C.gold : C.coral, 'center', 8);
  const text = jp.answer?.text ?? '';
  centerText(ctx, text, W / 2, 470, fit(ctx, text, 800, 110, W - PAD * 2 - 80, TEXT, 50), C.cream, W - PAD * 2 - 80);
  const by = jp.buzz?.nick;
  if (by && (ok || bad)) centerText(ctx, `${by} ${ok ? '+' : '−'}${q.price}`, W / 2, 610, 64, ok ? C.goodText : C.badText, W - PAD * 2, 700);
  const com = jp.answer?.comment ?? '';
  if (com) {
    ctx.save();
    ctx.font = font(700, 50);
    const lines = wrap(ctx, com, W - PAD * 2 - 200, 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.creamDim;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, 740 + i * 62));
    ctx.restore();
  }
  const im = jp.answer ? firstImage(jp.answer.reveal, jp.pack?.id) : null;
  if (im) {
    ctx.save();
    rr(ctx, W - PAD - 420, 180, 420, 300, 24);
    ctx.clip();
    contain(ctx, im, W - PAD - 420, 180, 420, 300);
    ctx.restore();
  }
  if (ok) confetti(ctx, W, H, nowMs, 70, 3);
}

/** Финал: убирают темы, ставки, ответы, проверка, раскрытие по одному */
function jpFinal(ctx: CanvasRenderingContext2D, jp: QzJpBoard, nowMs: number, W: number, H: number): void {
  const fin = jp.fin;
  head(ctx, 'ФИНАЛ', jp.step === 'fremove' ? 'убираем темы' : jp.step === 'fbet' ? 'ставки' : jp.step === 'freveal' ? 'ответы' : 'вопрос', W);
  const left = leftSec(jp.endsAt, nowMs);
  switch (jp.step) {
    case 'fremove': {
      const who = nickOf(jp, fin?.remover ?? 0);
      centerText(ctx, who ? `${who} убирает тему` : 'Убираем тему', W / 2, 240, 76, C.goldText);
      const themes = fin?.themes ?? [];
      themes.slice(0, 6).forEach((t, i) => {
        const w = 1500, h = 96, x = (W - w) / 2, y = 330 + i * 110;
        rr(ctx, x, y + 6, w, h, 28);
        ctx.fillStyle = C.ink;
        ctx.fill();
        rr(ctx, x, y, w, h, 28);
        ctx.fillStyle = C.cream;
        ctx.fill();
        ctx.font = font(800, fit(ctx, t, 800, 62, w - 80, TEXT, 36));
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = C.plateInk;
        ctx.fillText(clip(ctx, t, w - 80), W / 2, y + h / 2 + 3);
      });
      break;
    }
    case 'fbet': {
      centerText(ctx, 'Тайные ставки', W / 2, 250, 76, C.cream);
      jp.players.filter((p) => p.score > 0).forEach((p, i) => {
        const done = fin?.bet.includes(p.slot) ?? false;
        const y = 360 + i * 100;
        centerText(ctx, `${p.nick} — ${done ? 'поставил' : 'думает…'}`, W / 2, y, 64, done ? C.goodText : C.creamDim, W - PAD * 2, 800);
      });
      break;
    }
    case 'fanswer': case 'fjudge': {
      const q = jp.q;
      if (q) {
        ctx.save();
        ctx.font = font(800, 80);
        const lines = wrap(ctx, textOf(q.content), W - PAD * 2 - 80, 4);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = C.cream;
        const y0 = 450 - (lines.length - 1) * 48;
        lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * 96));
        ctx.restore();
        centerText(ctx, q.theme, W / 2, 230, 60, C.goldText);
      }
      const ans = fin?.answered.length ?? 0;
      const total = jp.players.filter((p) => p.score > 0).length;
      centerText(ctx, jp.step === 'fjudge' ? 'Ведущий проверяет ответы…' : `Ответили ${ans} из ${total}`, W / 2, H - 150, 56, C.creamDim, W - PAD * 2, 700);
      break;
    }
    case 'freveal': {
      const shown = fin?.shown ?? [];
      const ans = jp.answer?.text ?? '';
      if (ans) centerText(ctx, `Ответ: ${ans}`, W / 2, 240, 76, C.goldText, W - PAD * 2);
      shown.slice(-5).forEach((s, i) => {
        const w = 1700, h = 110, x = (W - w) / 2, y = 330 + i * 124;
        rr(ctx, x, y, w, h, 30);
        ctx.fillStyle = s.ok ? C.goodTint : C.cream;
        ctx.fill();
        ctx.lineWidth = 8;
        ctx.strokeStyle = s.ok ? C.good : C.coral;
        ctx.stroke();
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.font = font(800, 56);
        ctx.fillStyle = C.plateInk;
        ctx.fillText(clip(ctx, `${s.nick}: ${s.text || '—'}`, w - 330), x + 36, y + h / 2 + 3);
        ctx.textAlign = 'right';
        ctx.fillStyle = s.ok ? C.goodLo : C.badLo;
        ctx.fillText(`${s.ok ? '+' : '−'}${s.bet}`, x + w - 36, y + h / 2 + 3);
      });
      break;
    }
    default:
  }
  if (jp.step !== 'freveal' && left > 0) centerText(ctx, mmss(left), W - PAD - 120, 190, 54, C.goldText);
  stepBar(ctx, jp, nowMs, W, H, H - 48, 5);
}

// ---------------------------------------------------------------- «Крокодил»

/** Рамка рисунка 4:3 на табло (слева, крупно) — мольберт стоит сбоку и табло не закрывает */
export function crocRect(H = BOARD_H): { x: number; y: number; w: number; h: number } {
  const h = H - 236;
  return { x: PAD, y: 168, w: (h * 4) / 3, h };
}

export function paintCrocBoard(ctx: CanvasRenderingContext2D, b: QzBoard, nowMs: number, W: number, H: number): void {
  const c = b.croc!;
  switch (c.step) {
    case 'draw': return crocDraw(ctx, c, nowMs, W, H);
    case 'reveal': return crocReveal(ctx, c, nowMs, W, H);
    case 'words': return crocWords(ctx, c, nowMs, W, H);
    default: return crocQueue(ctx, c, nowMs, W, H);
  }
}

const crocBar = (ctx: CanvasRenderingContext2D, c: QzCrocBoard, nowMs: number, W: number, H: number, hurry: number): void => {
  if (c.endsAt > 0 && c.total > 0) timeBar(ctx, (c.endsAt - nowMs) / c.total, c.endsAt - nowMs <= hurry * 1000, W, H, H - 48, 16);
};

function crocDraw(ctx: CanvasRenderingContext2D, c: QzCrocBoard, nowMs: number, W: number, H: number): void {
  head(ctx, 'КРОКОДИЛ', c.drawer ? `рисует ${c.drawer.nick}` : `рисунок ${c.num} из ${c.of}`, W);
  const { x: cx, y: cy, w: cw, h: ch } = crocRect(H);
  rr(ctx, cx, cy + 8, cw, ch, 22);
  ctx.fillStyle = C.ink;
  ctx.fill();
  rr(ctx, cx, cy, cw, ch, 22);
  ctx.fillStyle = QZ_CROC_PAPER;
  ctx.fill();
  if (boardUi.drawing) {
    ctx.save();
    rr(ctx, cx, cy, cw, ch, 22);
    ctx.clip();
    ctx.drawImage(boardUi.drawing, cx, cy, cw, ch);
    ctx.restore();
  }
  // справа: буквы, кто угадал
  const rx = cx + cw + 60, rw = W - PAD - rx;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = font(800, 48);
  ctx.fillStyle = C.goldText;
  ctx.letterSpacing = '4px';
  ctx.fillText('СЛОВО', rx, 200);
  ctx.letterSpacing = '0px';
  ctx.font = font(400, fit(ctx, c.mask, 400, 120, rw, DISPLAY, 50), DISPLAY);
  ctx.fillStyle = C.cream;
  ctx.fillText(c.mask, rx, 300);
  ctx.font = font(800, 48);
  ctx.fillStyle = C.goodText;
  ctx.letterSpacing = '4px';
  ctx.fillText('УГАДАЛИ', rx, 430);
  ctx.letterSpacing = '0px';
  const gs = c.guessed;
  const showN = 4;
  gs.slice(0, showN).forEach((g, i) => {
    const y = 516 + i * 92;
    ctx.beginPath();
    ctx.arc(rx + 32, y, 32, 0, Math.PI * 2);
    ctx.fillStyle = C.good;
    ctx.fill();
    ctx.font = font(800, 40);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(i + 1), rx + 32, y + 2);
    ctx.textAlign = 'left';
    ctx.font = font(800, 68);
    ctx.fillStyle = C.cream;
    ctx.fillText(clip(ctx, g.nick, rw - 90 - (i === showN - 1 && gs.length > showN ? 150 : 0)), rx + 84, y + 2);
  });
  if (gs.length > showN) {
    ctx.font = font(800, 56);
    ctx.fillStyle = C.goodText;
    ctx.textAlign = 'right';
    ctx.fillText(`+${gs.length - showN}`, W - PAD, 516 + (showN - 1) * 92 + 2);
  }
  if (!gs.length) {
    ctx.font = font(700, 56);
    ctx.fillStyle = C.creamFaint;
    ctx.fillText('пока никто', rx, 516);
  }
  ctx.restore();
  crocBar(ctx, c, nowMs, W, H, 10);
}

const QZ_CROC_PAPER = '#fffdf7';

/** Круг «Крокодила»: кто рисует сейчас и кто в очереди */
function crocQueue(ctx: CanvasRenderingContext2D, c: QzCrocBoard, nowMs: number, W: number, H: number): void {
  head(ctx, 'КРОКОДИЛ', `рисунок ${c.num} из ${c.of}`, W);
  const rows: Array<{ nick: string; state: 'now' | 'wait' }> = [];
  if (c.drawer) rows.push({ nick: c.drawer.nick, state: 'now' });
  for (const q of c.queue) rows.push({ nick: q.nick, state: 'wait' });
  if (!rows.length) {
    centerText(ctx, 'Кто рисует?', W / 2, 400, 110, C.cream);
    centerText(ctx, 'Жми «Хочу рисовать» — рисуем по очереди', W / 2, 560, 60, C.creamDim, W - PAD * 2, 700);
  }
  const cols = 3, w = (W - PAD * 2 - 36 * (cols - 1)) / cols, h = 230;
  for (let i = 0; i < Math.min(rows.length, QZ_CROC.TURNS_MAX); i++) {
    const q = rows[i], x = PAD + (i % cols) * (w + 36), y = 190 + Math.floor(i / cols) * (h + 36);
    ctx.save();
    rr(ctx, x, y, w, h, 30);
    ctx.fillStyle = q.state === 'now' ? C.gold : C.cream;
    ctx.fill();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = font(800, 54);
    ctx.fillStyle = C.plateDim;
    ctx.fillText(String(i + 1), x + 40, y + 60);
    ctx.font = font(800, fit(ctx, q.nick, 800, 84, w - 80, TEXT, 44));
    ctx.fillStyle = q.state === 'now' ? C.goldInk : C.plateInk;
    ctx.fillText(clip(ctx, q.nick, w - 80), x + 40, y + 140);
    ctx.font = font(700, 46);
    ctx.fillStyle = q.state === 'now' ? C.goldInk : C.plateDim;
    ctx.fillText(q.state === 'now' ? 'рисует' : 'в очереди', x + 40, y + 196);
    ctx.restore();
  }
  if (c.endsAt > 0) crocBar(ctx, c, nowMs, W, H, 3);
}

function crocWords(ctx: CanvasRenderingContext2D, c: QzCrocBoard, nowMs: number, W: number, H: number): void {
  head(ctx, 'КРОКОДИЛ', `рисунок ${c.num} из ${c.of}`, W);
  const who = c.drawer?.nick ?? 'Художник';
  centerText(ctx, `${who} выбирает слово`, W / 2, 440, fit(ctx, `${who} выбирает слово`, 800, 110, W - PAD * 2, TEXT, 56), C.cream);
  centerText(ctx, 'Слово покажет рисунком — угадывайте!', W / 2, 600, 60, C.creamDim, W - PAD * 2, 700);
  crocBar(ctx, c, nowMs, W, H, 3);
}

function crocReveal(ctx: CanvasRenderingContext2D, c: QzCrocBoard, nowMs: number, W: number, H: number): void {
  const last = c.last;
  const end = last?.end ?? 'timeout';
  const all = end === 'all';
  if (all) confetti(ctx, W, H, nowMs, 90, 5);
  const nick = (last?.drawer.nick ?? '').toUpperCase();
  const head1 = all ? 'ВСЕ УГАДАЛИ!' : end === 'left' ? `${nick} УШЁЛ` : end === 'swap' ? 'МЕНЯЕМ ИГРУ' : end === 'empty' ? 'ВСЕ УШЛИ' : 'НЕ УГАДАЛИ';
  // повтор рисунка (C7): рамка 4:3 слева, как в шаге draw, справа слово и итог; рисунка нет — слово по центру
  if (boardUi.drawing) return crocRevealPic(ctx, c, W, H, head1, all, nowMs);
  title(ctx, clip(ctx, head1, 1800), W / 2, 130, 96, all ? C.gold : C.coral, 'center', 7);
  const word = (last?.word ?? '').toUpperCase();
  ctx.save();
  const px = fit(ctx, word, 400, 170, 1640, DISPLAY, 70);
  ctx.font = font(400, px, DISPLAY);
  const ww = Math.max(760, ctx.measureText(word).width + 200);
  const bx = (W - ww) / 2, by = 240, bh = 270;
  rr(ctx, bx, by + 12, ww, bh, 44);
  ctx.fillStyle = C.ink;
  ctx.fill();
  rr(ctx, bx, by, ww, bh, 44);
  ctx.fillStyle = all ? C.cream : C.cream2;
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.enamelSolid;
  ctx.fillText(word, W / 2, by + bh / 2 + 10);
  ctx.restore();
  const g = last?.guessed ?? 0;
  centerText(ctx, g ? `Угадали: ${g} · рисовал ${last?.drawer.nick ?? ''}` : end === 'timeout' ? `Никто не угадал · рисовал ${last?.drawer.nick ?? ''}` : 'рисунок не в счёт', W / 2, 640, 70, C.cream, W - PAD * 2);
  crocBar(ctx, c, nowMs, W, H, 0);
}

/** Итог рисунка с повтором: рисунок в рамке шага draw (crocRect), справа — слово, сколько угадали и кто рисовал */
function crocRevealPic(ctx: CanvasRenderingContext2D, c: QzCrocBoard, W: number, H: number, head1: string, all: boolean, nowMs: number): void {
  const last = c.last;
  title(ctx, clip(ctx, head1, W - PAD * 2), PAD, 104, 70, all ? C.gold : C.coral, 'left', 5);
  const { x: cx, y: cy, w: cw, h: ch } = crocRect(H);
  rr(ctx, cx, cy + 8, cw, ch, 22);
  ctx.fillStyle = C.ink;
  ctx.fill();
  rr(ctx, cx, cy, cw, ch, 22);
  ctx.fillStyle = QZ_CROC_PAPER;
  ctx.fill();
  ctx.save();
  rr(ctx, cx, cy, cw, ch, 22);
  ctx.clip();
  ctx.drawImage(boardUi.drawing!, cx, cy, cw, ch);
  ctx.restore();
  const rx = cx + cw + 60, rw = W - PAD - rx;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = font(800, 48);
  ctx.fillStyle = C.goldText;
  ctx.letterSpacing = '4px';
  ctx.fillText('СЛОВО', rx, 200);
  ctx.letterSpacing = '0px';
  const word = (last?.word ?? '').toUpperCase();
  const px = fit(ctx, word, 400, 130, rw - 70, DISPLAY, 44);
  const bh = 240, by = 250;
  rr(ctx, rx, by + 12, rw, bh, 40);
  ctx.fillStyle = C.ink;
  ctx.fill();
  rr(ctx, rx, by, rw, bh, 40);
  ctx.fillStyle = all ? C.cream : C.cream2;
  ctx.fill();
  ctx.font = font(400, px, DISPLAY);
  ctx.textAlign = 'center';
  ctx.fillStyle = C.enamelSolid;
  ctx.fillText(clip(ctx, word, rw - 50), rx + rw / 2, by + bh / 2 + 8);
  ctx.textAlign = 'left';
  const g = last?.guessed ?? 0;
  const end = last?.end ?? 'timeout';
  ctx.font = font(800, 76);
  ctx.fillStyle = g ? C.goodText : C.creamDim;
  ctx.fillText(clip(ctx, g ? `Угадали: ${g}` : end === 'timeout' ? 'Никто не угадал' : 'рисунок не в счёт', rw), rx, 600);
  ctx.font = font(700, 58);
  ctx.fillStyle = C.cream;
  ctx.fillText(clip(ctx, `рисовал ${last?.drawer.nick ?? ''}`, rw), rx, 700);
  ctx.restore();
  crocBar(ctx, c, nowMs, W, H, 0);
}

// ---------------------------------------------------------------- «Кто из нас?»

export function paintWhoBoard(ctx: CanvasRenderingContext2D, b: QzBoard, nowMs: number, W: number, H: number): void {
  const w = b.who!;
  if (w.step === 'ask') return whoAsk(ctx, w, nowMs, W, H);
  head(ctx, 'КТО ИЗ НАС?', `вопрос ${w.num} из ${w.of}`, W);
  if (w.step === 'vote') return whoVote(ctx, w, nowMs, W, H);
  whoReveal(ctx, w, nowMs, W, H);
}

const whoBar = (ctx: CanvasRenderingContext2D, w: QzWhoBoard, nowMs: number, W: number, H: number): void => {
  if (w.endsAt > 0 && w.total > 0) timeBar(ctx, (w.endsAt - nowMs) / w.total, w.endsAt - nowMs <= 5000, W, H, H - 64);
};

/** Свои вопросы: сколько в очереди (сами вопросы — сюрприз) */
function whoAsk(ctx: CanvasRenderingContext2D, w: QzWhoBoard, nowMs: number, W: number, H: number): void {
  head(ctx, 'КТО ИЗ НАС?', 'вопросы от вас', W);
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = font(400, 200, DISPLAY);
  ctx.fillStyle = C.gold;
  ctx.fillText(String(w.asked), PAD + 10, 330);
  const nw = ctx.measureText(String(w.asked)).width;
  ctx.font = font(800, 76);
  ctx.fillStyle = C.cream;
  ctx.fillText('в очереди', PAD + nw + 50, 300);
  ctx.font = font(700, 56);
  ctx.fillStyle = C.creamDim;
  ctx.fillText('пишите: «Кто из нас…»', PAD + nw + 50, 380);
  ctx.restore();
  // участники — чтобы было видно, кто играет
  const names = w.players.map((p) => p.nick).join(', ');
  if (names) centerText(ctx, `Играют: ${names}`, W / 2, 620, 56, C.creamDim, W - PAD * 2, 700);
  centerText(ctx, 'У каждого — до двух своих вопросов', W / 2, 760, 52, C.goldText, W - PAD * 2, 700);
  whoBar(ctx, w, nowMs, W, H);
}

/** Тайный голос: вопрос крупно, сколько проголосовало */
function whoVote(ctx: CanvasRenderingContext2D, w: QzWhoBoard, nowMs: number, W: number, H: number): void {
  ctx.save();
  ctx.font = font(800, 96);
  const lines = wrap(ctx, w.q, W - PAD * 2 - 60, 3);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.cream;
  const y0 = 440 - (lines.length - 1) * 60;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * 120));
  ctx.restore();
  centerText(ctx, `проголосовали ${w.voted} из ${w.players.length}`, W / 2, H - 150, 50, C.creamDim, W - PAD * 2, 700);
  if (w.skip.n > 0) centerText(ctx, `пропустить вопрос: ${w.skip.n} из ${w.skip.need}`, W / 2, H - 220, 44, C.goldText, W - PAD * 2, 700);
  whoBar(ctx, w, nowMs, W, H);
}

/** Раскрытие: голоса по участникам и титул лидера */
function whoReveal(ctx: CanvasRenderingContext2D, w: QzWhoBoard, nowMs: number, W: number, H: number): void {
  centerText(ctx, w.q, W / 2, 210, 54, C.creamDim, W - PAD * 2, 700);
  const rows = [...(w.tally ?? [])].sort((a, b) => b.n - a.n).slice(0, 5);
  if (!rows.length) centerText(ctx, 'Никто не голосовал', W / 2, 520, 90, C.creamDim);
  const max = Math.max(1, ...rows.map((r) => r.n));
  const lead = new Set(w.leaders.map((l) => l.slot));
  const k = Math.min(1, (QZ_WHO.REVEAL_MS - (w.endsAt - nowMs) + 200) / 900);
  const top = 290, rowH = 118;
  rows.forEach((r, i) => {
    const y = top + i * rowH, isLead = lead.has(r.slot) && r.n > 0;
    const bw = (W - PAD * 2 - 560) * (r.n / max) * Math.max(0, k);
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = font(800, 60);
    ctx.fillStyle = isLead ? C.goldText : C.cream;
    ctx.fillText(clip(ctx, r.nick, 440), PAD, y + 50);
    rr(ctx, PAD + 480, y + 14, W - PAD * 2 - 560, 72, 36);
    ctx.fillStyle = C.track;
    ctx.fill();
    if (bw > 4) {
      rr(ctx, PAD + 480, y + 14, Math.max(72, bw), 72, 36);
      ctx.fillStyle = isLead ? C.gold : C.info;
      ctx.fill();
    }
    ctx.font = font(800, 60);
    ctx.textAlign = 'right';
    ctx.fillStyle = isLead ? C.goldText : C.cream;
    ctx.fillText(String(r.n), W - PAD, y + 52);
    ctx.restore();
  });
  if (w.title && w.leaders.length) {
    const nicks = w.leaders.map((l) => l.nick).join(' и ');
    const txt = `${nicks} — «${w.title}»`;
    ctx.save();
    ctx.font = font(800, 64);
    const bw = Math.min(W - PAD * 2, ctx.measureText(txt).width + 120);
    rr(ctx, (W - bw) / 2, H - 170, bw, 100, 50);
    ctx.fillStyle = C.gold;
    ctx.fill();
    ctx.fillStyle = C.goldInk;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(clip(ctx, txt, bw - 80), W / 2, H - 118);
    ctx.restore();
  }
}

