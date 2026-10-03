// The complete client-only animal roster and route authority. No profile/server state.
export const CRITTERS_ENABLED = true;
export type CritterKind = 'cat' | 'gull' | 'crab' | 'dog';
export type CritterAction = 'walk' | 'sit' | 'sleep' | 'groom' | 'sniff' | 'peck' | 'perch' | 'burrow' | 'fly';
export interface CritterStop {
  x: number; y: number; z: number;
  rest: string;
  /** Resting orientation; useful when lying along a bench instead of across it. */
  yaw?: number;
  action: CritterAction;
  hold: number;
  /** Incoming leg; elevated cat stops use a short hop. */
  travel?: 'walk' | 'hop' | 'fly';
}
export interface CritterDef { id: number; kind: CritterKind; coat: number; speed: number; phase: number; stops: readonly CritterStop[]; }
/** Quiet exclusion margin around the existing memorial. Nothing is added there. */
export const CRITTER_QUIET_ZONE = { x: -23.6, z: 19.2, r: 7 };
/** Small shoreline sand shelf: visual/ground integration is owned by the lobby map. */
export const CRITTER_SAND = { x0: -11, x1: -7, z0: 22.15, z1: 24.2, y: -.8 };
const stop = (x:number,z:number,action:CritterAction,hold:number,rest:string,y=0,travel?:CritterStop['travel']):CritterStop=>({x,y,z,action,hold,rest,travel});
export const CRITTERS: readonly CritterDef[] = [
  {id:0,kind:'cat',coat:0,speed:.53,phase:0,stops:[
    {...stop(-.55,19.42,'sleep',27,'sea-bench',.30,'hop'),yaw:-Math.PI/2}, stop(-1.5,20.4,'groom',13,'bench-front',0,'hop'),
    stop(2.8,20.1,'sit',11,'shore-warm-stone'),stop(2.3,18.5,'groom',9,'bench-side'),stop(-1.5,18.6,'sit',6,'bench-step'),
  ]},
  {id:1,kind:'cat',coat:1,speed:.58,phase:29,stops:[
    stop(-10.25,-18.5,'sit',18,'warehouse-alley'),stop(-10.25,-20.5,'sniff',7,'crate-foot'),
    stop(-10.2,-21.9,'groom',22,'warehouse-crate',1,'hop'),stop(-10.25,-20.5,'sit',8,'crate-foot',0,'hop'),
  ]},
  {id:2,kind:'cat',coat:2,speed:.5,phase:53,stops:[
    stop(-17,40,'sit',24,'fisher-wait'),stop(-16.3,40.9,'groom',12,'lighthouse-east'),
    stop(-16.3,44,'sleep',26,'lighthouse-warm-floor'),stop(-16.3,40.9,'sit',7,'lighthouse-east'),
  ]},
  {id:3,kind:'cat',coat:3,speed:.55,phase:17,stops:[
    stop(22.6,5.5,'sleep',23,'cafe-shade'),stop(22.4,8.5,'groom',17,'cafe-wall'),
    stop(21.3,12.8,'sit',17,'terrace-edge'),stop(22.4,8.5,'sit',6,'cafe-wall'),
  ]},
  ...Array.from({length:6},(_,i):CritterDef=>{
    const routes = [
      [stop(-5,20.5,'peck',8,'south-pier',0,'fly'),stop(-6,20.3,'peck',12,'south-pier'),stop(-4,21.2,'perch',14,'south-bollard',.54,'fly')],
      [stop(5,20.4,'peck',13,'east-pier',0,'fly'),stop(6,20.2,'peck',11,'east-pier'),stop(12,21.2,'perch',20,'east-bollard',.54,'fly')],
      [stop(-19.5,26.1,'peck',12,'fishing-pier',0,'fly'),stop(-18.6,27.1,'peck',16,'fishing-pier'),stop(-19.5,29.7,'perch',10,'fishing-pier',0,'fly')],
      [stop(-19.5,30.7,'peck',9,'fishing-pier',0,'fly'),stop(-18.7,31.3,'peck',14,'fishing-pier'),stop(-20.1,33.2,'perch',14,'fishing-pier',0,'fly')],
      [stop(-22.6,39.3,'peck',15,'lighthouse-apron',0,'fly'),stop(-22.1,40,'peck',10,'lighthouse-apron'),stop(-21.3,39.3,'perch',12,'lighthouse-apron',0,'fly')],
      [stop(16.5,20.3,'peck',13,'cafe-pier',0,'fly'),stop(17.7,20.1,'peck',9,'cafe-pier'),stop(19.5,20.4,'perch',17,'cafe-pier',0,'fly')],
    ];return{id:4+i,kind:'gull',coat:0,speed:1.1,phase:i*11+7,stops:routes[i]};
  }),
  ...Array.from({length:4},(_,i):CritterDef=>{
    const x=-10.55+i*.92,z=22.6+(i%2)*.5;
    return{id:10+i,kind:'crab',coat:i%2,speed:.22,phase:i*7,stops:[
      stop(x,z,'burrow',9,'shore-sand',CRITTER_SAND.y),stop(x+.34,z+.48,'sit',7,'shore-sand',CRITTER_SAND.y),
      stop(x+.1,z+.72,'burrow',12,'shore-sand',CRITTER_SAND.y),
    ]};
  }),
  {id:14,kind:'dog',coat:0,speed:1.25,phase:36,stops:[
    stop(21.3,6.5,'sleep',21,'cafe-dog-bed'),stop(16.3,8,'sniff',9,'cafe-walk'),stop(11,8,'sit',6,'plaza-east'),
    stop(11,18.4,'sniff',8,'shore-corner'),stop(3.4,18.4,'sniff',11,'shore-walk'),stop(11,18.4,'sit',4,'shore-corner'),
    stop(11,8,'sniff',5,'plaza-east'),stop(16.3,8,'sit',6,'cafe-walk'),
  ]},
];
