# Fortress final-state release preparation

Scope: `shared/fort*`, `server/fort/*`, `client/fort/*`, and `test/fort*`. This is a non-Git checkout. Review baseline: `../backups/release-6-source-baseline/game-opus`. No commits, deployment, production data, shared browser or shared server changes are performed by this reviewer.

## Outcome

Independent final-state review found and fixed seven material issues in damage, boss warning consistency, HUD cleanup and player-session credit. The final owned suite passes **51/51**, the project TypeScript check exits 0, and the controlled boss-preview entry bundles successfully. Desktop visual/FPS and full multiplayer gameplay acceptance remain with root.

## Preservation and review

- Read the desktop-first `AGENTS.md` and Task 2 of `docs/superpowers/plans/2026-10-02-combat-fortress-fishing-upgrade.md`.
- Confirmed the checkout is non-Git with `git status --short` (expected exit 128).
- Independently inspected the final source paths and baseline changes in the owned modules: shared rules/shop/weapon/protocol tail, authoritative game/horde, client match/HUD/world/zombie renderer. Existing gate/jam/turret stations remain; the central shop adds validated action IDs.
- No server or browser was started by this worker, and no new runtime dependency was installed.

## Fresh automated verification

- Initial independent state: `/opt/homebrew/bin/node --test 'test/fort*.test.ts'` — 37 passed, 0 failed; `/opt/homebrew/bin/node node_modules/typescript/bin/tsc --noEmit -p .` — exit 0.
- Six newly added regressions were observed failing for the expected behavior before fixes (after correcting the DOM test harness and isolating its blast target from unrelated melee damage). Their first green run passed all 20 tests in the two focused files.
- The reused-player-ID regression was separately observed red, then green after clearing departed-session credit.
- Final `/opt/homebrew/bin/node --test 'test/fort*.test.ts'` — **51 passed, 0 failed, 0 skipped**, exit 0.
- Final `/opt/homebrew/bin/node node_modules/typescript/bin/tsc --noEmit -p .` — **exit 0, no diagnostics**. A prior intermediate run saw unrelated in-progress fishing contract errors, subsequently resolved by their owners; the final run supersedes that checkpoint.
- Controlled fixture bundle: invoked Vite `build({ configFile: false, root: process.cwd(), logLevel: 'error', build: { write: false, target: 'es2022', rollupOptions: { input: 'tools/fort-preview/index.html' } } })` with Node 24 — **exit 0**, 1 chunk and 38 assets; nothing written to `dist`.
- Full `npm test`/production `npm run build`, final browser acceptance and multiplayer load are root-owned integrated gates, not run by this worker.

## Findings and changes

| Finding | Reproduction | Fix |
|---|---|---|
| Old bloater blast and melee ignored solid cover | Player and walker behind live gate were hit by a blast; walker hit through real well corner | `server/fort/horde.ts:296`: solid segment checks for blast propagation, including structure targets, and ground/climber melee targets |
| Boss bomb circle could mark the floor but strike the roof | Target below north gate walkway: warning `toY=0.8`; only impact moved to roof | Resolve overhead interception before locking the warning snapshot; mark and impact use the same roof point |
| Gate slam could damage a distant unmarked crystal | Destroy gate during the warning; crystal lost 85 HP at gate slam | Remove fallback damage to crystal from an attack marked at the gate |
| Wall pulse reached a player under stone | Wall player and ground player at the same X/Z both lost 28 HP | Limit wall pulse to the wall height band and require an unobstructed attack segment; jumping clear of the band remains counterplay |
| Dead boss HUD stayed during remaining enemies | Snapshot `[walker,boss]`, followed by `[walker]` in wave 8 retained old boss slot | `client/fort/match.ts`: truncate decoded snapshot list to the returned count before HUD selection |
| New defender could inherit departed defender's turret and assistance | Build turret, damage enemy, leave, join with reused ID, turret kills enemy: newcomer received kill/MVP credit and immediate wave participation | `server/fort/game.ts:182`: keep turret built but clear departed owner and per-enemy damage contribution before that snapshot ID is reused |

