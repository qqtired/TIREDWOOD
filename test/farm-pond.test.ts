import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FISH, sanitizeAlbum } from '../shared/fishing.ts';
import { COLLECTION, ISLE_COLLECTION, RULE, collectionCount, rollCatch2, tierOdds, zoneSpecies } from '../shared/fishrules.ts';
import { bagSlots, emptyFishProgress, fishCastMods } from '../shared/fishprogress.ts';
import type { FishZone } from '../shared/fishplaces.ts';
import { makeRng } from '../shared/math.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { POND_SPOTS, POND_USE, farmPondEnabled, pondCastAt, pondContains } from '../shared/farmpond.ts';
import { makeInput, makeState } from '../shared/sim.ts';
import type { Client } from '../server/hub.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { FarmPond, type PondPlayer } from '../server/farm/pond.ts';
import type { PondIntent } from '../shared/farmpondnet.ts';
import type { ServerMsg } from '../shared/messages.ts';
import { FE_BITE, FP_HOLD } from '../shared/fishing.ts';
import { reelStyle2 } from '../shared/fishability.ts';
import { EXPERT, playReel, type Play } from './fishbot.ts';
import { earnedItems, isleEarned } from '../shared/fishstyle.ts';
import { FP_IDLE } from '../shared/fishing.ts';
import { FishNextCast, type QuickKeepContext } from '../client/lobby/fishnextcast.ts';
import { FE_DONE, FP_CAST } from '../shared/fishing.ts';

const POND_IDS = ['pond-crucian', 'pond-roach', 'pond-perch', 'pond-carp'];

test('пруд ловит четыре пресных вида и сохраняет прежние коллекции 52/20', () => {
  const species = zoneSpecies('pond' as FishZone);
  assert.deepEqual(species.map((sp) => FISH[sp].id), POND_IDS);
  assert.equal(COLLECTION.length, 52);
  assert.equal(ISLE_COLLECTION.length, 20);
  const album = sanitizeAlbum(Object.fromEntries(POND_IDS.map((id) => [id, [700, 1]])));
  assert.equal(Object.keys(album).length, 4, 'пресный улов сохраняется в общем альбоме');
  assert.equal(collectionCount(album), 0, 'пруд не заменяет морские виды для прежних наград');
});

test('шесть коротких забросов всегда попадают в воду', () => {
  for (let seat = 0; seat < 6; seat++) for (const r of [0, .25, .5, .75, 1]) {
    const at = pondCastAt(seat, () => r);
    assert.ok(pondContains(at.x, at.z));
    assert.ok(Math.hypot(at.x - POND_SPOTS[seat].x, at.z - POND_SPOTS[seat].z) < 4.5);
  }
});

test('пруд включается только явным FARM_POND=1 вместе с FARM и FISH2', () => {
  for (const raw of [undefined, '', '0', 'true', '1']) for (const farm of [false, true]) for (const fish2 of [false, true]) {
    assert.equal(farmPondEnabled(raw, farm, fish2), raw === '1' && farm && fish2);
  }
});

