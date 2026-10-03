// «Портовая регата»: трасса (вдали от баркаса, «Ласточки», аквапарка, в пределах снимка), физика (точная арифметика,
// предсказание = сервер), бюджет шагов (пачки входов и пауза связи не дают лишних шагов), ворота по порядку и флажки
// раз за круг, полный заезд с ботами на сервере, одна выплата, «Ещё!», сошедший остаётся в итогах.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ridePose, BOAT_RIDE_TICKS } from '../shared/boat.ts';
import { ACT_NONE, ACT_REGATTA, KART_CHECK_EVERY } from '../shared/lobby.ts';
import { BOAT_RACE_CIRCLE } from '../shared/maps/lobby.ts';
import { encodeInputs } from '../shared/protocol.ts';
import {
  MSG_REGATTA, RG_GATHER_TICKS, RG_GRID_TICKS, RG_MIN_BOATS, RG_REMATCH_TICKS, RG_RESULTS_TICKS, decodeRegatta, encodeRegatta, regattaReward,
  withRegattaSelf, type RgDecoded,
} from '../shared/regatta.ts';
import { RG_LAPS, regattaCourse } from '../shared/regattacourse.ts';
import { RG_KEYS, makeRgBoat, makeRgEvents, placeRgBoat, stepRgBoat } from '../shared/regattaphysics.ts';
import { BTN_FORWARD, BTN_RELOAD, BTN_USE, makeInput, type Input } from '../shared/sim.ts';
import { locateAny, makeLoc } from '../shared/track.ts';
import { InputQueue } from '../server/inputs.ts';
import { StepBudget } from '../server/lobby/regatta.ts';
import { RgBot } from '../server/lobby/regattabot.ts';
import { makeRng } from '../shared/math.ts';
import type { Client, Hub } from '../server/hub.ts';
import { allOf, lastOf, login, placeAt, setupHub, steps } from './kit.ts';

const c = regattaCourse();

test('трасса: коридор в бухте, в пределах снимка, вдали от баркаса, Семёна, отмели, аквапарка и «Ласточки»', () => {
  const tr = c.track;
  assert.ok(tr.length > 430 && tr.length < 490, `круг ${tr.length.toFixed(0)} м`);
  // Ласточка (по всему пути), баркас (−60, 85), лодка Семёна (мостки у маяка → баркас), отмель с крабами, аквапарк (x < −30)
  const las: Array<{ x: number; z: number }> = [];
  for (let t = 0; t <= BOAT_RIDE_TICKS; t += 10) las.push({ ...ridePose(t) });
  const seg = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => {
    const ex = bx - ax, ez = bz - az, u = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    return Math.hypot(x - ax - ex * u, z - az - ez * u);
  };
  for (let i = 0; i < tr.n; i++) {
    const x = tr.px[i], z = tr.pz[i], hw = tr.hw[i];
    assert.ok(Math.abs(x) + hw < 128 && Math.abs(z) + hw < 128, `точка ${i} за пределами снимка`);
    assert.ok(z - hw > 23, `точка ${i}: коридор у причала (z ${z.toFixed(1)})`);
    assert.ok(Math.hypot(x + 60, z - 85) - hw > 60, `точка ${i}: близко к баркасу`);
    assert.ok(seg(x, z, -16, 38, -60, 85) - hw > 30, `точка ${i}: близко к пути лодки Семёна`);
    assert.ok(x - hw > -30, `точка ${i}: в аквапарке`);
    for (const p of las) assert.ok(Math.hypot(x - p.x, z - p.z) - hw > 3, `точка ${i}: «Ласточка» проходит сквозь коридор (${p.x.toFixed(0)}, ${p.z.toFixed(0)})`);
  }
  // разные части коридора не слипаются (иначе срезали бы через канат)
  for (let i = 0; i < tr.n; i += 2) {
    for (let j = i + 2; j < tr.n; j += 2) {
      const ds = Math.min(Math.abs(tr.s[i] - tr.s[j]), tr.length - Math.abs(tr.s[i] - tr.s[j]));
      if (ds < 60) continue;
      assert.ok(Math.hypot(tr.px[i] - tr.px[j], tr.pz[i] - tr.pz[j]) - tr.hw[i] - tr.hw[j] > 3, `части коридора ${i} и ${j} слиплись`);
    }
  }
  assert.equal(c.gates.length, 6);
  assert.equal(c.flags.length, 5);
});

