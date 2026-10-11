# Final whole-branch review: unified UI 2.0 (`mode/ui` → `main`)

**Scope.** `git diff main..mode/ui`: 48 commits, 811 files, +28.2k / −19.1k lines. About 175 of the files are code. The rest
are icons, HD art, `lab/ui/` and `docs/ui-redesign/`.

**Method.**
- Read in full: the kit core (`client/ui/kit/*`), `client/app.ts`, `client/scene.ts`, the `LobbyScene.exit()` path, and
  every TopCenter caller.
- Read the other areas through per-area diffs.
- Ran three read-only sweeps: scene exit and leftovers; CSS, emoji, fonts and orphans; per-frame DOM work. I re-checked
  every sweep finding at its cited line before using it.
- Did not start servers or browsers and did not run tests. The lead's run gave `check` ok, `build` ok, tests 1749/1749.
  The acceptance pass is walking the build separately.

**Verdict: With fixes.** Critical 0 · Important 2 · Minor 18. Deferred minors: 8 lines (6 distinct fixes) to fix before merge, 8 already done, the rest later.

---

## Strengths

- **One owner for the top centre, done properly.**
  - `TopCenterModel` (`client/ui/kit/topcenter.ts:43-111`) is pure logic and tested in `test/ui-kit.test.ts`. The DOM
    wrapper only re-renders when the markup changes.
  - `morph()` (`:300-312`) keeps vote buttons alive between timer ticks.
  - `hero()` returns whether it was shown. This fixed the lost lighthouse banner (`storm.ts:154` retries).
  - `--tc-stack` and `--tc-event` give the pirate panel and the favourite screens (`durak.css:225`, `blackjack.css:200`,
    `billiards.css:284`, `dungeon.css:553`) one place to slide under. This happens in scene pixels, multiplied by `--hud-k`
    only where needed.
- **Prefix discipline holds across all eight groups.**
  - Every mode keys its toasts and banners (`farm`, `sk-`, `hd-`, `rc-`, `rg-`, `pb-`, `ft-`). Every mode clears them by
    prefix on exit, and no mode calls a bare `clearToasts()`.
  - The only bare call is `Toasts.clear()` (`client/ui/toasts.ts:42`), and nothing uses it.
- **Leaving a mode is robust, with three mechanisms layered on each other:**
  - an explicit reset in each `exit()`;
  - room-gated CSS (`html:not([data-room='…']) .xx-only`, in skilltest/hide/race/paintball/fort CSS line 6–8), with
    `data-room` deleted in `leaveGame`;
  - `.k-hud [hidden]{display:none!important}`.
- **No re-entry duplication.** All slot DOM is built in constructors of cached scenes (`??=`, a map per track, LazyScene),
  so nothing is appended per `enter()`.
- **The scale model is right.**
  - `zoom` applies only on `.k-hud`, `.k-scrim` and `.en-scr`.
  - Screen-pixel pieces live in unzoomed `.k-world` layers (fort, pirates, paintball, hide, plane).
  - I found no kit layer nested in another, so nothing is zoomed twice:
    - mode windows are siblings of `.k-hud` in `#hud`;
    - fishing windows are in `#menus`;
    - farm windows are `<dialog>`s on `body`;
    - `LinkScreen` is not an `.en-scr`.
  - Icons are 256 px, so they stay sharp at 2K.
- **Results windows are consistent.**
  - `ModeResults` (`client/ui/kit/modes.ts:256-411`) updates in place, so the regatta vote keeps its clicks.
  - Every results owner frees the mouse through `wantsPointer`: race `scene.ts:17`, paintball `:20`, hide `:36`, skill
    `:56`, fort `:25`.
  - `quietPause` gives a veil instead of the full menu when Esc left a results window without a gesture.
