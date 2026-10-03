// Release-only data guard. Run on the server; never print profiles, auth material or raw JSON.
// prepare <candidate root> <checkpoint.json> <new private rehearsal dir>
// compare <expected.json> <live.json>
// readback <expected.json> <closed-rehearsal.json>: no real players, exact protected fields.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as equal } from 'node:util';
import { pathToFileURL } from 'node:url';
import { mskDay } from '../shared/economy.ts';

const [mode, a, b, work] = process.argv.slice(2);
const failures = new Set();
let checks = 0, resets = 0;
const check = (ok, label) => { checks++; if (!ok) failures.add(label); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => { const bytes = fs.readFileSync(file); const state = JSON.parse(bytes); if (state?.v !== 1 || !Array.isArray(state.profiles)) throw Error('shape'); return { state, hash: hash(bytes) }; };
const allProfiles = state => new Map(state.profiles.map(p => [p.id, p]));
function preserve(before, after, strict, resetVersion = 0, levelsVersion = 0) {
  const map = allProfiles(after);
  check(map.size === after.profiles.length, 'duplicate-profile');
  check(strict ? before.profiles.length === after.profiles.length : before.profiles.length <= after.profiles.length, 'profile-count');
  for (const p of before.profiles) {
    const q = map.get(p.id); check(!!q, 'missing-profile'); if (!q) continue;
    for (const [id, record] of Object.entries(p.album ?? {})) {
      const got = q.album?.[id];
      check(!!got && (strict ? equal(got, record) : got[0] >= record[0] && got[1] >= record[1]), 'album-record');
    }
    for (const item of p.owned ?? []) check(q.owned?.includes(item), 'owned-item');
    for (const [key, value] of Object.entries(p.stats ?? {})) {
      if (!strict && ['fsDayFish','fsDayGrams'].includes(key) && q.stats.fsDay !== p.stats.fsDay) continue;
      // Personal best times improve downward; comparisons after public access allow ordinary gameplay.
      if (!strict && ['rcBestLap','aqBest','skBestMs'].includes(key)) { check(Number.isFinite(q.stats[key]) && q.stats[key] >= 0 && (!value || q.stats[key] > 0 && q.stats[key] <= value), 'best-time'); continue; }
      check(strict && key !== 'fsMaxGrams' ? equal(q.stats?.[key], value) : Number.isFinite(q.stats?.[key]) && q.stats[key] >= value, 'statistic');
    }
    if (strict) {
      for (const [key, value] of Object.entries(p)) {
        if (['stats','fishing','xp','level','levelsVersion','fishingResetVersion'].includes(key)) continue;
        check(equal(q[key], value), 'protected-profile-field');
      }
      if ((p.fishingResetVersion ?? 0) < resetVersion) {
        resets++;
        check(q.fishing.xp === 0 && q.fishing.questsDone === 0 && q.fishing.questCaught === 0 && q.fishing.rod === 0, 'authorized-fishing-reset');
        check(q.fishing.beerUntil === (p.fishing?.beerUntil ?? 0), 'fishing-consumable');
      } else check(equal(q.fishing, p.fishing), 'repeat-fishing-reset');
      check(q.fishingResetVersion === resetVersion, 'fishing-reset-marker');
      check(q.levelsVersion === levelsVersion, 'levels-marker');
      if ((p.levelsVersion ?? 0) >= levelsVersion) check(q.xp === p.xp && q.level === p.level, 'general-progression');
    } else {
      check(q.fishingResetVersion >= p.fishingResetVersion, 'lost-fishing-marker');
      check(q.levelsVersion >= p.levelsVersion && q.xp >= p.xp && q.level >= p.level, 'lost-general-progression');
      check(q.fishing?.xp >= p.fishing.xp && q.fishing.questsDone >= p.fishing.questsDone, 'lost-fishing-progression');
      // Counter/rod may be reset by a legitimate quest claim/equipment choice; levels and albums may not.
      check(Number.isSafeInteger(q.tokens) && q.tokens >= 0, 'invalid-balance');
    }
  }
  if (strict) for (const [key, value] of Object.entries(before)) {
    if (key === 'profiles') continue;
    check(equal(after[key], value), 'protected-global-field');
  }
  else {
    check(after.nextId >= before.nextId && after.respects >= before.respects, 'global-counters');
    if (before.fishPodium?.day === after.fishPodium?.day) {
      check(after.fishPodium.catches.length >= Math.min(before.fishPodium.catches.length, 5), 'daily-podium-count');
    }
  }
}

try {
  if (mode === 'prepare') {
    if (!a || !b || !work || fs.existsSync(work)) throw Error('arguments');
    const before = read(b);
    const { Store } = await import(pathToFileURL(path.join(a, 'server/store.ts')).href);
    const { FISHING_RESET_VERSION, LEVELS_VERSION } = await import(pathToFileURL(path.join(a, 'shared/levels.ts')).href);
    fs.mkdirSync(work, { mode: 0o700 });
    fs.copyFileSync(b, path.join(work, 'state.json')); fs.chmodSync(path.join(work, 'state.json'), 0o600);
    const store = new Store(work, { log: () => {}, keepBackups: 9999 }); store.load();
    preserve(before.state, store.state, true, FISHING_RESET_VERSION, LEVELS_VERSION);
    if (!failures.size) {
      store.markDirty(); store.flush(); store.close();
      const normalized = read(path.join(work, 'state.json'));
      const again = new Store(work, { log: () => {}, keepBackups: 9999 }); again.load();
      check(equal(again.state, normalized.state), 'non-idempotent-reload'); again.close();
      check(read(b).hash === before.hash, 'checkpoint-mutated');
      if (!failures.size) fs.writeFileSync(path.join(work, 'expected-state.json'), fs.readFileSync(path.join(work, 'state.json')), { mode: 0o600 });
    } else store.close();
    console.log(JSON.stringify({ mode, ok: !failures.size, profiles: before.state.profiles.length, albumEntries: before.state.profiles.reduce((n,p) => n + Object.keys(p.album ?? {}).length,0), ownedItems: before.state.profiles.reduce((n,p) => n + (p.owned?.length ?? 0),0), authorizedFishingResets: resets, checks, beforeSha256: before.hash, failures: [...failures] }));
  } else if (mode === 'readback') {
    const before = read(a), after = read(b), map = allProfiles(after.state);
    check(before.state.profiles.length === after.state.profiles.length && map.size === after.state.profiles.length, 'profile-count');
    for (const p of before.state.profiles) {
      const q = map.get(p.id); check(!!q, 'missing-profile'); if (!q) continue;
      for (const [key,value] of Object.entries(p)) {
        if (['foolUntil','epUntil'].includes(key) && value <= Date.now() && q[key] === 0) continue;
        check(equal(q[key],value), 'readback-protected-profile-field');
      }
    }
    for (const [key,value] of Object.entries(before.state)) {
      if (key === 'profiles' || key === 'lobbyEvents') continue;
      if (key === 'fishPodium' && value.day !== after.state.fishPodium?.day) {
        const day=mskDay(Date.now()), actual=after.state.fishPodium;
        check(value.day < day && actual?.day === day && Array.isArray(actual.catches) && actual.catches.length === 0, 'readback-podium-day');
        continue;
      }
      check(equal(after.state[key],value), 'readback-protected-global-field');
    }
    console.log(JSON.stringify({mode,ok:!failures.size,profiles:before.state.profiles.length,checks,beforeSha256:before.hash,afterSha256:after.hash,failures:[...failures]}));
  } else if (mode === 'compare') {
    const before = read(a), after = read(b); preserve(before.state, after.state, false);
    console.log(JSON.stringify({ mode, ok: !failures.size, beforeProfiles: before.state.profiles.length, afterProfiles: after.state.profiles.length, checks, beforeSha256: before.hash, afterSha256: after.hash, failures: [...failures] }));
  } else throw Error('arguments');
  if (failures.size) process.exitCode = 1;
} catch {
  console.error(JSON.stringify({ mode, ok: false, error: 'release-data-validation-failed', checks, failures: [...failures] })); process.exitCode = 1;
}
