const overlap=(a,b,c,d)=>Math.max(0,Math.min(b,d)-Math.max(a,c));
function merge(intervals){const out=[];for(const pair of intervals.filter(p=>p[1]>p[0]).sort((a,b)=>a[0]-b[0])){const last=out.at(-1);if(last&&pair[0]<=last[1])last[1]=Math.max(last[1],pair[1]);else out.push([...pair]);}return out;}
// Arithmetic work sensitivity only: finite scheduled throws, autonomous towers,
// and explicit manual outages. No wave pathing, spawn queue or victory claim.
export function solve(input){
 const {hp,n,regular,event,eventStart=12,eventSeconds=0,jobs=0,deaths=0,returnSeconds=5,grenadeStart=12,grenadeCooldown=.8,grenadeFuse=1.4}=input;
 const end=eventStart+eventSeconds,outages=Array.from({length:n},()=>[]);
 if(jobs)outages[0].push([eventStart,eventStart+jobs]);
 for(let i=0;i<Math.min(n,deaths);i++)outages[n-1-i].push([eventStart,eventStart+5+returnSeconds]);
 for(let i=0;i<n;i++)outages[i]=merge(outages[i]);
 const shots=[];for(let owner=0;owner<n;owner++){
  let last=-Infinity;for(let i=0;i<regular.grenadeCount;i++){
   let at=Math.max(grenadeStart+i*grenadeCooldown,last+grenadeCooldown);
   if(input.holdTwoForGate&&owner===0&&i<2)at=Math.max(at,eventStart+(i?3:1.6));
   const throwOutages=input.jobAllowsGrenades&&owner===0?merge(owner===n-1&&deaths?[[eventStart,eventStart+5+returnSeconds]]:[]):outages[owner];
   for(const [a,b]of throwOutages)if(at>=a&&at<b)at=b;
   last=at;const impact=at+grenadeFuse,q=impact>=eventStart&&impact<end?event:regular;
   shots.push({owner,throwAt:at,impactAt:impact,damage:regular.grenadeDamagePerTarget*q.crowd});
  }
 }
 shots.sort((a,b)=>a.impactAt-b.impactAt||a.owner-b.owner);
 const evaluate=T=>{
  const active=overlap(0,T,eventStart,end);let damage=n*((regular.player+regular.towers)*T+(event.player+event.towers-regular.player-regular.towers)*active),personSeconds=0;
  for(const periods of outages)for(const [a,b]of periods){const lost=overlap(0,T,a,b),eventLost=overlap(Math.max(0,a),Math.min(T,b),eventStart,end);personSeconds+=lost;damage-=regular.player*lost+(event.player-regular.player)*eventLost;}
  const used=shots.filter(s=>s.impactAt<=T+1e-9),grenadeDamage=used.reduce((sum,s)=>sum+s.damage,0);return {integratedDamage:Math.max(0,damage)+grenadeDamage,extraPersonSeconds:personSeconds,grenadeDamage,grenadesThrown:shots.filter(s=>s.throwAt<=T+1e-9).length,grenadesExploded:used.length};
 };
 let lo=0,hi=30;while(evaluate(hi).integratedDamage<hp&&hi<3600)hi*=2;
 for(let i=0;i<60;i++){const mid=(lo+hi)/2;if(evaluate(mid).integratedDamage>=hp)hi=mid;else lo=mid;}
 const seconds=hi;return {seconds,activeSeconds:overlap(0,seconds,eventStart,end),...evaluate(seconds),grenadeStockTeam:n*regular.grenadeCount,grenadeSchedule:shots,outages};
}
