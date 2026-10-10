import { frameForLevel } from '../../shared/levels.ts';

export interface LevelTagOptions {
  name: string;
  level: number;
  team: 0 | 1 | null;
  mate: boolean;
  hpBucket?: number;
  /** 0 — обычная рамка, 1..8 — редкий перелив. */
  shine?: number;
  /** Золотой якорь справа от ника: «Хозяин глубин», собрал все виды рыб (shared/fishstyle.ts) */
  anchor?: boolean;
  /** Маяк справа от ника вместо якоря: сет «Смотритель маяка» (все виды острова); число — вспышка огня 0…1 */
  lighthouse?: number;
}

/** Золотой якорь в круге (cx, cy), радиус r: кольцо, шток, перекладина, лапы с остриями. */
function drawAnchor(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();ctx.arc(0, 0, r, 0, Math.PI * 2);
  const bg = ctx.createRadialGradient(-r * .3, -r * .35, r * .1, 0, 0, r);
  bg.addColorStop(0, '#2b3f63');bg.addColorStop(1, '#14213a');
  ctx.fillStyle = bg;ctx.fill();
  const gold = ctx.createLinearGradient(-r, -r, r, r);
  gold.addColorStop(0, '#fff1a8');gold.addColorStop(.45, '#f2c230');gold.addColorStop(1, '#b07800');
  ctx.strokeStyle = gold;ctx.lineWidth = 2.2;ctx.stroke();
  ctx.lineCap = 'round';ctx.lineJoin = 'round';ctx.lineWidth = r * .2;ctx.strokeStyle = gold;
  ctx.beginPath();ctx.arc(0, -r * .52, r * .17, 0, Math.PI * 2);ctx.stroke();
  ctx.beginPath();ctx.moveTo(0, -r * .35);ctx.lineTo(0, r * .62);ctx.moveTo(-r * .36, -r * .16);ctx.lineTo(r * .36, -r * .16);ctx.stroke();
  ctx.beginPath();ctx.moveTo(-r * .58, r * .12);ctx.quadraticCurveTo(-r * .5, r * .62, 0, r * .64);ctx.quadraticCurveTo(r * .5, r * .62, r * .58, r * .12);ctx.stroke();
  ctx.fillStyle = gold;
  for (const s of [-1, 1]) {ctx.beginPath();ctx.moveTo(s * r * .72, r * .2);ctx.lineTo(s * r * .46, r * .04);ctx.lineTo(s * r * .5, r * .3);ctx.closePath();ctx.fill();}
  ctx.restore();
}
/**
 * Маяк в той же рамке, что якорь: бутылочно-зелёный круг (без сине-жёлтого, AGENTS §7), золотой обод, башня в
 * красно-белую полоску, фонарь и лучи; glow 0…1 — вспышка огня (avatar.ts перерисовывает ступенями раз в 6 с).
 * Из макета lab/fishing-review/cosmetics/nick-badge.html.
 */
function drawLighthouse(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, glow: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();ctx.arc(0, 0, r, 0, Math.PI * 2);
  const bg = ctx.createRadialGradient(-r * .3, -r * .35, r * .1, 0, 0, r);
  bg.addColorStop(0, '#2c6450');bg.addColorStop(1, '#16362b');
  ctx.fillStyle = bg;ctx.fill();
  const gold = ctx.createLinearGradient(-r, -r, r, r);
  gold.addColorStop(0, '#fff1a8');gold.addColorStop(.45, '#f2c230');gold.addColorStop(1, '#b07800');
  ctx.strokeStyle = gold;ctx.lineWidth = 2.2;ctx.stroke();
  ctx.save();ctx.beginPath();ctx.arc(0, 0, r - 1.2, 0, Math.PI * 2);ctx.clip();
  // лучи и ореол фонаря
  const ly = -r * .47;
  const a = .25 + .75 * glow;
  ctx.globalAlpha = a * .6;ctx.fillStyle = '#ffb062';
  for (const s of [-1, 1]) {ctx.beginPath();ctx.moveTo(0, ly);ctx.lineTo(s * r * 1.1, ly - r * .22);ctx.lineTo(s * r * 1.1, ly + r * .22);ctx.closePath();ctx.fill();}
  ctx.globalAlpha = 1;
  const halo = ctx.createRadialGradient(0, ly, 0, 0, ly, r * (.45 + .25 * glow));
  halo.addColorStop(0, `rgba(255,246,214,${.95 * a})`);halo.addColorStop(.45, `rgba(255,170,90,${.55 * a})`);halo.addColorStop(1, 'rgba(255,180,58,0)');
  ctx.fillStyle = halo;ctx.fillRect(-r, -r, 2 * r, 2 * r);
  // скала, башня в две красные полосы, галерея, фонарь, крыша
  ctx.fillStyle = '#2f5f4c';
  ctx.beginPath();ctx.moveTo(-r, r * .75);ctx.quadraticCurveTo(0, r * .35, r, r * .75);ctx.lineTo(r, r);ctx.lineTo(-r, r);ctx.fill();
  ctx.fillStyle = '#f4efe6';
  ctx.beginPath();ctx.moveTo(-r * .21, r * .62);ctx.lineTo(-r * .13, -r * .3);ctx.lineTo(r * .13, -r * .3);ctx.lineTo(r * .21, r * .62);ctx.fill();
  ctx.fillStyle = '#d23a2a';
  ctx.fillRect(-r * .17, r * .16, r * .34, r * .2);
  ctx.fillRect(-r * .145, -r * .14, r * .29, r * .16);
  ctx.fillRect(-r * .24, -r * .36, r * .48, r * .09);
  ctx.fillStyle = glow > .5 ? '#fff1d6' : '#f5a64a';
  ctx.fillRect(-r * .125, -r * .6, r * .25, r * .25);
  ctx.fillStyle = '#d23a2a';
  ctx.beginPath();ctx.moveTo(-r * .18, -r * .59);ctx.lineTo(0, -r * .8);ctx.lineTo(r * .18, -r * .59);ctx.fill();
  ctx.restore();ctx.restore();
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
  // якорь (или маяк) занимает место справа: ник сдвигается левее, значок — сразу за ним
  const lighthouse=o.lighthouse!==undefined;
  const badge=o.anchor||lighthouse?36:0;
  const available=width-62-badge;while(size>18&&ctx.measureText(o.name).width>available){size--;ctx.font=`700 ${size}px Rubik,system-ui,sans-serif`;}
  const cx=(width+44-badge)/2;
  ctx.lineJoin='round';ctx.lineWidth=6;ctx.strokeStyle='rgba(30,24,20,.85)';ctx.strokeText(o.name,cx,25,available);
  ctx.fillStyle=text;ctx.fillText(o.name,cx,25,available);
  const bx=Math.min(width-20,cx+Math.min(available,ctx.measureText(o.name).width)/2+20);
  if(lighthouse)drawLighthouse(ctx,bx,25,15,Math.max(0,Math.min(1,o.lighthouse!)));
  else if(o.anchor)drawAnchor(ctx,bx,25,15);
  if((o.hpBucket??-1)>=0){
    const w=120,x=width/2-w/2;ctx.fillStyle='rgba(30,24,20,.8)';pill(ctx,x-3,56,w+6,14,7);ctx.fill();
    ctx.fillStyle=o.mate?'#7bd88f':'#ff6b5a';pill(ctx,x,59,Math.max(4,w*o.hpBucket!/40),8,4);ctx.fill();
  }
  ctx.restore();
}
