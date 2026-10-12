import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FortGame } from '../server/fort/game.ts';
import { FortMatch } from '../client/fort/match.ts';
import { FORT_SNAP_EVERY, FT_BREAK, FT_GATHER, FT_WAVE, READY_TICKS, Z_WALKER } from '../shared/fort.ts';
import { buildFort } from '../shared/fortmap.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import type { ClientMsg, ServerMsg } from '../shared/messages.ts';

function fixture(phase=FT_GATHER) {
  const g=new FortGame({siege:true}),messages:ServerMsg[]=[];
  const sink={sendJson(m:ServerMsg){messages.push(m)},sendBinary(){},close(){}};
  const add=(pid:number)=>g.addHuman({pid,nick:`Ready${pid}`,outfit:DEFAULT_OUTFIT},sink)!;
  const a=add(1),b=add(2),bell=g.map.stations.find(s=>s.kind==='bell')!;
  g.phase=phase;g.phaseEnd=g.tick+1500;
  Object.assign(a.state,{x:bell.x,y:bell.y,z:bell.z});
  Object.assign(b.state,{x:9,y:3.4,z:-14.5});
  return {g,a,b,bell,add,messages};
}

test('remote readiness requires a physical first bell, then repeated E is idempotent in gather and break',()=>{
  for(const phase of [FT_GATHER,FT_BREAK]){
    const {g,a,b,bell,messages}=fixture(phase),end=g.phaseEnd;
    g.use(b,bell.id);assert.equal(b.ready,false);assert.equal(g.phaseEnd,end);
    g.use(a,bell.id);assert.equal(a.ready,true);assert.equal(b.ready,false);
    g.use(b,bell.id);assert.equal(b.ready,true);assert.equal(g.phaseEnd,g.tick+READY_TICKS);
    const phases=messages.filter(m=>m.t==='fphase').length,deadline=g.phaseEnd;
    g.use(a,bell.id);g.use(b,bell.id);
    assert.equal(a.ready,true);assert.equal(b.ready,true);assert.equal(g.phaseEnd,deadline);
    assert.equal(messages.filter(m=>m.t==='fphase').length,phases,'repeated E does not toggle or restart readiness');
    assert.equal(g.rallyUntil,0,'calm readiness cannot activate the combat shield');
  }
});

test('invitation survives the initiator leaving and is replayed to a late player with nobody ready',()=>{
  const {g,a,b,bell,add,messages}=fixture(FT_BREAK);
  g.use(a,bell.id);g.removePlayer(a.id);
  messages.length=0;const c=add(3);
  assert.ok(messages.some(m=>m.t==='fev'&&m.e.some(e=>e[0]==='bell'&&e[1]===0)));
  assert.equal(b.ready,false);assert.equal(c.ready,false);
  Object.assign(c.state,{x:-9,y:3.4,z:-14.5});
  g.use(b,bell.id);g.use(c,bell.id);
  assert.equal(b.ready,true);assert.equal(c.ready,true);assert.equal(g.phaseEnd,g.tick+READY_TICKS);
});

test('leaving an unready player releases the ready team; the next wave and new game reset the invitation',()=>{
  const {g,a,b,bell,messages}=fixture();
  g.use(a,bell.id);g.removePlayer(b.id);
  assert.equal(g.phaseEnd,g.tick+READY_TICKS);
  g.phaseEnd=g.tick+1;g.step();assert.equal(g.phase,FT_WAVE);assert.equal(a.ready,false);
  g.horde.clear();g.step();assert.equal(g.phase,FT_BREAK);
  Object.assign(a.state,{x:9,y:3.4,z:-14.5});g.use(a,bell.id);assert.equal(a.ready,false);
  g.newGame();Object.assign(a.state,{x:9,y:3.4,z:-14.5});g.use(a,bell.id);assert.equal(a.ready,false);
  messages.length=0;g.addHuman({pid:9,nick:'LateReady',outfit:DEFAULT_OUTFIT},{sendJson(m){messages.push(m)},sendBinary(){},close(){}});
  assert.ok(!messages.some(m=>m.t==='fev'&&m.e.some(e=>e[0]==='bell'&&e[1]===0)));
});

test('combat bell remains a physical interaction and rejects a remote use',()=>{
  const {g,a,b,bell}=fixture();g.use(a,bell.id);
  g.phase=FT_WAVE;g.use(b,bell.id);assert.equal(g.rallyUntil,0);
  g.use(a,bell.id);assert.ok(g.rallyUntil>g.tick);
});

