import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as F from '../shared/fort.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { FortGame, FortPlayer } from '../server/fort/game.ts';
import type { Sink } from '../server/paintball/game.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { TICK_RATE } from '../shared/constants.ts';
import { GATE, WALL_H } from '../shared/fortmap.ts';
import { decodeFortTail, encodeFortTail, fortTailSize, makeFortTail, type ZombieSnap } from '../shared/fortnet.ts';
import { BTN_JUMP, BTN_RELOAD, MAG_SIZE, RELOAD_TICKS, makeInput } from '../shared/sim.ts';
import { planCounts, planWave } from '../server/fort/director.ts';
import { BOSS_BASE_HP, bossTeamMul, waveHpMul } from '../shared/fortwaves.ts';

function steps(game: FortGame, n: number) { for (let i = 0; i < n; i++) game.step(); }
function standShop(game: FortGame, p: FortPlayer) {
  const st = game.map.stations.find((s) => s.kind === 'shop')!;
  Object.assign(p.state, { x: st.x, y: st.y, z: st.z });
}

function setup(n = 1) {
  const game = new FortGame();
  const messages: ServerMsg[] = [];
  const sink: Sink = { sendJson: (m) => messages.push(m), sendBinary() {}, close() {} };
  const players = Array.from({ length: n }, (_, i) => game.addHuman({ pid: i + 1, nick: `Защитник ${i}`, outfit: DEFAULT_OUTFIT }, sink)!);
  return { game, players, messages };
}

test('первые крылатки — на пятой волне, первый босс — на седьмой и один на любую команду', () => {
  for (let w = 1; w < 5; w++) assert.equal(planCounts(planWave(w, 1, 5))[F.Z_FLYER], 0);
  assert.ok(planCounts(planWave(5, 1, 5))[F.Z_FLYER] > 0, 'первая воздушная атака');
  for (let w = 1; w < 7; w++) assert.equal(planWave(w, 6, 5).boss, -1);
  assert.equal(planWave(7, 1, 5).boss, F.Z_BOSS);
  assert.equal(planWave(7, 6, 5).boss, F.Z_BOSS, 'босс не умножается числом игроков');
  assert.equal(planCounts(planWave(7, 6, 5))[F.Z_BOSS], 0, 'в составе босса нет — он отдельно');
});

test('сервер отвергает покупку от чужого объекта игрока', () => {
  const { game, players } = setup();
  const st = game.map.stations.find((s) => s.kind === 'gate')!;
  const fake = new FortPlayer(players[0].id, 'Подмена', players[0].sink, 1, DEFAULT_OUTFIT);
  fake.alive = true;
  fake.pts = 1000;
  Object.assign(fake.state, { x: st.x, y: st.y, z: st.z });
  game.gate = F.GATE_HP - 400;
  game.use(fake, st.id);
  assert.equal(game.gate, F.GATE_HP - 400);
  assert.equal(fake.pts, 1000);
});

test('лавка расширяет магазин один раз и списывает серверную цену', () => {
  const { game, players } = setup();
  const p = players[0];
  const st = game.map.stations.find((s) => (s.kind as string) === 'shop');
  assert.ok(st, 'единая лавка на террасе');
  Object.assign(p.state, { x: st.x, y: st.y, z: st.z });
  p.pts = 200;
  game.use(p, 1008);
  assert.equal(p.state.ammo, 42);
  assert.equal(p.pts, 110);
  game.use(p, 1008);
  assert.equal(p.pts, 110, 'повтор не списывает очки');
});

test('краскомёт без стрелка даёт ровно одну общую награду команде', () => {
  const { game, players } = setup(3);
  const before = players.reduce((n, p) => n + p.pts, 0);
  const z = game.horde.spawn(F.Z_WALKER, 1)!;
  game.horde.damage(z, 999, 0, false, z.x, 1, z.z);
  assert.equal(players.reduce((n, p) => n + p.pts, 0) - before, 10);
  assert.ok(players.every((p) => p.pts > F.START_PTS));
});

