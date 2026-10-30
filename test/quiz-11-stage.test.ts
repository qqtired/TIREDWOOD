import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QuizStage, type QuizHost, type QuizPerson } from '../server/lobby/quiz/stage.ts';
import { WhoOfUsGame } from '../server/lobby/quiz/whoofus.ts';
import { WarmGame } from '../server/lobby/quiz/warm.ts';
import { QuizTokens } from '../server/lobby/quiz/tokens.ts';
import { loadBuiltinPacks } from '../server/lobby/quiz/builtin.ts';
import type { ModeHost } from '../server/lobby/quiz/controller.ts';
import { ACT_NONE, ACT_QUIZ } from '../shared/lobby.ts';
import { QUIZ_VENUE as V, placeAt, chairPlace } from '../shared/quiz/venue.ts';
import { QZ, QZ_WARM, QZ_WHO as WHO, type QzPack, type QzQuestion } from '../shared/quiz/types.ts';
import { newRiddle, reduceRiddle, riddleView, type RiddleAction } from '../shared/quiz/riddle.ts';
import type { QuizServerMsg } from '../shared/quiz/net.ts';

function setup(n = 3) {
  let now = 100_000;
  const people: QuizPerson[] = Array.from({ length: n }, (_, i) => ({ slot: i + 1, pid: i + 101, nick: `Игрок${i + 1}`,
    ...V.chairs[i], action: ACT_NONE, arg: 0, ephemeral: false, riding: false }));
  const sent: Array<{ slot: number; msg: QuizServerMsg }> = [], paid: Array<{ pid: number; n: number }> = [];
  const toasts: string[] = [];
  const host: QuizHost = {
    now: () => now, rand: () => 0, people: () => people,
    hold: (slot, place) => { const p = people.find(p => p.slot === slot); if (p) Object.assign(p, placeAt(place), { action: ACT_QUIZ, arg: place }); },
    release: (slot, to) => { const p = people.find(p => p.slot === slot); if (p) Object.assign(p, to ?? {}, { action: ACT_NONE, arg: 0 }); },
    send: (slot, msg) => sent.push({ slot, msg: structuredClone(msg) }),
    sendLobby: (msg, except = []) => { for (const p of people) if (!except.includes(p.slot)) host.send(p.slot, msg); },
    credit: (slot, n, pid) => paid.push({ pid: pid ?? people.find(p => p.slot === slot)!.pid, n }),
    announce: () => {}, toast: (_slot, text) => toasts.push(text), log: () => {},
  };
  const q = new QuizStage(host);
  const g = {
    q, people, sent, paid, toasts, get now() { return now; },
    advance(ms: number) { now += ms; q.step(); },
    msg(slot: number, msg: Record<string, unknown>) { q.message(slot, { t: 'qz', ...msg }); },
    sit(slot: number) { Object.assign(people.find(p => p.slot === slot)!, V.chairs[slot - 1]); q.use(slot, chairPlace(slot - 1)); },
    ballot() { for (const p of people) this.sit(p.slot); this.msg(1, { a: 'play' }); },
    voted() { this.advance(QZ.VOTE_ALL_MS); this.advance(QZ.WIN_MS); },
    select(mode: number, order = people.map(p => p.slot)) {
      this.ballot(); for (const slot of order) { this.msg(slot, { a: 'vote', m: mode }); this.advance(10); } this.voted();
    },
    ask(slot: number, word = 'пароход') { this.msg(slot, { a: 'ask', word, cat: 'Предмет' }); },
    results() {
      for (let i = 0; i < QZ.RIDDLES; i++) {
        if (q.view().call) this.msg(people.find(p => q.me(p.slot)?.canTake)!.slot, { a: 'role', take: true });
        const slot = q.board().riddle!.riddler!.slot;
        this.ask(slot); this.msg(slot, { a: 'giveup' }); this.advance(QZ.REVEAL_MS);
      }
      assert.equal(q.board().phase, 'results');
    },
  };
  q.step(); return g;
}

