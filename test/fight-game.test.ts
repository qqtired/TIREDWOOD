// «Fight Club» на сервере (server/fight/game.ts): раунды 1 на 1 до двух побед, 2 на 2 — команда выбывает целиком,
// каждый за себя — места по нокаутам; темнота бьёт; удар с откатом соперника; боты дерутся сами; жетоны.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import {
  FA_JAB, FC_END_TICKS, FC_FIRST_INTRO_TICKS, FC_INTRO_TICKS, FC_PAUSE_TICKS, FC_ZONE_START_FFA, FP_END, FP_FIGHT, FP_INTRO, FP_PAUSE, MOVES,
  fightReward, type FcMode, type FcResultRow, type FcReward,
} from '../shared/fight.ts';
import { makeRng } from '../shared/math.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { BTN_FIRE, makeInput } from '../shared/sim.ts';
import { FightGame, type FcPlayer } from '../server/fight/game.ts';
import { fakeSink, type FakeSink } from './kit.ts';

interface Rig {
  g: FightGame;
  humans: { p: FcPlayer; s: FakeSink }[];
  results: { p: FcPlayer; row: FcResultRow; reward: FcReward }[];
  over: { n: number };
}

function rig(mode: FcMode, nHumans: number, seed = 7): Rig {
  const results: Rig['results'] = [];
  const over = { n: 0 };
  const g = new FightGame(mode, {
    result: (p, row, reward) => results.push({ p, row, reward }),
    over: () => over.n++,
  }, { rng: makeRng(seed) });
  const humans: Rig['humans'] = [];
  for (let i = 0; i < nHumans; i++) {
    const s = fakeSink();
    const p = g.addHuman({ pid: 100 + i, nick: `Боец${i}`, outfit: { ...DEFAULT_OUTFIT } }, s, true)!;
    humans.push({ p, s });
  }
  g.start();
  return { g, humans, results, over };
}

function stepN(g: FightGame, n: number): void {
  for (let i = 0; i < n; i++) g.step();
}

function toFight(g: FightGame): void {
  for (let i = 0; i < 20 * TICK_RATE && g.phase !== FP_FIGHT; i++) g.step();
  assert.equal(g.phase, FP_FIGHT);
}

function fighters(g: FightGame): FcPlayer[] {
  return [...g.players.values()].filter((p) => p.fighter);
}

function ko(p: FcPlayer): void {
  p.f.hp = 0;
  p.f.ko = 1;
}

function lastMsg<T extends ServerMsg['t']>(s: FakeSink, t: T): Extract<ServerMsg, { t: T }> | undefined {
  for (let i = s.msgs.length - 1; i >= 0; i--) if (s.msgs[i].t === t) return s.msgs[i] as Extract<ServerMsg, { t: T }>;
  return undefined;
}

test('1 на 1: бот добирает пару, вступление, раунды до двух побед, итоги, жетоны, всех наверх', () => {
  const { g, humans, results, over } = rig('duel', 1);
  const [me] = humans;
  assert.equal(fighters(g).length, 2, 'бот добрал');
  assert.equal(g.ringR, 5);
  assert.equal(g.phase, FP_INTRO);
  assert.ok(lastMsg(me.s, 'fcInit'), 'приветствие');
  assert.equal(lastMsg(me.s, 'fcInit')!.id, me.p.id);
  const bot = fighters(g).find((p) => p.bot)!;
  assert.notEqual(bot.team, me.p.team);
  stepN(g, FC_FIRST_INTRO_TICKS - 2);
  assert.equal(g.phase, FP_INTRO, 'вступление дольше в первый раз');
  toFight(g);
  // раунд 1 — мой
  ko(bot);
  g.step();
  assert.equal(g.phase, FP_PAUSE);
  assert.deepEqual([g.wins[me.p.team], g.wins[bot.team]], [1, 0]);
  assert.equal(g.lastWin, me.p.team);
  stepN(g, FC_PAUSE_TICKS);
  assert.equal(g.phase, FP_INTRO, 'новый раунд');
  assert.equal(g.round, 2);
  assert.equal(bot.f.ko, 0, 'все снова на ногах');
  assert.equal(bot.f.hp, 100);
  stepN(g, FC_INTRO_TICKS);
  assert.equal(g.phase, FP_FIGHT);
  // раунд 2 — бота, раунд 3 — мой
  ko(me.p);
  g.step();
  stepN(g, FC_PAUSE_TICKS + FC_INTRO_TICKS);
  assert.equal(g.phase, FP_FIGHT);
  assert.deepEqual([g.wins[me.p.team], g.wins[bot.team]], [1, 1]);
  me.p.dmg = 40; // попадал по боту — без попаданий жетонов нет
  ko(bot);
  g.step();
  assert.equal(g.phase, FP_PAUSE);
  stepN(g, FC_PAUSE_TICKS);
  assert.equal(g.phase, FP_END, 'две победы — итоги');
  const end = lastMsg(me.s, 'fcEnd')!;
  assert.ok(end);
  assert.equal(end.rows[0].id, me.p.id, 'победитель первым');
  assert.ok(end.rows[0].won);
  assert.equal(results.length, 1, 'жетоны — только человеку');
  const want = fightReward({ mode: 'duel', won: true, place: 1, fighters: 2, kos: 0, dmg: 40 });
  assert.equal(results[0].reward.total, want.total);
  assert.equal(lastMsg(me.s, 'fcReward')!.total, want.total);
  stepN(g, FC_END_TICKS);
  assert.equal(over.n, 1);
  assert.ok(g.closed);
});

