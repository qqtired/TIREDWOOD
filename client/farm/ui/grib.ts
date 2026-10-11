// Окно Дядюшки Гриба (lab/ui/screens/farm.js «Дядюшка Гриб: продать урожай»): «Продать» — одна полоса «касса на сегодня»
// с понятной фразой, строки сумки с ценой (репутация и бафф внутри, потолок дня учтён) и одной кнопкой «Продать»; то, что
// сейчас ждёт Фургон, помечено — не продашь по ошибке дёшево; внизу «Продать всё» одной суммой. «Опыт за ресурсы» — кладовая
// в опыт фермы: степпер на строку (по умолчанию — свободное, что не нужно на улучшения), итог и «Превратить».
// Решает сервер: окно только просит ({t:'farm', a:'sell'|'convert'}).
import { capPay, farmLevel, hasBuff, repBonus, repLevel, saleUnit, upgradeStep } from '../../../shared/farm.ts';
import { BUFFS, CROPS, DAILY_CAP, REP_LEVELS, RESOURCES, TRUFFLE, TRUFFLE_PRICE, UPGRADES, cropById, type CropDef } from '../../../shared/farmdata.ts';
import { vanTime } from '../../../shared/farmvan.ts';
import { C, FarmWin, dec, fi, fmtLeft, meter, msToMskMidnight, resIconName, soldToday } from './common.ts';

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

  /** Строки сумки с ценой: потолок дня копится сверху вниз, как их проведёт сервер */
  private lines(): Line[] {
    const f = this.host.f;
    const now = this.host.now;
    let sold = soldToday(f, now);
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
      const floor = c.seed / raw;
      const all = capPay(sold, raw * n, floor);
      out.push({ item, n, name: c.product, iconName: c.icon, unit: capPay(sold, raw, floor), all, truffle: false });
      sold += all;
    }
    return out;
  }

  private drawSell(body: HTMLElement, lines: Line[], pieces: number): void {
    const f = this.host.f;
    const now = this.host.now;
    const sold = Math.floor(soldToday(f, now));
    const full = sold >= DAILY_CAP;
    const pills: string[] = [];
    if (repBonus(f.rep) > 0) pills.push(`<span class="k-pill k-pill--good k-pill--sm">Репутация «${REP_LEVELS[repLevel(f.rep) - 1].name}» +${Math.round(repBonus(f.rep) * 100)} %</span>`);
    if (hasBuff(f, 'price', now)) pills.push(`<span class="k-pill k-pill--gold k-pill--sm">Бафф Древа +${Math.round((BUFFS.price.mult - 1) * 100)} %</span>`);
    if (full) pills.push('<span class="k-pill k-pill--sm">Заказы и трюфели — по полной цене</span>');
    const cash = `
      <div class="k-cell farm-cash">
        <div class="farm-cash-top"><b>Касса на сегодня</b><span class="${full ? 'k-bad' : 'k-dim'}" data-live="cap">${this.capText(sold)}</span></div>
        ${meter(Math.min(1, sold / DAILY_CAP), full ? 'k-meter--bad k-meter--lg' : 'k-meter--lg', `${sold} из ${DAILY_CAP}`)}
        ${pills.length ? `<div class="farm-cash-pills">${pills.join('')}</div>` : ''}
      </div>`;
    if (!lines.length) {
      body.innerHTML = `<div class="farm-pane">${cash}<div class="farm-empty">${fi('bag', 'farm-empty-ic')}<p class="farm-lead k-dim">Сумка пуста — собери урожай и приходи.</p></div></div>`;
      this.setFoot('');
      return;
    }
    const van = this.host.van();
    const vanOpen = !!van && vanTime(now).open;
    const rows = lines.map((l) => {
      const offer = vanOpen ? van!.slots.find((x) => x.offer?.item === l.item && !x.done)?.offer : undefined;
      return `
        <div class="k-cell farm-row">
          ${fi(l.iconName, 'farm-row-ic')}
          <div class="farm-row-main"><div class="farm-row-t">${l.name} <b>× ${l.n}</b></div><div class="farm-row-s k-dim">${dec(l.unit)} ${C()} за штуку${l.truffle ? ' · всегда полная цена' : full ? ' · сейчас ×0,25' : ''}</div></div>
          ${offer ? `<span class="k-pill k-pill--info k-pill--sm farm-row-van">${fi('van')}Фургон даст ×${dec(offer.mult)}</span>` : '<span></span>'}
          <button class="k-btn k-btn--sm${offer ? ' k-btn--ghost' : ''}" type="button" data-sell="${l.item}" data-n="${l.n}" data-sfx="reward">Продать<small>${C()}${Math.floor(l.all)}</small></button>
        </div>`;
    }).join('');
    body.innerHTML = `<div class="farm-pane">${cash}<div class="farm-rows">${rows}</div></div>`;
    const total = Math.floor(lines.reduce((a, l) => a + l.all, 0));
    this.setFoot(`<span class="k-note">${lines.length} ${lines.length === 1 ? 'вид' : lines.length < 5 ? 'вида' : 'видов'} · ${pieces} шт. в сумке</span><button class="k-btn k-btn--lg" type="button" data-all data-sfx="reward">Продать всё<small>${C()}${total}</small></button>`);
    this.live('[data-live=cap]', () => this.capText(Math.floor(soldToday(this.host.f, this.host.now))));
    this.onClick('[data-sell]', (b) => this.host.sell(b.dataset.sell!, Number(b.dataset.n)));
    this.onClick('[data-all]', () => lines.forEach((l, i) => window.setTimeout(() => this.host.sell(l.item, l.n), i * GAP_MS)));
  }

  private capText(sold: number): string {
    return sold >= DAILY_CAP
      ? `полна — дальше ×0,25 до 00:00 (${fmtLeft(msToMskMidnight(this.host.now))})`
      : `ещё <b class="k-gold">${DAILY_CAP - sold}</b> ${C()} по полной цене`;
  }

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
