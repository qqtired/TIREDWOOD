import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChatQuiz, chatQuestionsFromPacks, CQ_EVERY_MS, CQ_RETRY_MS, CQ_ANSWER_MS, CQ_REWARD, CQ_DAY_MAX,
  type ChatQuestion, type ChatQuizHost } from '../server/chatquiz.ts';
import type { QzPack, QzQuestion } from '../shared/quiz/types.ts';

function question(overrides: Partial<QzQuestion> = {}): QzQuestion {
  return { price: 100, type: 'simple', content: [{ kind: 'text', value: 'Столица Франции?' }], reveal: [],
    answers: ['Париж', 'Париже'], wrong: ['Париже, Техас'], comment: 'На Сене.', ...overrides };
}

function pack(questions: QzQuestion[], overrides: Partial<QzPack> = {}): QzPack {
  return { v: 1, title: 'Тест', author: '', kind: 'jeopardy', adult: false, tags: [], source: { format: 'builtin' },
    rounds: [{ name: 'Раунд', final: false, themes: [{ name: 'Города', questions }] }], ...overrides };
}

class FakeHost implements ChatQuizHost {
  time = Date.parse('2026-10-31T12:00:00Z');
  random = 0;
  randomCalls = 0;
  pids = [1, 2, 3];
  busy = false;
  pool: ChatQuestion[] = chatQuestionsFromPacks([{ id: 'test', pack: pack([question()]) }]);
  lines: Array<{ text: string; pids: number[] }> = [];
  payments: Array<{ pid: number; tokens: number }> = [];
  refusePay = false;
  throwOn: keyof ChatQuizHost | null = null;

  private fail(method: keyof ChatQuizHost): void {
    if (this.throwOn === method) throw new Error(`host.${method}`);
  }

  now(): number { this.fail('now'); return this.time; }
  rand(): number { this.fail('rand'); this.randomCalls++; return this.random; }
  online(): number[] { this.fail('online'); return [...this.pids]; }
  stageBusy(): boolean { this.fail('stageBusy'); return this.busy; }
  say(text: string, pids: number[]): void { this.fail('say'); this.lines.push({ text, pids: [...pids] }); }
  pay(pid: number, tokens: number): boolean {
    this.fail('pay');
    if (this.refusePay || !this.pids.includes(pid)) return false;
    this.payments.push({ pid, tokens });
    return true;
  }
  nick(pid: number): string { this.fail('nick'); return `Игрок${pid}`; }
  questions(): ChatQuestion[] { this.fail('questions'); return this.pool.map(q => ({ ...q })); }
}

function game(host = new FakeHost()) {
  const quiz = new ChatQuiz(host);
  return { host, quiz, advance(ms: number) { host.time += ms; quiz.step(); } };
}

test('паки: только не-18+ jeopardy, цена 100–300 и полностью текстовый вопрос с видимым фрагментом', () => {
  const mixedText = question({ content: [
    { kind: 'text', value: 'В какой', say: true }, { kind: 'text', value: 'стране Париж?' },
  ] });
  const middle = question({ price: 200 });
  const upper = question({ price: 300, reveal: [{ kind: 'image', file: 'answer.png' }] });
  const skipped = [
    question({ content: [{ kind: 'text', value: 'Город?' }, { kind: 'image', file: 'city.png' }] }),
    question({ content: [{ kind: 'text', value: 'Город?' }, { kind: 'audio', file: 'city.mp3', sec: 1 }] }),
    question({ content: [{ kind: 'text', value: 'Только ведущему', say: true }] }),
    question({ content: [] }), question({ price: 99 }), question({ price: 500 }), question({ price: 0 }),
    question({ answers: [] }),
  ];
  const regular = pack([mixedText, middle, upper, ...skipped]);
  const result = chatQuestionsFromPacks([
    { id: 'regular', pack: regular }, { id: 'adult', pack: pack([question()], { adult: true }) },
    ...(['words', 'whoofus', 'riddles'] as const).map(kind => ({ id: kind, pack: pack([question()], { kind }) })),
  ]);
  assert.deepEqual(result, [
    { q: 'В какой стране Париж?', answers: ['Париж', 'Париже'], wrong: ['Париже, Техас'], comment: 'На Сене.' },
    ...[middle, upper].map(q => ({ q: 'Столица Франции?', answers: q.answers, wrong: q.wrong, comment: q.comment })),
  ]);
  assert.notStrictEqual(result[0].answers, mixedText.answers);
  assert.notStrictEqual(result[0].wrong, mixedText.wrong);
});

test('первый вопрос ждёт случайный срок 20–30 минут от создания', () => {
  const host = new FakeHost(); host.random = 0.5;
  const g = game(host);
  g.quiz.step();
  g.advance(CQ_EVERY_MS[0] - 1);
  assert.equal(g.quiz.asking, false);
  g.advance(5 * 60_000);
  assert.equal(g.quiz.asking, false);
  g.advance(1);
  assert.equal(g.quiz.asking, true);
  assert.deepEqual(host.lines, [{
    text: '🎤 Затейник: Столица Франции? — ответь в чат за 60 с, первому +10 🪙', pids: [1, 2, 3],
  }]);
});

