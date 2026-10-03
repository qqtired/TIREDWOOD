// Node24 asset conversion; input is the author's unmodified Animal Pack Vol.2 archive extraction.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
class Reader {
  result=null;onloadend=null;
  readAsArrayBuffer(blob){blob.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}
  readAsDataURL(blob){blob.arrayBuffer().then(v=>{this.result=`data:${blob.type};base64,${Buffer.from(v).toString('base64')}`;this.onloadend?.();});}
}
globalThis.FileReader=Reader;
const source=process.argv[2]??'/tmp/opus-animal-vol2/Animal Pack Vol.2 by @Quaternius';
const output=new URL('../../client/assets/critters/',import.meta.url);
const report={source:'https://opengameart.org/content/animated-animales-low-poly',author:'Quaternius',license:'CC0-1.0',assets:[]};
for(const kind of ['Cat','Dog']){
  const file=path.join(source,'FBX',`${kind}.fbx`),bytes=fs.readFileSync(file);
  const object=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  object.updateMatrixWorld(true);let mesh;object.traverse(n=>{if(n.isSkinnedMesh)mesh=n;});
  mesh.normalizeSkinWeights();
  const g=mesh.geometry,position=g.attributes.position,colors=new Float32Array(position.count*3),roles=new Uint8Array(position.count);
  for(const group of g.groups)for(let i=group.start;i<group.start+group.count;i++)roles[i]=group.materialIndex;
  const color=new THREE.Color(),p=new THREE.Vector3();
  for(let i=0;i<position.count;i++){
    p.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
    let value=0xb98146;
    if(kind==='Cat')value=roles[i]===1?0xe9e0c8:roles[i]===2?0xba7f83:0xb98146;
    else value=p.x>345&&p.y>300?0x343637:p.y<42||p.y<160&&p.x>110?0xd7c3a2:p.z>45||p.z< -105?0x8c6f50:0xaa875d;
    color.setHex(value);colors.set([color.r,color.g,color.b],i*3);
  }
  g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.clearGroups();g.deleteAttribute('uv');
  const head=mesh.skeleton.bones.findIndex(b=>b.name==='Bone003');
  const bindHead=mesh.skeleton.boneInverses[head].clone().invert();
  const eyeTransform=mesh.bindMatrix.clone().invert().multiply(bindHead).multiply(mesh.skeleton.bones[head].matrixWorld.clone().invert());
  const parts=[g],closedPositions=[...g.attributes.position.array];
  const addEye=(x,y,z,sx,sy,sz,hex)=>{
    const eye=new THREE.SphereGeometry(1,10,8).toNonIndexed();eye.scale(sx,sy,sz).translate(x,y,z).applyMatrix4(eyeTransform);eye.deleteAttribute('uv');
    const closed=new THREE.SphereGeometry(1,10,8).toNonIndexed();closed.scale(sx,sy*.035,sz).translate(x,y,z).applyMatrix4(eyeTransform);closedPositions.push(...closed.attributes.position.array);
    const n=eye.attributes.position.count,weights=new Float32Array(n*4),indices=new Uint16Array(n*4),col=new Float32Array(n*3);color.setHex(hex);
    for(let i=0;i<n;i++){weights[i*4]=1;indices[i*4]=head;col.set([color.r,color.g,color.b],i*3);}
    eye.setAttribute('skinWeight',new THREE.BufferAttribute(weights,4));eye.setAttribute('skinIndex',new THREE.BufferAttribute(indices,4));eye.setAttribute('color',new THREE.BufferAttribute(col,3));parts.push(eye);
  };
  for(const sign of[-1,1]){
    const x=kind==='Cat'?273:300,y=kind==='Cat'?280:371,z=(kind==='Cat'?0:-31)+sign*(kind==='Cat'?47:57);
    addEye(x,y,z,8,9,3,kind==='Cat'?0xd2b65d:0xa99872);
    addEye(x+1,y,z+sign*2.2,kind==='Cat'?2.5:4.5,6,1.9,0x1b2728);
    addEye(x+2,y+3,z+sign*3.3,1.6,1.6,1.1,0xf4ecd6);
  }
  mesh.geometry=mergeGeometries(parts.map(p=>p.index?p.toNonIndexed():p),false);
  mesh.geometry.morphAttributes.position=[new THREE.Float32BufferAttribute(closedPositions,3)];
  mesh.updateMorphTargets();mesh.morphTargetDictionary={SleepEyes:0};
  mesh.material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,metalness:0});
  mesh.material.name=`${kind.toLowerCase()}-coat`;
  // Author's mesh faces +X. The game's animal convention faces -Z. Root wrapper keeps the rig untouched.
  const root=new THREE.Group();root.name=`${kind}-Asset`;
  const factor=kind==='Cat'?.00165:.00185;
  root.scale.setScalar(factor);root.rotation.y=Math.PI/2;
  const box=new THREE.Box3().setFromObject(object);object.position.z-=box.getCenter(new THREE.Vector3()).z;
  root.add(object);
  const animations=object.animations.map(a=>{const c=a.clone();c.name=a.name.endsWith('Walking')?'Walk':'Idle';return c;});
  const mixer=new THREE.AnimationMixer(object),idle=mixer.clipAction(animations.find(a=>a.name==='Idle'));idle.play();mixer.setTime(0);root.updateMatrixWorld(true);mesh.computeBoundingBox();
  const posed=new THREE.Box3().setFromObject(root);root.position.y=-posed.min.y;
  root.userData={kind:kind.toLowerCase(),source:'Quaternius Animal Pack Vol.2',meters:true,forward:'-Z',coatBase:'#b98146'};
  mixer.stopAllAction();root.updateMatrixWorld(true);
  const exporter=new GLTFExporter();const glb=await exporter.parseAsync(root,{binary:true,animations,onlyVisible:false,trs:true});
  const name=`${kind.toLowerCase()}.glb`;fs.writeFileSync(new URL(name,output),Buffer.from(glb));
  report.assets.push({name,bytes:glb.byteLength,triangles:mesh.geometry.attributes.position.count/3,bones:mesh.skeleton.bones.length,clips:animations.map(a=>({name:a.name,seconds:a.duration})),originalFBXSha256:crypto.createHash('sha256').update(bytes).digest('hex'),glbSha256:crypto.createHash('sha256').update(Buffer.from(glb)).digest('hex')});
}
fs.writeFileSync(new URL('provenance.json',output),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.assets,null,2));
