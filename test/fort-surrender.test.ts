// «Крепость»: белый флаг — сдаться голосованием (server/fort/surrender.ts, game.ts, room.ts, shared/fortsurrender.ts).
// Одиночка с подтверждением, «строго больше половины», досрочный провал, таймаут, перезарядка, выход игрока посреди
// голосования, запреты в сборе и на итогах, итоги после сдачи — те же, что при поражении (награда, рекорд), плюс surr.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import { FT_BREAK, FT_END, FT_GATHER, FT_WAVE, type FortResultRow, type FtReward } from '../shared/fort.ts';
import { buildFort } from '../shared/fortmap.ts';
import { SURR_ASK_TICKS, SURR_COOLDOWN_TICKS, SURR_VOTE_TICKS, surrenderNeed, type FortSurrender } from '../shared/fortsurrender.ts';
import { waveTokens } from '../shared/fortwaves.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { FortGame, type FortPlayer } from '../server/fort/game.ts';
import { FortRoom } from '../server/fort/room.ts';
import type { Client } from '../server/hub.ts';
import { Surrender } from '../server/fort/surrender.ts';
import type { Sink } from '../server/paintball/game.ts';

type TestSink = Sink & { msgs: ServerMsg[] };
interface Paid { pid: number; row: FortResultRow; reward: FtReward | null }

const FLAG = buildFort().stations.find((s) => s.kind === 'flag')!;

function sink(): TestSink {
  const msgs: ServerMsg[] = [];
  return { msgs, sendBinary() {}, sendJson(m) { msgs.push(m); }, close() {} };
}

/** n защитников в одной игре (ники Tester7, Tester8 …); paid — выплаты, что ушли в хук result */
function team(n: number): { g: FortGame; ps: FortPlayer[]; sinks: TestSink[]; paid: Paid[] } {
  const paid: Paid[] = [];
  const g = new FortGame({ result: (p, row, reward) => paid.push({ pid: p.pid, row, reward }) });
  const ps: FortPlayer[] = [];
  const sinks: TestSink[] = [];
  for (let i = 0; i < n; i++) {
    const s = sink();
    sinks.push(s);
    ps.push(g.addHuman({ pid: 100 + i, nick: `Tester${7 + i}`, outfit: DEFAULT_OUTFIT }, s)!);
  }
  return { g, ps, sinks, paid };
}

/** Передышка без отсчёта: волна сама не начнётся, пока тест не скажет */
function calm(g: FortGame): void {
  g.phase = FT_BREAK;
  g.phaseEnd = g.tick + 1_000_000;
}

function run(g: FortGame, ticks: number): void {
  for (let i = 0; i < ticks; i++) g.step();
}

/** E у флага: встать на место и нажать */
function press(g: FortGame, p: FortPlayer): void {
  Object.assign(p.state, { x: FLAG.x, y: FLAG.y, z: FLAG.z });
  g.use(p, FLAG.id);
}

/** Предложить сдаться: два E подряд */
function propose(g: FortGame, p: FortPlayer): void {
  press(g, p);
  press(g, p);
}

function surrs(s: TestSink): Extract<ServerMsg, { t: 'fsurr' }>[] {
  return s.msgs.filter((m): m is Extract<ServerMsg, { t: 'fsurr' }> => m.t === 'fsurr');
}

function lastSurr(s: TestSink): FortSurrender {
  const v = surrs(s).at(-1);
  assert.ok(v, 'состояние голосования пришло');
  return v;
}

function ends(s: TestSink): Extract<ServerMsg, { t: 'fend' }>[] {
  return s.msgs.filter((m): m is Extract<ServerMsg, { t: 'fend' }> => m.t === 'fend');
}

function chat(s: TestSink): string[] {
  return s.msgs.filter((m): m is Extract<ServerMsg, { t: 'chat' }> => m.t === 'chat' && m.sys === true).map((m) => m.text);
}

function toasts(s: TestSink): string[] {
  return s.msgs.filter((m): m is Extract<ServerMsg, { t: 'toast' }> => m.t === 'toast').map((m) => m.text);
}

/** Волна: старт и все сбиты стрелком killer — до передышки (как в fort-run.test.ts) */
function clearWave(g: FortGame, killer: FortPlayer): void {
  const wave = g.wave;
  g.phaseEnd = g.tick + 1;
  g.step();
  assert.equal(g.phase, FT_WAVE);
  assert.equal(g.wave, wave + 1);
  for (let i = 0; i < 200 * TICK_RATE && g.phase === FT_WAVE; i++) {
    for (const z of g.horde.zombies) if (z.alive) g.horde.damage(z, 1e9, killer.id, true, z.x, z.y + 1, z.z);
    g.step();
  }
  assert.equal(g.phase, FT_BREAK);
}

