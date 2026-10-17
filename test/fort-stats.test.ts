import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FortGame, type FortPlayer } from '../server/fort/game.ts';
import { TOWER_BY } from '../server/fort/arsenal.ts';
import { FT_WAVE, Z_ARMORED, Z_BLOATER, Z_SAPPER, Z_SHIELD, Z_WALKER } from '../shared/fort.ts';
import { ACT_TOWER, TOWER_UPGRADE, TW_BALLISTA, TW_BRAZIER, TW_CANNON, TW_TAR } from '../shared/fortarsenal.ts';
import { TOWER_SPOTS } from '../shared/fortmap.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { makeInput } from '../shared/sim.ts';

function sink() {
  const messages: ServerMsg[] = [];
  return { messages, sendJson(m: ServerMsg) { messages.push(m); }, sendBinary() {}, close() {} };
}

function setup() {
  const game = new FortGame();
  const aSink = sink(), bSink = sink();
  const a = game.addHuman({ pid: 101, nick: 'Первый', outfit: DEFAULT_OUTFIT }, aSink)!;
  const b = game.addHuman({ pid: 102, nick: 'Второй', outfit: DEFAULT_OUTFIT }, bSink)!;
  game.phase = FT_WAVE;
  game.wave = 1;
  return { game, a, b, aSink, bSink };
}

function target(game: FortGame, hp = 100, kind = Z_WALKER, x = 0, z = -40) {
  const enemy = game.horde.spawn(kind, 1)!;
  Object.assign(enemy, { hp, maxHp: hp, x, y: 0, z, yaw: 0 });
  return enemy;
}

function build(game: FortGame, player: FortPlayer, spot: number, type: number) {
  player.run.arsenal.gold = 10000;
  const station = game.map.stations.find(s => s.kind === 'tower' && s.arg === spot)!;
  Object.assign(player.state, { x: station.x, y: station.y, z: station.z });
  game.use(player, ACT_TOWER + spot * 10 + type);
  assert.equal(game.arsenal.towers[spot].type, type);
}

test('TAB: личный урон растёт до убийства, добивание не забирает чужой вклад и не считает overkill', () => {
  const { game, a, b } = setup();
  const z = target(game);
  game.horde.damage(z, 40, a.id, false, z.x, 1, z.z);
  assert.equal(game.roster().find(r => r.id === a.id)?.damage, 40);
  assert.equal(a.kills, 0);
  game.horde.damage(z, 1000, b.id, false, z.x, 1, z.z);
  assert.equal(game.roster().find(r => r.id === a.id)?.damage, 40);
  assert.equal(game.roster().find(r => r.id === b.id)?.damage, 60);
  assert.equal(b.kills, 1);
  game.horde.damage(z, 1000, a.id, false, z.x, 1, z.z);
  assert.equal(a.run.arsenal.damage, 40, 'мёртвый враг повторно не учитывается');
});

test('TAB: учитываются снятая прочность щита и урон после брони, но не поглощённая бронёй часть', () => {
  const { game, a } = setup();
  const shield = target(game, 100, Z_SHIELD);
  shield.shield = 50;
  game.horde.damage(shield, 20, a.id, false, shield.x, .8, shield.z, shield.x, shield.z - 20);
  assert.equal(shield.hp, 100);
  assert.equal(a.run.arsenal.damage, 20);
  game.horde.damage(shield, 80, a.id, false, shield.x, .8, shield.z, shield.x, shield.z - 20);
  assert.equal(shield.hp, 50);
  assert.equal(a.run.arsenal.damage, 100, '50 щита и 50 HP, без двойного учёта');
  const armor = target(game, 300, Z_ARMORED, 20);
  game.horde.damage(armor, 20, a.id, false, armor.x, .8, armor.z);
  assert.ok(armor.hp > 280);
  assert.equal(a.run.arsenal.damage, 100 + 300 - armor.hp);
});

test('TAB: взрывы по площади и вызванные игроком цепочки учитывают все повреждённые цели', () => {
  for (const kind of [Z_BLOATER, Z_SAPPER]) {
    const { game, a } = setup();
    const bomb = target(game, 20, kind);
    bomb.carry = kind === Z_SAPPER;
    const nearby = target(game, 500, Z_WALKER, 1);
    game.horde.damage(bomb, 20, a.id, false, bomb.x, 1, bomb.z);
    assert.ok(nearby.hp < 500, 'цепной взрыв действительно попал');
    assert.ok(Math.abs(a.run.arsenal.damage - (20 + 500 - nearby.hp)) < 1e-7);
  }
  const { game, a } = setup();
  const left = target(game, 100), right = target(game, 100, Z_WALKER, 1);
  game.horde.areaDamage(0, 1, -40, 4, 25, a.id);
  assert.equal(a.run.arsenal.damage, 50);
  assert.equal(left.hp, 75);
  assert.equal(right.hp, 75);
  game.horde.areaDamage(0, 1, -40, 4, 25, 0);
  assert.equal(a.run.arsenal.damage, 50, 'нейтральный урон не приписывается игроку');
});

test('TAB: все четыре вида вышек считают настоящий урон, включая ядра, горение и смолу', () => {
  for (const type of [TW_BALLISTA, TW_CANNON, TW_TAR, TW_BRAZIER]) {
    const { game, a } = setup();
    build(game, a, 0, type);
    const pos = TOWER_SPOTS[0];
    const z = target(game, 100000, Z_WALKER, pos.x, type === TW_CANNON || type === TW_BALLISTA ? -37 : -22);
    game.arsenal.towers[0].cd = 0;
    for (let i = 0; i < 600; i++) { game.tick++; game.arsenal.step(); }
    const stats = game.arsenal.towerStats()[0];
    assert.ok(z.hp < 100000, `тип ${type} нанёс урон`);
    assert.equal(stats.damage, Math.round(100000 - z.hp), `тип ${type}: урон совпадает с потерянным HP`);
    assert.equal(stats.gold, 0, 'живой враг пока не принёс денег');
    assert.equal(a.run.arsenal.damage, 0, 'урон вышки не дублируется у вкладчика');
  }
});

