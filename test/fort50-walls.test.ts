import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import { FT_BREAK, FT_END, FT_WAVE, Z_BRUTE, Z_CLIMBER, Z_GATE_EVERY, Z_WALKER, ZS_ATTACK, ZS_CLIMB, type FortEvent } from '../shared/fort.ts';
import {
  holeCenter, STONE_FALL_TICKS, STONE_GAP_TICKS, STONE_STUN_TICKS, USE_STONE, USE_WALL_FIX, USE_WALL_STOP,
  WALL_PATCH, WALL_SECTIONS, wallFixPrice, wallFixTicks, wallMaxHp, wallOuterPoint,
} from '../shared/fort50.ts';
import { ACT_TOWER, NOPE_GOLD, NOPE_LOCKED, TW_BALLISTA } from '../shared/fortarsenal.ts';
import { buildFort, CLIMBS, MERLON_H, PARAPET_H, WALL_H, insideFort } from '../shared/fortmap.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { FortGame, type FortPlayer } from '../server/fort/game.ts';
import { F50_FEATURES, planWave } from '../server/fort/director.ts';
import { Z_BATTERY, Z_SIEGE_TOWER, ZS_SIEGE_ACTION, ZS_SIEGE_DEPLOY, ZS_SIEGE_WINDUP } from '../shared/fortsiege.ts';
import type { Sink } from '../server/paintball/game.ts';
import { BOSS_WARN_TICKS, ZK, Z_BOSS, Z_RAM, Z_GOLEM, Z_KRAKEN, Z_TENTACLE, ZS_BOSS_PULSE, ZS_QUAKE, ZS_THROW, ZS_WALK, ZS_CHARGE_WARN, ZS_CHARGE, ZS_TENT_SLAM, ZS_LS_ROOTS, ZS_PK_ROLL } from '../shared/fort.ts';
import { GOLEM_HOME_Z, RAM_HOME_Z, ROCK_FLIGHT_TICKS, Z_PUMPKIN, Z_LESHY } from '../shared/fortkinds.ts';
import { WALL_DMG } from '../shared/fort50.ts';
import { stepBaron, stepGolem, stepRam } from '../server/fort/bosses.ts';
import { stepTentacle } from '../server/fort/kraken.ts';
import { stepPumpkin } from '../server/fort/boss-pumpkin.ts';
import { stepLeshy } from '../server/fort/boss-leshy.ts';
import { PK_POST_Z } from '../shared/fortbosses.ts';
import { BATTERY_FLIGHT_TICKS, CRAB_IMPACT_REMAINING, Z_CRABCRANE } from '../shared/fortsiege.ts';
import { EV_METEORS } from '../shared/fortwaves.ts';

function setup(count = 1) {
  const messages: ServerMsg[] = [], events: FortEvent[] = [];
  const sink: Sink = { sendBinary() {}, sendJson(m) { messages.push(m); }, close() {} };
  const g = new FortGame({ fort50: true });
  const players: FortPlayer[] = [];
  for (let i = 0; i < count; i++) players.push(g.addHuman({ pid: i + 1, nick: `Tester${i + 7}`, outfit: DEFAULT_OUTFIT }, sink)!);
  const event = g.event.bind(g);
  g.event = (e) => { events.push(e); event(e); };
  g.debug = true;
  return { g, p: players[0], players, messages, events };
}
const secOf = (id: string) => WALL_SECTIONS.findIndex((s) => s.id === id);
const w2 = secOf('w2');
function atRepair(p: FortPlayer, sec: number): void {
  const c = holeCenter(sec), s = WALL_SECTIONS[sec];
  Object.assign(p.state, { x: c.x - s.nx * 2.2, y: 0, z: c.z - s.nz * 2.2 });
}
function work(g: FortGame, ticks: number): void {
  for (let i = 0; i < ticks; i++) { g.tick++; g.walls.step(); }
}