test('строго больше половины: 1→1, 2→2, 3→2, 4→3, 5→3, 6→4', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(surrenderNeed), [1, 2, 2, 3, 3, 4]);
});

test('белый флаг — последняя стойка на террасе: на виду, не на проходе, не у колокола, лавки и мест башен', () => {
  const map = buildFort();
  assert.equal(map.stations.at(-1)?.id, FLAG.id);
  assert.equal(map.stations.at(-1)?.kind, 'flag');
  assert.equal(FLAG.id, map.stations.length - 1);
  for (const o of map.stations) {
    if (o.id === FLAG.id) continue;
    // зоны E не пересекаются (радиус стойки + запас клиента 0,35 с каждой стороны), от башен на стенах — далеко
    const near = o.kind === 'tower' ? 8 : o.r + FLAG.r + 0.7;
    assert.ok(Math.hypot(o.x - FLAG.x, o.z - FLAG.z) > near, `флаг далеко от стойки «${o.kind}» (${o.id})`);
  }
  for (const s of map.spawns) assert.ok(Math.hypot(s.x - FLAG.x, s.z - FLAG.z) > FLAG.r + 0.6, 'на месте появления флаг не срабатывает');
});

test('одиночка: первое E у флага только спрашивает, второе — сразу заканчивает игру', () => {
  const { g, ps: [a], sinks: [s] } = team(1);
  calm(g);
  press(g, a);
  assert.equal(g.phase, FT_BREAK, 'первое E не сдаёт');
  const ask = lastSurr(s);
  assert.equal(ask.ask, g.tick + SURR_ASK_TICKS, 'нажми ещё раз — в течение 3 с');
  assert.equal(ask.open, false);
  assert.equal(ends(s).length, 0);
  // подтверждение просрочено — снова только вопрос
  run(g, SURR_ASK_TICKS + 1);
  press(g, a);
  assert.equal(g.phase, FT_BREAK, 'после 3 с второе E — опять первое');
  assert.equal(lastSurr(s).ask, g.tick + SURR_ASK_TICKS);
  // второе E вовремя — конец игры
  press(g, a);
  assert.equal(g.phase, FT_END);
  const [end] = ends(s);
  assert.equal(end.surr, true);
  assert.equal(end.win, false);
  assert.ok(chat(s).some((t) => t.includes('Сдались на волне 1')), chat(s).join(' | '));
  assert.ok(!chat(s).some((t) => t.includes('Голосование') || t.includes('голосуем')), 'одному голосовать не с кем — строк о голосовании нет');
  assert.equal(lastSurr(s).open, false);
});

test('3 защитника: хватает двух «за» — сдаются сразу; предложивший уже «за», сбитые тоже голосуют', () => {
  const { g, ps: [a, b, c], sinks } = team(3);
  calm(g);
  propose(g, a);
  assert.equal(g.phase, FT_BREAK, 'одного «за» из трёх мало');
  for (const s of sinks) {
    const v = lastSurr(s);
    assert.deepEqual([v.open, v.by, v.name, v.yes, v.no, v.need, v.voters.length], [true, a.id, 'Tester7', [a.id], [], 2, 3]);
    assert.equal(v.end, g.tick + SURR_VOTE_TICKS);
    assert.ok(chat(s).some((t) => t.includes('Tester7 предлагает сдаться')), 'строка о начале голосования');
  }
  // сбитый на террасе ждёт возрождения, но голосует
  c.alive = false;
  g.vote(c, true);
  assert.equal(g.phase, FT_END, 'второй голос «за» — прошло, не дожидаясь конца 20 с');
  assert.ok(ends(sinks[1]).every((e) => e.surr === true));
  assert.ok(chat(sinks[1]).some((t) => t.includes('прошло') && t.includes('за 2 из 3')), chat(sinks[1]).join(' | '));
  assert.ok(chat(sinks[1]).some((t) => t.includes('Сдались на волне 1')));
  assert.equal(b.alive, true);
});

