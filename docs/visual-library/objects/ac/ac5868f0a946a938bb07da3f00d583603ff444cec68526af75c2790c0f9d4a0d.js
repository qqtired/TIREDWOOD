// Bind new behavior after the unchanged app has installed the shared controls.
const tenDirectionsAct=act;
act=function(action,el){
 if(scene().radar)return;
 if(action.startsWith('ex-')){
  if(action==='ex-quiet')exState.quiet=!exState.quiet;
  if(action==='ex-help'){exState.help=!exState.help;if(!exState.help)exState.helpPinned=false;}
  if(action==='ex-help-pin'){exState.helpPinned=!exState.helpPinned;exState.help=true;}
  if(action==='ex-ready')exState.ready=!exState.ready;
  if(action==='ex-events')exState.eventsOpen=!exState.eventsOpen;
  if(action==='ex-pin')exState.pinContext=!exState.pinContext;
  if(action==='ex-hp-detail')exState.hpDetail=!exState.hpDetail;
  render();return;
 }
 if(action==='hit'&&activeDirection()==='jelly'&&scene().combat){exState.ghostHp=scene().hp;clearTimeout(exGhostTimer);exGhostTimer=setTimeout(()=>{exState.ghostHp=null;if(activeDirection()==='jelly')render();},1400);}
 if(action==='heal')exState.ghostHp=null;
 tenDirectionsAct(action,el);
};
const tenDirectionsReset=reset;
reset=function(){clearTimeout(exGhostTimer);exState={quiet:false,help:false,helpPinned:false,ready:false,eventsOpen:false,pinContext:false,hpDetail:false,ghostHp:null};tenDirectionsReset();};
// Losing hover must not collapse help while the user is reading or using the keyboard.
// The pin button instead keeps it when another direction is selected and revisited.
$('#directions').addEventListener('click',()=>{if(!exState.helpPinned)exState.help=false;},true);
document.title='TIREDWOOD — пятнадцать направлений HUD';
$('.review-head h1').textContent='Пятнадцать направлений HUD';
$('.review-head p').textContent='11–15: пять новых дизайнов с работающими особенностями. Предыдущие десять сохранены.';
$('#directions').innerHTML=`<div class="direction-group extra"><div class="direction-group-head">Новые идеи · 11–15<span>Разные дизайны и работающие особенности</span></div><div class="direction-group-buttons">${DIRECTIONS.filter(d=>d.number>=11).map(directionButton).join('')}</div></div><div class="direction-group next"><div class="direction-group-head">Материалы · 6–10<span>Предыдущая принятая ревизия</span></div><div class="direction-group-buttons">${DIRECTIONS.filter(d=>d.number>=6&&d.number<=10).map(directionButton).join('')}</div></div><div class="direction-group"><div class="direction-group-head">Первые направления · 1–5<span>Сохранены для сравнения</span></div><div class="direction-group-buttons">${DIRECTIONS.filter(d=>d.number<=5).map(directionButton).join('')}</div></div><div class="direction-group current"><div class="direction-group-head">Контроль</div>${directionButton(DIRECTIONS.find(d=>d.id==='current'))}</div>`;
$('#scenario-guard').textContent='Подземелье сохраняет свой отдельный HUD. Ни один из пятнадцати вариантов его не переоформляет; сцена только для просмотра.';
const evidenceFirst=$('.evidence p');if(evidenceFirst)evidenceFirst.textContent=evidenceFirst.textContent.replace('Десять вариантов','Пятнадцать вариантов');
state.direction='pins';render();
window.hudPrototype.render=render;window.hudPrototype.reset=reset;
Object.defineProperty(window.hudPrototype,'extraState',{get:()=>exState});