test('A2/A3: голос по времени сразу открывает ask, очередь и личная заготовка запускают следующий раунд', () => {
  const g = setup(); g.select(0, [2, 3, 1]);
  assert.equal(g.q.board().phase, 'game'); assert.equal(g.q.view().call, null);
  assert.equal(g.q.board().riddle?.step, 'ask'); assert.equal(g.q.board().riddle?.riddler?.slot, 2);
  assert.deepEqual(g.q.board().riddle?.queue?.map(p => p.slot), [3, 1]);
  assert.equal(g.q.me(3)?.queuePos, 1);
  g.msg(3, { a: 'prep', word: 'фонарь', cat: 'Предмет', hint: 'светит' });
  assert.deepEqual(g.q.me(3)?.prep, { word: 'фонарь', cat: 'Предмет', hint: 'светит' });
  assert.ok(!JSON.stringify(g.q.view(1)).includes('фонарь')); assert.equal(g.q.me(1)?.prep, null);
  g.ask(2); g.msg(2, { a: 'giveup' }); g.advance(QZ.REVEAL_MS);
  assert.equal(g.q.board().riddle?.riddler?.slot, 3); assert.equal(g.q.board().riddle?.step, 'round');
  assert.equal(g.people[2].arg, V.first.riddler); assert.equal(g.q.me(3)?.word, 'фонарь');
  assert.equal(g.q.me(3)?.queuePos, 0); assert.equal(g.q.me(3)?.prep, null);
  assert.equal(g.q.board().zat?.text, 'Игрок3 загадал! Тема — Предмет');
});

test('A2: повтор того же голоса не меняет очередь, смена голоса меняет время записи', () => {
  const g = setup(); g.ballot();
  g.msg(3, { a: 'vote', m: 0 }); g.advance(10); g.msg(2, { a: 'vote', m: 0 });
  g.advance(10); g.msg(3, { a: 'vote', m: 0 });
  g.msg(1, { a: 'vote', m: 1 }); g.advance(10); g.msg(2, { a: 'vote', m: 1 });
  g.advance(10); g.msg(2, { a: 'vote', m: 0 }); g.msg(1, { a: 'vote', m: 0 }); g.voted();
  assert.equal(g.q.board().riddle?.riddler?.slot, 3);
  assert.deepEqual(g.q.board().riddle?.queue?.map(p => p.slot), [2, 1]);
});

test('A3: первый уже загадывает, в очереди остаётся до восьми следующих голосовавших', () => {
  const g = setup(10); g.select(0);
  assert.equal(g.q.board().riddle?.riddler?.slot, 1);
  assert.deepEqual(g.q.board().riddle?.queue?.map(p => p.slot), [2, 3, 4, 5, 6, 7, 8, 9]);
  g.msg(10, { a: 'role', r: 'riddler', take: true }); assert.equal(g.q.me(10)?.queuePos, 0);
});

test('A2: голосовавший ушёл — прежний открытый вызов роли; не ответили — назначает Затейник', () => {
  const g = setup(); g.ballot(); g.msg(1, { a: 'vote', m: 0 }); g.advance(QZ.VOTE_MS);
  g.people[0].x = V.center[0] + 100; g.advance(QZ.WIN_MS);
  assert.equal(g.q.board().phase, 'roles'); assert.equal(g.q.view().call?.by, 'open');
  g.advance(QZ.CALL_MS); assert.equal(g.q.view().call?.to?.slot, 2);
  g.msg(2, { a: 'role', take: true }); assert.equal(g.q.board().riddle?.step, 'ask');
});

