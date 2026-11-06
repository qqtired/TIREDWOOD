// Динамика картинга 07.11: затяжка за соперником (заряд → рывок), соло-старт с конца решётки, соло-пак ботов.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KartBot, type BotView } from '../server/race/bot.ts';
import { Race, type Kart } from '../server/race/race.ts';
import { BOOST_MT2, KART_MAX_SPEED, RC_GRID, makeKartEvents, makeKartState, placeOnGrid, stepKart } from '../shared/kart.ts';
import { DRAFT_FULL, DRAFT_TICKS, canTow, inTow } from '../shared/kartdraft.ts';
import type { RaceEvent } from '../shared/messages.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { BTN_FORWARD, makeInput } from '../shared/sim.ts';
import { locateAny, makeLoc } from '../shared/track.ts';
import { fakeSink, type FakeSink } from './kit.ts';

/** Карт на прямой «Серпантина» (на запад, x убывает) со скоростью v */
function put(race: Race, k: Kart, x: number, v: number): void {
  const tr = race.track;
  const lc = locateAny(tr, x, 205, makeLoc());
  Object.assign(k.state, {
    x, z: 205, y: lc.ground, seg: lc.seg, grounded: 1, hx: tr.tx[lc.seg], hz: tr.tz[lc.seg], vx: tr.tx[lc.seg] * v, vy: 0,
    vz: tr.tz[lc.seg] * v, ghostT: 0, prevButtons: 0,
  });
}

function revs(s: FakeSink): RaceEvent[] {
  return s.msgs.flatMap((m) => (m.t === 'rev' ? m.e : []));
}

test('след: соперник впереди по курсу и близко к оси — да; сбоку, далеко, стоит или на другой высоте — нет', () => {
  const a = makeKartState();
  Object.assign(a, { x: 0, z: 0, hx: 0, hz: -1, vx: 0, vz: -30 });
  const b = makeKartState();
  const at = (x: number, z: number, v = 30, y = 0) => {
    Object.assign(b, { x, z, y, hx: 0, hz: -1, vx: 0, vz: -v });
    return inTow(a, b);
  };
  assert.equal(at(0, -8), true, '8 м впереди');
  assert.equal(at(1.2, -4), true, 'чуть вбок');
  assert.equal(at(2.4, -15), true, 'след шире к концу');
  assert.equal(at(3, -8), false, 'соседняя полоса');
  assert.equal(at(0, -20), false, 'далеко');
  assert.equal(at(0, -1), false, 'вплотную — это толчок');
  assert.equal(at(0, 8), false, 'позади');
  assert.equal(at(0, -8, 5), false, 'соперник почти стоит');
  assert.equal(at(0, -8, 30, 3), false, 'на другой высоте (прыжок)');
  assert.equal(canTow(a), true);
  a.vz = -12;
  assert.equal(canTow(a), false, 'сам медленно — заряда нет');
});