- **Hard constraints hold.**
  - `git diff main..mode/ui -- server shared` is empty, and `PROTOCOL_VERSION` is untouched.
  - There is one new devDependency, `@fontsource/rubik-mono-one` 5.3.0, approved by the owner.
  - There is no inline script, which keeps the nginx CSP (`script-src 'self'`) satisfied. Inline `style="--v:…"` is
    covered by `style-src 'unsafe-inline'`.
  - Real `backdrop-filter` exists only on `.fr.fi-reel.k-plate` (`client/lobby/fishkit.css:101`). Every kit
    `backdrop-filter: var(--plate-blur)` computes to `none` (`tokens.css:117`, `:180`).
  - The branch added no font below 13 px: all 62 remaining sub-13 declarations exist identically on `main`.
  - The branch added no `title=`.
  - No new blue+yellow.
- **Other code quality.**
  - Nicks and server text in event HTML go through `escHtml`, prompts through `esc`, toasts through
    `setCoinText` (textContent).
  - Hot paths are mostly key-guarded: fort vitals/stall/floaters, race, hide (10 Hz), paintball, the boat key on integer
    km/h. There is one `ResizeObserver` in total, and no listener leaks.
  - Orphan CSS fell from 16 classes on `main` to 7 in the nine biggest CSS files.

---

## Issues

### Critical

None.

### Important

**I1. Mode event plates cover the header of the Esc menu window, in every mode that has a plate.**

Where:
- `client/ui/kit/topcenter.ts:248` moves the menu (`data-tc-event`/`--tc-event`) only for `prio >= PRIO.link`, i.e. the
  vote and the link plate.
- The plate layer `.k-hud--top` is z 25, above `#menus` z 20 (`client/styles.css:755-758`).
- The menu window is 1100×812 and centred, so its top edge is at y ≈ 44 in scene pixels (`client/ui/menu/menu.css:20-23`,
  `kit.css:325`).
- A plate starts at y = 16 and is 52–110 px tall:
  - fort break plate with the foe row: `fort/ui/wave.ts:80-85`;
  - fort boss plate with two 16 px bars: `fort/ui/boss.ts:131-136`;
  - paintball score: `paintball/ui.ts:439`;
  - hide round: `hide/hud.ts:322`;
  - skill clock: `skilltest/hud.ts:170`;
  - also rats, boat, roulette, the fishing event, the aquapark timer and the plane.
- It is centred on x = 720, max-width 440, so it covers the right pane's eyebrow and section title, which start at x ≈ 462.

Why it matters:
- Pausing in fort, paintball, hide or «Выше облаков», or near the pier, rats, roulette or a boat, puts a white plate over
  «Профиль»/«Звук» for as long as the menu is open. It overlaps by roughly 30–65 px.
- The owner's rule is «без наложений». The Task 4 report already measured about 18 px for the smallest plate. The modes
  merged later made it much larger.
- The lobby already hides storm and pirates while the menu is open (`eventEligible`, `lobby/scene.ts:709`), so the
  behaviour is also inconsistent.

Fix (cheap, central, no per-mode change):
- In `TopCenter.renderEvent`, add a class to plates below `PRIO.link` (e.g. `is-minor`).
- Hide those plates while the full menu is open:
  `html:has(#menus .screen.pause.show:not(.veil)) .k-hud--top .k-event.is-minor { visibility: hidden }`. Alternatively,
  call `top.setMenuOpen(p)` from `App.setPaused` (`app.ts:1061`).
- Toasts may keep their short overlap, as decided in Task 2.
- Under the veil the window is hidden, so the plates stay.
- Check: a snapshot of the Esc menu during a fort break and during a paintball round at 1440×900.

**I2 (promoted from the Task 7 deferred list). The ninth row of the fort shop («Пулемёт») is clipped under the footer.**

Where:
- `client/fort/ui/ui.css:109` fixes the stall between `top: 72px` and `bottom: 88px`, which leaves 740 px of scene.
- Head about 98 px, foot about 44 px, 9 rows plus 8 gaps. Rows wrap to two lines because `.ft-row-det` sits in a column
  about 200 px wide (`:118`, `:125`). That needs about 800 px.
