// Окно «Заказы» (lab/ui/screens/farm.js «Заказы: Фургон и доска заказов в одном окне»): две вкладки, открывается от Фургона
// или от доски сразу на нужной. «Фургон» — время приезда/отъезда, ящики-карточки: сколько нужно,
// сколько в сумке, текущая выплата и разница с Грибом; почему нельзя — отдельной строкой; закрытые слоты
// с причиной. «Доска заказов» — три личные карточки: цель, прогресс, награда, «Забрать», «Заменить». Ящики и замки приходят
// от сервера (farmVan, shared/farmsys.ts), заказы лежат в профиле (FarmProgress.orders); решает сервер.
import { farmLevel, type FarmOrder } from '../../../shared/farm.ts';
import { ORDER_TEMPLATES, REP_LEVELS, TRUFFLE, VAN_MAX_SLOTS, VAN_SLOTS_BY_LEVEL, cropById, type OrderKind } from '../../../shared/farmdata.ts';
import { orderReady, ordersResetAt } from '../../../shared/farmorders.ts';
import { vanTime, type VanOffer } from '../../../shared/farmvan.ts';
import { C, FarmWin, clockHour, fi, fmtLeft, meter, mskHour, ui } from './common.ts';
import { priceNumber, vanPayment } from './price-model.ts';

const KIND: Record<OrderKind, [label: string, icon: string]> = {
  grow: ['Вырасти', 'wheat'],
  help: ['Помоги соседям', 'help-hands'],
  van: ['Фургон', 'van'],
  special: ['Особый', 'star'],
};

/** Цель словами: шаблон с подставленным числом, а для заказа на конкретную культуру — «Собрать 6 × Тыква» */
function goal(o: FarmOrder, goalText: string): string {
  const c = o.crop ? cropById(o.crop) : undefined;
  if (c) return `Собрать ${o.need} × ${c.product}`;
  const text = goalText.replace(/\bN\b/g, String(o.need));
  return /^\d/.test(text) ? `Нужно: ${text}` : text.replace(/^./, (ch) => ch.toUpperCase());
}

/** Чем откроется слот i, если сервер ещё не прислал замок: первые три — уровнем, остальные — репутацией 2, 4, 6 */
function slotWhy(i: number): string {
  if (i < VAN_SLOTS_BY_LEVEL.length) return `ур. ${VAN_SLOTS_BY_LEVEL[i].level}`;
  const rep = REP_LEVELS.filter((r) => r.vanSlot)[i - VAN_SLOTS_BY_LEVEL.length];
  return rep ? `репутации ${rep.level}` : 'позже';
}

export class OrdersWin extends FarmWin {
  protected firstTab(): string {
    return 'van';
  }

  protected draw(body: HTMLElement): void {
    const f = this.host.f;
    const now = this.host.now;
    const t = vanTime(now);
    const ready = f.orders.list.filter((o) => !o.done && orderReady(f, o, now)).length;
    if (this.tab !== 'board') this.tab = 'van';
    this.setHead({ portrait: this.tab === 'van' ? 'van' : 'ui:scroll' });
    this.setTabs([
      { id: 'van', icon: fi('van'), label: 'Фургон', after: t.open ? ` <span class="k-pill k-pill--good k-pill--sm">здесь до ${clockHour(mskHour(t.next))}</span>` : ` <span class="k-pill k-pill--sm">в ${clockHour(mskHour(t.next))}</span>` },
      { id: 'board', icon: ui('scroll'), label: 'Доска заказов', count: ready ? `${ready} ${ready === 1 ? 'готов' : 'готово'}` : undefined },
    ]);
    if (this.tab === 'board') this.drawBoard(body);
    else this.drawVan(body);
  }

  // ------------------------------------------------------------ Фургон

  private cratePay(offer: VanOffer): string {
    const pay = vanPayment(this.host.f, offer, this.host.now);
    const more = pay.extra === 0 ? 'Как у Гриба' : `${C()}${Math.abs(pay.extra)} ${pay.extra > 0 ? 'больше' : 'меньше'} Гриба`;
    return `<span class="k-pill k-pill--info k-pill--sm">${more}</span><span class="k-gold"><b>${C()}${pay.coins}</b> за ящик · +${offer.xp} опыта</span><span class="k-dim">${C()}${priceNumber(pay.unit)} за штуку сейчас</span>`;
  }

