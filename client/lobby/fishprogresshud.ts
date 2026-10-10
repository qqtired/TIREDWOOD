import { FISH_MAX_LEVEL, activeDrink, bagSlots, bagValue, drinkOf, drinkUntil, fishLevelView, questNeed, type FishProgress } from '../../shared/fishprogress.ts';
import { BEER, lureOf, type ShopDrink } from '../../shared/fishshop.ts';
import { BARKAS_INCOME, ISLE_XP } from '../../shared/fishrules.ts';
import { catchValue, livewellCap, livewellOf } from '../../shared/fishlivewell.ts';
import type { FishZone } from '../../shared/fishplaces.ts';
import { setCoinText } from '../ui/coin.ts';
import { el } from './fish2.ts';
import { FishClock, fishTimeLeft } from './fishclock.ts';
import { levelZonePct, mul, num, pct } from './fishfmt.ts';
import { LEVEL_PERKS } from '../../shared/fishability.ts';

/** Значок напитка на бейдже по номеру из activeDrink(): пиво, эль, пиво подводного владыки, водка */
const DRINK_ICONS: Readonly<Record<number, string>> = { 1: '🍺', 2: '🍻', 3: '🔱', 4: '🥃' };

/** Что даёт напиток — строка бейджа. У водки свои эффекты (доход и редкие она не меняет): крупная чаще, держать труднее. */
function drinkEffect(d: ShopDrink): string {
  if (!d.top) return `доход ${pct(d.income)} · редкие и выше ${mul(d.rare)}`;
  return `эпик и выше ${mul(d.top)} · опыт ${mul(d.topXp ?? 1)} · зона ${pct(d.zone ?? 1)}`;
}

/**
 * Плашка события или бонуса — один вид на всё (fish2.css .f2-plate): значок, что это (крупно), что даёт (мелко),
 * сколько осталось (крупно справа). Напиток — здесь, сезон рыбалки и рыболовное событие (дождь) — fish2hud.ts.
 */
export interface FishPlate {
  root: HTMLElement;
  icon: HTMLElement;
  title: HTMLElement;
  sub: HTMLElement;
  time: HTMLElement;
}

export function fishPlate(parent: HTMLElement, cls: string, icon: string): FishPlate {
  const root = parent.appendChild(el('div', `f2-plate ${cls}`));
  const ico = root.appendChild(el('span', 'f2-plate-ico', icon));
  ico.setAttribute('aria-hidden', 'true');
  const txt = root.appendChild(el('div', 'f2-plate-txt'));
  const title = txt.appendChild(el('b', ''));
  const sub = txt.appendChild(el('span', ''));
  const time = root.appendChild(el('time', 'f2-plate-time'));
  return { root, icon: ico, title, sub, time };
}

/** Текст — только если поменялся (плашки обновляются каждый кадр) */
export function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

/** Same compact skill scale in the journal, NPC dialog and profile. fresh — уровень только что вырос: строка награды вспыхивает */
export function fishSkillBlock(progress: FishProgress, compact = false, fresh = false): HTMLElement {
  const view = fishLevelView(progress.xp);
  const block = el('div', compact ? 'fs-skill compact' : 'fs-skill');
  const head = block.appendChild(el('div', 'fs-skill-head'));
  head.appendChild(el('b', '', compact ? `🎣 Ур. ${view.level}` : view.level === 0 ? '🎣 Новичок' : `🎣 Уровень ${view.level} из ${FISH_MAX_LEVEL}`));
  // Шкала на каждом уровне идёт с нуля: опыт внутри уровня / сколько нужно на весь уровень (5-й: «0 / 1 150 XP»).
  // На максимальном уровне следующего нет — пишем накопленный опыт.
  const gained = Math.max(0, view.xp - view.from);
  const fmt = (n: number): string => n.toLocaleString('ru-RU');
  const stat = view.next === null ? `${fmt(view.xp)} XP` : `${fmt(gained)} / ${fmt(view.next - view.from)}`;
  head.appendChild(el('span', '', compact ? stat : view.next === null ? `${stat} · максимум` : `${stat} XP`));
  const bar = block.appendChild(el('progress', 'fs-xp'));
  bar.max = view.next === null ? 1 : Math.max(1, view.next - view.from);
  bar.value = view.next === null ? 1 : gained;
  bar.setAttribute('aria-label', view.next === null ? 'Максимальный уровень рыбалки' : `До следующего уровня ${Math.max(0, view.next - view.xp)} XP`);
  block.appendChild(el('span', 'fs-skill-sub', view.next === null
    ? `Высший уровень · зелёная зона +${levelZonePct(view.level)}% · опыт продолжает учитываться`
    : view.level === 0
      ? `До 1-го уровня ${Math.max(0, view.next - view.xp).toLocaleString('ru-RU')} XP — там зелёная зона +${levelZonePct(1)}%`
      : `До следующего уровня ${Math.max(0, view.next - view.xp).toLocaleString('ru-RU')} XP · сейчас зелёная зона +${levelZonePct(view.level)}%`));
  // награды уровней 1–15 (shared/fishability.ts): последняя полученная и следующая; в подсказке — все полученные
  const have = LEVEL_PERKS.filter((p) => p.level <= view.level);
  const last = have.at(-1);
  const next = LEVEL_PERKS.find((p) => p.level === view.level + 1);
  const perk = block.appendChild(el('span', `fs-skill-perk${fresh ? ' new' : ''}`));
  if (last) perk.appendChild(el('b', '', `★ ${last.name}`));
  if (next) perk.append(`${last ? ' · ' : ''}на ${next.level}-м: ${next.name}`);
  perk.title = [...have.map((p) => `★ ${p.level}. ${p.name} — ${p.text}`), ...(next ? [`дальше, ${next.level}-й: ${next.name} — ${next.text}`] : [])].join('\n');
  return block;
}

