// Экран нового уровня фермы (design-v11 §14.2): «Уровень фермы 5 — «Фермер»!», что открылось, что теперь можно, награда и
// кнопки «Надеть» / «Позже». Очередь: если уровней сразу несколько, показываем по одному. Окно ловит мышь, как все остальные.
import { FARM_LEVEL_NAMES } from '../../../shared/farmdata.ts';
import { FarmWin, btn, el, icon } from './common.ts';
import { levelOpens } from './levels.ts';
import { isWearable, rewardEmoji, rewardName } from './names.ts';

export interface LevelUp {
  level: number;
  items: string[];
  coins: number;
}

export class LevelWin extends FarmWin {
  private queue: LevelUp[] = [];
  private cur: LevelUp | null = null;

  /** Новый уровень: показать сейчас или поставить в очередь за тем, что на экране */
  push(e: LevelUp): void {
    if (this.cur) { this.queue.push(e); return; }
    this.show(e);
  }

  private show(e: LevelUp): void {
    this.cur = e;
    const name = FARM_LEVEL_NAMES[e.level - 1] ?? '';
    this.setHead({ eyebrow: 'ФЕРМА · НОВЫЙ УРОВЕНЬ', title: `Уровень фермы ${e.level} — «${name}»!`, intro: 'Так держать! Вот что теперь открыто.', avatar: String(e.level) });
    this.open();
  }

  /** Закрыли — следующий уровень из очереди */
  close(silent = false): void {
    if (!this.isOpen) return;
    this.cur = null;
    super.close(silent || this.queue.length > 0);
    const next = this.queue.shift();
    if (next) this.show(next);
  }

  protected draw(body: HTMLElement): void {
    const e = this.cur;
    if (!e) return;
    const o = levelOpens(e.level);
    const open = body.appendChild(el('section', 'fm-sec'));
    if (o.crops.length || o.upgrades.length || o.van) {
      open.append(el('h3', '', 'Открыто'));
      const chips = open.appendChild(el('div', 'fm-chips'));
      for (const c of o.crops) {
        const chip = el('span', 'fm-chip');
        chip.append(icon(c.icon, '🌱', 'fm-ico sm'), el('span', '', c.name));
        chips.append(chip);
      }
      for (const u of o.upgrades) chips.append(el('span', 'fm-chip', `🧺 ${u.name}`));
      if (o.van) chips.append(el('span', 'fm-chip', `🚚 ${o.van}`));
    } else open.append(el('p', 'fm-fine', 'Новых культур и улучшений нет — зато опыт идёт дальше.'));

    const rew = body.appendChild(el('section', 'fm-sec'));
    rew.append(el('h3', '', 'Награда'));
    const chips = rew.appendChild(el('div', 'fm-chips'));
    for (const id of e.items) chips.append(el('span', 'fm-chip gold', `${rewardEmoji(id)} ${rewardName(id)}`));
    if (e.coins > 0) chips.append(el('span', 'fm-chip gold', `+${e.coins} 🪙 за вещи, что уже есть`));
    if (!chips.childElementCount) chips.append(el('span', 'fm-chip', 'Без вещей на этом уровне'));

    const wear = e.items.filter(isWearable);
    const foot = body.appendChild(el('div', 'fm-foot'));
    foot.append(btn('fm-btn', 'Позже', () => this.close()));
    if (wear.length) foot.append(btn('fm-go', 'Надеть', () => { this.host.wear(wear); this.close(); }));
  }
}
