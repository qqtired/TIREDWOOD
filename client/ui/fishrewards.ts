// Журнал рыбака, вкладка «Награды» — на ките UI 2.0 (эталон: lab/ui/screens/fishing.js, сцена «5. журнал рыбака» →
// «награды»). Сверху «Твои снасти»: удочка, поплавок, окно шкалы, значок у ника — ячейки .k-cell, в каждой выбор картинкой
// с именем (закрытые серые, под ними — сколько видов нужно). Ниже «Награды журнала» — лестница .fi-steps (есть / следующая
// с золотой рамкой / закрыта, финал — «Все N видов»), ещё ниже — лестница острова «Последний свет» (флаг ISLE).
// Полученная снасть надевается сама; любую полученную раньше выбирают тут одним кликом — сервер меняет снасти где
// угодно на набережной. Одежда и питомцы — в примерочной. Стили — client/lobby/fishkit.css + fishwin.css.
import './fishstyle.css';
import '../lobby/fishwin.css';
import type { FishAlbum } from '../../shared/fishing.ts';
import { TIER_CSS, collectionCount } from '../../shared/fishrules.ts';
import {
  ALL, GEAR_SLOTS, ISLE_ITEMS, ISLE_LADDER, LADDER, REWARD_INFO, fishTotal, isleNeedOf, needOf, nextStep, stepNeed,
  isleNextStep, type RewardStep,
} from '../../shared/fishstyle.ts';
import { ISLE_TOTAL, isleCaught } from '../../shared/islestyle.ts';
import { ISLE_MIN_LEVEL } from '../../shared/fishisle.ts';
import { ITEMS, isOwned, itemById, slotKey, type Item, type Outfit, type Slot } from '../../shared/outfit.ts';
import { el } from '../lobby/fish2.ts';
import { ISLE } from '../render/islegear.ts';
import { FISH_ICONS } from './fishicons.ts';
import { h, iconImg } from './kit/dom.ts';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Заголовки ячеек снастей (эталон: «Окно шкалы») */
const SLOT_TITLE: Partial<Record<Slot, string>> = { r: 'Удочка', b: 'Поплавок', w: 'Окно шкалы', n: 'Значок у ника' };
/** Описание бесплатной снасти (у наград — REWARD_INFO) */
const FREE_TEXT: Partial<Record<Slot, string>> = {
  r: 'Простая удочка — есть у всех', b: 'Простой поплавок — есть у всех', w: 'Деревянная рама и синяя вода — есть у всех', n: 'Над ником ничего нет',
};
/** Рыбка на миниатюре шкалы — та же, что на настоящей (client/lobby/fishgame.ts) */
const FISH_SVG = '<svg viewBox="0 0 40 24" width="40" height="24" aria-hidden="true"><path d="M3 12c5-7 14-9 22-6l7-5-1 8 1 7-7-5c-8 3-17 1-22-6z" fill="currentColor" stroke="rgba(20,12,16,.75)" stroke-width="1.6" stroke-linejoin="round"/><circle cx="9" cy="10.5" r="1.7" fill="#1b1216"/></svg>';

/** Вид награды коротко: «окно» вместо «окно вываживания»; одежде и аксессуарам вид не нужен */
function kindShort(id: string): string {
  const k = REWARD_INFO[id]?.kind ?? '';
  if (k === 'окно вываживания') return 'окно';
  if (k === 'аксессуар' || k === 'шапка' || k === 'очки') return '';
  return k;
}

/** Вещь ступени: «удочка «Орешник»», значок — «Золотой якорь» у ника; имя — жирным */
function itemText(id: string): string {
  const it = itemById(id);
  if (!it) return 'вещь острова';
  const k = kindShort(id);
  if (k === 'значок у ника') return `<b>«${esc(it.name)}»</b> у ника`;
  return `${k ? `${k} ` : ''}<b>«${esc(it.name)}»</b>`;
}

/** Что даёт ступень: вещи через «·»; сет — «сет «…»» и снасти из него */
function stepText(step: RewardStep): string {
  if (!step.set) return step.items.map(itemText).join(' · ');
  const gear = step.items.filter((id) => GEAR_SLOTS.includes(id[0] as Slot));
  return [`сет <b>«${esc(step.set)}»</b>`, ...gear.map(itemText)].join(', ');
}

/** «вид», «вида», «видов» */
export function species(n: number): string {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return `${n} вид`;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return `${n} вида`;
  return `${n} видов`;
}

/** «вида острова» — для вещей острова: «🔒 4 вида острова» */
export function isleSpecies(n: number): string {
  return `${species(n)} острова`;
}

/** Вещь острова видна в журнале и примерочной: остров включён или вещь уже есть */
export function isleVisible(id: string, owned: readonly string[]): boolean {
  return !ISLE_ITEMS.has(id) || ISLE.on || owned.includes(id);
}

/** Окно вываживания в миниатюре — та же рамка и вода, что у настоящего (fish2.css + тема из fishstyle.css) */
export function miniWindow(key: string): HTMLElement {
  const w = el('span', 'frw-win');
  w.dataset.frTheme = key;
  const bar = w.appendChild(el('span', 'fr-bar'));
  bar.appendChild(el('span', 'fr-water'));
  bar.appendChild(el('span', 'fr-zone'));
  return w;
}

export class FishRewards {
  /** Выбрал снасть (Fish2Hud шлёт наряд серверу) */
  onEquip: (slot: Slot, key: string) => void = () => {};
  /** Что надето — из профиля (Fish2Hud.onMe) */
  outfit: Outfit | null = null;

