// Доска заказов (design-v11 §10.3, §14.2): три личные карточки — цель, прогресс, награда, «Забрать», «Заменить (осталось 2)»,
// внизу «Новые заказы через 5 ч 12 мин». Заказы лежат в профиле (FarmProgress.orders); выдаёт и проверяет их сервер (B1).
import type { FarmOrder } from '../../../shared/farm.ts';
import { ORDER_TEMPLATES, cropById, type OrderKind } from '../../../shared/farmdata.ts';
import { orderReady, ordersResetAt } from '../../../shared/farmorders.ts';
import { FarmWin, btn, el, fmtLeft, icon } from './common.ts';

const KIND: Record<OrderKind, [label: string, emoji: string]> = {
  grow: ['Вырасти', '🌱'],
  help: ['Помоги соседям', '🤝'],
  van: ['Фургон', '🚚'],
  special: ['Особый', '⭐'],
};

/** Цель словами: шаблон с подставленным числом, а для заказа на конкретную культуру — «Собрать 6 × Тыква» */
function goal(o: FarmOrder, goalText: string): string {
  const c = o.crop ? cropById(o.crop) : undefined;
  if (c) return `Собрать ${o.need} × ${c.product}`;
  const text = goalText.replace(/\bN\b/g, String(o.need));
  return /^\d/.test(text) ? `Нужно: ${text}` : text.replace(/^./, (ch) => ch.toUpperCase());
}

export class OrdersWin extends FarmWin {
  protected draw(body: HTMLElement): void {
    const f = this.host.f;
    const list = f.orders.list;
    if (!list.length) {
      const empty = body.appendChild(el('div', 'fm-empty'));
      empty.append(el('div', 'fm-ico xl emo', '📋'), el('p', '', 'Сегодняшние заказы ещё не выданы. Загляни чуть позже.'));
    }
    const left = Math.max(0, f.orders.rerolls);
    const grid = body.appendChild(el('div', 'fm-orders'));
    list.forEach((o, i) => {
      const t = ORDER_TEMPLATES.find((x) => x.id === o.t);
      if (!t) return;
      const ready = orderReady(f, o, this.host.now);
      const card = grid.appendChild(el('article', `fm-order${o.done ? ' done' : ''}${ready ? ' ready' : ''}`));
      const [label, emoji] = KIND[t.kind];
      const top = card.appendChild(el('div', 'fm-order-top'));
      top.append(el('span', 'fm-order-kind', `${emoji} ${label}`), el('b', '', t.name));
      const c = o.crop ? cropById(o.crop) : undefined;
      card.append(el('p', 'fm-order-goal', goal(o, t.goal)));
      if (c) card.append(icon(c.icon, '🌱', 'fm-ico lg'));
      const bar = card.appendChild(el('div', 'fm-bar'));
      const fill = el('i');
      fill.style.width = `${Math.min(100, (o.got / o.need) * 100)}%`;
      bar.append(fill);
      card.append(el('small', 'fm-order-prog', o.done ? 'Награда получена ✓' : `${Math.min(o.got, o.need)} из ${o.need}`));
      card.append(el('div', 'fm-order-reward', `+${t.coins} 🪙 · +${t.xp} XP${t.rep ? ` · +${t.rep} репутации` : ''}`));
      const acts = card.appendChild(el('div', 'fm-order-acts'));
      if (o.done) acts.append(el('span', 'fm-done', 'Забрано'));
      else {
        const take = btn('fm-go', 'Забрать', () => this.host.send({ t: 'farm', a: 'order', k: 'claim', i }));
        take.disabled = !ready;
        take.title = ready ? 'Получить награду' : 'Заказ ещё не выполнен';
        const swap = btn('fm-btn', `Заменить (осталось ${left})`, () => this.host.send({ t: 'farm', a: 'order', k: 'reroll', i }));
        swap.disabled = left <= 0;
        swap.title = left > 0 ? 'Взять другой заказ вместо этого — прогресс других не сбросится' : 'Бесплатные замены на сегодня закончились';
        acts.append(take, swap);
      }
    });
    const foot = body.appendChild(el('p', 'fm-fine fm-center'));
    this.live(foot, () => `Новые заказы через ${fmtLeft(ordersResetAt(this.host.now) - this.host.now)} · в 00:00 по Москве`);
    body.append(el('p', 'fm-fine fm-center', 'Засчитывается только то, что сделано после выдачи заказа.'));
  }
}
