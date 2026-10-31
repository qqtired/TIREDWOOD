// Стенд табло «Загадки»: пять состояний, у каждого три холста рядом — «Сейчас» (прежнее табло), «Линии» и «Панели» (новая раскладка,
// «Панели» — в игре по умолчанию, выбор владельца 31.10; «Линии» — ?board2=lines). Рисуют те же функции, что в игре, на холстах 2048 × 1024. Сервер разработки: /tools/quiz-board/index.html.
// Параметры адреса: ?only=2 — одно состояние, ?size=fit|1000|480, ?stack=1 — колонкой, ?flash=1 — вспышки. Для снимков:
// window.__stand = { ready, redraw(), canvases } (холсты по id «<номер>-<now|lines|panels>»).
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/800.css';
import '@fontsource/rubik-mono-one/cyrillic-400.css';
import '@fontsource/rubik-mono-one/latin-400.css';
import { QZ, type QzBoard, type QzRiddleBoard } from '../../shared/quiz/types.ts';
import { BOARD_H, BOARD_W, boardBase } from '../../client/lobby/quiz/ui/board-base.ts';
import { paintRiddleAskNow, paintRiddleRoundNow } from '../../client/lobby/quiz/ui/board-riddle.ts';
import { paintRiddleAsk2, paintRiddleRound2, type RiddleFlash, type RiddleStyle } from '../../client/lobby/quiz/ui/board-riddle2.ts';
import { onQuizImages } from '../../client/lobby/quiz/ui/paint.ts';

/** Часы стенда стоят: вспышки и мигание «последней минуты» на всех холстах одинаковы (1_000_205 — синус вспышки около 1) */
const NOW = 1_000_205;
const who = (slot: number, nick: string) => ({ slot, nick });

interface State { id: number; title: string; note: string; board: QzBoard; riddle: QzRiddleBoard; flash: RiddleFlash; prev: QzRiddleBoard }

function riddle(o: Partial<QzRiddleBoard>): QzRiddleBoard {
  return {
    step: 'round', num: 1, of: QZ.RIDDLES, riddler: who(181, 'Tester181'), category: 'Предмет', hints: [], misses: [], warm: 0,
    endsAt: NOW + QZ.ROUND_MS, total: QZ.ROUND_MS, checking: null, last: null, queue: [], hot: 0, hotText: '', ...o,
  };
}

function board(r: QzRiddleBoard, o: Partial<QzBoard> = {}): QzBoard {
  return {
    rev: 1, now: NOW, phase: 'game', endsAt: 0, mode: 'riddle', count: 5, seated: 4, vote: null, riddle: r, results: null,
    evening: [], noTokens: false, zat: null, ...o,
  };
}

const sec = (s: number): number => NOW + s * 1000;
const none: RiddleFlash = { warmAt: -1e9, hotAt: -1e9, hintAt: -1e9 };
const lit: RiddleFlash = { warmAt: NOW - 400, hotAt: NOW - 400, hintAt: NOW - 400 };

function mk(id: number, title: string, note: string, r: QzRiddleBoard, bo: Partial<QzBoard> = {}): State {
  // «прошлый кадр» для прежнего табло: на единицу меньше «тепла», «горячо» и подсказок — так оно запоминает вспышку
  const prev = { ...r, warm: Math.max(0, r.warm - 1), hot: Math.max(0, (r.hot ?? 0) - 1), hints: r.hints.slice(0, Math.max(0, r.hints.length - 1)) };
  return { id, title, note, board: board(r, bo), riddle: r, flash: none, prev };
}

const STATES: State[] = [
  mk(1, '1. Начало раунда', 'Тема, «тепло» 0, подсказок нет, «мимо» и очереди нет, 5:00.',
    riddle({ endsAt: sec(300), riddler: who(181, 'Tester181') })),
  mk(2, '2. Как на снимке владельца', '«Предмет», тепло 2, подсказка «дымит», три «мимо», очередь из двух, загадка 1 из 5, 4:36.',
    riddle({
      riddler: who(182, 'Tester182'), endsAt: sec(276), warm: 2, hints: ['дымит'], misses: ['кит', 'чайка', 'буй'],
      queue: [who(183, 'Tester183'), who(184, 'Tester184')],
    })),
  mk(3, '3. «Горячо», длинное, последняя минута', 'Тема «Фильм или книга», «горячо» 1 с текстом догадки, три длинные подсказки, длинные «мимо», очередь из пяти, 0:41 (коралл).',
    riddle({
      riddler: who(183, 'ДлинныйНикнейм12'), num: 3, category: 'Фильм или книга', endsAt: sec(41), warm: 14, hot: 1, hotText: 'Большое и дымит по морю, это пароход?',
      hints: ['Большое, тяжёлое, плавает по морю', 'Плывёт по морю, дымит и гудит', 'Начинается на букву П, а кончается Д'],
      misses: ['гигантский подводный кальмар', 'пароходик', 'старая калоша с дыркой'],
      queue: [who(184, 'Tester184'), who(185, 'Оля'), who(186, 'Петя'), who(187, 'Вася'), who(188, 'Маша')],
    })),
  mk(4, '4. Идёт проверка «ПРОВЕРЯЕМ…»', 'Кто-то написал «угадал» — пилюля левее времени, золотая полоска времени остаётся.',
    riddle({
      step: 'check', riddler: who(184, 'Tester184'), num: 2, category: 'Животное', endsAt: sec(112), warm: 3, hints: ['живёт в воде', 'любит сушки'], misses: ['щука', 'карп'],
      checking: { ...who(185, 'Оля'), line: 3, until: sec(3) }, queue: [who(186, 'Петя')],
    })),
  mk(5, '5. Ждём слово', 'Загадывающий пишет слово у себя в окне: шапка общая с раундом, остальное как было.',
    riddle({ step: 'ask', riddler: who(181, 'Tester181'), num: 2, category: '', endsAt: 0, queue: [who(185, 'Оля'), who(186, 'Петя')] }),
    { endsAt: sec(28) }),
];

