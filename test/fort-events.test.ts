// «Крепость»: события волны — метеоры (круг за 1,4 с, половина — в гущу орды, половина — рядом с людьми; зомби −40 %,
// человек −25, ворота −80), сброс припасов (падает 7 с, лежит до конца волны, E или пройти по нему — награда),
// золотая лихорадка (×2 награда, орда быстрее), туман; директор зовёт их с 12-й волны, не на боссах, через 3.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as F from '../shared/fort.ts';
import {
  CRATE_DOWN, CRATE_FALL, CRATE_NONE, EV_FOG, EV_GOLD, EV_METEORS, EV_NONE, EV_SUPPLY, EVENT_FROM, EVENT_GAP, GOLD_HASTE, METEOR_COUNT,
  METEOR_GATE, METEOR_PLAYER, METEOR_R, METEOR_WARN_TICKS, METEOR_ZOMBIE, SUPPLY_FALL_TICKS, isBossWave, isSuperWave, supplyGold,
} from '../shared/fortwaves.ts';
import { GATE, buildFort, insideFort } from '../shared/fortmap.ts';
import { CollisionWorld } from '../shared/world.ts';
import { makeRng } from '../shared/math.ts';
import { GREN_BUY, UP_POUCH, grenadeMax, killBounty } from '../shared/fortarsenal.ts';
import { decodeFortTail, makeFortTail } from '../shared/fortnet.ts';
import { decodeSnapshot, makeHeader, type EntitySnap } from '../shared/protocol.ts';
import { BTN_USE, makeInput, makeState, type Input } from '../shared/sim.ts';
import { FEATURES, planWave, type WavePlan } from '../server/fort/director.ts';
import { WaveEvents, type EventHost } from '../server/fort/events.ts';
import { FortGame } from '../server/fort/game.ts';
import type { HordeTarget } from '../server/fort/horde.ts';
import type { FortEvent } from '../shared/fort.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';

const world = new CollisionWorld(buildFort());

interface FakeZombie {
  alive: boolean;
  kind: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
}

/** Игра-заглушка: всё, что события делают, — в журнал */
function fake(zombies: FakeZombie[], people: HordeTarget[], gateUp = true) {
  const log = { events: [] as FortEvent[], strikes: [] as number[][], hits: [] as number[][], gate: [] as number[], picked: [] as number[] };
  const host = {
    tick: 0,
    horde: { zombies, skyStrike: (x: number, y: number, z: number, r: number, frac: number) => { log.strikes.push([x, y, z, r, frac]); return 0; } },
    world,
    rng: makeRng(7),
    targets: () => people,
    hitPlayer: (zid: number, pid: number, dmg: number) => { log.hits.push([zid, pid, dmg]); },
    hitGate: (dmg: number) => { log.gate.push(dmg); },
    gateUp: () => gateUp,
    event: (e: FortEvent) => { log.events.push(e); },
    systemChat: () => {},
    supplyPicked: (pid: number) => { log.picked.push(pid); },
  };
  const ev = new WaveEvents(host as unknown as EventHost);
  const run = (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      host.tick++;
      ev.step();
    }
  };
  return { host, ev, log, run };
}

function planOf(event: number, w = 13): WavePlan {
  const p = planWave(w, 1, 3);
  return { ...p, event };
}

