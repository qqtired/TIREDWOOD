// Хапуга и Грибовод: перенос уже лежащего опыта и конечный бюджет видимых ростков.
import { fx, makeMob, newId, hasBuff } from './core.ts';
import { mobDef, mobIndex } from './data.ts';
import { addMark, addContactMark, canSpawn, rageRule } from './mobs.ts';
import { blocked } from './map.ts';
import { pickupRadius } from './pickups.ts';
import type { DgGem, DgMob, DgSim } from './types.ts';
import { ticks, wrapD, wrapP } from './util.ts';

/** Значения gem.v ещё без gainMul/Подковы: возвращаем точно их, без повторного начисления. */
export function spillHoard(sim: DgSim, m: DgMob): void {
  const n = m.storedXp ?? 0;
  if (n <= 0) return;
  m.storedXp = 0;
  // Возвращаем у ног, даже если общий merge-cap уже достигнут. Следующие обычные drops могут слиться сюда.
  // Нельзя слить возвращаемый опыт в далёкий gem: игрок должен видеть результат Q здесь.
  sim.gems.push({id: newId(sim), x:m.x, z:m.z, v:n, fly:0});
  m.spillAt = sim.t;
  if (!m.die) {
    m.attackAt = sim.t; m.attackKind = 'spill'; m.attackStep = 0; m.st = 'rest'; m.stT = sim.t;
    for (const mk of sim.marks) if (mk.src === m.id) mk.t1 = sim.t - 1;
  }
  fx(sim, {k:'atk', id:m.id, what:'spill'});
}

function begin(sim:DgSim,m:DgMob,kind:string,ox:number,oz:number):void {
  m.attackAt=sim.t; m.attackKind=kind; m.attackStep=0; m.stT=sim.t;
  m.ax=m.dx=ox; m.az=m.dz=oz; m.vx=m.vz=0;
  m.st=kind==='collect'?'cast':kind==='plant'?'summon':'wind';
  fx(sim,{k:'atk',id:m.id,what:kind});
}
function finish(sim:DgSim,m:DgMob):void {
  m.attackAt=sim.t; m.attackKind='recover'; m.st='rest'; m.stT=sim.t; m.attackStep=0;
}

function scoop(sim:DgSim,m:DgMob):number {
  if (hasBuff(sim, 'pull')) return 0;
  const c=mobDef('hapuga').collect!;
  let left=c.capacity-(m.storedXp??0);
  // Nearest first; stable id tie-break avoids array-order changes selecting another crystal.
  const pr=pickupRadius(sim);
  const eligible=sim.gems.filter(g=>loose(sim,g,pr) && wrapD(g.x-m.x)**2+wrapD(g.z-m.z)**2<=c.radius**2 && clearLine(m.x,m.z,g.x,g.z,.12))
    .sort((a,b)=>(wrapD(a.x-m.x)**2+wrapD(a.z-m.z)**2)-(wrapD(b.x-m.x)**2+wrapD(b.z-m.z)**2)||a.id-b.id);
  let collected=0;
  for(const g of eligible){
    if(left<=0)break;
    const n=Math.min(left,g.v); g.v-=n; left-=n; collected+=n; m.storedXp=(m.storedXp??0)+n;
    fx(sim,{k:'hoard',id:m.id,x:g.x,z:g.z,n});
  }
  sim.gems=sim.gems.filter(g=>g.v>0);
  if(collected>0)fx(sim,{k:'atk',id:m.id,what:'collect_scoop'});
  m.huntGem=0;m.huntScan=0;
  return collected;
}

/** Same-tick magnet eligibility matters: pickups are stepped AFTER mob AI. */
function loose(sim:DgSim,g:DgGem,pr:number):boolean {
  return !g.fly && g.v>0 && wrapD(g.x-sim.hero.x)**2+wrapD(g.z-sim.hero.z)**2>=pr*pr;
}
function clearLine(x:number,z:number,tx:number,tz:number,r:number):boolean {
  const dx=wrapD(tx-x),dz=wrapD(tz-z),n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.6));
  for(let i=1;i<=n;i++)if(blocked(wrapP(x+dx*i/n),wrapP(z+dz*i/n),r))return false;
  return true;
}
function reachable(m:DgMob,g:DgGem):boolean {
  const dx=wrapD(g.x-m.x),dz=wrapD(g.z-m.z),d=Math.hypot(dx,dz),f=d>2?(d-2)/d:0;
  // Body needs room to approach; the final short scoop must not pass through a wall.
  return clearLine(m.x,m.z,wrapP(m.x+dx*f),wrapP(m.z+dz*f),m.r) &&
    clearLine(wrapP(m.x+dx*f),wrapP(m.z+dz*f),g.x,g.z,.12);
}

