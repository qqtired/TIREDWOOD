// Окно Семечкина (lab/ui/screens/farm.js «Семечкин: каталог семян»): «Культуры» — крупные карточки (картинка, рост и опыт,
// «семя → продажа», ресурс; закрытые — силуэтом с уровнем, ближайшая названа), «Скоро» — что откроет следующий уровень,
// «Репутация» — источники и точные бонусы, «Обучение» — шесть подсказок с однократными наградами.
import { cropOpen, farmLevel, farmLevelInfo, growMs, repLevel, resourceChance } from '../../../shared/farm.ts';
import {
  BUFFS, CROPS, FARM_LEVEL_NAMES, FARM_MAX_LEVEL, FARM_XP_TOTAL, HELP_REP, HELP_REP_DAY_CAP, ORDER_TEMPLATES,
  REP_FIRST_ENTRY, REP_LAST_DROP, REP_LEVELS, REP_PER_BOSS_PERCENT, TUTORIAL_COINS, TUTORIAL_STEPS, TUTORIAL_XP, type CropDef,
} from '../../../shared/farmdata.ts';
import { keyHtml } from '../../ui/kit/dom.ts';
import { farmIncome } from '../../../shared/farmeconomy.ts';
import { C, FarmWin, TUTORIAL_TEXT, big, fi, fmtLeft, fmtMin, meter, resIconName, resName, ui } from './common.ts';
import { levelOpens } from './levels.ts';
import { UPGRADE_ICON, rewardIcon, rewardName } from './names.ts';
import { priceNumber, seedPrices, tutorialRewards } from './price-model.ts';

export class SeedsWin extends FarmWin {
  protected firstTab(): string {
    return this.host.f.tutorial >= 0 && this.host.f.tutorial < TUTORIAL_STEPS ? 'tut' : 'crops';
  }

  protected draw(body: HTMLElement): void {
    const f = this.host.f;
    const level = farmLevel(f.xp);
    if (!['crops', 'next', 'rep', 'tut'].includes(this.tab)) this.tab = 'crops';
    const open = CROPS.filter((c) => cropOpen(c, level)).length;
    const done = f.tutorial < 0 ? 0 : Math.min(TUTORIAL_STEPS, f.tutorial);
    this.setTabs([
      { id: 'crops', icon: fi('radish'), label: 'Культуры', count: `${open} из ${CROPS.length}` },
      { id: 'next', icon: fi('strawberry'), label: 'Скоро' },
      { id: 'rep', icon: fi('help-hands'), label: 'Репутация', count: String(f.rep) },
      { id: 'tut', icon: ui('scroll'), label: 'Обучение', count: `${done} из ${TUTORIAL_STEPS}` },
    ]);
    if (this.tab === 'next') this.drawNext(body);
    else if (this.tab === 'rep') this.drawRep(body);
    else if (this.tab === 'tut') this.drawTutorial(body);
    else this.drawCrops(body);
    this.setFoot(`<span class="k-note">У пустой грядки ${keyHtml('E', undefined, 'sm')} — открыть семена и выбрать мышью</span><button class="k-btn k-btn--ghost k-btn--sm" type="button" data-close>Закрыть</button>`);
    this.onClick('[data-close]', () => this.close());
  }

  private cropCard(c: CropDef): string {
    const f = this.host.f;
    const level = farmLevel(f.xp);
    if (!cropOpen(c, level)) {
      const soon = c.level === level + 1;
      return `
        <div class="k-cell farm-crop is-locked">
          ${fi(c.icon, 'farm-crop-ic farm-sil')}
          <div class="farm-crop-name">${soon ? c.name : '???'}</div>
          <span class="k-pill k-pill--sm${soon ? ' k-pill--mode' : ''}">${soon ? `с ур. ${c.level} — скоро` : `ур. ${c.level}`}</span>
        </div>`;
    }
    const gift = !f.firstPlanted.includes(c.id);
    const prices = seedPrices(f, c, this.host.now);
    this.live(`[data-seed-sale="${c.id}"]`, () => priceNumber(seedPrices(this.host.f, c, this.host.now).sale));
    this.live(`[data-seed-income="${c.id}"]`, () => String(Math.round(farmIncome(this.host.f, c, this.host.now, true).net)));
    const chance = Math.round(resourceChance(f, c) * 100);
    const got = f.counters[`h:${c.id}`] ?? 0;
    return `
      <div class="k-cell farm-crop">
        ${gift ? `<span class="k-pill k-pill--gold k-pill--sm farm-crop-gift">${ui('gift')}даром</span>` : ''}
        ${fi(c.icon, 'farm-crop-ic')}
        <div class="farm-crop-name">${c.name}</div>
        <div class="farm-crop-row"><b>${fmtMin(Math.max(1, Math.round(growMs(f, c, this.host.now) / 60_000)))}</b><span class="k-gold">+${c.xp} опыта</span></div>
        <div class="farm-crop-row"><span class="farm-price">Семя ${C()}${prices.seed}</span></div>
        <div class="farm-crop-row"><span class="farm-price">Гриб сейчас ${C()}<span data-seed-sale="${c.id}">${priceNumber(prices.sale)}</span></span></div>
        <div class="farm-crop-row k-dim">${fi(resIconName(c.res))}${resName(c.res)} ${chance} %</div>
        <div class="farm-crop-row k-good">Ферма ≈<span data-seed-income="${c.id}">${Math.round(farmIncome(f, c, this.host.now, true).net)}</span> ${C()}/ч</div>
        ${got ? `<div class="farm-crop-own k-faint">собрано: ${got}</div>` : ''}
      </div>`;
  }

