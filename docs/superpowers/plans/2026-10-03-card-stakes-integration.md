# Optional card stakes and expansion wiring

## Status / remaining

- [x] Read current ASTRA/AGENTS, card halls, Hub, UI and persistence contracts.
- [x] Blackjack: explicit free participation, zero-money settlement, profile identity, UI and regressions (17 hall tests green).
- [x] Durak: optional per-human consent, host ante, atomic reserve on deal, conserved payout/refund, no automatic rematch spending; preserve statistics/cosmetics (41 card tests green; real Hub bank/net-XP test green).
- [x] Integrate central profile XP callback, owner levelUp, milestone chat, metadata and mode-only credits; final scoped strict TypeScript green.
- [x] Retrofit SKILL flag and add authoritative three-second paintball/fort entrance dwell (6 tests green); initial spawn inside disarmed until exit/reentry, full-room reset tested, disabled SKILL collision checked.
- [x] Integrate flagged BoatRace/Hide/Storm/Pirates; real Hub queue/rejoin/cancellation and event/tail/menu/weather tests green. HIDE E during active round supports room-authorized rejoin/spectating; automatic queue waits for next round.
- [x] Run focused Node 24 tests/type checks; root owns remaining full gate and browser acceptance. Card source frozen for independent review.

## Ownership

This worker owns Durak/Blackjack halls and HUDs, their scoped tests, Hub/LobbyRoom/main integration, test kit, and new shared start-zone constants (coordinates agreed with root). Root owns common protocol/map/client-scene wiring. Central persistence/levels worker exclusively owns Store/Profiles/economy; mode peers own feature modules. No production operations or persistent profile reset by this worker.

## Contract and sequencing

Durak reserves only at deal after all current humans are ready. Host selects 10/20/50; every human explicitly chooses paid or free. Ante changes reset readiness. First finisher wins the bank only if their original hand was staked; free/bot winner or draw refunds all bettors. No minted payout; one bettor can only receive their own reserve. Reset opt-in after every result. Preserve an immutable round participant ledger even if a player disconnects or becomes a bot. Central APIs reserveDurakBatch(round,bets) and settleDurak(round,payouts) provide atomic persistence and net-profit XP; refunds/no-bet/BJ provide no XP. Unfinished paid games refund on shutdown/abandonment.

Blackjack uses a separate participation flag so a zero bet still deals a real hand. Free double/split retain game rules with zero extra spend and zero payout. Server seat DTO adds profile ID for safe reclaim. New modes are off by default outside DEV; no production flags are changed. Start-zone dwell uses server position, resets outside/held/full/room transitions, and leaves E available.

## Verification / rollback boundary

Use disposable stores only. Meaningful regressions cover money conservation, zero balances, no paid auto-rematch, reserve rejection atomicity, identity through departures, shutdown, mode gating and entry dwell. Existing released fishing data is outside this worker's write scope. Profile schema rollback belongs to the central owner; a code-only rollback across new escrow fields is not safe. Browser/CSP/full suite/build/release remain root gates, explicitly outside this worker's run scope.
