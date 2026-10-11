// Журнал рыбака (рыбалка 2.0) — окно кита UI 2.0 (эталон: lab/ui/screens/fishing.js, сцена «5. журнал рыбака»):
// шапка (значок журнала, «Рыбалка · ур. N», «Журнал рыбака»), вкладки «Все / Пристань / Баркас / Остров (флаг ISLE) /
// Награды». Сверху один раз — сколько видов поймано полосой и следующая награда, ниже легенда значков и карточки видов
// по категориям: картинка (ещё не пойманные — силуэт), имя, рекорд веса, цена при продаже и как часто клюёт сейчас
// (с твоими бонусами, погодой и сезоном); значок в углу — только с баркаса / только в дождь / только в туман. Ниже —
// находки (сапог, бутылка, сундук) и старые находки прошлой рыбалки. «Награды» — fishrewards.ts.
// collectionGrid — компактная сетка для профиля (меню Esc → «Коллекция»): старый вид, классы .fb-* (fish2.css).
import { FISH, fmtWeight, type FishAlbum } from '../../shared/fishing.ts';
import {
  COLLECTION, COLLECTION_SIZE, FISH_TIERS, ISLE_COLLECTION, ISLE_SIZE, LEGACY_IDS, RULE, SP_BOOT, SP_BOTTLE, SP_CHEST, TIER_CSS, TIER_NAMES, TIER_TITLES, T_DIVINE, biteShare,
  collectionCount, priceRange,
} from '../../shared/fishrules.ts';
import { isleNextStep, nextStep, stepLabel, stepNeed, type RewardStep } from '../../shared/fishstyle.ts';
import { FishRewards, species } from './fishrewards.ts';
import { el, fishPic } from '../lobby/fish2.ts';
import { setCoinText } from './coin.ts';
import { emptyFishProgress, fishCastMods, fishLevel, type FishProgress } from '../../shared/fishprogress.ts';
import type { FishZone } from '../../shared/fishplaces.ts';
import { BARKAS_LEVEL } from '../../shared/fishshop.ts';
import { ISLE, ISLE_MIN_LEVEL } from '../../shared/fishisle.ts';
import { isleCaught } from '../../shared/islestyle.ts';
import { isleStepText } from '../lobby/fishfmt.ts';
import { fishDialog, tabsHtml, winHeadHtml, winIn } from '../lobby/fishkit.ts';
import '../lobby/fishwin.css';
import { FISH_ICONS } from './fishicons.ts';
import { coinHtml, iconImg } from './kit/dom.ts';
import { uiIcon } from './kit/icons.ts';
/** Фильтр журнала */
export type BookZone = 'all' | FishZone;

/** Описание вида одной строкой (подсказка у клетки и строка под сеткой): где и когда, доля поклёвок сейчас, цена. */
/**
 * Строка о виде. odds — с долей поклёвок по бонусам игрока (строка под сеткой); без неё — подсказка клетки: доля зависит
 * от уровня, снастей и погоды, поэтому в подсказке её нет, чтобы не было двух разных чисел на одно и то же.
 */
export function fishLine(sp: number, known: boolean, progress: FishProgress = emptyFishProgress(), rain = false, now = 0, odds = true, season = false): string {
  const r = RULE[sp];
  const f = FISH[sp];
  if (!r || !f) return '';
  const [lo, hi] = priceRange(sp);
  const mods = fishCastMods(progress, now, r.zone);
  // в сезон рыбалки — как в «Шансах сейчас»: редкие и выше ×2 к дождю (×3 к ясной погоде)
  const share = biteShare(sp, rain, mods, season) * 100;
  const fmt = (v: number): string => (v >= 1 ? v.toFixed(1) : v.toFixed(2)).replace('.', ',');
  const sea = `баркас в открытом море (с ${BARKAS_LEVEL}-го уровня рыбалки)`;
  // остров: его «дождь» — туман, сезон — свой (rain и season здесь — туман и сезон острова, их передаёт журнал)
  const isle = r.zone === 'isle';
  const wet = isle ? 'туман' : 'дождь';
  const where = isle ? `🏝 воды острова «Последний свет» (с ${ISLE_MIN_LEVEL}-го уровня рыбалки)` : r.zones.length > 1 ? `пристань и ${sea}` : r.zone === 'barkas' ? `⚓ ${sea}` : 'пристань';
  const when = r.rain ? `${isle ? '🌫' : '🌧'} только в ${wet}, цена ×1,5` : r.tier === T_DIVINE ? `в любую погоду; в ${wet} — в 1,5 раза чаще, в сезон ${isle ? 'острова' : 'рыбалки'} — ещё вдвое` : 'в любую погоду';
  const now2 = r.rain && !rain ? `в ${wet} — ${fmt(biteShare(sp, true, mods) * 100)}% поклёвок` : `сейчас — ${fmt(share)}% поклёвок`;
  return `${f.name}${known ? '' : ' · ещё не поймана'} · ${TIER_NAMES[r.tier]} · ${where} · ${when}${odds ? ` · ${now2}` : ''} · ${lo}–${hi} 🪙 · ${r.note}`;
}

