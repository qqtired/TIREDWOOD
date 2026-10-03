// Local release rehearsal only. Every Store gets a fresh synthetic directory under /tmp.
// Run with Node24: /opt/homebrew/bin/node tools/release/migration-rehearsal.ts
// Preserves all runtime directories; prints only compact synthetic evidence, never reads project data/.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, emptyStats, type State } from '../../server/store.ts';
import { mskDay } from '../../shared/economy.ts';
import { emptyFishProgress, fishCastMods } from '../../shared/fishprogress.ts';
import { FISH } from '../../shared/fishing.ts';
import { COLLECTION } from '../../shared/fishrules.ts';
import { Store as LegacyStore, emptyStats as legacyEmptyStats, normalizeProfile as legacyNormalize, type State as LegacyState } from '../../../backups/release-6-source-baseline/game-opus/server/store.ts';
import { FISH as LEGACY_FISH } from '../../../backups/release-6-source-baseline/game-opus/shared/fishing.ts';

const NOW = Date.UTC(2026, 9, 3, 12);
const project = fileURLToPath(new URL('../../', import.meta.url));
const baseline = path.resolve(project, '../backups/release-6-source-baseline/game-opus');
const root = mkdtempSync('/tmp/opus-migration-rehearsal-');
const checks: string[] = [];
const options = { now: () => NOW, log: () => {}, saveDelayMs: 60_000, keepBackups: 99 };
const legacyStatsKeys = Object.keys(legacyEmptyStats());
const newStatsKeys = Object.keys(emptyStats()).filter((k) => !legacyStatsKeys.includes(k));
const legacySpecies = new Set(LEGACY_FISH.map((f) => f.id));
const addedSpecies = COLLECTION.filter((sp) => !legacySpecies.has(FISH[sp].id));

