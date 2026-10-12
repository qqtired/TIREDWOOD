// Пояс семян вместо окна «Что посадить?» (lab/ui/screens/farm.js «Посадка: пояс семян вместо окна»): подошёл к пустой грядке —
// внизу по центру пояс: 1–9 или колесо выбирают культуру, E сажает, Q — граблями на несколько грядок или по одной. Над поясом —
// коротко о выбранном: рост, опыт, цена, ресурс; закрытые — силуэт с «ур. N». Культур больше девяти — окно из девяти ячеек
// едет за выбором. Правила посадки не здесь: шлём то же намерение {t:'farm', a:'plant'}, решает сервер (shared/farm.ts plant).
import { cropOpen, farmLevel, farmLevelInfo, growMs } from '../../../shared/farm.ts';
import { BEES_BONUS, FARM_XP_TOTAL, RAKE_BEDS, cropById, type CropDef } from '../../../shared/farmdata.ts';
import { FARM_BED_LOCAL } from '../../../shared/farmmap.ts';
import type { FarmClientMsg } from '../../../shared/farmnet.ts';
import type { FarmProgress } from '../../../shared/farm.ts';
import { keyHtml } from '../../ui/kit/dom.ts';
import { sfx } from '../../ui/kit/sfx.ts';
import type { HudSlots } from '../../ui/kit/slots.ts';
import { BELT_SLOTS, WheelAcc, accusative, beltCrops, beltStart, beltStep, plantCost, rakeTargets, wheelPixels } from './belt-model.ts';
import { C, big, fi, fmtMin, meter, resIconName, resName, ui } from './common.ts';
import { priceNumber, seedPrices } from './price-model.ts';

export interface BeltActions {
  send(m: FarmClientMsg): void;
  /** Короткое сообщение «не хватает жетонов» */
  poor(): void;
}

export class SeedBelt {
  private readonly root = document.createElement('div');
  private readonly act: BeltActions;
  private sel = '';
  private start = 0;
  /** Q: по одной грядке (граблями — по умолчанию, если они есть) */
  private single = false;
  private bed = -1;
  private on = false;
  private lastCrop = '';
  private f: FarmProgress | null = null;
  private tokens = 0;
  private now = 0;
  private key = '';
  private readonly wheelAcc = new WheelAcc();

  constructor(slots: HudSlots, act: BeltActions) {
    this.act = act;
    this.root.className = 'farm-bc';
    this.root.dataset.mode = 'farm';
    this.root.hidden = true;
    slots.bc.append(this.root);
  }

  /** Пояс на экране — колесо и цифры достаются ему, а не камере. Нет пояса — колесо приближает камеру */
  get active(): boolean {
    return this.on && !this.root.hidden;
  }

  /** Пояс показан именно у этой грядки */
  isAt(bed: number): boolean {
    return this.active && this.bed === bed;
  }

  /** Показать у грядки bed; прогресс, жетоны и серверное время — для подписей */
  show(f: FarmProgress, bed: number, tokens: number, now: number): void {
    this.f = f;
    this.tokens = tokens;
    this.now = now;
    const changed = !this.on || bed !== this.bed;
    this.bed = bed;
    this.on = true;
    if (changed) {
      const list = beltCrops(farmLevel(f.xp));
      if (!list.some((c) => c.id === this.sel)) this.sel = this.defaultCrop(f, list);
    }
    this.render();
  }

  hide(): void {
    if (!this.on) return;
    this.on = false;
    this.root.hidden = true;
    this.key = '';
    this.wheelAcc.reset();
  }

  private defaultCrop(f: FarmProgress, list: CropDef[]): string {
    const level = farmLevel(f.xp);
    const open = list.filter((c) => cropOpen(c, level));
    if (open.some((c) => c.id === this.lastCrop)) return this.lastCrop;
    return (open.find((c) => !f.firstPlanted.includes(c.id)) ?? open[0] ?? list[0]).id;
  }

  /** Цифра 1–9: ячейка окна пояса */
  pick(slot: number): void {
    if (!this.on || !this.f) return;
    const list = beltCrops(farmLevel(this.f.xp));
    const i = this.start + slot;
    if (slot < 0 || slot >= BELT_SLOTS || i >= list.length) return;
    this.sel = list[i].id;
    sfx.play('tick');
    this.render();
  }

