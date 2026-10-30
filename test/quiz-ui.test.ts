// «Ракушка», холсты интерфейса (client/lobby/quiz/ui): табло, вывеска и таблички пультов рисуются по любому снимку,
// не падают на каждом шаге каждого режима и пишут то, что должно быть видно. Контекст — заглушка без DOM.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { paintBoard, spinPos, cardRect, boardAnimating } from '../client/lobby/quiz/ui/board.ts';
import { paintPlates } from '../client/lobby/quiz/ui/plates.ts';
import { paintSign } from '../client/lobby/quiz/ui/sign.ts';
import { QZ, QZ_MODES, type QzBoard, type QzCrocBoard, type QzJpBoard, type QzRiddleBoard, type QzVote, type QzWhoBoard } from '../shared/quiz/types.ts';

/** Контекст-заглушка: все методы — пустышки, measureText считает по длине строки, fillText запоминает слова */
function stub(W = 2048, H = 1024): { ctx: CanvasRenderingContext2D; texts: string[] } {
  const texts: string[] = [];
  const grad = { addColorStop() {} };
  const state: Record<string, unknown> = { canvas: { width: W, height: H } };
  const ctx = new Proxy(state, {
    get(t, k) {
      if (typeof k === 'string' && k in t) return t[k];
      if (k === 'measureText') return (s: string) => ({ width: String(s).length * 22 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'fillText') return (s: string) => { texts.push(String(s)); };
      return () => {};
    },
    set(t, k, v) { t[k as string] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts };
}

const NOW = 1_000_000;
const who = (slot: number, nick: string) => ({ slot, nick });
const base = (o: Partial<QzBoard> = {}): QzBoard => ({
  rev: 1, now: NOW, phase: 'idle', endsAt: 0, mode: null, count: 4, seated: 2, vote: null, riddle: null, results: null,
  evening: [{ ...who(2, 'Оля'), pts: 7 }, { ...who(3, 'Петя'), pts: 4 }], noTokens: false, zat: null, ...o,
});

const vote = (o: Partial<QzVote> = {}): QzVote => ({
  options: QZ_MODES.map((m, i) => ({ mode: m.id, n: i === 0 ? 2 : 0, who: i === 0 ? ['Оля', 'Петя'] : [], off: i === 3 ? 'от 4' : null })),
  people: 4, voted: 2, closing: false, spin: null, win: -1, nobody: false, why: '', ...o,
});

const riddle = (o: Partial<QzRiddleBoard> = {}): QzRiddleBoard => ({
  step: 'round', num: 2, of: 5, riddler: who(5, 'Барон'), category: 'Животное', hints: ['дымит', 'по морю'], misses: ['кит', 'чайка'], warm: 2,
  endsAt: NOW + 120_000, total: QZ.ROUND_MS, checking: null, last: null, ...o,
});

const last = (end: 'solved' | 'timeout' | 'left' | 'swap' | 'empty'): NonNullable<QzRiddleBoard['last']> => ({
  end, answer: 'пароход', riddler: who(5, 'Барон'), solver: end === 'solved' ? who(2, 'Оля') : null,
});

const jp = (o: Partial<QzJpBoard> = {}): QzJpBoard => ({
  step: 'pick', pack: { id: 'b-naberezhnaya', title: 'Набережная' }, round: 'Раунд 1', final: true, host: who(9, 'Ведущий'),
  players: [{ ...who(2, 'Оля'), pult: 0, score: 300, away: 0 }, { ...who(3, 'Петя'), pult: 2, score: -200, away: NOW + 5000 }],
  turn: 2, themes: [{ name: 'Рыбалка', cells: [100, 200, 0, 400, 500] }, { name: 'Чайки и море', cells: [100, 0, 300, 400, 500] }, { name: 'Кино', cells: [100, 200, 300, 400, 500] }],
  packs: null, q: { theme: 'Рыбалка', price: 300, type: 'simple', th: 0, cell: 2, content: [{ kind: 'text', value: 'Какая рыба считается королевской на Чёрном море?' }] },
  openAt: 0, buzz: null, out: [], said: '', verdict: '', answer: null, dispute: null, fin: null, endsAt: NOW + 8000, total: 8000, ...o,
});

const croc = (o: Partial<QzCrocBoard> = {}): QzCrocBoard => ({
  step: 'draw', num: 2, of: 6, drawer: who(4, 'Соня'), queue: [who(6, 'Кузя')], mask: 'М _ _ К', level: 1, guessed: [{ ...who(2, 'Оля'), pts: 5 }],
  drawing: 3, endsAt: NOW + 50_000, total: 80_000, last: null, ...o,
});

const whoBoard = (o: Partial<QzWhoBoard> = {}): QzWhoBoard => ({
  step: 'vote', num: 3, of: 10, players: [who(2, 'Оля'), who(3, 'Петя'), who(4, 'Соня'), who(6, 'Кузя')], q: 'Кто из нас первым уснёт на рыбалке?', title: 'Соня набережной',
  by: null, asked: 3, voted: 2, skip: { n: 1, need: 3 }, tally: null, leaders: [], endsAt: NOW + 9000, total: 15_000, ...o,
});

describe('табло: каждый шаг рисуется', () => {
  const cases: Array<[string, QzBoard]> = [
    ['игры нет', base()],
    ['игры нет, никто не сидит', base({ seated: 0, count: 0 })],
    ['игры нет, сидят двое', base({ seated: 2 })],
    ['голосование', base({ phase: 'vote', endsAt: NOW + 12_000, vote: vote(), noTokens: true })],
    ['все проголосовали', base({ phase: 'vote', endsAt: NOW + 2000, vote: vote({ closing: true, voted: 4 }) })],
    ['ничья', base({ phase: 'vote', endsAt: NOW + 2000, vote: vote({ spin: { tied: [0, 1, 2], win: 2 }, win: 2, why: '2 голоса · дольше не играли' }) })],
    ['победил режим', base({ phase: 'vote', endsAt: NOW + 900, vote: vote({ win: 1, why: '2 голоса' }) })],
    ['никто не выбрал', base({ phase: 'vote', endsAt: NOW + 3000, vote: vote({ nobody: true, voted: 0 }) })],
    ['вызов роли: загадка', base({ phase: 'roles', mode: 'riddle', endsAt: NOW + 7000, riddle: riddle({ step: 'call', riddler: null, endsAt: 0, warm: 0, hints: [], misses: [], category: '' }) })],
    ['вызов роли: своя игра', base({ phase: 'roles', mode: 'jeopardy', endsAt: NOW + 7000 })],
    ['вызов роли: крокодил', base({ phase: 'roles', mode: 'croc', endsAt: NOW + 7000 })],
    ['вызов роли: кто из нас', base({ phase: 'roles', mode: 'whoofus', endsAt: NOW + 7000 })],
    ['загадка: ждём слово', base({ phase: 'game', mode: 'riddle', endsAt: NOW + 30_000, riddle: riddle({ step: 'ask', endsAt: 0, category: '', hints: [], misses: [], warm: 0 }) })],
    ['загадка: раунд', base({ phase: 'game', mode: 'riddle', riddle: riddle() })],
    ['загадка: последняя минута', base({ phase: 'game', mode: 'riddle', riddle: riddle({ endsAt: NOW + 30_000 }) })],
    ['загадка: проверка', base({ phase: 'game', mode: 'riddle', riddle: riddle({ step: 'check', checking: { ...who(2, 'Оля'), line: 7, until: NOW + 2000 } }) })],
    ['загадка: разгадали', base({ phase: 'game', mode: 'riddle', riddle: riddle({ step: 'reveal', endsAt: 0, last: last('solved') }) })],
    ['загадка: не угадали', base({ phase: 'game', mode: 'riddle', riddle: riddle({ step: 'reveal', endsAt: 0, last: last('timeout') }) })],
    ['загадка: загадывающий ушёл', base({ phase: 'game', mode: 'riddle', riddle: riddle({ step: 'reveal', endsAt: 0, last: last('left') }) })],
    ['загадка: сменили игру', base({ phase: 'game', mode: 'riddle', riddle: riddle({ step: 'reveal', endsAt: 0, last: last('swap') }) })],
    ['загадка: все ушли', base({ phase: 'game', mode: 'riddle', riddle: riddle({ step: 'reveal', endsAt: 0, last: last('empty') }) })],
    ['загадка: дальше загадывает (итог держится)', base({ phase: 'game', mode: 'riddle', endsAt: NOW + 8000, riddle: riddle({ step: 'call', endsAt: 0, last: last('solved') }) })],
    ['итоги', base({ phase: 'results', mode: 'riddle', results: { mode: 'riddle', top: [{ ...who(2, 'Оля'), pts: 9 }, { ...who(3, 'Петя'), pts: 9 }, { ...who(4, 'Соня'), pts: 3 }], endsAt: NOW + 8000 } })],
    ['итоги: очков нет', base({ phase: 'results', mode: 'riddle', results: { mode: 'riddle', top: [], endsAt: NOW + 8000 } })],
    ['итоги «Кто из нас?»', base({ phase: 'results', mode: 'whoofus', results: { mode: 'whoofus', top: [{ ...who(2, 'Оля'), pts: 5 }], endsAt: NOW + 5000, titles: [{ ...who(4, 'Соня'), title: 'Соня набережной' }] } })],
    ['итоги «Своей игры»', base({ phase: 'results', mode: 'jeopardy', results: { mode: 'jeopardy', top: [{ ...who(2, 'Оля'), pts: 900 }], endsAt: NOW + 5000, pack: { id: 'x', title: 'Кино 90-х' } } })],
    ...(['setup', 'packvote', 'pick', 'cat', 'read', 'buzz', 'answer', 'judge', 'wrong', 'dispute', 'reveal', 'fremove', 'fbet', 'fanswer', 'fjudge', 'freveal'] as const).map((step): [string, QzBoard] => [
      `своя игра: ${step}`,
      base({
        phase: 'game', mode: 'jeopardy',
        jp: jp({
          step,
          packs: step === 'packvote' ? [{ id: 'a', title: 'Кино 90-х', sub: '3 раунда', n: 2 }, { id: 'b', title: 'Набережная', sub: 'местное', n: 1 }, { id: 'c', title: 'Музыка', sub: '4 темы', n: 0 }] : null,
          buzz: step === 'answer' || step === 'reveal' ? who(2, 'Оля') : null,
          said: step === 'answer' ? 'сом' : '',
          verdict: step === 'reveal' ? 'yes' : '',
          answer: step === 'reveal' || step === 'freveal' ? { text: 'Пеламида', comment: 'Её ловят осенью', reveal: [] } : null,
          dispute: step === 'dispute' ? { by: who(2, 'Оля'), yes: 1, no: 2 } : null,
          fin: step.startsWith('f') ? { themes: ['Рыбалка', 'Кино'], remover: 2, bet: [2], answered: [2], shown: [{ ...who(2, 'Оля'), text: 'сом', ok: true, bet: 100 }, { ...who(3, 'Петя'), text: '', ok: false, bet: 50 }] } : null,
        }),
      }),
    ]),
    ['своя игра: вопрос с картинкой и звуком', base({ phase: 'game', mode: 'jeopardy', jp: jp({ step: 'read', q: { theme: 'Кино', price: 500, type: 'simple', th: 1, cell: 4, content: [{ kind: 'text', value: 'Кто это?' }, { kind: 'image', file: 'abc.webp' }, { kind: 'audio', file: 'z.mp3', sec: 5 }] } }) })],
    ['своя игра: пустая сетка', base({ phase: 'game', mode: 'jeopardy', jp: jp({ themes: [], players: [] }) })],
    ...(['call', 'words', 'draw', 'reveal'] as const).map((step): [string, QzBoard] => [`крокодил: ${step}`, base({ phase: 'game', mode: 'croc', croc: croc({ step, last: step === 'reveal' ? { end: 'all', word: 'маяк', drawer: who(4, 'Соня'), guessed: 3 } : null }) })]),
    ['крокодил: очередь пуста', base({ phase: 'game', mode: 'croc', croc: croc({ step: 'call', drawer: null, queue: [], endsAt: 0 }) })],
    ['крокодил: рисующий ушёл', base({ phase: 'game', mode: 'croc', croc: croc({ step: 'reveal', last: { end: 'left', word: 'маяк', drawer: who(4, 'Соня'), guessed: 0 } }) })],
    ...(['ask', 'vote', 'reveal'] as const).map((step): [string, QzBoard] => [
      `кто из нас: ${step}`,
      base({ phase: 'game', mode: 'whoofus', who: whoBoard({ step, tally: step === 'reveal' ? [{ ...who(2, 'Оля'), n: 1 }, { ...who(4, 'Соня'), n: 3 }] : null, leaders: step === 'reveal' ? [who(4, 'Соня')] : [] }) }),
    ]),
    ['кто из нас: никто не голосовал', base({ phase: 'game', mode: 'whoofus', who: whoBoard({ step: 'reveal', tally: [], leaders: [] }) })],
  ];

  for (const [name, b] of cases) {
    it(name, () => {
      const { ctx, texts } = stub();
      paintBoard(ctx, b, NOW);
      assert.ok(texts.length > 0, 'на табло есть надписи');
      assert.ok(!texts.some((t) => t === 'undefined' || t === 'null' || t === 'NaN' || t.includes('undefined') || t.includes('NaN')), `мусор в надписях: ${texts.join(' | ')}`);
    });
  }
});

describe('табло: что написано', () => {
  const draw = (b: QzBoard): string => { const { ctx, texts } = stub(); paintBoard(ctx, b, NOW); return texts.join(' | '); };

  it('голосование: заголовок, счёт, причина серой карточки и «без жетонов» (один внутри)', () => {
    const t = draw(base({ phase: 'vote', endsAt: NOW + 12_000, vote: vote(), noTokens: true }));
    assert.match(t, /ВО ЧТО ИГРАЕМ\?/);
    assert.match(t, /голосов 2 из 4 · 0:12/);
    assert.match(t, /от 4/);
    assert.match(t, /Один — без жетонов/);
    for (const m of QZ_MODES) assert.ok(t.includes(m.name), m.name);
  });

  it('ничья и победа: свои заголовки, подпись под победителем', () => {
    assert.match(draw(base({ phase: 'vote', endsAt: NOW + 2000, vote: vote({ spin: { tied: [0, 1], win: 1 }, win: 1 }) })), /НИЧЬЯ!/);
    const w = draw(base({ phase: 'vote', endsAt: NOW + 900, vote: vote({ win: 0, why: '2 голоса' }) }));
    assert.match(w, /ИГРАЕМ!/);
    assert.match(w, /ЗАГАДКА/);
    assert.match(w, /2 голоса/);
  });

  it('загадка: тема, время, «тепло», подсказки, «мимо», номер', () => {
    const t = draw(base({ phase: 'game', mode: 'riddle', riddle: riddle() }));
    assert.match(t, /ЗАГАДКА/);
    assert.match(t, /Животное/);
    assert.match(t, /2:00/);
    assert.match(t, /ТЕПЛО/);
    assert.match(t, /дымит/);
    assert.match(t, /кит/);
    assert.match(t, /загадка 2 из 5/);
  });

  it('загадка: проверка — «ПРОВЕРЯЕМ…»', () => {
    assert.match(draw(base({ phase: 'game', mode: 'riddle', riddle: riddle({ step: 'check', checking: { ...who(2, 'Оля'), line: 7, until: NOW + 2000 } }) })), /ПРОВЕРЯЕМ…/);
  });

  it('загадка: итоги — слово, кто угадал, счёт вечера', () => {
    const s = draw(base({ phase: 'game', mode: 'riddle', riddle: riddle({ step: 'reveal', endsAt: 0, last: last('solved') }) }));
    assert.match(s, /РАЗГАДАЛИ!/);
    assert.match(s, /ПАРОХОД/);
    assert.match(s, /Оля угадал!/);
    assert.match(s, /СЧЁТ ВЕЧЕРА/);
    assert.match(draw(base({ phase: 'game', mode: 'riddle', riddle: riddle({ step: 'reveal', endsAt: 0, last: last('left') }) })), /БАРОН УШЁЛ/);
    assert.match(draw(base({ phase: 'game', mode: 'riddle', riddle: riddle({ step: 'reveal', endsAt: 0, last: last('timeout') }) })), /НЕ УГАДАЛИ/);
  });

  it('итоги: места по очкам, равные очки — равное место', () => {
    const t = draw(base({ phase: 'results', mode: 'riddle', results: { mode: 'riddle', top: [{ ...who(2, 'Оля'), pts: 9 }, { ...who(3, 'Петя'), pts: 9 }, { ...who(4, 'Соня'), pts: 3 }], endsAt: NOW + 8000 } }));
    assert.match(t, /ИТОГИ/);
    assert.match(t, /Загадка/);
    // две единицы и тройка: «1 | …» дважды
    assert.equal(t.split(' | ').filter((x) => x === '1').length, 2);
    assert.ok(t.includes('3'));
  });

  it('своя игра: сетка и ход; вопрос; ответ', () => {
    const grid = draw(base({ phase: 'game', mode: 'jeopardy', jp: jp() }));
    assert.match(grid, /СВОЯ ИГРА/);
    assert.match(grid, /Ход: Оля/);
    assert.match(grid, /Рыбалка/);
    assert.match(grid, /осталось 13/);
    assert.match(draw(base({ phase: 'game', mode: 'jeopardy', jp: jp({ step: 'read' }) })), /кнопки откроются/);
    const ans = draw(base({ phase: 'game', mode: 'jeopardy', jp: jp({ step: 'reveal', verdict: 'yes', buzz: who(2, 'Оля'), answer: { text: 'Пеламида', comment: '', reveal: [] } }) }));
    assert.match(ans, /ВЕРНО!/);
    assert.match(ans, /Пеламида/);
    assert.match(ans, /Оля \+300/);
  });

  it('крокодил: маска слова и угадавшие; кто из нас: вопрос и титул', () => {
    const c = draw(base({ phase: 'game', mode: 'croc', croc: croc() }));
    assert.match(c, /М _ _ К/);
    assert.match(c, /Оля/);
    assert.match(c, /рисует Соня/);
    const w = draw(base({ phase: 'game', mode: 'whoofus', who: whoBoard({ step: 'reveal', tally: [{ ...who(4, 'Соня'), n: 3 }], leaders: [who(4, 'Соня')] }) }));
    assert.match(w, /Соня — «Соня набережной»/);
  });
});

describe('ничья: бегущая подсветка', () => {
  it('замедляется и встаёт на победителе, остаётся внутри равных', () => {
    for (const [tied, win] of [[[0, 2], 2], [[0, 1, 3], 0], [[1, 2, 3], 3]] as Array<[number[], number]>) {
      let prev = -1, changes = 0;
      for (let t = 0; t <= QZ.SPIN_MS; t += 20) {
        const p = spinPos(tied, win, t);
        assert.ok(tied.includes(p), `${p} в ${tied}`);
        if (p !== prev) changes++;
        prev = p;
      }
      assert.equal(prev, win);
      assert.equal(spinPos(tied, win, 2500), win, 'к концу стоит на победителе');
      assert.ok(changes >= 8, 'подсветка успевает пробежать');
    }
  });
});

describe('рамки карточек и вывеска', () => {
  it('карточки режимов не пересекаются и лежат на табло', () => {
    for (let i = 0; i < 4; i++) {
      const r = cardRect(i);
      assert.ok(r.x >= 0 && r.x + r.w <= 2048 && r.y >= 0 && r.y + r.h <= 1024);
      if (i) assert.ok(r.x >= cardRect(i - 1).x + cardRect(i - 1).w);
    }
  });

  it('вывеска: название и строка статуса', () => {
    const t = (b: QzBoard | null): string => { const { ctx, texts } = stub(1024, 256); paintSign(ctx, b, NOW); return texts.join(' | '); };
    assert.match(t(null), /Игры нет — заходи/);
    assert.match(t(base({ phase: 'vote', endsAt: NOW + 14_000, vote: vote() })), /Голосуем · 0:14/);
    assert.match(t(base({ phase: 'game', mode: 'riddle', riddle: riddle() })), /Загадка · 2:00 · 4 игрока/);
    assert.match(t(base({ phase: 'results', mode: 'riddle' })), /Итоги · Загадка/);
  });

  it('табло подсказывает, когда на нём что-то движется', () => {
    assert.equal(boardAnimating(base()), false);
    assert.equal(boardAnimating(base({ phase: 'vote', vote: vote({ spin: { tied: [0, 1], win: 0 } }) })), true);
    assert.equal(boardAnimating(base({ phase: 'game', mode: 'riddle', riddle: riddle({ step: 'reveal', endsAt: 0, last: last('solved') }) })), true);
  });
});

describe('таблички пультов', () => {
  it('рисуются в клетки атласа: занятые со счётом, свободные тире', () => {
    const { ctx, texts } = stub(1024, 768);
    const b = base({ phase: 'game', mode: 'jeopardy', jp: jp() });
    paintPlates(ctx, b, NOW, 2);
    assert.equal(texts.filter((x) => x === '—').length, 4, 'четыре свободных пульта из шести');
    assert.ok(texts.includes('300'));
    assert.ok(texts.some((x) => x.includes('отошёл')), 'отошедший помечен');
    const empty = stub(1024, 768);
    paintPlates(empty.ctx, null, NOW);
    assert.equal(empty.texts.filter((x) => x === '—').length, 6);
  });
});

// ------------------------------------------------------------------ HUD: что показывать по снимку (hud-model.ts, без DOM)
import {
  DOCK_ROWS, OWN_SHOW_MS, OWN_TAG, OWN_TEXT_MAX, dockModel, isRiddling, keysRow, ownGuess, ownText, plateSpec, playBar, rolesBar, warmModel, warmVisible, hintLabel,
} from '../client/lobby/quiz/ui/hud-model.ts';
import type { QzLine, QzMe, QzRiddleView, QzView } from '../shared/quiz/types.ts';

const youMe = (o: Partial<QzMe> = {}): QzMe => ({
  slot: 2, place: 0, role: '', vote: -1, swap: false, canSwap: true, canPlay: false, canTake: false, gapUntil: 0, ...o,
});
const ln = (id: number, slot: number, nick: string, text: string, at: number, mark: QzLine['mark'] = '', markedAt = 0, kind: QzLine['kind'] = 'guess'): QzLine => ({
  id, slot, nick, text, at, kind, mark, markedAt,
});
const rview = (o: Partial<QzRiddleView> = {}, lines: QzLine[] = []): QzRiddleView => ({ ...riddle(o), lines });
const hview = (o: Partial<QzView> = {}): QzView => ({ ...base(), people: [], call: null, swap: { n: 0, need: 2 }, ...o }) as QzView;
const game = (r: Partial<QzRiddleView> = {}, lines: QzLine[] = [], o: Partial<QzView> = {}): QzView => hview({ phase: 'game', mode: 'riddle', riddle: rview(r, lines), ...o });

describe('HUD: плашка сверху', () => {
  it('голосование: четыре кнопки, мой выбор, серая карточка; важнее прочих плашек', () => {
    const v = hview({ phase: 'vote', endsAt: NOW + 9000, vote: vote() });
    const s = plateSpec(v, youMe({ vote: 1 }), NOW)!;
    assert.equal(s.prio, 90);
    assert.match(s.html, /Во что играем\?/);
    assert.equal((s.html.match(/data-qz="vote"/g) ?? []).length, 4);
    assert.match(s.html, /qz-vbtn is-mine" data-qz="vote" data-i="1"/);
    assert.match(s.html, /data-i="3" disabled/);
    assert.match(s.html, /Кто из нас\?: от 4/);
  });

  it('ничья, победа, «никто не выбрал»', () => {
    const me = youMe();
    assert.match(plateSpec(hview({ phase: 'vote', vote: vote({ spin: { tied: [0, 1], win: 1 } }) }), me, NOW)!.html, /Ничья — колесо/);
    const w = plateSpec(hview({ phase: 'vote', vote: vote({ win: 1, why: '2 голоса' }) }), me, NOW)!;
    assert.match(w.html, /Играем: <b>Своя игра<\/b>/);
    assert.equal(w.tone, 'good');
    assert.match(plateSpec(hview({ phase: 'vote', vote: vote({ nobody: true }) }), me, NOW)!.html, /Никто не выбрал/);
  });

  it('вызов роли: кому что написано', () => {
    const call = (by: 'open' | 'solver' | 'zat', to: number): NonNullable<QzView['call']> => ({ role: 'riddler', by, to: to ? who(to, 'Петя') : null, endsAt: NOW + 7000 });
    const rolesView = (c: NonNullable<QzView['call']>): QzView => hview({ phase: 'roles', mode: 'riddle', call: c });
    assert.match(plateSpec(rolesView(call('open', 0)), youMe(), NOW)!.html, /Кто загадывает\?/);
    const mine = plateSpec(rolesView(call('solver', 2)), youMe(), NOW)!;
    assert.match(mine.html, /Твоя очередь загадывать/);
    assert.equal(mine.lamp, true);
    assert.match(plateSpec(rolesView(call('solver', 3)), youMe(), NOW)!.html, /Дальше загадывает <b>Петя<\/b>/);
    assert.match(plateSpec(rolesView(call('zat', 3)), youMe(), NOW)!.html, /Затейник выбрал: загадывает <b>Петя<\/b>/);
    assert.match(plateSpec(rolesView(call('zat', 2)), youMe(), NOW)!.html, /Загадываешь ты/);
  });

  it('раунд: угадывающим — «загадал» и «Сменить игру?», загадывающему — слово, кольцо и «Открыть ответ»', () => {
    const v = game({ endsAt: NOW + 75_000 });
    const g = plateSpec(v, youMe(), NOW)!;
    assert.match(g.html, /<b>Барон<\/b> загадал/);
    assert.match(g.html, /data-qz="swap"/);
    assert.ok(!g.html.includes('qz-ring'), 'кольцо времени только у загадывающего');
    const r = plateSpec(v, youMe({ role: 'riddler', word: 'пароход' }), NOW)!;
    assert.match(r.html, /Ты загадал: <b class="k-gold">пароход<\/b>/);
    assert.match(r.html, /qz-ring/);
    assert.match(r.html, /1:15/);
    assert.match(r.html, /data-qz="giveup"[^>]*>Открыть ответ/);
    assert.match(plateSpec(v, youMe({ role: 'riddler', word: 'пароход' }), NOW, true)!.html, /Точно открыть\?/);
    assert.ok(!plateSpec(game({ endsAt: NOW + 75_000 }, [], { swap: null }), youMe(), NOW)!.html.includes('data-qz="swap"'), 'нельзя сменить — нет кнопки');
  });

  it('последняя минута: кольцо красное', () => {
    const v = game({ endsAt: NOW + 30_000 });
    assert.match(plateSpec(v, youMe({ role: 'riddler' }), NOW)!.html, /qz-ring is-hurry/);
  });

  it('проверка: у всех «Проверяем…» с лампой, «Отменить Z» и кольцо — только загадывающему', () => {
    const v = game({ step: 'check', checking: { ...who(3, 'Петя'), line: 7, until: NOW + 2000 } }, [ln(7, 3, 'Петя', 'пароход', NOW - 5000, 'check', NOW - 1000)]);
    const g = plateSpec(v, youMe(), NOW)!;
    assert.match(g.html, /Проверяем…/);
    assert.match(g.html, /<b>Петя<\/b> · «пароход»/);
    assert.equal(g.lamp, true);
    assert.ok(!g.html.includes('data-qz="undo"'));
    const r = plateSpec(v, youMe({ role: 'riddler' }), NOW)!;
    assert.match(r.html, /data-qz="undo"/);
    assert.match(r.html, /<b>2<\/b>/);
  });

  it('итог загадки: плашка говорит, что дальше (слово и кто угадал — на табло)', () => {
    const rev = (end: 'solved' | 'timeout' | 'left', solver = 3): QzView => game({ step: 'reveal', endsAt: 0, last: { end, answer: 'пароход', riddler: who(5, 'Барон'), solver: end === 'solved' ? who(solver, 'Оля') : null } });
    assert.match(plateSpec(rev('solved'), youMe(), NOW)!.html, /Дальше загадывает <b>Оля<\/b>/);
    assert.match(plateSpec(rev('solved', 2), youMe(), NOW)!.html, /Дальше загадываешь ты/);
    assert.match(plateSpec(rev('timeout'), youMe(), NOW)!.html, /Дальше выберет Затейник/);
    assert.match(plateSpec(rev('left'), youMe(), NOW)!.html, /Дальше выберет Затейник/);
    assert.doesNotMatch(plateSpec(rev('solved'), youMe(), NOW)!.html, /пароход/);
  });

  it('итоги игры: строка участнику; без неё — кто больше всех', () => {
    const v = hview({ phase: 'results', mode: 'riddle', results: { mode: 'riddle', top: [{ ...who(3, 'Петя'), pts: 9 }], endsAt: NOW + 8000 } });
    const mine = plateSpec(v, youMe({ result: { place: 1, pts: 9, tokens: 24 } }), NOW)!;
    assert.match(mine.html, /1-е место/);
    assert.match(mine.html, /9 очков/);
    assert.match(mine.html, /\+24 <img class="k-coin"/);
    assert.match(plateSpec(v, youMe(), NOW)!.html, /Игра окончена[\s\S]*Больше всех у Петя/);
  });

  it('чужой текст экранируется; «игры нет» — без плашки', () => {
    const v = game({ riddler: who(5, '<b>x</b>') });
    assert.ok(!plateSpec(v, youMe(), NOW)!.html.includes('<b>x</b>'));
    assert.equal(plateSpec(hview({ phase: 'idle' }), youMe(), NOW), null);
  });
});

describe('HUD: полосы внизу', () => {
  it('«Сыграем?» — только сидящему, когда игры нет', () => {
    assert.match(playBar(hview({ phase: 'idle' }), youMe({ canPlay: true }))!.html, /data-qz="play"[^>]*>Сыграем\?/);
    assert.equal(playBar(hview({ phase: 'idle' }), youMe()), null);
    assert.equal(playBar(hview({ phase: 'vote' }), youMe({ canPlay: true })), null);
  });

  it('вызов роли: «Загадываю!» с F, отсчёт, «Пропустить» — назначенному', () => {
    const call = (by: 'open' | 'zat', to: number, left: number): NonNullable<QzView['call']> => ({ role: 'riddler', by, to: to ? who(to, 'Оля') : null, endsAt: NOW + left });
    const open = rolesBar(hview({ phase: 'roles', mode: 'riddle', call: call('open', 0, 8000) }), youMe({ canTake: true }), NOW)!;
    assert.match(open.html, /Кто загадывает первым\?/);
    assert.match(open.html, /data-r="riddler">Загадываю!<kbd class="k-key k-key--sm k-key--tr">F/);
    assert.ok(!open.html.includes('Пропустить'));
    assert.equal(open.time, '0:08');
    assert.equal(open.hurry, false);
    const zat = rolesBar(hview({ phase: 'roles', mode: 'riddle', call: call('zat', 2, 2000) }), youMe({ canTake: true }), NOW)!;
    assert.match(zat.html, /Затейник выбрал тебя/);
    assert.match(zat.html, /data-qz="skip"/);
    assert.equal(zat.hurry, true);
    assert.equal(rolesBar(hview({ phase: 'roles', mode: 'riddle', call: call('open', 0, 8000) }), youMe(), NOW), null, 'нельзя взять — нет полосы');
  });

  it('несколько ролей («Своя игра»): первая — главная кнопка, остальные ghost', () => {
    const call: NonNullable<QzView['call']> = { role: 'host', roles: ['host', 'player'], by: 'open', to: null, endsAt: NOW + 9000 };
    const b = rolesBar(hview({ phase: 'roles', mode: 'jeopardy', call }), youMe({ canTake: true }), NOW)!;
    assert.match(b.html, /k-btn--go" data-qz="role" data-r="host">Веду я/);
    assert.match(b.html, /k-btn--ghost" data-qz="role" data-r="player">Играю/);
  });

  it('ряд клавиш загадывающего и «Подсказка»', () => {
    assert.match(keysRow(false, false), /1<\/kbd><em>тепло[\s\S]*2<\/kbd><em>мимо[\s\S]*3<\/kbd><em>угадал/);
    assert.match(keysRow(true, true), /Z<\/kbd><em>отменить/);
    assert.ok(keysRow(true, false).includes('is-off'));
    assert.match(hintLabel(3), /0\/3/);
    assert.match(hintLabel(1), /2\/3/);
  });

  it('кто загадывает: шаги раунда и проверки', () => {
    assert.equal(isRiddling(game(), youMe({ role: 'riddler' })), true);
    assert.equal(isRiddling(game({ step: 'check' }), youMe({ role: 'riddler' })), true);
    assert.equal(isRiddling(game({ step: 'ask' }), youMe({ role: 'riddler' })), false);
    assert.equal(isRiddling(game(), youMe()), false);
  });
});

describe('HUD: док «В игру»', () => {
  const T = 100_000;
  const me = youMe({ role: 'riddler', slot: 2 });
  const guess = (id: number, slot: number, text: string, at: number, mark: QzLine['mark'] = '', markedAt = 0): QzLine => ln(id, slot, `Игрок${slot}`, text, at, mark, markedAt);

  it('«тепло» в доке нет; у загадывающего неотмеченные — с кнопками, самая старая — с колпачками', () => {
    const lines = [guess(1, 3, 'лодка', T - 5000, 'warm', T - 3000), guess(2, 4, 'катер', T - 4000), guess(3, 5, 'яхта', T - 2000)];
    const m = dockModel(lines, me, T, true, false);
    assert.deepEqual(m.rows.map((r) => r.id), [2, 3]);
    assert.ok(m.rows.every((r) => r.buttons));
    assert.deepEqual(m.rows.map((r) => r.caps), [true, false]);
    const g = dockModel(lines, youMe(), T, false, false);
    assert.deepEqual(g.rows.map((r) => r.id), [2, 3], 'угадывающим строки видны, но без кнопок');
    assert.ok(g.rows.every((r) => !r.buttons && !r.caps && !r.undo));
  });

  it('не больше пяти неотмеченных с кнопками, остальные ждут', () => {
    const lines = Array.from({ length: 8 }, (_, i) => guess(10 + i, 3 + i, `слово ${i}`, T - 8000 + i * 100));
    const m = dockModel(lines, me, T, true, false);
    assert.equal(m.rows.filter((r) => r.buttons).length, 5);
    assert.equal(m.waiting, 3);
    assert.deepEqual(m.rows.map((r) => r.id), [10, 11, 12, 13, 14]);
  });

  it('свои строки без кнопок; «похоже на ответ» — отмечено', () => {
    const lines = [guess(1, 2, 'моя', T - 3000), guess(2, 3, 'почти', T - 2000)];
    const m = dockModel(lines, youMe({ role: 'riddler', slot: 2, near: [2] }), T, true, false);
    assert.equal(m.rows[0].buttons, false);
    assert.equal(m.rows[0].own, true);
    assert.equal(m.rows[1].near, true);
  });

  it('угадывающему свои догадки в доке не показываем: их держит плашка над чатом', () => {
    const lines = [guess(1, 2, 'моя', T - 3000), guess(2, 3, 'чужая', T - 2000), ln(3, 0, 'Затейник', 'Барон загадал!', T - 4000, '', 0, 'zat')];
    assert.deepEqual(dockModel(lines, youMe(), T, false, false).rows.map((r) => r.id), [3, 2]);
    assert.equal(dockModel([guess(1, 2, 'моя', T - 3000, 'miss', T - 500)], youMe(), T, false, false).rows.length, 0);
  });

  it('«мимо»: у загадывающего 5 с с «↩ Вернуть», потом гаснет и уходит; у остальных — 1,8 с', () => {
    const l = [guess(1, 3, 'самолёт', T - 9000, 'miss', T - 1000)];
    const mine = dockModel(l, me, T, true, false).rows[0];
    assert.equal(mine.undo, true);
    assert.equal(mine.fade, false);
    assert.equal(dockModel(l, youMe(), T, false, false).rows[0].undo, false);
    const late = dockModel([guess(1, 3, 'самолёт', T - 9000, 'miss', T - 5200)], me, T, true, false);
    assert.equal(late.rows[0].fade, true);
    assert.equal(dockModel([guess(1, 3, 'самолёт', T - 9000, 'miss', T - 6000)], me, T, true, false).rows.length, 0);
    assert.equal(dockModel([guess(1, 3, 'самолёт', T - 9000, 'miss', T - 1000)], youMe(), T + 1000, false, false).rows[0].fade, true);
  });

  it('во время проверки: нет колпачков и «Вернуть», строка проверки подсвечена', () => {
    const lines = [guess(1, 3, 'пароход', T - 4000, 'check', T - 500), guess(2, 4, 'катер', T - 2000)];
    const m = dockModel(lines, me, T, true, true);
    assert.equal(m.rows[0].mark, 'check');
    assert.equal(m.rows[0].buttons, false);
    assert.equal(m.rows[1].buttons, true);
    assert.equal(m.rows[1].caps, false);
  });

  it('реплики Затейника — без ника; всего не больше шести, кнопочные строки остаются', () => {
    const z = ln(1, 0, 'Затейник', 'Барон загадал!', T - 9000, '', 0, 'zat');
    assert.equal(dockModel([z], youMe(), T, false, false).rows[0].sys, true);
    const many = [z, ...Array.from({ length: 4 }, (_, i) => guess(10 + i, 3 + i, `реплика ${i}`, T - 8000 + i * 10)), ...Array.from({ length: 5 }, (_, i) => guess(20 + i, 9 + i, `догадка ${i}`, T - 100 + i))];
    const m = dockModel(many, me, T, true, false);
    assert.equal(m.rows.length, DOCK_ROWS);
    assert.equal(m.rows.filter((r) => r.buttons).length, 5);
  });

  it('карточка «Тепло»: по времени отметки; «ещё N»; подсказки', () => {
    const lines = Array.from({ length: 7 }, (_, i) => guess(i + 1, 3, `тепло ${i}`, T - 9000 + i, 'warm', T - 7000 + (6 - i)));
    const w = warmModel(game({ hints: ['дымит'] }, lines));
    assert.equal(w.rows.length, 7);
    assert.equal(w.rows[0].text, 'тепло 6', 'раньше отмечена — выше');
    assert.equal(w.more, 2);
    assert.deepEqual(w.hints, ['дымит']);
    assert.equal(warmVisible(game()), true);
    assert.equal(warmVisible(game({ step: 'reveal' })), false);
    assert.equal(warmVisible(hview({ phase: 'vote' })), false);
  });
});

describe('HUD: моя последняя догадка', () => {
  const T = 50_000;
  const mine = (id: number, text: string, at: number, mark: QzLine['mark'] = '', markedAt = 0): QzLine => ln(id, 2, 'Я', text, at, mark, markedAt);

  it('берёт свою самую свежую догадку и её отметку; чужие и реплики не считает', () => {
    const lines = [mine(1, 'лодка', T - 9000, 'miss', T - 8000), ln(2, 3, 'Оля', 'катер', T - 1000), mine(3, 'корабль', T - 4000, 'warm', T - 2500), ln(4, 2, 'Я', 'ещё слово', T - 500, '', 0, 'say')];
    const g = ownGuess(game({}, lines), youMe())!;
    assert.equal(g.id, 3);
    assert.equal(g.text, 'корабль');
    assert.equal(g.mark, 'warm');
    assert.equal(g.at, T - 2500, 'перемена — по отметке');
    assert.equal(ownGuess(game({}, [mine(5, 'новая', T - 100)]), youMe())!.mark, '');
  });

  it('пять тонов: подпись для каждого', () => {
    assert.deepEqual(Object.values(OWN_TAG), ['отправлено', 'тепло', 'горячо!', 'мимо', 'проверяем…', 'угадал!']);
  });

  it('загадывающему и вне игры не нужна; нет своих строк — нет статуса', () => {
    const lines = [mine(1, 'лодка', T - 1000)];
    assert.equal(ownGuess(game({}, lines), youMe({ role: 'riddler' })), null);
    assert.equal(ownGuess(hview({ phase: 'vote' }), youMe()), null);
    assert.equal(ownGuess(game({}, [ln(2, 3, 'Оля', 'катер', T)]), youMe()), null);
  });

  it('длинный текст — до сорока знаков с многоточием', () => {
    const long = 'очень-очень длинная догадка, которая не поместится в маленький статус над чатом';
    assert.equal(ownText(long).length, OWN_TEXT_MAX);
    assert.ok(ownText(long).endsWith('…'));
    assert.equal(ownText('лодка'), 'лодка');
    assert.equal(OWN_SHOW_MS, 6000);
  });
});
