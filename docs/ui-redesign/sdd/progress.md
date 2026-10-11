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
