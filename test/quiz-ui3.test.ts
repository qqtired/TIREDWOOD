// «Ракушка» 1.1, клиент U1 (HUD, табло, клавиши): «Ещё раз!», «Веду я», очередь «Хочу загадать», «Горячо!», «что дальше» на плашке,
// строка «что мне делать», отсчёт 3-2-1, разминка, «Вдвоём — половина жетонов», титулы. Модели — чистые функции без DOM, табло — на
// холсте-заглушке. Главная логика и главный сценарий каждого пункта; крайних случаев нет.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { paintBoard, boardAnimating } from '../client/lobby/quiz/ui/board.ts';
import { boardUi } from '../client/lobby/quiz/ui/board-base.ts';
import { jpNext } from '../client/lobby/quiz/ui/hud-jp-model.ts';
import { buzzModel } from '../client/lobby/quiz/ui/hud-jp-model.ts';
import { crocNext, crocPlate, todoRow } from '../client/lobby/quiz/ui/hud-modes-model.ts';
import {
  againBar, dockModel, hostBar, keysRow, plateSpec, queueBar, riddleNext, warmBar, warmModel,
} from '../client/lobby/quiz/ui/hud-model.ts';
import { jpCountdown, keyMark, QuizState, warmLines } from '../client/lobby/quiz/state.ts';
import { quizTitleOf, setQuizTitles } from '../client/lobby/quiz/titles.ts';
import {
  QZ, QZ_CROC, QZ_MODES, type QzBoard, type QzCrocBoard, type QzJpBoard, type QzJpView, type QzLine, type QzMe, type QzRiddleView, type QzView,
} from '../shared/quiz/types.ts';

const NOW = 2_000_000;
const who = (slot: number, nick: string) => ({ slot, nick });

