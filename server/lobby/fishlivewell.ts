// ЗАГЛУШКА пакета D (лайвел): продажа улова из лодки. Пакет D заменит файл своим — там улов лежит в лайвеле лодки.
// Здесь — как у Семёна: продаём рюкзак целиком. Имя и форма ответа — по контракту плана внедрения.
import type { Profile } from '../store.ts';
import type { Profiles } from '../profiles.ts';

/** Продать улов, когда лодка у стоянки или причала острова: сколько рыб и жетонов */
export function sellFromBoat(profiles: Profiles, prof: Profile): { n: number; coins: number } {
  return profiles.sellFish(prof);
}
