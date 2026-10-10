// Лайвел на сервере (флаг ISLE, shared/fishlivewell.ts): продажа улова скупщикам и «Продать улов» из меню своей лодки. Кнопку
// в меню лодки ставит пакет лодок (server/lobby/ownboats.ts) — он проверяет, что лодка стоит у стоянки или у причала острова, и
// зовёт sellFromBoat. Цены — зафиксированные при поимке (bag.p), жетоны — сразу, общий опыт дан при поимке.
import { catchValue, livewellOf, type SellWhat } from '../../shared/fishlivewell.ts';
import type { Profiles } from '../profiles.ts';
import type { Profile } from '../store.ts';

export interface SellResult {
  /** Сколько рыб продано и за сколько жетонов */
  n: number;
  coins: number;
  /** Строка для окна или тоста: «Продано рыб: 12, +480 🪙» / «Лайвел пуст» */
  message: string;
}

const EMPTY: Record<SellWhat, string> = { bag: 'Рюкзак пуст', well: 'Лайвел пуст', all: 'Продавать нечего: рюкзак и лайвел пусты' };

/** Продать улов: рюкзак, лайвел или всё (жетоны — сразу, по цене поимки) */
export function sellCatch(profiles: Profiles, p: Profile, what: SellWhat = 'all'): SellResult {
  const sold = profiles.sellFish(p, undefined, what);
  if (sold.n === 0) return { ...sold, message: EMPTY[what] };
  return { ...sold, message: `Продано рыб: ${sold.n}, +${sold.coins} 🪙` };
}

/**
 * «Продать улов» в меню своей лодки (пакет лодок): весь улов — и рюкзак, и лайвел. Где лодка стоит (у стоянки или у причала
 * острова) — проверяет вызывающий.
 */
export function sellFromBoat(profiles: Profiles, p: Profile): SellResult {
  return sellCatch(profiles, p, 'all');
}

/** Есть ли что продать из лодки (кнопка «Продать улов» активна) и за сколько */
export function boatCatch(p: Profile): { n: number; coins: number } {
  return { n: p.fishing.bag.length + livewellOf(p.fishing).length, coins: catchValue(p.fishing, 'all') };
}