test('2 защитника: одного «за» мало — нужны оба; «против» — не прошло сразу', () => {
  const { g, ps: [a, b], sinks } = team(2);
  calm(g);
  propose(g, a);
  assert.equal(lastSurr(sinks[1]).need, 2);
  g.vote(b, false);
  assert.equal(g.phase, FT_BREAK, 'не сдались');
  const v = lastSurr(sinks[0]);
  assert.equal(v.open, false);
  assert.equal(v.fail, true);
  assert.deepEqual([v.yes, v.no], [[a.id], [b.id]]);
  assert.ok(chat(sinks[0]).some((t) => t.includes('не прошло') && t.includes('за 1 из 2')), chat(sinks[0]).join(' | '));
  assert.equal(ends(sinks[0]).length, 0);
  // и двое «за» — проходит
  run(g, SURR_COOLDOWN_TICKS);
  propose(g, a);
  g.vote(b, true);
  assert.equal(g.phase, FT_END);
});

test('досрочный провал: «не прошло», как только «за» уже не набрать (не ждём 20 с)', () => {
  const { g, ps: [a, b, c], sinks } = team(3);
  calm(g);
  propose(g, a);
  const t0 = g.tick;
  g.vote(b, false);
  assert.equal(lastSurr(sinks[0]).open, true, 'один «против» из трёх ещё не губит: третий может сказать «за»');
  g.vote(c, false);
  assert.equal(lastSurr(sinks[0]).open, false, 'второй «против» — «за» уже не набрать');
  assert.equal(g.tick, t0, 'и ни одного тика не прошло');
  assert.equal(g.phase, FT_BREAK);
  // четверо: нужно 3
  const q = team(4);
  calm(q.g);
  propose(q.g, q.ps[0]);
  q.g.vote(q.ps[1], false);
  assert.equal(lastSurr(q.sinks[3]).open, true, '«за» 1 + ждём 2 = 3 — ещё можно');
  q.g.vote(q.ps[2], false);
  assert.equal(lastSurr(q.sinks[3]).open, false, '«за» 1 + ждём 1 = 2 < 3 — нельзя');
});

test('таймаут: 20 секунд без нужных голосов — не прошло; голос нельзя менять', () => {
  const { g, ps: [a, b, c], sinks } = team(3);
  calm(g);
  propose(g, a);
  g.vote(b, false);
  g.vote(b, true);
  assert.deepEqual([lastSurr(sinks[0]).yes, lastSurr(sinks[0]).no], [[a.id], [b.id]], 'второй голос того же человека не считается');
  a.alive = false;
  g.vote(a, false);
  assert.deepEqual(lastSurr(sinks[0]).yes, [a.id], 'и предложивший уже «за»: передумать нельзя');
  run(g, SURR_VOTE_TICKS - 1);
  assert.equal(lastSurr(sinks[2]).open, true, 'за тик до конца ещё идёт');
  run(g, 1);
  const v = lastSurr(sinks[2]);
  assert.equal(v.open, false);
  assert.equal(v.fail, true);
  assert.equal(v.cd, g.tick + SURR_COOLDOWN_TICKS);
  assert.ok(chat(sinks[2]).some((t) => t.includes('не прошло') && t.includes('нужно 2')));
  assert.equal(g.phase, FT_BREAK);
  g.vote(c, true);
  assert.equal(g.phase, FT_BREAK, 'после конца голосовать не за что');
});

test('перезарядка 45 с на всех после неудачи: подсказка «Сдаться можно через N с»', () => {
  const { g, ps: [a, b], sinks } = team(2);
  calm(g);
  propose(g, a);
  g.vote(b, false);
  const cd = lastSurr(sinks[0]).cd;
  assert.equal(cd, g.tick + SURR_COOLDOWN_TICKS);
  // у других и у самого предложившего — одно и то же
  for (const [p, s] of [[b, sinks[1]], [a, sinks[0]]] as const) {
    press(g, p);
    assert.ok(toasts(s).at(-1)?.includes('Сдаться можно через 45 с'), toasts(s).join(' | '));
  }
  assert.equal(surrs(sinks[1]).filter((m) => m.ask !== undefined).length, 0, 'вопроса «ещё раз» в перезарядке нет');
  run(g, 10 * TICK_RATE);
  press(g, b);
  assert.ok(toasts(sinks[1]).at(-1)?.includes('Сдаться можно через 35 с'));
  run(g, SURR_COOLDOWN_TICKS - 10 * TICK_RATE - 1);
  press(g, b);
  assert.ok(toasts(sinks[1]).at(-1)?.includes('через 1 с'));
  run(g, 1);
  press(g, b);
  assert.equal(lastSurr(sinks[1]).ask, g.tick + SURR_ASK_TICKS, 'перезарядка кончилась — снова спрашивает');
  press(g, b);
  assert.equal(lastSurr(sinks[0]).open, true, 'и голосование снова начинается');
  // вошедший во время перезарядки узнаёт о ней сразу
  const g2 = team(2);
  calm(g2.g);
  propose(g2.g, g2.ps[0]);
  g2.g.vote(g2.ps[1], false);
  const late = sink();
  g2.g.addHuman({ pid: 300, nick: 'Tester9', outfit: DEFAULT_OUTFIT }, late);
  assert.equal(lastSurr(late).cd, lastSurr(g2.sinks[0]).cd);
});