test('разрезанная карта сохраняет объём и стойки; восемь сквозных дыр идут от земли до зубцов', () => {
  const whole = buildFort(), cut = buildFort({ sections: true });
  const volume = (map: typeof whole) => map.boxes.reduce((v, b) => v + (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]), 0);
  assert(Math.abs(volume(whole) - volume(cut)) < 1e-7);
  assert.deepEqual(whole, buildFort({ sections: false }));
  assert.deepEqual(cut.stations, whole.stations);
  assert.deepEqual(cut.spawns, whole.spawns);
  assert.deepEqual(cut.boxes[cut.gateBox], whole.boxes[whole.gateBox]);
  assert.equal(WALL_SECTIONS.filter((s) => s.kind === 'passage').length, 8);
  for (const [sec, s] of WALL_SECTIONS.entries()) {
    const boxes = cut.sections![sec].map((i) => cut.boxes[i]);
    assert(boxes.length > 0, s.id);
    assert.equal(Math.min(...boxes.map((b) => b.min[1])), s.kind === 'passage' ? 0 : WALL_H, s.id);
    assert.equal(Math.max(...boxes.map((b) => b.max[1])), WALL_H + PARAPET_H + MERLON_H, s.id);
    for (const b of boxes) {
      assert(b.min[0] >= s.hole[0] && b.max[0] <= s.hole[1] && b.min[2] >= s.hole[2] && b.max[2] <= s.hole[3], s.id);
    }
  }
});

test('пролом выключает коллизию, меняет путь только своей игры; башня участка молчит и закрыта для покупки', () => {
  const { g, p, events } = setup();
  const other = new FortGame({ fort50: true });
  const intact = g.horde.field;
  assert(g.world.overlaps(-16.8, 1, 6.8, -16.2, 2, 7.2));
  g.command(p, '/wall w2 0');
  assert.equal(g.walls.hp[w2], 0);
  assert.equal(g.walls.stones[w2], 0);
  assert(!g.world.overlaps(-16.8, 1, 6.8, -16.2, 2, 7.2));
  assert.notEqual(g.horde.field, intact);
  assert.equal(other.horde.field, intact);
  assert.equal(g.horde.nav.fieldFor(0, false), intact);
  assert.equal(g.horde.nav.fieldFor(g.horde.breachMask, true), g.horde.field);
  const breached = g.horde.field;
  g.hitGate(1e9);
  assert.notEqual(g.horde.field, breached);
  g.raiseGate(1000);
  assert.equal(g.horde.field, breached);
  const z = g.horde.spawn(Z_WALKER, 0)!;
  Object.assign(z, { x: -22, y: 0, z: 7 });
  for (let i = 0; i < 480 && !insideFort(z.x, z.z); i++) { g.tick++; g.horde.step(); }
  assert(insideFort(z.x, z.z), `остался снаружи: ${z.x}, ${z.z}`);
  const sec = secOf('w1'), spot = WALL_SECTIONS[sec].tower;
  const tower = g.arsenal.towers[spot];
  tower.type = TW_BALLISTA; tower.level = 1; tower.cd = 0;
  g.command(p, '/wall w1 0');
  g.phase = FT_WAVE;
  const target = g.horde.spawn(Z_WALKER, 0)!;
  Object.assign(target, { x: -20, y: 0, z: -9.5, hp: 1e6, maxHp: 1e6 });
  g.arsenal.step();
  assert.equal(target.hp, 1e6);
  p.run.arsenal.gold = 10000;
  g.use(p, ACT_TOWER + spot * 10);
  assert(events.some((e) => e[0] === 'anope' && e[1] === p.id && e[3] === NOPE_LOCKED));
  g.command(p, '/wall w1 100');
  g.arsenal.step();
  assert(target.hp < 1e6, 'после ремонта та же башня снова стреляет');
});

test('чётный Бугай бьёт свой участок; щит уменьшает урон вдвое, стадия и частота whit соблюдаются', () => {
  const { g, events } = setup();
  g.phase = FT_WAVE;
  const odd = g.horde.spawn(Z_BRUTE, 0)!;
  assert.equal(odd.wallSec, -1);
  const z = g.horde.spawn(Z_BRUTE, 0)!;
  assert(z.wallSec >= 0);
  const sec = z.wallSec, at = wallOuterPoint(sec, 1.2);
  Object.assign(z, { x: at.x, y: 0, z: at.z });
  const hp = g.walls.hp[sec];
  g.tick++; g.horde.step();
  assert.equal(z.state, ZS_ATTACK);
  assert.equal(z.atk, 1);
  const damage = hp - g.walls.hp[sec];
  assert(damage > 0);
  g.rallyUntil = g.tick + 1000;
  z.atkCd = 0;
  const hp2 = g.walls.hp[sec];
  g.tick++; g.horde.step();
  assert.equal(hp2 - g.walls.hp[sec], damage / 2);
  assert.equal(events.filter((e) => e[0] === 'whit' && e[1] === sec).length, 1);
  g.walls.setPercent(sec, 0);
  g.tick += Z_GATE_EVERY; g.horde.step();
  assert.equal(z.wallSec, -1);
});

