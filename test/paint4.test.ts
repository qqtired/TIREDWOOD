// PAINT4: серверные наборы, полёт, сталкивание в воду и тот же шаг оружия в предсказании.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RIG_PB_ADS, cameraRig } from '../shared/aim.ts';
import { HITBOX_CY, PHASE_END, PHASE_PLAY, PHASE_WARMUP, TICK_RATE } from '../shared/constants.ts';
import type { GameEvent, ServerMsg } from '../shared/messages.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import {
  BTN_PB_BUCKET, BUCKET_CD_TICKS, KIT_BOW, KIT_CAN, KIT_MARKER, KIT_SQUIRT, KITS,
  armKit, makeP4Step, p4After, p4Before,
} from '../shared/paint4.ts';
import {
  AWP_SHOTS, BTN_ADS, BTN_FIRE, BTN_FORWARD, BTN_RELOAD, BTN_RIGHT, MAG_SIZE,
  makeEvents, makeState, statesEqual, stepPlayer, type Input,
} from '../shared/sim.ts';
import type { Client, Hub } from '../server/hub.ts';
import { Game, type Player, type Sink } from '../server/paintball/game.ts';
import { PaintballRoom } from '../server/paintball/room.ts';

type TestSink = Sink & { msgs: ServerMsg[] };

function sink(): TestSink {
  const msgs: ServerMsg[] = [];
  return { msgs, sendBinary() {}, sendJson(m) { msgs.push(m); }, close() {} };
}

function events<K extends GameEvent[0]>(s: TestSink, kind: K): Array<Extract<GameEvent, { 0: K }>> {
  return s.msgs.flatMap((m) => m.t === 'ev' ? m.e : []).filter((e): e is Extract<GameEvent, { 0: K }> => e[0] === kind);
}

function untilPhase(game: Game, phase: number): void {
  for (let i = 0; i < 20 * TICK_RATE && game.phase !== phase; i++) game.step();
  assert.equal(game.phase, phase);
}

function input(game: Game, p: Player, buttons: number, yaw = 0, pitch = 0): Input {
  const inp = { seq: p.inq.lastSeq + 1, buttons, yaw: Math.fround(yaw), pitch: Math.fround(pitch), viewTick: game.tick };
  game.onInputs(p, [inp], 1);
  return inp;
}

function tickWith(game: Game, p: Player, buttons: number, yaw = 0, pitch = 0): void {
  input(game, p, buttons, yaw, pitch);
  game.step();
}

function place(p: Player, x: number, z: number, y = 0): void {
  Object.assign(p.state, makeState(), { x, y, z, grounded: 1 });
  armKit(p.state, p.kit);
  p.hp = p.maxHp = 100;
  p.armor = 0;
  p.dmgMult = 1;
  p.protectUntil = 0;
}

/** Прицел над плечом, как у человека, в центр хитбокса; стреляем с ADS. */
function aimAt(game: Game, a: Player, b: Player): [number, number] {
  let yaw = Math.atan2(a.state.x - b.state.x, a.state.z - b.state.z);
  let pitch = 0;
  const cam = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 8; i++) {
    cameraRig(a.state.x, a.state.y, a.state.z, yaw, pitch, RIG_PB_ADS, 1, game.world, cam);
    const dx = b.state.x - cam.x, dy = b.state.y + HITBOX_CY - cam.y, dz = b.state.z - cam.z;
    yaw = Math.atan2(-dx, -dz);
    pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }
  return [yaw, pitch];
}

function duel(kit = KIT_MARKER): { game: Game; a: Player; b: Player; sa: TestSink; sb: TestSink } {
  const game = new Game({}, { paint4: true });
  game.botsPerTeam = 0;
  const sa = sink(), sb = sink();
  const a = game.addHuman({ pid: 1, nick: 'Стрелок', outfit: DEFAULT_OUTFIT }, sa)!;
  const b = game.addHuman({ pid: 2, nick: 'Мишень', outfit: DEFAULT_OUTFIT }, sb)!;
  // Разброс воспроизводим; бонусы автомата ниже обнуляются, числа оружия не меняем.
  Object.assign(a, { seed: 12345 });
  assert.notEqual(a.team, b.team);
  game.onKit(a, kit);
  untilPhase(game, PHASE_PLAY);
  place(a, -10, -6);
  place(b, -10, -14);
  game.step(); // свежая история позиций для отката
  sa.msgs.length = sb.msgs.length = 0;
  return { game, a, b, sa, sb };
}