This final-review pass changed `server/fort/{game.ts,horde.ts}` and `client/fort/match.ts`; it extended `test/fort-upgrade.test.ts`, added `test/fort-client.test.ts` and `test/fort-render.test.ts`, and created the controlled preview `client/fort/preview.ts` / `tools/fort-preview/index.html`. Root's existing boss armor/crown/core, flyer wings, attack rings, body LOD and grounded shadows were inspected and protected by the renderer regressions.

## Verified requirements and practical limits

- Eight waves and a shared 60-enemy live pool remain; the final wave has exactly one boss for 1–6 defenders. Boss base HP is 2600 and 6-defender HP is 9750. HP phases, single bounded reinforcement packs, warning before damage, three-second open-core window, live cap and delayed victory until all pending/alive enemies resolve are exercised by the server tests. Packs are deliberately skipped when the shared pool is full.
- Shared kill bounty is issued once per enemy, including turret kills. Assistance and late joins have behavior tests: one token pool per kill, actual assistance qualifies immediately, otherwise a late join must participate at least five seconds. Departed-session credit cannot transfer to a new person.
- Central shop accepts only fixed server action IDs and checks player identity, distance, current phase, available funds and duplicate upgrades. Magazine size 42 survives server reloads and prediction reconciliation; a shot on the reload-completion tick correctly leaves 41. AA turret prefers an airborne target and uses the documented reduced ground damage.
- Fly warnings lock the target, stay visible during the dive and offer ordinary-marker counterplay; blocked dives stop at solid cover. Boss bomb warns at the intercepted roof position. Actual player physics proves a timed ordinary wall jump avoids the pulse; standing on the wall is hit, while being below its stone floor is safe.
- Snapshot tail is 21 bytes per zombie under protocol 8. Low/medium/high rendering retains identical target coordinates, boss face/core, flyer wings and warning radii while reducing geometry/distant detail. Real Three.js matrix tests prove roof mark height and ground-bound flyer shadow. They verify geometry/signal logic, not GPU rendering or measured gameplay FPS.
- Source inspection found no Fortress scene reset of renderer statistics. The fixture uses the root renderer's managed `beginFrame` / `endFrame` around rendering. Its CPU/GPU figures describe this small controlled rendering fixture, not a six-player/60-enemy match.
- Pointer lock restoration, shop keyboard/focus behavior in a real browser, the complete eight-wave player experience and desktop performance require root's final acceptance. This worker performed no mobile emulation or real-device check.

## Desktop QA recipe and acceptance boundary

Open **`<root Vite origin>/tools/fort-preview/index.html`**. This development entry follows the existing `tools/race-preview` convention and does not enter the default production build. It instantiates the real `Renderer`, `FortWorld`, `Zombies3D` and `FortHud`, with no `App`, `Net` or profile storage. The page prominently labels its snapshots as controlled and separates them from full gameplay proof.

1. Begin on the wall camera: compare the large armored/crowned boss and glowing core against the nearby ordinary brute/walker; inspect flyer wings and their shadows. Drag to orbit, scroll to zoom, or reset the wall camera.
2. Select gate slam, bomb, roof bomb and wall pulse. Freeze each state to inspect full attack radius, floor/roof alignment, silhouette and HUD wording; use the automatic warning → open-core cycle to inspect the transition. Roof bomb uses the already intercepted roof height.
3. Select open core and phases 1/2/3; inspect the cyan core, opening pose and boss HUD. Select “boss down, remaining small enemies” to inspect hidden boss HUD with enemies still present.
4. Switch low/medium/high; attack marks, wings and core must remain. Capture `window.__fortPreview.state()` for controlled snapshots and render statistics. CPU/GPU output measures this fixture only.
5. Open the real shop dialog to inspect layout, disabled reasons, balance and keyboard/close focus. Buttons explicitly state that actual purchases must be checked in full gameplay; no fixture economy is presented as a server transaction.

For full desktop gameplay acceptance on root's temporary-data game server: enter through the lobby gate, open shop with E, buy 42-round magazine and AA, confirm prices/funds/rejections/duplicate behavior, close with button/Esc and restore movement/pointer lock. Check all directional wave roles, normal marker hits on flyers, warning/dive/recovery and cover. During wave 8 observe all three boss phases and counter each attack, remove boss while adds remain (HUD must disappear), then resolve remaining enemies before victory. Inspect console/CSP and FPS with the normal integrated renderer. None of these browser/gameplay observations are claimed by this worker's automated checks.
