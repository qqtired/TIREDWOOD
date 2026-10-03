import assert from'node:assert/strict';import{test}from'node:test';
import{Pirates}from'../server/lobby/pirates.ts';import{buildLobby}from'../shared/maps/lobby.ts';import{CollisionWorld}from'../shared/world.ts';import{makeState,makeInput}from'../shared/sim.ts';
import{PIRATE_WARN,PIRATE_CHEST,pirateCount,pirateReward,emptyPirateTail}from'../shared/pirates.ts';import{pirateTailSize,writePirateTail,readPirateTail}from'../shared/piratenet.ts';
function setup(n=4){const players=Array.from({length:n},(_,i)=>({pid:i+1,slot:i+1,nick:`P${i}`,eligible:true,state:makeState()}));const awards:any[]=[];const map=buildLobby();const raid=new Pirates({players:()=>players,award:(pid,tokens,stats)=>awards.push({pid,tokens,stats}),chat(){},broadcast(){}},map,new CollisionWorld(map));raid.start(0,'raid');raid.step(PIRATE_WARN);return{raid,players,awards};}
test('pirate wave counts scale but remain bounded, captain final only',()=>{assert.equal(pirateCount(1,4),4);assert.equal(pirateCount(2,6),8);assert.equal(pirateCount(3,6),9);assert.equal(pirateCount(3,100),16);const{raid}=setup(16);assert.equal(raid.tail(1).pirates.length,16);assert.ok(raid.tail(1).pirates.every(p=>!p.captain));});
test('mop enforces cone, eligibility and cooldown; normal pirate takes exactly three hits',()=>{const{raid,players}=setup();const actor=(raid as any).actors[0];Object.assign(actor,{x:4,z:5,hp:3});Object.assign(players[0].state,{x:4,y:0,z:7});(raid as any).history.fill(undefined);const input=makeInput();input.yaw=0;input.viewTick=PIRATE_WARN;assert.equal(raid.swing(1,input),true);assert.equal(actor.hp,2);raid.swing(1,input);assert.equal(actor.hp,2);players[0].eligible=false;raid.step(PIRATE_WARN+30);raid.swing(1,input);assert.equal(actor.hp,2);players[0].eligible=true;Object.assign(actor,{x:4,z:9});(raid as any).history.fill(undefined);input.yaw=0;input.viewTick=PIRATE_WARN+30;raid.swing(1,input);assert.equal(actor.hp,2);});
test('bounded codec carries actor state and self knock; hidden viewer has no pirates',()=>{const{raid,players}=setup();const tail=raid.tail(1),buf=new Uint8Array(pirateTailSize(tail.pirates.length));assert.equal(writePirateTail(buf,0,tail),buf.length);const out=emptyPirateTail();assert.equal(readPirateTail(buf.buffer,0,out),buf.length);assert.equal(out.pirates.length,tail.pirates.length);assert.equal(readPirateTail(buf.buffer.slice(0,-1),0,out),-1);players[0].eligible=false;assert.equal(raid.tail(1).visible,false);assert.equal(raid.tail(1).pirates.length,0);assert.equal(pirateReward(99,true,true),50);});

