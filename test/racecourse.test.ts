// Трассы картинга: «Портовое кольцо» (harbor) и «Солнечный серпантин» (hills) — id, бюджеты сети, опора под дорогой,
// строгие КТ (и КТ после прыжка через её линию — P1), шлагбаумы, боты трёх уровней на обеих трассах, бонусы нового
// пула (пузырь, хлопок, краска) и полная гонка с итогами по id трассы.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Race, type Kart } from '../server/race/race.ts';
import { KartBot, type BotView } from '../server/race/bot.ts';
import { GATE_WARN, gatePhase, MV_GATE, collide, makeHit, makeCap, moverCap } from '../shared/hazards.ts';
import {
  BUBBLE_TICKS, ITEM_BUBBLE, ITEM_CLAP, ITEM_JAM, ITEM_PAINT, ITEM_TURBO, PAINT_TICKS, RC_GRID, makeKartState, makeKartEvents,
  placeOnGrid, respawn, stepKart,
} from '../shared/kart.ts';
import { decodeKartSnapshot, makeKartHeader, KM_BUBBLE, miscBoost, type KartSnap } from '../shared/kartnet.ts';
import { buildRing } from '../shared/maps/ring.ts';
import { landHas } from '../shared/maps/ringland.ts';
import { RACE_TRACKS, buildRaceCourse, isRaceTrackId, type RaceTrackId } from '../shared/racecourse.ts';
import { locateAny, makeLoc, NO_GROUND, wrapSeg, type Track } from '../shared/track.ts';
import { BTN_FIRE, BTN_RELOAD, makeInput } from '../shared/sim.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { fakeSink } from './kit.ts';

const IDS: RaceTrackId[] = ['harbor', 'hills'];

test('id трасс точные, по умолчанию — «Портовое кольцо»; обе трассы влезают в бюджеты сети', () => {
  assert.deepEqual(buildRaceCourse(), buildRing());
  assert.deepEqual(RACE_TRACKS.map((t) => t.id), IDS);
  assert.ok(isRaceTrackId('harbor') && isRaceTrackId('hills'));
  for (const v of ['2', 2, {}, null, 'port', 'foundry', 'HARBOR', 'hills ']) assert.equal(isRaceTrackId(v), false);
  for (const id of IDS) {
    const tr = buildRaceCourse(id).track;
    assert.ok(tr.length > 1000 && tr.length < 1300, `${id}: длина ${tr.length}`);
    assert.ok(tr.n < 65536 && tr.cpSeg.length < 256 && tr.crates.length <= 32);
    // позиции чужих картов — int16 по 1/128 м: всё в пределах ±255 м
    assert.ok([...tr.px, ...tr.pz].every((v) => Number.isFinite(v) && Math.abs(v) < 250), id);
    assert.ok([...tr.h].every((v) => Number.isFinite(v) && v > -5 && v < 30), id);
    assert.ok(tr.len.every((n) => n > 0 && n <= 2.01), id);
    assert.deepEqual(buildRaceCourse(id).track, tr, `${id}: сборка детерминирована`);
  }
});

test('решётка, ящики, КТ и сухая дорога — на опоре; возврат на КТ не попадает под помехи', () => {
  for (const id of IDS) {
    const { track: tr, land } = buildRaceCourse(id);
    for (let i = 0; i < tr.n; i++) {
      if (!tr.gap[i]) {
        const next = (i + 1) % tr.n;
        assert.ok(landHas(land, (tr.px[i] + tr.px[next]) / 2, (tr.pz[i] + tr.pz[next]) / 2), `${id}: отрезок ${i}`);
      }
    }
    for (const g of tr.grid) assert.notEqual(locateAny(tr, g.x, g.z, makeLoc()).ground, NO_GROUND);
    for (const cr of tr.crates) {
      const lc = locateAny(tr, cr.x, cr.z, makeLoc());
      assert.notEqual(lc.ground, NO_GROUND);
      assert.ok(Math.abs(lc.lat) < lc.hw - 0.75, `${id}: ящик у края`);
    }
    for (let cp = 0; cp < tr.cpSeg.length; cp++) {
      assert.equal(tr.gap[tr.cpSeg[cp]], 0, `${id}: КТ ${cp} над провалом`);
      const k = makeKartState();
      k.cp = cp;
      k.lap = 2;
      respawn(k, tr);
      assert.equal(k.lap, 2);
      assert.equal(k.cp, cp);
      assert.equal(k.grounded, 1);
      for (let rt = 0; rt < 600; rt += 15) {
        const body = { x: k.x, z: k.z, vx: 0, vz: 0 };
        collide(tr.hz, body, rt, 0.75, makeHit());
        assert.deepEqual([body.x, body.z], [k.x, k.z], `${id}: возврат на КТ ${cp}, тик ${rt}`);
      }
    }
  }
});

