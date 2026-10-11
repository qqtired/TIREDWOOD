// Старая набережная (раскладка 2, без флага PLAZA3) не изменилась, пока рядом строится новая (docs/plaza3/tech-foundation.md
// §1.9, WP0): отпечатки карты, твёрдого оформления и всех позиционных констант режимов сняты 11.10.2026 после удаления
// Fight Club. Сломался отпечаток — значит, правка plaza3 задела старую площадь: ищи, какое значение поменялось без флага.
// Отпечатки меняют только вместе с намеренной правкой старой площади (и пишут в коммите, что именно поменялось).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { LAYOUT } from '../shared/layout.ts';
import {
  BENCH_XS, BENCH_Z, BOAT_RACE_CIRCLE, BOAT_SIGN, CANOPY_POLES, CANOPY_POLE_H, CHAIR_R, DUNGEON_RETURN, DUNGEON_USE, FORT_ARCH, HIDE_CIRCLE,
  KART_START, LAMP_FORT, LOBBY_SEAT_COUNT, MACHINE_FRONT_Z, MACHINE_XS, PHOTO, PLANTERS, PLAZA_TRAMPOLINES, SKILL_PORTAL, TABLE_X, TABLE_ZS,
  buildLobby,
} from '../shared/maps/lobby.ts';
import { AQUA_BAGS, AQUA_BOARD, AQUA_FINISH, AQUA_JETTY, AQUA_MOVERS, AQUA_NEAR_X, AQUA_PIECES, AQUA_RESPAWN, AQUA_SWEEPER } from '../shared/aqua.ts';
import { BALL_HOME } from '../shared/ball.ts';
import { BARKAS } from '../shared/barkas.ts';
import { BL_HALL, BL_POSTS, BL_TABLES } from '../shared/billiards.ts';
import { BOAT_PATH_LEN, LAUNCH } from '../shared/boat.ts';
import { FARM_PLAZA_GATE } from '../shared/farmmap.ts';
import { FERRY_AWAY, FERRY_HOME, FERRY_HOME_BOARD, FERRY_SIGN } from '../shared/ferry.ts';
import {
  FISHER_NPC, FISHER_USE, FISH_BOARD, FISH_DECKS, FISH_FAR_SPOTS, FISH_HOUSE, FISH_HOUSE_BOXES, FISH_MOORINGS, FISH_PIER2, FISH_PIER_HEAD,
  FISH_PODIUM, FISH_SPOTS, ROULETTE_SPOT,
} from '../shared/fishplaces.ts';
import { JUKEBOX, JUKEBOX_BARKAS, JUKE_BARKAS_USE, JUKE_SPOTS, JUKE_USE } from '../shared/jukebox.ts';
import { CRITTER_COVE } from '../shared/maps/critters.ts';
import { BERTHS, PARK } from '../shared/ownboat.ts';
import { PIRATE_BENCHES, PIRATE_CANNONS, PIRATE_DOCKS, PIRATE_LOOT_HOME, PIRATE_PILES, PIRATE_ROUTES, PIRATE_SHIP, PIRATE_WATER_Z, PIRATE_ZONE } from '../shared/pirates.ts';
import { PLANE_DOCK, PLANE_EXIT, PLANE_SIGN, PLANE_USE } from '../shared/plane.ts';
import {
  BOAT_GATE, DUNGEON_BOARD, DUNGEON_ROCK, KART_TIRES, PB_BARRELS, REGATTA_BOATS, REGATTA_MASTS, SIGNPOST, YARD_BARREL, YARD_BOAT, YARD_CRATES,
  YARD_GATE, YARD_RACKS, plazaSolids,
} from '../shared/plaza2.ts';
import { RAT_BOARD, RAT_CENTER, RAT_DECK, RAT_LAP, RAT_PEN, RAT_TRACK, RAT_USE } from '../shared/ratrace.ts';
import { START_ZONES } from '../shared/startzones.ts';
import { STORM_DOOR, STORM_GOAL } from '../shared/storm.ts';
import { WARDROBE_OFFSETS } from '../shared/wardrobe.ts';
import { WHEEL, WHEEL_EXIT, WHEEL_GATE } from '../shared/wheel.ts';
import { setupHub } from './kit.ts';
import { LEGACY_LOBBY_SHA, interactKinds, sha } from './lobbycheck.ts';

