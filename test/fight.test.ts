// «Fight Club»: шаг бойца (shared/fightsim.ts) — удары, серия, блок, пробитие, уклон, выносливость, захват, край
// ринга; свет гаснет по ступеням; хвост снимка; предсказание совпадает бит в бит.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DASH_TICKS, TICK_RATE } from '../shared/constants.ts';
import {
  FA_GRAB, FA_HEAVY, FA_HOLD, FA_HOOK, FA_JAB, FA_JAB2, FA_NONE, FA_THROW, FC_BLOCK_ST, FC_BLOCK_STUN, FC_BREAK_DMG, FC_BREAK_STUN, FC_DODGE_COST,
  FC_DODGE_INV_EXTRA, FC_HOLD_MIN, FC_HP, FC_ST_MAX, FC_ZONE_MIN, FC_ZONE_SHRINK, FC_ZONE_START_DUEL, FC_ZONE_START_FFA, FC_ZONE_WARN, HIT_BLOCK,
  HIT_BREAK, HIT_HIT, MOVES, cornerSpot, crowdSpot, fightReward, makeZone, ringRadius, zoneAt,
} from '../shared/fight.ts';
import { decodeFightTail, encodeFightTail, makeFightTail } from '../shared/fightnet.ts';
import {
  BTN_BLOCK, GATE_FIGHT, GATE_FROZEN, applyHit, buildFightWorld, copyFighter, faces, fightersEqual, freshFighter, inReach, makeFightEvents, makeFighter,
  makeHitOut, stepFighter, type Fighter,
} from '../shared/fightsim.ts';
import { makeRng } from '../shared/math.ts';
import { BTN_ADS, BTN_DASH, BTN_FIRE, BTN_FORWARD, BTN_LEFT, BTN_USE, makeInput } from '../shared/sim.ts';

const world = buildFightWorld();
const R = 6;

function fighter(x = 0, z = 0, yaw = 0): Fighter {
  const f = makeFighter();
  freshFighter(f, x, z, yaw);
  return f;
}

/** n тиков с одними кнопками; что било — по порядку */
function run(f: Fighter, buttons: number, n: number, yaw = 0, gate = GATE_FIGHT): number[] {
  const inp = makeInput();
  const ev = makeFightEvents();
  const strikes: number[] = [];
  for (let i = 0; i < n; i++) {
    inp.buttons = buttons;
    inp.yaw = yaw;
    stepFighter(f, inp, world, R, gate, ev);
    if (ev.strike) strikes.push(ev.strike);
  }
  return strikes;
}

test('джеб: замах 6 тиков, бьёт в секторе перед собой, за спиной — мимо', () => {
  const f = fighter();
  const inp = makeInput();
  const ev = makeFightEvents();
  inp.buttons = BTN_FIRE;
  stepFighter(f, inp, world, R, GATE_FIGHT, ev);
  assert.equal(ev.began, FA_JAB);
  assert.equal(f.act, FA_JAB);
  assert.equal(f.st, FC_ST_MAX - MOVES[FA_JAB].cost);
  inp.buttons = 0;
  let at = -1;
  for (let t = 1; t <= 20; t++) {
    stepFighter(f, inp, world, R, GATE_FIGHT, ev);
    if (ev.strike) at = t;
  }
  assert.equal(at, MOVES[FA_JAB].w, 'удар — ровно после замаха');
  assert.equal(f.act, FA_NONE, 'удар кончился');
  // yaw = 0 смотрит в −Z
  const m = MOVES[FA_JAB];
  assert.ok(inReach(0, 0, 0, 0, 0, 0, -1.2, m.reach, m.arc), 'впереди');
  assert.ok(inReach(0, 0, 0, 0, 0.5, 0, -1.2, m.reach, m.arc), 'чуть сбоку');
  assert.ok(!inReach(0, 0, 0, 0, 0, 0, 1.2, m.reach, m.arc), 'за спиной');
  assert.ok(!inReach(0, 0, 0, 0, 0, 0, -2.2, m.reach, m.arc), 'далеко');
  assert.ok(!inReach(0, 0, 0, 0, 0, 1.6, -1, m.reach, m.arc), 'высоко над головой');
  assert.ok(faces(Math.PI / 2, -1, 0, 0.9), 'yaw = π/2 смотрит на запад');
});

