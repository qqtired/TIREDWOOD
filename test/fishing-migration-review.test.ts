import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AQUA_COURSE } from '../shared/aqua.ts';
import { TICK_RATE } from '../shared/constants.ts';
import { mskDay } from '../shared/economy.ts';
import { FISH } from '../shared/fishing.ts';
import { mskDayNum } from '../shared/fishrules.ts';
import { emptyFishProgress, fishCatchXp, normalizeFishProgress } from '../shared/fishprogress.ts';
import { LEVELS_VERSION, FISHING_RESET_VERSION, levelFromXp } from '../shared/levels.ts';
import { Store, normalizeProfile, type Profile } from '../server/store.ts';
import { Profiles } from '../server/profiles.ts';
import { buildFishTop } from '../server/lobby/fishtop.ts';
import { Weather } from '../server/lobby/weather.ts';
const old = () => JSON.parse(readFileSync(new URL('./fixtures/profile-before-progression.json', import.meta.url), 'utf8'));

// Review regression: one migration must not infer the other has (or has not) already run.
test('review: general XP backfill and fishing wipe have independent migration markers', () => {
  for (const generalCurrent of [false, true]) for (const fishCurrent of [false, true]) {
    const raw = old();
    if (generalCurrent) { raw.levelsVersion = LEVELS_VERSION; raw.xp = 2345; raw.level = levelFromXp(2345); }
    if (fishCurrent) raw.fishingResetVersion = FISHING_RESET_VERSION;
    const untouched = JSON.stringify(raw);
    const p = normalizeProfile(raw)!;
    assert.equal(p.xp, generalCurrent ? 2345 : 870);
    assert.equal(p.level, levelFromXp(p.xp));
    // старое сохранение без рюкзака и блесны получает пустой рюкзак (fisheco), прочее — как было
    assert.deepEqual(p.fishing, fishCurrent ? normalizeFishProgress(raw.fishing) : { ...emptyFishProgress(), beerUntil:raw.fishing.beerUntil });
    assert.equal(JSON.stringify(raw), untouched, 'read normalization must not mutate the input');
    assert.deepEqual(normalizeProfile(JSON.parse(JSON.stringify(p))), p, 'idempotent including marker combinations');
  }
});

test('review: real legacy disk load retains albums, every historical stat, money, wardrobe and both boards', () => {
  const now = Date.UTC(2026,9,3,12), dir = mkdtempSync(path.join(tmpdir(),'opus-fish-review-'));
  const raw = old(); raw.blackjackEscrow = null;
  raw.stats.fsDay = mskDayNum(now);
  raw.album = Object.fromEntries(FISH.map((f,i) => [f.id, [f.g[0], i+1]]));
  raw.stats.fsMaxGrams = Math.max(raw.stats.fsMaxGrams, ...FISH.map(f=>f.g[0]));
  const catches = ['goby','hamsa','scad','swordfish','bluemarlin'].map((id,i)=>({pid:raw.id,nick:raw.nick,sp:FISH.findIndex(f=>f.id===id),g:500-i*50,at:now-i}));
  const boardBefore = buildFishTop([raw as Profile], now, catches);
  const aqua = [{pid:raw.id,nick:raw.nick,ms:54321,at:now-1000}];
  const state = {v:1,nextId:18,jackpot:500,lastJackpot:null,respects:42,aquaCourse:AQUA_COURSE,aqua,fishPodium:{day:mskDay(now),catches},profiles:[raw]};
  const store = new Store(dir,{now:()=>now,log:()=>{}});
  try {
    writeFileSync(path.join(dir,'state.json'),JSON.stringify(state));
    store.load(); const profiles = new Profiles(store,{now:()=>now}), p = profiles.byId(raw.id)!;
    for (const key of ['album','tokens','owned','outfit','createdAt','lastSeen','daily','foolUntil','epUntil'] as const) assert.deepEqual(p[key], raw[key], key);
    for (const [key,value] of Object.entries(raw.stats)) assert.equal(p.stats[key as keyof typeof p.stats],value,key);
    assert.deepEqual(store.state.aqua,aqua); assert.deepEqual(store.state.fishPodium,state.fishPodium);
    assert.deepEqual(buildFishTop([p],now,store.state.fishPodium.catches),boardBefore);
    assert.deepEqual(p.fishing,{...emptyFishProgress(),beerUntil:raw.fishing.beerUntil});
    const backfill = p.xp;
    p.fishing={xp:380,questsDone:5,questCaught:17,rod:2,beerUntil:raw.fishing.beerUntil,aleUntil:0,bagTier:0,lure:0,bag:[],bagSeq:0};
    profiles.credit(p,123,'mode'); p.stats.rcRaces += 1;
    store.flush(); store.close();
    const again = new Store(dir,{now:()=>now,log:()=>{}});
    try {
      again.load(); const q = again.state.profiles[0];
      assert.equal(q.xp,backfill+123,'new general XP survives and history is not backfilled twice');
      assert.deepEqual(q.fishing,p.fishing,'new fish XP, rod and quest survive a second load');
      assert.deepEqual(q.stats,p.stats); assert.deepEqual(q.album,p.album);
      assert.deepEqual(again.state.fishPodium,state.fishPodium); assert.deepEqual(again.state.aqua,aqua);
    } finally { again.close(); }
  } finally { store.close(); rmSync(dir,{recursive:true,force:true}); }
});