  private crate(i: number, level: number): string {
    const f = this.host.f;
    const view = this.host.van();
    const open = vanTime(this.host.now).open;
    const slot = view?.slots[i];
    const n = `Слот ${i + 1}${i === 0 ? ' · ходовой' : i === 2 ? ' · дорогой' : ''}`;
    if (slot?.lock || (!slot && level < VAN_SLOTS_BY_LEVEL[0].level)) {
      const lock = slot?.lock;
      const why = lock && (lock.level || lock.rep)
        ? [lock.level ? `ур. ${lock.level}` : '', lock.rep ? `репутации ${lock.rep}` : ''].filter(Boolean).join(' или ')
        : slotWhy(i);
      return `<div class="k-cell farm-crate is-locked"><p class="k-eyebrow">Слот ${i + 1}</p>${ui('lock', 'farm-crate-ic')}<div class="farm-why k-dim">Откроется на ${why || 'позже'}</div></div>`;
    }
    const offer = slot?.offer;
    if (!offer) {
      return `<div class="k-cell farm-crate is-locked"><p class="k-eyebrow">${n}</p>${fi('van', 'farm-crate-ic')}<div class="farm-why k-dim">${view ? 'Для этого слота ящика нет' : 'Ждём предложения Фургона…'}</div></div>`;
    }
    const c = cropById(offer.item);
    const have = f.bag[offer.item] ?? 0;
    const lack = offer.n - have;
    const ok = lack <= 0;
    const name = offer.item === TRUFFLE ? 'Трюфель' : (c?.product ?? offer.item);
    let action: string;
    if (slot?.done) action = '<span class="k-pill k-pill--good farm-done">Сдано ✓</span>';
    else if (!open) action = `<div class="farm-why k-dim">Фургон уехал — вернётся в ${clockHour(mskHour(vanTime(this.host.now).next))}</div><button class="k-btn k-btn--ghost k-btn--wide" type="button" disabled>Сдать ящик</button>`;
    else if (!ok) action = `<div class="farm-why k-bad">Не хватает ${lack} · вырасти до ${clockHour(mskHour(vanTime(this.host.now).next))}</div><button class="k-btn k-btn--ghost k-btn--wide" type="button" disabled>Сдать ящик</button>`;
    else action = `<button class="k-btn k-btn--go k-btn--wide" type="button" data-van="${i}" data-sfx="reward">Сдать ящик</button>`;
    return `
      <div class="k-cell farm-crate${ok && open && !slot?.done ? ' is-ready' : ''}">
        <p class="k-eyebrow">${n}${offer.kind === 'gourmet' ? ' · гурман' : ''}</p>
        ${fi(offer.item === TRUFFLE ? 'truffle' : (c?.icon ?? ''), 'farm-crate-ic')}
        <div class="farm-crate-t">${name} <b>× ${offer.n}</b></div>
        ${meter(Math.min(1, have / offer.n), ok ? 'k-meter--good k-meter--lg' : 'k-meter--lg', `в сумке ${Math.min(have, 999)} из ${offer.n}`)}
        <div class="farm-crate-pay" data-van-price="${i}">${this.cratePay(offer)}</div>
        ${action}
      </div>`;
  }

