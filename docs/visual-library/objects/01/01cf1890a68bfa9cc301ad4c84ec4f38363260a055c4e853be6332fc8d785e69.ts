// «Шансы сейчас» в карточке рыбалки (кит UI 2.0, lab/ui «Рыбалка» → «С удочкой: ждёшь поклёвку»): полоса по категориям
// от обычной до царя морей, легенда в две колонки с процентами и одна пилюля «почему сейчас так» (сезон, дождь или туман,
// напиток). Те же формулы, что у броска сервера (shared/fishrules.ts tierOdds): итог честный — со всеми бонусами сразу.
// Хлам и сундук — не рыба: в полосу не входят (их доля — строкой «сундук · хлам» в журнале).
import type { FishCastMods } from '../../shared/fishprogress.ts';
import { RAIN_MUL, SEASON_MUL, TIER_CSS, T_COMMON, T_DIVINE, T_EPIC, T_LEGEND, T_MYTH, T_RARE, tierOdds } from '../../shared/fishrules.ts';
import { ALE, BEER, LORD, VODKA } from '../../shared/fishshop.ts';
import { iconImg } from '../ui/kit/dom.ts';
import { el } from './fish2.ts';
import { mul } from './fishfmt.ts';
import { gearUrl } from './fishkit.ts';

/** В легенде карточки — короче, чтобы две колонки влезли в 292 px (как lab/ui): от 10 — целыми, от 0,1 — с десятыми, меньше — с сотыми */
function legendPct(x: number): string {
  const v = x * 100;
  const s = v >= 10 ? String(Math.round(v)) : v >= 0.1 ? v.toFixed(1) : v.toFixed(2);
  return `${s.replace('.', ',')} %`;
}

/** Порядок и подписи легенды: обычные … мифы, царь морей (как на странице lab/ui) */
const ROWS: ReadonlyArray<readonly [number, string]> = [
  [T_COMMON, 'Обычные'], [T_RARE, 'Редкие'], [T_EPIC, 'Эпические'], [T_LEGEND, 'Легенды'], [T_MYTH, 'Мифы'], [T_DIVINE, 'Царь морей'],
];

/** Пилюля «почему»: сезон, погода (дождь у пристани, туман у острова) или напиток; ничего из этого — пусто */
function whyPill(mods: Readonly<FishCastMods>, rain: boolean, season: boolean, isle: boolean): string {
  const pill = (tone: string, icon: string, text: string): string => `<span class="k-pill k-pill--${tone} k-pill--sm">${icon}${text}</span>`;
  const img = (src: string): string => (src ? `<img class="k-ic" src="${src}" alt="">` : '');
  if (season) return pill(isle ? 'special' : 'gold', iconImg(isle ? 'fog' : 'season'), `сезон ${mul(SEASON_MUL)}`);
  if (rain) return isle ? pill('special', iconImg('fog'), `туман ${mul(RAIN_MUL)}`) : pill('info', iconImg('rain'), `дождь ${mul(RAIN_MUL)}`);
  if (mods.drink === 4) return pill('gold', img(gearUrl('fishshop/vodka')), `водка ${mul(VODKA.top ?? 1)}`);
  if (mods.drink === 3) return pill('gold', img(gearUrl('fishshop/beer')), `владыка ${mul(LORD.rare)}`);
  if (mods.drink === 2) return pill('gold', img(gearUrl('fishshop/ale')), `эль ${mul(ALE.rare)}`);
  if (mods.drink === 1) return pill('gold', img(gearUrl('fishshop/beer')), `пиво ${mul(BEER.rare)}`);
  return '';
}

export class FishOdds {
  readonly root: HTMLElement;
  private readonly why: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly legend: HTMLElement;
  private key = '';

  constructor(parent: HTMLElement) {
    this.root = parent.appendChild(el('div', 'fi-odds'));
    const head = this.root.appendChild(el('div', 'fi-odds-h'));
    head.appendChild(el('p', 'k-eyebrow fi-odds-t')).innerHTML = `${iconImg('odds', '')}Шансы сейчас`;
    this.why = head.appendChild(el('span', 'fi-odds-why'));
    this.bar = this.root.appendChild(el('div', 'fi-odds-bar'));
    this.legend = this.root.appendChild(el('div', 'fi-odds-legend'));
  }

  /** rain — дождь у пристани или туман у острова; season — сезон рыбалки или острова; isle — пул острова */
  set(mods: Readonly<FishCastMods>, rain: boolean, season = false, isle = false): void {
    if (mods.zone === 'pond') { rain = false; season = false; }
    const odds = tierOdds(rain, mods, season);
    const key = `${odds.map((x) => x.toFixed(6)).join()}|${rain}|${season}|${isle}|${mods.drink}|${mods.zone}`;
    if (key === this.key) return;
    this.key = key;
    this.why.innerHTML = whyPill(mods, rain, season, isle);
    this.bar.textContent = '';
    this.legend.textContent = '';
    for (const [t, name] of ROWS) {
      if (mods.zone === 'pond' && t > T_EPIC) continue;
      const x = odds[t] ?? 0;
      if (x > 0) {
        const seg = this.bar.appendChild(el('i', ''));
        seg.style.setProperty('--w', String(x * 100));
        seg.style.setProperty('--c', TIER_CSS[t]);
      }
      const item = this.legend.appendChild(el('span', x > 0 ? '' : 'is-zero'));
      item.appendChild(el('i', 'fi-dot')).style.setProperty('--c', TIER_CSS[t]);
      item.append(name);
      item.appendChild(el('b', '', legendPct(x)));
    }
  }
}
