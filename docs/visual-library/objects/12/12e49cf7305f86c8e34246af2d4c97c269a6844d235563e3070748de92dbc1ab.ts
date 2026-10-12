// Новый уровень фермы (lab/ui/screens/farm.js «Новый уровень фермы»): крупное «Уровень фермы N!» по центру (баннер верх-центра,
// FarmHud) и под ним панель «Открылось» — сеткой картинок: культуры, грядки и инструменты, Фургон, награда. «Надеть» — без похода
// в примерочную (E), «Позже» (Esc). На больших уровнях список длинный, но остаётся сеткой картинок. Очередь: если уровней сразу
// несколько, показываем по одному. Панель ловит мышь, как все окна.
import { FARM_LEVEL_NAMES } from '../../../shared/farmdata.ts';
import { keyHtml } from '../../ui/kit/dom.ts';
import { FarmWin, esc, fi, fmtMin } from './common.ts';
import { levelOpens } from './levels.ts';
import { UPGRADE_ICON, isWearable, rewardIcon, rewardName } from './names.ts';

export interface LevelUp {
  level: number;
  items: string[];
  coins: number;
}

export class LevelWin extends FarmWin {
  private queue: LevelUp[] = [];
  private cur: LevelUp | null = null;
  /** Баннер «Уровень фермы N!» показывает ведущий (ui.top.hero) */
  onShow: (level: number, name: string) => void = () => {};

  /** Новый уровень: показать сейчас или поставить в очередь за тем, что на экране */
  push(e: LevelUp): void {
    if (this.cur) { this.queue.push(e); return; }
    this.show(e);
  }

  private show(e: LevelUp): void {
    this.cur = e;
    this.onShow(e.level, FARM_LEVEL_NAMES[e.level - 1] ?? '');
    this.open();
  }

  /** Ушли с фермы: очередь уровней сбрасываем, иначе закрытие откроет следующий уже над площадью */
  reset(): void {
    this.queue = [];
    this.close(true);
  }

  /** Закрыли — следующий уровень из очереди */
  close(silent = false): void {
    if (!this.isOpen) return;
    this.cur = null;
    super.close(silent || this.queue.length > 0);
    const next = this.queue.shift();
    if (next) this.show(next);
  }

  private wearable(): string[] {
    return this.cur?.items.filter(isWearable) ?? [];
  }

  /** E — главная кнопка («Надеть» или «Отлично») */
  protected onKey(code: string): boolean {
    if (code !== 'KeyE' || !this.cur) return false;
    this.primary();
    return true;
  }

  private primary(): void {
    const wear = this.wearable();
    if (wear.length) this.host.wear(wear);
    this.close();
  }

  protected draw(body: HTMLElement): void {
    const e = this.cur;
    if (!e) return;
    const o = levelOpens(e.level);
    const cells: [icon: string, title: string, sub: string][] = [];
    for (const c of o.crops) cells.push([c.icon, c.name, `новая культура · ${fmtMin(c.min)}`]);
    for (const u of o.upgrades) cells.push([UPGRADE_ICON[u.kind], u.name, u.kind === 'bed' ? 'можно построить в Хозяйстве' : 'улучшение в Хозяйстве']);
    if (o.van) cells.push(['van', 'Фургон', o.van.replace(/^Фургон: /, '')]);
    for (const id of e.items) cells.push([rewardIcon(id), rewardName(id), isWearable(id) ? 'награда — надень сразу' : 'убранство — в Хозяйстве']);
    if (e.coins > 0) cells.push(['ui:token', `+${e.coins} жетонов`, 'за вещи, что уже есть']);
    const wear = this.wearable();
    this.win.classList.toggle('is-wide', cells.length > 4);
    body.innerHTML = `
      <p class="k-eyebrow">Открылось</p>
      ${cells.length ? `<div class="farm-lvl-grid">${cells.map(([ic, t, s]) => `<div class="k-cell farm-lvl-item">${fi(ic, '')}<b>${esc(t)}</b><span class="k-dim">${esc(s)}</span></div>`).join('')}</div>` : '<p class="farm-lead k-dim">Новых культур и улучшений нет — зато опыт идёт дальше.</p>'}
      <div class="farm-lvl-btns">
        <button class="k-btn" type="button" data-primary data-sfx="reward">${wear.length ? (wear.length > 1 ? 'Надеть всё' : 'Надеть') : 'Отлично'}${keyHtml('E', 'tr')}</button>
        ${wear.length ? `<button class="k-btn k-btn--ghost" type="button" data-later>Позже${keyHtml('Esc', 'tr')}</button>` : ''}
      </div>`;
    this.onClick('[data-primary]', () => this.primary());
    this.onClick('[data-later]', () => this.close());
  }
}