type Variant = 'now' | 'lines' | 'panels';
const VARIANTS: [Variant, string][] = [['now', 'Сейчас'], ['lines', 'Линии'], ['panels', 'Панели']];

/** Забыть, что помнит прежнее табло про вспышки (оно держит счёт «тепла» между кадрами): рисуем «чужую» загадку */
function forgetNow(ctx: CanvasRenderingContext2D): void {
  const r = riddle({ riddler: who(9999, 'x'), num: 99, endsAt: sec(60) });
  paintRiddleRoundNow(ctx, board(r), r, NOW, BOARD_W, BOARD_H);
}

function draw(v: Variant, s: State, ctx: CanvasRenderingContext2D, flashOn: boolean): void {
  const { board: b, riddle: r } = s;
  const ask = r.step === 'ask';
  boardBase(ctx, BOARD_W, BOARD_H);
  if (v === 'now') {
    forgetNow(ctx);
    if (flashOn && !ask) {
      boardBase(ctx, BOARD_W, BOARD_H);
      paintRiddleRoundNow(ctx, b, s.prev, NOW - 100, BOARD_W, BOARD_H);
    }
    boardBase(ctx, BOARD_W, BOARD_H);
    if (ask) paintRiddleAskNow(ctx, b, r, NOW, BOARD_W, BOARD_H);
    else paintRiddleRoundNow(ctx, b, r, NOW, BOARD_W, BOARD_H);
    return;
  }
  const style: RiddleStyle = v;
  if (ask) paintRiddleAsk2(ctx, b, r, NOW, BOARD_W, BOARD_H, style);
  else paintRiddleRound2(ctx, b, r, NOW, BOARD_W, BOARD_H, style, flashOn ? lit : none);
}

const params = new URLSearchParams(location.search);
const root = document.getElementById('stand')!;
const sizeSel = document.getElementById('size') as HTMLSelectElement;
const stackBox = document.getElementById('stack') as HTMLInputElement;
const flashBox = document.getElementById('flash') as HTMLInputElement;
const onlySel = document.getElementById('only') as HTMLSelectElement;

onlySel.innerHTML = `<option value="0">все пять</option>${STATES.map((s) => `<option value="${s.id}">${s.title}</option>`).join('')}`;
sizeSel.value = params.get('size') ?? 'fit';
stackBox.checked = params.has('stack');
flashBox.checked = params.has('flash');
onlySel.value = params.get('only') ?? '0';

const canvases = new Map<string, HTMLCanvasElement>();

function build(): void {
  root.innerHTML = '';
  canvases.clear();
  const only = Number(onlySel.value);
  for (const s of STATES) {
    if (only && s.id !== only) continue;
    const block = document.createElement('section');
    block.innerHTML = `<h2>${s.title}</h2><p class="note">${s.note}</p>`;
    const row = document.createElement('div');
    row.className = 'row';
    for (const [v, name] of VARIANTS) {
      const fig = document.createElement('figure');
      fig.innerHTML = `<figcaption>${name}</figcaption>`;
      const cv = document.createElement('canvas');
      cv.width = BOARD_W;
      cv.height = BOARD_H;
      cv.id = `${s.id}-${v}`;
      fig.append(cv);
      row.append(fig);
      canvases.set(cv.id, cv);
    }
    block.append(row);
    root.append(block);
  }
  redraw();
}

function redraw(): void {
  const flashOn = flashBox.checked;
  for (const s of STATES) {
    for (const [v] of VARIANTS) {
      const cv = canvases.get(`${s.id}-${v}`);
      const ctx = cv?.getContext('2d');
      if (cv && ctx) draw(v, s, ctx, flashOn);
    }
  }
}

function layout(): void {
  const size = sizeSel.value;
  document.documentElement.style.setProperty('--cw', size === 'fit' ? 'calc((100vw - 64px - 32px) / 3)' : `${size}px`);
  document.body.classList.toggle('stack', stackBox.checked);
}

for (const el of [sizeSel, stackBox]) el.addEventListener('change', layout);
flashBox.addEventListener('change', redraw);
onlySel.addEventListener('change', build);
// картинки (значки «тепло» / «мимо» прежнего табла) догружаются позже первого кадра — перерисовать
onQuizImages(redraw);
layout();

const ready = (async () => {
  const sample = 'ЗАГАДКА Тепло Подсказки 0123456789 Tester';
  await Promise.all([
    document.fonts.load('400 80px Rubik', sample), document.fonts.load('700 46px Rubik', sample), document.fonts.load('800 46px Rubik', sample),
    document.fonts.load("400 80px 'Rubik Mono One'", sample),
  ]);
  await document.fonts.ready;
  build();
})();

(window as unknown as { __stand: unknown }).__stand = { ready, redraw, canvases };
