// Пейнтбол: отхил после 5 с без урона и снайперская AWP на верху центрального креста «Причала».
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Predictor } from '../client/predict.ts';
import { RIG_PB, cameraRig } from '../shared/aim.ts';
import {
  AWP_RADIUS, AWP_RESPAWN_TICKS, HITBOX_CY, JAM_RADIUS, PHASE_PLAY, PHASE_WARMUP, REGEN_DELAY_TICKS, RESPAWN_TICKS, TICK_RATE,
} from '../shared/constants.ts';
import { buildPier } from '../shared/maps/pier.ts';
import type { GameEvent, ServerMsg } from '../shared/messages.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { AWP_LYING, decodeSnapshot, encodeEntities, encodeSnapshot, makeHeader, type EntitySnap } from '../shared/protocol.ts';
import {
  AWP_INTERVAL, AWP_SHOTS, AWP_SWITCH_TICKS, BTN_ADS, BTN_FIRE, MAG_SIZE, copyState, makeEvents, makeState, statesEqual, stepPlayer, type Input,
} from '../shared/sim.ts';
import { CollisionWorld } from '../shared/world.ts';
import { Game, type Player, type Sink } from '../server/paintball/game.ts';

type TestSink = Sink & { msgs: ServerMsg[]; bins: Uint8Array[] };

function sink(): TestSink {
  const msgs: ServerMsg[] = [];
  const bins: Uint8Array[] = [];
  return { msgs, bins, sendBinary(d) { bins.push(d); }, sendJson(m) { msgs.push(m); }, close() {} };
}

function untilPhase(game: Game, phase: number, limit = 20 * TICK_RATE): void {
  for (let i = 0; i < limit && game.phase !== phase; i++) game.step();
  assert.equal(game.phase, phase);
}

function steps(game: Game, n: number): void {
  for (let i = 0; i < n; i++) game.step();
}

let seq = 1;
/** Вход человека на ближайший тик (номера растут — очередь их примет). */
function input(game: Game, p: Player, buttons: number, yaw = 0, pitch = 0): void {
  const inp: Input = { seq: ++seq, buttons, yaw, pitch, viewTick: game.tick };
  game.onInputs(p, [inp], 1);
}

/** Тик с входом. */
function tickWith(game: Game, p: Player, buttons: number, yaw = 0, pitch = 0): void {
  input(game, p, buttons, yaw, pitch);
  game.step();
}

function place(p: Player, x: number, y: number, z: number): void {
  const s = p.state;
  s.x = x;
  s.y = y;
  s.z = z;
  s.vx = 0;
  s.vy = 0;
  s.vz = 0;
}

/** Взгляд, при котором луч камеры (над правым плечом) идёт в центр хитбокса цели. */
function aimAt(game: Game, a: Player, b: Player): [number, number] {
  let yaw = 0;
  let pitch = 0;
  const cam = { x: 0, y: 0, z: 0 };
  for (let k = 0; k < 8; k++) {
    cameraRig(a.state.x, a.state.y, a.state.z, yaw, pitch, RIG_PB, 1, game.world, cam);
    const dx = b.state.x - cam.x;
    const dy = b.state.y + HITBOX_CY - cam.y;
    const dz = b.state.z - cam.z;
    yaw = Math.atan2(-dx, -dz);
    pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }
  return [Math.fround(yaw), Math.fround(pitch)];
}

function eventsOf(s: TestSink): GameEvent[] {
  return s.msgs.filter((m): m is Extract<ServerMsg, { t: 'ev' }> => m.t === 'ev').flatMap((m) => m.e);
}

function chatOf(s: TestSink): string[] {
  return s.msgs.filter((m): m is Extract<ServerMsg, { t: 'chat' }> => m.t === 'chat').map((m) => m.text);
}

/** Двое людей в разных командах, без ботов (при двоих людях ботов не бывает), уже в бою. */
function duel(): { game: Game; A: Player; B: Player; sa: TestSink; sb: TestSink } {
  const game = new Game();
  const sa = sink();
  const sb = sink();
  const A = game.addHuman({ pid: 1, nick: 'Снайпер', outfit: DEFAULT_OUTFIT }, sa)!;
  const B = game.addHuman({ pid: 2, nick: 'Мишень', outfit: DEFAULT_OUTFIT }, sb)!;
  assert.notEqual(A.team, B.team);
  game.botsPerTeam = 0;
  game.balanceBots();
  return { game, A, B, sa, sb };
}