test('A3: угадавший идёт первым; отказ, уход и тайм-аут окна удаляют заготовку и передают роль', () => {
  const g = setup(4); g.select(0); g.ask(1);
  g.msg(3, { a: 'prep', word: 'пароход', cat: 'Предмет', hint: 'пароход' });
  assert.ok(g.sent.some(x => x.slot === 3 && x.msg.t === 'qzErr' && x.msg.code === 'answer'));
  g.msg(3, { a: 'prep', word: 'фонарь', cat: 'Предмет' });
  g.msg(4, { a: 'say', text: 'пароход' }); g.advance(QZ.CHECK_MS);
  assert.deepEqual(g.q.board().riddle?.queue?.map(p => p.slot), [4, 2, 3]);
  g.msg(2, { a: 'role', r: 'riddler', take: false });
  g.people[2].x = V.center[0] + 100; g.q.step();
  assert.deepEqual(g.q.board().riddle?.queue?.map(p => p.slot), [4]);
  Object.assign(g.people[2], V.chairs[2]); g.q.step();
  g.msg(3, { a: 'role', r: 'riddler', take: true }); assert.equal(g.q.me(3)?.prep, null);
  g.advance(QZ.REVEAL_MS); assert.equal(g.q.board().riddle?.riddler?.slot, 4);
  g.advance(QZ.ASK_MS); assert.equal(g.q.board().riddle?.riddler?.slot, 3);
  assert.equal(g.q.board().riddle?.step, 'ask');
  g.msg(3, { a: 'role', r: 'riddler', take: true }); assert.equal(g.q.me(3)?.queuePos, 0);
});

test('C1: warm → hot, два undo, unmark, горячий текст и предел трёх очков', () => {
  const riddler = { slot: 1, pid: 101, nick: 'Ведущий' }, guesser = { slot: 2, pid: 102, nick: 'Оля' };
  let s = newRiddle(riddler, 'пароход', 'Предмет', '', 0), now = 0;
  const act = (a: RiddleAction) => { s = reduceRiddle(s, a, ++now).state; };
  act({ a: 'say', who: guesser, text: 'лодка', guessers: 2 });
  act({ a: 'mark', slot: 1, id: 1, m: 'warm' }); act({ a: 'mark', slot: 1, id: 1, m: 'hot' });
  assert.equal(riddleView(s).hot, 1); assert.equal(riddleView(s).hotText, 'лодка'); assert.equal(riddleView(s).warm, 0);
  const finished = reduceRiddle(s, { a: 'giveup', slot: 1 }, now + 1).state;
  assert.equal(finished.result?.points[102], 2);
  act({ a: 'undo', slot: 1 }); assert.equal(s.lines[0].mark, 'warm');
  act({ a: 'undo', slot: 1 }); assert.equal(s.lines[0].mark, '');
  act({ a: 'mark', slot: 1, id: 1, m: 'hot' }); act({ a: 'unmark', slot: 1, id: 1 });
  assert.equal(s.lines[0].mark, ''); assert.equal(riddleView(s).hotText, '');
  act({ a: 'mark', slot: 1, id: 1, m: 'hot' }); now += QZ.GUESS_GAP_MS;
  act({ a: 'say', who: guesser, text: 'корабль', guessers: 2 });
  act({ a: 'mark', slot: 1, id: 2, m: 'miss' }); act({ a: 'mark', slot: 1, id: 2, m: 'hot' });
  assert.equal(riddleView(s).hotText, 'корабль');
  act({ a: 'giveup', slot: 1 }); assert.equal(s.result?.points[102], 3);
});

test('A1: большинство «Ещё раз!» сразу выбирает тот же режим и сохраняет порядок нажатия', () => {
  const g = setup(); g.select(0); g.results();
  assert.deepEqual(g.q.view().again, { n: 0, need: 2 }); assert.equal(g.q.me(1)?.canAgain, true);
  g.msg(3, { a: 'again', on: true }); assert.equal(g.q.me(3)?.again, true);
  g.msg(3, { a: 'again', on: false }); assert.deepEqual(g.q.view().again, { n: 0, need: 2 });
  g.msg(2, { a: 'again', on: true }); g.msg(1, { a: 'again', on: true });
  assert.equal(g.q.board().phase, 'vote'); assert.equal(g.q.board().vote?.win, 0);
  assert.equal(g.q.board().vote?.again, true); assert.equal(g.q.board().vote?.why, 'Ещё раз!');
  assert.equal(g.q.board().endsAt, g.now + QZ.WIN_MS); assert.equal(g.q.board().zat?.text, 'Ещё разок!');
  assert.equal(g.q.me(2)?.again, false); assert.equal(g.q.view().again, null);
  g.advance(QZ.WIN_MS); assert.equal(g.q.board().riddle?.step, 'ask');
  assert.equal(g.q.board().riddle?.riddler?.slot, 2); assert.deepEqual(g.q.board().riddle?.queue?.map(p => p.slot), [1]);
});