test('нельзя в сборе и на итогах; кристалл разбит посреди голосования — голосование снято', () => {
  const { g, ps: [a, b], sinks } = team(2);
  assert.equal(g.phase, FT_GATHER);
  propose(g, a);
  assert.equal(surrs(sinks[0]).length, 0, 'в сборе флаг молчит');
  assert.ok(toasts(sinks[0]).some((t) => t.includes('первая волна')));
  assert.equal(g.phase, FT_GATHER);
  // волна пошла — можно
  g.phaseEnd = g.tick + 1;
  g.step();
  assert.equal(g.phase, FT_WAVE);
  propose(g, a);
  assert.equal(lastSurr(sinks[1]).open, true);
  // кристалл разбит: поражение, голосование снимается, голоса уже не принимаются
  g.crystal = 0;
  g.step();
  assert.equal(g.phase, FT_END);
  assert.equal(ends(sinks[0]).at(-1)?.surr, undefined, 'поражение, а не сдача');
  g.vote(b, true);
  assert.equal(ends(sinks[0]).length, 1);
  const before = sinks[0].msgs.length;
  propose(g, a);
  assert.equal(sinks[0].msgs.length, before, 'на итогах флаг молчит');
  // новая игра — перезарядки и голосований нет
  run(g, 16 * TICK_RATE);
  assert.equal(g.phase, FT_GATHER);
  assert.equal(chat(sinks[0]).filter((t) => t.includes('Сдались')).length, 0);
});

test('выход игрока посреди голосования: выбывает из подсчёта вместе с голосом', () => {
  // четверо: нужно 3; двое «за», один «против», один молчит — «против» ушёл: из троих нужно 2 — прошло
  const four = team(4);
  calm(four.g);
  propose(four.g, four.ps[0]);
  four.g.vote(four.ps[1], true);
  four.g.vote(four.ps[2], false);
  assert.equal(four.g.phase, FT_BREAK);
  four.g.removePlayer(four.ps[2].id);
  assert.equal(four.g.phase, FT_END, 'после ухода «против» двух «за» из трёх хватает');
  assert.equal(ends(four.sinks[0])[0].surr, true);
  assert.ok(chat(four.sinks[0]).some((t) => t.includes('прошло') && t.includes('за 2 из 3')));
  // трое: «за», «против», молчун; молчун ушёл — из двоих нужны оба, а «против» уже есть: не прошло
  const three = team(3);
  calm(three.g);
  propose(three.g, three.ps[0]);
  three.g.vote(three.ps[1], false);
  three.g.removePlayer(three.ps[2].id);
  const v = lastSurr(three.sinks[0]);
  assert.deepEqual([v.open, v.fail, v.need, v.voters.length], [false, true, 2, 2]);
  assert.equal(three.g.phase, FT_BREAK);
  // «за» ушёл — его голос не считается, голосование продолжается
  const again = team(4);
  calm(again.g);
  propose(again.g, again.ps[0]);
  again.g.vote(again.ps[1], true);
  again.g.removePlayer(again.ps[1].id);
  const w = lastSurr(again.sinks[0]);
  assert.deepEqual([w.open, w.yes, w.voters.length, w.need], [true, [again.ps[0].id], 3, 2]);
  // и предложивший ушёл — остальные решают сами
  again.g.removePlayer(again.ps[0].id);
  const x = lastSurr(again.sinks[3]);
  assert.deepEqual([x.open, x.yes, x.voters.length, x.need], [true, [], 2, 2]);
  again.g.vote(again.ps[2], true);
  again.g.vote(again.ps[3], true);
  assert.equal(again.g.phase, FT_END);
  // последний ушёл — никакого голосования и никакой перезарядки в новой игре
  const solo = team(2);
  calm(solo.g);
  propose(solo.g, solo.ps[0]);
  solo.g.removePlayer(solo.ps[0].id);
  solo.g.removePlayer(solo.ps[1].id);
  const back = sink();
  const p = solo.g.addHuman({ pid: 500, nick: 'Tester9', outfit: DEFAULT_OUTFIT }, back)!;
  assert.equal(surrs(back).length, 0);
  assert.equal(p.alive, true);
});