  /** Событие колеса (и от сцены, и от самого пояса): копим прокрутку, шаг — раз в ~80 px и не чаще раза в 100 мс */
  wheel(e: { deltaY: number; deltaMode?: number }): void {
    if (!this.on) return;
    const dir = this.wheelAcc.push(wheelPixels(e.deltaY, e.deltaMode), performance.now());
    if (dir) this.step(dir);
  }

  /** Шаг ±1 по кругу: следующая или прежняя культура */
  step(dir: number): void {
    if (!this.on || !this.f) return;
    const list = beltCrops(farmLevel(this.f.xp));
    const i = list.findIndex((c) => c.id === this.sel);
    this.sel = list[beltStep(Math.max(0, i), dir, list.length)].id;
    sfx.play('tick');
    this.render();
  }

  /** Q: грабли ↔ по одной */
  toggleRake(): void {
    if (!this.on || !this.f || this.maxBeds(this.f) < 2) return;
    this.single = !this.single;
    sfx.play('tick');
    this.render();
  }

  private maxBeds(f: FarmProgress): number {
    return RAKE_BEDS[f.tools.rake - 1] ?? 1;
  }

  /** Грядки, куда пойдёт посадка сейчас */
  private targets(f: FarmProgress): number[] {
    const cap = this.maxBeds(f);
    if (this.single || cap < 2) return [this.bed];
    return rakeTargets(f.beds.map((b) => !!b.crop), cap, this.bed, FARM_BED_LOCAL);
  }

  /** E / ЛКМ: посадить выбранное. false — нечего сажать (закрытая культура) */
  plant(): boolean {
    const f = this.f;
    if (!this.on || !f) return false;
    const c = cropById(this.sel);
    if (!c || !cropOpen(c, farmLevel(f.xp))) { sfx.play('error'); return false; }
    const beds = this.targets(f);
    const cost = plantCost(c.seed, beds.length, !f.firstPlanted.includes(c.id));
    if (cost > this.tokens) { this.act.poor(); sfx.play('error'); return true; }
    this.lastCrop = c.id;
    this.act.send({ t: 'farm', a: 'plant', beds, crop: c.id });
    return true;
  }

  /** Свежие данные (каждую секунду и при ответе сервера): подписи и цена */
  update(f: FarmProgress, tokens: number, now: number): void {
    if (!this.on) return;
    this.f = f;
    this.tokens = tokens;
    this.now = now;
    this.render();
  }

  private render(): void {
    const f = this.f;
    if (!f) return;
    const level = farmLevel(f.xp);
    const list = beltCrops(level);
    const idx = Math.max(0, list.findIndex((c) => c.id === this.sel));
    const c = list[idx];
    this.sel = c.id;
    this.start = beltStart(this.start, idx, list.length);
    const locked = !cropOpen(c, level);
    const beds = this.targets(f);
    const rakeOn = !locked && beds.length > 1;
    const free = !f.firstPlanted.includes(c.id);
    const cost = plantCost(c.seed, beds.length, free);
    const poor = !locked && cost > this.tokens;
    const chance = Math.round((c.chance + (f.built.bees ? BEES_BONUS : 0)) * 100);
    const canRake = this.maxBeds(f) > 1;
    const html = this.html(f, list, c, { locked, rakeOn, free, cost, poor, chance, canRake, beds: beds.length });
    const key = `${html}`;
    if (key === this.key) { this.root.hidden = false; return; }
    this.key = key;
    this.root.hidden = false;
    this.root.innerHTML = html;
    this.root.querySelectorAll<HTMLElement>('.farm-slot').forEach((b) => b.addEventListener('click', () => this.pick(Number(b.dataset.i))));
    this.root.querySelector('.farm-belt')?.addEventListener('wheel', (e) => { e.preventDefault(); this.wheel(e as WheelEvent); }, { passive: false });
    this.root.querySelector('button.farm-act')?.addEventListener('click', () => this.plant());
  }

