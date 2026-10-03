// «Шансы сейчас» (fisheco): пока сидишь с удочкой — цветная полоса по редкостям с процентами и строка «что их
// поднимает» (уровень, удочка, напиток, блесна, дождь, баркас). Те же формулы, что у броска сервера (shared/fishrules.ts).
import type { FishCastMods } from '../../shared/fishprogress.ts';
import { T_CHEST, T_JUNK, T_MYTH, TIER_CSS, TIER_SHORT, tierOdds } from '../../shared/fishrules.ts';
import { el } from './fish2.ts';
import { oddsParts } from './fishfmt.ts';
import './fisheco.css';

function p(x: number): string {
  const v = x * 100;
  return `${v >= 10 ? Math.round(v) : v >= 1 ? v.toFixed(1).replace('.', ',') : v.toFixed(2).replace('.', ',')}%`;
}

export class FishOdds {
  readonly root: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly legend: HTMLElement;
  private readonly why: HTMLElement;
  private key = '';

  constructor(parent: HTMLElement) {
    this.root = parent.appendChild(el('div', 'fe-odds'));
    const head = this.root.appendChild(el('div', 'fe-odds-head'));
    head.appendChild(el('b', '', 'Шансы сейчас'));
    this.bar = this.root.appendChild(el('div', 'fe-odds-bar'));
    this.legend = this.root.appendChild(el('div', 'fe-odds-legend'));
    this.why = this.root.appendChild(el('div', 'fe-odds-why'));
    // на телефоне строку «почему» открывают касанием (мышь у рыбака захвачена — там она видна всегда)
    this.root.addEventListener('click', () => this.root.classList.toggle('open'));
  }

  set(mods: Readonly<FishCastMods>, rain: boolean): void {
    const odds = tierOdds(rain, mods);
    const key = `${odds.map((x) => x.toFixed(4)).join()}|${rain}|${mods.zone}|${mods.level}|${mods.rod}|${mods.drink}|${mods.lure}`;
    if (key === this.key) return;
    this.key = key;
    this.bar.replaceChildren();
    this.legend.replaceChildren();
    for (let t = 0; t <= T_MYTH; t++) {
      if (odds[t] <= 0) continue;
      const seg = this.bar.appendChild(el('i', ''));
      seg.style.flexGrow = String(odds[t]);
      seg.style.background = TIER_CSS[t];
      const item = this.legend.appendChild(el('span', ''));
      item.style.setProperty('--tc', TIER_CSS[t]);
      item.textContent = `${TIER_SHORT[t]} ${p(odds[t])}`;
    }
    const extra = this.legend.appendChild(el('span', 'fe-odds-misc'));
    extra.textContent = `сундук ${p(odds[T_CHEST])} · хлам ${p(odds[T_JUNK])}`;
    this.why.textContent = oddsParts(mods, rain).join(' · ');
    this.root.title = `Что клюнет при следующем забросе. Редкие и выше: ${oddsParts(mods, rain).join(', ')}.`;
  }
}