test('метеоры: 15 ударов за ~12 с, у каждого — круг за 1,4 с и камень на виду; чётные — в толпу, нечётные — к людям', () => {
  const crowd = Array.from({ length: 8 }, (_, i): FakeZombie => ({ alive: true, kind: F.Z_WALKER, x: -8 + (i % 4) * 0.8, y: 0, z: -30 - Math.floor(i / 4), vx: 0, vz: 0 }));
  const me: HordeTarget = { id: 3, x: 4, y: 2.2, z: 7, air: false };
  const { ev, log, run, host } = fake(crowd, [me]);
  ev.start(planOf(EV_METEORS), 0);
  run(40 * 60);
  const warns = log.events.filter((e) => e[0] === 'warn') as Array<[string, number, number, number, number, number, number, number]>;
  const throws = log.events.filter((e) => e[0] === 'throw');
  const blasts = log.events.filter((e) => e[0] === 'blast');
  assert.equal(warns.length, METEOR_COUNT);
  assert.equal(throws.length, METEOR_COUNT);
  assert.equal(blasts.length, METEOR_COUNT);
  for (const w of warns) {
    assert.equal(w[1], 0, 'метеор — не зомби');
    assert.equal(w[2], F.ZS_METEOR);
    assert.equal(w[6], METEOR_R);
  }
  // первый круг — когда орда уже вышла (не раньше 6 с), весь дождь — около 12 с
  const first = warns[0][7] - METEOR_WARN_TICKS;
  const last = warns[warns.length - 1][7];
  assert.ok(first >= 6 * 60 && first <= 20 * 60, `первый круг на ${first} тике`);
  assert.ok(last - warns[0][7] > 10 * 60 && last - warns[0][7] < 13 * 60, `дождь ${(last - warns[0][7]) / 60} с`);
  // камень летит ровно до удара
  for (let i = 0; i < throws.length; i++) {
    const t = throws[i] as [string, number, number, number, number, number, number, number, number];
    assert.equal(t[8], F.ZS_METEOR);
    assert.equal(t[7], METEOR_WARN_TICKS);
    assert.deepEqual([t[4], t[5], t[6]], [warns[i][3], warns[i][4], warns[i][5]]);
  }
  // чётные — в гущу (у толпы), нечётные — рядом с человеком (в круге, но не точно в него)
  for (let i = 0; i < warns.length; i++) {
    const [, , , x, y, z] = warns[i];
    if (i % 2 === 0) assert.ok(x > -10 && x < -4 && z < -28 && z > -32 && y === 0, `в толпу: ${x}, ${z}`);
    else {
      const d = Math.hypot(x - me.x, z - me.z);
      assert.ok(d <= 1.6 + 1e-6, `к человеку: ${d}`);
      assert.ok(Math.abs(y - 2.2) < 1e-6, 'круг — на террасе');
    }
  }
  assert.equal(log.strikes.length, METEOR_COUNT);
  for (const s of log.strikes) assert.deepEqual([s[3], s[4]], [METEOR_R, METEOR_ZOMBIE]);
  // человек стоял — его задело каждым «своим» метеором
  assert.equal(log.hits.length, Math.floor(METEOR_COUNT / 2));
  for (const h of log.hits) assert.deepEqual(h, [0, 3, METEOR_PLAYER]);
  assert.equal(log.gate.length, 0, 'толпа далеко от ворот — ворота целы');
  // начало и конец события
  const marks = log.events.filter((e) => e[0] === 'event');
  assert.deepEqual(marks, [['event', EV_METEORS, 1], ['event', EV_METEORS, 0]]);
  assert.ok(host.tick > last);
});

test('метеоры: толпа у ворот — удар задевает и ворота (−80); идущих бьёт с упреждением', () => {
  const atGate = Array.from({ length: 6 }, (_, i): FakeZombie => ({ alive: true, kind: F.Z_WALKER, x: -1 + (i % 3), y: 0, z: GATE.face - 1 - Math.floor(i / 3) * 0.8, vx: 0, vz: 0 }));
  const { ev, log, run } = fake(atGate, []);
  ev.start(planOf(EV_METEORS), 0);
  run(40 * 60);
  assert.equal(log.gate.length, METEOR_COUNT, 'людей нет — все в толпу у ворот');
  for (const g of log.gate) assert.equal(g, METEOR_GATE);

  const walking: FakeZombie[] = [{ alive: true, kind: F.Z_WALKER, x: 0, y: 0, z: -40, vx: 0, vz: 2 }];
  const b = fake(walking, []);
  b.ev.start(planOf(EV_METEORS), 0);
  b.run(30 * 60);
  const w = b.log.events.find((e) => e[0] === 'warn') as [string, number, number, number, number, number, number, number];
  assert.ok(Math.abs(w[5] - (-40 + 2 * METEOR_WARN_TICKS / 60)) < 1e-6, `упреждение: ${w[5]}`);
  assert.equal(b.log.gate.length, 0);
});

