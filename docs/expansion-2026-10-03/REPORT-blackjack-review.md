# Independent Blackjack money and routing review

Outcome: **no material correctness defect found in the bounded server/rules/escrow/routing scope inspected**. This is an independent review by the Fortress worker, not the Blackjack implementer. No implementation source was changed by this review. Only this report was added; the independent probe lives in `/tmp`.

## Scope and evidence

Read `shared/blackjack.ts`, `server/lobby/blackjack.ts`, relevant `server/profiles.ts` / `server/store.ts`, and actual Hub/Lobby routes, membership, departure and shutdown paths. Skill, wardrobe, race features were not reviewed; profile preservation checks include existing fishing progress and owned items only at the intersecting money API.

| Boundary | Inspected behavior and fresh proof |
|---|---|
| Physical table authority | `server/lobby/room.ts:342`: Durak refuses table 2; Blackjack requires the actual held Blackjack chair, explicit table 2 and non-ephemeral profile. `server/lobby/blackjack.ts:110` additionally requires matching live slot/chair and safe exact revision before allowed-action validation. Real Hub wrong-table/duplicate tests passed. |
| Bet/cancel/rebet | `server/lobby/blackjack.ts:115` creates a new UUID for each initial wager. Cancellation settles exact reserved stake and clears reservation before rebet. Replays cannot settle another reservation. Stale/duplicate and cancel/rebet tests passed. |
| Double and split | `server/lobby/blackjack.ts:125` reserves additional funds before drawing/replacing hands. Double draws once and stands; split is limited to one pair and split aces get one card each. Existing insufficient-funds tests passed. Independent split-plus-double-both-hands probe reserved 40 total, then correctly paid 40 for one winning doubled hand and zero for the losing doubled hand. |
| Naturals | `server/lobby/blackjack.ts:218`: player bust/dealer natural checks precede ordinary comparisons; natural versus natural pushes, natural versus ordinary hand pays full 2.5× return; split 21 is ordinary 2× win. Tests passed; bet options 10/20/50 keep all natural payouts integral. |
| Escrow persistence | `server/profiles.ts:235` subtracts available balance and extends one exact reservation, then synchronously flushes. `server/profiles.ts:249` validates round identity and exact aggregate wager, clears escrow and durably pays once. `server/store.ts:84` normalizes escrow, and atomic write uses temporary file, fsync and rename. Persistence tests passed. |
| Abrupt restart | `server/profiles.ts:73` refunds unresolved saved reservations and clears them before another login. Independent disk reload after bet→split→double restored the aggregate 30 reserve exactly once, including a second reload, preserving XP 777, fishing counter 21 and an owned item. This is refund-on-interruption, not restoration of a partially played hand. |
| Graceful shutdown | `server/lobby/blackjack.ts:272` refunds undealt stakes; dealt hands autostand and receive the ordinary dealer settlement. `server/hub.ts:793` invokes this before final store flush and close. Repeated shutdown and disk state checks passed. |
| Departure and reused slot | `server/lobby/blackjack.ts:83` retains profile-bound dealt hands but clears departing slot; reentry is limited to the original chair until resolution. `server/lobby/room.ts:265` / `:851` release physical membership; payouts route by profile identity in `:374`. Real Hub reused-slot, reconnect and other-room payout tests passed. |
| Last player leaves | `server/hub.ts:245` keeps the loop active for a live Blackjack round; `:754` still steps the lobby. Real Hub test settled the offline hand and then became idle after result cleanup. |
| Dealer privacy | `server/lobby/blackjack.ts:283` returns `-1` for the hole card and null dealer total throughout play, revealing only in dealer/result. Independent probe inspected every play broadcast and mutated returned dealer/player arrays; no hole disclosure or mutation of authoritative hands occurred. |

## Commands and results

1. `/opt/homebrew/bin/node --test test/blackjack.test.ts test/blackjack-persistence.test.ts test/profiles.test.ts test/store.test.ts`
   - **35 passed, 0 failed, 0 skipped**, exit 0.
   - Captured output: `/tmp/bj-independent-baseline.log`.
2. `/opt/homebrew/bin/node --test --test-name-pattern='physical chairs|wrong table|standing before|active hand|last human|shutdown settles|reused lobby|disconnect and rejoin' test/expansion-hub.test.ts`
   - **8 passed, 0 failed**, exit 0. Only Blackjack integration cases selected; other expansion cases were outside review scope.
   - Captured output: `/tmp/bj-independent-hub.log`.
3. `/opt/homebrew/bin/node /tmp/blackjack-independent-probes.mjs`
   - Both independent probes passed: mixed split/double settlement plus broadcast/view privacy; aggregate escrow recovery plus profile preservation.
   - Used a uniquely created temporary data directory, removed after checks. Never opened production data.

## Findings communicated and limits

No actionable server finding was sent because none was established. The no-finding result and exact test/probe evidence were sent to root and `blackjack_ui_astra` before completion. This report does not certify the browser UI, actual WebSocket transport, desktop/mobile interaction, probability distribution, storage-device failure handling, production migration, rollback compatibility or deployment. No server, browser, full suite, SSH or real profile data was used. Root retains the integrated release gate and human acceptance.
