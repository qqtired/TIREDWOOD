// Общие места отдыха: модели, подсказки и сервер используют одну геометрию планировки.
import { FARM_LAYOUT } from './farmlayout.ts';

export interface FarmSeat {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  r: number;
}

const fire = FARM_LAYOUT.objects.find((o) => o.id === 'campfire')!;
const tree = FARM_LAYOUT.objects.find((o) => o.id === 'boss')!;
const fireSeats = 'seats' in fire ? fire.seats : [];
const benches = FARM_LAYOUT.nooks.flatMap((n) => n.items.filter((item) => item.kind === 'bench'));

const pair = (x: number, z: number, yaw: number): Omit<FarmSeat, 'id'>[] => [-0.5, 0.5].map((d) => ({
  x: x + Math.cos(yaw) * d, y: 0, z: z - Math.sin(yaw) * d, yaw, r: 0.85,
}));

export const FARM_SEATS16: readonly FarmSeat[] = [
  ...fireSeats.map((s) => ({ ...s, y: 0 })),
  ...benches.flatMap((b) => pair(b.x, b.z, 'yaw' in b ? b.yaw : 0)),
  ...[22, 68].flatMap((degrees) => {
    const a = degrees * Math.PI / 180;
    return pair(tree.x + Math.cos(a) * 5, tree.z + Math.sin(a) * 5, -Math.PI / 2 - a);
  }),
].map((s, id) => ({ ...s, id }));

export const FARM_JUKE_SPOT = {
  x: -2.8, y: 0, z: 6.36, yaw: -Math.PI / 2,
  use: { x: -1.55, z: 6.36, r: 1.6 },
} as const;
