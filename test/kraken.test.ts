import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOAT_RIDE_TICKS, BP_DOCK, BP_RIDE, ridePose } from '../shared/boat.ts';
import { TICK_RATE } from '../shared/constants.ts';
import { KrakenCue, krakenFrame, KRAKEN_START, KRAKEN_END, KRAKEN_CUE } from '../client/lobby/krakentiming.ts';
const boat={ph:BP_RIDE,at:1000,n:2,nick:'Капитан'};

test('kraken encounter spans only six seconds near half of actual boat route',()=>{
  assert.equal(krakenFrame(boat.at+KRAKEN_START-1,boat),null);
  assert.equal(krakenFrame(boat.at+KRAKEN_END,boat),null);
  assert.equal(krakenFrame(boat.at+BOAT_RIDE_TICKS/2,{...boat,ph:BP_DOCK}),null);
  const middle=krakenFrame(boat.at+BOAT_RIDE_TICKS/2,boat)!;
  assert.ok(middle.emerge>.9);assert.equal(KRAKEN_END-KRAKEN_START,6*TICK_RATE);
  assert.ok(Math.abs((KRAKEN_START+KRAKEN_END)/2-BOAT_RIDE_TICKS/2)<1);
});
test('static offshore anchor clears moving hull throughout encounter',()=>{
  const middle=krakenFrame(boat.at+BOAT_RIDE_TICKS/2,boat)!;
  for(let t=KRAKEN_START;t<KRAKEN_END;t+=3){
    const frame=krakenFrame(boat.at+t,boat)!;const pose=ridePose(t);
    assert.equal(frame.x,middle.x);assert.equal(frame.z,middle.z);
    assert.ok(Math.hypot(frame.x-pose.x,frame.z-pose.z)>9,'tentacles remain outside hull and passenger camera');
  }
});
test('cue fires once per trip when crossing early emergence while nearby',()=>{
  const cue=new KrakenCue();assert.equal(cue.update(boat.at+KRAKEN_CUE-2,boat,true),false);
  assert.equal(cue.update(boat.at+KRAKEN_CUE,boat,true),true);
  assert.equal(cue.update(boat.at+KRAKEN_CUE+1,boat,true),false);
  assert.equal(cue.update(boat.at+KRAKEN_CUE-1,boat,true),false);
  assert.equal(cue.update(boat.at+KRAKEN_CUE+1,boat,true),false);
  const next={...boat,at:9000};assert.equal(cue.update(next.at+KRAKEN_CUE-1,next,true),false);
  assert.equal(cue.update(next.at+KRAKEN_CUE,next,true),true);
});
test('late join, far observer, tab gap and dock never play catch-up scare',()=>{
  assert.equal(new KrakenCue().update(boat.at+KRAKEN_CUE+1,boat,true),false);
  const far=new KrakenCue();far.update(boat.at+KRAKEN_CUE-1,boat,false);
  assert.equal(far.update(boat.at+KRAKEN_CUE,boat,false),false);
  assert.equal(far.update(boat.at+KRAKEN_CUE+2,boat,true),false);
  const gap=new KrakenCue();gap.update(boat.at+KRAKEN_CUE-120,boat,true);
  assert.equal(gap.update(boat.at+KRAKEN_CUE+1,boat,true),false);
  const dock=new KrakenCue();assert.equal(dock.update(boat.at+KRAKEN_CUE,{...boat,ph:BP_DOCK},true),false);
});
