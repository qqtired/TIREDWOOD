// «Ракушка», клиент: контроллер по разнице снимков раздаёт события видам (client/lobby/quiz/state.ts, docs/quiz/tech.md §14)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffQuiz, oldestUnmarked, warmLines, recentMisses, type QuizSnap } from '../client/lobby/quiz/state.ts';
import { quizAgendaLine, quizSignLine } from '../client/lobby/plaza3/status.ts';
import { pultsUp, quizCamera, quizNoTag, quizPlace, whoCamera } from '../client/lobby/quiz/places.ts';
import { hostCamera, seatCamera, stageCamera, tvCamera } from '../shared/quiz/venue.ts';
import { QUIZ_VENUE } from '../shared/quiz/venue.ts';
import { QZ, type QzLine, type QzView } from '../shared/quiz/types.ts';

const line = (id: number, slot: number, mark: QzLine['mark'] = '', at = id, markedAt = 0): QzLine =>
  ({ id, slot, nick: `P${slot}`, text: `строка ${id}`, at, kind: 'guess', mark, markedAt });

function view(o: Partial<QzView> & { lines?: QzLine[]; step?: 'round' | 'check' | 'reveal' | 'ask' | 'call' } = {}): QzView {
  const { lines = [], step = 'round', ...rest } = o;
  return {
    rev: 1, now: 1000, phase: 'game', endsAt: 0, mode: 'riddle', count: 3, seated: 2, vote: null,
    riddle: {
      step, num: 1, of: 5, riddler: { slot: 9, nick: 'Барон' }, category: 'Предмет', hints: [], misses: [], warm: 0, endsAt: 0, total: 0,
      checking: null, last: null, lines,
    },
    results: null, evening: [], noTokens: false, zat: null,
    people: [{ slot: 1, nick: 'P1', chair: 0, role: '', vote: -1 }, { slot: 9, nick: 'Барон', chair: 3, role: 'riddler', vote: -1 }],
    call: null, swap: null,
    ...rest,
  };
}
const snap = (v: QzView, inside = true): QuizSnap => ({ board: v, view: inside ? v : null, me: inside ? { slot: 1, place: 0, role: '', vote: -1, swap: false, canSwap: true, canPlay: false, canTake: false, gapUntil: 0 } : null });
const kinds = (ev: ReturnType<typeof diffQuiz>): string[] => ev.map((e) => e.k);

test('вход за ограду: событие inside, старые строки облачками не всплывают', () => {
  const ev = diffQuiz(snap(view(), false), snap(view({ lines: [line(1, 1)] })));
  assert.deepEqual(kinds(ev), ['inside']);
});

test('новая строка, отметка, замена — облачко, цвет, уход', () => {
  const a = snap(view({ lines: [line(1, 1), line(2, 2)] }));
  const b = snap(view({ rev: 2, lines: [line(1, 1, 'warm', 1, 50), line(3, 2)] }));
  const ev = diffQuiz(a, b);
  assert.deepEqual(kinds(ev), ['mark', 'line', 'gone']);
  assert.equal(ev[0].k === 'mark' && ev[0].was, '');
  // правка: «тепло» снято — снова неотмеченная
  const c = snap(view({ rev: 3, lines: [line(1, 1), line(3, 2)] }));
  const ev2 = diffQuiz(b, c);
  assert.deepEqual(kinds(ev2), ['mark']);
  assert.equal(ev2[0].k === 'mark' && ev2[0].line.mark, '');
});

test('загадывающий на сцену и обратно — хлопок; проверка «угадал» — дробь, потом праздник', () => {
  const ask = snap(view({ step: 'ask' }));
  const round = snap(view({ rev: 2 }));
  assert.deepEqual(diffQuiz(ask, round).filter((e) => e.k === 'stage').map((e) => e.k === 'stage' && e.on), [true]);
  const check = view({ rev: 3, step: 'check', lines: [line(5, 1, 'check')] });
  check.riddle!.checking = { slot: 1, nick: 'P1', line: 5, until: 4000 };
  const ev = diffQuiz(round, snap(check));
  assert.ok(ev.some((e) => e.k === 'check' && e.line === 5));
  const reveal = view({ rev: 4, step: 'reveal', lines: [line(5, 1, 'win')] });
  reveal.riddle!.last = { end: 'solved', answer: 'пароход', riddler: { slot: 9, nick: 'Барон' }, solver: { slot: 1, nick: 'P1' } };
  const ev2 = diffQuiz(snap(check), snap(reveal));
  assert.ok(ev2.some((e) => e.k === 'checkEnd' && e.solved));
  assert.ok(ev2.some((e) => e.k === 'end' && e.end === 'solved'));
  assert.ok(ev2.some((e) => e.k === 'stage' && !e.on));
});

