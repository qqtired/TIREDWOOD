import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { emptyFishProgress } from '../shared/fishprogress.ts';
import { FISHING_RESET_VERSION, LEVELS_VERSION } from '../shared/levels.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { Store, emptyStats, saveAquaRecord, saveSkillRecord, selectProfileCourses } from '../server/store.ts';
import { applySkillFinish } from '../shared/skilltest.ts';

const LEGACY = 'sky-tower-v1';
const TOWER = 'cloud-tower-185-v2';
const courses = { aqua: 3, regatta: 'white-cliffs-v2', skill: TOWER } as const;
const record = (pid: number, ms: number) => ({ pid, nick: `Fixture${pid}`, ms, at: 1000 + pid });
function profile() {
  return { id: 1, nick: 'RecordFixture', keyHashes: [], createdAt: 1, lastSeen: 10, tokens: 1379,
    xp: 1234, levelsVersion: LEVELS_VERSION, fishingResetVersion: FISHING_RESET_VERSION,
    owned: ['h:panama'], outfit: { ...DEFAULT_OUTFIT }, daily: '2026-10-12', foolUntil: 0, epUntil: 0, album: {},
    fishing: { ...emptyFishProgress(), xp: 45, questsDone: 3 },
    stats: { ...emptyStats(), rcRaces: 25, rcWins: 4, rcBestLap: 41000, rcBestLapFoundry: 52000,
      rcBestLapHarbor: 63100, rcBestLapHills: 72200, brRaces: 18, brWins: 2, brBestLap: 3200, brBestLapHarbor: 4300,
      aqRuns: 12, aqBest: 45000, skRuns: 9, skBest: 121000, skMedal: 3, skClean: 1, skDay: 20000,
      ftBest: 98, ftKills: 8400, dgBest: 27, fsCaught: 217 } };
}
function oldState() {
  return { v: 1, nextId: 2, jackpot: 9876, respects: 42, aquaCourse: 2, aqua: [record(1, 45000), record(2, 48000)],
    regattaCourse: 'harbor-v1', regatta: [record(1, 71667)], profiles: [profile()] };
}
function load(raw: unknown, targets = courses) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tiredwood-course-migration-'));
  writeFileSync(path.join(dir, 'state.json'), JSON.stringify(raw));
  const store = new Store(dir, { recordCourses: targets, log() {} });
  store.load();
  return { dir, store };
}

test('old fixture: old laps, personal bests, tables, balance and unrelated progress are archived before new courses open', () => {
  const raw = oldState();
  const { store } = load(raw);
  const s = store.state, p = s.profiles[0];
  assert.equal(s.aquaCourse, 3); assert.deepEqual(s.aqua, []);
  assert.deepEqual(s.aquaArchive['2'], raw.aqua);
  assert.equal(s.regattaCourse, courses.regatta); assert.deepEqual(s.regatta, []);
  assert.deepEqual(s.regattaArchive['harbor-v1'], raw.regatta);
  assert.equal(p.aquaBests?.['2'], 45000); assert.equal(p.stats.aqBest, 0);
  assert.equal(p.stats.aqBestCourse2, 45000); assert.equal(p.stats.aqRuns, 12);
  assert.deepEqual(p.skillRecords?.[LEGACY], { best: 121000, medal: 3, clean: 1, day: 20000, runs: 9 });
  assert.equal(p.stats.skBest, 0); assert.equal(p.stats.skRuns, 9); assert.equal(p.stats.skDay, 20000);
  assert.equal(p.stats.skBestLegacy, 121000);
  assert.equal(p.stats.rcBestLapHarborV3, 0); assert.equal(p.stats.rcBestLapHillsV3, 0); assert.equal(p.stats.brBestLapCliffs, 0);
  for (const field of ['rcBestLap', 'rcBestLapFoundry', 'rcBestLapHarbor', 'rcBestLapHills', 'brBestLap', 'brBestLapHarbor',
    'rcRaces', 'rcWins', 'brRaces', 'brWins', 'ftBest', 'ftKills', 'dgBest', 'fsCaught'] as const) assert.equal(p.stats[field], raw.profiles[0].stats[field]);
  assert.equal(p.tokens, 1379); assert.equal(p.xp, 1234); assert.deepEqual(p.owned, raw.profiles[0].owned);
  assert.equal(p.fishing.xp, 45); assert.equal(p.fishing.questsDone, 3); assert.equal(s.jackpot, 9876);
  store.close();
});