function crossing(track: Track, cp: number, forward: boolean) {
  const k = makeKartState();
  const ev = makeKartEvents();
  const input = makeInput();
  const seg = track.cpSeg[cp];
  const sign = forward ? 1 : -1;
  k.x = track.px[seg] - track.tx[seg] * 0.05 * sign;
  k.z = track.pz[seg] - track.tz[seg] * 0.05 * sign;
  k.y = track.h[seg];
  k.seg = seg;
  k.hx = track.tx[seg] * sign;
  k.hz = track.tz[seg] * sign;
  k.vx = k.hx * 10;
  k.vz = k.hz * 10;
  k.cp = (cp - 1 + track.cpSeg.length) % track.cpSeg.length;
  k.lap = 1;
  stepKart(k, input, track, ev, true);
  return { k, ev };
}

test('КТ — только вперёд и по порядку: задом не засчитываются, финиш в обход КТ не считается', () => {
  for (const id of IDS) {
    const tr = buildRaceCourse(id).track;
    for (let cp = 0; cp < tr.cpSeg.length; cp++) {
      assert.equal(crossing(tr, cp, true).ev.cp, true, `${id}: вперёд через КТ ${cp}`);
      assert.equal(crossing(tr, cp, false).ev.cp, false, `${id}: задом через КТ ${cp}`);
    }
    const k = makeKartState();
    const ev = makeKartEvents();
    const input = makeInput();
    k.x = tr.px[0] - tr.tx[0] * 0.05;
    k.z = tr.pz[0] - tr.tz[0] * 0.05;
    k.y = tr.h[0];
    k.seg = 0;
    k.hx = tr.tx[0];
    k.hz = tr.tz[0];
    k.vx = k.hx * 10;
    k.vz = k.hz * 10;
    k.cp = 1;
    k.lap = 2;
    stepKart(k, input, tr, ev, true);
    assert.equal(ev.lap, false);
    assert.equal(k.cp, 1);
    assert.equal(k.lap, 2);
    // телепорт за пропущенную КТ её не засчитывает
    const s2 = tr.cpSeg[2];
    Object.assign(k, { cp: 0, x: tr.px[s2], z: tr.pz[s2], y: tr.h[s2], seg: s2, vx: 0, vz: 0 });
    for (let i = 0; i < 10; i++) stepKart(k, input, tr, ev, true);
    assert.equal(k.cp, 0, `${id}: КТ за пропущенной не засчитана`);
  }
});

test('P1: подскок или прыжок через линию КТ — КТ засчитывается на приземлении', () => {
  for (const id of IDS) {
    const tr = buildRaceCourse(id).track;
    for (const cp of [1, 2, tr.cpSeg.length - 1]) {
      const seg = tr.cpSeg[cp];
      const back = wrapSeg(tr, seg - 2);
      const k = makeKartState();
      const ev = makeKartEvents();
      const input = makeInput();
      Object.assign(k, {
        x: tr.px[back], z: tr.pz[back], y: tr.h[back] + 0.5, vy: 3.5, grounded: 0, seg: back, hx: tr.tx[back], hz: tr.tz[back],
        cp: cp - 1, lap: 1,
      });
      k.vx = k.hx * 16;
      k.vz = k.hz * 16;
      let airCross = false;
      let landed = false;
      for (let i = 0; i < 120 && k.cp !== cp; i++) {
        const before = k.seg;
        stepKart(k, input, tr, ev, true);
        if (!k.grounded && wrapSeg(tr, k.seg - seg) < 30 && wrapSeg(tr, before - seg) > tr.n - 5) airCross = true;
        if (k.grounded) landed = true;
      }
      assert.ok(airCross, `${id}: КТ ${cp} — линию пересёк в воздухе`);
      assert.ok(landed, `${id}: КТ ${cp} — приземлился`);
      assert.equal(k.cp, cp, `${id}: КТ ${cp} засчитана после прыжка`);
    }
  }
});