test('ремонт: один 5 секунд, двое 3 секунды; платит начавший, пролом закрывается на 40%', () => {
  for (const count of [1, 2]) {
    const { g, p, players } = setup(count);
    g.phase = FT_WAVE; g.wave = 10;
    g.walls.startWave(10);
    g.command(p, '/wall w2 0');
    for (const q of players) { atRepair(q, w2); q.run.arsenal.gold = q === p ? 1000 : 0; g.use(q, USE_WALL_FIX + w2); }
    assert.equal(g.walls.state().fix[0][5], p.id);
    assert.equal(g.walls.state().fix[0].length, 5 + count);
    const ticks = (count === 1 ? 5 : 3) * TICK_RATE;
    assert.equal(wallFixTicks(count), ticks);
    work(g, ticks - 1);
    assert.equal(g.walls.hp[w2], 0);
    assert.equal(p.run.arsenal.gold, 1000);
    work(g, 1);
    assert.equal(g.walls.hp[w2], wallMaxHp(w2, 10) * WALL_PATCH);
    assert.equal(p.run.arsenal.gold, 1000 - wallFixPrice(10));
    if (count === 2) assert.equal(players[1].run.arsenal.gold, 0);
    assert.equal(g.walls.state().fix.length, 0);
    assert(g.world.overlaps(-16.8, 1, 6.8, -16.2, 2, 7.2));
    assert.equal(g.horde.field, g.horde.nav.toCrystal);
  }
});

test('ремонт отменяется без оплаты при движении, стрельбе, ударе, смерти, отпускании и выходе плательщика', () => {
  for (const reason of ['move', 'fire', 'hurt', 'dead', 'stop', 'leave']) {
    const { g, p, players } = setup(2);
    g.phase = FT_WAVE;
    g.command(p, '/wall w2 0');
    for (const q of players) { atRepair(q, w2); q.run.arsenal.gold = 1000; g.use(q, USE_WALL_FIX + w2); }
    work(g, 30);
    if (reason === 'move') p.state.z += 0.51;
    if (reason === 'fire') p.firingUntil = g.tick + 8;
    if (reason === 'hurt') g.hitPlayer(0, p.id, 1);
    if (reason === 'dead') p.alive = false;
    if (reason === 'stop') g.use(p, USE_WALL_STOP);
    if (reason === 'leave') g.removePlayer(p.id);
    work(g, 1);
    assert.equal(g.walls.state().fix.length, 0, reason);
    assert.equal(g.walls.hp[w2], 0, reason);
    assert.equal(p.run.arsenal.gold, 1000, reason);
  }
});

test('ремонт проверяет золото в начале и конце; передышка чинит сразу по цене следующей волны', () => {
  const { g, p, events } = setup();
  atRepair(p, w2);
  g.command(p, '/wall w2 0');
  g.phase = FT_WAVE;
  p.run.arsenal.gold = 0;
  g.use(p, USE_WALL_FIX + w2);
  assert.equal(g.walls.state().fix.length, 0);
  p.run.arsenal.gold = 1000;
  g.use(p, USE_WALL_FIX + w2);
  p.run.arsenal.gold = 0;
  work(g, wallFixTicks(1));
  assert.equal(g.walls.hp[w2], 0);
  assert.equal(events.filter((e) => e[0] === 'anope' && e[3] === NOPE_GOLD).length, 2);
  g.phase = FT_BREAK; g.wave = 9; p.run.arsenal.gold = 1000;
  g.use(p, USE_WALL_FIX + w2);
  assert.equal(p.run.arsenal.gold, 1000 - wallFixPrice(10));
  assert.equal(g.walls.hp[w2] / g.walls.max[w2], 0.4);
  g.walls.startWave(10);
  assert.equal(g.walls.hp[w2] / g.walls.max[w2], 0.4);
  g.use(p, USE_WALL_FIX + w2);
  assert.equal(g.walls.hp[w2] / g.walls.max[w2], 0.75);
});