test('A1: без большинства открывается обычное голосование; одному повтор недоступен', () => {
  const g = setup(); g.select(0); g.results();
  g.msg(1, { a: 'again', on: true }); g.advance(QZ.RESULTS_MS);
  assert.equal(g.q.board().vote?.win, -1); assert.equal(g.q.me(1)?.again, false);
  const solo = setup(); solo.select(0); solo.results();
  solo.people[1].x = solo.people[2].x = V.center[0] + 100; solo.q.step();
  assert.equal(solo.q.me(1)?.canAgain, false); assert.equal(solo.q.view().again, null);
});

test('F4: двоим активным по 4 в минуту без бонусов; одному и без активности — ничего', () => {
  const q = new QuizTokens(); q.startGame(0); q.action(1, 0); q.action(2, 0);
  assert.deepEqual(q.minute([1, 2, 2], 60_000).map(a => [a.pid, a.n]), [[1, 4], [2, 4]]);
  assert.deepEqual(q.event({ kind: 'riddle', id: 'a', riddler: 1, solver: 2, duration: 60_000, guessers: [2, 3], solved: true }, [1, 2], 60_000), []);
  assert.deepEqual(q.minute([1], 120_000), []); assert.deepEqual(q.minute([1, 2], 180_000), []);
  const g = setup(2); assert.equal(g.q.board().noTokens, false); assert.equal(g.q.board().halfTokens, true);
  g.people[1].x = V.center[0] + 100; g.q.step();
  assert.equal(g.q.board().noTokens, true); assert.equal(g.q.board().halfTokens, false);
});

test('F3: соло-разминка показывает вопрос, принимает ответ без наград, второй сидящий завершает её', () => {
  const g = setup(1); g.sit(1); assert.equal(g.q.me(1)?.canWarm, true);
  g.msg(1, { a: 'warm', on: true });
  const b = g.q.board().warm; assert.ok(b); assert.equal(b.step, 'q'); assert.equal(b.num, 1);
  assert.equal(g.q.me(1)?.canWarm, false); assert.equal(b.endsAt, g.now + QZ_WARM.Q_MS);
  const question = loadBuiltinPacks().flatMap(p => p.pack.rounds.flatMap(r => r.themes.flatMap(t => t.questions)))
    .find(q => q.content.map(c => c.kind === 'text' ? c.value : '').join(' ').trim() === b.q)!;
  assert.ok(question); g.msg(1, { a: 'say', text: question.answers[0] });
  assert.equal(g.q.board().warm?.step, 'reveal'); assert.equal(g.q.board().warm?.ok, 1);
  assert.deepEqual(g.q.board().warm?.last, { answer: question.answers[0], ok: true });
  g.advance(QZ_WARM.REVEAL_MS); assert.equal(g.q.board().warm?.num, 2); assert.notEqual(g.q.board().warm?.q, b.q);
  g.advance(QZ_WARM.Q_MS); assert.equal(g.q.board().warm?.last?.ok, false);
  assert.deepEqual(g.paid, []); assert.deepEqual(g.q.board().evening, []); assert.equal(g.q.me(1)?.dayCoins, 0);
  g.people.push({ ...g.people[0], slot: 2, pid: 102, nick: 'Второй', ...V.chairs[1], action: ACT_NONE }); g.q.step();
  assert.ok(g.q.board().warm, 'стоящий гость не прерывает вопрос');
  g.sit(2); assert.equal(g.q.board().warm, null); assert.equal(g.q.board().zat?.text, 'О, нас двое — давайте играть!');
  g.advance(QZ.AUTO_VOTE_DELAY_MS); assert.equal(g.q.board().phase, 'vote');
});

