import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url))),game='[LOCAL_PATH]';
const read=p=>readFileSync(join(root,p),'utf8'),json=p=>JSON.parse(read(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const html=read('../index.html'),checks=[];
function assert(name,condition,detail=''){checks.push({name,passed:!!condition,detail});if(!condition)throw Error(name+': '+detail);}
const body=html.match(/<script id="artifact-data" type="application\/json">([\s\S]*?)<\/script>/)?.[1];assert('embeddedData',!!body,'One safe JSON payload');const data=JSON.parse(body);
const pre=html.slice(0,html.indexOf('<script id="artifact-data"'));
const ids=[...pre.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert('uniqueDOMIDs',new Set(ids).size===ids.length);
const app=read('../viewer/app.js'),controls=[...new Set([...app.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]))];assert('allControlBindingsPresent',controls.every(id=>ids.includes(id)),controls.filter(id=>!ids.includes(id)).join(','));
assert('noUnresolvedTemplateTokens',!/__([A-Z_]+)__/.test(pre));
assert('noRemoteRenderDependencies',!/<(?:img|script|link)\b[^>]*(?:src|href)=["']https?:/i.test(pre),'Inline images/fonts/models/bundle; local source links are optional');
assert('oneWebGLRenderer',read('../viewer/model.js').match(/new THREE\.WebGLRenderer\(/g)?.length===1&&!read('../viewer/weapon.js').includes('new THREE.WebGLRenderer'),'Weapon preview uses the same rendering context');
assert('fiveImageReferences',Object.keys(data.images).length===5);
for(const p of json('../art/provenance.json')){const original=readFileSync(join(root,'art',p.id,'orig.png')),copy=readFileSync(join(root,p.asset));assert('originalUnchanged:'+p.id,original.equals(copy)&&sha(copy)===p.sha256&&p.code===0);assert('imageEmbedded:'+p.id,data.images[p.id]==='data:image/png;base64,'+copy.toString('base64'));}
assert('eightInlineEvolutionIcons',Object.keys(data.evoIcons).length===8);
for(const p of json('../art/evolutions-v2/manifest.json').items){const raw=readFileSync(p.source),orig=readFileSync(join(root,'art/evolutions-v2',p.id,'orig.png')),runtime=readFileSync(p.copiedTo);assert('evoPNGOriginal:'+p.id,sha(raw)===p.sha256&&raw.equals(orig)&&p.receipt.code===0);assert('evoRuntimeWebP:'+p.id,runtime.toString('ascii',0,4)==='RIFF'&&runtime.toString('ascii',8,12)==='WEBP'&&sha(runtime)===p.runtimeSha256);assert('evoInlineIcon:'+p.id,data.evoIcons[p.id]==='data:image/webp;base64,'+runtime.toString('base64'));}
const canonical=json('../revision2/models/manifest.json'),runtime=data.baseline,modelStats=[];
function gltf(raw){assert('glbMagic',raw.toString('ascii',0,4)==='glTF');assert('glbLength',raw.readUInt32LE(8)===raw.length);return JSON.parse(raw.toString('utf8',20,20+raw.readUInt32LE(12)).trim());}
function near(a,b){return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1/30+1e-5;}
for(const id of [...data.design.enemies.map(m=>m.id),data.design.boss.id]){
 const asset=data.models[id];assert('realModelEmbedded:'+id,!!asset,'Actual exported GLB, no substitute mesh');const raw=Buffer.from(asset.base64,'base64'),g=gltf(raw),manifest=canonical.models.find(m=>m.id===id);
 assert('embeddedModelMatchesR2:'+id,raw.equals(readFileSync(join(root,'revision2/models',id+'.glb'))));assert('embeddedModelMatchesGame:'+id,raw.equals(readFileSync(join(game,'client/assets/dungeon',id+'.glb'))));assert('canonicalManifestSHA:'+id,sha(raw)===manifest.sha256&&sha(raw)===asset.manifest.sha256);
 assert('noExternalGLBResources:'+id,!(g.buffers??[]).some(b=>b.uri)&&!(g.images??[]).some(i=>i.uri));
 const clips=(g.animations??[]).map(a=>a.name),base=id==='cauldronmaster'?['idle','walk','windup','attack','pour','boil','recover','hit','death']:['idle','walk','windup','attack','recover','hit','death'];
 for(const clip of base)assert('clip:'+id+'_'+clip,clips.includes(id+'_'+clip));
 if(id==='cauldronmaster')for(const phase of [2,3])for(const clip of [...base,'phase'])assert('phaseClip:'+clip+'_p'+phase,clips.includes(id+'_'+clip+'_p'+phase));
 assert('nonemptyTracks:'+id,g.animations.every(a=>a.channels.length&&a.samplers.length));
 for(const animation of g.animations){const duration=Math.max(...animation.samplers.map(s=>g.accessors[s.input].max?.[0]??NaN)),actual=manifest.actualGlbClips.find(c=>c.name===animation.name);assert('actualClipDuration:'+animation.name,actual&&Math.abs(duration-actual.durationSec)<1e-5&&actual.movingChannels>0);}
 const ev=manifest.events,def=runtime.mobs.find(m=>m.id===id),melee=def?.hook??def?.plant??def?.rail??def?.swing;
 if(melee){assert('eventImpactClock:'+id,near(ev.attack.impact,melee.impact));assert('eventFullClock:'+id,near(ev.attack.recoverEnd,melee.recover));if(melee.impact2)assert('secondImpactClock:'+id,near(ev.attack.impacts[1],melee.impact2));}
 if(id==='cauldronmaster'){
  assert('bossArmature',g.skins?.length>0);assert('threePhysicalLiquidLayers',['liquid_p1','liquid_p2','liquid_p3'].every(name=>g.meshes.some(m=>m.name===name&&m.extras?.targetNames?.join(',')==='wave_x,wave_y,surge'&&m.primitives.every(p=>p.targets?.length===3))));
  assert('phaseLiquidMorphTracks',g.animations.every(a=>a.channels.filter(c=>c.target.path==='weights').length===3));
  for(const phase of [1,2,3]){const suffix=phase===1?'':'_p'+phase;assert('liquidOpaqueP'+phase,g.materials.some(m=>m.name==='mob_liquid_p'+phase&&(m.alphaMode??'OPAQUE')==='OPAQUE'));assert('pairedClockP'+phase,near(ev['attack'+suffix].recoverEnd,runtime.cauldron.attacks[phase===1?'ladle':'ladle2'].recover));}
  for(const action of ['pour','boil']){assert('bossImpact:'+action,near(ev[action].impact,runtime.cauldron.attacks[action].impact));assert('bossCycle:'+action,near(ev[action].recoverEnd,runtime.cauldron.attacks[action].recover));}
  assert('boilSafeCenterFourMeters',runtime.cauldron.attacks.boil.inner===4&&data.design.boss.phases[2].telegraph.includes('4–8'));
 }
 assert('fullDeathClock:'+id,near(ev.death.duration,manifest.actualGlbClips.find(c=>c.name===id+'_death').durationSec));
 modelStats.push({id,bytes:raw.length,clips:clips.length,tris:manifest.tris,sha256:sha(raw)});
}
const soft=Buffer.from(data.models.chainwarden_soft.base64,'base64'),softGlb=gltf(soft);assert('softExperimentSeparate',data.experiment.default===false&&data.models.chainwarden_soft.experiment&&data.experiment.status.includes('pending'));assert('softEmbeddedMatchesFile',soft.equals(readFileSync(join(root,'../revision2/models/chainwarden-atlas-soft.glb')))&&sha(soft)===data.experiment.sha256);assert('softOneMapUV0',softGlb.images?.length===1&&softGlb.textures?.length===1&&softGlb.meshes.every(m=>m.primitives.every(p=>p.attributes.TEXCOORD_0!==undefined)));
function accessorValues(raw,g,id){const a=g.accessors[id],v=g.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type],bytes={5121:1,5123:2,5125:4,5126:4}[a.componentType],base=20+raw.readUInt32LE(12)+8+v.byteOffset+(a.byteOffset??0),stride=v.byteStride??n*bytes,out=[];for(let i=0;i<a.count;i++)for(let j=0;j<n;j++){const at=base+i*stride+j*bytes;out.push(a.componentType===5126?raw.readFloatLE(at):a.componentType===5121?raw.readUInt8(at):a.componentType===5123?raw.readUInt16LE(at):raw.readUInt32LE(at));}return out;}
const plain=Buffer.from(data.models.chainwarden.base64,'base64'),plainGlb=gltf(plain),softReceipt=json('../revision2/models/atlas-soft-final-receipt.json');assert('softReceiptMatchesEmbedded',sha(soft)===softReceipt.sha256&&sha(plain)===softReceipt.plainSha256&&softReceipt.plainDefaultUnchanged);
assert('softHierarchyAndRestExact',JSON.stringify(softGlb.nodes.map(n=>({name:n.name,children:n.children,translation:n.translation,rotation:n.rotation,scale:n.scale})))===JSON.stringify(plainGlb.nodes.map(n=>({name:n.name,children:n.children,translation:n.translation,rotation:n.rotation,scale:n.scale}))));
for(const animation of softGlb.animations){const original=plainGlb.animations.find(a=>a.name===animation.name);assert('softAllChannelsRetained:'+animation.name,animation.channels.length===108&&original.channels.length===108);for(const channel of animation.channels){const node=softGlb.nodes[channel.target.node].name,originalChannel=original.channels.find(c=>plainGlb.nodes[c.target.node].name===node&&c.target.path===channel.target.path),sampler=animation.samplers[channel.sampler],originalSampler=original.samplers[originalChannel.sampler];assert('softExactAnimation:'+animation.name+':'+node+':'+channel.target.path,sampler.interpolation===originalSampler.interpolation&&JSON.stringify(accessorValues(soft,softGlb,sampler.input))===JSON.stringify(accessorValues(plain,plainGlb,originalSampler.input))&&JSON.stringify(accessorValues(soft,softGlb,sampler.output))===JSON.stringify(accessorValues(plain,plainGlb,originalSampler.output)));}}
assert('fiftySevenActualClips',modelStats.reduce((n,m)=>n+m.clips,0)===57);
for(const w of data.design.waves){assert('sharesSum:'+w.n,Math.abs(Object.values(w.shares).reduce((a,b)=>a+b,0)-1)<1e-9);assert('oldShareRetained:'+w.n,w.oldShare>=.65);assert('bodyBudget:'+w.n,w.bodies<=600);const counts={...w.regularCounts};for(const ev of w.events)if(ev.mob&&!['boss','horde','pressure'].includes(ev.type))counts[ev.mob]=(counts[ev.mob]??0)+ev.n;assert('eventReservation:'+w.n,Object.entries(w.counts).every(([id,n])=>counts[id]===n)&&Object.keys(counts).every(id=>w.counts[id]===counts[id]));const calc=data.calculations.waves.find(a=>a.n===w.n);assert('waveMatchesCurrentSim:'+w.n,calc.hp===w.hp&&calc.bodies===w.bodies&&calc.xp===w.xp);}
assert('noFinalAt20',data.design.after20.duration===75&&data.design.preserved.includes('Бесконечность и босс каждые10волн'));
assert('eightExistingCatalysts',runtime.evolutions.length===8&&new Set(runtime.evolutions.map(e=>e.from)).size===8&&new Set(runtime.evolutions.map(e=>e.with)).size===8&&runtime.evolutions.every(e=>runtime.passives.some(p=>p.id===e.with)));
assert('sixteenFiniteNativeTraces',data.calculations.traces.length===16&&data.calculations.traces.every(t=>Object.values(t.dps).every(d=>Number.isFinite(d)&&d>=0)));
assert('threeLegalFivePlusFiveBuilds',data.calculations.builds.length===3&&data.calculations.builds.every(b=>b.weapons.length===5&&Object.keys(b.passives).length===5&&b.weapons.every(w=>!w.evolved||b.passives[runtime.evolutions.find(e=>e.from===w.id).with]>0)));
assert('allEightEvolutionsCovered',runtime.weapons.every(w=>data.calculations.builds.some(b=>b.weapons.some(a=>a.id===w.id&&a.evolved))));
assert('twelveLabeledNativePolicies',data.encounters.rows.length===12&&data.encounters.rows.filter(r=>r.registrationOnly).length===3&&data.encounters.rows.filter(r=>!r.registrationOnly).every(r=>r.heroHpMax<=200),'Registration fixture10000HP is separate from normal-HP policies');
assert('allPhaseAttackFamiliesExercised',['ladle','ladle2','pour','boil'].every(a=>data.encounters.rows.some(r=>r.registrationOnly&&r.attacks[a]>0)));
assert('currentSourceInline',data.sources.length===Object.keys(data.calculations.hashes).length&&data.sources.every(s=>sha(s.text)===s.sha256&&s.sha256===data.calculations.hashes[s.path]&&s.sha256===sha(readFileSync(join(game,s.path)))));
const old=json('../v1-2026-10-12/SNAPSHOT.json').files.find(f=>f.path==='../index.html');assert('v1HTMLUnchanged',sha(readFileSync(join(root,'../v1-2026-10-12/index.html')))===old.sha256);
const receipt={verifiedAt:new Date().toISOString(),sourceCommit:data.calculations.commit,sourceFreeze:data.design.sourceFreeze,checks:checks.length,passed:checks.every(c=>c.passed),htmlBytes:Buffer.byteLength(html),models:modelStats,limits:'Binary/source/structure and focused synthetic simulation only. Root owns fullgate, real battle, visual animation acceptance and FPS. Final plain native assets are embedded; optionalsoft exact motion is checked; runtime VAT A/B and built-game acceptance remain pending.'};
writeFileSync(join(root,'./verification.json'),JSON.stringify({...receipt,details:checks},null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