test('итоги после сдачи — как при поражении: награда за отбитые волны, MVP, рекорд; неотбитая волна не в счёт', () => {
  const rewards = (win: 'surr' | 'crystal'): { paid: Paid[]; end: Extract<ServerMsg, { t: 'fend' }>; said: string[] } => {
    const { g, ps: [a, b], sinks, paid } = team(2);
    clearWave(g, a);
    clearWave(g, a);
    assert.equal(g.cleared, 2);
    // третья волна уже идёт — но не отбита
    g.phaseEnd = g.tick + 1;
    g.step();
    assert.equal(g.phase, FT_WAVE);
    assert.equal(g.wave, 3);
    if (win === 'surr') {
      propose(g, a);
      g.vote(b, true);
    } else {
      g.crystal = 0;
      g.step();
    }
    assert.equal(g.phase, FT_END);
    return { paid, end: ends(sinks[1]).at(-1)!, said: chat(sinks[1]) };
  };
  const s = rewards('surr');
  const c = rewards('crystal');
  assert.equal(s.end.surr, true);
  assert.equal(c.end.surr, undefined);
  assert.equal(s.end.win, false);
  assert.equal(s.end.wave, 2, 'отбито две волны; третья не засчитана');
  assert.equal(s.end.wave, c.end.wave);
  assert.equal(s.end.mvp, c.end.mvp);
  assert.equal(s.end.record, c.end.record);
  assert.equal(s.end.rows.length, 2);
  for (const pid of [100, 101]) {
    const mine = s.paid.filter((p) => p.pid === pid).at(-1)!;
    const theirs = c.paid.filter((p) => p.pid === pid).at(-1)!;
    assert.equal(mine.reward?.waves, waveTokens(1) + waveTokens(2), 'жетоны — только за две отбитые волны');
    assert.equal(mine.reward?.win, 0, 'победного бонуса за сдачу нет');
    assert.deepEqual(mine.reward, theirs.reward, 'награда та же, что при разбитом кристалле');
    assert.equal(mine.row.waves, 2);
  }
  assert.deepEqual(s.end.rows.map((r) => [r.waves, r.tokens]), c.end.rows.map((r) => [r.waves, r.tokens]));
  assert.ok(s.said.some((t) => t.startsWith('🏳️ Сдались на волне 3')), s.said.join(' | '));
  assert.ok(c.said.some((t) => t.includes('Кристалл разбит на волне 3')));
  assert.ok(!s.said.some((t) => t.includes('Кристалл разбит')));
});

test('сдаться можно и в передышке; голосование переживает смену фазы; в итогах — следующая неотбитая волна', () => {
  const { g, ps: [a, b, c], sinks } = team(3);
  clearWave(g, a);
  assert.equal(g.phase, FT_BREAK);
  // до волны остаётся ~15 с, голосование — 20 с: начинаем в передышке, заканчиваем в волне
  propose(g, a);
  run(g, 16 * TICK_RATE);
  assert.equal(g.phase, FT_WAVE, 'волна началась');
  assert.equal(lastSurr(sinks[2]).open, true, 'а голосование идёт');
  g.vote(c, true);
  assert.equal(g.phase, FT_END);
  const end = ends(sinks[1])[0];
  assert.equal(end.surr, true);
  assert.equal(end.wave, 1);
  assert.ok(chat(sinks[1]).some((t) => t.startsWith('🏳️ Сдались на волне 2')));
  assert.equal(b.alive, true);
});

test('вошедший посреди голосования видит его, но голосовать не может; уйти из итогов — не ломает', () => {
  const { g, ps: [a, b], sinks } = team(2);
  calm(g);
  propose(g, a);
  const late = sink();
  const c = g.addHuman({ pid: 400, nick: 'Tester9', outfit: DEFAULT_OUTFIT }, late)!;
  const v = lastSurr(late);
  assert.deepEqual([v.open, v.by, v.voters.includes(c.id)], [true, a.id, false]);
  g.vote(c, true);
  assert.equal(lastSurr(sinks[0]).yes.length, 1, 'голос вошедшего позже не считается');
  g.vote(b, true);
  assert.equal(g.phase, FT_END);
  g.removePlayer(c.id);
  g.removePlayer(a.id);
  assert.equal(g.humanCount, 1);
});