function fresh(name: string): string {
  const dir = path.join(root, name);
  mkdirSync(dir);
  return dir;
}
function equal(label: string, actual: unknown, expected: unknown): void {
  assert.deepEqual(actual, expected, label);
  checks.push(label);
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function digest(file: string): string { return createHash('sha256').update(readFileSync(file)).digest('hex'); }
function file(dir: string): string { return path.join(dir, 'state.json'); }
function persist(store: Store | LegacyStore): void { store.markDirty(); store.flush(); store.close(); }
function reload(dir: string, now = NOW): Store { const store = new Store(dir, { ...options, now: () => now }); store.load(); return store; }
function statsView(stats: object): Record<string, unknown> {
  const raw = stats as Record<string, unknown>;
  return Object.fromEntries(newStatsKeys.map((k) => [k, raw[k]]));
}

equal('candidate collection has32 species', COLLECTION.length, 32);
equal('two appended event species', addedSpecies.length, 2);
equal('five added statistic keys', newStatsKeys.toSorted(), ['fsBites', 'fsCasts', 'fsEarned', 'fsLost', 'fsMaxGrams']);
const [marlin, shark] = addedSpecies;
const eventWeight = (sp: number) => Math.round((FISH[sp].g[0] + FISH[sp].g[1]) / 2);
const whiteShark = FISH.findIndex((f) => f.id === 'whiteshark');

// Create the original file with the actual preserved release-6 Store, not the candidate normalizer.
const originalDir = fresh('original-release6');
const original = new LegacyStore(originalDir, options);
original.load();
const oldStats = legacyEmptyStats();
for (const [i, key] of Object.keys(oldStats).entries()) (oldStats as unknown as Record<string, number>)[key] = (i + 1) * 3;
Object.assign(oldStats, { rcBestLap: 73_123, aqBest: 45_321, fsCaught: 21, fsSold: 7, fsFish: 18, fsGrams: 412_345 });
const first = legacyNormalize({
  id: 41, nick: 'SyntheticMigrationA', keyHashes: [], createdAt: NOW - 30 * 86400_000, lastSeen: NOW - 3600_000,
  tokens: 4321, owned: ['p:stripes', 'h:fisher', 'a:mustache'],
  outfit: { c: 5, c2: 15, p: 'stripes', e: 'sleepy', h: 'fisher', a: 'mustache' }, daily: '2026-10-02', stats: oldStats,
  foolUntil: NOW + 100_000, epUntil: NOW + 200_000,
  album: { goby: [211, 9], scad: [400, 5], mullet: [1200, 2], goldfish: [300, 1], whiteshark: [700_000, 1] },
});
const second = legacyNormalize({ id: 42, nick: 'SyntheticMigrationB', tokens: 27 });
assert.ok(first && second);
original.state.profiles = [first, second];
original.state.nextId = 43;
original.state.jackpot = 1250.25;
original.state.lastJackpot = { nick: first.nick, win: 180, at: NOW - 86400_000 };
original.state.respects = 9;
original.state.aqua = [{ pid: first.id, nick: first.nick, ms: 45_321, at: NOW - 3600_000 }];
persist(original);
const originalState = clone(original.state);
const originalRaw = JSON.parse(readFileSync(file(originalDir), 'utf8')) as Record<string, unknown>;
equal('original release6 save has no candidate podium', 'fishPodium' in originalRaw, false);
equal('original release6 save has no candidate progress', 'fishing' in originalState.profiles[0], false);
const oldProfileKeys = Object.keys(first);
const oldGlobalKeys = Object.keys(originalState).filter((k) => k !== 'profiles');

function legacyProjection(state: LegacyState | State): unknown {
  const raw = state as unknown as Record<string, unknown>;
  return {
    globals: Object.fromEntries(oldGlobalKeys.map((k) => [k, raw[k]])),
    profiles: state.profiles.map((p) => {
      const record = p as unknown as Record<string, unknown>;
      const projected = Object.fromEntries(oldProfileKeys.map((k) => [k, record[k]]));
      projected.stats = Object.fromEntries(legacyStatsKeys.map((k) => [k, (p.stats as unknown as Record<string, unknown>)[k]]));
      projected.album = Object.fromEntries(Object.entries(p.album).filter(([id]) => legacySpecies.has(id)));
      return projected;
    }),
  };
}

// Forward load proves missing fields have safe defaults, then persist meaningful new values on that schema.
const candidateDir = fresh('candidate-live');
copyFileSync(file(originalDir), file(candidateDir));
const candidate = reload(candidateDir);
equal('forward load preserves every old profile/global/stat/album field', legacyProjection(candidate.state), legacyProjection(originalState));
const forwardDefaults = candidate.state.profiles.map((p) => ({ id: p.id, fishing: clone(p.fishing), newStats: statsView(p.stats) }));
for (const p of candidate.state.profiles) {
  equal(`profile${p.id} progress defaults`, p.fishing, emptyFishProgress());
  equal(`profile${p.id} unknown counters default0`, [p.stats.fsCasts, p.stats.fsBites, p.stats.fsLost, p.stats.fsEarned], [0, 0, 0, 0]);
}
equal('historical maximum reconstructed from actual fish album', candidate.state.profiles[0].stats.fsMaxGrams, 700_000);
equal('no invented historical podium records', candidate.state.fishPodium, { day: '', catches: [] });
const a = candidate.state.profiles[0], b = candidate.state.profiles[1];
a.fishing = { xp: 7800, questsDone: 10, questCaught: 17, rod: 3, beerUntil: NOW + 600_000 };
b.fishing = { xp: 380, questsDone: 1, questCaught: 8, rod: 1, beerUntil: 0 };
Object.assign(a.stats, { fsCasts: 137, fsBites: 124, fsLost: 17, fsMaxGrams: Math.floor(FISH[shark].g[1] * .9), fsEarned: 987 });
Object.assign(b.stats, { fsCasts: 7, fsBites: 6, fsLost: 1, fsMaxGrams: 400, fsEarned: 71 });
a.album[FISH[marlin].id] = [eventWeight(marlin), 1];
a.album[FISH[shark].id] = [eventWeight(shark), 2];
candidate.state.fishPodium = { day: mskDay(NOW), catches: [
  { pid: a.id, nick: a.nick, sp: shark, g: eventWeight(shark), at: NOW - 3000 },
  { pid: a.id, nick: a.nick, sp: whiteShark, g: 700_000, at: NOW - 2000 },
  { pid: a.id, nick: a.nick, sp: marlin, g: eventWeight(marlin), at: NOW - 1000 },
] };
const checkpoint = clone(candidate.state);
persist(candidate);
const candidateAgain = reload(candidateDir);
equal('candidate save reload exactly preserves complete checkpoint state', candidateAgain.state, checkpoint);
equal('candidate checkpoint still preserves all original known fields', legacyProjection(candidateAgain.state), legacyProjection(originalState));
equal('saved beer is active at synthetic checkpoint time', fishCastMods(candidateAgain.state.profiles[0].fishing, NOW).incomeScale, 1.1);
candidateAgain.close();
const candidateDailyBackup = path.join(candidateDir, 'backups', `state-${mskDay(NOW)}.json`);
equal('candidate daily backup matches checkpoint bytes', digest(candidateDailyBackup), digest(file(candidateDir)));
const backupDir = fresh('candidate-backup-copy');
copyFileSync(candidateDailyBackup, file(backupDir));
equal('retained backup copy exactly matches candidate', digest(file(backupDir)), digest(file(candidateDir)));

// Run the original release-6 module's actual whitelist parser and serializer on the full candidate checkpoint.
const downgradeDir = fresh('code-only-release6');
copyFileSync(file(backupDir), file(downgradeDir));
const downgraded = new LegacyStore(downgradeDir, options);
downgraded.load();
equal('release6 accepts candidate v1 while preserving all old data', legacyProjection(downgraded.state), legacyProjection(checkpoint));
persist(downgraded);
const downgradeRaw = JSON.parse(readFileSync(file(downgradeDir), 'utf8')) as { profiles: Array<Record<string, unknown>>; fishPodium?: unknown };
equal('old serializer removes candidate podium entirely', 'fishPodium' in downgradeRaw, false);
for (const p of downgradeRaw.profiles) {
  equal(`old serializer removes profile${p.id} fishing object`, 'fishing' in p, false);
  const rawStats = p.stats as Record<string, unknown>;
  equal(`old serializer removes profile${p.id} five new stats`, newStatsKeys.filter((k) => k in rawStats), []);
}
const lostAlbums = addedSpecies.map((sp) => ({ id: FISH[sp].id, before: checkpoint.profiles[0].album[FISH[sp].id] }));
equal('old serializer removes both candidate-only album records', Object.keys(downgraded.state.profiles[0].album).filter((id) => !legacySpecies.has(id)), []);
const reupgradeDir = fresh('candidate-after-old-save');
copyFileSync(file(downgradeDir), file(reupgradeDir));
const reupgraded = reload(reupgradeDir);
equal('reupgrade retains original tokens/outfit/album/stats', legacyProjection(reupgraded.state), legacyProjection(originalState));
for (const p of reupgraded.state.profiles) equal(`reupgrade resets profile${p.id} progress`, p.fishing, emptyFishProgress());
equal('reupgrade resets unknown activity/reward counters', reupgraded.state.profiles.map((p) => [p.stats.fsCasts, p.stats.fsBites, p.stats.fsLost, p.stats.fsEarned]), [[0, 0, 0, 0], [0, 0, 0, 0]]);
equal('reupgrade reconstructs only surviving album maximum', reupgraded.state.profiles.map((p) => p.stats.fsMaxGrams), [700_000, 0]);
equal('reupgrade has no historical individual podium catches', reupgraded.state.fishPodium, { day: '', catches: [] });
const codeOnlyLoss = checkpoint.profiles.map((p, i) => ({
  id: p.id, beforeProgress: p.fishing, afterProgress: reupgraded.state.profiles[i].fishing,
  beforeNewStats: statsView(p.stats), afterNewStats: statsView(reupgraded.state.profiles[i].stats),
}));
persist(reupgraded);

// Demonstrate that exact snapshot restoration necessarily discards valid later activity.
const later = reload(candidateDir, NOW + 60_000);
const live = later.state.profiles[0];
live.tokens += 19;
live.fishing.xp += 250;
live.fishing.questCaught++;
live.stats.fsCasts++;
live.stats.fsBites++;
live.stats.fsEarned += 19;
live.stats.fsCaught++;
live.stats.fsFish++;
const laterWeight = Math.floor(FISH[shark].g[1] * .93);
live.stats.fsGrams += laterWeight;
live.stats.fsMaxGrams = Math.max(live.stats.fsMaxGrams, laterWeight);
live.album[FISH[shark].id] = [laterWeight, live.album[FISH[shark].id][1] + 1];
later.state.respects++;
later.state.fishPodium.catches = [{ pid: live.id, nick: live.nick, sp: shark, g: laterWeight, at: NOW + 60_000 }, ...later.state.fishPodium.catches].slice(0, 3);
persist(later);
const latest = reload(candidateDir, NOW + 60_000);
const latestState = clone(latest.state);
latest.close();
equal('daily backup stays first checkpoint when same-day activity follows', digest(candidateDailyBackup), digest(file(backupDir)));
assert.notEqual(digest(file(candidateDir)), digest(file(backupDir)), 'live state really differs from retained checkpoint');
checks.push('later activity creates a distinct current state');
const restoredDir = fresh('restored-candidate');
copyFileSync(file(backupDir), file(restoredDir));
equal('restore copies exact backup bytes into fresh directory', digest(file(restoredDir)), digest(file(backupDir)));
const restored = reload(restoredDir, NOW + 60_000);
equal('restored candidate is exactly full checkpoint, including progress beer podium new albums stats', restored.state, checkpoint);
equal('restore preserves absolute beer expiry rather than restarting duration', [restored.state.profiles[0].fishing.beerUntil - (NOW + 60_000), fishCastMods(restored.state.profiles[0].fishing, NOW + 60_000).incomeScale], [540_000, 1.1]);
persist(restored);
equal('restored candidate serializer keeps exact checkpoint bytes', digest(file(restoredDir)), digest(file(backupDir)));
const restoreAgain = reload(restoredDir, NOW + 60_000);
equal('restored candidate survives another reload exactly', restoreAgain.state, checkpoint);
restoreAgain.close();
const postBackupLoss = [
  { field: 'tokens', checkpoint: checkpoint.profiles[0].tokens, later: latestState.profiles[0].tokens, discarded: 19 },
  { field: 'fishing.xp', checkpoint: checkpoint.profiles[0].fishing.xp, later: latestState.profiles[0].fishing.xp, discarded: 250 },
  { field: 'fishing.questCaught', checkpoint: checkpoint.profiles[0].fishing.questCaught, later: latestState.profiles[0].fishing.questCaught, discarded: 1 },
  { field: 'stats.fsEarned', checkpoint: checkpoint.profiles[0].stats.fsEarned, later: latestState.profiles[0].stats.fsEarned, discarded: 19 },
  { field: 'stats', changedCounters: Object.fromEntries(Object.keys(emptyStats()).filter((key) => (checkpoint.profiles[0].stats as unknown as Record<string, number>)[key] !== (latestState.profiles[0].stats as unknown as Record<string, number>)[key]).map((key) => {
    const before = (checkpoint.profiles[0].stats as unknown as Record<string, number>)[key], after = (latestState.profiles[0].stats as unknown as Record<string, number>)[key];
    return [key, { checkpoint: before, later: after, discarded: after - before }];
  })) },
  { field: `album.${FISH[shark].id}`, checkpoint: checkpoint.profiles[0].album[FISH[shark].id], later: latestState.profiles[0].album[FISH[shark].id], discardedCatches: 1 },
  { field: 'fishPodium', checkpointCatches: checkpoint.fishPodium.catches.length, laterNewestGrams: laterWeight, discardedNewestCatches: 1 },
  { field: 'respects', checkpoint: checkpoint.respects, later: latestState.respects, discarded: 1 },
];

const sourceFiles = ['server/store.ts', 'shared/economy.ts', 'shared/fishprogress.ts', 'shared/fishing.ts', 'shared/fishrules.ts', 'shared/outfit.ts', 'shared/aqua.ts'];
const evidence = {
  schema: 'game-opus-migration-rehearsal.v1', runAt: new Date().toISOString(), node: process.version, syntheticTime: new Date(NOW).toISOString(),
  scope: { syntheticOnly: true, root, temporaryDirectoriesRetained: true, productionDataRead: false },
  sources: {
    candidate: Object.fromEntries(sourceFiles.map((f) => [f, digest(path.join(project, f))])),
    original: Object.fromEntries(sourceFiles.filter((f) => f !== 'shared/fishprogress.ts').map((f) => [f, digest(path.join(baseline, f))])),
  },
  forward: {
    schemaBefore: 1, schemaAfter: 1, legacyDataExactlyPreserved: true, profiles: 2, legacyProfileFields: oldProfileKeys.length, legacyStatisticKeys: legacyStatsKeys.length,
    originalTokens: originalState.profiles.map((p) => p.tokens), defaults: forwardDefaults, newFieldsExactlyPersisted: true,
    savedProgressAndStats: checkpoint.profiles.map((p) => ({ id: p.id, fishing: p.fishing, newStats: statsView(p.stats) })),
    appendedSpecies: addedSpecies.map((sp) => ({ id: FISH[sp].id, sp })), podiumCatches: checkpoint.fishPodium.catches.length,
  },
  codeOnlyRollback: {
    release6LoadSaveAcceptedV1: true, legacyDataExactlyPreserved: true,
    dropped: { progressObjects: 2, progressScalarFields: 10, newStatisticFields: newStatsKeys.length * 2, newAlbumRecords: lostAlbums, individualPodiumCatches: checkpoint.fishPodium.catches.length },
    restoredDefaults: codeOnlyLoss, newStatisticsKeysRemovedByOldSerializer: newStatsKeys,
    reconstructedMaximumGrams: reupgraded.state.profiles.map((p) => p.stats.fsMaxGrams), podiumAfterReupgrade: reupgraded.state.fishPodium,
  },
  backupRestore: {
    backupOrigin: candidateDailyBackup, backupCopy: file(backupDir), sha256: digest(file(backupDir)),
    wholeStateExactlyRecovered: true, fileBytesExactlyRecovered: true, afterSaveReloadExactlyRecovered: true,
    beerRemainingMsAtRestore: 540_000, absoluteBeerExpiryPreserved: true,
    sameDayDailyBackupIsFirstSave: true, discardedPostBackupActivity: postBackupLoss,
  },
  assertions: { passed: checks.length, labels: checks },
  artifacts: { original: file(originalDir), candidateLatest: file(candidateDir), release6Resave: file(downgradeDir), reupgraded: file(reupgradeDir), restored: file(restoredDir) },
};
const evidencePath = path.join(root, 'evidence.json');
writeFileSync(evidencePath, JSON.stringify(evidence) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ status: 'passed', assertions: checks.length, root, evidencePath, profiles: 2, legacyStatisticKeys: legacyStatsKeys.length, newStatisticKeys: newStatsKeys, newSpecies: addedSpecies.map((sp) => FISH[sp].id), candidateRestoreExactlyEqual: true }));
