import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { GiftCodes } from '../server/gifts.ts';
import { Profiles } from '../server/profiles.ts';
import { Store, type Profile } from '../server/store.ts';

const CODE = 'TEST-DEVIL-42';
const HASH = createHash('sha256').update(CODE).digest('hex');
const ITEMS = ['h:devil', 'a:deviltail'];

function setup(t: { after(fn: () => void): void }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-gifts-'));
  let now = Date.UTC(2026, 9, 3, 12);
  const store = new Store(dir, { log: () => {}, saveDelayMs: 60_000, now: () => now });
  store.load();
  const profiles = new Profiles(store, { now: () => now });
  const result = profiles.login({ key: 'gift-test-key-123456789', nick: 'Подарок' }, '1.2.3.4');
  assert.ok(result.ok);
  const p = result.profile;
  store.flush();
  const c = { pid: p.id, profile: p as Profile | null, ephemeral: false, closed: false, ip: '1.2.3.4' };
  const gifts = new GiftCodes({ profiles, codeHash: HASH, now: () => now });
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { dir, store, profiles, p, c, gifts, advance: (ms: number) => { now += ms; } };
}

test('gift grants both items durably without changing profile progress, money or outfit', (t) => {
  const { dir, store, profiles, p, c, gifts } = setup(t);
  p.owned.push('h:panama'); p.tokens = 765; p.xp = 123; p.stats.pbWins = 9;
  const before = structuredClone(p);
  assert.equal(gifts.handle(c, ` ${CODE.toLowerCase()} `), 'granted');
  assert.deepEqual(p, { ...before, owned: [...before.owned, ...ITEMS] });
  assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8')).profiles[0], p);
  assert.equal(gifts.handle(c, CODE), 'already');
  assert.equal(new GiftCodes({ profiles, codeHash: HASH }).handle(c, CODE), 'already');
  const reloaded = new Store(dir, { log: () => {} }); reloaded.load();
  assert.deepEqual(reloaded.state.profiles[0].owned, p.owned);
  store.flush();
});

test('partial ownership completes the set without duplicate items', (t) => {
  const { p, c, gifts } = setup(t);
  p.owned.push(ITEMS[0]);
  assert.equal(gifts.handle(c, CODE), 'granted');
  assert.deepEqual(p.owned, ITEMS);
});

test('rejects malformed, oversized, Unicode, and wrong codes without granting', (t) => {
  const { p, c, gifts, advance } = setup(t);
  for (const code of [null, {}, 1, '', 'A'.repeat(65), 'TEST_DEVIL_42', 'ＴＥＳＴ-DEVIL-42', 'ß', 'WRONG']) {
    assert.equal(gifts.handle(c, code), 'invalid');
    advance(60_001);
  }
  assert.deepEqual(p.owned, []);
});

test('disabled or malformed configuration cannot redeem even with correct code', (t) => {
  const { p, c, profiles } = setup(t);
  for (const codeHash of [null, '', 'abcd', 'z'.repeat(64)]) {
    assert.equal(new GiftCodes({ profiles, codeHash }).handle(c, CODE), 'disabled');
  }
  assert.deepEqual(p.owned, []);
});

test('requires a live non-ephemeral indexed profile object', (t) => {
  const { p, c, gifts } = setup(t);
  for (const invalid of [{ ...c, closed: true }, { ...c, ephemeral: true }, { ...c, profile: null }, { ...c, pid: p.id + 1 }, { ...c, profile: structuredClone(p) }]) {
    assert.equal(gifts.handle(invalid, CODE), 'unavailable');
  }
  assert.deepEqual(p.owned, []);
});

test('attempt limit survives reconnects and clears after the window', (t) => {
  const { c, gifts, advance } = setup(t);
  for (let i = 0; i < 5; i++) assert.equal(gifts.handle({ ...c }, 'WRONG'), 'invalid');
  assert.equal(gifts.handle({ ...c }, CODE), 'rate_limit');
  advance(60_001);
  assert.equal(gifts.handle(c, CODE), 'granted');
});

test('one campaign code grants independently to separate real profiles', (t) => {
  const { profiles, c, gifts } = setup(t);
  const second = profiles.login({ key: 'gift-test-key-987654321', nick: 'Получатель' }, '5.6.7.8');
  assert.ok(second.ok);
  assert.equal(gifts.handle(c, CODE), 'granted');
  assert.equal(gifts.handle({ ...c, pid: second.profile.id, profile: second.profile }, CODE), 'granted');
  assert.deepEqual(second.profile.owned, ITEMS);
});

test('IP attempt cap prevents cycling through authenticated profiles', (t) => {
  const { profiles, c, gifts } = setup(t);
  for (let n = 0; n < 4; n++) {
    const login = profiles.login({ key: `gift-test-ip-key-${n}-12345678`, nick: `Гость${n}` }, `10.0.0.${n}`);
    assert.ok(login.ok);
    const client = { ...c, pid: login.profile.id, profile: login.profile };
    for (let i = 0; i < 5; i++) assert.equal(gifts.handle(client, 'WRONG'), 'invalid');
  }
  assert.equal(gifts.handle(c, CODE), 'rate_limit');
});

test('primary write failure rolls back only the gift, allowing retry and reload', (t) => {
  const { dir, store, p, c, gifts } = setup(t);
  p.owned.push('h:panama'); p.tokens += 77; p.stats.pbWins = 2;
  const before = structuredClone(p);
  const blocker = path.join(dir, 'state.json.tmp'); mkdirSync(blocker);
  assert.equal(gifts.handle(c, CODE), 'unavailable');
  assert.deepEqual(p, before);
  assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8')).profiles[0].owned, []);
  rmSync(blocker, { recursive: true });
  assert.equal(gifts.handle(c, CODE), 'granted');
  store.flush();
  const reloaded = new Store(dir, { log: () => {} }); reloaded.load();
  assert.deepEqual(reloaded.state.profiles[0].owned, ['h:panama', ...ITEMS]);
  assert.equal(reloaded.state.profiles[0].tokens, before.tokens);
  assert.equal(reloaded.state.profiles[0].stats.pbWins, 2);
});

test('backup write failure after primary commit retains the durable whole set', (t) => {
  const { dir, store, p, c, gifts, advance } = setup(t);
  advance(86_400_000);
  const blocker = path.join(dir, 'backups', 'state-2026-10-04.json.tmp'); mkdirSync(blocker);
  assert.equal(gifts.handle(c, CODE), 'granted');
  assert.deepEqual(p.owned, ITEMS);
  assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8')).profiles[0].owned, ITEMS);
  assert.equal(gifts.handle(c, CODE), 'already');
  rmSync(blocker, { recursive: true }); store.flush();
  const reloaded = new Store(dir, { log: () => {} }); reloaded.load();
  assert.deepEqual(reloaded.state.profiles[0].owned, ITEMS);
});
