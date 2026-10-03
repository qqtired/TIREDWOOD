// Журнал рыбака (рыбалка 2.0): все виды коллекции по категориям — картинка (ещё не пойманные — тёмный силуэт), имя,
// категория подписью и цветом, сколько поймано и рекорд веса, цена; уникальные виды события — с 🎣.
// Ниже — находки (сапог, бутылка, сундуки) и старые находки прошлой рыбалки (золотая рыбка). Окно на набережной
// (J или кнопка 📖) и сетка в профиле — одна и та же сетка.
import { FISH, fmtWeight, type FishAlbum } from '../../shared/fishing.ts';
import {
  COLLECTION, COLLECTION_SIZE, LEGACY_IDS, REWARD_ITEMS, RULE, SP_BOOT, SP_BOTTLE, SP_CHEST, TIER_CSS, TIER_NAMES, TIER_TITLES, T_MYTH, biteShare,
  collectionCount, priceRange,
} from '../../shared/fishrules.ts';
import { el, fishPic } from '../lobby/fish2.ts';
import { setCoinText } from './coin.ts';
import type { FishProgress } from '../../shared/fishprogress.ts';
import { fishSkillBlock } from '../lobby/fishprogresshud.ts';

/** Описание вида одной строкой (подсказка у клетки и строка под сеткой) */
export function fishLine(sp: number, known: boolean): string {
  const r = RULE[sp];
  const f = FISH[sp];
  if (!r || !f) return '';
  const [lo, hi] = priceRange(sp);
  const bite = (biteShare(sp, r.rain) * 100).toFixed(1).replace('.', ',');
  const where = r.rain ? ` · уникальный вид рыболовного события (${bite} % базовых поклёвок), доход от этой рыбы ×1,5` : ` · ${bite} % базовых поклёвок`;
  return `${f.name}${known ? '' : ' · ещё не поймана'} · ${TIER_NAMES[r.tier]}${where} · ${lo}–${hi} 🪙 · ${r.note}`;
}

/** Сетка коллекции: по категориям, в каждой — «сколько из скольких»; compact — для профиля (без цен). */
export function collectionGrid(album: FishAlbum, compact: boolean, onPick?: (sp: number) => void): HTMLElement {
  const root = el('div', compact ? 'fb-grid compact' : 'fb-grid');
  for (let tier = 0; tier <= T_MYTH; tier++) {
    const list = COLLECTION.filter((sp) => RULE[sp]!.tier === tier);
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
  if (r.rain) {
    const event = c.appendChild(el('span', 'fb-rain', '🎣'));
    event.title = 'Уникальный вид рыболовного события';
    event.setAttribute('aria-label', 'Уникальный вид рыболовного события');
  }
  c.appendChild(el('span', 'fb-name', f.name));
  c.appendChild(el('span', 'fb-tier', TIER_NAMES[r.tier]));
  c.appendChild(el('span', 'fb-rec', e ? `поймана · ×${e[1]}` : 'не поймана · ×0'));
  c.appendChild(el('span', 'fb-rec', e ? `рекорд ${fmtWeight(e[0])}` : 'рекорд —'));
  if (!compact) {
    const [lo, hi] = priceRange(sp);
    setCoinText(c.appendChild(el('span', 'fb-price')), `${lo}–${hi} 🪙`);
  }
  c.title = fishLine(sp, !!e).replace(/ 🪙/, ' жетонов');
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
  private shown = false;

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
    this.skill = panel.appendChild(el('div', 'fb-skill'));
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
    const n = collectionCount(album);
    this.count.textContent = `${n} из ${COLLECTION_SIZE}`;
    this.bar.style.width = `${Math.round((n / COLLECTION_SIZE) * 100)}%`;
    const full = REWARD_ITEMS.every((id) => owned.includes(id));
    this.reward.textContent = full
      ? '🎉 Коллекция собрана — рыбацкий комплект твой: панама с блёснами, очки и жилет рыболова (в гардеробе)'
      : `Собери все ${COLLECTION_SIZE} — получишь рыбацкий комплект: панама с блёснами, очки и жилет рыболова`;
    this.reward.classList.toggle('done', full);
    this.skill.replaceChildren(fishSkillBlock(progress));
    const scroll = this.body.scrollTop;
    const focused = (document.activeElement as HTMLElement | null)?.dataset.species;
    this.body.textContent = '';
    this.body.appendChild(collectionGrid(album, false, (sp) => setCoinText(this.line, fishLine(sp, !!album[FISH[sp].id]))));
    this.body.scrollTop = scroll;
    if (focused) {
      const cell = [...this.body.querySelectorAll<HTMLElement>('[data-species]')].find((c) => c.dataset.species === focused);
      cell?.focus({ preventScroll: true });
    }
    setCoinText(this.line, 'Во время рыболовного события доступны уникальные виды рыб! Доход ×1,5 — только от этих видов. Сундуки не считаются рыбой.');
  }
}