function pondEnv() {
  const dir = mkdtempSync(path.join(tmpdir(), 'tiredwood-pond-test-'));
  const clock = { now: Date.UTC(2026, 9, 11, 12), tick: 0 };
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now: () => clock.now });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const players: PondPlayer[] = [];
  const msgs = new Map<number, ServerMsg[]>();
  const pond = new FarmPond({
    now: () => clock.now, players: () => players,
    send: (p, m) => msgs.get(p.id)!.push(m), broadcast: (m) => { for (const p of players) msgs.get(p.id)!.push(m); },
    changed: () => {}, outfitChanged: () => {}, limit: () => true, announce: () => {},
    toast: (p, text) => msgs.get(p.id)!.push({ t: 'toast', text }),
  }, profiles, store);
  const add = (): PondPlayer => {
    const id = players.length + 1;
    const login = profiles.login({ key: `pond-device-key-${id}`.padEnd(32, 'x'), nick: `Рыбак${id}` }, `127.0.0.${id}`);
    assert.ok(login.ok);
    const c = { id, profile: login.profile, nick: login.profile.nick, ping: 0, ephemeral: false, epoch: 1 } as unknown as Client;
    const p: PondPlayer = { id, c, state: makeState(), last: makeInput(), inq: { starve: 0 }, pondSeat: null, selfReset: false, seat: -1, fill: null };
    players.push(p); msgs.set(id, []); pond.join(p);
    return p;
  };
  const advance = (ticks: number): void => { for (let n = 0; n < ticks; n++) { clock.now += 1000 / 60; pond.step(++clock.tick); } };
  const state = (p: PondPlayer) => msgs.get(p.id)!.filter((m) => m.t === 'farmPond').at(-1)! as Extract<ServerMsg, { t: 'farmPond' }>;
  const send = (p: PondPlayer, intent: PondIntent, old?: { epoch: number; turn: number }): void => {
    const s = old ?? state(p);
    pond.handle(p, { t: 'farmPondAct', epoch: s.epoch, turn: s.turn, intent });
  };
  const sit = (p: PondPlayer, seat: number): void => {
    Object.assign(p.state, POND_SPOTS[seat]);
    pond.handle(p, { t: 'farmPondSeat', epoch: p.c.epoch, seat });
  };
  const hook = (p: PondPlayer): { msg: Extract<ServerMsg, { t: 'fishReel' }>; play: Play } => {
    pond.fishing.rand = () => .5;
    pond.fishing.roll = () => ({ sp: FISH.findIndex((f) => f.id === 'pond-crucian'), g: 1000, coins: 0 });
    send(p, { t: 'fish', a: 'cast' });
    msgs.get(p.id)!.length = 0;
    let bite: number | undefined;
    for (let n = 0; n < 2000 && bite === undefined; n++) {
      advance(1);
      for (const m of msgs.get(p.id)!) if (m.t === 'farmPondEv') for (const e of m.e) if (e[0] === 'fish' && e[1] === FE_BITE) bite = e[3];
    }
    assert.notEqual(bite, undefined);
    const mods = fishCastMods(p.c.profile!.fishing, clock.now, 'pond');
    let seed = 1, play = playReel(reelStyle2(FISH.findIndex((f) => f.id === 'pond-crucian'), mods), seed, EXPERT);
    while (!play.caught && seed < 100) play = playReel(reelStyle2(FISH.findIndex((f) => f.id === 'pond-crucian'), mods), ++seed, EXPERT);
    assert.ok(play.caught);
    pond.fishing.rand = () => seed / 0x1_0000_0000;
    send(p, { t: 'fish', a: 'hook', n: bite });
    const msg = msgs.get(p.id)!.filter((m) => m.t === 'fishReel').at(-1) as Extract<ServerMsg, { t: 'fishReel' }>;
    assert.ok(msg);
    return { msg, play };
  };
  const replay = (p: PondPlayer, play: Play, old?: { epoch: number; turn: number }): void => {
    let sent = 0;
    for (let u = 0; u < play.ticks;) {
      const next = Math.min(play.ticks, u + 15);
      advance(next - u);
      const i = sent, k: number[] = [];
      while (sent < play.toggles.length && play.toggles[sent] < next) k.push(play.toggles[sent++]);
      send(p, { t: 'reel', i, k, u: next, ...(next === play.ticks ? { d: 1 } : {}) }, old);
      u = next;
    }
  };
  const reload = () => { store.flush(); const copy = new Store(dir, { log: () => {} }); copy.load(); return copy.state.profiles; };
  return { pond, profiles, store, players, msgs, add, advance, state, send, sit, hook, replay, reload,
    close: () => { store.flush(); rmSync(dir, { recursive: true }); } };
}

test('6+1: занятое место нельзя перезаписать, уход освобождает его', () => {
  const e = pondEnv();
  try {
    const fishers = Array.from({ length: 7 }, () => e.add());
    for (let n = 0; n < 6; n++) e.sit(fishers[n], n);
    e.sit(fishers[6], 0);
    assert.equal(fishers[6].pondSeat, null);
    assert.equal(e.pond.fishing.occupant(0), fishers[0].id);
    e.pond.leave(fishers[0]);
    e.sit(fishers[6], 0);
    assert.equal(fishers[6].pondSeat, 0);
    assert.equal(e.pond.fishing.occupant(0), fishers[6].id);
  } finally { e.close(); }
});

