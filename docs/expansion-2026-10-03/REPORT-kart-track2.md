# Karting Track 2 — local implementation report

Implemented a second selectable course, **Литейный вираж** (`foundry`), while retaining **Портовое кольцо** (`port`) as the default and retaining all legacy item IDs, course geometry and default physics behavior. This report covers the race worker's files. Lobby host authority, common message types, profile record routing and app scene routing are integrated by the lead / hub owner.

## Course and mechanics

- Foundry: 1,400.31 m, 798 segments, 17 checkpoints including start/finish, 23 crates, six grid slots, one 12 m water jump. Coordinate bounds fit the existing signed 16-bit position encoding.
- Main straight has a physical central island: unobstructed left bypass; right lane offers boost and extra crates behind a timed press. Northern straight repeats the tradeoff with a different phase and adjacent spinner. Narrow S turns, offset blocks and slicks require braking and line choice.
- New timed presses use the same deterministic shared collision clock as existing movers. Green = raised/open, amber = exactly 60 ticks warning, red = down/solid. Each press leaves a permanent side bypass. Collision does not trap a kart indefinitely; R remains available.
- Foundry checkpoints require a forward crossing of the next checkpoint plane while on the road. Reverse crossings and teleporting past a missed checkpoint do not advance laps. Port retains its original checkpoint window and shortcut behavior.
- All checkpoint respawns are clear of static and moving collision throughout sampled hazard phases. Foundry adds visible checkpoint stripes and posts; existing start gate, grid markings, jump warnings and finish timing work with the new course.

New crate items appear only in Foundry's pool; Port retains its original weighted three-item pool:

| ID | Item | Authoritative effect |
|---|---|---|
| 4 | Shield | Three seconds; consumes one paint, jam or pulse hit. Does not bypass track obstacles, water or checkpoints. |
| 5 | Pulse | Forward cone, radius at most 12 m; slows valid targets for 75 ticks and removes boost. Excludes finished, ghost, distant, behind and height-separated karts; route-distance guard excludes adjacent unrelated track legs. |
| 6 | Cleaner | Clears own slow/spin/paint, clears jam within 5 m at compatible height, supplies a 45-tick boost. No teleport or checkpoint grant. |

Hits and rewards remain server decisions. Client input cannot choose an item, target or course. Existing jam count/lifetime limits are retained. New effects use fixed pools of six shield rings and eight short-lived pulse rings; there are no new projectile entities. Item names and effects are visible in the HUD, including shield-hit and pulse-hit feedback. Race names, mini-map and garage board use the chosen course.

## APIs and protocol integration

- `shared/racecourse.ts`: `RaceTrackId = 'port' | 'foundry'`, `RACE_TRACKS`, `isRaceTrackId`, `buildRaceCourse(id = 'port')`.
- `RaceOptions.track`; immutable `Race.trackId`; `RaceRoom.open(track = opts.track ?? 'port')`.
- `RaceScene(deps, trackId = 'port')`; `RaceWorld(renderer, quality = 'high', trackId = 'port')`.
- Common messages need `track` on race hello, race end, race result rows and `KartStatus`. Engine emits it at all four boundaries. Optional fields in shared types permit old fixture compatibility; absent means Port in callers.
- New `RaceEvent` tuples: `['pulse', sourceKartId, affectedKartIds]`, `['shield', shieldOwnerId, attackerId]`.
- **No binary byte-size or tail changes.** `KartSnap.misc` bit 4 (`KM_SHIELD = 16`) indicates an active shield. Bits 0–3 remain spark/boost; readers already mask boost with `& 3`.
- Lead/hub owner must enforce first-circle-entrant host, oldest-remaining transfer, map-selection lock after start, spectator status and course cache switching. `RaceRoom` itself does not accept newcomers once launched; this work does not add resume of a disconnected live kart.
- Record contract agreed with lead: `Stats.rcBestLap` remains Port; new `Stats.rcBestLapFoundry` stores Foundry. Result routing belongs to the hub owner. No profile/Store edits or live-data operations in this worker.

## Changed files

- New `shared/racecourse.ts`: course registry, Foundry route, hazards and scenery.
- `shared/track.ts`, `shared/kart.ts`, `shared/hazards.ts`, `shared/kartnet.ts`: opt-in strict checkpoint crossings, appended item IDs, press collision/phase and shield misc bit.
- `server/race/race.ts`, `room.ts`, `bot.ts`: course identity, item authority, result tagging, bots and press planning.
- `client/race/world.ts`, `scene.ts`, `match.ts`, `hud.ts`, `hazardvis.ts`; new `itemfx.ts`: chosen course, gate rendering, bounded effects, descriptive HUD and event feedback.
- `client/lobby/boards.ts`: selected-course geometry and course name; clears old position interpolation when course changes.
- `client/race/preview.ts`, `sandbox.ts`: `?track=foundry` in existing development tools; default unchanged.
- New `test/racecourse.test.ts`: 11 focused tests.

## Verification and acceptance boundary

Fresh local Node 24 checks:

```sh
/opt/homebrew/bin/node --test test/racecourse.test.ts
# 11 passed, 0 failed

/opt/homebrew/bin/node --test test/race.test.ts test/kart.test.ts test/kartnet.test.ts test/track.test.ts test/hazards.test.ts
# 62 passed, 0 failed
```

Coverage includes course bounds and deterministic construction, grid/crate/road validity, all safe respawns, forward/reverse/shortcut progression, gate telegraph and bypass, three bot skills completing all three laps, real crate acquisition, item cone exclusions, shield consumption and expiry, snapshot shield bit, cleaner effects, late-entry rejection, course-tagged results, and a complete server race with genuine inputs producing timed laps and a reward.

Solo Foundry completion: easy 261.32 s, normal 238.95 s, hard 221.87 s; no water falls or respawn resets. Full server-race test includes the human pilot and three bots.

Compared against `../backups/game-opus-20261002-215353/source-final.tar.gz`: `shared/maps/ring.ts` and `shared/maps/ringland.ts` are byte-identical. Legacy 62-test race suite remains green.

After common message integration, a fresh full `tsc --noEmit -p .` produced **zero errors in the race-owned files**. The three remaining errors were unrelated new `skill` RoomKind labels in `client/app.ts`, `client/chat.ts` and `client/ui/online.ts`; those files belong to the integration owner. Lead must run the final full type-check/build after integration.

**Not performed by this worker:** server startup, browser/Desktop visual acceptance, live FPS measurements, mobile emulation or real-device mobile checks, full repository suite, deployment, commit, SSH or production data checks. No release/readiness claim follows from these local tests.

Useful existing dev routes for lead acceptance:

- `/tools/race-sandbox/?track=foundry&auto=1&q=high` — actual race client, HUD/prediction, six karts.
- `/tools/race-preview/?track=foundry&auto=1&cam=9` — course overview. Other preview camera presets retain legacy Port framing.
- Default routes with no `track` parameter remain Port.
