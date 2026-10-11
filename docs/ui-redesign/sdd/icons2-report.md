# Missing UI icons (Task 9, step 6) — report

Status: DONE. Worktree `/Users/tired/Desktop/game-opus-ui`, branch `mode/ui`. Nothing merged, pushed or deployed.

## Commits
- `50c23e6` — 16 new icons + `PROVENANCE.md` («Дополнение 2») + `_sheet.png` (104 icons) + pipeline docs (`docs/ui-redesign/icons-pipeline/`, `briefs/icons-list.md`, README count 88 -> 104)
- `a7811f9` — wiring (stand-ins replaced)

## Icons drawn (all 16, Codex imagegen 0.162.1, `codex exec` + built-in `image_gen`, concurrency 3, ~100–140 s each)
Fort: `bloater`, `spitter`, `armored`, `ram`, `golem`, `pumpkin-boss`, `weaver`, `leshy`, `elite`.
Menu/Tab: `kick` (boot mid-kick), `cellar` (boxing glove).
Other modes (files only, not wired): `awp`, `headshot`, `slots`, `seaplane`, `thief`.

- Jelly suffix added (CHARS in `gen.mjs`/`mkprov.mjs`): `bloater`, `spitter`, `armored`, `thief`. Bosses and `elite` are not jelly (they are creatures/an object, as in the models).
- Retries: only `pumpkin-boss`. v1 was a glowing jack-o'-lantern with red splatters (read as horror) -> v2 (override `pumpkin-boss:v2`): friendly grumpy pumpkin king with legs, crown, vine arms. v2 is in the game. 15 others passed first time.
- Checked against `zombie`, `brute`, `boss`, `exit`, `bomb`, `rift-tree`: no text/numbers, no background box (border alpha 0 % on all), no neon, no blue+yellow, all read at 48 px (see sheet).
- Stand-ins that stay (correct, not stand-ins): Baron = `boss`, Sapper = `bomb`, Shield = `shield`, Kraken/tentacle = `kraken`.
- Weak spots (also in PROVENANCE): `bloater` stitched seams + jam splashes look slightly «bloody» but cartoon; `armored` also holds a wooden spoon and lid-shield; `leshy` is small-detail (distinguished from `rift-tree` by antlers/arms); `elite` is a golden champion belt (matches the gold belt of elite zombies), no face.

## Files
- Icons: `client/assets/ui/icons/<id>.webp` (256x256 WebP, 10–21 KB each; total 104 icons = 1283 KB)
- `client/assets/ui/icons/PROVENANCE.md` (header counts 104, new section with prompt subjects / Codex thread+file / sha256, retry note, weak spots)
- Contact sheet: `/Users/tired/Desktop/game-opus-ui/client/assets/ui/icons/_sheet.png` (8 x 13, 104 icons, list order)
- Originals are not in the repo (they stay in `~/.codex/generated_images/<thread>/`, ids in PROVENANCE).
- Pipeline fix: `post.mjs sheet` hung at >= 104 icons (one CDP reply too large); now reads the PNG base64 in 1 MB slices (repo copy `docs/ui-redesign/icons-pipeline/post.mjs` updated).

## Wiring (commit a7811f9)
- `client/fort/ui/text.ts:12-15` `FOE` map (used by `foeIcon`: wave card chips, boss hero line): Bloater `bloater`, Spitter `spitter`, Armored `armored`, Ram `ram`, Golem `golem`, Pumpkin `pumpkin-boss`, Weaver `weaver`, Leshy `leshy`.
- `client/fort/ui/text.ts:31-35` `LEAD` (alarm emoji -> toast icon): 💦 `spitter`, 🐗 `ram`, 🍳 `armored`, 🪨 `golem`, 🎃 `pumpkin-boss`, 🕷 and 🕸 `weaver`, 🌳 `leshy` (💣 stays `bomb` — it is the Sapper barrel alarm; 👑 stays `boss` — Baron).
- `client/fort/wavecard.ts:26` elite chip: `level` -> `elite`.
- `client/ui/online.ts:249` Tab «выгнать» button: `exit` -> `kick`.
- `client/ui/online.ts:22` Tab room mark for Подвал: `lock` -> `cellar`.
- `client/ui/records.ts:104` Подвал row in mode stats: `lock` -> `cellar`.
- Beyond the brief: `client/ui/entry.ts:436` «Тебя выгнали» screen icon `exit` -> `kick` (same meaning, one word).
- Not touched: `client/fight/`, `server/`, paintball/race/hide/skilltest/pirate/plane files, farm `pumpkin` crop icon, `ui/modes` worktree, statue. `client/fort/ui/coach.ts:178` still maps the generic «boss» threat to `boss` (not a specific enemy).
- Not wired (modes branch): `awp`, `headshot`, `slots`, `seaplane`, `thief` — current stand-ins there: `fort/cannon.webp`, none, `level`/`roulette`, `landing`, `pirate-flag`.

## Tests
`npm run check && npm test && npm run build`: all green (1745 tests, 0 failed, build ok; new webp are bundled). `test/server-http` did not time out. Log: `.../scratchpad/ui/icons2-verify.log`. No browser run (static icon swaps only; the icon ids exist in the glob and the build emits them).

## Concerns / for the owner
- Not looked at in a live game screen; only the sheet at 48/128 px. A quick eyeball of the wave card with the new chips is worth doing in the next review.
- The new `bloater` splashes and `pumpkin-boss` v2 style are the most subjective; both are easy to redo (`id:v2` in `subjects-override.json`).
