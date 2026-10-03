# Card table update implementation plan

> Worker execution: use the existing subagent development and verification workflows, with the user's explicit instruction to begin. No extra design approval or commit step is required for this authorized local change.

**Goal:** Let seated Durak players repeat a finished game, and convert the third cafe table to a complete multiplayer Blackjack game against a dealer.

**Architecture:** Preserve map coordinates, interaction IDs and the shared seated-card pose. Route the third table (index2, seats12–17, at18/11) to a separate authoritative Blackjack hall. Durak remains on tables0/1. UI consumes server views and cannot choose cards, balances or rewards.

**Stack:** Node24.15.0, existing TypeScript/Three.js/WebSocket/Vite; no new runtime dependencies.

## Current scope and authority

- Roman requested local implementation and delegation to **GPT-6 Astra / High**, superseding the earlier6.1Sol/max worker preference for this new task. Fast preference remains; configured service tier is priority.
- Desktop is primary per AGENTS.md. Preserve fishing achievements, all existing interaction coordinates and unrelated release code.
- Current production release is20261002-215353. Its source/payload backup is under `../backups/game-opus-20261002-215353/`. This directory is not a Git checkout; do not create one or overwrite user work.
- The previous deployment authorization covered that completed release. Collect this change with the additional tasks Roman said are coming; no production writes or restart during development.

## Workers and ownership

1. **durak_rematch_astra:** `server/lobby/durak.ts`, `client/lobby/durakhud.ts`, `client/lobby/durak3d.ts`, `client/lobby/durak.css`, Durak tests. Existing `ready` message supplies per-player repeat consent; no new Durak stakes. Optional `allowedTables:[0,1]` prevents phantom games on the converted table while retaining stable view indexing.
2. **blackjack_core_astra:** new `shared/blackjack.ts`, `server/lobby/blackjack.ts`, Blackjack tests; narrowly scoped `server/store.ts`/`profiles.ts` escrow changes. Own server rules, payouts, identity/rejoin, startup refund and graceful settlement.
3. **blackjack_ui_astra:** new `client/lobby/blackjackhud.ts`, `blackjack3d.ts`, `blackjack.css`, focused UI logic tests. Own bottom controls, card rendering and the table's identity; root integrates these classes.
4. **Root:** map/message/scene/hub integration, compatibility tests, independent diff review, full checks/build and desktop browser acceptance. Do not edit workers' files concurrently.

## Accepted game behavior

Durak: preserve the occupied chair after results; bottom “Повторить партию” opts that person in. Other humans must consent themselves; bots can be retained. Show results for the existing timeout, preserve readiness afterward, clear stale hands when dealing, and award each completed game exactly once. Leaving/canceling/rejoining must not trap seats or silently opt someone into a game.

Blackjack: six existing chairs, one shared dealer and a six-deck52-card shoe. Aces count1/11; dealer stands on all17, including soft17. Stakes10/20/50; original two-card Blackjack pays3:2, regular win1:1, tie returns stake. Hit/stand/double; one split to at most two hands for matching ranks, split aces receive one card, split21is not a natural Blackjack. No insurance or surrender. All actual rules and payouts appear in UI.

One person can play. Explicit bet starts a5-second enrollment countdown; cancel refunds only before the deal. During a hand, departure/disconnect auto-stands and settlement credits the profile by persistent ID. Finite turn timeouts prevent a stalled table. Results provide an explicit repeated bet while the player remains seated; no automatic repeated spending.

Stake reservations and their escrow are saved together. Settlement clears escrow and credits a return once; startup returns interrupted reservations once. Preserve all previous profile fields and fishing data. Graceful hub shutdown settles Blackjack before closing/flushing.

## Frozen integration interfaces

Core exports `BlackjackAct`, `BlackjackView` and `BlackjackHall` with `canSit/sit/stand/rename/act/step/view/isLocked/shutdown`.

- Client: `{t:'blackjack',table:number,a:BlackjackAct,rev:number,amount?:number}`.
- Server state: `{t:'blackjack',v:BlackjackView}`; welcome includes `blackjack:view`.
- Server rejection: `{t:'blackjackError',message:string,rev:number}`, followed by the current view. Revision changes only with semantic state, not the ticking countdown. No automatic purchase retry.
- Hall hooks: `broadcast(view)`, `toast(slot,text)`, `reserve(pid,round,amount)`, `settle(pid,round,wager,payout)`; identity is a profileID, never a reusable lobby slot.
- UI: `BlackjackHud(parent)`, show/hide/setView/setBalance/tick/escape, visible/locked, onAct/onLeave/onError. `BlackjackTable3D(scene,18,11)` supplies setView/setMe/view/reset/dispose. Workers publish any signature correction before root wiring.

## Implementation and acceptance

- [ ] Durak red→green tests: seated repeat, independent consent/cancel, timeout, departure/rejoin, fresh hands, two valid payouts and disabled table2.
- [ ] Blackjack red→green: ace totals/naturals, dealer rules, win/push/bust, double/split, insufficient balance, stale/duplicate/forged actions, hidden hole card, rejoin, offline payout and restart escrow recovery.
- [ ] Integrate exactly two Durak tables plus one Blackjack table, keeping all six new fishing spots and original seat positions/IDs intact. Authenticate actions against the actual seated profile.
- [ ] Real-Hub tests cover wrong-table action rejection, physical chair ownership, leaving/switching/rejoining, separate game routing and shutdown persistence.
- [ ] Independently inspect worker diffs; run `npm run check`, `npm test`, `npm run build` with Node24, then production-CSP desktop browser flows using temporary data.
- [ ] Verify rematch twice without leaving; play Blackjack through wager→hand→settlement→repeat/exit, confirm tokens and dealer concealment. Test basic mobile operation briefly and label limitations honestly.
- [ ] Update README and `docs/card-games-2026-10-03/` reports. Preserve release baseline and document any data migration/rollback implications before a separately authorized deployment.
