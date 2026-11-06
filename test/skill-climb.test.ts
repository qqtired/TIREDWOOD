// «Город вверх» (sky-climb-v1): медали и жетоны, личный подъём по флагам по порядку, отсечки, доска лучших времён,
// рекорды прежних курсов при переключении туда и обратно.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { SkillGame, type SkillPlayer } from '../server/skilltest/game.ts';
import { SkillRoom } from '../server/skilltest/room.ts';
import { Store, addSkillTime, emptyStats, saveSkillRecord, selectProfileCourses, skillTop } from '../server/store.ts';
import { emptyFishProgress } from '../shared/fishprogress.ts';
import { FISHING_RESET_VERSION, LEVELS_VERSION } from '../shared/levels.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import {
  SKILL_CLEAN_REWARD, SKILL_CLIMB_CLEAN_REWARD, SKILL_CLIMB_COURSE, SKILL_CLIMB_DAILY_REWARD, SKILL_CLIMB_GOLD_TICKS, SKILL_CLIMB_MEDAL_REWARD,
  SKILL_CLIMB_SILVER_TICKS, SKILL_COURSE, SKILL_DAILY_REWARD, SKILL_MEDAL_REWARD, SKILL_TOP, applySkillFinish, skillMedal, skillMs,
  type SkillServerMsg, type SkillTopRow,
} from '../shared/skilltest.ts';

const LEGACY = 'sky-tower-v1', TOWER = 'cloud-tower-185-v2', CLIMB = 'sky-climb-v1';
const MIN = 60 * 60;

test('city climb medals: gold to 10:00, silver to 16:00; rewards 60/120/200 once per tier, clean 100, daily 40', () => {
  assert.equal(SKILL_CLIMB_COURSE, CLIMB);
  assert.equal(SKILL_CLIMB_GOLD_TICKS, 10 * MIN); assert.equal(SKILL_CLIMB_SILVER_TICKS, 16 * MIN);
  assert.equal(skillMedal(10 * MIN, CLIMB), 3); assert.equal(skillMedal(10 * MIN + 1, CLIMB), 2);
  assert.equal(skillMedal(16 * MIN, CLIMB), 2); assert.equal(skillMedal(16 * MIN + 1, CLIMB), 1);
  assert.deepEqual([...SKILL_CLIMB_MEDAL_REWARD], [0, 60, 120, 200]);
  const s = emptyStats();
  // первый подъём: долго, с падениями — бронза и подъём дня
  let r = applySkillFinish(s, 22 * MIN, 9, 20400, CLIMB);
  assert.deepEqual([r.medal, r.tokens, r.daily, r.clean], [1, 60 + SKILL_CLIMB_DAILY_REWARD, true, false]);
  // в тот же день серебро без падений: только ступень серебра и «без падений»
  r = applySkillFinish(s, 15 * MIN, 0, 20400, CLIMB);
  assert.deepEqual([r.medal, r.tokens, r.daily, r.clean], [2, 120 + SKILL_CLIMB_CLEAN_REWARD, false, true]);
  // назавтра золото: ступень золота и подъём дня; повтор — ничего
  r = applySkillFinish(s, 9 * MIN, 1, 20401, CLIMB);
  assert.equal(r.tokens, 200 + 40);
  r = applySkillFinish(s, 8 * MIN, 0, 20401, CLIMB);
  assert.equal(r.tokens, 0); assert.equal(r.newBest, true); assert.equal(s.skBest, skillMs(8 * MIN));
  // сразу золото без падений — все ступени разом
  assert.equal(applySkillFinish(emptyStats(), 9 * MIN, 0, 20400, CLIMB).tokens, 60 + 120 + 200 + 100 + 40);
  // прежние курсы — с прежними наградами
  assert.equal(applySkillFinish(emptyStats(), 4 * MIN, 0, 20400, SKILL_COURSE).tokens,
    SKILL_MEDAL_REWARD[1] + SKILL_MEDAL_REWARD[2] + SKILL_MEDAL_REWARD[3] + SKILL_CLEAN_REWARD + SKILL_DAILY_REWARD);
  assert.equal(skillMedal(6 * MIN, SKILL_COURSE), 2);
});

type Box = { msgs: SkillServerMsg[] };
const join = (game: SkillGame, pid: number, box: Box): SkillPlayer =>
  game.addHuman({ pid, nick: `Climber${pid}`, outfit: DEFAULT_OUTFIT }, { sendJson: (m) => box.msgs.push(m) })!;
const tops = (box: Box) => box.msgs.filter((m): m is Extract<SkillServerMsg, { t: 'skill_top' }> => m.t === 'skill_top');

