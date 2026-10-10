// Окно Дядюшки Гриба (design-v11 §14.2): «Продать» — строки сумки с ценой за штуку (репутация и бафф уже внутри, потолок
// дня учтён), «Продать всё», полоска «Сегодня продано на 540 / 700 🪙»; «Опыт за ресурсы» — кладовая в опыт фермы со
// степпером, итогом и отменой. Решает сервер: окно только просит ({t:'farm', a:'sell'|'convert'}).
import { capPay, farmLevel, hasBuff, repBonus, saleUnit, upgradeStep } from '../../../shared/farm.ts';
import { BUFFS, CROPS, RESOURCES, TRUFFLE, TRUFFLE_PRICE, UPGRADES, cropById, type CropDef } from '../../../shared/farmdata.ts';
import { vanTime } from '../../../shared/farmvan.ts';
import { FarmWin, btn, capBar, dec, el, icon, resIcon, soldToday } from './common.ts';

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
    return 'sell';
  }

  protected draw(body: HTMLElement): void {
    this.setTabs([['sell', '💰', 'Продать'], ['xp', '✨', 'Опыт за ресурсы']]);
    if (this.tab === 'xp') this.drawXp(body);
    else this.drawSell(body);
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

  private drawSell(body: HTMLElement): void {
    const f = this.host.f;
    const now = this.host.now;
    body.append(capBar(f, now));
    const bonus: string[] = [];
    if (repBonus(f.rep) > 0) bonus.push(`Репутация +${Math.round(repBonus(f.rep) * 100)} %`);
    if (hasBuff(f, 'price', now)) bonus.push(`Бафф Древа +${Math.round((BUFFS.price.mult - 1) * 100)} %`);
    if (bonus.length) body.append(el('p', 'fm-bonus', bonus.join(' · ')));
    const lines = this.lines();
    if (!lines.length) {
      const empty = body.appendChild(el('div', 'fm-empty'));
      empty.append(icon('bag', '🎒', 'fm-ico xl'), el('p', '', 'Сумка пуста — собери урожай и приходи.'));
      return;
    }
    const total = Math.floor(lines.reduce((a, l) => a + l.all, 0));
    const head = body.appendChild(el('div', 'fm-rowhead'));
    head.append(el('h3', '', 'Что в сумке'), btn('fm-go', `Продать всё — ${total} 🪙`, () => this.sellAll(lines)));
    const van = this.host.van();
    for (const l of lines) {
      const row = body.appendChild(el('div', 'fm-row'));
      row.append(icon(l.iconName, '🌱', 'fm-ico lg'));
      const name = row.appendChild(el('div', 'fm-row-main'));
      name.append(el('b', '', `${l.name} × ${l.n}`));
      const sub = name.appendChild(el('small', '', l.truffle ? `${l.unit} 🪙/шт · всегда полная цена` : `${dec(l.unit)} 🪙/шт`));
      const offer = van && vanTime(this.host.now).open ? van.slots.find((x) => x.offer?.item === l.item && !x.done)?.offer : undefined;
      if (offer) sub.append(el('span', 'fm-van-mark', `🚚 Фургон даст ×${dec(offer.mult)}`));
      row.append(btn('fm-btn', 'Продать 1', () => this.host.sell(l.item, 1)));
      row.append(btn('fm-go', `Продать ×${l.n} — ${Math.floor(l.all)} 🪙`, () => this.host.sell(l.item, l.n)));
    }
    body.append(el('p', 'fm-fine', 'Трюфели и заказы потолок не режет. Фургон платит ×1,3–1,5 за целый ящик — загляни к нему до продажи.'));
  }

  private sellAll(lines: Line[]): void {
    lines.forEach((l, i) => window.setTimeout(() => this.host.sell(l.item, l.n), i * GAP_MS));
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
    body.append(el('p', 'fm-fine', 'Лишние ресурсы можно превратить в опыт фермы. Те, что нужны для улучшений, лучше оставить.'));
    if (!have.length) {
      const empty = body.appendChild(el('div', 'fm-empty'));
      empty.append(resIcon('root', 'fm-ico xl'), el('p', '', 'Кладовая пуста. Ресурсы падают при сборе урожая.'));
      return;
    }
    let xp = 0;
    const totalEl = el('b', 'fm-xp-total');
    const goBtn = btn('fm-go', 'Превратить в опыт');
    const refreshTotal = (): void => {
      xp = RESOURCES.reduce((a, r) => a + (this.sel[r.id] ?? 0) * r.xp, 0);
      totalEl.textContent = `+${xp} XP`;
      goBtn.disabled = xp <= 0;
    };
    for (const r of have) {
      const n = f.cellar[r.id] ?? 0;
      this.sel[r.id] = Math.min(this.sel[r.id] ?? 0, n);
      const free = Math.max(0, n - (need[r.id] ?? 0));
      const row = body.appendChild(el('div', 'fm-row'));
      row.append(resIcon(r.id, 'fm-ico lg'));
      const main = row.appendChild(el('div', 'fm-row-main'));
      main.append(el('b', '', `${r.name} × ${n}`));
      main.append(el('small', '', `${r.xp} XP за штуку${need[r.id] ? ` · нужно на ${why[r.id]}: ${need[r.id]}` : ''}`));
      const step = row.appendChild(el('div', 'fm-step'));
      const val = el('b', 'fm-step-n', String(this.sel[r.id]));
      const set = (v: number): void => {
        this.sel[r.id] = Math.max(0, Math.min(n, v));
        val.textContent = String(this.sel[r.id]);
        refreshTotal();
      };
      step.append(btn('fm-sq', '−', () => set((this.sel[r.id] ?? 0) - 1)), val, btn('fm-sq', '+', () => set((this.sel[r.id] ?? 0) + 1)));
      const freeBtn = btn('fm-btn', `Свободное · ${free}`, () => set(free));
      freeBtn.disabled = free <= 0;
      freeBtn.title = 'Всё, что не нужно на ближайшие улучшения';
      row.append(freeBtn);
    }
    const foot = body.appendChild(el('div', 'fm-foot'));
    foot.append(el('span', 'fm-foot-l', 'Итог:'), totalEl);
    foot.append(btn('fm-btn', 'Отменить', () => { this.sel = {}; this.refresh(); }));
    goBtn.addEventListener('click', () => this.convertAll());
    foot.append(goBtn);
    refreshTotal();
  }

  private convertAll(): void {
    const list = Object.entries(this.sel).filter(([, n]) => n > 0);
    this.sel = {};
    list.forEach(([res, n], i) => window.setTimeout(() => this.host.send({ t: 'farm', a: 'convert', res, n }), i * GAP_MS));
    this.refresh();
  }
}
