import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as F from '../shared/fort.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { FortGame, FortPlayer } from '../server/fort/game.ts';
import type { Sink } from '../server/paintball/game.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { TICK_RATE } from '../shared/constants.ts';
import {
  ACT_GATE, ACT_SHOP, ACT_TOWER, CLEAN_MULT, GUN_MARKER, KILL_SHARE, NOPE_FAR, START_GOLD, TOWER_UPGRADE, TW_BALLISTA, TW_CANNON, UP_DMG, UP_MAG,
  gunMag, gunReload, killBounty, upgradePrice, waveBonus,
} from '../shared/fortarsenal.ts';
import { GATE, WALL_H } from '../shared/fortmap.ts';
import { decodeFortTail, encodeFortTail, fortTailSize, makeFortTail, type ZombieSnap } from '../shared/fortnet.ts';
import { BTN_JUMP, BTN_RELOAD, makeInput } from '../shared/sim.ts';

function steps(game: FortGame, n: number) { for (let i = 0; i < n; i++) game.step(); }
/** События этого тика (ещё не ушли со снимком) */
function pending(game: FortGame): F.FortEvent[] { return (game as unknown as { events: F.FortEvent[] }).events; }
function standTower(game: FortGame, p: FortPlayer, spot: number) {
  const st = game.map.stations.find((s) => s.kind === 'tower' && s.arg === spot)!;
  Object.assign(p.state, { x: st.x, y: st.y, z: st.z });
}
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

test('первые крылатки появляются на четвёртой волне, один босс — только на восьмой', () => {
  for (let w = 1; w < 4; w++) assert.equal(F.waveCounts(w, 1)[5] ?? 0, 0);
  assert.ok(F.waveCounts(4, 1)[5] > 0, 'первая воздушная атака');
  assert.equal(F.waveCounts(7, 6)[6], 0);
  assert.equal(F.waveCounts(8, 1)[6], 1);
  assert.equal(F.waveCounts(8, 6)[6], 1, 'босс не умножается числом игроков');
});

test('сервер отвергает покупку от чужого объекта игрока', () => {
  const { game, players } = setup();
  const st = game.map.stations.find((s) => s.kind === 'gate')!;
  const fake = new FortPlayer(players[0].id, 'Подмена', players[0].sink, 1, DEFAULT_OUTFIT, game.arsenal.newRun(false));
  fake.alive = true;
  fake.run.arsenal.gold = 1000;
  Object.assign(fake.state, { x: st.x, y: st.y, z: st.z });
  game.gate = F.GATE_HP - 400;
  game.use(fake, ACT_GATE);
  assert.equal(game.gate, F.GATE_HP - 400);
  assert.equal(fake.run.arsenal.gold, 1000);
});

test('лавка: «Магазин» сразу даёт +25 % патронов маркеру, повтор — следующая ступень по своей цене', () => {
  const { game, players } = setup();
  const p = players[0];
  const a = p.run.arsenal;
  const st = game.map.stations.find((s) => s.kind === 'shop');
  assert.ok(st, 'единая лавка на террасе');
  Object.assign(p.state, { x: st.x, y: st.y, z: st.z });
  a.gold = 1000;
  game.use(p, ACT_SHOP + UP_MAG);
  assert.equal(a.lv[UP_MAG], 1);
  assert.equal(p.state.ammo, gunMag(GUN_MARKER, 1));
  assert.equal(a.gold, 1000 - upgradePrice(UP_MAG, 0));
  game.use(p, ACT_SHOP + UP_MAG);
  assert.equal(a.lv[UP_MAG], 2);
  assert.equal(a.gold, 1000 - upgradePrice(UP_MAG, 0) - upgradePrice(UP_MAG, 1));
});