test('серия: три нажатия подряд — джеб, второй джеб, хук; дальше — снова джеб', () => {
  const f = fighter();
  const inp = makeInput();
  const ev = makeFightEvents();
  const strikes: number[] = [];
  for (let t = 0; t < 90; t++) {
    // жмём раз в 5 тиков (нажатие — один тик)
    inp.buttons = t % 5 === 0 && t < 40 ? BTN_FIRE : 0;
    stepFighter(f, inp, world, R, GATE_FIGHT, ev);
    if (ev.strike) strikes.push(ev.strike);
  }
  assert.deepEqual(strikes.slice(0, 3), [FA_JAB, FA_JAB2, FA_HOOK]);
  assert.equal(strikes[3], FA_JAB, 'после хука серия начинается заново');
});

test('блок гасит лёгкий удар, тяжёлый его пробивает, без выносливости блок падает', () => {
  const out = makeHitOut();
  const v = fighter();
  v.block = 1;
  applyHit(v, FA_JAB, 0, -1, true, out);
  assert.equal(out.res, HIT_BLOCK);
  assert.equal(v.hp, FC_HP - 1);
  assert.equal(v.bstun, FC_BLOCK_STUN);
  assert.equal(v.st, FC_ST_MAX - FC_BLOCK_ST);
  assert.equal(v.stun, 0, 'в блоке не оглушает');

  const h = fighter();
  h.block = 1;
  applyHit(h, FA_HEAVY, 0, -1, true, out);
  assert.equal(out.res, HIT_BREAK);
  assert.equal(h.hp, FC_HP - FC_BREAK_DMG);
  assert.equal(h.stun, FC_BREAK_STUN);
  assert.equal(h.block, 0);

  const t = fighter();
  t.block = 1;
  t.st = 50;
  applyHit(t, FA_JAB, 0, -1, true, out);
  assert.equal(out.res, HIT_BREAK, 'выносливость кончилась — пробит');
  assert.equal(t.st, 0);

  const o = fighter();
  applyHit(o, FA_HEAVY, 1, 0, false, out);
  assert.equal(out.res, HIT_HIT);
  assert.equal(o.hp, FC_HP - MOVES[FA_HEAVY].dmg);
  assert.ok(o.s.vx > 5 && o.s.vy > 0 && o.s.grounded === 0, 'отбросило и подбросило');
  assert.equal(o.stun, MOVES[FA_HEAVY].stun);
  // оглушённый не управляет собой и летит по отбросу
  const x0 = o.s.x;
  run(o, BTN_FORWARD | BTN_FIRE, 10);
  assert.equal(o.act, FA_NONE, 'оглушённый не бьёт');
  assert.ok(o.s.x - x0 > 1, 'улетел');
});

test('нокаут: HP 0 — лежит, не ходит и не бьёт', () => {
  const out = makeHitOut();
  const v = fighter();
  v.hp = 5;
  applyHit(v, FA_HOOK, 0, 1, false, out);
  assert.equal(v.hp, 0);
  assert.equal(v.ko, 1);
  run(v, 0, 60);
  const z0 = v.s.z;
  run(v, BTN_FORWARD | BTN_FIRE, 30);
  assert.equal(v.act, FA_NONE);
  assert.ok(Math.abs(v.s.z - z0) < 1e-3, 'лежит');
});

test('блок: держит кнопку — блок и медленная ходьба; отход после удара блоком отменяется', () => {
  const f = fighter();
  run(f, BTN_BLOCK, 2);
  assert.equal(f.block, 1);
  const a = fighter(0, 0);
  const b = fighter(2, 0);
  run(a, BTN_FORWARD, 60);
  run(b, BTN_FORWARD | BTN_BLOCK, 60);
  const da = -a.s.z;
  const db = -b.s.z;
  assert.ok(db < da * 0.6 && db > da * 0.3, `в блоке медленнее: ${db.toFixed(2)} против ${da.toFixed(2)}`);
  // ударил и сразу встал в блок: отход прерывается
  const c = fighter();
  run(c, BTN_FIRE, 1);
  run(c, 0, MOVES[FA_JAB].w + MOVES[FA_JAB].a);
  assert.equal(c.act, FA_JAB, 'отход');
  run(c, BTN_BLOCK, 1);
  assert.equal(c.act, FA_NONE);
  assert.equal(c.block, 1);
});