test('камень: задержка, полоса, награда, сбитая липучка, оглушение тяжёлого и пауза штабеля', () => {
  const { g, p, events } = setup();
  const s = WALL_SECTIONS[w2];
  Object.assign(p.state, { x: s.stack[0], y: s.stack[1], z: s.stack[2] });
  const z = g.horde.spawn(Z_WALKER, 0)!;
  Object.assign(z, { x: -19, y: 0, z: 7 });
  const heavy = g.horde.spawn(Z_BRUTE, 0)!;
  Object.assign(heavy, { x: -19, y: 0, z: 8, wallSec: w2, state: ZS_ATTACK, hp: 1e6 });
  const climber = g.horde.spawn(Z_CLIMBER, 0)!;
  Object.assign(climber, { x: -18.5, y: 2.5, z: 6, state: ZS_CLIMB });
  const outside = g.horde.spawn(Z_WALKER, 0)!;
  Object.assign(outside, { x: -21, y: 0, z: 7 });
  const gold = p.run.arsenal.gold;
  g.use(p, USE_STONE + w2);
  g.use(p, USE_STONE + w2);
  assert.equal(g.walls.stones[w2], 2);
  work(g, STONE_FALL_TICKS - 1);
  assert(z.alive);
  work(g, 1);
  assert(!z.alive && !climber.alive);
  assert(outside.alive);
  assert.equal(heavy.atkCd, STONE_STUN_TICKS);
  assert(p.run.arsenal.gold > gold);
  assert(events.some((e) => e[0] === 'stone' && e[1] === w2 && e[2] === p.id && e[5] === 2));
  g.use(p, USE_STONE + w2);
  assert.equal(g.walls.stones[w2], 2);
  work(g, STONE_GAP_TICKS - STONE_FALL_TICKS);
  g.use(p, USE_STONE + w2);
  assert.equal(g.walls.stones[w2], 1);
  g.phase = FT_END;
  work(g, STONE_FALL_TICKS);
  assert.equal(events.filter((e) => e[0] === 'stone').length, 1, 'после итогов отложенный камень не наносит урон');
  g.walls.setPercent(w2, 0);
  g.command(p, '/stones');
  assert.equal(g.walls.stones[w2], 0);
  assert.equal(g.walls.stones[0], 3);
});

test('открытый пролом отменяет лазанье и высадку мостика; две машины осады действуют в одной волне', () => {
  const { g, p } = setup();
  g.command(p, '/wall nw 0');
  const c = CLIMBS[0];
  const z = g.horde.spawn(Z_CLIMBER, 0)!;
  Object.assign(z, { x: c.x, y: 0, z: c.z - 1, climb: 0 });
  g.horde.stepGround(z, true);
  assert.equal(z.climb, -1);
  const passenger = g.horde.spawn(Z_WALKER, 0)!;
  g.horde.siege.board(passenger, 0);
  assert.equal(passenger.y, 0);
  assert.equal(passenger.climb, -1);
  assert(passenger.z < c.z);
  g.horde.clear();
  g.horde.startWave(planWave(19, 2, 1, undefined, F50_FEATURES), g.tick);
  const seen = new Set<number>();
  for (let i = 0; i < 45 * TICK_RATE && seen.size < 2; i++) {
    g.tick++; g.horde.step();
    for (const mob of g.horde.zombies) {
      if (!mob.alive) continue;
      if (mob.kind === Z_SIEGE_TOWER || mob.kind === Z_BATTERY) {
        if ([ZS_SIEGE_ACTION, ZS_SIEGE_DEPLOY, ZS_SIEGE_WINDUP].includes(mob.state)) seen.add(mob.kind);
      } else g.horde.remove(mob);
    }
  }
  assert.deepEqual([...seen].sort(), [Z_SIEGE_TOWER, Z_BATTERY].sort());
});

