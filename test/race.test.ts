// Гонка: боты одни на трассе (только физика); сервер гонки — решётка, итоги и жетоны, ящики, варенье, краска,
// толчки, уход людей, снимки.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '../server/hub.ts';
import { KartBot, type BotView, type KartSkill } from '../server/race/bot.ts';
import { Race, type Kart, type RaceOptions } from '../server/race/race.ts';
import { RaceRoom } from '../server/race/room.ts';
import { normalizeProfile } from '../server/store.ts';
import type { RcReward } from '../shared/economy.ts';
import {
  ITEM_JAM,
  ITEM_PAINT,
  ITEM_TURBO,
  KART_R,
  PAINT_TICKS,
  RC_GRID,
  RC_GRID_TICKS,
  RC_LAPS,
  RC_RACE,
  RC_RESULTS,
  SLOW_TICKS,
  SPIN_TICKS,
  makeKartEvents,
  makeKartState,
  placeOnGrid,
  stepKart,
  type KartState,
} from '../shared/kart.ts';
import { decodeKartSnapshot, makeKartHeader } from '../shared/kartnet.ts';
import { buildRing } from '../shared/maps/ring.ts';
import type { RaceEvent, RaceResultRow, ServerMsg } from '../shared/messages.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { SNAP_SELF_RESET } from '../shared/protocol.ts';
import { BTN_FIRE, BTN_FORWARD, BTN_RELOAD, makeInput } from '../shared/sim.ts';
import { locate, locateAny, makeLoc, wrapSeg } from '../shared/track.ts';
import { fakeSink, type FakeSink } from './kit.ts';

const { track: tr } = buildRing();
/** Южная прямая: z, на котором стоит решётка; линия старта — x = −60, дальше на восток */
const Z = tr.pz[0];

/**
 * Боты сами по себе (без толчков): времена кругов каждого после первого, удары о помехи и закрутки; падение в воду — ошибка.
 * Каждый бот — со своим временем гонки rt, как в настоящей гонке.
 */
function soloLaps(skills: KartSkill[], maxTicks: number): { karts: KartState[]; laps: number[][]; hits: number[]; spins: number[] } {
  const view: BotView = { racing: true, place: 2, karts: skills.length, behind: Infinity, ahead: Infinity, painted: false, gridLeft: 0, near: Infinity, bubble: false };
  const karts = skills.map((_, slot) => {
    const k = makeKartState();
    placeOnGrid(k, tr, slot);
    return k;
  });
  const bots = skills.map((s, i) => new KartBot(tr, s, 100 + i));
  const inp = makeInput();
  const ev = makeKartEvents();
  const laps: number[][] = karts.map(() => []);
  const last = karts.map(() => 0);
  const hits = karts.map(() => 0);
  const spins = karts.map(() => 0);
  for (let t = 0; t < maxTicks && karts.some((k) => !k.done); t++) {
    karts.forEach((k, i) => {
      bots[i].update(k, view, t, inp);
      const spin = k.spinT;
      stepKart(k, inp, tr, ev, true);
      assert.ok(!ev.splash, `бот ${i} упал в воду на тике ${t}`);
      if (ev.hit > 0) hits[i]++;
      if (k.spinT > spin) spins[i]++;
      if (ev.lap) {
        if (k.lap > 1) laps[i].push((t - last[i]) / 60);
        last[i] = t;
      }
    });
  }
  return { karts, laps, hits, spins };
}

test('четыре бота (normal) одни на трассе: три круга за 4 минуты (с помехами), без падений в воду', () => {
  const { karts, laps, hits, spins } = soloLaps(['normal', 'normal', 'normal', 'normal'], 4 * 60 * 60);
  karts.forEach((k, i) => {
    assert.equal(k.done, 1, `бот ${i} не доехал`);
    assert.equal(spins[i], 0, `бот ${i}: попал под движущуюся помеху ${spins[i]} раз`);
    assert.ok(hits[i] <= 12, `бот ${i}: ${hits[i]} тиков с ударами о бочки и блоки за три круга`);
    assert.equal(laps[i].length, RC_LAPS, `бот ${i}: кругов ${laps[i].length}`);
    for (const s of laps[i]) assert.ok(s > 55 && s < 75, `бот ${i}: круг ${s} с`);
    assert.ok(laps[i].reduce((a, b) => a + b, 0) < 225, `бот ${i}: три круга дольше 225 с`);
  });
});

