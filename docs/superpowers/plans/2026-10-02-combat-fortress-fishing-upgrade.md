# Game Opus: combat, fortress and fishing upgrade

**Authorization:** Roman approved the complete proposal in this chat and explicitly requested implementation, a serious final-wave fortress boss, and the attached fishing patch. All workers: `gpt-6.1-sol`, reasoning `max`. Local implementation and validation only; no deployment, commits, production data or configuration changes.

**Goal:** responsive first-person fighting; consistent graphics controls; cooperative fortress progression with a shop, flying attackers and a final boss; the complete fishing patch integrated into existing mechanics.

**Architecture:** preserve the authoritative 60 Hz server, existing room separation, prediction and binary snapshots. Extend existing modules and shared rule tables. Keep visual quality independent of gameplay, rewards and hit detection.

**Tech stack:** Node 24, TypeScript, three.js, ws, Vite, node:test.

**Spec:** approved proposal in this chat; fishing attachment `/Users/tired/.codex/attachments/14da0682-bc7d-4d88-a825-88baf5bc6f21/Pasted text.txt` (all 648 lines, including NPC/beer addendum).

## Preservation and boundaries

- This directory is not a Git checkout. Baseline source snapshot: `/tmp/opus-upgrade-baseline.pW09qn`.
- Preserve other work, the old fishing fallback, profiles, wardrobe, weather and all existing modes.
- Do not modify the memorial or its assets, sibling `chatgame`, deployment or production configuration.
- Every development/test server uses a new temporary `DATA_DIR`; never the real data directory.
- No new runtime dependency unless a concrete existing capability is insufficient.
- Worker edits are scoped below. Root coordinates overlapping interfaces; no parallel edits to the same shared file.
- Use failing behavior tests for new combat, economic, progression and protocol rules, then implementation and passing checks. Visual acceptance is separately required.

## Ownership and interface review

| Work | Owner | Shared interfaces / conflict handling |
|---|---|---|
| Fight Club | fight worker | `client/fight/*`, `shared/fight*`, `server/fight/*`, fight tests; root owns `client/app.ts` and common renderer. Expose `FightScene.setQuality(q, slow)` for root wiring. Coordinate `client/touch.ts` / shared avatar changes before editing. |
| Fortress | fortress worker | `client/fort/*`, `shared/fort*`, `server/fort/*`, fort tests. Expose `FortScene.setQuality(q, slow)`; prefer the existing `use` message and validated station/action IDs. Request common protocol edits from root. |
| Fishing | fishing worker | fishing modules and new modules, weather, profiles/store/economy extensions, lobby scene/map integration, profile/album UI and tests. Own `shared/messages.ts`, `server/hub.ts`, `client/scene.ts`; coordinate any `client/app.ts` change with root. |
| FPS / integration | root | common renderer, app quality dispatch, lobby effect quality, settings/performance helpers, complete checks and browser acceptance. Root does not overwrite worker modules while active. |

All work agrees on server authority, temporary test profiles and unchanged production deployment. The boss and flyers share the current 60-live-enemy cap. Shop items and fish buffs are validated server-side. No graphics preset may affect gameplay state.

## Task 1: first-person Fight Club

- [ ] Add a first-person camera for active fighters, direct yaw/pitch input, prediction-aware position; retain spectators/results camera.
- [ ] Add separate visible jelly fists, coherent jab/combo/hook/heavy/block/grab/throw animations, local-body hiding only.
- [ ] Pin attack contact to the shared authoritative strike tick. Keep local windup immediate and server-confirmed impact feedback.
- [ ] Remove nearby third-party hitstop from world/network clocks; keep a short local visual accent without freezing view input.
- [ ] Remove abrupt desktop aim snapping and close-opponent disappearance; retain controlled touch assistance.
- [ ] Implement scene quality tiers for MSAA, decoration/crowd update budget and grade effects, preserving combat visibility.
- [ ] Validate combat rules, camera/contact helpers, desktop and touch control compatibility; report exact files and commands.

## Task 2: fortress progression, flyers and boss