test('f50 отправляется с целыми HP не чаще 6 тиков; новая игра восстанавливает участки и камни', () => {
  const { g, p, messages } = setup();
  messages.length = 0;
  g.walls.hit(w2, 0.3, -18, 1, 7);
  g.walls.flush();
  for (let i = 0; i < 5; i++) { g.tick++; g.walls.hit(w2, 0.3, -18, 1, 7); g.walls.flush(); }
  assert.equal(messages.filter((m) => m.t === 'f50').length, 1);
  g.tick++; g.walls.flush();
  const states = messages.filter((m) => m.t === 'f50');
  assert.equal(states.length, 2);
  assert(states.every((m) => m.hp.every(Number.isInteger) && m.max.every(Number.isInteger) && m.camp === null));
  g.walls.hit(w2, g.walls.hp[w2] - 0.2, -18, 1, 7);
  assert.equal(g.walls.state().hp[w2], 1, 'целая коллизия не должна выглядеть проломом из-за округления');
  g.command(p, '/wall all 0');
  g.walls.startWave(40);
  assert(g.walls.hp.every((v) => v === 0));
  g.phase = FT_END;
  g.newGame();
  assert.deepEqual(g.walls.hp, g.walls.max);
  assert(g.walls.stones.every((v) => v === 3));
  assert.equal(g.horde.breachMask, 0);
});

test('Ф50: второй рывок Тарана идёт в слабейший северный участок; щупальце повреждает морскую стену', () => {
  for (const fort50 of [true, false]) {
    const g = new FortGame({ fort50 });
    const events: FortEvent[] = [];
    g.event = (e) => events.push(e);
    g.phase = FT_WAVE;
    g.horde.dmgMul = 1.5;
    const c = { host: g, horde: g.horde };
    const ram = g.horde.spawn(Z_RAM, 1)!;
    const sec = secOf('ne');
    g.walls.setPercent(sec, 80);
    const before = [...g.walls.hp];
    for (let charge = 1; charge <= 2; charge++) {
      Object.assign(ram, { x: 0, z: RAM_HOME_Z, state: ZS_WALK, t: 1, attackIndex: (charge - 1) * 2 });
      stepRam(c, ram);
      assert.equal(ram.state, ZS_CHARGE_WARN);
      if (charge === 2 && fort50) {
        const to = wallOuterPoint(sec, ZK[Z_RAM].r + 0.4);
        assert.equal(ram.toX, to.x);
        assert.equal(ram.toZ, to.z);
        assert(events.some((e) => e[0] === 'warn' && e[2] === ZS_CHARGE_WARN && e[3] === ram.toX && e[5] === ram.toZ));
      }
      const gate = g.gate;
      for (let i = 0; i < BOSS_WARN_TICKS; i++) { g.tick++; stepRam(c, ram); }
      assert.equal(ram.state, ZS_CHARGE);
      for (let i = 0; i < 300 && ram.state === ZS_CHARGE; i++) { g.tick++; stepRam(c, ram); }
      if (charge === 2 && fort50) {
        assert.equal(g.gate, gate);
        assert.equal(before[sec] - g.walls.hp[sec], WALL_DMG.ram * 1.5);
      } else assert(g.gate < gate);
    }
    const head = g.horde.spawn(Z_KRAKEN, 1)!;
    const tent = g.horde.spawn(Z_TENTACLE, 1)!;
    Object.assign(tent, { state: ZS_TENT_SLAM, chase: head.id, toX: -12, toY: WALL_H + 0.06, toZ: 12.3, t: 1 });
    const sea = secOf('sw'), hp = g.walls.hp[sea];
    g.tick++; stepTentacle(c, tent);
    if (fort50) assert.equal(hp - g.walls.hp[sea], WALL_DMG.tentacle * 1.5);
    else assert.deepEqual(g.walls.hp, before);
  }
});