test('сильный бот быстрее обычного, обычный быстрее лёгкого', () => {
  const { laps } = soloLaps(['easy', 'normal', 'hard'], 4 * 60 * 60);
  const best = laps.map((l) => Math.min(...l));
  assert.ok(best[0] > best[1] + 1 && best[1] > best[2] + 1, `круги ${best.join(' / ')}`);
});

test('бот: турбо — на прямой, краску лидером не бросает, на решётке ничего не жмёт, застрял — R', () => {
  const bot = new KartBot(tr, 'normal', 5);
  const inp = makeInput();
  const view: BotView = { racing: true, place: 1, karts: 4, behind: Infinity, ahead: Infinity, painted: false, gridLeft: 0, near: Infinity, bubble: false };
  const k = makeKartState();
  placeOnGrid(k, tr, 0);
  k.vx = 15;
  k.item = ITEM_TURBO;
  assert.ok(bot.update(k, view, 0, inp).buttons & BTN_FIRE, 'турбо на прямой');
  assert.equal(bot.update(k, view, 1, inp).buttons & BTN_FIRE, 0, 'кнопку надо отпустить');

  k.item = ITEM_PAINT;
  const fired = (from: number, ticks: number): boolean => {
    for (let t = from; t < from + ticks; t++) if (bot.update(k, view, t, inp).buttons & BTN_FIRE) return true;
    return false;
  };
  assert.equal(fired(10, 200), false, 'лидер бросил краску');
  view.place = 3;
  assert.equal(fired(210, 130), true, 'не первый — бросает за 1–2 с');

  k.item = 0;
  k.vx = 0;
  view.racing = false;
  for (let t = 400; t < 700; t++) assert.equal(bot.update(k, view, t, inp).buttons & (BTN_FIRE | BTN_RELOAD), 0);
  view.racing = true;
  let r = -1;
  for (let t = 700; t < 900 && r < 0; t++) if (bot.update(k, view, t, inp).buttons & BTN_RELOAD) r = t;
  assert.ok(r >= 819 && r <= 821, `R на тике ${r}`);
});

// ---------------------------------------------------------------- сервер гонки

interface Log {
  results: Array<{ k: Kart; row: RaceResultRow; reward: RcReward | null }>;
  over: number;
  chat: string[];
}

function newRace(opts: RaceOptions = {}): { race: Race; log: Log } {
  const log: Log = { results: [], over: 0, chat: [] };
  const race = new Race(
    {
      result: (k, row, reward) => log.results.push({ k, row, reward }),
      over: () => log.over++,
      announce: (t) => log.chat.push(t),
    },
    { seed: 1, ...opts },
  );
  return { race, log };
}

let seq = 0;
function human(race: Race, nick: string): { k: Kart; s: FakeSink } {
  const s = fakeSink();
  const k = race.addHuman({ pid: 10 + race.karts.size, nick, outfit: DEFAULT_OUTFIT }, s);
  assert.ok(k);
  return { k, s };
}

function send(race: Race, k: Kart, buttons: number): void {
  const inp = makeInput();
  inp.seq = ++seq;
  inp.buttons = buttons;
  race.onInputs(k, [inp], 1);
}

/** Поставить карт в точку трассы: стоит, курс по дороге */
function put(race: Race, k: Kart, x: number, z: number, speed = 0): void {
  const tr = race.track;
  const s = k.state;
  const loc = locateAny(tr, x, z, makeLoc());
  s.x = x;
  s.z = z;
  s.y = loc.ground;
  s.seg = loc.seg;
  s.hx = tr.tx[loc.seg];
  s.hz = tr.tz[loc.seg];
  s.vx = s.hx * speed;
  s.vz = s.hz * speed;
  s.ghostT = 0;
}

function toRace(race: Race): void {
  race.start();
  while (race.phase === RC_GRID) race.step();
}

function events(s: FakeSink): RaceEvent[] {
  return s.msgs.flatMap((m: ServerMsg) => (m.t === 'rev' ? m.e : []));
}

