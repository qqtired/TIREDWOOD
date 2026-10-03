import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { BJ_COUNT_TICKS, BJ_DEALER_TICKS, BJ_RESULT_TICKS } from '../shared/blackjack.ts';
import { ACT_DURAK, KART_CHECK_EVERY, KART_COUNT_TICKS } from '../shared/lobby.ts';
import { KART_START } from '../shared/maps/lobby.ts';
import { SKILL_CHECKPOINTS } from '../shared/skilltest.ts';
import type { Client, Hub } from '../server/hub.ts';
import { lastOf, login, placeAt, setupHub, steps } from './kit.ts';

const deck = () => [9, 9, 7, 6]; // player18 beats dealer17
function useKind(hub: Hub, c: Client, kind: string, arg?: number): void {
  const it = hub.lobby.map.interact.find(i => i.kind === kind && (arg === undefined || i.arg === arg));
  assert.ok(it, `${kind} interaction exists`);
  placeAt(hub, c, it.x, it.z, it.y);
  hub.onJson(c, { t: 'use', id: it.id });
}
function blackjack(hub: Hub) {
  assert.ok(hub.lobby.blackjack, 'Hub must integrate authoritative blackjack hall');
  return hub.lobby.blackjack;
}
function bet(hub: Hub, c: Client) {
  const hall = blackjack(hub);
  hub.onJson(c, { t: 'blackjack', table: 2, a: 'bet', amount: 10, rev: hall.view().rev });
}