test('PAINT4 выключен: прежние welcome, состав, маркер; выбор и ведёрко игнорируются', () => {
  const game = new Game();
  game.botsPerTeam = 0;
  const s = sink();
  const p = game.addHuman({ pid: 1, nick: 'Маркер', outfit: DEFAULT_OUTFIT }, s)!;
  const welcome = s.msgs.find((m) => m.t === 'welcome')!;
  assert.equal(Object.hasOwn(welcome, 'p4'), false);
  assert.ok(game.roster().every((r) => !Object.hasOwn(r, 'kit')));
  s.msgs.length = 0;
  game.onKit(p, KIT_SQUIRT);
  assert.equal(p.kit, KIT_MARKER);
  assert.equal(p.state.ammo, MAG_SIZE);
  assert.equal(s.msgs.length, 0);
  untilPhase(game, PHASE_PLAY);
  tickWith(game, p, BTN_PB_BUCKET);
  assert.equal(events(s, 'bucket').length, 0);
  assert.equal(game.p4, null);
});

test('pbKit проходит через комнату только при флаге', () => {
  for (const enabled of [false, true]) {
    const hub = { outfitOf: () => DEFAULT_OUTFIT } as unknown as Hub;
    const room = new PaintballRoom(hub, enabled);
    room.game.botsPerTeam = 0;
    const s = sink();
    const c = { profile: { id: 1, nick: 'Набор', level: 1 }, sink: s, ping: 0 } as unknown as Client;
    assert.ok(room.join(c));
    room.onMessage(c, { t: 'pbKit', k: KIT_SQUIRT });
    assert.equal(room.playerOf(c)!.kit, enabled ? KIT_SQUIRT : KIT_MARKER);
    assert.equal(s.msgs.some((m) => m.t === 'pbKit'), enabled);
  }
});

test('набор: смена в разминке, после смерти и под защитой появления, запрет в бою, сохранение между раундами', () => {
  const game = new Game({}, { paint4: true });
  game.botsPerTeam = 0;
  const s = sink();
  const p = game.addHuman({ pid: 1, nick: 'Набор', outfit: DEFAULT_OUTFIT }, s)!;
  const welcome = s.msgs.find((m) => m.t === 'welcome')!;
  assert.equal(welcome.p4, true);
  game.onKit(p, KIT_SQUIRT);
  assert.deepEqual(s.msgs.at(-1), { t: 'pbKit', k: 1 });
  assert.equal(p.state.ammo, 50);
  assert.equal(game.roster()[0].kit, KIT_SQUIRT);
  const count = s.msgs.length;
  for (const k of [-1, 4, 1.5, NaN]) game.onKit(p, k);
  assert.equal(s.msgs.length, count);
  untilPhase(game, PHASE_PLAY);
  // только появился, под защитой (до первого выстрела) — сменить ещё можно
  p.protectUntil = game.tick + 30;
  game.onKit(p, KIT_CAN);
  assert.deepEqual(s.msgs.at(-1), { t: 'pbKit', k: KIT_CAN });
  assert.equal(p.state.ammo, 5);
  game.onKit(p, KIT_SQUIRT);
  assert.equal(p.state.ammo, 50);
  // защита снята — в бою уже нельзя
  p.protectUntil = 0;
  game.onKit(p, KIT_BOW);
  assert.deepEqual(s.msgs.at(-1), { t: 'pbKit', k: 1 });
  assert.equal(p.kit, KIT_SQUIRT);
  game.command(p, '/kill');
  const ammo = p.state.ammo;
  game.onKit(p, KIT_BOW);
  assert.equal(p.state.ammo, ammo, 'мёртвый вооружится при появлении');
  game.spawnPlayer(p);
  assert.equal(p.state.ammo, 1);
  game.startWarmup(false);
  assert.equal(p.kit, KIT_BOW);
  game.phase = PHASE_END;
  game.onKit(p, KIT_CAN);
  assert.equal(p.state.ammo, 5);
  game.startWarmup(false);
  game.botsPerTeam = 1;
  game.balanceBots();
  const bot = [...game.players.values()].find((q) => q.isBot)!;
  game.onKit(bot, KIT_CAN);
  assert.equal(bot.kit, KIT_MARKER);
});

