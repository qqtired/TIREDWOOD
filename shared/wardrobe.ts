import type { Interactable } from './maps/lobby.ts';

/** Три места перед фасадом примерочной, от основной точки вдоль z. */
export const WARDROBE_OFFSETS = [0, -2, -4] as const;

export function wardrobePlace(base: Interactable, place: number): Interactable | undefined {
  if (!Number.isInteger(place)) return undefined;
  const offset = WARDROBE_OFFSETS[place];
  if (offset === undefined) return undefined;
  return { ...base, arg: place, z: base.z + offset };
}
