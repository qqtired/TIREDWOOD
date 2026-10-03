# Optional stakes and current server batch

Status: local implementation complete; source frozen for root integration and independent card review. No server/browser/build/full-suite/deploy/SSH/production operation was run by this worker.

## Cards

- Blackjack supports explicit zero-cost participation independently of `bet > 0`. All normal actions, including split and double, retain their rules at zero cost. Free hands never reserve, settle, mint coins or grant XP. Positive stakes retain escrow behavior. DTO exposes `pid` and `participating`; HUD defaults to free and requires explicit action for every repeat.
- Durak host selects 10/20/50 ante; each human explicitly opts into paid or free play. Changes reset readiness. Reserve happens as one atomic profile batch at deal; a failed participant balance check deals no cards and spends none of the batch. Bots remain free.
- An immutable original-chair stake ledger survives leave/rejoin and temporary bot substitution. The first finisher receives the conserved bank only if that hand was staked; free/bot first or draw refunds all bettors. One bettor can only receive their own stake. Shutdown/abandonment refunds an unfinished bank. Exact-once atomic persistence belongs to the central Profile APIs.
- Previous free Durak coin rewards were removed; statistics, fool cap, epaulets and explicit rematch remain. Paid opt-in resets after every game, so rematch readiness alone cannot spend again. Only positive net Durak profit earns XP, inside central settlement; Blackjack never earns XP.
- HUDs show optional participation, table ante/bank, expected cost and actual return. Existing player names remain escaped/text nodes. Visual browser acceptance remains pending root QA.

## Global progress and flags

Hub routes paintball/race/fort/fight/boat/hide/event monetary rewards through `credit(...,'mode')`. The three existing fishing credit calls now also specify mode; slots remain default other. Central owner keeps fishing quest and Durak settlement classification. `Profiles.onLevel` sends one `levelUp` to the owner, refreshes `me`, lobby roster/outfit metadata and online levels, and announces crossed milestone frames only. Rename also refreshes current-room metadata through the outfit adapter. Other-mode metadata adapters belong to their peers.

`SKILL`, `BOATRACE`, `HIDE`, `STORM`, `PIRATES` default off outside DEV; explicit environment 1 enables, 0 disables. DEV forced events require DEV plus `DEV_STORM=now` / `DEV_PIRATES=now`. No production configuration was changed. SKILL-off omits welcome metadata, rejects portal entry and removes portal collision boxes.

## Entrances and room lifecycle

- `shared/startzones.ts` exports `START_DWELL_TICKS=180`, small paintball/fort zones and `GatherStatus`. Server sends personal `startZone {kind,left}` seconds. Dwell resets outside/held/menu/full. Initial spawn inside is disarmed until exit/reentry; freeing a full room does not silently transfer a waiting player. Existing E entry remains.
- `ModeQueue` handles only Boat/Hide queues, preserving arrival order and dropping stale room departures. Both use the existing 15-second gather duration. Boat supports solo plus server bots, maximum six. Hide requires two overall participants, maximum eight; an already waiting room participant counts toward the minimum. Kart/Fight countdown policies remain unchanged.
- Boat/Hide welcome and status envelopes are `{boatrace|hide: v}` / `{t:'brSt'|'hideSt',v}`. `Hub.startBoatRace` and `startHide` own scene/epoch transfer. Return spawns use root map fields outside their circles. HIDE E during an active round enters according to room capacity/rejoin/spectator rules; its automatic queue waits. Boat has no live-race rejoin.
- New rooms participate in stepping, active/busy state, leave, outfit/name updates, chat and online roster. Hide remains stepped through finite cancellation after everyone leaves. `brBestLap` is stored in ticks, as defined by Stats. Controller result hooks own once-only result eligibility; Hub owns profile credit/stat updates.

## Large events

Enabled Storm/Pirates controllers share the peer director. It is stepped before player simulation, persists scheduling metadata before start and keeps Hub active while needed. Existing rain blocks event start; active events hold new rain and reject the fishing drum before spending. Event rewards resolve profile ID and update the currently connected client, never a reused lobby slot.

`lobbyMenu {open}` is transient per lobby player. Menu/held/fishing/wardrobe/riding and ephemeral players are excluded from participation and effects. Storm and pirate input copies compose around the existing AquaDyn/stepHeld simulation with the same clamped aquaClock tick. Pirate swings use real authoritative input. Only enabled PIRATES appends the per-viewer pirate tail, immediately after entities plus existing ball bytes; menu/ineligible viewers receive an empty invisible tail. Root owns matching client predictor/tail parsing and visual controls.

## Fresh evidence

- Combined scoped integration run: **104/104 passed**, covering card halls/rematch, paid/free real-Hub XP, entry zones, events, queues, new rooms and existing Hub/lobby scenarios.
- After the final HIDE E route: **4/4 new-mode Hub tests passed**, including reconnect reclaim. After the additional full-room and SKILL collision assertions: **6/6 entrance/flag tests passed**.
- Existing fishing/fishing2/fishprogress credit-path regressions: **28/28 passed**.
- Final focused strict TypeScript check of all owned server/HUD modules and integration tests passed. Both card CSS files parsed successfully with PostCSS.
- Independent voluntary-stakes audit was requested by root and is performed by fish_patterns_astra against frozen card source; its conclusions are separate from this worker's evidence.

Initial meaningful red cases were observed for free Blackjack participation, Durak reserve/payout/consent, entry dwell/flag gates, event routing and HIDE reconnect reachability. No success claim here covers production migration, full gate, rendered HUDs, real device input, or root's later concurrent edits.
