// Actual runtime fish geometry for a labelled Blender preview, without launching a browser/server.
import fs from 'node:fs';
import * as THREE from 'three';
import { FISH } from '../../../shared/fishing.ts';
import { podiumFishLength } from '../../../client/lobby/fishpodium.ts';
import { makeRoofShark } from '../../../client/lobby/fishboard.ts';
import { makeShowcaseTrophy } from '../../../client/lobby/plaza3/showcase-trophy.ts';
const out='/Users/tired/Desktop/tired.solutions/concepts_blender/plaza3/v2-2026-10-11-pack1/fishshowcase/preview-runtime-meshes.json';
const scene=new THREE.Group();
const samples=[['hammerhead',900_000,0],['ray',15_000,1.875],['oarfish',500_000,-1.875]];
for(const [id,g,x] of samples){
 const sp=FISH.findIndex(f=>f.id===id);if(sp<0)throw Error(`Missing fish ${id}`);
 scene.add(makeShowcaseTrophy({pid:1,nick:'Tester7',sp,g,at:0},{matrix:new THREE.Matrix4().makeTranslation(x,1.55,-.70),len:3.3,maxH:2.45,maxW:1.55,pose:'upright',head:1},podiumFishLength));
}
const shark=makeRoofShark();shark.position.set(0,8.69+.66,1.285);scene.add(shark);scene.updateMatrixWorld(true);
const parts=[];scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const p=o.geometry.getAttribute('position'),c=o.geometry.getAttribute('color');const points=[],colors=[];for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);points.push([-v.x,v.z,v.y]);colors.push(c?[c.getX(i),c.getY(i),c.getZ(i)]:[.25,.33,.28]);}parts.push({name:o.name,vertices:points,colors,indices:o.geometry.index?Array.from(o.geometry.index.array):Array.from({length:p.count},(_,i)=>i)});});
fs.writeFileSync(out,JSON.stringify({note:'Blender preview uses real runtime geometries, illustrative catches only; no leaderboard/data change.',parts}));console.log(out);
