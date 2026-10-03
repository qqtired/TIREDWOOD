import * as THREE from 'three';
import { FISH_PODIUM, FISH_PODIUM_STEPS, FISH_PODIUM_STEP_WIDTH } from '../../shared/fishplaces.ts';
import { FISH, fmtWeight } from '../../shared/fishing.ts';
import type { FishPodiumCatch } from '../../shared/messages.ts';
import { mergeColored, paint, place } from '../render/kit.ts';
import { makeFish3D } from './fishart.ts';

const COLORS = [0xd6bb62, 0xb9c5c3, 0xb78d60, 0x9bada2, 0x879eaa];
const PANEL_WIDTH=.94, PANEL_HEIGHT=.56, RANK_HEIGHT=.16, RANK_GAP=.025;
const PANEL_PX_W=768, PANEL_PX_H=448;
/** Front labels clear the 20 cm base on every rank, including the shortest step. */
function labelBottom(stepHeight:number):number { return Math.max(.25,stepHeight-PANEL_HEIGHT-.12); }
function labelTop(stepHeight:number):number { return labelBottom(stepHeight)+PANEL_HEIGHT+RANK_GAP+RANK_HEIGHT; }
/** Display metres from absolute mass, never from the percentage of a species' adult weight.
 * A slightly stronger than cube-root curve makes trophy weights readable at walking distance.
 * The small additive floor keeps tiny catches visible; it does not flatten their growth. */
export function podiumFishLength(sp: number, grams: number): number {
  const f=FISH[sp];
  const coefficient = f?.shape==='shark' ? .18 : f?.shape==='long' || f?.shape==='eel' ? .24 : f?.shape==='sword' ? .15 : f?.shape==='flat' || f?.shape==='ray' ? .13 : .125;
  // Malformed legacy weights must not turn a trophy into geometry across the whole harbour.
  const g=Math.min(f?.g[1] ?? 1000, Number.isFinite(grams) ? Math.max(1,grams) : 1);
  return .12 + coefficient*Math.pow(g/1000,.4);
}

const HOLDER_GEOMETRY = new THREE.BoxGeometry(1,1,1);
const HOLDER_MATERIAL = new THREE.MeshStandardMaterial({color:0x536357,metalness:.55,roughness:.5});
function holderBox(w:number,h:number,d:number,x:number,y:number,z:number):THREE.Mesh {
  const mesh=new THREE.Mesh(HOLDER_GEOMETRY,HOLDER_MATERIAL);
  mesh.scale.set(w,h,d);mesh.position.set(x,y,z);mesh.castShadow=true;
  return mesh;
}

/** Head-up trophy mount: growth uses height rather than spilling over adjacent ranks or the path.
 * The model keeps its original proportions. Cached fish and stand resources are shared. */
export function makePodiumFish(sp:number,grams:number,step:Pick<typeof FISH_PODIUM_STEPS[number],'x'|'h'>):THREE.Group {
  const trophy=new THREE.Group();trophy.name='podium-trophy';trophy.position.set(step.x,step.h,0);
  const model=makeFish3D(sp,grams);model.name='podium-fish';
  // Remove the independent hand-held mass cap before measuring actual species geometry.
  model.scale.setScalar(1);
  const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  model.scale.setScalar(podiumFishLength(sp,grams)/Math.max(size.x,size.z,.01));
  model.rotation.z=Math.PI/2;
  const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3());
  // Short steps need a taller rear support so their labels never conceal a small catch.
  const fishBottom=Math.max(.12,labelTop(step.h)+.06-step.h);
  model.position.set(-center.x,fishBottom-box.min.y,-center.z);
  const height=box.max.y-box.min.y;
  trophy.add(model);
  // A foot on the existing step, rear post and two short arms visibly support each catch.
  trophy.add(holderBox(.34,.045,.3,0,.025,.45));
  const top=fishBottom+height*.72;
  trophy.add(holderBox(.035,top,.035,0,top/2,.6));
  for(const part of [.28,.68]) trophy.add(holderBox(.10,.025,.6,0,fishBottom+height*part,.30));
  return trophy;
}