- The stall is non-modal with the mouse captured, so the body cannot be scrolled.

Why it matters:
- The best weapon is invisible at the owner's 1440×900 and 2K (same 900-px scene). Only someone who knows can press 9.
- This is a player-visible defect in the main loop of the mode.

Fix (CSS only), any of:
- single-line `.ft-row-det` with an ellipsis;
- `min-height: 48px`, `gap: 4px`;
- drop the portrait from the stall head (`stall.ts:65`).

Then check: all 9 rows visible at 1440×900 with «Размер интерфейса» at 100 %.

### Minor

Marked **fix now** where the fix is a line or two and the effect is player-visible; otherwise later.

1. **fix now — The farm chat dock floats 148 px above its corner.**
   - `client/styles.css:871-873` (`html[data-room]:not([data-room='lobby']) .k-slot--bl{bottom:164px}`, «пока HUD режимов
     не в слотах») still applies to the farm.
   - The list of rooms that put the dock back (`:877`) has race, paintball, hide and skill; fort has its own
     (`fort/ui/ui.css:11`). The farm has nothing in the bottom-left, and the lab farm (`lab/ui/screens/farm.js:170`) docks
     the chat in the corner.
   - Fix: add `[data-room='farm']` to `:877`. Better: delete the 164 px rule, since only Fight Club, which is being
     removed, still needs it.
2. **fix now — The fishing drink tile shows in every room and lies on the Dungeon's kills/pause strip.**
   - `client/lobby/fishprogresshud.ts:136`, `:210-221`: «напиток — … в любой комнате». In fort, farm, paintball and race the
     tile is noise in the top-right row, because the drink only affects fishing prices.
   - In the Dungeon (an owner favourite), `.dg-tr` sits at `top: var(--below-badge)` (`client/dungeon/dungeon.css:144`).
     That is exactly where the first `tr` row below the badge goes, so the two overlap.
   - Fix: `html:not([data-room='lobby']) .fi-drink { display:none }`. This was the Task 5 «eyeball at integration» item.
3. **fix now — Emoji as icons, with the explanation only in `title`, in the fishing journal.**
   - `client/ui/fishbook.ts:100-102`: the `⚓ / ⚓+ / 🌧 / 🌫` marks on cells, with `marks.title = what`. The journal is a
     kit window.
   - Fix: use `iconImg('anchor')`, `iconImg('rain')` and `iconImg('fog')` (all exist), and show the words in the picked-fish
     line that `onPick` already renders.
   - `fishbook.ts:50-51` (🏝) is the same pattern. This was the Task 5 deferred item.
4. **fix now (trivial) — `--focus` name clash breaks the Retry button's focus state on the loading screen.**
   - `client/ui/transition.css:10` (`.tr{--focus:50% 50%}`, also inline at `transition.ts:564` and `lobby/isle/cover.ts:27`)
     shadows the kit focus-ring token (`tokens.css:140`).
   - `.tr-retry` is a `.k-btn` (`transition.ts:184`). Its `:focus-visible` box-shadow (`kit.css:80`) becomes invalid, so the
     button loses its drop and its ring.
   - Fix: rename the token to `--art-focus` in those three places and in `transition.css:46`.
5. **fix now — `«Выше облаков»` timer rebuilds the event plate every frame.**
   - `client/skilltest/hud.ts:164-170` is called each frame from `skilltest/scene.ts:614`. `skillTime()`
     (`shared/skilltest.ts:147`) has hundredths, so the HTML always differs.
   - `TopCenter.event` then parses a `<template>`, replaces the timer node and re-lays out the grid on every frame of a
     platformer. On `main` the same timer was one `textContent` write.
   - Fix: build the plate without the time and write the `.k-event-timer` text directly, or show tenths and update at 10 Hz.
   - Smaller relatives, for later:
     - `lobby/plane.ts` `hudUpdate`: altitude and km/h morph several times a second;
     - `fort/ui/boss.ts:131` up to about 30 Hz while the boss is being hit;
     - the aquapark timer (`lobby/hud.ts:176`, hundredths, about the same cost as on `main`).
