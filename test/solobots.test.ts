// Боты только соло (решение владельца): в заезде или матче один человек — боты добирают соперников, как раньше;
// двое и больше — ботов нет совсем. Картинг, «Портовая регата», пейнтбол, Fight Club; таблички говорят то же самое.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PHASE_END, PHASE_PLAY, PHASE_WARMUP, TICK_RATE } from '../shared/constants.ts';
import { FC_CHECK_EVERY, FC_CIRCLE, FC_COUNT_TICKS, FC_FIGHTERS, type FcMode } from '../shared/fight.ts';
import { RC_GRID, RC_MAX_KARTS, RC_MIN_KARTS } from '../shared/kart.ts';
import { KART_CHECK_EVERY, KART_COUNT_TICKS } from '../shared/lobby.ts';
import { BOAT_RACE_CIRCLE, KART_START } from '../shared/maps/lobby.ts';
import { makeRng } from '../shared/math.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { RG_GATHER_TICKS, RG_MIN_BOATS } from '../shared/regatta.ts';
import { BOTS_RULE, botsAllowed, botsWord } from '../shared/solobots.ts';
import { boardLines, fightHint } from '../client/fight/door.ts';
import { FightGame } from '../server/fight/game.ts';
import { Game, type Player } from '../server/paintball/game.ts';
import { Race } from '../server/race/race.ts';
import { fakeSink, login, placeAt, setupHub, steps } from './kit.ts';

test('правило: боты нужны, только когда человек один; подписи — те же слова', () => {
  assert.deepEqual([0, 1, 2, 3, 6].map(botsAllowed), [false, true, false, false, false]);
  assert.equal(botsWord(1), 'с ботами');
  assert.equal(botsWord(2), 'без ботов');
  assert.equal(botsWord(0), BOTS_RULE, 'пока никого — само правило');
});

// ---------------------------------------------------------------- картинг

function raceOf(humans: number): Race {
  const race = new Race({}, { seed: 1 });
  for (let i = 0; i < humans; i++) assert.ok(race.addHuman({ pid: 10 + i, nick: `Гонщик${i}`, outfit: DEFAULT_OUTFIT }, fakeSink()));
  return race;
}

const botKarts = (race: Race): number => [...race.karts.values()].filter((k) => k.isBot).length;

test('картинг: один — три бота (до четырёх картов); двое и больше — ни одного', () => {
  const solo = raceOf(1);
  solo.start();
  assert.equal(solo.karts.size, RC_MIN_KARTS);
  assert.equal(botKarts(solo), RC_MIN_KARTS - 1);
  for (const n of [2, 3, RC_MAX_KARTS]) {
    const race = raceOf(n);
    race.start();
    assert.equal(race.karts.size, n, `${n} людей — ровно ${n} картов`);
    assert.equal(botKarts(race), 0, `${n} людей — без ботов`);
    assert.ok(race.roster().every((k) => !k.bot), 'в списке и на табло ботов нет');
    assert.ok(race.board().every((k) => !k.bot));
    assert.equal(race.status().names.length, n);
  }
});

test('картинг: один из двоих ушёл до «Вперёд!» — боты в этот заезд не приходят, в следующий (один человек) — вернулись', () => {
  const race = raceOf(2);
  race.start();
  const [a, b] = [...race.karts.values()];
  race.removeKart(b.id);
  while (race.phase === RC_GRID) race.step();
  assert.equal(race.karts.size, 1);
  assert.equal(botKarts(race), 0, 'заезд идёт без ботов до конца');
  assert.ok(!a.isBot);
  const next = raceOf(1);
  next.start();
  assert.equal(botKarts(next), RC_MIN_KARTS - 1, 'следующий заезд — один человек, боты на месте');
});

test('картинг через набережную: одна желейка в круге — с ботами, две — без', () => {
  for (const [n, bots] of [[1, RC_MIN_KARTS - 1], [2, 0]] as const) {
    const { hub } = setupHub();
    const who = Array.from({ length: n }, (_, i) => login(hub, `Kart${n}x${i}`));
    for (const w of who) placeAt(hub, w.c, KART_START.x, KART_START.z);
    steps(hub, KART_COUNT_TICKS + KART_CHECK_EVERY + 1);
    const race = hub.race.race;
    assert.ok(race && race.started, `${n} в круге — гонка началась`);
    assert.equal(botKarts(race), bots, `${n} в круге — ботов ${bots}`);
    assert.equal(race.karts.size, Math.max(n, bots + 1));
  }
});

// ---------------------------------------------------------------- регата

