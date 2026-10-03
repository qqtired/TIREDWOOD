// «Крепость» на сервере: волны, ворота, кристалл, выстрел с откатом, липучки, пузыри, лавка, поражение, победа и жетоны.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RIG_PB, cameraRig } from '../shared/aim.ts';
import { TICK_RATE } from '../shared/constants.ts';
import {
  BREAK_TICKS, CRYSTAL_HP, FIX_PRICE, FORT_RESPAWN_TICKS, FORT_WAVES, FT_BREAK, FT_END, FT_GATHER, FT_WAVE, GATE_HP, JAM_SLOW, START_PTS,
  TURRET_PRICE, WAVE_PTS, ZK, ZS_CLIMB, ZS_DROP, ZS_TOP, ZS_WALK, Z_BLOATER, Z_CLIMBER, Z_WALKER, type FortEvent, type FtReward,
} from '../shared/fort.ts';
import { CHUTES, GATE, TERRACE, insideFort } from '../shared/fortmap.ts';
import { FT_TOK_WIN, waveTokens } from '../shared/fortwaves.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { BTN_FIRE, type Input } from '../shared/sim.ts';
import { FortGame, type FortPlayer } from '../server/fort/game.ts';
import type { Sink } from '../server/paintball/game.ts';

function sink(): Sink & { msgs: ServerMsg[] } {
  const msgs: ServerMsg[] = [];
  return { msgs, sendBinary() {}, sendJson(m) { msgs.push(m); }, close() {} };
}

function events(s: { msgs: ServerMsg[] }): FortEvent[] {
  return s.msgs.filter((m): m is Extract<ServerMsg, { t: 'fev' }> => m.t === 'fev').flatMap((m) => m.e);
}

function setup(): { game: FortGame; s: ReturnType<typeof sink>; p: FortPlayer } {
  const game = new FortGame();
  const s = sink();
  const p = game.addHuman({ pid: 1, nick: 'Комендант', outfit: DEFAULT_OUTFIT }, s)!;
  return { game, s, p };
}

/** Волна без расписания: зомби выпускает сам тест */
function manualWave(game: FortGame): void {
  game.phase = FT_WAVE;
  game.wave = Math.max(1, game.wave);
}

function until(game: FortGame, cond: () => boolean, limit: number, what: string): number {
  for (let i = 0; i < limit; i++) {
    if (cond()) return i;
    game.step();
  }
  assert.fail(`не дождались: ${what}`);
}

test('сбор → волна 1: зомби выходят по расписанию; всех сбили — передышка и очки за волну', () => {
  const { game, s, p } = setup();
  assert.equal(game.phase, FT_GATHER);
  assert.equal(p.pts, START_PTS);
  game.phaseEnd = game.tick + 1;
  game.step();
  assert.equal(game.phase, FT_WAVE);
  assert.equal(game.wave, 1);
  assert.ok(game.horde.left >= 12, `в первой волне ${game.horde.left}`);
  // сбиваем каждого, кто вышел
  until(game, () => {
    for (const z of game.horde.zombies) if (z.alive) game.horde.damage(z, 999, p.id, false, z.x, z.y + 1, z.z);
    return game.phase !== FT_WAVE;
  }, 60 * TICK_RATE, 'конец волны');
  assert.equal(game.phase, FT_BREAK);
  assert.equal(p.waves, 1);
  assert.equal(p.kills, 16);
  assert.equal(p.pts, START_PTS + WAVE_PTS + 16 * ZK[Z_WALKER].pts);
  assert.ok(s.msgs.some((m) => m.t === 'fphase' && m.phase === FT_BREAK));
  assert.equal(game.phaseEnd - game.tick, BREAK_TICKS);
});