test('шлагбаумы: секунда предупреждения, закрыт — только опущенный, всегда остаётся объезд шириной в карт', () => {
  const tr = buildRaceCourse('hills').track;
  const gates = tr.hz.movers.filter((m) => m.kind === MV_GATE);
  assert.ok(gates.length >= 2);
  for (const gate of gates) {
    let amber = 0;
    for (let t = 0; t < gate.period; t++) {
      const phase = gatePhase(gate, t);
      if (phase === 1) amber++;
      const body = { x: gate.cx, z: gate.cz, vx: -gate.uz * 10, vz: gate.ux * 10 };
      collide({ pads: [], slicks: [], decks: [], solids: [], movers: [gate] }, body, t, 0.75, makeHit());
      assert.equal(body.x !== gate.cx || body.z !== gate.cz, phase === 2);
      const cap = moverCap(gate, t, makeCap());
      assert.ok(Object.values(cap).every(Number.isFinite));
    }
    assert.equal(amber, GATE_WARN);
    const lc = locateAny(tr, gate.cx, gate.cz, makeLoc());
    assert.ok(lc.hw + Math.abs(lc.lat) - gate.h - gate.r > 3, 'с другой стороны всегда открыто');
  }
  // два шлагбаума на одном месте никогда не закрыты вместе
  for (let t = 0; t < 600; t++) assert.ok(gates.filter((g) => gatePhase(g, t) === 2).length <= 1, `тик ${t}`);
});

test('боты easy, normal и hard проезжают три круга на обеих трассах: без воды и без R, сильный быстрее', () => {
  const view: BotView = { racing: true, place: 1, karts: 1, ahead: Infinity, behind: Infinity, painted: false, gridLeft: 0, near: Infinity, bubble: false };
  for (const id of IDS) {
    const tr = buildRaceCourse(id).track;
    const seconds: number[] = [];
    for (const skill of ['easy', 'normal', 'hard'] as const) {
      const k = makeKartState();
      const ev = makeKartEvents();
      const input = makeInput();
      placeOnGrid(k, tr, 0);
      const bot = new KartBot(tr, skill, 101);
      let t = 0;
      for (; t < 18000 && !k.done; t++) {
        bot.update(k, view, t, input);
        stepKart(k, input, tr, ev, true);
        assert.equal(ev.splash || ev.respawn, false, `${id} ${skill}: тик ${t}`);
      }
      assert.equal(k.done, 1, `${id} ${skill}: не доехал (круг ${k.lap}, КТ ${k.cp})`);
      seconds.push(t / 60);
    }
    assert.ok(seconds[0] > seconds[1] && seconds[1] > seconds[2], `${id}: ${seconds.map((s) => s.toFixed(1)).join(' / ')}`);
  }
});

/** Гонка на прямой «Серпантина» (запад, x убывает): карт i — на 8 м впереди предыдущего */
function setup(count = 2, roll = () => 0.5) {
  const race = new Race({}, { track: 'hills', seed: 9, minKarts: count, roll });
  const sinks = Array.from({ length: count }, fakeSink);
  const karts = sinks.map((s, i) => race.addHuman({ pid: 500 + i, nick: `Kart ${i}`, outfit: DEFAULT_OUTFIT }, s)!);
  race.start();
  while (race.phase === RC_GRID) race.step();
  karts.forEach((k, i) => put(race, k, 34 - 6 * i, 178));
  return { race, karts, sinks };
}
function put(race: Race, k: Kart, x: number, z: number) {
  const tr = race.track;
  const lc = locateAny(tr, x, z, makeLoc());
  Object.assign(k.state, {
    x, z, y: lc.ground, seg: lc.seg, grounded: 1, hx: tr.tx[lc.seg], hz: tr.tz[lc.seg], vx: 0, vy: 0, vz: 0, ghostT: 0, prevButtons: 0,
  });
}
function use(race: Race, k: Kart, item: number) {
  const input = makeInput();
  input.seq = k.inq.ack + 1;
  input.buttons = BTN_FIRE;
  k.state.item = item;
  k.state.itemT = 0;
  k.state.prevButtons = 0;
  race.onInputs(k, [input], 1);
  race.step();
}
function revs(s: ReturnType<typeof fakeSink>) {
  return s.msgs.flatMap((m) => (m.t === 'rev' ? m.e : []));
}