test('Ф50: Валун, Барон, Тыква, Леший, Краб и батарея наносят заданный урон; метеор без множителя', () => {
  const { g, events } = setup();
  g.phase = FT_WAVE;
  g.horde.dmgMul = 1.5;
  const c = { host: g, horde: g.horde };
  const nw = secOf('nw'), bw = secOf('bw');
  const loss = (sec: number, amount: number, hit: () => void) => {
    const hp = g.walls.hp[sec]; hit();
    assert(Math.abs(hp - g.walls.hp[sec] - amount) < 1e-7, `участок ${sec}: снято ${hp - g.walls.hp[sec]}, ожидали ${amount}`);
  };
  const baron = g.horde.spawn(Z_BOSS, 1)!;
  Object.assign(baron, { state: ZS_BOSS_PULSE, toX: -12, toY: WALL_H, toZ: -14.6, t: 1 });
  loss(nw, WALL_DMG.baron * 1.5, () => stepBaron(c, baron));
  const golem = g.horde.spawn(Z_GOLEM, 1)!;
  g.walls.setPercent(bw, 60);
  for (let n = 0; n < 2; n++) {
    Object.assign(golem, { state: ZS_WALK, x: 0, z: GOLEM_HOME_Z, t: 1 });
    stepGolem(c, golem);
    assert.equal(golem.state, ZS_THROW);
    if (n === 1) {
      assert.equal(golem.toY, WALL_H);
      golem.t = ROCK_FLIGHT_TICKS + 1; stepGolem(c, golem);
      assert(events.some((e) => e[0] === 'throw' && e[4] === golem.toX && e[6] === golem.toZ));
      const gate = g.gate;
      loss(bw, WALL_DMG.rock * 1.5, () => { golem.t = 1; stepGolem(c, golem); });
      assert.equal(g.gate, gate);
    } else { golem.t = 1; stepGolem(c, golem); }
  }
  Object.assign(golem, { state: ZS_QUAKE, x: -10, z: -20, t: 1 });
  loss(nw, WALL_DMG.quake * 1.5, () => stepGolem(c, golem));
  const pumpkin = g.horde.spawn(Z_PUMPKIN, 1)!;
  Object.assign(pumpkin, { state: ZS_PK_ROLL, x: -12, z: PK_POST_Z, fromX: -12, homeX: 12, chase: 0, t: 2 });
  const north = [g.walls.hp[nw], g.walls.hp[1]];
  stepPumpkin(c, pumpkin); stepPumpkin(c, pumpkin);
  assert.equal(north[0] - g.walls.hp[nw], WALL_DMG.pumpkin * 1.5);
  assert.equal(north[1] - g.walls.hp[1], WALL_DMG.pumpkin * 1.5);
  const leshy = g.horde.spawn(Z_LESHY, 1)!;
  Object.assign(leshy, { state: ZS_LS_ROOTS, toX: 12, toY: WALL_H, toZ: -14.6, t: 1 });
  loss(1, WALL_DMG.leshy * 1.5, () => stepLeshy(c, leshy));
  const crab = g.horde.spawn(Z_CRABCRANE, 1)!;
  for (const attackIndex of [0, 2]) {
    Object.assign(crab, { x: 10, z: -25, state: ZS_SIEGE_DEPLOY, t: 1, attackIndex });
    g.horde.siege.step(crab);
    Object.assign(crab, { state: ZS_SIEGE_ACTION, t: CRAB_IMPACT_REMAINING + 1 });
    if (attackIndex === 2) {
      const gate = g.gate;
      loss(1, WALL_DMG.crab * 1.5, () => g.horde.siege.step(crab));
      assert.equal(g.gate, gate);
    } else g.horde.siege.step(crab);
  }
  g.walls.setPercent(bw, 30);
  const battery = g.horde.spawn(Z_BATTERY, 1)!;
  for (const attackIndex of [0, 1]) {
    Object.assign(battery, { state: ZS_SIEGE_DEPLOY, t: 1, attackIndex });
    g.horde.siege.step(battery);
    battery.t = 1; g.horde.siege.step(battery);
    g.tick += BATTERY_FLIGHT_TICKS;
    if (attackIndex === 1) {
      const gate = g.gate;
      loss(bw, WALL_DMG.battery * 1.5, () => g.horde.siege.tick());
      assert.equal(g.gate, gate);
    } else g.horde.siege.tick();
  }
  // Свежие стены: один осадный метеор по сооружению, без волнового множителя.
  g.walls.reset(); events.length = 0;
  g.waveEvents.start({ ...planWave(20, 1, 11, undefined, F50_FEATURES), event: EV_METEORS }, g.tick);
  for (let i = 0; i < 2000 && !events.some((e) => e[0] === 'meteor'); i++) { g.tick++; g.waveEvents.step(); }
  const meteor = events.find((e) => e[0] === 'meteor')!;
  assert(meteor && meteor[0] === 'meteor');
  g.tick = meteor[10];
  const total = g.walls.hp.reduce((a, b) => a + b, 0);
  g.waveEvents.step();
  assert.equal(total - g.walls.hp.reduce((a, b) => a + b, 0), WALL_DMG.meteor);
});