/** Поставить на линию огня: A смотрит на B через 12 м открытого настила (как в test/paintball.test.ts). */
function lineUp(game: Game, A: Player, B: Player): [number, number] {
  place(A, -10, 0, -6);
  place(B, -10, 0, -18);
  for (let i = 0; i < 4; i++) tickWith(game, A, 0);
  return aimAt(game, A, B);
}

function takeAwp(game: Game, p: Player): void {
  const a = game.awp!;
  place(p, a.x, a.y, a.z);
  tickWith(game, p, 0);
}

// ------------------------------------------------------------ отхил

test('отхил: 5 с без урона — по 5 HP в секунду до максимума, броня не растёт; новый урон сбрасывает отсчёт', () => {
  const { game, A, B } = duel();
  untilPhase(game, PHASE_PLAY);
  const [yaw, pitch] = lineUp(game, A, B);
  const hp0 = B.hp;
  for (let i = 0; i < 60 && B.hp > hp0 - 30; i++) tickWith(game, A, BTN_FIRE, yaw, pitch);
  tickWith(game, A, 0, yaw, pitch);
  assert.ok(B.alive, 'мишень жива');
  assert.ok(B.hp <= hp0 - 30, `попадания есть: ${hp0} → ${B.hp}`);
  const hurt = B.hurtTick;
  const hpHurt = B.hp;
  // 5 секунд — ни единицы
  while (game.tick < hurt + REGEN_DELAY_TICKS - 1) {
    game.step();
    assert.equal(B.hp, hpHurt, `тик ${game.tick - hurt} после попадания`);
  }
  game.step();
  assert.equal(B.hp, Math.ceil(hpHurt) + 1, 'ровно через 5 с — первая единица');
  steps(game, 11);
  assert.equal(B.hp, Math.ceil(hpHurt) + 1);
  game.step();
  assert.equal(B.hp, Math.ceil(hpHurt) + 2, 'по единице раз в 12 тиков');
  const h1 = B.hp;
  steps(game, TICK_RATE);
  assert.equal(B.hp, h1 + 5, '5 HP в секунду');

  // новый урон — снова ждать 5 с
  const before = B.hp;
  for (let i = 0; i < 30 && B.hp >= before; i++) tickWith(game, A, BTN_FIRE, yaw, pitch);
  tickWith(game, A, 0, yaw, pitch);
  assert.ok(B.alive && B.hp < before, 'попали снова');
  const armor = B.armor;
  const hurt2 = B.hurtTick;
  const hpHurt2 = B.hp;
  while (game.tick < hurt2 + REGEN_DELAY_TICKS - 1) {
    game.step();
    assert.equal(B.hp, hpHurt2);
  }
  game.step();
  assert.equal(B.hp, Math.ceil(hpHurt2) + 1);

  // до максимума (с бонусом автомата) — и не выше; броня та же
  for (let i = 0; i < 40 * TICK_RATE && B.hp < B.maxHp; i++) game.step();
  assert.equal(B.hp, B.maxHp);
  steps(game, 3 * TICK_RATE);
  assert.equal(B.hp, B.maxHp, 'выше максимума не растёт');
  assert.equal(B.armor, armor, 'броня не восстанавливается');
});

test('отхил: лопнувший не лечится, после появления — полное здоровье', () => {
  const { game, B } = duel();
  untilPhase(game, PHASE_PLAY);
  B.hp = 40;
  B.hurtTick = game.tick - 10 * TICK_RATE;
  game.command(B, '/kill');
  assert.equal(B.alive, false);
  steps(game, RESPAWN_TICKS - 5);
  assert.equal(B.hp, 0, 'пока лопнул — ноль');
  steps(game, 10);
  assert.ok(B.alive);
  assert.equal(B.hp, B.maxHp);
});

// ------------------------------------------------------------ AWP

test('AWP: лежит посередине верха креста, банка варенья — рядом и не пересекается', () => {
  const map = buildPier();
  assert.deepEqual(map.awp, { x: 0, y: 5.2, z: 0 });
  const top = map.pickups.find((p) => p.y === 5.2)!;
  assert.ok(top, 'банка на кресте осталась');
  assert.ok(Math.hypot(top.x - map.awp!.x, top.z - map.awp!.z) > AWP_RADIUS + JAM_RADIUS, 'зоны подбора не пересекаются');
  const world = new CollisionWorld(map);
  for (const p of [map.awp!, top]) assert.equal(world.groundBelow(p.x, p.y + 0.5, p.z), 5.2, `под ${p.x},${p.z} — крыша контейнера`);
});

