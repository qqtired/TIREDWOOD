import type { Stats } from './economy.ts';

export const LEVELS_VERSION = 1;
/** Одноразовое изменение правил рыбалки: XP, задания и удочки зарабатываются заново. */
export const FISHING_RESET_VERSION = 1;
export type FrameTierId = 'none' | 'bronze' | 'silver' | 'gold' | 'diamond';
export interface FrameTier { id: FrameTierId; min: number; name: string; color: string; light: string }
export const FRAME_TIERS: readonly FrameTier[] = [
  {id:'none',min:1,name:'Без рамки',color:'#e9e0cd',light:'#fff6e8'},
  {id:'bronze',min:5,name:'Бронза',color:'#bd854f',light:'#f4c697'},
  {id:'silver',min:15,name:'Серебро',color:'#aebecf',light:'#edf4fb'},
  {id:'gold',min:30,name:'Золото',color:'#deb54c',light:'#fff1ac'},
  {id:'diamond',min:50,name:'Алмаз',color:'#71cbe3',light:'#e1fbff'},
];
export interface LevelUp { from:number; level:number; xp:number; tier:FrameTier; milestones:FrameTier[] }
export const safeXp = (xp:number):number => Number.isFinite(xp) ? Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,Math.floor(xp))) : 0;
const safeLevel = (level:number):number => Number.isFinite(level) ? Math.max(1,Math.floor(level)) : 1;
export function xpToNext(level:number):number { return 100+40*safeLevel(level); }
export function xpForLevel(level:number):number { const n=safeLevel(level); return (n-1)*(100+20*n); }
export function levelFromXp(raw:number):number {
  const xp=safeXp(raw);
  let level=Math.max(1,Math.floor((Math.sqrt(14400+80*xp)-80)/40));
  if(xpForLevel(level)>xp)level--;
  if(xpForLevel(level+1)<=xp)level++;
  return level;
}
export function levelProgress(raw:number):{level:number;xp:number;current:number;needed:number;from:number;next:number} {
  const xp=safeXp(raw),level=levelFromXp(xp),from=xpForLevel(level),needed=xpToNext(level);
  return {level,xp,current:xp-from,needed,from,next:from+needed};
}
export function frameForLevel(level:number):FrameTier {
  let tier=FRAME_TIERS[0];for(const candidate of FRAME_TIERS)if(safeLevel(level)>=candidate.min)tier=candidate;return tier;
}
/** Приблизительное историческое начисление: счётчики событий, не казино/богатство/рыбацкий XP. */
export function legacyXp(stats:Stats):number {
  return safeXp(stats.rcRaces*20+stats.pbRounds*15+stats.dkGames*20+Math.max(stats.fsCaught,stats.fsFish)*3+stats.aqRuns*5+stats.ftGames*20+stats.fcFights*15);
}
export function levelChange(from:number,xp:number):LevelUp|null {
  const level=levelFromXp(xp);if(level<=from)return null;
  return {from,level,xp:safeXp(xp),tier:frameForLevel(level),milestones:FRAME_TIERS.filter(t=>t.id!=='none'&&t.min>from&&t.min<=level)};
}
