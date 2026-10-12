import * as THREE from 'three';
import { buildFort, GATE, WALL_H } from '../../../shared/fortmap.ts';
import { Z_BATTERY, Z_SIEGE_TOWER, Z_SPRING, BOAT_ANCHOR_FLAG, ZS_SIEGE_ACTION, ZS_SIEGE_DEPLOY, ZS_SIEGE_OPEN } from '../../../shared/fortsiege.ts';
import { ZS_HOP, ZS_WALK } from '../../../shared/fort.ts';
import { CastleDecor } from '../castle.ts';
import { buildPreview, type MobAnim } from '../mobs/kit.ts';
import { WALKER_JELLY } from '../mobs/walker-jelly.ts';
import { SEA_BOAT } from '../mobs/sea-boat.ts';
import { mobRoot } from '../mobs/renderer.ts';
import { BoardingAnchors } from './anchors.ts';
import type { ApprovedMobRenderer } from './renderer.ts';

const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const matrix=new THREE.Matrix4();
export type SiegeScene='battery'|'tower'|'spring'|'anchor';
const anim:MobAnim={t:0,gait:0,speed:0,st:0,stT:0,hit:0,die:0,seed:.4,rage:false};

/** Review-only deterministic scene. Uses the game's castle, GLB clips, crew and ropes. */
export class SiegeScenarioStand {
  private castle:CastleDecor|null=null;
  private group=new THREE.Group();
  private readonly walkers=Array.from({length:3},()=>buildPreview(WALKER_JELLY));
  private readonly boat=buildPreview(SEA_BOAT);
  private readonly anchors:BoardingAnchors;
  private readonly shell:THREE.Mesh;
  private last=0;
  brokenAt=Infinity;
  scene:SiegeScene='battery';
  private readonly parent:THREE.Scene;
  private readonly models:ApprovedMobRenderer;
  constructor(parent:THREE.Scene,models:ApprovedMobRenderer){
    this.parent=parent;this.models=models;
    for(const w of this.walkers)this.group.add(w.group);
    this.group.add(this.boat.group);this.anchors=new BoardingAnchors(this.group);
    this.shell=new THREE.Mesh(new THREE.SphereGeometry(.22,12,8),new THREE.MeshStandardMaterial({color:0x3c302b,metalness:.25,roughness:.5}));this.group.add(this.shell);parent.add(this.group);this.hide();
  }
  start(scene:SiegeScene){this.scene=scene;this.brokenAt=Infinity;this.last=0;this.castle??=new CastleDecor(this.parent,buildFort());this.castle.root.visible=true;this.castle.gate.set(0,1,false, true);this.group.visible=true;}
  hide(){this.group.visible=false;if(this.castle)this.castle.root.visible=false;}
  interrupt(time:number){this.brokenAt=Math.min(time,this.brokenAt);}
  frame(t:number,dt:number):string{
    this.group.visible=true;if(this.castle){this.castle.root.visible=true;this.castle.update(dt,t);}
    for(const w of this.walkers)w.group.visible=false;this.boat.group.visible=false;this.shell.visible=false;this.anchors.begin();
    const kind=this.scene==='battery'?Z_BATTERY:this.scene==='tower'?Z_SIEGE_TOWER:Z_SPRING;
    const approach=3,deploy=this.scene==='battery'?6:this.scene==='spring'?2.4:4,wind=this.scene==='battery'?2.4:0,actionAt=approach+deploy+wind;
    const stopped=t>=this.brokenAt;
    let state='walk',local=t,text='Подходит';
    if(t>=approach){state='deploy';local=t-approach;text='Разворачивается · механизм можно сорвать';}
    if(t>=approach+deploy){state=wind?'windup':'attack';local=t-approach-deploy;text=wind?'Целится · сейчас выстрелит':'Путь открыт · начинается переброска';}
    if(t>=actionAt){state='attack';local=t-actionAt;text=this.scene==='battery'?'Выстрел · ядро уже в полёте':'Перебрасывает бойцов на стену';}
    if(this.scene==='battery'&&t>=actionAt+1.2){state='open';local=t-actionAt-1.2;text='Механизм открыт · расчёт перезаряжает';}
    if(stopped){state='death';local=t-this.brokenAt;text=this.scene==='anchor'?'Канат оборван · бойцы остаются в лодке':'Источник уничтожен · подготовка сорвана';}
    const x=this.scene==='tower'?-9:this.scene==='spring'?9:0;
    const z=this.scene==='battery'?-27:this.scene==='anchor'?27:-21.8;
    if(this.scene!=='anchor'){
      mobRoot(matrix,x,0,z-7*(1-clamp(Math.min(t,this.brokenAt)/approach)),Math.PI);
      this.models.addClip(kind,matrix,state,local);
    }
    Object.assign(anim,{t,gait:t,speed:t<approach?2.4:0,st:ZS_WALK,stT:local,die:0});
    if(this.scene==='battery'){
      const firedAt=actionAt;
      if(this.brokenAt>firedAt&&t>=firedAt&&t<firedAt+1.2){const u=(t-firedAt)/1.2;this.shell.visible=true;this.shell.position.set(0,1.03+(1.5-1.03)*u+Math.sin(u*Math.PI)*2,z+1.35+(GATE.face-z-1.35)*u);}
      if(this.brokenAt>firedAt&&this.last<firedAt+1.2&&t>=firedAt+1.2)this.castle?.gate.hit(.8);
    }else if(this.scene==='anchor'){
      const boatZ=29-6*clamp(t/approach);this.boat.group.visible=true;this.boat.group.position.set(-12,-.3,boatZ);this.boat.group.rotation.y=Math.PI;
      anim.stage=BOAT_ANCHOR_FLAG+3;anim.st=stopped?ZS_SIEGE_OPEN:t<3?ZS_WALK:t<7?ZS_SIEGE_DEPLOY:ZS_SIEGE_ACTION;anim.stT=stopped?t-this.brokenAt:Math.max(0,t-3);this.boat.update(anim);
      this.anchors.add(-12,-.3,boatZ,-12,WALL_H,14.5,anim.stage,anim.st,anim.stT);
      text=stopped?'Канат оборван · высадка сорвана':t<3?'Лодка подходит':t<7?'Якорь летит и цепляется за стену':'Бойцы идут по канату на стену';
    }
    if(this.scene!=='battery')for(let i=0;i<3;i++){
      const start=this.scene==='anchor'?7+i*1.2:actionAt+i*1.2;
      const u=clamp((t-start)/1.2),w=this.walkers[i];
      if(stopped&&this.brokenAt<start)continue;
      w.group.visible=t>Math.max(0,start-3)&&t<start+2.4;
      const sx=this.scene==='anchor'?-12:x+(i-1)*.55,sz=this.scene==='anchor'?23:z-1.5;
      const ez=this.scene==='anchor'?14.5:-16.4;
      w.group.position.set(sx,WALL_H*u+Math.sin(u*Math.PI)*(this.scene==='spring'?2.9:1.7),sz+(ez-sz)*u);
      w.group.rotation.y=this.scene==='anchor'?Math.PI:0;
      Object.assign(anim,{st:u>0&&u<1?ZS_HOP:ZS_WALK,stT:t-start,speed:2.5,gait:t,stage:0});w.update(anim);
    }
    this.anchors.end();this.last=t;return text;
  }
}
