import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {CRITTERS,CRITTER_QUIET_ZONE,CRITTER_SAND} from '../shared/maps/critters.ts';
import {critterPeriod,sampleCritter,sampleReaction,startleReaction} from '../client/lobby/crittersim.ts';
import {buildLobby} from '../shared/maps/lobby.ts';
import {CollisionWorld} from '../shared/world.ts';
import {TICK_RATE,WATER_Y} from '../shared/constants.ts';

test('15 animals in exact roster; sampling is independent of client/frame history',()=>{
  assert.equal(CRITTERS.length,15);assert.equal(new Set(CRITTERS.map(d=>d.id)).size,15);
  assert.deepEqual(['cat','gull','crab','dog'].map(k=>CRITTERS.filter(d=>d.kind===k).length),[4,6,4,1]);
  for(const def of CRITTERS)for(const tick of [0,1,400,12345,1e8]){
    const a=sampleCritter(def,tick);sampleCritter(def,tick+1000);assert.deepEqual(sampleCritter(def,tick),a);
  }
});

test('entire animal routes stay out of water/buildings/memorial/courses, crabs only on actual sand',()=>{
  const map=buildLobby(),w=new CollisionWorld(map);
  for(const def of CRITTERS)for(let time=0;time<critterPeriod(def);time+=.12){
    const p=sampleCritter(def,(time-def.phase+critterPeriod(def))*TICK_RATE);
    assert.ok(Math.hypot(p.x-CRITTER_QUIET_ZONE.x,p.z-CRITTER_QUIET_ZONE.z)>CRITTER_QUIET_ZONE.r,`${def.id} memorial`);
    assert.ok(p.x>-29.4&&p.z<46.5,'not on aqua/race course');
    if(def.kind==='crab'){
      assert.ok(p.x>CRITTER_SAND.x0&&p.x<CRITTER_SAND.x1&&p.z>CRITTER_SAND.z0&&p.z<CRITTER_SAND.z1);
      assert.equal(p.y,CRITTER_SAND.y);assert.ok(p.y>WATER_Y);
      assert.equal(w.groundBelow(p.x,p.y+.01,p.z),CRITTER_SAND.y,'crab is supported by actual sand geometry');
      continue;
    }
    if(p.action==='fly')continue;
    assert.ok(w.groundBelow(p.x,p.y+.01,p.z)>WATER_Y,`${def.id} water at ${p.x},${p.z}`);
    assert.ok(!w.overlaps(p.x-.13,p.y+.015,p.z-.13,p.x+.13,p.y+.45,p.z+.13),`${def.id} geometry at ${p.x},${p.y},${p.z}`);
    if(def.kind==='cat'&&!p.moving)assert.ok(def.stops.some(s=>s.rest===p.rest&&s.x===p.x&&s.z===p.z),'cats rest at named stops only');
  }
});

test('run reactions trigger briefly then exactly rejoin shared schedule; calm/far players do not trigger',()=>{
  for(const def of CRITTERS){
    const tick=800,p=sampleCritter(def,tick),player={x:p.x,y:p.y,z:p.z,speed:4};
    const reaction=startleReaction(def,p,player,tick,10,null)!;assert.ok(reaction);
    assert.notDeepEqual(sampleReaction(def,tick+60,11,reaction),sampleCritter(def,tick+60));
    assert.deepEqual(sampleReaction(def,tick+600,20,reaction),sampleCritter(def,tick+600));
    assert.equal(startleReaction(def,p,{...player,speed:0},tick,10,null),null);
    assert.equal(startleReaction(def,p,{...player,x:p.x+20},tick,10,null),null);
    assert.equal(startleReaction(def,p,player,tick+60,11,reaction),reaction);
  }
});

import * as THREE from 'three';
import {LobbyCritters} from '../client/lobby/critters.ts';