test('шаркуны доходят до ворот и ломают их, потом идут во двор и бьют кристалл', () => {
  const { game, s } = setup();
  manualWave(game);
  for (let i = 0; i < 6; i++) game.horde.spawn(Z_WALKER, 1);
  const arrive = until(game, () => game.gate < GATE_HP, 60 * TICK_RATE, 'удар по воротам');
  assert.ok(arrive < 40 * TICK_RATE, `дошли за ${(arrive / TICK_RATE).toFixed(1)} с`);
  // перед створками стоят в зазоре — их видно сверху
  for (const z of game.horde.zombies) if (z.alive && Math.abs(z.x) < GATE.x1) assert.ok(z.z < GATE.face - 0.5);
  game.gate = 1;
  until(game, () => game.gate === 0, 5 * TICK_RATE, 'ворота пали');
  // события уходят со снимками — раз в 2 тика
  game.step();
  game.step();
  assert.ok(events(s).some((e) => e[0] === 'gate' && e[1] === 0));
  // створок нет и для людей: бокс убран
  assert.ok(game.world.minX[game.map.gateBox] > 1e5);
  until(game, () => game.crystal < CRYSTAL_HP, 40 * TICK_RATE, 'удар по кристаллу');
  assert.ok(game.horde.zombies.some((z) => z.alive && insideFort(z.x, z.z)));
});

test('выстрел: зомби откатывается к тому, что видел стрелок', () => {
  for (const rewind of [true, false]) {
    const { game, s, p } = setup();
    manualWave(game);
    p.state.x = 0;
    p.state.y = 0;
    p.state.z = -40;
    const z = game.horde.spawn(Z_WALKER, 1)!;
    z.hp = z.maxHp = 5000;
    const past = new Map<number, number>();
    const moveTo = (i: number) => {
      z.x = -2 + 0.16 * i;
      z.z = -52;
      z.y = 0;
      z.vx = 0;
      z.vz = 0;
    };
    for (let i = 0; i < 24; i++) {
      moveTo(i);
      game.step();
      past.set(game.tick, z.x);
    }
    const seen = game.tick - 10;
    const tx = past.get(seen)!;
    // взгляд: луч камеры над правым плечом — через центр хитбокса там, где зомби был 10 тиков назад
    let yaw = 0;
    let pitch = 0;
    const cam = { x: 0, y: 0, z: 0 };
    for (let k = 0; k < 8; k++) {
      cameraRig(p.state.x, p.state.y, p.state.z, yaw, pitch, RIG_PB, 1, game.world, cam);
      const dx = tx - cam.x;
      const dy = ZK[Z_WALKER].hcy - cam.y;
      const dz = -52 - cam.z;
      yaw = Math.atan2(-dx, -dz);
      pitch = Math.atan2(dy, Math.hypot(dx, dz));
    }
    s.msgs.length = 0;
    const inp: Input = { seq: 5000, buttons: BTN_FIRE, yaw: Math.fround(yaw), pitch: Math.fround(pitch), viewTick: rewind ? seen : game.tick + 1 };
    game.onInputs(p, [inp], 1);
    moveTo(24);
    game.step();
    game.step();
    const ev = events(s);
    assert.ok(ev.some((e) => e[0] === 'shot' && e[1] === p.id), 'выстрел был');
    const hit = ev.some((e) => e[0] === 'zhit' && e[1] === p.id && e[2] === z.id);
    assert.equal(hit, rewind, rewind ? 'с откатом — попал' : 'без отката — мимо (зомби уже ушёл)');
  }
});

test('липучка лезет на стену, стоит на ходу и спрыгивает во двор', () => {
  const { game, s } = setup();
  manualWave(game);
  const z = game.horde.spawn(Z_CLIMBER, 1)!;
  assert.ok(z.climb === 0 || z.climb === 1, 'с севера — на северную стену');
  until(game, () => z.state === ZS_CLIMB, 40 * TICK_RATE, 'подъём');
  assert.ok(!insideFort(z.x, z.z));
  until(game, () => z.state === ZS_TOP, 5 * TICK_RATE, 'на ходу стены');
  game.step();
  game.step();
  assert.ok(events(s).some((e) => e[0] === 'climb' && e[1] === z.id));
  assert.ok(z.y > 3);
  until(game, () => z.state === ZS_DROP, 3 * TICK_RATE, 'прыжок');
  until(game, () => z.state === ZS_WALK, 2 * TICK_RATE, 'во дворе');
  assert.equal(z.y, 0);
  assert.ok(insideFort(z.x, z.z), `во дворе: (${z.x.toFixed(1)}, ${z.z.toFixed(1)})`);
  assert.equal(z.climb, -1);
});

