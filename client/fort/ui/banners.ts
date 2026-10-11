// Сообщения «Крепости» — через верх-центр кита (client/ui/kit/topcenter.ts), без своего места на экране: важное
// (старт волны, босс повержен, ворота пали, новый рекорд) — крупным баннером по центру (hero), остальное — тостом
// под плашкой волны (не больше трёх). Сообщения пейнтбольного интерфейса (centerMessage, bannerMessage) в крепости
// приходят сюда же; ленты сбитых в крепости нет — сбитых видно по тостам и точкам команды.
import type { Hud } from '../../paintball/hud.ts';
import { PRIO, type TcHero, type TopCenter } from '../../ui/kit/topcenter.ts';
import { fortIcon } from './icons.ts';
import { alarmText, type ToastTone } from './text.ts';

/** Баннер по центру живёт не дольше своей анимации (kit.css .k-hero.is-play — 3,2 с) */
const HERO_MS = 3300;

export interface BannerSpec {
  /** Тот же ключ — заменить прежний */
  key?: string;
  title: string;
  sub?: string;
  /** Сколько висит, мс */
  ms?: number;
  /** Крупно по центру (иначе — тост) */
  hero?: boolean;
  /** Тон: у баннера — gold | win | lose | info, у тоста — info | reward | warn | good */
  tone?: string;
  /** Картинка тоста (id иконки) */
  icon?: string;
  /** Важность баннера (PRIO): менее важный не перебивает более важный */
  prio?: number;
}

export class FortBanners {
  private readonly top: TopCenter;
  /** Повален: мелкие подтверждения молчат (на экране «Тебя повалили!») */
  quiet = false;
  /** Ключ последнего крупного баннера (убрать при уходе) */
  private heroKey = '';

  constructor(top: TopCenter) {
    this.top = top;
  }

  /** Перехватить сообщения пейнтбольного интерфейса (центр и мелкие плашки) */
  adopt(pb: Hud): void {
    pb.centerMessage = (text: string, sub = '', color = '', ms = 1800) => {
      // красный центр (ворота пали) — крупно; остальное (название режима) — тостом
      if (color) this.push({ key: `c-${text}`, hero: true, tone: 'lose', prio: PRIO.boss, title: text, sub, ms: Math.max(2600, ms) });
      else this.push({ key: `c-${text}`, icon: 'bell', tone: 'info', title: text, sub, ms: Math.max(3000, ms) });
    };
    pb.bannerMessage = (html: string, ms = 1600) => {
      if (this.quiet) return;
      const a = alarmText(html, 'level');
      const tone: ToastTone = a.icon === 'brute' || a.icon === 'champion' || a.icon === 'kraken' ? 'reward' : a.icon === 'hammer' || a.icon === 'gate' ? 'good' : 'info';
      this.push({ key: `b-${a.title}`, icon: a.icon, tone, title: a.title, sub: a.sub, ms: Math.max(2400, ms) });
    };
    pb.killfeed = () => {};
  }

  push(s: BannerSpec): void {
    if (s.hero) {
      this.heroKey = s.key ?? s.title;
      this.top.hero({ key: s.key ?? s.title, prio: s.prio ?? PRIO.info, tone: (s.tone ?? 'gold') as TcHero['tone'], title: s.title, sub: s.sub, life: Math.min(s.ms ?? HERO_MS, HERO_MS) });
      return;
    }
    this.top.toast({ key: s.key, tone: (s.tone ?? 'info') as ToastTone, icon: fortIcon(s.icon ?? 'warn'), title: s.title, sub: s.sub || undefined, life: s.ms });
  }

  /** Убрать баннер этого вида (устарел: «рекордная волна» после побитого рекорда) */
  drop(key: string): void {
    this.top.clearHero(key);
  }

  /** Ушли из крепости: баннер и тосты — прочь */
  dropAll(): void {
    if (this.heroKey) this.top.clearHero(this.heroKey);
    this.heroKey = '';
    this.top.clearToasts();
  }
}
