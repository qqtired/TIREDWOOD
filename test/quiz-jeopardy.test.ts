import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { newJeopardy, reduceJeopardy, newJeopardyRoles, reduceJeopardyRoles, readingMs, jeopardyBoard, jeopardyView, jeopardyMe,
  type JeopardyAction, type JeopardyState } from '../shared/quiz/jeopardy.ts';
import { parseText } from '../shared/quiz/text.ts';
import { QZ_JP as JP } from '../shared/quiz/types.ts';

const ps = [1, 2, 3].map(slot => ({ slot, pid: slot + 100, nick: `Игрок${slot}` }));
const host = { slot: 9, pid: 109, nick: 'Ведущий' };
const pack = () => parseText(readFileSync(new URL('./fixtures/quiz/naberezhnaya.txt', import.meta.url), 'utf8')).pack;
function game(live = true, p = pack(), final = false) {
  let s = newJeopardy({ players: ps, host: live ? host : null, packs: [{ id: 'b-test', pack: p }] }, 0, () => 0), now = 0;
  const g = {
    get s() { return s; }, get now() { return now; },
    set s(value: JeopardyState) { s = value; },
    act(a: JeopardyAction, at = now) { now = at; const r = reduceJeopardy(s, a, at, () => 0); s = r.state; return r; },
    tick(at = s.endsAt) { return this.act({ a: 'tick' }, at); },
    pick(th = 0, cell = 0) { return this.act({ a: 'jpPick', slot: s.turn, th, cell }); },
    open() { return live && s.host ? this.act({ a: 'jpOpen', slot: host.slot }) : this.tick(); },
    buzz(slot = 1) { this.act({ a: 'jpBuzz', slot, ping: 0 }, now + 10); return this.tick(now + JP.BUZZ_WINDOW_MS); },
  };
  if (live) g.act({ a: 'jpStart', slot: host.slot, pack: 'b-test', round: 0, themes: [0, 1, 2], final });
  else g.tick(JP.PACKVOTE_MS);
  return g;
}

test('роли: первый ведущий, игроки сначала голосовавшие, один повтор и idle', () => {
  let s = newJeopardyRoles(0, [107, 108]);
  s = reduceJeopardyRoles(s, { a: 'role', who: host, r: 'host', take: true }, 0);
  s = reduceJeopardyRoles(s, { a: 'role', who: ps[0], r: 'host', take: true }, 1); assert.equal(s.host?.slot, 9);
  for (let slot = 1; slot <= 8; slot++) s = reduceJeopardyRoles(s, { a: 'role', who: { slot, pid: slot + 100, nick: `P${slot}` }, r: 'player', take: true }, 2);
  s = reduceJeopardyRoles(s, { a: 'tick' }, JP.CALL_MS);
  assert.equal(s.step, 'setup'); assert.deepEqual(s.players.map(p => p.slot), [7, 8, 1, 2, 3, 4]);
  let empty = newJeopardyRoles(0); empty = reduceJeopardyRoles(empty, { a: 'tick' }, JP.CALL_MS); assert.equal(empty.attempt, 2);
  empty = reduceJeopardyRoles(empty, { a: 'tick' }, 2 * JP.CALL_MS); assert.equal(empty.step, 'idle');
});

test('выбор пака Затейником, 18+ исключён, все голоса сокращают срок; setup 90 секунд', () => {
  const adult = pack(); adult.adult = true;
  let s = newJeopardy({ players: ps, host: null, packs: [{ id: 'adult', pack: adult }, { id: 'b-test', pack: pack(), plays: 10 }], people: [...ps, host] }, 0, () => 0);
  assert.equal(s.options.length, 1); assert.equal(s.options[0].id, 'b-test');
  for (const p of [...ps, host]) s = reduceJeopardy(s, { a: 'jpPv', slot: p.slot, i: 0 }, 100, () => 0).state;
  assert.equal(s.endsAt, 100 + JP.PACKVOTE_ALL_MS);
  s = reduceJeopardy(s, { a: 'tick' }, s.endsAt, () => 0).state; assert.equal(s.step, 'pick');
  let live = newJeopardy({ players: ps, host, packs: [{ id: 'b-test', pack: pack() }] }, 0, () => 0);
  live = reduceJeopardy(live, { a: 'tick' }, JP.SETUP_MS, () => 0).state; assert.equal(live.host, null); assert.equal(live.step, 'packvote');
});