test('уклон: рывок, неуязвим на время рывка и ещё чуть-чуть, стоит выносливости', () => {
  const f = fighter();
  const inp = makeInput();
  const ev = makeFightEvents();
  inp.buttons = BTN_DASH | BTN_LEFT;
  stepFighter(f, inp, world, R, GATE_FIGHT, ev);
  assert.ok(ev.dodge);
  assert.equal(f.inv, DASH_TICKS + FC_DODGE_INV_EXTRA);
  assert.equal(f.st, FC_ST_MAX - FC_DODGE_COST);
  inp.buttons = BTN_LEFT;
  for (let i = 0; i < DASH_TICKS + FC_DODGE_INV_EXTRA; i++) stepFighter(f, inp, world, R, GATE_FIGHT, ev);
  assert.equal(f.inv, 0);
  assert.ok(f.s.x < -2.5, `ушёл влево: ${f.s.x.toFixed(2)}`);
});

test('выносливость: тяжёлые подряд — кончается, удар не начинается, потом восстанавливается', () => {
  const f = fighter();
  let winded = false;
  const inp = makeInput();
  const ev = makeFightEvents();
  for (let t = 0; t < 400 && !winded; t++) {
    inp.buttons = t % 2 === 0 ? BTN_ADS : 0;
    stepFighter(f, inp, world, R, GATE_FIGHT, ev);
    if (ev.winded) winded = true;
  }
  assert.ok(winded, 'выдохся');
  assert.ok(f.st < MOVES[FA_HEAVY].cost);
  run(f, 0, 6 * TICK_RATE);
  assert.equal(f.st, FC_ST_MAX, 'отдышался');
});

test('захват: активен после замаха; держит — бросок по нажатию не раньше FC_HOLD_MIN', () => {
  const f = fighter();
  const inp = makeInput();
  const ev = makeFightEvents();
  inp.buttons = BTN_USE;
  stepFighter(f, inp, world, R, GATE_FIGHT, ev);
  assert.equal(f.act, FA_GRAB);
  inp.buttons = 0;
  let grabAt = -1;
  for (let t = 1; t < 10; t++) {
    stepFighter(f, inp, world, R, GATE_FIGHT, ev);
    if (ev.grab) grabAt = t;
  }
  assert.equal(grabAt, MOVES[FA_GRAB].w);
  // сервер поймал соперника 7
  f.act = FA_HOLD;
  f.actT = 0;
  f.grab = 7;
  let threw = 0;
  for (let t = 1; t <= FC_HOLD_MIN + 2 && !threw; t++) {
    inp.buttons = t % 2 === 1 ? BTN_USE : 0;
    stepFighter(f, inp, world, R, GATE_FIGHT, ev);
    if (ev.throwAt) threw = t;
  }
  assert.ok(threw >= FC_HOLD_MIN, `бросок не раньше ${FC_HOLD_MIN}: ${threw}`);
  assert.equal(f.act, FA_THROW);
  assert.equal(f.grab, 0);
});

test('край ринга: в толпу не уйти, влетел быстро — отпихнули обратно', () => {
  const f = fighter(0, 0, -Math.PI / 2);
  run(f, BTN_FORWARD, 3 * TICK_RATE, -Math.PI / 2);
  assert.ok(Math.hypot(f.s.x, f.s.z) <= R - 0.42 + 1e-9, 'упёрся в толпу');
  const g = fighter(R - 1, 0);
  g.s.vx = 12;
  g.s.grounded = 0;
  g.s.vy = 1;
  const inp = makeInput();
  const ev = makeFightEvents();
  let shoved = false;
  for (let i = 0; i < 10; i++) {
    stepFighter(g, inp, world, R, GATE_FIGHT, ev);
    if (ev.shove) shoved = true;
  }
  assert.ok(shoved);
  assert.ok(g.s.vx < 0, 'летит обратно в ринг');
});