  /**
   * Содержимое вкладки «Награды» (обёртка .fi-rw — display: contents, её дети встают в колонку .k-win-body).
   * level — уровень рыбалки: остров — с ISLE_MIN_LEVEL-го.
   */
  view(album: FishAlbum, owned: readonly string[], level?: number): HTMLElement {
    const got = collectionCount(album);
    const total = fishTotal();
    const next = nextStep(got, total);
    let html = `<h3 class="fi-h">Твои снасти <small>надеваются сами, сменить — нажми на картинку</small></h3>`
      + `<div class="fi-gear fi-gear--rows">${GEAR_SLOTS.map((slot) => this.slotCell(slot, owned, total)).join('')}</div>`
      + `<h3 class="fi-h">Награды журнала <small>${got} из ${total} видов</small></h3>`
      + `<div class="fi-steps">${LADDER.map((s) => stepHtml(s, stepNeed(s, total), got, next, s.need === ALL)).join('')}</div>`;
    // остров «Последний свет»: свой счётчик видов острова, награда каждые 4 вида, сет — за все 20
    if (ISLE.on || owned.some((id) => ISLE_ITEMS.has(id))) {
      const isle = isleCaught({ album });
      const nextIsle = isleNextStep(isle);
      const early = level !== undefined && level < ISLE_MIN_LEVEL ? ` · с ${ISLE_MIN_LEVEL}-го уровня` : '';
      html += `<h3 class="fi-h">${iconImg('lighthouse', 'fi-ic')}Остров «Последний свет» <small>${isle} из ${ISLE_TOTAL}${early}</small></h3>`
        + `<div class="fi-steps">${ISLE_LADDER.map((s) => stepHtml(s, stepNeed(s, ISLE_TOTAL), isle, nextIsle, s.set !== undefined)).join('')}</div>`;
    }
    const root = h('div', 'fi-rw', html);
    root.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>('button[data-slot]');
      if (!b || b.disabled) return;
      const slot = b.dataset.slot as Slot;
      const key = b.dataset.key ?? '';
      if (key !== (this.outfit ? slotKey(this.outfit, slot) : null)) this.onEquip(slot, key);
    });
    return root;
  }

  /**
   * Строка снасти: слева — что надето и что это, справа — выбор (картинка + имя; закрытые — серые, под именем — сколько
   * видов). Чужие награды слота (значки фермы у ника) — только полученные: требований рыбалки у них нет.
   */
  private slotCell(slot: Slot, owned: readonly string[], total: number): string {
    const list = ITEMS.filter((i) => i.slot === slot && isleVisible(i.id, owned)
      && (i.tier === 'free' || isOwned(owned, i) || needOf(i.id, total) !== null || isleNeedOf(i.id) !== null));
    const on = this.outfit ? slotKey(this.outfit, slot) : null;
    const cur: Item | undefined = list.find((i) => i.key === on) ?? list.find((i) => i.tier === 'free') ?? list[0];
    const win = slot === 'w';
    const opts = list.map((it) => {
      const have = isOwned(owned, it);
      const isOn = it === cur;
      const isleNeed = isleNeedOf(it.id);
      const need = needOf(it.id, total);
      const lock = have ? '' : isleNeed !== null ? isleSpecies(isleNeed) : need !== null ? species(need) : '';
      const pic = win
        ? `<span class="fr-bar"><span class="fr-water"></span><span class="fr-zone"></span><span class="fr-fish">${FISH_SVG}</span></span>`
        : `<span class="fi-gopt-ic">${FISH_ICONS[it.id] ?? (it.tier === 'free' ? '' : iconImg('medal-gold', ''))}</span>`;
      const theme = win ? ` data-fr-theme="${esc(it.key)}" style="--tc:${TIER_CSS[1]}"` : '';
      return `<button type="button" class="${win ? 'fi-winmini' : 'fi-gopt'}${isOn ? ' is-on' : ''}${have ? '' : ' is-lock'}" data-slot="${slot}" data-key="${esc(it.key)}"`
        + `${theme} aria-pressed="${isOn}"${have ? '' : ' disabled'}>${pic}<span>${esc(it.name)}${lock ? `<small>${lock}</small>` : ''}</span></button>`;
    }).join('');
    const desc = cur ? REWARD_INFO[cur.id]?.text ?? FREE_TEXT[slot] ?? '' : '';
    return `<div class="k-cell"><div class="fi-gear-t"><b>${SLOT_TITLE[slot] ?? ''}${cur ? ` — «${esc(cur.name)}»` : ''}</b><p>${esc(desc)}</p></div><div class="fi-gopts">${opts}</div></div>`;
  }
}

/** Ступень лестницы: порог, что даёт, «есть» / «ещё N» (следующая — золотом); final — последняя (сет) */
function stepHtml(step: RewardStep, need: number, got: number, next: RewardStep | null, final: boolean): string {
  const done = got >= need;
  const isNext = step === next;
  const cls = `fi-step ${done ? 'is-got' : isNext ? 'is-next' : 'is-lock'}${final ? ' is-final' : ''}`;
  const n = step.need === ALL ? `Все ${need}` : String(need);
  const pill = done ? '<span class="k-pill k-pill--good k-pill--sm">есть</span>' : `<span class="k-pill k-pill--sm${isNext ? ' k-pill--gold' : ''}">ещё ${need - got}</span>`;
  return `<div class="${cls}"><span class="fi-step-n">${n}<small>${species(need).replace(/^\d+ /, '')}</small></span><span class="fi-step-i">${stepText(step)}</span>${pill}</div>`;
}
