// Новая набережная в общей карте (buildLobby(), shared/maps/lobby.ts) — только при флаге PLAZA3.
// plaza3Static — твёрдое новой площади из docs/plaza3/level/layout.json (colliders): настил, парапеты, стены, павильоны.
// plaza3Interacts — новые точки E (аркада и т. п.) строго после точки №112 (farm): номера 0–112 одинаковы в обеих раскладках.
// С блокаутом WP2 colliders — настил суши, невидимые стены (кромка, бухта порта B), балюстрада и коробки павильонов.
import type { Builder } from '../maps/builder.ts';
import type { InteractKind } from '../maps/lobby.ts';
import { P3 } from './layout.ts';

type Add = (kind: InteractKind, x: number, z: number, yaw: number, r: number, arg: number, label: string) => void;

/** Твёрдое новой площади; возвращает номера добавленных боксов (map.plaza3Boxes — для проверок) */
export function plaza3Static(b: Builder): number[] {
  const ids: number[] = [];
  for (const c of P3.colliders) {
    ids.push(b.boxes.length);
    b.box([...c.min], [...c.max], c.mat ?? 'invisible', c.color ?? 0);
  }
  return ids;
}

/** Новые точки E plaza3 — в самый конец списка (№113 и дальше) */
export function plaza3Interacts(add: Add): void {
  P3.arcade.forEach((a, i) => add('arcade', a.x, a.z, a.yaw, a.r, i, 'аркада'));
}
