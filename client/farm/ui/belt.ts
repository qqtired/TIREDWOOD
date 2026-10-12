// Посадка на одну грядку: нативное окно с сеткой всех открытых семян.
// Общая оболочка FarmWin освобождает мышь, глушит ввод игры и закрывается Esc/крестиком/по фону.
import { cropOpen, farmLevel, growMs, resourceChance } from '../../../shared/farm.ts';
import { CROPS, cropById } from '../../../shared/farmdata.ts';
import { C, FarmWin, fi, fmtMin, resName } from './common.ts';
import { priceNumber, seedPrices } from './price-model.ts';

export class PlantWin extends FarmWin {
  private bed = -1;
  private pendingAt = 0;
  private error = '';
  private shownTokens = -1;

  get targetBed(): number { return this.isOpen ? this.bed : -1; }

  showBed(bed: number): void {
    this.bed = bed;
    this.pendingAt = 0;
    this.error = '';
    this.setHead({ title: 'Что посадить?', eyebrow: `Ферма · грядка ${bed + 1}` });
    const count = CROPS.filter(c => cropOpen(c, farmLevel(this.host.f.xp))).length;
    this.win.classList.toggle('k-window--lg', count > 4);
    this.win.classList.toggle('k-window--sm', count === 1);
    this.open();
  }

  failed(text: string): boolean {
    if (!this.isOpen || !this.pendingAt) return false;
    this.pendingAt = 0;
    this.error = text;
    this.refresh();
    return true;
  }

  override refresh(): void {
    if (this.isOpen && (!this.host.f.beds[this.bed] || this.host.f.beds[this.bed].crop)) {
      this.close();
      return;
    }
    super.refresh();
  }

  override tick(): void {
    if (this.isOpen && this.shownTokens !== this.host.tokens) this.refresh();
    super.tick();
  }

  private choose(id: string): void {
    if (this.pendingAt) return;
    const f = this.host.f, c = cropById(id);
    if (!c || !cropOpen(c, farmLevel(f.xp)) || !f.beds[this.bed] || f.beds[this.bed].crop) return;
    if (seedPrices(f, c, this.host.now).seed > this.host.tokens) return;
    this.pendingAt = this.host.now;
    this.error = '';
    this.refresh();
    this.host.send({ t: 'farm', a: 'plant', beds: [this.bed], crop: c.id });
  }

  protected draw(body: HTMLElement): void {
    const f = this.host.f, now = this.host.now;
    this.shownTokens = this.host.tokens;
    const cards = CROPS.filter(c => cropOpen(c, farmLevel(f.xp))).map(c => {
      const price = seedPrices(f, c, now);
      const poor = price.seed > this.host.tokens;
      this.live(`[data-plant-grow="${c.id}"]`, () => fmtMin(Math.max(1, Math.round(growMs(this.host.f, c, this.host.now) / 60000))));
      this.live(`[data-plant-sale="${c.id}"]`, () => priceNumber(seedPrices(this.host.f, c, this.host.now).sale));
      return `<button type="button" class="k-btn k-btn--ghost farm-crop farm-seed-choice" data-crop="${c.id}" aria-label="Посадить ${c.name}"${poor || this.pendingAt ? ' disabled' : ''}>
        ${fi(c.icon, 'farm-crop-ic')}
        <span class="farm-crop-name">${c.name}</span>
        <span class="farm-crop-row k-dim"><span data-plant-grow="${c.id}">${fmtMin(Math.max(1, Math.round(growMs(f, c, now) / 60000)))}</span> · +${c.xp} опыта</span>
        <span class="farm-crop-row k-gold">${price.seed ? `Семя ${C()}${price.seed}` : 'Первая посадка даром'}</span>
        <span class="farm-crop-row">Продажа ${C()}<span data-plant-sale="${c.id}">${priceNumber(price.sale)}</span></span>
        <span class="farm-crop-row k-dim">${resName(c.res)} · ${Math.round(resourceChance(f, c) * 100)} %</span>
        <span class="k-pill k-pill--sm ${poor ? 'k-pill--bad' : 'k-pill--good'}">${poor ? 'Не хватает жетонов' : 'Посадить'}</span>
      </button>`;
    }).join('');
    body.innerHTML = `<div class="farm-pane farm-crops farm-plant-grid">${cards}</div>`;
    this.onClick('[data-crop]', b => this.choose(b.dataset.crop!));
    this.setFoot('<span class="k-note" data-plant-status role="status"></span><button class="k-btn k-btn--ghost k-btn--sm" type="button" data-close>Закрыть</button>');
    this.onClick('[data-close]', () => this.close());
    this.live('[data-plant-status]', () => this.error || (this.pendingAt
      ? this.host.now - this.pendingAt >= 5000 ? 'Ждём подтверждение сервера…' : 'Сажаем…'
      : 'Нажми на семена, чтобы посадить на эту грядку'));
  }
}
