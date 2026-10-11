import type { FarmEvent } from '../../../shared/farmnet.ts';
import type { HudSlots } from '../../ui/kit/slots.ts';
import { sfx } from '../../ui/kit/sfx.ts';
import { esc, fi } from './common.ts';
import { aggregateHarvest } from './loot-model.ts';

/** Одна короткая квитанция в свободном правом нижнем слоте, без захвата мыши. */
export class FarmLoot {
  private readonly root = document.createElement('div');
  private timer = 0;
  constructor(slots: HudSlots) {
    this.root.className = 'k-plate farm-loot';
    this.root.dataset.mode = 'farm';
    this.root.setAttribute('role', 'status');
    this.root.hidden = true;
    slots.br.append(this.root);
  }
  show(e: Extract<FarmEvent, { k: 'harvest' }>): void {
    const rows = aggregateHarvest(e.items);
    this.root.innerHTML = `<p class="k-eyebrow">Собрано</p><div class="farm-loot-items">${rows.map(r => `<div>${fi(r.icon)}<span>${esc(r.name)}</span><b>×${r.n}</b></div>`).join('')}</div><p class="farm-loot-xp k-gold">+${e.xp} опыта${e.gx ? ` · +${e.gx} общего` : ''}</p>${e.bagFull ? '<p class="k-bad">Сумка полна · остальное ждёт на грядках</p>' : ''}`;
    this.root.hidden = false;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.clear(), 7000);
    sfx.play('reward');
  }
  clear(): void { clearTimeout(this.timer); this.root.hidden = true; }
}