/**
 * Рядом с уровнем (fisheco): задание («Задание 3 · 7/15», готово — «сдай Семёну»), рюкзак («🎒 6/10 · 84 🪙»: одно
 * место — жёлтый, полон — красный; клик — окно рюкзака), блесна и место (баркас ×1,25). Справа сверху — напиток с
 * таймером: пиво, эль или пиво подводного владыки (🔱, из сундука; доход ×1,2, редкие ×1,4) — действует сильнейший.
 */
export class FishProgressHud {
  onBag: () => void = () => {};
  readonly skill: HTMLElement;
  private readonly quest: HTMLElement;
  private readonly bag: HTMLButtonElement;
  /** Лайвел своей лодки (флаг ISLE): «🛶 12/50 · 640 🪙» рядом с рюкзаком; лодки нет и лайвел пуст — скрыт */
  private readonly well: HTMLButtonElement;
  private readonly gear: HTMLElement;
  private readonly badge: HTMLElement;
  private readonly icon: HTMLElement;
  private readonly name: HTMLElement;
  private readonly effect: HTMLElement;
  private readonly time: HTMLElement;
  private readonly clock = new FishClock();
  private progress: FishProgress | null = null;
  private zone: FishZone = 'pier';
  /** Уровень, что уже показан (−1 — ещё ничего), и до какого времени строка награды горит как новая */
  private shownLevel = -1;
  private freshUntil = 0;

  constructor(parent: HTMLElement, overlay: HTMLElement) {
    this.skill = parent.appendChild(el('div', 'f2-skill'));
    const row = parent.appendChild(el('div', 'fe-chips'));
    this.quest = row.appendChild(el('div', 'fe-chip fe-quest'));
    this.bag = row.appendChild(el('button', 'fe-chip fe-bagchip'));
    this.bag.type = 'button';
    this.bag.title = 'Рюкзак · I';
    this.bag.addEventListener('click', () => this.onBag());
    this.well = row.appendChild(el('button', 'fe-chip fe-bagchip fe-wellchip'));
    this.well.type = 'button';
    this.well.title = 'Лайвел лодки · I';
    this.well.hidden = true;
    this.well.addEventListener('click', () => this.onBag());
    this.gear = parent.appendChild(el('div', 'fe-gear'));
    // напиток — плашка того же вида, что события; живёт в слое меню (видна и на паузе, и в других комнатах)
    const drink = fishPlate(overlay, 'fs-buff f2-plate-drink', '🍺');
    this.badge = drink.root;
    this.icon = drink.icon;
    this.icon.classList.add('fs-buff-icon');
    this.name = drink.title;
    this.name.textContent = BEER.name;
    this.effect = drink.sub;
    this.time = drink.time;
    this.time.classList.add('fs-buff-time');
    // This small badge remains accurate while playing another room or sitting in the pause menu.
    window.setInterval(() => this.tick(), 250);
  }