test('трасса: решётка, флажки и места после R — в коридоре и не в камнях', () => {
  const clear = (x: number, z: number, what: string) => {
    for (const o of c.obstacles) {
      const ex = o.bx - o.ax, ez = o.bz - o.az, ll = ex * ex + ez * ez;
      const u = ll > 0 ? Math.max(0, Math.min(1, ((x - o.ax) * ex + (z - o.az) * ez) / ll)) : 0;
      assert.ok(Math.hypot(x - o.ax - ex * u, z - o.az - ez * u) > o.r + 2.4, `${what}: в камне (${o.kind})`);
    }
    const l = locateAny(c.track, x, z, makeLoc());
    assert.ok(Math.abs(l.lat) < l.hw - 1, `${what}: вне коридора`);
  };
  c.grid.forEach((g, i) => clear(g.x, g.z, `решётка ${i}`));
  c.gates.forEach((g, i) => clear(g.rx, g.rz, `ворота ${i}`));
  c.flags.forEach((f, i) => {
    const l = locateAny(c.track, f.x, f.z, makeLoc());
    assert.ok(Math.abs(l.lat) - f.hw + 0.4 < l.hw - 0.95 + 1e-6, `флажки ${i}: просвет за канатом`);
  });
});

test('в общей физике регаты — только точная арифметика (без Math.sin, atan2, ** и т. п.)', () => {
  for (const f of ['shared/regattacourse.ts', 'shared/regattaphysics.ts']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const bad = src.match(/Math\.(?:a?sinh?|a?cosh?|a?tanh?|atan2|exp|expm1|log|log1p|log2|log10|pow|hypot|cbrt|random)\b|\*\*/g);
    assert.equal(bad, null, `${f}: ${bad}`);
  }
});

/** Бот ведёт катер до финиша; возвращает шаги и события. */
function drive(level: number, seed: number, slot: number) {
  const s = makeRgBoat(), ev = makeRgEvents();
  placeRgBoat(s, c, slot);
  const bot = new RgBot(c, level, makeRng(seed));
  let t = 0, flags = 0, laps = 0;
  while (!s.done && t < 60 * 240) {
    stepRgBoat(s, bot.input(s, t, 0), c, ev, true, bot.topMul);
    t++;
    if (ev.flag >= 0) flags++;
    if (ev.lap || ev.finish) laps++;
  }
  return { s, t, flags, laps };
}

test('ботами любой силы трасса проходится: три круга, круг ~30–45 с, флажки берутся', () => {
  for (const level of [0, 1, 2]) {
    for (const seed of [3, 11]) {
      const r = drive(level, seed, seed % 6);
      assert.equal(r.s.done, 1, `бот ${level}/${seed} не доехал`);
      assert.equal(r.laps, RG_LAPS);
      assert.ok(r.t > 3 * 25 * 60 && r.t < 3 * 50 * 60, `бот ${level}: ${(r.t / 60).toFixed(0)} с`);
      assert.ok(r.s.best > 25 * 60 && r.s.best < 48 * 60, `лучший круг ${(r.s.best / 60).toFixed(1)} с`);
      assert.ok(r.flags >= 1, 'флажки');
    }
  }
});