function stand(hub: ReturnType<typeof setupHub>['hub'], who: ReturnType<typeof login>[]): void {
  who.forEach((w, i) => placeAt(hub, w.c, BOAT_RACE_CIRCLE.x + (i % 2) * 0.8, BOAT_RACE_CIRCLE.z + (i >> 1) * 0.6));
  steps(hub, RG_GATHER_TICKS + KART_CHECK_EVERY * 2);
}

test('регата: один — три бота (до четырёх катеров); двое и больше — без ботов; ушёл второй — следующий заезд с ботами', () => {
  const { hub } = setupHub({ boatrace: true });
  const [a, b] = [login(hub, 'RegA'), login(hub, 'RegB')];
  stand(hub, [a, b]);
  const reg = hub.lobby.regatta!;
  assert.equal(reg.phase, 'grid');
  let boats = reg.debug().boats;
  assert.equal(boats.length, 2, 'вдвоём — два катера');
  assert.ok(boats.every((x) => !x.bot), 'ботов нет');
  // второй сошёл в разгаре заезда: первому ботов не добавляют
  hub.onJson(b.c, { t: 'rg', a: 'quit' });
  steps(hub, 5);
  assert.equal(reg.debug().boats.length, 1);
  assert.equal(reg.debug().boats.filter((x) => x.bot).length, 0);
  // первый тоже вышел; новый заезд — уже один человек, боты вернулись
  hub.onJson(a.c, { t: 'rg', a: 'quit' });
  assert.equal(reg.phase, 'idle');
  stand(hub, [a]);
  boats = reg.debug().boats;
  assert.equal(boats.length, RG_MIN_BOATS);
  assert.equal(boats.filter((x) => x.bot).length, RG_MIN_BOATS - 1);
});

// ---------------------------------------------------------------- пейнтбол

const pbBots = (g: Game): number => [...g.players.values()].filter((p) => p.isBot).length;

function pbHuman(g: Game, nick: string, pid: number): Player {
  const p = g.addHuman({ pid, nick, outfit: DEFAULT_OUTFIT }, fakeSink());
  assert.ok(p);
  return p;
}

function untilPhase(g: Game, phase: number): void {
  for (let i = 0; i < 20 * TICK_RATE && g.phase !== phase; i++) g.step();
  assert.equal(g.phase, phase);
}

test('пейнтбол: один — боты добивают команды; второй зашёл до старта — боты ушли; остался один — вернулись', () => {
  const g = new Game();
  const a = pbHuman(g, 'Один', 1);
  assert.equal(g.phase, PHASE_WARMUP);
  assert.equal(pbBots(g), 7, 'четверо против четверых: рядом с человеком три бота, напротив четыре');
  const b = pbHuman(g, 'Второй', 2);
  assert.equal(g.phase, PHASE_WARMUP, 'разминка ещё идёт');
  assert.equal(pbBots(g), 0, 'вдвоём ботов нет совсем');
  assert.equal(g.players.size, 2);
  assert.ok(g.roster().every((r) => !r.bot), 'в списке игроков одни люди');
  assert.notEqual(a.team, b.team, 'люди — в разных командах');
  g.removePlayer(b.id);
  assert.equal(pbBots(g), 7, 'остался один — боты вернулись');
  g.removePlayer(a.id);
  assert.equal(g.players.size, 0, 'пустая комната — и ботов в ней нет');
});

test('пейнтбол: бой уже идёт — боты доигрывают раунд, в новой разминке их нет; во время боя остался один — боты сразу назад', () => {
  const g = new Game();
  pbHuman(g, 'Один', 1);
  untilPhase(g, PHASE_PLAY);
  const b = pbHuman(g, 'Второй', 2);
  assert.equal(pbBots(g), 7, 'раунд идёт — боты на месте');
  g.phaseEnd = g.tick + 1;
  g.step();
  assert.equal(g.phase, PHASE_END);
  assert.equal(pbBots(g), 7, 'итоги раунда — боты ещё в таблице');
  g.phaseEnd = g.tick + 1;
  g.step();
  assert.equal(g.phase, PHASE_WARMUP);
  assert.equal(pbBots(g), 0, 'новый раунд, людей двое — ботов нет');
  untilPhase(g, PHASE_PLAY);
  assert.equal(pbBots(g), 0);
  g.removePlayer(b.id);
  assert.equal(pbBots(g), 7, 'один остался посреди боя — боты сразу вернулись, не пустая площадка');
});

