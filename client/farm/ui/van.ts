// Окно Фургона (design-v11 §10.2, §14.2): шапка «Открыт · до 15:00» / «Закрыт · откроется в 16:00», полоска дневного
// потолка, ящики-карточки (иконка, «нужно 18 · в сумке 12», «×1,4 → 112 🪙 + 30 XP», «Сдать 18») и закрытые слоты с
// причиной («ур. 5», «репутация 4»). Ящики приходят от части B1 (сообщение Фургона, см. ui/sys.ts) — пока их нет, слоты
// видны, а вместо ящиков — «предложение ещё не пришло». Слоты по уровню и репутации считаем сами (константы farmdata).
import { farmLevel, repLevel } from '../../../shared/farm.ts';
import { REP_LEVELS, VAN_MAX_SLOTS, VAN_SLOTS_BY_LEVEL, cropById } from '../../../shared/farmdata.ts';
import { FarmWin, btn, capBar, clockHour, dec, el, icon, mskHour, msToNextHour, fmtLeft } from './common.ts';

interface Unlock {
  text: string;
  ok: boolean;
}

/** Условия по порядку получения слотов: по уровню фермы и по репутации (design-v11 §10.2) */
function unlocks(level: number, rep: number): Unlock[] {
  const list: Unlock[] = [];
  for (const v of VAN_SLOTS_BY_LEVEL) list.push({ text: `ур. ${v.level}`, ok: level >= v.level });
  for (const r of REP_LEVELS) if (r.vanSlot) list.push({ text: `репутация ${r.level}`, ok: rep >= r.level });
  return list.slice(0, VAN_MAX_SLOTS);
}

export class VanWin extends FarmWin {
  protected draw(body: HTMLElement): void {
    const f = this.host.f;
    const now = this.host.now;
    const level = farmLevel(f.xp);
    const u = unlocks(level, repLevel(f.rep));
    const open = mskHour(now) % 2 === 0;
    const state = this.host.van();

    const status = body.appendChild(el('div', `fm-van-status${open ? ' open' : ''}`));
    status.append(el('span', 'fm-van-dot'));
    const text = status.appendChild(el('b'));
    const sub = status.appendChild(el('small'));
    this.live(text, () => (mskHour(this.host.now) % 2 === 0 ? `Открыт · до ${clockHour(mskHour(this.host.now) + 1)}` : `Закрыт · откроется в ${clockHour(mskHour(this.host.now) + 1)}`));
    this.live(sub, () => `${mskHour(this.host.now) % 2 === 0 ? 'уедет' : 'приедет'} через ${fmtLeft(msToNextHour(this.host.now))}`);
    body.append(capBar(f, now));

    if (level < VAN_SLOTS_BY_LEVEL[0].level) {
      body.append(el('p', 'fm-fine', `Фургон начнёт брать ящики с ${VAN_SLOTS_BY_LEVEL[0].level} уровня фермы.`));
    }
    const grid = body.appendChild(el('div', 'fm-van-grid'));
    const have = u.filter((x) => x.ok).length;
    for (let slot = 0; slot < VAN_MAX_SLOTS; slot++) {
      const card = grid.appendChild(el('article', 'fm-box'));
      if (slot >= have) {
        card.classList.add('locked');
        const why = u.filter((x) => !x.ok)[slot - have]?.text ?? 'позже';
        card.append(el('div', 'fm-lock', '🔒'), el('b', '', `Слот ${slot + 1}`), el('small', '', `откроется: ${why}`));
        continue;
      }
      const offer = state?.offers.find((o) => o.slot === slot);
      const done = state !== null && f.van.cycle === state.cycle && f.van.done.includes(slot);
      card.append(el('small', 'fm-box-n', `Слот ${slot + 1}${slot === 0 ? ' · ходовой' : slot === 2 ? ' · дорогой' : ''}`));
      if (!offer) {
        card.append(icon('', '🚚', 'fm-ico xl'), el('small', '', open ? 'Предложение ещё не пришло' : 'Предложение придёт, когда Фургон подъедет'));
        continue;
      }
      const c = cropById(offer.crop);
      const bagN = c ? (f.bag[c.id] ?? 0) : (f.bag[offer.crop] ?? 0);
      card.append(icon(c?.icon ?? 'truffle', '🌱', 'fm-ico xl'));
      card.append(el('b', '', `${c?.product ?? 'Трюфель'}${offer.gourmet ? ' · гурман' : ''}`));
      card.append(el('span', 'fm-need-line', `Нужно ${offer.n} · в сумке ${bagN}`));
      card.append(el('span', 'fm-price-line', `×${dec(offer.mult)} → ${offer.coins} 🪙 + ${offer.xp} XP`));
      if (done) card.append(el('div', 'fm-done', 'Сдано ✓'));
      else {
        const lack = offer.n - bagN;
        const b = btn('fm-go', lack > 0 ? `Не хватает ${lack}` : `Сдать ${offer.n}`, () => this.host.send({ t: 'farm', a: 'van', slot }));
        b.disabled = lack > 0 || !open;
        if (!open) b.title = 'Фургон сейчас закрыт';
        card.append(b);
      }
    }
    body.append(el('p', 'fm-fine', 'Ящик сдаётся целиком из сумки одной кнопкой и платит сразу. Не успел — предложение просто уедет, ничего не теряется.'));
  }
}
