// Хапуга и Грибовод: перенос уже лежащего опыта и конечный бюджет видимых ростков.
import { fx, makeMob, newId, hasBuff } from './core.ts';
import { mobDef, mobIndex } from './data.ts';
import { addMark, addContactMark, canSpawn } from './mobs.ts';
import { blocked } from './map.ts';
import type { DgMob, DgSim } from './types.ts';
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

function scoop(sim:DgSim,m:DgMob):void {
  if (hasBuff(sim, 'pull')) return;
  const c=mobDef('hapuga').collect!;
  let left=c.capacity-(m.storedXp??0);
  // Nearest first; stable id tie-break avoids array-order changes selecting another crystal.
  const eligible=sim.gems.filter(g=>!g.fly && wrapD(g.x-m.x)**2+wrapD(g.z-m.z)**2<=c.radius**2)
    .sort((a,b)=>(wrapD(a.x-m.x)**2+wrapD(a.z-m.z)**2)-(wrapD(b.x-m.x)**2+wrapD(b.z-m.z)**2)||a.id-b.id);
  for(const g of eligible){
    if(left<=0)break;
    const n=Math.min(left,g.v); g.v-=n; left-=n; m.storedXp=(m.storedXp??0)+n;
    fx(sim,{k:'hoard',id:m.id,x:g.x,z:g.z,n});
  }
  sim.gems=sim.gems.filter(g=>g.v>0);
  fx(sim,{k:'atk',id:m.id,what:'collect_scoop'});
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
      if(age>=ticks(.6)){m.attackAt=undefined;m.attackKind=undefined;m.st='walk';m.stT=sim.t;}
      return;
    }
    if(m.attackKind==='spill'){if(age>=ticks(58/24))finish(sim,m);return;}
    if(m.attackKind==='collect'){
      const c=def.collect!;
      if(m.attackStep===0&&age>=ticks(c.scoop)){scoop(sim,m);m.attackStep=1;}
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
    let nearest=null,bd=18**2;
    if(!hasBuff(sim,'pull')&&(m.storedXp??0)<def.collect!.capacity)for(const g of sim.gems){
      if(g.fly)continue;const dd=wrapD(g.x-m.x)**2+wrapD(g.z-m.z)**2;
      if(dd<bd){bd=dd;nearest=g;}
    }
    if(nearest){
      if(bd<=def.collect!.radius**2){begin(sim,m,'collect',ox,oz);return;}
      const distance=Math.sqrt(bd);ox=wrapD(nearest.x-m.x)/distance;oz=wrapD(nearest.z-m.z)/distance;
    }
    m.vx=ox*m.spd;m.vz=oz*m.spd;
  }else{
    if(m.cd2===0&&sim.wave.pend[mobIndex('shroom')]>0&&canSpawn(sim,'shroom_bud')&&
      sim.mobs.filter(b=>!b.die&&b.k==='shroom_bud'&&b.budOwner===m.id).length<def.grow!.n){begin(sim,m,'plant',ox,oz);return;}
    const sign=d<5?-1:d>8?1:0;m.vx=ox*m.spd*sign;m.vz=oz*m.spd*sign;
  }
}
