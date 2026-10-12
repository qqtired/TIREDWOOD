import { HIDE_CAPACITY,type HideClientMsg,type HideResult,type HideStatus } from '../../shared/hide.ts';
import type { ClientMsg } from '../../shared/messages.ts';
import type { Outfit } from '../../shared/outfit.ts';
import type { Input } from '../../shared/sim.ts';
import type { Client,Room } from '../hub.ts';
import type { Profile } from '../store.ts';
import { HideGame,type HidePlayer } from './game.ts';
export interface HideRoomHooks {outfitOf(p:Profile):Outfit;finished(pid:number,result:HideResult):void;afk?(c:Client):void}
export class HideRoom implements Room {
 readonly kind='hide' as const;readonly game:HideGame;
 private readonly hooks:HideRoomHooks;private readonly clients=new Map<Client,HidePlayer>();
 constructor(hooks:HideRoomHooks){this.hooks=hooks;this.game=new HideGame({finished:hooks.finished});}
 get humans():number{return this.clients.size;}get tick():number{return this.game.tick;}get active():boolean{return this.game.active;}get busy():number{return this.game.busy;}
 canRejoin(pid:number):boolean{return this.hasSpace()&&this.game.canRejoin(pid);}
 hasSpace():boolean{return this.humans<HIDE_CAPACITY;}
 /** Ожидание загрузки (server/readygate.ts): отсчёт сбора стоит, пока вошедшие не загрузились */
 get prestart():{phaseEnd:number}|null{return this.game.phase==='gather'&&this.game.phaseEnd>0?this.game:null;}
 join(c:Client):boolean {if(!c.profile||this.clients.has(c))return false;const p=this.game.addHuman({pid:c.pid,nick:c.nick,level:c.profile.level??1,outfit:this.hooks.outfitOf(c.profile)},c.sink);if(!p)return false;this.clients.set(c,p);return true;}
 leave(c:Client):void {const p=this.clients.get(c);if(p)this.game.removePlayer(p.id);this.clients.delete(c);}
 playerOf(c:Client):HidePlayer|undefined{return this.clients.get(c);}
 onRename(c:Client):void {const p=this.clients.get(c);if(p){p.nick=c.nick;this.game.send(p);}}
 outfitChanged(c:Client):void{const p=this.clients.get(c);if(p&&c.profile){p.outfit=this.hooks.outfitOf(c.profile);p.level=c.profile.level??1;}}
 onInputs(c:Client,inputs:Input[],count:number):void {const p=this.clients.get(c);if(p)this.game.onInputs(p,inputs,count);}
 onMessage(c:Client,msg:ClientMsg):void {const p=this.clients.get(c);if(p&&(msg as {t:string}).t==='hide')this.game.action(p,msg as HideClientMsg);}
 status():HideStatus{return{n:this.humans,max:HIDE_CAPACITY,names:[...this.clients.keys()].map(c=>c.nick),phase:this.game.phase};}
 step():void{this.game.step();}
}
