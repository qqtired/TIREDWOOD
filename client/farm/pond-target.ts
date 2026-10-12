// Одна ближайшая геометрическая цель для подсказки и E/мыши. Занятость проверяется после выбора.
import { POND_SPOTS, POND_USE } from '../../shared/farmpond.ts';

export type PondTarget = { kind: 'npc' } | { kind: 'seat'; seat: number };
export const POND_SEAT_USE_RADIUS = 1.65;
const EPS = 1e-9;
export function pondTarget(x: number, z: number, enabled: boolean, activeSeat: number | null): PondTarget | null {
  if (!enabled || activeSeat !== null) return null;
  const npcDistance = Math.hypot(x - POND_USE.x, z - POND_USE.z);
  let best: PondTarget | null = npcDistance <= POND_USE.r + EPS ? { kind: 'npc' } : null;
  let distance = best ? npcDistance : Infinity;
  POND_SPOTS.forEach((s, seat) => {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d > POND_SEAT_USE_RADIUS + EPS) return;
    // Равенство NPC/маркер отдаём рыбалке; равные маркеры сохраняют первый номер.
    if (d < distance - EPS || (Math.abs(d - distance) <= EPS && best?.kind === 'npc')) { distance = d; best = { kind: 'seat', seat }; }
  });
  return best;
}
