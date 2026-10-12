import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

const dirs: string[] = [];
after(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });
const helper = new URL('../deploy/check-record-rollback.ts', import.meta.url).pathname;
const marker = new URL('../deploy/course-records.compat', import.meta.url);
const oldState = () => ({ v: 1, profiles: [{ id: 1, nick: 'RollbackFixture', tokens: 731, stats: { aqBest: 45000, skBest: 121000 } }],
  aquaCourse: 2, aqua: [], regattaCourse: 'harbor-v1', regatta: [] });

function fixture(state: unknown, compatible = false) {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-release-rollback-'));
  dirs.push(dir);
  const previous = path.join(dir, 'previous');
  const data = path.join(dir, 'data');
  mkdirSync(path.join(previous, 'deploy'), { recursive: true });
  mkdirSync(data);
  const file = path.join(data, 'state.json');
  if (state !== undefined) writeFileSync(file, typeof state === 'string' ? state : JSON.stringify(state));
  if (compatible) copyFileSync(marker, path.join(previous, 'deploy/course-records.compat'));
  const before = state === undefined ? undefined : readFileSync(file, 'utf8');
  const run = () => {
    const result = spawnSync(process.execPath, [helper, previous, data], { encoding: 'utf8', timeout: 5000 });
    if (before !== undefined) assert.equal(readFileSync(file, 'utf8'), before, 'guard не меняет ни байта прогресса');
    return result;
  };
  return { previous, run };
}

test('rollback guard: прежние данные разрешают старый код без marker', () => {
  const result = fixture(oldState()).run();
  assert.equal(result.status, 0, result.stderr);
});

test('rollback guard: каждое новое поле архива блокирует старый код', () => {
  for (const field of ['aquaArchive', 'regattaArchive', 'skillCourse', 'aquaBests', 'skillRecords']) {
    const state = oldState();
    if (field === 'aquaBests' || field === 'skillRecords') Object.assign(state.profiles[0], { [field]: {} });
    else Object.assign(state, { [field]: field === 'skillCourse' ? 'cloud-tower-185-v2' : {} });
    const result = fixture(state).run();
    assert.equal(result.status, 1, field);
    assert.match(result.stderr, /нужен совместимый код\/данные/);
    assert.ok(!result.stderr.includes('RollbackFixture'));
  }
});

test('rollback guard: marker совместимого Store разрешает откат с новыми архивами', () => {
  const result = fixture({ ...oldState(), aquaArchive: { '2': [{ pid: 1, nick: 'RollbackFixture', ms: 45000, at: 1 }] },
    regattaArchive: {}, skillCourse: 'cloud-tower-185-v2' }, true).run();
  assert.equal(result.status, 0, result.stderr);
});

test('rollback guard: неизвестный marker, повреждённые и отсутствующие данные запрещают автоматический запуск', () => {
  const f = fixture({ ...oldState(), aquaArchive: {} });
  writeFileSync(path.join(f.previous, 'deploy/course-records.compat'), 'unknown-format');
  assert.equal(f.run().status, 1);
  for (const raw of [undefined, '{broken', { v: 2, profiles: [] }, { v: 1, profiles: null }]) {
    const result = fixture(raw, true).run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /нужен совместимый код\/данные/);
  }
});