test('магазин: расстояние, фаза, цена и повтор зенитного улучшения проверяются сервером', () => {
  const { game, players } = setup();
  const p = players[0];
  p.pts = 1000;
  Object.assign(p.state, { x: -20, y: 0, z: -50 });
  game.use(p, 1008);
  assert.equal(p.pts, 1000);
  standShop(game, p);
  p.pts = 89;
  game.use(p, 1008);
  assert.equal(p.pts, 89);
  assert.equal(p.state.ammo, MAG_SIZE);
  p.pts = 1000;
  game.phase = F.FT_WAVE;
  game.use(p, 1008);
  assert.equal(p.pts, 1000);
  game.phase = F.FT_BREAK;
  game.use(p, 1009);
  assert.equal(p.pts, 1000, 'улучшение требует построенного краскомёта');
  game.use(p, 1003);
  game.use(p, 1009);
  assert.equal(p.pts, 750);
  assert.ok(game.turrets[0]?.aa);
  game.use(p, 1009);
  assert.equal(p.pts, 750);
  game.use(p, 1005);
  assert.equal(game.jams[0], -1, 'варенье ждёт начала волны');
  game.phaseEnd = game.tick + 1;
  game.step();
  assert.equal(game.jams[0], game.tick + 45 * TICK_RATE);
});

test('42 шарика сохраняются после ручной и автоматической перезарядки', () => {
  const { game, players } = setup();
  const p = players[0];
  standShop(game, p);
  p.pts = 1000;
  game.use(p, 1008);
  p.state.ammo = 35;
  const inp = makeInput();
  inp.seq = 1;
  inp.buttons = BTN_RELOAD;
  game.onInputs(p, [inp], 1);
  game.step();
  assert.equal(p.state.reloadT, RELOAD_TICKS);
  inp.buttons = 0;
  for (let i = 0; i < RELOAD_TICKS; i++) {
    inp.seq++;
    game.onInputs(p, [inp], 1);
    game.step();
  }
  assert.equal(p.state.ammo, 42);
  p.state.ammo = 0;
  p.state.reloadT = 1;
  inp.seq++;
  game.onInputs(p, [inp], 1);
  game.step();
  assert.equal(p.state.ammo, 42);
});

test('крылатка идёт поверх стен, предупреждает и бьёт зафиксированную цель, а не преследует уклонение', () => {
  const { game, players } = setup();
  const p = players[0];
  game.phase = F.FT_WAVE;
  const z = game.horde.spawn(F.Z_FLYER, 1)!;
  assert.ok(z.y > WALL_H + 2, 'появление в воздухе');
  Object.assign(p.state, { x: 0, y: WALL_H, z: -14.6 });
  Object.assign(z, { x: 0, y: 7.4, z: -18.6 });
  for (let i = 0; i < 300 && z.state !== F.ZS_FLY_WARN; i++) game.step();
  assert.equal(z.state, F.ZS_FLY_WARN);
  const hp = p.hp;
  const targetX = z.toX;
  p.state.x += 10;
  steps(game, F.FLY_WARN_TICKS + F.FLY_DIVE_TICKS + 2);
  assert.equal(p.hp, hp, 'уход с метки спасает');
  assert.equal(z.toX, targetX, 'атака не перенацеливается в последний момент');
  assert.equal(z.state, F.ZS_FLY_RECOVER);
});

test('крылатка без защитников на стене атакует кристалл после предупреждения', () => {
  const { game, players } = setup();
  game.phase = F.FT_WAVE;
  const p = players[0];
  p.state.y = 0;
  const z = game.horde.spawn(F.Z_FLYER, 1)!;
  Object.assign(z, { x: 0, y: 6, z: 2.6 });
  const hp = game.crystal;
  for (let i = 0; i < 500 && game.crystal === hp; i++) game.step();
  assert.equal(game.crystal, hp - F.FLY_CRYSTAL_DMG);
});