test('прудовый улов и сохранение оставляют всю коллекцию 52/20 и награды владельца', () => {
  const e = pondEnv();
  try {
    const p = e.add(), prof = p.c.profile!;
    for (const sp of [...COLLECTION, ...ISLE_COLLECTION]) prof.album[FISH[sp].id] = [FISH[sp].g[0], 3];
    prof.owned = [...earnedItems(52), ...isleEarned(20)];
    const oldAlbum = structuredClone(prof.album), oldOwned = [...prof.owned];
    prof.fishing.xp = 1300; prof.fishing.questsDone = 3; prof.fishing.rod = 1;
    e.sit(p, 0); e.replay(p, e.hook(p).play);
    for (const [id, v] of Object.entries(oldAlbum)) assert.deepEqual(prof.album[id], v);
    assert.deepEqual(prof.owned, oldOwned); assert.equal(collectionCount(prof.album), 52);
    assert.equal(prof.fishing.questsDone, 3); assert.equal(prof.fishing.rod, 1);
    const saved = e.reload().find((v) => v.id === prof.id)!;
    assert.deepEqual(saved.album, prof.album); assert.deepEqual(saved.owned, oldOwned);
    assert.equal(saved.fishing.xp, prof.fishing.xp); assert.equal(saved.fishing.bag[0].f, 'pond-crucian');
  } finally { e.close(); }
});

test('Фома не продаёт лодку или морской дождь; raw lobby input не забрасывает', () => {
  const e = pondEnv();
  try {
    const p = e.add(); e.sit(p, 0);
    e.pond.handle(p, { t: 'fish', a: 'cast' });
    assert.equal(e.pond.fishing.phase(0), FP_IDLE);
    e.pond.stand(p); Object.assign(p.state, POND_USE);
    const before = structuredClone(p.c.profile!.fishing), balance = p.c.profile!.tokens;
    for (const a of ['rain', 'buyBoat', 'ferry'] as const) e.send(p, { t: 'fishNpc', npc: 'pond', a });
    assert.deepEqual(p.c.profile!.fishing, before); assert.equal(p.c.profile!.tokens, balance);
    assert.equal(e.msgs.get(p.id)!.filter((m) => m.t === 'fishNpc' && m.npc === 'pond' && m.message?.includes('нет лодок')).length, 3);
  } finally { e.close(); }
});

test('честный replay кладёт общий улов один раз; Фома продаёт без повторной выплаты', () => {
  const e = pondEnv();
  try {
    const p = e.add(); e.sit(p, 0);
    const { play } = e.hook(p); e.replay(p, play);
    const prof = p.c.profile!;
    assert.equal(e.pond.fishing.phase(0), FP_HOLD);
    assert.equal(prof.fishing.bag.length, 1);
    assert.deepEqual(prof.album['pond-crucian'], [1000, 1]);
    const land = e.msgs.get(p.id)!.filter((m) => m.t === 'fishLand').at(-1)!;
    assert.equal(land.t === 'fishLand' && land.pond, 1);
    assert.equal(land.t === 'fishLand' && land.got, 0, 'прудовая карточка не прибавляет морскую коллекцию');
    const catchBalance = prof.tokens, catchXp = prof.fishing.xp;
    e.send(p, { t: 'reel', i: play.toggles.length, k: [], u: play.ticks, d: 1 });
    assert.equal(prof.fishing.bag.length, 1); assert.equal(prof.tokens, catchBalance); assert.equal(prof.fishing.xp, catchXp);
    e.pond.stand(p);
    Object.assign(p.state, POND_USE);
    const fish = prof.fishing.bag[0];
    e.send(p, { t: 'fishNpc', npc: 'pond', a: 'sell', n: fish.n });
    assert.equal(prof.tokens, catchBalance + fish.p); assert.equal(prof.fishing.bag.length, 0);
    e.send(p, { t: 'fishNpc', npc: 'pond', a: 'sell', n: fish.n });
    assert.equal(prof.tokens, catchBalance + fish.p); assert.equal(prof.stats.fsCaught, 1);
  } finally { e.close(); }
});

