// Радио на лодке (shared/boatradio.ts, server/lobby/boatradio.ts): кто может управлять (хозяин / все на борту),
// разбор просьб, громкость по расстоянию и путь через настоящий хаб с тестовым носителем (/radio) и двумя игроками.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import {
  RADIO_DEV_ABOARD_R, RADIO_FAR, RADIO_NEAR, RADIO_STATIONS, radioApply, radioBlockSec, radioCanControl, radioDefault, radioGain, radioVolGain,
  type RadioCarrier,
} from '../shared/boatradio.ts';
import { Hub, type Client } from '../server/hub.ts';
import { Profiles } from '../server/profiles.ts';
import { Store } from '../server/store.ts';
import { SMOKE, lastOf, login, newKey, placeAt, type FakeSink } from './kit.ts';

const boat: RadioCarrier = { id: 3, owner: 10, aboard: [10, 11, 12] };

test('права: хозяин — всегда; пассажир — только если хозяин разрешил; чужой с берега — никогда', () => {
  const s = radioDefault();
  assert.equal(radioCanControl(s, boat, 10), true);
  assert.equal(radioCanControl(s, boat, 11), false);
  const all = { ...s, all: true };
  assert.equal(radioCanControl(all, boat, 11), true);
  assert.equal(radioCanControl(all, boat, 99), false, 'не на борту');
  // хозяин управляет, даже если сошёл на берег (его лодка)
  assert.equal(radioCanControl(s, { ...boat, aboard: [11] }, 10), true);
});

test('просьбы: станция включает радио; «разрешить всем» — только хозяин; мусор — отказ', () => {
  const s = radioDefault();
  const a = radioApply(s, boat, 10, { st: 2 });
  assert.ok(a.ok);
  assert.equal(a.state.on, true);
  assert.equal(a.state.st, 2);
  assert.deepEqual(radioApply(s, boat, 11, { st: 1 }), { ok: false, why: 'owner' });
  const opened = radioApply(s, boat, 10, { all: true });
  assert.ok(opened.ok && opened.state.all);
  if (!opened.ok) return;
  // пассажир при разрешении: станция и громкость — да, разрешение — нет
  const p = radioApply(opened.state, boat, 11, { st: 1, vol: 4 });
  assert.ok(p.ok && p.state.st === 1 && p.state.vol === 4);
  assert.deepEqual(radioApply(opened.state, boat, 11, { all: false }), { ok: false, why: 'owner' });
  assert.deepEqual(radioApply(opened.state, boat, 77, { on: false }), { ok: false, why: 'aboard' });
  // хозяин выключает разрешение — пассажир снова не может
  const closed = radioApply(opened.state, boat, 10, { all: false });
  assert.ok(closed.ok);
  if (closed.ok) assert.deepEqual(radioApply(closed.state, boat, 11, { on: true }), { ok: false, why: 'owner' });
  for (const bad of [{}, { st: 9 }, { st: 1.5 }, { vol: 0 }, { vol: 11 }, { on: 'да' }, { all: 1 }]) {
    assert.deepEqual(radioApply(s, boat, 10, bad as never), { ok: false, why: 'bad' }, JSON.stringify(bad));
  }
  assert.equal(s.on, false, 'вход не меняется');
});

test('станции и громкость: три станции, отрезки 8 тактов; рядом громко, к 45 м — тишина', () => {
  assert.equal(RADIO_STATIONS.length, 3);
  for (const st of RADIO_STATIONS) assert.ok(radioBlockSec(st) > 8 && radioBlockSec(st) < 30, `${st.id}: ${radioBlockSec(st)} с`);
  assert.ok(RADIO_STATIONS[0].bpm >= 150, 'гоночная — быстрая');
  assert.ok(RADIO_STATIONS[1].bpm <= 80, 'для ловли — спокойная');
  assert.equal(radioGain(0), 1);
  assert.equal(radioGain(RADIO_NEAR), 1);
  assert.equal(radioGain(RADIO_FAR), 0);
  for (let d = 0; d < 60; d++) assert.ok(radioGain(d + 1) <= radioGain(d));
  assert.equal(radioVolGain(10), 1);
  assert.ok(radioVolGain(1) > 0 && radioVolGain(5) < 0.5);
});

