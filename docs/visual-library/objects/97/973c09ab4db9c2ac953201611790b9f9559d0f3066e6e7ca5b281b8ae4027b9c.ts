// Exact centre + distance expression selected from the frozen pack source. Other map systems omitted.
export const ISLE_CENTER={x:-950,z:180} as const;
export function isleDist(x:number,z:number):number {return Math.hypot(x-ISLE_CENTER.x,z-ISLE_CENTER.z);}
