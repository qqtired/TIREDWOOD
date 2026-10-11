// Уведомления сверху по центру: бонус, покупка, «автомат занят». Тают сами. Рисует верх-центр кита
// (client/ui/kit/topcenter.ts — .k-toast под плашкой события, не больше трёх); здесь — прежний API для режимов и сервера.
import { uiIcon } from './kit/icons.ts';
import type { TcToast, TopCenter } from './kit/topcenter.ts';
import './toastbig.css';

/** Значок в начале текста → картинка кита (эмодзи в строке убираем, иначе он дублирует картинку) */
const LEAD_ICON: Record<string, string> = {
  '🌧': 'rain', '⛈': 'storm', '🏁': 'flag-finish', '🏰': 'shield', '🐀': 'rat', '🎣': 'float', '🃏': 'cards', '🎰': 'roulette',
  '🏴‍☠️': 'pirate-flag', '🔱': 'gold', '🎁': 'gift', '📣': 'horn', '🎵': 'music', '🚤': 'boat', '⛵': 'regatta', '🌱': 'farm-gate',
};
/** Вид уведомления по ключу */
const BY_KEY: Record<string, Pick<TcToast, 'tone' | 'icon'>> = {
  'level-up': { tone: 'reward', icon: 'level' },
  'fish-level': { tone: 'reward', icon: 'level' },
  link: { tone: 'good', icon: 'online' },
  mute: { tone: 'info', icon: 'sound' },
  'fish-event': { tone: 'info', icon: 'rain' },
};
const LEAD_RE = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*/u;

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
    let title = text;
    let icon = kind?.icon ?? '';
    const lead = LEAD_RE.exec(text);
    const leadIcon = lead ? LEAD_ICON[lead[1].replace(/️/g, '')] : undefined;
    if (lead && leadIcon) {
      title = text.slice(lead[0].length);
      icon ||= leadIcon;
    }
    // «+N 🪙» — награда золотом
    const reward = big || /(^|\s)\+\d[\d\s]*\s*🪙/u.test(text);
    if (!icon) icon = reward ? 'token' : 'bell';
    this.top.toast({ key: key || undefined, tone: kind?.tone ?? (reward ? 'reward' : 'info'), icon: uiIcon(icon), title, sub: sub || undefined, life: ms });
  }

  clear(): void {
    this.top.clearToasts();
  }
}
