// Меню посадки (E у пустой грядки) — крупное окно-сетка карточек культур по просьбе владельца. На карточке: значок, название,
// время роста, цена семени (первая посадка — «Бесплатно» золотом), опыт, вторичный ресурс с шансом. Закрытые — силуэт с
// замком и «с ур. N». Клик по карточке сажает, Esc и × закрывают. Грабли 2–3: переключатель «на все свободные грядки».
import { cropOpen, farmLevel, growMs } from '../../../shared/farm.ts';
import { BEES_BONUS, CROPS, RAKE_BEDS, resourceById, type CropDef } from '../../../shared/farmdata.ts';
import { FARM_BED_LOCAL } from '../../../shared/farmmap.ts';
import { FarmWin, el, fmtMin, icon, resIcon, silhouette } from './common.ts';

export class PlantWin extends FarmWin {
  /** Грядка, у которой стоим (−1 — неизвестно: сажаем туда, куда решит сцена) */
  private bed = -1;
  private many = false;
  /** Культура, которую сажал последней: первая карточка «ещё раз» */
  lastCrop = '';

  /** Грядки, куда пойдёт посадка: выбранная и ближайшие свободные (Грабли — до RAKE_BEDS) */
  private targets(): number[] {
    const f = this.host.f;
    if (this.bed < 0) return [];
    const cap = RAKE_BEDS[f.tools.rake - 1] ?? 1;
    const here = FARM_BED_LOCAL[this.bed];
    const free = f.beds.map((b, i) => ({ b, i })).filter(({ b, i }) => !b.crop && i !== this.bed)
      .sort((a, c) => Math.hypot(FARM_BED_LOCAL[a.i].x - here.x, FARM_BED_LOCAL[a.i].z - here.z) - Math.hypot(FARM_BED_LOCAL[c.i].x - here.x, FARM_BED_LOCAL[c.i].z - here.z));
    return [this.bed, ...free.slice(0, cap - 1).map((x) => x.i)];
  }

  openAt(bed: number): void {
    this.bed = bed;
    this.many = false;
    this.setHead({
      eyebrow: bed >= 0 ? `ФЕРМА · ГРЯДКА ${bed + 1}` : 'ФЕРМА · ГРЯДКА',
      title: 'Что посадить?',
      intro: 'Нажми на карточку — и посадим. Первая посадка каждой новой культуры бесплатна.',
    });
    this.open();
  }

  protected draw(body: HTMLElement): void {
    const f = this.host.f;
    const level = farmLevel(f.xp);
    const targets = this.targets();
    const n = this.many ? targets.length : 1;

    // Грабли: засеять сразу несколько грядок
    if (targets.length > 1) {
      const t = body.appendChild(el('button', `fm-toggle${this.many ? ' on' : ''}`));
      t.type = 'button';
      t.setAttribute('aria-pressed', String(this.many));
      t.append(el('span', 'fm-toggle-box', this.many ? '✓' : ''), el('b', '', `Грабли: засеять сразу ${targets.length} грядки`), el('small', '', 'ближайшие свободные — той же культурой'));
      t.addEventListener('click', () => { this.many = !this.many; this.refresh(); });
    }

    const grid = body.appendChild(el('div', 'fm-plant'));
    const last = CROPS.find((c) => c.id === this.lastCrop);
    if (last && cropOpen(last, level)) grid.append(this.card(last, n, true));
    const crops = CROPS.filter((c) => cropOpen(c, level));
    const locked = CROPS.filter((c) => !cropOpen(c, level));
    for (const c of crops) grid.append(this.card(c, n, false));
    for (const c of locked) grid.append(this.lockedCard(c));
  }

  /** Сколько заплатим: первая посадка культуры бесплатна для одной грядки, остальные — по цене */
  private cost(c: CropDef, n: number): number {
    const first = !this.host.f.firstPlanted.includes(c.id);
    return Math.max(0, c.seed * n - (first ? c.seed : 0));
  }

  private card(c: CropDef, n: number, again: boolean): HTMLElement {
    const f = this.host.f;
    const cost = this.cost(c, n);
    const free = !f.firstPlanted.includes(c.id);
    const poor = cost > this.host.tokens;
    const card = el('button', `fm-pc${free ? ' gift' : ''}${poor ? ' poor' : ''}${again ? ' again' : ''}`);
    card.type = 'button';
    card.disabled = poor;
    if (again) card.append(el('span', 'fm-pc-flag', 'Ещё раз'));
    card.append(icon(c.icon, '🌱', 'fm-ico xl'));
    card.append(el('b', 'fm-pc-name', c.name));
    const label = cost === 0 ? 'Бесплатно' : n > 1 ? `${cost} 🪙 за ${n}` : `${cost} 🪙`;
    card.append(el('span', 'fm-pc-price', free ? `🎁 ${label}` : label));
    const rows = card.appendChild(el('span', 'fm-pc-facts'));
    rows.append(el('span', '', `⏱ ${fmtMin(Math.max(1, Math.round(growMs(f, c, this.host.now) / 60_000)))}`), el('span', '', `+${c.xp} XP`));
    const res = card.appendChild(el('span', 'fm-pc-res'));
    res.append(resIcon(c.res, 'fm-ico sm'), el('span', '', `${resourceById(c.res)?.name ?? ''} · ${Math.round((c.chance + (f.built.bees ? BEES_BONUS : 0)) * 100)} %`));
    if (poor) card.append(el('span', 'fm-pc-warn', 'Не хватает жетонов'));
    card.addEventListener('click', () => this.pick(c, n));
    return card;
  }

  private lockedCard(c: CropDef): HTMLElement {
    const card = el('div', 'fm-pc closed');
    card.append(silhouette(c.icon));
    card.firstElementChild?.classList.add('xl');
    card.append(el('span', 'fm-pc-lock', '🔒'), el('b', 'fm-pc-name', '???'), el('span', 'fm-pc-price', `с ур. ${c.level}`));
    return card;
  }

  private pick(c: CropDef, n: number): void {
    this.lastCrop = c.id;
    const targets = this.targets();
    if (n > 1 && targets.length > 1) this.host.send({ t: 'farm', a: 'plant', beds: targets, crop: c.id });
    else this.host.plant(c.id);
    this.close();
  }
}
