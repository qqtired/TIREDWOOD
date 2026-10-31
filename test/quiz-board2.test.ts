// Табло «Загадки», новая раскладка раунда (board-riddle2.ts; в игре по умолчанию «Панели», ?board2=lines — «Линии»): рисует тему, число «тепло», подсказки, «мимо», очередь,
// «загадывает Ник», «загадка N из M»; «горячо», «проверяем», «ждём слово»; текст не мельче 40 px холста. Холст-заглушка, как в
// quiz-ui3.test.ts. Главное и главный сценарий, крайних случаев нет.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { paintBoard } from '../client/lobby/quiz/ui/board.ts';
import { paintRiddleRoundNow } from '../client/lobby/quiz/ui/board-riddle.ts';
import { paintRiddleAsk2, paintRiddleRound2, type RiddleStyle } from '../client/lobby/quiz/ui/board-riddle2.ts';
import { QZ, type QzBoard, type QzRiddleBoard } from '../shared/quiz/types.ts';

const NOW = 2_000_000;
const who = (slot: number, nick: string) => ({ slot, nick });

/** Холст-заглушка: все методы — пустышки, measureText по длине; fillText запоминает слово и шрифт, с которым его писали */
function stub(W = 2048, H = 1024): { ctx: CanvasRenderingContext2D; texts: string[]; px: number[] } {
  const out = { texts: [] as string[], px: [] as number[] };
  const grad = { addColorStop() {} };
  const state: Record<string, unknown> = { canvas: { width: W, height: H }, font: '' };
  const ctx = new Proxy(state, {
    get(t, k) {
      if (typeof k === 'string' && k in t) return t[k];
      if (k === 'measureText') return (s: string) => ({ width: String(s).length * 22 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'fillText') return (s: string) => { out.texts.push(String(s)); out.px.push(Number(/(\d+(?:\.\d+)?)px/.exec(String(t.font))?.[1] ?? 0)); };
      return () => {};
    },
    set(t, k, v) { t[k as string] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts: out.texts, px: out.px };
}

const riddle = (o: Partial<QzRiddleBoard> = {}): QzRiddleBoard => ({
  step: 'round', num: 1, of: QZ.RIDDLES, riddler: who(182, 'Tester182'), category: 'Предмет', hints: ['дымит'], misses: ['кит', 'чайка', 'буй'], warm: 2,
  endsAt: NOW + 276_000, total: QZ.ROUND_MS, checking: null, last: null, queue: [who(183, 'Tester183'), who(184, 'Tester184')], hot: 0, hotText: '', ...o,
});
const board = (r: QzRiddleBoard, o: Partial<QzBoard> = {}): QzBoard => ({
  rev: 1, now: NOW, phase: 'game', endsAt: 0, mode: 'riddle', count: 5, seated: 4, vote: null, riddle: r, results: null, evening: [], noTokens: false, zat: null, ...o,
});
const round = (r: QzRiddleBoard, style: RiddleStyle) => {
  const s = stub();
  paintRiddleRound2(s.ctx, board(r), r, NOW, 2048, 1024, style);
  return s;
};

for (const style of ['lines', 'panels'] as const) {
  describe(`табло «Загадки», раунд — ${style === 'lines' ? 'линии' : 'панели'}`, () => {
    it('тема, «тепло», подсказка, «мимо», очередь, «загадывает Ник», «загадка N из M», время', () => {
      const { texts } = round(riddle(), style);
      for (const want of ['ЗАГАДКА', 'Предмет', '2', 'ТЕПЛО', 'ПОДСКАЗКИ', 'дымит', 'МИМО', 'кит', 'чайка', 'буй', 'ДАЛЬШЕ', 'Tester183, Tester184', 'загадывает', 'Tester182', 'загадка 1 из 5', '4:36']) {
        assert.ok(texts.includes(want), `на табло нет «${want}»: ${texts.join(' | ')}`);
      }
      assert.ok(!texts.some((t) => /^\d\s/.test(t)), 'подсказки без номеров');
      assert.ok(!texts.includes('ГОРЯЧО'), 'без «горячо» нет и подписи');
    });

    it('начало раунда: «пока нет», ноль «тепло», без «мимо» и очереди', () => {
      const { texts } = round(riddle({ hints: [], misses: [], queue: [], warm: 0 }), style);
      assert.ok(texts.includes('пока нет'));
      assert.ok(texts.includes('0'));
      assert.ok(!texts.includes('МИМО'), 'пустого «мимо» на табло нет');
      assert.ok(!texts.includes('ДАЛЬШЕ'), 'пустой очереди на табло нет');
    });

    it('«горячо»: подпись, число и текст последней такой догадки', () => {
      const { texts } = round(riddle({ warm: 4, hot: 1, hotText: 'Большое и дымит?' }), style);
      assert.ok(texts.includes('ГОРЯЧО'));
      assert.ok(texts.includes('1'));
      assert.ok(texts.includes('4'));
      assert.ok(texts.some((t) => t.startsWith('Большое')), 'текст горячей догадки');
    });

    it('идёт проверка «угадал» — пилюля «ПРОВЕРЯЕМ…»; без неё её нет', () => {
      const r = riddle({ step: 'check', checking: { ...who(185, 'Оля'), line: 3, until: NOW + 3000 } });
      assert.ok(round(r, style).texts.includes('ПРОВЕРЯЕМ…'));
      assert.ok(!round(riddle(), style).texts.includes('ПРОВЕРЯЕМ…'));
    });

    it('последняя минута и длинные тексты: время есть, подсказки в три строки, ничего мельче 40 px', () => {
      const r = riddle({
        endsAt: NOW + 41_000, category: 'Фильм или книга', warm: 14, hot: 2, hotText: 'Большое и дымит по морю, это пароход?',
        hints: ['Большое, тяжёлое, плавает по морю', 'Плывёт по морю, дымит и гудит', 'Начинается на букву П, а кончается Д'],
        misses: ['гигантский подводный кальмар', 'пароходик', 'старая калоша с дыркой'],
        queue: [who(1, 'Tester184'), who(2, 'Оля'), who(3, 'Петя'), who(4, 'Вася'), who(5, 'Маша')],
      });
      const { texts, px } = round(r, style);
      assert.ok(texts.includes('0:41'));
      assert.ok(texts.includes('Tester184, Оля, Петя +2'));
      assert.ok(texts.some((t) => t.endsWith('пароход?')), 'догадка «горячо» — целиком, без многоточия');
      px.forEach((p, i) => assert.ok(p >= 40, `«${texts[i]}» мельче 40 px: ${p}`));
    });
  });
}

describe('табло «Загадки», ждём слово', () => {
  it('общая шапка (заголовок, время, «загадка N из M»), кто загадывает, очередь', () => {
    const r = riddle({ step: 'ask', num: 2, category: '', riddler: who(181, 'Tester181'), queue: [who(185, 'Оля'), who(186, 'Петя')] });
    for (const style of ['lines', 'panels'] as const) {
      const s = stub();
      paintRiddleAsk2(s.ctx, board(r, { endsAt: NOW + 28_000 }), r, NOW, 2048, 1024, style);
      for (const want of ['ЗАГАДКА', 'загадка 2 из 5', 'Tester181 загадывает…', 'Придумывает слово — скоро начнём', '0:28', 'ДАЛЬШЕ', 'Оля, Петя']) {
        assert.ok(s.texts.includes(want), `${style}: нет «${want}»`);
      }
    }
  });
});

describe('по умолчанию — новая раскладка («Панели», решение №19); прежняя осталась в коде для отката', () => {
  it('paintBoard рисует тему пилюлей и «загадывает Ник»; прежний раунд — шапка «· Предмет» и карточка «ТЕПЛО»', () => {
    const r = riddle();
    const next = stub();
    paintBoard(next.ctx, board(r), NOW);
    assert.ok(next.texts.includes('Предмет') && !next.texts.includes('·  Предмет'), 'новая шапка');
    assert.ok(next.texts.includes('загадывает'));
    const old = stub();
    paintRiddleRoundNow(old.ctx, board(r), r, NOW, 2048, 1024);
    assert.ok(old.texts.includes('·  Предмет'), 'прежняя шапка');
    assert.ok(old.texts.includes('ТЕПЛО'));
  });
});
