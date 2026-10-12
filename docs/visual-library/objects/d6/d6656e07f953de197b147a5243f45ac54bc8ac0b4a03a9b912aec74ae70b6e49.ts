import { FRAME_TIERS,frameForLevel,levelProgress } from '../../shared/levels.ts';
import { drawLevelTag } from '../render/leveltag.ts';
import './levels.css';
const fmt=new Intl.NumberFormat('ru-RU');
export class LevelProgressView {
  readonly root=document.createElement('section');
  private readonly title=document.createElement('b');
  private readonly amount=document.createElement('span');
  private readonly bar=document.createElement('progress');
  private readonly tiers: {root:HTMLElement;min:number}[]=[];
  constructor(){
    this.root.className='prof-level';this.root.setAttribute('aria-label','Уровень игрока');
    const heading=document.createElement('div');heading.className='prof-level-heading';heading.append(this.title,this.amount);
    this.bar.setAttribute('aria-label','Опыт до следующего уровня');
    const frames=document.createElement('div');frames.className='prof-level-frames';
    for(const tier of FRAME_TIERS.filter(t=>t.id!=='none')){
      const item=document.createElement('div');item.className='prof-level-tier';
      const canvas=document.createElement('canvas');canvas.width=320;canvas.height=80;canvas.setAttribute('aria-hidden','true');
      drawLevelTag(canvas.getContext('2d')!,320,80,{name:tier.name,level:tier.min,team:null,mate:false});
      const label=document.createElement('span');label.textContent=`${tier.min} уровень`;item.append(canvas,label);frames.append(item);this.tiers.push({root:item,min:tier.min});
    }
    const note=document.createElement('small');note.textContent='1 жетон за игру = 1 XP. Казино, бонусы и возвраты не дают опыта. Навык рыбалки развивается отдельно.';
    this.root.append(heading,this.bar,frames,note);
  }
  update(xp:number):void {
    const p=levelProgress(xp),tier=frameForLevel(p.level);
    this.title.textContent=`Уровень ${p.level}${tier.id==='none'?'':` · ${tier.name}`}`;
    this.amount.textContent=`${fmt.format(p.current)} / ${fmt.format(p.needed)} XP`;
    this.bar.max=p.needed;this.bar.value=p.current;
    this.bar.setAttribute('aria-valuetext',`${fmt.format(p.current)} из ${fmt.format(p.needed)} опыта до уровня ${p.level+1}`);
    for(const t of this.tiers){const unlocked=p.level>=t.min;t.root.classList.toggle('locked',!unlocked);t.root.title=unlocked?'Рамка получена':`Откроется на уровне ${t.min}`;}
  }
}