test('босс защищён бронёй, открывает ядро; на 50 % — ярость с одной стаей крылаток', () => {
  const { game, players } = setup();
  game.phase = F.FT_WAVE;
  const b = game.horde.spawn(F.Z_BOSS, 1)!;
  b.state = F.ZS_BOSS_GATE;
  const hp = b.hp;
  game.horde.damage(b, 100, players[0].id, false, b.x, 2, b.z);
  assert.equal(b.hp, hp - 22);
  b.state = F.ZS_BOSS_OPEN;
  game.horde.damage(b, 100, players[0].id, false, b.x, 2, b.z);
  assert.equal(b.hp, hp - 122);
  Object.assign(b, { x: 0, z: -23, hp: b.maxHp * 0.65, t: 40 });
  const before = game.horde.alive;
  game.step();
  assert.equal(b.stage, 1, 'выше половины — без ярости');
  assert.equal(game.horde.alive, before);
  b.hp = b.maxHp * 0.45;
  game.step();
  assert.equal(b.stage, 2, 'ярость');
  assert.equal(game.horde.alive, before + 3, 'стая крылаток на одного');
  assert.ok(game.horde.zombies.filter((z) => z.alive && z.kind === F.Z_FLYER).length === 3);
  steps(game, 10);
  b.hp = b.maxHp * 0.2;
  steps(game, 2);
  assert.equal(game.horde.alive, before + 3, 'стая — один раз за бой');
});

test('босс даёт полное предупреждение до урона и окно для ответного огня после', () => {
  const { game } = setup();
  game.phase = F.FT_WAVE;
  const b = game.horde.spawn(F.Z_BOSS, 1)!;
  Object.assign(b, { x: 0, z: -23, state: F.ZS_WALK, t: 0 });
  game.step();
  assert.equal(b.state, F.ZS_BOSS_GATE);
  const hp = game.gate;
  steps(game, F.BOSS_WARN_TICKS - 1);
  assert.equal(game.gate, hp);
  game.step();
  assert.equal(game.gate, hp - F.BOSS_GATE_DMG);
  assert.equal(b.state, F.ZS_BOSS_OPEN);
  assert.equal(b.t, F.BOSS_OPEN_TICKS);
});

test('последняя волна не заканчивается с живым боссом; подкрепления не пробивают лимит 60', () => {
  const { game, players } = setup(6);
  game.phase = F.FT_WAVE;
  game.wave = F.FORT_WAVES;
  const b = game.horde.spawn(F.Z_BOSS, 1, 6)!;
  assert.ok(Math.abs(b.maxHp - BOSS_BASE_HP * waveHpMul(1) * bossTeamMul(6)) < 1e-6);
  for (let i = 1; i < 60; i++) assert.ok(game.horde.spawn(F.Z_WALKER, 1));
  assert.equal(game.horde.spawn(F.Z_FLYER, 1), null);
  b.hp = b.maxHp * 0.3;
  game.step();
  assert.equal(game.horde.alive, 60);
  for (const z of game.horde.zombies) if (z.alive && z !== b) game.horde.damage(z, 9999, 0, false, z.x, z.y, z.z);
  steps(game, 2);
  assert.equal(game.phase, F.FT_WAVE);
  b.state = F.ZS_BOSS_OPEN;
  game.horde.damage(b, 99999, players[0].id, false, b.x, 2, b.z);
  game.step();
  assert.equal(game.phase, F.FT_END);
});