6. **later — The aquapark timer ranks below storm and pirates.**
   - `PRIO.timer` 40 < `PRIO.storm`/`pirates` 50 (`topcenter.ts:14`). The storm plate shows lobby-wide for the whole phase
     (`storm.ts:162`).
   - A player on an aquapark run during a storm loses both the run timer and the «Финиш!» result.
   - Suggest timer 55: it is personal and short.
   - The boat (35), roulette (36) and fishing event (30) ranking below storm is deliberate (`fish2hud.ts:531`). Keep it.
7. **later — Closing a window with Esc leads to the full pause menu in the lobby and farm, but to the veil after a results
   window.**
   - Affected callbacks: `lobby/scene.ts:617-619` (fishing journal, NPC, bag, roulette), `:578` (rat bet window),
     `farm/scene.ts:108`, `:121`. These call `d.wantPointer()` without `d.quietPause?.()`. Esc is not a user activation,
     so the lock fails and `watchPointer` opens the menu.
   - This matches `main` (no regression), but the branch made the two paths visibly different.
   - Fix: add `d.quietPause?.()` in those 6 callbacks. It is harmless when the window was closed by a click.
8. **later — `leaveGame` neither hides nor clears the `.k-hud--top` layer.**
   - `app.ts:933-951` hides only `#hud`. The top layer sits on `body` at z 25, above the login and link screens.
   - The sweep found no event left behind: every `exit()` clears its keys, `kickVote.reset()`, `transition.cancel()`.
     Only global toasts (≤ 7.5 s) can show over the link window.
   - Hardening: `this.top.clearToasts()` in `leaveGame`, or `#hud.hidden ~ .k-hud--top{display:none}`.
9. **later — The storm banner «Маяк горит!» is not cleared on lobby exit.**
   - `lobby/scene.ts:881-882` clears the `storm` event but not `clearHero('storm')`.
   - It lives in `slots.c` (inside `#hud`) and expires by itself within 3.3 s, so the cost is a short stray banner over the
     next room's first frames. One line.
10. **later — «Размер интерфейса» 115/130 % now scales the whole kit scene.**
    - `scale.ts:11` multiplies after the clamp. At 1440×900 and 130 % the scene is 1108×692, while the kit layouts assume a
      scene 900 tall: the fort stall (I2) and fixed `top/bottom` offsets clip.
    - On `main` the setting scaled only the menu, chat and toasts.
    - Suggest capping the result so the scene stays at least about 800 tall, or documenting it.
11. **later — Legacy `:root` tokens override kit tokens.**
    - `client/styles.css:19` `--gold:#ffd35a` wins over the kit `#ffcd4a`, because both are 0,1,0 and `styles.css` loads
      later (`startup-game.ts:11-14`). Every kit gold is slightly paler than the lab and mismatches `--gold-soft/-hi/-lo`.
    - `--line` (`:12`) has no visible leak, because the kit re-sets it on `.k-scrim/.k-window/.k-hud`.
    - Fix: rename the legacy tokens when the legacy screens (wardrobe, jukebox, touch, photo, fishhud) move to the kit.
12. **later — Dead code left by the migration:**
    - the `--ui-scale` write (`settings-panel.ts:223-226`; no CSS reads it any more);
    - `.pause{backdrop-filter:blur(3px)}` (`styles.css:692`, overridden by `menu.css:7`);
    - the `.field` family (`styles.css:617-648`, old login form);
    - `.farm-foot-xp .k-note b` (`farm.css:108`);
    - dead names in `menu.css:665` (`.br-help`, `.skill-help`, `.ft-help`);
    - lab leftovers in the kit with no TS user: `.k-world-in`, `.k-ctx*`, `.k-mode-text`, `.k-hr`, `.k-tiles--left`,
      `.k-caret`, `.k-edge-emoji`, `.mo-score`, `.fi-dim`;
    - `fishfmt.ts:41-45` `bagMarks` (unused).