test('ordinary needs 3 hits, captain rages after6 and falls after12; victory credits participants once',()=>{
 const{raid,players,awards}=setup();const intern=raid as any;Object.assign(players[0].state,{x:4,y:0,z:7});
 let tick=PIRATE_WARN;
 function hit(a:any){Object.assign(a,{x:4,z:4.2,attackAt:1e9});intern.history.fill(undefined);const inp=makeInput();inp.yaw=0;inp.viewTick=tick;assert.equal(raid.swing(1,inp),true);tick+=30;raid.step(tick);}
 for(let wave=1;wave<=3;wave++){
  assert.equal(raid.view().wave,wave);
  for(const a of [...intern.actors]){
   // Put other actors away, so this explicitly measures hits on a single opponent.
   for(const other of intern.actors)if(other!==a)Object.assign(other,{x:20,z:12,attackAt:1e9});
   const hits=a.captain?12:3;
   for(let i=1;i<=hits;i++){hit(a);assert.equal(a.hp,hits-i);if(a.captain&&i===6)assert.equal(a.rage,true);}
  }
  if(wave<3){tick+=241;raid.step(tick);}
 }
 assert.equal(raid.view().phase,'end');assert.equal(raid.view().win,true);
 const paid=awards.filter(a=>a.tokens>0);assert.equal(paid.length,1);assert.equal(paid[0].pid,1);assert.equal(paid[0].tokens,50);assert.equal(paid[0].stats.prKos,17);
 raid.step(tick+100);assert.equal(awards.filter(a=>a.tokens>0).length,1);
});
test('static navigation reaches chest, carries it toward boat and loses without player intervention',()=>{
 const{raid}=setup();let picked=false;let lastX=PIRATE_CHEST.x,lastZ=PIRATE_CHEST.z;
 for(let t=PIRATE_WARN+1;t<PIRATE_WARN+14000&&raid.view().phase==='raid';t++){
  raid.step(t);const tail=raid.tail(1);if(tail.carrier)picked=true;lastX=tail.chestX;lastZ=tail.chestZ;
 }
 assert.equal(picked,true);assert.equal(raid.view().phase,'end');assert.equal(raid.view().win,false);
 assert.ok(lastZ>18,`chest actually reached shore instead of waiting for timeout: ${lastX},${lastZ}`);
});
test('killing carrier drops chest at current location with pickup grace',()=>{
 const{raid,players}=setup();const intern=raid as any;const a=intern.actors[0];Object.assign(a,{x:4,z:8,hp:1,attackAt:1e9});
 raid.step(PIRATE_WARN+1);assert.equal(raid.tail(1).carrier,a.id);const before=raid.tail(1);
 Object.assign(players[0].state,{x:a.x,y:0,z:a.z+2.9});intern.history.fill(undefined);const input=makeInput();input.yaw=0;input.viewTick=PIRATE_WARN+1;raid.swing(1,input);
 assert.equal(raid.tail(1).carrier,0);assert.equal(raid.tail(1).chestX,before.chestX);assert.equal(raid.tail(1).chestZ,before.chestZ);
 assert.ok(intern.pickupAt>PIRATE_WARN+1);
});
test('mop rewinds both attacker and pirate, but cover and maximum rewind remain authoritative',()=>{
 const{raid,players}=setup();const intern=raid as any;const a=intern.actors[0];Object.assign(a,{x:4,z:5,attackAt:1e9});Object.assign(players[0].state,{x:4,y:0,z:7});intern.record();
 Object.assign(a,{x:20,z:5});Object.assign(players[0].state,{x:20,y:0,z:7});raid.step(PIRATE_WARN+20);
 const input=makeInput();input.yaw=0;input.viewTick=PIRATE_WARN;assert.equal(raid.swing(1,input),true);assert.equal(a.hp,2);
 // The stale request is clamped to at most 24 ticks; moving current target behind cannot reuse distant old record.
 raid.step(PIRATE_WARN+70);Object.assign(a,{x:20,z:10});input.viewTick=PIRATE_WARN;assert.equal(raid.swing(1,input),false);
});

test('mop cannot hit through a solid wall and knock never edits health or tokens',()=>{
 const players=[{pid:1,slot:1,nick:'P',eligible:true,state:makeState()}];const map=buildLobby();map.boxes.push({min:[3,0,5.8],max:[5,3,6.2],mat:'concrete',color:0});const world=new CollisionWorld(map);
 const raid=new Pirates({players:()=>players,award(){},chat(){},broadcast(){}},map,world);raid.start(0,'cover');raid.step(PIRATE_WARN);const intern=raid as any,a=intern.actors[0];
 Object.assign(a,{x:4,z:5,attackAt:1e9});Object.assign(players[0].state,{x:4,y:0,z:7});intern.history.fill(undefined);const input=makeInput();input.yaw=0;input.viewTick=PIRATE_WARN;assert.equal(raid.swing(1,input),false);assert.equal(a.hp,3);
 world.setEnabled(map.boxes.length-1,false);raid.step(PIRATE_WARN+30);Object.assign(a,{x:4,z:5,attackAt:0});intern.history.fill(undefined);input.viewTick=PIRATE_WARN+30;assert.equal(raid.swing(1,input),true);const k=raid.knockOf(1);assert.equal(k.until-k.at,30);assert.ok(Math.hypot(k.vx,k.vz)>=5.8);assert.equal(a.hp,2);
});
