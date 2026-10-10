// ЗАГЛУШКА пакета C до пакета D (рыбы острова «Последний свет»): только контракт — центр острова, радиус его вод и зона
// рыбалки в море. Пул 20 видов острова, шансы в туман и в сезон — у D; при слиянии этот файл заменяет версия D.
// Пока пула острова нет, места на моле (zone 'isle') ловят как баркас (shared/fishrules.ts — заглушки 'isle').
import { ISLE_CENTER, ISLE_WATERS_R, inIsleWaters } from './maps/isle.ts';

export { ISLE_CENTER, ISLE_WATERS_R };

/** Зона рыбалки с лодки в море: в водах острова — остров, везде ещё — баркас */
export function fishZoneAtSea(x: number, z: number): 'barkas' | 'isle' {
  return inIsleWaters(x, z) ? 'isle' : 'barkas';
}
