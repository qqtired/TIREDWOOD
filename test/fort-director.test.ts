// «Крепость», директор волн (server/fort/director.ts) и то, что вокруг него в игре: расписание боссов, супер-боссов
// и десанта, карточка волны, передышки, «вызвать раньше», рекорды крепости.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import * as F from '../shared/fort.ts';
import {
  EARLY_BONUS, FT_TOK_RECORD, TIER_CHAMP, TIER_ELITE, boatCount, bossArchetype, bossTier, breakSecondsAfter, crewSize, isBossWave,
  isSeaWave, isSuperWave, superTier,
} from '../shared/fortwaves.ts';
import { ALL_FEATURES, FEATURES, planCounts, planWave } from '../server/fort/director.ts';
import { FortGame } from '../server/fort/game.ts';
import { addFortRun, parseFortTop, Store } from '../server/store.ts';
import { Hub } from '../server/hub.ts';
import { Profiles } from '../server/profiles.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { buildLobby } from '../shared/maps/lobby.ts';
import { SMOKE, lastOf, login, placeAt, steps } from './kit.ts';

const dirs: string[] = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function setup(n = 1) {
  const game = new FortGame();
  const msgs: ServerMsg[] = [];
  const sink = { sendJson: (m: ServerMsg) => msgs.push(m), sendBinary() {}, close() {} };
  const players = Array.from({ length: n }, (_, i) => game.addHuman({ pid: i + 1, nick: `Защ${i}`, outfit: DEFAULT_OUTFIT }, sink)!);
  return { game, players, msgs };
}

/** Начать волну w (минуя сбор) и отбить её целиком */
function clearWave(game: FortGame, by: number): void {
  if (game.phase !== F.FT_WAVE) {
    game.phaseEnd = game.tick + 1;
    game.step();
  }
  assert.equal(game.phase, F.FT_WAVE);
  for (let i = 0; i < 200 * TICK_RATE && game.phase === F.FT_WAVE; i++) {
    for (const z of game.horde.zombies) if (z.alive) game.horde.damage(z, 1e12, by, true, z.x, z.y + 1, z.z);
    game.step();
  }
}

test('расписание: босс каждые 7 волн по кругу (Барон → Таран → Валун), супер-босс каждые 25, десант с 10-й каждую третью', () => {
  assert.deepEqual([7, 14, 21, 28, 35, 42].map(bossArchetype), [0, 1, 2, 0, 1, 2]);
  assert.deepEqual([7, 14, 21, 28, 49].map(bossTier), [0, 0, 0, 1, 2]);
  for (const w of [25, 50, 75, 175, 300]) {
    assert.ok(isSuperWave(w) && !isBossWave(w), `${w}`);
  }
  assert.equal(superTier(50), 1);
  assert.equal(isBossWave(175), false, '175 — супер-волна, не босс');
  assert.deepEqual([9, 10, 11, 13, 16, 25].map(isSeaWave), [false, true, false, true, true, true]);
  assert.deepEqual([10, 22, 37, 11].map((w) => boatCount(w)), [1, 2, 3, 0]);
  assert.deepEqual([10, 30, 60].map((w) => crewSize(w)), [4, 6, 8]);
  // в плане со всеми возможностями
  assert.equal(planWave(14, 1, 3, undefined, ALL_FEATURES).boss, F.Z_RAM);
  assert.equal(planWave(21, 1, 3, undefined, ALL_FEATURES).boss, F.Z_GOLEM);
  assert.equal(planWave(25, 1, 3, undefined, ALL_FEATURES).kraken, true);
  assert.equal(planWave(10, 1, 3, undefined, ALL_FEATURES).boats.length, 1);
  assert.equal(planWave(10, 1, 3, undefined, ALL_FEATURES).boats[0].crew.length, 4);
  // в игре: шесть боссов по кругу (новые — с 28-й), десант с 10-й; пока Кракена нет — на супер-волне Барон кругом выше
  assert.deepEqual([7, 14, 21, 28, 35, 42, 49].map((w) => planWave(w, 1, 3, undefined, FEATURES).boss),
    [F.Z_BOSS, F.Z_RAM, F.Z_GOLEM, F.Z_PUMPKIN, F.Z_WEAVER, F.Z_LESHY, F.Z_BOSS]);
  assert.equal(planWave(28, 1, 3, undefined, FEATURES).bossTier, 0, 'на 28-й — Король-Тыква, первый круг');
  assert.equal(planWave(49, 1, 3, undefined, FEATURES).bossTier, 1, 'на 49-й — Барон II');
  assert.equal(planWave(25, 1, 3, undefined, FEATURES).boss, F.Z_BOSS);
  assert.equal(planWave(10, 1, 3, undefined, FEATURES).boats.length, 1);
  assert.equal(planWave(25, 1, 3, undefined, FEATURES).boats.length, 2, 'на супер-волне — десант');
});