test('хвост снимка сохраняет высоту, фазу босса и зафиксированную метку атаки', () => {
  const z: ZombieSnap & { wind: number; tx: number; ty: number; tz: number; stage: number } =
    { id: 51, kind: F.Z_BOSS, state: F.ZS_BOSS_BOMB, hp: 0.4, x: 0, y: 0, z: -23, yaw: 0, atk: 250, wind: 108, tx: 12.25, ty: 4.2, tz: -14.6, stage: 2 };
  const buf = new Uint8Array(fortTailSize([z], 1));
  encodeFortTail(buf, 0, { gate: 1600, crystal: 2500, turrets: 17, jams: 3, left: 1 }, [z], 1);
  const out: Array<typeof z> = [];
  decodeFortTail(buf.buffer, 0, makeFortTail(), out);
  assert.equal(out[0].stage, 2);
  assert.equal(out[0].wind, 108);
  assert.equal(out[0].ty, 4.2);
  assert.equal(out[0].tx, 12.25);
});

test('пикирование останавливается на каменной стене и не наносит урон сквозь укрытие', () => {
  const { game, players } = setup();
  game.phase = F.FT_WAVE;
  const p = players[0];
  Object.assign(p.state, { x: 17, y: 0, z: -7 });
  const z = game.horde.spawn(F.Z_FLYER, 2)!;
  Object.assign(z, { x: 20, y: 0.5, z: -7, fromX: 20, fromY: 0.5, fromZ: -7, toX: 17, toY: 0.8, toZ: -7,
    chase: p.id, state: F.ZS_FLY_DIVE, t: F.FLY_DIVE_TICKS });
  const hp = p.hp;
  steps(game, F.FLY_DIVE_TICKS + 1);
  assert.equal(p.hp, hp);
  assert.ok(z.x >= 18, 'не пролетает через внешнюю стену');
});

test('залп босса взрывается на крыше, игрок под крышей остаётся цел', () => {
  const { game, players } = setup();
  game.phase = F.FT_WAVE;
  const p = players[0];
  // Under the north gate-tower walkway (3.4 m stone roof).
  Object.assign(p.state, { x: -4, y: 0, z: -17 });
  const b = game.horde.spawn(F.Z_BOSS, 1)!;
  Object.assign(b, { x: 0, z: -23, state: F.ZS_BOSS_BOMB, t: 1, toX: p.state.x, toY: 0.8, toZ: p.state.z, chase: p.id });
  const hp = p.hp;
  game.step();
  assert.equal(p.hp, hp);
  assert.ok(b.toY >= WALL_H, 'точка удара на крыше');
});

test('взрыв пузыря не проходит через целые ворота к игроку и зомби во дворе', () => {
  const { game, players } = setup();
  game.phase = F.FT_WAVE;
  const p = players[0];
  Object.assign(p.state, { x: 0, y: 0, z: -15.05 });
  const b = game.horde.spawn(F.Z_BLOATER, 1)!;
  const w = game.horde.spawn(F.Z_WALKER, 1)!;
  Object.assign(b, { x: 0, z: -17.5 });
  Object.assign(w, { x: 1.5, z: -15.05 });
  game.step();
  game.horde.damage(b, 999, p.id, false, b.x, 0.8, b.z);
  assert.equal(p.hp, 100, 'створки прикрывают игрока');
  assert.equal(w.hp, w.maxHp, 'створки останавливают цепной взрыв');
  assert.equal(game.gate, F.GATE_HP - F.POP_GATE, 'самим воротам достаётся');
});

test('шаркун не бьёт через угол колодца, но бьёт без укрытия', () => {
  const { game, players } = setup();
  game.phase = F.FT_WAVE;
  const p = players[0];
  // Both bodies are outside the real well collision box. The segment crosses its north-west corner.
  Object.assign(p.state, { x: -8.97, y: 0, z: -2.83 });
  const z = game.horde.spawn(F.Z_WALKER, 1)!;
  Object.assign(z, { x: -9.81, y: 0, z: -1.97 });
  assert.equal(game.world.overlaps(p.state.x - 0.42, 0.01, p.state.z - 0.42, p.state.x + 0.42, 1.9, p.state.z + 0.42), false);
  const hit = { x: 0, y: 0, z: 0 };
  assert.equal(game.traceAttack(z.x, 0.78, z.z, p.state.x, 0.8, p.state.z, hit), true);
  game.step();
  assert.equal(p.hp, 100);
  Object.assign(p.state, { x: -10.4, y: 0, z: -1.97 });
  z.atkCd = 0;
  game.step();
  assert.equal(p.hp, 90, 'обычный контакт без укрытия сохранён');
});

