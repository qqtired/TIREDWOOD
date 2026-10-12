import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { emptyFarm, normalizeFarm, tutorialEvent, type TutorialEvent } from '../shared/farm.ts';
import { bedWorld } from '../shared/farmmap.ts';
import { FARM_SEATS16 } from '../shared/farmseats.ts';
import { BTN_FORWARD, BTN_JUMP, BTN_USE, makeInput } from '../shared/sim.ts';
import type { ServerMsg } from '../shared/messages.ts';
import type { Client } from '../server/hub.ts';
import { FarmRoom } from '../server/farm/room.ts';
import { normalizeProfile, Store, type Profile } from '../server/store.ts';

const NOW = Date.UTC(2026, 9, 12, 8);

function kit() {
  const profiles = new Map<number, Profile>();
  const paid = new Map<number, number>();
  const room = new FarmRoom({
    jukebox: false, now: () => NOW, outfitOf: (p) => p.outfit, profileOf: (pid) => profiles.get(pid),
    credit: (c, n) => { paid.set(c.pid, (paid.get(c.pid) ?? 0) + n); }, spend: () => true,
    generalXp: () => {}, grantItem: () => true, dirty: () => {}, seats: () => undefined, saveSeats: () => {},
  });
  const add = (id: number) => {
    const profile = normalizeProfile({ id, nick: `Farmer${id}`, farm: emptyFarm(NOW) })!;
    profiles.set(id, profile);
    const messages: ServerMsg[] = [];
    const c = { id, pid: id, profile, ephemeral: false, epoch: 0, sink: { sendJson: (m: ServerMsg) => messages.push(m), sendBinary: () => {} } } as unknown as Client;
    assert.ok(room.join(c, null));
    return { c, profile, messages, p: room.playerOf(c)! };
  };
  const input = (c: Client, seq: number, buttons: number) => room.onInputs(c, [{ ...makeInput(), seq, buttons }], 1);
  const drain = () => { for (let i = 0; i < 20; i++) room.step(); };
  return { room, add, input, drain, paid };
}

test('farm E: JSON посадки и бинарное удержание E не отменяют посадку; все16 мест и два игрока независимы', () => {
  const k = kit(); const a = k.add(1); const b = k.add(2); let seqA = 0; let seqB = 0;
  assert.equal(FARM_SEATS16.length, 16);
  for (const seat of FARM_SEATS16) {
    for (let i = 0; i < 60; i++) k.room.step(); // новое окно ограничения действий
    Object.assign(a.p.state, seat); Object.assign(b.p.state, seat);
    k.room.onMessage(a.c, { t: 'farm', a: 'sit', seat: seat.id });
    k.room.onMessage(b.c, { t: 'farm', a: 'sit', seat: seat.id });
    assert.equal(b.p.seat, -1, `место${seat.id} занято`);
    k.input(a.c, ++seqA, BTN_USE); k.drain();
    assert.equal(a.p.seat, seat.id, `посадка E на место${seat.id} сохраняется`);
    k.input(a.c, ++seqA, BTN_USE); k.drain();
    assert.equal(a.p.seat, seat.id, 'удержание E не встаёт');
    const other: (typeof FARM_SEATS16)[number] = FARM_SEATS16[(seat.id + 1) % FARM_SEATS16.length];
    Object.assign(b.p.state, other); k.room.onMessage(b.c, { t: 'farm', a: 'sit', seat: other.id });
    k.input(b.c, ++seqB, BTN_USE); k.drain();
    assert.equal(b.p.seat, other.id); assert.equal(a.p.seat, seat.id);
    // Следующая отдельная E: FarmScene отправляет именно JSON stand, затем бинарный BTN_USE.
    k.input(a.c, ++seqA, 0); k.drain();
    k.room.onMessage(a.c, { t: 'farm', a: 'sit', seat: -1 }); k.input(a.c, ++seqA, BTN_USE); k.drain();
    assert.equal(a.p.seat, -1); assert.equal(b.p.seat, other.id, 'встал только автор E');
    k.room.onMessage(b.c, { t: 'farm', a: 'sit', seat: -1 });
  }
});

test('farm E: binary→JSON, старый queuedW/Space и ACK не отменяют посадку; новые движение/Space встают', () => {
  const k = kit(); const a = k.add(1); const seat = FARM_SEATS16[0]; Object.assign(a.p.state, seat);
  k.input(a.c, 1, BTN_USE); // бинарный вход пришёл до JSON и пока лежит в очереди
  k.room.onMessage(a.c, { t: 'farm', a: 'sit', seat: 0 }); k.drain(); assert.equal(a.p.seat, 0);
  k.room.onMessage(a.c, { t: 'farm', a: 'sit', seat: -1 });
  k.input(a.c, 2, BTN_FORWARD); k.input(a.c, 3, 0); k.input(a.c, 4, BTN_JUMP); k.input(a.c, 5, 0);
  Object.assign(a.p.state, seat); k.room.onMessage(a.c, { t: 'farm', a: 'sit', seat: 0 });
  assert.equal(a.p.inq.length, 0, 'pre-sit очередь подтверждена на границе телепорта');
  assert.equal(a.p.inq.ack, 5); assert.equal(a.p.inq.lastSeq, 5, 'seq fence сохраняется');
  k.input(a.c, 4, BTN_JUMP); assert.equal(a.p.inq.length, 0, 'устаревший вход не возвращается в очередь');
  k.drain(); assert.equal(a.p.seat, 0);
  k.input(a.c, 6, BTN_FORWARD); k.drain(); assert.equal(a.p.seat, -1, 'новое движение встаёт');
  Object.assign(a.p.state, seat); k.room.onMessage(a.c, { t: 'farm', a: 'sit', seat: 0 });
  k.input(a.c, 7, BTN_FORWARD); k.drain(); assert.equal(a.p.seat, 0, 'движение, удержанное до посадки, не новое');
  k.input(a.c, 8, 0); k.drain(); k.input(a.c, 9, BTN_JUMP); k.drain(); assert.equal(a.p.seat, -1, 'новый Space встаёт');
});

