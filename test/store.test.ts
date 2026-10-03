// Хранилище: запись без порчи файла, восстановление из копии, 7 ежедневных копий.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { POOL_MIN } from '../shared/slots.ts';
import { emptyFishProgress } from '../shared/fishprogress.ts';
import { Store, emptyStats, normalizeProfile, type Profile } from '../server/store.ts';

function tmp(): string {
  return mkdtempSync(path.join(tmpdir(), 'opus-store-'));
}

function profile(id: number, nick: string): Profile {
  return {
    id, nick, keyHashes: ['ab'], createdAt: 1, lastSeen: 1, tokens: 100, owned: [],
    xp: 0, level: 1, levelsVersion: 1, fishingResetVersion: 1,
    outfit: { c: 1, c2: 2, p: 'none', e: 'normal', h: 'cap', a: 'none' }, daily: '2026-10-01', stats: emptyStats(), foolUntil: 0, epUntil: 0,
    album: {}, fishing: emptyFishProgress(),
  };
}

test('пустая папка → пустое состояние; сохранили — прочитали то же; временного файла не осталось', () => {
  const dir = tmp();
  try {
    const s = new Store(dir, { log: () => {} });
    s.load();
    assert.equal(s.state.v, 1);
    assert.equal(s.state.nextId, 1);
    assert.equal(s.state.jackpot, POOL_MIN);
    assert.equal(s.state.respects, 0);
    assert.equal(s.state.profiles.length, 0);
    s.state.profiles.push({ ...profile(1, 'Ёжик'), foolUntil: 1_800_000_000_000, epUntil: 1_700_000_000_000 });
    s.state.nextId = 2;
    s.state.jackpot = 1234.5;
    s.state.respects = 42;
    s.markDirty();
    s.close();
    assert.ok(!existsSync(path.join(dir, 'state.json.tmp')));
    const t = new Store(dir, { log: () => {} });
    t.load();
    assert.equal(t.state.nextId, 2);
    assert.equal(t.state.jackpot, 1234.5);
    assert.equal(t.state.respects, 42, 'счёт у статуи переживает перезапуск');
    assert.equal(t.state.profiles[0].nick, 'Ёжик');
    assert.equal(t.state.profiles[0].foolUntil, 1_800_000_000_000, 'колпак переживает перезапуск');
    assert.equal(t.state.profiles[0].epUntil, 1_700_000_000_000);
    t.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('испорченный файл откладывается в сторону, состояние берётся из последней копии', () => {
  const dir = tmp();
  try {
    const s = new Store(dir, { log: () => {} });
    s.load();
    s.state.profiles.push(profile(1, 'Пингвин'));
    s.markDirty();
    s.close();
    writeFileSync(path.join(dir, 'state.json'), '{"v":1, обрыв');
    const logs: string[] = [];
    const t = new Store(dir, { log: (m) => logs.push(m) });
    t.load();
    assert.equal(t.state.profiles[0]?.nick, 'Пингвин');
    assert.ok(readdirSync(dir).some((f) => f.startsWith('state.json.corrupt-')));
    assert.ok(logs.some((m) => m.includes('восстановлено')));
    t.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('копии: одна в день, хранятся 7 последних', () => {
  const dir = tmp();
  try {
    let now = Date.UTC(2026, 9, 1, 12);
    const s = new Store(dir, { log: () => {}, now: () => now });
    s.load();
    for (let d = 0; d < 9; d++) {
      s.state.jackpot = 1000 + d;
      s.markDirty();
      s.flush();
      now += 24 * 3600_000;
    }
    s.close();
    const files = readdirSync(path.join(dir, 'backups')).sort();
    assert.equal(files.length, 7);
    assert.equal(files[0], 'state-2026-10-03.json');
    assert.equal(files[6], 'state-2026-10-09.json');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('запись откладывается и собирает несколько изменений', async () => {
  const dir = tmp();
  try {
    const s = new Store(dir, { log: () => {}, saveDelayMs: 20 });
    s.load();
    s.state.jackpot = 1500;
    s.markDirty();
    s.state.jackpot = 1600;
    s.markDirty();
    assert.ok(!existsSync(path.join(dir, 'state.json')), 'сразу не пишет');
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8')).jackpot, 1600);
    s.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('профиль из старой или битой записи дополняется значениями по умолчанию', () => {
  assert.equal(normalizeProfile(null), null);
  assert.equal(normalizeProfile({ id: 'x' }), null);
  const p = normalizeProfile({ id: 5, nick: 'Кот', keyHashes: ['aa'] })!;
  assert.equal(p.tokens, 0);
  assert.deepEqual(p.owned, []);
  assert.equal(p.stats.spins, 0);
  assert.equal(p.outfit.e, 'normal');
  assert.equal(p.foolUntil, 0);
  assert.equal(p.epUntil, 0);
  assert.equal(p.stats.dkGames, 0);
  assert.equal(p.stats.rcRaces, 0);
  assert.equal(p.stats.rcBestLap, 0);
});