  private html(f: FarmProgress, list: CropDef[], c: CropDef, s: { locked: boolean; rakeOn: boolean; free: boolean; cost: number; poor: boolean; chance: number; canRake: boolean; beds: number }): string {
    const level = farmLevel(f.xp);
    const info = farmLevelInfo(f.xp);
    const grow = fmtMin(Math.max(1, Math.round(growMs(f, c, this.now) / 60_000)));
    const prices = seedPrices(f, c, this.now);
    const price = `<span class="farm-price">Семя ${C()}${prices.seed} <i>→</i> Гриб сейчас ${C()}${priceNumber(prices.sale)}</span>`;
    const stats = s.locked
      ? `<div class="farm-pick-stats"><span>Откроется на <b>ур. ${c.level}</b> фермы</span><span class="k-dim">ещё ${big(Math.max(0, FARM_XP_TOTAL[c.level - 1] - f.xp))} опыта</span></div>${c.level === level + 1 ? meter(info.into / info.need, 'k-meter--thin k-meter--mode farm-pick-meter') : ''}`
      : `<div class="farm-pick-stats"><span><b>${grow}</b></span><span class="k-gold"><b>+${c.xp}</b> опыта</span>${price}<span>${fi(resIconName(c.res))}${resName(c.res)} ${s.chance} %</span></div>`;
    const tags = [
      s.free && !s.locked ? `<span class="k-pill k-pill--gold k-pill--sm">${ui('gift')}первая — даром</span>` : '',
      list.length > BELT_SLOTS ? `<span class="k-pill k-pill--xs">${list.findIndex((x) => x.id === c.id) + 1} из ${list.length}</span>` : '',
    ].join('');
    const cells = list.slice(this.start, this.start + BELT_SLOTS).map((b, k) => {
      const lk = !cropOpen(b, level);
      const on = b.id === c.id;
      return `<button class="k-btn k-btn--icon ${on ? 'k-btn--gold is-on' : 'k-btn--ghost'} farm-slot${lk ? ' is-locked' : ''}" type="button" data-i="${k}" aria-label="${lk ? `${b.name}: ур. ${b.level}` : b.name}">${fi(b.icon, `k-ic${lk ? ' farm-sil' : ''}`)}${lk ? `<span class="farm-slot-lv">ур. ${b.level}</span>` : ''}${keyHtml(String(k + 1), 'tl', 'sm')}</button>`;
    }).join('');
    const wheel = '<span class="k-key"><i class="k-mouse k-mouse--wheel"></i></span><span class="k-prompt-note">выбрать</span>';
    const qKey = s.canRake ? `${keyHtml('Q')}<span class="k-prompt-note">${s.rakeOn ? 'по одной' : 'граблями'}</span>` : wheel;
    let act: string;
    if (s.locked) act = `<div class="k-prompt k-prompt--off farm-act">${keyHtml('E')}Посадить<span class="k-prompt-sep"></span><span class="k-prompt-note">${c.name} — с ур. ${c.level}</span></div>`;
    else {
      const verb = s.rakeOn ? `Посадить на ${s.beds} ${s.beds < 5 ? 'грядки' : 'грядок'}` : `Посадить ${accusative(c.name)}`;
      act = `<button class="k-prompt farm-act${s.poor ? ' k-prompt--off' : ''}" type="button">${keyHtml('E')}${verb}<span class="k-pill ${s.poor ? 'k-pill--bad' : 'k-pill--gold'} k-pill--sm">${s.cost ? `${C()}${s.cost}` : 'даром'}</span><span class="k-prompt-sep"></span>${s.poor ? '<span class="k-prompt-note">не хватает жетонов</span>' : qKey}</button>`;
    }
    const rake = s.rakeOn ? `<div class="k-pill k-pill--plate farm-rake-note">${fi('rake')}Грабли ${f.tools.rake} засеют все пустые грядки рядом: ${s.beds} из ${this.maxBeds(f)}</div>` : '';
    return `
      ${rake}
      <div class="k-plate farm-pick${s.locked ? ' is-locked' : ''}">
        ${fi(c.icon, `farm-pick-ic${s.locked ? ' farm-sil' : ''}`)}
        <div class="farm-pick-body">
          <div class="farm-pick-name">${c.name}${tags}</div>
          ${stats}
        </div>
      </div>
      <div class="k-plate farm-belt" role="listbox" aria-label="Пояс семян">${cells}</div>
      ${act}`;
  }
}