test('пейнтбол через хаб: один зашёл — боты; второй зашёл в разминку — ботов нет; второй вышел — боты вернулись', () => {
  const { hub } = setupHub();
  const [a, b] = [login(hub, 'PbOne'), login(hub, 'PbTwo')];
  const game = hub.paintball.game;
  assert.ok(hub.move(a.c, hub.paintball, true));
  steps(hub, 30);
  assert.equal(pbBots(game), 7);
  assert.ok(hub.move(b.c, hub.paintball, true));
  steps(hub, 30);
  assert.equal(game.phase, PHASE_WARMUP, 'разминка ещё идёт');
  assert.equal(pbBots(game), 0);
  assert.equal(game.players.size, 2);
  assert.ok(hub.move(b.c, hub.lobby, true));
  assert.equal(pbBots(game), 7);
  assert.ok(hub.move(a.c, hub.lobby, true));
  assert.equal(game.players.size, 0, 'в пустой комнате ботов нет');
});

test('пейнтбол: /bots вдвоём ничего не меняет и говорит почему, в одиночку работает', () => {
  const g = new Game();
  const sink = fakeSink();
  const a = g.addHuman({ pid: 1, nick: 'Один', outfit: DEFAULT_OUTFIT }, sink)!;
  const b = pbHuman(g, 'Второй', 2);
  g.command(a, '/bots 3');
  assert.equal(pbBots(g), 0);
  assert.equal(g.botsPerTeam, 4, 'число не запоминается');
  assert.ok(sink.msgs.some((m) => m.t === 'chat' && m.text.includes('один человек')), 'игроку сказали, почему');
  g.removePlayer(b.id);
  g.command(a, '/bots 2');
  assert.equal(pbBots(g), 3, 'до двух в команде: рядом с человеком один, напротив два');
  g.command(a, '/bots 0');
  assert.equal(pbBots(g), 0);
});

// ---------------------------------------------------------------- Fight Club

function fcGame(mode: FcMode, fighters: number, spectators = 0): FightGame {
  const g = new FightGame(mode, { result() {}, over() {} }, { rng: makeRng(5) });
  for (let i = 0; i < fighters + spectators; i++) g.addHuman({ pid: 100 + i, nick: `Боец${i}`, outfit: { ...DEFAULT_OUTFIT } }, fakeSink(), i < fighters);
  g.start();
  return g;
}

const fcBots = (g: FightGame): number => [...g.players.values()].filter((p) => p.bot).length;

test('Fight Club: боец-человек один — боты добирают бойцов; двое и больше — без ботов', () => {
  for (const [mode, humans, bots] of [
    ['duel', 1, 1], ['team', 1, 3], ['ffa', 1, 3],
    ['duel', 2, 0], ['team', 2, 0], ['team', 4, 0], ['ffa', 2, 0], ['ffa', FC_FIGHTERS.ffa, 0],
  ] as const) {
    const g = fcGame(mode, humans);
    assert.equal(fcBots(g), bots, `${mode}, людей ${humans}`);
    assert.equal(g.fighters, humans + bots);
  }
});

test('Fight Club через набережную: один в круге — внизу бот; двое — только они', () => {
  for (const [n, bots] of [[1, 1], [2, 0]] as const) {
    const { hub } = setupHub({ fight: true });
    const who = Array.from({ length: n }, (_, i) => login(hub, `Fc${n}x${i}`));
    who.forEach((w, i) => placeAt(hub, w.c, FC_CIRCLE.x + i * 0.6, FC_CIRCLE.z));
    steps(hub, FC_COUNT_TICKS + 2 * FC_CHECK_EVERY);
    const g = hub.fight!.game;
    assert.ok(g && g.started, `${n} в круге — бой начался`);
    assert.equal(fcBots(g), bots, `${n} в круге — ботов ${bots}`);
    assert.equal(g.fighters, n + bots);
    assert.ok(who.every((w) => w.c.room === hub.fight));
  }
});

test('Fight Club: зрители в счёт не идут — один боец среди зрителей всё равно с ботом', () => {
  const g = fcGame('duel', 1, 2);
  assert.equal(g.humans, 3);
  assert.equal(g.humanFighters, 1);
  assert.equal(fcBots(g), 1);
  assert.equal(g.fighters, 2);
});

test('Fight Club: картон и подсказка у круга говорят про ботов правду', () => {
  const st = (names: string[]) => ({ phase: 'count' as const, mode: 'duel' as const, left: 9, names, host: names[0], round: 0, score: [] });
  assert.ok(boardLines(st(['Один']))[2].includes('с ботами'));
  assert.ok(boardLines(st(['Один', 'Второй']))[2].includes('без ботов'));
  assert.ok(boardLines({ ...st([]), phase: 'idle' })[2].includes(BOTS_RULE));
  assert.ok(fightHint(st(['Один']), 'Один', 0)!.text.includes('с ботами'));
  assert.ok(fightHint(st(['Один', 'Второй']), 'Один', 0)!.text.includes('без ботов'));
  // зрителям места в ринге не хватило: бойцов-людей по-прежнему двое
  assert.ok(boardLines({ ...st(['A', 'B', 'C']) })[2].includes('без ботов'));
});
