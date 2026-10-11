# Final whole-branch review — unified UI (mode/ui)

Branch `mode/ui` (worktree `/Users/tired/Desktop/game-opus-ui`), base `main` (merged in at the tip, so `git diff main..mode/ui`
is the whole patch). Plan: `docs/superpowers/plans/2026-10-11-unified-ui.md` (read «Global Constraints», «Решения ведущего»,
«Карта файлов»; skim the task list). Every group already passed its own task review (briefs/reports/fix files in
`.superpowers/sdd/2026-10-11-unified-ui/`). Your job is what per-task reviews could not see: how the groups fit together.

The code diff is ~2.4 MB — do NOT read it whole. Use `git diff main..mode/ui -- <path>` per area, `git log --oneline main..mode/ui`,
and read files directly. Read-only: do not change the working tree, index, HEAD or branches; do not start servers or browsers.
python3 is broken — use node. Do not call `mcp__hearthbot__` tools.

## Groups that were merged (in order)
plaza HUD + kit (Tasks 1–2), light HUD, fort (7), fishing (5), farm (6), entry/login/loading (3), Esc menu + Tab (4),
other modes (8), 16 new icons + wiring (icons2), lead fixes at merges.

## Focus (cross-group risks — check each, cite file:line)
1. **Top-centre arbitration** (`client/ui/kit/topcenter.ts`): every mode's events/toasts/heroes use distinct key prefixes,
   are cleared on leaving the mode/scene with a prefix (`clearToasts(prefix)`, never bare), and priorities (`PRIO`) make sense
   when two systems are live at once (storm + fishing event, pirates + regatta, vote/link over a mode).
2. **Scene switches** (`client/app.ts`, `client/lobby/scene.ts` and each mode's scene): nothing from one mode stays visible in
   another (slots `tl/tr/bl/bc/br/c/tcUnder`, `.k-world` overlays, scrims, timers/intervals, window listeners, pointer state).
3. **Layering** (z-index): `#menus` z20, `.k-hud--top` z25, scrims/windows, entry/link screens, Esc menu, chat dock, voice,
   touch pads — any window that can open under the menu or over a modal it should not cover.
4. **Scale** (`client/ui/kit/scale.ts`, `--hud-k`): only `.k-hud`/`.k-scrim` zoom; screen-pixel overlays live in `.k-world`;
   no element is zoomed twice (kit inside kit) — check modes' results windows, fort, fishing reel, farm belt.
5. **Global CSS** (`client/styles.css`, `client/ui/kit/tokens.css`): legacy `:root` tokens that override kit tokens; orphan
   rules whose classes no longer exist; light-HUD tokens leaking into windows (windows must stay retro2).
6. **Pointer/Esc model**: results windows free the mouse; Esc leaves or closes as the lab says; `quietPause` vs the full
   pause menu is consistent across modes.
7. **Performance**: per-frame DOM writes (innerHTML in update loops), `backdrop-filter` only on the fishing reel backing
   (owner's explicit request, `.fi-reel.k-plate`), no new heavy listeners.
8. **Constraints**: fonts ≥ 13 px (14 for non-tertiary) in new kit/screen CSS; no emoji used as interface icons; no
   info only in `title`; no blue+yellow; protocol/server unchanged (`git diff main..mode/ui -- server shared/messages.ts
   shared/constants.ts` should be empty or trivially safe); no new npm packages except `@fontsource/rubik-mono-one`
   (owner «да»).

## Triage inputs
- Deferred minors: every `minor (deferred)` line in `.superpowers/sdd/2026-10-11-unified-ui/progress.md`. For each, rule:
  **fix before merge** (player-visible, cheap, or risky) or **later** (polish, tests, refactors). Be decisive.
- Sweep of leftovers: `.superpowers/sdd/2026-10-11-unified-ui/sweep-pre-modes.txt` (taken before the modes merge — re-run
  `rg` for `ui-scale|panel-strong|cream-2|🪙|🎣|📖` on the current tree). Separate: emoji/legacy used as **interface icons or
  styling** in kit-era screens (fix) vs server text, chat text, favourite screens (blackjack/durak/billiards/Dungeon keep their
  own look by owner decision), coin text converted by `coinText`/`coin.ts` (fine).

## Output
Write the full review to `.superpowers/sdd/2026-10-11-unified-ui/final-review.md`:
Strengths; Issues (Critical / Important / Minor, each with file:line, why it matters, how to fix); the deferred-minor triage
table (item → fix now / later, one-line reason); the sweep triage; Assessment «Ready to merge? Yes / With fixes / No».
Return only: the verdict, counts per severity, and the file path.