test('вступление: в углу стоит, не бьёт', () => {
  const f = fighter(1, 1);
  const strikes = run(f, BTN_FORWARD | BTN_FIRE, 30, 0, GATE_FROZEN);
  assert.deepEqual(strikes, []);
  assert.ok(Math.abs(f.s.z - 1) < 1e-9 && Math.abs(f.s.x - 1) < 1e-9);
});

test('предсказание: тот же ввод — то же состояние бит в бит (и копия равна оригиналу)', () => {
  const a = fighter(0.5, -1, 0.3);
  const b = fighter(0.5, -1, 0.3);
  const rng = makeRng(42);
  const inp = makeInput();
  const ev = makeFightEvents();
  const btns = [0, BTN_FIRE, BTN_ADS, BTN_USE, BTN_DASH, BTN_BLOCK, BTN_FORWARD, BTN_LEFT];
  for (let t = 0; t < 2000; t++) {
    inp.buttons = btns[Math.floor(rng() * btns.length)] | (rng() < 0.5 ? BTN_FORWARD : 0);
    inp.yaw = Math.fround((rng() - 0.5) * 6);
    stepFighter(a, inp, world, R, GATE_FIGHT, ev);
    stepFighter(b, inp, world, R, GATE_FIGHT, ev);
    // сервер изредка бьёт обоих одинаково
    if (t % 97 === 0) {
      const o = makeHitOut();
      applyHit(a, FA_JAB, 0.6, 0.8, false, o);
      applyHit(b, FA_JAB, 0.6, 0.8, false, o);
      if (a.ko) {
        freshFighter(a, 0, 0, 0);
        freshFighter(b, 0, 0, 0);
      }
    }
  }
  assert.ok(fightersEqual(a, b));
  const c = copyFighter(makeFighter(), a);
  assert.ok(fightersEqual(a, c));
  c.st--;
  assert.ok(!fightersEqual(a, c));
});

test('свет: до начала — весь ринг, потом мигает, сужается по ступеням, в конце — FC_ZONE_MIN', () => {
  const z = makeZone();
  zoneAt(R, false, 0, z);
  assert.equal(z.r, R);
  assert.equal(z.stage as number, 0);
  zoneAt(R, false, FC_ZONE_START_DUEL + 10, z);
  assert.equal(z.r, R);
  assert.ok(z.warn, 'лампы мигают');
  zoneAt(R, false, FC_ZONE_START_DUEL + FC_ZONE_WARN + FC_ZONE_SHRINK / 2, z);
  assert.ok(z.r < R && z.r > R * 0.74 && z.stage === 1, `сужается: ${z.r}`);
  zoneAt(R, false, FC_ZONE_START_DUEL + FC_ZONE_WARN + FC_ZONE_SHRINK + 5, z);
  assert.ok(Math.abs(z.r - R * 0.74) < 1e-9);
  let last = R;
  for (let t = 0; t < 200 * TICK_RATE; t += 30) {
    zoneAt(R, true, t, z);
    assert.ok(z.r <= last + 1e-9, 'только сужается');
    last = z.r;
  }
  assert.equal(last, FC_ZONE_MIN);
  zoneAt(R, true, FC_ZONE_START_FFA - 1, z);
  assert.equal(z.r, R, 'в свалке — с 20-й секунды');
});

test('ринг, углы и места в толпе', () => {
  assert.equal(ringRadius('duel', 2), 5);
  assert.equal(ringRadius('team', 4), 6);
  assert.ok(ringRadius('ffa', 8) <= 7.6 && ringRadius('ffa', 3) < ringRadius('ffa', 8));
  const a = cornerSpot('duel', 0, 2, 5);
  const b = cornerSpot('duel', 1, 2, 5);
  assert.ok(a.x < 0 && b.x > 0, 'друг напротив друга');
  assert.ok(faces(a.yaw, -a.x, -a.z, 0.99) && faces(b.yaw, -b.x, -b.z, 0.99), 'смотрят в центр');
  for (let i = 0; i < 8; i++) {
    const c = cornerSpot('ffa', i, 8, 7.6);
    assert.ok(Math.hypot(c.x, c.z) < 7.6 - 0.42);
  }
  const seen = new Set<string>();
  for (let s = 0; s < 16; s++) {
    const c = crowdSpot(s, 5);
    assert.ok(Math.hypot(c.x, c.z) > 5, 'за краем ринга');
    seen.add(`${c.x.toFixed(2)},${c.z.toFixed(2)}`);
  }
  assert.equal(seen.size, 16);
});

