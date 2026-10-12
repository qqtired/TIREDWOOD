// Окно Дядюшки Гриба (lab/ui/screens/farm.js «Дядюшка Гриб: продать урожай»): «Продать» — счётчик продаж за сегодня
// с понятной фразой, строки сумки с ценой (репутация и бафф внутри, без дневного снижения) и одной кнопкой «Продать»; то, что
// сейчас ждёт Фургон, помечено его текущей выплатой; внизу «Продать всё» одной суммой. «Опыт за ресурсы» — кладовая
// в опыт фермы: степпер на строку (по умолчанию — свободное, что не нужно на улучшения), итог и «Превратить».
// Решает сервер: окно только просит ({t:'farm', a:'sell'|'convert'}).
import { farmLevel, hasBuff, repBonus, repLevel, saleUnit, upgradeStep } from '../../../shared/farm.ts';
import { BUFFS, CROPS, REP_LEVELS, RESOURCES, TRUFFLE, TRUFFLE_PRICE, UPGRADES, cropById, type CropDef } from '../../../shared/farmdata.ts';
import { vanTime } from '../../../shared/farmvan.ts';
import { C, FarmWin, fi, resIconName, soldToday } from './common.ts';
import { gribPayment, gribTotal, priceNumber, vanPayment } from './price-model.ts';

interface Line {
  item: string;
  n: number;
  name: string;
  iconName: string;
  unit: number;
  all: number;
  truffle: boolean;
}

/** Через промежуток, чтобы не упереться в 10 действий в секунду на сервере */
const GAP_MS = 130;

export class GribWin extends FarmWin {
  /** Сколько каждого ресурса превратить в опыт (пока не нажал «Превратить») */
  private sel: Record<string, number> = {};

  protected firstTab(): string {
    this.sel = {};
    return 'sell';
  }

  protected draw(body: HTMLElement): void {
    const lines = this.lines();
    const n = lines.reduce((a, l) => a + l.n, 0);
    this.setTabs([
      { id: 'sell', icon: fi('basket'), label: 'Продать', count: lines.length ? String(lines.length) : undefined },
      { id: 'xp', icon: fi('xp-star'), label: 'Опыт за ресурсы' },
    ]);
    if (this.tab === 'xp') this.drawXp(body);
    else this.drawSell(body, lines, n);
  }

  /** Строки сумки с текущей серверной ценой, включая бонусы и предел цены продукта */
  private lines(): Line[] {
    const f = this.host.f;
    const now = this.host.now;
    const out: Line[] = [];
    const ids = [...CROPS.map((c) => c.id), TRUFFLE];
    for (const item of ids) {
      const n = f.bag[item] ?? 0;
      if (n < 1) continue;
      if (item === TRUFFLE) {
        out.push({ item, n, name: 'Трюфель', iconName: 'truffle', unit: TRUFFLE_PRICE, all: n * TRUFFLE_PRICE, truffle: true });
        continue;
      }
      const c = cropById(item) as CropDef;
      const raw = saleUnit(f, c, now);
      const all = raw * n;
      out.push({ item, n, name: c.product, iconName: c.icon, unit: raw, all, truffle: false });
    }
    return out;
  }

  private vanHint(item: string): string {
    if (!vanTime(this.host.now).open) return '';
    const offer = this.host.van()?.slots.find(s => s.offer?.item === item && !s.done)?.offer;
    if (!offer) return '';
    const pay = vanPayment(this.host.f, offer, this.host.now);
    return `<span class="k-pill k-pill--info k-pill--sm farm-row-van">${fi('van')}Фургон: ${C()}${pay.coins} за ${offer.n} шт.</span>`;
  }

