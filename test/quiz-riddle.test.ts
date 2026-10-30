import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newRiddle, reduceRiddle, riddleView, nearLines, validateWord, type RiddleAction } from '../shared/quiz/riddle.ts';
import { QZ } from '../shared/quiz/types.ts';

const host = { slot: 1, pid: 101, nick: 'Барон' };
const a = { slot: 2, pid: 102, nick: 'Оля' };
const b = { slot: 3, pid: 103, nick: 'Петя' };
function setup() {
  let s = newRiddle(host, 'пароход', 'Предмет', '', 0);
  return {
    get s() { return s; },
    act(action: RiddleAction, now = 0) { const r = reduceRiddle(s, action, now); s = r.state; return r; },
    say(text: string, now = 0, who = a, guessers = 2) { return this.act({ a: 'say', who, text, guessers }, now); },
    mark(id: number, m: 'warm' | 'miss' | 'win', now = 0) { return this.act({ a: 'mark', slot: 1, id, m }, now); },
  };
}

test('догадки: одна живая, порядок, частота и срок после снятия отметки', () => {
  const g = setup();
  g.say('лодка'); g.say('самолёт', 0, b);
  assert.equal(g.say('яхта', 1000).error?.code, 'rate');
  g.say('яхта', 2000);
  assert.deepEqual(g.s.lines.map(l => l.text), ['самолёт', 'яхта']);
  const id = g.s.lines[0].id;
  g.mark(id, 'warm', 3000);
  assert.equal(riddleView(g.s).warm, 1);
  g.act({ a: 'unmark', slot: 1, id }, 89_000);
  assert.equal(riddleView(g.s).warm, 0);
  assert.equal(g.s.lines[0].id, id);
  g.act({ a: 'tick' }, 90_000);
  assert.ok(g.s.lines.some(l => l.id === id));
  g.act({ a: 'tick' }, 179_000);
  assert.ok(!g.s.lines.some(l => l.id === id));
  const crowd = setup(); crowd.say('лодка', 0, a, 6);
  assert.equal(crowd.say('яхта', 2000, a, 6).error?.wait, 3000);
  assert.equal(crowd.say('яхта', 5000, a, 6).error, undefined);
});

test('warm/miss: unmark и стек undo пропускают снятые отметки', () => {
  const g = setup();
  for (let i = 0; i < 3; i++) { g.say(`вариант ${i}`, i * 2000); g.mark(g.s.lines.at(-1)!.id, i === 1 ? 'miss' : 'warm', i * 2000); }
  assert.deepEqual(riddleView(g.s).misses, ['вариант 1']);
  for (let i = 0; i < 3; i++) g.act({ a: 'undo', slot: 1 }, 6000 + i);
  assert.equal(riddleView(g.s).warm, 0);
  assert.deepEqual(riddleView(g.s).misses, []);
  assert.ok(g.s.lines.every(l => l.mark === ''));
  assert.equal(g.s.lines.length, 3, 'undo возвращает каждую строку; заменяет их только новая догадка');
  g.say('новый вариант', 8000);
  assert.deepEqual(g.s.lines.map(l => l.text), ['новый вариант']);
});

test('win: 3 с проверки, запрет чужих правок, отмена без остановки времени', () => {
  const g = setup(); g.say('лодка');
  const id = g.s.lines[0].id;
  g.act({ a: 'mark', slot: 2, id, m: 'win' });
  assert.equal(g.s.step, 'round');
  g.mark(id, 'win', 1000);
  assert.equal(g.s.step, 'check');
  g.act({ a: 'giveup', slot: 1 }, 1500);
  assert.equal(g.s.step, 'check');
  g.act({ a: 'undo', slot: 1 }, 2000);
  assert.equal(g.s.step, 'round');
  assert.equal(g.s.endsAt, QZ.ROUND_MS);
  assert.equal(g.s.lines[0].mark, '');
  g.mark(id, 'win', 2500);
  g.act({ a: 'tick' }, 5499); assert.equal(g.s.result, null);
  const result = g.act({ a: 'tick' }, 5500).state.result;
  assert.equal(result?.end, 'solved');
  assert.deepEqual(result?.points, { 101: 3, 102: 5 });
});

test('точное совпадение отменяется; второе совпадение проверяется следующим', () => {
  const g = setup(); g.say('пароход');
  g.say('это пароход', 1, b);
  assert.equal(g.s.checking?.slot, 2);
  assert.ok(nearLines(g.s).includes(g.s.lines[1].id));
  g.act({ a: 'undo', slot: 1 }, 1000);
  assert.equal(g.s.checking?.slot, 3);
  g.act({ a: 'undo', slot: 1 }, 2000);
  assert.equal(g.s.step, 'round');
  g.act({ a: 'tick' }, 4000);
  assert.equal(g.s.step, 'round', 'отменённое совпадение не проверяется снова само');
});

test('конец времени ждёт проверку; отмена после срока сразу timeout', () => {
  const g = setup(); g.say('пароход', QZ.ROUND_MS - 1000);
  g.act({ a: 'tick' }, QZ.ROUND_MS);
  assert.equal(g.s.step, 'check');
  g.act({ a: 'undo', slot: 1 }, QZ.ROUND_MS + 1);
  assert.equal(g.s.result?.end, 'timeout');
});

test('второе совпадение того же автора сохраняется при отмене первого', () => {
  const g = setup(); g.say('пароход'); g.say('это пароход', 2000);
  const second = g.s.lines[1].id;
  g.act({ a: 'undo', slot: 1 }, 2500);
  assert.equal(g.s.checking?.line, second);
  assert.equal(g.s.lines[0].mark, '');
});

test('слово, реплика и подсказки: защита ответа и лимит 3', () => {
  assert.equal(validateWord('1', 'Предмет', '').error?.code, 'word');
  assert.equal(validateWord('пароход', 'Предмет', 'парохот').error?.code, 'answer');
  const g = setup();
  assert.equal(g.say('это парохот', 0, host).error?.code, 'answer');
  assert.equal(g.act({ a: 'hint', slot: 1, text: 'пароход' }).error?.code, 'answer');
  for (const text of ['плывёт', 'дымит', 'в море']) assert.equal(g.act({ a: 'hint', slot: 1, text }).error, undefined);
  assert.equal(g.act({ a: 'hint', slot: 1, text: 'большой' }).error?.code, 'hints');
});

test('очки: окончательные warm, потолок 3, giveup = timeout, left без очков', () => {
  const g = setup();
  for (let i = 0; i < 4; i++) { g.say(`вариант ${i}`, i * 2000); g.mark(g.s.lines.at(-1)!.id, 'warm', i * 2000); }
  g.act({ a: 'giveup', slot: 1 }, 9000);
  assert.equal(g.s.result?.end, 'timeout');
  assert.deepEqual(g.s.result?.points, { 102: 3 });
  assert.equal(g.s.result?.counted, true);
  const before = g.s; g.act({ a: 'tick' }, 10_000); assert.equal(g.s, before, 'итог один раз');
  const left = setup(); left.say('лодка'); left.mark(1, 'warm');
  left.act({ a: 'end', end: 'left' }, 1000);
  assert.deepEqual(left.s.result?.points, {});
  assert.equal(left.s.result?.counted, false);
});
