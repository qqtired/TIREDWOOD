import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const ids=['hookclaw','wickmole','railhopper','chainwarden','cauldronmaster'];
const out=[];
for(const id of ids){
 const file=path.join(root,id+'.glb'),b=fs.readFileSync(file);
 if(b.readUInt32LE(0)!==0x46546c67||b.readUInt32LE(4)!==2||b.readUInt32LE(8)!==b.length)throw Error(id+' invalid GLB header');
 const jsonLength=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+jsonLength).toString().trim());
 const binStart=28+jsonLength;
 const read=index=>{const a=j.accessors[index],v=j.bufferViews[a.bufferView];if(a.componentType!==5126)throw Error('Expected float animation accessor');const n={SCALAR:1,VEC3:3,VEC4:4}[a.type];const offset=binStart+(v.byteOffset??0)+(a.byteOffset??0),stride=v.byteStride??n*4;return Array.from({length:a.count},(_,k)=>Array.from({length:n},(_,c)=>b.readFloatLE(offset+k*stride+c*4)));};
 const clips=(j.animations??[]).map(a=>{let duration=0,movingChannels=0,maxLoopDelta=0;for(const channel of a.channels){let s=a.samplers[channel.sampler],t=read(s.input),v=read(s.output);duration=Math.max(duration,t.at(-1)[0]);const moving=v.some(row=>row.some((n,c)=>Math.abs(n-v[0][c])>1e-5));if(moving)movingChannels++;if(/_(idle|walk|phase1)$/.test(a.name))maxLoopDelta=Math.max(maxLoopDelta,...v[0].map((x,c)=>Math.abs(x-v.at(-1)[c])));}if(!movingChannels)throw Error(id+' constant clip '+a.name);if(duration<=0)throw Error(id+' empty duration');if(maxLoopDelta>.005)throw Error(id+' loop mismatch '+a.name);return {name:a.name,durationSec:duration,channels:a.channels.length,movingChannels,loopEndpointMaxDelta:maxLoopDelta};});
 for(const req of ['idle','walk','windup','attack','hit','death'])if(!clips.some(x=>x.name===id+'_'+req))throw Error(id+' missing '+req);
 if(id==='cauldronmaster'&&!(j.skins?.[0]?.joints.length>0))throw Error('Missing boss skin');
 out.push({id,bytes:b.length,meshCount:j.meshes.length,skins:(j.skins??[]).map(s=>s.joints.length),clips});
}
fs.writeFileSync(path.join(root,'glb-validation.json'),JSON.stringify({valid:true,models:out},null,2));
console.log(JSON.stringify({valid:true,models:out.map(x=>({id:x.id,bytes:x.bytes,clips:x.clips.length,movingChannels:x.clips.map(c=>c.movingChannels),skinJoints:x.skins}))},null,2));
