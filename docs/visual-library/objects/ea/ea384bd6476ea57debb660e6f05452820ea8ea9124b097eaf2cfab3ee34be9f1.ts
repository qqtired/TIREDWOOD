// Модели набора E (mobs-e): морской десант и супер-босс — шлюпка с крабами, краб-абордажник (экипаж, ZF_CREW),
// щупальце и Кракен. Каждая модель — свой файл в этой папке.
import type { MobDef } from './kit.ts';
import { CREW_CRABS } from './crew-crab.ts';
import { KRAKEN } from './kraken.ts';
import { KRAKEN_TENTACLE } from './kraken-tentacle.ts';
import { SEA_BOAT, SEA_BOAT_RED } from './sea-boat.ts';

export const MOBS_E: MobDef[] = [SEA_BOAT, SEA_BOAT_RED, ...CREW_CRABS, KRAKEN_TENTACLE, KRAKEN];
