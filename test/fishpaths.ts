// Реальные маршруты от входа на мостки. Обходят штатив, башню, рыбаков и снасти.
export type FishPathPoint = readonly [number, number];
const PIER: FishPathPoint = [-19, 22.6];
// The tripod sits between rows three/four; use its wide western flank, then rejoin
// the middle before the fourth pair. This remains open with all eight fishers seated.
const PAST_PHOTO: FishPathPoint[] = [PIER, [-19, 32.7], [-20.1, 33.1], [-20.1, 34.4], [-19, 34.8]];
const LIGHTHOUSE: FishPathPoint[] = [...PAST_PHOTO, [-19, 37.7], [-20.2, 38.5], [-21.5, 39.3]];

// Дальние мостки и площадка с домом рыбака: в обход башни с запада, под ней — на юг, на мостки по середине.
const FAR: FishPathPoint[] = [...LIGHTHOUSE, [-21.6, 45.3], [-19, 45.3], [-19, 46.6]];
const HEAD: FishPathPoint[] = [...FAR, [-19, 54.6]];
/** Маршруты к местам дальних мостков и площадки (номера 20…27 — после мест баркаса) */
export const FISH_FAR_ROUTES: readonly (readonly FishPathPoint[])[] = [
  [...FAR, [-19, 47.0], [-18.05, 47.0]],
  [...FAR, [-19, 48.5], [-19.95, 48.5]],
  [...FAR, [-19, 50.5], [-18.05, 50.5]],
  [...FAR, [-19, 52.5], [-19.95, 52.5]],
  [...HEAD, [-24.95, 56.2]],
  [...HEAD, [-23.4, 56.5], [-23.4, 60.5], [-24.1, 61.2], [-24.1, 63.0], [-23.65, 63.45]],
  [...HEAD, [-13.05, 56.2]],
  [...HEAD, [-14.6, 56.6], [-14.6, 60.6], [-13.05, 61.2]],
];
/** К Семёну на крыльцо: встать перед ним (FISHER_USE) */
export const FISHER_ROUTE: readonly FishPathPoint[] = [...HEAD, [-17.55, 57.45]];

export const FISH_APPROACH_ROUTES: readonly (readonly FishPathPoint[])[] = [
  ...[25, 28.5, 32].flatMap((z) => [[PIER, [-19, z], [-20.45, z]], [PIER, [-19, z], [-17.55, z]]] as FishPathPoint[][]),
  [...PAST_PHOTO, [-19, 35.5], [-20.45, 35.5]],
  [...PAST_PHOTO, [-19, 35.5], [-17.55, 35.5]],
  [...LIGHTHOUSE, [-22.3, 41], [-23.45, 41]],
  [...LIGHTHOUSE, [-21.5, 40.9], [-16.3, 40.9], [-16.3, 42.5], [-14.55, 42.5]],
  [...LIGHTHOUSE, [-21.65, 41], [-21.65, 45.45]],
  [...LIGHTHOUSE, [-21.5, 40.9], [-16.3, 40.9], [-16.35, 45.45]],
];
