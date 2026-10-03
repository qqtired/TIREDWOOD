import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { TokensHud } from '../client/ui/tokens.ts';
class El { textContent=''; className=''; innerHTML=''; style={display:''}; children:El[]=[]; classList={add(){},remove(){}}; offsetWidth=0; n:El|null=null;
  querySelector(){return this.n??=new El();} appendChild(el:El){this.children.push(el);return el;} remove(){} }
function setup(t:TestContext) {
  const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window'), originalDoc=Object.getOwnPropertyDescriptor(globalThis,'document');
  const callbacks:Array<()=>void>=[];
  Object.defineProperty(globalThis,'window',{configurable:true,value:{setTimeout:(fn:()=>void)=>{callbacks.push(fn);return callbacks.length;}}});
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>new El()}});
  t.mock.timers.enable({apis:['setTimeout']});
  t.after(()=>{for(const [key,desc] of [['window',originalWindow],['document',originalDoc]] as const){if(desc)Object.defineProperty(globalThis,key,desc);else Reflect.deleteProperty(globalThis,key);}});
  return{hud:new TokensHud(new El() as unknown as HTMLElement),callbacks};
}
test('new connection reset invalidates even an already queued old balance callback',t=>{
  const{hud,callbacks}=setup(t);hud.sync(100);hud.set(150,1500);hud.reset();hud.sync(175);callbacks[0]();assert.equal(hud.shown,175);
});
test('same-session profile preserves delayed win presentation; immediate newer balance cancels old timer',t=>{
  const{hud,callbacks}=setup(t);hud.sync(100);hud.set(150,1500);hud.sync(150);assert.equal(hud.shown,100);callbacks[0]();assert.equal(hud.shown,150);
  hud.set(190,1500);hud.set(205);callbacks[1]();assert.equal(hud.shown,205);
});
