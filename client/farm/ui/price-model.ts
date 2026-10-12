// Текущие выплаты из серверных правил. Подписи обновляются по времени, не по старой цене предложения.
import { saleUnit, seedPrice, type FarmProgress } from '../../../shared/farm.ts';
import { TUTORIAL_COINS, TUTORIAL_STEPS, TUTORIAL_XP, TRUFFLE, TRUFFLE_PRICE, cropById, type CropDef } from '../../../shared/farmdata.ts';
import type { VanOffer } from '../../../shared/farmvan.ts';

const gribUnit = (f: FarmProgress, item: string, now: number): number => item === TRUFFLE ? TRUFFLE_PRICE : saleUnit(f, cropById(item)!, now);

export function seedPrices(f: FarmProgress, c: CropDef, now: number): { seed: number; sale: number } {
  return { seed: f.firstPlanted.includes(c.id) ? seedPrice(f, c) : 0, sale: saleUnit(f, c, now) };
}
export function gribPayment(f: FarmProgress, item: string, n: number, now: number): number {
  const raw = gribUnit(f, item, now) * n;
  return item === TRUFFLE ? raw : Math.floor(raw + f.sold.frac + 1e-9);
}
export function gribTotal(f: FarmProgress, items: readonly { item: string; n: number }[], now: number): number {
  let crop = 0, truffle = 0;
  for (const row of items) {
    const raw = gribUnit(f, row.item, now) * row.n;
    if (row.item === TRUFFLE) truffle += raw;
    else crop += raw;
  }
  return truffle + (crop > 0 ? Math.floor(crop + f.sold.frac + 1e-9) : 0);
}
export function vanPayment(f: FarmProgress, offer: VanOffer, now: number): { unit: number; coins: number; gribCoins: number; extra: number } {
  const unit = offer.item === TRUFFLE ? TRUFFLE_PRICE * offer.mult : saleUnit(f, cropById(offer.item)!, now, offer.mult);
  const coins = Math.round(unit * offer.n);
  const gribCoins = gribPayment(f, offer.item, offer.n, now);
  return { unit, coins, gribCoins, extra: coins - gribCoins };
}
export function tutorialRewards(paid: number): { steps: number; xp: number; coins: number } {
  return { steps: TUTORIAL_STEPS - paid, xp: TUTORIAL_XP.slice(paid).reduce((a, n) => a + n, 0), coins: paid < TUTORIAL_STEPS ? TUTORIAL_COINS : 0 };
}
export const priceNumber = (n: number): string => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
