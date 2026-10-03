// «Крепость»: новые враги (щитоносец, плевальщик, подрывник, лекарь, Чугунок), элита и чемпионы, урон по области.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as F from '../shared/fort.ts';
import {
  BARREL_GATE, BARREL_SHOT_MUL, BARREL_ZOMBIE, FUSE_TICKS, HEAL_EVERY, HEAL_FRAC, SPIT_DMG, SPIT_WARN_TICKS,
} from '../shared/fortkinds.ts';
import { ARMOR_MIN_PASS, TIER_CHAMP, TIER_ELITE, TIER_HP, armorFor, shieldHp, waveHpMul } from '../shared/fortwaves.ts';
import { GATE, WALL_H } from '../shared/fortmap.ts';
import { ZF_CARRY, ZF_SHIELD, ZF_TIER, type ZombieSnap } from '../shared/fortnet.ts';
import { FortGame } from '../server/fort/game.ts';
import type { FortEvent } from '../shared/fort.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';

function setup(n = 1) {
  const game = new FortGame();
  const events: FortEvent[] = [];
  const sink = { sendJson: (m: { t: string; e?: FortEvent[] }) => { if (m.t === 'fev' && m.e) events.push(...m.e); }, sendBinary() {}, close() {} };
  const players = Array.from({ length: n }, (_, i) => game.addHuman({ pid: i + 1, nick: `Защ${i}`, outfit: DEFAULT_OUTFIT }, sink as never)!);
  game.phase = F.FT_WAVE;
  return { game, players, events };
}

test('щитоносец: спереди в тело — в щит, в голову и сзади — по нему; щит ломается досками', () => {
  const { game, players, events } = setup();
  const p = players[0];
  const z = game.horde.spawn(F.Z_SHIELD, 1)!;
  Object.assign(z, { x: 0, z: -30, yaw: 0 }); // смотрит на север? курс 0 — лицом в −Z
  assert.ok(Math.abs(z.shield - shieldHp(1, 1)) < 1e-9, 'щит по волне');
  const hp = z.hp;
  // стреляют с севера (спереди: −Z от него)
  game.horde.damage(z, 20, p.id, false, z.x, 0.8, z.z - 0.5, z.x, z.z - 20);
  assert.equal(z.hp, hp, 'в щит');
  assert.ok(z.shield < shieldHp(1, 1));
  game.horde.damage(z, 20, p.id, true, z.x, 1.4, z.z - 0.5, z.x, z.z - 20);
  assert.equal(z.hp, hp - 20, 'голова открыта');
  game.horde.damage(z, 10, p.id, false, z.x, 0.8, z.z + 0.5, z.x, z.z + 20);
  assert.equal(z.hp, hp - 30, 'сзади — по нему');
  const snaps: ZombieSnap[] = [];
  const flagsOf = () => (snaps.slice(0, game.horde.snap(snaps)).find((s) => s.id === z.id)?.flags ?? 0);
  assert.ok(flagsOf() & ZF_SHIELD, 'щит в снимке');
  game.horde.damage(z, z.shield, p.id, false, z.x, 0.8, z.z - 0.5, z.x, z.z - 20);
  assert.equal(z.shield, 0);
  assert.equal(z.hp, hp - 30, 'урон ровно в щит');
  assert.equal(flagsOf() & ZF_SHIELD, 0, 'щита нет');
  game.step();
  game.step();
  assert.ok(events.some((e) => e[0] === 'shield' && e[1] === z.id), 'доски разлетелись');
});

test('Чугунок: тело — минус броня волны (не меньше 30 %), голова и взрыв — полностью', () => {
  const { game, players } = setup();
  const z = game.horde.spawn(F.Z_ARMORED, 1)!;
  const hp = z.hp;
  const armor = armorFor(1);
  game.horde.damage(z, 20, players[0].id, false, z.x, 0.8, z.z);
  assert.ok(Math.abs(hp - z.hp - Math.max(20 * ARMOR_MIN_PASS, 20 - armor)) < 1e-9);
  const h2 = z.hp;
  game.horde.damage(z, 34, players[0].id, true, z.x, 1.5, z.z);
  assert.equal(h2 - z.hp, 34);
  const h3 = z.hp;
  assert.equal(game.horde.areaDamage(z.x, 1, z.z, 3, 50, players[0].id), 1);
  assert.equal(h3 - z.hp, 50);
  // броня растёт с волной вместе с HP
  assert.ok(armorFor(50) > armorFor(10) * 5);
});