test('physical chairs expose twelve Durak and six Blackjack seats; welcome includes both contracts', () => {
  const { hub } = setupHub(); const a = login(hub, 'Mapping');
  assert.deepEqual(hub.lobby.map.interact.filter(i => i.kind === 'durak').map(i => i.arg), Array.from({ length: 12 }, (_, i) => i));
  assert.deepEqual(hub.lobby.map.interact.filter(i => i.kind === 'blackjack').map(i => i.arg), [12,13,14,15,16,17]);
  // Durak keeps stable physical table indexes; index 2 is an inert compatibility view.
  assert.equal(lastOf(a.s, 'lobby')?.tables.length, 3);
  assert.equal(hub.lobby.durak.canSit(12, a.c.pid), false);
  assert.equal(lastOf(a.s, 'lobby')?.blackjack?.table, 2);
  useKind(hub, a.c, 'blackjack', 12);
  assert.equal(hub.lobby.playerOf(a.c)?.action, ACT_DURAK);
  assert.equal(blackjack(hub).view().seats[0].id, hub.lobby.playerOf(a.c)?.slot);
});
test('wrong table and duplicate revision actions cannot spend; rejection returns current view', () => {
  const { hub } = setupHub({ blackjackDeck: deck }); const a = login(hub, 'Authority');
  const hall = blackjack(hub); const balance = a.c.profile!.tokens;
  useKind(hub, a.c, 'durak', 0);
  bet(hub, a.c); assert.equal(a.c.profile!.tokens, balance);
  assert.ok(lastOf(a.s, 'blackjackError')); assert.ok(lastOf(a.s, 'blackjack'));
  useKind(hub, a.c, 'blackjack', 12); const rev = hall.view().rev;
  hub.onJson(a.c, { t: 'blackjack', table: 0, a: 'bet', amount: 10, rev });
  assert.equal(a.c.profile!.tokens, balance);
  hub.onJson(a.c, { t: 'durak', table: 2, a: 'bot' });
  assert.equal(hall.view().seats.filter(s => s.k).length, 1);
  bet(hub, a.c); hub.onJson(a.c, { t: 'blackjack', table: 2, a: 'bet', amount: 10, rev });
  assert.equal(a.c.profile!.tokens, balance - 10);
  assert.equal(a.c.profile!.blackjackEscrow?.amount, 10);
  assert.equal(lastOf(a.s, 'blackjack')?.v.rev, hall.view().rev);
});
test('standing before deal refunds and releases the physical seat', () => {
  const { hub } = setupHub(); const a = login(hub, 'CancelSeat'); const b = login(hub, 'NextSeat');
  blackjack(hub); useKind(hub, a.c, 'blackjack', 12); const balance = a.c.profile!.tokens;
  bet(hub, a.c); hub.onJson(a.c, { t: 'unuse' });
  assert.equal(a.c.profile!.tokens, balance); assert.equal(a.c.profile!.blackjackEscrow, null);
  useKind(hub, b.c, 'blackjack', 12); assert.equal(blackjack(hub).view().seats[0].nick, b.c.nick);
});
test('active hand settles after moving to another room and syncs that online profile', () => {
  const { hub } = setupHub({ blackjackDeck: deck }); const a = login(hub, 'Elsewhere');
  blackjack(hub); useKind(hub, a.c, 'blackjack', 12); const balance = a.c.profile!.tokens;
  bet(hub, a.c); steps(hub, BJ_COUNT_TICKS);
  assert.deepEqual(blackjack(hub).view().dealer, [9,-1]);
  hub.move(a.c, hub.paintball, true); a.s.msgs.length = 0;
  steps(hub, BJ_DEALER_TICKS + 3);
  assert.equal(a.c.profile!.tokens, balance + 10); assert.equal(a.c.profile!.blackjackEscrow, null);
  assert.equal(lastOf(a.s, 'me')?.tokens, balance + 10); assert.equal(a.c.room, hub.paintball);
});
test('last human disconnect does not stop blackjack settlement', () => {
  const { hub, profiles } = setupHub({ blackjackDeck: deck }); const a = login(hub, 'Disconnected');
  blackjack(hub); useKind(hub, a.c, 'blackjack', 12); const pid = a.c.pid, balance = a.c.profile!.tokens;
  bet(hub, a.c); steps(hub, BJ_COUNT_TICKS); hub.disconnect(a.c);
  assert.equal(hub.active, true); assert.equal(hub.health().busy, 1);
  steps(hub, BJ_DEALER_TICKS + 3);
  assert.equal(profiles.byId(pid)?.tokens, balance + 10); assert.equal(profiles.byId(pid)?.blackjackEscrow, null);
  assert.equal(hub.health().busy, 0);
  steps(hub, BJ_RESULT_TICKS + 1); assert.equal(hub.active, false);
});
test('shutdown settles in-progress blackjack once and persists cleared escrow', () => {
  const { hub, store } = setupHub({ blackjackDeck: deck }); const a = login(hub, 'ShutdownBet');
  blackjack(hub); useKind(hub, a.c, 'blackjack', 12); const balance = a.c.profile!.tokens;
  bet(hub, a.c); steps(hub, BJ_COUNT_TICKS); hub.shutdown(); hub.shutdown();
  assert.equal(a.c.profile!.tokens, balance + 10); assert.equal(a.c.profile!.blackjackEscrow, null);
  assert.equal(store.state.profiles.find(p => p.id === a.c.pid)?.blackjackEscrow, null);
  const saved = JSON.parse(readFileSync(path.join(store.dir, 'state.json'), 'utf8')).profiles.find((p: { id: number }) => p.id === a.c.pid);
  assert.equal(saved.tokens, balance + 10); assert.equal(saved.blackjackEscrow, null);
});
test('reused lobby slot cannot take an offline hand or receive its payout', () => {
  const { hub, profiles } = setupHub({ blackjackDeck: deck }); const a = login(hub, 'OldProfile');
  blackjack(hub); useKind(hub, a.c, 'blackjack', 12); const slot = hub.lobby.playerOf(a.c)!.slot;
  const pid = a.c.pid, balance = a.c.profile!.tokens;
  bet(hub, a.c); steps(hub, BJ_COUNT_TICKS); hub.disconnect(a.c);
  const b = login(hub, 'NewProfile'); assert.equal(hub.lobby.playerOf(b.c)!.slot, slot);
  const otherBalance = b.c.profile!.tokens;
  useKind(hub, b.c, 'blackjack', 12); assert.notEqual(hub.lobby.playerOf(b.c)!.action, ACT_DURAK);
  useKind(hub, b.c, 'blackjack', 13); b.s.msgs.length = 0;
  steps(hub, BJ_DEALER_TICKS + 3);
  assert.equal(profiles.byId(pid)?.tokens, balance + 10); assert.equal(b.c.profile!.tokens, otherBalance);
  assert.equal(lastOf(b.s, 'tokens'), undefined);
});
test('disconnect and rejoin can reclaim only the original blackjack chair', () => {
  const { hub } = setupHub({ blackjackDeck: deck }); const a = login(hub, 'Reclaim');
  blackjack(hub); useKind(hub, a.c, 'blackjack', 12); bet(hub, a.c); steps(hub, BJ_COUNT_TICKS); hub.disconnect(a.c);
  const b = login(hub, 'Reclaim', a.key); useKind(hub, b.c, 'blackjack', 13);
  assert.notEqual(hub.lobby.playerOf(b.c)!.action, ACT_DURAK);
  useKind(hub, b.c, 'blackjack', 12); assert.equal(hub.lobby.playerOf(b.c)!.action, ACT_DURAK);
  assert.equal(blackjack(hub).view().seats[0].nick, b.c.nick);
  assert.equal(blackjack(hub).view().seats[0].hands[0].total, 18);
});
test('skill portal admits five, publishes scene/snapshot/status and safely refuses sixth', () => {
  const { hub } = setupHub();
  assert.ok(hub.skill, 'Hub must own the skill room');
  const people = Array.from({ length: 6 }, (_, i) => login(hub, `Sky${i}`, undefined, `10.2.0.${i + 1}`));
  steps(hub, 121);
  for (const p of people) useKind(hub, p.c, 'skill');
  assert.equal(hub.skill.humans, 5); assert.equal(people[5].c.room, hub.lobby);
  assert.equal(lastOf(people[0].s, 'scene')?.scene, 'skill');
  assert.ok(lastOf(people[0].s, 'skill_state')); assert.equal(hub.health().skill, 5);
  steps(hub, 60); assert.equal(lastOf(people[5].s, 'skillSt')?.n, 5);
});
test('skill leave returns near portal and rejoin restores an earned checkpoint', () => {
  const { hub } = setupHub(); const a = login(hub, 'SkyReturn'); assert.ok(hub.skill);
  steps(hub, 121); useKind(hub, a.c, 'skill');
  const p = hub.skill.playerOf(a.c)!;
  Object.assign(p.state, { x: 4, y: 40, z: 0, grounded: 1 }); steps(hub, 1);
  Object.assign(p.state, SKILL_CHECKPOINTS[1], { grounded: 1 }); steps(hub, 1);
  assert.equal(p.progress.checkpoint, 1);
  steps(hub, 121); hub.onJson(a.c, { t: 'leave' }); assert.equal(a.c.room, hub.lobby);
  const state = hub.lobby.playerOf(a.c)!.state, spawn = hub.lobby.map.skillSpawn;
  assert.ok(Math.hypot(state.x - spawn.x, state.z - spawn.z) < 2);
  steps(hub, 121); useKind(hub, a.c, 'skill'); assert.equal(hub.skill.playerOf(a.c)?.progress.checkpoint, 1);
});
test('skill chat and online roster route correctly; AFK returns to lobby', () => {
  const { hub } = setupHub(); const a = login(hub, 'SkyChat'), b = login(hub, 'Listener'); assert.ok(hub.skill);
  steps(hub, 121); useKind(hub, a.c, 'skill');
  assert.ok(lastOf(b.s, 'online')?.list.some(p => p.nick === a.c.nick && p.room === 'skill'));
  hub.onJson(a.c, { t: 'chat', text: 'Облака рядом' });
  assert.equal(lastOf(b.s, 'chat')?.room, 'skill');
  const p = hub.skill.playerOf(a.c)!; p.lastAction = hub.skill.tick - 5 * 60 * 60;
  steps(hub, 1); assert.equal(a.c.room, hub.lobby); assert.equal(hub.skill.humans, 0);
  assert.match(lastOf(a.s, 'toast')!.text, /без дела/);
});
test('oldest entrant hosts track choice; host leaving transfers authority and empty queue resets', () => {
  const { hub } = setupHub(); const a = login(hub, 'HostFirst'), b = login(hub, 'HostSecond');
  placeAt(hub, b.c, KART_START.x, KART_START.z); steps(hub, KART_CHECK_EVERY);
  placeAt(hub, a.c, KART_START.x, KART_START.z); steps(hub, KART_CHECK_EVERY);
  assert.equal(hub.lobby.kartStatus().hostId, hub.lobby.playerOf(b.c)?.slot);
  hub.onJson(a.c, { t: 'kartTrack', track: 'foundry' }); assert.equal(hub.lobby.kartStatus().track, 'port');
  hub.onJson(b.c, { t: 'kartTrack', track: 'foundry' }); assert.equal(hub.lobby.kartStatus().track, 'foundry');
  placeAt(hub, b.c, 0, 0); steps(hub, KART_CHECK_EVERY);
  assert.equal(hub.lobby.kartStatus().hostId, hub.lobby.playerOf(a.c)?.slot);
  hub.onJson(b.c, { t: 'kartTrack', track: 'port' }); assert.equal(hub.lobby.kartStatus().track, 'foundry');
  placeAt(hub, b.c, KART_START.x, KART_START.z); steps(hub, KART_CHECK_EVERY);
  assert.equal(hub.lobby.kartStatus().hostId, hub.lobby.playerOf(a.c)?.slot);
  placeAt(hub, b.c, 0, 0); steps(hub, KART_CHECK_EVERY);
  placeAt(hub, a.c, 0, 0); steps(hub, KART_CHECK_EVERY); assert.equal(hub.lobby.kartStatus().track, 'port');
});
test('selected track is immutable after launch and reaches race hello/status', () => {
  const { hub } = setupHub(); const a = login(hub, 'FoundryDriver');
  placeAt(hub, a.c, KART_START.x, KART_START.z); steps(hub, KART_CHECK_EVERY);
  hub.onJson(a.c, { t: 'kartTrack', track: 'foundry' });
  steps(hub, KART_COUNT_TICKS + KART_CHECK_EVERY);
  assert.equal(a.c.room, hub.race); assert.equal(hub.race.status()?.track, 'foundry');
  assert.equal(lastOf(a.s, 'race')?.track, 'foundry');
  hub.onJson(a.c, { t: 'kartTrack', track: 'port' }); assert.equal(hub.race.status()?.track, 'foundry');
});
test('race records stay separate per track while legacy port record remains intact', () => {
  const { hub } = setupHub(); const a = login(hub, 'TrackRecords');
  const row = { id: 1, nick: a.c.nick, bot: false, place: 1, time: 100000, best: 45000, tokens: 0, track: 'port' as const };
  hub.onRaceResult(a.c, row, null);
  hub.onRaceResult(a.c, { ...row, best: 65000, track: 'foundry' }, null);
  assert.equal(a.c.profile!.stats.rcBestLap, 45000); assert.equal(a.c.profile!.stats.rcBestLapFoundry, 65000);
});