test('city climb run: own clock, flags only in order with split ticks, bell only after flag 27, top board to the room', () => {
  const game = new SkillGame(() => 0, CLIMB);
  let board: SkillTopRow[] = [{ pid: 9, nick: 'Earlier', ms: 500000 }];
  game.topOf = () => board;
  game.onFinish = (p, ticks, falls) => {
    board = [{ pid: p.pid, nick: p.nick, ms: skillMs(ticks) }, ...board];
    return { ticks, falls, medal: skillMedal(ticks, CLIMB), best: skillMs(ticks), newBest: true, tokens: 520, medalUp: true, clean: true, daily: true };
  };
  const boxA: Box = { msgs: [] }, boxB: Box = { msgs: [] };
  const a = join(game, 1, boxA);
  join(game, 2, boxB);
  assert.equal(game.map.checkpoints.length, 28);
  assert.equal(game.race.phase, 'none', 'no company gather: everyone climbs on their own clock');
  assert.deepEqual(tops(boxA).at(-1)?.rows, board, 'the board comes on entry');
  assert.equal(a.progress.cpAt, null);
  const st = game.map.start;
  Object.assign(a.state, { x: st.x0 + .5, y: st.y, z: st.z0 - 1, grounded: 1 });
  game.checkProgress(a, 100);
  assert.equal(a.progress.startedAt, 100);
  const at = (i: number, vt: number) => {
    const c = game.map.checkpoints[i];
    Object.assign(a.state, { x: c.px, y: c.y, z: c.pz, vx: 0, vy: 0, vz: 0, grounded: 1 });
    game.checkProgress(a, vt);
  };
  at(5, 200);
  assert.equal(a.progress.checkpoint, 0, 'a later flag cannot be taken before the earlier ones');
  const bell = game.map.bell;
  const ring = (vt: number) => {
    Object.assign(a.state, { x: (bell.x0 + bell.x1) / 2, y: bell.y0 + .2, z: (bell.z0 + bell.z1) / 2, grounded: 0 });
    game.checkProgress(a, vt);
  };
  for (let i = 1; i < 27; i++) {
    at(i, 1000 + i * 100);
    assert.equal(a.progress.checkpoint, i);
    assert.equal(a.progress.cpAt, 1000 + i * 100, `split tick of flag ${i}`);
  }
  ring(4000);
  assert.equal(a.progress.finishedAt, null, 'the bell without flag 27 is not a finish');
  at(27, 5000);
  assert.equal(a.progress.checkpoint, 27);
  // падение ниже флага на 6 м — назад к флагу, время идёт
  a.state.y = game.map.checkpoints[27].kill - .1;
  game.checkProgress(a, 5100);
  assert.equal(a.progress.falls, 1); assert.equal(a.progress.startedAt, 100); assert.equal(a.progress.checkpoint, 27);
  ring(6000);
  assert.equal(a.progress.finishedAt, 6000);
  const fin = boxA.msgs.find(m => m.t === 'skill_finish');
  assert.ok(fin && fin.t === 'skill_finish' && fin.ticks === 5900);
  assert.equal(tops(boxB).at(-1)?.rows[0].pid, 1, 'a counted finish refreshes the board for everyone in the room');
  // старые курсы доску не шлют
  const old = new SkillGame(() => 0, TOWER);
  const box: Box = { msgs: [] };
  join(old, 3, box);
  assert.equal(tops(box).length, 0);
});

test('room status carries the top board for the portal only on the city climb and only when it has rows', () => {
  const rows: SkillTopRow[] = [];
  const room = new SkillRoom({ outfitOf: () => DEFAULT_OUTFIT, course: CLIMB, top: () => rows });
  assert.equal(room.status().top, undefined);
  rows.push({ pid: 1, nick: 'Climber1', ms: 400000 });
  assert.deepEqual(room.status().top, rows);
  assert.equal(room.status().course, CLIMB);
  const tower = new SkillRoom({ outfitOf: () => DEFAULT_OUTFIT, course: TOWER, top: () => rows });
  assert.equal(tower.status().top, undefined);
});

