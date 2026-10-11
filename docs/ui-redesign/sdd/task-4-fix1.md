# Task 4 (Esc menu, Tab) — fix round 1 of 5 (review of 5b8a88b..ed5a8c0)

Spec ✅, quality Approved. Two Important items belong to other groups / the merge (lead handles them):
`.join-settings` dead rules (entry now uses its own quick settings) and the fishing skill block in Коллекция (fishing group).
Small polish for this branch only. Work in /Users/tired/Desktop/game-opus-ui-menu on ui/menu, one commit, check/test/build,
re-shoot only what changed (Tab with the kick button, Голос section, Коллекция scrolled to the bottom), append «Fix round 1»
to task-4-report.md. One reused Chrome profile → ~/.Trash at the end.

- **M1.** Tab «выгнать» button is icon-only (door) with only `aria-label` (`client/ui/online.ts:244-248`). Give it a visible
  short text label next to the icon («выгнать»), same size as the other row buttons.
- **M3.** The legacy global `input[type=range]` block in `client/styles.css` (~1822-1854) is dead now (no range input left
  except `.k-slider`). Delete the block instead of `:not(.k-slider)`. (The entry branch wrapped the same lines in
  `:where(...)` — the lead resolves that conflict at merge by deleting.)
- **M4.** Stale code/comments: `voicepanel.ts:35`, `settings-panel.ts:56` describe the removed Sound voice slider;
  `voice-prefs.ts:77-90` `voiceVolume`/`setVoiceVolume` have no callers (remove if truly unused, incl. tests); duplicate
  `ownKeys` in `voicepanel.ts:77` → import from `controls.ts`; «💬» in the touch hint `settings-panel.ts:155` → plain words.
- **M7.** Voice rows: make the whole row clickable like Sound/Graphics rows (a `label` wrapping the switch), not only the
  52×30 switch.
- **Коллекция snapshot:** scroll to the bottom and shoot it (the fishing block there is the fishing group's — just show it).

Deferred (do NOT fix): menu now paints above the photo/catch corner cards while paused; hard-coded scrim rgba copied from the
lab and `#fff/#000` in `.mn-tier i`; `aria-valuenow/min/max` on the level meter; vote plate covering the Tab header while a
vote is active; thin tests for top-4 records / slider clamping.
