// CPU parity check for the exact GLB clips and the one-draw baked runtime.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { bakeFortModel, POSE_FPS } from '../../client/fort/approved/bake.ts';
const dir = new URL('../../client/assets/fort/approved/', import.meta.url);
const loader = new GLTFLoader();
const results: unknown[] = [];
const manifest = JSON.parse(readFileSync(new URL('PROVENANCE.json',dir),'utf8'));
const currentFiles = manifest.models.map((m: {glb?:string;source:string}) => (m.glb??m.source).split('/').at(-1)!);
for (const file of currentFiles) {
  const id = file.split('-r')[0], bytes = readFileSync(new URL(file,dir));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),'');
  const root = gltf.scene.getObjectByName(id)!;
  const baked = bakeFortModel(gltf,id);
  assert.equal(Object.keys(baked.clips).length,gltf.animations.length);
  assert(baked.tex.image.width < 2048 && baked.tex.image.height < 4096);
  const pos=baked.geo.getAttribute('position'), parts=baked.geo.getAttribute('aPart');
  const meshes:THREE.Mesh[]=[]; root.traverse(o=>{if((o as THREE.Mesh).isMesh)meshes.push(o as THREE.Mesh);});
  const mixer=new THREE.AnimationMixer(gltf.scene), v=new THREE.Vector3(), real=new THREE.Vector3();
  const rest=root.position.clone(); let maxError=0,checked=0;
  for(const clip of gltf.animations){
    const key=clip.name.slice(id.length+1),info=baked.clips[key];
    const frames=[0,Math.floor((info.frames-1)*.3),Math.floor((info.frames-1)*.65),info.frames-1];
    mixer.stopAllAction();const action=mixer.clipAction(clip);action.reset().setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
    for(const f of frames){
      mixer.setTime(Math.min(f/POSE_FPS,clip.duration));gltf.scene.updateMatrixWorld(true);
      const dx=key==='walk'?root.position.x-rest.x:0,dz=key==='walk'?root.position.z-rest.z:0;
      let offset=0;
      for(const mesh of meshes){
        const geo=mesh.geometry,local=geo.getAttribute('position'),index=geo.index,n=index?.count??local.count;
        for(const k of [0,Math.floor(n*.51),n-1]){
          const vi=offset+k,ji=parts.getX(vi),o=((info.start+f)*baked.tex.image.width+ji*3)*4;
          const data=baked.tex.image.data as Float32Array;
          v.fromBufferAttribute(pos,vi);const x=v.x,y=v.y,z=v.z;
          v.set(data[o]*x+data[o+1]*y+data[o+2]*z+data[o+3],data[o+4]*x+data[o+5]*y+data[o+6]*z+data[o+7],data[o+8]*x+data[o+9]*y+data[o+10]*z+data[o+11]);
          real.fromBufferAttribute(local,index?index.getX(k):k).applyMatrix4(mesh.matrixWorld);real.x-=dx;real.z-=dz;
          const error=v.distanceTo(real);maxError=Math.max(maxError,error);assert(error<.0001,`${file} ${key} frame ${f} error ${error}`);checked++;
        }
        offset+=n;
      }
    }
  }
  if(['battery','siegetower'].includes(id)){
    const walk=gltf.animations.find(c=>c.name===id+'_walk')!;mixer.stopAllAction();const a=mixer.clipAction(walk);a.reset().setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.play();mixer.setTime(0);gltf.scene.updateMatrixWorld(true);const wheels:THREE.Object3D[]=[];root.traverse(o=>{if(o.name.includes('wheel')&&o.type==='Object3D')wheels.push(o);});assert.equal(wheels.length,4,'expected four wheel controls');const start=wheels.map(o=>o.matrixWorld.clone());mixer.setTime(walk.duration);gltf.scene.updateMatrixWorld(true);for(let n=0;n<wheels.length;n++)for(let k=0;k<16;k++)assert(Math.abs(wheels[n].matrixWorld.elements[k]-start[n].elements[k])<.0001,'wheel loop must close '+wheels[n].name);
  }
  results.push({id,file,triangles:baked.triangles,parts:baked.parts,clips:Object.fromEntries(Object.entries(baked.clips).map(([key,c])=>[key,c.duration])),samples:checked,maxPositionError:maxError,poseTexture:[baked.tex.image.width,baked.tex.image.height],drawCallsPerType:1});
}
const result={pass:true,models:results};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