test('пузырь лопается от краски: соседи сбиты на счёт стрелка, воротам достаётся', () => {
  const { game, s, p } = setup();
  manualWave(game);
  const b = game.horde.spawn(Z_BLOATER, 1)!;
  const w1 = game.horde.spawn(Z_WALKER, 1)!;
  const w2 = game.horde.spawn(Z_WALKER, 1)!;
  b.x = 0;
  b.z = GATE.face - 1.5;
  w1.x = 1.2;
  w1.z = GATE.face - 1.5;
  w2.x = -1.2;
  w2.z = GATE.face - 2.2;
  game.horde.damage(b, 999, p.id, false, b.x, 1, b.z);
  const ev = events({ msgs: [{ t: 'fev', k: 0, e: (game as unknown as { events: FortEvent[] }).events }] });
  assert.ok(ev.some((e) => e[0] === 'pop'));
  assert.ok(!w1.alive && !w2.alive, 'соседи лопнули');
  assert.equal(p.kills, 3);
  assert.ok(game.gate < GATE_HP, 'ворота задело');
  game.step();
  game.step();
  assert.ok(events(s).some((e) => e[0] === 'zdie' && e[1] === w1.id && e[2] === p.id));
});

test('человек на земле рядом с зомби — бьют; сбили — через 5 с снова на террасе', () => {
  const { game, s, p } = setup();
  manualWave(game);
  p.state.x = 0;
  p.state.y = 0;
  p.state.z = -45;
  const z = game.horde.spawn(Z_WALKER, 1)!;
  z.x = 0;
  z.z = -48;
  until(game, () => !p.alive, 30 * TICK_RATE, 'игрока сбили');
  game.step();
  game.step();
  const ev = events(s);
  assert.ok(ev.some((e) => e[0] === 'phit' && e[2] === p.id));
  assert.ok(ev.some((e) => e[0] === 'pdown' && e[1] === p.id));
  assert.equal(p.deaths, 1);
  until(game, () => p.alive, FORT_RESPAWN_TICKS + 5, 'снова в строю');
  assert.equal(p.state.y, TERRACE.h);
});

test('лавка: починка ворот, краскомёт стреляет сам, варенье замедляет; колокол — волна раньше', () => {
  const { game, s, p } = setup();
  const station = (kind: string, arg = 0) => game.map.stations.find((st) => st.kind === kind && st.arg === arg)!;
  const stand = (kind: string, arg = 0) => {
    const st = station(kind, arg);
    p.state.x = st.x;
    p.state.y = st.y;
    p.state.z = st.z;
    return st;
  };
  // колокол: один человек — все готовы, волна через 3 с
  game.use(p, stand('bell').id);
  assert.ok(p.ready);
  assert.ok(game.phaseEnd - game.tick <= 3 * TICK_RATE);
  assert.ok(events({ msgs: [{ t: 'fev', k: 0, e: (game as unknown as { events: FortEvent[] }).events }] }).some((e) => e[0] === 'bell'));

  game.gate = GATE_HP - 500;
  p.pts = 1000;
  game.use(p, stand('gate').id);
  assert.equal(game.gate, GATE_HP - 100);
  assert.equal(p.pts, 1000 - FIX_PRICE);

  game.use(p, stand('turret', 1).id);
  assert.ok(game.turrets[1]);
  assert.equal(p.pts, 1000 - FIX_PRICE - TURRET_PRICE);
  // мало очков — отказ
  p.pts = 5;
  game.use(p, stand('turret', 0).id);
  assert.equal(game.turrets[0], null);
  assert.ok(s.msgs.some((m) => m.t === 'toast'));

  // варенье — только во время волны
  manualWave(game);
  p.pts = 100;
  game.use(p, stand('jam', 1).id);
  assert.ok(game.jams[1] > game.tick);
  assert.equal(game.slow(CHUTES[1].px, CHUTES[1].pz), JAM_SLOW);
  assert.equal(game.slow(CHUTES[1].px + 10, CHUTES[1].pz), 1);

  // краскомёт бьёт зомби на дороге перед воротами
  const z = game.horde.spawn(Z_WALKER, 1)!;
  z.hp = z.maxHp = 5000;
  z.x = 2;
  z.z = -26;
  s.msgs.length = 0;
  for (let i = 0; i < 60; i++) game.step();
  assert.ok(events(s).some((e) => e[0] === 'tshot' && e[1] === 1 && e[2] === z.id), 'краскомёт стреляет');
  assert.ok(z.hp < z.maxHp);
});