test('new fixture: active new-course results and existing archives survive; different course times never compete', () => {
  const raw = { ...oldState(), aquaCourse: 3, aqua: [record(1, 83000)], regattaCourse: courses.regatta, regatta: [record(1, 93000)],
    skillCourse: TOWER, aquaArchive: { '2': [record(1, 45000)], '8': [record(7, 101000)] },
    regattaArchive: { 'harbor-v1': [record(1, 71667)], 'future-course': [record(8, 41000)] },
    profiles: [{ ...profile(), aquaBests: { '2': 45000, '3': 84000, '8': 101000 },
      skillRecords: { [LEGACY]: { best: 121000, medal: 3, clean: 1, day: 20000, runs: 9 },
        [TOWER]: { best: 241000, medal: 1, clean: 0, day: 20001, runs: 2 } },
      stats: { ...profile().stats, aqBest: 83000, rcBestLapHarborV3: 114000, rcBestLapHillsV3: 125000, brBestLapCliffs: 5580,
        skBest: 240000, skMedal: 2, skClean: 0, skDay: 20001, skRuns: 11 } }] };
  const { store } = load(raw);
  const s = store.state, p = s.profiles[0];
  assert.equal(p.stats.aqBest, 83000); assert.equal(p.aquaBests?.['2'], 45000); assert.equal(p.aquaBests?.['3'], 83000);
  assert.equal(p.stats.skBest, 240000); assert.equal(p.skillRecords?.[LEGACY].best, 121000);
  assert.equal(p.stats.skMedal, 2); assert.equal(p.stats.skClean, 0); assert.equal(p.stats.skRuns, 11);
  assert.equal(p.stats.rcBestLapHarborV3, 114000); assert.equal(p.stats.rcBestLapHillsV3, 125000); assert.equal(p.stats.brBestLapCliffs, 5580);
  assert.deepEqual(s.aquaArchive['8'], raw.aquaArchive['8']);
  assert.deepEqual(s.regattaArchive['future-course'], raw.regattaArchive['future-course']);
  assert.deepEqual(s.aqua, raw.aqua); assert.deepEqual(s.regatta, raw.regatta);
  store.close();
});