test('директор: тот же вход — та же волна; новые типы знакомятся в своей волне; элита — с 18-й, чемпионы — с 30-й', () => {
  assert.deepEqual(planWave(37, 3, 99), planWave(37, 3, 99));
  assert.notDeepEqual(planWave(37, 3, 99).spawns, planWave(37, 3, 98).spawns);
  const shield = planWave(6, 1, 1, undefined, ALL_FEATURES);
  assert.deepEqual(shield.card.fresh, [F.Z_SHIELD]);
  assert.ok(planCounts(shield)[F.Z_SHIELD] >= 1);
  const armored = planWave(16, 1, 1, undefined, ALL_FEATURES);
  assert.ok(armored.card.fresh.includes(F.Z_ARMORED));
  for (let w = 1; w < 18; w++) {
    const p = planWave(w, 1, 5);
    // элита до 18-й — только если не хватило тел (не бывает на ранних волнах)
    assert.ok(p.spawns.every((s) => s.tier !== TIER_CHAMP), `${w}`);
    assert.ok(p.spawns.every((s) => s.tier !== TIER_ELITE), `${w}`);
  }
  const late = planWave(60, 4, 5);
  assert.ok(late.spawns.some((s) => s.tier === TIER_ELITE) && late.spawns.some((s) => s.tier === TIER_CHAMP));
  // карточка: фишки — это состав без босса
  const card = late.card;
  let chips = 0;
  for (let i = 1; i < card.chips.length; i += 2) chips += card.chips[i];
  assert.equal(chips, late.spawns.length);
  assert.equal(card.elite, late.spawns.filter((s) => s.tier === TIER_ELITE).length);
});

test('передышки: 15 с, после босса 20, перед супер-боссом 30', () => {
  assert.equal(breakSecondsAfter(1), 15);
  assert.equal(breakSecondsAfter(7), 20);
  assert.equal(breakSecondsAfter(24), 30);
  assert.equal(breakSecondsAfter(25), 20);
  const { game, players } = setup();
  clearWave(game, players[0].id);
  assert.equal(game.phase, F.FT_BREAK);
  assert.equal(game.phaseEnd - game.tick, 15 * TICK_RATE);
  for (let w = 2; w <= 7; w++) clearWave(game, players[0].id);
  assert.equal(game.wave, 7);
  assert.equal(game.phaseEnd - game.tick, 20 * TICK_RATE, 'после Барона');
});

test('волна: карточка уходит с фазой (в бою — идущая, в передышке — следующая), босс — первым в очереди', () => {
  const { game, players, msgs } = setup();
  const hello = msgs.find((m) => m.t === 'fort');
  assert.ok(hello && hello.t === 'fort' && hello.card?.w === 1, 'в сборе — карточка первой волны');
  for (let w = 1; w <= 6; w++) clearWave(game, players[0].id);
  const brk = msgs.filter((m) => m.t === 'fphase').at(-1)!;
  assert.ok(brk.t === 'fphase' && brk.phase === F.FT_BREAK && brk.card?.w === 7 && brk.card.boss === F.Z_BOSS);
  game.phaseEnd = game.tick + 1;
  game.step();
  const wave = msgs.filter((m) => m.t === 'fphase').at(-1)!;
  assert.ok(wave.t === 'fphase' && wave.phase === F.FT_WAVE && wave.card?.w === 7);
  game.tick += 40;
  game.horde.step();
  const boss = game.horde.zombies.find((z) => z.alive && z.kind === F.Z_BOSS);
  assert.ok(boss, 'Барон вышел первым');
  assert.ok(Math.abs(boss.maxHp - game.plan!.bossHp) < 1e-6);
});