test('предсказание = сервер: тот же катер по тем же входам бит в бит; R — к последним воротам', () => {
  const a = makeRgBoat(), b = makeRgBoat(), ev = makeRgEvents();
  placeRgBoat(a, c, 2);
  placeRgBoat(b, c, 2);
  const bot = new RgBot(c, 2, makeRng(5));
  const inputs: Input[] = [];
  for (let t = 0; t < 60 * 50; t++) {
    const inp = { ...bot.input(a, t, 0) };
    inputs.push(inp);
    stepRgBoat(a, inp, c, ev, true);
  }
  for (const inp of inputs) stepRgBoat(b, inp, c, ev, true);
  for (const k of RG_KEYS) assert.equal(b[k], a[k], k);
  assert.ok(a.lap >= 2, 'за 50 с проехал круг');
  // R: к последним пройденным воротам, носом по ходу, «призраком»; повторно — не раньше чем через 3 с
  const cp = a.cp, lap = a.lap;
  stepRgBoat(a, { ...makeInput(), buttons: BTN_RELOAD }, c, ev, true);
  assert.ok(ev.respawn);
  assert.equal(a.cp, cp);
  assert.equal(a.lap, lap);
  assert.ok(Math.hypot(a.x - c.gates[cp].rx, a.z - c.gates[cp].rz) < 1e-9 && a.ghost > 0 && Math.hypot(a.vx, a.vz) === 0);
  stepRgBoat(a, { ...makeInput(), buttons: 0 }, c, ev, true);
  stepRgBoat(a, { ...makeInput(), buttons: BTN_RELOAD }, c, ev, true);
  assert.equal(ev.respawn, false);
});

test('ворота — только по порядку; флажки — раз за круг; удачный старт и «захлебнулся»', () => {
  const s = makeRgBoat(), ev = makeRgEvents();
  placeRgBoat(s, c, 0);
  // перенесли за вторые ворота, минуя первые: не засчитано
  const g2 = c.gates[2];
  s.x = g2.x - g2.tx * 2;
  s.z = g2.z - g2.tz * 2;
  s.hx = g2.tx;
  s.hz = g2.tz;
  s.vx = g2.tx * 10;
  s.vz = g2.tz * 10;
  s.go = 1;
  s.seg = locateAny(c.track, s.x, s.z, makeLoc()).seg;
  for (let i = 0; i < 30; i++) stepRgBoat(s, { ...makeInput(), buttons: BTN_FORWARD }, c, ev, true);
  assert.equal(s.cp, 0, 'вторые ворота без первых не считаются');
  // флажки F1: проходит — ускорение; назад и снова — уже нет
  const f = c.flags[0];
  const t = makeRgBoat();
  placeRgBoat(t, c, 0);
  t.go = 1;
  t.x = f.x - f.tx * 3;
  t.z = f.z - f.tz * 3;
  t.hx = f.tx;
  t.hz = f.tz;
  t.vx = f.tx * 12;
  t.vz = f.tz * 12;
  let took = 0;
  for (let i = 0; i < 30; i++) {
    stepRgBoat(t, { ...makeInput(), buttons: BTN_FORWARD }, c, ev, true);
    if (ev.flag === 0) took++;
  }
  assert.equal(took, 1);
  assert.ok(t.boost > 0 && t.boostTop >= 25);
  t.x = f.x - f.tx * 3;
  t.z = f.z - f.tz * 3;
  for (let i = 0; i < 30; i++) {
    stepRgBoat(t, { ...makeInput(), buttons: BTN_FORWARD }, c, ev, true);
    if (ev.flag === 0) took++;
  }
  assert.equal(took, 1, 'та же пара второй раз за круг — без ускорения');
  // старт: газ за 0,2 с до сигнала — ускорение; держал газ 2 с — мотор захлебнулся
  for (const [held, want] of [[12, 1], [120, -1], [0, 0]] as const) {
    const b = makeRgBoat();
    placeRgBoat(b, c, 1);
    for (let i = 0; i < 200; i++) stepRgBoat(b, { ...makeInput(), buttons: i >= 200 - held ? BTN_FORWARD : 0 }, c, ev, false);
    stepRgBoat(b, { ...makeInput(), buttons: BTN_FORWARD }, c, ev, true);
    assert.equal(ev.start, want, `газ ${held} тиков до старта`);
  }
});