/** Позиционные константы режимов (docs/plaza3/tech-foundation.md §3): их plaza3 переносит через pick()/xf() «на месте» */
const PACK = {
  lobby: {
    MACHINE_XS, MACHINE_FRONT_Z, TABLE_ZS, TABLE_X, SKILL_PORTAL, LAMP_FORT, BOAT_RACE_CIRCLE, HIDE_CIRCLE, PLAZA_TRAMPOLINES, CHAIR_R,
    BENCH_XS, BENCH_Z, CANOPY_POLES, CANOPY_POLE_H, LOBBY_SEAT_COUNT, PLANTERS, BOAT_SIGN, KART_START, FORT_ARCH, PHOTO, DUNGEON_USE,
    DUNGEON_RETURN,
  },
  aqua: { AQUA_BAGS, AQUA_BOARD, AQUA_FINISH, AQUA_JETTY, AQUA_MOVERS, AQUA_NEAR_X, AQUA_PIECES, AQUA_RESPAWN, AQUA_SWEEPER },
  ball: { BALL_HOME },
  barkas: { BARKAS },
  billiards: { BL_HALL, BL_POSTS, BL_TABLES },
  boat: { BOAT_PATH_LEN, LAUNCH },
  farm: { FARM_PLAZA_GATE },
  ferry: { FERRY_AWAY, FERRY_HOME, FERRY_HOME_BOARD, FERRY_SIGN },
  fish: {
    FISHER_NPC, FISHER_USE, FISH_BOARD, FISH_DECKS, FISH_FAR_SPOTS, FISH_HOUSE, FISH_HOUSE_BOXES, FISH_MOORINGS, FISH_PIER2, FISH_PIER_HEAD,
    FISH_PODIUM, FISH_SPOTS, ROULETTE_SPOT,
  },
  jukebox: { JUKEBOX, JUKEBOX_BARKAS, JUKE_BARKAS_USE, JUKE_SPOTS, JUKE_USE },
  critters: { CRITTER_COVE },
  ownboat: { BERTHS, PARK },
  pirates: { PIRATE_BENCHES, PIRATE_CANNONS, PIRATE_DOCKS, PIRATE_LOOT_HOME, PIRATE_PILES, PIRATE_ROUTES, PIRATE_SHIP, PIRATE_WATER_Z, PIRATE_ZONE },
  plane: { PLANE_DOCK, PLANE_EXIT, PLANE_SIGN, PLANE_USE },
  plaza2: { BOAT_GATE, DUNGEON_BOARD, DUNGEON_ROCK, KART_TIRES, PB_BARRELS, REGATTA_BOATS, REGATTA_MASTS, SIGNPOST, YARD_BARREL, YARD_BOAT, YARD_CRATES, YARD_GATE, YARD_RACKS },
  ratrace: { RAT_BOARD, RAT_CENTER, RAT_DECK, RAT_LAP, RAT_PEN, RAT_TRACK, RAT_USE },
  startzones: { START_ZONES },
  storm: { STORM_DOOR, STORM_GOAL },
  wardrobe: { WARDROBE_OFFSETS },
  wheel: { WHEEL, WHEEL_EXIT, WHEEL_GATE },
};

test('старая набережная: тест идёт без PLAZA3 (раскладка 2), сервер так и говорит в /health', () => {
  assert.equal(LAYOUT, 2, 'npm test запущен с PLAZA3=1 в окружении: старые тесты проверяют старую площадь — запусти без переменной (unset PLAZA3)');
  assert.equal(setupHub().hub.health().plaza, 2);
});

test('старая набережная: отпечатки карты, оформления и позиционных констант не изменились', () => {
  assert.equal(sha(buildLobby()), LEGACY_LOBBY_SHA, 'buildLobby()');
  assert.equal(sha(plazaSolids()), '78d95ca66c371789d925a0b3eb3de5950fb1860a86edf82f1654a766147f51a5', 'plazaSolids()');
  // Сверено с main: только8мест ISLE в FISH_SPOTS и6его BERTHS (40чисел); остальные константы идентичны.
  assert.equal(sha(PACK), 'a5e1a1a6274acd304e363bda41948118804e275f9ee9acbdc47050f540c87bc7', 'позиционные константы режимов');
});

test('старая набережная: номера точек 0–112 и их смысл — как в фикстуре', () => {
  const want = JSON.parse(readFileSync(new URL('./fixtures/lobby-interact-kinds.json', import.meta.url), 'utf8')) as Array<[string, number]>;
  assert.equal(want.length, 113);
  assert.deepEqual(interactKinds(buildLobby()), want);
});