13. **later — 13 px on text that is not tertiary.**
    - The rule says 14 for main text. 13 px is used for:
      - `.ft-why`, the red refusal reason (`fort/ui/ui.css:130`);
      - `.k-arm` and `.k-edge-label` (`combat.css:42`, `:83`, copied verbatim from the lab);
      - `.mo-team-name` (`modes.css:91`);
      - `.fb-price`, `.fb-tier`, `.fb-rec` (`fish2.css:553`, `:611`, `:541`);
      - `.farm-lvl-item span` (`farm.css:216`);
      - `.voice-tip` (`voice.css:24`).
    - Cheapest win: raise `.ft-why` and `.voice-tip` to 14, because they explain refusals and errors.
14. **later — Information still only in `title`.**
    - `fishprogresshud.ts:64` (list of unlocked perks), `isle/ignathome.ts:57` and `barkas/sanyahome.ts:60` (the
      explanatory sentence), `voice.ts:156` (the button label; the key cap and the tip cover the main cases).
    - All are pre-existing. Favourites (durak, billiards, blackjack) are out of scope.
15. **later — Banner arbitration drops lower banners silently.**
    - The «Не туда!» banner (`race/hud.ts:477`, `regattahud.ts:154`: prio 65, life 600 000 ms) blocks a level-up banner
      (60). `app.ts:714` does not retry, unlike storm.
    - The jackpot (`lobby/hud.ts:172`, prio 10) is dropped under any banner.
    - Suggest a one-slot queue in `TopCenter.hero` for refused banners.
16. **later — Kick vote and fort surrender both use `PRIO.vote` (90).**
    - The older plate is shown, but Y/N go to the fort first (`app.ts:988`, `:1000`). With both live, Y can cast the hidden
      surrender vote. Rare.
17. **later — Paintball and fort patch methods onto the old `Hud` instance.**
    - `paintball/ui.ts:358-420` (`wrap`, `defineProperty`) and `fort/ui/banners.ts:44-56`. The old hidden DOM is still
      written every call.
    - It is contained to one instance each, but any change to `Hud`'s signatures silently bypasses the kit.
    - Refactor to a small interface later. This was the Task 8 deferred item.
18. **later — Every toast plays the chime** (`topcenter.ts:168`).
    - With combat toasts (paintball kills and streaks, fort alarms, race events) the chime is now frequent.
    - It is quiet (0.16 × 0.4), on the «Интерфейс» bus and switchable.
    - Decide after the acceptance pass's «20× in a row» sound check. Option: chime only for `reward`/`warn` toasts.

---

## Deferred-minor triage (`progress.md`, every `minor (deferred)` line)

