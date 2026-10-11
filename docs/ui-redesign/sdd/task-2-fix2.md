# Task 2 — fix round 2 of 5 (re-review of 2de1322)

All round-1 findings ADDRESSED. The fix introduced one Important bug; the controller also promotes a few small items
from the fix diff. Fix all in ONE commit on mode/ui, re-run `npm run check && npm test && npm run build`, re-take only
the affected snapshots, append «Fix round 2» to task-2-report.md.

## Important (new breakage)
**N1. Pirate raid panel stays on screen after leaving the lobby mid-raid.** `client/lobby/piratehud.ts:69` and
`client/lobby/scene.ts:2806` moved `.pr-panel` into the global `tcUnder` slot, outside `PirateHud.root`, which
`LobbyHud.setVisible(false)` used to hide. `LobbyScene.exit()` (`scene.ts:826-880`) → `resetAdditions()` →
`pirates3d.reset()` doesn't touch the HUD; `ui.top.clear('pirates'|'storm')` removes only event plates. The panel stays
frozen in paintball, karting, other rooms until the lobby is re-entered.
**Fix: hide/empty the panel on lobby exit (e.g. `PirateHud.hideAll()` from `Pirates3D.reset()` or from `exit()`), and
add a node-testable check if the structure allows it; otherwise verify in the browser: start raid, leave to another
room, snapshot shows no panel.**

## Promoted by the controller
**P1. Esc menu jumps ~50 px on every toast.** `client/styles.css:2012-2018` shifts `.screen.pause` whenever the stack is
non-empty. **Shift the menu only for events that must stay readable over it (kick vote, link banner) — not for toasts or
heroes; toasts may overlap the menu's top band briefly. Use a dedicated attribute (e.g. `data-tc-event`) set by
TopCenter only for those kinds.**

**P2. Level-up says the same words twice when no frame unlocks** (toast «Уровень 16» + hero «Уровень 16!»).
**When no new frame unlocks: hero only, no toast. With an unlock: keep hero + toast as in the lab.**

**P3. Lost lighthouse hero.** `client/lobby/storm.ts:150-157` sets `heroFor` before knowing whether `hero()` was
accepted; a simultaneous level-up hero (PRIO.mode 60 > PRIO.storm 50) eats «Маяк горит!». **Make `TopCenter.hero`
return whether it was shown (or queue the lower one to show after) so the storm hero isn't lost; set the flag only when
shown.**

**P4. Font floor.** `client/lobby/pirates.css` ~172-177 (`@media (max-width: 640px), (pointer: coarse)`) sets
`.pr-title 13px`, `.pr-lab 12px` on the kit plate — below the 13 px floor, and `.pr-lab` row labels are not tertiary.
**Remove the overrides; row labels 14 px. Also the «на причале · украдено» caption must not wrap at 1440×900.**

**P5. `.k-slot--tc-under` lacks `env(safe-area-inset-top)`** (`styles.css:2002`) unlike tl/tc/tr — add it.

**P6. Vote buttons lost their click sound**: `client/app.ts:223-224` binds `bindClickSounds` only to `shell` and
`menus`; bind it to the new `.k-hud--top` layer too.

**P7. Stale z-order comment** `client/ui/kit/kit.css:34` («тосты 20 · окно 30 · меню Esc 40») — update to the real
layering (top-centre layer 25 above #menus 20; kit windows) so later screen groups follow it.

## Deferred (do NOT fix)
Fishing «Подсекай!» / photo countdown under the z-25 band (same as before Task 2); kit windows' `data-tc` shift (each
screen group handles its own); `tcUnder` as an extra slot vs lab flow child; mid-file import in test/ui-kit.test.ts;
`.rc-map` / `.killfeed` under the badge (M-e).