test('враг без стрелка: награда целиком в общак, в конце волны — поровну всем', () => {
  const { game, players } = setup(3);
  const gold = () => players.reduce((n, p) => n + p.run.arsenal.gold, 0);
  game.phaseEnd = game.tick + 1;
  game.step();
  game.horde.clear();
  const before = gold();
  const z = game.horde.spawn(F.Z_WALKER, 1)!;
  game.horde.damage(z, 999, 0, false, z.x, 1, z.z);
  assert.equal(gold(), before, 'стрелка нет — сразу никому');
  const total = killBounty(F.Z_WALKER, 1) / KILL_SHARE;
  assert.ok(Math.abs(game.arsenal.pot - total) < 1e-9);
  game.step();
  assert.equal(game.phase, F.FT_BREAK);
  for (const p of players) assert.equal(p.run.arsenal.gold, START_GOLD + Math.round((total * CLEAN_MULT) / 3) + waveBonus(1));
});

test('лавка и башни: далеко или мало золота — отказ; в бою — можно; улучшать — только построенную, занятое не перестроить', () => {
  const { game, players } = setup();
  const p = players[0];
  const a = p.run.arsenal;
  a.gold = 1000;
  Object.assign(p.state, { x: -20, y: 0, z: -50 });
  game.use(p, ACT_SHOP + UP_DMG);
  assert.equal(a.gold, 1000, 'далеко от прилавка');
  assert.ok(pending(game).some((e) => e[0] === 'anope' && e[1] === p.id && e[3] === NOPE_FAR));
  standShop(game, p);
  a.gold = upgradePrice(UP_DMG, 0) - 1;
  game.use(p, ACT_SHOP + UP_DMG);
  assert.equal(a.lv[UP_DMG], 0, 'не хватает золота');
  a.gold = 1000;
  game.phase = F.FT_WAVE;
  game.use(p, ACT_SHOP + UP_DMG);
  assert.equal(a.lv[UP_DMG], 1, 'лавка работает и в бою');
  standTower(game, p, 2);
  const gold0 = a.gold;
  game.use(p, ACT_TOWER + 2 * 10 + TOWER_UPGRADE);
  assert.equal(a.gold, gold0, 'улучшать нечего');
  game.use(p, ACT_TOWER + 2 * 10 + TW_CANNON);
  assert.equal(game.arsenal.towers[2].type, TW_CANNON, 'башни ставят и в бою');
  game.use(p, ACT_TOWER + 2 * 10 + TW_BALLISTA);
  assert.equal(game.arsenal.towers[2].type, TW_CANNON, 'занятое место не перестроить');
  a.gold = 5000;
  game.use(p, ACT_TOWER + 2 * 10 + TOWER_UPGRADE);
  assert.equal(game.arsenal.towers[2].level, 2);
});

