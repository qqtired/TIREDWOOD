import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync,rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { TICK_RATE } from '../shared/constants.ts';
import { FISH } from '../shared/fishing.ts';
import { Weather } from '../server/lobby/weather.ts';
import { FishBoard } from '../server/lobby/fishtop.ts';
import { Store } from '../server/store.ts';
import { Profiles } from '../server/profiles.ts';

test('natural and drum rain share shortened duration of 4m48 to8m',()=>{
  for(const r of [0,0.5,0.999999]){
    const natural=new Weather(()=>r,'auto',0,()=>1000);const began=natural.until;natural.step(began);
    const forced=new Weather(()=>r,'clear',0,()=>1000);forced.startRain(began);
    assert.equal(natural.until,forced.until);assert.ok(natural.until-began>=288*TICK_RATE);assert.ok(natural.until-began<480*TICK_RATE);
  }
});
test('daily podium retains five individual catches across atomic reload, not five people',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'opus-podium5-'));const now=Date.UTC(2026,9,3,12);const store=new Store(dir,{log:()=>{},now:()=>now});store.load();
  try{
    const ps=new Profiles(store);const r=ps.login({key:'five-podium-key-001',nick:'Рыбак'},'');assert.ok(r.ok);
    const board=new FishBoard(store,()=>now),sp=FISH.findIndex(f=>f.id==='goby');
    for(const grams of [100,500,300,700,600,200])board.record(r.profile,sp,grams);
    assert.deepEqual(board.top.podium.map(c=>c.g),[700,600,500,300,200]);store.flush();
    const again=new Store(dir,{log:()=>{}});again.load();assert.deepEqual(new FishBoard(again,()=>now).top.podium.map(c=>c.g),[700,600,500,300,200]);again.close();
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