test('шансы по месту: лидеру — варенье, пузырь и хлопок (без турбо и краски), последнему — чаще турбо', () => {
  const pick = (roll: number, count: number, place: number) => {
    const { race, karts } = setup(count, () => roll);
    const k = karts[0];
    const c = race.track.crates[0];
    put(race, k, c.x, c.z);
    k.place = place;
    for (const o of karts) if (o !== k) o.place = o.place === place ? 1 : o.place;
    race.step();
    assert.ok(k.state.itemT > 0);
    assert.ok(race.crateBack[0] > race.tick);
    return k.state.item;
  };
  // один в гонке — он и лидер: 45 варенье, 35 пузырь, 20 хлопок
  assert.equal(pick(0.1, 1, 1), ITEM_JAM);
  assert.equal(pick(0.6, 1, 1), ITEM_BUBBLE);
  assert.equal(pick(0.9, 1, 1), ITEM_CLAP);
  assert.equal(new Race({}, {}).trackId, 'harbor');
});

test('пузырь: принимает один хлопок и лопается (событие pop), виден в снимке и не портит биты ускорения', () => {
  const { race, karts: [a, b], sinks } = setup();
  use(race, b, ITEM_BUBBLE);
  assert.equal(b.bubbleT > 0, true);
  while (race.tick % 2) race.step();
  race.step();
  race.step();
  const snaps: KartSnap[] = [];
  const data = sinks[1].bins.at(-1)!;
  decodeKartSnapshot(new Uint8Array(data).buffer, makeKartHeader(), makeKartState(), snaps, []);
  const me = snaps.find((s) => s.id === b.id)!;
  assert.ok(me.misc & KM_BUBBLE);
  assert.equal(miscBoost(me.misc), 0);
  use(race, a, ITEM_CLAP);
  assert.equal(b.state.spinT, 0);
  assert.equal(b.state.slowT, 0);
  assert.equal(b.bubbleT, 0);
  use(race, a, ITEM_CLAP);
  assert.ok(b.state.spinT > 0 && b.state.slowT > 0);
  assert.equal(a.state.item, 0);
  race.step();
  const ev = revs(sinks[0]);
  assert.ok(ev.some((e) => e[0] === 'pop' && e[1] === b.id && e[2] === a.id));
  assert.ok(ev.some((e) => e[0] === 'clap' && e[1] === a.id && e[2].length === 0));
  assert.ok(ev.some((e) => e[0] === 'clap' && e[1] === a.id && e[2].includes(b.id)));
});

test('хлопок: волна на 8 м во все стороны; мимо — дальние, высоко, призраки и доехавшие; снимает ускорение', () => {
  for (const reject of ['far', 'high', 'ghost', 'done']) {
    const { race, karts: [a, b] } = setup();
    if (reject === 'far') put(race, b, a.state.x - 8.6, 178);
    if (reject === 'high') {
      b.state.y = a.state.y + 2;
      b.state.grounded = 0;
    }
    if (reject === 'ghost') b.state.ghostT = 50;
    if (reject === 'done') b.state.done = 1;
    use(race, a, ITEM_CLAP);
    assert.equal(b.state.slowT, 0, reject);
    assert.equal(b.state.spinT, 0, reject);
  }
  // позади тоже достаёт
  const { race, karts: [a, b] } = setup();
  put(race, b, a.state.x + 5, 178);
  b.state.boostT = 40;
  b.state.boostLvl = 3;
  use(race, a, ITEM_CLAP);
  assert.ok(b.state.slowT > 0 && b.state.spinT > 0);
  assert.equal(b.state.boostT, 0);
});