/** One scan per .5 active seconds, at most twelve clusters evaluated against the gem list. */
function chooseLoot(sim:DgSim,m:DgMob,pr:number):DgGem|undefined {
  const c=mobDef('hapuga').collect!;
  const looseGems=sim.gems.filter(g=>loose(sim,g,pr)&&wrapD(g.x-m.x)**2+wrapD(g.z-m.z)**2<c.search**2);
  const buckets=new Map<string,{gem:DgGem,value:number,d:number}>();
  for(const g of looseGems){
    const dx=wrapD(g.x-m.x),dz=wrapD(g.z-m.z),key=Math.floor(dx/4)+','+Math.floor(dz/4),d=dx*dx+dz*dz;
    const b=buckets.get(key);
    if(b){b.value+=g.v;if(g.v>b.gem.v || g.v===b.gem.v&&g.id<b.gem.id){b.gem=g;b.d=d;}}
    else buckets.set(key,{gem:g,value:g.v,d});
  }
  const candidates=[...buckets.values()].sort((a,b)=>b.value/(1+Math.sqrt(b.d)/20)-a.value/(1+Math.sqrt(a.d)/20)||a.gem.id-b.gem.id).slice(0,12);
  let best:DgGem|undefined,score=-1;
  for(const b of candidates){
    if(!reachable(m,b.gem))continue;
    let value=0;
    for(const g of looseGems)if(wrapD(g.x-b.gem.x)**2+wrapD(g.z-b.gem.z)**2<=c.radius**2)value+=g.v;
    const rank=Math.min(c.capacity-(m.storedXp??0),value)/(1+Math.sqrt(b.d)/20);
    if(rank>score){score=rank;best=b.gem;}
  }
  return best;
}

/** Short deterministic obstacle probes; no hero-distance stuck kicks for a forager. */
function steer(m:DgMob,ox:number,oz:number):void {
  const side=m.id&1?1:-1;
  for(const angle of [0,side*Math.PI/4,-side*Math.PI/4,side*Math.PI/2,-side*Math.PI/2]){
    const c=Math.cos(angle),s=Math.sin(angle),x=ox*c-oz*s,z=ox*s+oz*c;
    if(!clearLine(m.x,m.z,wrapP(m.x+x*1.1),wrapP(m.z+z*1.1),m.r))continue;
    m.vx=x*m.spd;m.vz=z*m.spd;return;
  }
}

/** true means loot owns this tick; false leaves only the close defensive jab / retreat. */
function hunt(sim:DgSim,m:DgMob):boolean {
  const def=mobDef('hapuga'),c=def.collect!,fill=Math.min(1,(m.storedXp??0)/c.capacity);
  m.spd=(def.speed+(c.fullSpeed-def.speed)*fill)*(1+rageRule().speed*m.rage);
  if(hasBuff(sim,'pull')||fill>=1){m.huntGem=0;m.huntScan=0;return false;}
  const pr=pickupRadius(sim);
  if((m.huntScan??0)>0)m.huntScan=(m.huntScan??0)-1;
  let target=m.huntGem?sim.gems.find(g=>g.id===m.huntGem):undefined;
  if(target&&!loose(sim,target,pr)){target=undefined;m.huntGem=0;m.huntScan=0;}
  if(!m.huntScan){target=chooseLoot(sim,m,pr);m.huntGem=target?.id??0;m.huntScan=15;}
  if(!target)return false;
  const dx=wrapD(target.x-m.x),dz=wrapD(target.z-m.z),d=Math.hypot(dx,dz);
  if(d<=c.approach&&clearLine(m.x,m.z,target.x,target.z,.12)){
    begin(sim,m,'collect',d>1e-6?dx/d:m.dx,d>1e-6?dz/d:m.dz);return true;
  }
  steer(m,dx/(d||1),dz/(d||1));
  return true;
}

function plant(sim:DgSim,m:DgMob):void {
  const grow=mobDef('shaman').grow!,ki=mobIndex('shroom');
  const owned=sim.mobs.filter(b=>!b.die&&b.k==='shroom_bud'&&b.budOwner===m.id).length;
  for(let j=0;j<grow.n-owned && sim.wave.pend[ki]>0;j++){
    if(!canSpawn(sim,'shroom_bud'))break;
    // Three fixed sites, outside the caster body. Blocked ground consumes no budget.
    const sides=[-1,0,1],side=sides[j];
    const x=wrapP(m.x+m.ax*(side===0?2.1:1.4)+m.az*side*1.4);
    const z=wrapP(m.z+m.az*(side===0?2.1:1.4)-m.ax*side*1.4);
    if(blocked(x,z,mobDef('shroom').radius))continue;
    sim.wave.pend[ki]--;sim.wave.spawned++;
    const bud=makeMob(sim,'shroom_bud',x,z,1,sim.wave.dmgMul,1);
    bud.budOwner=m.id;bud.budMatureAt=sim.t+ticks(grow.mature);
    bud.budMatureHp=Math.round(mobDef('shroom').hp*sim.wave.hpMul);
    bud.dmg=mobDef('shroom').dmg*sim.wave.dmgMul;
    addMark(sim,'circle','growth',x,z,.65,0,0,ticks(grow.mature),0,0,0,bud);
    fx(sim,{k:'atk',id:bud.id,what:'growth'});
  }
}

