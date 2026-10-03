# Fishing server — incremental evidence

Scope: persistence, authoritative purchases/quests/rod selection, fishing protocol and replay, weather events, daily podium. No deployment, real-data access, server or browser startup. Source is non-Git; comparison baseline is `backups/release-6-source-baseline/game-opus`.

## Checkpoint 1 — persistence and authority primitives

- Added `Profile.fishing` defaults/migration; legacy fish totals and albums remain. `fsMaxGrams` recovers the largest real fish from the album; new counters start at zero because historical cast/loss/earnings totals cannot be reconstructed safely.
- Persistent `State.fishPodium` keeps three individual catches with timestamp ties; a player may occupy several slots. Moscow day rollover clears the podium, preserving four old leaderboard lists. Loaded entries validate fish/weight/day; no album-to-podium fabrication.
- Server profile methods own beer price15,10min expiry/rebuy rejection, sequential `5*(done+1)` quest claims, rewards×5, surplus carry, and rods at1/5/10. Integer earned-rod selection only.
- Normal rain duration is doubled to6–10min. Forced rain uses the same state transition and duration; already-active rain cannot be prolonged. A wall-clock deadline prevents expired events surviving a paused tick loop.
- Red: all8 new server tests failed against old code for absent behavior. Green: `/opt/homebrew/bin/node --test test/fishserver.test.ts test/weather.test.ts test/store.test.ts test/profiles.test.ts` —27 passed,0 failed.

## Stable client integration contract

- `me.fishing: FishProgress`; `fishProgress {progress,now}` and NPC response `{progress,now,open?,message?}` use server milliseconds. Requests `{t:'fishNpc',a:'open'|'beer'|'rain'|'claim'|'rod',rod?:number}` accept no client prices/XP.
- `fishReel {spot,sp,seed,mods:FishCastMods}` freezes `level,rod,zoneScale,biteSpeed,rareMultiplier,incomeScale` at cast. Client and server use `reelStyleFor(sp,mods)`. `fishPrice2(sp,g,coins,mods)` applies beer to fish sale only; quest/discovery/treasure rewards stay independent.
- `FishBoardView extends FishTop {podium:FishPodiumCatch[]}`; `FishPodiumCatch {pid,nick,sp,g,at}`. `lobby.ftop` and `fishTop.top` use this view; `dn,dg,an,ag` remain.
- Added `stats.fsCasts,fsBites,fsLost,fsMaxGrams,fsEarned`. Actual fish totals/weight/chests remain `fsFish,fsGrams,fsChests`; unique species are derived from the collection. `fsEarned` includes fish/chest sales, discovery and quest rewards earned since the counter was introduced.

## Checkpoint 2 — room/Hub and deterministic replay

- Wired NPC interaction and independently validated distance/height on every request; disabled mode and ephemeral users cannot purchase. Server ignores forged prices, catch totals, XP and reward amounts.
- Captured immutable cast modifiers once; bite waiting is divided by rod speed, while cast timing remains unchanged. `fishReel.mods` and optional `lobby.fish[i].mods` carry the same snapshot. Both replay and final price use it even when beer expires before the bite. Perfect catch XP comes from the tick-accurate server replay.
- Actual fish alone advance skill, current quest, weight totals, max weight and podium. Chest/junk/escaped fish do not. Repeated reel completion cannot pay again. Casts, bites and real-fish losses update profile counters; early empty-line attempts do not count as lost fish.
- Hub now steps weather independently of lobby presence. Forced/natural event starts and ends reach all five rooms exactly once per transition. New login after all-player absence checks an expired deadline before its welcome. Beer expiry updates profile state in other rooms too.
- Existing disconnect behavior remains: an unfinished cast/reel is cancelled; saved progress and buffs recover on reconnect. Completed catches are persistent, not replayed for extra rewards.
- Disables geometry-owned `map.fishPropsBoxes` only when FISH2 is off, preventing invisible NPC/board/podium colliders; existing visible deck/mooring colliders remain.
- Added regressions after reproducing two edge cases: reading a fresh welcome no longer consumes a pending board broadcast; a corrupt maximum-Date podium timestamp no longer makes valid profiles fall through corrupt-state recovery.
- Fresh scoped command `/opt/homebrew/bin/node --test test/fishauthority.test.ts test/fishserver.test.ts test/fishhall2.test.ts test/weather.test.ts test/store.test.ts test/profiles.test.ts` —51 passed,0 failed. Geometry-owned `fishaccess` disabled-mode regression separately passed after observed red.
- Strict TS7 scoped compilation of owned server/shared/test files with project compiler flags —exit0. Whole-project check earlier showed ongoing UI/geometry/rules type errors; owners were notified. Root owns the final complete gate/build/browser acceptance.

## Migration and rollback boundary

- Synthetic tests prove old v1 profile/file→new defaults, legacy totals/album preservation, and new progress/beer/all stats/podium→atomic save→reload. No real data was read.
- New cast/loss/earnings counters start at zero for old profiles; XP/quests start at zero rather than inventing historical rewards. Maximum real fish weight can be reconstructed from the album.
- State remains v1 for forward compatibility. A code-only rollback to the old saver is unsafe: it does not know the new fishing/podium/stat fields and can discard them on its next save. Rollback must preserve the new-data snapshot and use a compatible reader/saver or restore a deliberately selected pre-upgrade data snapshot. Root rehearses backup/restore; no sidecar was introduced.

## Final checkpoint — approved32 species and integration review

- Rules worker appended `bluemarlin` at34 and `greenlandshark` at35; both are actual collection fish in the existing event pool. Server eligibility remains derived from shared rules and `COLLECTION_SIZE`.
- New bounded regressions prove old30 species do not complete the current32 collection; blue marlin gives31, Greenland shark gives32 and grants the outfit. Their real max-weight catches update XP, quests, counters and podium and survive atomic save/reload. Previously granted collection outfits survive an old30 profile's next catch and save without revocation.
- Independent integration review reproduced the NPC pending-state problem after6 requests/sec. Server now returns authoritative progress and an explicit rejection message for a limited request, with `open` reflecting current proximity; no spend or rod mutation occurs. The open+6 rod request regression changed from6 responses (red) to7 responses (green). UI worker owns the separate bounded recovery for network silence.
- Final scoped verification: `/opt/homebrew/bin/node --test test/fishauthority.test.ts test/fishserver.test.ts test/fishhall2.test.ts test/weather.test.ts test/store.test.ts test/profiles.test.ts test/hub.test.ts test/lobby.test.ts test/fishing.test.ts` —96 passed,0 failed,0 skipped; full output captured outside the project at `/tmp/game-opus-fishing-server-tests.log`.
- Final strict scoped TS7 check with all project compiler flags against owned server/shared/test files —exit0. No full-suite/build/browser/server acceptance claim: root owns those final gates.
- Independently inspected source diffs against the preserved release baseline for all nine owned server/shared files. No edits to game rules, progression math, maps, UI, production data or secrets.

Changed source files: `server/lobby/fishing2.ts`, `server/lobby/weather.ts`, `server/lobby/fishtop.ts`, `server/lobby/room.ts`, `server/hub.ts`, `server/profiles.ts`, `server/store.ts`, `shared/messages.ts`, `shared/economy.ts`. New tests: `test/fishauthority.test.ts`, `test/fishserver.test.ts`. Updated regression fixtures: `test/fishhall2.test.ts`, `test/store.test.ts`.

Owned implementation is complete. Remaining shared acceptance: root's final complete gate/build, desktop browser playthrough and short mobile smoke, migration backup/restore rehearsal and any resulting integration repair. The data-aware rollback limitation above remains material.
