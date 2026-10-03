// Modelled coastal silhouettes: closed lofted surfaces, positive winding and articulated skeletons.
// Anatomy references: Cornell Ring-billed Gull ID; MarLIN Carcinus maenas (see asset LICENSE).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint } from '../render/kit.ts';
import { smooth, type CritterPose } from './crittersim.ts';
const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88,metalness:0});
type V=readonly[number,number,number];
type Ring=readonly[number,number,number,number,number]; // axis coordinate, two centre coordinates, two radii
function loft(rings:readonly Ring[],axis:'x'|'z',n=12):THREE.BufferGeometry{
  const p:number[]=[],idx:number[]=[];
  for(const[a,b,c,r1,r2]of rings)for(let j=0;j<n;j++){const t=j/n*Math.PI*2,u=b+r1*Math.cos(t),v=c+r2*Math.sin(t);p.push(...(axis==='z'?[u,v,a]:[a,u,v]));}
  for(let k=0;k<rings.length-1;k++)for(let j=0;j<n;j++){const a=k*n+j,b=k*n+(j+1)%n,c=b+n,d=a+n;idx.push(a,b,d,b,c,d);}
  for(const[k,reverse]of[[0,true],[rings.length-1,false]]as const){const r=rings[k],center=p.length/3;p.push(...(axis==='z'?[r[1],r[2],r[0]]:[r[0],r[1],r[2]]));for(let j=0;j<n;j++){const a=k*n+j,b=k*n+(j+1)%n;idx.push(center,...(reverse?[b,a]:[a,b]));}}
  let volume=0;
  for(let i=0;i<idx.length;i+=3){const a=idx[i]*3,b=idx[i+1]*3,c=idx[i+2]*3;volume+=p[a]*(p[b+1]*p[c+2]-p[b+2]*p[c+1])+p[a+1]*(p[b+2]*p[c]-p[b]*p[c+2])+p[a+2]*(p[b]*p[c+1]-p[b+1]*p[c]);}
  if(volume<0)for(let i=0;i<idx.length;i+=3)[idx[i+1],idx[i+2]]=[idx[i+2],idx[i+1]];
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
function tube(points:readonly V[],radius:number,segments=8):THREE.BufferGeometry{return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),segments,radius,6,false);}
function mirror(g:THREE.BufferGeometry):THREE.BufferGeometry{
  const result=g.clone().scale(-1,1,1),index=result.index!;for(let i=0;i<index.count;i+=3){const b=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,b);}result.computeVertexNormals();return result;
}
class RigBuilder{
  readonly bones:THREE.Bone[]=[];readonly positions:THREE.Vector3[]=[];readonly parts:THREE.BufferGeometry[]=[];
  bone(name:string,at:V,parent=0):number{const bone=new THREE.Bone();bone.name=name;const point=new THREE.Vector3(...at);bone.position.copy(point);if(this.bones.length){bone.position.sub(this.positions[parent]);this.bones[parent].add(bone);}this.positions.push(point);this.bones.push(bone);return this.bones.length-1;}
  part(source:THREE.BufferGeometry,hex:number,bone:number,weights?:(x:number,y:number,z:number)=>[number,number,number]):void{
    const g=paint(source,hex);g.deleteAttribute('uv');const p=g.attributes.position,count=p.count,indices=new Uint16Array(count*4),values=new Float32Array(count*4);
    for(let i=0;i<count;i++){const[a,b,w]=weights?.(p.getX(i),p.getY(i),p.getZ(i))??[bone,bone,0];indices[i*4]=a;indices[i*4+1]=b;values[i*4]=1-w;values[i*4+1]=w;}
    g.setAttribute('skinIndex',new THREE.BufferAttribute(indices,4));g.setAttribute('skinWeight',new THREE.BufferAttribute(values,4));this.parts.push(g);
  }
  mesh():THREE.SkinnedMesh{const mesh=new THREE.SkinnedMesh(mergeGeometries(this.parts,false)!,material);mesh.add(this.bones[0]);mesh.bind(new THREE.Skeleton(this.bones));mesh.castShadow=false;mesh.receiveShadow=false;mesh.frustumCulled=false;return mesh;}
}