test('TAB: цепочка Пузырь → Подрывник сохраняет инициатора, а самостоятельный взрыв остаётся ничьим', () => {
  for (const priorHit of [0, 5]) {
    const { game, a, b } = setup();
    const bubble = target(game, 20, Z_BLOATER);
    const sapper = target(game, 40, Z_SAPPER, 1);
    sapper.carry = true;
    const nearby = target(game, 500, Z_WALKER, 2);
    if (priorHit) game.horde.damage(sapper, priorHit, b.id, false, sapper.x, 1, sapper.z);
    game.horde.damage(bubble, 20, a.id, false, bubble.x, 1, bubble.z);
    assert.equal(sapper.alive, false);
    assert.equal(b.run.arsenal.damage, priorHit, 'взрыв не принадлежит прежнему стрелку');
    assert.ok(Math.abs(a.run.arsenal.damage - (20 + 40 - priorHit + 500 - nearby.hp)) < 1e-7);
  }
  const { game, a } = setup();
  const sapper = target(game, 40, Z_SAPPER);
  sapper.carry = true;
  const nearby = target(game, 500, Z_WALKER, 1);
  game.horde.damage(sapper, 5, a.id, false, sapper.x, 1, sapper.z);
  game.horde.kill(sapper, 0);
  // Следующее обычное попадание запускает очередь взрывов.
  game.horde.damage(nearby, 1, 0, false, nearby.x, 1, nearby.z);
  assert.ok(nearby.hp < 499);
  assert.equal(a.run.arsenal.damage, 5);
});

test('TAB: золото вышки — сумма реальных выплат вкладчикам, в том числе при чужом добивании', () => {
  const { game, a, b } = setup();
  build(game, a, 0, TW_BALLISTA);
  b.run.arsenal.gold = 10000;
  Object.assign(b.state, { x: a.state.x, y: a.state.y, z: a.state.z });
  game.use(b, ACT_TOWER + TOWER_UPGRADE);
  const before = a.run.arsenal.gold + b.run.arsenal.gold;
  const z = target(game);
  game.horde.damage(z, 80, TOWER_BY, false, z.x, 1, z.z);
  game.horde.damage(z, 20, b.id, false, z.x, 1, z.z);
  const tower = game.arsenal.towerStats()[0];
  assert.equal(tower.damage, 80);
  assert.ok(tower.gold > 0);
  assert.equal(tower.gold, a.run.arsenal.gold + b.run.arsenal.gold - before - b.run.arsenal.killGold);
  const own = a.run.arsenal.damage + b.run.arsenal.damage;
  assert.equal(own, 20);
  game.arsenal.onWaveEnd();
  assert.equal(game.arsenal.towerStats()[0].gold, tower.gold, 'общак и бонус волны не записываются в выплаты вышки');
});

test('TAB: статистика сохраняется при возвращении, приходит обоим клиентам и сбрасывается в новой игре', () => {
  const { game, a, b, aSink, bSink } = setup();
  build(game, a, 0, TW_BALLISTA);
  const z = target(game, 1000);
  game.horde.damage(z, 21, a.id, false, z.x, 1, z.z);
  game.horde.damage(z, 31, TOWER_BY, false, z.x, 1, z.z);
  game.removePlayer(a.id);
  const fresh = game.addHuman({ pid: 103, nick: 'Новичок', outfit: DEFAULT_OUTFIT }, aSink)!;
  assert.equal(fresh.run.arsenal.damage, 0);
  game.removePlayer(fresh.id);
  const back = game.addHuman({ pid: a.pid, nick: a.name, outfit: DEFAULT_OUTFIT }, aSink)!;
  assert.equal(back.run.arsenal.damage, 21);
  assert.equal(game.arsenal.towerStats()[0].damage, 31);
  game.flushRoster();
  const first = aSink.messages.filter(m => m.t === 'froster').at(-1)!;
  const second = bSink.messages.filter(m => m.t === 'froster').at(-1)!;
  assert.deepEqual(first, second);
  assert.equal(first.players.find(p => p.pid === a.pid)?.damage, 21);
  assert.equal(first.towers?.[0].damage, 31);
  const hello = aSink.messages.filter(m => m.t === 'fort').at(-1)!;
  assert.equal(hello.towers?.[0].damage, 31);
  game.newGame();
  assert.equal(back.run.arsenal.damage, 0);
  assert.equal(b.run.arsenal.damage, 0);
  assert.deepEqual(game.arsenal.towerStats(), []);
});

test('TAB: граната ушедшего игрока не записывает урон новичку с переиспользованным номером', () => {
  const { game, a, aSink } = setup();
  game.arsenal.throwGrenade(a, makeInput());
  const flying = (game.arsenal as unknown as { grenades: Array<{ g: { x: number; y: number; z: number; vx: number; vy: number; vz: number }; t: number }> }).grenades[0];
  assert.ok(flying);
  Object.assign(flying.g, { x: 0, y: 1, z: -40, vx: 0, vy: 0, vz: 0 });
  flying.t = 1;
  const z = target(game, 1000);
  game.removePlayer(a.id);
  const fresh = game.addHuman({ pid: 103, nick: 'Новичок', outfit: DEFAULT_OUTFIT }, aSink)!;
  assert.equal(fresh.id, a.id);
  game.tick++;
  game.arsenal.step();
  assert.ok(z.hp < 1000);
  assert.equal(fresh.run.arsenal.damage, 0);
});