/** The server orders today's individual catches. One player may occupy several positions. */
export class FishPodium3D {
  readonly group = new THREE.Group();
  private readonly catches: Array<THREE.Group | null> = Array(5).fill(null);
  private readonly panels: Array<{ ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture }> = [];
  private readonly titleRail = new THREE.Group();
  private readonly titlePosts: THREE.Mesh[] = [];
  private key = '';

  constructor(scene: THREE.Scene) {
    this.group.name = 'daily-catch-podium';
    this.group.position.set(FISH_PODIUM.x, FISH_PODIUM.y, FISH_PODIUM.z);
    this.group.rotation.y = FISH_PODIUM.yaw;
    const parts: THREE.BufferGeometry[] = [paint(new THREE.BoxGeometry(FISH_PODIUM.w,FISH_PODIUM.h,FISH_PODIUM.d).translate(0,FISH_PODIUM.h/2,0),0x514e44)];
    for (const step of FISH_PODIUM_STEPS) {
      const {x,h,rank}=step;
      parts.push(place(paint(new THREE.BoxGeometry(FISH_PODIUM_STEP_WIDTH,h-FISH_PODIUM.h,1.28),rank===0 ? 0x8b7957 : 0x6e7767),x,(h+FISH_PODIUM.h)/2,0));
      parts.push(place(paint(new THREE.BoxGeometry(.96,.035,1.26),0xa7a08a),x,h-.018,0));
      parts.push(place(paint(new THREE.BoxGeometry(.9,.035,.028),COLORS[rank]),x,h-.04,-.65));
      const canvas=document.createElement('canvas'); canvas.width=PANEL_PX_W;canvas.height=PANEL_PX_H;
      const ctx=canvas.getContext('2d')!;
      const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
      this.panels[rank]={ctx,tex};
      const bottom=labelBottom(h),panelY=bottom+PANEL_HEIGHT/2;
      const labels=new THREE.Group();labels.name=`podium-label-${rank+1}`;
      // Slim stems are fixed to the base; front faces remain inside the original 1.4 m depth.
      for(const dx of [-.32,.32]) labels.add(holderBox(.025,labelTop(h)-FISH_PODIUM.h,.025,x+dx,(labelTop(h)+FISH_PODIUM.h)/2,-.652));
      labels.add(holderBox(PANEL_WIDTH+.025,PANEL_HEIGHT+.025,.022,x,panelY,-.665));
      const panel=new THREE.Mesh(new THREE.PlaneGeometry(PANEL_WIDTH,PANEL_HEIGHT),new THREE.MeshBasicMaterial({map:tex,toneMapped:false}));
      panel.name='podium-catch-label';panel.position.set(x,panelY,-.678);panel.rotation.y=Math.PI;
      labels.add(panel);
      const rankCanvas=document.createElement('canvas');rankCanvas.width=640;rankCanvas.height=110;
      const rankContext=rankCanvas.getContext('2d')!;
      rankContext.fillStyle=`#${COLORS[rank].toString(16)}`;rankContext.fillRect(0,0,640,110);
      rankContext.fillStyle='#182820';rankContext.textAlign='center';rankContext.textBaseline='middle';rankContext.font='900 72px Rubik,system-ui,sans-serif';
      rankContext.fillText(`${rank+1} МЕСТО`,320,57);
      const rankTexture=new THREE.CanvasTexture(rankCanvas);rankTexture.colorSpace=THREE.SRGBColorSpace;rankTexture.anisotropy=4;
      const rankY=bottom+PANEL_HEIGHT+RANK_GAP+RANK_HEIGHT/2;
      labels.add(holderBox(PANEL_WIDTH+.025,RANK_HEIGHT+.018,.022,x,rankY,-.665));
      const rankPanel=new THREE.Mesh(new THREE.PlaneGeometry(PANEL_WIDTH,RANK_HEIGHT),new THREE.MeshBasicMaterial({map:rankTexture,toneMapped:false}));
      rankPanel.name='podium-rank-label';rankPanel.position.set(x,rankY,-.678);rankPanel.rotation.y=Math.PI;
      labels.add(rankPanel);this.group.add(labels);
    }
    // The title belongs to a real rear rail with two uprights, never a floating caption.
    this.titleRail.name='podium-title-rail';
    for (const x of [-2.53,2.53]) {
      const post=holderBox(.045,1,.045,x,.5,.61);
      post.name='podium-title-post';
      this.titlePosts.push(post);this.group.add(post);
    }
    const rail=new THREE.Mesh(new THREE.BoxGeometry(5.15,.29,.055),new THREE.MeshStandardMaterial({color:0x30473f,roughness:.9}));
    rail.position.z=.61;this.titleRail.add(rail);this.group.add(this.titleRail);
    const base=new THREE.Mesh(mergeColored(parts),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9}));
    base.castShadow=true;base.receiveShadow=true;this.group.add(base);
    const title=document.createElement('canvas');title.width=1536;title.height=128;
    const c=title.getContext('2d')!;c.fillStyle='#30473f';c.fillRect(0,0,1536,128);
    c.fillStyle='#e8dbb8';c.textAlign='center';c.textBaseline='middle';c.font='700 47px Rubik,system-ui,sans-serif';
    c.fillText('КРУПНЕЙШИЕ РЫБЫ СЕГОДНЯ',768,43);
    c.font='25px Rubik,system-ui,sans-serif';c.fillText('5 уловов · новый день по Москве — новый подиум',768,96);
    const texture=new THREE.CanvasTexture(title);texture.colorSpace=THREE.SRGBColorSpace;
    const label=new THREE.Mesh(new THREE.PlaneGeometry(5.06,.265),new THREE.MeshStandardMaterial({map:texture,roughness:.9}));
    label.position.set(0,0,.579);label.rotation.y=Math.PI;this.titleRail.add(label);
    this.group.visible=false;scene.add(this.group);this.set([]);
  }

  set(rows: readonly FishPodiumCatch[]): void {
    const key=JSON.stringify(rows.slice(0,5));if(key===this.key)return;this.key=key;
    let highest=1.3;
    for(let rank=0;rank<5;rank++) {
      const old=this.catches[rank];if(old)this.group.remove(old); // cached species geometry/materials are shared
      this.catches[rank]=null;
      const step=FISH_PODIUM_STEPS.find((s)=>s.rank===rank)!;
      const row=rows[rank],{ctx:c,tex}=this.panels[rank];
      c.fillStyle='#192f27';c.fillRect(0,0,PANEL_PX_W,PANEL_PX_H);c.textAlign='center';c.textBaseline='middle';
      c.fillStyle='#fff2ce';
      if(row&&FISH[row.sp]) {
        const model=makePodiumFish(row.sp,row.g,step);
        highest=Math.max(highest,new THREE.Box3().setFromObject(model).max.y);
        this.group.add(model);this.catches[rank]=model;
        const weight=fmtWeight(row.g);
        fit(c,weight,110);c.fillText(weight,PANEL_PX_W/2,97);
        fit(c,row.nick,78);c.fillText(row.nick,PANEL_PX_W/2,237);
        c.fillStyle='#cfdfce';fit(c,FISH[row.sp].name,46);c.fillText(FISH[row.sp].name,PANEL_PX_W/2,365);
      } else {
        fit(c,'Ждёт улова',78);c.fillText('Ждёт улова',PANEL_PX_W/2,PANEL_PX_H/2);
      }
      tex.needsUpdate=true;
    }
    // Grow the existing rear frame upward only; its footprint and the five collision steps stay put.
    this.titleRail.position.y=highest+.28;
    for(const post of this.titlePosts) {post.scale.y=highest+.42;post.position.y=post.scale.y/2;}
  }
}
function fit(c: CanvasRenderingContext2D,text:string,size:number):void {
  c.font=`700 ${size}px Rubik,system-ui,sans-serif`;
  const width=c.measureText(text).width;
  if(width>PANEL_PX_W-48)c.font=`700 ${Math.max(23,Math.floor(size*(PANEL_PX_W-48)/width))}px Rubik,system-ui,sans-serif`;
}