| Task | Item | Decision | Reason |
|---|---|---|---|
| 1 | legacy `:root` `--gold/--line` override kit | later | Pale gold only; see Minor 11 |
| 1 | `uiSounds` round-trip untested; `dom.ts` not node-testable | later | Tests |
| 1 | `docs/README.md` row for `client/ui/kit/` | **fix now** | CLAUDE.md §8 rule; docs agent is on it, must land before merge |
| 1 | `scale.ts` bare `matchMedia` | later | Browser-only module |
| 1 | «Размер интерфейса» hint outdated | done | Now «Размер меню, плашек и подсказок поверх игры» (`settings-panel.ts:153`) |
| 1 | nested kit layers would double-zoom | done | Verified none (see Strengths) |
| 2 | M3 voice.css rgba | later | Polish |
| 2 | M4 reduced-motion for `.pz` animations | later | Polish |
| 2 | M5 tests for expire/escHtml/Badge | later | Tests |
| 2 | M6 DRY event-icon/meter markup | later | Refactor |
| 2 | M7 dev sandboxes chat input | later | Dev only |
| 2 | M8 schedule/expire +20 ms | later | Harmless |
| 2 | M9 chime on every toast | later | See Minor 18; decide after acceptance sound check |
| 2 | M10 meter morph kills transition | later | Cosmetic |
| 2 | M-c link banner warn/down same tone | later | Polish |
| 2 | M-d chat-hint margin with VOICE=0 | later | Edge config |
| 2 | M-e other modes' top-centre clashes | **fix now** (as I1) | Groups resolved their own clashes; the remaining clash is plates over the Esc menu |
| 2 | `mobile-fishing.css` dead rules | later | Cleanup |
| 2 | «Подсекай!»/photo countdown under the z-25 band | later | As on main |
| 2 | kit windows need a `data-tc` rule per group | done/covered | Fishing and farm windows are `<dialog>`s (top layer, above the band); mode results are centred below the plate. Menu covered by I1 |
| 2 | `tcUnder` extra slot vs lab flow child | later | Works |
| 2 | mid-file import in `test/ui-kit.test.ts` | later | Style |
| 2 | `voice.ts:156,199` title | later | See Minor 14 |
| 2 | pirate «Ящики» row overflow at 375 px | later | Phone polish |
| 2 | 1 px slack at 1440 | later | Invisible |
| 2 | jackpot banner dropped silently (`hud.ts:172`) | later | See Minor 15 |
| 2 | `.pr-arrow i` 11 px, `.pr-table`/`.pr-result-n` 13 px | done | No sub-13 left in `pirates.css` |
| 2 | lab KIT.md/kit.css old z-order text | later | Docs |
| 7 | killfeed/teammate-down names gone | later | Lab has none; owner can ask |
| 7 | «Орда на N» gone | later | Lab parity |
| 7 | Esc → Клавиши fort row | later | Content |
| 7 | nickTone copy | later | Refactor |
| 7 | meter markup not `meterHtml` | later | Refactor |
| 7 | per-frame HTML rebuild wave/boss | later | Wave is string-guarded (about 3–4/s); boss up to 30 Hz only while hit (Minor 5) |
| 7 | thin tests | later | Tests |
| 7 | stand toast truncation | later | Polish |
| 7 | shop 9th row «Пулемёт» clipped | **fix now** | I2: best weapon invisible, mouse captured |
| 7 | «Ещё раз» may flash «Обратно в бой» | later | Acceptance will show whether it is real |
| 7 | announce `met.add` before skip | later | Logic nit |
| 7 | Baron-on-super-wave boss HP test | later | Tests |
| 7 | `quietPauseUntil` 10 s | later | Benign (sweep confirmed) |
| 7 | `pb.killfeed` guard | later | Nit |
| 7 | `drop('rec-hot')` is a toast | later | Pre-existing |
| 7 | Tab pot pill = last cleared wave share | later | Labelled «общак волны N» (`fort/ui/board.ts:52`), not misleading |
| 5 | ⚓+ both-zones mark | **fix now** | Folded into Minor 3 (emoji → icons) |
| 5 | `r.note`; «Потолок» odds; «До сезона» only < 30 min; reel breakdown lines | later | Content polish |
| 5 | untracked single-instance timers | later | One instance each (`fishprogresshud.ts:141`, `ratracehud.ts:238`) |
| 5 | phone catch card covers touch buttons | later | Phone |
| 5 | thin tests | later | Tests |
| 5 | `.fh-chip` old style | later | Legacy fishing-1.0 chip |
| 5 | picker slot persists; focus lost after equip | later | Polish |
| 5 | lighthouse icon reused | later | Icon set |
| 5 | drink tile in every room's `tr` | **fix now** | Minor 2: overlaps the Dungeon strip; noise elsewhere |
| 5 | `fish2.css:628` baseline misaligns «Новичок» | later | Polish |
| 5 | `.fb-rec` clips records ≥ 1000 kg | later | Only giant records |
| 5 | `.fb-*` literal px + legacy colours | later | Polish |
| 5 | `.alb-sub` 12 px | done | Now 13 px (`styles.css:2748`) |
| 5 | emoji headings `album.ts:18,39`, `records.ts:105` | done | Headings plain; records use icon ids |
| 5 | ⚓🌧🌫 marks `fishbook.ts:100` | **fix now** | Minor 3 |
| 5 | `.frx-badge b` 12 px | later | Reel effect; owner keeps the reel look; pre-existing line |
| 5 | dead `fs-skill` compact/new + non-compact `fb-grid` | later | Cleanup |
| 3 | QuickSettings duplicates settings rows; quick-settings focus | later | Refactor |
| 3 | `logoHtml` in entry.ts; `el` vs `h()`; linkbanner imports entry.css | later | Refactor |
| 3 | boot font swap; `fetchpriority` cover | later | Perf polish |
| 3 | nickCheck vs server stripping | later | Server stays the judge; error path exists |
| 3 | thin tests | later | Tests |
| 3 | `onInput` keeps `role=alert` | later | a11y |
| 3 | `#startup-retry` kbd fixed colours; inline boot CSS is a hard light copy | later | Documented coupling |
| 3 | `.join-settings` dead CSS | done | Deleted at merge (`rg join-settings client` is empty) |
| 3 | docs row lists `index.html` under `client/` | **fix now** | Same docs commit as the kit row |
| 4 | menu above photo/catch cards on pause | later | Correct layering |
| 4 | hard-coded scrim rgba; `#fff/#000` `.mn-tier i` | later | Polish |
| 4 | `aria-valuenow` on level meter | later | a11y |
| 4 | vote plate over the Tab header | later | Rare; Tab is hold-to-view |
| 4 | thin tests (top-4 records, slider clamp) | later | Tests |
| 4 | `online.css` phone query fires on short wide windows | later | Edge desktop size |
| 4 | narrow-phone squeeze; 320 kick label; 8 px act cell | later | Phone |
| 4 | voice rows pointer cursor | done | Lead fixed at merge |
| 6 | cone E prompt; «ещё 22 из 30»; «В час ≈ N»; tutorial ×; Фургон countdown; help prompt on watered bed | later | Wording polish against the lab |
| 6 | rgba shadows; tile aria | later | Polish |
| 6 | per-frame `JSON.stringify` | later | DOM write is key-guarded; trivial |
| 6 | levelup re-show on exit | **fix now** | See below |
| 6 | thin tests | later | Tests |
| 6 | «Подойди к грядке ближе» wording | later | Wording |
| 6 | belt at ≤ 0.9 m steals the wheel | later | Edge |
| 6 | default `farm` key replaces scene toast | later | Acceptable (one farm toast at a time) |
| 6 | camera wheel without throttle | later | Pre-existing |
| 8 | paintball `Hud` monkey-patch | later | Minor 17 |
| 8 | brittle `import.meta.glob` rewrite in `newmode-camera` test | later | Tests |
| 8 | meter builders hide/pirates; local plural in regatta | later | Refactor |
| 8 | phone unverified hide/skill/pirates/rats/plane | later | Acceptance phone smoke covers start/leave |
| 8 | injected-data states | later | Tests |
| 8 | pirate arrow fan 0.2 rad crowding | later | Needs a real raid |
| 8 | pirate-arrows snapshot black rectangle | later | Acceptance pass checks it in the real build |

