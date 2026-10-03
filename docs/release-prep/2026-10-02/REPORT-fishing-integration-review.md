# Independent fishing integration review

Final result: one confirmed P2 was fixed and independently rechecked. No unresolved authority, reward duplication, cast-expiry, persistence, collection or cancellation defect found in the reviewed state. Closed after the server/UI/geometry checkpoints and the rules worker's final 32-species source freeze. This is a bounded integration review, not browser acceptance or release approval.

## Resolved finding

**P2 — a rate-limited NPC request left the dialog waiting indefinitely.** A fast connection allowed opening the NPC and alternating earned rods more than six times within one second. The server silently dropped the seventh request; `FishNpcDialog` kept its pending flag, disabling every action until the dialog was closed. Reproduced through the real in-memory Hub with temporary test storage: seven requests produced six replies.

The server now responds with authoritative unchanged progress and a refusal, opening the dialog only when proximity is currently valid (`server/lobby/room.ts:439–451`). The client adds a five-second timeout without an automatic retry, clears pending on replies/scene reset and suppresses late reopening after a user close (`client/lobby/fishnpcdialog.ts:142–207`; `client/lobby/fish2hud.ts:149`; `client/lobby/scene.ts:1237`). The targeted Hub regression passed **1/1**, exit 0: `/opt/homebrew/bin/node --test --test-name-pattern='NPC сообщает о rate limit' test/fishauthority.test.ts`. Log: `/tmp/opus-fishing-rate-review.log`.

## Scope and evidence boundary

Read desktop-primary `AGENTS.md`, `CONTRACTS.md` and the changed progression/rules, fishing server, weather, board/podium, profile/store, room/Hub, protocol and client NPC/reel/collection/app routing. Checked server proximity/room/balance/earned-rod authority, sequential quest subtraction, immutable cast modifiers, fish-only XP/quest counting, repeated reel handling, beer/event expiry, preserved saves/wardrobe, individual daily podium ties/rollover, dynamic 12-spot arrays, leave/rejoin cancellation and FISH2-off fallback. Reviewed live owned source rather than treating worker reports as proof.

The original 30-species target was superseded during review by **32**. Verified `bluemarlin`/legendary and `greenlandshark`/mythical at appended IDs 34/35, both event-only; all 34 prior `FISH` rows/IDs remain exactly equal to release 6. Picarel is now the unique common event fish. Client collection/profile/album counts and server reward eligibility use `COLLECTION_SIZE`; an unrewarded old-30 profile gets the outfit only after the 32nd species, while earned outfits stay owned.

## Fresh verification

- `/opt/homebrew/bin/node --test test/fishauthority.test.ts test/fishserver.test.ts test/fishhall2.test.ts test/fishprogress.test.ts test/fishmods.test.ts test/weather.test.ts test/store.test.ts test/profiles.test.ts`: **66 passed, 0 failed**, exit 0. Covers real Hub/room authority, repeated claims/reels, mid-cast expiry, all-room event changes, expired-event rejoin, profile/save migration, new 32-species rewards and persisted new catches. Log: `/tmp/opus-fishing-integration-review-tests.log`.
- `/opt/homebrew/bin/node --test test/fishplaces.test.ts test/fishaccess.test.ts test/fishui.test.ts`: **17 passed, 0 failed**, exit 0. Covers all six new full fishing cycles, 12 simultaneous occupants/13th waiting, all 12 legacy fallback cycles, hidden-prop collision removal, geometry contracts and client clock/countdown/confirmed-beer helpers. Log: `/tmp/opus-fishing-access-review.log`.
- After final rules freeze, `/opt/homebrew/bin/node --test --test-name-pattern='коллекция:32|цены:|event-only:' test/fishing2.test.ts`: **3 passed, 0 failed**, exit 0. Log: `/tmp/opus-fishing-32-rules-review.log`.
- A separate in-memory baseline probe confirmed unchanged old rows/IDs, exactly 32 collection entries, new fish absent from clear/legacy fishing, 1,000 identical legacy draw results, and common+75% → event×1.5 → beer×1.1 applied once across all 121 integer weights of picarel.

The initial rate-limit regression is included in the final 66-test run. No full income/difficulty benchmark was duplicated; the rules worker's numerical evidence remains in its report and balance JSON. Native dialog and rendered album behavior are still a separate browser acceptance boundary. New raster asset generation was owned separately and is not certified by this source review.

No implementation edits, full suite/typecheck/build, browser/server startup, production/data access, commits or deployment. This report is the only project edit for this review. Root still owns the integrated gate, final desktop NPC/album/spot/reconnect acceptance and basic mobile checks.
