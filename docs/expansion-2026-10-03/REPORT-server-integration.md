# Expansion server integration

## Ownership and boundaries

Changed `server/hub.ts`, `server/lobby/room.ts`, `test/kit.ts`, new `test/expansion-hub.test.ts`, and only the existing E-at-garage routing expectation in `test/lobby.test.ts`. Root owns shared messages/map/protocol changes; peers own Blackjack, SkillRoom, race engines, profiles/store and wardrobe changes. This worker did not edit those modules, re-edit completed UI, start a server/browser, deploy, commit, use SSH, or touch production data.

## Integrated behavior

### Blackjack

- Shared `ACT_DURAK` physical seated pose routes by `seatTable(arg) === 2`; map-provided chair arguments 12–17 belong to Blackjack, 0–11 remain Durak. `DurakHall` receives `allowedTables: [0, 1]`. Its `views()` keeps three stable physical indexes: index 2 is an inert compatibility placeholder, not a third playable Durak table.
- Welcome includes `blackjack: BlackjackView`; public state broadcasts use `{t:'blackjack',v}`. Invalid authority and hall rejections return `{t:'blackjackError',message,rev}` followed by current public state, without a duplicate global toast.
- Reserve/settle hooks call existing `Profiles.reserveBlackjack` / `settleBlackjack`. Tokens and `me` updates locate online clients by profile ID across all rooms. Reused lobby slots cannot receive another profile's settlement.
- `Hub.active` and lobby stepping remain enabled while Blackjack is active even with no connected humans. `health.busy` includes unsettled hands. Shutdown settles/refunds through the hall before the final store flush; repeated shutdown does not pay twice.
- `HubOptions.blackjackDeck` and the corresponding final optional `LobbyRoom` constructor argument permit deterministic tests, passed through the test kit only.

### Skill room

- `Hub.skill` is always instantiated with outfit/AFK hooks. Portal admission uses room capacity and the standard Hub scene/epoch transition. Welcome carries `skill`; lobby receives `skillSt` once per second.
- Included in active-loop checks, stepping, `health.skill`, busy count, leave routing, outfit changes, global chat and online roster. Room commands `/kill` and `/respawn` use its existing command handler.
- Return to lobby uses root-provided `map.skillSpawn`. Checkpoint persistence remains owned by SkillGame, including its peer-added real elapsed-time handling during empty-room sleep.

### Kart track selection

- `circle` preserves observed entry order. First entrant is host; leaving/rejoining goes to the back, leaving transfers authority to the oldest remaining member, empty queue resets to `port`.
- `KartStatus` count/idle includes `track`, `hostId` (lobby entity slot), and `hostNick`. `kartTrack` validates track ID, actual current circle membership, host ownership, and idle race. Garage E cycles the two tracks through the same validation. Each actual change restarts the existing 15-second countdown.
- `startRace(clients, track = 'port')` passes the chosen track to `RaceRoom.open`. Launched race track stays owned by the race instance. Existing automatic start and no live-race reconnect behavior are preserved.
- Foundry result rows update `rcBestLapFoundry`; port/legacy rows update `rcBestLap`. No store format was introduced here.

## Verification

The initial 11 new tests were observed red for absent integration, host authority and record routing. After implementation, the first scoped run had one intended-behavior fixture failure: old garage E expected a hint. Its assertion now checks selection and retained lobby membership. The Durak welcome test was corrected to inspect the existing stable-index contract and explicitly assert Blackjack chair exclusion from Durak.

Final scoped command: Node 24 `--test test/expansion-hub.test.ts test/hub.test.ts test/lobby.test.ts test/durakhall.test.ts test/race.test.ts` — **70 passed, 0 failed**, including 14 new expansion tests.

Covered: physical chair mapping, wrong-table/revision rejection, duplicate-spend resistance, pre-deal refund, cross-room balance updates, offline settlement, recycled-slot isolation, original-chair reclaim, shutdown disk readback, Skill capacity/scene/snapshots/checkpoints/AFK/chat/online roster, track-host reassignment/rejoin, chosen race hello/status and record isolation.

Focused strict TypeScript check of Hub, LobbyRoom, new integration tests and test kit passed. Full suite/build/browser/production acceptance was explicitly outside worker scope and remains with root. Tests use disposable temporary stores; they do not establish production migration or manual UI acceptance.