About «levelup re-show on exit» (Task 6): `FarmHud.setVisible(false)` → `close(false)` → `LevelWin.close(true)`
(`client/farm/ui/levelup.ts:36-42`) shifts the next queued level and calls `show()`. That opens a modal `<dialog>` on
`body` after the player has left the farm, when two or more farm levels came at once. Fix: a `reset()` that clears
`queue` and is called from `setVisible(false)`.

**Fix now: 8 lines, 6 distinct fixes.** The docs map rows (kit row and the `index.html` row, one commit), I1 (M-e), I2 (shop row), the
fishbook icons (⚓+ and the marks), the drink tile, and the farm levelup queue. «Done»: 8. Everything else: later.

---

## Sweep triage (`rg 'ui-scale|panel-strong|cream-2|🪙|🎣|📖' client`, 210 hits now; snapshot was taken before the modes merge)

| Pattern | Before → now | What is left | Decision |
|---|---|---|---|
| `ui-scale` | 3 → 3 | 2 comments + the dead write `settings-panel.ts:226` | later (Minor 12) |
| `--panel-strong` | 57 → 37 | Definition `styles.css:11`; wardrobe `:1068`; photo `.ph-card :2392`, `.ph-count :2340`; fishing-1.0 `.fs-card :2570`; touch `.tc-btn :3137`, `.tc-emotes :3162`; reel visuals `fish2.css:199`, `fishabfx.css:74`, `:114` | OK/later. Favourites (dungeon 6, billiards 3, blackjack 3, durak 15) are OK. Reel visuals are owner-kept. The rest are untouched legacy screens |
| `--cream-2` | 30 → 23 | `styles.css:607` `.btn.ghost` (wardrobe), `:628` `.field` (dead), `:1397` wardrobe, `:2911`/`:3190` touch, `jukebox.css:137`/`:392` | later (legacy); `.field` → Minor 12 |
| 🎣 | 16 → 16 | Touch-only kit hint key caps `lobby/hud.ts:14`, `lobby/scene.ts:2854`, `:2868` («Тянем! 🎣»); `touch.ts:43`; wardrobe; comments; speech bubble `fishing.ts:335`; in-world board `fishboard.ts:105` | later. The phone caps match the `touch.ts` buttons, which are still emoji; do both in one phone pass. Bubbles and boards are OK |
| 📖 | 2 → 2 | `lobby/scene.ts:2969` (touch hint text), `fishhud.ts:89` (fishing-1.0 button) | later (phone / legacy) |
| 🪙 | 137 → 129 | All remaining kit-era hits go through a converter (`coinText`/`setCoinText`/`coinHtml`, TopCenter title/sub/hero, `modetext.ts`); world canvases (plane3d, ratraceboard, rouletteboard). Not converted: tooltips `sanyahome.ts:60`, `jukebox.ts:124`; `fight/hud.ts` ×2 (Fight Club is being removed) | OK / later |