/** Сетка коллекции: по категориям, в каждой — «сколько из скольких»; compact — для профиля (без цен); zone — фильтр. */
export function collectionGrid(album: FishAlbum, compact: boolean, onPick?: (sp: number) => void, zone: BookZone = 'all'): HTMLElement {
  const root = el('div', compact ? 'fb-grid compact' : 'fb-grid');
  for (const tier of FISH_TIERS) {
    const list = (zone === 'isle' ? ISLE_COLLECTION : COLLECTION).filter((sp) => RULE[sp]!.tier === tier && (zone === 'all' || RULE[sp]!.zones.includes(zone)));
    if (!list.length) continue;
    const got = list.filter((sp) => album[FISH[sp].id]).length;
    const sec = root.appendChild(el('div', 'fb-sec'));
    sec.style.setProperty('--tc', TIER_CSS[tier]);
    const h = sec.appendChild(el('div', 'fb-sec-h'));
    h.appendChild(el('b', '', TIER_TITLES[tier]));
    h.appendChild(el('span', '', `${got} из ${list.length}`));
    const cells = sec.appendChild(el('div', 'fb-cells'));
    for (const sp of list) cells.appendChild(cell(sp, album, compact, onPick));
  }
  // находки и старые находки (во вкладке острова — только его виды)
  if (zone === 'isle') return root;
  const finds = [SP_BOOT, SP_BOTTLE, SP_CHEST].filter((sp) => album[FISH[sp].id]);
  const legacy = LEGACY_IDS.map((id) => FISH.findIndex((f) => f.id === id)).filter((sp) => sp >= 0 && album[FISH[sp].id]);
  if (finds.length + legacy.length > 0) {
    const sec = root.appendChild(el('div', 'fb-sec finds'));
    sec.style.setProperty('--tc', TIER_CSS[5]);
    const h = sec.appendChild(el('div', 'fb-sec-h'));
    h.appendChild(el('b', '', 'Находки'));
    const cells = sec.appendChild(el('div', 'fb-cells'));
    for (const sp of finds) cells.appendChild(findCell(sp, album, ''));
    for (const sp of legacy) cells.appendChild(findCell(sp, album, 'старая находка'));
  }
  return root;
}

function cell(sp: number, album: FishAlbum, compact: boolean, onPick?: (sp: number) => void): HTMLElement {
  const f = FISH[sp];
  const r = RULE[sp]!;
  const e = album[f.id];
  const c = el(onPick ? 'button' : 'div', e ? 'fb-cell' : 'fb-cell unknown');
  if (c instanceof HTMLButtonElement) c.type = 'button';
  c.dataset.species = f.id;
  c.style.setProperty('--tc', TIER_CSS[r.tier]);
  c.appendChild(fishPic(sp, 'fb-pic', !!e));
  const seaOnly = r.zone === 'barkas' && r.zones.length === 1;
  const both = r.zones.length > 1;
  const isle = r.zone === 'isle';
  if (r.rain || seaOnly || both) {
    const marks = c.appendChild(el('span', 'fb-rain', `${seaOnly ? '⚓' : both ? '⚓+' : ''}${r.rain ? (isle ? '🌫' : '🌧') : ''}`));
    const what = [seaOnly ? 'ловится только с баркаса' : both ? 'ловится и у пристани, и с баркаса' : '', r.rain ? (isle ? 'только в туман' : 'только в дождь') : ''].filter(Boolean).join(', ');
    marks.title = what;
    marks.setAttribute('aria-label', what);
  }
  c.appendChild(el('span', 'fb-name', f.name));
  c.appendChild(el('span', 'fb-tier', TIER_NAMES[r.tier]));
  c.appendChild(el('span', 'fb-rec', e ? `поймана · ×${e[1]}` : 'не поймана · ×0'));
  c.appendChild(el('span', 'fb-rec', e ? `рекорд ${fmtWeight(e[0])}` : 'рекорд —'));
  if (!compact) {
    const [lo, hi] = priceRange(sp);
    setCoinText(c.appendChild(el('span', 'fb-price')), `${lo}–${hi} 🪙`);
  }
  c.title = fishLine(sp, !!e, undefined, false, 0, false).replace(/ 🪙/, ' жетонов');
  if (onPick) {
    c.addEventListener('pointerenter', () => onPick(sp));
    c.addEventListener('focus', () => onPick(sp));
    c.addEventListener('click', () => onPick(sp));
  }
  return c;
}