export function stepBud(sim:DgSim,m:DgMob):void {
  m.vx=m.vz=m.kx=m.kz=0;
  if(sim.freezeT>sim.t || m.stunT>sim.t){
    if(m.budMatureAt!==undefined)m.budMatureAt++;
    for(const mk of sim.marks)if(mk.src===m.id&&mk.what==='growth'){mk.t0++;mk.t1++;}
    return;
  }
  if(m.budMatureAt===undefined||sim.t<m.budMatureAt)return;
  const d=mobDef('shroom');m.k='shroom';m.hp=m.hpMax=m.budMatureHp??d.hp;m.r=d.radius;m.spd=d.speed;
  m.st='walk';m.stT=sim.t; m.budMatureAt=undefined;
  for(const mk of sim.marks)if(mk.src===m.id&&mk.what==='growth')mk.t1=sim.t-1;
  fx(sim,{k:'atk',id:m.id,what:'grown'});
}

export function eliteAi(sim:DgSim,m:DgMob,d:number,ox:number,oz:number):void {
  m.vx=m.vz=0;
  const def=mobDef(m.k),jab=def.jab!;
  if(m.attackAt!==undefined){
    const age=sim.t-m.attackAt;
    if(m.attackKind==='recover'){
      if(age>=ticks(m.k==='hapuga'&&m.attackStep===-1?.2:.6)){m.attackAt=undefined;m.attackKind=undefined;m.st='walk';m.stT=sim.t;}
      return;
    }
    if(m.attackKind==='spill'){if(age>=ticks(58/24))finish(sim,m);return;}
    if(m.attackKind==='collect'){
      const c=def.collect!;
      if(m.attackStep===0&&age>=ticks(c.scoop)){
        if(scoop(sim,m)===0){finish(sim,m);m.attackStep=-1;m.huntGem=0;m.huntScan=0;return;}
        m.attackStep=1;
      }
      if(m.attackStep===1&&age>=ticks(c.deposit)){m.attackStep=2;fx(sim,{k:'atk',id:m.id,what:'collect_deposit'});}
      if(age>=ticks(c.duration))finish(sim,m);
    }else if(m.attackKind==='plant'){
      const g=def.grow!;
      if(m.attackStep===0&&age>=ticks(g.release)){m.attackStep=1;plant(sim,m);}
      if(age>=ticks(g.duration)){m.cd2=ticks(g.every);finish(sim,m);}
    }else if(m.attackKind==='jab'){
      if(age>=ticks(jab.wind)){m.st='attack';m.attackStep=1;}
      if(age>=ticks(jab.wind+jab.impact))m.attackStep=2;
      if(age>=ticks(jab.wind+jab.duration)){m.cd=ticks(1);finish(sim,m);}
    }
    return;
  }
  if(m.cd>0)m.cd--;if(m.cd2>0)m.cd2--;
  // Foragers choose loot before defending themselves. Gribovod's priority is unchanged.
  if(m.k==='hapuga'&&hunt(sim,m))return;
  if(d<jab.range+.3&&m.cd===0){
    // Aim the real offset tool tip at the hero, then lock body yaw for the whole clip.
    const right=m.k==='hapuga'?-.48:-.67,forward=m.k==='hapuga'?1.4508:1.52849;
    const norm=Math.hypot(right,forward),c=forward/norm,sn=right/norm;
    const ax=ox*c-oz*sn,az=ox*sn+oz*c;ox=ax;oz=az;
    begin(sim,m,'jab',ox,oz);
    if(m.k==='hapuga') {
      // V3 fork tips: right [-.67,-.48,-.29], forward 1.4508; no invisible frontal sector.
      addMark(sim,'lane','hapuga_jab',m.x+ox*1.4508+oz*(-.67),m.z+oz*1.4508-ox*(-.67),0,oz,-ox,ticks(jab.wind+jab.impact),m.dmg,0,0,m,.38,.044);
      const mk=sim.marks.at(-1)!;mk.localRight=-.67;mk.localForward=1.4508;
    } else {
      addContactMark(sim,m,'shaman_jab',-.67,1.52849,.065,ticks(jab.wind+jab.impact),m.dmg);
    }
    return;
  }
  if(m.k==='hapuga'){
    // No loose XP: keep a catchable distance instead of walking into the hero.
    if(d<12)steer(m,-ox,-oz);
  }else{
    if(m.cd2===0&&sim.wave.pend[mobIndex('shroom')]>0&&canSpawn(sim,'shroom_bud')&&
      sim.mobs.filter(b=>!b.die&&b.k==='shroom_bud'&&b.budOwner===m.id).length<def.grow!.n){begin(sim,m,'plant',ox,oz);return;}
    const sign=d<5?-1:d>8?1:0;m.vx=ox*m.spd*sign;m.vz=oz*m.spd*sign;
  }
}