test('подрывник: у ворот — фитиль 3 с с меткой и взрыв по воротам; сбит раньше — своих только задевает, соседние бочки не рвёт, воротам меньше', () => {
  {
    const { game, events } = setup();
    const s = game.horde.spawn(F.Z_SAPPER, 1)!;
    Object.assign(s, { x: 0, z: GATE.face - 1.2 });
    for (let i = 0; i < 40 && s.state !== F.ZS_PLANT; i++) game.step();
    assert.equal(s.state, F.ZS_PLANT);
    game.step();
    game.step();
    assert.ok(events.some((e) => e[0] === 'warn' && e[2] === F.ZS_PLANT));
    const gate = game.gate;
    for (let i = 0; i < FUSE_TICKS + 2 && s.alive; i++) game.step();
    assert.equal(s.alive, false);
    game.step();
    game.step();
    assert.ok(Math.abs(gate - game.gate - BARREL_GATE * game.horde.dmgMul) < 1e-6, `${gate - game.gate}`);
    assert.ok(events.some((e) => e[0] === 'blast' && e[1] === F.ZS_BARREL));
  }
  {
    const { game, players, events } = setup();
    const s = game.horde.spawn(F.Z_SAPPER, 1)!;
    const s2 = game.horde.spawn(F.Z_SAPPER, 1)!;
    const w = game.horde.spawn(F.Z_WALKER, 1)!;
    Object.assign(s, { x: 0, z: GATE.face - 1.0 });
    Object.assign(s2, { x: -1.0, z: GATE.face - 1.3 });
    Object.assign(w, { x: 1.2, z: GATE.face - 1.4 });
    const gate = game.gate;
    const hp0 = w.hp;
    const blasts = () => events.filter((e) => e[0] === 'blast' && e[1] === F.ZS_BARREL).length;
    const before = blasts();
    game.horde.damage(s, 1e4, players[0].id, false, s.x, 0.8, s.z);
    const wave = Math.max(1, (game.horde as unknown as { wave: number }).wave);
    assert.equal(w.alive, true, 'шаркуна рядом бочка только задела');
    assert.ok(Math.abs(hp0 - w.hp - BARREL_ZOMBIE * waveHpMul(wave)) < 1e-6, `${hp0 - w.hp}`);
    assert.ok(BARREL_ZOMBIE * waveHpMul(wave) < 0.35 * F.ZK[F.Z_WALKER].hp * waveHpMul(wave), 'своим — около трети шаркуна');
    assert.equal(s2.alive, true, 'соседний подрывник цел: взрывы не цепляются друг за друга');
    assert.equal(s2.hp, s2.maxHp);
    assert.ok(Math.abs(gate - game.gate - BARREL_GATE * BARREL_SHOT_MUL) < 1e-6, 'воротам — как раньше, один раз');
    assert.equal(players[0].kills, 1, 'сбит только подрывник');
    game.step();
    game.step();
    assert.equal(blasts() - before, 1, 'одна бочка — один взрыв');
  }
});