test('затяжка в гонке: за соперником заряд по ступеням, через 0,9 с — рывок мини-турбо 2; лидеру — ничего; выпал — сброс', () => {
  const race = new Race({}, { track: 'hills', seed: 3, minKarts: 2 });
  const sinks = [fakeSink(), fakeSink()];
  const [lead, chase] = sinks.map((s, i) => race.addHuman({ pid: 900 + i, nick: `Tester${i + 7}`, outfit: DEFAULT_OUTFIT }, s)!);
  race.start();
  while (race.phase === RC_GRID) race.step();
  put(race, lead, 40, 30);
  put(race, chase, 49, 30);
  const inp = makeInput();
  let seq = 0;
  let boosted = -1;
  for (let t = 0; t < DRAFT_FULL + 6; t++) {
    inp.buttons = BTN_FORWARD;
    inp.seq = ++seq;
    race.onInputs(lead, [inp], 1);
    race.onInputs(chase, [{ ...inp }], 1);
    race.step();
    if (boosted < 0 && chase.state.boostT > 0) boosted = t;
  }
  const ev = revs(sinks[1]);
  const steps = ev.filter((e) => e[0] === 'tow' && e[1] === chase.id).map((e) => e[2]);
  assert.deepEqual(steps.slice(0, 3), [1, 2, 3], `ступени ${steps.join(',')}`);
  assert.ok(ev.some((e) => e[0] === 'draft' && e[1] === chase.id), 'рывок');
  assert.ok(!ev.some((e) => (e[0] === 'draft' || e[0] === 'tow') && e[1] === lead.id), 'лидера никто не тянет');
  assert.ok(boosted >= DRAFT_FULL - 2 && boosted <= DRAFT_FULL + 1, `рывок на тике ${boosted}`);
  assert.equal(chase.state.boostLvl, BOOST_MT2);
  assert.ok(chase.state.boostT > DRAFT_TICKS - 10, 'рывок держится');
  // ушёл в соседнюю полосу — заряд сбрасывается (ступень 0)
  put(race, chase, 49, 30);
  chase.state.z = 205 - 5;
  for (let t = 0; t < 30; t++) {
    inp.seq = ++seq;
    race.onInputs(lead, [inp], 1);
    race.onInputs(chase, [{ ...inp }], 1);
    race.step();
  }
  assert.equal(chase.towT, 0);
});

test('соло: человек стартует последним — боты впереди; вдвоём ботов нет и порядок решётки по входу', () => {
  const race = new Race({}, { track: 'harbor', seed: 5 });
  const me = race.addHuman({ pid: 1, nick: 'Tester7', outfit: DEFAULT_OUTFIT }, fakeSink())!;
  race.start();
  const tr = race.track;
  const bots = [...race.karts.values()].filter((k) => k.isBot);
  assert.equal(bots.length, 3);
  const last = tr.grid[3];
  assert.deepEqual([me.state.x, me.state.z], [last.x, last.z], 'человек на последнем месте решётки');
  bots.forEach((b, i) => assert.deepEqual([b.state.x, b.state.z], [tr.grid[i].x, tr.grid[i].z]));

  const duo = new Race({}, { track: 'harbor', seed: 5 });
  const a = duo.addHuman({ pid: 1, nick: 'Tester7', outfit: DEFAULT_OUTFIT }, fakeSink())!;
  const b = duo.addHuman({ pid: 2, nick: 'Tester8', outfit: DEFAULT_OUTFIT }, fakeSink())!;
  duo.start();
  assert.equal(duo.karts.size, 2);
  assert.deepEqual([a.state.x, b.state.x], [duo.track.grid[0].x, duo.track.grid[1].x]);
});

test('соло-пак: отставший бот разгоняется до полной скорости, ушедший далеко вперёд — сбрасывает', () => {
  const race = new Race({}, { track: 'hills' });
  const tr = race.track;
  // разгон по стартовой прямой «Серпантина» 6 с: лёгкий бот сам по себе, отставший на 150 м, ушедший на 200 м
  const top = (lead: number): number => {
    const bot = new KartBot(tr, 'easy', 11);
    const k = makeKartState();
    placeOnGrid(k, tr, 0);
    const ev = makeKartEvents();
    const inp = makeInput();
    const view: BotView = { racing: true, place: 2, karts: 4, ahead: Infinity, behind: Infinity, painted: false, gridLeft: 0, near: Infinity, bubble: false, lead };
    let v = 0;
    for (let t = 0; t < 360; t++) {
      bot.update(k, view, t, inp);
      stepKart(k, inp, tr, ev, true);
      v = Math.max(v, k.vx * k.hx + k.vz * k.hz);
    }
    return v;
  };
  const base = top(0);
  const behind = top(-150);
  const ahead = top(200);
  assert.ok(base > 0.8 * KART_MAX_SPEED && base < 0.85 * KART_MAX_SPEED, `сам по себе ${base}`);
  assert.ok(behind > KART_MAX_SPEED - 0.5, `отстал — ${behind}`);
  assert.ok(ahead < base - 3, `ушёл вперёд — ${ahead}`);
});