test('кристалл разбит — поражение; жетоны — только тем, кто отбил волну', () => {
  const results: Array<{ p: FortPlayer; reward: FtReward | null; win: boolean }> = [];
  const game = new FortGame({ result: (p, _row, reward, win) => results.push({ p, reward, win }) });
  const sa = sink();
  const sb = sink();
  const a = game.addHuman({ pid: 1, nick: 'Ветеран', outfit: DEFAULT_OUTFIT }, sa)!;
  const b = game.addHuman({ pid: 2, nick: 'Новичок', outfit: DEFAULT_OUTFIT }, sb)!;
  manualWave(game);
  game.wave = 3;
  a.waves = 2;
  a.run.tokWaves = waveTokens(1) + waveTokens(2);
  b.waves = 0;
  game.gate = 0;
  game.world.setEnabled(game.map.gateBox, false);
  game.crystal = 30;
  for (let i = 0; i < 4; i++) {
    const z = game.horde.spawn(Z_WALKER, 1)!;
    z.x = -3 + i * 2;
    z.z = -2;
  }
  until(game, () => game.phase === FT_END, 30 * TICK_RATE, 'поражение');
  assert.equal(game.crystal, 0);
  const end = sa.msgs.find((m) => m.t === 'fend');
  assert.ok(end && end.t === 'fend' && !end.win);
  assert.equal(results.length, 2);
  const ra = results.find((r) => r.p === a)!;
  const rb = results.find((r) => r.p === b)!;
  assert.ok(ra.reward && ra.reward.waves === waveTokens(1) + waveTokens(2) && !ra.win);
  assert.equal(rb.reward, null);
  assert.ok(sa.msgs.some((m) => m.t === 'fortReward'));
  assert.ok(!sb.msgs.some((m) => m.t === 'fortReward'));
  // итоги показаны — новая игра со сбора, всё целое
  until(game, () => game.phase === FT_GATHER, 20 * TICK_RATE, 'новая игра');
  assert.equal(game.crystal, CRYSTAL_HP);
  assert.equal(game.gate, GATE_HP);
  assert.equal(a.pts, START_PTS);
  assert.equal(game.horde.alive, 0);
});

test(`${FORT_WAVES} волн — победа: жетоны за волны, сбитых и победу`, () => {
  const results: Array<{ reward: FtReward | null; win: boolean; wave: number }> = [];
  const game = new FortGame({ result: (_p, _row, reward, win, wave) => results.push({ reward, win, wave }) });
  const s = sink();
  const p = game.addHuman({ pid: 1, nick: 'Герой', outfit: DEFAULT_OUTFIT }, s)!;
  game.wave = FORT_WAVES - 1;
  game.cleared = FORT_WAVES - 1;
  p.waves = FORT_WAVES - 1;
  game.phaseEnd = game.tick + 1;
  game.step();
  assert.equal(game.wave, FORT_WAVES);
  until(game, () => {
    for (const z of game.horde.zombies) if (z.alive) game.horde.damage(z, 9999, p.id, true, z.x, z.y + 1, z.z);
    return game.phase === FT_END;
  }, 80 * TICK_RATE, 'победа');
  assert.equal(results.length, 1);
  const r = results[0];
  assert.ok(r.win);
  assert.equal(r.wave, FORT_WAVES);
  assert.ok(r.reward);
  assert.equal(r.reward.waves, waveTokens(FORT_WAVES), 'платят за отбитую при нём волну');
  assert.equal(r.reward.win, FT_TOK_WIN);
  assert.ok(r.reward.kills > 0);
  assert.equal(r.reward.mvp, 0, 'один человек — без «лучшего»');
  const end = s.msgs.find((m) => m.t === 'fend');
  assert.ok(end && end.t === 'fend' && end.win);
});
