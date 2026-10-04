import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { BAND, COLLECTION, RULE, ZONE_BASE, biteShare, effectiveRareMultiplier, reelStyleFor, tierRank } from '../shared/fishrules.ts';
import { emptyFishProgress, fishCastMods, fishCatchXp, FISH_XP_LEVELS, levelOdds, rodOdds, type FishRod } from '../shared/fishprogress.ts';
import { reelStart, reelStep, reelRun, REEL_PATTERNS, REEL_GAIN, type ReelStyle } from '../shared/fishreel.ts';
import { EXPERT, TYPICAL, reelStats } from './fishbot.ts';
const baseline = JSON.parse(readFileSync(new URL('../docs/expansion-2026-10-03/fishing-baseline/baseline.json', import.meta.url),'utf8'));

test('XP is 0.4 of frozen released XP (fisheco: +20 %), including perfect and legendary multiplication',()=>{
 for(const row of baseline.rows) for(const perfect of [false,true]) assert.equal(fishCatchXp(row.sp,perfect),Math.max(1,Math.round((perfect?row.perfectXp:row.xp)*.4)),row.id);
});
// 04.10: уровень — +2,5 % за каждый от базы (линейно: ур. 10 — ×1,25), а не ×1,025 за уровень сложно
test('rare probability compounds level and exactly one rod, withdrawing common residual',()=>{
 const mods=fishCastMods({...emptyFishProgress(),xp:380,questsDone:10,rod:2},0);
 assert.equal(levelOdds(2),1.05);
 assert.equal(levelOdds(10),1.25);
 assert.equal(mods.rareMultiplier,levelOdds(2)*rodOdds(2));
 assert.equal(rodOdds(2),1.1);
 for(const sp of COLLECTION.filter(sp=>RULE[sp]!.tier>=1&&!RULE[sp]!.rain&&RULE[sp]!.zone==='pier')) assert.ok(Math.abs(biteShare(sp,false,mods)/biteShare(sp,false)-mods.rareMultiplier)<1e-12);
});
test('all 52 fish have distinct pattern pairs using all fifteen executable behaviors as main pattern (04.10: Jet — only the kalmar)',()=>{
 const styles=COLLECTION.map(sp=>RULE[sp]!.style as any);
 assert.equal(COLLECTION.length,52);
 assert.equal(new Set(styles.map(s=>s.mainPattern)).size,REEL_PATTERNS.length);
 assert.equal(REEL_PATTERNS.length,15);
 assert.equal(REEL_PATTERNS[14],'Jet','новый паттерн — в конец, номера прежних не сдвинуты');
 assert.deepEqual(COLLECTION.filter(sp=>(RULE[sp]!.style as any).mainPattern==='Jet').map(sp=>RULE[sp]!.id),['kalmar']);
 assert.equal(new Set(styles.map(s=>s.mainPattern+':'+s.secondaryPattern)).size,52);
 assert.ok(styles.every(s=>s.mainPattern!==s.secondaryPattern));
});
test('every fish motion replays exactly from toggles with integer state',()=>{
 for(const sp of COLLECTION) for(const seed of [19,761,100003]){
  const a=reelStart(RULE[sp]!.style,seed),b=reelStart(RULE[sp]!.style,seed);
  const toggles=[0,23,67,109,131,187,219,277,300,373,417,490];
  for(let t=0;t<550;t++) reelStep(a,toggles.filter(v=>v<=t).length%2===1);
  let k=0;for(let t=0;t<=600;t+=30) k=reelRun(b,toggles,Math.min(550,t),k);
  assert.deepEqual(a,b);
  for(const [key,value] of Object.entries(a)) if(typeof value==='number') assert.ok(Number.isInteger(value),key);
 }
});

