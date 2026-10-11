# Acceptance pass «как игрок» — unified UI (mode/ui), before the owner sees it

The whole UI redesign is merged into `mode/ui` (worktree `/Users/tired/Desktop/game-opus-ui`). Every group was reviewed on its
own branch; nobody has yet walked the **integrated** build as a player. Do that now, find what is broken or ugly, and report.
**Do not change code** (read-only on the repo; your scratch files go to the folder below). The lead fixes what you find.

Read first: `CLAUDE.md` §2 «Приёмка „как игрок“», §6–7; `docs/ui-redesign/README.md` (what the owner chose and why);
the reference look is the lab: `lab/ui/` (serve it with `node docs/ui-redesign/tools/serve.mjs lab/ui <port>` and compare
side by side when something looks off). Owner choices to respect: HUD «Светлый» (`data-hud="light"`), login «карточка
слева», windows «Ретро-парк 2.0», fishing reel backing translucent with blur, blackjack/durak/billiards/Dungeon keep their own
look (only badge, top strip, chat dock, voice change). He hates «шакальное» (blurry/pixelated) images and overlapping text.

## Setup
- Server: `PORT=3138 DATA_DIR=$(mktemp -d) FISH2=1 ISLE=1 node server/main.ts --dev` from the worktree (run in the
  background, remember its PID). Use nicks like `Tester7` (never «Проверка»). Never log in to the production site.
- Browser: ONE headless Chrome with ONE reused profile in your scratch folder, debug port 9138
  (`docs/ui-redesign/tools/cdp.mjs`, `page.mjs` are the helpers the groups used). Each group's report in
  `.superpowers/sdd/2026-10-11-unified-ui/task-<N>-report.md` says how it reached its states (dev hooks, console helpers,
  `?debug`, `__opus`) — reuse those tricks instead of inventing new ones.
- Scratch: `/private/tmp/claude-501/-Users-tired-Desktop/56f6b8eb-2545-4e49-9c5b-d98b01077673/scratchpad/ui/accept/`
  (shots in `shots/`). Disk is nearly full: one profile, no video.
- At the end: stop your server and Chrome by their own PIDs (never `pkill`/`killall` by name), move the Chrome profile and
  the temp data dir to `~/.Trash` (never `rm`). At most 2 heavy processes of yours at once.

## Walk (1440×900 unless stated)
1. Boot → login card (new player) → first world load → plaza. Light HUD: badge, chat dock, voice, top-centre, tiles.
2. Plaza with real-ish values: a 16-char nick, 6-digit tokens, a toast burst (3+ toasts), a vote plate, storm/pirates event
   if you can trigger it. Nothing overlaps; one piece of info in one place.
3. Esc menu: every tab (Профиль, Коллекция scrolled to the bottom, Звук incl. «Звуки интерфейса», Графика, Голос, Клавиши);
   Tab «Кто где». Open and close each with the mouse (✕ / click outside) and with Esc.
4. Each mode: enter → main state → a window/result → leave back to the plaza. After leaving, nothing of that mode remains on
   screen (top-centre, corners, arrows, windows). Modes: fishing (cast, reel with the blurred backing, catch card, journal,
   Семён/Игнат windows), farm (belt, estate, tree), fort (gather, wave, results), paintball, race (karting), hide, skill
   test, regatta, rat race (bet window), pirates raid, plane «Стриж», blackjack, durak, billiards, Dungeon (only the shared
   top: badge/strip/voice).
5. 2560×1440 (owner plays at 2K): plaza, Esc menu, one fishing reel, fort wave, login card, a loading screen — sharp, scaled
   up, not tiny, not blurry.
6. Phone smoke (375×812 with touch emulation): boots, plaza HUD, Esc menu opens/closes, one mode enters/leaves. Only «does it
   break», no polish.
7. Interface sounds: a click 20× in a row is not annoying; the «Звуки интерфейса» switch mutes them.

Look at every screenshot yourself before citing it. Be the lead's eyes: reject what the owner would reject (overlaps, cut
text, tiny text, wrong skin, leftovers after leaving a mode, an old-style dark panel on the light HUD, emoji where an icon
belongs, windows that cannot be closed with the mouse).

## Report
`.superpowers/sdd/2026-10-11-unified-ui/acceptance-report.md`:
- a table of defects: severity (blocker / should-fix / polish), where (mode + state), what is wrong, screenshot path,
  likely file if obvious;
- what you could not reach and why;
- **the 6 best «showcase» shots** for the owner (plaza 1440, plaza 2560, Esc menu, fishing reel, fort wave, one mode
  result window) — paths, only if they have no defects;
- the server/Chrome PIDs you stopped.
Return only: counts per severity, the report path, and anything that blocked you.
