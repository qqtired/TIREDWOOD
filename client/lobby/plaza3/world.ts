// Статика новой набережной (флаг PLAZA3, docs/plaza3/tech-foundation.md §1.6): суша, кварталы, павильоны. Строится вместо
// старой статики plaza2 в LobbyWorld, когда в docs/plaza3/level/layout.json legacyStatic: false (блокаут WP2).
// Сейчас — заглушка каркаса WP0: пустая группа. Сюда же — world/pavilions/signs/npc/farmroad/arcade (§1.6) по пакетам.
import * as THREE from 'three';
import type { VenueCtx } from '../plaza/venue.ts';

export interface Plaza3World {
  readonly group: THREE.Group;
}

export function buildPlaza3World(ctx: VenueCtx): Plaza3World {
  const group = new THREE.Group();
  group.name = 'plaza3';
  ctx.scene.add(group);
  return { group };
}