  private drawVan(body: HTMLElement): void {
    const f = this.host.f;
    const now = this.host.now;
    const level = farmLevel(f.xp);
    const t = vanTime(now);
    const crates = Array.from({ length: VAN_MAX_SLOTS }, (_, i) => this.crate(i, level)).join('');
    body.innerHTML = `
      <div class="farm-pane">
        <div class="k-cell farm-vanbar">
          ${fi('van', 'farm-vanbar-ic')}
          <div><div class="farm-vanbar-t" data-live="status"></div><div class="k-dim">${level < VAN_SLOTS_BY_LEVEL[0].level ? `Фургон начнёт брать ящики с ${VAN_SLOTS_BY_LEVEL[0].level} уровня фермы.` : 'Сдай ящик целиком из сумки — получишь жетоны и опыт. Не успел — урожай останется у тебя.'}</div></div>
          <div class="farm-vanbar-timer"><b class="${t.open ? 'k-gold' : 'k-dim'}" data-live="timer"></b></div>
        </div>
        <div class="farm-crates">${crates}</div>
      </div>`;
    this.live('[data-live=status]', () => {
      const v = vanTime(this.host.now);
      const h = clockHour(mskHour(v.next));
      return v.open ? `Фургон приехал — уедет в ${h}` : `Фургон уехал — приедет в ${h}`;
    });
    this.live('[data-live=timer]', () => fmtLeft(vanTime(this.host.now).next - this.host.now));
    for (const slot of this.host.van()?.slots ?? []) if (slot.offer) {
      const offer = slot.offer;
      this.live(`[data-van-price="${slot.i}"]`, () => this.cratePay(offer));
    }
    this.onClick('[data-van]', (b) => this.host.send({ t: 'farm', a: 'van', slot: Number(b.dataset.van) }));
  }

  // ------------------------------------------------------------ доска

  private drawBoard(body: HTMLElement): void {
    const f = this.host.f;
    const list = f.orders.list;
    const left = Math.max(0, f.orders.rerolls);
    const cards = list.map((o, i) => {
      const t = ORDER_TEMPLATES.find((x) => x.id === o.t);
      if (!t) return '';
      const ok = !o.done && orderReady(f, o, this.host.now);
      const [label, icon] = KIND[t.kind];
      const c = o.crop ? cropById(o.crop) : undefined;
      const tone = o.done || ok ? 'k-meter--good k-meter--lg' : 'k-meter--mode k-meter--lg';
      return `
        <div class="k-cell farm-order${ok ? ' is-ready' : ''}${o.done ? ' is-done' : ''}">
          <p class="k-eyebrow farm-order-kind">${fi(c?.icon ?? icon)}${label}</p>
          <div class="farm-order-name">${t.name}</div>
          <div class="farm-order-goal">${goal(o, t.goal)}</div>
          ${meter(Math.min(1, o.got / o.need), tone, o.done ? 'награда получена' : `${Math.min(o.got, o.need)} из ${o.need}`)}
          <div class="farm-order-pay"><span class="k-gold"><b>${C()}${t.coins}</b></span><span class="k-gold">+${t.xp} опыта</span>${t.rep ? `<span class="k-good">+${t.rep} репутации</span>` : ''}</div>
          <div class="farm-order-btns">${o.done ? '<span class="k-pill k-pill--good k-pill--sm">получено ✓</span>' : `${ok ? `<button class="k-btn k-btn--go" type="button" data-claim="${i}" data-sfx="reward">Забрать</button>` : ''}<button class="k-btn k-btn--ghost k-btn--sm" type="button" data-reroll="${i}"${left <= 0 ? ' disabled' : ''}>Заменить<small>осталось ${left}</small></button>`}</div>
        </div>`;
    }).join('');
    body.innerHTML = `
      <div class="farm-pane">
        ${list.length ? `<div class="farm-orders">${cards}</div>` : `<div class="farm-empty">${ui('scroll', 'farm-empty-ic')}<p class="farm-lead k-dim">Сегодняшние заказы ещё не выданы. Загляни чуть позже.</p></div>`}
        <p class="farm-lead k-dim">Засчитывается то, что сделано после выдачи заказа. Новые заказы — через <b data-live="reset"></b>, в 00:00.</p>
      </div>`;
    this.live('[data-live=reset]', () => fmtLeft(ordersResetAt(this.host.now) - this.host.now));
    this.onClick('[data-claim]', (b) => this.host.send({ t: 'farm', a: 'order', k: 'claim', i: Number(b.dataset.claim) }));
    this.onClick('[data-reroll]', (b) => this.host.send({ t: 'farm', a: 'order', k: 'reroll', i: Number(b.dataset.reroll) }));
  }
}