test('отпускание добавляет опыт один раз и убирает продажный улов', () => {
  const e = pondEnv();
  try {
    const p = e.add(); e.sit(p, 0); e.replay(p, e.hook(p).play);
    const prof = p.c.profile!, before = prof.fishing.xp, balance = prof.tokens;
    e.send(p, { t: 'fish', a: 'release' });
    assert.ok(prof.fishing.xp > before); assert.equal(prof.fishing.bag.length, 0); assert.equal(prof.tokens, balance);
    const released = prof.fishing.xp;
    e.send(p, { t: 'fish', a: 'release' });
    assert.equal(prof.fishing.xp, released); assert.equal(prof.tokens, balance);
  } finally { e.close(); }
});

test('Space keep→серверный DONE→один заброс; последний слот не запускает отказ в цикле', () => {
  for (const fillBag of [false, true]) {
    const e = pondEnv();
    try {
      const p = e.add(); e.sit(p, 0); e.replay(p, e.hook(p).play);
      const prof = p.c.profile!, kept = prof.fishing.bag[0], balance = prof.tokens;
      if (fillBag) while (prof.fishing.bag.length < bagSlots(prof.fishing)) prof.fishing.bag.push({ ...kept, n: 100 + prof.fishing.bag.length });
      const q = new FishNextCast();
      const ctx: QuickKeepContext = { seat: 0, fishing: true, canKeep: true, fresh: true, typing: false, blocked: false, locked: false, full: fillBag, now: 1000 };
      assert.equal(q.request(ctx), 'keep'); e.send(p, { t: 'fish', a: 'keep' });
      const done = e.msgs.get(p.id)!.flatMap((m) => m.t === 'farmPondEv' ? m.e : []).filter((v) => v[0] === 'fish' && v[1] === FE_DONE).at(-1)!;
      assert.equal(done[3], 1, 'обычный keep подтверждён настоящим сервером');
      const cast = q.confirm(done[3], { ...ctx, now: 1200 });
      if (cast) e.send(p, { t: 'fish', a: 'cast' });
      assert.equal(prof.stats.fsCasts, fillBag ? 1 : 2);
      assert.equal(e.pond.fishing.phase(0), fillBag ? FP_IDLE : FP_CAST);
      assert.equal(q.confirm(done[3], ctx), false); e.send(p, { t: 'fish', a: 'keep' });
      assert.equal(prof.stats.fsCasts, fillBag ? 1 : 2); assert.equal(prof.tokens, balance);
    } finally { e.close(); }
  }
});

test('прошлая комната и прежний turn не могут закончить новую шкалу', () => {
  const e = pondEnv();
  try {
    const p = e.add(); e.sit(p, 0); const old = e.state(p); const first = e.hook(p);
    e.pond.leave(p); p.c.epoch++; e.pond.join(p); e.sit(p, 0);
    e.hook(p);
    const prof = p.c.profile!, balance = prof.tokens;
    e.replay(p, first.play, old);
    assert.equal(prof.fishing.bag.length, 0); assert.equal(prof.tokens, balance); assert.equal(prof.stats.fsCaught, 0);
  } finally { e.close(); }
});

test('пруд сохраняет снасти, но не наследует морские фантомные категории или сундуки', () => {
  const progress = emptyFishProgress();
  progress.xp = 80_000;
  progress.rod = 4;
  progress.lure = 3;
  const mods = fishCastMods(progress, 0, 'pond' as FishZone);
  assert.equal(mods.zone, 'pond');
  assert.ok(mods.zoneScale > 1 && mods.rareMultiplier > 1);
  assert.equal(mods.sea, 1);
  assert.equal(mods.seaDrain, 1);
  assert.deepEqual(tierOdds(true, mods, true), tierOdds(false, mods), 'морской сезон не меняет прудовый пул');
  for (const wet of [false, true]) {
    const odds = tierOdds(wet, mods, wet);
    assert.ok(Math.abs(odds.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    for (const tier of [3, 4, 5, 6, 7]) assert.equal(odds[tier], 0);
    const rand = makeRng(4492);
    for (let n = 0; n < 2000; n++) {
      const catch_ = rollCatch2(wet, rand, mods, wet);
      assert.ok(POND_IDS.includes(FISH[catch_.sp].id), 'ни морской вид, ни отсутствующая категория не выпадают');
      assert.ok(RULE[catch_.sp]);
    }
  }
});