**Other emoji used as icons:**
- Kit-era, fix now: `fishbook.ts:50-51`, `:100` (Minor 3).
- Later, phone pass:
  - `touch.ts:43-59`, `:63-68`, `:169-172` (action, emote and top-bar buttons);
  - `hide/scene.ts:84` `touchUseIcon` ✨/◎ and `skilltest/scene.ts:58` ⟳, which both feed `touch.ts`;
  - `paintball/slot.ts:8`, `:58`, `:64` (untouched slot overlay 💥 ❤️ 🛡️ 🍒, with a 12 px `.slot-legend` at
    `styles.css:442`).
- Later, documented legacy (`docs/ui.md`): wardrobe and jukebox.
- Typographic ✓ ↑ ↓ → ★ ☰ are glyphs, not emoji icons. OK.

---

## Assessment

**Ready to merge? With fixes.**

The architecture holds up across the eight groups:
- one top-centre manager with prefix-scoped cleanup;
- room-gated CSS as a second safety net;
- a single zoom per kit layer;
- `.k-world` for screen-pixel pieces;
- `ModeResults` shared by every mode;
- no server or protocol change.

No mode leaves anything behind on exit, and nothing is zoomed twice.

Before the owner sees it, fix:
1. **I1**: hide plates below `PRIO.link` while the full Esc menu is open (one class, one CSS rule).
2. **I2**: make all nine fort shop rows fit at 1440×900.
3. The fix-now minors: farm chat dock, drink tile room-gating, fishbook icons, `--focus` rename, the skill-clock per-frame
   rebuild, and the farm levelup queue. Also the docs map rows the docs agent is adding.

All are small and local. Then one scoped re-review (snapshots: Esc menu over fort break, paintball and skill; fort shop;
farm with chat; Dungeon with a drink active) and the lead's CSP check.