test('метеоры в игре: зомби в круге теряет 40 % макс. HP, человек — 25, сбитый метеором — без стрелка', () => {
  const game = new FortGame();
  const events: FortEvent[] = [];
  const sink = { sendJson: (m: { t: string; e?: FortEvent[] }) => { if (m.t === 'fev' && m.e) events.push(...m.e); }, sendBinary() {}, close() {} };
  const p = game.addHuman({ pid: 1, nick: 'Tester4', outfit: DEFAULT_OUTFIT }, sink as never)!;
  const plan = { ...planOf(EV_METEORS), spawns: [], boats: [], boss: -1 };
  game.phase = F.FT_WAVE;
  game.plan = plan;
  game.wave = plan.w;
  game.horde.startWave(plan, game.tick);
  game.waveEvents.start(plan, game.tick);
  const z = game.horde.spawn(F.Z_BRUTE, 1)!;
  Object.assign(z, { x: 6, y: 0, z: -34, vx: 0, vz: 0 });
  const hp0 = z.maxHp;
  // бугай стоит на месте: держим его, пока идёт дождь
  let hitOnce = false;
  for (let i = 0; i < 40 * 60 && game.waveEvents.kind === EV_METEORS; i++) {
    z.x = 6;
    z.z = -34;
    z.vx = z.vz = 0;
    game.step();
    if (z.hp < hp0 - 1 && !hitOnce) {
      hitOnce = true;
      assert.ok(Math.abs(z.hp - hp0 * (1 - METEOR_ZOMBIE)) < 1e-6, `${z.hp} / ${hp0}`);
    }
    if (!z.alive) break;
  }
  assert.ok(hitOnce, 'бугая задело');
  assert.ok(events.some((e) => e[0] === 'phit' && e[1] === 0 && e[2] === p.id && e[3] === METEOR_PLAYER), 'человека задело');
});

test('сброс припасов: падает 7 с, лежит, подобрал (E или наступил) — награда всем; не подобрали — пропал с концом волны', () => {
  const me: HordeTarget = { id: 5, x: 30, y: 0, z: 0, air: false };
  const { ev, log, run } = fake([], [me]);
  ev.start(planOf(EV_SUPPLY), 0);
  run(4 * 60);
  assert.equal(ev.crate, CRATE_NONE, 'ещё не сбросили');
  let t = 4 * 60;
  for (; t < 20 * 60 && ev.crate === CRATE_NONE; t++) run(1);
  assert.equal(ev.crate, CRATE_FALL);
  assert.ok(t >= 5 * 60 && t <= 12 * 60, `сброс на ${t / 60} с`);
  const drop = log.events.find((e) => e[0] === 'supply') as [string, number, number, number, number, number];
  assert.deepEqual(drop.slice(0, 3), ['supply', 0, 0]);
  assert.deepEqual([drop[3], drop[5]], [Math.round(ev.crateX * 100) / 100, Math.round(ev.crateZ * 100) / 100]);
  run(SUPPLY_FALL_TICKS - 1);
  assert.equal(ev.crate, CRATE_FALL);
  run(1);
  assert.equal(ev.crate, CRATE_DOWN);
  assert.ok(log.events.some((e) => e[0] === 'supply' && e[1] === 1));
  // E издалека — мимо, рядом — подобрал
  assert.equal(ev.use(5, ev.crateX + 3, ev.crateY, ev.crateZ), false);
  assert.equal(ev.use(5, ev.crateX + 1.5, ev.crateY, ev.crateZ), true);
  assert.deepEqual(log.picked, [5]);
  assert.equal(ev.crate, CRATE_NONE);
  assert.ok(log.events.some((e) => e[0] === 'supply' && e[1] === 2 && e[2] === 5));
  assert.ok(log.events.some((e) => e[0] === 'event' && e[1] === EV_SUPPLY && e[2] === 0));

  // наступил — тоже подобрал
  const b = fake([], [me]);
  b.ev.start(planOf(EV_SUPPLY), 0);
  b.run(20 * 60);
  assert.equal(b.ev.crate, CRATE_DOWN);
  me.x = b.ev.crateX + 0.5;
  me.y = b.ev.crateY;
  me.z = b.ev.crateZ;
  b.run(1);
  assert.deepEqual(b.log.picked, [5]);

  // никто не подобрал — с концом волны пропал
  const c = fake([], []);
  c.ev.start(planOf(EV_SUPPLY), 0);
  c.run(20 * 60);
  assert.equal(c.ev.crate, CRATE_DOWN);
  c.ev.stop();
  assert.equal(c.ev.crate, CRATE_NONE);
  assert.ok(c.log.events.some((e) => e[0] === 'supply' && e[1] === 3));
});

