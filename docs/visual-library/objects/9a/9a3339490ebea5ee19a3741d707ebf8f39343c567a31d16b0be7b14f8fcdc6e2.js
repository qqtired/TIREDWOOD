import {Stage} from './stage.js';
import {kit,THREE} from './kit.js';
import {assets} from './assets.js';
import {MODES_DEMOS} from './demos/modes/index.js';
import {SOCIAL_DEMOS} from './demos/social/index.js';
import {MODE_DEPTH,TOWER_BELTS,MODE_REQUESTS,SUCCESS_GATES} from './depth.mjs';
import {fitModelCamera,updateModelDepth} from './assets-view.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const parse=id=>JSON.parse(document.getElementById(id).textContent);
const features=parse('feature-data'),catalog=parse('catalog-data'),art=parse('art-data'),modelRegistry=parse('model-data'),iterations=parse('iteration-data');
const factories={...MODES_DEMOS,...SOCIAL_DEMOS};
const byId=id=>features.find(f=>f.id===id);
const stage=new Stage($('#stage-host'),$('#live-controls'),$('#stage-status'));
const e=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const readable=s=>String(s??'').replaceAll('Production-physics','Физику текущей игры').replaceAll('course ID','идентификатор трассы').replaceAll('production','текущей игры').replaceAll('playable','управляемом').replaceAll('checkpoint','контрольной точки').replaceAll('Ghost','Призрак').replaceAll('ghost','призрак').replaceAll('restart','повтор').replaceAll('replay','запись').replaceAll('proof','проверка автора').replace(/(\d)([А-Яа-яЁё])/g,'$1 $2').replace(/([А-Яа-яЁё])(\d)/g,'$1 $2');
const text=(sel,s)=>{$(sel).textContent=readable(s);};
let current='regatta',choice=new Set();try{choice=new Set(JSON.parse(localStorage.getItem('tiredwood-product-lab-v2-choice')||'[]').filter(id=>byId(id)));}catch{}
function list(items){return'<ul>'+items.map(x=>'<li>'+e(readable(x))+'</li>').join('')+'</ul>';}
function row(label,value){return'<div class="row"><strong>'+e(label)+'</strong><p>'+e(readable(value))+'</p></div>';}
function modelReview(info){const el=$('#model-review');el.hidden=!info;el.classList.toggle('draft',info?.review.status==='visual-draft');el.textContent=info?.review.note||'';}
features.forEach((f,i)=>{
 const b=document.createElement('button');b.className='nav-button';b.dataset.feature=f.id;b.setAttribute('aria-current','false');
 if(f.icon){const img=document.createElement('img');img.src=f.icon;img.alt='';b.append(img);}else{const n=document.createElement('i');n.textContent=String(i-5).padStart(2,'0');b.append(n);}
 b.append(document.createTextNode(f.title));b.addEventListener('click',()=>open(f.id));$('#'+(i<6?'mode-nav':'social-nav')).append(b);
});
function updateChoice(){
 $('#choice-count').textContent=choice.size;const on=choice.has(current);$('#add-feature').setAttribute('aria-pressed',String(on));$('#add-feature').textContent=on?'В пакете · убрать':'В свой пакет';
 try{localStorage.setItem('tiredwood-product-lab-v2-choice',JSON.stringify([...choice]));}catch{}
 const body=$('#choice-body');body.replaceChildren();
 features.filter(f=>choice.has(f.id)).forEach(f=>{const div=document.createElement('div');div.className='choice-row';const span=document.createElement('span'),b=document.createElement('b'),small=document.createElement('small'),remove=document.createElement('button');b.textContent=f.title;small.textContent=f.demo.goal;span.append(b,small);remove.textContent='Убрать';remove.addEventListener('click',()=>{choice.delete(f.id);updateChoice();});div.append(span,remove);body.append(div);});
 if(!choice.size)body.textContent='Пока ничего не выбрано. Добавь фичу после попытки.';
 $('#export-choice').disabled=!choice.size;
}
async function open(id){
 document.body.classList.remove('model-view');if(!byId(id))id='regatta';current=id;const f=byId(id),d=MODE_DEPTH[id];
 $$('.nav-button').forEach(b=>b.setAttribute('aria-current',String(b.dataset.feature===id)));
 text('#eyebrow',f.eyebrow);text('#title',f.title);text('#pitch',f.pitch);text('#demo-goal',f.demo.goal);text('#controls-hint',f.demo.controls);text('#decision-title',d?.decision||f.demo.goal);text('#skill',f.skill);text('#proves',f.demo.proves);text('#demo-scope',f.demo.doesNotProve);
 $('#core').innerHTML=(d?.first||f.core).map(x=>'<li>'+e(readable(x))+'</li>').join('');
 $('#cycle').innerHTML=f.loop.map(x=>'<div class="cycle-step"><small>'+e(x.seconds)+' с</small><b>'+e(x.action)+'</b><span>'+e(x.response)+'</span></div>').join('');
 const content=d?.content||f.variants.map(x=>[x.title,x.rule]);
 $('#content-variants').innerHTML='<p class="future-label">Контентный план: доступные в живой сцене варианты управляются над сценой/под ней. Остальные — следующий этап, не готовая игра.</p><div class="variants">'+content.map((x,i)=>'<div class="variant"><small>'+String(i+1).padStart(2,'0')+'</small><h3>'+e(x[0])+'</h3><p>'+e(readable(x[1]))+'</p></div>').join('')+'</div>';
 $('#tower-content').innerHTML=id==='tower'?'<table class="tower-map"><thead><tr><th>Пояс</th><th>Три испытания</th><th>Умение</th></tr></thead><tbody>'+TOWER_BELTS.map(x=>'<tr>'+x.map(v=>'<td>'+e(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table><p style="margin-top:14px">Ступень1: личное время фиксированной трассы. Ступень2 позже: отдельная высота + время. Полные185м ещё не проверены физикой.</p>':'';
 $('#outcomes').innerHTML=row('Успех',f.success)+row('Ошибка',f.failure)+row('Повтор',f.retry);
 $('#company').innerHTML=row('Место в мире',f.world)+row('2–4 игрока',d?.players||f.players)+row('Зрители',f.spectators)+row('Выход',f.exit);
 $('#package').innerHTML='<div class="package-grid"><div><h3>Первый пакет</h3>'+list(d?.first||f.core)+'</div><div><h3>После него</h3>'+list(d?.later||f.later)+'</div></div>'+row('Награды',d?.rewards||f.reward)+row('Без AFK-фарма',f.antiFarm);
 $('#acceptance').innerHTML='<p>Критерии для решения о следующем прототипе. Это цели проверки, не уже полученные показатели игроков.</p>'+list(SUCCESS_GATES[id]||[]);
 const refs=f.origin?.sources||f.sources||[];
 $('#sources').innerHTML=(d?row('Запрос игрока',MODE_REQUESTS[id])+row('Факт по исходникам',d.baseline)+row('Предложение',f.pitch):'<p><b>'+e(f.origin?.kind==='new'?'Новая фича.':'Развитие старой идеи deck-jam.')+'</b> Прототипы старого Lab используются как образец качества, а не выданы за новый готовый контент.</p>')+refs.map(r=>'<div class="source-row"><code>'+e(r.path)+' · '+e(r.lines)+'</code><span>'+e(r.note)+'</span></div>').join('');
 const ai=art.features[id];$('#concept-image').src=ai?.src||'';$('#concept-image').alt='ImageGen-концепт '+f.title;text('#concept-caption',ai?.caption||'Референс не задан');$('#concept-view').disabled=!ai;
 const modelId=(f.assets||[]).find(a=>modelRegistry[a]);const model=modelRegistry[modelId];
 modelReview(model);
 const refsGallery=$('#concept-gallery');refsGallery.replaceChildren();for(const ref of ai?.gallery||[]){const button=document.createElement('button');button.textContent=ref.title;button.addEventListener('click',()=>showImage(ref.src,ref.title,ref.caption));refsGallery.append(button);}
 $('#render-image').src=model?.renderData||'';$('#render-image').alt='Настоящий Blender-рендер '+(model?.title||modelId);text('#render-caption',model?model.title+' · настоящий Blender-рендер. '+model.triangles+' треугольников; исходник .blend и GLB рядом. '+(model.renderScope||'')+' '+model.review.note:'Для этой сцены переиспользуется процедурная геометрия игры. Новый Blender-набор не подменяет её.');$('#render-view').disabled=!model?.renderData;
 $('#render-view').dataset.model=modelId||'';$('#pause').textContent='Пауза';updateChoice();
 const gallery=$('#render-gallery');gallery.replaceChildren();for(const shot of model?.gallery||[]){const button=document.createElement('button'),img=document.createElement('img'),label=document.createElement('span');img.src=shot.src;img.alt=shot.title;label.textContent=shot.title;button.append(img,label);button.addEventListener('click',()=>showImage(shot.src,shot.title,shot.scope+' '+shot.blend));gallery.append(button);}
 try{history.replaceState(null,'','#'+id);}catch{}
 await stage.activate(id,factories[id]);
}
$('#add-feature').addEventListener('click',()=>{if(choice.has(current))choice.delete(current);else choice.add(current);updateChoice();text('#announcement',choice.has(current)?'Фича добавлена в пакет':'Фича убрана');});
$('#choice-open').addEventListener('click',()=>{updateChoice();$('#choice-dialog').showModal();});
$('#clear-choice').addEventListener('click',()=>{choice.clear();updateChoice();});
$('#export-choice').addEventListener('click',()=>{const out=['TIREDWOOD · выбор из продуктовой лаборатории v2','Это список для обсуждения, не запуск реализации.',''];features.filter(f=>choice.has(f.id)).forEach(f=>out.push(f.title,f.pitch,'Первый пакет: '+(MODE_DEPTH[f.id]?.first||f.core).join('; '),'Что проверить: '+f.demo.proves,''));const url=URL.createObjectURL(new Blob([out.join('\n')],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='tiredwood-product-lab-choice.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('#pause').addEventListener('click',()=>{stage.pause(!stage.paused);$('#pause').textContent=stage.paused?'Продолжить':'Пауза';});
let soundOn=false;$('#sound').addEventListener('click',()=>{soundOn=!soundOn;stage.setSound(soundOn);$('#sound').textContent='Звук: '+(soundOn?'вкл':'выкл');});
$('#fullscreen').addEventListener('click',()=>{const col=$('.play-column');if(document.fullscreenElement)document.exitFullscreen();else col.requestFullscreen().catch(()=>{});});
function showImage(src,title,note){$('#image-full').src=src;$('#image-full').alt=title;text('#image-title',title);text('#image-note',note);$('#image-dialog').showModal();}
$('#concept-view').addEventListener('click',()=>{const a=art.features[current];if(a)showImage(a.src,'ImageGen · '+byId(current).title,a.caption);});
$('#render-view').addEventListener('click',()=>{const m=modelRegistry[$('#render-view').dataset.model];if(m)showImage(m.renderData,'Blender · '+m.title+(m.review.status==='visual-draft'?' · Черновик':''),m.provenance+' '+(m.renderScope||'')+' '+m.review.note);});
$$('[data-close]').forEach(b=>b.addEventListener('click',()=>$('#'+b.dataset.close).close()));
$$('dialog').forEach(d=>d.addEventListener('click',ev=>{const r=d.getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)d.close();}));

function catalogStatus(entry){
 if(entry.id==='banner-plane')return['Уже есть игровой путь','client/lobby/planebanner.ts +shared/plane.ts. Не предлагаем как новую механику.'];
 if(entry.id==='photo-mode')return['Частично: PhotoBooth','client/lobby/photo.ts умаяка существует. Свободный фоторежимP — другой объём, в code не принят этим аудитом.'];
 if(entry.id==='deck-jam')return['Старая идея → глубокое развитие','В v2 Reply Jam: память, ритм, ответ, паузы и запись реально сыгранного мотива.'];
 if(entry.live)return['Старый живой прототип','Сохранён как образец качества отклика. Наличие локального Lab не доказывает сетевую интеграцию.'];
 if(entry.id==='ferry-horn')return['Старая идея / существующая опора','Рейсы и отсчёт отхода уже есть; точная механика расписания не выдана за реализованную.'];
 if(entry.id==='emote-wheel')return['Старая идея / часть жестов есть','Дай пять и обнимашки существуют. Это не доказательство radial-колеса.'];
 return['Старая идея без New','Только подтверждённая карточка старого каталога; в v2 не называется готовой игровой фичей.'];
}
$('#catalog-body').innerHTML='<table class="catalog-table"><thead><tr><th>Элемент</th><th>Замысел старой карточки</th><th>Что подтверждено сейчас</th></tr></thead><tbody>'+[...catalog.entries].sort((a,b)=>a.n-b.n).map(f=>{const st=catalogStatus(f);return'<tr><td><b>'+f.n+'. '+e(f.title)+'</b><small>'+e(f.id)+'</small><small>'+(f.live?'Живой старый прототип':'Старая идея')+'</small></td><td>'+e(f.pitch)+'</td><td><span class="catalog-status">'+e(st[0])+'</span><p>'+e(st[1])+'</p></td></tr>';}).join('')+'</tbody></table>';
$('#catalog-open').addEventListener('click',()=>$('#catalog-dialog').showModal());
$('#iterations-body').innerHTML=iterations.map((x,i)=>'<section class="iteration"><h3>'+e((i+1)+' · '+x.title)+'</h3><p>'+e(x.text)+'</p></section>').join('');
$('#iterations-open').addEventListener('click',()=>$('#iterations-dialog').showModal());
$('#models-body').innerHTML='<div class="models-grid">'+Object.values(modelRegistry).map(m=>'<section class="model-card"><h3>'+e(m.title)+'</h3><img src="'+m.renderData+'" alt="Blender-рендер '+e(m.title)+'"><p class="model-approval'+(m.review.status==='visual-draft'?' draft':'')+'">'+e(m.review.note)+'</p><p>'+e(m.triangles+' треугольников · '+m.clips.length+' настоящих клипов. '+m.provenance)+'</p><button data-model-play="'+m.id+'">Вращать и смотреть клипы</button></section>').join('')+'</div>';
async function viewModel(id){
 $('#pause').textContent='Пауза';
 modelReview(modelRegistry[id]);
 const info=modelRegistry[id];if(!info)return;document.body.classList.add('model-view');$('#models-dialog').close();text('#eyebrow','Настоящий Blender-набор · интерактивный просмотр');text('#title',info.title);text('#pitch','Мышь — вращать, колесо — приблизить. GLB и клипы загружены из встроенного оригинала.');text('#demo-goal','Повернуть модель и посмотреть действие');text('#controls-hint','Перетаскивание мышью, колесо; выбор клипа под сценой.');text('#decision-title','Форма и поведение');text('#skill',info.provenance);$('#core').innerHTML=list(['Рассмотреть силуэт и детали','Выбрать настоящий клип модели','Вернуться к управляемой механике']);text('#proves','Реальная экспортированная геометрия и клипы в WebGL. Масштаб, nodes и источники сохранены.');text('#demo-scope','Не доказывает проходимость полного игрового курса или синхронизацию с сервером.');
 await stage.activate('model:'+id,async ctx=>{
  const d=kit.diorama({radius:3,rail:false,cam:[8,7,11],look:[0,2,0]}),model=await assets.clone(id);d.scene.add(model);
  const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3());
  d.scene.fog=null;
  const fit=fitModelCamera(d.camera,box,$('#stage-host').clientWidth/$('#stage-host').clientHeight);let depth=updateModelDepth(d.camera,center,box);
  const mixer=new THREE.AnimationMixer(model);let action=null;const clips=model.animations||[];const options=[{value:'none',label:'Статичная форма'},...clips.map((c,i)=>({value:String(i),label:c.name}))];
  ctx.ui.select('Клип GLB',options,'none',value=>{action?.stop();action=null;if(value!=='none'){action=mixer.clipAction(clips[Number(value)]);action.reset().play();}});
  ctx.ui.button('Вернуться: '+byId(current).title,()=>open(current));
  ctx.ui.stat('Геометрия',info.triangles+' треуг.');ctx.ui.stat('Клипы',String(clips.length));ctx.ui.note('Это настоящий GLB. Источник Blender/рендеры рядом; свечение/материалы могут отличаться от финальной игры.');
  return{scene:d.scene,camera:d.camera,target:center,cameraOwned:false,onOrbitChange(target){depth=updateModelDepth(d.camera,target,box);},update(dt,t){mixer.update(dt);d.update(dt,t);},dispose(){mixer.stopAllAction();mixer.uncacheRoot(model);d.dispose();},getState:()=>({phase:'inspect',model:id,clip:action?.getClip().name||null,actualGLB:true,inspector:{...depth,fitDistance:fit.distance,size:fit.size,fog:!!d.scene.fog}})};
 });
}
$$('[data-model-play]').forEach(b=>b.addEventListener('click',()=>viewModel(b.dataset.modelPlay)));
$('#models-open').addEventListener('click',()=>$('#models-dialog').showModal());
window.__productLab={open,state:()=>stage.state(),features:features.map(f=>f.id),models:assets.ids(),choice:()=>[...choice],viewModel,pause:on=>stage.pause(on),version:'v2-2026-10-12',catalogCount:catalog.count};
window.addEventListener('pagehide',()=>stage.dispose());
updateChoice();open(location.hash.slice(1)||'regatta');
