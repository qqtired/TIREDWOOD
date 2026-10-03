import assert from 'node:assert/strict';import{test}from'node:test';
import{Storm}from'../server/lobby/storm.ts';import{LobbyEvents,eventFlag,eveningMoscow}from'../server/lobby/events.ts';
import{STORM_WARN,STORM_MAX,STORM_PERIOD,STORM_RANK,STORM_GOAL}from'../shared/storm.ts';
import{stormInput,stormPush}from'../shared/stormdyn.ts';import{makeState,makeInput,makeEvents,stepPlayer,statesEqual,BTN_FORWARD}from'../shared/sim.ts';
import{CollisionWorld}from'../shared/world.ts';import{buildLobby}from'../shared/maps/lobby.ts';
function setup(){let players=Array.from({length:4},(_,i)=>({pid:i+1,slot:i+1,nick:`P${i}`,eligible:true,state:makeState()}));let awards:Array<{pid:number,n:number,s:unknown}>=[];const s=new Storm({players:()=>players,award:(pid,n,stats)=>awards.push({pid,n,s:stats}),chat(){},broadcast(){}});return{s,players,awards};}
test('storm ranks require real proximity and membership; reward once, departed gets none',()=>{const{s,players,awards}=setup();s.start(0,'test');s.step(STORM_WARN);assert.equal(s.light(1),false);for(const p of players)Object.assign(p.state,STORM_GOAL);assert.equal(s.light(1),true);assert.equal(s.light(1),false);s.light(2);s.light(3);s.light(4);players[1].eligible=false;s.step(STORM_WARN+STORM_RANK);s.step(STORM_WARN+STORM_RANK+1);assert.deepEqual(awards.filter(a=>a.n>0).map(a=>[a.pid,a.n]),[[1,30],[3,15],[4,5]]);assert.equal(s.light(2),false);});
test('storm timeout produces no token payout',()=>{const{s,awards}=setup();s.start(0,'t');s.step(STORM_WARN);s.step(STORM_WARN+STORM_MAX);assert.equal(s.view().phase,'calm');assert.equal(awards.filter(a=>a.n>0).length,0);});
test('same pure storm input+push reproduces server prediction and leaves plaza unaffected',()=>{const{s}=setup();s.start(0,'t');s.step(STORM_WARN);const world=new CollisionWorld(buildLobby());const a=makeState(),b=makeState();Object.assign(a,{x:-19,y:0,z:28,grounded:1});Object.assign(b,a);const input=makeInput();input.buttons=BTN_FORWARD;for(let k=0;k<36;k++){const tick=STORM_WARN+STORM_PERIOD+k;for(const state of[a,b]){stepPlayer(state,stormInput(state,input,tick,s.view()),world,false,1,makeEvents());stormPush(state,world,tick,s.view());}}assert.equal(statesEqual(a,b),true);assert.ok(a.x>-17);const plaza=makeState();plaza.x=0;plaza.z=10;assert.equal(stormPush(plaza,world,STORM_WARN+STORM_PERIOD,s.view()),false);assert.equal(plaza.x,0);});
test('director respects evening, humans, rain, mutual exclusion and durable gap',()=>{const{s}=setup();let now=Date.UTC(2026,9,3,15),rain=false,humans=3,saved:any;const d=new LobbyEvents({storm:s,now:()=>now,random:()=>0,humans:()=>humans,rain:()=>rain,save:m=>saved=m});assert.ok(eveningMoscow(now));humans=2;assert.equal(d.canStart('storm'),false);humans=3;rain=true;assert.equal(d.canStart('storm'),false);rain=false;d.step(0);assert.ok(d.busy);assert.ok(saved.lockUntil>now);const next=new LobbyEvents({storm:setup().s,now:()=>now,humans:()=>3,rain:()=>false,save(){},meta:saved});assert.equal(next.canStart('pirates'),false);now=Date.UTC(2026,9,4,12);assert.equal(next.canStart('storm'),false);assert.equal(eventFlag(undefined,false),false);assert.equal(eventFlag(undefined,true),true);assert.equal(eventFlag('0',true),false);});

test('dev requests queue after10s and preserve mutual exclusion/rain; normal per-event cooldowns apply',()=>{
 let now=Date.UTC(2026,9,3,15),rain=true;const calls:string[]=[];const make=(kind:string)=>({active:false,start(){this.active=true;calls.push(kind);},step(){}});
 const a=make('storm'),b=make('pirates');const d=new LobbyEvents({storm:a,pirates:b,now:()=>now,humans:()=>0,rain:()=>rain,save(){},devStorm:true,devPirates:true,random:()=>1});
 d.step(599);assert.equal(calls.length,0);d.step(600);assert.equal(calls.length,0);rain=false;d.step(601);assert.deepEqual(calls,['storm']);d.step(602);assert.equal(calls.length,1);a.active=false;d.step(603);assert.deepEqual(calls,['storm','pirates']);
 const normal=new LobbyEvents({now:()=>now,humans:()=>3,rain:()=>false,save(){},meta:{stormAt:now-119*60000,piratesAt:now-179*60000,endedAt:0}});assert.equal(normal.canStart('storm'),false);assert.equal(normal.canStart('pirates'),false);now+=61000;assert.equal(normal.canStart('storm'),true);assert.equal(normal.canStart('pirates'),true);
});
test('storm never lights from wrong height or spectator and ends pushes immediately after first light',()=>{
 const{s,players}=setup();s.start(0,'guard');s.step(STORM_WARN);Object.assign(players[0].state,STORM_GOAL,{y:4});assert.equal(s.light(1),false);players[0].state.y=0;players[0].eligible=false;assert.equal(s.light(1),false);players[0].eligible=true;assert.equal(s.light(1),true);
 const p=makeState();Object.assign(p,{x:-19,z:28,y:0});assert.equal(stormPush(p,new CollisionWorld(buildLobby()),STORM_WARN+STORM_PERIOD,s.view()),false);
});

test('Predictor masked-input hook preserves original buffer and replays storm push exactly',async()=>{
 const{Predictor}=await import('../client/predict.ts');const{s}=setup();s.start(0,'replay');s.step(STORM_WARN);const view=s.view(),world=new CollisionWorld(buildLobby());
 const predictor=new Predictor(world,{before:(state,input)=>stormInput(state,input,input.viewTick,view),after:(state,input)=>{stormPush(state,world,input.viewTick,view);}});
 const initial=makeState();Object.assign(initial,{x:-19,y:0,z:28,grounded:1});predictor.reset(initial,0);
 let ack=makeState();const inputs=[];for(let seq=1;seq<=44;seq++){const input=makeInput();Object.assign(input,{seq,buttons:BTN_FORWARD,viewTick:STORM_WARN+STORM_PERIOD+seq-6});inputs.push({...input});predictor.step(input,false);assert.equal(input.buttons,BTN_FORWARD);if(seq===15)Object.assign(ack,predictor.state);}
 ack.x-=.15;const expected={...ack};for(const input of inputs.slice(15)){stepPlayer(expected,stormInput(expected,input,input.viewTick,view),world,false,0,makeEvents());stormPush(expected,world,input.viewTick,view);}
 predictor.reconcile(15,ack);assert.equal(statesEqual(predictor.state,expected),true);
});
