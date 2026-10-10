// Окно Семечкина (design-v11 §14.2): «Культуры» — сетка карточек (закрытые — силуэтом с уровнем), «Новое» — что даст
// следующий уровень и где первая посадка в подарок, «Обучение» — шесть шагов галочками, пока не пройдено.
import { cropOpen, farmLevel, growMs, seedPrice } from '../../../shared/farm.ts';
import {
  BEES_BONUS, CROPS, FARM_LEVEL_NAMES, FARM_MAX_LEVEL, FARM_XP_TOTAL, TUTORIAL_COINS, TUTORIAL_STEPS, TUTORIAL_XP, resourceById, type CropDef,
} from '../../../shared/farmdata.ts';
import { FarmWin, TUTORIAL_TEXT, btn, dec, el, fmtMin, icon, resIcon, silhouette } from './common.ts';
import { levelOpens } from './levels.ts';
import { rewardEmoji, rewardName } from './names.ts';

type Tab = 'crops' | 'next' | 'tut';

export class SeedsWin extends FarmWin {
  protected firstTab(): string {
    return this.host.f.tutorial >= 0 && this.host.f.tutorial < TUTORIAL_STEPS ? 'tut' : 'crops';
  }

  protected draw(body: HTMLElement): void {
    const f = this.host.f;
    const tabs: [Tab, string, string][] = [['crops', '🌱', 'Культуры'], ['next', '⭐', 'Новое']];
    if (f.tutorial < TUTORIAL_STEPS) tabs.push(['tut', '📋', 'Обучение']);
    if (!tabs.some(([id]) => id === this.tab)) this.tab = 'crops';
    this.setTabs(tabs);
    if (this.tab === 'crops') this.drawCrops(body);
    else if (this.tab === 'next') this.drawNext(body);
    else this.drawTutorial(body);
  }

  private drawCrops(body: HTMLElement): void {
    const f = this.host.f;
    const level = farmLevel(f.xp);
    const grid = body.appendChild(el('div', 'fm-grid'));
    for (const c of CROPS) {
      const open = cropOpen(c, level);
      const card = grid.appendChild(el('article', `fm-card${open ? '' : ' closed'}`));
      const top = card.appendChild(el('div', 'fm-card-top'));
      top.append(open ? icon(c.icon, '🌱', 'fm-ico lg') : silhouette(c.icon));
      const name = top.appendChild(el('div', 'fm-card-name'));
      name.append(el('b', '', open ? c.name : '???'), el('small', '', open ? `ур. ${c.level}` : `откроется на ур. ${c.level}`));
      if (!open) continue;
      const free = !f.firstPlanted.includes(c.id);
      if (free) card.append(el('div', 'fm-gift', '🎁 первая посадка — в подарок'));
      const rows = card.appendChild(el('dl', 'fm-facts'));
      const fact = (k: string, v: string): void => { rows.append(el('dt', '', k), el('dd', '', v)); };
      fact('Растёт', fmtMin(Math.round(growMs(f, c, this.host.now) / 60_000)));
      fact('Опыт за сбор', `+${c.xp} XP`);
      fact('Посадка → продажа', `${free ? 'бесплатно' : `${seedPrice(f, c)} 🪙`} → ${c.sale} 🪙`);
      fact('В час', `≈ ${dec((c.sale * 60) / c.min)} 🪙`);
      const chance = Math.round((c.chance + (f.built.bees ? BEES_BONUS : 0)) * 100);
      const rd = el('dd', 'fm-res');
      rd.append(resIcon(c.res, 'fm-ico sm'), el('span', '', `${resourceById(c.res)?.name ?? ''} · ${chance} %`));
      rows.append(el('dt', '', 'Ресурс'), rd);
      const got = f.counters[`h:${c.id}`] ?? 0;
      if (got) card.append(el('small', 'fm-own', `собрано: ${got}`));
    }
  }

  private drawNext(body: HTMLElement): void {
    const f = this.host.f;
    const level = farmLevel(f.xp);
    // подарки: открытые культуры, которые ещё не сажал
    const gifts = CROPS.filter((c) => cropOpen(c, level) && !f.firstPlanted.includes(c.id));
    const sec = body.appendChild(el('section', 'fm-sec'));
    sec.append(el('h3', '', '🎁 Первая посадка — в подарок'));
    if (gifts.length) {
      const row = sec.appendChild(el('div', 'fm-chips'));
      for (const c of gifts) row.append(cropChip(c));
      sec.append(el('p', 'fm-fine', 'Посади такую культуру в первый раз — жетоны за семена не потратятся.'));
    } else sec.append(el('p', 'fm-fine', 'Все открытые культуры уже пробовал. Новые подарки — на новых уровнях.'));

    if (level >= FARM_MAX_LEVEL) {
      body.append(el('p', 'fm-fine', 'Ты на вершине: «Легенда фермы». Дальше опыт копится в звёздах — каждые 20 000 XP.'));
      return;
    }
    const next = level + 1;
    const o = levelOpens(next);
    const nx = body.appendChild(el('section', 'fm-sec'));
    nx.append(el('h3', '', `⭐ Уровень ${next} — «${FARM_LEVEL_NAMES[next - 1]}»`));
    nx.append(el('p', 'fm-fine', `Нужно ещё ${Math.max(0, FARM_XP_TOTAL[next - 1] - f.xp)} XP фермы`));
    const chips = nx.appendChild(el('div', 'fm-chips'));
    for (const c of o.crops) chips.append(cropChip(c));
    for (const u of o.upgrades) chips.append(el('span', 'fm-chip', `🧺 ${u.name}`));
    if (o.van) chips.append(el('span', 'fm-chip', `🚚 ${o.van}`));
    for (const id of o.rewards) chips.append(el('span', 'fm-chip gold', `${rewardEmoji(id)} ${rewardName(id)}`));
    if (!chips.childElementCount) chips.append(el('span', 'fm-chip', 'Новых открытий нет — только опыт'));
  }

  private drawTutorial(body: HTMLElement): void {
    const f = this.host.f;
    const sec = body.appendChild(el('section', 'fm-sec'));
    if (f.tutorial < 0) {
      sec.append(el('p', 'fm-fine', `Подсказки закрыты. Хочешь — вернём: ${TUTORIAL_STEPS} шагов и награда в конце.`));
      sec.append(btn('fm-go', 'Начать обучение заново', () => this.host.send({ t: 'farm', a: 'tutorial', k: 'open' })));
    }
    const list = sec.appendChild(el('ol', 'fm-steps'));
    TUTORIAL_TEXT.forEach((text, i) => {
      const done = f.tutorial >= 0 && i < f.tutorial;
      const li = list.appendChild(el('li', `${done ? 'done' : ''}${f.tutorial === i ? ' cur' : ''}`));
      li.append(el('span', 'fm-check', done ? '✓' : String(i + 1)), el('span', 'fm-step-text', text));
      li.append(el('em', '', i === TUTORIAL_STEPS - 1 ? `+${TUTORIAL_XP[i]} XP · +${TUTORIAL_COINS} 🪙` : `+${TUTORIAL_XP[i]} XP`));
    });
    if (f.tutorial >= 0 && f.tutorial < TUTORIAL_STEPS) {
      sec.append(btn('fm-btn', 'Закрыть подсказки', () => this.host.send({ t: 'farm', a: 'tutorial', k: 'close' })));
    }
  }
}

function cropChip(c: CropDef): HTMLElement {
  const chip = el('span', 'fm-chip');
  chip.append(icon(c.icon, '🌱', 'fm-ico sm'), el('span', '', c.name));
  return chip;
}