test('2 на 2: команда выбывает только целиком; нокаутированный встаёт в толпу', () => {
  // четверо людей — ботов нет (боты только соло)
  const { g, humans } = rig('team', 4);
  assert.equal(fighters(g).length, 4);
  assert.ok(fighters(g).every((p) => !p.bot));
  assert.equal(g.ringR, 6);
  const [a, b] = humans;
  assert.notEqual(a.p.team, b.p.team, 'люди — в разных командах');
  toFight(g);
  const mates = fighters(g).filter((p) => p.team === b.p.team);
  ko(mates[0]);
  g.step();
  assert.equal(g.phase, FP_FIGHT, 'один лёг — бой идёт');
  stepN(g, 2 * TICK_RATE + 2);
  assert.ok(g.inCrowd(mates[0]), 'отлежался — в толпе');
  assert.ok(mates[0].slot >= 0);
  ko(mates[1]);
  g.step();
  assert.equal(g.phase, FP_PAUSE);
  assert.equal(g.lastWin, a.p.team);
  stepN(g, FC_PAUSE_TICKS + 1);
  assert.ok(!g.inCrowd(mates[0]), 'новый раунд — снова в ринге');
});

test('каждый за себя: места по нокаутам (в один тик — общее), последний — первый', () => {
  const { g, humans, results } = rig('ffa', 1);
  const all = fighters(g);
  assert.equal(all.length, 4, 'боты добрали до четырёх');
  toFight(g);
  const [x, y, z, w] = all;
  ko(x);
  g.step();
  assert.equal(x.place, 4);
  ko(y);
  ko(z);
  g.step();
  assert.equal(y.place, 2);
  assert.equal(z.place, 2);
  assert.equal(g.phase, FP_END);
  assert.equal(w.place, 1);
  const me = humans[0].p;
  assert.equal(results.length, 1);
  assert.equal(results[0].row.place, me.place);
});

test('темнота: свет сузился — за его краем тикает урон, на свету — нет', () => {
  const { g } = rig('ffa', 1);
  toFight(g);
  const [a, b] = fighters(g);
  // все стоят спокойно: перематываем свет к третьей ступени
  for (const p of fighters(g)) p.f.inv = 0;
  g.roundStart -= FC_ZONE_START_FFA + 40 * TICK_RATE;
  for (const p of fighters(g)) {
    p.f.s.x = 0;
    p.f.s.z = 0;
  }
  a.f.s.x = g.ringR - 0.5;
  a.f.s.z = 0;
  b.f.s.x = 0;
  b.f.s.z = 0.2;
  const hp0 = a.f.hp;
  const hpB = b.f.hp;
  // боты в этом тесте не мешают: держим их на месте
  stepN(g, 1);
  assert.ok(g.zone.r < g.ringR * 0.6, `свет сузился: ${g.zone.r.toFixed(2)}`);
  for (let i = 0; i < 2 * TICK_RATE; i++) {
    a.f.s.x = g.ringR - 0.5;
    a.f.s.z = 0;
    g.step();
  }
  assert.ok(a.f.hp < hp0 - 5, `в темноте бьёт: ${hp0} → ${a.f.hp}`);
  assert.ok(b.f.hp >= hpB - 30, 'в центре светло (боты могли разок задеть)');
});

