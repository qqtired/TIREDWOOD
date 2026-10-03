# Blackjack: server rules and persisted stakes

Implemented locally on 2026-10-03. This report covers the server/rules subtask only; it does not claim browser acceptance, deployment, or production-save migration verification.

## Files

- `shared/blackjack.ts`: public DTO, card names/value calculation, stakes and timers.
- `server/lobby/blackjack.ts`: table 2 with chair arguments 12–17, server-only crypto shuffle, round lifecycle, authority/revision checks, disconnect/rejoin, settlement and shutdown.
- `server/profiles.ts`: reserve/settle operations by persistent profile ID; startup recovery of unsettled reserves.
- `server/store.ts`: optional `blackjackEscrow` schema and normalization; existing progress normalization retained.
- `test/blackjack.test.ts`, `test/blackjack-persistence.test.ts`: isolated rules/lifecycle and real atomic-file persistence tests.

## Rules and lifecycle

Six 52-card decks shuffled with Node crypto for each round. Stakes 10/20/50. Aces are 1 or 11. Dealer stands on every 17, including soft 17. Original two-card Blackjack pays 3:2; ordinary win 1:1; push returns the stake. Hit, stand, double and one split into at most two hands are supported. Split requires identical ranks. Split aces receive one card each and stand; split 21 is not a natural. No insurance or surrender.

First explicit bet starts a five-second countdown. Cancel/leave before dealing returns the reserved amount. After dealing, leaving never cancels the wager: the player's remaining hands stand and the normal outcome pays their profile, even after their network slot is reused. A player may reclaim their reserved chair; they cannot acquire another chair while their original seat is reserved. Action timeout is 20 seconds. Dealer reveals then draws at one-second intervals. Results remain for eight seconds, followed by explicit bet consent for a new round. No automatic repeat stakes.

`rev` advances on semantic state changes; timer-only broadcasts do not change it. Every client action requires the current revision, preventing duplicate hit/double/split or stale actions from crossing hands. Dealer hole card is serialized as `-1`, and dealer total as `null`, until reveal. Server state/shoe is not included in the DTO.

## Persistence contract

`Profile.blackjackEscrow?: { round: string; amount: number } | null`.

`Profiles.reserveBlackjack(pid, reservationId, amount)` atomically persists the decreased balance and aggregate reserve before accepting the wager/additional double or split. `settleBlackjack(pid, reservationId, exactWager, totalReturn)` atomically clears that reserve and credits the aggregate return once. Every initial/repeated-after-cancel bet gets a distinct UUID reservation; later double/split additions use that same reservation.

A new `Profiles` instance after loading state returns all unsettled reserves once, clears them and flushes before accepting play. Already-settled returns survive reload without a second payout/refund. Unexpected-process-death recovery returns the reserved stake, not a reconstructed card outcome; live rounds are not persisted. Graceful `hall.shutdown()` refunds undealt bets and completes dealt hands by autostand plus normal dealer play. Root integration must keep `hall.active` stepping without connected humans and invoke shutdown before final store flush.

All existing profile fields remain on the same state object. No Blackjack statistics or achievements were added. Tests explicitly retain fishing XP, catch counters and earned/owned items through recovery; existing store/profile tests also remain green. Live production data was not opened or changed.

## Verification

Node v24.15.0 at `/opt/homebrew/bin/node`.

- `/opt/homebrew/bin/node --test test/blackjack.test.ts test/blackjack-persistence.test.ts test/profiles.test.ts test/store.test.ts`: **33/33 passed**.
- `/opt/homebrew/bin/node node_modules/typescript/bin/tsc --noEmit -p .`: passed at the inspected integration snapshot.
- Observed failing tests before persistence implementation and before offline-active/reservation-identity fixes; rules tests initially failed because the new modules did not yet exist. Additional payout/multiplayer cases passed against implemented rules.

Coverage includes ace totals, solo/natural/push/dealer-natural results, soft 17, hidden hole card, double debit/draw count, split aces, same-rank split hand order, insufficient funds, wrong seat/slot/player, stale and duplicate actions, cancel/rebet reservation identity, multiplayer payout, disconnect/slot reuse/rejoin, timeout, offline ticking, graceful shutdown, durable payout and repeated restart recovery.

Full suite/build, browser desktop/mobile checks and root protocol/map integration are coordinated by the parent task and were not run as part of this subtask. Production release still requires the repository's stopped-server backup and read-only normalization checks. File-system I/O failure behavior uses the existing Store's synchronous atomic-write/error mechanism; no new storage retry subsystem was introduced.
