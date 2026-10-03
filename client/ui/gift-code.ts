import { GIFT_CODE_MAX_LENGTH, type GiftResultCode } from '../../shared/gifts.ts';
import './gift-code.css';

/** Ответы на подарочный код — и в примерочной, и в меню (Профиль → Подарки и коды) */
export const GIFT_RESULT_TEXT: Record<GiftResultCode,string> = {
  granted: 'Набор «Чертёнок» получен! Рожки и хвост появились в гардеробе.',
  already: 'Этот набор уже есть у тебя. Рожки — в шапках, хвост — в аксессуарах.',
  invalid: 'Код не подошёл. Проверь его и попробуй ещё раз.',
  rate_limit: 'Слишком много попыток. Попробуй через минуту.',
  disabled: 'Подарочные коды сейчас недоступны.',
  unavailable: 'Не удалось получить подарок. Попробуй ещё раз.',
};

/** No reward names or pictures before redemption; code never goes to storage or logs. */
export class GiftCodePanel {
  readonly root = document.createElement('details');
  private readonly input = document.createElement('input');
  private readonly button = document.createElement('button');
  private readonly status = document.createElement('p');
  private enabled = false;
  private pending = false;
  private timer = 0;
  constructor(parent: HTMLElement, send: (code: string) => void) {
    this.root.className = 'wd-gift'; this.root.hidden = true;
    const summary=document.createElement('summary');summary.textContent='Подарочный код';
    const form=document.createElement('form');form.className='wd-gift-form';
    const label=document.createElement('label');label.textContent='Есть код? Здесь можно получить подарок.';this.input.id='wd-gift-code';label.htmlFor=this.input.id;
    this.input.type='text';this.input.autocomplete='off';this.input.spellcheck=false;this.input.maxLength=GIFT_CODE_MAX_LENGTH;
    this.input.placeholder='Введи код';this.input.setAttribute('aria-label','Подарочный код');this.input.setAttribute('autocapitalize','characters');
    const controls=document.createElement('div');controls.className='wd-gift-controls';
    this.button.type='submit';this.button.textContent='Получить';controls.append(this.input,this.button);
    this.status.className='wd-gift-status';this.status.setAttribute('role','status');this.status.setAttribute('aria-live','polite');
    form.append(label,controls,this.status);this.root.append(summary,form);parent.append(this.root);
    form.addEventListener('keydown',event=>{if(event.key!=='Escape')event.stopPropagation();});
    form.addEventListener('keyup',event=>{if(event.key!=='Escape')event.stopPropagation();});
    form.addEventListener('submit',event=>{
      event.preventDefault();if(!this.enabled||this.pending)return;
      const code=this.input.value.trim();if(!code){this.status.textContent='Сначала введи код.';this.input.focus();return;}
      this.pending=true;this.button.disabled=true;this.button.textContent='Проверяем…';this.root.setAttribute('aria-busy','true');this.status.textContent='';
      this.timer=window.setTimeout(()=>this.result('unavailable'),6500);
      send(code);
    });
  }
  configure(enabled: boolean): void { this.enabled=enabled;this.root.hidden=!enabled;if(!enabled)this.close(); }
  result(result: GiftResultCode): void {
    this.clearPending();this.status.textContent=GIFT_RESULT_TEXT[result];this.status.dataset.success=String(result==='granted'||result==='already');
    if(result==='granted'||result==='already')this.input.value='';
  }
  close(): void {this.clearPending();this.root.open=false;this.status.textContent='';this.input.value='';}
  private clearPending(): void {clearTimeout(this.timer);this.timer=0;this.pending=false;this.button.disabled=false;this.button.textContent='Получить';this.root.removeAttribute('aria-busy');}
}
