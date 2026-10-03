import {
  ANTIAIR_PRICE, BUY_ANTIAIR, BUY_CRYSTAL, BUY_FIX, BUY_GATE, BUY_JAM, BUY_MAGAZINE, BUY_TURRET,
  CRYSTAL_HP, CRYSTAL_PRICE, FIX_PRICE, FT_BREAK, FT_GATHER, GATE_HP, JAM_PRICE, MAGAZINE_PRICE, NEWGATE_PRICE, TURRET_PRICE,
} from './fort.ts';

export interface FortShopState {
  phase: number;
  pts: number;
  gate: number;
  crystal: number;
  /** bits 0/1: built; bits 4/5: anti-air */
  turrets: number;
  jams: number;
  mag: boolean;
}

export interface FortShopItem {
  id: number;
  buy: number;
  arg: number;
  label: string;
  detail: string;
  price: number;
  reason: string;
}

/** IDs are actions, never a client supplied price. All central actions require proximity to the shop. */
export function fortShopItems(s: FortShopState): FortShopItem[] {
  const calm = s.phase === FT_GATHER || s.phase === FT_BREAK;
  const rows: Array<Omit<FortShopItem, 'reason'> & { unavailable: string }> = [
    { id: 1000, buy: BUY_FIX, arg: 0, label: 'Подлатать ворота', detail: '+400 прочности, максимум 1600', price: FIX_PRICE, unavailable: s.gate <= 0 ? 'Нужны новые ворота' : s.gate >= GATE_HP ? 'Ворота целы' : '' },
    { id: 1001, buy: BUY_GATE, arg: 0, label: 'Новые ворота', detail: 'Полная прочность: 1600', price: NEWGATE_PRICE, unavailable: s.gate > 0 ? 'Ворота ещё стоят' : '' },
    { id: 1002, buy: BUY_CRYSTAL, arg: 0, label: 'Подлечить кристалл', detail: '+250 прочности, максимум 2500', price: CRYSTAL_PRICE, unavailable: s.crystal >= CRYSTAL_HP ? 'Кристалл цел' : '' },
    ...[0, 1].map((arg) => ({ id: 1003 + arg, buy: BUY_TURRET, arg, label: `Краскомёт · ${arg === 0 ? 'запад' : 'восток'}`, detail: 'Общий: 9 урона, дальность 24 м', price: TURRET_PRICE, unavailable: s.turrets & (1 << arg) ? 'Уже построен' : '' })),
    ...[0, 1, 2].map((arg) => ({ id: 1005 + arg, buy: BUY_JAM, arg, label: `Варенье · ${['запад', 'центр', 'восток'][arg]}`, detail: '−60% скорости на 45 с от начала волны', price: JAM_PRICE, unavailable: s.jams & (1 << arg) ? 'Варенье подготовлено' : '' })),
    { id: 1008, buy: BUY_MAGAZINE, arg: 0, label: 'Большой магазин', detail: '42 вместо 30 шариков · до конца игры', price: MAGAZINE_PRICE, unavailable: s.mag ? 'Уже установлен' : '' },
    ...[0, 1].map((arg) => ({ id: 1009 + arg, buy: BUY_ANTIAIR, arg, label: `Зенитный краскомёт · ${arg === 0 ? 'запад' : 'восток'}`, detail: 'Приоритет крылаткам: 18 урона / 36 м; по земле 6 / 24 м', price: ANTIAIR_PRICE, unavailable: !(s.turrets & (1 << arg)) ? 'Сначала построй краскомёт' : s.turrets & (1 << (arg + 4)) ? 'Уже улучшен' : '' })),
  ];
  return rows.map(({ unavailable, ...r }) => ({ ...r, reason: !calm ? 'Лавка откроется в передышку' : unavailable || (s.pts < r.price ? `Не хватает ${r.price - s.pts} ⭐` : '') }));
}