test('ящик падает в 40 % случаев в поле за стеной, иначе — в крепость, и всегда на то, на чём можно стоять', () => {
  let field = 0;
  const N = 300;
  for (let i = 0; i < N; i++) {
    const { ev, host, run } = fake([], []);
    host.rng = makeRng(1000 + i);
    ev.start(planOf(EV_SUPPLY), 0);
    run(13 * 60);
    assert.notEqual(ev.crate, CRATE_NONE);
    const inside = insideFort(ev.crateX, ev.crateZ) || ev.crateY > 0.5;
    if (!inside) field++;
    assert.ok(ev.crateY <= 3.45, `не на зубцах: ${ev.crateY}`);
    const ground = world.groundBelow(ev.crateX, ev.crateY + 0.01, ev.crateZ);
    assert.ok(Math.abs(ground - ev.crateY) < 1e-6, 'лежит на поверхности');
  }
  assert.ok(field > N * 0.3 && field < N * 0.5, `в поле: ${field} из ${N}`);
});

test('ящик в игре: снимок несёт где он; подобрал — золото каждому защитнику', () => {
  const game = new FortGame();
  const sink = { sendJson() {}, sendBinary() {}, close() {} };
  const a = game.addHuman({ pid: 1, nick: 'Tester4', outfit: DEFAULT_OUTFIT }, sink as never)!;
  const b = game.addHuman({ pid: 2, nick: 'Друг', outfit: DEFAULT_OUTFIT }, sink as never)!;
  const plan = { ...planOf(EV_SUPPLY), spawns: [], boats: [], boss: -1 };
  game.phase = F.FT_WAVE;
  game.plan = plan;
  game.wave = plan.w;
  game.horde.startWave(plan, game.tick);
  game.waveEvents.start(plan, game.tick);
  // кто-то в поле держит волну
  const z = game.horde.spawn(F.Z_WALKER, 1)!;
  Object.assign(z, { x: 0, z: -60 });
  for (let i = 0; i < 25 * 60 && game.waveEvents.crate !== CRATE_DOWN; i++) {
    z.z = -60;
    game.step();
  }
  assert.equal(game.waveEvents.crate, CRATE_DOWN);
  // снимок: где ящик
  const sent: Uint8Array[] = [];
  (a.sink as unknown as { sendBinary: (u: Uint8Array) => void }).sendBinary = (u) => { sent.push(u); };
  for (let i = 0; i < 3; i++) game.step();
  assert.ok(sent.length > 0);
  const last = sent[sent.length - 1];
  const ab = last.buffer.slice(last.byteOffset, last.byteOffset + last.byteLength) as ArrayBuffer;
  const h = makeHeader();
  const ents: EntitySnap[] = [];
  decodeSnapshot(ab, h, makeState(), ents);
  const tail = makeFortTail();
  decodeFortTail(ab, h.tail, tail, []);
  assert.equal(tail.event, EV_SUPPLY);
  assert.equal(tail.crate, CRATE_DOWN);
  assert.ok(Math.abs(tail.crateX! - game.waveEvents.crateX) < 0.01 && Math.abs(tail.crateZ! - game.waveEvents.crateZ) < 0.01);
  // припасы — всей команде: гранаты (арсенал), а у кого подсумок полон — золото
  const ra = a.run.arsenal;
  const rb = b.run.arsenal;
  rb.gr = grenadeMax(rb.lv[UP_POUCH]);
  const grA = ra.gr;
  const goldA = ra.gold;
  const goldB = rb.gold;
  // E рядом с ящиком: кнопка «нажата сейчас» во вводе
  const ev = game.waveEvents;
  Object.assign(a.state, { x: ev.crateX + 1.4, y: ev.crateY, z: ev.crateZ, prevButtons: 0 });
  const inp: Input = { ...makeInput(), buttons: BTN_USE };
  (game as unknown as { simulate(p: unknown, i: Input): void }).simulate(a, inp);
  assert.equal(ev.crate, CRATE_NONE, 'подобрал по E');
  assert.equal(ra.gr, Math.min(grenadeMax(ra.lv[UP_POUCH]), grA + GREN_BUY), 'гранаты');
  assert.ok(ra.gr > grA);
  assert.equal(ra.gold, goldA, 'получил гранаты — без золота');
  assert.equal(rb.gold - goldB, supplyGold(plan.w), 'подсумок полон — золото');
  assert.equal(ev.use(a.id, ev.crateX, ev.crateY, ev.crateZ), false, 'второй раз — нечего');
});


