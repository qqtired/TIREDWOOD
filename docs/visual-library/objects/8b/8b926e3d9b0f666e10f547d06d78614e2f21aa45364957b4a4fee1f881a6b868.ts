import { TICK_RATE } from '../../../shared/constants.ts';
import { siegePhaseTicks } from '../../../shared/fortsiege.ts';

export interface SiegePhase { id:number; kind:number; state:number; startTick:number; endTick:number }

/** A short phase history keeps future JSON from replacing an older rendered snapshot. */
export class SiegePhaseClock {
  private readonly phases = new Map<number,SiegePhase[]>();
  remember(phase:SiegePhase):void {
    if (![phase.id,phase.kind,phase.state,phase.startTick,phase.endTick].every(Number.isFinite)
      || phase.startTick<0 || (phase.endTick!==0 && phase.endTick<phase.startTick)) return;
    const list=this.phases.get(phase.id)??[];
    const old=list.findIndex(p=>p.state===phase.state&&p.startTick===phase.startTick);
    if(old>=0)list[old]={...phase};else list.push({...phase});
    list.sort((a,b)=>a.startTick-b.startTick);
    if(list.length>12)list.splice(0,list.length-12);
    this.phases.set(phase.id,list);
  }
  at(id:number,state:number,tick:number):SiegePhase|null {
    if(!Number.isFinite(tick))return null;
    const list=this.phases.get(id);if(!list)return null;
    let before:SiegePhase|null=null,future:SiegePhase|null=null;
    for(const p of list){if(p.state!==state)continue;if(p.startTick<=tick)before=p;else future??=p;}
    return before??future;
  }
  kind(id:number):number|undefined{return this.phases.get(id)?.at(-1)?.kind;}
  remove(id:number):void{this.phases.delete(id);}
  clear():void{this.phases.clear();}
}

export function siegeElapsed(phase:SiegePhase,tick:number):number {
  const end=phase.endTick>0?phase.endTick:tick;
  return Math.max(0,(Math.min(end,tick)-phase.startTick)/TICK_RATE);
}

/** Snapshot-only fallback for a phase whose JSON has not arrived yet. Never use arrival time. */
export function siegeSnapshotElapsed(kind:number,state:number,remaining:number):number|null {
  const total=siegePhaseTicks(kind,state);
  if(!total||!Number.isFinite(remaining))return null;
  return Math.max(0,Math.min(total,total-remaining))/TICK_RATE;
}
