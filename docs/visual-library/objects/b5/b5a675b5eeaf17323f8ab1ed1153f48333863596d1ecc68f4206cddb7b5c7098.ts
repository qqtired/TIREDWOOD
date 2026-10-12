import * as THREE from 'three';
import { BOAT_ANCHOR_FLAG, ZS_SIEGE_DEPLOY, ZS_SIEGE_ACTION, ZS_SIEGE_OPEN } from '../../../shared/fortsiege.ts';
import { colored, merge } from '../mobs/kit.ts';

const UP = new THREE.Vector3(0,1,0), a = new THREE.Vector3(), b = new THREE.Vector3(), end = new THREE.Vector3(), mid = new THREE.Vector3(), scale = new THREE.Vector3(), q = new THREE.Quaternion(), matrix = new THREE.Matrix4();
const CAP = 12;

/** One rope batch and one forged-anchor batch for all boarding boats. */
export class BoardingAnchors {
  private readonly rope: THREE.InstancedMesh;
  private readonly hooks: THREE.InstancedMesh;
  private ropes = 0;
  private anchors = 0;
  constructor(parent: THREE.Object3D) {
    this.rope = new THREE.InstancedMesh(new THREE.CylinderGeometry(.045,.045,1,6), new THREE.MeshStandardMaterial({color:0xc9aa77,roughness:.92}),CAP*3);
    const parts = [colored(new THREE.CylinderGeometry(.06,.085,.66,8),0x68594c), colored(new THREE.TorusGeometry(.13,.035,5,12).translate(0,.38,0),0x9f8464)];
    for (const side of [-1,1]) {
      parts.push(colored(new THREE.TorusGeometry(.28,.065,5,10,Math.PI*.63).rotateZ(side<0?Math.PI:0).rotateY(Math.PI/2).translate(side*.10,-.20,0),0x75634e));
      parts.push(colored(new THREE.ConeGeometry(.115,.30,6).rotateZ(side*-.62).translate(side*.28,-.06,0),0xb5a183));
    }
    this.hooks = new THREE.InstancedMesh(merge(parts),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.42,metalness:.6}),CAP);
    for (const mesh of [this.rope,this.hooks]) {mesh.name=mesh===this.rope?'boarding-ropes':'boarding-anchors';mesh.frustumCulled=false;mesh.count=0;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);parent.add(mesh);}
  }
  begin(): void {this.ropes=this.anchors=0;}
  add(x:number,y:number,z:number,tx:number,ty:number,tz:number,stage:number,state:number,stateTime:number):void {
    if (!(stage&BOAT_ANCHOR_FLAG)||this.anchors>=CAP) return;
    const active=state===ZS_SIEGE_DEPLOY||state===ZS_SIEGE_ACTION||state===ZS_SIEGE_OPEN;
    a.set(x,y+.8,z-.5);b.set(active?tx:x,active?ty+.5:y+.9,active?tz:z-.8);
    if(state===ZS_SIEGE_DEPLOY){const u=Math.min(1,stateTime/.75);b.lerpVectors(a,b,u);b.y+=Math.sin(u*Math.PI)*2;}
    if(state===ZS_SIEGE_OPEN)b.y-=Math.min(2.5,stateTime*1.5);
    if(active){
      end.copy(b);
      for(let i=0;i<3;i++){
        const t0=i/3,t1=(i+1)/3;
        const x0=a.x+(end.x-a.x)*t0,y0=a.y+(end.y-a.y)*t0-.25*Math.sin(t0*Math.PI),z0=a.z+(end.z-a.z)*t0;
        const x1=a.x+(end.x-a.x)*t1,y1=a.y+(end.y-a.y)*t1-.25*Math.sin(t1*Math.PI),z1=a.z+(end.z-a.z)*t1;
        mid.set(x1-x0,y1-y0,z1-z0);const len=mid.length();q.setFromUnitVectors(UP,mid.normalize());mid.set((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);scale.set(1,len,1);this.rope.setMatrixAt(this.ropes++,matrix.compose(mid,q,scale));
      }
    }
    q.setFromAxisAngle(UP,Math.PI/2);scale.setScalar(1);this.hooks.setMatrixAt(this.anchors++,matrix.compose(b,q,scale));
  }
  end():void {for(const [m,n] of [[this.rope,this.ropes],[this.hooks,this.anchors]] as const){m.count=n;m.visible=n>0;if(n){m.instanceMatrix.clearUpdateRanges();m.instanceMatrix.addUpdateRange(0,n*16);m.instanceMatrix.needsUpdate=true;}}}
  clear():void {this.begin();this.end();}
}