test('отменили проверку — без праздника', () => {
  const check = view({ rev: 3, step: 'check', lines: [line(5, 1, 'check')] });
  check.riddle!.checking = { slot: 1, nick: 'P1', line: 5, until: 4000 };
  const back = snap(view({ rev: 4, lines: [line(5, 1)] }));
  const ev = diffQuiz(snap(check), back);
  assert.ok(ev.some((e) => e.k === 'checkEnd' && !e.solved));
  assert.ok(!ev.some((e) => e.k === 'end'));
});

test('голос и реплика Затейника', () => {
  const a = view({ phase: 'vote' });
  const b = view({ rev: 2, phase: 'vote', zat: { id: 7, text: 'Голосуем — жмите 1–4!', clip: 'announce', at: 1 } });
  b.people[0].vote = 2;
  const ev = diffQuiz(snap(a), snap(b));
  assert.ok(ev.some((e) => e.k === 'vote' && e.slot === 1 && e.card === 2));
  assert.ok(ev.some((e) => e.k === 'zat' && e.say.id === 7));
});

test('производное: самая старая неотмеченная, «Тепло» по времени отметки, «мимо» 5 с', () => {
  const ls = [line(4, 1, '', 40), line(2, 2, 'warm', 20, 300), line(3, 3, '', 30), line(1, 4, 'warm', 10, 200), line(6, 5, 'miss', 60, 1000)];
  assert.equal(oldestUnmarked(ls)?.id, 3);
  assert.deepEqual(warmLines(ls).map((l) => l.id), [1, 2]);
  assert.deepEqual(recentMisses(ls, 1000 + QZ.MISS_UNDO_MS - 1).map((l) => l.id), [6]);
  assert.deepEqual(recentMisses(ls, 1000 + QZ.MISS_UNDO_MS), []);
});

test('вывеска над аркой и афиша кафе', () => {
  assert.equal(quizSignLine(null, 0).text, 'Игры нет — заходи');
  const v = view({ phase: 'vote', endsAt: 15_000, now: 0 });
  assert.equal(quizSignLine(v, 1000).text, 'Голосуем · 0:14');
  const g = view({ count: 5 });
  g.riddle!.endsAt = 151_000;
  assert.equal(quizSignLine(g, 0).text, 'Загадка · 2:31 · 5 игроков');
  assert.ok(quizSignLine(g, 0).text.length <= 34);
  assert.deepEqual(quizAgendaLine(g), { text: 'Загадка · идёт · 5 игроков', hot: true });
  assert.deepEqual(quizAgendaLine(view({ phase: 'idle' })), { text: 'игры нет', hot: false });
});

test('декор plaza3 в зоне площадки: прячется и возвращается', async () => {
  const THREE = await import('three');
  const { FenceClear, fenceDecor } = await import('../client/lobby/quiz/clear.ts');
  // свой многоугольник вокруг известного кипариса квартала games (80; 4) — от места площадки тест не зависит
  const zone = fenceDecor([[78, 2], [82, 2], [82, 6], [78, 6]]);
  const games = zone.get('plaza3-games') ?? [];
  assert.ok(games.length >= 2);
  // меш квартала: дерево в ограде и коробка снаружи
  const c = games[0];
  const tree = new THREE.CylinderGeometry(c.r, c.r, c.y1 - c.y0, 8).translate(c.x, (c.y0 + c.y1) / 2, c.z);
  const far = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, -40);
  const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
  const mesh = new THREE.Mesh(mergeGeometries([tree, far]));
  mesh.name = 'plaza3-games';
  const root = new THREE.Group().add(mesh);
  const before = Array.from(mesh.geometry.getIndex()!.array);
  const fc = new FenceClear();
  fc.apply(root, zone);
  assert.equal(fc.tris, tree.getIndex()!.count / 3);
  const after = Array.from(mesh.geometry.getIndex()!.array);
  assert.deepEqual(after.slice(tree.getIndex()!.count), before.slice(tree.getIndex()!.count));
  fc.restore();
  assert.deepEqual(Array.from(mesh.geometry.getIndex()!.array), before);
});