test('метка залпа заранее находится на крыше и совпадает с центром взрыва', () => {
  const { game, players } = setup();
  game.phase = F.FT_WAVE;
  Object.assign(players[0].state, { x: -4, y: 0, z: -17 });
  const b = game.horde.spawn(F.Z_BOSS, 1)!;
  Object.assign(b, { x: 0, z: -23, state: F.ZS_WALK, attackIndex: 1, t: 0 });
  game.step();
  assert.equal(b.state, F.ZS_BOSS_BOMB);
  assert.ok(b.toY > WALL_H, 'крыша отмечена за полное время предупреждения');
  const y = b.toY;
  steps(game, F.BOSS_WARN_TICKS);
  assert.equal(b.toY, y, 'атака не переносится с пола на крышу в момент урона');
  assert.equal(players[0].hp, 100);
});

test('замах по воротам не переносит урон на немаркированный кристалл, если створки уже пали', () => {
  const { game } = setup();
  game.phase = F.FT_WAVE;
  const b = game.horde.spawn(F.Z_BOSS, 1)!;
  Object.assign(b, { x: 0, z: -23, state: F.ZS_WALK, t: 0 });
  game.step();
  assert.equal(b.state, F.ZS_BOSS_GATE);
  assert.equal(b.toZ, GATE.face);
  game.hitGate(9999);
  const hp = game.crystal;
  steps(game, F.BOSS_WARN_TICKS);
  assert.equal(game.crystal, hp);
  assert.equal(b.state, F.ZS_BOSS_OPEN);
});

test('удар по стене задевает стоящего на ней, а игрок под каменным ходом защищён', () => {
  const { game, players } = setup(2);
  game.phase = F.FT_WAVE;
  Object.assign(players[0].state, { x: 0, y: WALL_H, z: -14.6 });
  Object.assign(players[1].state, { x: 0, y: 0, z: -14.6 });
  const b = game.horde.spawn(F.Z_BOSS, 1)!;
  Object.assign(b, { x: 0, z: -23, stage: 2, hp: b.maxHp * 0.65, addsMask: 1 << 2,
    state: F.ZS_BOSS_PULSE, t: 1, toX: 0, toY: WALL_H + 0.8, toZ: -14.6 });
  game.step();
  assert.equal(players[0].hp, 72);
  assert.equal(players[1].hp, 100, 'камень между импульсом и игроком останавливает урон');
});

test('обычный прыжок на стене действительно спасает от импульса босса', () => {
  for (const jump of [false, true]) {
    const { game, players } = setup();
    game.phase = F.FT_WAVE;
    const p = players[0];
    Object.assign(p.state, { x: 0, y: WALL_H, z: -14.6, grounded: 1 });
    const b = game.horde.spawn(F.Z_BOSS, 1)!;
    Object.assign(b, { x: 0, z: -23, stage: 2, hp: b.maxHp * 0.65, addsMask: 1 << 2,
      state: F.ZS_BOSS_PULSE, t: 23, toX: 0, toY: WALL_H + 0.8, toZ: -14.6 });
    const input = makeInput();
    for (let i = 0; i < 23; i++) {
      input.seq = i + 1;
      input.buttons = i === 0 && jump ? BTN_JUMP : 0;
      game.onInputs(p, [input], 1);
      game.step();
    }
    assert.equal(p.hp, jump ? 100 : 72);
  }
});