function profile() {
  return { id: 1, nick: 'RecordFixture', keyHashes: [], createdAt: 1, lastSeen: 10, tokens: 1379,
    xp: 1234, levelsVersion: LEVELS_VERSION, fishingResetVersion: FISHING_RESET_VERSION,
    owned: ['h:panama'], outfit: { ...DEFAULT_OUTFIT }, daily: '2026-10-12', foolUntil: 0, epUntil: 0, album: {},
    fishing: { ...emptyFishProgress(), xp: 45, questsDone: 3 },
    skillRecords: { [LEGACY]: { best: 121000, medal: 3, clean: 1, day: 20000, runs: 9 }, [TOWER]: { best: 241000, medal: 2, clean: 0, day: 20001, runs: 4 } },
    stats: { ...emptyStats(), skCourse: 2, skRuns: 13, skBest: 241000, skMedal: 2, skClean: 0, skDay: 20001, aqRuns: 12, aqBest: 45000 } };
}
const archive = { [TOWER]: [{ pid: 1, nick: 'RecordFixture', ms: 241000, at: 5 }], [LEGACY]: [{ pid: 1, nick: 'RecordFixture', ms: 121000, at: 4 }] };
const courses = (skill: string) => ({ aqua: 3, regatta: 'white-cliffs-v2', skill }) as const;
const open = (dir: string, skill: string) => {
  const store = new Store(dir, { recordCourses: courses(skill) as never, log() {} });
  store.load();
  return store;
};

test('switching to the city climb keeps the 185 m tower and old course records; switching back restores them', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tiredwood-climb-records-'));
  writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ v: 1, nextId: 2, jackpot: 0, respects: 0, aquaCourse: 3, aqua: [],
    regattaCourse: 'white-cliffs-v2', regatta: [], skillCourse: TOWER, skillArchive: archive, profiles: [profile()] }));
  const climb = open(dir, CLIMB);
  let p = climb.state.profiles[0];
  assert.equal(climb.state.skillCourse, CLIMB);
  assert.equal(p.stats.skCourse, 3);
  assert.equal(p.stats.skBest, 0, 'the new course starts with no record');
  assert.deepEqual(p.skillRecords?.[TOWER], { best: 241000, medal: 2, clean: 0, day: 20001, runs: 4 });
  assert.deepEqual(p.skillRecords?.[LEGACY], { best: 121000, medal: 3, clean: 1, day: 20000, runs: 9 });
  assert.deepEqual(climb.state.skillArchive?.[TOWER], archive[TOWER]);
  // подъём на новой трассе — как в хабе
  selectProfileCourses(p, { aqua: 3, skill: CLIMB });
  const r = applySkillFinish(p.stats, 9 * MIN, 0, 20500, CLIMB);
  assert.equal(r.tokens, 520, 'tower medals do not count against the new course');
  saveSkillRecord(p, CLIMB);
  addSkillTime(climb.state, CLIMB, { pid: 1, nick: 'RecordFixture', ms: skillMs(9 * MIN), at: 9 });
  assert.equal(p.stats.skBestClimb, 540000);
  climb.markDirty(); climb.close();

  const back = open(dir, TOWER);
  p = back.state.profiles[0];
  assert.equal(p.stats.skCourse, 2);
  assert.equal(p.stats.skBest, 241000); assert.equal(p.stats.skMedal, 2);
  assert.equal(p.skillRecords?.[CLIMB].best, 540000); assert.equal(p.skillRecords?.[LEGACY].best, 121000);
  assert.deepEqual(back.state.skillArchive?.[CLIMB].map(x => x.ms), [540000]);
  assert.equal(p.tokens, 1379);
  back.markDirty(); back.close();

  const again = open(dir, CLIMB);
  p = again.state.profiles[0];
  assert.equal(p.stats.skBest, 540000); assert.equal(p.stats.skMedal, 3); assert.equal(p.stats.skClean, 1);
  assert.equal(p.skillRecords?.[TOWER].best, 241000);
  assert.deepEqual(skillTop(again.state, CLIMB), [{ pid: 1, nick: 'RecordFixture', ms: 540000 }]);
  again.close();
});

test('top board: one best row per player, newest nick, sorted, ten rows', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tiredwood-climb-top-'));
  const store = open(dir, CLIMB);
  const s = store.state;
  for (let pid = 1; pid <= 12; pid++) addSkillTime(s, CLIMB, { pid, nick: `P${pid}`, ms: 400000 + pid * 1000, at: pid });
  addSkillTime(s, CLIMB, { pid: 12, nick: 'Fast12', ms: 390000, at: 20 });
  addSkillTime(s, CLIMB, { pid: 1, nick: 'Renamed1', ms: 900000, at: 21 });
  const top = skillTop(s, CLIMB, SKILL_TOP);
  assert.equal(top.length, 10);
  assert.deepEqual(top.slice(0, 2), [{ pid: 12, nick: 'Fast12', ms: 390000 }, { pid: 1, nick: 'Renamed1', ms: 401000 }]);
  assert.ok(top.every((r, i) => i === 0 || top[i - 1].ms <= r.ms));
  assert.deepEqual(skillTop(s, TOWER), []);
  store.close();
});
