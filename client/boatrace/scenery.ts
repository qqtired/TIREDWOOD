import * as THREE from 'three';
import type { BoatCourse } from '../../shared/boatracemap.ts';
import { makeRng } from '../../shared/math.ts';
import { locateAny,makeLoc } from '../../shared/track.ts';
import { TokarevLighthouse } from '../lobby/tokarev-lighthouse.ts';
import { craneGeometry,mergeColored,paint,place } from '../render/kit.ts';
import { concreteTexture,containerTexture,plankTexture,rollerDoorTexture } from '../render/textures.ts';

/** Scenery never becomes an invisible obstacle: all solid landmarks stay outside the marked water corridor. */
export const BAY_LANDMARKS=[{name:'marina',x:-62,z:-111,r:18},{name:'working-harbor',x:67,z:-119,r:22},{name:'rock-arch',x:63,z:27,r:12},{name:'island-beacon',x:23,z:35,r:6}] as const;
export function corridorDistance(course:BoatCourse,x:number,z:number):number{const at=locateAny(course.track,x,z,makeLoc()),tr=course.track;return Math.hypot(x-(tr.px[at.seg]+tr.tx[at.seg]*tr.len[at.seg]*at.t),z-(tr.pz[at.seg]+tr.tz[at.seg]*tr.len[at.seg]*at.t));}
function coastZ(x:number):number{return -118-Math.sin(x*.017)*12-Math.cos(x*.031)*10;}
export function portShorePoints():Array<{x:number;z:number}>{return Array.from({length:97},(_,i)=>{const x=-450+i*900/96;return{x,z:coastZ(x)};});}
function portGroundAt(x:number,z:number):number {
 const front=coastZ(x),r=Math.max(0,Math.min(1,(z-front)/(-710-front))),rows=[0,.02,.045,.08,.14,.28,.45,.7,1],heights=[-4,.8,2.7,3,7,28,55,75,45];let i=0;while(i<rows.length-2&&rows[i+1]<r)i++;const k=(r-rows[i])/(rows[i+1]-rows[i]),base=heights[i]+(heights[i+1]-heights[i])*k,edge=Math.max(0,Math.min(1,(450-Math.abs(x))/85)),noise=r>.08?Math.sin(x*.025+r*7)*9*Math.sin(r*Math.PI)+Math.cos(x*.041-r*4)*5:0;return(base+noise)*edge-(1-edge)*5;
}
function portLandGeometry():THREE.BufferGeometry {
 const rows=[0,.02,.045,.08,.14,.28,.45,.7,1],heights=[-4,.8,2.7,3,7,28,55,75,45],positions:number[]=[],colors:number[]=[],indices:number[]=[],n=97,c=new THREE.Color();
 for(let row=0;row<rows.length;row++)for(let i=0;i<n;i++){
  const x=-450+i*900/(n-1),r=rows[row],front=coastZ(x),z=front+(-710-front)*r,edge=Math.max(0,Math.min(1,(450-Math.abs(x))/85));
  const noise=r>.08?Math.sin(x*.025+r*7)*9*Math.sin(r*Math.PI)+Math.cos(x*.041-r*4)*5:0,y=(heights[row]+noise)*edge-(1-edge)*5;
  positions.push(x,y,z);c.setHex(row<3?0x808a7c:row<5?0x647756:0x526b50).multiplyScalar(.9+((i*3+row)%11)/65);colors.push(c.r,c.g,c.b);
  if(row){const a=(row-1)*n+i;if(i<n-1)indices.push(a,a+1,row*n+i+1,a,row*n+i+1,row*n+i);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function islandEdge(a:number):number{return 1+Math.sin(a*3+.7)*.045+Math.cos(a*7-.4)*.035;}
function islandPoint(a:number,r:number):THREE.Vector3 {const edge=islandEdge(a);return new THREE.Vector3(-3+Math.cos(a)*59*edge*r,0,6+Math.sin(a)*36*edge*r);}
export function islandShorePoints():Array<{x:number;z:number}>{return Array.from({length:96},(_,i)=>islandPoint(i/96*Math.PI*2,1.06)).map(p=>({x:p.x,z:p.z}));}
function islandGeometry():THREE.BufferGeometry {
 const radii=[0,.22,.42,.60,.72,.80,.86,.94,1,1.06],positions:number[]=[],colors:number[]=[],indices:number[]=[],stone=new THREE.Color(),n=96;
 for(let row=0;row<radii.length;row++)for(let i=0;i<n;i++){
  const a=i/n*Math.PI*2,r=radii[row],p=islandPoint(a,r);
  const ridge=8+Math.sin(a*2+.3)*3+Math.cos(a*5)*1.4;
  p.y=row===0?23:r<.72?Math.max(4,(1-r)*ridge+7+Math.cos(a*3+r*6)*3):r<.86?3.2+(1-r)*10:r<.98?.5+Math.sin(a*9)*.17:-1.8;
  positions.push(p.x,p.y,p.z);
  const rgb=r<.72?0x506b43:r<.86?0x8e9280:r<.98?0xa8a598:0xb3ad93;stone.setHex(rgb).multiplyScalar(.88+((i*7+row*3)%13)/65);colors.push(stone.r,stone.g,stone.b);
  if(row>0){const b=(row-1)*n+i,c=(row-1)*n+(i+1)%n,d=row*n+i,e=row*n+(i+1)%n;indices.push(b,e,d,b,c,e);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
export function buildBayScenery(scene:THREE.Scene,detail:THREE.Group):void {
 const stone=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96});const mainland=new THREE.Mesh(portLandGeometry(),stone);mainland.name='connected-harbor-mainland';mainland.receiveShadow=true;mainland.castShadow=true;scene.add(mainland);const island=new THREE.Mesh(islandGeometry(),stone);island.name='pine-rock-island';island.receiveShadow=true;island.castShadow=true;scene.add(island);
 const rockMaterial=new THREE.MeshStandardMaterial({color:0x69756b,roughness:.98,flatShading:true});const rocks=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),rockMaterial,29);const o=new THREE.Object3D();
 const rockClusters=[{a:.12,n:11},{a:2.60,n:8},{a:4.32,n:10}];let rockIndex=0;
 for(const cluster of rockClusters)for(let j=0;j<cluster.n;j++){
  const a=cluster.a+(j-cluster.n/2)*.045+Math.sin(j*2.3)*.021,p=islandPoint(a,.89+(j%4)*.033),large=j===Math.floor(cluster.n/2);
  o.position.set(p.x,large?2.6:.1+(j%3)*.28,p.z);o.rotation.set(j*.43,a,j*.19);o.scale.set(large?5.2:1.3+(j%4)*.42,large?4.9:1.2+(j%3)*.48,large?3.7:1.2+(j%4)*.36);o.updateMatrix();rocks.setMatrixAt(rockIndex++,o.matrix);
 }rocks.castShadow=rocks.receiveShadow=true;scene.add(rocks);
 const rng=makeRng(6801),trees=65,trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.09,.19,1,6).translate(0,.5,0),new THREE.MeshStandardMaterial({color:0x6b6550,roughness:.95}),trees);
 const pine=new THREE.InstancedMesh(new THREE.ConeGeometry(1,1,9).translate(0,.5,0),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.93,flatShading:true}),trees*3);
 for(let i=0;i<trees;i++){const a=rng()*Math.PI*2,r=.32+rng()*.32,p=islandPoint(a,r),h=4+rng()*5;const ridge=8+Math.sin(a*2+.3)*3+Math.cos(a*5)*1.4;p.y=Math.max(4,(1-r)*ridge+7+Math.cos(a*3+r*6)*3);
  o.position.copy(p);o.rotation.set(0,rng()*Math.PI*2,0);o.scale.set(1,h,1);o.updateMatrix();trunks.setMatrixAt(i,o.matrix);
  for(let j=0;j<3;j++){const k=1-j*.22;o.position.set(p.x,p.y+h*.32+j*h*.19,p.z);o.scale.set(h*.28*k,h*.53*k,h*.28*k);o.updateMatrix();pine.setMatrixAt(i*3+j,o.matrix);pine.setColorAt(i*3+j,new THREE.Color(j===0?0x36533e:j===1?0x44654a:0x527254));}}
 trunks.castShadow=pine.castShadow=true;detail.add(trunks,pine);
 const beacon=new TokarevLighthouse();beacon.group.position.set(23,1,35);beacon.group.scale.setScalar(.92);scene.add(beacon.group);
 // Small keeper's house and worn stone path make the lighthouse sit in a real place.
 const trim=new THREE.MeshStandardMaterial({color:0xe2dfd2,roughness:.88}),roof=new THREE.MeshStandardMaterial({color:0x85493d,roughness:.85});
 const house=new THREE.Mesh(new THREE.BoxGeometry(5.5,2.8,3.5),trim);house.position.set(13,2,36);house.castShadow=true;scene.add(house);
 const cap=new THREE.Mesh(new THREE.ConeGeometry(4.25,2,4).rotateY(Math.PI/4),roof);cap.scale.z=.68;cap.position.set(13,4.35,36);scene.add(cap);
 // A weathered rock arch is a shore landmark, never a fake navigable checkpoint.
 const archParts:THREE.BufferGeometry[]=[];for(let i=0;i<11;i++){const a=i/10*Math.PI;archParts.push(place(paint(new THREE.DodecahedronGeometry(1,0).scale(2.2,2.2,2.8),0x95988a),63+Math.cos(a)*6.3,1.1+Math.sin(a)*7.6,27+Math.sin(i*.9)*.45));}
 const arch=new THREE.Mesh(mergeColored(archParts),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.97,flatShading:true}));arch.castShadow=arch.receiveShadow=true;scene.add(arch);
 const concrete=new THREE.MeshStandardMaterial({map:concreteTexture(),color:0xa0a395,roughness:.95});
 const quay=new THREE.Mesh(new THREE.BoxGeometry(240,7,38),concrete);quay.position.set(0,-1,-123);quay.receiveShadow=true;quay.castShadow=true;scene.add(quay);
 const timber=new THREE.MeshStandardMaterial({map:plankTexture(),color:0xbab294,roughness:.88});const steel=new THREE.MeshStandardMaterial({color:0x35464d,roughness:.76,metalness:.2});
 for(let i=0;i<5;i++){const x=-100+i*15;const dock=new THREE.Mesh(new THREE.BoxGeometry(3.4,.65,18),timber);dock.position.set(x,.55,-103);dock.receiveShadow=true;scene.add(dock);for(const side of[-1,1])for(const z of[-110,-97]){const post=new THREE.Mesh(new THREE.CylinderGeometry(.18,.24,3.4,8),steel);post.position.set(x+side*1.48,0,z);scene.add(post);}}
 const containers=new THREE.InstancedMesh(new THREE.BoxGeometry(12.19,2.59,2.44),new THREE.MeshStandardMaterial({map:containerTexture(),roughness:.8,metalness:.12}),36);
 const palette=[0x586f75,0xb26f4d,0x77805d,0xbca35e,0x496c85,0xa7aaa0];
 for(let i=0;i<36;i++){const col=i%6,row=Math.floor(i/6)%3,tier=Math.floor(i/18);o.position.set(15+col*14,3.85+tier*2.6,-114-row*5);o.rotation.set(0,i%3===0?.025:0,0);o.scale.set(1,1,1);o.updateMatrix();containers.setMatrixAt(i,o.matrix);containers.setColorAt(i,new THREE.Color(palette[(i*5)%palette.length]));}containers.castShadow=containers.receiveShadow=true;scene.add(containers);
 for(const x of[32,83]){const crane=new THREE.Mesh(craneGeometry(x,2.5,-120,Math.PI,.9),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.76,metalness:.15}));crane.castShadow=true;detail.add(crane);}
 // Warehouse facade has bays, recessed glazing, pilasters and a roof silhouette, not one bare block.
 const warehouse=new THREE.Mesh(new THREE.BoxGeometry(70,10,18),new THREE.MeshStandardMaterial({map:concreteTexture(),color:0x829187,roughness:.9}));warehouse.position.set(-42,7.5,-142);warehouse.castShadow=true;scene.add(warehouse);
 const facade=new THREE.MeshStandardMaterial({color:0xb3b9ab,roughness:.85}),roofMat=new THREE.MeshStandardMaterial({color:0x52666b,roughness:.66,metalness:.22});
 for(let i=0;i<10;i++){const pilaster=new THREE.Mesh(new THREE.BoxGeometry(.38,10.4,.38),facade);pilaster.position.set(-77+i*70/9,7.65,-132.7);scene.add(pilaster);}
 const lintel=new THREE.Mesh(new THREE.BoxGeometry(71,.35,.5),facade);lintel.position.set(-42,12.48,-132.72);scene.add(lintel);
 for(let bay=0;bay<3;bay++){
  const x=-65.3+bay*23.3,shape=new THREE.Shape();shape.moveTo(-12,0);shape.lineTo(0,3.2);shape.lineTo(12,0);shape.closePath();
  const roofMesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:19,bevelEnabled:false}),roofMat);roofMesh.position.set(x,12.5,-151.5);roofMesh.castShadow=true;scene.add(roofMesh);
  const door=new THREE.Mesh(new THREE.BoxGeometry(7.5,4.4,.1),new THREE.MeshStandardMaterial({map:rollerDoorTexture(),color:0x8b9a94,metalness:.25,roughness:.75}));door.position.set(x,4.72,-132.4);scene.add(door);
  const surround=new THREE.Mesh(new THREE.BoxGeometry(8.1,4.95,.18),steel);surround.position.set(x,4.87,-132.6);scene.add(surround);
  const vent=new THREE.Mesh(new THREE.CylinderGeometry(.42,.46,1.5,10),steel);vent.position.set(x+4,16.1,-140);scene.add(vent);
 }
 const frameMeshes=new THREE.InstancedMesh(new THREE.BoxGeometry(3.1,2.2,.18),facade,18),windows=new THREE.InstancedMesh(new THREE.BoxGeometry(2.6,1.7,.04),new THREE.MeshStandardMaterial({color:0x345769,metalness:.28,roughness:.27}),18),bars=new THREE.InstancedMesh(new THREE.BoxGeometry(.07,1.75,.045),facade,18);
 for(let i=0;i<18;i++){const x=-77+((i%9)+.5)*70/9,y=7.7+Math.floor(i/9)*2.7;o.position.set(x,y,-132.7);o.rotation.set(0,0,0);o.scale.set(1,1,1);o.updateMatrix();frameMeshes.setMatrixAt(i,o.matrix);o.position.z=-132.585;o.updateMatrix();windows.setMatrixAt(i,o.matrix);o.position.z=-132.54;o.updateMatrix();bars.setMatrixAt(i,o.matrix);}scene.add(frameMeshes,windows,bars);
 // The marina is a connected comb: promenade, finger piers, piles, cleats and a short access ramp.
 const walk=new THREE.Mesh(new THREE.BoxGeometry(78,.55,3.1),timber);walk.position.set(-70,.59,-100.4);walk.receiveShadow=true;scene.add(walk);
 const ramp=new THREE.Mesh(new THREE.BoxGeometry(3,.22,8),timber);ramp.position.set(-44,1.65,-103.2);ramp.rotation.x=-.19;scene.add(ramp);
 const pilings=new THREE.InstancedMesh(new THREE.CylinderGeometry(.24,.31,4.6,8),steel,25),bollards=new THREE.InstancedMesh(new THREE.CylinderGeometry(.19,.23,.4,10),steel,20);
 for(let i=0;i<25;i++){o.position.set(-116+i*9.65,.15,-103.5);o.rotation.set(0,0,0);o.scale.set(1,1,1);o.updateMatrix();pilings.setMatrixAt(i,o.matrix);}for(let i=0;i<20;i++){o.position.set(-113+i*11.8,2.72,-106.1);o.updateMatrix();bollards.setMatrixAt(i,o.matrix);}scene.add(pilings,bollards);
 // A few low harbor sheds and tanks break the back edge and join the pine headland.
 for(const [x,z,w,h,d] of [[-104,-162,24,5,15],[6,-168,28,7,20],[91,-162,31,6,17]]){const shed=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:0x77877a,roughness:.86}));shed.position.set(x,3.5+h/2,z);shed.castShadow=true;scene.add(shed);const roof=new THREE.Mesh(new THREE.BoxGeometry(w+1,.35,d+1),roofMat);roof.position.set(x,3.5+h+.15,z);scene.add(roof);}
 const tanks=new THREE.InstancedMesh(new THREE.CylinderGeometry(5.2,5.2,9,22),new THREE.MeshStandardMaterial({color:0xc6c9b9,roughness:.54,metalness:.18}),3);for(let i=0;i<3;i++){o.position.set(40+i*13,8,-187);o.rotation.set(0,0,0);o.scale.set(1,1,1);o.updateMatrix();tanks.setMatrixAt(i,o.matrix);}scene.add(tanks);
 const backPines=new THREE.InstancedMesh(new THREE.ConeGeometry(1,1,8),new THREE.MeshStandardMaterial({color:0x405d48,roughness:.98}),95);
 for(let i=0;i<95;i++){const x=-235+(i%19)*25,z=-214-Math.floor(i/19)*31,h=6+(i%7);o.position.set(x,portGroundAt(x,z)+h/2-.2,z);o.rotation.set(0,i*1.23,0);o.scale.set(h*.32,h,h*.32);o.updateMatrix();backPines.setMatrixAt(i,o.matrix);}detail.add(backPines);
}
