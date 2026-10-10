import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Profiles } from '../server/profiles.ts';
import { Store, StoreWriteError } from '../server/store.ts';
import { StorageFailure } from '../server/storage-failure.ts';

function setup(t: { after(fn: () => void): void }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-runtime-save-'));
  let onStopped!: () => void, onFinished!: (saved: boolean) => void;
  const stopped = new Promise<void>(resolve => { onStopped = resolve; });
  const finished = new Promise<boolean>(resolve => { onFinished = resolve; });
  let retries = 0;
  const store = new Store(dir, { saveDelayMs: 20, log: () => {}, onWriteError: () => runtime.fail() });
  const runtime = new StorageFailure({
    flush: () => { retries++; store.flush(); }, stop: () => onStopped(),
    finish: saved => onFinished(saved), log: () => {},
  });
  store.load();
  const profiles = new Profiles(store);
  const login = profiles.login({ key: 'isolated-storage-key-123456789', nick: 'Tester7' }, '127.0.0.1');
  assert.ok(login.ok);
  const p = login.profile;
  p.tokens = 100;
  store.flush();
  const blocker = path.join(dir, 'state.json.tmp');
  const unblock = () => rmSync(blocker, { recursive: true, force: true });
  const disk = () => JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8')).profiles[0];
  t.after(() => { unblock(); store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { dir, store, profiles, p, runtime, blocker, unblock, disk, stopped, finished, retries: () => retries };
}

test('primary reserve failure stops later input and persists the escrow for startup refund', async t => {
  const s = setup(t);
  mkdirSync(s.blocker);
  assert.equal(s.runtime.run(() => { s.profiles.reserveBlackjack(s.p.id, 'round', 20); }), false);
  assert.equal(s.disk().tokens, 100, 'failed primary remains unchanged');
  assert.equal(s.runtime.run(() => { s.profiles.spend(s.p, 10); }), false);
  s.unblock();
  assert.equal(await s.finished, true);
  assert.equal(s.disk().tokens, 80);
  assert.deepEqual(s.disk().blackjackEscrow, { round: 'round', amount: 20 });
  const reload = new Store(s.dir, { log: () => {} }); reload.load(); new Profiles(reload);
  assert.equal(reload.state.profiles[0].tokens, 100);
  assert.equal(reload.state.profiles[0].blackjackEscrow, null);
  reload.close();
});

test('primary settlement failure saves its pending result once and blocks later ticks', async t => {
  const s = setup(t);
  s.profiles.reserveBlackjack(s.p.id, 'round', 20);
  mkdirSync(s.blocker);
  assert.equal(s.runtime.run(() => { s.profiles.settleBlackjack(s.p.id, 'round', 20, 50); }), false);
  assert.equal(s.disk().tokens, 80);
  assert.equal(s.runtime.run(() => { s.p.tokens += 50; s.store.markDirty(); }), false);
  s.unblock();
  assert.equal(await s.finished, true);
  assert.equal(s.disk().tokens, 130);
  assert.equal(s.disk().blackjackEscrow, null);
});

test('debounced primary failure reaches fail-stop and preserves pending progress', async t => {
  const s = setup(t);
  mkdirSync(s.blocker);
  s.p.tokens = 125;
  s.store.markDirty();
  await s.stopped;
  assert.equal(s.runtime.failed, true);
  s.unblock();
  assert.equal(await s.finished, true);
  assert.equal(s.disk().tokens, 125);
});

test('persistent primary failure exits after bounded retries without changing the old save', async t => {
  const s = setup(t);
  mkdirSync(s.blocker);
  s.runtime.run(() => { s.profiles.reserveBlackjack(s.p.id, 'round', 20); });
  assert.equal(await s.finished, false);
  assert.equal(s.retries(), 3);
  assert.equal(s.disk().tokens, 100);
  assert.equal(s.runtime.run(() => { s.p.tokens = 0; }), false);
});

test('failure notification cannot replace the original primary write error', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-notify-failure-'));
  const store = new Store(dir, { onWriteError: () => { throw new Error('notification failed'); } });
  try {
    store.load();
    mkdirSync(path.join(dir, 'state.json.tmp'));
    store.markDirty();
    assert.throws(() => store.flush(), StoreWriteError);
  } finally {
    rmSync(path.join(dir, 'state.json.tmp'), { recursive: true, force: true });
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('backup failure after primary commit cannot reject an accepted reserve', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-save-failure-'));
  let now = Date.UTC(2026, 9, 10, 12);
  const logs: string[] = [];
  const store = new Store(dir, { now: () => now, log: message => logs.push(message) });
  try {
    store.load();
    const profiles = new Profiles(store, { now: () => now });
    const login = profiles.login({ key: 'isolated-storage-key-123456789', nick: 'Tester7' }, '127.0.0.1');
    assert.ok(login.ok);
    login.profile.tokens = 100;
    store.flush();
    const revision = store.primaryRevision;
    now += 86_400_000;
    mkdirSync(path.join(dir, 'backups', 'state-2026-10-11.json.tmp'));
    assert.equal(profiles.reserveBlackjack(login.profile.id, 'round', 20), true);
    const saved = JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8')).profiles[0];
    assert.equal(saved.tokens, 80);
    assert.deepEqual(saved.blackjackEscrow, { round: 'round', amount: 20 });
    assert.equal(store.primaryRevision, revision + 1);
    assert.equal(logs.length, 1, 'backup failure remains visible to operations');
  } finally {
    rmSync(path.join(dir, 'backups', 'state-2026-10-11.json.tmp'), { recursive: true, force: true });
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
