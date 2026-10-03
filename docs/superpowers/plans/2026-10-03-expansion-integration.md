# Game Opus expansion — integration ledger

Status: local implementation and integration complete. Final check/test/build passed (762 tests); production-CSP startup and desktop flows checked. No deployment of this batch. Final evidence and remaining release boundaries: ../../expansion-2026-10-03/STATUS.md.

Desktop is the acceptance platform. Existing production release 20261002-215353 is a separate completed release. This directory has no Git metadata: preserve source changes, do not initialize/reset/commit. Test only disposable local DATA_DIR.

## Scope and owners

| Work | Owner | State |
| --- | --- | --- |
| Durak rematch, Blackjack, voluntary stakes | blackjack_ui_astra | Integrated; independent money review and desktop flows passed |
| Common server, flags, event/room queues | blackjack_ui_astra | Integrated; final CSP gate passed |
| Skill course and second kart track | sky_skill_astra / completed kart worker | Integrated; actual-input course tests and browser entry/return passed |
| Boat race and common client app | sky_skill_astra | Integrated; 6-player simulation and browser entry/return passed |
| Fishing progression migration, general XP/frames | blackjack_core_astra | Implemented; independent synthetic migration review passed |
| HIDE prop hunt | blackjack_core_astra | Integrated; independent review and 2-client browser actions passed |
| Fish motion/difficulty | fish_patterns_astra | Implemented and calibrated; final gate pending |
| Level metadata in existing combat/race modes | fish_patterns_astra | Integrated; mode tests and profile visual fixture passed |
| Harbor, Tokarevsky lighthouse, roof shark, podium | fishing_harbor_astra | Integrated; 12-player access and desktop visual checks passed |
| Critters, start-circle visual component | fishing_harbor_astra | Integrated; desktop E-petting and entry circles checked |
| Fortress scaling, stairs, rally | fortress_expansion_astra | Integrated; stairs/scaling tests and browser entry passed |
| Storm / pirates / exclusive event director | fortress_expansion_astra | Integrated; storm reward and pirate wave3/defeat desktop runs passed |
| Wardrobe prices/items/hat fitting | completed wardrobe worker | Integrated; actual local purchase and running visual checked |
| Fisher dialog | blackjack_ui_astra | Integrated; bottom scroll/header X actual click passed |
| Kraken and PTT feasibility | blackjack_core_astra | Implemented kraken, feasibility document; no voice implementation |
| Shared protocol/map, Lobby client, world/audio, final QA | root | Complete locally; exact source/build hashes preserved |

## Decisions grounded in user instructions

- Fishing reset includes rods: the user explicitly chose to unlock rods again through quests. It must not touch species, historical catches/stats/leaderboards, money, clothing, or active purchased beer.
- General player XP is separate and backfilled before/as independently versioned from the fishing progression reset.
- Optional Durak stakes form a closed pot. A free winner or draw refunds contributions; a free player earns no pot. Blackjack free play has zero payout. Blackjack/casino/returned principal never grant general XP.
- All new standalone modes default to DEV only unless explicitly enabled. Disabled mode visuals, collision, entry and server behavior must agree.
- Add a bounded visible sand shelf with matching physics for crabs, away from memorial and fishing cast lanes. No memorial edits.
- Subagents are GPT-6 Astra High; existing older completed workers are not reused.

## Verification and done boundary

1. Verify contracts and common integration; independently read relevant returned code and tests.
2. Node 24 typecheck, full tests, production build. Repeat only after new changes/failures.
3. Isolated local server + production CSP: desktop game entry, each new mode entry/exit, fish NPC scrolling/close, cards/rematch/stakes, new harbor from multiple angles, event controls and critters. State machine/wire tests cover full rounds where manually waiting is insufficient.
4. Preserve actual screenshots/logs outside the project; report measured and unverified boundaries honestly. Brief mobile smoke only, no real-device claim.
5. No production deployment in this batch without explicit authorization. A later release requires approved code/data snapshot and retention rehearsal on the exact latest save. Old code-only rollback is unsafe for new species/schema.