test('помощь опоздавшего учитывается в награде за волну без размножения награды за убийство', () => {
  const { game, players } = setup();
  game.phaseEnd = game.tick + 1;
  game.step();
  game.horde.clear();
  const late = game.addHuman({ pid: 2, nick: 'Помощник', outfit: DEFAULT_OUTFIT }, players[0].sink)!;
  assert.equal(late.pts, 50);
  const z = game.horde.spawn(F.Z_WALKER, 1)!;
  const total = players[0].pts + late.pts;
  game.horde.damage(z, 1, late.id, false, z.x, 0.8, z.z);
  game.horde.damage(z, 59, players[0].id, false, z.x, 0.8, z.z);
  assert.equal(players[0].pts + late.pts - total, 10, 'ровно одна награда за врага');
  assert.equal(late.kills, 0, 'помощь не дублирует убийство');
  game.step();
  assert.equal(late.waves, 1, 'реальная помощь сразу засчитывает участие в волне');
  assert.equal(game.phase, F.FT_BREAK);
});

test('поздний вход без помощи требует пяти секунд участия для награды за волну', () => {
  for (const seconds of [0, 5]) {
    const { game, players } = setup();
    game.phaseEnd = game.tick + 1;
    game.step();
    game.horde.clear();
    const z = game.horde.spawn(F.Z_WALKER, 1)!;
    const late = game.addHuman({ pid: 2, nick: 'Опоздавший', outfit: DEFAULT_OUTFIT }, players[0].sink)!;
    steps(game, seconds * TICK_RATE);
    game.horde.damage(z, 999, players[0].id, false, z.x, 0.8, z.z);
    game.step();
    assert.equal(late.waves, seconds === 5 ? 1 : 0);
  }
});

test('зенитный краскомёт предпочитает дальнюю крылатку и наносит меньший урон по земле', () => {
  const { game, players } = setup();
  const p = players[0];
  standShop(game, p);
  p.pts = 1000;
  game.use(p, 1003);
  game.use(p, 1009);
  game.phase = F.FT_WAVE;
  const ground = game.horde.spawn(F.Z_WALKER, 1)!;
  Object.assign(ground, { x: -3.4, y: 0, z: -25 });
  const flyer = game.horde.spawn(F.Z_FLYER, 1)!;
  Object.assign(flyer, { x: -3.4, y: WALL_H + 4, z: -40 });
  game.turrets[0]!.cd = 0;
  game.step();
  assert.equal(ground.hp, ground.maxHp);
  assert.ok(Math.abs(flyer.hp - (flyer.maxHp - 18)) < 1e-9, 'сначала дальняя воздушная цель, 18 урона');
  game.horde.damage(flyer, 999, p.id, false, flyer.x, flyer.y, flyer.z);
  game.turrets[0]!.cd = 0;
  game.step();
  assert.ok(Math.abs(ground.hp - (ground.maxHp - 6)) < 1e-9, 'наземная цель, 6 урона');
});

test('новый защитник с переиспользованным номером не наследует убийства краскомёта и помощь ушедшего', () => {
  const { game, players } = setup(2);
  const former = players[0];
  standShop(game, former);
  former.pts = 1000;
  game.use(former, 1003);
  game.phase = F.FT_WAVE;
  game.wave = 1;
  const z = game.horde.spawn(F.Z_WALKER, 1)!;
  Object.assign(z, { x: -3.4, y: 0, z: -25 });
  game.horde.damage(z, 10, former.id, false, z.x, 0.8, z.z);
  game.removePlayer(former.id);
  const late = game.addHuman({ pid: 3, nick: 'Новый защитник', outfit: DEFAULT_OUTFIT }, former.sink)!;
  assert.equal(late.id, former.id, 'реальный сценарий переиспользования ID');
  z.hp = 1;
  game.turrets[0]!.cd = 0;
  game.step();
  assert.equal(z.alive, false, 'построенный краскомёт продолжает работать');
  assert.equal(late.kills, 0, 'построивший краскомёт ушёл — убийство стало общим');
  assert.equal(late.killPts, 0, 'старый вклад не приписывается новому человеку');
  assert.equal(late.waves, 0, 'мгновенный вход не получает участие за чужую помощь');
});
