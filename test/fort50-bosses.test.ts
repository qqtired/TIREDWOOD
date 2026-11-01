// «Крепость 50»: Пеликан-Бомбардир (35-я) и Избушка (финал 50-й) — главное: выходят на своих волнах, фазы по здоровью,
// атаки Избушки ранят участок стены, сбитый Пеликан ходит пешком, победа на 50-й засчитывается.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FT_END, FT_WAVE, ZS_BOSS_OPEN, ZS_WALK } from '../shared/fort.ts';
import { F50_LAST_WAVE, WALL_SECTIONS, f50Boss, f50Force, wallMaxHp } from '../shared/fort50.ts';
import {
  HUT_KICK_TICKS, HUT_NEST_LAND, HUT_NEST_OPEN0, HUT_NEST_TICKS, PL_CRASH_TICKS, ZS_HUT_KICK, ZS_HUT_NEST,
  ZS_HUT_PHASE, ZS_PL_CRASH, ZS_PL_DIVE, ZS_PL_FLY, ZS_PL_GROUND, ZS_PL_SNAP,
} from '../shared/fortbosses50.ts';
import { Z_HUT, Z_PELICAN } from '../shared/fortkinds.ts';
import { bossHp } from '../shared/fortwaves.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { F50_FEATURES, planWave } from '../server/fort/director.ts';
import { FortGame } from '../server/fort/game.ts';
import { bossExposed } from '../server/fort/boss50.ts';
import type { Sink } from '../server/paintball/game.ts';
import type { Zombie } from '../server/fort/horde.ts';

function sink(): Sink & { msgs: ServerMsg[] } {
  const msgs: ServerMsg[] = [];
  return { msgs, sendBinary() {}, sendJson(m) { msgs.push(m); }, close() {} };
}

/** Игра Ф50 с одним защитником, идёт волна w; босс волны уже вышел */
function waveWithBoss(w: number, kind: number): { g: FortGame; boss: Zombie; p: ReturnType<FortGame['addHuman']> } {
  const g = new FortGame({ fort50: true });
  const p = g.addHuman({ pid: 1, nick: 'Tester7', outfit: DEFAULT_OUTFIT }, sink());
  g.jumpTo(w);
  g.phaseEnd = g.tick + 1;
  g.step();
  assert.equal(g.phase, FT_WAVE);
  assert.equal(g.wave, w);
  let boss: Zombie | undefined;
  for (let i = 0; i < 120 && !boss; i++) {
    g.step();
    boss = g.horde.zombies.find((z) => z.alive && z.kind === kind);
  }
  assert(boss, 'босс вышел');
  return { g, boss, p };
}

function steps(g: FortGame, n: number): void {
  for (let i = 0; i < n; i++) g.step();
}

test('Ф50: на 35-й — Пеликан, на 50-й — одна Избушка без Кракена, HP ×3, «Финал: Избушка»', () => {
  assert.equal(f50Boss(35)?.kind, Z_PELICAN);
  assert.equal(f50Boss(50)?.kind, Z_HUT);
  assert.equal(f50Boss(45)?.kind !== Z_PELICAN, true);
  const p35 = planWave(35, 2, 1, undefined, F50_FEATURES);
  assert.equal(p35.boss, Z_PELICAN);
  const p50 = planWave(50, 2, 1, undefined, F50_FEATURES);
  assert.equal(p50.boss, Z_HUT);
  assert.equal(p50.kraken, false);
  assert.equal(p50.bossHp, bossHp(f50Force(50), 2, 4) * 3);
  assert.equal(p50.card.title, 'Финал: Избушка');
});

test('Пеликан: взлетает и кружит высоко, пике хватает человека в зоб и выплёвывает на стену', () => {
  const { g, boss, p } = waveWithBoss(35, Z_PELICAN);
  steps(g, 240);
  assert.equal(boss.state === ZS_PL_FLY || boss.state === ZS_PL_DIVE || boss.state > 60, true);
  assert(boss.y > 6, `летит на ${boss.y.toFixed(1)} м`);
  // человек на ходу северной стены — пике за ним
  Object.assign(p!.state, { x: -8, y: 3.4, z: -14.6, vx: 0, vy: 0, vz: 0 });
  boss.attackIndex = 1;
  boss.state = ZS_PL_FLY;
  boss.combo = 0;
  boss.t = 1;
  let grabbed = false;
  for (let i = 0; i < 1200 && !grabbed; i++) {
    Object.assign(p!.state, { x: -8, z: -14.6 });
    g.step();
    grabbed = boss.chase === p!.id && boss.carry;
  }
  assert(grabbed, 'схватил в зоб');
  // в зобе — там же, где пеликан
  steps(g, 30);
  assert(Math.hypot(p!.state.x - boss.x, p!.state.z - boss.z) < 2.5 && p!.state.y > 3, 'несёт в зобе');
  // окно: набрали урона — выплюнет на стену
  for (let i = 0; i < 400 && boss.state !== ZS_BOSS_OPEN; i++) g.step();
  assert.equal(boss.state, ZS_BOSS_OPEN);
  g.horde.damage(boss, boss.maxHp * 0.03, p!.id, false, boss.x, boss.y + 2, boss.z);
  g.step();
  assert.equal(boss.chase, 0);
  assert(Math.abs(p!.state.y - 3.45) < 0.1 && Math.abs(p!.state.z + 14.6) < 0.1, 'на ходу стены');
});