test('Брызгалка: 13 вблизи, спад по shared на 10 м, дальность 28 м', () => {
  const { game, a, b, sa } = duel(KIT_SQUIRT);
  for (const [distance, expected] of [[6, 13], [10, 11], [35, 0]]) {
    // Западный проход: при x=-10 десятиметровый луч перекрывал ящик у z=8,6.
    place(a, -18, 18);
    place(b, -18, 18 - distance);
    tickWith(game, a, 0);
    sa.msgs.length = 0;
    tickWith(game, a, BTN_FIRE | BTN_ADS, ...aimAt(game, a, b));
    const hits = events(sa, 'hit');
    // В задании ожидается 13 на 10 м, но неизменяемый shared/paint4.ts начинает спад с 7 м.
    if (expected) {
      assert.equal(hits.length, 1, `дистанция ${distance}: ${JSON.stringify(events(sa, 'shot'))}`);
      assert.equal(hits[0][3], expected);
    } else {
      assert.equal(hits.length, 0);
      const shot = events(sa, 'shot')[0];
      assert.equal(shot[8], 2);
      assert.ok(Math.abs(Math.hypot(shot[5] - shot[2], shot[6] - shot[3], shot[7] - shot[4]) - 28) < 0.02);
    }
  }
});

test('Лейка: восемь концов, один суммарный hit, толчок и защита появления', () => {
  const { game, a, b, sa } = duel(KIT_CAN);
  place(b, -10, -8.5);
  tickWith(game, a, 0);
  sa.msgs.length = 0;
  tickWith(game, a, BTN_FIRE | BTN_ADS, ...aimAt(game, a, b));
  const fans = events(sa, 'fan'), hits = events(sa, 'hit');
  assert.equal(fans.length, 1);
  assert.equal(fans[0][5].length, 8 * 4);
  assert.equal(hits.length, 1);
  assert.ok(hits[0][3] >= 60);
  assert.equal(events(sa, 'shove').length, 1);
  assert.ok(b.state.dashT > 0);
  place(a, -10, -6);
  place(b, -10, -8.5);
  b.protectUntil = game.tick + 100;
  tickWith(game, a, 0);
  sa.msgs.length = 0;
  tickWith(game, a, BTN_FIRE | BTN_ADS, ...aimAt(game, a, b));
  assert.equal(events(sa, 'hit').length, 0);
  assert.equal(events(sa, 'shove').length, 0);
  assert.equal(b.state.dashT, 0);
});

test('Лейка сталкивает с восточного края: утопление за 2 с засчитано стрелку', () => {
  const { game, a, b, sa } = duel(KIT_CAN);
  // Между кнехтами, без контейнеров; бордюр настоящей карты высотой 0,22 м остаётся.
  place(a, 18.5, 0);
  place(b, 20.5, 0);
  tickWith(game, a, 0);
  sa.msgs.length = 0;
  tickWith(game, a, BTN_FIRE | BTN_ADS, ...aimAt(game, a, b));
  assert.equal(events(sa, 'shove').length, 1);
  for (let i = 0; i < 2 * TICK_RATE; i++) tickWith(game, a, 0);
  assert.ok(events(sa, 'kill').some((e) => e[1] === a.id && e[2] === b.id && e[4] === 'drown'),
    `не утонул после толчка: x=${b.state.x}, y=${b.state.y}, hp=${b.hp}`);
});

test('Лук: 42 тика — полная стрела и 90 урона через 8 м; щелчок — 0,2', () => {
  const { game, a, b, sa } = duel(KIT_BOW);
  const aim = aimAt(game, a, b);
  for (let i = 0; i < 42; i++) tickWith(game, a, BTN_FIRE | BTN_ADS, ...aim);
  assert.equal(events(sa, 'arrow').length, 0);
  tickWith(game, a, BTN_ADS, ...aim);
  const arrow = events(sa, 'arrow')[0];
  assert.equal(arrow[9], 1);
  for (let i = 0; i < 30; i++) tickWith(game, a, 0);
  const end = events(sa, 'arrowEnd').find((e) => e[2] === arrow[2])!;
  assert.equal(end[6], 1);
  const hit = events(sa, 'hit')[0];
  assert.equal(hit[2], b.id);
  assert.equal(hit[3], 90);
  sa.msgs.length = 0;
  for (let i = 0; i < 3; i++) tickWith(game, a, BTN_FIRE | BTN_ADS, ...aim);
  tickWith(game, a, BTN_ADS, ...aim);
  assert.equal(events(sa, 'arrow')[0][9], 0.2);
});