test('золотая лихорадка: награда ×2, орда на 20 % быстрее; туман — только метка события', () => {
  const game = new FortGame();
  const sink = { sendJson() {}, sendBinary() {}, close() {} };
  const p = game.addHuman({ pid: 1, nick: 'Tester4', outfit: DEFAULT_OUTFIT }, sink as never)!;
  const plan = { ...planOf(EV_GOLD), spawns: [], boats: [], boss: -1 };
  game.phase = F.FT_WAVE;
  game.plan = plan;
  game.wave = plan.w;
  game.horde.startWave(plan, game.tick);
  game.waveEvents.start(plan, game.tick);
  assert.equal(game.goldMul, 2);
  assert.equal(game.horde.haste, GOLD_HASTE);
  const z = game.horde.spawn(F.Z_WALKER, 1)!;
  const before = p.run.arsenal.gold;
  game.horde.damage(z, 1e9, p.id, true, z.x, z.y, z.z);
  // доля стрелка у арсенала — killBounty, в лихорадку ×2 (остальное — в общак волны)
  assert.equal(p.run.arsenal.gold - before, Math.round(killBounty(F.Z_WALKER, plan.w) * 2));
  const fog = { ...planOf(EV_FOG), spawns: [], boats: [], boss: -1 };
  game.plan = fog;
  game.horde.startWave(fog, game.tick);
  assert.equal(game.goldMul, 1);
  assert.equal(game.horde.haste, 1);
});

test('директор: события с 12-й волны, не на боссах и супер-волнах, не чаще раза в 3 волны, не одно и то же подряд', () => {
  assert.equal(FEATURES.events, true);
  for (const seed of [1, 2, 3, 4, 5]) {
    let last = { wave: -99, kind: EV_NONE };
    let n = 0;
    let allowed = 0;
    for (let w = 1; w <= 300; w++) {
      const plan = planWave(w, 2, seed, last);
      const ok = w >= EVENT_FROM && !isBossWave(w) && !isSuperWave(w) && w - last.wave >= EVENT_GAP;
      if (ok) allowed++;
      if (plan.event === EV_NONE) continue;
      assert.ok(ok, `волна ${w}: событие не к месту`);
      assert.notEqual(plan.event, last.kind, `волна ${w}: то же событие подряд`);
      assert.equal(plan.card.event, plan.event);
      last = { wave: w, kind: plan.event };
      n++;
    }
    assert.ok(n >= 25 && n <= allowed * 0.5, `seed ${seed}: событий ${n} из ${allowed} возможных`);
  }
});
