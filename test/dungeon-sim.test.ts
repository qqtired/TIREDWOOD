// «Подземелье»: симуляция детерминирована, волна заканчивается и считается, карточки замораживают мир, тор склеен.
import assert from 'node:assert/strict';
import test from 'node:test';
import type { DgEvent } from '../shared/dungeon/api.ts';
import { hurtMob } from '../shared/dungeon/core.ts';
import { blocked, terrainAt } from '../shared/dungeon/map.ts';
import { applyEvent, createRun, DG_LEVEL, dgHash, dgResult, step, wrapD, wrapP, type DgSim } from '../shared/dungeon/sim.ts';

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

test('постройки срабатывают, если постоять в круге (без E); лестница у старта твёрдая', () => {
  const sim = createRun(3);
  sim.hero.hpMax = sim.hero.hp = 1e6;
  const altar = sim.props.find((p) => p.k === 'altar' && p.st === 0)!;
  sim.hero.x = altar.x;
  sim.hero.z = altar.z;
  for (let i = 0; i < 5; i++) step(sim);
  assert.equal(sim.hero.useId, altar.id, 'отсчёт пошёл');
  for (let i = 0; i < 30; i++) step(sim);
  assert.equal(altar.st, 2, 'алтарь сработал');
  assert.equal(sim.hero.buffs.length, 1);
  // лестница: старт свободен, сама лестница — нет; идти на запад от колодца — упрёшься
  assert.equal(blocked(120, 120, 0.45), false);
  assert.equal(blocked(112, 120, 0.45), true);
  const s2 = createRun(4);
  applyEvent(s2, { t: 0, k: 'mv', x: -100, y: 0 });
  for (let i = 0; i < 60; i++) step(s2);
  assert.ok(s2.hero.x > 114, `упёрся в лестницу: x = ${s2.hero.x}`);
});

test('таймер волны: следующая сразу, без передышки; недобитые остаются и звереют', () => {
  const sim = createRun(21);
  sim.hero.hpMax = sim.hero.hp = 1e6;
  sim.weapons.length = 0; // никого не убиваем — все доживут до таймера
  applyEvent(sim, { t: 0, k: 'go' });
  let rageFx = 0;
  let breather = false;
  for (let i = 0; i < 30 * 70 && sim.wave.n < 2; i++) {
    step(sim);
    if (sim.wave.stage === 'breather') breather = true;
    for (const f of sim.fx) if (f.k === 'rage') rageFx = f.n;
  }
  assert.equal(sim.wave.n, 2, 'началась 2-я');
  assert.equal(sim.wave.stage, 'wave', 'сразу волна');
  assert.equal(breather, false, 'передышки нет');
  assert.equal(sim.stats.waves, 1, '1-я засчитана по таймеру');
  const angry = sim.mobs.filter((m) => !m.die && m.rage === 1).length;
  assert.ok(angry > 50, `озверели ${angry}`);
  assert.equal(rageFx, angry);
  step(sim);
  assert.ok(sim.wave.old >= angry - 2, `остатки на HUD: ${sim.wave.old}`);
  // ещё один таймер — уровень 2 (не выше 3)
  for (let i = 0; i < 30 * 70 && sim.wave.n < 3; i++) step(sim);
  assert.ok(sim.mobs.some((m) => !m.die && m.rage === 2));
  assert.ok(sim.mobs.every((m) => m.rage <= 3));
});

test('зачистка до таймера: «Зачистка!», передышка, Enter — следующая волна', () => {
  const sim = createRun(22);
  sim.hero.hpMax = sim.hero.hp = 1e6;
  applyEvent(sim, { t: 0, k: 'go' });
  for (let i = 0; i < 30 * 4; i++) step(sim);
  assert.equal(sim.wave.stage, 'wave');
  sim.wave.pend.fill(0);
  for (const e of sim.wave.ev) e.done = 1;
  let swept = 0;
  for (let i = 0; i < 60 && sim.wave.stage === 'wave'; i++) {
    for (const m of sim.mobs) if (!m.die) hurtMob(sim, m, 1e9, 'q', m.x, m.z, 0, 0, 0);
    if (sim.choice) applyEvent(sim, { t: sim.t, k: 'pick', i: 0 });
    if (sim.chest) applyEvent(sim, { t: sim.t, k: 'pick', i: 0 });
    step(sim);
    for (const f of sim.fx) if (f.k === 'sweep') swept = f.n;
  }
  assert.equal(sim.wave.stage, 'breather');
  assert.equal(sim.wave.swept, 1);
  assert.equal(swept, 1, 'fx sweep');
  assert.equal(sim.stats.waves, 1);
  assert.equal(sim.wave.n, 2, 'передышка перед 2-й');
  applyEvent(sim, { t: sim.t, k: 'go' });
  step(sim);
  assert.equal(sim.wave.stage, 'wave');
  assert.equal(sim.wave.swept, 0);
});

