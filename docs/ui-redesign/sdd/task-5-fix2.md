# Task 5 (fishing) — fix round 2 of 5 (re-review of ce2958c..23f2dbe)

All round-1 findings ADDRESSED. One new Important, plus one item routed from the Esc-menu review (the fishing block shown
inside Esc → Коллекция is in fishing files). Same worktree/branch. One commit, check/test/build, re-shoot only what
changed (login during rain at spawn; Esc → Коллекция scrolled to the fishing block; journal «Награды»), append «Fix round 2».

## Important
- **N1. Rain toast suppressed at login even when no plate is visible.** `client/app.ts:692` + `client/lobby/scene.ts:2760`:
  `fishEventPlate(first)` returns true on `first` regardless of the plate. Spawn is ~30 m from the pier, so a player logging
  in during rain gets neither toast nor plate. **Return true only when the plate is actually shown:
  `return this.fish2.on && this.fish2.plateNear;` (drop `first`).**
- **R1 (from the Esc-menu review). Fishing skill block inside Esc → Коллекция** (`client/lobby/fish2.css:1072-1073`,
  `client/lobby/fishprogresshud.ts:54`): `.fs-skill-head span` and `.fs-skill-sub` are 12 px (below the 13 px floor), a «🎣»
  emoji heading, and the old green `progress` bar. **Make it kit: ≥ 13 px (14 for non-tertiary), icon via `uiIcon` instead of
  the emoji, kit `meterHtml`/`.k-meter` instead of `<progress>`, kit tokens only.** Shoot it in the menu (open Esc →
  Коллекция, scroll down).

## Promoted Minor
- `.touch .fr-label { font-size: 11px }` in `fish2.css` → 13 px.
- Dead CSS: `.frw-win .fr-zone` (`fish2.css:144-146`); `.fc2-box`/`.fc2-chest` rules in `fish2.css:359+` and
  `fishtreasure.css` if no TS uses them (grep first).
- `fishrewards.ts`: `<p>` inside `<button class="k-cell …">` → `<span>` (valid HTML).

## Deferred (do NOT fix)
Open picker slot persisting across journal reopen; focus lost after equip; lighthouse icon reused for the island line.