test('двое онлайн, занятая сцена, пустой пак и все выключившие: повтор ровно через минуту', () => {
  for (const condition of ['online', 'stage', 'questions', 'off']) {
    const g = game();
    const pool = g.host.pool;
    if (condition === 'online') g.host.pids = [1, 2];
    if (condition === 'stage') g.host.busy = true;
    if (condition === 'questions') g.host.pool = [];
    if (condition === 'off') for (const pid of g.host.pids) g.quiz.setOn(pid, false);
    g.advance(CQ_EVERY_MS[0]);
    assert.equal(g.quiz.asking, false, condition);
    assert.equal(g.host.randomCalls, 1, 'условия не назначают новый случайный срок');
    g.host.pids = [1, 2, 3]; g.host.busy = false; g.host.pool = pool;
    for (const pid of g.host.pids) g.quiz.setOn(pid, true);
    g.advance(CQ_RETRY_MS - 1);
    assert.equal(g.quiz.asking, false, condition);
    g.advance(1);
    assert.equal(g.quiz.asking, true, condition);
  }
});

test('wrong перекрывает верный ответ, near не считается; первый точный ответ платит и закрывает вопрос', () => {
  const g = game(); g.advance(CQ_EVERY_MS[0]);
  assert.equal(g.quiz.onChat(1, 'в Париже, Техас'), false);
  assert.equal(g.quiz.onChat(1, 'Парижж'), false);
  assert.equal(g.quiz.asking, true);
  assert.deepEqual(g.host.payments, []);
  g.host.time += 5_000;
  g.host.random = 0.5;
  assert.equal(g.quiz.onChat(1, 'в ПАРИЖЕ!'), true);
  assert.equal(g.quiz.asking, false);
  assert.equal(g.quiz.onChat(2, 'Париж'), false);
  assert.deepEqual(g.host.payments, [{ pid: 1, tokens: CQ_REWARD }]);
  assert.deepEqual(g.host.lines.at(-1), {
    text: '🎤 Затейник: верно, Игрок1! Париж — На Сене. — +10 🪙', pids: [1, 2, 3],
  });
  g.advance(25 * 60_000 - 1);
  assert.equal(g.quiz.asking, false);
  g.advance(1);
  assert.equal(g.quiz.asking, true);
});

test('50 за день сохраняются после выхода; шестой ответ оставляет вопрос другим, полночь МСК сбрасывает лимит', () => {
  const host = new FakeHost(); host.time = Date.parse('2026-10-31T18:40:00Z');
  const g = game(host);
  for (let i = 0; i < 5; i++) {
    g.advance(CQ_EVERY_MS[0]);
    assert.equal(g.quiz.onChat(1, 'Париж'), true);
  }
  assert.equal(host.payments.reduce((sum, p) => sum + p.tokens, 0), CQ_DAY_MAX);
  g.quiz.left(1);
  g.advance(CQ_EVERY_MS[0]);
  assert.equal(g.quiz.onChat(1, 'Париж'), false);
  assert.equal(g.quiz.asking, true);
  assert.equal(host.payments.length, 5);
  assert.deepEqual(host.lines.at(-1), {
    text: '🎤 Затейник: на сегодня награды за вопросы выданы (50 🪙) — отдохни, дай другим', pids: [1],
  });
  assert.equal(g.quiz.onChat(2, 'Париж'), true);
  g.advance(CQ_EVERY_MS[0]); // 21:00 UTC = 00:00 МСК; по UTC всё ещё 31 октября.
  assert.equal(g.quiz.onChat(1, 'Париж'), true);
  g.advance(24 * 60 * 60_000);
  assert.equal(g.quiz.onChat(1, 'Париж'), true);
  assert.equal(host.payments.filter(p => p.pid === 1).length, 7);
});

test('участвуют только получившие вопрос и включённые сейчас; выход забывает аудиторию, но не выключатель', () => {
  const g = game();
  assert.equal(g.quiz.isOn(2), true);
  g.quiz.setOn(2, false);
  g.advance(CQ_EVERY_MS[0]);
  assert.deepEqual(g.host.lines[0].pids, [1, 3]);
  assert.equal(g.quiz.onChat(2, 'Париж'), false);
  g.quiz.setOn(2, true);
  assert.equal(g.quiz.onChat(2, 'Париж'), false, 'включился после вопроса');
  g.host.pids.push(4);
  assert.equal(g.quiz.onChat(4, 'Париж'), false, 'вошёл после вопроса');
  g.quiz.setOn(1, false);
  assert.equal(g.quiz.onChat(1, 'Париж'), false);
  g.quiz.left(1);
  assert.equal(g.quiz.isOn(1), false);
  g.quiz.setOn(1, true);
  assert.equal(g.quiz.onChat(1, 'Париж'), false, 'вернулся после выхода');
  assert.equal(g.quiz.onChat(3, 'Париж'), true);
  assert.deepEqual(g.host.lines.at(-1)?.pids, [3]);
});