test('ник загадывающего на сцене не рисуем, на кресле — рисуем', () => {
  assert.equal(quizNoTag(QUIZ_VENUE.first.riddler), true);
  assert.equal(quizNoTag(QUIZ_VENUE.first.chair), false);
  assert.equal(quizNoTag(QUIZ_VENUE.first.pult), true, 'ник игрока за пультом — на табличке пульта');
  assert.equal(quizNoTag(-1), false);
});

test('часть 2: пульты наверху — у игроков «Своей игры»; камеры мест', () => {
  const v = view({ mode: 'jeopardy', riddle: null });
  assert.deepEqual(pultsUp(v), QUIZ_VENUE.pults.map(() => false));
  v.jp = { step: 'pick', players: [{ slot: 1, nick: 'P1', pult: 0, score: 0, away: 0 }, { slot: 2, nick: 'P2', pult: 3, score: 0, away: 0 }] } as unknown as QzView['jp'];
  assert.deepEqual(pultsUp(v).map((x, i) => (x ? i : -1)).filter((i) => i >= 0), [0, 3]);
  assert.ok(pultsUp({ ...v, phase: 'results' }).every((x) => !x));
  const f = QUIZ_VENUE.first;
  assert.deepEqual(quizCamera(quizPlace(f.chair + 4)!), seatCamera(QUIZ_VENUE.chairs[4]));
  assert.deepEqual(quizCamera(quizPlace(f.pult + 2)!), tvCamera());
  assert.deepEqual(quizCamera(quizPlace(f.podium)!), hostCamera());
});

test('«Ракушка» у пирса: «Ласточка» прячется и возвращается, строки катера в афише нет', async () => {
  const { hideSwallow, SWALLOW } = await import('../client/lobby/quiz/swallow.ts');
  const { agendaRows, emptyLive, fillLive } = await import('../client/lobby/plaza/live.ts');
  const log: string[] = [];
  const parts = {
    pavilions: { setPavHidden: (id: string, h: boolean) => log.push(`pav ${id} ${h}`) },
    signs: { setHidden: (id: string, h: boolean) => log.push(`sign ${id} ${h}`) },
    npc: { setAway: (id: string, h: boolean) => log.push(`npc ${id} ${h}`) },
    boat: { setLaunchShown: (on: boolean) => log.push(`boat ${on}`) },
    post: { setShown: (on: boolean) => log.push(`post ${on}`) },
  };
  hideSwallow(parts, true);
  assert.deepEqual(log, [`pav ${SWALLOW.pav} true`, `sign ${SWALLOW.sign} true`, `npc ${SWALLOW.npc} true`, 'boat false', 'post false']);
  log.length = 0;
  hideSwallow({ ...parts, pavilions: null, signs: null, npc: null }, false);
  assert.deepEqual(log, ['boat true', 'post true'], 'без набережной — только катер и столбик');
  const raw = { pbHumans: 0, fort: null, skill: null, kart: null, kartLeft: 0, hide: null, boatrace: null, regattaRunning: false, boat: { ph: 0, at: 0, n: 0 }, aqua: null, tick: 0, tickRate: 60 };
  assert.ok(agendaRows(fillLive(emptyLive(), raw)).some((r) => r.key === 'boat'), 'без QUIZ — строка катера есть');
  assert.ok(!agendaRows(fillLive(emptyLive(), { ...raw, noBoat: true })).some((r) => r.key === 'boat'), 'с QUIZ — строки катера нет');
});

test('«Кто из нас?», голосование: камера сцены с того же места, смотрит чуть выше', () => {
  const s = stageCamera(), w = whoCamera();
  assert.deepEqual(w.pos, s.pos);
  assert.ok(w.target[1] > s.target[1]);
  const d = Math.hypot(w.target[0] - w.pos[0], w.target[1] - w.pos[1], w.target[2] - w.pos[2]);
  assert.ok(Math.abs(d - 1) < 0.01, 'направление единичное');
});
