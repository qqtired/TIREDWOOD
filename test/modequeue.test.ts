import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ModeQueue } from '../server/lobby/modequeue.ts';
test('queue starts minimum participants in arrival order, ignores unavailable and overflow',()=>{
  const a={name:'A',x:0,z:0,eligible:true},b={name:'B',x:20,z:0,eligible:true},c={name:'C',x:20,z:0,eligible:true};
  let idle=true;const starts:string[][]=[];
  const q=new ModeQueue({center:{x:0,z:0,r:2},min:2,max:2,ticks:10,players:()=>[a,b,c],inside:p=>p.eligible,nick:p=>p.name,position:p=>p,idle:()=>idle,start:ps=>{starts.push(ps.map(p=>p.name));idle=false;}});
  q.step(1);assert.equal(q.view(1).phase,'idle');b.x=0;q.step(2);c.x=0;q.step(3);q.step(12);
  assert.deepEqual(starts,[['A','B']]);q.step(50);assert.equal(starts.length,1);
});
test('queue resets below minimum and stale departed objects cannot start',()=>{
  let ps=[{name:'A',x:0,z:0},{name:'B',x:0,z:0}];let count=0;
  const q=new ModeQueue({center:{x:0,z:0,r:2},min:2,max:8,ticks:10,players:()=>ps,inside:()=>true,nick:p=>p.name,position:p=>p,idle:()=>true,start:()=>count++});
  q.step(1);ps=ps.slice(1);q.step(7);q.step(20);assert.equal(count,0);
  ps.push({name:'C',x:0,z:0});q.step(21);q.step(30);assert.equal(count,0);q.step(31);assert.equal(count,1);
});