test('reload fixture: migration is idempotent and 3→2→3 / new tower→old→new restores the proper records', () => {
  const { dir, store } = load(oldState());
  const p = store.state.profiles[0];
  p.stats.aqBest = 83000; p.stats.skBest = 240000; p.stats.skMedal = 1; p.stats.skClean = 0; p.stats.skDay = 20001;
  p.stats.skRuns = 10;
  p.skillRecords![TOWER] = { best: 240000, medal: 1, clean: 0, day: 20001, runs: 1 };
  store.state.aqua = [record(1, 83000)]; store.state.regatta = [record(1, 93000)];
  store.markDirty(); store.close();
  const again = new Store(dir, { recordCourses: courses, log() {} }); again.load();
  const one = structuredClone(again.state); again.markDirty(); again.close();
  const repeat = new Store(dir, { recordCourses: courses, log() {} }); repeat.load();
  assert.deepEqual(repeat.state, one); repeat.close();
  const back = new Store(dir, { recordCourses: { aqua: 2, regatta: 'harbor-v1', skill: LEGACY }, log() {} }); back.load();
  assert.equal(back.state.profiles[0].stats.aqBest, 45000);
  assert.equal(back.state.profiles[0].stats.skBest, 121000); assert.equal(back.state.profiles[0].stats.skRuns, 10);
  assert.equal(back.state.profiles[0].stats.skDay, 20001, 'switching courses must not reset the paid daily guard');
  assert.equal(back.state.regatta[0].ms, 71667);
  back.markDirty(); back.close();
  const forward = new Store(dir, { recordCourses: courses, log() {} }); forward.load();
  assert.equal(forward.state.profiles[0].stats.aqBest, 83000); assert.equal(forward.state.profiles[0].stats.skBest, 240000);
  assert.equal(forward.state.profiles[0].skillRecords?.[LEGACY].day, 20000, 'global daily guard must not rewrite the archived date of the old course');
  assert.equal(forward.state.regatta[0].ms, 93000); assert.equal(forward.state.profiles[0].stats.skRuns, 10);
  assert.equal(JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8')).profiles[0].tokens, 1379);
  forward.close();
});

test('malformed fixture: bad archive members are rejected without replacing valid older records or accepting prototype keys', () => {
  const archives = JSON.parse('{"3": "bad", "__proto__": []}');
  archives['2'] = Array.from({ length: 6 }, (_, i) => record(9 + i, 42000 + i * 1000));
  const raw = { ...oldState(), aquaArchive: archives,
    regattaArchive: { 'harbor-v1': [record(9, 65000), null, { pid: 5, nick: 'BadTime', ms: -1 }], 'future-course': [record(8, 40000)] },
    profiles: [{ ...profile(), aquaBests: { '2': 44000, '3': -10, '4': 'not a number' },
      skillRecords: { [LEGACY]: { best: 120000, medal: 2, clean: 0, day: 19999, runs: 8 }, [TOWER]: null, 'future-course': { best: 310000, medal: 1, clean: 1, day: 20001, runs: 1 } } }] };
  const { store } = load(raw);
  const s = store.state, p = s.profiles[0];
  assert.equal(p.aquaBests?.['2'], 44000);
  assert.equal(p.stats.aqBest, 0);
  assert.equal(p.skillRecords?.[LEGACY].best, 120000); assert.equal(p.skillRecords?.[LEGACY].medal, 3);
  assert.equal(p.skillRecords?.['future-course'].best, 310000);
  assert.equal(s.aquaArchive['2'].length, 8, 'archive union must not be truncated to the active five-row leaderboard');
  assert.equal(s.regattaArchive['harbor-v1'].length, 2);
  assert.equal(Object.hasOwn(s.aquaArchive, '__proto__'), false);
  assert.equal(s.profiles[0].tokens, 1379);
  store.close();
});

test('real finish helpers update the active course only and switching courses cannot repay the same daily bonus', () => {
  const { store } = load(oldState());
  const p = store.state.profiles[0];
  p.stats.aqRuns++; p.stats.aqBest = 83000; saveAquaRecord(p, 3);
  assert.equal(p.aquaBests?.['2'], 45000); assert.equal(p.aquaBests?.['3'], 83000);
  p.stats.skRuns++; p.stats.skBest = 240000; p.stats.skMedal = 1; p.stats.skClean = 0; p.stats.skDay = 20001;
  saveSkillRecord(p, TOWER);
  assert.equal(p.skillRecords?.[LEGACY].runs, 9); assert.equal(p.skillRecords?.[TOWER].runs, 1);
  selectProfileCourses(p, { aqua: 2, skill: LEGACY });
  const result = applySkillFinish(p.stats, 120 * 60, 1, 20001, LEGACY);
  assert.equal(result.daily, false); assert.equal(result.tokens, 0);
  saveSkillRecord(p, LEGACY);
  assert.equal(p.stats.skRuns, 11); assert.equal(p.skillRecords?.[LEGACY].runs, 10); assert.equal(p.skillRecords?.[TOWER].runs, 1);
  selectProfileCourses(p, courses);
  assert.equal(p.stats.skBest, 240000); assert.equal(p.stats.skBestLegacy, 120000);
  assert.equal(p.stats.aqBest, 83000); assert.equal(p.stats.aqBestCourse2, 45000);
  store.close();
});