export class CoastalCritter{
  readonly group=new THREE.Group();readonly mesh:THREE.SkinnedMesh;
  private readonly kind:'gull'|'crab';private readonly rig:RigBuilder;private readonly joints:number[]=[];private initialized=false;
  constructor(kind:'gull'|'crab',coat=0){this.kind=kind;this.rig=new RigBuilder();this.rig.bone('body',[0,0,0]);if(kind==='gull')this.gull();else this.crab(coat);this.mesh=this.rig.mesh();this.mesh.name=`${kind}-continuous-skin`;this.group.add(this.mesh);}
  update(p:CritterPose,time:number,animate=true):void{
    if(!animate&&this.initialized)return;this.initialized=true;
    for(const b of this.rig.bones)b.rotation.set(0,0,0);
    this.mesh.position.y=0;this.mesh.rotation.set(0,0,0);
    if(this.kind==='gull'){
      const flying=p.action==='fly',f=flying?Math.min(smooth(p.age/.42),smooth(p.remaining/.45)):0;
      const flap=Math.sin(time*8.2)*.64,step=p.distance/.22*Math.PI*2,walk=smooth(p.speed/.5);
      this.mesh.rotation.x=f*THREE.MathUtils.clamp(p.pitch,-.42,.42);
      this.rig.bones[1].rotation.x=p.action==='peck'?-.48*Math.max(0,Math.sin(time*2.3))*.8:Math.sin(time*.7)*.025;
      this.rig.bones[2].rotation.x=p.action==='peck'?-.42*Math.max(0,Math.sin(time*2.3)):0;
      for(let i=0;i<2;i++){
        const side=i?1:-1,shoulder=this.rig.bones[this.joints[i*3]],elbow=this.rig.bones[this.joints[i*3+1]],leg=this.rig.bones[this.joints[i*3+2]];
        shoulder.rotation.y=-side*1.48*(1-f);shoulder.rotation.z=side*(.13*(1-f)+flap*f);
        elbow.rotation.y=side*.08*(1-f);elbow.rotation.z=side*Math.sin(time*8.2-.5)*.22*f;
        leg.rotation.x=f*1.15+(1-f)*Math.sin(step+i*Math.PI)*.30*walk;
      }
    }else{
      const cycle=p.distance/.11*Math.PI*2,walk=smooth(p.speed/.12);
      this.mesh.position.y=p.action==='burrow'?-.17*p.restWeight:0;
      for(let i=0;i<8;i++){
        const side=i%2?1:-1,phase=cycle+(Math.floor(i/2)%2?Math.PI:0)+(side<0?Math.PI:0);
        this.rig.bones[this.joints[i*2]].rotation.y=Math.sin(phase)*.22*walk;
        this.rig.bones[this.joints[i*2+1]].rotation.z=side*Math.max(0,Math.sin(phase))*.25*walk;
      }
      for(let i=0;i<2;i++){this.rig.bones[this.joints[16+i*2]].rotation.y=(i?1:-1)*(.10+Math.sin(time*.9+i)*.05);this.rig.bones[this.joints[17+i*2]].rotation.y=(i?1:-1)*Math.max(0,Math.sin(time*1.8))*.24;}
    }
    this.group.updateMatrixWorld(true);
  }
  private gull():void{
    const r=this.rig,neck=r.bone('neck',[0,.30,-.15]),head=r.bone('head',[0,.385,-.235],neck);
    const body=loft([[.34,0,.215,.014,.013],[.23,0,.205,.059,.057],[.10,0,.21,.117,.105],[-.055,0,.232,.122,.115],[-.14,0,.29,.071,.088],[-.195,0,.362,.052,.073],[-.245,0,.392,.068,.064],[-.29,0,.376,.049,.047],[-.32,0,.360,.030,.026]],'z',16);
    r.part(body,0xe8e9df,0,(_x,_y,z)=>z<-.23?[neck,head,1]:[0,neck,smooth((-z-.12)/.10)]);
    r.part(loft([[-.313,0,.360,.030,.026],[-.358,0,.354,.021,.019],[-.405,0,.351,.002,.003]],'z',10),0xd8b158,head);
    r.part(loft([[-.353,0,.354,.022,.020],[-.365,0,.353,.019,.017]],'z',10),0x595342,head);
    for(const side of[-1,1])r.part(new THREE.SphereGeometry(.009,10,7).scale(.45,1,1).translate(side*.062,.41,-.26),0x252e30,head);
    const wing=loft([[0,0,0,.017,.070],[.13,.012,.012,.023,.089],[.24,.008,.029,.016,.074],[.36,.002,.066,.013,.060],[.48,-.004,.10,.004,.018],[.51,-.004,.11,.001,.002]],'x',10);
    for(let i=0;i<2;i++){
      const side=i?1:-1,shoulder=r.bone(`wing-${side}`,[side*.085,.263,.04]),elbow=r.bone(`wingtip-${side}`,[side*.325,.271,.069],shoulder),leg=r.bone(`leg-${side}`,[side*.043,.135,-.015]);
      this.joints.push(shoulder,elbow,leg);
      const g=(side<0?mirror(wing):wing.clone()).translate(side*.085,.263,.04);
      r.part(g,0x9faeb0,shoulder,(x)=>[shoulder,elbow,smooth((Math.abs(x)-.26)/.12)]);
      // Four narrow flight-feather tips give the wing an avian edge without open bow-tie planes.
      for(let f=0;f<4;f++){
        const rootX=.34+f*.026,z=.065+f*.018;
        const feather=loft([[rootX,.002,z,.007,.017],[.49+f*.008,-.003,z+.045,.004,.012],[.53+f*.005,-.004,z+.052,.001,.002]],'x',6);
        r.part((side<0?mirror(feather):feather).translate(side*.085,.263,.04),f%2?0x424e54:0x556267,elbow);
      }
      r.part(tube([[side*.043,.137,-.015],[side*.049,.073,.012],[side*.047,.021,-.018]],.010),0xc99847,leg);
      for(const toe of[-1,0,1])r.part(tube([[side*.047,.018,-.018],[side*.047+toe*.018,.011,-.054],[side*.047+toe*.025,.011,-.076]],.005,5),0xc69c55,leg);
    }
  }
  private crab(coat:number):void{
    const r=this.rig,shell=coat?0xa88855:0xb87148,legColor=coat?0xa68758:0xb47851;
    const rings:Ring[]=[];for(let i=0;i<=10;i++){const z=-.151+i*.0302,k=Math.sqrt(Math.max(.008,1-(z/.155)**2));rings.push([z,0,.12,.205*k,.067*k]);}
    r.part(loft(rings,'z',18),shell,0);
    r.part(loft([[-.14,0,.108,.066,.02],[-.11,0,.092,.15,.025],[.11,0,.092,.15,.025],[.14,0,.108,.055,.02]],'z',12),0xd0aa78,0);
    for(const side of[-1,1]){
      r.part(tube([[side*.058,.157,-.105],[side*.073,.208,-.128],[side*.082,.226,-.138]],.009,6),legColor,0);
      r.part(new THREE.SphereGeometry(.017,10,7).scale(1,.85,.85).translate(side*.082,.227,-.14),0x263334,0);
      // Five lateral teeth form the characteristic broad shore-crab rim.
      for(let k=0;k<5;k++)r.part(new THREE.ConeGeometry(.014,.043,5).rotateZ(-side*Math.PI/2).translate(side*(.18-Math.abs(k-2)*.008),.126,-.075+k*.037),shell,0);
    }
    for(let i=0;i<8;i++){
      const side=i%2?1:-1,k=Math.floor(i/2),z=-.074+k*.052;
      const hip:V=[side*.158,.109,z],knee:V=[side*(.265+Math.sin(k/3*Math.PI)*.035),.132,z+(k-1.5)*.047];
      const a=r.bone(`leg-${i}`,hip),b=r.bone(`tarsus-${i}`,knee,a);this.joints.push(a,b);
      r.part(tube([hip,[side*.218,.127,z+(k-1.5)*.025],knee],.013,7),legColor,a);
      r.part(tube([knee,[side*.34,.066,knee[2]+(k-1.5)*.035],[side*.362,.012,knee[2]+(k-1.5)*.051]],.009,7),legColor,b);
    }
    for(let i=0;i<2;i++){
      const side=i?1:-1,a=r.bone(`claw-${i}`,[side*.13,.112,-.09]),finger=r.bone(`finger-${i}`,[side*.255,.126,-.263],a);this.joints.push(a,finger);
      r.part(tube([[side*.13,.112,-.09],[side*.224,.137,-.163],[side*.251,.123,-.242]],.027,9),legColor,a);
      const palm=loft([[-.223,side*.25,.125,.026,.024],[-.262,side*.255,.125,.037,.028],[-.289,side*.255,.126,.031,.024]],'z',10);r.part(palm,coat?0xb89b66:0xcc9161,a);
      r.part(tube([[side*.238,.131,-.27],[side*.222,.134,-.309],[side*.237,.13,-.336],[side*.258,.126,-.34]],.011,8),0xd4ab77,a);
      r.part(tube([[side*.278,.123,-.268],[side*.299,.125,-.307],[side*.286,.128,-.331],[side*.264,.127,-.337]],.012,8),0xd4ab77,finger);
    }
  }
}