test('Пеликан: подбит ниже 60 % — 2-я фаза, ниже 25 % — падает и дальше ходит пешком, щёлкает по стене', () => {
  const { g, boss } = waveWithBoss(35, Z_PELICAN);
  steps(g, 60);
  boss.hp = boss.maxHp * 0.5;
  for (let i = 0; i < 2000 && boss.stage < 2; i++) g.step();
  assert.equal(boss.stage, 2);
  boss.hp = boss.maxHp * 0.2;
  for (let i = 0; i < 4000 && boss.state !== ZS_PL_CRASH; i++) g.step();
  assert.equal(boss.state, ZS_PL_CRASH);
  steps(g, PL_CRASH_TICKS + 1);
  assert.equal(boss.y, 0);
  assert.equal(boss.stage, 3);
  const x0 = boss.x, z0 = boss.z;
  let moved = false, snapped = false;
  const wall = g.walls.hp.slice();
  for (let i = 0; i < 1500; i++) {
    g.step();
    if ((boss.state as number) === ZS_PL_GROUND && Math.hypot(boss.x - x0, boss.z - z0) > 0.5) moved = true;
    if ((boss.state as number) === ZS_PL_SNAP) snapped = true;
    assert.equal(boss.y, 0);
  }
  assert(moved, 'ходит пешком');
  assert(snapped, 'щёлкает клювом');
  assert(g.walls.hp.some((hp, sec) => hp < wall[sec]), 'стене досталось');
});

test('Избушка: пинок и наседка ранят участок стены, фазы по здоровью, на стене открыта', () => {
  const { g, boss } = waveWithBoss(50, Z_HUT);
  const nw = WALL_SECTIONS.findIndex((s) => s.id === 'nw');
  // до стены идти долго — ставим перед западным проломом
  boss.x = -12;
  boss.z = -20;
  boss.state = ZS_WALK;
  boss.t = 1;
  boss.attackIndex = 0;
  const before = g.walls.hp[nw];
  for (let i = 0; i < 200 && boss.state !== ZS_HUT_KICK; i++) g.step();
  assert.equal(boss.state, ZS_HUT_KICK);
  steps(g, HUT_KICK_TICKS);
  assert(g.walls.hp[nw] < before, 'пинок ранил участок');
  assert.equal(boss.state, ZS_BOSS_OPEN);
  // 2-я фаза — ниже 2/3, 3-я — ниже 1/3
  boss.hp = boss.maxHp * 0.6;
  for (let i = 0; i < 600 && boss.state !== ZS_HUT_PHASE; i++) g.step();
  assert.equal(boss.state, ZS_HUT_PHASE);
  assert.equal(boss.stage, 2);
  boss.hp = boss.maxHp * 0.3;
  for (let i = 0; i < 2000 && boss.stage < 3; i++) g.step();
  assert.equal(boss.stage, 3);
  // 3-я фаза начинается с наседки
  g.walls.hp[nw] = wallMaxHp(nw, 50);
  for (let i = 0; i < 800 && boss.state !== ZS_HUT_NEST; i++) g.step();
  assert.equal(boss.state, ZS_HUT_NEST);
  const full = g.walls.hp[nw];
  const z0 = boss.z;
  steps(g, HUT_NEST_LAND + 5);
  assert(g.walls.hp[nw] < full, 'наседка ранила участок');
  assert(boss.z > z0 + 5, 'сидит на стене');
  assert.equal(bossExposed(boss), HUT_NEST_TICKS - boss.t >= HUT_NEST_OPEN0);
  assert(bossExposed(boss), 'на стене — дверь открыта');
});

test('Избушка: сбили — 50-я отбита, победа', () => {
  const { g, boss, p } = waveWithBoss(F50_LAST_WAVE, Z_HUT);
  g.horde.damage(boss, 1e12, p!.id, false, boss.x, boss.y + 6, boss.z);
  assert.equal(boss.alive, false);
  g.horde.clear();
  g.step();
  assert.equal(g.phase, FT_END);
  assert.equal(g.cleared, F50_LAST_WAVE);
});