  private drawSell(body: HTMLElement, lines: Line[], pieces: number): void {
    const f = this.host.f;
    const now = this.host.now;
    const sold = Math.floor(soldToday(f, now));
    const pills: string[] = [];
    if (repBonus(f.rep) > 0) pills.push(`<span class="k-pill k-pill--good k-pill--sm">Репутация «${REP_LEVELS[repLevel(f.rep) - 1].name}» +${Math.round(repBonus(f.rep) * 100)} %</span>`);
    if (hasBuff(f, 'price', now)) pills.push(`<span class="k-pill k-pill--gold k-pill--sm">Бафф Древа +${Math.round((BUFFS.price.mult - 1) * 100)} %</span>`);
    const cash = `
      <div class="k-cell farm-cash">
        <div class="farm-cash-top"><b>Продано сегодня</b><span class="k-gold" data-live="sold">${this.salesText(sold)}</span></div>
        <p class="k-dim">Цена сохраняется при любых продажах</p>
        <div class="farm-cash-pills" data-price-bonuses>${pills.join('')}</div>
      </div>`;
    this.live('[data-price-bonuses]', () => {
      const current = this.host.f, pills: string[] = [];
      if (repBonus(current.rep) > 0) pills.push(`<span class="k-pill k-pill--good k-pill--sm">Репутация «${REP_LEVELS[repLevel(current.rep) - 1].name}» +${Math.round(repBonus(current.rep) * 100)} %</span>`);
      if (hasBuff(current, 'price', this.host.now)) pills.push(`<span class="k-pill k-pill--gold k-pill--sm">Бафф Древа +${Math.round((BUFFS.price.mult - 1) * 100)} %</span>`);
      return pills.join('');
    });
    this.live('[data-live=sold]', () => this.salesText(Math.floor(soldToday(this.host.f, this.host.now))));
    if (!lines.length) {
      body.innerHTML = `<div class="farm-pane">${cash}<div class="farm-empty">${fi('bag', 'farm-empty-ic')}<p class="farm-lead k-dim">Сумка пуста — собери урожай и приходи.</p></div></div>`;
      this.setFoot('');
      return;
    }
    const rows = lines.map((l) => {
      const vanHint = this.vanHint(l.item);
      return `
        <div class="k-cell farm-row">
          ${fi(l.iconName, 'farm-row-ic')}
          <div class="farm-row-main"><div class="farm-row-t">${l.name} <b>× ${l.n}</b></div><div class="farm-row-s k-dim" data-price-unit="${l.item}">${priceNumber(l.unit)} ${C()} за штуку</div></div>
          <span data-price-van="${l.item}">${vanHint}</span>
          <button class="k-btn k-btn--sm${vanHint ? ' k-btn--ghost' : ''}" type="button" data-sell="${l.item}" data-n="${l.n}" data-sfx="reward">Продать<small data-price-sell="${l.item}">${C()}${gribPayment(f, l.item, l.n, now)}</small></button>
        </div>`;
    }).join('');
    body.innerHTML = `<div class="farm-pane">${cash}<div class="farm-rows">${rows}</div></div>`;
    const total = gribTotal(f, lines, now);
    this.setFoot(`<span class="k-note">${lines.length} ${lines.length === 1 ? 'вид' : lines.length < 5 ? 'вида' : 'видов'} · ${pieces} шт. в сумке</span><button class="k-btn k-btn--lg" type="button" data-all data-sfx="reward">Продать всё<small data-price-total>${C()}${total}</small></button>`);
    for (const l of lines) {
      this.live(`[data-price-unit="${l.item}"]`, () => `${priceNumber(l.item === TRUFFLE ? TRUFFLE_PRICE : saleUnit(this.host.f, cropById(l.item)!, this.host.now))} ${C()} за штуку`);
      this.live(`[data-price-sell="${l.item}"]`, () => `${C()}${gribPayment(this.host.f, l.item, l.n, this.host.now)}`);
      this.live(`[data-price-van="${l.item}"]`, () => this.vanHint(l.item));
    }
    this.live('[data-price-total]', () => `${C()}${gribTotal(this.host.f, lines, this.host.now)}`);
    this.onClick('[data-sell]', (b) => this.host.sell(b.dataset.sell!, Number(b.dataset.n)));
    this.onClick('[data-all]', () => lines.forEach((l, i) => window.setTimeout(() => this.host.sell(l.item, l.n), i * GAP_MS)));
  }

  private salesText(sold: number): string { return `${sold} ${C()}`; }

  // ------------------------------------------------------------ опыт за ресурсы

  /** Сколько каждого ресурса уйдёт на ближайшие улучшения (по одной ступени каждого вида, открытые по уровню) */
  private reserved(): { need: Record<string, number>; why: Record<string, string> } {
    const f = this.host.f;
    const level = farmLevel(f.xp);
    const need: Record<string, number> = {};
    const why: Record<string, string> = {};
    const seen = new Set<string>();
    for (const u of UPGRADES) {
      if (seen.has(u.kind) || upgradeStep(f, u) >= u.step) continue;
      seen.add(u.kind);
      if (u.level > level + 1) continue;
      for (const [res, n] of Object.entries(u.res)) {
        need[res] = (need[res] ?? 0) + (n ?? 0);
        why[res] = why[res] ? `${why[res]}, ${u.name}` : u.name;
      }
    }
    return { need, why };
  }

