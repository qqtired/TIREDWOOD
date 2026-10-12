// Общая логика выбора семян и названий действий, без DOM.
import { CROPS, type CropDef } from '../../../shared/farmdata.ts';

/** Все открытые культуры в сетке посадки. */
export function beltCrops(level: number): CropDef[] { return CROPS.filter(c => c.level <= level); }

/**
 * «Тыква» → «тыкву», «Редис» → «редис», «Шляпка гриба» → «шляпку гриба»: винительный падеж для «Посадить …» / «Собрать …».
 * Прилагательные женского рода («Мифическая») склоняем, первое существительное — тоже, дальше идёт родительный («гриба») — не трогаем.
 */
export function accusative(name: string): string {
  const out: string[] = [];
  let noun = false;
  for (const raw of name.toLowerCase().split(' ')) {
    let w = raw;
    if (!noun) {
      if (w.endsWith('ая')) w = `${w.slice(0, -2)}ую`;
      else if (w.endsWith('яя')) w = `${w.slice(0, -2)}юю`;
      else {
        noun = true;
        if (w.endsWith('а')) w = `${w.slice(0, -1)}у`;
        else if (w.endsWith('я')) w = `${w.slice(0, -1)}ю`;
      }
    }
    out.push(w);
  }
  return out.join(' ');
}

/** Сколько заплатим: первая посадка культуры бесплатна для одной грядки, остальные — по цене (как shared/farm.ts plant) */
export function plantCost(seed: number, beds: number, firstFree: boolean): number {
  return Math.max(0, seed * beds - (firstFree ? seed : 0));
}