test('удар с откатом: бьём туда, где соперник был на экране бьющего; без отката — мимо', () => {
  for (const rewind of [true, false]) {
    const { g, humans } = rig('duel', 2);
    const [a, b] = humans;
    toFight(g);
    // a смотрит на север (yaw 0), b стоит в метре перед ним
    const place = () => {
      a.p.f.s.x = 0;
      a.p.f.s.z = 0;
      b.p.f.s.x = 0;
      b.p.f.s.z = -1.1;
    };
    const feed = (p: FcPlayer, buttons: number, seq: number, viewTick: number) => {
      const inp = makeInput();
      inp.seq = seq;
      inp.buttons = buttons;
      inp.yaw = 0;
      inp.viewTick = viewTick;
      g.onInputs(p, [inp], 1);
    };
    let seq = 1;
    for (let i = 0; i < 10; i++) {
      place();
      feed(a.p, 0, seq, g.tick);
      feed(b.p, 0, seq, g.tick);
      seq++;
      g.step();
    }
    const seen = g.tick;
    // b отходит на 3 м (у бьющего на экране он ещё рядом), a бьёт джебом
    b.p.f.s.z = -4;
    const hp0 = b.p.f.hp;
    for (let i = 0; i <= MOVES[FA_JAB].w + 1; i++) {
      feed(a.p, i === 0 ? BTN_FIRE : 0, seq, rewind ? seen - 1 : g.tick);
      feed(b.p, 0, seq, g.tick);
      seq++;
      a.p.f.s.x = 0;
      a.p.f.s.z = 0;
      b.p.f.s.x = 0;
      b.p.f.s.z = -4;
      g.step();
    }
    if (rewind) assert.equal(b.p.f.hp, hp0 - MOVES[FA_JAB].dmg, 'попал по тому, что видел');
    else assert.equal(b.p.f.hp, hp0, 'без отката — мимо');
  }
});

test('боты дерутся сами: бой 1 на 1 с ботом и свалка с ботами доходят до итогов', () => {
  for (const mode of ['duel', 'ffa', 'team'] as const) {
    const { g, results, over } = rig(mode, 1, 11);
    let fightTicks = 0;
    for (let i = 0; i < 400 * TICK_RATE && !g.closed; i++) {
      g.step();
      if (g.phase === FP_FIGHT) fightTicks++;
    }
    assert.ok(g.closed, `${mode}: бой кончился`);
    assert.equal(over.n, 1);
    assert.equal(results.length, 1);
    assert.ok(fightTicks > 5 * TICK_RATE, `${mode}: дрались не мгновенно`);
    const kos = fighters(g).reduce((n, p) => n + p.kos, 0);
    assert.ok(kos > 0, `${mode}: боты нокаутируют`);
  }
});

test('зрители: стоят в толпе, своего состояния в снимке нет, эмоции — не чаще раза в полсекунды', () => {
  const results: unknown[] = [];
  const g = new FightGame('duel', { result: () => results.push(1), over: () => {} }, { rng: makeRng(3) });
  const s1 = fakeSink();
  const s2 = fakeSink();
  const s3 = fakeSink();
  g.addHuman({ pid: 1, nick: 'А', outfit: { ...DEFAULT_OUTFIT } }, s1, true);
  g.addHuman({ pid: 2, nick: 'Б', outfit: { ...DEFAULT_OUTFIT } }, s2, true);
  const watcher = g.addHuman({ pid: 3, nick: 'В', outfit: { ...DEFAULT_OUTFIT } }, s3, true)!;
  g.start();
  assert.equal(watcher.fighter, false, 'третий в дуэли — зритель');
  assert.ok(watcher.slot >= 0);
  assert.equal(fighters(g).length, 2, 'ботов не нужно');
  stepN(g, 4);
  assert.ok(s3.bins.length > 0);
  g.emote(watcher, 3);
  g.emote(watcher, 4);
  stepN(g, 2);
  const ev = s3.msgs.filter((m) => m.t === 'fcEv').flatMap((m) => (m as Extract<ServerMsg, { t: 'fcEv' }>).e);
  assert.equal(ev.filter((e) => e[0] === 'emote').length, 1);
  // поздний зритель получает приветствие сразу
  const s4 = fakeSink();
  const late = g.addHuman({ pid: 4, nick: 'Г', outfit: { ...DEFAULT_OUTFIT } }, s4, true)!;
  assert.equal(late.fighter, false);
  assert.ok(lastMsg(s4, 'fcInit'));
});

test('боец ушёл — его сторона проиграла; людей не осталось — бой закрывают снаружи', () => {
  const { g, humans } = rig('duel', 2);
  toFight(g);
  g.removePlayer(humans[1].p.id);
  g.step();
  stepN(g, FC_PAUSE_TICKS + 1);
  assert.equal(g.phase, FP_END);
  assert.ok(lastMsg(humans[0].s, 'fcEnd')!.rows.find((r) => r.id === humans[0].p.id)!.won);
});
