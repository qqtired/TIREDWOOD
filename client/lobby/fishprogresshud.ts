import { activeDrink, bagSlots, bagValue, drinkOf, drinkUntil, fishLevelView, questNeed, type FishProgress } from '../../shared/fishprogress.ts';
import { BEER, lureOf, type ShopDrink } from '../../shared/fishshop.ts';
import { BARKAS_INCOME } from '../../shared/fishrules.ts';
import type { FishZone } from '../../shared/fishplaces.ts';
import { setCoinText } from '../ui/coin.ts';
import { el } from './fish2.ts';
import { FishClock, fishTimeLeft } from './fishclock.ts';
import { mul, num, pct } from './fishfmt.ts';
import { TOUCH } from '../touch.ts';

/** Значок напитка на бейдже по номеру из activeDrink(): пиво, эль, пиво подводного владыки, водка */
const DRINK_ICONS: Readonly<Record<number, string>> = { 1: '🍺', 2: '🍻', 3: '🔱', 4: '🥃' };

/** Что даёт напиток — строка бейджа. У водки свои эффекты (доход и редкие она не меняет): крупная чаще, держать труднее. */
function drinkEffect(d: ShopDrink): string {
  if (!d.top) return `Доход от рыбы ${pct(d.income)} · редкие ${mul(d.rare)}`;
  return `эпик, лег. и миф. ${mul(d.top)} · опыт ${mul(d.topXp ?? 1)} · зона ${pct(d.zone ?? 1)} · рывки ${pct(d.jerk ?? 1)}`;
}

/** Same compact skill scale in the journal, NPC dialog and profile. */
export function fishSkillBlock(progress: FishProgress, compact = false): HTMLElement {
  const view = fishLevelView(progress.xp);
  const block = el('div', compact ? 'fs-skill compact' : 'fs-skill');
  const head = block.appendChild(el('div', 'fs-skill-head'));
  head.appendChild(el('b', '', compact ? `🎣 Ур. ${view.level}` : view.level === 0 ? '🎣 Новичок' : `🎣 Уровень ${view.level} из 10`));
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
    ? 'Зелёная зона +25% · опыт продолжает учитываться'
    : view.level === 0
      ? `До 1-го уровня ${Math.max(0, view.next - view.xp).toLocaleString('ru-RU')} XP — там зелёная зона +2,5%`
      : `До следующего уровня ${Math.max(0, view.next - view.xp).toLocaleString('ru-RU')} XP · сейчас зелёная зона +${(view.level * 2.5).toLocaleString('ru-RU')}%`));
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
  private readonly gear: HTMLElement;
  private readonly badge: HTMLElement;
  private readonly icon: HTMLElement;
  private readonly name: HTMLElement;
  private readonly effect: HTMLElement;
  private readonly time: HTMLElement;
  private readonly clock = new FishClock();
  private progress: FishProgress | null = null;
  private zone: FishZone = 'pier';

  constructor(parent: HTMLElement, overlay: HTMLElement) {
    this.skill = parent.appendChild(el('div', 'f2-skill'));
    const row = parent.appendChild(el('div', 'fe-chips'));
    this.quest = row.appendChild(el('div', 'fe-chip fe-quest'));
    this.bag = row.appendChild(el('button', 'fe-chip fe-bagchip'));
    this.bag.type = 'button';
    this.bag.title = 'Рюкзак · I';
    this.bag.addEventListener('click', () => this.onBag());
    this.gear = parent.appendChild(el('div', 'fe-gear'));
    this.badge = overlay.appendChild(el('div', 'fs-buff'));
    this.icon = this.badge.appendChild(el('span', 'fs-buff-icon', '🍺'));
    this.icon.setAttribute('aria-hidden', 'true');
    const info = this.badge.appendChild(el('div', ''));
    this.name = info.appendChild(el('b', '', BEER.name));
    this.effect = info.appendChild(el('span', ''));
    this.time = this.badge.appendChild(el('time', 'fs-buff-time'));
    // This small badge remains accurate while playing another room or sitting in the pause menu.
    window.setInterval(() => this.tick(), 250);
  }

  set(progress: FishProgress, serverNow?: number): void {
    if (serverNow !== undefined) this.clock.sync(serverNow);
    this.progress = progress;
    // Full level/bonus explanation stays in the journal and NPC; the fishing HUD only needs status.
    this.skill.replaceChildren(fishSkillBlock(progress, TOUCH));
    const need = questNeed(progress.questsDone);
    const ready = progress.questCaught >= need;
    this.quest.textContent = ready ? `📋 Задание ${progress.questsDone + 1} готово — сдай Семёну` : `📋 Задание ${progress.questsDone + 1} · ${progress.questCaught}/${need}`;
    this.quest.classList.toggle('ready', ready);
    const slots = bagSlots(progress);
    const n = progress.bag.length;
    setCoinText(this.bag, `🎒 ${n}/${slots} · ${num(bagValue(progress.bag))} 🪙`);
    this.bag.classList.toggle('warn', n === slots - 1);
    this.bag.classList.toggle('full', n >= slots);
    this.bag.setAttribute('aria-label', `Рюкзак: ${n} из ${slots} рыб${n >= slots ? ', полон — продай улов Семёну или Сане' : ''}`);
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
    this.icon.textContent = DRINK_ICONS[drink] ?? '🍺';
    this.name.textContent = d.name;
    this.effect.textContent = drinkEffect(d);
    this.time.textContent = fishTimeLeft(until, now);
    this.badge.setAttribute('aria-label', d.top
      ? `${d.name}: ${this.time.textContent}. Эпические, легендарные и мифические ${mul(d.top)}, опыт за них ${mul(d.topXp ?? 1)}, зона ${pct(d.zone ?? 1)}, рывки ${pct(d.jerk ?? 1)}. Только рыбалка.`
      : `${d.name}: ${this.time.textContent}. Доход от пойманной рыбы ${pct(d.income)}, редкие и выше ${mul(d.rare)}. Только рыбалка.`);
  }
}
