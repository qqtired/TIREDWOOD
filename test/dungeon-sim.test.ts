// «Подземелье»: симуляция детерминирована, волна заканчивается и считается, карточки замораживают мир, тор склеен.
import assert from 'node:assert/strict';
import test from 'node:test';
import type { DgEvent } from '../shared/dungeon/api.ts';
import { blocked } from '../shared/dungeon/map.ts';
import { applyEvent, createRun, dgHash, dgResult, step, wrapD, wrapP, type DgSim } from '../shared/dungeon/sim.ts';

/** Скриптовый игрок без Math.random: направление меняется по номеру шага, рывок и Q по расписанию, первая карточка */
function scripted(sim: DgSim, mem: { d: number; q: number }): DgEvent[] {
  const t = sim.t;
  const ev: DgEvent[] = [];
  if (sim.chest || sim.choice) return [{ t, k: 'pick', i: t % 3 === 0 ? 1 : 0 }];
  if (sim.wave.stage === 'breather') ev.push({ t, k: 'go' });
  const dirs = [[100, 0], [70, 70], [0, 100], [-70, 70], [-100, 0], [-70, -70], [0, -100], [70, -70]];
  const d = Math.floor(t / 75) % 8;
  if (d !== mem.d) {
    mem.d = d;
    ev.push({ t, k: 'mv', x: dirs[d][0], y: dirs[d][1] });
  }
  if (t % 97 === 0) ev.push({ t, k: 'dash' });
  if (t % 290 === 0) {
    ev.push({ t, k: 'q', on: 1 });
    mem.q = t;
  }
  if (mem.q && t - mem.q === 33) {
    ev.push({ t, k: 'q', on: 0 });
    mem.q = 0;
  }
  return ev;
}

function play(seed: number, steps: number): { sim: DgSim; log: DgEvent[] } {
  const sim = createRun(seed);
  const mem = { d: -1, q: 0 };
  const log: DgEvent[] = [];
  let guard = 0;
  while (sim.t < steps && sim.end === 'running' && guard++ < steps * 2) {
    for (const e of scripted(sim, mem)) {
      log.push(e);
      applyEvent(sim, e);
    }
    step(sim);
  }
  return { sim, log };
}

/** Повтор по журналу, как сервер: события с ev.t === sim.t — до шага; выбор открыт и событий нет — стоп */
function replay(seed: number, log: DgEvent[], chunks: number[]): DgSim {
  const sim = createRun(seed);
  sim.noFx = true;
  let i = 0;
  let upto = 0;
  for (const c of chunks) {
    upto += c;
    for (;;) {
      while (i < log.length && log[i].t === sim.t) applyEvent(sim, log[i++]);
      if (sim.t >= upto || sim.end !== 'running') break;
      if (sim.choice || sim.chest) break; // ждём выбора в следующем куске
      step(sim);
    }
  }
  return sim;
}

test('один зерно и журнал → тот же забег; кусками = целиком; копия продолжает так же', () => {
  const STEPS = 30 * 100;
  const a = play(42, STEPS);
  const b = play(42, STEPS);
  assert.equal(dgHash(a.sim), dgHash(b.sim));
  assert.deepEqual(dgResult(a.sim), dgResult(b.sim));
  assert.ok(a.sim.stats.kills > 0, 'кого-то убили');
  const whole = replay(42, a.log, [a.sim.t]);
  const parts = replay(42, a.log, [7, 300, 1, 1000, 13, a.sim.t - 1321]);
  assert.equal(dgHash(whole), dgHash(a.sim));
  assert.equal(dgHash(parts), dgHash(a.sim));
  // копия посреди забега (structuredClone) идёт так же, как оригинал
  const c = play(7, 30 * 40).sim;
  const d = structuredClone(c);
  for (let k = 0; k < 300; k++) {
    step(c);
    step(d);
    if (c.choice) {
      applyEvent(c, { t: c.t, k: 'pick', i: 0 });
      applyEvent(d, { t: d.t, k: 'pick', i: 0 });
    }
  }
  assert.equal(dgHash(c), dgHash(d));
  // другое зерно — другой забег
  assert.notEqual(dgHash(play(43, STEPS).sim), dgHash(a.sim));
});

test('волна заканчивается и считается', () => {
  const { sim } = play(5, 30 * 60);
  assert.ok(sim.stats.waves >= 1, `отбито ${sim.stats.waves}`);
  assert.ok(sim.wave.n >= 2);
  assert.ok(sim.stats.ms > 0);
  assert.equal(dgResult(sim).waves, sim.stats.waves);
});

test('карточки замораживают мир до выбора', () => {
  const sim = createRun(11);
  const mem = { d: -1, q: 0 };
  let guard = 0;
  while (!sim.choice && guard++ < 30 * 120) {
    for (const e of scripted(sim, mem)) if (e.k !== 'pick') applyEvent(sim, e);
    step(sim);
  }
  assert.ok(sim.choice, 'выбор открылся');
  assert.equal(sim.choice!.cards.length, 3);
  const t = sim.t;
  const h = dgHash(sim);
  for (let i = 0; i < 20; i++) step(sim);
  assert.equal(sim.t, t, 'время стоит');
  assert.equal(dgHash(sim), h, 'мир стоит');
  const before = sim.weapons.length + sim.passives.length;
  const card = sim.choice!.cards[0];
  applyEvent(sim, { t: sim.t, k: 'pick', i: 0 });
  if (card.lv === 1 && (card.k === 'w' || card.k === 'p')) assert.equal(sim.weapons.length + sim.passives.length, before + 1);
  if (!sim.choice) {
    step(sim);
    assert.equal(sim.t, t + 1, 'мир пошёл');
  }
});

test('тор: координаты по модулю 240, разница — кратчайшая', () => {
  assert.equal(wrapP(241), 1);
  assert.equal(wrapP(-1), 239);
  assert.equal(wrapP(240), 0);
  assert.equal(wrapD(239 - 1), -2);
  assert.equal(wrapD(1 - 239), 2);
  assert.ok(Math.abs(wrapD(120)) === 120);
  // герой уходит за правый край и выходит слева
  const sim = createRun(1);
  let z = 0;
  for (let zz = 2; zz < 240; zz += 0.5) {
    let free = true;
    for (let x = 236; x <= 244; x += 0.25) if (blocked(wrapP(x), zz, 0.6)) free = false;
    if (free) {
      z = zz;
      break;
    }
  }
  sim.hero.x = 238.5;
  sim.hero.z = z;
  applyEvent(sim, { t: 0, k: 'mv', x: 100, y: 0 });
  for (let i = 0; i < 30; i++) step(sim);
  assert.ok(sim.hero.x >= 0 && sim.hero.x < 240);
  assert.ok(sim.hero.x > 2 && sim.hero.x < 6, `x = ${sim.hero.x}`);
});