  set(progress: FishProgress, serverNow?: number): void {
    if (serverNow !== undefined) this.clock.sync(serverNow);
    this.progress = progress;
    // Full level/bonus explanation stays in the journal and NPC; the fishing HUD only needs status: у удочки — одна
    // строка «🎣 Ур. 5 · 450 / 1 150» и полоса, что даёт уровень — в подсказке (и в журнале, и у Семёна).
    // уровень вырос — строка награды уровня вспыхивает (8 с), как и тост «Уровень рыбалки N»
    const level = fishLevelView(progress.xp).level;
    if (this.shownLevel >= 0 && level > this.shownLevel) this.freshUntil = performance.now() + 8000;
    this.shownLevel = level;
    const skill = fishSkillBlock(progress, true, performance.now() < this.freshUntil);
    const perks = skill.querySelector<HTMLElement>('.fs-skill-perk')?.title ?? '';
    this.skill.title = [skill.querySelector('.fs-skill-sub')?.textContent ?? '', perks].filter(Boolean).join('\n');
    this.skill.replaceChildren(skill);
    const need = questNeed(progress.questsDone);
    const ready = progress.questCaught >= need;
    this.quest.textContent = ready ? `📋 Задание ${progress.questsDone + 1} готово — сдай Семёну` : `📋 Задание ${progress.questsDone + 1} · ${progress.questCaught}/${need}`;
    this.quest.classList.toggle('ready', ready);
    const slots = bagSlots(progress);
    const n = progress.bag.length;
    setCoinText(this.bag, `🎒 ${n}/${slots} · ${num(bagValue(progress.bag))} 🪙`);
    this.bag.classList.toggle('warn', n === slots - 1);
    this.bag.classList.toggle('full', n >= slots);
    const cap = livewellCap(progress);
    const w = livewellOf(progress).length;
    this.bag.setAttribute('aria-label', `Рюкзак: ${n} из ${slots} рыб${n >= slots ? (w < cap ? ', полон — рыба пойдёт в лайвел лодки' : ', полон — продай улов Семёну или Сане') : ''}`);
    this.well.hidden = cap === 0 && w === 0;
    if (!this.well.hidden) {
      setCoinText(this.well, `🛶 ${w}/${cap} · ${num(catchValue(progress, 'well'))} 🪙`);
      this.well.classList.toggle('warn', n >= slots && w === cap - 1);
      this.well.classList.toggle('full', w >= cap);
      this.well.setAttribute('aria-label', `Лайвел лодки: ${w} из ${cap} рыб${w >= cap ? ', полон — продай улов скупщику или из меню лодки' : ''}`);
    }
    this.renderGear();
    this.tick();
  }

  /** Где сидит с удочкой (на баркасе — значок ×1,25) */
  setZone(zone: FishZone): void {
    if (zone === this.zone) return;
    this.zone = zone;
    this.renderGear();
  }

  clear(): void {
    this.progress = null;
    this.tick();
  }

  private renderGear(): void {
    const lure = lureOf(this.progress?.lure ?? 0);
    const parts: string[] = [];
    if (lure) parts.push(`🪝 ${lure.name.toLowerCase()} · рывки −${Math.round(lure.calm * 100)}%`);
    if (this.zone === 'barkas') parts.push(`⚓ баркас · цена и опыт ${mul(BARKAS_INCOME)}`);
    if (this.zone === 'isle') parts.push(`🏝 остров · опыт ${mul(ISLE_XP)}`);
    this.gear.textContent = parts.join('  ·  ');
    this.gear.hidden = parts.length === 0;
  }

  private tick(): void {
    const now = this.clock.now();
    const p = this.progress;
    const drink = p ? activeDrink(p, now) : 0;
    // Напиток и срок по номеру: 1 — пиво, 2 — эль, 3 — пиво владыки, 4 — водка; без напитка значок скрыт (текст — от пива)
    const d = drinkOf(drink) ?? BEER;
    const until = p ? drinkUntil(p, drink) : 0;
    const active = drink !== 0;
    this.badge.classList.toggle('show', active);
    this.badge.classList.toggle('ending', active && until - now <= 60_000);
    setText(this.icon, DRINK_ICONS[drink] ?? '🍺');
    setText(this.name, d.name);
    setText(this.effect, drinkEffect(d));
    setText(this.time, fishTimeLeft(until, now));
    this.badge.setAttribute('aria-label', d.top
      ? `${d.name}: ${this.time.textContent}. Эпические и выше, с божественной, ${mul(d.top)}, опыт за них ${mul(d.topXp ?? 1)}, зона ${pct(d.zone ?? 1)}. Только рыбалка.`
      : `${d.name}: ${this.time.textContent}. Доход от пойманной рыбы ${pct(d.income)}, редкие и выше ${mul(d.rare)}. Только рыбалка.`);
  }
}