test('плевальщик: человек на стене в 10–30 м — встаёт, метка 1,2 с, плевок; потом перезарядка', () => {
  const { game, players, events } = setup();
  const p = players[0];
  Object.assign(p.state, { x: 6, y: WALL_H, z: -14.6 });
  const s = game.horde.spawn(F.Z_SPITTER, 1)!;
  Object.assign(s, { x: 6, z: -36 });
  for (let i = 0; i < 5 && s.state !== F.ZS_SPIT; i++) game.step();
  assert.equal(s.state, F.ZS_SPIT);
  game.step();
  game.step();
  const warn = events.find((e) => e[0] === 'warn' && e[2] === F.ZS_SPIT) as number[] | undefined;
  assert.ok(warn, 'метка есть');
  assert.ok(Math.abs(warn[3]! - 6) < 0.5 && Math.abs(warn[5]! + 14.6) < 0.5, 'метка там, где стоял');
  const hp = p.hp;
  for (let i = 0; i < SPIT_WARN_TICKS + 1 && s.state === F.ZS_SPIT; i++) game.step();
  game.step();
  assert.ok(hp - p.hp >= SPIT_DMG * game.horde.dmgMul - 1e-9, 'попал');
  assert.ok(events.some((e) => e[0] === 'throw'));
  assert.equal(s.state, F.ZS_WALK);
  assert.ok(s.atkCd > 0, 'перезарядка');
  // ушёл с метки — плевок мимо
  const s2 = game.horde.spawn(F.Z_SPITTER, 1)!;
  Object.assign(s2, { x: -6, z: -36 });
  Object.assign(p.state, { x: -6, y: WALL_H, z: -14.6 });
  for (let i = 0; i < 5 && s2.state !== F.ZS_SPIT; i++) game.step();
  Object.assign(p.state, { x: -12, y: WALL_H, z: -14.6 });
  p.hp = 100;
  for (let i = 0; i < SPIT_WARN_TICKS + 1; i++) game.step();
  assert.equal(p.hp, 100);
});

test('лекарь: раз в 3 с — +15 % HP соседям в 6 м, дальним — нет', () => {
  const { game } = setup();
  const m = game.horde.spawn(F.Z_MEDIC, 1)!;
  const a = game.horde.spawn(F.Z_WALKER, 1)!;
  const b = game.horde.spawn(F.Z_WALKER, 1)!;
  Object.assign(m, { x: 20, z: -40, healT: 1 });
  Object.assign(a, { x: 22, z: -40, hp: a.maxHp * 0.5 });
  Object.assign(b, { x: 40, z: -40, hp: b.maxHp * 0.5 });
  game.horde.step();
  assert.ok(Math.abs(a.hp - a.maxHp * (0.5 + HEAL_FRAC)) < 1e-6);
  assert.equal(b.hp, b.maxHp * 0.5);
  assert.equal(m.healT, HEAL_EVERY);
});

test('элита и чемпион: HP по ступени, чемпион ускоряет соседей, признак ступени — в снимке', () => {
  const { game } = setup();
  const e = game.horde.spawn(F.Z_WALKER, 1, 1, TIER_ELITE)!;
  const c = game.horde.spawn(F.Z_BRUTE, 1, 1, TIER_CHAMP)!;
  const w = game.horde.spawn(F.Z_WALKER, 1)!;
  assert.ok(Math.abs(e.maxHp - w.maxHp * TIER_HP[TIER_ELITE]) < 1e-9);
  Object.assign(c, { x: 30, z: -45 });
  Object.assign(w, { x: 31, z: -45 });
  game.tick = 14;
  game.step();
  assert.equal(w.hasted, true);
  const snaps: ZombieSnap[] = [];
  const n = game.horde.snap(snaps);
  const se = snaps.slice(0, n).find((s) => s.id === e.id)!;
  assert.equal((se.flags ?? 0) & ZF_TIER, TIER_ELITE);
  const boss = game.horde.spawn(F.Z_BOSS, 1)!;
  const bh = boss.hp;
  game.horde.areaDamage(boss.x, 2, boss.z, 4, 100, 0);
  assert.ok(Math.abs(bh - boss.hp - 100 * F.BOSS_ARMOR) < 1e-9, 'по боссу вне окна — через броню');
  const sapper = game.horde.spawn(F.Z_SAPPER, 1)!;
  const sn = game.horde.snap(snaps);
  assert.ok(((snaps.slice(0, sn).find((s) => s.id === sapper.id)?.flags ?? 0) & ZF_CARRY) !== 0);
});