test('пузырь снимает краску, принимает краску и варенье по разу; варенье в пузыре исчезает', () => {
  const { race, karts: [a, b] } = setup();
  a.place = 2;
  b.place = 1;
  b.paintT = 100;
  use(race, b, ITEM_BUBBLE);
  assert.equal(b.paintT, 0);
  use(race, a, ITEM_PAINT);
  assert.equal(b.paintT, 0);
  assert.equal(b.bubbleT, 0);
  use(race, a, ITEM_PAINT);
  assert.ok(b.paintT > 0 && b.paintT <= PAINT_TICKS);
  use(race, b, ITEM_JAM);
  assert.equal(race.traps.length, 1);
  a.state.spinT = 20;
  a.state.slowT = 50;
  use(race, a, ITEM_BUBBLE);
  assert.equal(a.state.spinT, 0);
  assert.equal(a.state.slowT, 0);
  put(race, a, race.traps[0].x, race.traps[0].z);
  race.step();
  assert.equal(race.traps.length, 0);
  assert.equal(a.state.slowT, 0);
  assert.equal(a.state.spinT, 0);
  assert.equal(a.bubbleT, 0);
});

test('пузырь лопается сам через 8 с; R не даёт КТ; трасса гонки закреплена в приветствии и итогах', () => {
  const { race, karts: [a], sinks } = setup(1);
  use(race, a, ITEM_BUBBLE);
  for (let i = 0; i < BUBBLE_TICKS; i++) race.step();
  assert.equal(a.bubbleT, 0);
  race.step();
  assert.ok(revs(sinks[0]).some((e) => e[0] === 'pop' && e[1] === a.id && e[2] === 0));
  const cp = a.state.cp;
  const lap = a.state.lap;
  const input = makeInput();
  input.seq = a.inq.ack + 1;
  input.buttons = BTN_RELOAD;
  race.onInputs(a, [input], 1);
  race.step();
  assert.equal(a.state.cp, cp);
  assert.equal(a.state.lap, lap);
  assert.equal(race.addHuman({ pid: 999, nick: 'late', outfit: DEFAULT_OUTFIT }, fakeSink()), null);
  assert.ok(sinks[0].msgs.some((m) => m.t === 'race' && m.track === 'hills'));
  race.phaseEnd = race.tick + 1;
  race.step();
  const end = sinks[0].msgs.find((m) => m.t === 'raceEnd');
  assert.ok(end && end.t === 'raceEnd');
  assert.equal(end.track, 'hills');
  assert.ok(end.results.every((r) => r.track === 'hills'));
});

test('полная гонка на «Серпантине»: настоящий ввод, время круга и итоги с id трассы', () => {
  const rows: Array<{ best: number; track?: string; time: number }> = [];
  let paid = 0;
  const race = new Race({ result: (_k, row, reward) => { rows.push(row); if (reward) paid++; } }, { track: 'hills', seed: 15, minKarts: 4 });
  const me = race.addHuman({ pid: 17, nick: 'Pilot', outfit: DEFAULT_OUTFIT }, fakeSink())!;
  const bot = new KartBot(race.track, 'hard', 123);
  const view: BotView = { racing: true, place: 1, karts: 4, ahead: Infinity, behind: Infinity, painted: false, gridLeft: 0, near: Infinity, bubble: false };
  const input = makeInput();
  race.start();
  for (let t = 0; t < 19000 && !rows.length; t++) {
    view.racing = race.phase !== RC_GRID;
    view.place = me.place || 1;
    view.painted = me.paintT > 0;
    bot.update(me.state, view, race.tick, input);
    input.seq = t + 1;
    race.onInputs(me, [input], 1);
    race.step();
  }
  assert.equal(rows.length, 1);
  assert.equal(paid, 1);
  assert.equal(rows[0].track, 'hills');
  assert.ok(rows[0].best > 55000, `лучший круг ${rows[0].best}`);
  assert.ok(rows[0].time > 170000, `время ${rows[0].time}`);
  void ITEM_TURBO;
});
