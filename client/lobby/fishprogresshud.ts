import { fishLevelView, type FishProgress } from '../../shared/fishprogress.ts';
import { el } from './fish2.ts';
import { FishClock, fishTimeLeft } from './fishclock.ts';
import { TOUCH } from '../touch.ts';

/** Same compact skill scale in the journal, NPC dialog and profile. */
export function fishSkillBlock(progress: FishProgress, compact = false): HTMLElement {
  const view = fishLevelView(progress.xp);
  const block = el('div', compact ? 'fs-skill compact' : 'fs-skill');
  const head = block.appendChild(el('div', 'fs-skill-head'));
  head.appendChild(el('b', '', compact ? `🎣 Ур. ${view.level}` : view.level === 0 ? '🎣 Новичок' : `🎣 Уровень ${view.level} из 10`));
  head.appendChild(el('span', '', compact ? `${view.xp.toLocaleString('ru-RU')} XP` : view.next === null ? `${view.xp.toLocaleString('ru-RU')} XP · максимум` : `${view.xp.toLocaleString('ru-RU')} / ${view.next.toLocaleString('ru-RU')} XP`));
  const bar = block.appendChild(el('progress', 'fs-xp'));
  bar.max = view.next === null ? 1 : Math.max(1, view.next - view.from);
  bar.value = view.next === null ? 1 : Math.max(0, view.xp - view.from);
  bar.setAttribute('aria-label', view.next === null ? 'Максимальный уровень рыбалки' : `До следующего уровня ${Math.max(0, view.next - view.xp)} XP`);
  block.appendChild(el('span', 'fs-skill-sub', view.next === null
    ? 'Зелёная зона +25% · опыт продолжает учитываться'
    : `До следующего уровня ${Math.max(0, view.next - view.xp)} XP · зелёная зона +${(view.level * 2.5).toLocaleString('ru-RU')}%`));
  return block;
}

export class FishProgressHud {
  readonly skill: HTMLElement;
  private readonly badge: HTMLElement;
  private readonly time: HTMLElement;
  private readonly clock = new FishClock();
  private until = 0;

  constructor(parent: HTMLElement, overlay: HTMLElement) {
    this.skill = parent.appendChild(el('div', 'f2-skill'));
    this.badge = overlay.appendChild(el('div', 'fs-buff'));
    const icon = this.badge.appendChild(el('span', 'fs-buff-icon', '🍺'));
    icon.setAttribute('aria-hidden', 'true');
    const info = this.badge.appendChild(el('div', ''));
    info.appendChild(el('b', '', 'Рыбацкое пиво'));
    info.appendChild(el('span', '', 'Доход от рыбы +10% · редкие чаще'));
    this.time = this.badge.appendChild(el('time', 'fs-buff-time'));
    // This small badge remains accurate while playing another room or sitting in the pause menu.
    window.setInterval(() => this.tick(), 250);
  }

  set(progress: FishProgress, serverNow?: number): void {
    if (serverNow !== undefined) this.clock.sync(serverNow);
    this.until = progress.beerUntil;
    // Full level/bonus explanation stays in the journal and NPC; the fishing HUD only needs status.
    this.skill.replaceChildren(fishSkillBlock(progress, TOUCH));
    this.tick();
  }

  clear(): void {
    this.until = 0;
    this.tick();
  }

  private tick(): void {
    const now = this.clock.now();
    const active = this.until > now;
    this.badge.classList.toggle('show', active);
    this.badge.classList.toggle('ending', active && this.until - now <= 60_000);
    this.time.textContent = fishTimeLeft(this.until, now);
    this.badge.setAttribute('aria-label', `Рыбацкое пиво: ${this.time.textContent}. Доход от пойманной рыбы плюс десять процентов, редкие виды клюют чаще. Только рыбалка.`);
  }
}
