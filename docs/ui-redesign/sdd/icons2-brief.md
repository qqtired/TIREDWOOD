# Missing UI icons — imagegen + wiring (Task 9, step 6)

Project: TIREDWOOD unified UI (kit 2.0). The kit uses 88 imagegen icons in `client/assets/ui/icons/*.webp` (`uiIcon(id)` in
`client/ui/kit/icons.ts`). Several screens use the nearest icon as a stand-in. Draw the missing ones in the SAME style and
put them in. Work in the worktree `/Users/tired/Desktop/game-opus-ui` (branch `mode/ui`). Commit there; do not merge, push or
deploy. One commit for the icons + PROVENANCE + sheet, one commit for wiring.

## Icons to draw (id — what it is — where it is used now as a stand-in)

Fort enemies (read `shared/fortkinds.ts`, `shared/fortbosses.ts` and the fort client models/labels in `client/fort/` to
describe each one faithfully — they are jelly-bean/zombie-ish cozy cartoon foes, not horror):
- `bloater` — swollen exploding zombie — now `bomb`
- `spitter` — zombie that spits — now `paint`
- `armored` — armoured zombie — now `zombie`
- `ram` — boss «таран» — now `boss`
- `golem` — boss golem that throws rocks / quakes — now `boss`
- `pumpkin-boss` — boss «тыква» (NOT the farm crop) — now `boss`
- `weaver` — boss «ткач» — now `boss`
- `leshy` — boss «леший» — now `rift-tree`
- `elite` — the «элита» chip on stronger enemies — now `level`

Menu / Tab:
- `kick` — «выгнать» in Tab (`client/ui/online.ts`): a jelly hand pointing out of an open door / a boot nudging — now `exit`
- `cellar` — Подвал (Fight Club entry in records/menu): boxing glove — now `lock`

Other modes (only ADD the files here; the modes branch wires them later):
- `awp` — the fort/paintball long sniper rifle (cozy paint-marker look) — now `fort/cannon.webp`
- `headshot` — target/bullseye for a head shot — none
- `slots` — slot machine (skill test jackpot) — now `level`/`roulette`
- `seaplane` — seaplane (plane mode) — now `landing`
- `thief` — jelly thief carrying a crate (pirate raid) — now `pirate-flag`

## How (the same pipeline as the first 88 — do not invent a new one)

- Pipeline copy in your scratch: `/private/tmp/claude-501/-Users-tired-Desktop/56f6b8eb-2545-4e49-9c5b-d98b01077673/scratchpad/ui/icons-work/`
  (`gen.mjs`, `post.mjs`, `procdone.sh`, `mkprov.mjs`, `subjects-override.json`, list in `../icons-list.md`, processed `out/`).
  The same scripts are documented in the repo at `docs/ui-redesign/icons-pipeline/` and `docs/ui-redesign/briefs/icons-list.md`.
  Read `gen.mjs` first: it builds the exact prompt (shared STYLE, jelly suffix for characters — add the jelly ids you draw to
  `CHARS` if they are jelly characters) and runs `codex exec` with the built-in `image_gen`, one image per call.
- Add the new subjects (English, one line each, like the existing ones) to `icons-list.md` in the scratch dir, under a new
  heading «Дополнение 2». Run `node gen.mjs 3 <ids…>` (concurrency 3, in the background, it takes minutes per icon). Then
  `procdone.sh` → `out/<id>.webp` (256×256 WebP, cropped by alpha, fitted to 240 px).
- Review every result yourself with `node post.mjs preview …` (look at the PNG with the Read tool) next to 3–4 existing icons
  (`zombie`, `boss`, `brute`, `exit`). Redo (as `id:v2` via `subjects-override.json`) any that has text/letters/numbers,
  a background box, sci-fi/neon/horror, a blue+yellow combination, or does not read at 48 px. At most 2 retries per icon; if
  still bad, keep the stand-in and say so.
- Copy the good ones to `client/assets/ui/icons/`, update `client/assets/ui/icons/PROVENANCE.md` (add a «Дополнение 2» section
  in the same format: count, date, Codex version from `codex --version`, table with id, subject, original file name — use
  `mkprov.mjs` or follow its output format) and rebuild `_sheet.png` with `node post.mjs sheet`. Update the counts in the
  PROVENANCE header.

## Wiring (in `mode/ui`)

Replace the stand-ins listed above for the fort and the menu/Tab: grep `client/fort/` and `client/ui/` for the stand-in ids
(`'bomb'`, `'paint'`, `'zombie'`, `'boss'`, `'rift-tree'`, `'level'`, `'exit'`, `'lock'`) and change only the places that
mean the new thing (an enemy-type → icon map, the elite chip, the kick button, the Подвал/Fight Club row). Do not touch
`client/fight/`, `server/`, the paintball/race/hide/skilltest/pirate/plane files (another branch owns them) or the farm's own
`pumpkin` crop icon. `npm run check && npm test && npm run build` once at the end (if only `test/server-http.test.ts` or
`test/server-storage-failure.test.ts` fail on a startup timeout, re-run those two alone). Snapshots are not needed; one
contact-sheet PNG is enough.

## Rules

- Images ONLY through Codex imagegen (`codex exec`, built-in `image_gen`) — never drawn or edited with code (crop/resize/WebP
  by `post.mjs` is fine). No text on images. No blue+yellow together. Do not ask for or read any keys or tokens.
- python3 is broken — use node. Never `rm`: move unwanted files to `~/.Trash`. Disk is nearly full: one headless Chrome
  (post.mjs starts and kills its own); do not keep extra copies of originals in the repo.
- Do not call any `mcp__hearthbot__` tools.
- Do not touch the statue (`statue*`), `client/fight/`, `server/fight/`.

## Report

Write the full report to `/Users/tired/Desktop/game-opus-ui/.superpowers/sdd/2026-10-11-unified-ui/icons2-report.md`:
which icons were drawn (and which retries), which stayed stand-ins and why, the contact-sheet path, the wiring changes
(file:line), commits, test summary. Return only: status (DONE / DONE_WITH_CONCERNS / BLOCKED), commits, a one-line test
summary, concerns.