test('Ведёрко: бросок, пятно, урон врагу, свои целы, повтор только через 14 с', () => {
  const { game, a, b, sa } = duel();
  place(b, -9.72, -9);
  const friend = game.addHuman({ pid: 3, nick: 'Свой', outfit: DEFAULT_OUTFIT }, sink())!;
  friend.team = a.team;
  place(friend, -8.5, -9);
  game.step();
  tickWith(game, a, BTN_PB_BUCKET, 0, -0.6);
  const thrownAt = game.tick;
  assert.equal(events(sa, 'bucket').length, 1);
  assert.equal(a.bucketAt, thrownAt + BUCKET_CD_TICKS);
  for (let i = 0; i < 90 && events(sa, 'bsplash').length === 0; i++) tickWith(game, a, 0);
  assert.equal(events(sa, 'bsplash').length, 1);
  assert.ok(events(sa, 'hit').some((e) => e[1] === a.id && e[2] === b.id));
  assert.equal(a.hp, 100);
  assert.equal(friend.hp, 100);
  tickWith(game, a, 0);
  tickWith(game, a, BTN_PB_BUCKET);
  assert.equal(events(sa, 'bucket').length, 1);
  while (game.tick < a.bucketAt - 1) tickWith(game, a, 0);
  tickWith(game, a, BTN_PB_BUCKET);
  assert.equal(events(sa, 'bucket').length, 2);
});

test('AWP при PAINT4 сохраняет магазин набора и все три выстрела идут прежним путём', () => {
  const { game, a, sa } = duel(KIT_SQUIRT);
  const awp = game.awp!;
  place(a, awp.x, awp.z, awp.y);
  tickWith(game, a, 0);
  assert.equal(a.state.awp, AWP_SHOTS);
  assert.equal(a.state.ammo, 50);
  for (let i = 0; i < AWP_SHOTS; i++) {
    while (a.state.fireCd > 0) tickWith(game, a, 0);
    tickWith(game, a, BTN_FIRE);
    assert.equal(a.p4step.wrapped, false);
    tickWith(game, a, 0);
  }
  assert.equal(events(sa, 'snipe').length, AWP_SHOTS);
  assert.equal(events(sa, 'shot').length, 0);
  assert.equal(a.state.ammo, 50);
  while (a.state.fireCd > 0) tickWith(game, a, 0);
  tickWith(game, a, BTN_FIRE);
  assert.equal(a.state.ammo, 49);
  assert.equal(events(sa, 'shot').length, 1);
});

test('новая разминка убирает стрелы и ведёрки, сбрасывает ожидание и сохраняет набор', () => {
  const { game, a, sa } = duel(KIT_BOW);
  for (let i = 0; i < 3; i++) tickWith(game, a, BTN_FIRE, 0, 1);
  tickWith(game, a, BTN_PB_BUCKET, 0, 1);
  assert.equal(events(sa, 'arrow').length, 1);
  assert.equal(events(sa, 'bucket').length, 1);
  game.startWarmup(false);
  assert.equal(game.phase, PHASE_WARMUP);
  assert.equal(a.bucketAt, 0);
  assert.equal(a.kit, KIT_BOW);
  sa.msgs.length = 0;
  for (let i = 0; i < 180; i++) tickWith(game, a, 0);
  assert.equal(events(sa, 'arrowEnd').length, 0);
  assert.equal(events(sa, 'bsplash').length, 0);
});

for (const kit of [KIT_SQUIRT, KIT_BOW]) {
  test(`предсказание ${KITS[kit].id}: состояние совпадает с сервером после каждого из 120 входов`, () => {
    const { game, a } = duel(kit);
    const predicted = { ...a.state };
    const step = makeP4Step(), ev = makeEvents();
    for (let i = 0; i < 120; i++) {
      let buttons = i < 30 ? BTN_RIGHT : i < 60 ? BTN_FORWARD : 0;
      if (i < 42 || (i >= 80 && i < 83)) buttons |= BTN_FIRE;
      if (i === 65) buttons |= BTN_RELOAD;
      const inp = input(game, a, buttons, 0, 0.4);
      const canFire = game.phase === PHASE_PLAY;
      const m = p4Before(step, predicted, inp, kit);
      stepPlayer(predicted, m, game.world, canFire, a.seed, ev);
      p4After(step, predicted, ev, canFire, a.seed, kit);
      game.step();
      assert.ok(statesEqual(predicted, a.state), `расхождение на входе ${i}`);
    }
    assert.ok(a.state.shots > 0);
  });
}
