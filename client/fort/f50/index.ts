// «Крепость 50» на клиенте — одна точка входа для матча. Вид стен и лагеря живёт в сцене крепости (она одна на всё
// время игры): при новом посещении берём тот же объект и только подменяем связи с матчем.
import { F50_LAST_WAVE } from '../../../shared/fort50.ts';
import { setLastWave } from '../ui/schedule.ts';
import type { FortWorld } from '../world.ts';
import { Fort50Client, type F50Deps } from './f50c.ts';

export type { Fort50Client } from './f50c.ts';

const made = new WeakMap<FortWorld, Fort50Client>();

/** Клиент Ф50 для этой сцены (создаётся по первому {t:'f50'}; кладка замка перекомпилируется один раз) */
export function f50Client(d: F50Deps): Fort50Client {
  let c = made.get(d.world);
  if (c) c.bind(d);
  else {
    c = new Fort50Client(d);
    made.set(d.world, c);
  }
  setLastWave(F50_LAST_WAVE);
  return c;
}