test('хвост снимка: свет, своё состояние боя и строки игроков — туда и обратно', () => {
  const f = fighter(1, 2, 0.5);
  f.yaw = Math.fround(0.5);
  f.hp = 73;
  f.st = 455;
  f.act = FA_HEAVY;
  f.actT = 13;
  f.inv = 3;
  f.block = 0;
  f.held = 0;
  f.grab = 4;
  f.pb = BTN_FIRE | BTN_BLOCK;
  const z = makeZone(3.25);
  z.stage = 2;
  z.warn = true;
  const rows = [{ act: FA_JAB, actT: 4, xf: 1 }, { act: FA_NONE, actT: 0, xf: 6 }];
  const buf = encodeFightTail(z, f, rows);
  const pad = new Uint8Array(buf.length + 7);
  pad.set(buf, 7);
  const out = makeFightTail();
  const g = makeFighter();
  assert.ok(decodeFightTail(pad.buffer, 7, out, g));
  assert.equal(out.zoneR, 3.25);
  assert.equal(out.stage, 2);
  assert.ok(out.warn && out.hasSelf);
  assert.equal(out.n, 2);
  assert.deepEqual(out.rows.slice(0, 2), rows);
  for (const k of ['yaw', 'hp', 'st', 'act', 'actT', 'inv', 'block', 'grab', 'pb'] as const) assert.equal(g[k], f[k], k);
  // зритель: без своего состояния
  const spec = encodeFightTail(z, null, rows);
  const o2 = makeFightTail();
  assert.ok(decodeFightTail(spec.buffer as ArrayBuffer, 0, o2, makeFighter()));
  assert.ok(!o2.hasSelf);
  assert.ok(!decodeFightTail(spec.buffer.slice(0, 3) as ArrayBuffer, 0, o2, makeFighter()), 'обрезанный — битый');
});

test('жетоны: участие, победа заметно больше, места свалки, нокауты с потолком', () => {
  const lose = fightReward({ mode: 'duel', won: false, place: 2, fighters: 2, kos: 0 });
  const win = fightReward({ mode: 'duel', won: true, place: 1, fighters: 2, kos: 2 });
  assert.ok(lose.total >= 8 && lose.total <= 14, `проигравшему ~12: ${lose.total}`);
  assert.ok(win.total >= 2 * lose.total, `победителю заметно больше: ${win.total}`);
  assert.ok(fightReward({ mode: 'team', won: true, place: 1, fighters: 4, kos: 0 }).win > 0);
  const ffa = (place: number, fighters: number) => fightReward({ mode: 'ffa', won: place === 1, place, fighters, kos: 0 }).win;
  assert.ok(ffa(1, 3) > ffa(2, 5) && ffa(2, 5) > ffa(3, 5) && ffa(3, 5) > 0);
  assert.equal(ffa(2, 3), 0, 'втрой второе место не награждается');
  assert.equal(ffa(4, 8), 0);
  assert.equal(fightReward({ mode: 'ffa', won: false, place: 5, fighters: 8, kos: 99 }).kos, 6, 'потолок за нокауты');
  assert.equal(fightReward({ mode: 'ffa', won: true, place: 1, fighters: 8, kos: 0, dmg: 0 }).total, 0, 'ни одного попадания — жетонов нет');
  assert.ok(fightReward({ mode: 'ffa', won: true, place: 1, fighters: 8, kos: 0, dmg: 12 }).total > 0);
  // сильный против ботов в свалке (бой ~1,5 мин): не больше ~15 в минуту
  assert.ok(fightReward({ mode: 'ffa', won: true, place: 1, fighters: 8, kos: 7, dmg: 300 }).total <= 26);
});
