// Реальные маршруты от входа на мостки. Обходят штатив, башню, рыбаков и снасти.
export type FishPathPoint = readonly [number, number];
const PIER: FishPathPoint = [-19, 22.6];
// The tripod sits between rows three/four; use its wide western flank, then rejoin
// the middle before the fourth pair. This remains open with all eight fishers seated.
const PAST_PHOTO: FishPathPoint[] = [PIER, [-19, 32.7], [-20.1, 33.1], [-20.1, 34.4], [-19, 34.8]];
const LIGHTHOUSE: FishPathPoint[] = [...PAST_PHOTO, [-19, 37.7], [-20.2, 38.5], [-21.5, 39.3]];

export const FISH_APPROACH_ROUTES: readonly (readonly FishPathPoint[])[] = [
  ...[25, 28.5, 32].flatMap((z) => [[PIER, [-19, z], [-20.45, z]], [PIER, [-19, z], [-17.55, z]]] as FishPathPoint[][]),
  [...PAST_PHOTO, [-19, 35.5], [-20.45, 35.5]],
  [...PAST_PHOTO, [-19, 35.5], [-17.55, 35.5]],
  [...LIGHTHOUSE, [-22.3, 41], [-23.45, 41]],
  [...LIGHTHOUSE, [-21.5, 40.9], [-16.3, 40.9], [-16.3, 42.5], [-14.55, 42.5]],
  [...LIGHTHOUSE, [-21.65, 41], [-21.65, 45.45]],
  [...LIGHTHOUSE, [-21.5, 40.9], [-16.3, 40.9], [-16.35, 45.45]],
];
