// Рекорд крепости: тосты и баннер (верх-центр кита). При входе — тост «Рекорд: 47 волн — ники · Твой рекорд: 12»,
// рекордная волна — тост, рекорд повторён — тост, побит — крупный золотой баннер всем, свой рекорд — тост себе.
// Плитка рекорда под бейджем — ui/tiles.ts. Без DOM: match.ts берёт отсюда тексты, а его грузят тесты.
import { namesLine, recWhen, wavesText, type FortRecIntro, type FortRecKind } from '../../../shared/fortrecord.ts';
import { PRIO } from '../../ui/kit/topcenter.ts';
import type { BannerSpec } from './banners.ts';

/** При входе в крепость: «Рекорд: 47 волн — ники» и «Твой рекорд: 12» */
export function introBanner(r: FortRecIntro, now: number): BannerSpec {
  const mine = Math.max(r.best, r.my);
  const mineText = `твой рекорд: ${mine > 0 ? wavesText(mine) : 'пока нет'}`;
  const base = { key: 'rec-intro', icon: 'records', tone: 'reward', ms: 6500 } as const;
  if (!r.top) return { ...base, title: 'Рекордов ещё нет', sub: 'отбей первую волну — рекорд ваш' };
  if (r.top.live) {
    return { ...base, title: `Рекорд бьют прямо сейчас: ${wavesText(r.top.wave)}!`, sub: `${r.base > 0 ? `прежний — ${r.base} · ` : ''}${mineText}` };
  }
  const when = recWhen(r.top.at, now);
  return { ...base, title: `Рекорд: ${wavesText(r.top.wave)} — ${namesLine(r.top.names)}`, sub: `${mineText}${when ? ` · поставлен ${when}` : ''}` };
}

/** Рекордная волна началась */
export function hotBanner(wave: number): BannerSpec {
  return { key: 'rec-hot', icon: 'records', tone: 'reward', ms: 4200, title: 'Рекордная волна!', sub: `отбейте ${wave}-ю — и рекорд крепости ваш` };
}

/** Событие рекорда после отбитой волны: побит (всем — крупно), повторён, свой */
export function eventBanner(k: FortRecKind, wave: number, prev: number): BannerSpec {
  if (k === 'team') {
    return { key: 'rec', hero: true, tone: 'gold', prio: PRIO.mode, ms: 4200, title: 'Новый рекорд крепости!', sub: `${wavesText(wave)} — прежний рекорд ${prev}` };
  }
  if (k === 'tie') return { key: 'rec', icon: 'records', tone: 'reward', ms: 4200, title: 'Рекорд повторён!', sub: `${wavesText(wave)} — ещё одна волна, и рекорд ваш` };
  return { key: 'rec-me', icon: 'level', tone: 'reward', ms: 4000, title: 'Твой новый рекорд!', sub: `${wavesText(wave)} — было ${prev}` };
}
