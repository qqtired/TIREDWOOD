# Screen groups (Tasks 3–8) — shared context from Tasks 1–2

Read this after your task brief. The brief is your requirements; this file is what earlier tasks built and the rules.

## What already exists on mode/ui (your branch starts from bf81def)
- **Kit** `client/ui/kit/`:
  - `tokens.css` (skin `retro2`, h/w token pairs), `kit.css` (`.k-*` components, copied from `lab/ui/kit/kit.css`),
    `combat.css` (`.k-vitals`, `.k-arm`, `.k-edge`, `.k-cross`, `.k-float`…).
  - `icons.ts` `uiIcon(id)` → URL of `client/assets/ui/icons/<id>.webp` (88 icons; '' if missing).
  - `dom.ts` `h(tag, cls?, html?)`, `keyHtml(k, corner?, size?)`, `coinHtml(cls?)`, `iconImg(id, cls='k-ic')`,
    `meterHtml(v, tone?, cls?)`. (`dom.ts` uses `import.meta.glob` — not importable from node tests.)
  - `scale.ts` `hudScale/applyHudScale/bindHudScale` — the only writer of `--hud-k`.
  - `sfx.ts` `sfx.play(name)` (`click|open|close|reward|error|toast|tick|pop|level`), `bindClickSounds(root)`;
    setting `uiSounds`.
  - `slots.ts` `HudSlots`: `root` (`.k-hud` in `#hud`, zoom `--hud-k`), slots `tl tr bl bc br c tcUnder`;
    `top` = separate `.k-hud.k-hud--top` layer on `document.body` (z 25, above `#menus` z 20) holding slot `tc`.
  - `topcenter.ts` `TopCenter` (one manager for top-centre): `event({key, prio, html, tone?, lamp?})`, `clear(key)`,
    `toast({key?, tone?, icon, title, sub?, life?})`, `clearToasts()`, `hero({key, prio, tone, title, sub?, dot?, life?})`
    → boolean shown, `clearHero(key)`. `PRIO = { vote 90, link 80, boss 70, mode 60, storm 50, pirates 50, timer 40, info 10 }`.
    `escHtml(s)` for any server/nick text put into event html. Events with prio ≥ link set `html[data-tc-event]` + `--tc-event`
    (Esc menu shifts down). `--tc-stack` = stack height; `.k-slot--tc-under` sits below it (pirate raid panel lives there).
  - `badge.ts` `Badge` in `tr` (nick, level ring, tokens). Level and tokens live ONLY in the badge.
  - CSS var `--below-badge: calc(66px * var(--hud-k,1))` (`client/styles.css` ~2023): anything placed under the badge uses it.
- **Scenes get the kit through** `ui` (`client/scene.ts` `interface Ui`, built in `client/app.ts:291`):
  `ui.slots` (HudSlots), `ui.top` (TopCenter), `ui.chat`, `ui.toasts` (old API, routes to TopCenter), `ui.tokens`, `ui.me()`.
- Plaza shell (Task 2) is the worked example: `client/lobby/hud.ts`, `client/lobby/storm.ts`, `client/lobby/piratehud.ts`,
  `client/ui/kickvote.ts`, `client/ui/linkbanner.ts`, `client/ui/toasts.ts` + `client/ui/toastlead.ts`. Read them before
  building your HUD so your mode follows the same pattern (slot children, not `position:absolute` on the screen).
- Kit windows: `.k-scrim` (own layer, z 30, zoom `--hud-k`) containing `.k-window`. Never put `.k-scrim` inside `.k-hud`
  (double zoom). Pieces anchored to screen pixels (damage numbers, threat arrows, labels over the world) go in an unzoomed
  `.k-world` with inner `.k-world-in` (scaled by `--hud-k`).
- Legacy `zoom: var(--ui-scale)` on old selectors (`client/ui/menu/menu.css` ~902-909 and elsewhere): remove only the
  selectors of pieces YOU moved to the kit.
- Visual reference = the review page source `lab/ui/` (`lab/ui/screens/<group>.js|css`, `lab/ui/kit/KIT.md`,
  `lab/ui/kit/KIT-combat.md`), live at https://tired.solutions/tech/tiredwood-ui-v2/ . Where the plan text and the lab
  differ, the lab governs. Inventory of the current game UI for your group: the file named in your brief under
  `/private/tmp/claude-501/-Users-tired-Desktop/56f6b8eb-2545-4e49-9c5b-d98b01077673/scratchpad/ui/inventory/`.