test('AWP: в разминке не берётся; бот её не трогает; человек подбирает — 3 выстрела, полный магазин, строка в чат', () => {
  const { game, A, B, sa } = duel();
  // боты бывают, только когда человек один: второй вышел — в разминке боты вернулись
  game.removePlayer(B.id);
  game.botsPerTeam = 2;
  game.balanceBots();
  const bot = [...game.players.values()].find((p) => p.isBot)!;
  assert.ok(bot, 'боты есть');
  const awp = game.awp!;
  assert.equal(game.phase, PHASE_WARMUP);
  place(A, awp.x, awp.y, awp.z);
  for (let i = 0; i < 30; i++) tickWith(game, A, 0);
  assert.ok(awp.lying && A.state.awp === 0, 'в разминке лежит');
  place(A, -10, 0, -6);
  untilPhase(game, PHASE_PLAY);
  assert.ok(awp.lying, 'к началу боя лежит на кресте');

  place(bot, awp.x, awp.y, awp.z);
  game.step();
  assert.ok(awp.lying, 'бот прошёл мимо');
  assert.equal(bot.state.awp, 0);

  A.state.ammo = 3;
  A.state.reloadT = 40;
  sa.msgs.length = 0;
  takeAwp(game, A);
  assert.equal(awp.holder, A);
  assert.equal(awp.lying, false);
  assert.equal(A.state.awp, AWP_SHOTS);
  assert.equal(A.state.ammo, MAG_SIZE, 'после AWP — сразу полный магазин');
  assert.equal(A.state.reloadT, 0);
  assert.ok(eventsOf(sa).some((e) => e[0] === 'awp' && e[1] === 1 && e[2] === A.id), 'событие «подобрал»');
  assert.ok(chatOf(sa).includes('🎯 Снайпер подобрал AWP'));

  // свой снимок: выстрелы в своём состоянии, в хвосте — у кого AWP
  const h = makeHeader();
  const self = makeState();
  const ents: EntitySnap[] = [];
  const last = sa.bins[sa.bins.length - 1];
  const ab = last.buffer.slice(last.byteOffset, last.byteOffset + last.byteLength) as ArrayBuffer;
  assert.ok(decodeSnapshot(ab, h, self, ents) > 0);
  assert.equal(self.awp, AWP_SHOTS);
  assert.equal(ab.byteLength, h.tail + 1);
  assert.equal(new Uint8Array(ab)[h.tail], A.id);
});

