# Task 10 — plaza windows left in the old style: Примерочная, Музыкальный автомат, подарочный код, фото у маяка

Found at integration: these player-visible plaza windows were in the inventory (`docs/ui-redesign/inventory/A-shell.md`
S14, S31, S32) but no group moved them. The owner asked for ONE interface across the whole game, windows «Ретро-парк 2.0»
(retro2), HUD «Светлый». Move them onto the kit so they look like relatives of the kit windows, keeping every function.

Worktree `/Users/tired/Desktop/game-opus-ui-shell2`, branch `ui/shell2` (from `mode/ui` bb4f774), port 3139, Chrome debug
port 9139. Read `.superpowers/sdd/2026-10-11-unified-ui/group-common.md` (kit APIs, rules — note: the owner has since chosen
the light HUD; windows are retro2) and `docs/ui.md` (rewritten kit reference: §1 samples, §4 window behaviour, §8 checklist).

## Screens
1. **Примерочная** — `client/ui/wardrobe.ts` (532 lines; innerHTML at ~130-147, 418, 432), CSS `client/styles.css` (the
   `.lobby-hud .wardrobe` / `.wardrobe …` blocks ~1060+), `client/ui/wardrobe-inspect.css`. Opened at the kiosk on the plaza.
2. **Музыкальный автомат** — `client/ui/jukebox.ts`, `client/ui/jukebox.css` (centre modal, «🎵 Музыкальный автомат»).
3. **Подарочный код** — `client/ui/gift-code.ts|css` (shared by the wardrobe and Esc → Профиль → «Подарки и коды»; the menu
   side is already kit — make the wardrobe side match it).
4. **Фото у маяка** — `client/lobby/photo.ts`: the «3, 2, 1» countdown and the corner photo card with «Сохранить» (F). Keep
   the white photo frame (it is a photo print); only the buttons, key hints, caption text and the countdown move to kit
   pieces (`.k-btn`, `keyHtml`, kit type scale; the countdown may use the kit count style used by modes — `ModeCount` in
   `client/ui/kit/modes.ts`).

## How
- No lab scene exists for these. Copy the closest finished kit window **by structure, sizes, header, buttons and close**:
  the fishing NPC windows (`client/lobby/fishnpcdialog.ts`, kit tabs/cells) and the farm «Хозяйство» window
  (`client/farm/ui/`) — header with icon + title + ✕, tabs `.k-tab`, item cells `.k-cell`, prices via `coinHtml`, «своё» in
  gold, kit buttons. Wardrobe = a big tabbed window with item cells and a preview; jukebox = a medium window with a list.
- Kit only: tokens/classes, icons via `uiIcon`/`iconImg` (there are `wardrobe`, `music`, `gift`, `camera` icons) — no emoji
  as icons (the «🎵» in the title goes), fonts ≥ 14 px (13 only tertiary), numbers `tabular-nums`, nothing only in `title`.
- Windows live in a `.k-scrim` layer (never inside `.k-hud`); close with ✕, click outside, Esc; while open the player does
  not walk; on close control returns; leaving the kiosk/jukebox closes the window. Keep every existing behaviour (buy/equip,
  inspect, gift code entry, jukebox queue/votes, photo save/share on phone).
- Delete the old CSS you replace (`styles.css` wardrobe blocks, `jukebox.css` rules no longer used, `wardrobe-inspect.css`
  if empty) — grep each class first. Remove the legacy `--ui-scale` zoom for these selectors if any.
- Do not touch: `client/fight/`, `server/`, `shared/` (no protocol change), statue files, the four favourite screens.

## Check
`npm run check && npm test && npm run build` once at the end (if only server-http / server-storage-failure fail on a startup
timeout, re-run those two alone). Snapshots at 1440×900 (one at 2560×1440 for the wardrobe): wardrobe (each tab + inspect +
gift code), jukebox (list + playing), photo countdown + photo card, each with the plaza light HUD around it; open/close each
with the mouse. Server: `PORT=3139 DATA_DIR=$(mktemp -d) FISH2=1 ISLE=1 node server/main.ts --dev`, nick `Tester7`. One reused
Chrome profile in your scratch; stop your server/Chrome by own PIDs; move the profile and temp data to `~/.Trash` at the end
(never `rm`). python3 is broken — node. Shots and scratch:
`/private/tmp/claude-501/-Users-tired-Desktop/56f6b8eb-2545-4e49-9c5b-d98b01077673/scratchpad/ui/shots/t10/`.

## Report
`.superpowers/sdd/2026-10-11-unified-ui/task-10-report.md` (in the `game-opus-ui` worktree, not shell2): what changed per
screen, kit changes (additive only — list them), deleted CSS, snapshots list, tests. Return only status, commits, one-line
test summary, concerns. Do not call any `mcp__hearthbot__` tools. Keep it simple; finish fast.