test('a queued combat bell cannot arrive after the victory phase and open false remote readiness',()=>{
  const {g,a,b,bell,messages}=fixture();
  g.phaseEnd=g.tick+1;g.step();assert.equal(g.phase,FT_WAVE);
  g.horde.clear();const last=g.horde.spawn(Z_WALKER,1)!;
  messages.length=0;
  g.use(a,bell.id);assert.ok(g.rallyUntil>g.tick,'real combat shield activation is queued');
  g.horde.damage(last,1e12,a.id,false,last.x,last.y,last.z);assert.equal(last.alive,false);
  for(let i=0;i<FORT_SNAP_EVERY;i++)g.step();
  assert.equal(g.phase,FT_BREAK);
  const changed=messages.findIndex(m=>m.t==='fphase'&&m.phase===FT_BREAK);
  assert.ok(changed>=0,'victory publishes the new phase before the event flush');
  const flushed=messages.slice(changed+1).flatMap(m=>m.t==='fev'?m.e:[]);
  assert.ok(flushed.some(e=>e[0]==='zdie'&&e[1]===last.id),'the real kill event is retained');
  assert.ok(!flushed.some(e=>e[0]==='bell'),'the old shield bell must not become a new readiness invitation');
  const deadline=g.phaseEnd;g.use(b,bell.id);
  assert.equal(b.ready,false);assert.equal(g.phaseEnd,deadline,'the first break still requires a physical bell');
});

function clientFixture() {
  const map=buildFort(),sent:ClientMsg[]=[],notices:unknown[]=[],sounds:number[]=[],notes:string[]=[];
  const me={id:1,ready:false},other={id:2,ready:false},stall={shown:false};
  const noop=()=>{};
  const input={blocked:false};const chat={isOpen:false,note:(s:string)=>notes.push(s)};
  const match=Object.assign(Object.create(FortMatch.prototype),{
    myId:1,ready:true,alive:true,phase:FT_GATHER,wave:0,readyStarted:false,readyNotice:null,
    roster:new Map([[1,me],[2,other]]),rosterList:[me,other],station:null,
    predictor:{state:{x:9,y:3.4,z:-14.5}},krakenFx:{onEvent:()=>false},
    ars:{use:()=>{if(stall.shown){stall.shown=false;return true}return false}},
    d:{map,input,chat,net:{send:(m:ClientMsg)=>sent.push(m)},world:{props:{ringBell:()=>sounds.push(1)}},
      sound:{bell:()=>sounds.push(2),horn:noop,zombieGroan:noop,fanfare:noop},effects:{clearSplats:noop},
      hud:{stall,endShown:false,alert:noop,hideEnd:noop,setHint:(...args:unknown[])=>notices.push(args),
        pb:{bannerMessage:noop},ui:{onPhase:noop,push:(s:unknown)=>notices.push(s),top:{clearToasts:noop},
          wave:{bellToast:(_phase:number,mode:string)=>({mode})}}}},surr:{reset:noop},
  });
  return {match,map,sent,notices,sounds,notes,me,input,chat,stall};
}

test('client remote E confirms readiness, preserves open panels, and ignores chat/menu/mouse input',()=>{
  const {match,map,sent,me,input,chat,stall}=clientFixture(),bell=map.stations.find(s=>s.kind==='bell')!;
  match.onUse(false);assert.equal(sent.length,0);
  match.onJson({t:'fev',k:1,e:[['bell',2]]});
  chat.isOpen=true;match.onUse(false);chat.isOpen=false;
  input.blocked=true;match.onUse(false);input.blocked=false;
  match.onUse(true);assert.equal(sent.length,0);
  stall.shown=true;match.onUse(false);assert.equal(stall.shown,false);assert.equal(sent.length,0);
  match.onUse(false);assert.deepEqual(sent,[{t:'use',id:bell.id}]);
  me.ready=true;match.onUse(false);assert.equal(sent.length,1,'confirmation cannot turn readiness off');
  match.phase=FT_WAVE;me.ready=false;match.onUse(false);assert.equal(sent.length,1,'combat still needs a real nearby station');
});

test('silent bell replay opens the remote hint; same-phase deadline changes preserve it and a new wave resets it',()=>{
  const {match,map,sent,notices,sounds,notes}=clientFixture();
  match.onJson({t:'fev',k:1,e:[['bell',0]]});
  assert.deepEqual(sounds,[]);assert.deepEqual(notes,[]);assert.ok(notices.some(n=>(n as {mode?:string}).mode==='invite'));
  match.updateStation();assert.ok(notices.some(n=>Array.isArray(n)&&String(n[0]).includes('готов к волне')));
  match.onJson({t:'fphase',phase:FT_GATHER,end:100,wave:0});
  match.onUse(false);assert.deepEqual(sent,[{t:'use',id:map.stations.find(s=>s.kind==='bell')!.id}]);
  match.onJson({t:'fphase',phase:FT_WAVE,end:100,wave:1});
  match.onJson({t:'fphase',phase:FT_BREAK,end:1000,wave:1});
  match.onUse(false);assert.equal(sent.length,1,'a new pause needs its own first physical bell');
});
