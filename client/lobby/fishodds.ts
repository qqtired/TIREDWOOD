// «Шансы сейчас» (fisheco): пока сидишь с удочкой — цветная полоса по категориям с процентами и строка «что их
// поднимает» (сезон или дождь, уровень, удочка, напиток или водка, блесна, баркас). Те же формулы, что у броска сервера
// (shared/fishrules.ts tierOdds): итог честный — со всеми бонусами сразу. Наведи на категорию — видно, из чего он сложен:
// база места × погода × бонусы; у нижней категории под потолком — ещё и сколько ей осталось после старших.
import type { FishCastMods } from '../../shared/fishprogress.ts';
import { FISH_TIERS, T_CHEST, T_COMMON, T_JUNK, TIER_CSS, TIER_NAMES, TIER_SHORT, tierOdds, tierOddsParts, tierRank } from '../../shared/fishrules.ts';
import { el } from './fish2.ts';
import { mul, oddsParts } from './fishfmt.ts';
import './fisheco.css';

/** Процент: от 10 — целыми, от 1 — с десятыми, меньше — с сотыми (у божественной — с тысячными) */
export function oddsPct(x: number): string {
  const v = x * 100;
  const s = v >= 10 ? String(Math.round(v)) : v >= 1 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toFixed(3);
  return `${s.replace('.', ',')}%`;
}

export class FishOdds {
  readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly legend: HTMLElement;
  private readonly why: HTMLElement;
  private key = '';

  constructor(parent: HTMLElement) {
    this.root = parent.appendChild(el('div', 'fe-odds'));
    const head = this.root.appendChild(el('div', 'fe-odds-head'));
    this.title = head.appendChild(el('b', '', 'Шансы сейчас'));
    this.bar = this.root.appendChild(el('div', 'fe-odds-bar'));
    this.legend = this.root.appendChild(el('div', 'fe-odds-legend'));
    this.why = this.root.appendChild(el('div', 'fe-odds-why'));
    // на телефоне строку «почему» открывают касанием (мышь у рыбака захвачена — там она видна всегда)
    this.root.addEventListener('click', () => this.root.classList.toggle('open'));
  }

  set(mods: Readonly<FishCastMods>, rain: boolean, season = false): void {
    const odds = tierOdds(rain, mods, season);
    const key = `${odds.map((x) => x.toFixed(6)).join()}|${rain}|${season}|${mods.zone}|${mods.level}|${mods.rod}|${mods.drink}|${mods.lure}`;
    if (key === this.key) return;
    this.key = key;
    this.title.textContent = season ? 'Шансы сейчас · 🎣 сезон рыбалки' : rain ? 'Шансы сейчас · 🌧 дождь' : 'Шансы сейчас';
    this.root.classList.toggle('season', season);
    this.bar.replaceChildren();
    this.legend.replaceChildren();
    for (const t of FISH_TIERS) {
      if (odds[t] <= 0) continue;
      const seg = this.bar.appendChild(el('i', ''));
      seg.style.flexGrow = String(odds[t]);
      seg.style.background = TIER_CSS[t];
      const item = this.legend.appendChild(el('span', ''));
      item.style.setProperty('--tc', TIER_CSS[t]);
      item.textContent = `${TIER_SHORT[t]} ${oddsPct(odds[t])}`;
      const rank = tierRank(t);
      if (rank > 0) {
        const p = tierOddsParts(rank, rain, mods, season);
        const want = p.base * p.weather * p.bonus;
        // потолок сверху вниз: старшие взяли своё целиком, нижней оставшейся — остаток до 100 %
        const cap = p.now < want - 1e-9 ? ` → ${oddsPct(p.now)}: старшие категории взяли своё, этой — остаток` : '';
        item.title = `${TIER_NAMES[t]}: база ${oddsPct(p.base)} × погода ${mul(p.weather)} × бонусы ${mul(p.bonus)} = ${oddsPct(want)}${cap}`;
      } else item.title = `${TIER_NAMES[t]}: всё, что осталось от остальных категорий`;
    }
    const extra = this.legend.appendChild(el('span', 'fe-odds-misc'));
    // с 10-го уровня хлама нет совсем — так и пишем, без «хлам 0,000%»
    extra.textContent = `сундук ${oddsPct(odds[T_CHEST])} · ${odds[T_JUNK] > 0 ? `хлам ${oddsPct(odds[T_JUNK])}` : 'хлама нет'}`;
    const parts = oddsParts(mods, rain, season);
    this.why.textContent = parts.join(' · ');
    const full = odds[T_COMMON] <= 0 ? ' Потолок: обычных не осталось — всё место заняли редкие и выше, старшие — в первую очередь.' : '';
    this.root.title = `Что клюнет при следующем забросе. Редкие и выше: ${parts.join(', ')}.${full}`;
  }
}
