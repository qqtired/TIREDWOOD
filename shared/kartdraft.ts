// Затяжка (слипстрим): едешь прямо за соперником — воздух не держит, заряд копится; набрался — короткий рывок.
// Считает сервер (он знает, где все карты): заряд — в карте гонки, рывок — мини-турбо 2 в состоянии карта, его
// предсказание клиента получает при сверке, как банку варенья. Клиенту уходят события ['tow', кто, ступень 0–3]
// и ['draft', кто] — полоска «Затяжка», поток воздуха у карта и звук рывка видны всем.
// Все числа — здесь: откатить затяжку — DRAFT_ON = false.
import { BOOST_MT2, type KartState } from './kart.ts';

export const DRAFT_ON = true;
/** Соперник впереди не дальше стольких метров (и не ближе — вплотную это толчок) */
export const DRAFT_LEN = 16;
export const DRAFT_NEAR = 1.6;
/** Вбок от своего курса — не дальше: 1,5 м у носа, шире к концу следа */
export const DRAFT_W0 = 1.5;
export const DRAFT_W1 = 2.6;
/** Затяжка — только на скорости: свой ход не меньше, у соперника — не меньше DRAFT_LEAD_V (стоячий не тянет) */
export const DRAFT_MIN_V = 20;
export const DRAFT_LEAD_V = 14;
/** Заряд: тиков в следе до рывка; выпал из следа — заряд держится DRAFT_GRACE тиков, потом сброс */
export const DRAFT_FULL = 54;
export const DRAFT_GRACE = 12;
/** Рывок: уровень ускорения (потолок мини-турбо 2) и сколько тиков */
export const DRAFT_LVL = BOOST_MT2;
export const DRAFT_TICKS = 54;
/** Ступени заряда для клиента (полоска и поток воздуха) */
export const DRAFT_STEPS = 3;

/** Карт a едет в следе карта b: b впереди по курсу a, близко к оси, оба на ходу и на одной высоте. */
export function inTow(a: KartState, b: KartState): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const along = dx * a.hx + dz * a.hz;
  if (along < DRAFT_NEAR || along > DRAFT_LEN) return false;
  const side = dx * a.hz - dz * a.hx;
  const w = DRAFT_W0 + ((DRAFT_W1 - DRAFT_W0) * along) / DRAFT_LEN;
  if (side > w || side < -w) return false;
  if (b.y - a.y > 1.5 || a.y - b.y > 1.5) return false;
  return b.vx * a.hx + b.vz * a.hz >= DRAFT_LEAD_V;
}

/** Может ли карт копить затяжку сам: на земле, на скорости, не крутится, не призрак, не доехал. */
export function canTow(a: KartState): boolean {
  return a.grounded === 1 && a.done === 0 && a.ghostT === 0 && a.spinT === 0 && a.vx * a.hx + a.vz * a.hz >= DRAFT_MIN_V;
}

/** Ступень заряда 0…DRAFT_STEPS по тикам в следе */
export function towStep(towT: number): number {
  return towT <= 0 ? 0 : Math.min(DRAFT_STEPS, 1 + Math.floor(((towT - 1) * DRAFT_STEPS) / DRAFT_FULL));
}

/** Рывок затяжки: мини-турбо 2 на DRAFT_TICKS (не перебивает более сильное ускорение). true — дали. */
export function draftBoost(k: KartState): boolean {
  if (k.boostT > 0 && k.boostLvl > DRAFT_LVL) return false;
  k.boostLvl = DRAFT_LVL;
  k.boostT = Math.max(k.boostT, DRAFT_TICKS);
  return true;
}