test('обычные сундуки карты: 4–5 на старте вне стен и воды; подбор — одно улучшение; за волну +1', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const s = createRun(seed);
    const map = s.items.filter((i) => i.k === 'chest' && i.src === 'map');
    assert.ok(map.length >= 4 && map.length <= 5, `сундуков ${map.length}`);
    for (const c of map) {
      assert.equal(blocked(c.x, c.z, 1.2), false, 'не в стене');
      assert.equal(terrainAt(c.x, c.z), 0, 'не в воде и варенье');
      assert.ok(Math.abs(wrapD(c.x - 120)) > 6, 'не на тракте x = 120');
    }
  }
  const sim = createRun(1);
  sim.hero.hpMax = sim.hero.hp = 1e6;
  const c = sim.items.find((i) => i.src === 'map')!;
  sim.hero.x = c.x;
  sim.hero.z = c.z;
  for (let i = 0; i < 15 && !sim.chest; i++) step(sim);
  assert.equal(sim.chest?.kind, 'plain');
  assert.equal(sim.chest!.rows.length, 1);
  applyEvent(sim, { t: sim.t, k: 'pick', i: 0 });
  const n0 = sim.items.filter((i) => i.src === 'map').length;
  applyEvent(sim, { t: sim.t, k: 'go' });
  for (let i = 0; i < 30 * 60 && sim.stats.waves < 1; i++) {
    step(sim);
    if (sim.choice || sim.chest) applyEvent(sim, { t: sim.t, k: 'pick', i: 0 });
  }
  assert.equal(sim.items.filter((i) => i.src === 'map').length, Math.min(6, n0 + 1), 'волна засчитана — новый сундук');
});

test('озеро: брод к островку проходим, поперёк — глубина; на островке сундук на 2 улучшения, новый через 120 с', () => {
  const lk = DG_LEVEL.lake!;
  const dist = (s: DgSim): number => Math.hypot(wrapD(s.hero.x - lk.x), wrapD(s.hero.z - lk.z));
  const sim = createRun(2);
  sim.hero.hpMax = sim.hero.hp = 1e6;
  sim.hero.x = lk.x + lk.ford.dx * 17;
  sim.hero.z = lk.z + lk.ford.dz * 17;
  applyEvent(sim, { t: 0, k: 'mv', x: -lk.ford.dx * 100, y: -lk.ford.dz * 100 });
  let kind = '';
  let rows = 0;
  for (let i = 0; i < 30 * 8; i++) {
    step(sim);
    if (sim.chest) {
      kind = sim.chest.kind;
      rows = sim.chest.rows.length;
      applyEvent(sim, { t: sim.t, k: 'pick', i: 0 });
    }
  }
  assert.ok(dist(sim) < lk.island, `дошёл до островка: ${dist(sim).toFixed(2)}`);
  assert.equal(kind, 'isle');
  assert.equal(rows, 2);
  assert.ok(sim.isleT > sim.t, 'новый сундук потом');
  assert.equal(sim.items.some((i) => i.src === 'isle'), false);
  const due = sim.isleT;
  let back = -1;
  for (let g = 0; g < 30 * 400 && back < 0; g++) {
    step(sim);
    if (sim.choice || sim.chest) applyEvent(sim, { t: sim.t, k: 'pick', i: 0 });
    if (sim.items.some((i) => i.src === 'isle')) back = sim.t;
  }
  assert.ok(back >= due && back <= due + 1, `вернулся через 120 с: ${back} / ${due}`);
  // поперёк брода — глубина не пускает
  const s2 = createRun(3);
  const nx = lk.ford.dz;
  const nz = -lk.ford.dx;
  s2.hero.x = lk.x + nx * 17;
  s2.hero.z = lk.z + nz * 17;
  applyEvent(s2, { t: 0, k: 'mv', x: -nx * 100, y: -nz * 100 });
  let min = 1e9;
  for (let i = 0; i < 30 * 6; i++) {
    step(s2);
    min = Math.min(min, dist(s2));
  }
  assert.ok(min >= lk.deep, `глубина держит: ${min.toFixed(2)}`);
});

test('проклятый сундук вне волны: причина why и fx locked, в волне — проклятие', () => {
  const sim = createRun(4);
  const p = sim.props.find((q) => q.k === 'chest' && q.st === 0)!;
  sim.hero.hpMax = sim.hero.hp = 1e6;
  sim.hero.x = p.x;
  sim.hero.z = p.z;
  step(sim);
  assert.equal(sim.wave.stage, 'intro');
  assert.equal(p.why, 'wave');
  assert.equal(sim.hero.lockId, p.id);
  assert.ok(sim.fx.some((f) => f.k === 'prop' && f.what === 'locked' && f.why === 'wave'));
  for (let i = 0; i < 30 * 6 && p.st === 0; i++) {
    sim.hero.x = p.x;
    sim.hero.z = p.z;
    step(sim);
  }
  assert.equal(p.st, 1, 'в волне постоял — проклятие');
  assert.equal(p.why, 'busy');
});
