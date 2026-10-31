import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TICK_RATE } from '../shared/constants.ts';
import { FT_BREAK, FT_END, FT_WAVE, Z_BOAT } from '../shared/fort.ts';
import { ACT_CRYSTAL, ACT_GATE } from '../shared/fortarsenal.ts';
import { pickRanks } from '../shared/fortranks.ts';
import * as S from '../shared/fortsiege.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { FortGame } from '../server/fort/game.ts';
import { makeRun, settle } from '../server/fort/ledger.ts';
import { addRankCount, rankCounts } from '../server/fort/ranks.ts';

const final = { mvp: false, record: false, win: false };

test('pickRanks awards every positive maximum, shares ties and preserves title order', () => {
  const awards = pickRanks([
    { id: 1, damage: 10, fix: 1, sapped: 3, invest: 0 },
    { id: 2, damage: 10, fix: 2, sapped: 3, invest: 50 },
    { id: 3, damage: 5, fix: 0, sapped: 1, invest: 20 },
    { id: 4, damage: 0, fix: 0, sapped: 0, invest: 0 },
  ]);
  assert.deepEqual(awards, new Map([
    [1, ['gunner', 'sapper']],
    [2, ['gunner', 'fixer', 'sapper', 'builder']],
  ]));
  assert.deepEqual(pickRanks([{ id: 1, damage: 0, fix: 0, sapped: 0, invest: 0 }]), new Map());
  assert.deepEqual(pickRanks([]), new Map());
});

test('settle adds rank tokens only to the final reward and omits the field without a bonus', () => {
  const run = makeRun(0);
  run.waves = 1;
  run.tokWaves = 3;
  assert.deepEqual(settle(run, { ...final, ranks: 10 }), {
    total: 13, n: 1, waves: 3, kills: 0, win: 0, mvp: 0, record: 0, ranks: 10,
  });
  for (const end of [final, { ...final, ranks: 0 }, null]) {
    const plain = makeRun(0);
    plain.waves = 1;
    plain.tokWaves = 3;
    assert.deepEqual(settle(plain, end), { total: 3, n: 1, waves: 3, kills: 0, win: 0, mvp: 0, record: 0 });
    assert.equal(settle(plain, end), null);
  }
});

function game(ranks?: boolean, people = 2, siege = false) {
  const g = new FortGame({ ranks, siege });
  const players = Array.from({ length: people }, (_, i) => {
    const messages: ServerMsg[] = [];
    const p = g.addHuman({ pid: i + 1, nick: `P${i + 1}`, outfit: DEFAULT_OUTFIT }, {
      sendJson: m => messages.push(m), sendBinary() {}, close() {},
    })!;
    return { p, messages };
  });
  return { g, players };
}

function clearWave(g: FortGame, by: number): void {
  g.phaseEnd = g.tick + 1;
  g.step();
  assert.equal(g.phase, FT_WAVE);
  for (let i = 0; i < 200 * TICK_RATE && g.phase === FT_WAVE; i++) {
    for (const z of g.horde.zombies) if (z.alive) g.horde.damage(z, 1e9, by, true, z.x, z.y + 1, z.z);
    g.step();
  }
  assert.equal(g.phase, FT_BREAK);
  assert.equal(g.cleared, 1);
}

function finish(g: FortGame): void {
  g.phaseEnd = g.tick + 1;
  g.step();
  assert.equal(g.phase, FT_WAVE);
  g.crystal = 0;
  g.step();
  assert.equal(g.phase, FT_END);
}

const last = <T extends ServerMsg['t']>(messages: ServerMsg[], t: T) =>
  messages.filter((m): m is Extract<ServerMsg, { t: T }> => m.t === t).at(-1)!;

test('two defenders receive final ranks and five tokens per title after a cleared wave', () => {
  const { g, players: [a, b] } = game(true);
  clearWave(g, a.p.id);
  a.p.run.arsenal.damage = 100;
  a.p.run.arsenal.invest = 50;
  addRankCount(b.p.run, 'fix');
  finish(g);
  const rows = last(a.messages, 'fend').rows;
  assert.deepEqual(rows.find(r => r.id === a.p.id)!.ranks, ['gunner', 'builder']);
  assert.equal(last(a.messages, 'fortReward').ranks, 10);
  assert.deepEqual(rows.find(r => r.id === b.p.id)!.ranks, ['fixer']);
  assert.equal(last(b.messages, 'fortReward').ranks, 5);
  for (const player of [a, b]) {
    const reward = last(player.messages, 'fortReward');
    assert.equal(reward.total, reward.waves + reward.kills + reward.mvp + reward.win + (reward.record ?? 0) + reward.ranks!);
    assert.equal(rows.find(r => r.id === player.p.id)!.tokens, reward.total);
  }
});

test('a solo defender sees titles but receives no rank tokens', () => {
  const { g, players: [a] } = game(true, 1);
  clearWave(g, a.p.id);
  finish(g);
  assert.deepEqual(last(a.messages, 'fend').rows[0].ranks, ['gunner']);
  assert.equal('ranks' in last(a.messages, 'fortReward'), false);
});

test('without ranks the final rows and rewards retain their previous fields', () => {
  const { g, players: [a, b] } = game();
  clearWave(g, a.p.id);
  a.p.run.arsenal.invest = 50;
  addRankCount(b.p.run, 'fix');
  finish(g);
  for (const row of last(a.messages, 'fend').rows) assert.equal('ranks' in row, false);
  for (const player of [a, b]) assert.equal('ranks' in last(player.messages, 'fortReward'), false);
});

