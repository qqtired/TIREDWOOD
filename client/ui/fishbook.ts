// Журнал рыбака (рыбалка 2.0): все виды коллекции по категориям — картинка (ещё не пойманные — тёмный силуэт), имя,
// категория подписью и цветом, сколько поймано и рекорд веса, цена; виды баркаса — с ⚓, виды дождя — с 🌧; фильтр
// «Пристань / Баркас»; у вида — где и когда ловится и сколько поклёвок он даёт сейчас (с твоими бонусами).
// Ниже — находки (сапог, бутылка, сундуки) и старые находки прошлой рыбалки (золотая рыбка). Окно на набережной
// (J или кнопка 📖) и сетка в профиле — одна и та же сетка.
import { FISH, fmtWeight, type FishAlbum } from '../../shared/fishing.ts';
import {
  COLLECTION, COLLECTION_SIZE, LEGACY_IDS, RULE, SP_BOOT, SP_BOTTLE, SP_CHEST, TIER_CSS, TIER_NAMES, TIER_TITLES, T_MYTH, biteShare,
  collectionCount, priceRange,
} from '../../shared/fishrules.ts';
import { nextStep, stepLabel, stepNeed } from '../../shared/fishstyle.ts';
import { FishRewards, species } from './fishrewards.ts';
import { el, fishPic } from '../lobby/fish2.ts';
import { setCoinText } from './coin.ts';
import { emptyFishProgress, fishCastMods, type FishProgress } from '../../shared/fishprogress.ts';
import type { FishZone } from '../../shared/fishplaces.ts';
import { BARKAS_LEVEL } from '../../shared/fishshop.ts';
import { fishSkillBlock } from '../lobby/fishprogresshud.ts';

/** Фильтр журнала */
export type BookZone = 'all' | FishZone;

/** Описание вида одной строкой (подсказка у клетки и строка под сеткой): где и когда, доля поклёвок сейчас, цена. */
/**
 * Строка о виде. odds — с долей поклёвок по бонусам игрока (строка под сеткой); без неё — подсказка клетки: доля зависит
 * от уровня, снастей и погоды, поэтому в подсказке её нет, чтобы не было двух разных чисел на одно и то же.
 */
export function fishLine(sp: number, known: boolean, progress: FishProgress = emptyFishProgress(), rain = false, now = 0, odds = true): string {
  const r = RULE[sp];
  const f = FISH[sp];
  if (!r || !f) return '';
  const [lo, hi] = priceRange(sp);
  const mods = fishCastMods(progress, now, r.zone);
  const share = biteShare(sp, rain, mods) * 100;
  const fmt = (v: number): string => (v >= 1 ? v.toFixed(1) : v.toFixed(2)).replace('.', ',');
  const where = r.zone === 'barkas' ? `⚓ баркас в открытом море (с ${BARKAS_LEVEL}-го уровня рыбалки)` : 'пристань';
  const when = r.rain ? '🌧 только в дождь, цена ×1,5' : 'в любую погоду';
  const now2 = r.rain && !rain ? `в дождь — ${fmt(biteShare(sp, true, mods) * 100)}% поклёвок` : `сейчас — ${fmt(share)}% поклёвок`;
  return `${f.name}${known ? '' : ' · ещё не поймана'} · ${TIER_NAMES[r.tier]} · ${where} · ${when}${odds ? ` · ${now2}` : ''} · ${lo}–${hi} 🪙 · ${r.note}`;
}