test('each named pattern executes its characteristic target trajectory', () => {
 const targets: Record<string, number[]> = {};
 for (const pattern of REEL_PATTERNS) {
  const style: ReelStyle = { ...RULE[COLLECTION[0]]!.style, mainPattern: pattern, secondaryPattern: pattern, patternPeriod: 200, patternAmplitude: 30 };
  const r = reelStart(style, 73);
  Object.assign(r, { patternTick: 0, patternCycle: 1, patternLength: 200, patternAnchor: 50000, patternDir: 1, patternTarget: 50000, f: 50000 });
  const trace: number[] = [];
  for (let i = 0; i < 200; i++) {
   // Isolate movement from the outcome of an unattended reel.
   r.done = 0; r.p = 10000; reelStep(r, false); trace.push(r.ft);
  }
  targets[pattern] = trace;
 }
 assert.equal(new Set(Object.values(targets).map(t => JSON.stringify(t))).size, 15);
 assert.equal(targets.Dash[39], 50000); assert.equal(targets.Dash[40], 80000);
 assert.equal(targets.FakeDash[0], 65000); assert.equal(targets.FakeDash[70], 20000);
 assert.ok(targets.Sawtooth[65] > targets.Sawtooth[67]);
 assert.equal(targets.HoverDash[109], 50000); assert.equal(targets.HoverDash[110], 80000);
 assert.ok(targets.SlowMigration.every((v, i, a) => i === 0 || v > a[i - 1]));
 assert.equal(targets.EdgeSnapback[0], 100000); assert.equal(targets.EdgeSnapback[120], 50000);
 assert.equal(targets.DoubleDash[29], 50000); assert.equal(targets.DoubleDash[30], 65000); assert.equal(targets.DoubleDash[120], 80000);
 assert.equal(targets.Wave[50], 80000); assert.equal(targets.Wave[150], 20000);
 assert.ok(new Set(targets.Nervous).size > 10);
 assert.equal(targets.Ambush[143], 50000); assert.equal(targets.Ambush[144], 80000);
 // fisheco: «Свечка» — выше обычного размаха, потом ниже исходной глубины; «Уход на глубину» — ко дну и долгое
 // покачивание там; «Круги» — размах растёт; «Зигзаг» — короткие броски то вверх, то вниз
 assert.equal(targets.Breach[0], 95000); assert.equal(targets.Breach[76], 40000); assert.equal(targets.Breach[150], 50000);
 assert.equal(targets.Sound[0], 4000); assert.ok(targets.Sound.slice(52, 150).every(v => v >= 4000 && v < 12000)); assert.equal(targets.Sound[152], 50000);
 const swing = (a: number[]) => Math.max(...a.map(v => Math.abs(v - 50000)));
 assert.ok(swing(targets.Circle.slice(100)) > swing(targets.Circle.slice(0, 50)) * 1.5);
 assert.deepEqual([targets.Zigzag[0], targets.Zigzag[43], targets.Zigzag[70], targets.Zigzag[100]], [65000, 35000, 65000, 35000]);
 assert.equal(new Set(targets.Zigzag).size, 2);
 // 04.10: «Реактивный рывок» кальмара — набирает воду (чуть вниз), выстрел дальше обычного рывка, скольжение,
 // чернильный обман ниже исходной глубины — и дрожит там
 assert.deepEqual([targets.Jet[0], targets.Jet[31], targets.Jet[32], targets.Jet[59], targets.Jet[60], targets.Jet[100]], [44000, 44000, 87500, 87500, 80000, 35000]);
 assert.ok(targets.Jet[32] > Math.max(...targets.Dash), 'выстрел дальше рывка');
 assert.ok(targets.Jet.slice(124).every(v => Math.abs(v - 35000) <= 5000));
});