test('ход, случайная клетка за 15 с, время чтения и отсутствие ответа/say/pid в публичном снимке', () => {
  const p = pack(), q = p.rounds[0].themes[0].questions[0]; q.content.push({ kind: 'text', value: 'Секрет ведущего', say: true });
  const g = game(true, p); const before = structuredClone(g.s); g.tick(JP.PICK_MS);
  assert.equal(g.s.step, 'read'); assert.equal(g.s.current?.th, 0); assert.equal(before.used.length, 0); assert.equal(g.s.played, true);
  const json = JSON.stringify(jeopardyBoard(g.s)); assert.ok(!json.includes('осётр')); assert.ok(!json.includes('Секрет ведущего')); assert.ok(!json.includes('pid'));
  assert.deepEqual(jeopardyMe(g.s, 9, g.now).host?.answers, ['осётр', 'осетра']); assert.equal(jeopardyMe(g.s, 1, g.now).host, undefined);
  const short = structuredClone(q); short.content = [{ kind: 'text', value: '?' }]; assert.equal(readingMs(short), 2000);
  short.content = [{ kind: 'text', value: 'а'.repeat(500) }, { kind: 'audio', file: 'sound.mp3', sec: 4 }]; assert.equal(readingMs(short), 12000);
});

test('Рано: блок секунду; честная кнопка учитывает пинг и ждёт 150 мс', () => {
  const g = game(); g.pick();
  assert.equal(g.act({ a: 'jpBuzz', slot: 3, ping: 0 }, 10).error?.code, 'early');
  g.open(); g.act({ a: 'jpBuzz', slot: 3, ping: 0 }, 20); assert.equal(g.s.buzzes.length, 0);
  const at = g.now;
  g.act({ a: 'jpBuzz', slot: 1, ping: 0 }, at + 100);
  g.act({ a: 'jpBuzz', slot: 2, ping: 200 }, at + 150);
  assert.equal(g.s.step, 'buzz'); g.tick(at + 249); assert.equal(g.s.step, 'buzz');
  g.tick(at + 250); assert.equal(g.s.buzz, 2); assert.equal(g.s.step, 'answer');
  const cap = game(); cap.pick(); cap.open();
  cap.act({ a: 'jpBuzz', slot: 1, ping: 100000 }, 100); assert.equal(cap.s.buzzes[0].t, cap.s.openAt);
  cap.act({ a: 'jpBuzz', slot: 2, ping: 100000 }, 240); assert.equal(cap.s.buzzes[1].t, 90);
  cap.tick(250); assert.equal(cap.s.buzz, 1);
});

test('✓/✗, повтор 5 секунд, исключение ошибившегося, не судил — без штрафа; +5 с до двух раз', () => {
  const g = game(); g.pick(); g.open(); g.buzz(1);
  g.act({ a: 'jpJudge', slot: 9, ok: false }); assert.equal(g.s.players[0].score, -100); assert.equal(g.s.total, JP.REBUZZ_MS);
  g.act({ a: 'jpBuzz', slot: 1, ping: 0 }); assert.equal(g.s.buzzes.length, 0);
  g.buzz(2); const deadline = g.s.endsAt;
  for (let i = 0; i < 3; i++) g.act({ a: 'jpMore', slot: 9 }); assert.equal(g.s.endsAt, deadline + 2 * JP.MORE_MS);
  g.act({ a: 'jpJudge', slot: 9, ok: true }); assert.equal(g.s.players[1].score, 100); assert.equal(g.s.turn, 2); assert.equal(g.s.step, 'reveal');
  assert.equal(jeopardyBoard(g.s).answer?.text, 'осётр'); g.tick(); assert.equal(g.s.step, 'pick');
  g.pick(0, 1); g.open(); g.buzz(1); g.tick(); assert.equal(g.s.step, 'judge'); g.tick();
  assert.equal(g.s.players[0].score, -100); assert.ok(g.s.out.includes(1));
});