/** Шагов и путь катера по тем же 600 входам, пришедшим пачками по n (и с паузой связи 0,5 с). */
function budgetRun(batch: number, pause: boolean): { steps: number; x: number } {
  const q = new InputQueue();
  const budget = new StepBudget();
  const last = makeInput();
  const s = makeRgBoat(), ev = makeRgEvents();
  placeRgBoat(s, c, 0);
  s.go = 1;
  let steps = 0;
  const pending: Input[] = [];
  const total = 600;
  let tick = 0;
  let sent = 0;
  for (; tick < total + 80; tick++) {
    if (sent < total) {
      const inp = makeInput();
      inp.seq = ++sent;
      inp.buttons = BTN_FORWARD;
      inp.viewTick = tick;
      pending.push(inp);
    }
    const stalled = pause && tick >= 200 && tick < 230;
    if (!stalled && (pending.length >= batch || sent === total)) {
      q.push(pending, pending.length, 120);
      pending.length = 0;
    }
    budget.run(q, last, (inp) => {
      stepRgBoat(s, inp, c, ev, true);
      steps++;
    });
    if (sent === total && q.ack === total && pending.length === 0) break;
  }
  return { steps, x: s.rt };
}

test('бюджет шагов: пачки по 1, 4, 8 входов и пауза связи 0,5 с — столько же шагов, сколько входов (±1 %)', () => {
  const base = budgetRun(1, false);
  assert.equal(base.steps, 600);
  for (const [batch, pause] of [[4, false], [8, false], [1, true], [4, true]] as const) {
    const r = budgetRun(batch, pause);
    assert.ok(Math.abs(r.steps - 600) <= 6, `пачки по ${batch}${pause ? ' и пауза' : ''}: ${r.steps} шагов`);
  }
  // ускоренный клиент (по 2 входа в тик) не обгоняет время: шагов — не больше тиков с запасом бюджета
  const q = new InputQueue(), budget = new StepBudget(), last = makeInput();
  let n = 0, seq = 0;
  for (let tick = 0; tick < 300; tick++) {
    const two = [0, 1].map(() => ({ ...makeInput(), seq: ++seq, viewTick: tick, buttons: BTN_FORWARD }));
    q.push(two, 2, 120);
    budget.run(q, last, () => n++);
  }
  assert.ok(n <= 300 + 4, `ускоренный клиент: ${n} шагов за 300 тиков`);
});

test('награда: за минуты на ходу и за место; меньше 20 с на ходу — ничего', () => {
  assert.equal(regattaReward(1, 2 * 60 * 60, true), 22 + 3);
  assert.equal(regattaReward(3, 2 * 60 * 60, true), 22 + 1);
  assert.equal(regattaReward(4, 2 * 60 * 60, true), 22);
  assert.equal(regattaReward(0, 2 * 60 * 60, false), 22);
  assert.equal(regattaReward(1, 10 * 60 * 60, true), 33 + 3);
  assert.equal(regattaReward(1, 15 * 60, true), 0);
});

test('двоичное «где катера»: общая часть всем, гонщику — точное состояние своего катера', () => {
  const s = makeRgBoat();
  placeRgBoat(s, c, 3);
  s.vx = 1 / 3;
  s.steer = -0.7;
  const common = encodeRegatta(1234, [{ id: 3, slot: 7, x: s.x, z: s.z, y: 0.5, hx: s.hx, hz: s.hz, speed: 12.25, steer: -0.7, fl: 5, lap: 2, cp: 4, place: 1, hits: 300 }]);
  const out: RgDecoded = { tick: 0, n: 0, boats: [], self: false, ack: 0, reset: 0, state: makeRgBoat() };
  assert.equal(decodeRegatta(common.buffer, out), 1);
  assert.equal(out.tick, 1234);
  assert.equal(out.self, false);
  const b = out.boats[0];
  assert.deepEqual([b.id, b.slot, b.lap, b.cp, b.place, b.fl, b.hits], [3, 7, 2, 4, 1, 5, 300 & 255]);
  assert.ok(Math.abs(b.x - s.x) < 1e-4 && Math.abs(b.speed - 12.25) < 0.01 && Math.abs(b.steer + 0.7) < 0.01);
  const mine = withRegattaSelf(common, 777, 3, s);
  assert.equal(mine[0], MSG_REGATTA);
  assert.equal(decodeRegatta(mine.buffer, out), 1);
  assert.ok(out.self);
  assert.equal(out.ack, 777);
  assert.equal(out.reset, 3);
  for (const k of RG_KEYS) assert.equal(out.state[k], s[k], k);
});