// 04.10: потолок сверху вниз — старшие категории получают свой множитель целиком, срезается только нижняя оставшаяся
test('all legal probability combinations sum to one with transparent top-down saturation and unchanged absent event fish', () => {
 for (const rain of [false, true]) for (let level = 0; level <= 10; level++) for (const rod of [0, 1, 2, 3, 4] as FishRod[]) for (const beer of [false, true]) {
  const mods = fishCastMods({ ...emptyFishProgress(), xp: FISH_XP_LEVELS[level], questsDone: 15, rod, beerUntil: beer ? 1000 : 0 }, 0);
  assert.ok(Math.abs(mods.rareMultiplier - (1 + .025 * level) * (1 + .05 * rod) * (beer ? 1.2 : 1)) < 1e-12);
  const shares = COLLECTION.map(sp => biteShare(sp, rain, mods));
  assert.ok(shares.every(p => p >= 0 && p <= 1));
  assert.ok(Math.abs(shares.reduce((a,b)=>a+b,0)-1)<1e-12);
  // внутри категории виды делят её долю по весам, как без бонусов: множитель у всех видов категории один
  const k = new Map<number, number>();
  for (const sp of COLLECTION) {
   if ((RULE[sp]!.rain && !rain) || biteShare(sp, rain) === 0) { assert.equal(biteShare(sp, rain, mods), 0); continue; }
   const rank = tierRank(RULE[sp]!.tier), x = biteShare(sp, rain, mods) / biteShare(sp, rain);
   if (k.has(rank)) assert.ok(Math.abs(k.get(rank)! - x) < 1e-9, `${RULE[sp]!.id}`); else k.set(rank, x);
  }
  // сверху вниз: полный множитель (уровень × удочка × пиво), пока есть место; ниже первой срезанной — ничего, обычных нет
  let cut = false;
  for (let rank = 5; rank >= 1; rank--) {
   const x = k.get(rank)!;
   if (cut) assert.ok(x < 1e-12, `ранг ${rank} под потолком`);
   else if (Math.abs(x - mods.rareMultiplier) > 1e-9) { cut = true; assert.ok(x < mods.rareMultiplier); }
  }
  if (cut) assert.ok(COLLECTION.filter(sp=>RULE[sp]!.tier===0).every(sp=>biteShare(sp,rain,mods)<1e-12), 'потолок — обычных нет');
  assert.ok(Math.abs(effectiveRareMultiplier(rain, mods) - k.get(1)!) < 1e-9);
 }
 const baseTwoPercent = .02;
 assert.ok(Math.abs(baseTwoPercent * fishCastMods({...emptyFishProgress(),xp:100},0).rareMultiplier - .0205) < 1e-12);
});

test('fill gain unchanged, zone per rarity tier (fisheco), frozen XP difficulty kept; progression remains useful', () => {
 assert.equal(REEL_GAIN, 100);
 for (const sp of COLLECTION) assert.equal(RULE[sp]!.style.zone, BAND[tierRank(RULE[sp]!.tier)].zone * ZONE_BASE, `${sp}: зона — по категории, −10 % с 03.10`);
 for (const old of baseline.rows) assert.equal(RULE[old.sp]!.xpDifficulty,old.difficulty,old.id);
 for (const sp of COLLECTION) {
  const zone = RULE[sp]!.zone;
  const start = fishCastMods({ ...emptyFishProgress(), xp: zone === 'barkas' ? 770 : 0 }, 0, zone);
  const best = fishCastMods({ ...emptyFishProgress(), xp:15000, questsDone:15, rod:4, lure:4 },0, zone);
  const plain=reelStats(reelStyleFor(sp,start),TYPICAL,300,401+sp*1259);
  const boosted=reelStats(reelStyleFor(sp,best),TYPICAL,300,401+sp*1259);
  // время на рыбу — у опытного: он подматывает заранее. «Обычный» с огромной зоной у донных (мерлуза, треска, морской
  // петух, камбала) ленится: зона лежит на рыбе, и через 0,7 с леска провисает (04.10: лежащая зона рыбу не тянет)
  const plainPro=reelStats(reelStyleFor(sp,start),EXPERT,300,401+sp*1259);
  const boostedPro=reelStats(reelStyleFor(sp,best),EXPERT,300,401+sp*1259);
  assert.ok(boostedPro.costTicks <= plainPro.costTicks + 3,`${sp}: прогресс ускоряет`);
  assert.ok(boosted.costTicks < plain.costTicks * 1.5,`${sp}: и «обычному» не в разы дольше`);
  // модель игрока шумит на ±2 п.: успех не падает больше чем на 3 п.
  assert.ok(boosted.p >= plain.p - .03,`${sp}: прогресс не ухудшает`);
 }
});

test('pattern bursts preserve legacy mode2 used by the reel HUD feedback', () => {
 const style: ReelStyle={...RULE[COLLECTION[0]]!.style,mainPattern:'Dash',secondaryPattern:'Dash',patternAmplitude:30};
 const r=reelStart(style,73);
 Object.assign(r,{patternTick:0,patternCycle:1,patternLength:200,patternAnchor:50000,patternDir:1,f:50000});
 reelStep(r,false); assert.equal(r.mode,1,'wind-up is a hover');
 Object.assign(r,{patternTick:40,done:0,p:10000});
 reelStep(r,false); assert.equal(r.mode,2,'burst must trigger the existing HUD dart effect');
});