- The HUD look (enamel vs a light variant) is still being chosen by the owner; it will be a token block swap. So: ONLY kit
  tokens/classes, no hard-coded colours, and it will just work.

## Global constraints (verbatim from the plan)
- Шрифт ≥ 14 px; 13 px — только третичные подписи; меньше 13 нельзя. Числа `tabular-nums`.
- Иконки — картинки из `client/assets/ui/icons/` (88 шт., imagegen); эмодзи как иконки интерфейса — убрать.
- Своё — золотом; опасность — красным; одна информация — в одном месте (уровень и жетоны — только бейдж).
- Подсказок только в `title` быть не должно: в игре мышь захвачена. Every window opens and closes by mouse too.
- Цвета категорий рыбы `--tier-*` = `shared/fishrules.ts TIER_CSS`, вид шкалы вываживания не меняем.
- Сине-жёлтое вместе на флагах/вымпелах/лодках — нет.
- Нет `backdrop-filter` в HUD боя; у `retro2` `--plate-blur: none` — так и оставить.
- Протокол и сервер не меняются; `PROTOCOL_VERSION` не трогать. No new npm packages.
- HUD over the game is compact (owner: «слишком большие экранчики… сильно уменьшать»): if a non-window block takes more than
  1/8 of the screen — shrink it. Sizes: `lab/ui` scenes are the target at 1440×900.
- Проверка в конце: `npm run check && npm test && npm run build` + снимки главных состояний 1440×900 и 2560×1440 (headless).

## Working rules
- Work ONLY in your worktree (path in the dispatch). Branch `ui/<group>` is already checked out there; `node_modules` is a
  symlink to the shared one — never run `npm install`/`npm ci`.
- Edit only your group's files. In shared files (`client/app.ts`, `client/styles.css`, `client/scene.ts`) only your own
  lines, short. Need a change to the kit (`client/ui/kit/*`)? Make the smallest additive change (new class/helper, no
  changes to existing behaviour) and list it under «Kit changes» in your report so the lead can merge it cleanly.
- Do not touch `client/fight/`, `server/fight/`, statue files (`statue*`, `STATUE`), `lab/ui/`, `docs/superpowers/`.
- Dev server: `PORT=<your port> DATA_DIR=$(mktemp -d) FISH2=1 ISLE=1 node server/main.ts --dev` from your worktree; stop it by
  its PID only. Dev commands in chat (`/go …`, etc.) work with `--dev`. Never use the nick «Проверка». Never log in to the
  production site.
- Headless Chrome: your own `--user-data-dir` and `--remote-debugging-port` (use your port + 6000), kill only your own PIDs,
  never `pkill`/`killall`. Shared lock: `mkdir /private/tmp/claude-501/-Users-tired-Desktop/56f6b8eb-2545-4e49-9c5b-d98b01077673/scratchpad/ui/chrome.lock`
  before launching Chrome, `rmdir` it when Chrome is closed; if the mkdir fails, wait and retry (another group holds it) —
  hold it only while taking snapshots. CDP helpers you may copy: `scratchpad/ui/lead-work/cdp.mjs`, `page.mjs`.
- Disk is nearly full: reuse ONE Chrome `--user-data-dir` for all your runs; when done, move it to `~/.Trash`. No big temp copies.
- python3 is broken — use node. Delete only by moving to `~/.Trash`, never `rm`.
- Images: you cannot generate images. If an icon is missing from `client/assets/ui/icons/`, reuse the closest existing one
  and list it under «Missing icons» in your report — the lead generates it later.
- Tests: minimal, node `--test` for pure logic you add; UI checked by headless snapshots. Don't add browser test frameworks.
- Commit on your branch (one or a few commits), never push, never merge. Do not call any `mcp__hearthbot__` tools.
- Snapshots go to `/private/tmp/claude-501/-Users-tired-Desktop/56f6b8eb-2545-4e49-9c5b-d98b01077673/scratchpad/ui/shots/t<N>/`.

## Report contract
Write the full report to the report path in your dispatch: what you built per brief step (file:line), kit changes, missing
icons, tests run (command + one-line result), snapshot paths with one line each, anything not built and why, concerns.
Reply to the lead with only: status (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED), commit sha(s), one-line test
summary, concerns.
