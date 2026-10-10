// Окно Фургона (design-v11 §10.2, §14.2): шапка «Открыт · до 15:00» / «Закрыт · откроется в 16:00», полоска дневного
// потолка, ящики-карточки (иконка, «нужно 18 · в сумке 12», «×1,4 → 112 🪙 + 30 XP», «Сдать 18») и закрытые слоты с
// причиной («ур. 5», «репутация 4»). Ящики и замки приходят от сервера (farmVan, shared/farmsys.ts); часы Фургона считаем сами.
import { farmLevel } from '../../../shared/farm.ts';
import { REP_LEVELS, TRUFFLE, VAN_MAX_SLOTS, VAN_SLOTS_BY_LEVEL, cropById } from '../../../shared/farmdata.ts';
import { vanTime } from '../../../shared/farmvan.ts';
import { FarmWin, btn, capBar, clockHour, dec, el, fmtLeft, icon, mskHour } from './common.ts';

/** Чем откроется слот i, если сервер ещё не прислал замок: первые три — уровнем, остальные — репутацией 2, 4, 6 */
function slotWhy(i: number): string {
  if (i < VAN_SLOTS_BY_LEVEL.length) return `ур. ${VAN_SLOTS_BY_LEVEL[i].level}`;
  const rep = REP_LEVELS.filter((r) => r.vanSlot)[i - VAN_SLOTS_BY_LEVEL.length];
  return rep ? `репутация ${rep.level}` : 'позже';
}

export class VanWin extends FarmWin {
  protected draw(body: HTMLElement): void {
    const f = this.host.f;
    const now = this.host.now;
    const level = farmLevel(f.xp);
    const view = this.host.van();
    const open = vanTime(now).open;

    const status = body.appendChild(el('div', `fm-van-status${open ? ' open' : ''}`));
    status.append(el('span', 'fm-van-dot'));
    const text = status.appendChild(el('b'));
    const sub = status.appendChild(el('small'));
    this.live(text, () => {
      const t = vanTime(this.host.now);
      const h = clockHour(mskHour(t.next));
      return t.open ? `Открыт · до ${h}` : `Закрыт · откроется в ${h}`;
    });
    this.live(sub, () => {
      const t = vanTime(this.host.now);
      return `${t.open ? 'уедет' : 'приедет'} через ${fmtLeft(t.next - this.host.now)}`;
    });
    body.append(capBar(f, now));
    if (level < VAN_SLOTS_BY_LEVEL[0].level) body.append(el('p', 'fm-fine', `Фургон начнёт брать ящики с ${VAN_SLOTS_BY_LEVEL[0].level} уровня фермы.`));

    const grid = body.appendChild(el('div', 'fm-van-grid'));
    for (let i = 0; i < VAN_MAX_SLOTS; i++) {
      const slot = view?.slots[i];
      const card = grid.appendChild(el('article', 'fm-box'));
      if (slot?.lock || (!slot && level < VAN_SLOTS_BY_LEVEL[0].level)) {
        const lock = slot?.lock;
        const why = lock && (lock.level || lock.rep)
          ? [lock.level ? `ур. ${lock.level}` : '', lock.rep ? `репутация ${lock.rep}` : ''].filter(Boolean).join(' или ')
          : slotWhy(i);
        card.classList.add('locked');
        card.append(el('div', 'fm-lock', '🔒'), el('b', '', `Слот ${i + 1}`), el('small', '', `откроется: ${why || 'позже'}`));
        continue;
      }
      card.append(el('small', 'fm-box-n', `Слот ${i + 1}${i === 0 ? ' · ходовой' : i === 2 ? ' · дорогой' : ''}`));
      const offer = slot?.offer;
      if (!offer) {
        card.append(icon('', '🚚', 'fm-ico xl'), el('small', '', view ? 'Для этого слота ящика нет' : 'Ждём предложения Фургона…'));
        continue;
      }
      const c = cropById(offer.item);
      const have = f.bag[offer.item] ?? 0;
      card.append(icon(offer.item === TRUFFLE ? 'truffle' : (c?.icon ?? ''), '🌱', 'fm-ico xl'));
      card.append(el('b', '', `${offer.item === TRUFFLE ? 'Трюфель' : (c?.product ?? offer.item)}${offer.kind === 'gourmet' ? ' · гурман' : ''}`));
      card.append(el('span', 'fm-need-line', `Нужно ${offer.n} · в сумке ${have}`));
      card.append(el('span', 'fm-price-line', `×${dec(offer.mult)} → ${offer.coins} 🪙 + ${offer.xp} XP`));
      if (slot?.done) card.append(el('div', 'fm-done', 'Сдано ✓'));
      else {
        const lack = offer.n - have;
        const b = btn('fm-go', lack > 0 ? `Не хватает ${lack}` : `Сдать ${offer.n}`, () => this.host.send({ t: 'farm', a: 'van', slot: i }));
        b.disabled = lack > 0 || !open;
        if (!open) b.title = 'Фургон сейчас закрыт';
        card.append(b);
      }
    }
    body.append(el('p', 'fm-fine', 'Ящик сдаётся целиком из сумки одной кнопкой и платит сразу. Не успел — предложение просто уедет, ничего не теряется.'));
  }
}
