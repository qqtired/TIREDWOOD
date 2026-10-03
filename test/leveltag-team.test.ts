import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawLevelTag } from '../client/render/leveltag.ts';
import { frameForLevel } from '../shared/levels.ts';

// Record the real canvas drawing contract without loading a WebGL scene or replacing the renderer.
function canvasRecorder() {
 const strokes: unknown[]=[],fills: unknown[]=[],texts: {text:string;color:unknown}[]=[];
 const state: Record<string, unknown>={};
 const ctx=new Proxy(state,{
  get(target,key:string){
   if(key==='createLinearGradient')return()=>({stops:[] as [number,string][],addColorStop(n:number,color:string){this.stops.push([n,color]);}});
   if(key==='measureText')return(text:string)=>({width:text.length*12});
   if(key==='stroke')return()=>strokes.push(state.strokeStyle);
   if(key==='fill')return()=>fills.push(state.fillStyle);
   if(key==='fillText')return(text:string)=>texts.push({text,color:state.fillStyle});
   return key in target?target[key]:()=>{};
  },
  set(target,key:string,value){target[key]=value;return true;},
 }) as unknown as CanvasRenderingContext2D;
 return{ctx,strokes,fills,texts};
}
test('prestige outline remains visible in both teams while team color remains a separate signal',()=>{
 for(const level of[5,15,30,50])for(const team of[0,1] as const)for(const mate of[false,true]){
  const c=canvasRecorder(),tier=frameForLevel(level);drawLevelTag(c.ctx,384,80,{name:'Игрок',level,team,mate});
  assert.ok(c.strokes.some(s=>typeof s==='object'&&s!==null&&(s as {stops:[number,string][]}).stops?.some(([,color])=>color===tier.color)),`level${level}/team${team}: prestige outline missing`);
  assert.ok(c.fills.includes(team===0?'#a9b6ff':'#ffc38a'),`team${team}: color strip missing`);
  assert.equal(c.texts.find(t=>t.text==='Игрок')!.color,mate?'#fff6e8':team===0?'#a9b6ff':'#ffc38a');
 }
});