test('F3: только короткие текстовые встроенные вопросы, все варианты ответа, «Почти!» и частота say', () => {
  const question = (q: string): QzQuestion => ({ price: 100, type: 'simple', content: [{ kind: 'text', value: q }],
    reveal: [], answers: ['корабль', 'пароход'], wrong: [], comment: '' });
  const first = question('Что плывёт?'), second = question('Что светит?'); second.answers = ['фонарь'];
  const image = question('Картинка'); image.content.push({ kind: 'image', file: 'test.webp' });
  const audio = question('Со звуком'); audio.reveal.push({ kind: 'audio', file: 'test.mp3', sec: 1 });
  const empty = question('Нет ответа'); empty.answers = [];
  const pack: QzPack = { v: 1, title: 'Разминка', author: 'Тест', kind: 'jeopardy', adult: false, tags: [], source: { format: 'text' },
    rounds: [{ name: 'Раунд', final: false, themes: [{ name: 'Тема', questions: [first, second, image, audio, empty, question('я'.repeat(161))] }] },
      { name: 'Финал', final: true, themes: [{ name: 'Финал', questions: [question('Финальный')] }] }] };
  const who = { slot: 1, pid: 101, nick: 'Оля' }, toasts: string[] = [];
  const warm = new WarmGame({ packs: () => [{ id: 'custom', pack: { ...pack, rounds: [{ ...pack.rounds[0], themes: [{ name: 'Чужой', questions: [question('Свой пак')] }] }] } },
    { id: 'b-test', pack }], rand: () => 0, say: () => {}, toast: (_slot, text) => toasts.push(text) }, who, 0);
  assert.equal(warm.board()?.q, 'Что плывёт?');
  warm.say({ ...who, pid: 102 }, 'пароход', 0); assert.equal(warm.board()?.step, 'q');
  warm.say(who, 'параход', 0); assert.deepEqual(toasts, ['Почти!']); assert.equal(warm.board()?.step, 'q');
  assert.equal(warm.say(who, 'пароход', 1000)?.code, 'rate');
  warm.say(who, 'пароход', 2000); assert.equal(warm.board()?.last?.ok, true); assert.equal(warm.board()?.last?.answer, 'корабль');
  warm.tick(5000); assert.equal(warm.board()?.q, 'Что светит?');
  warm.tick(25000); assert.equal(warm.board()?.last?.ok, false);
  warm.tick(28000); assert.equal(warm.board()?.q, 'Что плывёт?'); assert.equal(warm.board()?.num, 3);
  const g = setup(1); g.sit(1); g.msg(1, { a: 'warm', on: true }); g.msg(1, { a: 'warm', on: false });
  assert.equal(g.q.board().warm, null); g.msg(1, { a: 'warm', on: true });
  g.people[0].action = ACT_NONE; g.q.step(); assert.equal(g.q.board().warm, null);
});

test('E1: «Браво!» только сидящему, не чаще двух секунд; нажатие исчезает через три секунды', () => {
  const g = setup(1); g.msg(1, { a: 'bravo' }); assert.deepEqual(g.q.view().bravo, []);
  g.sit(1); g.msg(1, { a: 'bravo' }); const at = g.now;
  g.advance(1000); g.msg(1, { a: 'bravo' }); assert.deepEqual(g.q.view().bravo, [{ slot: 1, at }]);
  g.advance(2000); assert.deepEqual(g.q.view().bravo, []);
});

