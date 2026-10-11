// Пояс семян — логика без DOM (test/farm-ui.test.ts): какие культуры на поясе, окно из 9 ячеек, винительный падеж
// для подсказки «Посадить тыкву». Правила посадки не здесь — они в shared/farm.ts (plant) и на сервере.
import { CROPS, type CropDef } from '../../../shared/farmdata.ts';

/** Ячеек на поясе одновременно: клавиши 1–9 */
export const BELT_SLOTS = 9;

/** Пояс: все открытые культуры и «следующие» — те, что откроются на ближайшем уровне (силуэт с «ур. N») */
export function beltCrops(level: number): CropDef[] {
  return CROPS.filter((c) => c.level <= level + 1);
}

/** С какой культуры показывать окно из BELT_SLOTS: выбранная всегда в окне, окно не прыгает без нужды */
export function beltStart(start: number, sel: number, total: number, size = BELT_SLOTS): number {
  let s = Math.min(start, Math.max(0, total - size));
  if (sel < s) s = sel;
  else if (sel >= s + size) s = sel - size + 1;
  return Math.max(0, Math.min(s, Math.max(0, total - size)));
}

/** Колесо: шаг ±1 по кругу */
export function beltStep(sel: number, dir: number, total: number): number {
  return total <= 0 ? 0 : (sel + (dir > 0 ? 1 : -1) + total) % total;
}

/** Колесо: сколько «пикселей» прокрутки на один шаг и как часто можно шагать (трекпад и Magic Mouse шлют десятки событий) */
export const WHEEL_STEP = 80;
export const WHEEL_GAP_MS = 100;
/** Пауза без колеса дольше этого — накопленное забывается */
const WHEEL_IDLE_MS = 250;

/** deltaY события колеса в «пиксели»: строки (Firefox) и страницы тоже считаются */
export function wheelPixels(dy: number, mode = 0): number {
  return mode === 1 ? dy * 40 : mode === 2 ? dy * 400 : dy;
}

/**
 * Накопитель колеса: событие за событием копит |deltaY|, шаг — раз в WHEEL_STEP и не чаще, чем раз в WHEEL_GAP_MS;
 * смена направления и пауза сбрасывают накопленное. Остаток после шага не переносится — инерция трекпада не крутит пояс.
 */
export class WheelAcc {
  private acc = 0;
  private at = -Infinity;
  private last = -Infinity;

  /** dy — deltaY в пикселях, t — время в мс. Возвращает −1, 0 или +1 */
  push(dy: number, t: number): -1 | 0 | 1 {
    if (dy === 0) return 0;
    if (t - this.last < WHEEL_GAP_MS) { this.at = t; return 0; }
    if (t - this.at > WHEEL_IDLE_MS || Math.sign(dy) !== Math.sign(this.acc)) this.acc = 0;
    this.at = t;
    this.acc += dy;
    if (Math.abs(this.acc) < WHEEL_STEP) return 0;
    const dir = this.acc > 0 ? 1 : -1;
    this.acc = 0;
    this.last = t;
    return dir;
  }

  reset(): void {
    this.acc = 0;
    this.at = this.last = -Infinity;
  }
}

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

/**
 * Грядки, куда пойдёт посадка с граблями: выбранная и ближайшие свободные, всего до RAKE_BEDS[rake − 1].
 * occupied[i] — на грядке уже растёт; pos — места грядок на участке (FARM_BED_LOCAL).
 */
export function rakeTargets(occupied: readonly boolean[], cap: number, bed: number, pos: readonly { x: number; z: number }[]): number[] {
  if (bed < 0 || bed >= occupied.length) return [];
  const here = pos[bed];
  const near = occupied
    .map((busy, i) => ({ busy, i }))
    .filter(({ busy, i }) => !busy && i !== bed)
    .sort((a, b) => Math.hypot(pos[a.i].x - here.x, pos[a.i].z - here.z) - Math.hypot(pos[b.i].x - here.x, pos[b.i].z - here.z));
  return [bed, ...near.slice(0, Math.max(0, cap - 1)).map((x) => x.i)];
}

/** Сколько заплатим: первая посадка культуры бесплатна для одной грядки, остальные — по цене (как shared/farm.ts plant) */
export function plantCost(seed: number, beds: number, firstFree: boolean): number {
  return Math.max(0, seed * beds - (firstFree ? seed : 0));
}
