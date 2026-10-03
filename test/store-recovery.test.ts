// S3: существовавшее хранилище не превращается в новую пустую базу при отказе чтения/восстановления.
// Только искусственные файлы в fresh tmpdir; никаких реальных DATA_DIR или профилей игроков.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { FISH } from '../shared/fishing.ts';
import { Store, normalizeProfile } from '../server/store.ts';

const dirs: string[] = [];
after(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const NOW = Date.UTC(2026, 9, 3, 12);
const OLD_NOW = Date.UTC(2026, 9, 1, 12);
const LOAD_ERROR = /Хранилище.*безопасный запуск невозможен/;
const WRITE_ERROR = /Хранилище.*запись не завершена/;
const BAD = 'PRIVATE_PROFILE_CONTENT_123';

function dir(): string {
  const value = mkdtempSync(path.join(tmpdir(), 'opus-store-recovery-'));
  dirs.push(value);
  return value;
}

function store(at: string, logs: string[] = []) {
  return new Store(at, { now: () => NOW, log: (line) => logs.push(line), saveDelayMs: 60_000 });
}

function validFixture(at: string) {
  const seed = new Store(at, { now: () => OLD_NOW, log: () => {}, saveDelayMs: 60_000 });
  seed.load();
  seed.state.profiles.push(normalizeProfile({
    id: 7, nick: 'Искусственный', keyHashes: ['test-only-hash'], createdAt: OLD_NOW, lastSeen: OLD_NOW,
    tokens: 400, owned: ['h:panama'], outfit: { c: 1, c2: 2, p: 'none', e: 'normal', h: 'panama', a: 'none' },
    daily: '2026-10-01', foolUntil: NOW + 10000, epUntil: NOW + 20000,
    stats: { fsFish: 3, fsGrams: 1500, fsCasts: 6, fsBites: 5, fsLost: 2, fsMaxGrams: 500, fsEarned: 90 },
    album: { scad: [500, 3] }, fishing: { xp: 380, questsDone: 5, questCaught: 7, rod: 2, beerUntil: NOW + 300000 },
    xp: 2345, level: 7, levelsVersion: 1, fishingResetVersion: 1,
    blackjackEscrow: { round: 'synthetic-bj-round', amount: 25 }, durakEscrow: { round: 'synthetic-dk-round', amount: 50 },
  })!);
  seed.state.nextId = 8;
  seed.state.jackpot = 1250.5;
  seed.state.respects = 9;
  seed.state.fishPodium = { day: '2026-10-01', catches: [{ pid: 7, nick: 'Искусственный', sp: FISH.findIndex((f) => f.id === 'scad'), g: 500, at: OLD_NOW }] };
  seed.state.lobbyEvents = { stormAt: NOW + 120000, piratesAt: NOW + 240000, endedAt: 0, lockUntil: NOW + 300000 };
  seed.markDirty();
  seed.close();
  const primary = path.join(at, 'state.json');
  return { primary, bytes: readFileSync(primary, 'utf8'), expected: JSON.parse(readFileSync(primary, 'utf8')) };
}

function cannotWriteAfterFailedLoad(s: Store): void {
  assert.throws(() => s.markDirty(), LOAD_ERROR);
  assert.throws(() => s.flush(), LOAD_ERROR);
  assert.throws(() => s.close(), LOAD_ERROR);
}

test('S3 новый пустой DATA_DIR инициализируется и может сохранить первый профиль', () => {
  const at = path.join(dir(), 'new-data');
  const s = store(at);
  s.load();
  assert.equal(s.state.profiles.length, 0);
  assert.equal(s.state.nextId, 1);
  assert.ok(!existsSync(path.join(at, 'state.json')), 'первый запуск не пишет до реального изменения');
  s.state.profiles.push(normalizeProfile({ id: 1, nick: 'Первый' })!);
  s.state.nextId = 2;
  s.markDirty();
  s.close();
  const again = store(at);
  again.load();
  assert.equal(again.state.profiles.length, 1);
  assert.equal(again.state.profiles[0].id, 1);
  again.close();
});

test('S3 повреждённый primary без копий останавливает запуск, сохраняет оригинал и блокирует пустую запись/повторный запуск', () => {
  const at = dir();
  const primary = path.join(at, 'state.json');
  writeFileSync(primary, BAD);
  const logs: string[] = [];
  const s = store(at, logs);
  assert.throws(() => s.load(), LOAD_ERROR);
  cannotWriteAfterFailedLoad(s);
  assert.equal(readFileSync(primary, 'utf8'), BAD);
  assert.ok(!logs.join('\n').includes('PRIVATE'), 'ошибка JSON не раскрывает содержимое записи');
  assert.throws(() => store(at).load(), LOAD_ERROR);
  assert.equal(readFileSync(primary, 'utf8'), BAD);
});

test('S3 все копии повреждены: нет пустой базы и оригинал/копии не перезаписываются', () => {
  const at = dir();
  const primary = path.join(at, 'state.json');
  mkdirSync(path.join(at, 'backups'));
  writeFileSync(primary, BAD);
  const newest = path.join(at, 'backups', 'state-2026-10-02.json');
  const older = path.join(at, 'backups', 'state-2026-10-01.json');
  writeFileSync(newest, '{broken');
  writeFileSync(older, JSON.stringify({ v: 2, profiles: [] }));
  const s = store(at);
  assert.throws(() => s.load(), LOAD_ERROR);
  cannotWriteAfterFailedLoad(s);
  assert.equal(readFileSync(primary, 'utf8'), BAD);
  assert.equal(readFileSync(newest, 'utf8'), '{broken');
  assert.deepEqual(JSON.parse(readFileSync(older, 'utf8')), { v: 2, profiles: [] });
});

test('S3 последняя копия повреждена, более старая восстановлена целиком; оператор видит дату, возраст и откат', () => {
  const at = dir();
  const fixture = validFixture(at);
  writeFileSync(fixture.primary, BAD);
  writeFileSync(path.join(at, 'backups', 'state-2026-10-02.json'), '{broken');
  const logs: string[] = [];
  const s = store(at, logs);
  s.load();
  assert.deepEqual(s.state, fixture.expected, 'баланс, альбом, одежда, версии, прогресс, счётчики и escrow из одной копии');
  assert.ok(logs.some((line) => line.includes('2026-10-01') && /возраст.*2.*дн/.test(line) && /откат/.test(line)));
  assert.ok(!logs.join('\n').includes('PRIVATE'));
  s.close();
  const again = store(at);
  again.load();
  assert.deepEqual(again.state, fixture.expected);
  again.close();
});

test('S3 отсутствующий primary с валидной копией восстанавливается, а оставшийся corrupt/temp без копии запрещает пустую базу', () => {
  const at = dir();
  const fixture = validFixture(at);
  unlinkSync(fixture.primary);
  const s = store(at);
  s.load();
  assert.deepEqual(s.state, fixture.expected);
  s.close();
  for (const name of ['state.json.corrupt-1', 'state.json.tmp']) {
    const broken = dir();
    writeFileSync(path.join(broken, name), BAD);
    const failed = store(broken);
    assert.throws(() => failed.load(), LOAD_ERROR);
    cannotWriteAfterFailedLoad(failed);
    assert.ok(!existsSync(path.join(broken, 'state.json')));
    assert.equal(readFileSync(path.join(broken, name), 'utf8'), BAD);
  }
});

test('S3 нечитабельный primary и dangling symlink не считаются первым пустым запуском', () => {
  const unreadable = dir();
  const primary = path.join(unreadable, 'state.json');
  mkdirSync(primary);
  writeFileSync(path.join(primary, 'marker'), BAD);
  const s = store(unreadable);
  assert.throws(() => s.load(), LOAD_ERROR);
  cannotWriteAfterFailedLoad(s);
  assert.equal(readFileSync(path.join(primary, 'marker'), 'utf8'), BAD);
  const dangling = dir();
  symlinkSync('missing-target.json', path.join(dangling, 'state.json'));
  const link = store(dangling);
  assert.throws(() => link.load(), LOAD_ERROR);
  cannotWriteAfterFailedLoad(link);
  assert.equal(readlinkSync(path.join(dangling, 'state.json')), 'missing-target.json');
});

test('S3 недоступный каталог копий даёт контролируемую ошибку и не создаёт рабочую пустую базу', () => {
  const at = dir();
  writeFileSync(path.join(at, 'backups'), BAD);
  const s = store(at);
  assert.throws(() => s.load(), LOAD_ERROR);
  cannotWriteAfterFailedLoad(s);
  assert.ok(!existsSync(path.join(at, 'state.json')));
  assert.equal(readFileSync(path.join(at, 'backups'), 'utf8'), BAD);
});

test('S3 ошибка атомарной записи сохраняет прежние байты и pending-состояние для явного успешного повтора', () => {
  const at = dir();
  const fixture = validFixture(at);
  const s = store(at);
  s.load();
  s.state.profiles[0].tokens += 25;
  mkdirSync(path.join(at, 'state.json.tmp'));
  s.markDirty();
  assert.throws(() => s.flush(), WRITE_ERROR);
  assert.equal(readFileSync(fixture.primary, 'utf8'), fixture.bytes);
  rmSync(path.join(at, 'state.json.tmp'), { recursive: true });
  s.flush(); // повтор без markDirty: отказ не должен поглотить ещё не сохранённое изменение
  assert.equal(JSON.parse(readFileSync(fixture.primary, 'utf8')).profiles[0].tokens, 425);
  s.close();
});