// ------------------------------------------------------------ через хаб

const dirs: string[] = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function env(isle = true) {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-radio-'));
  dirs.push(dir);
  const clock = { now: Date.UTC(2026, 9, 10, 18) };
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now: () => clock.now });
  store.load();
  const profiles = new Profiles(store, { now: () => clock.now });
  const hub = new Hub({ store, profiles, smokeToken: SMOKE, build: 'test', now: () => clock.now, log: () => {}, weather: 'clear', fish2: true, isle });
  hub.gate.devGo = true;
  return { hub, clock };
}

let ip = 0;
const who = (e: ReturnType<typeof env>, nick: string): { c: Client; s: FakeSink } => login(e.hub, nick, newKey(), `10.0.7.${++ip}`);
const say = (e: ReturnType<typeof env>, c: Client, text: string): void => e.hub.onJson(c, { t: 'chat', text });
const ask = (e: ReturnType<typeof env>, c: Client, m: Record<string, unknown>): void => {
  e.hub.onJson(c, { t: 'radio', ...m } as never);
  e.clock.now += 400;
};

test('хаб: хозяин включает станцию — радио у всех; пассажир рядом — только с разрешения; далеко — нельзя', () => {
  const e = env();
  const a = who(e, 'Tester7');
  const b = who(e, 'Tester8');
  // радио на сервере есть: пустой список вошедшим
  assert.deepEqual(lastOf(a.s, 'radio')?.r, []);
  placeAt(e.hub, a.c, -2, 40);
  placeAt(e.hub, b.c, -2 + RADIO_DEV_ABOARD_R - 1, 40);
  say(e, a.c, '/radio');
  const id = -a.c.profile!.id;
  const first = lastOf(b.s, 'radio')!.r.find((r) => r.id === id);
  assert.ok(first && first.dev === 1 && first.owner === a.c.profile!.id && first.nick === 'Tester7' && first.on === 0);
  ask(e, a.c, { id, st: 0 });
  let w = lastOf(b.s, 'radio')!.r.find((r) => r.id === id)!;
  assert.equal(w.on, 1);
  assert.equal(w.st, 0);
  // пассажир без разрешения — отказ с ником хозяина, состояние то же
  ask(e, b.c, { id, st: 1 });
  assert.match(lastOf(b.s, 'radioRes')!.text, /хозяин лодки — Tester7/);
  assert.equal(lastOf(b.s, 'radio')!.r.find((r) => r.id === id)!.st, 0);
  // пассажир не может разрешить сам себе
  ask(e, b.c, { id, all: true });
  assert.equal(lastOf(b.s, 'radio')!.r.find((r) => r.id === id)!.all, 0);
  // хозяин разрешил всем — пассажир переключает станцию и громкость
  ask(e, a.c, { id, all: true });
  ask(e, b.c, { id, st: 1, vol: 4 });
  w = lastOf(a.s, 'radio')!.r.find((r) => r.id === id)!;
  assert.equal(w.st, 1);
  assert.equal(w.vol, 4);
  assert.equal(w.all, 1);
  // ушёл далеко — уже не на борту
  placeAt(e.hub, b.c, 30, 40);
  ask(e, b.c, { id, on: false });
  assert.match(lastOf(b.s, 'radioRes')!.text, /на борту/);
  assert.equal(lastOf(a.s, 'radio')!.r.find((r) => r.id === id)!.on, 1);
  // хозяин ушёл с набережной — тестовый носитель и его радио пропадают у всех
  e.hub.disconnect(a.c);
  assert.equal(lastOf(b.s, 'radio')!.r.some((r) => r.id === id), false);
  // нет такого носителя
  ask(e, b.c, { id: 12345, on: true });
  assert.match(lastOf(b.s, 'radioRes')!.text, /лодки уже нет/);
});

test('хаб без флага ISLE: радио нет, /radio — обычная строка чата', () => {
  const e = env(false);
  const a = who(e, 'Tester9');
  assert.equal(lastOf(a.s, 'radio'), undefined);
  say(e, a.c, '/radio');
  assert.equal(lastOf(a.s, 'radio'), undefined);
});
