// Учебный конкурсный садок /lab: три места, шесть предложений, никаких профилей и валют.
export type KeepnetSpecies = 'mullet' | 'scad' | 'goby';
export interface KeepnetFish {
  readonly species: KeepnetSpecies;
  readonly g: number;
}
export interface KeepnetState {
  readonly round: number;
  readonly next: number;
  readonly slots: readonly (KeepnetFish | null)[];
}
export interface KeepnetScore {
  grams: number;
  weight: number;
  species: number;
  variety: number;
  total: number;
}

export const KEEP_NET_NAMES: Readonly<Record<KeepnetSpecies, string>> = { mullet: 'Кефаль', scad: 'Ставрида', goby: 'Бычок' };
export const KEEP_NET_SLOTS = 3;
export const KEEP_NET_BONUS = 15;
export const KEEP_NET_TARGET = 105;
export const KEEP_NET_CATCHES = 6;

// Первый состав вознаграждает лёгкий третий вид; в третьем очень тяжёлый повтор может быть лучше.
const ROUNDS: readonly (readonly KeepnetFish[])[] = [
  [
    { species: 'mullet', g: 1200 }, { species: 'mullet', g: 1800 }, { species: 'scad', g: 1000 },
    { species: 'mullet', g: 3000 }, { species: 'goby', g: 600 }, { species: 'scad', g: 2400 },
  ],
  [
    { species: 'goby', g: 500 }, { species: 'scad', g: 1500 }, { species: 'mullet', g: 1800 },
    { species: 'goby', g: 2300 }, { species: 'scad', g: 2900 }, { species: 'mullet', g: 1200 },
  ],
  [
    { species: 'scad', g: 1600 }, { species: 'mullet', g: 1100 }, { species: 'goby', g: 800 },
    { species: 'mullet', g: 4000 }, { species: 'scad', g: 3300 }, { species: 'mullet', g: 3500 },
  ],
];

export function keepnetStart(round = 0): KeepnetState {
  if (!Number.isSafeInteger(round) || round < 0) throw new RangeError('Неверный номер раунда');
  return { round: round % ROUNDS.length, next: 0, slots: [null, null, null] };
}

export function keepnetCandidate(state: KeepnetState): KeepnetFish | null {
  return ROUNDS[state.round]?.[state.next] ?? null;
}

/** Неверный или запоздавший выбор не расходует предложение. Состояние до выбора остаётся целым. */
export function keepnetChoose(state: KeepnetState, choice: unknown): KeepnetState {
  const candidate = keepnetCandidate(state);
  if (!candidate) return state;
  if (choice !== 'skip' && (typeof choice !== 'number' || !Number.isInteger(choice) || choice < 0 || choice >= KEEP_NET_SLOTS)) return state;
  const slots = [...state.slots];
  if (choice !== 'skip') slots[choice as number] = candidate;
  return { round: state.round, next: state.next + 1, slots };
}

/** 100 граммов = одно очко; каждый представленный вид = ещё 15, независимо от числа повторов. */
export function keepnetScore(slots: readonly (KeepnetFish | null)[]): KeepnetScore {
  if (slots.length > KEEP_NET_SLOTS) throw new RangeError('В садке только три места');
  let grams = 0;
  const kinds = new Set<KeepnetSpecies>();
  for (const fish of slots) {
    if (!fish) continue;
    if (!Object.hasOwn(KEEP_NET_NAMES, fish.species) || !Number.isSafeInteger(fish.g) || fish.g <= 0 || fish.g > 10_000_000) {
      throw new RangeError('Неверный учебный улов');
    }
    grams += fish.g;
    kinds.add(fish.species);
  }
  const weight = Math.floor(grams / 100);
  const variety = kinds.size * KEEP_NET_BONUS;
  return { grams, weight, species: kinds.size, variety, total: weight + variety };
}