test('«вызвать волну раньше»: все в колокол в передышке — волна через 3 с и +10 % награды за сбитых в ней', () => {
  const { game, players, msgs } = setup(2);
  clearWave(game, players[0].id);
  assert.equal(game.phase, F.FT_BREAK);
  const bell = game.map.stations.find((s) => s.kind === 'bell')!;
  for (const p of players) {
    Object.assign(p.state, { x: bell.x, y: bell.y, z: bell.z });
    game.use(p, bell.id);
  }
  assert.equal(game.phaseEnd - game.tick, F.READY_TICKS);
  assert.equal(game.early, true);
  const last = msgs.filter((m) => m.t === 'fphase').at(-1)!;
  assert.ok(last.t === 'fphase' && last.card?.early === true);
  game.phaseEnd = game.tick + 1;
  game.step();
  assert.equal(game.phase, F.FT_WAVE);
  const z = game.horde.spawn(F.Z_WALKER, 1)!;
  const before = players[0].pts + players[1].pts;
  game.horde.damage(z, 1e9, players[0].id, false, z.x, 1, z.z);
  const gained = players[0].pts + players[1].pts - before;
  assert.equal(gained, Math.round(F.fortBounty(F.Z_WALKER, 0, 2, false) * (1 + EARLY_BONUS)));
  // следующая передышка — без бонуса
  clearWave(game, players[0].id);
  assert.equal(game.early, false);
});

test('рекорды крепости: таблица из State.fortTop, новые записи по убыванию волн, битые записи отброшены', () => {
  assert.deepEqual(parseFortTop(undefined), []);
  assert.deepEqual(parseFortTop([{ wave: 0 }, null, 'x', { wave: 12, names: ['А', 5], at: 3, n: 9 }]),
    [{ wave: 12, names: ['А'], at: 3, n: 6 }]);
  let top: F.FortRunRec[] = [];
  for (const w of [5, 9, 7, 9, 3, 11, 2]) top = addFortRun(top, { wave: w, names: [`w${w}`], at: w * 10 + top.length, n: 1 });
  assert.deepEqual(top.map((t) => t.wave), [11, 9, 9, 7, 5]);
  assert.equal(top[1].at < top[2].at, true, 'при равенстве выше тот, кто раньше');
});

test('итоги: рекорд крепости в State, +15 🪙 за новый рекорд, в итогах — таблица и прежний рекорд', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-fort-top-'));
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 3, 12) };
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now: () => clock.now });
  store.load();
  store.state.fortTop = [{ wave: 1, names: ['Старожил'], at: 1, n: 1 }];
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({ store, profiles, smokeToken: SMOKE, build: 'test', now: () => clock.now, log: () => {}, fort: true });
  const point = buildLobby().interact.find((i) => i.kind === 'fort')!;
  const { c, s } = login(hub, 'Рекордсмен');
  steps(hub, 3 * TICK_RATE);
  placeAt(hub, c, point.x, point.z);
  hub.onJson(c, { t: 'use', id: point.id });
  const game = hub.fort!.game;
  const p = hub.fort!.playerOf(c)!;
  clearWave(game, p.id);
  clearWave(game, p.id);
  assert.equal(game.cleared, 2);
  game.crystal = 0;
  game.phaseEnd = game.tick + 1;
  hub.step();
  hub.step();
  assert.equal(game.phase, F.FT_END);
  const end = lastOf(s, 'fend')!;
  assert.equal(end.record, true);
  assert.equal(end.prev, 1);
  assert.equal(end.top?.[0].wave, 2);
  assert.deepEqual(end.top?.[0].names, ['Рекордсмен']);
  assert.equal(store.state.fortTop?.length, 2);
  const reward = lastOf(s, 'fortReward')!;
  assert.equal(reward.record, FT_TOK_RECORD);
  assert.equal(c.profile!.stats.ftBest, 2);
  assert.equal(end.rows[0].best, 0, 'свой лучший до этого забега');
});
