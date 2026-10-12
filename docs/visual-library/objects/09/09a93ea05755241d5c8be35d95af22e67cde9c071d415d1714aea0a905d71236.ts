// «Набег пиратов» — все модели события, единственный вход для сцены (client/lobby/pirates.ts): пираты-желейки
// (PIRATE_DEFS, PirateCrowd), корабль «Весёлый Мармелад», шлюпка, береговая пушка, добыча и ядро. Оси у всех: метры,
// нос/«вперёд» — локальный +Z, вверх — +Y; y = 0 — ватерлиния у корабля и шлюпки, пол у пирата, пушки и добычи.
// Стенд моделей — tools/pirate-lab (?view=ship|ship34|deck|dinghy|pirates|captain|cannon|loot|all).
export {
  PF_BARREL, PF_CRATE, PIRATE_DEFS, PK_CAPTAIN, PK_HAND,
  PS_CARRY, PS_CHEER, PS_FLEE, PS_GRAB, PS_IDLE, PS_JUMP, PS_ROW, PS_RUN, PS_SEAT, PS_STUN,
} from './piratejelly.ts';
export { PIRATE_CAP, PirateCrowd, crowdRoot, type PirateQuality } from './piratecrowd.ts';
export { buildShip, type ShipAnim, type ShipModel, type ShipPoint } from './pirateship.ts';
export { buildDinghy, type DinghyAnim, type DinghyModel } from './piratedinghy.ts';
export { buildCannon, type CannonAnim, type CannonModel } from './piratecannon.ts';
export { buildLoot, type LootKit } from './pirateloot.ts';