test('решётка: человек первым, три бота за ним; пока идёт отсчёт, никто не двигается', () => {
  const { race } = newRace();
  const { k, s } = human(race, 'Вася');
  assert.equal(s.msgs[0].t, 'race');
  race.start();
  assert.equal(race.karts.size, 4);
  assert.equal(k.slot, 0);
  assert.deepEqual([...race.karts.values()].map((q) => q.isBot), [false, true, true, true]);
  const pos = [...race.karts.values()].map((q) => [q.state.x, q.state.z]);
  // газ — только на «1» (последние 0,6 с отсчёта): ракетный старт
  for (let i = 0; i < RC_GRID_TICKS - 1; i++) {
    send(race, k, i >= RC_GRID_TICKS - 40 ? BTN_FORWARD : 0);
    race.step();
  }
  assert.equal(race.phase, RC_GRID);
  assert.deepEqual([...race.karts.values()].map((q) => [q.state.x, q.state.z]), pos);
  for (let i = 0; i < 60; i++) {
    send(race, k, BTN_FORWARD);
    race.step();
  }
  assert.equal(race.phase, RC_RACE);
  assert.ok(k.state.x > pos[0][0] + 5);
  assert.ok(k.state.boostT > 0, 'ракетный старт: ускорение ещё идёт');
  assert.ok(s.msgs.some((m) => m.t === 'rroster' && m.karts.length === 4));
});

test('человек без ввода: боты доезжают, через 30 с итоги, человек «не доехал» — без жетонов', () => {
  const { race, log } = newRace();
  const { s } = human(race, 'Соня');
  race.start();
  let lastBotFinish = 0;
  while (!race.closed && race.tick < 40000) {
    race.step();
    if ([...race.karts.values()].some((q) => q.isBot && q.finishTick === race.tick)) lastBotFinish = race.tick;
  }
  assert.equal(log.over, 1);
  assert.equal(race.tick, lastBotFinish + 1800 + 600, 'итоги через 30 с после последнего бота, ещё 10 с — показ');
  assert.equal(log.results.length, 1);
  assert.equal(log.results[0].reward, null);
  assert.equal(log.results[0].row.place, 0);
  const end = s.msgs.find((m) => m.t === 'raceEnd');
  assert.ok(end && end.t === 'raceEnd');
  assert.deepEqual(end.results.map((r) => r.place), [1, 2, 3, 0]);
  assert.ok(end.results.slice(0, 3).every((r) => r.bot && r.time > 0 && r.best > 0));
  assert.ok(!s.msgs.some((m) => m.t === 'raceReward'));
  assert.match(log.chat[0], /^🏁 Гонка: 1\. .+ \(бот\), 2\. /);
});

test('человек на автопилоте финиширует первым: жетоны по месту, время и лучший круг', () => {
  const { race, log } = newRace({ botSkill: 'easy' });
  const { k, s } = human(race, 'Петя');
  race.start();
  const pilot = new KartBot(race.track, 'hard', 9);
  const view: BotView = { racing: false, place: 1, karts: 4, behind: Infinity, ahead: Infinity, painted: false, gridLeft: 0, near: Infinity, bubble: false };
  while (!race.closed && race.tick < 40000) {
    view.racing = race.phase === RC_RACE;
    view.place = k.place || 1;
    const inp = pilot.update(k.state, view, race.tick, makeInput());
    inp.seq = ++seq;
    race.onInputs(k, [inp], 1);
    race.step();
  }
  assert.equal(log.results.length, 1);
  const { row, reward } = log.results[0];
  assert.equal(row.place, 1);
  assert.deepEqual(reward, { total: 55, finish: 15, place: 40, pos: 1 });
  assert.ok(row.time > 150_000 && row.time < 200_000, `время ${row.time}`);
  assert.ok(row.best > 50_000 && row.best < 66_000, `лучший круг ${row.best}`);
  assert.equal(row.tokens, 55);
  assert.ok(s.msgs.some((m) => m.t === 'raceReward' && m.total === 55));
  assert.ok(events(s).some((e) => e[0] === 'finish' && e[1] === k.id && e[2] === 1));
});

