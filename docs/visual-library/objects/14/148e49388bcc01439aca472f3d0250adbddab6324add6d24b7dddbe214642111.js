import {component,marker,line} from './common.js';

// Relative coordinates of the familiar course: original origin (-32.6,9).
// This is an authored-prop content overview; its complete path is not a played acceptance run.
export function authoredAquaOverview(ctx,d,pack,moverPhase){
 const T=ctx.THREE,root=new T.Group(),labels=[],motions=[],used=new Set();root.position.set(32,0,-18);d.scene.add(root);
 const deck=(x,y,z,w=2.4,depth=2.8)=>{const m=d.box(w,.22,depth,0xc8a373,root);m.position.set(x,y-.11,z);return m;};
 const part=(name,x,y,z)=>{const m=component(pack,name,root);if(m){m.position.set(x,y,z);used.add(name);}return m;};
 const label=(title,x,y,z)=>{const m=marker(ctx,d,title,x+32,y+2.7,z-18,6);if(m)labels.push(m);};
 deck(0,-.4,0,4.5,3);label('Старт',0,-.4,0);
 for(const [x,y,z] of [[-4.5,-.45,0],[-8.2,-.15,1.4],[-11.9,.15,-1.2]]){const m=part('aqua_sink',x,y,z);if(m)m.scale.set(2.2/1.8,1,2.2/1.8);}
 deck(-15.6,-.4,0);deck(-30.7,-.4,0);const ferry=part('aqua_ferry',-18.1,-.4,0);if(ferry)motions.push({m:ferry,kind:'ferry',x:-18.1,dx:-10,phase:0});label('Паром',-23,-.4,0);
 for(let i=0;i<4;i++){const x=-34.3-i*3.2,z=[0,-.7,.5,-.5][i],m=part('aqua_sink',x,-.45,z);if(m)motions.push({m,kind:'sink',y:-.45,phase:i*.6});}label('Тонущие подушки',-39,-.45,0);
 deck(-47.6,-.4,0,2.8,3.6);
 const low=part('aqua_trampoline',-50.4,-.55,0);if(low)motions.push({m:low,kind:'trampoline',phase:0});
 deck(-53.5,1.6,0,2.6,4.4);const high=part('aqua_trampoline',-55.9,1.45,0);if(high)motions.push({m:high,kind:'trampoline',phase:.7});
 deck(-59,4,0,4,4);label('Батут 12 → ступень → батут 15,2',-54,3.2,0);
 let slide=part('aqua_slide',-59,0,0);
 if(!slide&&typeof document==='undefined'){slide=d.box(3.2,.16,12.6,0xdcc091,root);slide.position.set(-59,1.8,8);slide.rotation.x=Math.atan2(4.4,12);}
 deck(-59,-.4,15,4,3);label('Горка',-59,2,8);
 const disc=part('aqua_sweeper_disc',-59,-.3,21.6),sweep=part('aqua_sweeper',-59,.3,21.6);if(sweep)motions.push({m:sweep,kind:'sweep'});label('Вертушка · 3,6 с',-59,-.3,21.6);
 deck(-59,-.4,27.6,4.8,2.8);deck(-42.4,-.4,27.6,3.2,2.8);
 const beam=d.box(13,.2,1,0xb79365,root);beam.position.set(-50.1,-.4,27.6);
 for(let i=0;i<3;i++){const x=[-53,-49.6,-46.2][i],bag=part('aqua_pendulum_bag',x,2.87,27.6);if(bag){used.add('aqua_pendulum');motions.push({m:bag,kind:'bag',phase:i*Math.PI*2/3});}for(const side of [-1,1])d.cyl(.08,.09,3.3,0xa38662,root,10).position.set(x,1.25,27.6+side*.9);d.box(.16,.16,2.1,0xa38662,root).position.set(x,2.95,27.6);}label('Мешки · 3 с',-49.6,1,27.6);
 part('aqua_lift_frame',-39.1,-.4,27.6);const lift=part('aqua_lift',-39.1,-.4,27.6);if(lift)motions.push({m:lift,kind:'lift'});deck(-35.4,3.2,27.6,4.8,3.6);label('Лифт',-39.1,2.5,27.6);
 part('aqua_sweeper_disc',-30.6,2,27.4);const secondSweep=part('aqua_sweeper',-30.6,2.6,27.4);if(secondSweep)motions.push({m:secondSweep,kind:'sweep',phase:Math.PI/2});label('Вертушка 2 · после лифта',-30.6,2,27.4);
 deck(-27.4,.9,28,1.6,1.6);deck(-23.8,-.2,27.6,2.5,2.8);
 const a=part('aqua_ferry',-21.3,-.2,27.6),b=part('aqua_ferry',-7.2,-.2,27.6);
 if(a)motions.push({m:a,kind:'meet',x:-21.3,dx:4.8});if(b)motions.push({m:b,kind:'meet',x:-7.2,dx:-7});
 deck(-3.6,-.2,27.6,4.8,4);label('Пересадка → финиш',-12,-.2,27.6);
 line(ctx,root,[[0,-.25,0],[-15.6,-.25,0],[-30.7,-.25,0],[-47.6,-.25,0],[-59,4.1,0],[-59,-.25,15],[-59,-.15,21.6],[-59,-.25,27.6],[-35.4,3.3,27.6],[-23.8,-.1,27.6],[-3.6,-.1,27.6]],0xe8c170,.4);
 const objects=[root,...labels];
 const focuses={ferry:[-23,0,0],sinks:[-39,0,0],tramps:[-54,2,0],sweep:[-59,0,21.6],sweep2:[-30.6,2,27.4],bags:[-49.6,1,27.6],lift:[-39.1,2,27.6],finish:[-12,0,27.6]};
 const centers=Object.fromEntries(Object.entries(focuses).map(([key,p])=>[key,new T.Vector3(...p).add(root.position)]));
 return {root,objects,centers,parts:[...used],available:['aqua_ferry','aqua_sink','aqua_slide','aqua_sweeper','aqua_sweeper_disc','aqua_pendulum','aqua_trampoline','aqua_lift'].every(n=>used.has(n)),
  setVisible(on){objects.forEach(m=>m.visible=on);},
  update(t,on){if(!on)return;for(const o of motions){if(o.kind==='ferry')o.m.position.x=o.x+o.dx*moverPhase(t,o.phase);else if(o.kind==='meet')o.m.position.x=o.x+o.dx*moverPhase(t,0,1,2,1,2);else if(o.kind==='sink')o.m.position.y=o.y-1.95*moverPhase(t,o.phase,2.5,.35,.8,.35);else if(o.kind==='sweep')o.m.rotation.y=t*Math.PI*2/3.6+(o.phase||0);else if(o.kind==='bag')o.m.rotation.x=Math.sin(t*Math.PI*2/3+o.phase)*.95;else if(o.kind==='lift')o.m.position.y=-.4+3.6*moverPhase(t,0,1.1,2,1.1,2);else if(o.kind==='trampoline')o.m.scale.y=1-.13*Math.max(0,Math.sin(t*4+o.phase));}}
 };
}