test('farm tutorial: close/open повторяет подсказки, но настоящий FarmRoom платит шаг один раз; Store сохраняет marker', () => {
  const k = kit(); const a = k.add(1); Object.assign(a.p.state, bedWorld(a.p.plot, 0));
  for (let bed = 0; bed < 3; bed++) {
    if (bed) {
      k.room.onMessage(a.c, { t: 'farm', a: 'tutorial', k: 'close' });
      k.room.onMessage(a.c, { t: 'farm', a: 'tutorial', k: 'open' });
    }
    k.room.onMessage(a.c, { t: 'farm', a: 'plant', beds: [bed], crop: 'radish' });
  }
  const f = a.profile.farm!;
  assert.equal(f.xp, 25); assert.equal(f.tutorial, 1); assert.equal(f.tutorialRewarded, 1);
  assert.equal(k.paid.get(1) ?? 0, 0);
  assert.deepEqual(a.messages.filter((m) => m.t === 'farmEv').flatMap((m) => m.e).filter((e) => e.k === 'tut').map((e) => e.xp), [25, 0, 0]);
  k.room.onMessage(a.c, { t: 'farm', a: 'tutorial', k: 'close' });
  const dir = mkdtempSync(join(tmpdir(), 'farm-tutorial-save-'));
  const first = new Store(dir, { now: () => NOW, log: () => {}, saveDelayMs: 60_000 }); first.load();
  first.state.profiles.push(a.profile); first.markDirty(); first.close();
  const second = new Store(dir, { now: () => NOW, log: () => {}, saveDelayMs: 60_000 }); second.load();
  const loaded = second.state.profiles.find((p) => p.id === 1)!.farm!;
  assert.equal(loaded.tutorial, -1); assert.equal(loaded.tutorialRewarded, 1); assert.equal(loaded.xp, 25);
  assert.deepEqual(loaded.beds, f.beds); loaded.tutorial = 0;
  assert.deepEqual(tutorialEvent(loaded, 'plant'), { step: 1, xp: 0, coins: 0 });
  assert.equal(loaded.tutorial, 1); assert.equal(loaded.tutorialRewarded, 1); second.close();
});

test('farm tutorial: completed profile reopens hints through the real room command without paying again', () => {
  const k = kit(); const a = k.add(1); const f = a.profile.farm!;
  f.tutorial = 6; f.tutorialRewarded = 6; f.xp = 240;
  Object.assign(a.p.state, bedWorld(a.p.plot, 0));
  k.room.onMessage(a.c, { t: 'farm', a: 'tutorial', k: 'open' });
  assert.equal(f.tutorial, 0, 'the completed profile can use Repeat hints');
  assert.equal(f.tutorialRewarded, 6);
  k.room.onMessage(a.c, { t: 'farm', a: 'plant', beds: [0], crop: 'radish' });
  assert.equal(f.tutorial, 1); assert.equal(f.xp, 240);
  assert.equal(k.paid.get(1) ?? 0, 0);
});

test('farm tutorial: новый профиль получает175XP/20монет за первый полный цикл, дальнейшие проходы только подсказки', () => {
  const f = emptyFarm(NOW); const events: TutorialEvent[] = ['plant', 'fill', 'water', 'harvest', 'sell', 'plant'];
  const rewards = events.map((e) => tutorialEvent(f, e)!);
  assert.equal(rewards.reduce((n, r) => n + r.xp, 0), 175);
  assert.equal(rewards.reduce((n, r) => n + r.coins, 0), 20); assert.equal(f.tutorialRewarded, 6);
  f.tutorial = 0;
  for (const e of events) { const r = tutorialEvent(f, e)!; assert.equal(r.xp, 0); assert.equal(r.coins, 0); }
  assert.equal(f.tutorial, 6); assert.equal(f.tutorialRewarded, 6);
});

test('farm tutorial: legacy prefix/closed мигрируют без новых выплат и независимо от beds/XP, явный marker переживает закрытие', () => {
  for (const tutorial of [0, 2, 6, -1]) {
    const { tutorialRewarded: _absent, ...old } = emptyFarm(NOW);
    old.tutorial = tutorial; old.xp = 21750;
    old.beds[0] = { crop: 'golden-apple', plantedAt: NOW, ripeAt: NOW + 360 * 60_000, watered: true, helpers: [2] };
    const raw = { ...old, v: 1, beds: old.beds.slice(0, 1) };
    const f = normalizeFarm(raw, NOW);
    assert.equal(f.tutorialRewarded, tutorial < 0 ? 6 : tutorial); assert.equal(f.tutorial, tutorial);
    assert.equal(f.beds.length, 3); assert.deepEqual(f.beds[0], old.beds[0]); assert.equal(f.xp, 5625);
    assert.deepEqual(normalizeFarm(f, NOW), f);
  }
  const neverPaid = emptyFarm(NOW); neverPaid.tutorial = -1;
  const loaded = normalizeFarm(neverPaid, NOW); assert.equal(loaded.tutorialRewarded, 0);
  loaded.tutorial = 0; assert.equal(tutorialEvent(loaded, 'plant')?.xp, 25);
});