// ------------------------------------------------------------ на сервере, целиком

const seqOf = new WeakMap<Client, number>();
function send(hub: Hub, cl: Client, buttons: number): void {
  const seq = (seqOf.get(cl) ?? 0) + 1;
  seqOf.set(cl, seq);
  const inp = makeInput();
  inp.seq = seq;
  inp.buttons = buttons;
  inp.viewTick = hub.lobby.tick;
  hub.onBinary(cl, encodeInputs([inp], 0, 1, cl.epoch));
}

/** Гонщик-человек на автопилоте (тот же бот, по состоянию своего катера на сервере). */
function pilot(hub: Hub, cl: Client, bot: RgBot, buttons = 0): void {
  const p = hub.lobby.playerOf(cl)!;
  const s = hub.lobby.regatta!.state(p);
  const d = hub.lobby.regatta!.debug();
  send(hub, cl, s ? bot.input(s, hub.lobby.tick, d.phase === 'grid' ? d.start - hub.lobby.tick : 0).buttons | buttons : buttons);
}

function gather(hub: Hub, who: Client[]): void {
  who.forEach((cl, i) => placeAt(hub, cl, BOAT_RACE_CIRCLE.x + (i % 2) * 0.8, BOAT_RACE_CIRCLE.z + (i >> 1) * 0.6));
  for (let i = 0; i < RG_GATHER_TICKS + KART_CHECK_EVERY * 2; i++) {
    for (const cl of who) send(hub, cl, 0);
    hub.step();
  }
}

test('регата на набережной: круг сбора → катер на решётке (+боты до 4) → три круга → итоги, награда — один раз', () => {
  const { hub } = setupHub({ boatrace: true });
  const a = login(hub, 'Pilot');
  const before = a.c.profile!.tokens;
  gather(hub, [a.c]);
  const p = hub.lobby.playerOf(a.c)!;
  assert.equal(a.c.room?.kind, 'lobby', 'гонка — в том же мире');
  assert.equal(p.action, ACT_REGATTA);
  const d = hub.lobby.regatta!.debug();
  assert.equal(d.phase, 'grid');
  assert.equal(d.boats.length, RG_MIN_BOATS);
  assert.equal(d.boats.filter(b => b.bot).length, RG_MIN_BOATS - 1);
  assert.equal(hub.health().boatrace, 1);
  assert.ok(hub.health().busy >= 1);
  const view = lastOf(a.s, 'rg');
  assert.equal(view?.v.phase, 'grid');
  // двоичное «где катера» — всем, гонщику — со своим состоянием
  const bin = a.s.bins.filter(bb => bb[0] === MSG_REGATTA).at(-1)!;
  const out: RgDecoded = { tick: 0, n: 0, boats: [], self: false, ack: 0, reset: 0, state: makeRgBoat() };
  assert.equal(decodeRegatta(bin.buffer as ArrayBuffer, out), RG_MIN_BOATS);
  assert.ok(out.self);
  // шагом из катера не выйти
  const bot = new RgBot(hub.lobby.regatta!.course, 2, makeRng(9));
  let guard = 0;
  while (hub.lobby.regatta!.debug().phase !== 'results' && guard++ < 60 * 300) {
    pilot(hub, a.c, bot);
    hub.step();
  }
  assert.equal(hub.lobby.regatta!.debug().phase, 'results');
  const res = lastOf(a.s, 'rg')!.v;
  assert.equal(res.phase, 'results');
  const mine = res.rows.find(r => r.pid === a.c.pid)!;
  assert.ok(mine.finished, 'доехал');
  assert.ok(mine.reward > 0);
  assert.equal(a.c.profile!.stats.brRaces, 1);
  assert.ok(a.c.profile!.stats.brBestLapHarbor > 0, 'личный лучший круг новой трассы');
  assert.equal(a.c.profile!.stats.brBestLap, 0, 'старое поле не трогаем');
  assert.equal(a.c.profile!.tokens, before + mine.reward);
  assert.ok(hub.store.state.regatta.length >= 1, 'круг на доске бухты');
  // итоги без «Ещё!» — на площадь у круга, катера убраны; награда не повторяется
  steps(hub, RG_RESULTS_TICKS + 2);
  assert.equal(hub.lobby.regatta!.phase, 'idle');
  assert.equal(p.action, ACT_NONE);
  assert.ok(Math.hypot(p.state.x - BOAT_RACE_CIRCLE.x, p.state.z - BOAT_RACE_CIRCLE.z) > BOAT_RACE_CIRCLE.r);
  assert.ok(p.state.z < 22, 'на площади, не в воде');
  assert.equal(a.c.profile!.stats.brRaces, 1);
  assert.equal(a.c.profile!.tokens, before + mine.reward);
});