test('review: completed quest cannot carry an old excess into next quest or pay twice', () => {
  const dir=mkdtempSync(path.join(tmpdir(),'opus-quest-review-')), store=new Store(dir,{log:()=>{}});store.load();
  try {
    const p=normalizeProfile(old())!;p.blackjackEscrow=null;store.state.profiles.push(p);const profiles=new Profiles(store);
    const initialTokens=p.tokens, initialGeneralXp=p.xp, fishingXp=p.fishing.xp;
    p.fishing.questCaught=500;
    assert.deepEqual(profiles.claimFishQuest(p),{ok:true,need:5,reward:25,rod:1});
    assert.equal(p.fishing.questCaught,0);assert.equal(p.fishing.questsDone,1);
    assert.deepEqual(profiles.claimFishQuest(p),{ok:false});
    assert.equal(p.tokens,initialTokens+25);assert.equal(p.xp,initialGeneralXp+25);assert.equal(p.fishing.xp,fishingXp);
    // fisheco: опыт за рыбу ×0,4 вместо трети (+20 %)
    assert.equal(fishCatchXp(FISH.findIndex(f=>f.id==='hamsa')),7,'old frozen17 XP rounds to7 after ×0.4');
    assert.equal(fishCatchXp(FISH.findIndex(f=>f.id==='tuna'),true),162,'old perfect405 XP rounds to162 after ×0.4');
  } finally { store.close();rmSync(dir,{recursive:true,force:true}); }
});

test('review: natural rain and drum use identical shortened wall-clock expiry without extension', () => {
  for (const random of [0,.25,.5,.999999]) {
    let now=1000;const natural=new Weather(()=>random,'auto',0,()=>now);
    const start=natural.until;now+=start*1000/TICK_RATE;natural.step(start);
    const drum=new Weather(()=>random,'clear',start,()=>now);assert.equal(drum.startRain(start),true);
    const expected=288*TICK_RATE+Math.floor(random*(480-288)*TICK_RATE);
    assert.equal(natural.until-start,expected);assert.equal(drum.until,natural.until);assert.equal(drum.eventUntil,natural.eventUntil);
    const expiry=drum.eventUntil;assert.equal(drum.startRain(start+10),false);assert.equal(drum.eventUntil,expiry);
    now=expiry-1;assert.equal(natural.step(start),false);assert.equal(drum.step(start),false);
    now=expiry;assert.equal(natural.step(start),true);assert.equal(drum.step(start),true);assert.equal(drum.eventUntil,0);
  }
});