/** Сетка коллекции: по категориям, в каждой — «сколько из скольких»; compact — для профиля (без цен); zone — фильтр. */
export function collectionGrid(album: FishAlbum, compact: boolean, onPick?: (sp: number) => void, zone: BookZone = 'all'): HTMLElement {
  const root = el('div', compact ? 'fb-grid compact' : 'fb-grid');
  for (let tier = 0; tier <= T_MYTH; tier++) {
    const list = COLLECTION.filter((sp) => RULE[sp]!.tier === tier && (zone === 'all' || RULE[sp]!.zone === zone));
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
  // находки и старые находки
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
  if (r.rain || r.zone === 'barkas') {
    const marks = c.appendChild(el('span', 'fb-rain', `${r.zone === 'barkas' ? '⚓' : ''}${r.rain ? '🌧' : ''}`));
    const what = [r.zone === 'barkas' ? 'ловится только с баркаса' : '', r.rain ? 'только в дождь' : ''].filter(Boolean).join(', ');
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

/** Окно журнала на набережной: открывается по J или кнопке 📖, закрывается крестиком, Esc или J. */
export class FishBook {
  onClose: () => void = () => {};
  private readonly root: HTMLDialogElement;
  private readonly body: HTMLElement;
  private readonly count: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly reward: HTMLElement;
  private readonly line: HTMLElement;
  private readonly skill: HTMLElement;
  private readonly filter = new Map<BookZone, HTMLButtonElement>();
  private zone: BookZone = 'all';
  private rain = false;
  private now = 0;
  private last: { album: FishAlbum; owned: readonly string[]; progress: FishProgress } | null = null;
  private shown = false;
  /** Вкладка «Награды» (fishrewards.ts): снасти и лестница наград */
  readonly rewards = new FishRewards();
  private tab: 'fish' | 'rewards' = 'fish';
  private readonly tabs: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = el('dialog', 'fb');
    this.root.setAttribute('aria-labelledby', 'fish-book-title');
    const panel = this.root.appendChild(el('div', 'fb-panel'));
    const head = panel.appendChild(el('div', 'fb-head'));
    head.appendChild(el('h2', 'fb-title', '📖 Журнал рыбака')).id = 'fish-book-title';
    this.count = head.appendChild(el('span', 'fb-count'));
    const x = head.appendChild(el('button', 'fb-x', '×'));
    x.title = 'Закрыть (Esc)';
    x.type = 'button';
    x.setAttribute('aria-label', 'Закрыть журнал рыбака');
    x.addEventListener('click', () => this.close());
    this.bar = panel.appendChild(el('div', 'fb-bar')).appendChild(el('i', ''));
    this.reward = panel.appendChild(el('div', 'fb-reward'));
    this.tabs = panel.appendChild(el('div', 'fb-tabs'));
    for (const [tab, name] of [['fish', '🐟 Коллекция'], ['rewards', '🎁 Награды']] as const) {
      const b = this.tabs.appendChild(el('button', '', name));
      b.type = 'button';
      b.dataset.tab = tab;
      b.addEventListener('click', () => {
        this.tab = tab;
        this.body.scrollTop = 0;
        if (this.last) this.render(this.last.album, this.last.owned, this.last.progress);
      });
    }
    this.skill = panel.appendChild(el('div', 'fb-skill'));
    const tabs = panel.appendChild(el('div', 'fe-booktabs'));
    for (const [id, label] of [['all', 'Все'], ['pier', 'Пристань'], ['barkas', '⚓ Баркас']] as const) {
      const b = tabs.appendChild(el('button', 'fe-booktab', label));
      b.type = 'button';
      b.addEventListener('click', () => {
        this.zone = id;
        if (this.last) this.render(this.last.album, this.last.owned, this.last.progress);
      });
      this.filter.set(id, b);
    }
    this.body = panel.appendChild(el('div', 'fb-body'));
    this.line = panel.appendChild(el('div', 'fb-line'));
    this.root.addEventListener('click', (e) => { if (e.target === this.root) this.close(); });
    this.root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Escape' || e.code === 'KeyJ') { e.preventDefault(); this.close(); }
    });
    this.root.addEventListener('keyup', (e) => e.stopPropagation());
    this.root.addEventListener('cancel', (e) => { e.preventDefault(); this.close(); });
    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.shown;
  }

  /** Погода и часы сервера — для «сейчас N% поклёвок» */
  setWeather(rain: boolean, now: number): void {
    this.rain = rain;
    this.now = now;
  }

  open(album: FishAlbum, owned: readonly string[], progress: FishProgress): void {
    this.shown = true;
    this.render(album, owned, progress);
    this.root.classList.add('show');
    this.root.showModal();
  }

  /** Новый улов при открытом журнале — перерисовать */
  update(album: FishAlbum, owned: readonly string[], progress: FishProgress): void {
    if (this.shown) this.render(album, owned, progress);
  }

  close(): void {
    if (!this.shown) return;
    this.shown = false;
    this.root.classList.remove('show');
    this.root.close();
    this.onClose();
  }

  private render(album: FishAlbum, owned: readonly string[], progress: FishProgress): void {
    this.last = { album, owned, progress };
    for (const [id, b] of this.filter) b.classList.toggle('on', id === this.zone);
    // фильтр «Все / Пристань / Баркас» — только у коллекции, во вкладке «Награды» он ни к чему
    const zones = this.filter.get('all')?.parentElement;
    if (zones) zones.style.display = this.tab === 'rewards' ? 'none' : '';
    const n = collectionCount(album);
    this.count.textContent = `${n} из ${COLLECTION_SIZE}`;
    this.bar.style.width = `${Math.round((n / COLLECTION_SIZE) * 100)}%`;
    // награды коллекции — лестница по видам (вкладка «Награды»)
    const next = nextStep(n);
    this.reward.textContent = next
      ? `Следующая награда — ${stepLabel(next)}: ещё ${species(stepNeed(next) - n)}`
      : '🎉 Коллекция собрана — все награды твои: сет «Хозяин глубин», золотые снасти и якорь у ника';
    this.reward.classList.toggle('done', !next);
    for (const b of this.tabs.querySelectorAll<HTMLElement>('[data-tab]')) b.classList.toggle('on', b.dataset.tab === this.tab);
    if (this.tab === 'rewards') {
      this.skill.replaceChildren();
      const scroll = this.body.scrollTop;
      this.body.replaceChildren(this.rewards.view(album, owned));
      this.body.scrollTop = scroll;
      this.line.textContent = 'Снасти меняются тут где угодно на набережной — их видят все, кто рядом.';
      return;
    }
    this.skill.replaceChildren(fishSkillBlock(progress));
    const scroll = this.body.scrollTop;
    const focused = (document.activeElement as HTMLElement | null)?.dataset.species;
    this.body.textContent = '';
    this.body.appendChild(collectionGrid(album, false, (sp) => setCoinText(this.line, fishLine(sp, !!album[FISH[sp].id], progress, this.rain, this.now)), this.zone));
    this.body.scrollTop = scroll;
    if (focused) {
      const cell = [...this.body.querySelectorAll<HTMLElement>('[data-species]')].find((c) => c.dataset.species === focused);
      cell?.focus({ preventScroll: true });
    }
    setCoinText(this.line, 'Наведи на рыбу — где и когда она ловится и сколько поклёвок даёт сейчас. ⚓ — только с баркаса, 🌧 — только в дождь (цена ×1,5).');
  }
}