  private drawCrops(body: HTMLElement): void {
    body.innerHTML = `<div class="farm-pane"><p class="farm-lead k-dim">Вся ферма · ${this.host.f.beds.length} грядок · чистыми после семян. Учтены твои улучшения, репутация и бонусы; полив сразу, сбор без простоя.</p><div class="farm-crops">${CROPS.filter(c => cropOpen(c, farmLevel(this.host.f.xp))).map((c) => this.cropCard(c)).join('')}</div></div>`;
  }

  private drawRep(body: HTMLElement): void {
    const f = this.host.f, level = repLevel(f.rep);
    const current = REP_LEVELS[level - 1], next = REP_LEVELS[level];
    const slots = (lv: number) => REP_LEVELS.filter(r => r.vanSlot && r.level <= lv).length;
    const orderRep = ORDER_TEMPLATES.filter(o => o.rep > 0).map(o => o.rep);
    const rows = REP_LEVELS.map(r => `<tr${r.level === level ? ' class="is-own"' : ''}>
      <td>${r.level}. ${r.name}${r.level === level ? ' · сейчас' : ''}</td><td class="k-r">${r.need}</td>
      <td class="k-r">+${Math.round(r.bonus * 100)} %</td><td class="k-r">+${slots(r.level)}</td>
      <td>${r.reward ? rewardName(r.reward) : '—'}</td></tr>`).join('');
    body.innerHTML = `<div class="farm-pane farm-reputation">
      <div class="k-cell farm-rep">${fi('help-hands', 'farm-rep-ic')}
        <div class="farm-rep-main"><p class="k-eyebrow">${current.name} · ступень ${level}</p>
          ${meter(next ? (f.rep - current.need) / (next.need - current.need) : 1, 'k-meter--lg', `${f.rep} репутации${next ? ` · до следующей ${next.need - f.rep}` : ' · высшая ступень'}`)}
          <p class="farm-rep-next">Сейчас: +${Math.round(current.bonus * 100)} % к цене у Гриба и Фургона, +${slots(level)} ящика Фургона.</p>
        </div></div>
      <p class="k-eyebrow farm-h">За что дают репутацию</p>
      <ul class="farm-rep-sources">
        <li>Первый вход на ферму за день по Москве: +${REP_FIRST_ENTRY}.</li>
        <li>Помощь соседу: +${HELP_REP}, до ${HELP_REP_DAY_CAP} за день.</li>
        <li>Цветение Древа: +${REP_PER_BOSS_PERCENT} за каждый полный 1 % твоего вклада; «Последняя капля»: ещё +${REP_LAST_DROP}.</li>
        <li>Отдельные заказы доски: +${Math.min(...orderRep)}–${Math.max(...orderRep)}, награда указана в заказе.</li>
      </ul>
      <div class="farm-rep-table"><table class="k-table"><thead><tr><th>Ступень</th><th class="k-r">Репутация</th><th class="k-r">Цена</th><th class="k-r">Ящики</th><th>Награда</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="k-note">Бонус цены — итоговый, ступени не складываются. Дополнительные ящики доступны с 3-го уровня фермы. Цена единицы — до 150 монет.</p>
      <p class="k-eyebrow farm-h">Временные бонусы Древа</p><div class="farm-rep-buffs" data-rep-buffs></div>
    </div>`;
    this.live('[data-rep-buffs]', () => {
      const active = this.host.f.buffs.filter(b => b.until > this.host.now);
      return active.length ? active.map(b => `<span class="k-pill k-pill--good">${fi(BUFFS[b.kind].icon)}${BUFFS[b.kind].name} · ещё ${fmtLeft(b.until - this.host.now)}</span>`).join('') : '<span class="k-dim">Сейчас нет. За вклад от 1 % в цветение — один бонус на 24 часа.</span>';
    });
  }