test('Без риска без минуса, Кот в мешке отдаётся другому без кнопок; никто не знает — автопоказ', () => {
  const p = pack(); p.rounds[0].themes[0].questions[0].type = 'noRisk';
  const g = game(true, p); g.pick(); g.open(); g.buzz(); g.act({ a: 'jpJudge', slot: 9, ok: false }); assert.equal(g.s.players[0].score, 0);
  const cat = pack(); cat.rounds[0].themes[0].questions[0].type = 'cat'; cat.rounds[0].themes[0].questions[0].catTheme = 'Секретная тема';
  const c = game(true, cat); c.pick(); assert.equal(c.s.step, 'cat'); assert.equal(jeopardyBoard(c.s).q, null);
  c.act({ a: 'jpGive', slot: 1, target: 1 }); assert.equal(c.s.step, 'cat');
  c.act({ a: 'jpGive', slot: 1, target: 2 }); assert.equal(c.s.step, 'answer'); assert.equal(c.s.buzz, 2); assert.equal(jeopardyBoard(c.s).q?.theme, 'Секретная тема');
  const n = game(); n.pick(); n.open(); n.tick(); assert.ok(n.s.showAt); assert.equal(jeopardyBoard(n.s).answer, null); n.tick(); assert.equal(n.s.step, 'reveal');
});

test('Затейник: сверка, wrong имеет приоритет; оспорить — большинство да / поровну нет', () => {
  const p = pack(); p.rounds[0].themes[0].questions[0].wrong = ['осетра'];
  const g = game(false, p); g.pick(); g.open(); g.buzz();
  assert.equal(g.s.total, JP.ANSWER_ZAT_MS); g.act({ a: 'jpAns', slot: 1, text: 'осетра' }); assert.equal(g.s.step, 'wrong');
  assert.equal(g.s.players[0].score, -100); g.act({ a: 'jpDispute', slot: 1 });
  g.act({ a: 'jpDv', slot: 1, ok: true }); assert.equal(Object.keys(g.s.disputeVotes).length, 0);
  g.act({ a: 'jpDv', slot: 2, ok: true }); g.act({ a: 'jpDv', slot: 3, ok: false }); g.tick();
  assert.equal(g.s.step, 'buzz'); assert.equal(g.s.players[0].score, -100);
  g.buzz(2); g.act({ a: 'jpAns', slot: 2, text: 'лодка' }); g.act({ a: 'jpDispute', slot: 2 });
  g.act({ a: 'jpDv', slot: 1, ok: true }); g.tick();
  assert.equal(g.s.step, 'reveal'); assert.equal(g.s.players[1].score, 100); assert.equal(g.s.turn, 2);
  const yes = game(false); yes.pick(); yes.open(); yes.buzz(); yes.act({ a: 'jpAns', slot: 1, text: 'осётр' }); assert.equal(yes.s.verdict, 'yes');
});

test('ведущий ушёл — Затейник; away/возврат/свободный пульт с согласием; мало игроков 30 с', () => {
  const g = game(); g.pick(); g.open(); g.buzz();
  g.act({ a: 'presence', people: ps }); assert.equal(g.s.host, null); assert.equal(g.s.total, JP.ANSWER_ZAT_MS);
  g.act({ a: 'away', slot: 1 }); assert.equal(g.s.players[0].score, 0); assert.equal(g.s.players[0].away, g.now + JP.AWAY_MS); assert.notEqual(g.s.turn, 1);
  g.act({ a: 'seat', who: ps[0], pult: 0 }); assert.equal(g.s.players[0].away, 0);
  const live = game(), guest = { slot: 4, pid: 104, nick: 'Гость' };
  live.act({ a: 'presence', people: [...ps, host, guest] });
  assert.equal(live.act({ a: 'seat', who: guest, pult: 3 }).error?.code, 'seat');
  assert.equal(jeopardyView(live.s, 1).asks.length, 0); assert.equal(jeopardyView(live.s, 9).asks.length, 1);
  live.act({ a: 'jpSeat', slot: 9, target: 4, ok: true }); assert.equal(live.s.players.length, 4);
  live.act({ a: 'away', slot: 1 }, 1); live.tick(JP.AWAY_MS + 1); assert.ok(!live.s.players.some(p => p.slot === 1));
  const few = game(); few.act({ a: 'away', slot: 1 }); few.act({ a: 'away', slot: 2 }); few.tick(JP.FEW_MS); assert.equal(few.s.done, true);
});