test('C9/A2/B1: «Кто из нас?» сразу ask, титул остаётся в следующей игре и очищается с вечером', () => {
  const g = setup(4); g.select(3); assert.equal(g.q.board().phase, 'game'); assert.equal(g.q.board().who?.step, 'ask');
  g.advance(WHO.ASK_MS);
  for (const slot of [2, 3, 4]) g.msg(slot, { a: 'whoVote', slot: 1 });
  g.advance(WHO.VOTE_MS); assert.equal(g.q.board().zat?.text, 'Единогласно!');
  const title = g.q.board().who!.title;
  assert.deepEqual(g.q.board().titles, [{ slot: 1, nick: 'Игрок1', title }]);
  assert.deepEqual(g.q.view().titles, g.q.board().titles);
  for (const slot of [1, 2, 3]) g.msg(slot, { a: 'swap', on: true });
  for (const p of g.people) g.msg(p.slot, { a: 'vote', m: 0 }); g.voted();
  assert.equal(g.q.board().mode, 'riddle'); assert.equal(g.q.board().titles?.[0].title, title);
  g.people[0].nick = 'Новое имя'; g.q.step(); assert.equal(g.q.board().titles?.[0].nick, 'Новое имя');
  g.people.splice(0, 1); g.q.step(); assert.equal(g.q.board().titles?.[0].slot, 0);
  for (const p of g.people) p.x = V.center[0] + 100;
  g.q.step(); g.advance(QZ.ALONE_MS); g.advance(QZ.RESULTS_MS); assert.equal(g.q.active, true);
  g.advance(QZ.EVENING_IDLE_MS - QZ.ALONE_MS - QZ.RESULTS_MS - 1); assert.equal(g.q.board().titles?.length, 1);
  g.advance(1); assert.deepEqual(g.q.board().titles, []);
});

test('B1: быстрый ответ — эмоция Затейника, горячая отметка проходит через сцену', () => {
  const g = setup(); g.select(0); g.msg(1, { a: 'role', take: true }); g.ask(1);
  g.msg(2, { a: 'say', text: 'лодка' }); const line = g.q.view().riddle!.lines.find(l => l.kind === 'guess')!;
  g.msg(1, { a: 'mark', id: line.id, m: 'hot' }); assert.equal(g.q.board().riddle?.hotText, 'лодка');
  g.msg(3, { a: 'say', text: 'пароход' }); g.advance(QZ.CHECK_MS);
  assert.equal(g.q.board().zat?.text, 'Вот это скорость!'); assert.equal(g.q.board().evening.find(p => p.slot === 2)?.pts, 2);
});

test('заказ «Кто из нас?»: свободные места — вопросы заказанного пака, а не общего; заказ снимается при начале игры', () => {
  const pack = (...qs: string[]): QzPack => ({ v: 1, title: qs[0], author: 'Тест', kind: 'whoofus', adult: false,
    tags: [], source: { format: 'text' }, rounds: [], who: qs.map(q => ({ q, title: 'Титул' })) });
  const used: string[] = [];
  const h: ModeHost = {
    people: () => Array.from({ length: 4 }, (_, i) => ({ slot: i + 1, pid: i + 101, nick: `И${i}`, chair: i, seatedAt: i })),
    rand: () => 0, hold: () => {}, release: () => {}, say: () => {}, ping: () => 0, ink: () => {},
    packs: () => [{ id: 'b-normal', pack: pack('Кто из нас первым уснёт?') },
      { id: 'mine', pack: pack(...Array.from({ length: WHO.ROUNDS }, (_, i) => `Кто из нас найдёт клад №${i + 1}?`)) }],
    order: () => ({ id: 'mine', title: 'Мой', kind: 'whoofus', by: { slot: 1, nick: 'И0' }, at: 0 }),
    orderUsed: (_kind, id) => used.push(id),
  };
  const game = new WhoOfUsGame(h, 0, 1);
  assert.equal(game.phase, 'game'); assert.deepEqual(used, ['mine']);
  game.tick(WHO.ASK_MS); assert.match(game.boardFields().who?.q ?? '', /^Кто из нас найдёт клад №\d+\?$/);
});