function findCell(sp: number, album: FishAlbum, note: string): HTMLElement {
  const f = FISH[sp];
  const e = album[f.id]!;
  const c = el('div', 'fb-cell find');
  c.appendChild(fishPic(sp, 'fb-pic', true));
  c.appendChild(el('span', 'fb-name', f.name));
  c.appendChild(el('span', 'fb-rec', note || `×${e[1]}`));
  c.title = note ? `${f.name} — ${note} из прошлой рыбалки` : `${f.name}: ${e[1]}`;
  return c;
}


/** Вкладка журнала: место (фильтр видов) или «Награды» */
type BookTab = BookZone | 'rewards';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** Названия в кавычках — жирным (золотом в .fi-next-r b): «удочка <b>«Резная»</b>» */
const quoted = (s: string): string => esc(s).replace(/«[^»]*»/g, (m) => `<b>${m}</b>`);
/** Доля поклёвок: «4,2 %», меньше процента — «0,35 %» */
const fmtPct = (v: number): string => `${(v >= 1 ? v.toFixed(1) : v.toFixed(2)).replace('.', ',')} %`;
/** Полоса кита с подписью внутри (как meter() в lab/ui/screens/fishing.js) */
const meterHtml = (v: number, label: string): string => `<div class="k-meter k-meter--lg k-meter--good" style="--v:${Math.min(1, Math.max(0, v)).toFixed(3)}">`
  + `<i class="k-meter-ghost"></i><i class="k-meter-fill"></i><span class="k-meter-label">${label}</span></div>`;
/** Картинка награды ступени (рисунок снасти или вещи из fishicons.ts): сначала снасть, потом остальное */
function stepPic(step: RewardStep): string {
  const id = [...step.items].sort((a, b) => Number(!'rbwn'.includes(a[0])) - Number(!'rbwn'.includes(b[0]))).find((i) => FISH_ICONS[i]);
  return id ? FISH_ICONS[id] : iconImg('gift', '');
}

/** Окно журнала на набережной: открывается по J или кнопке журнала, закрывается крестиком, кликом мимо окна, Esc или J. */
export class FishBook {
  onClose: () => void = () => {};
  /** Вкладка «Награды» (fishrewards.ts): снасти и лестница наград */
  readonly rewards = new FishRewards();
  private readonly root: HTMLDialogElement;
  private readonly win: HTMLElement;
  private readonly eyebrow: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly body: HTMLElement;
  private tab: BookTab = 'all';
  private rain = false;
  private season = false;
  /** Туман и сезон острова — для видов острова */
  private isleFog = false;
  private isleSeason = false;
  private now = 0;
  private last: { album: FishAlbum; owned: readonly string[]; progress: FishProgress } | null = null;
  private shown = false;
  /** Что сейчас нарисовано (вкладки и тело) — не перерисовывать то же самое: клик не теряется, прокрутка на месте */
  private tabsKey = '';
  private bodyKey = '';