- [ ] Make wave roles explicit: learning, directional pressure, climbers, first flyers, combined attacks, final boss.
- [ ] Preserve eight waves and the 60-alive cap; avoid difficulty based only on increased counts/HP.
- [ ] Add a single clear shop during preparation/break, prices/effects/balance/availability, movement/pointer recovery on close. Preserve existing repairs/jam/turrets; add marker magazine and anti-air upgrade.
- [ ] Make wave rewards reliable for all participants; account for turret kills and assistance without minting the full kill bounty per player.
- [ ] Add readable flying enemies with approach, telegraph, attack and recovery, 3D hit detection, suitable routes and ordinary-marker counterplay.
- [ ] Add a substantial final boss: distinct silhouette/name/health bar, multiple attack phases, telegraphed attacks, a meaningful vulnerable window and limited reinforcements; victory only after boss and wave resolve. Scale fairly for 1–6 defenders.
- [ ] Cover purchases, insufficient funds/repeats, late joins, flyer routing/hits, boss phases/defeat, cap and wave completion with behavior tests.
- [ ] Add quality tiers without removing enemy telegraphs or lowering simulation fidelity.

## Task 3: attached fishing patch

- [ ] User addendum: exactly 12 simultaneous fishing spots: preserve old six coordinates/IDs, append two on the main pier (8 total) and four separate lighthouse spots. Verify actual ground/water/collision/approach/exit and distance from NPC, board, podium, memorial, photo and other interactions. Integrate restrained decking/mooring details. Pin old IDs/coordinates and all six new full fishing cycles plus 12-player concurrency in tests; inspect each visually.
- [ ] Move existing four leaderboard categories to pier entrance left; preserve auto updates. Add daily top-three heaviest individual catches with Moscow-day rollover; place atmospheric elderly fisherman NPC at old board location.
- [ ] Integrate NPC modal shop/quests. Beer: 15 tokens, 10 minutes, rare chance and exactly +10% fish income, no lootbox bonus; buff icon/timer, drink animation and gentle sounds. Rain drum: 500, invokes the same weather event.
- [ ] Snapshot original prices and model. Common fish +75% from that baseline; total base fishing income around +50%, excluding lootboxes. Explicitly measure simulation rather than trusting the attachment's old income estimate.
- [ ] Ten fishing levels with documented Stardew-like thresholds/XP; +2.5% control-zone size per level, +25% max; rare chance bonus, max-level safe behavior and persistence.
- [ ] Audit 30 species via measurable effective difficulty and simulated catches. Epic/legendary/mythical movement becomes 20% more controllable while rarity bands remain ordered.
- [ ] Sequential quests requiring 5,10,15,... new catches with N*5 reward, no escapes/lootboxes/double credit. Rod unlocks after quests 1/5/10 with mutually exclusive 10/20/30% bite/ease effects.
- [ ] Generate and integrate three distinct rod images in the existing asset style; document generation provenance.
- [ ] Double natural rain duration; common event/forced rain state, unique species only during event and more frequent than normal rare fish, event reward multiplier with clear scope and no accidental compounding. Notify all players.
- [ ] Expand persistent fishing statistics and responsive album for all 30 species; preserve collection completion and wardrobe.
- [ ] Validate old-profile migration, persistence/reconnect, shop authority, buff expiration, calendar rollover, XP/quests/rods, real deterministic replay and balance simulations.

## Task 4: shared performance and acceptance

- [ ] Wire quality into all active scenes; live-update lobby particle budgets as presets change.
- [ ] Count render statistics per complete frame (all passes); distinguish GPU cost, CPU work, network delay and impact animation.
- [ ] Improve adaptive quality with bounded changes/hysteresis; do not oscillate or alter gameplay. Preserve detail around players/attacks.
- [ ] Independently inspect source diffs against snapshot and each worker's verification, then get independent review.
- [ ] Run `npm run check`, `npm test`, `npm run build` against integrated state. Resolve failures rather than masking them.
- [ ] Browser: desktop/phone layout, first-person punches and phase transitions, fortress shop/flyer/boss, fishing NPC/progression/album, console/CSP. Full deterministic server simulations supplement but do not replace visual checks.
- [ ] Record what is proven and residual limits. Leave a usable local preview, update README with final behavior. No deployment unless separately requested.

