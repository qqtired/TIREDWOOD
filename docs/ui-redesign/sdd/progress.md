# SDD ledger — plan: docs/superpowers/plans/2026-10-11-unified-ui.md
Task 0: waiting — owner answers (skin for whole UI, font package); Rubik 600/800 imports folded into Task 1
Task 1: dispatched (base becb976, implementer a954e673482860735)
Task 0: complete (commit 1f4c369 — rubik-mono-one 5.3.0 devDependency; owner «да» 11.10 06:49Z; skin: retro2 windows, HUD variant pending owner pick: enamel vs light)
Task 1: implemented c48c0e9 (DONE_WITH_CONCERNS: zoom on #hud moves screen-px overlays; touch k=0.8; Rubik 600/800 real faces). Plan amended 0ba18ed (zoom only .k-hud/.k-scrim, .k-world, coarse MIN 0.6). Review dispatched a0607dee23ace3465.
Task 1: minor (accepted): real Rubik 600/800 faces now render ~230 legacy 600/800 rules lighter than before (were synthesized as 700/900); color-scheme: dark on html
Task 1: review 1 — spec ❌ (zoom scope per amended brief), quality not approved (sfx lazy attach, combat.css content:;). Plan amended 4240751 (keep legacy --ui-scale until migration). Fix round 1 dispatched to a954e673482860735.
Task 1: minor (deferred to Task 9): game :root --gold/--line/--focus override kit tokens (styles.css loads later) — remove legacy root tokens or rename when legacy UI migrated
Task 1: minor (deferred): uiSounds load/save round-trip untested; dom.ts helpers untestable under node:test (import.meta.glob)
Task 1: deferred to Task 9: docs/README.md map row for client/ui/kit/
Task 1: fix round 1/5 implemented 7f19d60 (8 findings claimed fixed); re-review dispatched a970ccf73084e001e
Task 1: fix round 1/5 (8 addressed, 0 open; commits 4240751..7f19d60)
Task 1: complete (commits becb976..7f19d60, review clean after 1 fix round)
Task 1: minor (deferred): scale.ts bare matchMedia (non-browser only); "Размер интерфейса" hint outdated (Task 4); nested kit layers would double-zoom — keep .k-scrim out of .k-hud
Task 2: dispatched (base 7f19d60, implementer a6ed79f96af0d3262)
Lab: light HUD variant committed ae8d840 (tag ui-review-v2-hud), published tiredwood-ui-v2 20261011-072929; owner to pick HUD light vs enamel
Task 2: review dispatched (sonnet reviewer a4ae237149b54a1ff, package review-7f19d60..9b5d9db.diff)
Task 2: review — spec ❌ (I1 pirate panel overlap, I2 vote/link/toasts under Esc menu, I3 праздник heroes + storm prompt, I4 title-only hints), quality Approved
Task 2: minor (deferred): M3 voice.css rgba; M4 reduced-motion for .pz anims; M5 tests for expire/escHtml/Badge; M6 DRY event-icon/meter markup; M7 dev sandboxes chat input; M8 schedule/expire 20ms; M9 chime on every toast; M10 meter morph kills transition; M-c link banner warn/down same tone; M-d chat-hint margin VOICE=0; M-e other modes' top-centre clashes (mode groups); mobile-fishing.css dead rules → Task 5
Task 2: fix round 1/5 dispatched (base 72b9e37, findings task-2-fix1.md; promoted M1 emoji map bug, M-a badge vs wardrobe at 2K, M-b safe-area)
Task 2: fix round 1/5 done (commit 2de1322, 1725 pass); scoped re-review dispatched (sonnet a3e1e17deaed03288, diff review-72b9e37..2de1322.diff)
Task 2: re-review round 1 — I1–I4, M1, M-a, M-b ADDRESSED; new Important N1 (pirate panel persists after leaving lobby)
Task 2: minor (deferred): Подсекай!/photo countdown under z-25 band (as before); kit windows need data-tc rule per group; tcUnder extra slot vs lab flow child; mid-file import test/ui-kit.test.ts; voice.ts:156,199 pre-existing title
Task 2: fix round 2/5 dispatched (base 2de1322, findings task-2-fix2.md: N1 + promoted P1 menu jump only for vote/link, P2 level-up toast only on unlock, P3 storm hero lost, P4 pirates.css 12px, P5 tc-under safe-area, P6 click sounds top layer, P7 kit.css z comment)
Task 2: fix round 2/5 done (commit bf81def, 1726 pass)
Task 2: re-review round 2 — N1, P1–P7 ADDRESSED, no new Critical/Important
Task 2: minor (deferred): pirate «Ящики» row may overflow on 375px phone (nowrap + flex:none); 1px slack at 1440; hud.ts:172 jackpot hero dropped silently while another hero shows; .pr-arrow i 11px and .pr-table/.pr-result-n 13px (pre-existing); lab KIT.md:150 / lab kit.css:27 old z-order text
Task 2: complete (commits 9b5d9db..bf81def, review clean after 2 fix rounds)
Groups: worktrees game-opus-ui-fishing (ui/fishing) and game-opus-ui-fort (ui/fort) cut from mode/ui bf81def; shared context group-common.md; max 2 groups at once (owner: ≤2 heavy runs)
Task 5: dispatched (base bf81def, worktree game-opus-ui-fishing, port 3133, opus implementer a6d26e3ad7288b7fe)
Task 7: dispatched (base bf81def, worktree game-opus-ui-fort, port 3135, opus implementer ae6205804b2ec2149)
Owner 10:03Z: HUD = «Светлый» (data-hud=light); login = left-card layout; fishing reel backing translucent + blur (lab e09fecb); spawn any models; SAVE all docs/artifacts of the UI change for future agents
Light HUD port: dispatched (sonnet af7784d43a093fe56, mode/ui, port 3137)
Task 3: dispatched (base e09fecb, worktree game-opus-ui-entry, port 3131, sonnet implementer a4a83cb43e545a2d1)
Task 7: implementer DONE_WITH_CONCERNS (commit 97071ee on ui/fort, 1728 pass); missing icons for imagegen later: bloater, spitter, armored, ram, golem, pumpkin, weaver, leshy, elite chip, tower toasts, gate repair
Task 7: review dispatched (sonnet aaaaf20ac28d0cda4, package review-bf81def..97071ee.diff)
Task 6: dispatched (base 34ddd93, worktree game-opus-ui-farm, port 3134, sonnet implementer a02658866c4869c1f)
Light HUD: done (commit 5b8a88b on mode/ui, 1726 pass; snapshots shots/hud-light/; Esc menu still old dark style → Task 4; TEAM_CSS orange weak on white (team rooms) → Task 8)
Task 4: dispatched (base 5b8a88b, worktree game-opus-ui-menu, port 3132, sonnet implementer ad79735d1a4a4be14); Task 8 waits for ui/fort merge (shared combat CSS)
Task 7: review — spec ❌ (I1 record tile wording, I2 boss bar numbers, I3 results→pause menu), quality Approved
Task 7: minor (deferred): killfeed/teammate-down names gone (lab has none); «Орда на N» gone; Esc→Клавиши fort row (menu group); nickTone copy; meter markup not kit meterHtml; per-frame HTML rebuild wave/boss; thin tests; stand toast truncation
Task 7: fix round 1/5 dispatched (base 97071ee + merge mode/ui; findings task-7-fix1.md; promoted P1–P9)
Disk: owner 10:46Z — Mac out of disk; remove worktrees once merged into main. Moved 6.5G of finished Chrome profiles to ~/.Trash/ui-redesign-chrome-profiles-1348; agents told to reuse one profile. After mode/ui → main: remove game-opus-ui and game-opus-ui-* worktrees (docs/ui-redesign + backups archive keep everything).
Task 5: implementer DONE_WITH_CONCERNS (ui/fishing cce4232 + merges + ce2958c phone, 1726 pass); review package review-5b8a88b..ce2958c.diff
Task 5: review dispatched (sonnet a54249b20bbec9068)
Task 7: fix round 1/5 done (merge df27e6f + fixes d029ce5, 1730 pass; kit additive: TcToast cls/html, clearToasts(prefix); app.ts 5 lines + SceneDeps.quietPause)
Task 7: re-review round 1 dispatched (sonnet a6c285b17029f4d55, review-df27e6f..d029ce5.diff)
Task 5: review — spec ✅ w/ decisions, quality not approved (I1 roulette reset on exit); controller decided: journal Награды = lab big cells ×4, journal card 4th line removed; promoted I2 zone XP line, P1–P9
Task 5: minor (deferred): ⚓+ both-zones mark; r.note; «Потолок» odds; «До сезона» only <30 min; reel breakdown lines; untracked single-instance timers; phone catch card covers touch buttons; thin tests; .fh-chip old style
Task 5: fix round 1/5 dispatched (findings task-5-fix1.md)
Task 3: implementer DONE_WITH_CONCERNS (ui/entry 8706d76 + merge b3707ad + 867506f, 1726 pass); concerns: plates on full-screen pages reset to window values in entry.css (suggest kit --w-plate-*), :where() on global range rules, HD art 1536 stretched at 2560
Task 3: review dispatched (sonnet afba77567ec9db4f7, review-5b8a88b..867506f.diff)
Task 7: re-review round 1 — I1–I3, P1–P9 ADDRESSED, no new Critical/Important
Task 7: minor (deferred): shop 9th row «Пулемёт» clipped under footer (pointer locked, can't scroll; key 9 works); «Ещё раз» may flash «Обратно в бой» in real Chrome; announce met.add before skip; no test for Baron-on-super-wave boss HP; quietPauseUntil 10s; pb.killfeed guard; banners drop('rec-hot') is a toast not hero (pre-existing); Tab pot pill = last cleared wave share (live pot not sent)
Task 7: complete (ui/fort 97071ee..d029ce5, review clean after 1 fix round)
Merge ui/fort → mode/ui 01a10d7: check/test(1730)/build green
Task 8: dispatched (base 01a10d7, worktree game-opus-ui-modes, port 3136, opus implementer a2f06617cbf83fee0)
Task 4: implementer DONE_WITH_CONCERNS (ui/menu ed5a8c0, 1726 pass); levels.css moved to Trash; menu-pinned test rewritten
Task 4: review dispatched (sonnet ac7c24d7bc2a24f27)
Task 6: implementer DONE (ui/farm a835997 + merge eb29d61, 1743 pass); note: agent used rm on its own old shots once (rule breach, own scratch only); E at neighbour's bed now sends existing farm help
Task 6: review dispatched (sonnet a64cacc3bb6d47eed, review-01a10d7..eb29d61.diff)
Task 3: review — spec ❌ (I1 .en-count-box pushes heroes down, I2 wait meter, I3 plates hard-coded), quality not approved; controller: login/loading pages follow the LAB LIGHT MODE (white card/plates, windows teal) via additive kit token-context class; art sharpness at 2560 needs ≥2560 sources → ask owner
Task 3: minor (deferred): QuickSettings duplicates settings rows; quick-settings focus; logoHtml in entry.ts; el vs h(); linkbanner imports entry.css; boot font swap; fetchpriority cover; nickCheck vs server stripping; thin tests
Task 3: fix round 1/5 dispatched (findings task-3-fix1.md)
Task 5: fix round 1/5 done (23f2dbe, 1726 pass; kit additive TcHero.small)
Task 4: review — spec ✅, quality Approved; Important routed: I1 .join-settings dead rules → lead deletes at merge (entry uses QuickSettings); I2 fishing skill block in Коллекция (12px, 🎣, old progress) → fishing group next round
Task 4: minor (deferred): menu above photo/catch cards on pause; hard-coded scrim rgba + #fff/#000 .mn-tier i; aria-valuenow on level meter; vote plate over Tab header; thin tests top-4 records/slider clamp
Task 4: fix round 1/5 dispatched (polish M1 kick label, M3 delete dead range block, M4 stale code, M7 voice rows clickable; task-4-fix1.md)
Task 6: review — spec ❌ (I1 farm toasts not cleared on exit), quality not approved (I2 wheel throttle/steals zoom); promoted P1 board close, P2 ЛКМ instant plant, P3 test table, P4 «опыта», P5 до 01:00, P6 Кладовая as lab
Task 6: minor (deferred): cone E prompt; «ещё 22 из 30»; «В час ≈ N»; tutorial ×; Фургон countdown in card; help prompt on watered bed; rgba shadows; per-frame JSON.stringify; tile aria; levelup re-show on exit; thin tests
Task 6: fix round 1/5 dispatched (task-6-fix1.md)
Owner 11:42Z «это ок продолжай» → light login confirmed; upscaler NOT approved explicitly (download needs a clear yes) → loading art stays 1536 (б) unless owner writes «а»
Task 5: re-review round 1 — I1, I2, D1, D2, P1–P9 ADDRESSED; new Important N1 (rain toast suppressed at login with no plate)
Task 5: minor (deferred): picker slot persists across reopen; focus lost after equip; lighthouse icon reused; drink tile now in every room's tr — eyeball at integration
Task 5: fix round 2/5 dispatched (task-5-fix2.md: N1 + R1 fishing skill block in Esc Коллекция + 11px fr-label + dead CSS + <p> in button)
Task 5: fix round 2/5 done (d3c8d14, 1726 pass); extra: collection grid fonts ≥13 requested in same round
Task 5: round 2 extra commit c3a23e8 (grid fonts)
Task 6: fix round 1/5 done (94de3ba, 1745 pass); P6 Кладовая = lab (no bag list) — leave
Task 6: re-review round 1 dispatched (sonnet a26d59bbc4b4ec251)
Task 5: re-review round 2 — N1, R1, minors, grid fonts ADDRESSED; no new Critical/Important
Task 5: minor (deferred → Task 9 polish): fish2.css:628 baseline override misaligns «Новичок»; .fb-rec clips records ≥1000 kg (reduce cell padding); .fb-* literal px + legacy colours; out-of-scope in Esc Коллекция: .alb-sub 12px (styles.css:4877), emoji headings album.ts:18,39 / records.ts:105, ⚓🌧🌫 marks fishbook.ts:100; .frx-badge b 12px; dead fs-skill compact/new + non-compact fb-grid
Task 5: complete (ui/fishing cce4232..c3a23e8, review clean after 2 fix rounds)
Merge ui/fishing → mode/ui 884d45f: clean, check/test(1730)/build green
Task 3: fix round 1/5 done (482ae15, 1726 pass; kit additive .k-hudctx in tokens.css HUD-context list)
Task 3: re-review round 1 dispatched (sonnet afdac3a9520cea8f5)
Task 6: re-review round 1 — I1, I2, P1–P6 ADDRESSED, no new Critical/Important
Task 6: minor (deferred): «Подойди к грядке ближе» wording when belt is for another bed; belt at ≤0.9 m when turned away steals wheel; default 'farm' key replaces scene toast; camera wheel zoom has no deltaMode/throttle (pre-existing)
Task 6: complete (ui/farm a835997..94de3ba, review clean after 1 fix round)
Merge ui/farm → mode/ui a0f56a1: clean, check/test(1745)/build green
Task 4: fix round 1/5 done (cd1e0f1, 1726 pass)
Task 4: re-review round 1 dispatched (sonnet a89e69e05fa693ebb)
Task 3: re-review round 1 — I1–I3, P1–P7 ADDRESSED, no new Critical/Important
Task 3: minor (deferred): onInput keeps role=alert after error; #startup-retry kbd fixed colours (inline copy); inline boot CSS is a hard light copy (flip together with data-hud); .join-settings dead CSS (lead removes); docs row lists index.html under client/
Task 3: complete (ui/entry 8706d76..482ae15, review clean after 1 fix round)
Merge ui/entry → mode/ui 035b606: clean; check ok, build ok; tests 1742/1745 — 3 real-main startup timeouts (server-http, server-storage-failure) under load avg ~240, pass alone 3/3 (flaky under load, not UI)
Task 8: implementer DONE_WITH_CONCERNS (ui/modes 45bb3cf+aa29b20, check ok, build ok, 1728/1731 — real-main timeouts under load); review package review-01a10d7..aa29b20.diff
Task 8: review dispatched (opus a76b3180065aebbd6, review-01a10d7..aa29b20.diff)
Task 4: re-review round 1 — all 4 findings ADDRESSED (M1, M3, M4, M7 + Коллекция shot), no new Critical/Important
Task 4: minor (deferred): online.css phone media query also fires on short wide windows (max-height:520px) — hides «в голосе N»; narrow phones (≤375) squeeze row buttons, 320 kick label overflows; empty act cell 8px on phone; voice rows no pointer cursor (lead fixes at merge: .vp label.k-row)
Task 4: complete (ui/menu cd1e0f1)
Cleanup: worktrees game-opus-ui-{entry,farm,fishing,fort,menu} (branches merged into mode/ui) moved to /Users/tired/.Trash/ui-redesign-merged-worktrees-1540, pruned; branches ui/* kept. Stopped 3 leftover entry dev servers on 3131.
Merge ui/menu → mode/ui ee9ea9f: styles.css conflicts resolved by deleting both sides (range/join/online/profile blocks moved to entry/menu/online css); dead .join-settings deleted; .vp label.k-row pointer cursor added. check ok, build ok, tests 1744/1745 (storage-failure startup timeout under load ~100; server tests pass 3/3 alone)
Task 9 step 6: icons2 dispatched (sonnet a0ed15cef871807a7, brief icons2-brief.md: 16 icons — 8 fort foes + elite, kick, cellar, awp, headshot, slots, seaplane, thief; wires fort + menu in mode/ui; modes icons wired later in ui/modes fix round)
Task 8: review — spec ❌ (old paintball CSS left, only hidden), quality Needs fixes: I1 pirate arrows bin by angle only (drops thief behind crate; ±π not wrapped), I2 ModeResults.show re-animates + replaces buttons on each update (regatta votes lose clicks)
Task 8: lead decision — favourites (blackjack/durak/billiards/Dungeon) keep own buttons/keys/fonts: lab changes only badge/top/voice; CLAUDE.md «не трогай игровой интерфейс дурака». Mention in owner report.
Task 8: minor (deferred): paintball old Hud monkey-patch (wrap/defineProperty); brittle import.meta.glob rewrite in newmode-camera test; meter builders hide/pirates + local plural regatta; phone unverified hide/skill/pirates/rats/plane (Task 9 phone smoke); injected-data states (hide podium, skill finish, pirate results)
Task 8: fix round 1/5 dispatched to a2f06617cbf83fee0 (task-8-fix1.md: I1, I2, S1 paintball CSS, P1-P6)
Task 8: fix round 1/5 done (8394ef5, 1734/1734, check ok, build ok); re-review package review-aa29b20..8394ef5.diff
Task 8: re-review round 1 dispatched (sonnet a508487a698cace62)
Task 8: re-review round 1 — all findings ADDRESSED (I1, I2, S1, P1-P6), no new Critical/Important
Task 8: minor (deferred): pirate arrow fan 0.2 rad may crowd neighbour sector with 3+ kinds (untested with real raid); pirate-arrows snapshot shows a black rectangle (test scene artefact?) — check at integration shots
Task 8: rats accent → lab uses farm accent for the bet window: lead aliases [data-mode='rats'] to farm tokens at merge
Task 8: complete (ui/modes 8394ef5)
Task 9 step 6: icons2 DONE (50c23e6 16 icons + PROVENANCE + sheet 104; a7811f9 fort/menu wiring + kicked screen). Lead eyeballed strip: style OK; bloater/spitter jam splashes slightly bloody (cartoon) — owner may ask to redo
Merge ui/modes → mode/ui (clean, no conflicts) + lead commit: wired awp/headshot/slots/seaplane/thief, rats accent aliased to farm (lab). check ok, build ok, tests 1749/1749
Cleanup: game-opus-ui-modes worktree moved to  (ui/modes merged)
Cleanup: game-opus-ui-modes worktree moved to /Users/tired/.Trash/ui-redesign-modes-worktree-1611 (ui/modes merged)
Merge main → mode/ui (docs only: AGENTS.md rules, docs/ui.md for old UI, docs/models.md), clean
Task 9: dispatched in parallel — final whole-branch review (opus a934363b6362d33bf, final-review-brief.md → final-review.md); acceptance «как игрок» pass (opus a803a944c95e1338b, acceptance-brief.md, port 3138/9138 → acceptance-report.md); docs/ui.md rewrite as kit reference + docs/README rows (sonnet af12f1a9acfa63960)
Next: one fix dispatch for review Important + acceptance blockers/should-fix + triaged minors; scoped re-review; CSP check (lead); showcase shots; owner report + «сливать в main?»
Task 9 docs: DONE bb4f774 (docs/ui.md rewritten as kit reference, §1–§8 kept; docs/README rows; ui-redesign README link). Stale AGENTS.md lines after merge: 272–274 (§7 «делается в ветке mode/ui… обновится»), 204 (§4 образец ui-redesign «ветка mode/ui»), 435 (§12 snapshot 1280×800 → 1440×900 + 2560), 431 (§12 «шрифт Rubik» → токены и детали кита), 26. Also docs/ui-redesign/README «Статус: в main не слита» — update at merge.
Gap found: wardrobe (Примерочная), jukebox, gift-code (wardrobe side), lighthouse photo card still old style — inventory S14/S31/S32 not assigned to any group.
Task 10: dispatched (base bb4f774, worktree game-opus-ui-shell2 ui/shell2, port 3139/9139, opus implementer a83edab888eb8db0f)
Coordinator 13:36Z: plaza thread is merging mode/plaza (flag PLAZA3) into main now. Before the owner report: merge fresh main into mode/ui, re-check plaza HUD plates/signs with PLAZA3=1, take owner shots on that build. Expect conflicts around Fight Club removal (client/fight/, menu Подвал/records rows, cellar icon wiring) and plaza files.
Final review (final-review.md): With fixes — Critical 0, Important 2 (I1 mode plates over Esc menu header; I2 fort shop 9th row clipped), fix-now minors: farm chat dock 148px up (styles.css:871-877), drink tile in every room / on Dungeon strip, fishbook emoji marks + title-only, --focus clash in transition.css, skill timer rebuilds plate per frame, farm levelup queue re-show after exit, docs/README index.html row. Rest «later» (table in final-review.md). Waiting for acceptance report → one combined fix dispatch in mode/ui.
Task 10: implementer DONE_WITH_CONCERNS (ui/shell2 f826e9e, 1749/1749); wardrobe item art still emoji — 25 wd-* icons needed (itemArt picks up wd-<slot>-<key>.webp); review package review-bb4f774..f826e9e.diff
Task 10: review dispatched (sonnet a5eec38a3814e6068). Wardrobe icons (26 wd-*) dispatched (sonnet a0ae64cada3aa1bf1) → scratch ui/wd-icons/ + PROVENANCE-add.md, lead commits
Task 10: review — spec ✅, quality Approved; Important 1 (jukebox dialog tabIndex=-1, keys leak to game after clicking a row) fixed by lead + Minors 1 (docs/ui.md wardrobe exception), 3 (hudK refresh on resize), 4 (stale comments) — commit on ui/shell2. Wardrobe no click-outside: accepted (scene drag rotates jelly; ✕/Готово/Esc/E close).
Task 10: minor (deferred): photo card covers ~165px of Esc menu right edge for ≤30s (save-on-pause deliberate); hard-coded gloss rgba; double close sound wardrobe ✕/Готово, buy reward sound before server confirm; empty space on «Цвет» tab; jukebox footer wraps with server note; phone unverified
Task 10: complete (ui/shell2) — merge after acceptance pass finishes (its dev server runs on mode/ui)
Wardrobe icons agent stopped (owner: too long); its gen.mjs PID 62713 left to finish by itself into scratch icons-work/wd-* (self-terminating, 8-min cap per icon) — follow-up after merge
Task 9: CSP check of production build (prod flags, PLAZA3 off) on mode/ui c8818d3: ok — CSP violations none, console errors none, coins ok, flags fortress+fish2 (evidence scratchpad/ui/csp/out)
Acceptance 1 (cut short): 0 blockers, 6 should-fix — farm chat dock, catch-card case, login «!» wrap, skill altitude nick, farm tree prompt (all fixed 4e626d8/c8818d3); blackjack banner over dealer score — pre-existing, favourite screen untouched (tell owner)
Lead fixes 4e626d8: final-review I1 (minor plates hidden under open Esc menu), I2 (fort shop 9 rows), farm dock, drink tile only on plaza, fishbook marks → icons, --art-focus, skill clock no per-frame rebuild, farm level queue reset, login nick nobr, catch line wording, altitude nick width
Merge ui/shell2 (Task 10) clean. Merge main (plaza PLAZA3, protocol 17, Fight Club removed) acf8e04: 9 conflicts resolved (fight removed from room maps, fight loading art → Trash, main.ts scale+layout). check ok, build ok, tests 1786/1787 (1 skipped), 0 fail
Owner 14:20Z (via coordinator): do NOT wrap up — draw wardrobe pictures and do everything required. Icons agent resumed (commit into mode/ui); acceptance 2 dispatched (opus a6acb3e9bbd7a3983, PLAZA3=1, full walk incl. phone/2K)
Wardrobe icons: 25 drawn by Codex (list had 25, not 26), reviewed OK, in scratch icons-work/out/wd-*.webp + wd-icons-stage/PROVENANCE.md; subagent's copy into repo blocked by permission classifier («Modify Shared Resources») — surfaced to owner, waiting for «да» before lead copies/commits
Wardrobe icons: owner «да» 14:31Z → lead copied 25 wd-*.webp + PROVENANCE + sheet, commit b1e9496
Owner 14:51Z: fix blackjack banner over dealer score; speed up pass — split: a6acb3e9 (plaza/menu/windows/fishing/farm 1440), af528ff675a8a783a modes 1440 port 3143, a54635fb77300c76a 2K+phone port 3144
Owner 14:57Z: no 2K testing — ordinary desktop test + phone ok; told a54635fb to drop 2K (phone only); memory feedback-desktop-test-not-2k
Acceptance 2 part 1 (plaza/menu/windows/fishing/farm, acceptance2-report.md): 0 blockers, 9 should-fix, 5 polish. Fixed by lead (commit after fdcbed7): login long nick (smaller heading, no mid-nick break), mic-denied tip 8 s, mic meter empty until test, slack warning inside reel frame, photo card hidden under open Esc menu, drink tile hidden while wardrobe open. 19 farm wardrobe items «·» → Codex icons agent ae24ba72eb13a996c (scratch delivery, lead copies). Plaza-owned (Ласточка black board, truncated pavilion signs) → sent to coordinator for plaza thread. Polish left: album name ellipsis, paintball killfeed beside menu, world label overlap, Семён portrait dark.
Acceptance 2 part 3 (phone, acceptance2-2k-phone.md): 0 blockers, 3 should-fix — race portrait: standings plate over ☰💬👥, item plate over «тормоз» and steals taps (pointer-events auto), speed plate on ▶; paintball portrait: score plate over top buttons + badge, weapon bar 448px on 375 (cut, over «плечо»/«прицел»). Polish: mode HUD over paintball loading, Esc chip on wardrobe ✕ on phone, small ✕/mic taps, rotate hint under slots panel, 2K menu badge gap. Plan: one fix dispatch with modes findings (same files).
Farm wardrobe icons: 19 by Codex, lead reviewed sheet, copied + PROVENANCE «Дополнение 4» + sheet 148, commit b053761
Owner 15:39Z progress ask answered in thread. Phone fix dispatched (sonnet a553cd9f19ca76bea, phone-fix-brief.md, CSS-only under .touch, port 3145/9145 → phone-fix-report.md) while modes walker af528ff675a8a783a continues on 3143
Acceptance 2 part 2 (modes 1440, acceptance2-modes.md): 0 blockers, 1 should-fix (fort card «Кристалл пали»), 7 polish; blackjack banner fix confirmed. Phone fix (sonnet, 17be1ec): race/paintball touch plates under top buttons, bonus not over brake, paintball weapon bar in two rows.
Lead fixes f141581: «Кристалл пал», fort shop 450px + two-line details + shorter lines (no ellipsis), paintball reward no repeat, plane «Да, сесть», race exit veil after results timer, fort chat «!.». check ok, build ok, tests 1785/1787 (regatta timing flake under load, passes alone 12/12).
Showcase shots (lead, 1440, port 3146): show-plaza-a, show-wd-Шапка, show-fort-shop (scratch ui/final/shots). Polish left for later: blackjack banner over NPC bow tie + result word ×4 (favourite screen), fort chat emoji, world label behind wardrobe window, phone: Esc chip on wardrobe ✕, rotate hint under slots panel, mode HUD over paintball loading.
Next: owner report + «сливать в main?»