test('ящик: проезд — бонус, ящик пропадает на 4 с, второй карт его не берёт', () => {
  const { race } = newRace({ minKarts: 2, roll: () => 0 });
  const { k: a, s } = human(race, 'Аня');
  const { k: b } = human(race, 'Боря');
  toRace(race);
  const cr = race.track.crates[0];
  put(race, b, -70, Z);
  put(race, a, cr.x, cr.z);
  race.step();
  // шансы по месту: лидеру турбо не выпадает, первым в его пуле идёт варенье
  assert.equal(a.place, 1);
  assert.equal(a.state.item, ITEM_JAM);
  assert.ok(a.state.itemT > 0);
  assert.ok(race.crateBack[0] > 0);
  put(race, a, -50, Z);
  put(race, b, cr.x, cr.z);
  const gone = race.tick;
  while (b.state.item === 0 && race.tick < gone + 400) race.step();
  assert.equal(race.tick - gone, 240, 'ящик вернулся через 4 с');
  race.step();
  assert.ok(events(s).some((e) => e[0] === 'crate' && e[1] === 0 && e[2] === a.id));
});

test('варенье: банка ложится позади, своя первую секунду не трогает, чужой карт буксует', () => {
  const { race } = newRace({ minKarts: 2 });
  const { k: a, s } = human(race, 'Аня');
  const { k: b } = human(race, 'Боря');
  toRace(race);
  put(race, b, -90, Z);
  put(race, a, -50, Z);
  a.state.item = ITEM_JAM;
  send(race, a, BTN_FIRE);
  race.step();
  assert.equal(a.state.item, 0);
  assert.equal(race.traps.length, 1);
  const t = race.traps[0];
  assert.ok(Math.abs(t.x + 52.4) < 1e-9 && Math.abs(t.z - Z) < 1e-9, `банка в ${t.x}, ${t.z}`);
  put(race, a, t.x, t.z);
  race.step();
  assert.equal(a.state.slowT, 0);
  assert.equal(race.traps.length, 1);
  put(race, a, -30, Z);
  put(race, b, t.x, t.z);
  race.step();
  assert.equal(b.state.slowT, SLOW_TICKS);
  assert.equal(b.state.spinT, SPIN_TICKS);
  assert.equal(race.traps.length, 0);
  race.step();
  assert.ok(events(s).some((e) => e[0] === 'jam' && e[1] === t.id && e[2] === b.id));
});

test('краска: второй бросает в первого, первому бросить не в кого', () => {
  const { race } = newRace({ minKarts: 2 });
  const { k: a, s } = human(race, 'Аня');
  const { k: b } = human(race, 'Боря');
  toRace(race);
  put(race, a, -50, Z);
  put(race, b, -70, Z);
  race.step();
  assert.deepEqual([a.place, b.place], [1, 2]);
  b.state.item = ITEM_PAINT;
  send(race, b, BTN_FIRE);
  race.step();
  assert.equal(a.paintT, PAINT_TICKS);
  a.state.item = ITEM_PAINT;
  send(race, a, BTN_FIRE);
  race.step();
  race.step();
  assert.equal(b.paintT, 0);
  const ev = events(s);
  assert.ok(ev.some((e) => e[0] === 'paint' && e[1] === b.id && e[2] === a.id));
  assert.ok(ev.some((e) => e[0] === 'paint' && e[1] === a.id && e[2] === 0));
});

test('толчок: два карта навстречу — разъехались, оба в коридоре, событие удара', () => {
  const { race } = newRace({ minKarts: 2 });
  const { k: a, s } = human(race, 'Аня');
  const { k: b } = human(race, 'Боря');
  toRace(race);
  put(race, a, -80, Z - 0.5, 10);
  put(race, b, -76, Z, 10);
  b.state.hx = -1;
  b.state.hz = 0;
  b.state.vx = -10;
  for (let i = 0; i < 30; i++) race.step();
  const d = Math.hypot(a.state.x - b.state.x, a.state.z - b.state.z);
  assert.ok(d >= 2 * KART_R - 1e-6, `расстояние ${d}`);
  assert.ok(a.state.x < b.state.x, 'проехали друг сквозь друга');
  const loc = makeLoc();
  for (const q of [a, b]) {
    locate(race.track, q.state.x, q.state.z, q.state.seg, loc);
    assert.ok(Math.abs(loc.lat) <= loc.hw - KART_R + 1e-9);
  }
  assert.ok(events(s).some((e) => e[0] === 'bump' && e[1] > 3));
});