  private drawNext(body: HTMLElement): void {
    const f = this.host.f;
    const info = farmLevelInfo(f.xp);
    if (info.level >= FARM_MAX_LEVEL) {
      body.innerHTML = '<div class="farm-pane"><p class="farm-lead k-dim">Ты на вершине: «Легенда фермы». Дальше опыт копится в звёздах — каждые 20 000 опыта.</p></div>';
      return;
    }
    const next = info.level + 1;
    const o = levelOpens(next);
    const need = Math.max(0, FARM_XP_TOTAL[next - 1] - f.xp);
    const stats: string[] = [];
    for (const c of o.crops) {
      const free = !f.firstPlanted.includes(c.id);
      stats.push(`<div class="k-stat">${fi(c.icon, 'k-stat-ic')}<div class="k-stat-num">${c.name}</div><div class="k-stat-cap">${fmtMin(c.min)} · +${c.xp} опыта${free ? ' · первая даром' : ''}</div></div>`);
    }
    for (const u of o.upgrades) {
      const res = Object.entries(u.res).map(([id, n]) => `${n} ${resName(id).toLowerCase()}`).join(', ');
      stats.push(`<div class="k-stat">${fi(UPGRADE_ICON[u.kind], 'k-stat-ic')}<div class="k-stat-num">${u.name}</div><div class="k-stat-cap">строится в Хозяйстве: ${res}</div></div>`);
    }
    if (o.van) stats.push(`<div class="k-stat">${fi('van', 'k-stat-ic')}<div class="k-stat-num">Фургон</div><div class="k-stat-cap">${o.van.replace(/^Фургон: /, '')}</div></div>`);
    for (const id of o.rewards) {
      stats.push(`<div class="k-stat">${fi(rewardIcon(id), 'k-stat-ic')}<div class="k-stat-num">${rewardName(id)}</div><div class="k-stat-cap">награда за уровень — надеть сразу</div></div>`);
    }
    body.innerHTML = `
      <div class="farm-pane">
        <div class="k-cell farm-next">
          <span class="k-ring k-ring--lg k-ring--mode" style="--p:${(info.into / info.need).toFixed(3)}"><b>${next}</b></span>
          <div class="farm-next-body">
            <p class="k-eyebrow">Уровень ${next} · «${FARM_LEVEL_NAMES[next - 1]}»</p>
            <div class="farm-next-t">Ещё ${big(need)} опыта</div>
            ${meter(info.into / info.need, 'k-meter--mode', `${big(info.into)} / ${big(info.need)}`)}
          </div>
        </div>
        ${stats.length ? `<div class="farm-unlocks">${stats.join('')}</div>` : '<p class="farm-lead k-dim">Новых культур и улучшений нет — зато опыт идёт дальше.</p>'}
      </div>`;
  }

  private drawTutorial(body: HTMLElement): void {
    const f = this.host.f;
    const rows = TUTORIAL_TEXT.map((text, i) => {
      const done = f.tutorial >= 0 && i < f.tutorial;
      const cur = f.tutorial === i;
      const paid = i < f.tutorialRewarded;
      const prize = paid ? 'Награда получена' : i === TUTORIAL_STEPS - 1 ? `+${TUTORIAL_XP[i]} опыта и ${TUTORIAL_COINS} ${C()}` : `+${TUTORIAL_XP[i]} опыта`;
      return `<div class="k-cell farm-step${done ? ' is-done' : ''}${cur ? ' is-cur' : ''}"><span class="k-place">${i + 1}</span><span class="farm-step-t">${text.replace(/\bE\b/g, keyHtml('E', undefined, 'sm'))}</span><span class="k-pill k-pill--sm ${paid || done ? 'k-pill--good' : cur ? 'k-pill--gold' : ''}">${prize}</span></div>`;
    }).join('');
    const closed = f.tutorial < 0 || f.tutorial >= TUTORIAL_STEPS;
    const rewards = tutorialRewards(f.tutorialRewarded);
    const rewardText = rewards.steps
      ? `Осталось получить: +${rewards.xp} опыта${rewards.coins ? ` и ${rewards.coins} ${C()}` : ''} за ${rewards.steps} ${rewards.steps === 1 ? 'шаг' : rewards.steps < 5 ? 'шага' : 'шагов'}.`
      : 'Все награды получены. Шесть подсказок можно повторить.';
    body.innerHTML = `
      <div class="farm-pane farm-steps">
        <p class="farm-lead k-dim">${closed ? (f.tutorial < 0 ? 'Подсказки закрыты. ' : 'Обучение завершено. ') : ''}${rewardText}</p>
        ${closed ? '<button class="k-btn k-btn--go farm-tut-btn" type="button" data-tut="open">Повторить подсказки</button>' : ''}
        ${rows}
        ${!closed && f.tutorial < TUTORIAL_STEPS ? '<button class="k-btn k-btn--ghost k-btn--sm farm-tut-btn" type="button" data-tut="close">Закрыть подсказки</button>' : ''}
      </div>`;
    this.onClick('[data-tut]', (b) => this.host.send({ t: 'farm', a: 'tutorial', k: b.dataset.tut as 'open' | 'close' }));
  }
}