test('через 60 секунд ответ раскрывается, новый случайный срок считается от закрытия', () => {
  const g = game(); g.advance(CQ_EVERY_MS[0]);
  g.advance(CQ_ANSWER_MS - 1);
  assert.equal(g.quiz.asking, true);
  g.quiz.setOn(2, false);
  g.host.random = 0.75;
  g.advance(1);
  assert.equal(g.quiz.asking, false);
  assert.deepEqual(g.host.lines.at(-1), {
    text: '🎤 Затейник: время вышло — ответ: Париж', pids: [1, 3],
  });
  const delay = CQ_EVERY_MS[0] + 0.75 * (CQ_EVERY_MS[1] - CQ_EVERY_MS[0]);
  g.advance(delay - 1);
  assert.equal(g.quiz.asking, false);
  g.advance(1);
  assert.equal(g.quiz.asking, true);
});

test('ответ на границе 60 секунд уже не платит, даже если step ещё не вызван', () => {
  const g = game(); g.advance(CQ_EVERY_MS[0]);
  g.host.time += CQ_ANSWER_MS;
  assert.equal(g.quiz.onChat(1, 'Париж'), false);
  assert.equal(g.quiz.asking, false);
  assert.deepEqual(g.host.payments, []);
  assert.match(g.host.lines.at(-1)!.text, /время вышло/);
});

test('последний вопрос не повторяется при выборе из нескольких, включая новые объекты паков', () => {
  const g = game();
  g.host.pool.push({ q: 'Другой вопрос?', answers: ['другой'], wrong: [], comment: '' });
  g.advance(CQ_EVERY_MS[0]);
  assert.match(g.host.lines.at(-1)!.text, /Столица Франции/);
  assert.equal(g.quiz.onChat(1, 'Париж'), true);
  g.advance(CQ_EVERY_MS[0]);
  assert.match(g.host.lines.at(-1)!.text, /Другой вопрос/);
  assert.equal(g.quiz.onChat(1, 'другой'), true);
  assert.equal(g.host.lines.at(-1)!.text, '🎤 Затейник: верно, Игрок1! другой — +10 🪙');
});

test('pay=false оставляет вопрос открытым и не расходует дневной лимит', () => {
  const g = game(); g.advance(CQ_EVERY_MS[0]);
  g.host.refusePay = true;
  for (let i = 0; i < 5; i++) assert.equal(g.quiz.onChat(1, 'Париж'), false);
  assert.equal(g.quiz.asking, true);
  assert.deepEqual(g.host.payments, []);
  g.host.refusePay = false;
  assert.equal(g.quiz.onChat(1, 'Париж'), true);
  assert.deepEqual(g.host.payments, [{ pid: 1, tokens: CQ_REWARD }]);
});

test('проверяется только 200 знаков чата, объявление с комментарием не длиннее 160', () => {
  const g = game(); g.host.pool[0].comment = 'Комментарий '.repeat(30);
  g.advance(CQ_EVERY_MS[0]);
  assert.equal(g.quiz.onChat(1, ' '.repeat(200) + 'Париж'), false);
  assert.equal(g.quiz.onChat(1, 'Париж'), true);
  const line = g.host.lines.at(-1)!.text;
  assert.equal(line.length, 160);
  assert.ok(line.startsWith('🎤 Затейник: верно, Игрок1! Париж — Комментарий'));
  assert.ok(line.endsWith(' — +10 🪙'));
});

test('исключения host в step/onChat не выходят наружу, сбой после выплаты не дублирует жетоны', () => {
  for (const method of ['now', 'online', 'stageBusy', 'questions', 'rand', 'say'] as const) {
    const g = game(); g.host.time += CQ_EVERY_MS[0]; g.host.throwOn = method;
    assert.doesNotThrow(() => g.quiz.step(), method);
  }
  for (const method of ['now', 'pay', 'rand', 'nick', 'say'] as const) {
    const g = game(); g.advance(CQ_EVERY_MS[0]); g.host.throwOn = method;
    const paid = method !== 'now' && method !== 'pay';
    assert.equal(g.quiz.onChat(1, 'Париж'), paid, method);
    assert.equal(g.quiz.asking, !paid, method);
    g.host.throwOn = null;
    if (paid) {
      assert.equal(g.quiz.onChat(2, 'Париж'), false, method);
      assert.equal(g.host.payments.length, 1, method);
      g.advance(CQ_EVERY_MS[0] - 1);
      assert.equal(g.quiz.asking, false, method);
      g.advance(1);
      assert.equal(g.quiz.asking, true, method);
    } else {
      assert.equal(g.quiz.onChat(2, 'Париж'), true, method);
    }
  }
});