test('прокачанный магазин сохраняется после ручной и автоматической перезарядки', () => {
  const { game, players } = setup();
  const p = players[0];
  standShop(game, p);
  p.run.arsenal.gold = 1000;
  game.use(p, ACT_SHOP + UP_MAG);
  const mag = gunMag(GUN_MARKER, 1);
  const reload = gunReload(GUN_MARKER, 0);
  p.state.ammo = 35;
  const inp = makeInput();
  inp.seq = 1;
  inp.buttons = BTN_RELOAD;
  game.onInputs(p, [inp], 1);
  game.step();
  assert.equal(p.state.reloadT, reload);
  inp.buttons = 0;
  for (let i = 0; i < reload; i++) {
    inp.seq++;
    game.onInputs(p, [inp], 1);
    game.step();
  }
  assert.equal(p.state.ammo, mag);
  p.state.ammo = 0;
  p.state.reloadT = 1;
  inp.seq++;
  game.onInputs(p, [inp], 1);
  game.step();
  assert.equal(p.state.ammo, mag);
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

test('босс защищён бронёй, открывает ядро и проходит три фазы с ограниченными подкреплениями', () => {
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
  game.step();
  assert.equal(b.stage, 2);
  const afterPhase2 = game.horde.alive;
  steps(game, 10);
  assert.equal(game.horde.alive, afterPhase2, 'подкрепления выдаются один раз за фазу');
  b.hp = b.maxHp * 0.32;
  game.step();
  assert.equal(b.stage, 3);
  assert.equal(game.horde.alive, afterPhase2 + 4);
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

test('восьмая волна не заканчивается с живым боссом; подкрепления не пробивают лимит 60', () => {
  const { game, players } = setup(6);
  game.phase = F.FT_WAVE;
  game.wave = 8;
  const b = game.horde.spawn(F.Z_BOSS, 1, 6)!;
  assert.equal(b.maxHp, 16900);
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
  const buf = new Uint8Array(fortTailSize(1));
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
  // опоздавшему — стартовые и 75 % от среднего заработка команды (пока никто ничего не заработал)
  assert.equal(late.run.arsenal.gold, START_GOLD);
  const z = game.horde.spawn(F.Z_WALKER, 1)!;
  const gold = () => players[0].run.arsenal.gold + late.run.arsenal.gold;
  const total = gold();
  game.horde.damage(z, 1, late.id, false, z.x, 0.8, z.z);
  game.horde.damage(z, 59, players[0].id, false, z.x, 0.8, z.z);
  assert.equal(gold() - total, killBounty(F.Z_WALKER, 1), 'ровно одна доля стрелков за врага');
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

test('баллиста сначала бьёт крылатку, даже если шаркун ближе', () => {
  const { game, players } = setup();
  const p = players[0];
  p.run.arsenal.gold = 1000;
  standTower(game, p, 0);
  game.use(p, ACT_TOWER + TW_BALLISTA);
  game.phase = F.FT_WAVE;
  const ground = game.horde.spawn(F.Z_WALKER, 1)!;
  Object.assign(ground, { x: -4.9, y: 0, z: -24, hp: 1000, maxHp: 1000 });
  const flyer = game.horde.spawn(F.Z_FLYER, 1)!;
  Object.assign(flyer, { x: -4.9, y: WALL_H + 4, z: -40, hp: 1000, maxHp: 1000 });
  game.arsenal.towers[0].cd = 0;
  game.step();
  assert.equal(ground.hp, 1000);
  assert.ok(flyer.hp < 1000, 'сначала воздушная цель');
});

test('новый защитник с переиспользованным номером не наследует убийства башни и вклад ушедшего', () => {
  const { game, players } = setup(2);
  const former = players[0];
  former.run.arsenal.gold = 1000;
  standTower(game, former, 0);
  game.use(former, ACT_TOWER + TW_BALLISTA);
  game.phase = F.FT_WAVE;
  game.wave = 1;
  const z = game.horde.spawn(F.Z_WALKER, 1)!;
  Object.assign(z, { x: -4.9, y: 0, z: -25 });
  // ещё один — далеко: волна не кончается, и общак не делится прямо в этом тике
  const keeper = game.horde.spawn(F.Z_WALKER, 1)!;
  Object.assign(keeper, { x: 60, y: 0, z: -80, hp: 9999, maxHp: 9999 });
  game.horde.damage(z, 10, former.id, false, z.x, 0.8, z.z);
  game.removePlayer(former.id);
  const late = game.addHuman({ pid: 3, nick: 'Новый защитник', outfit: DEFAULT_OUTFIT }, former.sink)!;
  assert.equal(late.id, former.id, 'реальный сценарий переиспользования ID');
  const lateGold = late.run.arsenal.gold;
  const pot = game.arsenal.pot;
  z.hp = 1;
  game.arsenal.towers[0].cd = 0;
  game.step();
  assert.equal(z.alive, false, 'построенная башня продолжает работать');
  assert.equal(late.kills, 0, 'вкладчик башни ушёл — убийство не его');
  assert.equal(late.run.arsenal.killGold, 0, 'старый вклад не приписывается новому человеку');
  assert.equal(late.run.arsenal.gold, lateGold, 'доля ушедшего вкладчика — в общак, а не новичку');
  assert.ok(Math.abs(game.arsenal.pot - pot - killBounty(F.Z_WALKER, 1) / KILL_SHARE) < 1e-9, 'вся награда — в общак');
  assert.equal(late.waves, 0, 'мгновенный вход не получает участие за чужую помощь');
});