test('сообщение fortVote в комнате: только boolean, только от человека в крепости', () => {
  const room = new FortRoom({ outfitOf: () => DEFAULT_OUTFIT, result() {}, afk() {} });
  const mk = (id: number, nick: string): { c: Client; s: TestSink } => {
    const s = sink();
    return { c: { profile: { id, nick, level: 1 }, sink: s, ping: 0 } as unknown as Client, s };
  };
  const x = mk(1, 'Tester7');
  const y = mk(2, 'Tester8');
  const out = mk(3, 'Tester9');
  assert.equal(room.join(x.c), true);
  assert.equal(room.join(y.c), true);
  calm(room.game);
  const a = room.playerOf(x.c)!;
  propose(room.game, a);
  assert.equal(lastSurr(y.s).open, true);
  room.onMessage(y.c, { t: 'fortVote', yes: 'да' } as never);
  room.onMessage(y.c, { t: 'fortVote' } as never);
  room.onMessage(y.c, { t: 'fortVote', yes: 1 } as never);
  room.onMessage(out.c, { t: 'fortVote', yes: true });
  assert.equal(lastSurr(y.s).open, true, 'мусор и чужой — голосование не тронуто');
  assert.equal(lastSurr(y.s).yes.length, 1);
  room.onMessage(y.c, { t: 'fortVote', yes: true });
  assert.equal(room.game.phase, FT_END);
  assert.equal(ends(y.s)[0].surr, true);
});

test('Surrender без игры: счёт, подтверждение, повторный голос, ушедший, перезарядка — по тикам', () => {
  const s = new Surrender();
  const ids = [1, 2, 3, 4, 5];
  assert.deepEqual(s.press(1, 'А', ids, 100), { k: 'ask', until: 100 + SURR_ASK_TICKS });
  assert.deepEqual(s.press(2, 'Б', ids, 110), { k: 'ask', until: 110 + SURR_ASK_TICKS }, 'подтверждение — у каждого своё');
  assert.deepEqual(s.press(1, 'А', ids, 100 + SURR_ASK_TICKS), { k: 'started' }, 'ровно через 3 с — ещё считается');
  assert.deepEqual(s.press(2, 'Б', ids, 200), { k: 'busy' });
  assert.equal(s.view(200).need, 3);
  assert.equal(s.vote(9, true, 200), null, 'чужой не голосует');
  assert.equal(s.vote(2, true, 200)?.out, null);
  assert.equal(s.vote(2, false, 200), null, 'второй голос не считается');
  assert.equal(s.vote(3, false, 200)?.out, null);
  // двое «против»: «за» 2 + ждём 1 = 3 — ещё можно; третий «против» — нельзя
  assert.equal(s.vote(4, false, 200)?.out, null);
  const out = s.vote(5, false, 200)?.out;
  assert.equal(out?.result, 'failed');
  assert.equal(out?.why, 'hopeless');
  assert.deepEqual([out?.yes, out?.no, out?.voters, out?.need], [2, 3, 5, 3]);
  assert.equal(s.open, false);
  assert.equal(s.waitLeft(200), SURR_COOLDOWN_TICKS);
  assert.deepEqual(s.press(1, 'А', ids, 201), { k: 'wait', left: SURR_COOLDOWN_TICKS - 1 });
  assert.equal(s.view(201).cd, 200 + SURR_COOLDOWN_TICKS);
  assert.equal(s.view(200 + SURR_COOLDOWN_TICKS).cd, 0);
  // отсчёт времени: 20 с от начала
  const t = new Surrender();
  const t0 = 1000;
  t.press(1, 'А', [1, 2], t0);
  t.press(1, 'А', [1, 2], t0 + 1);
  assert.equal(t.step(t0 + 1 + SURR_VOTE_TICKS - 1), null);
  const late = t.step(t0 + 1 + SURR_VOTE_TICKS);
  assert.equal(late?.why, 'time');
  assert.equal(t.step(t0 + 5000), null, 'после конца — ничего');
  // сброс новой игры снимает и перезарядку
  t.reset();
  assert.equal(t.waitLeft(t0 + 1 + SURR_VOTE_TICKS), 0);
});
