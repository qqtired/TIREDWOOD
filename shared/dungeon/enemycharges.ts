import {fx,hurtHero} from './core.ts';
import type {DgSim} from './types.ts';
import {wrapD} from './util.ts';

export function disarmCharges(sim:DgSim,x:number,z:number,r:number):void {
 for(const c of sim.enemyCharges){const dx=wrapD(c.x-x),dz=wrapD(c.z-z);if(dx*dx+dz*dz<=(r+.45)**2)c.end=-1;}
}
export function disarmChargesLine(sim:DgSim,x:number,z:number,dx:number,dz:number,len:number,width:number):void {
 for(const c of sim.enemyCharges){const ox=wrapD(c.x-x),oz=wrapD(c.z-z),along=ox*dx+oz*dz;if(along>=-.45&&along<=len+.45&&Math.abs(ox*dz-oz*dx)<=width/2+.45)c.end=-1;}
}
export function stepEnemyCharges(sim:DgSim):void {
 let n=0;for(const c of sim.enemyCharges){if(c.end<0){fx(sim,{k:'disarm',x:c.x,z:c.z});continue;}if(sim.t>=c.end){const dx=wrapD(sim.hero.x-c.x),dz=wrapD(sim.hero.z-c.z);if(dx*dx+dz*dz<(c.r+.45)**2)hurtHero(sim,c.dmg,'wickmole');fx(sim,{k:'boom',x:c.x,z:c.z,r:c.r,what:'enemy_charge'});}else sim.enemyCharges[n++]=c;}sim.enemyCharges.length=n;
}