  private drawXp(body: HTMLElement): void {
    const f = this.host.f;
    const { need, why } = this.reserved();
    const have = RESOURCES.filter((r) => (f.cellar[r.id] ?? 0) > 0);
    if (!have.length) {
      body.innerHTML = `<div class="farm-pane"><div class="farm-empty">${fi('rootlet', 'farm-empty-ic')}<p class="farm-lead k-dim">Кладовая пуста. Ресурсы падают при сборе урожая.</p></div></div>`;
      this.setFoot('');
      return;
    }
    // первый раз по умолчанию — свободное: то, что не нужно на ближайшие улучшения
    for (const r of have) {
      const n = f.cellar[r.id] ?? 0;
      this.sel[r.id] = Math.min(n, this.sel[r.id] ?? Math.max(0, n - (need[r.id] ?? 0)));
    }
    const rows = have.map((r) => {
      const n = f.cellar[r.id] ?? 0;
      return `
        <div class="k-cell farm-row farm-conv" data-res="${r.id}" data-xp="${r.xp}" data-max="${n}">
          ${fi(resIconName(r.id), 'farm-row-ic')}
          <div class="farm-row-main"><div class="farm-row-t">${r.name} <b>× ${n}</b></div><div class="farm-row-s k-dim">${need[r.id] ? `${need[r.id]} нужно на «${why[r.id]}» · ` : ''}${r.xp} опыта за штуку</div></div>
          <span class="farm-stepper"><button class="k-btn k-btn--icon k-btn--sm k-btn--ghost" type="button" data-d="-1" aria-label="Меньше">−</button><b class="farm-n">${this.sel[r.id]}</b><button class="k-btn k-btn--icon k-btn--sm k-btn--ghost" type="button" data-d="1" aria-label="Больше">+</button></span>
          <span class="k-pill k-pill--sm k-pill--gold farm-conv-xp">+${this.sel[r.id] * r.xp}</span>
        </div>`;
    }).join('');
    body.innerHTML = `<div class="farm-pane"><p class="farm-lead k-dim">Лишние ресурсы — в опыт фермы. «Свободно» — то, что не нужно на ближайшее улучшение.</p><div class="farm-rows">${rows}</div></div>`;
    this.setFoot('<span class="k-note">Итог: <b class="k-gold farm-conv-total"></b></span><button class="k-btn k-btn--ghost" type="button" data-reset>Отменить</button><button class="k-btn" type="button" data-conv data-sfx="reward">Превратить в опыт</button>');
    const total = this.foot.querySelector<HTMLElement>('.farm-conv-total')!;
    const go = this.foot.querySelector<HTMLButtonElement>('[data-conv]')!;
    const recount = (): void => {
      let xp = 0;
      body.querySelectorAll<HTMLElement>('.farm-conv').forEach((row) => {
        const id = row.dataset.res!;
        const x = (this.sel[id] ?? 0) * Number(row.dataset.xp);
        row.querySelector('.farm-n')!.textContent = String(this.sel[id] ?? 0);
        row.querySelector('.farm-conv-xp')!.textContent = `+${x}`;
        xp += x;
      });
      total.textContent = `+${xp} опыта`;
      go.disabled = xp <= 0;
    };
    body.querySelectorAll<HTMLElement>('.farm-stepper button').forEach((b) => b.addEventListener('click', () => {
      const row = b.closest<HTMLElement>('.farm-conv')!;
      const id = row.dataset.res!;
      this.sel[id] = Math.max(0, Math.min(Number(row.dataset.max), (this.sel[id] ?? 0) + Number(b.dataset.d)));
      recount();
    }));
    this.onClick('[data-reset]', () => { for (const id of Object.keys(this.sel)) this.sel[id] = 0; recount(); });
    this.onClick('[data-conv]', () => this.convertAll());
    recount();
  }

  private convertAll(): void {
    const list = Object.entries(this.sel).filter(([, n]) => n > 0);
    this.sel = {};
    list.forEach(([res, n], i) => window.setTimeout(() => this.host.send({ t: 'farm', a: 'convert', res, n }), i * GAP_MS));
    this.refresh();
  }
}