test('AWP: любое попадание сбивает (броня и бонус не спасают), защита после появления спасает; после 3-го — маркер', () => {
  const { game, A, B, sa } = duel();
  untilPhase(game, PHASE_PLAY);
  takeAwp(game, A);
  let [yaw, pitch] = lineUp(game, A, B);
  B.maxHp = 160;
  B.hp = 160;
  B.armor = 80;
  sa.msgs.length = 0;

  // зажатый огонь — один выстрел (по нажатию); держим дольше темпа, но меньше, чем лопнувший ждёт появления
  for (let i = 0; i < AWP_INTERVAL + 20; i++) tickWith(game, A, BTN_FIRE, yaw, pitch);
  let ev = eventsOf(sa);
  assert.equal(ev.filter((e) => e[0] === 'snipe').length, 1, 'зажатый огонь не тратит выстрелы');
  assert.equal(ev.filter((e) => e[0] === 'shot').length, 0);
  assert.equal(A.state.awp, AWP_SHOTS - 1);
  assert.equal(B.alive, false, 'одно попадание — сбит');
  const kill = ev.find((e) => e[0] === 'kill');
  assert.ok(kill && kill[1] === A.id && kill[2] === B.id && kill[4] === 'awp', `в ленте — AWP: ${JSON.stringify(kill)}`);
  assert.equal(A.kills, 1);

  // появился — под защитой: выстрел не сбивает
  for (let i = 0; i < RESPAWN_TICKS && !B.alive; i++) tickWith(game, A, 0, yaw, pitch);
  assert.ok(B.alive && B.protectUntil > game.tick);
  place(B, -10, 0, -18);
  [yaw, pitch] = aimAt(game, A, B);
  sa.msgs.length = 0;
  tickWith(game, A, BTN_FIRE, yaw, pitch);
  tickWith(game, A, 0, yaw, pitch);
  ev = eventsOf(sa);
  assert.equal(ev.filter((e) => e[0] === 'snipe').length, 1);
  assert.ok(B.alive, 'защита после появления спасает');
  assert.equal(B.hp, B.maxHp);
  assert.equal(A.state.awp, 1);

  // защита кончилась — третий выстрел сбивает, AWP пропадает из рук
  while (game.tick <= B.protectUntil || A.state.fireCd > 0) tickWith(game, A, 0, yaw, pitch);
  place(B, -10, 0, -18);
  [yaw, pitch] = aimAt(game, A, B);
  sa.msgs.length = 0;
  tickWith(game, A, BTN_FIRE, yaw, pitch);
  assert.equal(B.alive, false, 'третий выстрел сбил');
  assert.equal(A.state.awp, 0);
  tickWith(game, A, 0, yaw, pitch);
  const awp = game.awp!;
  assert.equal(awp.holder, null, 'выстрелы кончились — из рук пропала');
  assert.equal(awp.lying, false, 'и на крест сразу не вернулась');

  // дальше — обычный маркер (после короткой паузы)
  sa.msgs.length = 0;
  for (let i = 0; i < AWP_SWITCH_TICKS + 4; i++) tickWith(game, A, BTN_FIRE, yaw, pitch);
  ev = eventsOf(sa);
  assert.equal(ev.filter((e) => e[0] === 'snipe').length, 0);
  assert.ok(ev.filter((e) => e[0] === 'shot').length >= 1, 'снова стреляет маркер');
  assert.ok(A.state.ammo < MAG_SIZE);
});

test('AWP: лопнул с ней — пропадает, через 45 с снова на кресте; вышел — тоже; новый раунд — сразу на кресте', () => {
  const { game, A, B, sa } = duel();
  untilPhase(game, PHASE_PLAY);
  const awp = game.awp!;
  takeAwp(game, A);
  assert.equal(awp.holder, A);
  game.command(A, '/kill');
  game.step();
  assert.equal(awp.holder, null);
  assert.equal(awp.lying, false);
  assert.equal(A.state.awp, 0, 'у лопнувшего AWP нет');
  const dropped = game.tick;
  assert.equal(awp.respawnAt, dropped + AWP_RESPAWN_TICKS);
  sa.msgs.length = 0;
  while (game.tick < dropped + AWP_RESPAWN_TICKS - 1) {
    game.step();
    assert.equal(awp.lying, false);
  }
  game.step();
  assert.ok(awp.lying, 'через 45 с снова лежит');
  assert.ok(eventsOf(sa).some((e) => e[0] === 'awp' && e[1] === 0));
  assert.ok(chatOf(sa).includes('🎯 AWP снова лежит на центральном контейнере'));

  // вышел из игры с AWP в руках
  takeAwp(game, B);
  assert.equal(awp.holder, B);
  game.removePlayer(B.id);
  game.step();
  assert.equal(awp.holder, null);
  assert.equal(awp.respawnAt, game.tick + AWP_RESPAWN_TICKS);

  // новый раунд: на кресте сразу, у бывшего владельца — маркер
  for (let i = 0; i < AWP_RESPAWN_TICKS + 1 && !awp.lying; i++) game.step();
  assert.ok(A.alive);
  takeAwp(game, A);
  assert.equal(awp.holder, A);
  assert.ok(game.restartRound(null));
  assert.ok(awp.lying, 'новый раунд — лежит на кресте');
  assert.equal(awp.holder, null);
  assert.equal(A.state.awp, 0);
  game.step();
  const last = sa.bins[sa.bins.length - 1];
  const ab = last.buffer.slice(last.byteOffset, last.byteOffset + last.byteLength) as ArrayBuffer;
  const h = makeHeader();
  assert.ok(decodeSnapshot(ab, h, makeState(), []) > 0);
  assert.equal(new Uint8Array(ab)[h.tail], AWP_LYING, 'в хвосте снимка — «лежит»');
});