test('возврат с новым slot сохраняет счёт и запрет повторной кнопки на том же вопросе', () => {
  const g = game(); g.pick(); g.open(); g.buzz(); g.act({ a: 'jpJudge', slot: 9, ok: false });
  g.act({ a: 'away', slot: 1 });
  const returned = { ...ps[0], slot: 7 };
  g.act({ a: 'presence', people: [returned, ps[1], ps[2], host] }); g.act({ a: 'seat', who: returned, pult: 0 });
  assert.equal(g.s.players[0].score, -100); assert.equal(g.s.players[0].slot, 7); assert.ok(g.s.out.includes(7));
  g.act({ a: 'jpBuzz', slot: 7, ping: 0 }); assert.equal(g.s.buzzes.length, 0);
});

test('финал: темы от меньшего счёта, ставка до счёта, тайные ответы, раскрытие по одному', () => {
  const g = game(true, pack(), true); g.s.players.forEach((p, i) => { p.score = (i + 1) * 100; });
  g.act({ a: 'jpEnd', slot: 9 }); assert.equal(g.s.step, 'fremove'); assert.equal(jeopardyBoard(g.s).fin?.remover, 1);
  g.act({ a: 'jpDrop', slot: 2, th: 0 }); assert.equal(g.s.fin?.remaining.length, 3);
  g.act({ a: 'jpDrop', slot: 1, th: 0 }); g.act({ a: 'jpDrop', slot: 2, th: 0 }); assert.equal(g.s.step, 'fbet');
  g.act({ a: 'jpBet', slot: 1, n: 101 }); assert.equal(jeopardyMe(g.s, 1, g.now).bet, 0);
  g.act({ a: 'jpBet', slot: 1, n: 100 }); assert.deepEqual(jeopardyBoard(g.s).fin?.bet, [1]);
  assert.equal(jeopardyBoard(g.s).q, null); g.tick(); assert.equal(g.s.step, 'fanswer'); assert.equal(g.s.fin?.order[1].bet, 1);
  g.act({ a: 'jpFans', slot: 1, text: 'пристань' }); g.act({ a: 'jpFans', slot: 2, text: 'скрытый ответ' });
  assert.ok(!JSON.stringify(jeopardyBoard(g.s)).includes('скрытый ответ')); g.tick(); assert.equal(g.s.step, 'fjudge');
  assert.equal(jeopardyMe(g.s, 9, g.now).fanswers?.[1].text, 'скрытый ответ'); assert.equal(jeopardyMe(g.s, 1, g.now).fanswers, undefined);
  g.act({ a: 'jpFjudge', slot: 9, target: 1, ok: true }); g.act({ a: 'jpFjudge', slot: 9, target: 2, ok: false }); g.act({ a: 'jpFjudge', slot: 9, target: 3, ok: false });
  assert.equal(g.s.step, 'freveal'); assert.deepEqual(jeopardyBoard(g.s).fin?.shown.map(p => p.slot), [1]); assert.equal(g.s.players[0].score, 200);
  g.tick(); assert.deepEqual(jeopardyBoard(g.s).fin?.shown.map(p => p.slot), [1, 2]); g.tick(); g.tick();
  assert.equal(g.s.done, true); assert.equal(g.s.result?.completed, true);
  const noFinal = game(true, pack(), true); noFinal.act({ a: 'jpEnd', slot: 9 }); assert.equal(noFinal.s.done, true);
});