test('rigged visuals load locally, preserve15skins, cutoffanimation50m/hide80m, and keep pet interaction',async(t)=>{
  const assets=new URL('../client/assets/critters/',import.meta.url);
  t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL)=>{
    const url=input instanceof Request?input.url:String(input);
    assert.ok(url.startsWith(assets.href),'only bundled assets');const bytes=readFileSync(new URL(url));
    return new Response(bytes,{headers:{'Content-Length':String(bytes.length)}});
  });
  if(typeof globalThis.ProgressEvent==='undefined'){
    Object.defineProperty(globalThis,'ProgressEvent',{configurable:true,value:class extends Event{constructor(type:string,options:object){super(type);Object.assign(this,options);}}});
    t.after(()=>{Reflect.deleteProperty(globalThis,'ProgressEvent');});
  }
  const scene=new THREE.Scene();let purrs=0;const view=new LobbyCritters(scene,{onPurr:()=>purrs++});await view.ready;
  assert.equal(view.debug().modelsReady,15);assert.equal(view.debug().loadError,null);
  const tick=900,p=sampleCritter(CRITTERS[0],tick),player={x:p.x,y:p.y,z:p.z+.6,speed:0};
  view.update(tick,1,{x:p.x,y:p.y+1,z:p.z+3},player);
  const cat=view.nearestCat(player);assert.ok(cat);assert.equal(view.petCat(cat.id,tick,1),true);assert.equal(purrs,1);assert.equal(view.petCat(cat.id,tick,1.1),false);
  const skins:THREE.SkinnedMesh[]=[];view.group.traverse(o=>{if(o instanceof THREE.SkinnedMesh)skins.push(o);});
  assert.equal(skins.length,15);for(const skin of skins){assert.ok(skin.matrixWorld.determinant()>0);assert.ok(!Array.isArray(skin.material),'one material per animal');}
  const catSkin=skins.find(s=>s.name==='Cat')!;assert.ok(catSkin);
  const tail=catSkin.skeleton.bones.find(b=>b.name==='Bone007')!;
  view.update(tick,30,{x:p.x+60,y:10,z:p.z},{x:1e4,y:0,z:0,speed:0});const before=tail.quaternion.toArray();
  view.update(tick+60,40,{x:p.x+60,y:10,z:p.z},{x:1e4,y:0,z:0,speed:0});assert.deepEqual(tail.quaternion.toArray(),before,'far tail animation is frozen');
  view.update(tick,50,{x:1e4,y:0,z:0},{x:1e4,y:0,z:0,speed:0});
  for(const skin of skins){let visible=true;for(let o:THREE.Object3D|null=skin;o&&o!==view.group;o=o.parent)visible&&=o.visible;assert.equal(visible,false);}

  await t.test('mid-hop cat cannot be targeted or frozen by stale E; ordinary ground walking remains pettable',async()=>{
    let accepted=0;const check=new LobbyCritters(new THREE.Scene(),{onPurr:()=>accepted++});await check.ready;
    const def=CRITTERS[0];
    const find=(predicate:(p:ReturnType<typeof sampleCritter>)=>boolean)=>{for(let tick=1;tick<critterPeriod(def)*TICK_RATE;tick++)if(predicate(sampleCritter(def,tick)))return tick;throw Error('missing route phase');};
    const airborneTick=find(p=>p.moving&&p.y>.65),air=sampleCritter(def,airborneTick),airPlayer={x:air.x,y:.30,z:air.z+.3,speed:0};
    check.update(airborneTick,100,{x:air.x,y:2,z:air.z+3},airPlayer);
    assert.equal(check.nearestCat(airPlayer),null,'no E hint on a flying cat');
    assert.equal(check.petCat(0,airborneTick,100),false,'direct action also rejects mid-hop');assert.equal(accepted,0);
    const beforeHop=def.stops[0].hold*TICK_RATE-1,ground=sampleCritter(def,beforeHop),standingPlayer={x:ground.x,y:.30,z:ground.z+.3,speed:0};
    check.update(beforeHop,120,{x:ground.x,y:2,z:ground.z+3},standingPlayer);
    assert.equal(check.nearestCat(standingPlayer)?.id,0,'E was offered before take-off');
    assert.ok(Math.hypot(standingPlayer.x-air.x,standingPlayer.z-air.z)<1.35,'stale request remains within reach');
    assert.equal(check.petCat(0,airborneTick,120),false,'fresh server-tick pose rejects stale pre-jump E');assert.equal(accepted,0);
    const walkTick=find(p=>p.moving&&p.y===0),walk=sampleCritter(def,walkTick),walker={x:walk.x,y:0,z:walk.z+.3,speed:0};
    check.update(walkTick,200,{x:walk.x,y:2,z:walk.z+3},walker);
    assert.equal(check.nearestCat(walker)?.id,0,'ordinary walking still offers E');
    assert.equal(check.petCat(0,walkTick,200),true);assert.equal(accepted,1);
  });
});

import {makeState,makeEvents,stepPlayer,BTN_FORWARD,BTN_JUMP,BTN_ADS} from '../shared/sim.ts';
test('shore sand is reachable from the promenade and a normal jump returns over the curb',()=>{
  const w=new CollisionWorld(buildLobby()),p=makeState(),events=makeEvents();
  Object.assign(p,{x:-9,y:0,z:20.7,grounded:1});let seq=0;
  const jumpTo=(z:number)=>{
    let jumped=false;
    for(let i=0;i<220;i++){
      const dz=z-p.z,d=Math.abs(dz);
      let buttons=d>.1?BTN_FORWARD|BTN_ADS:0;
      if(!jumped&&p.grounded){buttons|=BTN_JUMP;jumped=true;}
      stepPlayer(p,{seq:++seq,buttons,yaw:dz>0?Math.PI:0,pitch:0,viewTick:0},w,false,23,events);
      assert.ok(p.y>WATER_Y,`no water fall at ${p.x},${p.y},${p.z}`);
      if(jumped&&i>20&&p.grounded&&d<.16)return;
    }
    assert.fail(`failed normal jump to ${z}, ended ${p.z}/${p.y}`);
  };
  jumpTo(23);assert.ok(Math.abs(p.y-CRITTER_SAND.y)<.001);
  jumpTo(20.7);assert.ok(Math.abs(p.y)<.001);
});