  constructor(parent: HTMLElement) {
    const { dlg, win } = fishDialog(parent, 'k-window--lg fi-book');
    this.root = dlg;
    this.win = win;
    dlg.setAttribute('aria-labelledby', 'fish-book-title');
    win.innerHTML = winHeadHtml({ portrait: iconImg('journal', ''), eyebrow: 'Рыбалка', title: 'Журнал рыбака' })
      + '<div class="fi-tabwrap"></div><div class="k-win-body"></div>';
    this.eyebrow = win.querySelector<HTMLElement>('.k-eyebrow')!;
    win.querySelector('.k-win-title')!.id = 'fish-book-title';
    this.tabs = win.querySelector<HTMLElement>('.fi-tabwrap')!;
    this.body = win.querySelector<HTMLElement>('.k-win-body')!;
    win.querySelector('.k-close')!.addEventListener('click', () => this.close());
    this.tabs.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-tab]');
      if (!b || b.dataset.tab === this.tab) return;
      this.tab = b.dataset.tab as BookTab;
      this.bodyKey = '';
      this.body.scrollTop = 0;
      if (this.last) this.render(this.last.album, this.last.owned, this.last.progress);
    });
    dlg.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Escape' || e.code === 'KeyJ') { e.preventDefault(); this.close(); }
    });
    dlg.addEventListener('keyup', (e) => e.stopPropagation());
    // Esc и клик мимо окна (fishDialog шлёт cancel)
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); this.close(); });
  }

  get isOpen(): boolean {
    return this.shown;
  }

  /** Погода, сезон рыбалки и часы сервера — для «сейчас N %» */
  setWeather(rain: boolean, now: number, season = false, isleFog = false, isleSeason = false): void {
    this.rain = rain;
    this.now = now;
    this.season = season;
    this.isleFog = isleFog;
    this.isleSeason = isleSeason;
  }

  open(album: FishAlbum, owned: readonly string[], progress: FishProgress): void {
    this.shown = true;
    this.tabsKey = '';
    this.bodyKey = '';
    this.render(album, owned, progress);
    this.root.showModal();
    winIn(this.win);
  }

  /** Новый улов при открытом журнале — перерисовать */
  update(album: FishAlbum, owned: readonly string[], progress: FishProgress): void {
    if (this.shown) this.render(album, owned, progress);
  }

  close(): void {
    if (!this.shown) return;
    this.shown = false;
    this.root.close();
    this.onClose();
  }

  private render(album: FishAlbum, owned: readonly string[], progress: FishProgress): void {
    this.last = { album, owned, progress };
    // вкладка острова — только с флагом ISLE
    if (!ISLE.on && this.tab === 'isle') this.tab = 'all';
    const level = fishLevel(progress.xp);
    this.eyebrow.textContent = `Рыбалка · ур. ${level}`;
    const zoneCount = (z: FishZone): string => {
      const list = COLLECTION.filter((sp) => RULE[sp]!.zones.includes(z));
      return `${list.filter((sp) => album[FISH[sp].id]).length}/${list.length}`;
    };
    const tabs = tabsHtml([
      ['all', uiIcon('journal'), 'Все', null],
      ['pier', uiIcon('float'), 'Пристань', zoneCount('pier')],
      ['barkas', uiIcon('anchor'), 'Баркас', zoneCount('barkas')],
      ...(ISLE.on ? [['isle', uiIcon('lighthouse'), 'Остров', `${isleCaught({ album })}/${ISLE_SIZE}`] as const] : []),
      ['rewards', uiIcon('season'), 'Награды', null],
    ], this.tab);
    if (tabs !== this.tabsKey) {
      this.tabsKey = tabs;
      const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.fi-tabwrap [data-tab]')?.dataset.tab;
      this.tabs.innerHTML = tabs;
      if (focused) this.tabs.querySelector<HTMLElement>(`[data-tab="${focused}"]`)?.focus();
    }
    const scroll = this.body.scrollTop;
    if (this.tab === 'rewards') {
      const view = this.rewards.view(album, owned, level);
      if (view.innerHTML === this.bodyKey) return;
      this.bodyKey = view.innerHTML;
      this.body.replaceChildren(view);
    } else {
      const html = this.fishHtml(album, progress, this.tab, level);
      if (html === this.bodyKey) return;
      this.bodyKey = html;
      this.body.innerHTML = html;
    }
    this.body.scrollTop = scroll;
  }

  /** Вкладка видов: полоса и следующая награда, легенда, карточки по категориям, находки */
  private fishHtml(album: FishAlbum, progress: FishProgress, zone: BookZone, level: number): string {
    const isle = zone === 'isle';
    let next: string;
    let meter: string;
    if (isle) {
      // свой счётчик и своя лестница острова; коллекция 52 видов от них не растёт
      const n = isleCaught({ album });
      meter = meterHtml(n / ISLE_SIZE, `${n} из ${ISLE_SIZE} видов острова`);
      const step = isleNextStep(n);
      next = level < ISLE_MIN_LEVEL
        ? `${iconImg('lock', '')}<span>Рыба острова — <b>с ${ISLE_MIN_LEVEL}-го уровня</b>. Доплыть — на своей лодке или пассажиром</span>`
        : step
          ? `${stepPic(step)}<span>Следующая награда острова — ${quoted(isleStepText(step))}: ещё ${species(Math.min(step.need, ISLE_SIZE) - n)}</span>`
          : `${iconImg('medal-gold', '')}<span><b>Все виды острова пойманы</b> — сет «Смотритель маяка» твой</span>`;
    } else {
      const n = collectionCount(album);
      meter = meterHtml(n / COLLECTION_SIZE, `${n} из ${COLLECTION_SIZE} видов`);
      // награды коллекции — лестница по видам (вкладка «Награды»)
      const step = nextStep(n);
      next = step
        ? `${stepPic(step)}<span>Следующая награда — ${quoted(stepLabel(step))}: ещё ${species(stepNeed(step) - n)}</span>`
        : `${iconImg('medal-gold', '')}<span><b>Коллекция собрана</b> — все награды твои: сет «Хозяин глубин», золотые снасти и якорь у ника</span>`;
    }
    const legend = (isle
      ? `<span>${iconImg('fog', '')}только в туман, цена ×1,5</span>`
      : `<span>${iconImg('rain', '')}только в дождь, цена ×1,5</span><span>${iconImg('anchor', '')}с баркаса</span>`)
      + `<span>${coinHtml()} цена при продаже</span><span><b>сейчас N %</b> — доля поклёвок с твоими бонусами</span>`;
    let html = `<div class="k-cell fi-next">${meter}<div class="fi-next-r">${next}</div></div><div class="fi-legend">${legend}</div>`;
    for (const tier of FISH_TIERS) {
      const list = (isle ? ISLE_COLLECTION : COLLECTION).filter((sp) => RULE[sp]!.tier === tier && (zone === 'all' || RULE[sp]!.zones.includes(zone)));
      if (!list.length) continue;
      const got = list.filter((sp) => album[FISH[sp].id]).length;
      html += `<h3 class="fi-h"><i class="fi-dot" style="--c:${TIER_CSS[tier]}"></i>${TIER_TITLES[tier]} <small>${got} из ${list.length}</small></h3>`
        + `<div class="fi-grid">${list.map((sp) => this.cardHtml(sp, album, progress)).join('')}</div>`;
    }
    // находки и старые находки (во вкладке острова — только его виды)
    if (!isle) {
      const finds = [SP_BOOT, SP_BOTTLE, SP_CHEST].filter((sp) => album[FISH[sp].id]);
      const legacy = LEGACY_IDS.map((id) => FISH.findIndex((f) => f.id === id)).filter((sp) => sp >= 0 && album[FISH[sp].id]);
      if (finds.length + legacy.length > 0) {
        const card = (sp: number, line: string): string => `<div class="fi-fcard is-got" style="--tc:${TIER_CSS[RULE[sp]?.tier ?? 5]}">`
          + `<div class="fi-fcard-art">${fishPic(sp, '', true).outerHTML}</div><b class="fi-fcard-name">${esc(FISH[sp].name)}</b><span class="fi-fcard-line">${line}</span></div>`;
        html += `<h3 class="fi-h"><i class="fi-dot" style="--c:${TIER_CSS[5]}"></i>Находки</h3><div class="fi-grid">`
          + finds.map((sp) => card(sp, `поймано <b>×${album[FISH[sp].id]![1]}</b>`)).join('')
          + legacy.map((sp) => card(sp, 'старая находка')).join('') + '</div>';
      }
    }
    return html;
  }

  /** Карточка вида: значки места и погоды в углу, картинка (силуэт — ещё не поймана), имя, рекорд, цена, клёв сейчас */
  private cardHtml(sp: number, album: FishAlbum, progress: FishProgress): string {
    const f = FISH[sp];
    const r = RULE[sp]!;
    const e = album[f.id];
    const isle = r.zone === 'isle';
    // остров: его «дождь» — туман, сезон — свой
    const rain = isle ? this.isleFog : this.rain;
    const season = isle ? this.isleSeason : this.season;
    const tag = (icon: string, what: string): string => `<span class="fi-fcard-tag" role="img" aria-label="${what}">${iconImg(icon, '')}</span>`;
    const tags = (r.rain ? tag(isle ? 'fog' : 'rain', isle ? 'только в туман' : 'только в дождь') : '')
      + (r.zone === 'barkas' && r.zones.length === 1 ? tag('anchor', 'только с баркаса') : '');
    const mods = fishCastMods(progress, this.now, r.zone);
    const wet = isle ? 'туман' : 'дождь';
    const odds = r.rain && !rain ? `в ${wet} <b>${fmtPct(biteShare(sp, true, mods) * 100)}</b>` : `сейчас <b>${fmtPct(biteShare(sp, rain, mods, season) * 100)}</b>`;
    const [lo, hi] = priceRange(sp);
    return `<div class="fi-fcard${e ? ' is-got' : ''}" style="--tc:${TIER_CSS[r.tier]}" data-species="${f.id}">${tags}`
      + `<div class="fi-fcard-art">${fishPic(sp, '', !!e).outerHTML}</div>`
      + `<b class="fi-fcard-name">${esc(f.name)}</b>`
      + `<span class="fi-fcard-line">${e ? `рекорд <b>${fmtWeight(e[0])}</b>` : 'ещё не поймана'}</span>`
      + `<span class="fi-fcard-line">${coinHtml()} ${lo}–${hi}</span>`
      + `<span class="fi-fcard-line">${odds}</span></div>`;
  }
}
