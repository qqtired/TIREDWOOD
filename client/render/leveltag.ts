import { frameForLevel } from '../../shared/levels.ts';

export interface LevelTagOptions {
  name: string;
  level: number;
  team: 0 | 1 | null;
  mate: boolean;
  hpBucket?: number;
  /** 0 — обычная рамка, 1..8 — редкий перелив. */
  shine?: number;
}
function pill(ctx: CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number):void {
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}
/** Только рисование в существующий canvas: без текстур/спрайтов/объектов сцены. */
export function drawLevelTag(ctx:CanvasRenderingContext2D,width:number,height:number,o:LevelTagOptions):void {
  const level=Math.max(1,Number.isFinite(o.level)?Math.floor(o.level):1),tier=frameForLevel(level);
  const framed=tier.id!=='none';
  ctx.clearRect(0,0,width,height);ctx.save();
  if(framed){
    pill(ctx,3,3,width-6,45,18);ctx.fillStyle='rgba(18,31,37,.86)';ctx.fill();
    const edge=ctx.createLinearGradient(0,0,width,45);edge.addColorStop(0,tier.color);edge.addColorStop(.45,tier.light);edge.addColorStop(1,tier.color);
    ctx.strokeStyle=edge;ctx.lineWidth=3;ctx.stroke();
    if((o.shine??0)>0){
      const x=(o.shine!/8)*(width+70)-35;const shine=ctx.createLinearGradient(x-32,0,x+32,0);
      shine.addColorStop(0,'rgba(255,255,255,0)');shine.addColorStop(.5,'rgba(255,255,255,.85)');shine.addColorStop(1,'rgba(255,255,255,0)');
      ctx.strokeStyle=shine;ctx.lineWidth=4;ctx.stroke();
    }
  }
  // Keep allegiance separate from prestige: the inner stripe never paints over the outer frame.
  if(o.team!==null){
    pill(ctx,54,40,width-72,3,1.5);ctx.fillStyle=o.team===0?'#a9b6ff':'#ffc38a';ctx.fill();
  }
  const text=o.team===null||o.mate?'#fff6e8':o.team===0?'#a9b6ff':'#ffc38a';
  ctx.beginPath();ctx.arc(25,25,17,0,Math.PI*2);ctx.fillStyle='rgba(22,28,32,.94)';ctx.fill();
  ctx.strokeStyle=framed?tier.color:text;ctx.lineWidth=2;ctx.stroke();
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`800 ${level>99?15:21}px Rubik,system-ui,sans-serif`;ctx.fillStyle=text;ctx.fillText(String(level),25,25,31);
  let size=30;ctx.font=`700 ${size}px Rubik,system-ui,sans-serif`;
  const available=width-62;while(size>18&&ctx.measureText(o.name).width>available){size--;ctx.font=`700 ${size}px Rubik,system-ui,sans-serif`;}
  ctx.lineJoin='round';ctx.lineWidth=6;ctx.strokeStyle='rgba(30,24,20,.85)';ctx.strokeText(o.name,(width+44)/2,25,available);
  ctx.fillStyle=text;ctx.fillText(o.name,(width+44)/2,25,available);
  if((o.hpBucket??-1)>=0){
    const w=120,x=width/2-w/2;ctx.fillStyle='rgba(30,24,20,.8)';pill(ctx,x-3,56,w+6,14,7);ctx.fill();
    ctx.fillStyle=o.mate?'#7bd88f':'#ff6b5a';pill(ctx,x,59,Math.max(4,w*o.hpBucket!/40),8,4);ctx.fill();
  }
  ctx.restore();
}
