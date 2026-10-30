import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { newCroc, reduceCroc, crocBoard, crocView, crocMe, crocInk, type CrocAction } from '../shared/quiz/croc.ts';
import { parseText } from '../shared/quiz/text.ts';
import { QZ, QZ_CROC as CR, type QzInkOp } from '../shared/quiz/types.ts';

const ps = Array.from({ length: 7 }, (_, i) => ({ slot: i + 1, pid: i + 101, nick: `Игрок${i + 1}`, seated: true }));
const pack = () => parseText(readFileSync(new URL('./fixtures/quiz/croc-words.txt', import.meta.url), 'utf8')).pack;
function game(n = 4, queue = [ps[0]]) {
  let s = newCroc(ps.slice(0, n), [pack()], 0, queue), now = 0;
  return {
    get s() { return s; }, get now() { return now; },
    act(a: CrocAction, at = now) { now = at; const r = reduceCroc(s, a, now, () => 0); s = r.state; return r; },
    tick(at = s.endsAt) { return this.act({ a: 'tick' }, at); },
    draw(level = 0) { this.tick(); return this.act({ a: 'crWord', slot: s.drawer!.slot, i: level }); },
  };
}
test('очередь, назначение без желающих, выбор/случайное слово и круг до шести рисунков', () => {
  const g = game(6, ps.slice(0, 6));
  g.tick(); assert.deepEqual(crocMe(g.s, 1).choices, ['маяк', 'пароход', 'водолаз']); assert.equal(crocMe(g.s, 2).choices, undefined);
  g.tick(); assert.equal(g.s.step, 'draw'); assert.equal(g.s.word, 'маяк');
  const first = g.s.drawing;
  g.act({ a: 'role', who: ps[0], take: true }); assert.ok(!g.s.queue.some(p => p.pid === ps[0].pid));
  for (let turn = 0; turn < 6; turn++) {
    if (turn) g.act({ a: 'crWord', slot: g.s.drawer!.slot, i: 0 });
    for (const p of ps.slice(0, 6)) if (p.pid !== g.s.drawer!.pid) g.act({ a: 'say', slot: p.slot, text: 'маяк' });
    assert.equal(g.s.step, 'reveal'); g.tick();
  }
  assert.equal(first, 1); assert.equal(g.s.done, true); assert.equal(g.s.drew.length, 6);
  const empty = game(4, []); empty.tick(); assert.equal(empty.s.assigned?.slot, 1);
  empty.act({ a: 'role', who: ps[0], take: false }); assert.equal(empty.s.assigned?.slot, 2);
  empty.act({ a: 'role', who: ps[1], take: true }); assert.equal(empty.s.step, 'words');
});
test('буквы ровно на 40 и 20 с до конца, публичный снимок скрывает слово и личные варианты', () => {
  const g = game(); g.draw(1);
  assert.equal(g.s.word, 'пароход'); assert.ok(!JSON.stringify(crocBoard(g.s)).includes('пароход'));
  g.tick(g.s.endsAt - 40_001); assert.equal(g.s.revealed.length, 0);
  g.tick(g.s.endsAt - 40_000); assert.equal(g.s.revealed.length, 1);
  g.tick(g.s.endsAt - 20_000); assert.equal(g.s.revealed.length, 2);
  assert.equal(crocMe(g.s, 1).word, 'пароход'); assert.equal(crocMe(g.s, 2).word, undefined);
  g.tick(); assert.equal(g.s.last?.end, 'timeout'); assert.equal(g.s.last?.word, 'пароход');
});
test('догадки: got без слова, личное «Почти», приватный чат угадавшего и запрет ответа рисующему', () => {
  const g = game(); g.draw();
  assert.equal(g.act({ a: 'say', slot: 1, text: 'маяк' }).error?.code, 'answer');
  assert.equal(g.act({ a: 'say', slot: 2, text: 'маак' }).error?.code, 'near'); assert.equal(g.s.lines.length, 0);
  g.act({ a: 'say', slot: 2, text: 'маяк' }, g.now + QZ.SAY_GAP_MS);
  assert.equal(g.s.lines.at(-1)?.kind, 'got'); assert.ok(!g.s.lines.at(-1)?.text.includes('маяк'));
  g.act({ a: 'say', slot: 2, text: 'Секрет: маяк' }, g.now + QZ.SAY_GAP_MS);
  assert.ok(crocView(g.s, 1).lines.some(l => l.text === 'Секрет: маяк'));
  assert.ok(crocView(g.s, 2).lines.some(l => l.text === 'Секрет: маяк'));
  assert.ok(!crocView(g.s, 3).lines.some(l => l.text === 'Секрет: маяк'));
  g.act({ a: 'say', slot: 3, text: 'маяк' }); g.act({ a: 'say', slot: 4, text: 'маяк' });
  assert.equal(g.s.last?.end, 'all'); assert.equal(g.s.step, 'reveal');
});
test('очки 5/4/3/2 × сложность с округлением, потолок рисующему; уход отменяет очки рисунка', () => {
  const g = game(7); g.draw(1);
  for (const p of ps.slice(1)) g.act({ a: 'say', slot: p.slot, text: 'пароход' });
  assert.deepEqual(g.s.guessed.map(p => p.pts), [8, 6, 5, 3, 3, 3]);
  assert.equal(g.s.scores[101], 15); assert.equal(g.s.turns[0].counted, true);
  const left = game(); left.draw(); left.act({ a: 'say', slot: 2, text: 'маяк' });
  assert.deepEqual(left.s.scores, {});
  left.act({ a: 'presence', people: ps.slice(1, 4) });
  assert.equal(left.s.last?.end, 'left'); assert.deepEqual(left.s.turns[0].points, {}); assert.deepEqual(left.s.scores, {});
});
test('мазки: роль, 50 мс, лимит 64 точек и координаты; отмена, очистка, полный рисунок новому зрителю', () => {
  const g = game(); g.draw();
  const op: QzInkOp = ['s', 1, 0, 1, 0, 0, 100, 100];
  g.act({ a: 'crInk', slot: 2, ops: [op] }); assert.equal(g.s.strokes.length, 0);
  const before = structuredClone(g.s); assert.ok(g.act({ a: 'crInk', slot: 1, ops: [op] }).ink); assert.equal(before.strokes.length, 0);
  g.act({ a: 'crInk', slot: 1, ops: [['s', 1, 0, 1, 200, 200]] }); assert.equal(g.s.inkPoints, 2);
  g.act({ a: 'crInk', slot: 1, ops: [['s', 1, 0, 1, 200, 200]] }, g.now + 50); assert.equal(g.s.inkPoints, 3);
  const full = crocInk(g.s); assert.equal(full.full, true); assert.deepEqual(full.ops, [['s', 1, 0, 1, 0, 0, 100, 100, 200, 200]]);
  g.act({ a: 'crInk', slot: 1, ops: [['s', 2, 0, 0, 1024, 0]] }, g.now + 50); assert.equal(g.s.strokes.length, 1);
  const oversized: QzInkOp = ['s', 2, 0, 0, ...Array(130).fill(1)];
  g.act({ a: 'crInk', slot: 1, ops: [oversized] }, g.now + 50); assert.equal(g.s.inkPoints, 3);
  g.act({ a: 'crInk', slot: 1, ops: [['u', 1]] }, g.now + 50); assert.deepEqual(crocInk(g.s).ops, []);
  g.act({ a: 'crInk', slot: 1, ops: [['s', 2, CR.ERASER, 0, 3, 3]] }, g.now + 50);
  g.act({ a: 'crInk', slot: 1, ops: [['x']] }, g.now + 50); assert.deepEqual(crocInk(g.s).ops, []);
});
test('на рисунок максимум 20 000 точек; очистка не сбрасывает лимит', () => {
  const g = game(); g.draw();
  let remaining = CR.INK_PTS;
  while (remaining > 0) {
    const count = Math.min(64, remaining);
    g.act({ a: 'crInk', slot: 1, ops: [['s', 1, 0, 0, ...Array(count * 2).fill(1)]] }, g.now + CR.INK_BATCH_MS);
    remaining -= count;
  }
  assert.equal(g.s.inkPoints, CR.INK_PTS);
  assert.equal(g.act({ a: 'crInk', slot: 1, ops: [['s', 1, 0, 0, 1, 1]] }, g.now + 50).ink, undefined);
  g.act({ a: 'crInk', slot: 1, ops: [['x']] }, g.now + 50);
  assert.equal(g.act({ a: 'crInk', slot: 1, ops: [['s', 2, 0, 0, 1, 1]] }, g.now + 50).ink, undefined);
  assert.equal(g.s.strokes.length, 0);
});