test('удар о бочку: событие hit уходит всем (кто, сила, где), закрутки нет; мимо бочки — тишина', () => {
  const { race } = newRace({ minKarts: 2 });
  const { k: a, s: sa } = human(race, 'Аня');
  const { k: b, s: sb } = human(race, 'Боря');
  toRace(race);
  const barrel = race.track.hz.solids[0];
  const g = race.track.legs[0];
  // Аня — на бочку (лат 5,2 на южной прямой), Боря — по другому краю дороги, без помех
  put(race, a, barrel.ax - 9, barrel.az, 20);
  put(race, b, g.x + g.dx * 40, g.z + g.dz * 40 - 2, 12);
  for (let i = 0; i < 40; i++) {
    send(race, a, BTN_FORWARD);
    send(race, b, BTN_FORWARD);
    race.step();
  }
  for (const s of [sa, sb]) {
    const hits = events(s).filter((e) => e[0] === 'hit');
    assert.ok(hits.length > 0, 'удар не передан');
    for (const e of hits) {
      assert.equal(e[1], a.id, 'бьётся только Аня');
      assert.ok(e[2] > 3 && e[2] < 25, `сила ${e[2]}`);
      assert.ok(Math.abs(e[3] - barrel.ax) < 4 && Math.abs(e[4] - barrel.az) < 4, 'удар у бочки');
    }
  }
  assert.equal(a.state.spinT, 0);
});

test('последний человек ушёл посреди гонки — комната свободна, итогов нет; после старта новых не берут', () => {
  const calls = { result: 0, over: 0 };
  const room = new RaceRoom(
    { outfitOf: () => DEFAULT_OUTFIT, result: () => calls.result++, over: () => calls.over++, announce: () => {} },
    { seed: 3 },
  );
  assert.ok(room.idle);
  const c1 = new Client(1, fakeSink(), '10.0.0.1');
  c1.profile = normalizeProfile({ id: 7, nick: 'Кот', keyHashes: ['aa'] });
  const c2 = new Client(2, fakeSink(), '10.0.0.2');
  c2.profile = normalizeProfile({ id: 8, nick: 'Пёс', keyHashes: ['bb'] });
  room.open();
  assert.ok(!room.idle);
  assert.ok(room.join(c1));
  room.launch();
  assert.equal(room.join(c2), false, 'после старта не берут');
  for (let i = 0; i < 400; i++) room.step();
  assert.equal(room.humans, 1);
  room.leave(c1);
  assert.ok(room.idle);
  room.step();
  assert.deepEqual(calls, { result: 0, over: 0 });
});

/** Последний круг, последняя КТ, разгон в 6 отрезках до линии — через несколько тиков карт финиширует. */
function toLine(race: Race, k: Kart): void {
  const tr = race.track;
  k.state.lap = RC_LAPS;
  k.state.cp = tr.cpSeg.length - 1;
  const j = wrapSeg(tr, tr.cpSeg[0] - 6);
  put(race, k, tr.px[j], tr.pz[j], 15);
}

function driveUntil(race: Race, k: Kart, done: () => boolean): void {
  for (let i = 0; i < 120 && !done(); i++) {
    send(race, k, BTN_FORWARD);
    race.step();
  }
  assert.ok(done());
}

