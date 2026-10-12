// Подсказка действия фермы в слоте bc (кит .k-prompt): «E · Полить тыкву · созреет 12:40 → 10:08 · лейка −1». Данные — prompt-model.ts.
// Серая (.k-prompt--off) — когда нельзя; над ней плашка «чья грядка» у соседей. Семена открываются отдельным окном.
import { keyHtml } from '../../ui/kit/dom.ts';
import type { HudSlots } from '../../ui/kit/slots.ts';
import { esc, fi } from './common.ts';
import type { Prompt, PromptPill } from './prompt-model.ts';

function pill(p: PromptPill): string {
  return `<span class="k-pill${p.tone ? ` k-pill--${p.tone}` : ''} k-pill--sm">${p.icon ? fi(p.icon) : ''}${esc(p.text)}</span>`;
}

/** Разметка внутренности .k-prompt: клавиши, текст, за чертой — пометка и пилюли */
export function promptHtml(p: Prompt): string {
  const tail = (p.note ? `<span class="k-prompt-note">${esc(p.note)}${p.strong ? `<b>${esc(p.strong)}</b>` : ''}</span>` : '') + (p.pills ?? []).map(pill).join('');
  return `${p.keys.map((k) => keyHtml(k)).join('')}${esc(p.text)}${tail ? `<span class="k-prompt-sep"></span>${tail}` : ''}`;
}

export class FarmPrompt {
  private readonly root = document.createElement('div');
  private readonly whose = document.createElement('div');
  private readonly act = document.createElement('div');
  private key = '';
  private visible = false;
  private want: Prompt | null = null;

  constructor(slots: HudSlots) {
    this.root.className = 'farm-bc farm-hint';
    this.root.dataset.mode = 'farm';
    this.whose.className = 'k-pill k-pill--plate farm-whose';
    this.act.className = 'k-prompt farm-act';
    this.root.append(this.whose, this.act);
    this.root.hidden = true;
    slots.bc.append(this.root);
  }

  /** null — спрятать. Повтор той же подсказки DOM не трогает (зовут каждый кадр) */
  set(p: Prompt | null): void {
    this.want = p;
    const key = p ? JSON.stringify(p) : '';
    if (key === this.key) return;
    this.key = key;
    this.paint();
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.paint();
  }

  private paint(): void {
    const p = this.want;
    this.root.hidden = !(this.visible && p);
    if (!p) return;
    this.act.classList.toggle('k-prompt--off', p.keys.length === 0);
    this.act.innerHTML = promptHtml(p);
    this.whose.hidden = !p.whose;
    if (p.whose) this.whose.innerHTML = `${fi(p.whose.icon)}${esc(p.whose.text)}`;
  }
}
