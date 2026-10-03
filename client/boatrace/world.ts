import * as THREE from 'three';
import { makeBoatCourse } from '../../shared/boatracemap.ts';
import { boatWave } from '../../shared/boatracephysics.ts';
import { makeRng } from '../../shared/math.ts';
import { Backdrop } from '../lobby/backdrop.ts';
import { Gulls,fitShadow } from '../render/kit.ts';
import { tickAvatarShared } from '../render/avatar.ts';
import type { Renderer } from '../render/renderer.ts';
import { EVENING,fogColor,makeSea,makeSky,type SkyPalette } from '../render/sky.ts';
import type { Quality } from '../settings.ts';
import { buildBayScenery,corridorDistance } from './scenery.ts';
import { BoatWake,type WakeBoat } from './wake.ts';
export { BoatModel } from './model.ts';

const BAY:SkyPalette={...EVENING,sunDir:new THREE.Vector3(-.75,.48,.25).normalize(),horizon:0xdcdccc,mid:0xa7cbdc,zenith:0x548fbd,sunGlow:0xffdfaa,cloud:[.73,.79,.84],cloudLit:[1.05,1.03,.93],clouds:{cover:.48,alpha:.88,top:1},deep:0x12586d,shallow:0x418e95,fogNear:230,fogFar:1250,exposure:1.03};
function sign(text:string,small=false):THREE.CanvasTexture {
 const c=document.createElement('canvas');c.width=small?128:1024;c.height=small?128:192;const x=c.getContext('2d')!;
 if(small){x.fillStyle='#eae9d7';x.beginPath();x.arc(64,64,60,0,Math.PI*2);x.fill();x.strokeStyle='#203f4c';x.lineWidth=7;x.stroke();x.font='800 72px Rubik,system-ui,sans-serif';x.fillStyle='#203f4c';x.textAlign='center';x.textBaseline='middle';x.fillText(text,64,66);}
 else{x.fillStyle='#1c4254';x.fillRect(0,0,1024,192);x.fillStyle='#f2ede0';x.fillRect(0,0,1024,8);x.fillRect(0,184,1024,8);x.font='800 72px Rubik,system-ui,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(text,512,88);x.font='500 21px Rubik,system-ui,sans-serif';x.fillStyle='#b6cbc8';x.fillText('VLADIVOSTOK · AZURE BAY REGATTA',512,151);}
 const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
export class BoatRaceWorld {
 readonly course=makeBoatCourse();readonly scene=new THREE.Scene();readonly camera=new THREE.PerspectiveCamera(62,1,.08,1800);
 private readonly renderer:Renderer;private readonly sky:ReturnType<typeof makeSky>;private readonly sea:ReturnType<typeof makeSea>;private readonly sun=new THREE.DirectionalLight(0xffeed4,2.75);
 private readonly buoys:THREE.Group[]=[];private readonly gateLights:THREE.MeshBasicMaterial[]=[];private readonly flags:THREE.Mesh[]=[];private readonly details=new THREE.Group();private readonly wake:BoatWake;private readonly backdrop:Backdrop;private readonly gulls:Gulls;private low=false;private previous=0;
 constructor(renderer:Renderer){
  this.renderer=renderer;const fog=fogColor(BAY);this.scene.background=fog;this.scene.fog=new THREE.Fog(fog,BAY.fogNear,BAY.fogFar);this.scene.add(new THREE.HemisphereLight(0xd6e5ee,0xa8a489,1.65));
  this.sun.position.copy(BAY.sunDir).multiplyScalar(340);this.sun.target.position.set(0,0,0);this.sun.castShadow=true;fitShadow(this.sun,new THREE.Vector3(),new THREE.Box3(new THREE.Vector3(-150,-5,-155),new THREE.Vector3(150,55,125)));this.sun.shadow.bias=-.0005;this.sun.shadow.normalBias=.06;this.sun.shadow.radius=2;this.scene.add(this.sun,this.sun.target);
  this.sky=makeSky(BAY);this.scene.add(this.sky);this.sea=makeSea(BAY);this.sea.position.y=0;
  this.sea.geometry.dispose();this.sea.geometry=new THREE.PlaneGeometry(3000,3000,144,144);
  this.sea.material.vertexShader='uniform float uTime;\n'+this.sea.material.vertexShader;
  this.sea.material.vertexShader=this.sea.material.vertexShader.replace('vWorld = wp.xyz;', 'wp.y += sin(wp.x * .025 + uTime * .96) * .18 + sin(wp.z * .04 - uTime * .66) * .1;\n        vWorld = wp.xyz;');
  this.scene.add(this.sea);
  const pmrem=new THREE.PMREMGenerator(renderer.gl),environmentScene=new THREE.Scene(),environmentSky=makeSky(BAY);environmentScene.add(environmentSky);this.scene.environment=pmrem.fromScene(environmentScene,0,.1,100,{size:128}).texture;environmentSky.geometry.dispose();environmentSky.material.dispose();pmrem.dispose();
  buildBayScenery(this.scene,this.details);this.scene.add(this.details);this.backdrop=new Backdrop(this.scene,m=>m);this.gulls=new Gulls(this.scene,-20,14);this.wake=new BoatWake(this.scene);
  this.markCourse();this.finishGantry();this.setQuality('high');
 }
 private markCourse():void {
  const white=new THREE.MeshStandardMaterial({color:0xeee9d9,roughness:.59}),dark=new THREE.MeshStandardMaterial({color:0x253e49,roughness:.6,metalness:.18});
  this.course.buoys.forEach(b=>{
   const group=new THREE.Group();group.position.set(b.x,0,b.z);const color=b.side<0?0xbd6553:0x408e80,mat=new THREE.MeshStandardMaterial({color,roughness:.4,metalness:.12});
   const float=new THREE.Mesh(new THREE.CylinderGeometry(.47,.55,.33,14),dark);float.position.y=.04;group.add(float);
   const body=new THREE.Mesh(new THREE.CylinderGeometry(.23,.43,1.14,14),mat);body.position.y=.65;group.add(body);
   const stripe=new THREE.Mesh(new THREE.CylinderGeometry(.315,.35,.22,14),white);stripe.position.y=.59;group.add(stripe);
   const cap=new THREE.Mesh(new THREE.ConeGeometry(.25,.28,12),mat);cap.position.y=1.35;group.add(cap);
   const pole=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,1.1,6),dark);pole.position.y=1.76;group.add(pole);
   const pennant=new THREE.Mesh(new THREE.PlaneGeometry(.63,.34,5,1),new THREE.MeshStandardMaterial({color,roughness:.88,side:THREE.DoubleSide}));pennant.position.set(.3,2.1,0);group.add(pennant);this.flags.push(pennant);
   if(b.side<0){const badge=new THREE.Sprite(new THREE.SpriteMaterial({map:sign(String(b.gate+1),true),depthWrite:false}));badge.position.set(0,2.8,0);badge.scale.set(.83,.83,1);group.add(badge);}
   group.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=true;});this.scene.add(group);this.buoys.push(group);
  });
  this.course.gates.forEach((gate,i)=>{
   const material=new THREE.MeshBasicMaterial({color:0x9acfc4,transparent:true,opacity:.1,depthWrite:false});this.gateLights.push(material);
   const guide=new THREE.Mesh(new THREE.PlaneGeometry(gate.half*2-1,.28),material);guide.rotation.x=-Math.PI/2;guide.rotation.z=-Math.atan2(gate.hx,gate.hz);guide.position.set(gate.x,.055,gate.z);this.scene.add(guide);
   if(this.course.pickups.includes(i)){const ring=new THREE.Mesh(new THREE.TorusGeometry(1.02,.06,7,32),new THREE.MeshStandardMaterial({color:0xedc166,emissive:0x3d290a,metalness:.6,roughness:.3}));ring.position.set(gate.x,1.37,gate.z);ring.rotation.y=Math.atan2(gate.hx,gate.hz);this.scene.add(ring);}
  });
  // Coastal corner boards sit outside the existing 14m navigable corridor, with no added collision.
  const tr=this.course.track,rng=makeRng(533);for(let i=12;i<tr.n;i+=21){if(Math.abs(tr.curv[i])<.013)continue;const x=tr.px[i]+tr.tz[i]*17,z=tr.pz[i]-tr.tx[i]*17;if(corridorDistance(this.course,x,z)<15)continue;
   const marker=new THREE.Group();marker.position.set(x,0,z);const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.09,2.2,6),dark);pole.position.y=1.1;marker.add(pole);const board=new THREE.Mesh(new THREE.BoxGeometry(1.55,.7,.06),white);board.position.y=2.08;marker.add(board);
   for(const side of[-1,1]){const bar=new THREE.Mesh(new THREE.BoxGeometry(.16,.55,.08),new THREE.MeshBasicMaterial({color:0x294e5c}));bar.position.set(side*.22,2.08,.048);bar.rotation.z=-side*.7;marker.add(bar);}marker.rotation.y=Math.atan2(tr.tx[i],tr.tz[i])+(rng()-.5)*.04;this.scene.add(marker);
  }
 }
 private finishGantry():void {
  const g=this.course.gates[0],root=new THREE.Group();root.position.set(g.x,0,g.z);root.rotation.y=Math.atan2(-g.hx,-g.hz);root.name='maritime-finish-gantry';
  const steel=new THREE.MeshStandardMaterial({color:0xe1e2d6,roughness:.52,metalness:.3}),navy=new THREE.MeshStandardMaterial({color:0x294c5d,roughness:.53,metalness:.25});
  for(const side of[-1,1]){
   const pontoon=new THREE.Mesh(new THREE.BoxGeometry(2.7,.8,4.3),navy);pontoon.position.set(side*12,.18,0);root.add(pontoon);
   for(const z of[-1.45,1.45]){const post=new THREE.Mesh(new THREE.CylinderGeometry(.14,.18,6.6,8),steel);post.position.set(side*12,3.75,z);root.add(post);}
  }
  for(const z of[-1.45,1.45]){const beam=new THREE.Mesh(new THREE.CylinderGeometry(.14,.14,24.5,8).rotateZ(Math.PI/2),steel);beam.position.set(0,7,z);root.add(beam);}
  for(let x=-12;x<=12;x+=2){const brace=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,2.9,6).rotateX(Math.PI/2),steel);brace.position.set(x,7,0);root.add(brace);}
  const banner=new THREE.Mesh(new THREE.PlaneGeometry(12.5,2.34),new THREE.MeshStandardMaterial({map:sign('ЛАЗУРНЫЙ КРУГ'),roughness:.82,side:THREE.DoubleSide}));banner.position.set(0,6.95,1.5);root.add(banner);
  const checks=new THREE.Group();for(let i=0;i<26;i++){const material=new THREE.MeshBasicMaterial({color:i%2?0x1d3947:0xf0ecdc});const tile=new THREE.Mesh(new THREE.PlaneGeometry(.75,.65),material);tile.rotation.x=-Math.PI/2;tile.position.set(-9.75+i*.75,.06,0);checks.add(tile);}root.add(checks);root.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=true;});this.scene.add(root);
 }
 setQuality(q:Quality,slow=false):void{this.low=q==='low'||slow;this.details.visible=!this.low;const size=this.low?1024:q==='medium'?2048:4096;if(this.sun.shadow.mapSize.x!==size){this.sun.shadow.mapSize.set(size,size);this.sun.shadow.map?.dispose();this.sun.shadow.map=null;this.renderer.refreshShadows();}}
 update(tick:number,nextGate:number,boats:WakeBoat[]):void {
  const t=tick/60,dt=Math.min(.1,Math.max(0,t-this.previous));this.previous=t;this.sky.position.copy(this.camera.position);this.sky.material.uniforms.uTime.value=t;this.sea.material.uniforms.uTime.value=t;tickAvatarShared(t,this.camera.position.y);
  for(let i=0;i<this.buoys.length;i++){const g=this.buoys[i],w=boatWave(g.position.x,g.position.z,tick);g.position.y=w.y;g.rotation.set(w.pitch*.6,0,w.roll*.8);const p=this.flags[i].geometry.getAttribute('position');for(let j=0;j<p.count;j++)p.setZ(j,Math.sin(t*3.2+p.getX(j)*7+i)*.055*(p.getX(j)+.315)/.63);p.needsUpdate=true;}
  this.gateLights.forEach((m,i)=>{m.opacity=i===nextGate?.45:.075;m.color.setHex(i===nextGate?0xf0d09a:0xb4ded2);});this.wake.update(tick,boats,this.low);this.backdrop.update(t);this.gulls.update(dt);
 }
 resize(w:number,h:number):void{this.camera.aspect=w/Math.max(1,h);this.camera.updateProjectionMatrix();}
 render():void{this.renderer.render(this.scene,this.camera,BAY.exposure);}
}
