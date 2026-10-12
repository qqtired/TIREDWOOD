// «Итог Древа» (lab/ui/screens/farm.js «Древо разлома», состояние «расцвело»): после цветения (farmBossEnd) — «Расцвело!» и
// кто добавил последнюю каплю, выпавший бафф на сутки, таблица лучшего вклада со своей строкой, репутация и «Ура!» (E).
// Модель Древа и эффекты — 3D (client/farm/3d/boss.ts), здесь только окно.
import { BUFFS, REP_PER_BOSS_PERCENT } from '../../../shared/farmdata.ts';
import type { FarmBossResult } from '../../../shared/farmsys.ts';
import { keyHtml } from '../../ui/kit/dom.ts';
import { FarmWin, esc, fi } from './common.ts';

export class BossEndWin extends FarmWin {
  private res: FarmBossResult | null = null;

  push(r: FarmBossResult): void {
    this.res = r;
    this.open();
  }

  protected onKey(code: string): boolean {
    if (code !== 'KeyE') return false;
    this.close();
    return true;
  }

  protected draw(): void {
    const r = this.res;
    if (!r) return;
    const m = r.mine;
    const place = (n: number): string => `<span class="k-place${n <= 3 ? ` k-place--${n}` : ''}">${n}</span>`;
    const top = r.top.slice(0, 5);
    const mineInTop = m.place > 0 && m.place <= top.length;
    const rows = top.map((t, i) => `<tr${mineInTop && i === m.place - 1 ? ' class="is-own"' : ''}><td>${place(i + 1)}</td><td>${mineInTop && i === m.place - 1 ? 'Ты' : esc(t.nick)}</td><td class="k-r">${Math.round(t.share * 100)}</td></tr>`);
    if (m.place > top.length && m.share > 0) rows.push(`<tr class="is-own"><td>${place(m.place)}</td><td>Ты</td><td class="k-r">${Math.round(m.share * 100)}</td></tr>`);
    const buff = m.buff ? `<div class="k-reward farm-buff">${fi('life-fruit')}<span><b>${BUFFS[m.buff].name}</b><br><span class="k-dim">на 24 часа — твой плод с Древа</span></span></div>` : '';
    this.win.innerHTML = `
      <div class="k-results-head"><p class="k-eyebrow">Древо разлома</p><h2 class="k-results-title">${r.bloom ? 'Расцвело!' : 'Древо ушло спать'}</h2><p class="k-results-sub">${r.bloom ? (r.last ? `Последнюю каплю добавил ${esc(r.last.nick)}` : 'Спасибо всем, кто поливал и собирал шишки') : 'Не хватило сил — завтра попробуем снова'}</p></div>
      <div class="k-win-body">
        ${buff}
        ${rows.length ? `<table class="k-table"><thead><tr><th></th><th>Вклад</th><th class="k-r">%</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : ''}
        <div class="farm-treeend-rep">
          ${m.rep > 0 ? `<span class="k-pill k-pill--good">+${m.rep} репутации · по ${REP_PER_BOSS_PERCENT} за каждый полный 1 %</span>` : ''}
          ${m.share <= 0 ? '<span class="k-pill">в этот раз без вклада</span>' : ''}
        </div>
      </div>
      <div class="k-results-actions"><button class="k-btn k-btn--lg" type="button" data-ok data-sfx="reward">Ура!${keyHtml('E', 'tr')}</button></div>`;
    this.onClick('[data-ok]', () => this.close());
  }
}