test('«Ещё!»: E после итогов — через 5 с снова на решётке; не нажавший — на площадь; сошедший — в итогах', () => {
  const { hub } = setupHub({ boatrace: true });
  const a = login(hub, 'Again'), b = login(hub, 'Leaver'), c2 = login(hub, 'Stay');
  gather(hub, [a.c, b.c, c2.c]);
  assert.equal(hub.lobby.regatta!.humans, 3);
  // гонка: один сходит посреди заезда (вышел из игры) — строка «сошёл» остаётся, заезд засчитан без награды
  const bots = [a, b, c2].map((_, i) => new RgBot(hub.lobby.regatta!.course, 2, makeRng(20 + i)));
  for (let i = 0; i < RG_GRID_TICKS + 60 * 20; i++) {
    [a, b, c2].forEach((pl, k) => pilot(hub, pl.c, bots[k]));
    hub.step();
  }
  hub.disconnect(b.c);
  assert.equal(b.c.profile!.stats.brRaces, 1);
  let guard = 0;
  while (hub.lobby.regatta!.debug().phase !== 'results' && guard++ < 60 * 300) {
    pilot(hub, a.c, bots[0]);
    pilot(hub, c2.c, bots[2]);
    hub.step();
  }
  const res = lastOf(a.s, 'rg')!.v;
  const gone = res.rows.find(r => r.nick === 'Leaver');
  assert.ok(gone?.left, 'сошедший — в итогах');
  // E — «Ещё!»: только у первого
  send(hub, a.c, BTN_USE);
  hub.step();
  assert.deepEqual(lastOf(a.s, 'rg')!.v.again.length, 1);
  for (let i = 0; i < RG_REMATCH_TICKS + 2; i++) {
    send(hub, a.c, 0);
    send(hub, c2.c, 0);
    hub.step();
  }
  const d = hub.lobby.regatta!.debug();
  assert.equal(d.phase, 'grid', 'новый заезд');
  assert.equal(d.boats.filter(x => !x.bot).length, 1);
  assert.equal(hub.lobby.playerOf(a.c)!.action, ACT_REGATTA);
  assert.equal(hub.lobby.playerOf(c2.c)!.action, ACT_NONE, 'не нажал — на площади');
  // одна выплата за заезд у каждого
  assert.equal(a.c.profile!.stats.brRaces, 1);
  assert.equal(c2.c.profile!.stats.brRaces, 1);
  assert.equal(allOf(a.s, 'rgFin').length, 1);
});

test('сойти на берег: «rg quit» — на площадь; ушли все — вода пустая', () => {
  const { hub } = setupHub({ boatrace: true });
  const a = login(hub, 'Quitter');
  gather(hub, [a.c]);
  steps(hub, RG_GRID_TICKS + 30);
  hub.onJson(a.c, { t: 'rg', a: 'quit' });
  const p = hub.lobby.playerOf(a.c)!;
  assert.equal(p.action, ACT_NONE);
  assert.equal(hub.lobby.regatta!.phase, 'idle');
  assert.equal(hub.health().boatrace, 0);
  // флаг выключен — ни круга, ни регаты
  const off = setupHub();
  const z = login(off.hub, 'NoFlag');
  assert.equal(off.hub.lobby.regatta, null);
  assert.equal(lastOf(z.s, 'lobby')?.regatta, undefined);
});
