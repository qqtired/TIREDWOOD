// Imported explicitly after normal no-hook smoke. Actual game/SimRun/HUD/renderer, never MockRun.
import {setup,summary,caseBySeed,CASES,loadGlb} from '/__dungeon_qa/setup.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const history=[],messages=[],initials=[],seen=new WeakSet();let installed=false,watch=null,lastFrame=null,plainRenderer=null,tempRenderer=null,atlasGame=null;
const app=()=>window.__opus?.app;
const game=()=>app()?.active?.inner?.game??(app()?.active?.kind==='dungeon'?app().active.game:null);
const safeMessage=m=>m.t==='dg_end'?{t:m.t,result:m.result,coins:m.coins,pay:m.pay,pending:false}:m.t==='dg_ack'?{t:m.t,n:m.n,need:m.need}:m.t==='dg_wave'?{t:m.t,wave:m.wave,coins:m.coins}:{t:m.t,seed:m.seed};
function poseInfo(g){
 return [...g.bossViews].map(([id,b])=>{
  const layers=[];b.root.traverse(o=>{if(o.isMesh&&o.morphTargetInfluences){o.updateMatrixWorld(true);const e=o.matrixWorld.elements;layers.push({name:o.name,morph:[...o.morphTargetInfluences],worldScale:[Math.hypot(e[0],e[1],e[2]),Math.hypot(e[4],e[5],e[6]),Math.hypot(e[8],e[9],e[10])],materials:(Array.isArray(o.material)?o.material:[o.material]).map(m=>({name:m.name,color:m.color?.toArray(),map:!!m.map}))});}});
  const phaseBones=[];b.root.traverse(o=>{if(o.isBone&&/^(cup_)?liquid_p[123]$/.test(o.name))phaseBones.push({name:o.name,scale:o.scale.toArray()});});
  const lid=b.lid?.matrixWorld?.elements;return {phaseBones,id,family:b.family,visible:b.root.visible,key:b.cur,animAt:b.curAt,root:[b.root.position.x,b.root.position.z],renderYaw:b.root.rotation.y,actionTime:b.actions.get(b.cur)?.time,lidWorld:lid?[lid[12],lid[13],lid[14]]:null,lidLocked:!!b.lidWorld,layers};
 });
}
export function snapshot(){
 const a=app(),g=game();if(!g?.run?.sim)return {app:window.__opus?.state?.(),game:false};
 const p=a.renderer.gl.info,ctx=a.renderer.gl.getContext(),mobMaterials=[];g.mobs.root.traverse(o=>{if(o.isMesh)for(const m of (Array.isArray(o.material)?o.material:[o.material]))mobMaterials.push({name:m.name,map:!!m.map,mapWidth:m.map?.image?.width??0,mapHeight:m.map?.image?.height??0,vertexColors:!!m.vertexColors,uvCount:o.geometry?.attributes?.uv?.count??0,instanceCount:o.count??null});});
 return {app:{scene:a.active.kind,screen:a.screen,paused:a.paused},initial:initials.at(-1),state:summary(g.run.sim),game:g.debugState().dungeon,stepHash:g.stepHash,worldTime:g.wtime,runClass:g.run.constructor.name,
  rendering:{mobMaterials,calls:p.render.calls,triangles:p.render.triangles,programs:p.programs?.length??0,failedPrograms:(p.programs??[]).filter(x=>!ctx.getProgramParameter(x.program,ctx.LINK_STATUS)).map(x=>x.name??x.id),cpuMs:a.renderer.cpuMs,gpuMs:a.renderer.gpuMs,frameMedianMs:a.frameStats.median,frameP95Ms:a.frameStats.p95},
  push:lastFrame,bossViews:poseInfo(g),corpses:g.corpses.map(c=>({kind:c.kind,age:g.wtime-c.t,duration:c.dur,x:c.x,z:c.z})),bossCorpses:[...g.bossCorpses].map(([id,c])=>({id,age:g.wtime-c.t,duration:c.dur,phase:c.b.phase})),messages:messages.slice(-12)};
}
function instrument(g){
 if(seen.has(g))return;seen.add(g);
 const make=g.d.makeRun;g.d.makeRun=function(seed){
  const run=make(seed);if(!run.sim||typeof run.step!=='function')throw Error('actual SimRun with sim required, mock forbidden');
  const initial=setup(run.sim);run.cached=null;
  if(run.hash()!==initial.initialHash)throw Error('client initial real hash differs from setup hash');
  initials.push({...initial,source:'original game.d.makeRun returned actual run; setup before first view/hash',receivedAt:performance.now()});return run;
 };
 const start=g.start;g.start=function(seed){start.call(this,seed);if(caseBySeed(seed)){if(this.run?.sim?.seed!==seed||this.run.tick!==0)throw Error('Initial seeded game already advanced');this.setPaused(true,false);}};
 const tick=g.tick;g.tick=function(run){
  const before=summary(run.sim);tick.call(this,run);const after=summary(run.sim);
  if(after.fx.length||JSON.stringify(before.marks)!==JSON.stringify(after.marks)||before.bosses[0]?.phase!==after.bosses[0]?.phase){history.push({before,after});if(history.length>100)history.shift();}
 };
 const draw=g.draw;g.draw=function(now,dt){
  lastFrame={at:performance.now(),attemptedLive:0,submittedLive:0,attemptedDeath:0,submittedDeath:0,byKind:{},samples:{}};
  draw.call(this,now,dt);
  if(watch){const snap=snapshot();if(snap.state.end!=='running'||snap.state.hero.hp<=0){const failed=watch;watch=null;failed.reject(Error('Hero died: registration is not accepted'));return;}if(watch.fn(snap)){const w=watch;watch=null;g.setPaused(true,false);w.resolve(snap);}}
 };
 instrumentRenderer(g.mobs);
}
function instrumentRenderer(renderer){
 if(renderer.__qaInstrumented)return;renderer.__qaInstrumented=true;const push=renderer.push;
 renderer.push=function(...args){const result=push.apply(this,args);if(lastFrame){const [kind,x,y,z,yaw,key,t]=args,dead=key==='death';lastFrame[dead?'attemptedDeath':'attemptedLive']++;if(result)lastFrame[dead?'submittedDeath':'submittedLive']++;lastFrame.byKind[kind]=(lastFrame.byKind[kind]??0)+(result?1:0);lastFrame.samples[kind]={x,y,z,yaw,key,time:t,submitted:result};}return result;};
}
export async function install(){
 if(installed)return;const a=app();if(!a)throw Error('__opus unavailable; use ?debug');
 const module=await a.loadDungeon(),proto=module.DungeonScene.prototype,original=proto.startPending;
 proto.startPending=function(){if(this.game)instrument(this.game);return original.call(this);};
 const onJson=a.net.onJson;a.net.onJson=function(m){if(String(m.t).startsWith('dg_')){messages.push(safeMessage(m));if(messages.length>80)messages.shift();}return onJson.call(this,m);};
 installed=true;
 const label=document.createElement('div');label.id='dungeon-qa-label';label.textContent='QA: ускоренная начальная стадия; не прохождение20волн';
 Object.assign(label.style,{position:'fixed',bottom:'3px',right:'3px',zIndex:'9999',font:'12px sans-serif',color:'#fff',background:'#30231b',padding:'3px 6px',pointerEvents:'none'});document.body.append(label);
}
function coverVisible(){return [...document.querySelectorAll('.tr,.dg-loading.open')].some(e=>{const c=getComputedStyle(e),r=e.getBoundingClientRect();return c.display!=='none'&&c.visibility!=='hidden'&&Number(c.opacity)>.02&&r.width>0&&r.height>0;});}
async function readyLobby(a){for(let n=0;n<250;n++){if(a.active?.kind==='lobby'&&a.lobby.hasSelf===true&&__opus.state().transition.phase==='idle'&&!coverVisible()){await sleep(425);return;}await sleep(80);}throw Error('Lobby hasSelf/idle/cover transition not ready; no overlapping /go');}
export async function enter(id){
 await install();if(!CASES.some(c=>c.id===id))throw Error('unknowncase');
 const a=app();if(a.active?.kind!=='lobby'){game()?.setPaused(false);a.net.send({t:'leave'});}await readyLobby(a);
 await fetch('/__dungeon_qa/case',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({case:id})}).then(r=>{if(!r.ok)throw Error('config failed');return r.json();});
 a.net.send({t:'chat',text:'/go dungeon'});
 for(let n=0;n<300;n++){const g=game();if(g?.run?.sim&&caseBySeed(g.run.sim.seed)?.id===id){g.setPaused(true,false);if(__opus.state().transition.phase==='idle'&&!coverVisible()){await sleep(425);if(g.run.tick!==0||!g.isPaused)throw Error('Seeded run advanced while transition settled');return snapshot();}}await sleep(100);}
 throw Error('actual Dungeon game load/hello timeout');
}
export async function parity(){
 const g=game();if(!g?.run)throw Error('no game');g.flush();const tick=g.run.tick,hash=g.stepHash;
 for(let n=0;n<50;n++){const server=await fetch('/__dungeon_qa/state?tick='+tick).then(r=>r.json());const room=server.rooms.find(r=>r.initial.seed===g.seed);
  if(room?.hashAtTick!==undefined){if(room.hashAtTick!==hash||room.mismatches||room.bad)throw Error('journal replay mismatch');if(room.initial.initialHash!==initials.at(-1).initialHash)throw Error('initial setup hashes disagree');return {tick,hash,initialHash:room.initial.initialHash,room:room.room,mismatches:room.mismatches,bad:room.bad,result:room.result};}
  await sleep(100);
 }
 throw Error('server did not replay checkpoint');
}
export async function captureWhen(predicate,timeoutMs=15000){
 if(watch)throw Error('capture already armed');const g=game();if(!g)throw Error('no game');
 if(typeof predicate!=='function')throw Error('Pass a function literal through CDP; no eval under CSP');const fn=predicate;
 const promise=new Promise((resolve,reject)=>{watch={fn,resolve,reject};});const timer=setTimeout(()=>{if(watch){watch.reject(Error('semantic capture condition not observed'));watch=null;}},timeoutMs);
 g.setPaused(false);try{return await promise;}finally{clearTimeout(timer);g.setPaused(true,false);}
}
export function resume(){game()?.setPaused(false);}
export function trace(){return [...history];}
export async function atlas(variant){
 const g=game();if(!g||g.run.sim.mobs.some(m=>!m.die&&m.k!=='chainwarden'))throw Error('A/B requires chain-only fixture; other models must not be dropped');
 g.setPaused(true,false);
 if(atlasGame!==g){plainRenderer=null;tempRenderer=null;atlasGame=g;}
 if(variant==='plain'){if(plainRenderer){g.scene.remove(g.mobs.root);g.mobs=plainRenderer;g.scene.add(g.mobs.root);tempRenderer?.dispose();tempRenderer=null;}return {variant,defaultGameAssetChanged:false};}
 if(variant!=='soft')throw Error('plain or soft required');
 const gltf=await loadGlb('/__dungeon_qa/chainwarden-atlas-soft.glb');
 plainRenderer??=g.mobs;const urls={"rat":"/assets/rat-DUkrCEbG.glb","bat":"/assets/bat-ID7iDnCd.glb","slug":"/assets/slug-B8LFLSd9.glb","shroom":"/assets/shroom-BR4ZUFCy.glb","beetle":"/assets/beetle-BXMhQFci.glb","spitter":"/assets/spitter-DOD_VlXY.glb","larva":"/assets/larva-BoUc0pUj.glb","cooper":"/assets/cooper-mNMoMeDf.glb","shaman":"/assets/shaman-ZA3ktCWd.glb","hookclaw":"/assets/hookclaw-sFILKhPz.glb","wickmole":"/assets/wickmole-z8SSNohh.glb","railhopper":"/assets/railhopper-yPxYN1e_.glb","chainwarden":"/assets/chainwarden-D-frHuxa.glb"};const mobs={};for(const [kind,url]of Object.entries(urls))mobs[kind]=kind==='chainwarden'?gltf:await loadGlb(url);const renderer=new plainRenderer.constructor({mobs});
 instrumentRenderer(renderer);g.scene.remove(g.mobs.root);tempRenderer?.dispose();tempRenderer=renderer;g.mobs=renderer;g.scene.add(renderer.root);
 await app().renderer.gl.compileAsync(g.scene,g.camera);
 return {variant,defaultGameAssetChanged:false,rendering:'existing actual MobRenderer constructor, same live game/scene/camera/light, temporary instance only'};
}
window.__dungeonQA={install,enter,snapshot,parity,captureWhen,resume,trace,atlas,cases:CASES,atomicEntryVersion:'r6-atomic2'};
