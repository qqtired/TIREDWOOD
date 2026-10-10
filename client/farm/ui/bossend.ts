// «Итог Древа» (design-v11 §14.2): после цветения (farmBossEnd) — твой вклад и место, выпавший бафф, репутация,
// «Последняя капля» и топ вклада. Кнопка «Ура!». Модель Древа и эффекты — 3D (B3), здесь только окно.
import { BUFFS } from '../../../shared/farmdata.ts';
import type { FarmBossResult } from '../../../shared/farmsys.ts';
import { FarmWin, btn, el } from './common.ts';

export class BossEndWin extends FarmWin {
  private res: FarmBossResult | null = null;

  push(r: FarmBossResult): void {
    this.res = r;
    this.setHead({
      eyebrow: 'ДРЕВО РАЗЛОМА · ИТОГ',
      title: r.bloom ? 'Древо расцвело!' : 'Древо ушло спать',
      intro: r.bloom ? 'Спасибо всем, кто поливал и собирал шишки.' : 'Не хватило сил — завтра попробуем снова.',
      avatar: r.bloom ? '🌳' : '💤',
    });
    this.open();
  }

  protected draw(body: HTMLElement): void {
    const r = this.res;
    if (!r) return;
    const m = r.mine;
    const sec = body.appendChild(el('section', 'fm-sec'));
    sec.append(el('h3', '', 'Твой вклад'));
    const chips = sec.appendChild(el('div', 'fm-chips'));
    chips.append(el('span', 'fm-chip gold', `${Math.round(m.share * 100)} % вклада`));
    if (m.place > 0) chips.append(el('span', 'fm-chip', `место ${m.place}`));
    if (m.buff) chips.append(el('span', 'fm-chip gold', `бафф на сутки: ${BUFFS[m.buff].name}`));
    if (m.rep > 0) chips.append(el('span', 'fm-chip gold', `+${m.rep} репутации`));
    if (m.share <= 0) chips.append(el('span', 'fm-chip', 'в этот раз без вклада'));
    if (r.last) sec.append(el('p', 'fm-fine', `«Последняя капля»: ${r.last.nick}`));
    if (r.top.length) {
      const top = body.appendChild(el('section', 'fm-sec'));
      top.append(el('h3', '', 'Лучший вклад'));
      r.top.slice(0, 5).forEach((t, i) => {
        const row = top.appendChild(el('div', 'fm-row'));
        row.append(el('span', 'fm-check', String(i + 1)), el('b', 'fm-row-main', t.nick), el('em', '', `${Math.round(t.share * 100)} %`));
      });
    }
    const foot = body.appendChild(el('div', 'fm-foot'));
    foot.append(btn('fm-go', 'Ура!', () => this.close()));
  }
}
