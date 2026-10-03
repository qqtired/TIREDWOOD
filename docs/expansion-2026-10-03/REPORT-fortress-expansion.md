# Fortress expansion — implementation and verification

## Design and implementation plan

Goal: strengthen all eight waves and group pressure without inflating ordinary enemies into damage sponges; remove late-join scaling exploits; make returning from the field a real movement route.

- [x] Add failing regressions for 1/2/4/6 defender work budgets, late join quota/HP, leave/rejoin, bounded alive/pending, bell authority/cooldown, and physical return from both approaches.
- [x] `shared/fort.ts`, `server/fort/horde.ts`, `server/fort/game.ts`: stronger solo composition, team quota derived from target work budget and low HP inflation. Peak concurrent count is fixed upward within each wave; next wave uses current defenders. Late joins receive quota delta with a grace period; existing damaged enemies retain health fraction.
- [x] Same modules plus `shared/fortnet.ts`, client match/HUD/props: one added tactical mechanic, combat bell. Eight seconds of 50% structure mitigation, 30-second shared cooldown. No player immunity, no resurrection or repair, no price/reward changes. Tail grows 9 to 14 bytes; existing 21-byte enemy records unchanged. Root owns protocol version.
- [x] `shared/fortmap.ts`: shared collision/render stone stairs on west/east approaches with matching parapet openings and visual route markers.
- [x] Focused and all Fortress tests; source review and report. Root owns full suite, type/build integration, server/browser and desktop acceptance. No deployment, Git changes, new dependencies, or real-data access.

Rollback risk: tail size requires matching client/server protocol release. Castle geometry is shared, so root must validate final movement/visuals together. No persistent profile schema changes.

Done criteria: focused regressions and existing Fortress tests pass; numerical scaling table and precise remaining acceptance limits documented below.

## Delivered behavior

- Solo rosters are 14 / 24 / 32 / 36 / 46 / 54 / 62 / 75 enemies (previously 12 / 20 / 27 / 30 / 39 / 47 / 54 / 67). Eight waves, first flyers in wave 4, one final boss, 60-alive pool, three boss phases, full attack warnings, three-second open core, shop, AA, 42-shot magazine, cover and shared bounties remain.
- For N defenders, ordinary HP multiplier is `1 + 0.08*(N-1)` (maximum 1.4). Count multiplier is `N*(1 + 0.025*(N-1)) / HP multiplier`; each nonzero kind quota rounds upward. This makes total regular-enemy work at least proportional to player count, mostly through simultaneous bodies and specialist targets. Boss HP is `2600*(1 + 1.1*(N-1))`.
- Waves retain existing directional pulses and fixed release windows. The 60-live cap delays excess pending enemies without deleting them or granting early victory. More defenders must resolve enemies promptly to keep the queue moving.
- Difficulty uses peak **concurrent** defenders during a wave. New high-water marks append only the roster-quota difference (three-second grace, ten ticks between incremental spawns), adjust existing HP while preserving remaining fraction, and show an explicit system warning. Leaving does not erase the wave or lower enemy HP. Rejoining up to the same peak adds nothing. The next wave resets to current roster. If everyone leaves, the existing empty-room/new-game behavior remains.
- Boss threshold packs remain once per threshold and share the live cap. Phase 2 adds `2 + ceil(.6*(N-1))` flyers; phase 3 adds `4 + (N-1)` runners. Full-cap packs remain skipped, as in the prior release, rather than accumulating hidden unbounded work. Joining after an already consumed phase does not replay that phase's reinforcement.
- Combat bell: E at the existing terrace bell grants 50% structure mitigation for eight seconds, with a shared 30-second cooldown measured from activation. It never heals/resurrects structures and never mitigates player damage. Range, identity, alive state, match phase and cooldown are authoritative. In gathering/break it still means ready. Activation has a bell event, explicit chat and HUD warning, cyan structure-only geometry, and persistent HUD cooldown; no ambient scene tint hides red attacks.
- West/east rescue stair entrances are at `(±21.4, 0, 8)`. Walk north through eight 0.425 m stone steps to `(±21.4, 3.4, -1)`, then turn inward through the 2.4 m parapet opening to `(±16.5, 3.4, -1)`. No E, ladder teleport, jump exploit or gate break is needed. Signs and mint pennants identify both approaches. Stair/landing/rail masonry comes from the same shared boxes used by collision; side climber approaches remain clear.

## Numerical work table

HP work is the sum of scheduled count × maximum HP, before boss armor, reinforcements, headshots, splash, turret contribution or player skill. It is a deterministic balancing measure, not measured completion time or a playtest claim. Each wave-8 count includes exactly one boss. All figures below were emitted from the final shared functions.
| Wave | Solo enemies / HP work | 2 defenders | 4 defenders | 6 defenders | Spawn window |
|---|---:|---:|---:|---:|---:|
| 1 | 14 / 840 | 27 / 1755 | 49 / 3626 | 68 / 5712 | 16 s |
| 2 | 24 / 1200 | 47 / 2527 | 84 / 5180 | 117 / 8190 | 18 s |
| 3 | 32 / 2090 | 63 / 4451 | 113 / 9394 | 156 / 14336 | 20 s |
| 4 | 36 / 2310 | 70 / 4895 | 127 / 10353 | 177 / 15960 | 22 s |
| 5 | 46 / 3300 | 89 / 6970 | 162 / 14372 | 226 / 22806 | 24 s |
| 6 | 54 / 3690 | 105 / 7812 | 190 / 16044 | 263 / 25326 | 26 s |
| 7 | 62 / 4550 | 121 / 9670 | 218 / 20085 | 301 / 31206 | 28 s |
| 8 | 75 / 8250 | 145 / 17454 | 261 / 35738 | 362 / 55806 | 30 s |

