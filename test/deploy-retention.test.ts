import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test, type TestContext } from 'node:test';
import { Store, normalizeProfile } from '../server/store.ts';
import { mskDay } from '../shared/economy.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
function fixture(t: TestContext) {
  const dir = mkdtempSync(path.join(tmpdir(), 'opus-release-retention-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = new Store(dir, { log: () => {} }); store.load();
  const p = normalizeProfile({ id: 8, nick: 'SyntheticKeep', tokens: 4321, owned: ['h:fisher'], album: { goby: [240, 19] } })!;
  p.fishingResetVersion = 0; p.levelsVersion = 0; p.fishing = { xp: 9800, questsDone: 7, questCaught: 5, rod: 3, beerUntil: 12345 , aleUntil: 0, bagTier: 0, lure: 0, bag: [], bagSeq: 0 };
  p.stats.fsCaught = 19; store.state.profiles = [p]; store.state.nextId = 9; store.markDirty(); store.flush(); store.close();
  return { dir, file: path.join(dir, 'state.json') };
}
function run(...args: string[]) { return spawnSync(process.execPath, [path.join(root,'deploy/retention-check.mjs'), ...args], { encoding: 'utf8' }); }
test('release rehearsal preserves protected fields and applies authorized fishing reset exactly once', t => {
  const { dir, file } = fixture(t), bytes = readFileSync(file), work = path.join(dir,'rehearsal');
  const r = run('prepare',root,file,work); assert.equal(r.status,0,r.stderr+r.stdout);
  assert.deepEqual(readFileSync(file),bytes); const report = JSON.parse(r.stdout); assert.equal(report.authorizedFishingResets,1);
  const expected = path.join(work,'expected-state.json'), state = JSON.parse(readFileSync(expected,'utf8')), p = state.profiles[0];
  assert.equal(p.tokens,4321); assert.deepEqual(p.album,{goby:[240,19]}); assert.equal(p.stats.fsCaught,19); assert.equal(p.fishing.beerUntil,12345); assert.equal(p.fishing.xp,0); assert.equal(p.fishing.rod,0);
  p.fishing.xp = 55; p.fishing.questsDone=1; writeFileSync(expected,JSON.stringify(state));
  const again=run('prepare',root,expected,path.join(dir,'repeat')); assert.equal(again.status,0,again.stdout+again.stderr); assert.equal(JSON.parse(again.stdout).authorizedFishingResets,0);
});
test('release guard rejects lost collection/owned/counters without printing profile data', t => {
  const {dir,file}=fixture(t),work=path.join(dir,'rehearsal');assert.equal(run('prepare',root,file,work).status,0);
  const expected=path.join(work,'expected-state.json'),state=JSON.parse(readFileSync(expected,'utf8'));
  state.profiles[0].album={};state.profiles[0].owned=[];state.profiles[0].stats.fsCaught=0;writeFileSync(file,JSON.stringify(state));
  const r=run('compare',expected,file);assert.equal(r.status,1);assert.match(r.stdout,/album-record/);assert.match(r.stdout,/owned-item/);assert.match(r.stdout,/statistic/);assert.ok(!r.stdout.includes('SyntheticKeep'));
});
test('malformed checkpoint fails without rewriting source or exposing its contents', t => {
  const {dir,file}=fixture(t);writeFileSync(file,'{"private-marker":"do-not-print"');
  const r=run('prepare',root,file,path.join(dir,'rehearsal'));assert.equal(r.status,1);assert.ok(!r.stderr.includes('do-not-print'));assert.equal(readFileSync(file,'utf8'),'{"private-marker":"do-not-print"');
});
test('closed rehearsal readback rejects auth loss and a still-nonnegative reduced balance', t => {
  const {dir,file}=fixture(t),work=path.join(dir,'rehearsal');assert.equal(run('prepare',root,file,work).status,0);
  const expected=path.join(work,'expected-state.json'),state=JSON.parse(readFileSync(expected,'utf8'));
  state.profiles[0].keyHashes=['synthetic-key-hash'];writeFileSync(expected,JSON.stringify(state));
  writeFileSync(file,JSON.stringify(state));assert.equal(run('readback',expected,file).status,0);
  state.profiles[0].keyHashes=[];state.profiles[0].tokens=0;writeFileSync(file,JSON.stringify(state));
  const r=run('readback',expected,file);assert.equal(r.status,1);assert.match(r.stdout,/readback-protected-profile-field/);assert.ok(!r.stdout.includes('synthetic-key-hash'));
});
test('closed rehearsal accepts only actual MSK daily podium rollover, never missing podium or arbitrary day', t => {
  const {dir,file}=fixture(t),work=path.join(dir,'rehearsal');assert.equal(run('prepare',root,file,work).status,0);
  const expected=path.join(work,'expected-state.json'),state=JSON.parse(readFileSync(expected,'utf8'));
  state.fishPodium={day:mskDay(Date.now()-86400000),catches:[]};writeFileSync(expected,JSON.stringify(state));
  delete state.fishPodium;writeFileSync(file,JSON.stringify(state));assert.equal(run('readback',expected,file).status,1);
  state.fishPodium={day:'2099-01-01',catches:[]};writeFileSync(file,JSON.stringify(state));assert.equal(run('readback',expected,file).status,1);
  state.fishPodium={day:mskDay(Date.now()),catches:[]};writeFileSync(file,JSON.stringify(state));assert.equal(run('readback',expected,file).status,0);
});
