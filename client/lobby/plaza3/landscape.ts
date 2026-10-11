// Только задник plaza3: гора плавно сходит к ровной береговой улице и к далёкому краю сетки.
// Старая площадь сохраняет прежний рельеф в lobby/world.ts.
export const TOWN_LIMIT = { x1: 1600, z0: -1506 } as const;

const smooth = (t: number): number => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

/** Высота города, м. Подъём под буквами не должен поднимать сам берег: иначе его край выглядит обрывом. */
export function townHeight(x: number, z: number, depth: number, sign: number): number {
  if (depth < 0) return -3.2;
  const ramp = Math.min(1, Math.max(0, (depth - 150) / 350));
  const hill = Math.max(0, depth - 70) * 0.1 + 34 * Math.sin(x * 0.006 + 0.4) * Math.cos(z * 0.0045 - 0.3) * ramp;
  const wob = 5 * Math.sin(x * 0.011 + 1.3) * Math.sin(z * 0.014 - 0.7) * Math.min(1, Math.max(0, (depth - 60) / 120));
  const coast = smooth((depth - 12) / 80);
  // Дальняя граница низкая и за дымкой, а гребень заканчивается естественным склоном, без вертикального среза.
  const far = (1 - smooth((x - 1000) / (TOWN_LIMIT.x1 - 1000))) * (1 - smooth((-z - 1000) / (-TOWN_LIMIT.z0 - 1000)));
  return -0.6 + Math.max(0, hill + sign * coast + wob) * far;
}

/** На крутом участке стену прорезает склон. Дома строим только на почти ровных площадках (углы + середина). */
export function townLotBase(ground: (x: number, z: number) => number, x0: number, z0: number, x1: number, z1: number): number | null {
  const heights = [ground(x0, z0), ground(x1, z0), ground(x0, z1), ground(x1, z1), ground((x0 + x1) / 2, (z0 + z1) / 2)];
  const lo = Math.min(...heights);
  return Math.max(...heights) - lo > 1.2 ? null : lo - 0.4;
}