test('AWP: в конце раунда пропадает из рук и ложится на крест', () => {
  const { game, A } = duel();
  untilPhase(game, PHASE_PLAY);
  takeAwp(game, A);
  assert.equal(A.state.awp, AWP_SHOTS);
  game.phaseEnd = game.tick + 1;
  game.step();
  assert.notEqual(game.phase, PHASE_PLAY);
  assert.equal(A.state.awp, 0);
  assert.ok(game.awp!.lying);
  assert.equal(game.awp!.holder, null);
});

// ------------------------------------------------------------ общая физика

const map = buildPier();
const world = new CollisionWorld(map);
const SEED = 0x5eed1234;

test('AWP в общей физике: выстрел по нажатию раз в 1,2 с, разброс в прицеле на месте — ноль, после 3-го — маркер', () => {
  const s = makeState();
  s.x = -10;
  s.z = -6;
  const ev = makeEvents();
  const idle: Input = { seq: 0, buttons: BTN_ADS, yaw: 0, pitch: 0, viewTick: 0 };
  for (let i = 0; i < 30; i++) stepPlayer(s, idle, world, true, SEED, ev);
  assert.equal(s.grounded, 1);
  s.awp = AWP_SHOTS;
  const shotsAt: number[] = [];
  const spreads: number[] = [];
  let markerShot = -1;
  for (let t = 0; t < 400; t++) {
    // жмём огонь через тик: каждое нажатие — новое
    const inp: Input = { seq: t + 1, buttons: BTN_ADS | (t % 2 === 0 ? BTN_FIRE : 0), yaw: 0, pitch: 0, viewTick: 0 };
    stepPlayer(s, inp, world, true, SEED, ev);
    if (ev.fired && ev.awp) {
      shotsAt.push(t);
      spreads.push(ev.spread);
    } else if (ev.fired && markerShot < 0) markerShot = t;
  }
  assert.equal(shotsAt.length, AWP_SHOTS);
  assert.ok(shotsAt[1] - shotsAt[0] >= AWP_INTERVAL && shotsAt[1] - shotsAt[0] <= AWP_INTERVAL + 2, `темп ${shotsAt}`);
  assert.deepEqual(spreads, [0, 0, 0], 'в прицеле на месте — точно');
  assert.equal(s.awp, 0);
  assert.ok(markerShot - shotsAt[2] >= AWP_SWITCH_TICKS && markerShot - shotsAt[2] <= AWP_SWITCH_TICKS + 2, 'маркер — через полсекунды');
});

test('AWP и предсказание: сервер выдал винтовку — одна поправка, дальше клиент и сервер совпадают бит в бит', () => {
  const LAG = 7;
  const ev = makeEvents();
  const h = makeHeader();
  const got = makeHeader();
  const decoded = makeState();
  const ents: EntitySnap[] = [];
  const noEntities = encodeEntities([]);
  const server = makeState();
  server.x = -10;
  server.z = -6;
  const pred = new Predictor(world);
  pred.seed = SEED;
  pred.reset(server, 0);
  const inputs: Input[] = [];
  for (let i = 0; i < 900; i++) {
    const fire = i % 37 < 3 ? BTN_FIRE : 0;
    const move = i % 200 < 100 ? 1 : 2;
    inputs.push({ seq: i + 1, buttons: fire | move | (i % 90 < 45 ? BTN_ADS : 0), yaw: Math.fround(i * 0.004), pitch: Math.fround(0.05), viewTick: 0 });
  }
  let awpShots = 0;
  for (let t = 0; t < inputs.length + LAG; t++) {
    if (t < inputs.length) pred.step(inputs[t], true);
    const si = t - LAG;
    if (si < 0 || si >= inputs.length) continue;
    stepPlayer(server, inputs[si], world, true, SEED, ev);
    if (ev.awp) awpShots++;
    // на 200-м тике сервер выдаёт AWP (игрок зашёл в неё)
    if (si === 200) {
      server.awp = AWP_SHOTS;
      server.ammo = MAG_SIZE;
      server.reloadT = 0;
    }
    h.ack = inputs[si].seq;
    const buf = encodeSnapshot(h, server, noEntities);
    assert.equal(decodeSnapshot(buf.buffer as ArrayBuffer, got, decoded, ents), 0);
    pred.reconcile(got.ack, copyState(makeState(), decoded));
  }
  assert.equal(awpShots, AWP_SHOTS, 'все три выстрела сделаны');
  assert.equal(pred.corrections, 1, 'поправка только одна — когда выдали винтовку');
  assert.ok(statesEqual(pred.state, server));
});
