import type { Outfit } from './outfit.ts';
import type { PlayerState } from './sim.ts';
export const HIDE_CAPACITY=8, HIDE_MIN=2, HIDE_COUNT_TICKS=300, HIDE_PREP_TICKS=1200, HIDE_SEEK_TICKS=10800, HIDE_RESULT_TICKS=600;
export const HIDE_SHOT_TICKS=42, HIDE_MISS_TICKS=180, HIDE_REJOIN_TICKS=600;
export const HIDE_PROPS=['barrel','pot','bench','crate'] as const;
export type HideForm=typeof HIDE_PROPS[number];
export type HidePhase='gather'|'hide'|'seek'|'result';
export type HideRole='hunter'|'prop'|'spectator';
export const HIDE_FORMS:Record<HideForm,{name:string;w:number;d:number;h:number;color:number}>={
  barrel:{name:'Бочка',w:.56,d:.56,h:1.25,color:0x7c9da2},
  pot:{name:'Вазон',w:.55,d:.55,h:1.45,color:0xb77c59},
  bench:{name:'Скамейка',w:1.25,d:.5,h:1.05,color:0x956d4a},
  crate:{name:'Ящик',w:.62,d:.62,h:1.15,color:0xb68c59},
};
/** Публичный реквизит: нет nick/pid/role или признака живого игрока. */
export interface HideProp {id:number;form:HideForm;x:number;y:number;z:number;yaw:number}
export interface HideHunter {x:number;y:number;z:number;yaw:number;nick:string;level:number;outfit:Outfit}
export interface HideResult {round:number;role:'hunter'|'prop';won:boolean;found:number;survived:boolean;reward:number}
export interface HideStatus {n:number;max:number;names:string[];phase:HidePhase}
export type HideClientMsg={t:'hide';a:'form'|'freeze'|'shoot'|'taunt'|'rotate';form?:HideForm};
export type HideServerMsg={t:'hide_state';tick:number;round:number;phase:HidePhase;phaseEnd:number;
  self:{id:number;ack:number;reset:number;state:PlayerState;role:HideRole;form:HideForm;propId:number;propYaw:number;locked:boolean;found:boolean};
  props:HideProp[];hunter:HideHunter|null;remaining:number;total:number;notice:string;
  result:'hunter'|'props'|'cancelled'|null;cue:{x:number;z:number;until:number}|null;
};
export function hideEnabled(raw:string|undefined,dev=false):boolean{return raw==='1'||(raw===undefined&&dev);}
