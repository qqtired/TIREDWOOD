# Fishing UI implementation checkpoint

## Ownership and references

Owns fishing client modules, fisherman/dialog/podium visuals, `client/lobby/scene.ts`, `client/scene.ts`, profile and collection UI, fishing CSS. Read repository `AGENTS.md`, the complete attachment including NPC/beer addendum, and `CONTRACTS.md`. Desktop is the acceptance priority. No Git metadata exists in this checkout; root has preserved release-6 and resumed-source archives.

## Contracts communicated

- Use server `fishReel.mods` with `reelStyleFor(sp,mods)`; never recompute cast buffs at expiry.
- `MeState` and `ProfileView` gain `fishing:FishProgress`; `ProfilePanel.update(p)` call signature stays unchanged.
- Extend existing `LobbyScene.onJson` for progress/NPC/event messages, rather than adding a parallel controller. Root routes global progress/event messages to lobby even while another room is active, mirrors profile state, and handles the global event notice.
- Root must route `tokens` to lobby after updating the balance; otherwise the NPC dialog cannot refresh its price/balance state.
- Board keeps four existing lists. Server `FishBoardView` extends them with `podium:FishPodiumCatch[]`.
- Geometry module API expected: `addFishPlaces3d(parent:THREE.Group)`. NPC/board/podium use finalized named shared positions.

## Implementation plan

Native keyboard/focus-safe NPC dialog with shop, quest claim and one selected earned rod; authoritative XP/bar and buff countdown; calm fisherman and compact gear scene; moved board and daily3 catch podium; scrollable32 species grid with explicit rarity/count/weight; full fishing statistics. Existing collection rewards, wardrobe and 6 original spots retained. Generated rod assets reused.

## Verification boundary

No server or shared browser launched by this worker. Root owns final desktop browser and basic mobile acceptance. Owned logic tests and TypeScript check will be recorded below; no runtime completion claim yet.


## Completed client implementation

- `fish2hud.ts` consumes global progress/NPC/event updates through the existing `LobbyScene.onJson`; the common app routing stays root-owned. Only the common app emits the global event notice, so there are no duplicate weather toasts.
- `fishnpcdialog.ts`: native modal shop, current balance, explicit unavailable/rejection reasons, sequential quest claim, earned rod selection and all 3 original generated rod PNGs. Server progress updates repaint the actual state. Keyboard events remain in the modal; native focus containment/inert background and close handling work with pointer release/restore callbacks. Late purchase replies do not reopen a deliberately closed dialog.
- `fisherman.ts`: elderly, wind-worn fisherman at the shared old-board coordinates, grey beard and brows, faded cap, striped shirt/vest, patched trousers, rubber boots, gloves and sheathed working tool. Compact merged gear includes fish crate, buckets, spool, bait boxes, nets, resting rods, stool, thermos/cup and lantern. Slow cap/line/water/mug/lean cycles have a reduced update cadence at distance. No northern cast intersects the nearby player spot.
- `fishdrink.ts`: a small can lifted by the local character only after a confirmed pending beer purchase, with a light opening hiss/click and soft two-note confirmation through the existing volume/mute-aware sound bus. Initial load, reconnect and rejected purchases never trigger drinking. Pre-click expiry is captured so an earlier `me`/`fishProgress` reply cannot hide a successful purchase.
- `fishprogresshud.ts` and `fishclock.ts`: novice through level 10, cumulative XP and remaining XP, maximum-level handling, server-clock-based beer badge/countdown in the global overlay, gentle final-minute colour cue and automatic expiry. These displays never alter deterministic reel or sale modifiers.
- `fishboard.ts` uses finalized shared pier-entrance placement and preserves the four live leaderboards. `fishpodium.ts` renders the server-ordered top 3 individual catches (including repeat players) with real species 3D art, weight, nick and place; an empty server podium clears all 3 models after day rollover.
- `fishgame.ts` starts the exact `reelStyleFor(sp,msg.mods)` snapshot. `fishing.ts` and lobby occupancy arrays read finalized shared 12 spots; geometry worker's deck visuals are integrated. `fishPropsBoxes` are disabled before the first lobby flag and switched with FISH2, avoiding invisible NPC/board/podium collisions when the feature is off.
- `profile.ts`: compact fishing statistics plus XP/level/quests, with an explicit note about newly tracked counters and the inclusive fishing-income total. Historical catches/album are preserved.
- `fishbook.ts` and fishing CSS: native keyboard-safe journal, scrollable category grid, explicit names, rarity, caught state, count and record for every collection species. Corrected the common profile CSS that forced nested album grids into flex rows. Collection rewards and wardrobe links remain. Labels, totals and collection completion all derive from `COLLECTION_SIZE`, so the approved 32-species extension and event-only common/legendary/mythical additions require no hardcoded UI indices.
- `fish2.ts` imports both WebP and PNG species assets, preferring WebP when both share an ID. New marlin/shark assets are owned by the asset worker; no images were generated or overwritten by this worker.

## Fresh automated verification

- Node 24.15.0: `/opt/homebrew/opt/node@24/bin/node --test test/fishui.test.ts` — 3 tests passed, 0 failed. Tests cover server/monotonic clock sampling, final partial-second countdown/expiry and confirmed purchase versus initial/rejected beer states.
- Node 24.15.0 owned TypeScript graph: `tsc --noEmit -p /tmp/game-opus-fishing-ui-tsconfig.json` — exit 0 after final client recovery changes. The temporary config extends the repository config and includes all17 owned TypeScript source/test files and their transitive dependencies. Root owns the final full repository gate; no parallel full-gate claim is made here.
- Inspected actual diffs against the extracted release-6 source for lobby integration/profile/journal/HUD. The existing root quality propagation and cosmetic folk cadence remain present.

## Review finding resolved and browser handoff

Independent review identified a real pending-state softlock when rapid rod switching exceeded the server's 6-per-second NPC request limit. Server worker changed silent throttling into an explicit authoritative rejection without purchase/rod mutation; its reported seventh-request regression went from 6 replies to 7 and the independent reviewer reran the actual Hub test successfully. Client now has bounded 5-second recovery with a visible message and no automatic action retry, and clears pending on reply/scene reset. This is a source/test result, not a browser-acceptance claim.

Root can continue desktop acceptance at NPC use point (-15.5,36.5), board(-15,20.8), podium(-11.5,19.75). Inspect `dialog.fn-dialog`, `.fn-balance`, `.fn-status`, `.fs-buff`, `dialog.fb` and all 32 `[data-species]` cards; debug state includes NPC/book/board/podium/progress. Required browser checks: E interaction, shop/quest/rod updates and rejections, rapid rod switching, Tab/Enter/Space/Escape, stationary player while modal is open, play restored after close, real-time buff expiry, visible NPC/drink/podium art, all 32 journal/profile cards without clipping and basic mobile continuity. No worker server/browser, commit, deploy, production-data write, secret exposure or memorial edit occurred.