## Decisions and progress

- Ruling: execute the already approved scope without another approval stage. The user explicitly said the proposal is accepted and to do it with subagents.
- Ruling: use a filesystem baseline instead of creating a Git repository/worktree or committing. This preserves the project's current non-Git workflow and enables exact diff review.
- Ruling: monetary/ease percentages are computed from captured pre-patch values; measured baseline supersedes any inaccurate historical estimate in prose. Report resulting per-minute rates.
- Started: baseline saved, attachment read in full, independent worker ownership defined.
- Worker dispatch: fight_implementation and fortress_implementation run gpt-6.1-sol max. Fishing CLI attempt with exact model/effort failed because CLI ChatGPT backend rejects model gpt-6.1-sol; no code executed by that worker. Fishing must use the next available native max worker; do not downgrade model.
- Root progress: quality helpers and eight focused tests pass; common renderer sums all passes and samples GPU without blocking; all scenes wired to quality (Fight/Fort methods pending workers); lobby particle budgets update live; paintball shadow size follows quality.
- Art complete: three ImageGen rod PNGs are in `client/assets/rods`, inspected with transparent background; provenance records generation method and prompts. They still require fishing UI integration.
- User requested Codex limit change: `/Users/tired/.codex/config.toml` now has `[agents] max_concurrent_threads_per_session = 8`; readback verified. A new native spawn still failed with thread limit, so this running session has not adopted the setting. Continue by reusing a completed native max worker.
- Ruling: measured old fishing base is 13.46555 tokens/min (not quoted25–30), rain16.99468 and expert18.23403, chests separately4.47837. Apply requested+50% to real oldbase (~20.1983 target) and +75%common separately; user informed. Raw reproducible numbers: `/tmp/opus-fishing-baseline-income.json`.
- Root progress: distant decorative fishermen update poses/gear at10Hz while behavioral clocks/events continue, preserving near-camera full-rate animation.
- Runtime for current integration: Node24 watch server on127.0.0.1:5194, exec session12540; temporary data path recorded in `/tmp/opus-upgrade-runtime-dir`. FlagsFISH2/FORTRESS/FIGHT=1. Shared Playwright tab was opened at `http://127.0.0.1:5194/?debug` with temporary playerUpgradeQA; HMR/server changes may return it to join. No production access.
- Early live Fight check: first-person yaw matches input exactly, fists visible, jab action and impact pulse observed, no consolewarnings; medium usesMSAA0. Screenshot `.playwright-mcp/upgrade-fight-firstperson.png` in parent workspace exposed overly large gloves. Worker tuned size/portraitFOV with Three meshprojection regressions; recheck final rendering after tuning.
- Root horde review requested collision/LOS validation for flyer dive/impact and consistency of boss phasecooldowndescription; fortressworker handling.
- Fight worker completed source task: `/tmp/opus-fight-implementation.md`, diff `/tmp/opus-fight.diff`, reports48scoped tests and426full tests passing (root finalintegratedgate stillrequired). Final tunedglove screenshotpending. Same native `fight_implementation` agent now running full FISHING task at6.1-sol max via followup; checklist `/tmp/opus-fishing-implementation.md`, contracts `/tmp/opus-fishing-needs.md`.
- Partition accepted: fishing worker owns economy/progression/protocol/NPC/board/podium/album; reserves `shared/maps/lobby.ts` and12-spot physical geometry/access/concurrency tests for `fortress_implementation` agent's NEXT task after fortress finishes. Root must send that followup with NPC/board/podium placement contract. Until then map file unedited.
- Protocol version bumped7→8 by root for extended Fortress binarysnapshots.
- User priority update: desktop is primary; basic mobile compatibility only, no prolonged phone polishing. Persisted in `game-opus/AGENTS.md` and relayed to workers. Final acceptance focuses desktop. Root had already verified actualtouch punch393x852 and fixed topHUD overlap in `client/fight/fight.css`; stop further mobile-specific iterations unlesscritical.