/** Холст-заглушка: все методы — пустышки, measureText по длине, fillText запоминает слова, drawImage считает */
function stub(W = 2048, H = 1024): { ctx: CanvasRenderingContext2D; texts: string[]; images: number } {
  const out = { texts: [] as string[], images: 0 };
  const grad = { addColorStop() {} };
  const state: Record<string, unknown> = { canvas: { width: W, height: H } };
  const ctx = new Proxy(state, {
    get(t, k) {
      if (typeof k === 'string' && k in t) return t[k];
      if (k === 'measureText') return (s: string) => ({ width: String(s).length * 22 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'fillText') return (s: string) => { out.texts.push(String(s)); };
      if (k === 'drawImage') return () => { out.images++; };
      return () => {};
    },
    set(t, k, v) { t[k as string] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts: out.texts, get images() { return out.images; } };
}

const base = (o: Partial<QzBoard> = {}): QzBoard => ({
  rev: 1, now: NOW, phase: 'idle', endsAt: 0, mode: null, count: 3, seated: 3, vote: null, riddle: null, results: null,
  evening: [{ ...who(2, 'Оля'), pts: 7 }], noTokens: false, zat: null, ...o,
});
const hview = (o: Partial<QzView> = {}): QzView => ({ ...base(), people: [], call: null, swap: { n: 0, need: 2 }, ...o }) as QzView;
const me = (o: Partial<QzMe> = {}): QzMe => ({ slot: 2, place: 0, role: '', vote: -1, swap: false, canSwap: true, canPlay: false, canTake: false, gapUntil: 0, ...o });
const ln = (id: number, slot: number, text: string, at: number, mark: QzLine['mark'] = '', markedAt = 0): QzLine => ({
  id, slot, nick: `Игрок${slot}`, text, at, kind: 'guess', mark, markedAt,
});
const riddle = (o: Partial<QzRiddleView> = {}, lines: QzLine[] = []): QzRiddleView => ({
  step: 'round', num: 2, of: 5, riddler: who(5, 'Барон'), category: 'Животное', hints: ['дымит'], misses: [], warm: 1,
  endsAt: NOW + 60_000, total: QZ.ROUND_MS, checking: null, last: null, queue: [], hot: 0, hotText: '', lines, ...o,
});
const game = (r: Partial<QzRiddleView> = {}, lines: QzLine[] = [], o: Partial<QzView> = {}): QzView =>
  hview({ phase: 'game', mode: 'riddle', riddle: riddle(r, lines), ...o });

describe('A1 «Ещё раз!»', () => {
  const res = (o: Partial<QzView> = {}): QzView => hview({ phase: 'results', mode: 'riddle', again: { n: 1, need: 3 }, ...o });

  it('на итогах — кнопка с R и счётом «1 из 3»; нажал — «Передумал», «Ждём остальных»', () => {
    const b = againBar(res(), me({ canAgain: true }))!;
    assert.match(b.html, /data-qz="again"[^>]*>Ещё раз!<kbd[^>]*>R</);
    assert.equal(b.time, '1 из 3');
    assert.doesNotMatch(b.html, /is-on/);
    const on = againBar(res({ again: { n: 2, need: 3 } }), me({ canAgain: true, again: true }))!;
    assert.match(on.html, /Передумал/);
    assert.match(on.html, /Ждём остальных/);
    assert.match(on.html, /qz-again is-on/);
    assert.equal(on.time, '2 из 3');
    assert.notEqual(b.sig, on.sig);
  });

  it('нельзя — нет кнопки: не итоги, нет счёта, не играл', () => {
    assert.equal(againBar(res(), me()), null);
    assert.equal(againBar(res({ again: null }), me({ canAgain: true })), null);
    assert.equal(againBar(hview({ phase: 'game', again: { n: 0, need: 2 } }), me({ canAgain: true })), null);
  });

  it('плашка победителя: «Играем снова», без причины; табло — «ИГРАЕМ СНОВА!»', () => {
    const vote = { options: QZ_MODES.map((m) => ({ mode: m.id, n: 0, who: [], off: null })), people: 3, voted: 0, closing: false, spin: null, win: 0, nobody: false, why: 'все за', again: true };
    const p = plateSpec(hview({ phase: 'vote', vote }), me(), NOW)!;
    assert.match(p.html, /Играем снова: <b>Загадка<\/b>/);
    assert.doesNotMatch(p.html, /все за/);
    const { ctx, texts } = stub();
    paintBoard(ctx, base({ phase: 'vote', endsAt: NOW, vote }), NOW);
    assert.ok(texts.includes('ИГРАЕМ СНОВА!'));
    assert.ok(!texts.includes('все за'), 'подписи с причиной на карточке нет');
    const plain = stub();
    paintBoard(plain.ctx, base({ phase: 'vote', endsAt: NOW + 4000, vote: { ...vote, again: undefined } }), NOW);
    assert.ok(plain.texts.includes('ИГРАЕМ!'));
  });
});

describe('A2 «Веду я»', () => {
  const jp = (o: Partial<QzJpBoard> = {}): QzView => hview({ phase: 'game', mode: 'jeopardy', jp: { step: 'packvote', players: [], themes: [], q: null, ...o } as unknown as QzJpView });

  it('в выборе пака, если можно стать ведущим — «Веду я» с F; иначе нет', () => {
    const b = hostBar(jp(), me({ jp: { pult: -1, canBuzz: false, lockUntil: 0, cat: false, canHost: true } }))!;
    assert.match(b.html, /data-qz="hostTake"[^>]*>Веду я<kbd[^>]*>F</);
    assert.equal(hostBar(jp(), me({ jp: { pult: -1, canBuzz: false, lockUntil: 0, cat: false } })), null);
    assert.equal(hostBar(jp({ step: 'read' }), me({ jp: { pult: -1, canBuzz: false, lockUntil: 0, cat: false, canHost: true } })), null);
  });
});

describe('A3 «Хочу загадать»: очередь и слово заранее', () => {
  it('не в очереди: «Хочу загадать» с F; пока угадывают — ещё «Пиши догадки» с Enter', () => {
    const g = queueBar(game(), me())!;
    assert.match(g.html, /Пиши догадки<kbd[^>]*>Enter</);
    assert.match(g.html, /data-qz="queue" data-take="1">Хочу загадать<kbd[^>]*>F</);
    const w = queueBar(game({ step: 'reveal', last: { end: 'solved', answer: 'х', riddler: who(5, 'Б'), solver: who(3, 'О') } }), me())!;
    assert.match(w.html, /Хочешь загадать\?/);
    assert.doesNotMatch(w.html, /Enter/);
  });

  it('нельзя: я загадываю, вызов открыт мне, очередь полна', () => {
    assert.equal(queueBar(game(), me({ role: 'riddler' })), null);
    assert.equal(queueBar(game(), me({ canTake: true })), null);
    const full = Array.from({ length: QZ.QUEUE_MAX }, (_, i) => who(100 + i, `Ж${i}`));
    assert.equal(queueBar(game({ queue: full }), me()), null);
    assert.ok(queueBar(game({ queue: full }), me({ queuePos: 3 })), 'кто уже в очереди — полосу видит');
    assert.equal(queueBar(hview({ phase: 'idle' }), me()), null);
    // последняя загадка сыграна — дальше итоги, вставать в очередь поздно
    const over = game({ step: 'reveal', num: 5, last: { end: 'solved', answer: 'х', riddler: who(5, 'Б'), solver: who(3, 'О') } });
    assert.equal(queueBar(over, me()), null);
    assert.equal(queueBar(over, me({ queuePos: 1 })), null);
  });

  it('в очереди: «Ты в очереди 2-м — приготовь слово», «Слово», «Выйти из очереди»', () => {
    const b = queueBar(game({ queue: [who(3, 'Петя'), who(2, 'Я')] }), me({ queuePos: 2 }))!;
    assert.match(b.html, /Ты в очереди 2-м — приготовь слово/);
    assert.match(b.html, /data-qz="prep"[^>]*>Слово/);
    assert.match(b.html, /data-qz="queue" data-take="0">Выйти из очереди/);
    assert.match(queueBar(game(), me({ queuePos: 1 }))!.html, /Ты следующий — приготовь слово/);
  });

  it('слово готово: «Слово готово: …» с правкой; чужой текст экранируется', () => {
    const b = queueBar(game(), me({ queuePos: 1, prep: { word: '<i>пароход</i>', cat: 'Предмет', hint: '' } }))!;
    assert.match(b.html, /Слово готово: <b class="qz-word-t">&lt;i&gt;пароход&lt;\/i&gt;<\/b>/);
    assert.match(b.html, /data-qz="prep"[^>]*>Изменить/);
    assert.doesNotMatch(b.html, /<i>пароход<\/i>/);
  });

  it('табло: «ДАЛЬШЕ» с именами очереди на раунде и на ожидании слова', () => {
    const q = [who(3, 'Петя'), who(4, 'Соня'), who(6, 'Кузя'), who(7, 'Маша')];
    for (const step of ['round', 'ask'] as const) {
      const { ctx, texts } = stub();
      paintBoard(ctx, base({ phase: 'game', mode: 'riddle', riddle: riddle({ step, queue: q }) }), NOW);
      assert.ok(texts.includes('ДАЛЬШЕ'), step);
      assert.ok(texts.some((t) => t.includes('Петя, Соня, Кузя +1')), step);
    }
    const none = stub();
    paintBoard(none.ctx, base({ phase: 'game', mode: 'riddle', riddle: riddle() }), NOW);
    assert.ok(!none.texts.includes('ДАЛЬШЕ'));
  });
});

describe('B1 плашка: что дальше', () => {
  const last = (end: 'solved' | 'timeout' | 'left', solver = 3) => ({ end, answer: 'пароход', riddler: who(5, 'Барон'), solver: end === 'solved' ? who(solver, 'Оля') : null });
  const rev = (end: 'solved' | 'timeout' | 'left', o: Partial<QzRiddleView> = {}): QzView => game({ step: 'reveal', endsAt: 0, last: last(end), ...o });

  it('«Загадка»: очередь важнее угадавшего, угадавший — следующий, иначе Затейник; в конце — итоги', () => {
    assert.match(riddleNext(rev('solved'), me()), /Дальше загадывает <b>Оля<\/b>/);
    assert.match(riddleNext(rev('solved', { queue: [who(9, 'Тимур')] }), me()), /Дальше загадывает <b>Тимур<\/b>/);
    assert.equal(riddleNext(rev('solved', { queue: [who(2, 'Я')] }), me()), 'Дальше загадываешь ты');
    assert.equal(riddleNext(rev('timeout'), me()), 'Дальше выберет Затейник');
    assert.equal(riddleNext(rev('solved', { num: 5 }), me()), 'Дальше — итоги игры');
    assert.equal(riddleNext(rev('left', { num: 5 }), me()), 'Дальше выберет Затейник');
  });

  it('«Крокодил»: рисует следующий из очереди, иначе вопрос; после шестого — итоги', () => {
    const c = (o: Partial<QzCrocBoard> = {}): QzView => hview({
      phase: 'game', mode: 'croc',
      croc: { step: 'reveal', num: 2, of: 4, drawer: who(4, 'Соня'), queue: [who(6, 'Кузя')], mask: '', level: 1, guessed: [], drawing: 2, endsAt: NOW + 3000, total: 3000,
        last: { end: 'timeout', word: 'крокодил', drawer: who(4, 'Соня'), guessed: 0 }, lines: [], ...o } as never,
    });
    assert.match(crocNext(c(), me()), /Дальше рисует <b>Кузя<\/b>/);
    assert.equal(crocNext(c({ queue: [who(2, 'Я')] }), me()), 'Дальше рисуешь ты');
    assert.equal(crocNext(c({ queue: [] }), me()), 'Кто рисует дальше?');
    assert.equal(crocNext(c({ num: QZ_CROC.TURNS_MAX }), me()), 'Рисунки закончились — итоги');
    assert.match(crocPlate(c(), me(), NOW)!.html, /Дальше рисует/);
    assert.doesNotMatch(crocPlate(c(), me(), NOW)!.html, /крокодил/);
  });

  it('«Своя игра»: «Следующий вопрос через N с»; клетки кончились — раунд сыгран или финал', () => {
    const jp = (o: Partial<QzJpBoard>): QzJpBoard => ({ themes: [{ name: 'А', cells: [100, 0, 300] }], final: true, endsAt: NOW + 2500, ...o }) as QzJpBoard;
    assert.equal(jpNext(jp({}), NOW), 'Следующий вопрос через 3 с');
    assert.equal(jpNext(jp({ endsAt: NOW + 1000 }), NOW), 'Следующий вопрос через 1 с');
    assert.equal(jpNext(jp({ themes: [{ name: 'А', cells: [0, 0] }] }), NOW), 'Дальше — финал');
    assert.equal(jpNext(jp({ themes: [{ name: 'А', cells: [0] }], final: false }), NOW), 'Раунд сыгран');
  });
});

describe('B2 строка «что мне делать»', () => {
  const jp = (o: Partial<QzJpBoard> = {}): QzView => hview({ phase: 'game', mode: 'jeopardy', jp: { step: 'pick', players: [{ ...who(7, 'А'), pult: 0, score: 0, away: 0 }], host: who(9, 'В'), themes: [], q: null, ...o } as unknown as QzJpView });

  it('зритель «Своей игры»: у стоящего — «E: сесть за пульт», у сидящего — «B: Браво»; игроку и ведущему — ничего', () => {
    const stand = todoRow(jp(), me({ place: -1 }))!;
    assert.match(stand.html, /<kbd[^>]*>E<\/kbd><em>смотри или садись за свободный пульт<\/em>/);
    assert.doesNotMatch(stand.html, /Браво/);
    const sit = todoRow(jp(), me({ place: 0 }));
    assert.match(sit!.html, /<kbd[^>]*>B<\/kbd><em>«Браво!»<\/em>/);
    assert.doesNotMatch(sit!.html, /пульт/);
    assert.equal(todoRow(jp(), me({ role: 'player', place: -1, jp: { pult: 0, canBuzz: false, lockUntil: 0, cat: false } })), null);
    assert.equal(todoRow(jp({ step: 'packvote' }), me({ place: -1 })), null);
  });

  it('«Загадка»: пиши догадки (Enter), если полосы «Хочу загадать» нет; загадывающему — нет', () => {
    assert.match(todoRow(game(), me())!.html, /<kbd[^>]*>Enter<\/kbd><em>пиши догадки<\/em>/);
    assert.equal(todoRow(game(), me(), true), null);
    assert.equal(todoRow(game(), me({ role: 'riddler' })), null);
    assert.equal(todoRow(game({ step: 'reveal' }), me()), null);
  });

  it('«Жму!»: подпись «Пробел — когда загорится»', () => {
    const v = hview({ phase: 'game', mode: 'jeopardy', jp: { step: 'read', total: 3000, openAt: NOW + 2000, out: [], endsAt: NOW + 2000 } as unknown as QzJpView });
    const m = buzzModel(v, me({ role: 'player', jp: { pult: 0, canBuzz: false, lockUntil: 0, cat: false } }), NOW)!;
    assert.equal(m.note, 'Пробел — когда загорится');
  });
});

describe('B3 отсчёт 3-2-1 «Своей игры»', () => {
  it('цифра за три секунды до открытия кнопок, потом 0', () => {
    assert.equal(jpCountdown(NOW + 3500, NOW), 0);
    assert.equal(jpCountdown(NOW + 3000, NOW), 3);
    assert.equal(jpCountdown(NOW + 2100, NOW), 3);
    assert.equal(jpCountdown(NOW + 2000, NOW), 2);
    assert.equal(jpCountdown(NOW + 1000, NOW), 1);
    assert.equal(jpCountdown(NOW + 1, NOW), 1);
    assert.equal(jpCountdown(NOW, NOW), 0);
    assert.equal(jpCountdown(0, NOW), 0);
  });

  it('табло: в чтении за три секунды — 3, 2, 1 вместо «кнопки откроются…»', () => {
    const q = { theme: 'Рыбалка', price: 300, type: 'simple', th: 0, cell: 2, content: [{ kind: 'text', value: 'Вопрос' }] };
    const board = (left: number): QzBoard => base({ phase: 'game', mode: 'jeopardy', jp: { step: 'read', pack: null, round: 'Р', final: false, host: null, players: [], turn: 0, themes: [], packs: null, q, openAt: NOW + left, buzz: null, out: [], said: '', verdict: '', answer: null, dispute: null, fin: null, endsAt: NOW + left, total: 5000 } as unknown as QzJpView });
    const near = stub();
    paintBoard(near.ctx, board(2500), NOW);
    assert.deepEqual(['3', '2', '1'].filter((d) => near.texts.includes(d)), ['3', '2', '1']);
    assert.ok(!near.texts.includes('кнопки откроются…'));
    const far = stub();
    paintBoard(far.ctx, board(4500), NOW);
    assert.ok(far.texts.includes('кнопки откроются…'));
    assert.ok(!far.texts.includes('3'));
  });
});

describe('C1 «Горячо!»', () => {
  it('клавиша 1: неотмеченная → «тепло»; потом свежее «тепло» → «Горячо!»; старое — нет; 2 и 3 — мимо и угадал', () => {
    const fresh = ln(1, 3, 'пар', NOW - 20_000, 'warm', NOW - 2000);
    assert.deepEqual(keyMark([fresh, ln(2, 4, 'лодка', NOW - 1000)], 0, NOW), { id: 2, m: 'warm' });
    assert.deepEqual(keyMark([fresh], 0, NOW), { id: 1, m: 'hot' });
    assert.equal(keyMark([ln(1, 3, 'пар', 0, 'warm', NOW - 11_000)], 0, NOW), null);
    assert.equal(keyMark([fresh], 1, NOW), null);
    assert.deepEqual(keyMark([ln(2, 4, 'лодка', 5)], 1, NOW), { id: 2, m: 'miss' });
    assert.deepEqual(keyMark([ln(2, 4, 'лодка', 5)], 2, NOW), { id: 2, m: 'win' });
    assert.equal(keyMark([ln(3, 4, 'лодка', 5, 'hot', NOW - 1000)], 0, NOW), null, 'горячее выше не поднять');
  });

  it('док: строки «Горячо!» живут в карточке; ряд клавиш подсказывает «1 горячо»', () => {
    const lines = [ln(1, 3, 'пар', 1, 'hot', 10), ln(2, 4, 'лодка', 2, 'warm', 20), ln(3, 5, 'ёж', 3)];
    const m = dockModel(lines, me({ role: 'riddler' }), NOW, true, false);
    assert.deepEqual(m.rows.map((r) => r.id), [3]);
    assert.match(keysRow(true, true, true), /<kbd[^>]*>1<\/kbd><em>горячо<\/em>/);
    assert.doesNotMatch(keysRow(true, true), /горячо/);
  });

  it('карточка «Тепло»: «Горячо!» первыми, последние пять на виду, остальное «ещё N»', () => {
    const lines = [
      ln(1, 3, 'а', 1, 'warm', 10), ln(2, 3, 'б', 2, 'warm', 20), ln(3, 3, 'в', 3, 'warm', 30), ln(4, 3, 'г', 4, 'warm', 40),
      ln(5, 3, 'д', 5, 'warm', 50), ln(6, 3, 'е', 6, 'hot', 60), ln(7, 3, 'ж', 7, 'hot', 15),
    ];
    const m = warmModel(game({}, lines));
    assert.deepEqual(m.rows.map((r) => r.id), [7, 6, 1, 2, 3, 4, 5]);
    assert.deepEqual(m.rows.map((r) => r.hot), [true, true, false, false, false, false, false]);
    assert.deepEqual(m.rows.filter((r) => !r.shown).map((r) => r.id), [1, 2]);
    assert.equal(m.more, 2);
    assert.deepEqual(warmLines(lines).map((l) => l.id), [1, 7, 2, 3, 4, 5, 6], 'по времени отметки, вместе тепло и горячо');
  });

  it('табло: карточка «ГОРЯЧО!» с последним текстом и счётом; без горячих — нет', () => {
    const hot = stub();
    paintBoard(hot.ctx, base({ phase: 'game', mode: 'riddle', riddle: riddle({ hot: 2, hotText: 'пароход' }) }), NOW);
    assert.ok(hot.texts.includes('ГОРЯЧО!'));
    assert.ok(hot.texts.includes('пароход'));
    assert.ok(hot.texts.includes('2'));
    assert.ok(hot.texts.includes('ТЕПЛО'));
    const none = stub();
    paintBoard(none.ctx, base({ phase: 'game', mode: 'riddle', riddle: riddle() }), NOW);
    assert.ok(!none.texts.includes('ГОРЯЧО!'));
    assert.equal(boardAnimating(base({ phase: 'game', mode: 'riddle', riddle: riddle({ warm: 0, hot: 1 }) })), true);
  });
});

describe('C7 рисунок на табло в итоге «Крокодила»', () => {
  it('есть рисунок мольберта — рисуется на табло рядом со словом; нет — слово по центру', () => {
    const c: QzCrocBoard = {
      step: 'reveal', num: 2, of: 4, drawer: who(4, 'Соня'), queue: [], mask: '', level: 1, guessed: [], drawing: 2, endsAt: NOW + 3000, total: 3000,
      last: { end: 'all', word: 'крокодил', drawer: who(4, 'Соня'), guessed: 2 },
    };
    const b = base({ phase: 'game', mode: 'croc', croc: c });
    const prev = boardUi.drawing;
    try {
      boardUi.drawing = {} as CanvasImageSource;
      const withPic = stub();
      paintBoard(withPic.ctx, b, NOW);
      assert.equal(withPic.images, 1);
      assert.ok(withPic.texts.includes('КРОКОДИЛ'));
      assert.ok(withPic.texts.includes('СЛОВО'));
      boardUi.drawing = null;
      const noPic = stub();
      paintBoard(noPic.ctx, b, NOW);
      assert.equal(noPic.images, 0);
      assert.ok(noPic.texts.includes('КРОКОДИЛ'));
    } finally {
      boardUi.drawing = prev;
    }
  });
});

describe('F3 разминка с Затейником', () => {
  const warm = (o: Record<string, unknown> = {}) => ({ who: who(2, 'Я'), step: 'q' as const, num: 3, ok: 2, theme: 'Море', q: 'Какая рыба считается королевской?', endsAt: NOW + 15_000, total: 20_000, last: null, ...o });

  it('одному сидящему — «Разминка с Затейником» с F; идёт разминка — «Хватит» на плашке', () => {
    const b = warmBar(hview({ phase: 'idle' }), me({ canWarm: true }))!;
    assert.match(b.html, /data-qz="warm" data-on="1">Разминка с Затейником<kbd[^>]*>F</);
    assert.equal(warmBar(hview({ phase: 'idle' }), me()), null);
    assert.equal(warmBar(hview({ phase: 'idle', warm: warm() }), me({ canWarm: true })), null);
    const p = plateSpec(hview({ phase: 'idle', warm: warm() }), me(), NOW)!;
    assert.match(p.html, /Разминка с Затейником/);
    assert.match(p.html, /data-qz="warm" data-on="0">Хватит/);
    assert.equal(plateSpec(hview({ phase: 'idle', warm: warm({ who: who(9, 'Другой') }) }), me(), NOW), null);
  });

  it('табло: тема, вопрос, «верно 2 из 3»; потом ответ и «ВЕРНО!» / «НЕ УГАДАЛ»', () => {
    const q = stub();
    paintBoard(q.ctx, base({ phase: 'idle', warm: warm() }), NOW);
    assert.ok(q.texts.includes('РАЗМИНКА'));
    assert.ok(q.texts.some((t) => t.includes('Я · верно 2 из 3')));
    assert.ok(q.texts.some((t) => t.toUpperCase() === 'МОРЕ'));
    assert.ok(q.texts.some((t) => t.includes('королевской')));
    const ok = stub();
    paintBoard(ok.ctx, base({ phase: 'idle', warm: warm({ step: 'reveal', last: { answer: 'Белуга', ok: true } }) }), NOW);
    assert.ok(ok.texts.includes('ВЕРНО!'));
    assert.ok(ok.texts.includes('Белуга'));
    const no = stub();
    paintBoard(no.ctx, base({ phase: 'idle', warm: warm({ step: 'reveal', last: { answer: 'Белуга', ok: false } }) }), NOW);
    assert.ok(no.texts.includes('НЕ УГАДАЛ'));
    assert.equal(boardAnimating(base({ phase: 'idle', warm: warm() })), true);
    // жетонов табло не обещает
    assert.ok(![...q.texts, ...ok.texts].some((t) => /жетон|🪙/i.test(t)));
  });

  it('чат «В игру» включён тому, кто разминается', () => {
    const st = new QuizState(() => {});
    const v = hview({ phase: 'idle', warm: warm() });
    st.onQz(v, me());
    assert.equal(st.warming, true);
    assert.equal(st.gameChat, true);
    st.onQz(hview({ phase: 'idle', warm: warm({ who: who(9, 'Другой') }) }), me());
    assert.equal(st.gameChat, false);
    st.onQz(hview({ phase: 'idle' }), me());
    assert.equal(st.gameChat, false);
  });
});

describe('F4 «Вдвоём — половина жетонов»', () => {
  const vote = { options: QZ_MODES.map((m) => ({ mode: m.id, n: 0, who: [], off: null })), people: 2, voted: 0, closing: false, spin: null, win: -1, nobody: false, why: '' };

  it('табло голосования: двое — половина, один — без жетонов, трое — ничего', () => {
    const t = (o: Partial<QzBoard>): string[] => { const s = stub(); paintBoard(s.ctx, base({ phase: 'vote', endsAt: NOW + 10_000, vote, ...o }), NOW); return s.texts; };
    assert.ok(t({ halfTokens: true }).includes('Вдвоём — половина жетонов'));
    assert.ok(t({ noTokens: true }).includes('Один — без жетонов'));
    const three = t({});
    assert.ok(!three.some((x) => /жетон/.test(x)));
    assert.ok(!t({ halfTokens: true }).some((x) => /Меньше/.test(x)));
  });
});

describe('C9 титулы «Кто из нас?»', () => {
  it('словарь по нику для списка Tab: есть пока в табло, потом пусто', () => {
    setQuizTitles([{ ...who(2, 'Оля'), title: 'Соня набережной' }, { ...who(3, 'Петя'), title: 'Король пирса' }]);
    assert.equal(quizTitleOf('Оля'), 'Соня набережной');
    assert.equal(quizTitleOf('Петя'), 'Король пирса');
    assert.equal(quizTitleOf('Никто'), '');
    setQuizTitles(null);
    assert.equal(quizTitleOf('Оля'), '');
  });
});
