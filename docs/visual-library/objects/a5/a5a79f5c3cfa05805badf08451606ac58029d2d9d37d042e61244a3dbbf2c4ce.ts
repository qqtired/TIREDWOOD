// Уведомления сверху по центру: бонус, покупка, «автомат занят». Тают сами. Рисует верх-центр кита
// (client/ui/kit/topcenter.ts — .k-toast под плашкой события, не больше трёх); здесь — прежний API для режимов и сервера.
import { uiIcon } from './kit/icons.ts';
import { toastLead } from './toastlead.ts';
import type { TcToast, TopCenter } from './kit/topcenter.ts';
import './toastbig.css';

/** Вид уведомления по ключу */
const BY_KEY: Record<string, Pick<TcToast, 'tone' | 'icon'>> = {
  'level-up': { tone: 'reward', icon: 'level' },
  'fish-level': { tone: 'reward', icon: 'level' },
  link: { tone: 'good', icon: 'online' },
  mute: { tone: 'info', icon: 'sound' },
  'fish-event': { tone: 'info', icon: 'rain' },
};

export class Toasts {
  private readonly top: TopCenter;

  constructor(top: TopCenter) {
    this.top = top;
  }

  /**
   * key — вид уведомления: новое заменяет прежнее такого же вида, а не встаёт в стопку (M жмут подряд);
   * sub — вторая строка помельче (заголовок + коротко «что это даёт», как у рыболовного события);
   * big — крупный золотой тост для редкого события на весь сервер (клад Посейдона)
   */
  show(text: string, ms = 3800, key = '', sub = '', big = false): void {
    const kind = BY_KEY[key];
    // начальный эмодзи → картинка (вид по ключу важнее); сам эмодзи из текста — прочь
    const lead = toastLead(text);
    const title = lead.title;
    let icon = kind?.icon || lead.icon;
    // «+N 🪙» — награда золотом
    const reward = big || /(^|\s)\+\d[\d\s]*\s*🪙/u.test(text);
    if (!icon) icon = reward ? 'token' : 'bell';
    this.top.toast({ key: key || undefined, tone: kind?.tone ?? (reward ? 'reward' : 'info'), icon: uiIcon(icon), title, sub: sub || undefined, life: ms });
  }

  clear(): void {
    this.top.clearToasts();
  }
}
