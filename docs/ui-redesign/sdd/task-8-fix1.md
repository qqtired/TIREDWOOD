# Task 8 (modes) — fix round 1 of 5 (review of 01a10d7..aa29b20)

Spec ❌ (paintball legacy CSS), quality not approved (2 Important). Same worktree `/Users/tired/Desktop/game-opus-ui-modes`,
branch `ui/modes`. Fix all below in one commit, `npm run check && npm test && npm run build` once, re-shoot only what changed
(pirates arrows with a thief and a crate in the same direction; regatta results while votes land; plane in flight; rat-race
bet window; paintball end) at 1440×900, append «Fix round 1» to task-8-report.md (and correct two report claims: race has no
racer list under the badge — only the mini-map, as in the lab; the pirates event key is still `'pirates'`).
One reused Chrome profile → ~/.Trash at the end; stop your server by its own PID.

## Important
- **I1. Pirate threat arrows drop a different-kind threat in the same sector** (`client/lobby/piratehud.ts:329-333`). Bins are
  keyed by angle only; a crate 10 m away hides a thief 25 m away in the same 20° sector. **Key bins by `${kind}|${bin}` (each
  kind keeps its own arrow, count per kind), and normalise the bin index modulo the bin count so ±π is one bin.** Add a tiny
  pure-function test if the binning is (or can cheaply be made) a pure function.
- **I2. `ModeResults.show()` replays the entrance spring and replaces the buttons on every update** (`client/ui/kit/modes.ts:279`).
  Regatta re-shows on every «ещё!» vote (`regattahud.ts:196-200`), skill re-shows when the table arrives; a vote between
  mousedown and mouseup swaps the button node and the click is lost. **When the window is already open, update title/sub/
  table/actions in place without `is-in` (no re-animation), and keep existing action buttons if their set is unchanged (only
  update labels/state).** `is-in` only on the hidden → shown transition.

## Spec
- **S1. Old paintball CSS in `client/styles.css`** (the brief's ranges ~119-1223 and ~6083-6247 — find the paintball blocks):
  delete the rules only the old hidden paintball DOM uses (grep each class against `client/` first; keep anything the new kit
  UI or other modes still use). Keep the `.pb-kit :is(...) { display:none !important }` guard in `client/paintball/ui.css`
  while the old `Hud` DOM still exists.

## Promoted Minor
- **P1. Mouse hand-back after auto-closing results.** Pirates: when the results close by themselves (`piratehud.ts:215` →
  `hideResult :259`) call the same `closed()` path as a manual close. Paintball `hideEnd` (`client/paintball/ui.ts:548-552`):
  use `quietPause` like race/hide/skill.
- **P2. Pirates listener lifecycle** (`piratehud.ts:145-157, :365`): keep the keydown handler reference and remove it in
  `dispose()`; a `disposed` flag so a late `import()` does not create a scrim after dispose.
- **P3. Plane HUD per-frame work** (`client/lobby/plane.ts:578,584`): build the keys row once per phase (not on every
  height/speed change); set the land button's text only when `asking` changes.
- **P4. Borrowed accents**: plane banner window `dataset.mode = 'regatta'` (`planebanner.ts:195`) and rat-race bet window
  `dataset.mode = 'farm'` (`ratracehud.ts:135`) → their own mode accent (add `plane`/`rats` accents in the same place the
  other `--mode-*` accents are defined, from the lab if it has them, else a neutral accent).
- **P5. DRY**: export `put` and `setMeter` from the kit (`client/ui/kit/modes.ts`, additive) and use them in `hide/hud.ts`,
  `paintball/ui.ts`, `skilltest/hud.ts` instead of the local copies.
- **P6.** Stale comment `regattahud.ts:55` (Esc now = «На площадь»); dead `.rc-help` selector `client/ui/menu/menu.css:912`.

## Lead decision (no code change)
Blackjack, durak, billiards, Dungeon: keep their own buttons, keys and small fonts — the approved lab changes only the badge,
top strip and voice button there, and the project rules say not to touch the durak game UI. Leave as is.

## Deferred (do NOT fix)
Paintball old `Hud` monkey-patching via `wrap`/`defineProperty` (later cleanup); brittle `import.meta.glob` source rewrite in
`test/newmode-camera.test.ts`; meter-HTML builders in hide/pirates and local `plural` in regatta; phone checks for hide,
skill, pirates, rats, plane (the lead does a phone smoke test at integration); states shown with injected data.
The new icons (awp, headshot, slots, seaplane, thief) are being drawn now — do NOT wire them in this round.
