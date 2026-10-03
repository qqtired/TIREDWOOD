import * as THREE from 'three';

export interface StartCircleOptions { x:number;z:number;r:number;color:number;label:string;subtitle?:string; }
export interface StartCircleStatus { left?:number;n?:number;max?:number;phase?:string;hint?:string; }

/** Shared visual only. Authority/countdown comes from the caller's server state. */
export class StartCircle {
  readonly group=new THREE.Group();
  private readonly ground:CanvasRenderingContext2D;
  private readonly sign:CanvasRenderingContext2D;
  private readonly groundTexture:THREE.CanvasTexture;
  private readonly signTexture:THREE.CanvasTexture;
  private readonly options:StartCircleOptions;
  private readonly accent:string;
  private readonly resources:Array<THREE.BufferGeometry|THREE.Material|THREE.Texture>=[];
  private key='';
  private disposed=false;

  constructor(scene:THREE.Scene,options:StartCircleOptions) {
    this.options=options;this.accent=`#${new THREE.Color(options.color).getHexString()}`;
    this.group.name=`start-circle-${options.label}`;this.group.position.set(options.x,0,options.z);
    this.group.visible=false;
    const ground=document.createElement('canvas');ground.width=512;ground.height=512;
    const sign=document.createElement('canvas');sign.width=768;sign.height=192;
    this.ground=ground.getContext('2d')!;this.sign=sign.getContext('2d')!;
    this.groundTexture=new THREE.CanvasTexture(ground);this.signTexture=new THREE.CanvasTexture(sign);
    for(const t of [this.groundTexture,this.signTexture]){t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;this.resources.push(t);}
    const ringGeo=new THREE.RingGeometry(options.r-.055,options.r,64).rotateX(-Math.PI/2);
    const ringMat=new THREE.MeshBasicMaterial({color:options.color,transparent:true,opacity:.62,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    const ring=new THREE.Mesh(ringGeo,ringMat);ring.position.y=.016;ring.renderOrder=2;
    const discGeo=new THREE.CircleGeometry(options.r-.07,64).rotateX(-Math.PI/2);
    const discMat=new THREE.MeshBasicMaterial({map:this.groundTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
    const disc=new THREE.Mesh(discGeo,discMat);disc.position.y=.019;disc.renderOrder=3;
    // A small tilted placard is kept at the side of the circle. Its slim support fixes it to the floor.
    const sx=options.r+.22,sz=.05;
    const poleGeo=new THREE.CylinderGeometry(.019,.024,.67,6);
    const poleMat=new THREE.MeshStandardMaterial({color:0x506260,roughness:.88});
    const pole=new THREE.Mesh(poleGeo,poleMat);pole.position.set(sx,.335,sz);pole.castShadow=true;
    const signGeo=new THREE.PlaneGeometry(.98,.245);
    const signMat=new THREE.MeshBasicMaterial({map:this.signTexture,transparent:true,side:THREE.FrontSide,depthWrite:false});
    // Each side reads its own front-facing UVs; DoubleSide would mirror the text from behind.
    const placard=new THREE.Group();placard.position.set(sx,.71,sz);placard.rotation.set(-.18,Math.PI,0);
    for(const side of [-1,1]) {
      const face=new THREE.Mesh(signGeo,signMat);face.position.z=side*.003;
      if(side<0)face.rotation.y=Math.PI;
      placard.add(face);
    }
    this.resources.push(ringGeo,ringMat,discGeo,discMat,poleGeo,poleMat,signGeo,signMat);
    this.group.add(ring,disc,pole,placard);scene.add(this.group);this.status({});
  }

  setVisible(on:boolean):void {if(!this.disposed)this.group.visible=on;}

  status(value:StartCircleStatus):void {
    if(this.disposed)return;
    const left=typeof value.left==='number'&&Number.isFinite(value.left)?Math.max(0,Math.ceil(value.left)):null;
    const n=typeof value.n==='number'&&Number.isFinite(value.n)?Math.max(0,Math.floor(value.n)):null;
    const max=typeof value.max==='number'&&Number.isFinite(value.max)?Math.max(0,Math.floor(value.max)):null;
    const phase=value.phase??'',hint=value.hint??this.options.subtitle??'';
    const key=JSON.stringify([left,n,max,phase,hint]);if(key===this.key)return;this.key=key;
    const c=this.ground;c.clearRect(0,0,512,512);
    c.beginPath();c.arc(256,256,244,0,Math.PI*2);c.fillStyle='rgba(21,43,45,.12)';c.fill();
    c.strokeStyle=this.accent;c.globalAlpha=.36;c.lineWidth=3;c.setLineDash([10,14]);c.beginPath();c.arc(256,256,214,0,Math.PI*2);c.stroke();c.setLineDash([]);c.globalAlpha=1;
    c.textAlign='center';c.textBaseline='middle';
    c.fillStyle='#f8eed6';c.shadowColor='rgba(15,29,32,.55)';c.shadowBlur=5;
    const count=left!==null&&left>0?String(left):n!==null?`${n}${max!==null?` / ${max}`:''}`:'СТАРТ';
    fit(c,count,left!==null&&left>0?190:92,385);c.fillText(count,256,248);
    c.shadowBlur=0;c.fillStyle=this.accent;fit(c,this.options.label.toUpperCase(),35,360);c.fillText(this.options.label.toUpperCase(),256,122);
    c.fillStyle='#e8ddc3';
    const under=left!==null&&left>0?'до старта':hint||phase;
    fit(c,under,29,360);c.fillText(under,256,373);
    this.groundTexture.needsUpdate=true;
    const s=this.sign;s.clearRect(0,0,768,192);
    s.fillStyle='rgba(31,53,52,.92)';s.beginPath();s.roundRect(0,0,768,192,18);s.fill();
    s.fillStyle=this.accent;s.fillRect(20,24,6,144);s.textAlign='center';s.textBaseline='middle';
    s.fillStyle='#f7eed9';fit(s,this.options.label,49,690);s.fillText(this.options.label,394,64);
    s.fillStyle='#c9d4c5';fit(s,hint||this.options.subtitle||phase||'Встаньте в круг',29,690);s.fillText(hint||this.options.subtitle||phase||'Встаньте в круг',394,131);
    this.signTexture.needsUpdate=true;
  }

  /** Kept for uniform caller loops; fixed geometry and state-driven canvases need no frame redraw. */
  update(_dt:number):void {}

  dispose():void {
    if(this.disposed)return;this.disposed=true;this.group.removeFromParent();
    for(const resource of this.resources)resource.dispose();this.resources.length=0;
  }
}
function fit(c:CanvasRenderingContext2D,text:string,size:number,maxWidth:number):void {
  c.font=`800 ${size}px Rubik,system-ui,sans-serif`;const width=c.measureText(text).width;
  if(width>maxWidth)c.font=`800 ${Math.max(13,Math.floor(size*maxWidth/width))}px Rubik,system-ui,sans-serif`;
}
