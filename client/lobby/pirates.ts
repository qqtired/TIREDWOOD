import * as THREE from 'three';
import { WATER_Y } from '../../shared/constants.ts';
import { PIRATE_LANDINGS, PIRATE_MAX, PIRATE_SHIP, emptyPirates, emptyPirateTail, type PirateTail, type PirateView } from '../../shared/pirates.ts';
import { mergeColored, paint } from '../render/kit.ts';
export interface PirateVisualHooks { swing(): void; sound(kind: 'horn' | 'cannon' | 'splash' | 'victory' | 'loss' | 'mop'): void }
const _dummy = new THREE.Object3D(), _color = new THREE.Color();
/** One merged ship, shared/instanced actor parts, bounded cannon/splash/firework effects. */
export class Pirates3D {
  readonly group = new THREE.Group();
  readonly mop = new THREE.Group();
  private readonly hooks: PirateVisualHooks;
  private readonly ship: THREE.Mesh;
  private readonly boats: THREE.InstancedMesh;
  private readonly bodies: THREE.InstancedMesh;
  private readonly stripes: THREE.InstancedMesh;
  private readonly hats: THREE.InstancedMesh;
  private readonly eye: THREE.InstancedMesh;
  private readonly swords: THREE.InstancedMesh;
  private readonly captainHat: THREE.Mesh;
  private readonly captainHook: THREE.Mesh;
  private readonly chest: THREE.Group;
  private readonly ball: THREE.Mesh;
  private readonly splash: THREE.Mesh;
  private readonly fireworks: THREE.Points;
  private readonly mopSticks: THREE.InstancedMesh;
  private readonly mopHeads: THREE.InstancedMesh;
  private readonly panel: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly detail: HTMLDivElement;
  private readonly button: HTMLButtonElement;
  private state = emptyPirates();
  private tailState = emptyPirateTail();
  private lastPhase = 'idle';
  private cannon = -1;
  private swingUntil = 0;
  private readonly previous = new Map<number, { x: number; z: number; captain: boolean }>();
  private readonly fallen: Array<{ x: number; z: number; at: number; captain: boolean }> = [];
  constructor(scene: THREE.Scene, root: HTMLElement, hooks: PirateVisualHooks) {
    this.hooks = hooks; this.group.name = 'pirate-raid'; this.group.visible = false; scene.add(this.group);
    this.ship = this.makeShip(); this.group.add(this.ship);
    this.boats = new THREE.InstancedMesh(new THREE.BoxGeometry(2.1,.7,3.5), new THREE.MeshStandardMaterial({ color:0x63412e,roughness:.8 }),3);
    this.group.add(this.boats);
    const lit = new THREE.MeshStandardMaterial({ color:0xffffff,roughness:.7 });
    this.bodies = new THREE.InstancedMesh(new THREE.SphereGeometry(.6,12,8).scale(1,1.3,1),lit,PIRATE_MAX*2);
    this.stripes = new THREE.InstancedMesh(new THREE.CylinderGeometry(.51,.56,.35,10),new THREE.MeshStandardMaterial({color:0xe8e9d8}),PIRATE_MAX);
    this.hats = new THREE.InstancedMesh(new THREE.SphereGeometry(.61,10,6,0,Math.PI*2,0,Math.PI/2).scale(1,.38,1),new THREE.MeshStandardMaterial({color:0xc84b42}),PIRATE_MAX);
    this.eye = new THREE.InstancedMesh(new THREE.BoxGeometry(.23,.21,.07),new THREE.MeshStandardMaterial({color:0x1a1c20}),PIRATE_MAX);
    this.swords = new THREE.InstancedMesh(new THREE.BoxGeometry(.07,.75,.1).translate(.73,.72,0).rotateZ(-.4),new THREE.MeshStandardMaterial({color:0xd2dfde,metalness:.6,roughness:.35}),PIRATE_MAX);
    this.group.add(this.bodies,this.stripes,this.hats,this.eye,this.swords);
    this.captainHat = new THREE.Mesh(new THREE.ConeGeometry(.9,.35,3).rotateY(Math.PI/2),new THREE.MeshStandardMaterial({color:0x201e2b}));this.group.add(this.captainHat);
    this.captainHook = new THREE.Mesh(new THREE.TorusGeometry(.22,.06,6,12,Math.PI*1.5),new THREE.MeshStandardMaterial({color:0xc9d9da,metalness:.7,roughness:.3}));this.group.add(this.captainHook);
    for(const mesh of[this.boats,this.bodies,this.stripes,this.hats,this.eye,this.swords])mesh.frustumCulled=false;
    this.chest = new THREE.Group();this.chest.add(new THREE.Mesh(new THREE.BoxGeometry(1.05,.7,.75),new THREE.MeshStandardMaterial({color:0xa76b32})));
    for(const x of[-.37,.37]){const band=new THREE.Mesh(new THREE.BoxGeometry(.1,.76,.8),new THREE.MeshStandardMaterial({color:0xe9be56,metalness:.5,roughness:.4}));band.position.x=x;this.chest.add(band);}this.group.add(this.chest);
    this.ball=new THREE.Mesh(new THREE.SphereGeometry(.22,8,6),new THREE.MeshBasicMaterial({color:0x272a30}));this.group.add(this.ball);
    this.splash=new THREE.Mesh(new THREE.RingGeometry(.35,.55,16).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0xd9f2ff,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));this.group.add(this.splash);
    const fg=new THREE.BufferGeometry();fg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(48*3),3));
    this.fireworks=new THREE.Points(fg,new THREE.PointsMaterial({color:0xffd77d,size:.16,transparent:true,opacity:.9,depthWrite:false}));this.group.add(this.fireworks);
    const stick=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,1.45,6),new THREE.MeshStandardMaterial({color:0xc6945c}));
    const head=new THREE.Mesh(new THREE.BoxGeometry(.5,.18,.22),new THREE.MeshStandardMaterial({color:0xe6dcad}));head.position.y=.7;this.mop.add(stick,head);this.mop.visible=false;
    this.mopSticks=new THREE.InstancedMesh(stick.geometry,stick.material,PIRATE_MAX);
    this.mopHeads=new THREE.InstancedMesh(head.geometry,head.material,PIRATE_MAX);
    this.mopSticks.count=this.mopHeads.count=0;this.mopSticks.frustumCulled=this.mopHeads.frustumCulled=false;
    this.group.add(this.mopSticks,this.mopHeads);
    this.panel=document.createElement('div');Object.assign(this.panel.style,{position:'absolute',top:'76px',left:'50%',transform:'translateX(-50%)',maxWidth:'min(650px,calc(100vw - 32px))',background:'rgba(37,24,23,.94)',color:'#fff0ce',padding:'12px 18px',borderRadius:'12px',textAlign:'center',pointerEvents:'none',fontSize:'14px',lineHeight:'1.5'});
    this.panel.setAttribute('role','status');this.title=document.createElement('div');this.title.style.fontWeight='900';this.detail=document.createElement('div');this.panel.append(this.title,this.detail);root.append(this.panel);
    this.button=document.createElement('button');this.button.type='button';this.button.textContent='🧹 Удар';Object.assign(this.button.style,{position:'absolute',right:'20px',bottom:'180px',minWidth:'76px',minHeight:'56px',borderRadius:'50%',background:'#553829',color:'#fff0ce',border:'2px solid #efc276',font:'700 15px Rubik,sans-serif',pointerEvents:'auto'});this.button.addEventListener('pointerdown',e=>{e.preventDefault();hooks.swing();});root.append(this.button);
    this.button.hidden=this.panel.hidden=true;
  }
  private makeShip(): THREE.Mesh {
    const g:THREE.BufferGeometry[]=[];
    const box=(x:number,y:number,z:number,w:number,h:number,d:number,c:number)=>g.push(paint(new THREE.BoxGeometry(w,h,d).translate(x,y,z),c));
    box(0,0,0,5,1.6,14,0x573629);box(0,1,0,5.3,.25,14.3,0xb78550);box(0,1.7,5,4.5,1.2,3,0x754730);
    for(const z of[-2.5,3]){g.push(paint(new THREE.CylinderGeometry(.13,.18,10,7).translate(0,5.6,z),0x68452f));box(0,6,z,7,.16,.16,0x68452f);box(0,5.4,z+.05,6,.08,3.5,0xe3d4b3);g.push(paint(new THREE.PlaneGeometry(6,4).translate(0,6,z+.12),0xe3d4b3));}
    box(1.1,10.1,-2.5,2.1,1.3,.08,0x171e25);g.push(paint(new THREE.SphereGeometry(.25,7,5).translate(1.1,10.25,-2.43),0xf0ece1));
    for(const side of[-1,1])for(const z of[-4,0,4])g.push(paint(new THREE.CylinderGeometry(.18,.2,1.7,7).rotateZ(Math.PI/2).translate(side*2.5,1.4,z),0x24262c));
    return new THREE.Mesh(mergeColored(g),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.78,side:THREE.DoubleSide}));
  }
  /** Attach to existing local avatar hand/arm Group (root owns Avatar). Set pose when no hand anchor exists. */
  attachMop(parent: THREE.Object3D): void { parent.add(this.mop);this.mop.position.set(.55,.65,-.15);this.mop.rotation.z=-.3; }
  setDefenders(rows:readonly {id:number;x:number;y:number;z:number;yaw:number;eligible:boolean}[],localId:number):void{
    let n=0;
    if(this.state.phase==='warn'||this.state.phase==='raid')for(const p of rows){
      if(!p.eligible||p.id===localId||n>=PIRATE_MAX)continue;
      const x=p.x+Math.cos(p.yaw)*.65,z=p.z-Math.sin(p.yaw)*.65;
      _dummy.position.set(x,p.y+.85,z);_dummy.rotation.set(0,p.yaw,-.25);_dummy.scale.set(1,1,1);_dummy.updateMatrix();this.mopSticks.setMatrixAt(n,_dummy.matrix);
      _dummy.position.y+=.7;_dummy.updateMatrix();this.mopHeads.setMatrixAt(n++,_dummy.matrix);
    }
    this.mopSticks.count=this.mopHeads.count=n;this.mopSticks.instanceMatrix.needsUpdate=this.mopHeads.instanceMatrix.needsUpdate=true;
  }
  set(view:PirateView):void{this.state=view;}
  setTail(tail:PirateTail,tick:number):void{
    const now=new Set(tail.pirates.map(p=>p.id));
    if(tail.visible&&this.tailState.visible&&this.state.phase==='raid')for(const[id,p]of this.previous)if(!now.has(id)&&this.fallen.length<PIRATE_MAX)this.fallen.push({...p,at:tick});
    this.previous.clear();for(const p of tail.pirates)this.previous.set(p.id,{x:p.x,z:p.z,captain:p.captain});
    this.tailState={...tail,knock:{...tail.knock},pirates:tail.pirates.map(p=>({...p}))};
  }
  swung(tick:number):void{this.swingUntil=tick+18;this.hooks.sound('mop');}
  update(tick:number,_dt:number,camera:THREE.Camera,eligible:boolean,touch=false):void{
    const v=this.state,t=this.tailState,visible=eligible&&v.phase!=='idle'&&t.visible;this.group.visible=visible;this.panel.hidden=!visible;this.button.hidden=!visible||v.phase!=='raid'||!touch;this.mop.visible=visible&&(v.phase==='warn'||v.phase==='raid');
    if(!visible)return;
    if(v.phase!==this.lastPhase){this.lastPhase=v.phase;if(v.phase==='warn')this.hooks.sound('horn');if(v.phase==='end')this.hooks.sound(v.win?'victory':'loss');}
    const elapsed=(tick-v.start)/60,shipZ=v.phase==='warn'?150-(150-PIRATE_SHIP.z)*Math.min(1,elapsed/40):v.phase==='end'?PIRATE_SHIP.z+elapsed*5:PIRATE_SHIP.z;
    this.ship.position.set(PIRATE_SHIP.x,WATER_Y+1+Math.sin(tick*.02)*.12,shipZ);this.ship.rotation.z=Math.sin(tick*.013)*.025;
    for(let i=0;i<3;i++){_dummy.position.set(PIRATE_LANDINGS[i].x,WATER_Y+.3,23+Math.sin(tick*.02+i)*.1);_dummy.rotation.set(0,0,0);_dummy.scale.set(1,1,1);_dummy.updateMatrix();this.boats.setMatrixAt(i,_dummy.matrix);}this.boats.instanceMatrix.needsUpdate=true;
    let n=0,hats=0;this.captainHat.visible=this.captainHook.visible=false;
    for(const p of t.pirates){const scale=p.captain?1.45:1,far=Math.hypot(camera.position.x-p.x,camera.position.z-p.z)>60,bob=far?0:Math.sin(tick*.2+p.id)*.045;
      _dummy.position.set(p.x,.85*scale+bob,p.z);_dummy.rotation.set(0,p.yaw,0);_dummy.scale.setScalar(scale);_dummy.updateMatrix();this.bodies.setMatrixAt(n,_dummy.matrix);this.bodies.setColorAt(n,_color.setHex(p.rage?0xd56860:p.captain?0x9d88bc:0x91b19c));
      _dummy.position.y=.77*scale+bob;_dummy.updateMatrix();this.stripes.setMatrixAt(n,_dummy.matrix);
      _dummy.position.set(p.x-Math.sin(p.yaw)*.52*scale,1.04*scale+bob,p.z-Math.cos(p.yaw)*.52*scale);_dummy.updateMatrix();this.eye.setMatrixAt(n,_dummy.matrix);
      _dummy.position.set(p.x,0,p.z);_dummy.updateMatrix();this.swords.setMatrixAt(n,_dummy.matrix);
      if(p.captain){this.captainHat.position.set(p.x,1.9*scale+bob,p.z);this.captainHat.rotation.y=p.yaw;this.captainHat.visible=true;this.captainHook.visible=true;this.captainHook.position.set(p.x+Math.cos(p.yaw)*1.05,1.2,p.z-Math.sin(p.yaw)*1.05);this.captainHook.rotation.y=p.yaw;}
      else{_dummy.position.set(p.x,1.49+bob,p.z);_dummy.updateMatrix();this.hats.setMatrixAt(hats++,_dummy.matrix);}n++;
    }
    this.stripes.count=this.eye.count=this.swords.count=n;this.hats.count=hats;
    for(let i=this.fallen.length-1;i>=0;i--){const f=this.fallen[i],age=(tick-f.at)/60;if(age>1){this.fallen.splice(i,1);continue;}_dummy.position.set(f.x,.6+Math.sin(age*Math.PI)*.4,f.z);_dummy.rotation.set(age*5,0,age*4);_dummy.scale.setScalar((f.captain?1.45:1)*(1-age));_dummy.updateMatrix();this.bodies.setMatrixAt(n,_dummy.matrix);this.bodies.setColorAt(n++,_color.setHex(0xbab9ac));}
    this.bodies.count=n;for(const mesh of[this.bodies,this.stripes,this.eye,this.swords,this.hats])mesh.instanceMatrix.needsUpdate=true;if(this.bodies.instanceColor)this.bodies.instanceColor.needsUpdate=true;
    this.chest.position.set(t.chestX,t.carrier?1.2:.4,t.chestZ);if(v.phase==='end'&&!v.win)this.chest.position.set(PIRATE_SHIP.x,2,shipZ);
    const cycle=Math.floor(tick/480),part=(tick%480)/60;this.ball.visible=v.phase==='raid'&&part<1.7;this.splash.visible=v.phase==='raid'&&part>=1.7&&part<2.3;
    // Purely cosmetic projectile always lands at sea, never at a participant or memorial.
    if(this.ball.visible){this.ball.position.set(PIRATE_SHIP.x+Math.sin(cycle)*5,2+Math.sin(part/1.7*Math.PI)*4,shipZ-part*8);if(cycle!==this.cannon){this.cannon=cycle;this.hooks.sound('cannon');}}
    this.splash.position.set(PIRATE_SHIP.x+Math.sin(cycle)*5,WATER_Y+.03,PIRATE_SHIP.z-13.6);this.splash.scale.setScalar(1+Math.max(0,part-1.7)*5);
    this.fireworks.visible=v.phase==='end'&&v.win&&elapsed<5;if(this.fireworks.visible){const a=this.fireworks.geometry.getAttribute('position') as THREE.BufferAttribute;for(let i=0;i<a.count;i++){const ang=i*2.399,r=((elapsed+i*.035)%2)*4;a.setXYZ(i,4+Math.cos(ang)*r,4+Math.sin(ang*2)*r+elapsed,8+Math.sin(ang)*r);}a.needsUpdate=true;}
    this.mop.rotation.x=tick<this.swingUntil?Math.sin((this.swingUntil-tick)/18*Math.PI)*1.1:0;
    this.title.textContent=v.phase==='warn'?`🏴‍☠️ Высадка через ${Math.max(0,Math.ceil((v.end-tick)/60))} с`:v.phase==='raid'?`🏴‍☠️ Волна ${v.wave}/3 · ${t.pirates.length} пиратов · ${Math.max(0,Math.ceil((v.end-tick)/60))} с`:v.win?'🎆 Касса спасена!':'🏴‍☠️ Пираты забрали кассу';
    this.detail.textContent=v.phase==='end'?v.results.length?v.results.map(r=>`${r.nick}: ${r.kos} сбито · +${r.tokens}${r.mvp?' · лучший':''}`).join(' / '):'Не было попаданий — без наград':t.carrier?'Носильщик несёт кассу! Сбей его · ЛКМ — швабра':v.phase==='warn'?'ЛКМ — удар шваброй · 3 попадания, капитану 12':'ЛКМ — удар раз в 0,5 с · касса в центре площади';
  }
  dispose():void{this.panel.remove();this.button.remove();this.mop.removeFromParent();this.group.removeFromParent();const geos=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>();for(const root of[this.group,this.mop])root.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Points){geos.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);}});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());}
}