test('доехал и ушёл, не дождавшись итогов: жетоны сразу, место за ним, второй остаётся вторым', () => {
  const calls: Array<{ c: Client; row: RaceResultRow; reward: RcReward | null }> = [];
  const chat: string[] = [];
  const room = new RaceRoom(
    { outfitOf: () => DEFAULT_OUTFIT, result: (c, row, reward) => calls.push({ c, row, reward }), over: () => {}, announce: (t) => chat.push(t) },
    { seed: 3, minKarts: 2 },
  );
  const sa = fakeSink();
  const ca = new Client(1, sa, '10.0.0.1');
  ca.profile = normalizeProfile({ id: 7, nick: 'Аня', keyHashes: ['aa'] });
  const sb = fakeSink();
  const cb = new Client(2, sb, '10.0.0.2');
  cb.profile = normalizeProfile({ id: 8, nick: 'Боря', keyHashes: ['bb'] });
  room.open();
  assert.ok(room.join(ca) && room.join(cb));
  room.launch();
  const race = room.race!;
  while (race.phase === RC_GRID) race.step();
  const a = room.kartOf(ca)!;
  const b = room.kartOf(cb)!;
  const tr = race.track;
  // Боря подальше от линии — чтобы не толкались
  put(race, b, tr.px[tr.cpSeg[3]], tr.pz[tr.cpSeg[3]]);
  toLine(race, a);
  driveUntil(race, a, () => a.finishPlace > 0);
  assert.equal(a.finishPlace, 1);

  room.leave(ca);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].c, ca);
  assert.equal(calls[0].row.place, 1);
  assert.deepEqual(calls[0].reward, { total: 55, finish: 15, place: 40, pos: 1 });
  assert.ok(sa.msgs.some((m) => m.t === 'raceReward' && m.total === 55));
  assert.ok(sa.msgs.some((m) => m.t === 'toast' && m.text.includes('1-е место · +55')));
  assert.equal(room.humans, 1);
  assert.ok(!room.idle, 'гонка идёт дальше');
  assert.deepEqual(room.status()?.names, ['Боря']);
  const sent = sa.msgs.length;

  toLine(race, b);
  driveUntil(race, b, () => race.phase === RC_RESULTS);
  assert.equal(calls.length, 2, 'ушедшему второй раз не начисляют');
  assert.equal(calls[1].c, cb);
  assert.deepEqual(calls[1].reward, { total: 40, finish: 15, place: 25, pos: 2 });
  const end = sb.msgs.find((m) => m.t === 'raceEnd');
  assert.ok(end && end.t === 'raceEnd');
  assert.deepEqual(end.results.map((r) => [r.nick, r.place, r.tokens]), [['Аня', 1, 55], ['Боря', 2, 40]]);
  assert.equal(sa.msgs.length, sent, 'ушедшему гонка больше ничего не шлёт');
  assert.equal(chat[0], '🏁 Гонка: 1. Аня, 2. Боря');
});

test('снимок гонки — раз в 2 тика, первый со сбросом своего состояния', () => {
  const { race } = newRace({ minKarts: 2 });
  const { s } = human(race, 'Аня');
  race.start();
  for (let i = 0; i < 10; i++) race.step();
  assert.equal(s.bins.length, 5);
  const h = makeKartHeader();
  const self = makeKartState();
  const counts = decodeKartSnapshot(s.bins[0].slice().buffer, h, self, [], []);
  assert.deepEqual(counts, { karts: 2, traps: 0 });
  assert.ok(h.flags & SNAP_SELF_RESET);
  assert.equal(h.phase, RC_GRID);
  assert.equal(h.crates, 2 ** tr.crates.length - 1, 'ящики — битовая маска, все на месте');
  decodeKartSnapshot(s.bins[1].slice().buffer, h, self, [], []);
  assert.equal(h.flags & SNAP_SELF_RESET, 0);
});

test('ввод человека: короткий лаг (12 тиков без пакетов) — без лишних шагов сервера, потом по одному входу в тик', () => {
  const { race } = newRace({ minKarts: 1 });
  const { k } = human(race, 'Lag');
  toRace(race);
  // запас в очереди, как держит клиент
  for (let i = 0; i < 3; i++) send(race, k, BTN_FORWARD);
  for (let t = 0; t < 30; t++) {
    send(race, k, BTN_FORWARD);
    race.step();
  }
  const rt0 = k.state.rt;
  const ack0 = k.inq.ack;
  // 12 тиков пакеты не приходят: запас тратится, потом карт ждёт, а не едет «по последнему вводу»
  for (let t = 0; t < 12; t++) race.step();
  assert.equal(k.state.rt - rt0, k.inq.ack - ack0, 'шагов столько же, сколько применено входов');
  // пачка опоздавших входов: тратятся по одному в тик (очередь не больше RC_CATCH_UP — без двойных шагов)
  for (let i = 0; i < 12; i++) send(race, k, BTN_FORWARD);
  let doubles = 0;
  for (let t = 0; t < 12; t++) {
    const a = k.inq.ack;
    race.step();
    if (k.inq.ack - a > 1) doubles++;
  }
  assert.equal(k.state.rt - rt0, k.inq.ack - ack0, 'ни одного шага без входа');
  assert.ok(doubles <= 4, `двойных шагов мало: ${doubles}`);
});
