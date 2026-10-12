/** Actual exported GLB checks; no browser, server or Blender process. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Matrix4, Quaternion, Vector3 } from '../../../../../game-opus/node_modules/three/build/three.module.js';
const root='[LOCAL_PATH]';
const modelDir=path.join(root,'models');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export function readGLB(file){
 const data=fs.readFileSync(file),len=data.readUInt32LE(12),doc=JSON.parse(data.subarray(20,20+len).toString('utf8'));
 const bin=data.subarray(28+len);const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
 const cache=new Map();
 function accessor(id){
  if(cache.has(id))return cache.get(id);
  const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],n=widths[a.type],bytes={5121:1,5123:2,5125:4,5126:4}[a.componentType],off=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*bytes,out=[];
  for(let i=0;i<a.count;i++)for(let j=0;j<n;j++){
   const p=off+i*stride+j*bytes;let value=a.componentType===5126?bin.readFloatLE(p):a.componentType===5125?bin.readUInt32LE(p):a.componentType===5123?bin.readUInt16LE(p):bin.readUInt8(p);
   if(a.normalized)value/=a.componentType===5123?65535:255;out.push(value);
  }
  const result={values:out,width:n,count:a.count};cache.set(id,result);return result;
 }
 return {file,data,doc,bin,accessor};
}
export function runtime(g){
 const {doc,accessor}=g,parents=Array(doc.nodes.length).fill(-1);doc.nodes.forEach((n,i)=>(n.children||[]).forEach(ch=>parents[ch]=i));
 const meshes=[];doc.nodes.forEach((node,i)=>{if(node.mesh!=null)for(const p of doc.meshes[node.mesh].primitives)meshes.push({node:i,pos:accessor(p.attributes.POSITION).values});});
 const base=doc.nodes.map(n=>({p:new Vector3(...(n.translation||[0,0,0])),q:new Quaternion(...(n.rotation||[0,0,0,1])),s:new Vector3(...(n.scale||[1,1,1]))}));
 const local=doc.nodes.map(()=>new Matrix4()),world=doc.nodes.map(()=>new Matrix4());
 function evaluate(animation,t){
  const state=base.map(o=>({p:o.p.clone(),q:o.q.clone(),s:o.s.clone()}));
  for(const c of animation.channels){
   const sm=animation.samplers[c.sampler],time=accessor(sm.input).values,val=accessor(sm.output);let k=0;
   while(k<time.length-2&&time[k+1]<t-1e-7)k++;
   const next=Math.min(k+1,time.length-1),alpha=Math.max(0,Math.min(1,(t-time[k])/(time[next]-time[k]||1)));
   const a=val.values.slice(k*val.width,(k+1)*val.width),b=val.values.slice(next*val.width,(next+1)*val.width),o=state[c.target.node];
   if(c.target.path==='rotation')o.q.fromArray(a).slerp(new Quaternion().fromArray(b),alpha);
   else if(c.target.path==='translation')o.p.fromArray(a).lerp(new Vector3().fromArray(b),alpha);
   else if(c.target.path==='scale')o.s.fromArray(a).lerp(new Vector3().fromArray(b),alpha);
  }
  state.forEach((o,i)=>local[i].compose(o.p,o.q,o.s));const visited=new Set();
  function calc(i){if(visited.has(i))return world[i];visited.add(i);world[i].copy(local[i]);if(parents[i]>=0)world[i].premultiply(calc(parents[i]));return world[i];}
  doc.nodes.forEach((n,i)=>calc(i));return world;
 }
 return {base,meshes,evaluate,world};
}
export function verify(file){
 const g=readGLB(file),rt=runtime(g),{doc,accessor}=g,mid=doc.nodes.find(n=>['ropecrab','jampump','canopy','foreman','crabcrane','miller'].includes(n.name))?.name;
 const find=n=>doc.nodes.findIndex(v=>v.name===mid+'_'+n),feet=doc.nodes.map((n,i)=>/^.+_foot[LR][0-2]?$/.test(n.name||'')?i:-1).filter(i=>i>=0),rootNode=doc.nodes.findIndex(n=>n.name===mid);
 const report={id:mid,file:path.relative(root,file),sha256:sha(g.data),binSHA256:sha(g.bin),triangles:doc.meshes.reduce((sum,m)=>sum+m.primitives.reduce((s,p)=>s+doc.accessors[p.indices].count/3,0),0),materials:doc.materials.length,textures:(doc.textures||[]).length,images:(doc.images||[]).length,primitives:rt.meshes.length,bytes:g.data.length,clips:[]};
 for(const animation of doc.animations){
  const times=animation.samplers.flatMap(sm=>accessor(sm.input).values),start=Math.min(...times),end=Math.max(...times),frames=Math.round((end-start)*24),semantic=animation.name.slice(mid.length+1),plant=['windup','attack','device_set','crank','hook_windup','anchor_set','pump','redirect_windup','redirect_attack'].includes(semantic);
  let minFloor=Infinity,maxRootTilt=0,maxPlantDrift=0,maxGripError=0,maxWalkStanceDrift=0,maxWeaponRadius=0,firstFloorContact={},worstFloorPart=null,variation=0;const origins={},walkOrigins={};
  for(let frame=0;frame<=frames;frame++){
   const t=start+frame/24,world=rt.evaluate(animation,t);
   const q=new Quaternion(),p=new Vector3(),s=new Vector3();world[rootNode].decompose(p,q,s);maxRootTilt=Math.max(maxRootTilt,2*Math.acos(Math.min(1,Math.abs(q.w))));
   for(let j=0;j<feet.length;j++){const i=feet[j],v=new Vector3().setFromMatrixPosition(world[i]);if(!origins[i])origins[i]=v.clone();if(plant)maxPlantDrift=Math.max(maxPlantDrift,v.distanceTo(origins[i]));
    if(semantic==='walk'){
     const match=doc.nodes[i].name.match(/_foot([LR])(\d)?$/),order=match[2]!==undefined?(match[1]==='R'?3:0)+Number(match[2]):match[1]==='R'?1:0;
     const phase=(frame/24+(order%2)*.5)%1;if(phase<.66){if(!walkOrigins[i])walkOrigins[i]=v.clone();maxWalkStanceDrift=Math.max(maxWalkStanceDrift,v.distanceTo(walkOrigins[i]));}else delete walkOrigins[i];
    }
   }
   if(plant)for(const side of ['L','R']){
    const hand=find('hand'+side),target=find('gripTarget'+side);if(hand>=0&&target>=0)maxGripError=Math.max(maxGripError,new Vector3().setFromMatrixPosition(world[hand]).distanceTo(new Vector3().setFromMatrixPosition(world[target])));
   }
   for(const mesh of rt.meshes){
    const e=world[mesh.node].elements;let low=Infinity;for(let j=0;j<mesh.pos.length;j+=3)low=Math.min(low,e[1]*mesh.pos[j]+e[5]*mesh.pos[j+1]+e[9]*mesh.pos[j+2]+e[13]);
    const part=doc.nodes[mesh.node].name.replace(mid+'_','').replace('_geometry','');if(low<minFloor){minFloor=low;worstFloorPart={part,seconds:frame/24,value:low};}if(low<=.015&&!Object.hasOwn(firstFloorContact,part))firstFloorContact[part]=+(frame/24).toFixed(4);
    if(semantic==='attack'&&/^(hook|nozzle|shield|load|wheel|blade|cap)/.test(part))for(let j=0;j<mesh.pos.length;j+=3){const x=e[0]*mesh.pos[j]+e[4]*mesh.pos[j+1]+e[8]*mesh.pos[j+2]+e[12],z=e[2]*mesh.pos[j]+e[6]*mesh.pos[j+1]+e[10]*mesh.pos[j+2]+e[14];maxWeaponRadius=Math.max(maxWeaponRadius,Math.hypot(x,z));}
   }
  }
  for(const c of animation.channels){const sm=animation.samplers[c.sampler],out=accessor(sm.output);let changed=false;for(let j=out.width;j<out.values.length;j++)if(Math.abs(out.values[j]-out.values[j%out.width])>1e-5){changed=true;break;}if(changed)variation++;}
  report.clips.push({name:animation.name,seconds:+(end-start).toFixed(6),runtimeDuration:+end.toFixed(6),inputStart:start,inputEnd:end,frames:frames+1,channels:animation.channels.length,variedChannels:variation,minimumFloorY:+minFloor.toFixed(6),worstFloorPart,rootTiltRadians:+maxRootTilt.toFixed(6),plantedFootDriftM:plant?+maxPlantDrift.toFixed(6):null,walkStanceDriftM:semantic==='walk'?+maxWalkStanceDrift.toFixed(6):null,workingGripErrorM:plant&&find('handL')>=0?+maxGripError.toFixed(6):null,weaponGeometryMaxRadiusM:semantic==='attack'?+maxWeaponRadius.toFixed(4):null,firstFloorContactS:firstFloorContact});
 }
 report.checks={rootUpright:report.clips.every(c=>c.rootTiltRadians<.001),bracedFeet:report.clips.every(c=>c.plantedFootDriftM===null||c.plantedFootDriftM<=(['crabcrane','miller'].includes(mid)?.035:.02)),walkStance:report.clips.every(c=>c.walkStanceDriftM===null||c.walkStanceDriftM<=.025),workingGrips:report.clips.every(c=>c.workingGripErrorM===null||c.workingGripErrorM<=.03),floor:report.clips.every(c=>c.minimumFloorY>=-.035),sixRequired:['idle','walk','windup','attack','hit','death'].every(c=>report.clips.some(v=>v.name===mid+'_'+c)),allRequiredHaveMotion:report.clips.filter(c=>['idle','walk','windup','attack','hit','death'].includes(c.name.slice(mid.length+1))).every(c=>c.variedChannels>0)};
 return report;
}
export function compareAB(aFile,bFile){
 const a=readGLB(aFile),b=readGLB(bFile);
 function fingerprints(g){
  const nodes=g.doc.nodes,meshes=[];
  nodes.forEach(n=>{if(n.mesh!=null)meshes.push([n.name,g.doc.meshes[n.mesh].primitives.map(p=>({indices:g.accessor(p.indices).values,attributes:Object.fromEntries(Object.entries(p.attributes).map(([key,id])=>[key,g.accessor(id).values]))}))]);});
  meshes.sort((x,y)=>x[0].localeCompare(y[0]));
  const animations=g.doc.animations.map(a=>[a.name,a.channels.map(c=>({node:nodes[c.target.node].name,path:c.target.path,times:g.accessor(a.samplers[c.sampler].input).values,values:g.accessor(a.samplers[c.sampler].output).values})).sort((x,y)=>`${x.node}:${x.path}`.localeCompare(`${y.node}:${y.path}`))]).sort((x,y)=>x[0].localeCompare(y[0]));
  return {geometryUV:sha(JSON.stringify(meshes)),clips:sha(JSON.stringify(animations)),materials:g.doc.materials.length,primitives:meshes.reduce((s,m)=>s+m[1].length,0),textures:(g.doc.textures||[]).length,images:(g.doc.images||[]).length};
 }
 const fa=fingerprints(a),fb=fingerprints(b),result={a:path.relative(root,aFile),b:path.relative(root,bFile),fingerprints:{a:fa,b:fb},checks:{geometryUVIdentical:fa.geometryUV===fb.geometryUV,clipsIdentical:fa.clips===fb.clips,materialsIdentical:fa.materials===fb.materials,primitivesIdentical:fa.primitives===fb.primitives,oneTextureOnly:fa.textures===0&&fb.textures===1&&fb.images===1}};
 fs.writeFileSync(path.join(modelDir,'evidence','foreman-textureAB-parity.json'),JSON.stringify(result,null,2));return result;
}
if(process.argv[1]===new URL(import.meta.url).pathname){
 if(process.argv[2]==='--ab') {const result=compareAB(path.resolve(process.argv[3]),path.resolve(process.argv[4]));console.log(JSON.stringify(result));process.exit(Object.values(result.checks).every(Boolean)?0:1);}
 const files=process.argv.slice(2);const results=files.map(f=>verify(path.resolve(f)));
 for(const r of results){const out=path.join(modelDir,'evidence',path.basename(r.file,'.glb')+'-exported-checks.json');fs.writeFileSync(out,JSON.stringify(r,null,2));console.log(JSON.stringify({id:r.id,file:r.file,triangles:r.triangles,materials:r.materials,textures:r.textures,primitives:r.primitives,checks:r.checks,clips:r.clips.map(c=>({name:c.name,seconds:c.seconds,minFloor:c.minimumFloorY,plant:c.plantedFootDriftM,grip:c.workingGripErrorM,varied:c.variedChannels}))}));}
 process.exitCode=results.some(r=>Object.values(r.checks).some(v=>!v))?1:0;
}
