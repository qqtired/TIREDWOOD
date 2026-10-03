import * as THREE from 'three';
import { boatWave } from '../../shared/boatracephysics.ts';
export interface WakeBoat {x:number;z:number;hx:number;hz:number;speed:number}
const MAX_BOATS=6,HISTORY=48;
interface Trace {x:Float32Array;z:Float32Array;time:Float32Array;speed:Float32Array;head:number;count:number;last:number}
export class BoatWake {
 private readonly traces:Trace[]=Array.from({length:MAX_BOATS},()=>({x:new Float32Array(HISTORY),z:new Float32Array(HISTORY),time:new Float32Array(HISTORY),speed:new Float32Array(HISTORY),head:0,count:0,last:-100}));
 private readonly foam:THREE.InstancedMesh;private readonly spray:THREE.InstancedMesh;private readonly dummy=new THREE.Object3D();private readonly fades=new THREE.InstancedBufferAttribute(new Float32Array(MAX_BOATS*HISTORY),1);private readonly sprayFades=new THREE.InstancedBufferAttribute(new Float32Array(MAX_BOATS*18),1);
 constructor(scene:THREE.Scene){
  const c=document.createElement('canvas');c.width=128;c.height=128;const g=c.getContext('2d')!;const gradient=g.createRadialGradient(64,64,5,64,64,63);gradient.addColorStop(0,'rgba(240,255,252,.88)');gradient.addColorStop(.42,'rgba(235,255,249,.62)');gradient.addColorStop(1,'rgba(240,255,250,0)');g.fillStyle=gradient;g.fillRect(0,0,128,128);
  g.globalCompositeOperation='destination-out';for(let i=0;i<28;i++){g.fillStyle='rgba(0,0,0,.2)';g.beginPath();g.ellipse((i*37)%128,(i*53)%128,4+i%5,2+i%3,.3,0,Math.PI*2);g.fill();}
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  const material=(map:THREE.Texture|null)=>{const m=new THREE.MeshBasicMaterial({color:0xe7fff8,map,transparent:true,opacity:.55,depthWrite:false,side:THREE.DoubleSide});m.onBeforeCompile=s=>{s.vertexShader='attribute float aFade; varying float vFade;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFade=aFade;');s.fragmentShader='varying float vFade;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=vFade;');};return m;};
  const plane=new THREE.PlaneGeometry(1,1);plane.setAttribute('aFade',this.fades);this.foam=new THREE.InstancedMesh(plane,material(tex),MAX_BOATS*HISTORY);this.foam.count=0;this.foam.frustumCulled=false;this.foam.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(this.foam);
  const drop=new THREE.SphereGeometry(1,6,4);drop.setAttribute('aFade',this.sprayFades);this.spray=new THREE.InstancedMesh(drop,material(null),MAX_BOATS*18);this.spray.count=0;this.spray.frustumCulled=false;scene.add(this.spray);
 }
 update(tick:number,boats:readonly WakeBoat[],low:boolean):void {
  const now=tick/60;let count=0,drops=0;
  for(let b=0;b<MAX_BOATS;b++){
   const boat=boats[b],tr=this.traces[b];if(!boat){tr.count=0;continue;}
   if(tr.count){const old=(tr.head+HISTORY-1)%HISTORY;if(Math.hypot(boat.x-tr.x[old],boat.z-tr.z[old])>18||now<tr.last)tr.count=0;}
   if(boat.speed>2&&now-tr.last>=.095){tr.x[tr.head]=boat.x-boat.hx*2;tr.z[tr.head]=boat.z-boat.hz*2;tr.time[tr.head]=now;tr.speed[tr.head]=boat.speed;tr.head=(tr.head+1)%HISTORY;tr.count=Math.min(HISTORY,tr.count+1);tr.last=now;}
   for(let j=0;j<tr.count;j+=(low?2:1)){
    const i=(tr.head+HISTORY-1-j)%HISTORY,age=now-tr.time[i];if(age>4.5)continue;const x=tr.x[i],z=tr.z[i],wave=boatWave(x,z,tick);this.dummy.position.set(x,wave.y+.05,z);this.dummy.rotation.set(-Math.PI/2,0,Math.atan2(boat.hx,boat.hz));this.dummy.scale.set(1.1+age*.65,Math.max(.6,tr.speed[i]*.13),1);this.dummy.updateMatrix();this.foam.setMatrixAt(count,this.dummy.matrix);this.fades.setX(count++,Math.pow(1-age/4.5,1.5)*Math.min(1,tr.speed[i]/13));
   }
   if(boat.speed>6)for(let i=0;i<(low?6:18);i++){
    const side=i%2?1:-1,p=(now*2.7+i*.173)%1,v=Math.min(1,boat.speed/23),lateral=.88+p*(.9+v),back=1.25-p*(1.1+v*1.8),x=boat.x+boat.hx*back-boat.hz*side*lateral,z=boat.z+boat.hz*back+boat.hx*side*lateral;
    this.dummy.position.set(x,boatWave(x,z,tick).y+.07+Math.sin(p*Math.PI)*(.2+v*.43),z);this.dummy.rotation.set(p,0,p*side);const r=.025+v*.028;this.dummy.scale.set(r,r*1.8,r);this.dummy.updateMatrix();this.spray.setMatrixAt(drops,this.dummy.matrix);this.sprayFades.setX(drops++,(1-p)*v);
   }
  }
  this.foam.count=count;this.spray.count=drops;this.foam.instanceMatrix.needsUpdate=this.spray.instanceMatrix.needsUpdate=true;this.fades.needsUpdate=this.sprayFades.needsUpdate=true;
 }
}
