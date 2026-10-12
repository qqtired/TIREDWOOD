// Уровень и опыт в «Обзоре» профиля (меню Esc): кольцо с номером уровня, полоса опыта с подписью, ряд рамок ника
// по уровням. Раскладку собирает профиль (client/ui/profile.ts), здесь — части и их обновление. Вид — кит (.k-ring, .k-meter).
import { FRAME_TIERS, frameForLevel, levelProgress } from '../../shared/levels.ts';

const fmt = new Intl.NumberFormat('ru-RU');

export class LevelProgressView {
  /** Кольцо уровня: номер внутри, опыт до следующего — дугой */
  readonly ring: HTMLElement;
  /** Полоса опыта и «до N уровня» */
  readonly xp: HTMLElement;
  /** Рамки ника по уровням (полученные — золотой каймой) и правило опыта */
  readonly tiers: HTMLElement;
  private readonly level: HTMLElement;
  private readonly meter: HTMLElement;
  private readonly label: HTMLElement;
  private readonly until: HTMLElement;
  private readonly cards: Array<{ root: HTMLElement; min: number }> = [];

  constructor() {
    this.ring = document.createElement('span');
    this.ring.className = 'k-ring k-ring--lg';
    this.ring.innerHTML = '<b></b><small>уровень</small>';
    this.level = this.ring.querySelector('b')!;

    this.xp = document.createElement('div');
    this.xp.className = 'mn-xp';
    this.xp.innerHTML = '<div class="k-meter k-meter--lg" role="progressbar" aria-label="Опыт до следующего уровня"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i><span class="k-meter-label"></span></div><span class="k-dim mn-xp-next"></span>';
    this.meter = this.xp.querySelector('.k-meter')!;
    this.label = this.xp.querySelector('.k-meter-label')!;
    this.until = this.xp.querySelector('.mn-xp-next')!;

    this.tiers = document.createElement('div');
    this.tiers.className = 'mn-tiers-wrap';
    const row = this.tiers.appendChild(document.createElement('div'));
    row.className = 'mn-tiers';
    for (const t of FRAME_TIERS.filter((x) => x.id !== 'none')) {
      const card = row.appendChild(document.createElement('span'));
      card.className = 'mn-tier';
      card.style.setProperty('--tc', t.color);
      card.innerHTML = '<i></i><b></b><span></span>';
      card.querySelector('b')!.textContent = t.name;
      card.querySelector('span')!.textContent = `с ${t.min} уровня`;
      this.cards.push({ root: card, min: t.min });
    }
    const note = this.tiers.appendChild(document.createElement('p'));
    note.className = 'k-faint mn-xp-rule';
    note.textContent = '1 жетон за игру = 1 XP. Казино, бонусы и возвраты не дают опыта. Навык рыбалки развивается отдельно.';
  }

  update(xp: number): void {
    const p = levelProgress(xp);
    const tier = frameForLevel(p.level);
    const part = p.needed > 0 ? Math.min(1, Math.max(0, p.current / p.needed)) : 0;
    this.ring.style.setProperty('--p', String(Math.round(part * 1000) / 1000));
    this.level.textContent = String(p.level);
    this.ring.setAttribute('aria-label', `Уровень ${p.level}${tier.id === 'none' ? '' : `, рамка «${tier.name}»`}`);
    this.meter.style.setProperty('--v', String(Math.round(part * 1000) / 1000));
    this.meter.setAttribute('aria-valuetext', `${fmt.format(p.current)} из ${fmt.format(p.needed)} опыта до уровня ${p.level + 1}`);
    this.label.textContent = `${fmt.format(p.current)} / ${fmt.format(p.needed)} опыта`;
    this.until.textContent = `до ${p.level + 1} уровня`;
    for (const c of this.cards) c.root.classList.toggle('is-got', p.level >= c.min);
  }
}
