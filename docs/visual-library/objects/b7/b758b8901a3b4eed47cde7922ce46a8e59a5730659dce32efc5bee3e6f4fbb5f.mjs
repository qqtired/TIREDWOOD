export const PUMP_POSE_CONTRACT={spawn:[-5,0,-22],rootYaw:0,scale:1,target:[-4.9,4.95,-18.8],filmHalfWidth:.95,filmHalfHeight:.625,paintAt:4,pressureEnd:17,reverseTarget:[-4.55,.05,-25.1],reverseSeconds:6};
export function barrelRay(pivot,tip,{target=PUMP_POSE_CONTRACT.target}={}){
 const d=tip.map((v,i)=>v-pivot[i]),length=Math.hypot(...d);if(length<1e-7)return {valid:false,reason:'Zero barrel axis'};const direction=d.map(v=>v/length),distance=(target[2]-tip[2])/direction[2];if(!Number.isFinite(distance)||distance<0)return {valid:false,reason:'Barrel points away from target plane',from:tip,direction};
 const to=tip.map((v,i)=>v+direction[i]*distance),error=Math.hypot(to[0]-target[0],to[1]-target[1]);return {valid:true,from:[...tip],to,direction,distance,error,hitsTarget:Math.abs(to[0]-target[0])<=PUMP_POSE_CONTRACT.filmHalfWidth&&Math.abs(to[1]-target[1])<=PUMP_POSE_CONTRACT.filmHalfHeight};
}
export function pumpScenePose(entry,state){
 const mapping=entry.sceneClips?.pump??entry.sceneClips;if(!mapping)return {ready:false,reason:'Native aimed pump clips are not exported'};
 const aliases={windup:'prepare',attack:'contact',redirectWindup:'redirectPrepare',redirectAttack:'redirectContact'};
 const get=key=>{const name=mapping[key]??mapping[aliases[key]]??(['idle','hit','death'].includes(key)?entry.id+'_'+key:null),timing=entry.clipTimings.find(c=>c.name===name);if(!name||!timing)return null;return {name,timing,span:timing.inputEnd-timing.inputStart};};
 const cast=get('attack'),prepare=get('windup');if(!cast||!prepare)return {ready:false,reason:'Native forward aim is incomplete'};
 const t=state.t,at=state.choiceAt??Infinity,done=at+(state.choice==='smash'?.5:state.choice==='wash'?4:3),select=(key,elapsed,loop=false,emitting=false)=>{const clip=get(key);if(!clip)return {ready:false,reason:'Native clip missing: '+key};const sample=loop?Math.max(0,elapsed)%clip.span:Math.max(0,Math.min(clip.span,elapsed));return {ready:true,clip:clip.name,time:clip.timing.inputStart+sample,emitting,direction:key.startsWith('redirect')?'reverse':'forward'};};
 if(state.choice==='redirect'&&t>=at){const turn=get('redirectWindup'),reverse=get('redirectAttack');if(!turn||!reverse)return {ready:false,reason:'Native reverse aim is incomplete'};if(Math.abs(turn.span-3)>2e-5||Math.abs(reverse.span-6)>2e-5)return {ready:false,reason:'Reverse clips must match unchanged 3s work / 6s flow'};if(t<done)return select('redirectWindup',t-at);if(t<done+6)return select('redirectAttack',t-done,false,true);return get('redirectRecover')?select('redirectRecover',t-done-6):select('redirectAttack',reverse.span);}
 if(state.choice&&t>=done)return select('recover',t-done);
 // The native full-on scale key is input .375; align it to existing film t4.
 // No clip speed change: sample real input times including export offset.
 const aim=entry.sceneAim?.pump??entry.sceneAim??{},fullOn=aim.forwardEmissionFullOn??.375,off=aim.forwardEmissionOff??.583333334,attackStart=PUMP_POSE_CONTRACT.paintAt-(fullOn-cast.timing.inputStart);
 if(t<attackStart-prepare.span)return select('idle',t,true);
 if(t<attackStart)return select('windup',t-(attackStart-prepare.span));
 if(t<attackStart+cast.span){const out=select('attack',t-attackStart);out.emitting=out.time>=fullOn&&out.time<=off+1e-9;return out;}
 if(t<PUMP_POSE_CONTRACT.pressureEnd)return select('attack',cast.span);
 return select('recover',t-PUMP_POSE_CONTRACT.pressureEnd);
}