test('two defenders without a cleared wave receive titles but no rank tokens', () => {
  const { g, players: [a, b] } = game(true);
  a.p.run.arsenal.damage = 1;
  finish(g);
  assert.deepEqual(last(a.messages, 'fend').rows.find(r => r.id === a.p.id)!.ranks, ['gunner']);
  for (const player of [a, b]) assert.equal(last(player.messages, 'fortReward'), undefined);
});

test('only completed gate/crystal repairs and raised gates count, only with ranks enabled', () => {
  for (const enabled of [true, false]) {
    const { g, players: [a] } = game(enabled);
    a.p.run.arsenal.gold = 10000;
    const gate = g.map.stations.find(s => s.kind === 'gate')!;
    Object.assign(a.p.state, { x: gate.x, y: gate.y, z: gate.z });
    g.gate = 100;
    g.use(a.p, ACT_GATE);
    assert.equal(rankCounts(a.p.run).fix, enabled ? 1 : 0);
    g.use(a.p, ACT_GATE + 1);
    assert.equal(rankCounts(a.p.run).fix, enabled ? 1 : 0, 'tier upgrade is not a repair');
    g.gate = 0;
    g.use(a.p, ACT_GATE + 2);
    assert.equal(rankCounts(a.p.run).fix, enabled ? 2 : 0);
    const crystal = g.map.stations.find(s => s.kind === 'crystal')!;
    Object.assign(a.p.state, { x: crystal.x, y: crystal.y, z: crystal.z });
    g.crystal = 100;
    g.use(a.p, ACT_CRYSTAL);
    assert.equal(rankCounts(a.p.run).fix, enabled ? 3 : 0);
    g.use(a.p, ACT_CRYSTAL + 1);
    assert.equal(rankCounts(a.p.run).fix, enabled ? 3 : 0, 'crystal tier is not a repair');
    g.crystal = g.arsenal.crystalMax;
    g.use(a.p, ACT_CRYSTAL);
    assert.equal(rankCounts(a.p.run).fix, enabled ? 3 : 0, 'rejected purchase does not count');
    if (!enabled) {
      g.sapped(a.p.id);
      assert.equal(rankCounts(a.p.run).sapped, 0);
    }
  }
});

test('siege counts each newly folded canopy, detached part and cut anchor once for the human', () => {
  const { g, players: [a, b] } = game(true, 2, true);
  const canopy = g.horde.spawn(S.Z_CANOPY, 1)!;
  canopy.state = S.ZS_SIEGE_ACTION;
  g.horde.siege.precision(canopy, a.p.id);
  g.horde.siege.precision(canopy, a.p.id);
  g.horde.siege.precision(canopy, b.p.id);
  assert.equal(rankCounts(a.p.run).sapped, 1);
  assert.equal(rankCounts(b.p.run).sapped, 0);
  const rope = g.horde.spawn(S.Z_ROPECRAB, 1)!;
  rope.state = S.ZS_SIEGE_ACTION;
  for (let i = 0; i < 2; i++) g.horde.siege.precision(rope, a.p.id);
  assert.equal(rankCounts(a.p.run).sapped, 1, 'unfinished part does not count');
  g.horde.siege.precision(rope, a.p.id);
  g.horde.siege.precision(rope, a.p.id);
  assert.equal(rankCounts(a.p.run).sapped, 2);
  const tower = g.horde.spawn(S.Z_SIEGE_TOWER, 1)!;
  tower.state = S.ZS_SIEGE_ACTION;
  for (let i = 0; i < 5; i++) g.horde.siege.precision(tower, a.p.id);
  assert.equal(rankCounts(a.p.run).sapped, 3);
  const boat = g.horde.spawn(Z_BOAT, 1)!;
  boat.anchor = true;
  boat.state = S.ZS_SIEGE_DEPLOY;
  g.horde.siege.cutAnchor(boat, a.p.id, 2);
  assert.equal(rankCounts(a.p.run).sapped, 3);
  g.horde.siege.cutAnchor(boat, a.p.id);
  g.horde.siege.cutAnchor(boat, a.p.id);
  assert.equal(rankCounts(a.p.run).sapped, 4);
  for (const by of [0, -1, 249, 250, 1000]) g.sapped(by);
  assert.equal(rankCounts(a.p.run).sapped, 4);
  assert.equal(rankCounts(b.p.run).sapped, 0);
});

test('rank counters survive leaving and returning to the same run, without a rank payout on exit', () => {
  const { g, players: [a] } = game(true);
  clearWave(g, a.p.id);
  addRankCount(a.p.run, 'fix');
  addRankCount(a.p.run, 'sapped');
  const run = a.p.run;
  g.removePlayer(a.p.id);
  assert.equal(last(a.messages, 'fortReward'), undefined);
  const back = g.addHuman({ pid: a.p.pid, nick: a.p.name, outfit: DEFAULT_OUTFIT }, a.p.sink)!;
  assert.equal(back.run, run);
  assert.deepEqual(rankCounts(back.run), { fix: 1, sapped: 1 });
  assert.deepEqual(rankCounts(makeRun(0)), { fix: 0, sapped: 0 });
  finish(g);
  assert.deepEqual(last(a.messages, 'fend').rows.find(r => r.id === back.id)!.ranks, ['gunner', 'fixer', 'sapper']);
  assert.equal(last(a.messages, 'fortReward').ranks, 15);
});