Boss HP (1 / 2 / 4 / 6): 2600 / 5460 / 11180 / 16900

The old six-defender ordinary-work factor was about 5.25× solo and boss HP 3.75×, despite six guns. The new target regular-work factor is 6.75× before quota rounding and boss HP is 6.5×. Solo ordinary HP stays unchanged. Warning duration, player hit damage and boss vulnerability are unchanged, so groups gain coordination pressure rather than shorter reaction windows.

## Verification evidence

- Confirmed non-Git directory with `git status --short` before edits. No reset, commit, server/browser start, deployment or profile data access.
- Initial focused tests: expected failures for under-proportional work, missing late-join scaling, absent bell protection and unavailable exterior route; live-cap regression already passed. Captured in `/tmp/fort-expansion-red.log`.
- Initial new behavior green: 5/5 focused tests. Then existing suite exposed and prompted correction of the side-climber obstruction (stairs moved two metres outward). Three assertions were deliberately updated for changed wave-1 count, boss six-defender HP and extended snapshot header.
- Final `/opt/homebrew/bin/node --test 'test/fort*.test.ts'`: **61 passed, 0 failed, 0 skipped**, exit 0. Full output `/tmp/fort-expansion-final-tests.log`.
- New checks cover all 1–6 numerical work budgets; 1/2/4/6 live/pending caps and bounded boss reinforcement; exact late-join delta, health fraction, leave/rejoin and next-wave reset; one bounty and departed-session credit; bell distance/dead/foreign/end-state denial, team cooldown and exact expiry; 14-byte header roundtrip/truncation; actual `stepPlayer` wall jump, ground landing and walking return on **both sides with intact gates**.
- Real Three.js tests check shield placement/visibility (including destroyed gate), two route sign positions and matching supporting collision. Canvas painting is stubbed in Node; this verifies geometry/state, not rendered pixel appearance.
- Global `tsc --noEmit -p .` was run during concurrent work. No Fortress diagnostics remain; the command still failed on other active race/skill/hatpose changes. `/tmp/fort-types-final.log` is an intermediate integration snapshot, not a final global pass. Root owns the final integrated type/build gate.
- Existing cover/warning tests continue passing: roof interception before locked warning, destroyed-gate slam no crystal fallback, solid cover for blast/melee, wall-height pulse and real timed jump evasion, flyer warning/dive continuity. Existing shop, magazine prediction, shared reward and reused-ID tests continue passing.

## Files and protocol

Changed: `shared/fort.ts` (rules), `shared/fortmap.ts` (shared stairs), `shared/fortnet.ts` (tail); `server/fort/horde.ts` (quota/health/phase packs), `server/fort/game.ts` (join authority, shield, snapshots); `client/fort/hud.ts`, `match.ts`, `fort.css` (flowing briefing, locked roster and shield status), `props.ts` (shield and approach signs), `preview.ts` (explicit controlled shield/stair views); `test/fort-expansion.test.ts` (new), `fortmap.test.ts`, `fort-render.test.ts`, `fort-upgrade.test.ts`, `fort.test.ts` (regressions/intentional changed expectations).

Tail header: existing offsets 0–8 unchanged; offset 9 is defenders u8; offset 10 rally remaining u16; offset 12 cooldown remaining u16. Header total 14; enemy total still 21 bytes. Root coordinates protocol 8→9 once for the whole expansion. No common message schema or persistent profile changes by this worker.

## Browser handoff and remaining limits

The existing `/tools/fort-preview/index.html` now has “Щит строений”, “Западная лестница” and “Восточная лестница” buttons. It renders the real new map and shield, with a clearly labeled controlled six-defender HUD. It is **not** a server scenario or movement proof. `window.__fortPreview.state()` includes its controlled shield flag. The real match diagnostic state exposes `defenders`, `rally` and `rallyCd` for root's live check.

Root desktop acceptance: enter actual Fortress; jump outside east and west; walk around to the marked stair foot, climb without E/jump and reenter the wall. Verify visibility of parapet opening, normal turret/wall paths, third-person camera and no invisible collision. Activate bell in a real wave, inspect 8s field and cooldown, second-player rejection, and unchanged player damage. Join/leave during a live wave and inspect roster warning, extra pending enemies and no repeated quota on same-peak rejoin. Check boss warnings remain legible alongside the field and briefing wraps without covering controls. Complete root's normal shop/reload smoke and desktop console/performance checks.

Residual acceptance: the exact eight-wave solo and six-human experience, completion times, win rates and 60-enemy desktop/GPU performance have not been measured by this worker. The intentional peak rule means disconnects can leave the remaining team with the committed harder wave until the next break. No automatic downscale is claimed. No mobile browser/device run was performed; existing input paths and touch styles are preserved, with a compact basic compatibility check delegated to root. No production/full-release claim is made.
